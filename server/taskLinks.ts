/**
 * Helpers for the Tasks page: who a task can be assigned to, who "mine" is, and
 * the enquiry / event search behind the "Link to" picker.
 */
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { bookings, leads, teamMembers, users } from "../drizzle/schema";

type CtxLike = {
  user: { id: number; name?: string | null };
  actorName?: string | null;
  isStaff?: boolean;
  isTeamMember?: boolean;
};

/** The signed-in person's name, lower-cased, as tasks.assignedTo is a name. */
export function myTaskName(ctx: CtxLike): string {
  return (ctx.actorName || ctx.user.name || "").trim().toLowerCase();
}

/**
 * Names a task can be assigned to: the owner, active team members, and the
 * workspace's extra logins (not staff logins — they can't see tasks).
 */
export async function listAssignees(ctx: CtxLike): Promise<{ me: string | null; names: string[] }> {
  const db = await getDb();
  const names: string[] = [];
  const add = (n: string | null | undefined) => {
    const t = (n ?? "").trim();
    if (t && !names.some(x => x.toLowerCase() === t.toLowerCase())) names.push(t);
  };
  const me = (ctx.actorName || ctx.user.name || "").trim() || null;
  add(ctx.user.name);
  add(me);
  if (db) {
    const team = await db.select({ name: teamMembers.name }).from(teamMembers)
      .where(and(eq(teamMembers.ownerId, ctx.user.id), eq(teamMembers.isActive, true)));
    team.forEach(t => add(t.name));
    const logins = await db.select({ name: users.name }).from(users)
      .where(and(eq(users.workspaceOwnerId, ctx.user.id), ne(users.isStaff, true)));
    logins.forEach(l => add(l.name));
  }
  return { me, names };
}

export type LinkTarget = {
  kind: "lead" | "booking";
  id: number;
  name: string;
  email: string | null;
  eventDate: string | null;
  status: string | null;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`);

/**
 * Enquiries and events whose client name or email contains `q` (or the newest
 * of each when `q` is empty). Events that are the booking of an enquiry are
 * listed once, as the event.
 */
export async function searchLinkTargets(ownerId: number, q: string): Promise<LinkTarget[]> {
  const db = await getDb();
  if (!db) return [];
  const term = `%${escapeLike(q.trim())}%`;
  const hasTerm = q.trim().length > 0;
  const leadMatch = hasTerm
    ? or(
        sql`concat_ws(' ', ${leads.firstName}, ${leads.lastName}) ILIKE ${term}`,
        sql`${leads.email} ILIKE ${term}`,
      )
    : undefined;
  const bookingMatch = hasTerm
    ? or(
        sql`concat_ws(' ', ${bookings.firstName}, ${bookings.lastName}) ILIKE ${term}`,
        sql`${bookings.email} ILIKE ${term}`,
      )
    : undefined;
  const leadRows = await db.select({
    id: leads.id, firstName: leads.firstName, lastName: leads.lastName, email: leads.email,
    eventDate: leads.eventDate, status: leads.status,
  }).from(leads)
    .where(and(
      eq(leads.ownerId, ownerId),
      leadMatch,
      sql`NOT EXISTS (SELECT 1 FROM ${bookings} b WHERE b."leadId" = ${leads.id} AND b."ownerId" = ${ownerId})`,
    ))
    .orderBy(desc(leads.createdAt)).limit(8);
  const bookingRows = await db.select({
    id: bookings.id, firstName: bookings.firstName, lastName: bookings.lastName, email: bookings.email,
    eventDate: bookings.eventDate, status: bookings.status,
  }).from(bookings)
    .where(and(eq(bookings.ownerId, ownerId), bookingMatch))
    .orderBy(desc(bookings.eventDate)).limit(8);
  const name = (r: { firstName: string | null; lastName: string | null }) =>
    [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "Client";
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return [
    ...leadRows.map(r => ({ kind: "lead" as const, id: r.id, name: name(r), email: r.email ?? null, eventDate: iso(r.eventDate), status: r.status ?? null })),
    ...bookingRows.map(r => ({ kind: "booking" as const, id: r.id, name: name(r), email: r.email ?? null, eventDate: iso(r.eventDate), status: r.status ?? null })),
  ];
}
