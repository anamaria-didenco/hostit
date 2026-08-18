/**
 * Xero integration — OAuth 2.0 connect flow + Accounting API helpers.
 *
 * Flow:
 *   GET /api/xero/connect   (authed owner)  → redirect to Xero consent screen
 *   GET /api/xero/callback  (Xero redirects back) → exchange code, store tokens
 *
 * Invoices are created as DRAFTs in Xero so nothing reaches a client until the
 * operator approves it inside Xero. Tokens live in xero_connections and are
 * never returned to the browser; the tRPC surface exposes status/config only.
 *
 * Config needed (Render env): XERO_CLIENT_ID, XERO_CLIENT_SECRET, and the
 * Xero app's redirect URI set to `${PUBLIC_BASE_URL}/api/xero/callback`.
 */
import type { Request, Response } from "express";
import crypto from "crypto";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { xeroConnections } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const XERO_AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_API = "https://api.xero.com/api.xro/2.0";
const SCOPES = "offline_access accounting.transactions accounting.contacts";

function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "https://venueflowhq.com").replace(/\/$/, "");
}
function redirectUri(): string {
  return `${baseUrl()}/api/xero/callback`;
}

/** HMAC-signed state so the callback can trust the ownerId round-tripped
 *  through Xero without any server-side session storage. 10-min validity. */
function signState(ownerId: number): string {
  const ts = Date.now();
  const mac = crypto.createHmac("sha256", ENV.cookieSecret).update(`xero.${ownerId}.${ts}`).digest("hex");
  return Buffer.from(JSON.stringify({ o: ownerId, t: ts, m: mac })).toString("base64url");
}
function verifyState(state: string): number | null {
  try {
    const { o, t, m } = JSON.parse(Buffer.from(state, "base64url").toString());
    if (typeof o !== "number" || typeof t !== "number" || typeof m !== "string") return null;
    if (Date.now() - t > 10 * 60 * 1000) return null;
    const expect = crypto.createHmac("sha256", ENV.cookieSecret).update(`xero.${o}.${t}`).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(m), Buffer.from(expect))) return null;
    return o;
  } catch {
    return null;
  }
}

async function tokenRequest(params: Record<string, string>): Promise<any> {
  const basic = Buffer.from(`${ENV.xeroClientId}:${ENV.xeroClientSecret}`).toString("base64");
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Xero token request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** GET /api/xero/connect — must be the venue OWNER (not a team-link session). */
export async function handleXeroConnect(req: Request, res: Response) {
  try {
    if (!ENV.xeroClientId || !ENV.xeroClientSecret) {
      return res.status(503).send("Xero is not configured yet — set XERO_CLIENT_ID and XERO_CLIENT_SECRET.");
    }
    const user = await sdk.authenticateRequest(req).catch(() => null);
    if (!user) return res.redirect("/");
    // Block team-link sessions from connecting/replacing the owner's Xero org.
    try {
      const cookies = Object.fromEntries((req.headers.cookie ?? "").split(";").map(c => c.trim().split("=").map(decodeURIComponent)).filter(p => p.length === 2));
      const { COOKIE_NAME } = await import("@shared/const");
      const session = await sdk.verifySession(cookies[COOKIE_NAME]);
      if (session?.isTeamMember) return res.status(403).send("Only the venue owner can connect Xero.");
    } catch { /* fall through: default deny below only if unauthenticated */ }

    const url = `${XERO_AUTH_URL}?response_type=code&client_id=${encodeURIComponent(ENV.xeroClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri())}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&state=${signState(user.id)}`;
    res.redirect(url);
  } catch (err) {
    console.error("[Xero] connect failed:", err);
    res.status(500).send("Could not start the Xero connection. Try again from Settings → Integrations.");
  }
}

/** GET /api/xero/callback — Xero redirects here with ?code&state. */
export async function handleXeroCallback(req: Request, res: Response) {
  const back = (ok: boolean, msg?: string) =>
    res.redirect(`/dashboard?tab=settings&sub=integrations&xero=${ok ? "connected" : "error"}${msg ? `&xeroMsg=${encodeURIComponent(msg)}` : ""}`);
  try {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) return back(false, error);
    const ownerId = state ? verifyState(state) : null;
    if (!code || !ownerId) return back(false, "Invalid or expired connection link — try Connect again.");

    const tok = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    });

    // Which Xero organisation did the user consent for?
    const connRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const conns = connRes.ok ? await connRes.json() : [];
    const tenant = Array.isArray(conns) && conns.length > 0 ? conns[0] : null;
    if (!tenant?.tenantId) return back(false, "Xero returned no organisation for this login.");

    const db = await getDb();
    if (!db) return back(false, "Database unavailable.");
    const row = {
      ownerId,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName ?? null,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + (Number(tok.expires_in ?? 1800) - 60) * 1000),
      updatedAt: new Date(),
    };
    const [existing] = await db.select({ id: xeroConnections.id }).from(xeroConnections)
      .where(eq(xeroConnections.ownerId, ownerId)).limit(1);
    if (existing) {
      await db.update(xeroConnections).set(row).where(eq(xeroConnections.ownerId, ownerId));
    } else {
      await db.insert(xeroConnections).values(row);
    }
    console.log(`[Xero] owner ${ownerId} connected to "${tenant.tenantName}" (${tenant.tenantId})`);
    back(true);
  } catch (err: any) {
    console.error("[Xero] callback failed:", err?.message ?? err);
    back(false, "Connection failed — see server logs.");
  }
}

/** Returns a valid access token + tenant for the owner, refreshing (and
 *  persisting the rotated refresh token) when expired. Throws if not connected. */
export async function getXeroAccess(ownerId: number): Promise<{ accessToken: string; tenantId: string; conn: any }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [conn] = await db.select().from(xeroConnections).where(eq(xeroConnections.ownerId, ownerId)).limit(1);
  if (!conn?.refreshToken || !conn.tenantId) throw new Error("Xero is not connected");

  const stillValid = conn.accessToken && conn.expiresAt && new Date(conn.expiresAt).getTime() > Date.now() + 30_000;
  if (stillValid) return { accessToken: conn.accessToken!, tenantId: conn.tenantId, conn };

  // Refresh (Xero rotates the refresh token on every use — must persist it).
  const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refreshToken });
  await db.update(xeroConnections).set({
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? conn.refreshToken,
    expiresAt: new Date(Date.now() + (Number(tok.expires_in ?? 1800) - 60) * 1000),
    updatedAt: new Date(),
  }).where(eq(xeroConnections.ownerId, ownerId));
  return { accessToken: tok.access_token, tenantId: conn.tenantId, conn };
}

async function xeroApi(ownerId: number, method: "GET" | "POST" | "PUT", path: string, body?: any): Promise<any> {
  const { accessToken, tenantId } = await getXeroAccess(ownerId);
  const res = await fetch(`${XERO_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!res.ok) {
    // Surface Xero's validation messages when present (they're actually useful).
    const detail = json?.Elements?.[0]?.ValidationErrors?.map((v: any) => v.Message).join("; ")
      ?? json?.Detail ?? json?.Message ?? text.slice(0, 300);
    throw new Error(`Xero API ${res.status}: ${detail}`);
  }
  return json;
}

export interface XeroLine {
  description: string;
  quantity: number;
  unitAmount: number; // negative allowed (deposit deduction line)
}

/** Create a DRAFT ACCREC invoice in the owner's Xero org. Returns id/number/total. */
export async function createXeroDraftInvoice(ownerId: number, opts: {
  contactName: string;
  contactEmail?: string;
  reference: string;
  dueDate?: string;      // YYYY-MM-DD
  lines: XeroLine[];
}): Promise<{ invoiceId: string; invoiceNumber: string | null; total: number; status: string }> {
  const { conn } = await getXeroAccess(ownerId);
  const accountCode = conn.salesAccountCode || "200";
  const payload = {
    Invoices: [{
      Type: "ACCREC",
      Contact: {
        Name: opts.contactName,
        ...(opts.contactEmail ? { EmailAddress: opts.contactEmail } : {}),
      },
      Date: new Date().toISOString().slice(0, 10),
      ...(opts.dueDate ? { DueDate: opts.dueDate } : {}),
      Reference: opts.reference,
      Status: "DRAFT",
      LineAmountTypes: conn.lineAmountsInclusive ? "Inclusive" : "Exclusive",
      LineItems: opts.lines.map(l => ({
        Description: l.description,
        Quantity: l.quantity,
        UnitAmount: l.unitAmount,
        AccountCode: accountCode,
        TaxType: "OUTPUT2", // NZ GST on income (15%)
      })),
    }],
  };
  const json = await xeroApi(ownerId, "POST", "/Invoices", payload);
  const inv = json?.Invoices?.[0];
  if (!inv?.InvoiceID) throw new Error("Xero did not return an invoice");
  return {
    invoiceId: inv.InvoiceID,
    invoiceNumber: inv.InvoiceNumber ?? null,
    total: Number(inv.Total ?? 0),
    status: inv.Status ?? "DRAFT",
  };
}

/** Fetch current status of specific invoices (for paid-state sync). */
export async function getXeroInvoiceStatuses(ownerId: number, invoiceIds: string[]): Promise<Record<string, { status: string; amountDue: number; invoiceNumber: string | null }>> {
  if (invoiceIds.length === 0) return {};
  const json = await xeroApi(ownerId, "GET", `/Invoices?IDs=${invoiceIds.join(",")}`);
  const out: Record<string, { status: string; amountDue: number; invoiceNumber: string | null }> = {};
  for (const inv of json?.Invoices ?? []) {
    out[inv.InvoiceID] = {
      status: inv.Status ?? "UNKNOWN",
      amountDue: Number(inv.AmountDue ?? 0),
      invoiceNumber: inv.InvoiceNumber ?? null,
    };
  }
  return out;
}
