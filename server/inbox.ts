/**
 * Client replies → the enquiry timeline.
 *
 * Venues send client email from their own SMTP. When they connect their inbox
 * (Settings → Email → Email inbox), this module polls it over IMAP every few
 * minutes, read-only, and files each client reply against its enquiry in
 * `lead_messages` — matched by threading headers against the Message-IDs we
 * sent, then by the sender's email. Unmatched mail, our own copies,
 * out-of-office replies and bounces are ignored. Nothing in the mailbox is
 * changed: messages are fetched with BODY.PEEK, so they stay unread.
 *
 * Outbound: the client-email senders (email.send, leads.sendFollowUp,
 * proposals.send) use leadMailHeaders() for a stable Message-ID and a Reply-To
 * that includes the polled inbox, and recordLeadMessage() to log what was sent.
 */
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { leadActivity, leadMessages, leads, venueSettings } from "../drizzle/schema";
import { registerJob } from "./jobs";
import { notifyVenue } from "./notify";
import { smtpTls } from "./smtpTls";
import { cleanRichHtml } from "./sanitizeHtml";
import {
  classifyInbound, makeLeadMessageId, matchLead, parseRawEmail, snippet, stripQuotedReply,
  MAX_FULL_TEXT, MAX_HTML, MAX_SUBJECT, type InboundEmail, type LeadLookups,
} from "./inboxParse";

export const INBOX_POLL_MS = 150_000;        // every 2½ minutes
export const INBOX_BATCH = 40;               // messages per venue per poll
export const INBOX_MAX_SOURCE = 4 * 1024 * 1024; // bytes fetched per message
export const INBOX_BACKFILL_DAYS = 7;        // first connect: look this far back
const CLOSED_STATUSES = ["lost", "cancelled"];

type Venue = typeof venueSettings.$inferSelect;
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── Outbound threading ─────────────────────────────────────────────────────

/** True when the venue has switched the inbox on and given us everything needed to poll it. */
export function inboxConnected(vs: Partial<Venue> | null | undefined): boolean {
  return !!(vs && (vs.imapEnabled ?? 0) === 1 && vs.imapHost && vs.imapUser && vs.imapPass);
}

/** The polled mailbox's address (the IMAP username), when it is one. */
export function inboxAddress(vs: Partial<Venue> | null | undefined): string | null {
  if (!inboxConnected(vs)) return null;
  const user = String(vs!.imapUser ?? "").trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(user) ? user : null;
}

/** Unique, non-empty addresses (case-insensitive); one string when there's only one. */
export function mergeReplyTo(...addresses: (string | null | undefined)[]): string | string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of addresses) {
    const v = String(a ?? "").trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.length === 0 ? undefined : out.length === 1 ? out[0] : out;
}

/**
 * Headers for a client email about an enquiry: a stable Message-ID
 * (<vf-lead-12-…@sender-domain>) so replies thread back by header, and — when
 * the inbox is connected — a Reply-To that includes the polled mailbox, so the
 * reply reaches it as well as wherever replies went before. With no inbox
 * connected, Reply-To is exactly what the caller passed (existing behaviour).
 */
export function leadMailHeaders(vs: Partial<Venue> | null | undefined, opts: {
  leadId?: number | null;
  fromEmail: string;
  replyTo?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
}): { messageId: string; replyTo?: string | string[]; inReplyTo?: string; references?: string[] } {
  const headers: { messageId: string; replyTo?: string | string[]; inReplyTo?: string; references?: string[] } = {
    messageId: makeLeadMessageId(opts.leadId ?? null, opts.fromEmail),
    replyTo: mergeReplyTo(inboxAddress(vs), opts.replyTo),
  };
  if (opts.inReplyTo) headers.inReplyTo = opts.inReplyTo;
  const refs = [...(opts.references ?? []), ...(opts.inReplyTo ? [opts.inReplyTo] : [])];
  if (refs.length) headers.references = Array.from(new Set(refs)).slice(-20);
  return headers;
}

/** Log a client email on the enquiry's conversation. Never throws. Returns the row id, or null. */
export async function recordLeadMessage(row: {
  ownerId: number;
  leadId: number;
  direction: "in" | "out";
  fromEmail?: string | null;
  fromName?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  fullText?: string | null;
  bodyHtml?: string | null;
  attachments?: unknown;
  messageId: string;
  inReplyTo?: string | null;
  references?: string[] | string | null;
  receivedAt?: Date;
}): Promise<number | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const refs = Array.isArray(row.references) ? row.references.join(" ") : row.references ?? null;
    const inserted = await db.insert(leadMessages).values({
      ownerId: row.ownerId,
      leadId: row.leadId,
      direction: row.direction,
      fromEmail: row.fromEmail?.slice(0, 320) ?? null,
      fromName: row.fromName?.slice(0, 255) ?? null,
      toEmail: row.toEmail?.slice(0, 1000) ?? null,
      subject: row.subject?.slice(0, MAX_SUBJECT) ?? null,
      bodyText: row.bodyText?.slice(0, MAX_FULL_TEXT) ?? null,
      fullText: row.fullText?.slice(0, MAX_FULL_TEXT) ?? null,
      bodyHtml: row.bodyHtml?.slice(0, MAX_HTML) ?? null,
      attachments: (row.attachments ?? null) as any,
      messageId: row.messageId.slice(0, 500),
      inReplyTo: row.inReplyTo?.slice(0, 500) ?? null,
      references: refs?.slice(0, 10_000) ?? null,
      receivedAt: row.receivedAt ?? new Date(),
    }).onConflictDoNothing().returning({ id: leadMessages.id });
    return inserted[0]?.id ?? null;
  } catch (err) {
    console.error("[inbox] could not record message (non-fatal):", err);
    return null;
  }
}

// ─── IMAP client ────────────────────────────────────────────────────────────

export type InboxConfig = { host: string; port: number; secure: boolean; user: string; pass: string; folder: string };

/** The slice of ImapFlow we use — so tests can hand in a fake. */
export interface InboxClient {
  connect(): Promise<void>;
  mailboxOpen(path: string, opts?: { readOnly?: boolean }): Promise<{ uidValidity: bigint | number; uidNext: number; exists: number }>;
  search(query: Record<string, unknown>, opts: { uid: true }): Promise<number[] | false | undefined>;
  fetch(range: string, query: Record<string, unknown>, opts: { uid: true }): AsyncIterable<{ uid: number; source?: Buffer; internalDate?: Date | string }>;
  logout(): Promise<void>;
  close?(): void;
}
export type CreateInboxClient = (cfg: InboxConfig) => InboxClient | Promise<InboxClient>;

export const createImapClient: CreateInboxClient = async (cfg) => {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: smtpTls(),
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    clientInfo: { name: "VenueFlowHQ" },
  });
  // An unhandled 'error' event would crash the process.
  client.on("error", (err: unknown) => console.warn("[inbox] connection error:", (err as Error)?.message ?? err));
  return client as unknown as InboxClient;
};

export function venueInboxConfig(vs: Partial<Venue>): InboxConfig {
  return {
    host: String(vs.imapHost ?? "").trim(),
    port: Number(vs.imapPort ?? 993) || 993,
    secure: (vs.imapSecure ?? 1) === 1,
    user: String(vs.imapUser ?? "").trim(),
    pass: String(vs.imapPass ?? ""),
    folder: String(vs.imapFolder ?? "").trim() || "INBOX",
  };
}

/** A short, plain-language reason for an IMAP failure (shown in Settings). */
export function friendlyImapError(err: any, cfg: Pick<InboxConfig, "host" | "port" | "folder">): string {
  const code = String(err?.code ?? "");
  const msg = String(err?.responseText ?? err?.message ?? err ?? "");
  if (err?.authenticationFailed || /AUTHENTICATIONFAILED|invalid credentials|authentication failed|LOGIN failed/i.test(msg)) {
    return "The server didn't accept that username and password. Gmail and Outlook need an app password, not your normal one.";
  }
  if (err?.mailboxMissing || /NONEXISTENT|doesn't exist|does not exist|unknown mailbox|no such mailbox/i.test(msg)) {
    return `Signed in, but there's no folder called "${cfg.folder}".`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `Couldn't find a mail server called ${cfg.host}. Check the server name.`;
  if (code === "ECONNREFUSED") return `${cfg.host} refused the connection on port ${cfg.port}. Check the port.`;
  if (/ssl|tls|certificate|wrong version number|EPROTO/i.test(code + " " + msg)) {
    return "Couldn't set up a secure connection. Port 993 needs SSL on; port 143 needs it off.";
  }
  if (code === "ETIMEDOUT" || code === "CONNECT_TIMEOUT" || code === "GREETING_TIMEOUT" || /timed? ?out/i.test(msg)) {
    return `No answer from ${cfg.host} on port ${cfg.port}. Check the server name, port and SSL setting.`;
  }
  return `Couldn't connect: ${msg.replace(/\s+/g, " ").slice(0, 160) || "unknown error"}`;
}

async function safeLogout(client: InboxClient | null) {
  if (!client) return;
  try { await client.logout(); } catch { try { client.close?.(); } catch { /* already closed */ } }
}

/** Sign in and open the folder read-only. Changes nothing. */
export async function testInboxConnection(cfg: InboxConfig, createClient: CreateInboxClient = createImapClient):
  Promise<{ ok: true; messages: number; folder: string } | { ok: false; message: string }> {
  let client: InboxClient | null = null;
  try {
    client = await createClient(cfg);
    await client.connect();
    let box;
    try {
      box = await client.mailboxOpen(cfg.folder, { readOnly: true });
    } catch (err: any) {
      return { ok: false, message: friendlyImapError({ ...err, mailboxMissing: true }, cfg) };
    }
    return { ok: true, messages: Number(box.exists ?? 0), folder: cfg.folder };
  } catch (err: any) {
    return { ok: false, message: friendlyImapError(err, cfg) };
  } finally {
    await safeLogout(client);
  }
}

// ─── Inbound processing ─────────────────────────────────────────────────────

function dbLookups(db: Db, ownerId: number): LeadLookups {
  return {
    async leadIdForMessageIds(ids) {
      if (!ids.length) return null;
      const rows = await db.select({ leadId: leadMessages.leadId, messageId: leadMessages.messageId })
        .from(leadMessages)
        .innerJoin(leads, and(eq(leads.id, leadMessages.leadId), eq(leads.ownerId, ownerId)))
        .where(and(eq(leadMessages.ownerId, ownerId), inArray(leadMessages.messageId, ids)));
      for (const id of ids) {
        const hit = rows.find(r => r.messageId === id);
        if (hit) return hit.leadId;
      }
      return null;
    },
    async leadExists(leadId) {
      const [row] = await db.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
      return !!row;
    },
    async openLeadIdForEmail(email) {
      const [row] = await db.select({ id: leads.id }).from(leads)
        .where(and(
          eq(leads.ownerId, ownerId),
          sql`lower(${leads.email}) = ${email.toLowerCase()}`,
          notInArray(leads.status, CLOSED_STATUSES),
        ))
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(1);
      return row?.id ?? null;
    },
  };
}

export type InboundResult =
  | { status: "stored"; leadId: number; by: "thread" | "sender"; rowId: number }
  | { status: "duplicate" | "unmatched" | "own" | "auto_reply" | "bounce" | "bulk" };

/**
 * File one parsed inbound email: ignore what isn't a client writing back,
 * match it to an enquiry, store it, stamp leads.lastInboundAt, log activity
 * and alert the venue. Idempotent on (ownerId, messageId).
 */
export async function handleInboundEmail(vs: Pick<Venue, "ownerId" | "smtpFromEmail" | "smtpUser" | "imapUser">, email: InboundEmail, opts: {
  fallbackMessageId: string;
  receivedAt: Date;
  notify: boolean;
}): Promise<InboundResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const ownerId = vs.ownerId;
  const kind = classifyInbound(email, [vs.smtpFromEmail, vs.smtpUser, vs.imapUser].filter(Boolean) as string[]);
  if (kind !== "ok") return { status: kind };
  const match = await matchLead(email, dbLookups(db, ownerId));
  if (!match) return { status: "unmatched" };

  const messageId = email.messageId ?? opts.fallbackMessageId;
  const bodyText = stripQuotedReply(email.text);
  const rowId = await (async () => {
    const inserted = await db.insert(leadMessages).values({
      ownerId,
      leadId: match.leadId,
      direction: "in",
      fromEmail: email.fromEmail?.slice(0, 320) ?? null,
      fromName: email.fromName?.slice(0, 255) ?? null,
      toEmail: email.to || null,
      subject: email.subject || null,
      bodyText,
      fullText: email.text.trim() !== bodyText ? email.text : null,
      bodyHtml: email.html ? cleanRichHtml(email.html.slice(0, MAX_HTML * 4)).slice(0, MAX_HTML) : null,
      attachments: email.attachments.length ? email.attachments : null,
      messageId: messageId.slice(0, 500),
      inReplyTo: email.inReplyTo,
      references: email.references.join(" ").slice(0, 10_000) || null,
      receivedAt: opts.receivedAt,
    }).onConflictDoNothing().returning({ id: leadMessages.id });
    return inserted[0]?.id ?? null;
  })();
  if (!rowId) return { status: "duplicate" };

  const [lead] = await db.select({ firstName: leads.firstName, lastName: leads.lastName })
    .from(leads).where(and(eq(leads.id, match.leadId), eq(leads.ownerId, ownerId))).limit(1);
  const who = [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || email.fromName || email.fromEmail || "Your client";
  const subject = email.subject || "(no subject)";
  const preview = snippet(bodyText, 200);

  await db.update(leads)
    .set({
      lastInboundAt: sql`GREATEST(COALESCE(${leads.lastInboundAt}, ${opts.receivedAt}), ${opts.receivedAt})`,
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, match.leadId), eq(leads.ownerId, ownerId)));
  await db.insert(leadActivity).values({
    leadId: match.leadId,
    ownerId,
    type: "email",
    content: `${who} replied: ${subject}${preview ? `\n\n${preview}` : ""}`,
  });
  if (opts.notify) {
    await notifyVenue(ownerId, {
      kind: "client_replied",
      title: `${who} replied: ${subject}`,
      body: preview || undefined,
      leadId: match.leadId,
      dedupeKey: `client_replied:msg:${rowId}`,
    });
  }
  return { status: "stored", leadId: match.leadId, by: match.by, rowId };
}

export type PollSummary = { fetched: number; stored: number; ignored: number; backfill: boolean };

const polling = new Set<number>();

/**
 * Fetch new messages since the stored UID cursor (bounded batch, oldest
 * first) and file them. The first poll after connecting looks back
 * INBOX_BACKFILL_DAYS without alerting, so old replies fill the timeline
 * without a burst of notifications. Errors are stored on the venue row for
 * Settings to show, and rethrown.
 */
export async function pollVenueInbox(vs: Venue, createClient: CreateInboxClient = createImapClient): Promise<PollSummary> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (polling.has(vs.ownerId)) return { fetched: 0, stored: 0, ignored: 0, backfill: false };
  polling.add(vs.ownerId);
  const cfg = venueInboxConfig(vs);
  let client: InboxClient | null = null;
  try {
    client = await createClient(cfg);
    await client.connect();
    const box = await client.mailboxOpen(cfg.folder, { readOnly: true });
    const validity = Number(box.uidValidity);
    const cursor = vs.imapUidValidity === validity && vs.imapLastUid != null ? Number(vs.imapLastUid) : null;
    const backfill = cursor === null;

    let uids: number[];
    if (backfill) {
      const since = new Date(Date.now() - INBOX_BACKFILL_DAYS * 86_400_000);
      uids = ((await client.search({ since }, { uid: true })) || []).sort((a, b) => a - b).slice(-INBOX_BATCH);
    } else {
      // "N:*" always returns the newest message even when its UID < N, so filter.
      uids = ((await client.search({ uid: `${cursor + 1}:*` }, { uid: true })) || [])
        .filter(u => u > cursor).sort((a, b) => a - b).slice(0, INBOX_BATCH);
    }

    // Collect first, then process: no other IMAP commands while a FETCH streams.
    const fetched: { uid: number; source?: Buffer; internalDate?: Date | string }[] = [];
    if (uids.length) {
      for await (const msg of client.fetch(uids.join(","), { uid: true, internalDate: true, source: { maxLength: INBOX_MAX_SOURCE } }, { uid: true })) {
        fetched.push({ uid: msg.uid, source: msg.source, internalDate: msg.internalDate });
      }
    }

    let stored = 0;
    for (const msg of fetched.sort((a, b) => a.uid - b.uid)) {
      if (!msg.source) continue;
      let email: InboundEmail;
      try {
        email = await parseRawEmail(msg.source);
      } catch (err) {
        console.warn(`[inbox] owner ${vs.ownerId} uid ${msg.uid}: unparseable, skipped`, (err as Error)?.message);
        continue;
      }
      const internal = msg.internalDate ? new Date(msg.internalDate) : null;
      const when = internal && !isNaN(internal.getTime()) ? internal : email.date ?? new Date();
      const result = await handleInboundEmail(vs, email, {
        fallbackMessageId: `<imap-${validity}-${msg.uid}@${cfg.host.replace(/[^a-z0-9.-]/gi, "") || "inbox"}>`,
        receivedAt: when.getTime() > Date.now() ? new Date() : when,
        notify: !backfill,
      });
      if (result.status === "stored") stored++;
    }

    const newCursor = Math.max(cursor ?? 0, ...uids, backfill && !uids.length ? Number(box.uidNext) - 1 : 0);
    await db.update(venueSettings).set({
      imapLastUid: newCursor,
      imapUidValidity: validity,
      imapLastCheckedAt: new Date(),
      imapLastError: null,
    }).where(eq(venueSettings.ownerId, vs.ownerId));
    return { fetched: fetched.length, stored, ignored: fetched.length - stored, backfill };
  } catch (err) {
    const message = friendlyImapError(err, cfg);
    await db.update(venueSettings).set({ imapLastCheckedAt: new Date(), imapLastError: message })
      .where(eq(venueSettings.ownerId, vs.ownerId)).catch(() => {});
    throw Object.assign(new Error(message), { cause: err });
  } finally {
    await safeLogout(client);
    polling.delete(vs.ownerId);
  }
}

/** One venue, now (Settings → "Check now"). */
export async function pollInboxForOwner(ownerId: number): Promise<PollSummary> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  if (!inboxConnected(vs)) throw new Error("Connect and switch on the inbox first.");
  return pollVenueInbox(vs);
}

export async function pollAllInboxes(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const venues = await db.select().from(venueSettings).where(eq(venueSettings.imapEnabled, 1));
  for (const vs of venues) {
    if (!inboxConnected(vs)) continue;
    try {
      await pollVenueInbox(vs);
    } catch (err) {
      console.warn(`[inbox] poll failed for owner ${vs.ownerId}:`, (err as Error)?.message);
    }
  }
}

export function registerInboxJobs() {
  registerJob("inbox-poll", INBOX_POLL_MS, pollAllInboxes, 60_000);
}
