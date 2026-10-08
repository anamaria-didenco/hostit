/**
 * Client portal + contract signing.
 *
 * Design: the client signs contracts inside their event's portal link
 * (/portal/<portal token>). That one link shows the event, the latest
 * proposal, payments and any contracts the venue has sent, so there is a
 * single place to send a client. "Send to client" on a contract finds the
 * booking's portal link (or creates one), switches on contract signing for it
 * and emails it.
 *
 * Before this, the staff "Signing link" used the CONTRACT token as a portal
 * token (→ "Link not found"), and the portal sent the PORTAL token to
 * contracts.sign, which matched no rows and still reported success.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, addLeadActivity } from "./db";
import { bookings, clientPortalTokens, contracts, type Contract } from "../drizzle/schema";
import { buildVenueMailer } from "./paymentsEmail";
import { cleanRichHtml, escapeHtml } from "./sanitizeHtml";
import { publicBaseUrl } from "./publicUrl";
import { notifyVenue, bookingLink } from "./notify";

export type PortalPermissions = {
  viewProposal?: boolean; viewRunsheet?: boolean; viewBudget?: boolean;
  approveProposal?: boolean; signContract?: boolean;
};

export function parsePermissions(raw: string | null | undefined): PortalPermissions {
  if (!raw) return {};
  try { const p = JSON.parse(raw); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

export const portalUrl = (token: string) => `${publicBaseUrl()}/portal/${token}`;

/** bigint ms or Date → ms, or null. */
function toMs(v: unknown): number | null {
  if (v == null) return null;
  const n = v instanceof Date ? v.getTime() : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isContractExpired(c: { expiresAt: unknown }, now = Date.now()): boolean {
  const ms = toMs(c.expiresAt);
  return ms != null && ms < now;
}

/** Contract bodies are typed as plain text today, but templates may hold HTML.
 *  Return sanitised HTML when the body has markup, else null (render as text). */
export function contractBodyHtml(body: string): string | null {
  return /<\s*(p|div|br|h[1-6]|ul|ol|li|strong|b|em|i|u|span|table|a)\b[^>]*>/i.test(body) ? cleanRichHtml(body) : null;
}

/** The contracts a portal link may show: sent or signed, for its booking/lead. */
export async function portalContracts(row: { ownerId: number; bookingId: number | null; leadId: number | null }) {
  const db = await getDb();
  if (!db) return [];
  const scope = row.bookingId
    ? eq(contracts.bookingId, row.bookingId)
    : row.leadId ? eq(contracts.leadId, row.leadId) : null;
  if (!scope) return [];
  const rows = await db.select().from(contracts)
    .where(and(eq(contracts.ownerId, row.ownerId), scope, inArray(contracts.status, ["sent", "signed", "expired"])))
    .orderBy(desc(contracts.createdAt));
  const now = Date.now();
  // Only what the client needs — never the signature evidence (IP) or tokens.
  return rows.map(c => ({
    id: c.id,
    title: c.title,
    bodyHtml: contractBodyHtml(c.body),
    bodyText: c.body,
    status: c.status === "sent" && isContractExpired(c, now) ? "expired" as const : c.status,
    signedAt: c.signedAt ? Number(c.signedAt) : null,
    signerName: c.signerName,
    expiresAt: toMs(c.expiresAt),
  }));
}

/**
 * The portal link the client signs this contract through: the newest live
 * portal link for the contract's booking (or lead), with signing switched on;
 * created if there isn't one.
 */
export async function ensureSigningPortal(ownerId: number, contract: Contract): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (!contract.bookingId && !contract.leadId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This contract isn't attached to an event, so there's no client link to send." });
  }
  const scope = contract.bookingId
    ? eq(clientPortalTokens.bookingId, contract.bookingId)
    : eq(clientPortalTokens.leadId, contract.leadId!);
  const existing = await db.select().from(clientPortalTokens)
    .where(and(eq(clientPortalTokens.ownerId, ownerId), scope))
    .orderBy(desc(clientPortalTokens.createdAt));
  const now = Date.now();
  const live = existing.find(t => { const ms = toMs(t.expiresAt); return ms == null || ms > now; });
  if (live) {
    const perms = parsePermissions(live.permissions);
    if (!perms.signContract) {
      await db.update(clientPortalTokens)
        .set({ permissions: JSON.stringify({ ...perms, signContract: true }) })
        .where(eq(clientPortalTokens.id, live.id));
    }
    return live.token;
  }
  const token = nanoid(32);
  await db.insert(clientPortalTokens).values({
    ownerId,
    bookingId: contract.bookingId ?? null,
    leadId: contract.leadId ?? null,
    token,
    clientName: contract.clientName ?? null,
    clientEmail: contract.clientEmail ?? null,
    permissions: JSON.stringify({ viewProposal: true, viewRunsheet: false, viewBudget: false, approveProposal: true, signContract: true }),
    expiresAt: null,
    createdAt: now,
  });
  return token;
}

export type EmailOutcome = { emailSent: boolean; to: string | null; reason?: "smtp_not_configured" | "no_client_email" | "send_failed" };

/** Email a client their portal link (optionally "please sign <contract>"). Reports honestly. */
export async function emailPortalLink(ownerId: number, opts: {
  to: string | null | undefined; clientName?: string | null; token: string; contractTitle?: string;
}): Promise<EmailOutcome> {
  const to = opts.to?.trim() || null;
  if (!to) return { emailSent: false, to: null, reason: "no_client_email" };
  const mailer = await buildVenueMailer(ownerId);
  if (!mailer) return { emailSent: false, to, reason: "smtp_not_configured" };
  const url = portalUrl(opts.token);
  const first = (opts.clientName ?? "").trim().split(/\s+/)[0] || "there";
  const venueName = mailer.venue?.name ?? mailer.fromName;
  const e = escapeHtml;
  const subject = opts.contractTitle ? `Please sign: ${opts.contractTitle}` : `Your event page — ${venueName}`;
  const intro = opts.contractTitle
    ? `Your contract "${opts.contractTitle}" is ready. You can read it and sign it online — it only takes a minute.`
    : `Here's the link to your event page. It has your event details, proposal and payments in one place.`;
  const button = opts.contractTitle ? "Read and sign" : "Open your event page";
  try {
    await mailer.transporter.sendMail({
      from: `"${mailer.fromName}" <${mailer.fromEmail}>`,
      to,
      ...(mailer.venue?.email ? { replyTo: mailer.venue.email } : {}),
      subject,
      html: `<div style="font-family:sans-serif;max-width:560px;color:#1f2937;line-height:1.5"><p>Hi ${e(first)},</p><p>${e(intro)}</p><p><a href="${e(url)}" style="background:#2d3a2e;color:#fffdf9;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">${e(button)}</a></p><p style="font-size:13px;color:#6b7280">Or copy this link: <a href="${e(url)}">${e(url)}</a></p><p>Any questions, just reply to this email.</p><p>Warm regards,<br>${e(mailer.fromName)}</p></div>`,
      text: `Hi ${first},\n\n${intro}\n\n${url}\n\nAny questions, just reply to this email.\n\nWarm regards,\n${mailer.fromName}`,
    });
    return { emailSent: true, to };
  } catch (err) {
    console.error("[portal] emailing portal link failed:", err);
    return { emailSent: false, to, reason: "send_failed" };
  }
}

/**
 * Record a typed-name e-signature on a contract the caller has already
 * authorised (via the portal link or the contract's own token). Throws —
 * never reports success — when nothing was signed.
 */
export async function signContract(opts: {
  contract: Contract; signerName: string; signerIp: string;
}): Promise<{ success: true; signedAt: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { contract } = opts;
  const name = opts.signerName.trim();
  if (name.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Please type your full name to sign." });
  if (contract.status === "signed") throw new TRPCError({ code: "BAD_REQUEST", message: "This contract has already been signed." });
  if (contract.status !== "sent") throw new TRPCError({ code: "BAD_REQUEST", message: "This contract isn't open for signing. Please contact the venue." });
  if (isContractExpired(contract)) throw new TRPCError({ code: "BAD_REQUEST", message: "This contract has expired. Please contact the venue for an updated one." });
  const now = Date.now();
  const updated = await db.update(contracts).set({
    status: "signed",
    signedAt: now,
    // A typed-name signature: the name typed, plus the explicit agreement.
    signatureData: JSON.stringify({ method: "typed_name", name, agreed: true }),
    signerName: name,
    // Server-observed IP as signing evidence, never a client-supplied value.
    signerIp: opts.signerIp || "",
    updatedAt: now,
  }).where(and(eq(contracts.id, contract.id), eq(contracts.status, "sent"))).returning({ id: contracts.id });
  if (updated.length === 0) {
    throw new TRPCError({ code: "CONFLICT", message: "We couldn't record your signature. Please refresh the page and try again." });
  }

  // Tell the venue, and note it on the enquiry.
  let leadId = contract.leadId ?? null;
  if (!leadId && contract.bookingId) {
    const [b] = await db.select({ leadId: bookings.leadId }).from(bookings).where(eq(bookings.id, contract.bookingId)).limit(1);
    leadId = b?.leadId ?? null;
  }
  if (leadId) {
    await addLeadActivity({ leadId, ownerId: contract.ownerId, type: "note", content: `${name} signed the contract "${contract.title}"` });
  }
  await notifyVenue(contract.ownerId, {
    kind: "contract_signed",
    title: `${name} signed "${contract.title}"`,
    body: `Signed online ${new Date(now).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}.`,
    leadId,
    bookingId: contract.bookingId ?? null,
    link: contract.bookingId ? bookingLink(contract.bookingId) : undefined,
    dedupeKey: `contract_signed:${contract.id}`,
  });
  return { success: true, signedAt: now };
}
