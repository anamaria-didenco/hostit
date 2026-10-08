/**
 * Pure helpers for client replies: parsing an inbound email, deciding whether
 * it is a real person writing back (not an out-of-office, a bounce or our own
 * copy), trimming the quoted history, and matching it to an enquiry.
 *
 * No database or network here, so it can be unit-tested with fixture emails —
 * server/inbox.ts wires it to IMAP and Postgres.
 */
import crypto from "node:crypto";
import type { ParsedMail, AddressObject, HeaderValue } from "mailparser";

// Size caps. Inbound mail is attacker-controlled, so nothing unbounded is
// stored or sent to the browser.
export const MAX_SUBJECT = 500;
export const MAX_BODY_TEXT = 20_000;
export const MAX_FULL_TEXT = 100_000;
export const MAX_HTML = 200_000;
export const MAX_ATTACHMENTS_LISTED = 20;

export type InboundEmail = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string | null;
  fromName: string | null;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  date: Date | null;
  /** Lower-cased header name → flattened string value. */
  headers: Record<string, string>;
  attachments: { filename: string; size: number; contentType: string }[];
};

export type InboundKind = "ok" | "own" | "auto_reply" | "bounce" | "bulk";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** "<abc@x>" form, or null. Strips whitespace and anything that could break a header. */
export function normaliseMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/[\r\n\s]+/g, "").trim();
  if (!s) return null;
  const inner = s.replace(/^<+|>+$/g, "");
  if (!inner || inner.length > 490 || /[<>]/.test(inner)) return null;
  return `<${inner}>`;
}

/** Split a References / In-Reply-To value (string or list) into message ids. */
export function splitMessageIds(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const p of parts) {
    const found = String(p).match(/<[^<>\s]+>/g) ?? String(p).split(/\s+/);
    for (const f of found) {
      const id = normaliseMessageId(f);
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** The ids this message replies to, most direct first (In-Reply-To, then References newest-first). */
export function referencedMessageIds(m: Pick<InboundEmail, "inReplyTo" | "references">): string[] {
  const ids: string[] = [];
  for (const id of [...splitMessageIds(m.inReplyTo), ...[...m.references].reverse()]) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, 50);
}

/** Message-ID for a client email about an enquiry: <vf-lead-12-k3j…@venue.co.nz>. */
export function makeLeadMessageId(leadId: number | null | undefined, fromEmail: string | null | undefined): string {
  const domain = (String(fromEmail ?? "").split("@")[1] ?? "").toLowerCase().replace(/[^a-z0-9.-]/g, "") || "venueflowhq.com";
  const rand = crypto.randomBytes(9).toString("base64url");
  return leadId ? `<vf-lead-${leadId}-${rand}@${domain}>` : `<vf-${rand}@${domain}>`;
}

/** The enquiry id encoded in one of our own Message-IDs, or null. */
export function leadIdFromMessageId(id: string | null | undefined): number | null {
  const m = /^<?vf-lead-(\d{1,9})-[A-Za-z0-9_-]+@/.exec(String(id ?? ""));
  return m ? Number(m[1]) : null;
}

function headerToString(v: HeaderValue | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(x => headerToString(x as HeaderValue)).join(", ");
  if (typeof v === "object") {
    if ("text" in v && typeof (v as AddressObject).text === "string") return (v as AddressObject).text;
    if ("value" in v && typeof (v as any).value === "string") {
      const params = (v as any).params ? Object.entries((v as any).params).map(([k, val]) => `; ${k}=${val}`).join("") : "";
      return `${(v as any).value}${params}`;
    }
  }
  return String(v);
}

function firstAddress(a: AddressObject | AddressObject[] | undefined): { address: string | null; name: string | null } {
  const obj = Array.isArray(a) ? a[0] : a;
  const v = obj?.value?.[0];
  return { address: v?.address ? v.address.toLowerCase().trim() : null, name: v?.name?.trim() || null };
}

function addressList(a: AddressObject | AddressObject[] | undefined): string {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list.flatMap(o => o.value ?? []).map(v => v.address).filter(Boolean).join(", ");
}

/** Flatten mailparser's output into the small shape the rest of the code uses. */
export function toInboundEmail(parsed: ParsedMail): InboundEmail {
  const headers: Record<string, string> = {};
  parsed.headers?.forEach((v, k) => { headers[k.toLowerCase()] = clip(headerToString(v), 2000); });
  const from = firstAddress(parsed.from);
  return {
    messageId: normaliseMessageId(parsed.messageId),
    inReplyTo: normaliseMessageId(splitMessageIds(parsed.inReplyTo)[0] ?? null),
    references: splitMessageIds(parsed.references as any),
    fromEmail: from.address,
    fromName: from.name,
    to: clip(addressList(parsed.to), 1000),
    subject: clip((parsed.subject ?? "").replace(/[\r\n]+/g, " ").trim(), MAX_SUBJECT),
    text: clip(parsed.text ?? "", MAX_FULL_TEXT),
    html: typeof parsed.html === "string" ? parsed.html : null,
    date: parsed.date instanceof Date && !isNaN(parsed.date.getTime()) ? parsed.date : null,
    headers,
    attachments: (parsed.attachments ?? [])
      .filter(a => a.contentDisposition !== "inline" || !!a.filename)
      .slice(0, MAX_ATTACHMENTS_LISTED)
      .map(a => ({
        filename: clip(String(a.filename || "attachment").replace(/[\r\n]/g, " "), 200),
        size: Number(a.size ?? 0),
        contentType: clip(String(a.contentType ?? ""), 100),
      })),
  };
}

/** Parse a raw RFC 822 message. Embedded images and text→HTML conversion are skipped. */
export async function parseRawEmail(source: Buffer | string): Promise<InboundEmail> {
  const { simpleParser } = await import("mailparser");
  const parsed = await simpleParser(source, {
    skipImageLinks: true,
    skipTextToHtml: true,
    skipTextLinks: true,
    maxHtmlLengthToParse: 5_000_000,
  });
  return toInboundEmail(parsed);
}

const AUTO_SUBJECT = /^\s*(?:(?:re|aw|fw|fwd)\s*:\s*)*(?:out of (?:the )?office|automatic reply|auto[- ]?reply|autoreply|auto[- ]?response|away from (?:the |my )?(?:office|desk)|on (?:annual )?leave|on holiday|i am (?:currently )?(?:away|out of))\b/i;
const BOUNCE_SUBJECT = /^\s*(?:undeliverable|undelivered mail|delivery status notification|mail delivery (?:failed|failure|subsystem)|returned mail|delivery failure|failure notice|message not delivered|delivery has failed|could not be delivered)/i;
const BOUNCE_SENDER = /^(?:mailer-daemon|postmaster|mail-daemon|bounce[s]?)(?:[+@])/i;

/**
 * Is this a person writing back, or something to ignore?
 * - own: our own mail (BCC copies, alerts) — From is one of the venue's addresses
 * - bounce: delivery failures (DSNs, mailer-daemon)
 * - auto_reply: out-of-office and other machine replies (RFC 3834 Auto-Submitted, etc.)
 * - bulk: mailing lists and bulk mail
 */
export function classifyInbound(m: InboundEmail, ownAddresses: string[]): InboundKind {
  const own = new Set(ownAddresses.map(a => a.toLowerCase().trim()).filter(Boolean));
  const h = m.headers;
  const from = m.fromEmail ?? "";
  const contentType = (h["content-type"] ?? "").toLowerCase();

  if (BOUNCE_SENDER.test(from)
    || (/multipart\/report/.test(contentType) && /report-type=["']?delivery-status/.test(contentType))
    || "x-failed-recipients" in h
    || BOUNCE_SUBJECT.test(m.subject)
    || (h["return-path"] ?? "").trim() === "<>") return "bounce";

  if (from && own.has(from)) return "own";

  const autoSubmitted = (h["auto-submitted"] ?? "").toLowerCase().trim();
  if ((autoSubmitted && autoSubmitted !== "no")
    || "x-autoreply" in h || "x-autorespond" in h || "x-autoresponder" in h
    || /^auto[_-]?reply$/i.test((h["precedence"] ?? "").trim())
    || AUTO_SUBJECT.test(m.subject)) return "auto_reply";

  if (/^(bulk|list|junk)$/i.test((h["precedence"] ?? "").trim()) || "list-id" in h || "list" in h) return "bulk";
  return "ok";
}

/**
 * The new part of a reply: everything above the quoted history ("On … wrote:",
 * Outlook's "From: … Sent: …" block, "-----Original Message-----") with ">"
 * quote lines removed. Falls back to the whole text if trimming leaves nothing.
 */
export function stripQuotedReply(text: string): string {
  const src = String(text ?? "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? "").trim();
    if (/^-{2,}\s*(original message|forwarded message)\s*-{2,}/i.test(line)) { cut = i; break; }
    if (/^_{8,}$/.test(line) && /^from:/i.test(next)) { cut = i; break; }
    if (/^on\b.{0,300}\bwrote:\s*$/i.test(line)) { cut = i; break; }
    // Gmail wraps long "On …, Name <x@y> wrote:" lines in two.
    if (/^on\b.{0,300}$/i.test(line) && /^.{0,200}\bwrote:\s*$/i.test(next) && !/^>/.test(next)) { cut = i; break; }
    if (/^(le|am|el|il|op)\b.{0,300}\b(a écrit|schrieb|escribió|ha scritto|schreef)\s*:\s*$/i.test(line)) { cut = i; break; }
    if (/^from:\s.+/i.test(line)) {
      const block = lines.slice(i + 1, i + 5).map(l => l.trim());
      if (block.some(l => /^(sent|date):\s/i.test(l)) && block.some(l => /^(to|subject):\s/i.test(l))) { cut = i; break; }
    }
  }
  const kept = lines.slice(0, cut).filter(l => !/^\s*>/.test(l));
  const out = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return clip(out || src.trim(), MAX_BODY_TEXT);
}

/** One-line preview for alerts and lists. */
export function snippet(text: string, n = 160): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Lookups the matcher needs — the database in production, plain functions in tests. */
export type LeadLookups = {
  /** Lead id of a message we sent or received with one of these Message-IDs (first match wins, in order). */
  leadIdForMessageIds: (ids: string[]) => Promise<number | null>;
  /** True if this lead exists and belongs to the venue. */
  leadExists: (leadId: number) => Promise<boolean>;
  /** Most recent open enquiry from this email address (case-insensitive). */
  openLeadIdForEmail: (email: string) => Promise<number | null>;
};

export type LeadMatch = { leadId: number; by: "thread" | "sender" } | null;

/**
 * Which enquiry is this reply about? First by threading headers against the
 * Message-IDs we sent (or our vf-lead-N id format, if the record is missing),
 * then by the sender's email against the most recent open enquiry.
 */
export async function matchLead(m: InboundEmail, lookups: LeadLookups): Promise<LeadMatch> {
  const refs = referencedMessageIds(m);
  if (refs.length) {
    const byRecord = await lookups.leadIdForMessageIds(refs);
    if (byRecord) return { leadId: byRecord, by: "thread" };
    for (const id of refs) {
      const encoded = leadIdFromMessageId(id);
      if (encoded && await lookups.leadExists(encoded)) return { leadId: encoded, by: "thread" };
    }
  }
  if (m.fromEmail) {
    const bySender = await lookups.openLeadIdForEmail(m.fromEmail);
    if (bySender) return { leadId: bySender, by: "sender" };
  }
  return null;
}

/** Guess the incoming-mail server from the outgoing one (smtp.gmail.com → imap.gmail.com). */
export function guessImapHost(smtpHost: string | null | undefined): string {
  const h = String(smtpHost ?? "").trim().toLowerCase();
  if (!h) return "";
  if (h === "smtp.gmail.com" || h === "smtp.googlemail.com") return "imap.gmail.com";
  if (h === "smtp.office365.com" || h === "smtp-mail.outlook.com" || h.endsWith(".outlook.com")) return "outlook.office365.com";
  if (h.startsWith("smtp.")) return `imap.${h.slice(5)}`;
  if (h.startsWith("mail.")) return h;
  return h;
}
