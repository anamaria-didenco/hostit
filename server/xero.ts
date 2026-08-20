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
// Xero apps registered after the 2 March 2026 granular-scope cutover have NO
// access to the old broad `accounting.transactions` scope — requesting it fails
// the authorize request outright. This app was registered 18 Aug 2026, so it
// must use the granular scopes. Do not "simplify" this back to the old scope,
// which is what almost every pre-2026 tutorial and snippet still shows.
//   accounting.invoices        → granular replacement for accounting.transactions
//   accounting.contacts        → find/create the customer
//   accounting.settings.read   → read chart of accounts + tax rates
//   offline_access             → REQUIRED, else no refresh token is issued and
//                                the connection dies after 30 minutes
const SCOPES = "openid profile email offline_access accounting.contacts accounting.invoices accounting.settings.read";

function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "https://venueflowhq.com").replace(/\/$/, "");
}
function redirectUri(): string {
  // Xero requires an EXACT match against the URI registered on the app, so an
  // explicitly-configured value always wins over the derived one.
  return (process.env.XERO_REDIRECT_URI || `${baseUrl()}/api/xero/callback`).trim();
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

/** The orgs this owner's Xero login currently authorises, read LIVE from Xero.
 *  Never cache the list: a connection can be revoked in Xero at any time, and a
 *  stale name is exactly how invoices end up in the wrong books. */
export async function listXeroOrganisations(ownerId: number): Promise<Array<{ tenantId: string; tenantName: string }>> {
  const { accessToken } = await getXeroAccess(ownerId, { requireTenant: false });
  const res = await fetch(XERO_CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Xero connections lookup failed (${res.status})`);
  const json = await res.json();
  return (Array.isArray(json) ? json : [])
    .filter((c: any) => c?.tenantId)
    .map((c: any) => ({ tenantId: c.tenantId, tenantName: c.tenantName ?? "(unnamed organisation)" }));
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

    // Which Xero organisation(s) did the user consent for? Xero does NOT
    // guarantee the ordering of this array, so taking [0] silently picks an
    // arbitrary org — that is how a test push landed in the demo company while
    // the UI said "Bar Franco". When more than one org is authorised we store
    // the tokens with NO tenant and make the user choose explicitly.
    const connRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const conns = connRes.ok ? await connRes.json() : [];
    const orgs = (Array.isArray(conns) ? conns : []).filter((c: any) => c?.tenantId);
    if (orgs.length === 0) return back(false, "Xero returned no organisation for this login.");

    const db = await getDb();
    if (!db) return back(false, "Database unavailable.");
    // Keep a previous explicit choice if it is still authorised; otherwise only
    // auto-select when there is exactly one org to choose from.
    const [prior] = await db.select({ tenantId: xeroConnections.tenantId }).from(xeroConnections)
      .where(eq(xeroConnections.ownerId, ownerId)).limit(1);
    const priorStillValid = prior?.tenantId && orgs.some((o: any) => o.tenantId === prior.tenantId)
      ? orgs.find((o: any) => o.tenantId === prior.tenantId)
      : null;
    const tenant = priorStillValid ?? (orgs.length === 1 ? orgs[0] : null);
    const row = {
      ownerId,
      tenantId: tenant?.tenantId ?? null,
      tenantName: tenant?.tenantName ?? null,
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
    if (!tenant) {
      console.log(`[Xero] owner ${ownerId} authorised ${orgs.length} organisations — awaiting explicit choice`);
      return res.redirect("/dashboard?tab=settings&sub=integrations&xero=choose");
    }
    console.log(`[Xero] owner ${ownerId} connected to "${tenant.tenantName}" (${tenant.tenantId})`);
    back(true);
  } catch (err: any) {
    console.error("[Xero] callback failed:", err?.message ?? err);
    back(false, "Connection failed — see server logs.");
  }
}

// Xero ROTATES the refresh token on every use: the old one dies the instant a
// refresh succeeds. Two concurrent refreshes therefore race and permanently
// break the connection (the loser writes back a dead token). Single Render
// instance, so an in-process promise lock per owner is sufficient.
const refreshLocks = new Map<number, Promise<{ accessToken: string; tenantId: string; conn: any }>>();

type AccessOpts = { requireTenant?: boolean };

/** Returns a valid access token + tenant for the owner, refreshing (and
 *  persisting the rotated refresh token) when expired. Throws if not connected. */
export async function getXeroAccess(ownerId: number, opts: AccessOpts = {}): Promise<{ accessToken: string; tenantId: string; conn: any }> {
  const inFlight = refreshLocks.get(ownerId);
  if (inFlight) return inFlight;
  const p = getXeroAccessUncached(ownerId, opts).finally(() => refreshLocks.delete(ownerId));
  refreshLocks.set(ownerId, p);
  return p;
}

async function getXeroAccessUncached(ownerId: number, opts: AccessOpts = {}): Promise<{ accessToken: string; tenantId: string; conn: any }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [conn] = await db.select().from(xeroConnections).where(eq(xeroConnections.ownerId, ownerId)).limit(1);
  if (!conn?.refreshToken) throw new Error("Xero is not connected");
  if (opts.requireTenant !== false && !conn.tenantId) {
    throw new Error("No Xero organisation selected — choose one in Settings → Integrations.");
  }

  const stillValid = conn.accessToken && conn.expiresAt && new Date(conn.expiresAt).getTime() > Date.now() + 30_000;
  if (stillValid) return { accessToken: conn.accessToken!, tenantId: conn.tenantId ?? "", conn };

  // Refresh (Xero rotates the refresh token on every use — must persist it).
  // A refresh token is valid 60 days unused; past that Xero returns
  // invalid_grant and the only fix is reauthorising — never retry in a loop.
  let tok: any;
  try {
    tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refreshToken });
  } catch (err: any) {
    if (String(err?.message ?? "").includes("invalid_grant")) {
      throw new Error("Xero disconnected — please reconnect it in Settings → Integrations.");
    }
    throw err;
  }
  await db.update(xeroConnections).set({
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? conn.refreshToken,
    expiresAt: new Date(Date.now() + (Number(tok.expires_in ?? 1800) - 60) * 1000),
    updatedAt: new Date(),
  }).where(eq(xeroConnections.ownerId, ownerId));
  return { accessToken: tok.access_token, tenantId: conn.tenantId ?? "", conn };
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

/** The org's GST-on-income tax type, read from Xero once and cached on the
 *  connection. Hardcoding is unsafe: OUTPUT is the legacy 12.5% rate, so
 *  guessing wrong silently produces incorrect GST on every invoice. */
async function resolveSalesTaxType(ownerId: number): Promise<string> {
  const db = await getDb();
  if (!db) return "OUTPUT2";
  const [conn] = await db.select().from(xeroConnections).where(eq(xeroConnections.ownerId, ownerId)).limit(1);
  if (conn?.salesTaxType) return conn.salesTaxType;
  try {
    const json = await xeroApi(ownerId, "GET", "/TaxRates");
    const usable = (json?.TaxRates ?? []).filter((r: any) => r.Status === "ACTIVE" && r.CanApplyToRevenue);
    const gst = usable.find((r: any) => Number(r.EffectiveRate) === 15)
      ?? usable.find((r: any) => Number(r.EffectiveRate) > 0);
    const taxType = gst?.TaxType ?? "OUTPUT2";
    await db.update(xeroConnections).set({ salesTaxType: taxType, updatedAt: new Date() })
      .where(eq(xeroConnections.ownerId, ownerId));
    return taxType;
  } catch (err: any) {
    console.warn("[Xero] could not read tax rates, defaulting to OUTPUT2:", err?.message ?? err);
    return "OUTPUT2";
  }
}

/** Find an existing Xero contact by email so repeat clients reuse one contact
 *  record instead of colliding on Xero's unique-Name constraint. */
async function findContactIdByEmail(ownerId: number, email?: string): Promise<string | null> {
  if (!email?.trim()) return null;
  try {
    const where = encodeURIComponent(`EmailAddress=="${email.replace(/"/g, "")}"`);
    const json = await xeroApi(ownerId, "GET", `/Contacts?where=${where}`);
    return json?.Contacts?.[0]?.ContactID ?? null;
  } catch {
    return null; // matching is best-effort; fall back to creating by name
  }
}

/** Money must reach Xero at 2dp — float drift produces cent-level GST errors. */
const money2 = (n: number) => Math.round(n * 100) / 100;

export interface XeroLine {
  description: string;
  quantity: number;
  unitAmount: number; // negative allowed (deposit deduction line)
}

/** Revenue accounts from the org's real chart of accounts, for the settings
 *  picker. Guessing "200" is only right for Xero's stock NZ chart. */
export async function listXeroRevenueAccounts(ownerId: number): Promise<Array<{ code: string; name: string }>> {
  const json = await xeroApi(ownerId, "GET", `/Accounts?where=${encodeURIComponent('Type=="REVENUE"')}`);
  return (json?.Accounts ?? [])
    .filter((a: any) => a?.Code && a?.Status === "ACTIVE")
    .map((a: any) => ({ code: String(a.Code), name: String(a.Name ?? a.Code) }));
}

/** Create a DRAFT ACCREC invoice in the owner's Xero org. Returns id/number/total. */
export async function createXeroDraftInvoice(ownerId: number, opts: {
  contactName: string;
  contactEmail?: string;
  reference: string;
  dueDate?: string;      // YYYY-MM-DD
  lines: XeroLine[];
  /** Override the venue default for THIS invoice. Xero's LineAmountTypes is an
   *  invoice-level field, so this is the finest granularity Xero supports. */
  inclusive?: boolean;
  /** Revenue account for these lines (per-stream override). */
  accountCode?: string;
  /** When set, UPDATE this existing draft instead of creating a new invoice —
   *  Xero's POST /Invoices is upsert-by-InvoiceID, so it is one code path. */
  invoiceId?: string;
}): Promise<{ invoiceId: string; invoiceNumber: string | null; total: number; status: string; tenantName: string }> {
  const { conn } = await getXeroAccess(ownerId);
  // Fail loudly rather than letting a push fall through to whatever org Xero
  // happens to return first — the exact failure that put a test invoice in the
  // demo company while the UI read "Bar Franco".
  const orgs = await listXeroOrganisations(ownerId);
  const target = orgs.find(o => o.tenantId === conn.tenantId);
  if (!target) {
    throw new Error("The connected Xero organisation is no longer authorised — reconnect it in Settings → Integrations.");
  }
  if (opts.invoiceId) {
    assertEditable(await getXeroInvoiceStatus(ownerId, opts.invoiceId), "update");
  }
  const accountCode = opts.accountCode?.trim() || conn.salesAccountCode || "200";
  const inclusive = opts.inclusive ?? Boolean(conn.lineAmountsInclusive);
  const taxType = await resolveSalesTaxType(ownerId);
  const contactId = await findContactIdByEmail(ownerId, opts.contactEmail);
  const buildPayload = (contactName: string) => ({
    Invoices: [{
      ...(opts.invoiceId ? { InvoiceID: opts.invoiceId } : {}),
      Type: "ACCREC",
      // Reuse the matched contact when we have one; otherwise create by name.
      Contact: contactId
        ? { ContactID: contactId }
        : { Name: contactName, ...(opts.contactEmail ? { EmailAddress: opts.contactEmail } : {}) },
      Date: new Date().toISOString().slice(0, 10),
      ...(opts.dueDate ? { DueDate: opts.dueDate } : {}),
      Reference: opts.reference,
      // ALWAYS a draft: a mapping bug that posted AUTHORISED invoices would put
      // wrong numbers straight into a live GST return. The operator approves in
      // Xero. Any auto-approve must be an explicit opt-in, never the default.
      Status: "DRAFT",
      LineAmountTypes: inclusive ? "Inclusive" : "Exclusive",
      LineItems: opts.lines.map(l => ({
        Description: l.description,
        Quantity: money2(l.quantity),
        UnitAmount: money2(l.unitAmount),
        AccountCode: accountCode,
        TaxType: taxType,
      })),
    }],
  });
  let json: any;
  try {
    json = await xeroApi(ownerId, "POST", "/Invoices", buildPayload(opts.contactName));
  } catch (err: any) {
    // Xero enforces unique contact names — two different "John Smith" clients
    // collide. Retry once disambiguated by the email local-part.
    const msg = String(err?.message ?? "");
    if (!contactId && /contact name must be unique/i.test(msg) && opts.contactEmail) {
      const suffix = opts.contactEmail.split("@")[0];
      json = await xeroApi(ownerId, "POST", "/Invoices", buildPayload(`${opts.contactName} (${suffix})`));
    } else {
      throw err;
    }
  }
  const inv = json?.Invoices?.[0];
  if (!inv?.InvoiceID) throw new Error("Xero did not return an invoice");
  return {
    invoiceId: inv.InvoiceID,
    invoiceNumber: inv.InvoiceNumber ?? null,
    total: Number(inv.Total ?? 0),
    status: inv.Status ?? "DRAFT",
    // Which org this actually landed in — surfaced in the UI so a wrong target
    // is visible immediately instead of being discovered in the accounts later.
    tenantName: target.tenantName,
    // NOTE: no deep link. Xero's web app addresses orgs by a short code
    // (e.g. !nxgXD) which is NOT the API tenantId and is not returned by
    // /connections, so a constructed link 404s — and worse, a link built with
    // the wrong org masked the fact that the invoice went to the wrong books.
    // The invoice number plus the org name is honest and useful; a broken link
    // is not. Restore a link only against a verified URL format.
  };
}

/** Current status of one invoice, or null if Xero doesn't know it. */
export async function getXeroInvoiceStatus(ownerId: number, invoiceId: string): Promise<string | null> {
  try {
    const json = await xeroApi(ownerId, "GET", `/Invoices/${encodeURIComponent(invoiceId)}`);
    return json?.Invoices?.[0]?.Status ?? null;
  } catch {
    return null;
  }
}

/** Statuses still safe to change from VenueFlow. Anything approved
 *  (AUTHORISED/PAID) affects the GST return and must be handled in Xero. */
const EDITABLE_STATUSES = new Set(["DRAFT", "SUBMITTED"]);

export function assertEditable(status: string | null, action: "update" | "delete"): void {
  if (status === null) return; // unknown to Xero — let the call itself fail
  if (EDITABLE_STATUSES.has(status)) return;
  if (status === "DELETED" || status === "VOIDED") {
    throw new Error(`That invoice is already ${status.toLowerCase()} in Xero.`);
  }
  throw new Error(
    `This invoice is ${status} in Xero, so VenueFlow won't ${action} it — approving or paying it affects your GST return. Void or credit it in Xero instead.`
  );
}

/** Delete a DRAFT invoice in Xero (Xero deletes by setting Status=DELETED). */
export async function deleteXeroDraftInvoice(ownerId: number, invoiceId: string): Promise<void> {
  assertEditable(await getXeroInvoiceStatus(ownerId, invoiceId), "delete");
  await xeroApi(ownerId, "POST", "/Invoices", {
    Invoices: [{ InvoiceID: invoiceId, Status: "DELETED" }],
  });
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
