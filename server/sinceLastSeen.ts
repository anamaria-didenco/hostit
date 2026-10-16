/**
 * "Since you were last here" — a small feed of what changed on the account
 * since this user last loaded their dashboard.
 *
 * The dashboard reads `sinceLastSeen` (which only READS the stored mark) and
 * separately calls `markDashboardSeen` to stamp "now". Keeping the stamp out
 * of the read means a visit always shows what happened since the PREVIOUS
 * visit, not an empty list. The mark is throttled so rapid reloads don't keep
 * moving it forward.
 *
 * Everything is scoped to the owner. Nothing here is logged — it's only ever
 * returned to the owner's own screen.
 */
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "./db";
import {
  users, leads, proposals, contracts, payments, leadMessages, bookings,
} from "../drizzle/schema";
import { leadLink, bookingLink } from "./notify";
import { fmtNzd } from "./paymentsEmail";

/** Don't move the "last seen" mark more often than this (ms). */
const MARK_THROTTLE_MS = 30_000;
/** Most recent N changes. */
const FEED_CAP = 15;

export type SinceItemKind =
  | "new_enquiry"
  | "client_reply"
  | "proposal_viewed"
  | "proposal_accepted"
  | "proposal_declined"
  | "contract_signed"
  | "payment_received";

export type SinceItem = {
  kind: SinceItemKind;
  /** Epoch ms the change happened. */
  at: number;
  title: string;
  leadId: number | null;
  bookingId: number | null;
  link: string | null;
};

function personName(r: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [r?.firstName, r?.lastName].filter(Boolean).join(" ").trim() || "A client";
}
const ms = (d: Date | number | null | undefined): number | null => {
  if (d == null) return null;
  const t = typeof d === "number" ? d : new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * The newest changes since the user's stored lastSeenAt, newest first, capped.
 * Returns an empty feed (and sinceMs null) when no visit has been recorded yet,
 * so a brand-new login isn't shown the whole history at once.
 */
export async function sinceLastSeen(ownerId: number): Promise<{ sinceMs: number | null; items: SinceItem[] }> {
  const db = await getDb();
  if (!db) return { sinceMs: null, items: [] };
  const [u] = await db.select({ lastSeenAt: users.lastSeenAt }).from(users).where(eq(users.id, ownerId)).limit(1);
  const sinceMs = u?.lastSeenAt ?? null;
  if (sinceMs == null) return { sinceMs: null, items: [] };
  const sinceDate = new Date(sinceMs);

  const [newLeads, replies, viewed, accepted, declined, signed, paid] = await Promise.all([
    db.select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName, eventType: leads.eventType, createdAt: leads.createdAt })
      .from(leads).where(and(eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), gt(leads.createdAt, sinceDate)))
      .orderBy(desc(leads.createdAt)).limit(FEED_CAP),
    db.select({ leadId: leadMessages.leadId, fromName: leadMessages.fromName, receivedAt: leadMessages.receivedAt })
      .from(leadMessages).where(and(eq(leadMessages.ownerId, ownerId), eq(leadMessages.direction, "in"), gt(leadMessages.receivedAt, sinceDate)))
      .orderBy(desc(leadMessages.receivedAt)).limit(FEED_CAP),
    db.select({ id: proposals.id, leadId: proposals.leadId, title: proposals.title, viewedAt: proposals.viewedAt })
      .from(proposals).where(and(eq(proposals.ownerId, ownerId), gt(proposals.viewedAt, sinceDate)))
      .orderBy(desc(proposals.viewedAt)).limit(FEED_CAP),
    db.select({ id: proposals.id, leadId: proposals.leadId, title: proposals.title, respondedAt: proposals.respondedAt })
      .from(proposals).where(and(eq(proposals.ownerId, ownerId), eq(proposals.status, "accepted"), gt(proposals.respondedAt, sinceDate)))
      .orderBy(desc(proposals.respondedAt)).limit(FEED_CAP),
    db.select({ id: proposals.id, leadId: proposals.leadId, title: proposals.title, respondedAt: proposals.respondedAt })
      .from(proposals).where(and(eq(proposals.ownerId, ownerId), eq(proposals.status, "declined"), gt(proposals.respondedAt, sinceDate)))
      .orderBy(desc(proposals.respondedAt)).limit(FEED_CAP),
    db.select({ id: contracts.id, leadId: contracts.leadId, bookingId: contracts.bookingId, title: contracts.title, clientName: contracts.clientName, signedAt: contracts.signedAt })
      .from(contracts).where(and(eq(contracts.ownerId, ownerId), eq(contracts.status, "signed"), gt(contracts.signedAt, sinceMs)))
      .orderBy(desc(contracts.signedAt)).limit(FEED_CAP),
    db.select({ id: payments.id, bookingId: payments.bookingId, amount: payments.amount, createdAt: payments.createdAt })
      .from(payments).where(and(eq(payments.ownerId, ownerId), gt(payments.createdAt, sinceDate)))
      .orderBy(desc(payments.createdAt)).limit(FEED_CAP),
  ]);

  // Names for the reply rows (fall back to the lead's own name) and the
  // payment rows (the booking's client). One query each, not per row.
  const replyLeadIds = Array.from(new Set(replies.map(r => r.leadId)));
  const payBookingIds = Array.from(new Set(paid.map(p => p.bookingId)));
  const { inArray } = await import("drizzle-orm");
  const [leadNameRows, bookingNameRows] = await Promise.all([
    replyLeadIds.length
      ? db.select({ id: leads.id, firstName: leads.firstName, lastName: leads.lastName }).from(leads)
          .where(and(eq(leads.ownerId, ownerId), inArray(leads.id, replyLeadIds)))
      : Promise.resolve([] as { id: number; firstName: string | null; lastName: string | null }[]),
    payBookingIds.length
      ? db.select({ id: bookings.id, firstName: bookings.firstName, lastName: bookings.lastName }).from(bookings)
          .where(and(eq(bookings.ownerId, ownerId), inArray(bookings.id, payBookingIds)))
      : Promise.resolve([] as { id: number; firstName: string | null; lastName: string | null }[]),
  ]);
  const leadName = new Map(leadNameRows.map(r => [r.id, personName(r)] as const));
  const bookingName = new Map(bookingNameRows.map(r => [r.id, personName(r)] as const));

  const items: SinceItem[] = [];
  const push = (at: number | null, item: Omit<SinceItem, "at">) => { if (at != null) items.push({ ...item, at }); };

  for (const l of newLeads) {
    push(ms(l.createdAt), {
      kind: "new_enquiry",
      title: `New enquiry from ${personName(l)}${l.eventType ? ` · ${l.eventType}` : ""}`,
      leadId: l.id, bookingId: null, link: leadLink(l.id),
    });
  }
  for (const r of replies) {
    const who = (r.fromName && r.fromName.trim()) || leadName.get(r.leadId) || "A client";
    push(ms(r.receivedAt), { kind: "client_reply", title: `${who} replied`, leadId: r.leadId, bookingId: null, link: leadLink(r.leadId) });
  }
  for (const p of viewed) {
    push(ms(p.viewedAt), { kind: "proposal_viewed", title: `Proposal "${p.title}" opened`, leadId: p.leadId, bookingId: null, link: leadLink(p.leadId) });
  }
  for (const p of accepted) {
    push(ms(p.respondedAt), { kind: "proposal_accepted", title: `Proposal "${p.title}" accepted`, leadId: p.leadId, bookingId: null, link: leadLink(p.leadId) });
  }
  for (const p of declined) {
    push(ms(p.respondedAt), { kind: "proposal_declined", title: `Proposal "${p.title}" declined`, leadId: p.leadId, bookingId: null, link: leadLink(p.leadId) });
  }
  for (const c of signed) {
    const who = (c.clientName && c.clientName.trim()) || "The client";
    const link = c.bookingId ? bookingLink(c.bookingId) : c.leadId ? leadLink(c.leadId) : null;
    push(ms(c.signedAt), { kind: "contract_signed", title: `${who} signed "${c.title}"`, leadId: c.leadId ?? null, bookingId: c.bookingId ?? null, link });
  }
  for (const p of paid) {
    const who = bookingName.get(p.bookingId);
    push(ms(p.createdAt), {
      kind: "payment_received",
      title: `Payment received${who ? ` from ${who}` : ""}: ${fmtNzd(Number(p.amount ?? 0))}`,
      leadId: null, bookingId: p.bookingId, link: bookingLink(p.bookingId),
    });
  }

  items.sort((a, b) => b.at - a.at);
  return { sinceMs, items: items.slice(0, FEED_CAP) };
}

/**
 * Stamp "last visited" to now, unless it was moved very recently. Returns the
 * mark in force after the call.
 */
export async function markDashboardSeen(ownerId: number): Promise<{ moved: boolean; lastSeenAt: number }> {
  const db = await getDb();
  const now = Date.now();
  if (!db) return { moved: false, lastSeenAt: now };
  const [u] = await db.select({ lastSeenAt: users.lastSeenAt }).from(users).where(eq(users.id, ownerId)).limit(1);
  const prev = u?.lastSeenAt ?? null;
  // Skip the write only for a recent PAST mark — a future one (clock skew /
  // bad data) should be corrected to now, not left to block marking forever.
  if (prev != null && prev <= now && now - prev < MARK_THROTTLE_MS) return { moved: false, lastSeenAt: prev };
  await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, ownerId));
  return { moved: true, lastSeenAt: now };
}
