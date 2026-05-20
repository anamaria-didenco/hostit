import { and, desc, eq, gte, isNull, lt, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  InsertUser, users,
  venueSettings, VenueSettings,
  eventSpaces,
  contacts, InsertContact,
  leads, InsertLead,
  proposals, InsertProposal,
  bookings, InsertBooking,
  leadActivity,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    for (const field of textFields) {
      const value = user[field];
      if (value === undefined) continue;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    }
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? undefined;
}

// ─── Venue Settings ───────────────────────────────────────────────────────────
export async function getVenueSettings(ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  return result[0] ?? null;
}

export async function upsertVenueSettings(ownerId: number, data: Partial<Omit<VenueSettings, "id" | "ownerId" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) return null;
  const existing = await getVenueSettings(ownerId);
  if (existing) {
    await db.update(venueSettings).set(data).where(eq(venueSettings.ownerId, ownerId));
  } else {
    await db.insert(venueSettings).values({ ownerId, name: "My Venue", slug: "my-venue", ...data });
  }
  return getVenueSettings(ownerId);
}

// ─── Event Spaces ─────────────────────────────────────────────────────────────
export async function getEventSpaces(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(eventSpaces).where(and(eq(eventSpaces.ownerId, ownerId), eq(eventSpaces.isActive, true)));
}

export async function createEventSpace(data: { ownerId: number; name: string; description?: string; minCapacity?: number; maxCapacity?: number; minSpend?: number }) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(eventSpaces).values({
    ownerId: data.ownerId,
    name: data.name,
    description: data.description,
    minCapacity: data.minCapacity,
    maxCapacity: data.maxCapacity,
    minSpend: data.minSpend?.toString() as any,
  });
  const result = await db.select().from(eventSpaces).where(eq(eventSpaces.ownerId, data.ownerId)).orderBy(desc(eventSpaces.id)).limit(1);
  return result[0] ?? null;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────
export async function getContacts(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contacts).where(eq(contacts.ownerId, ownerId)).orderBy(desc(contacts.createdAt));
}

export async function getContactById(id: number, ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)))
    .limit(1);
  return result[0] ?? null;
}

export async function createContact(data: InsertContact) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(contacts).values(data);
  const result = await db.select().from(contacts).where(and(eq(contacts.ownerId, data.ownerId), eq(contacts.email, data.email))).limit(1);
  return result[0] ?? null;
}

// ─── Leads ────────────────────────────────────────────────────────────────────
export async function getLeads(ownerId: number, status?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(leads.ownerId, ownerId)];
  if (status) conditions.push(eq(leads.status, status as any));
  return db.select().from(leads).where(and(...conditions)).orderBy(desc(leads.createdAt));
}

// All lead read/write helpers below require ownerId to prevent cross-tenant
// IDOR — a logged-in user must never be able to read or mutate another
// venue's lead by guessing an ID. Callers in routers.ts pass ctx.user.id.
export async function getLeadById(id: number, ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(leads)
    .where(and(eq(leads.id, id), eq(leads.ownerId, ownerId)))
    .limit(1);
  return result[0] ?? null;
}

export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(leads).values(data);
  const result = await db.select().from(leads)
    .where(and(eq(leads.ownerId, data.ownerId), eq(leads.email, data.email)))
    .orderBy(desc(leads.createdAt)).limit(1);
  return result[0] ?? null;
}

export async function updateLeadStatus(id: number, ownerId: number, status: string, internalNotes?: string) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, any> = { status };
  if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
  await db.update(leads).set(updateData)
    .where(and(eq(leads.id, id), eq(leads.ownerId, ownerId)));
}

export async function updateLead(id: number, ownerId: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) return;
  await db.update(leads).set(data)
    .where(and(eq(leads.id, id), eq(leads.ownerId, ownerId)));
}

// ─── Lead Activity ────────────────────────────────────────────────────────────
export async function getLeadActivity(leadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leadActivity).where(eq(leadActivity.leadId, leadId)).orderBy(desc(leadActivity.createdAt));
}

export async function addLeadActivity(data: { leadId: number; ownerId: number; type: "note" | "status_change" | "proposal_sent" | "email" | "call" | "booking_created"; content?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(leadActivity).values(data);
}

// ─── Proposals ────────────────────────────────────────────────────────────────
export async function getProposals(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proposals).where(eq(proposals.ownerId, ownerId)).orderBy(desc(proposals.createdAt));
}

// Proposal helpers are owner-scoped (except the public-token lookup which is
// the auth itself). Callers in routers.ts MUST pass ctx.user.id — or, for
// flows initiated by a public token, must pass the proposal's own ownerId.
export async function getProposalById(id: number, ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.ownerId, ownerId)))
    .limit(1);
  return result[0] ?? null;
}

export async function getProposalByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(proposals).where(eq(proposals.publicToken, token)).limit(1);
  return result[0] ?? null;
}

export async function getProposalsByLead(leadId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proposals)
    .where(and(eq(proposals.leadId, leadId), eq(proposals.ownerId, ownerId)))
    .orderBy(desc(proposals.createdAt));
}

export async function createProposal(data: InsertProposal) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(proposals).values(data);
  const result = await db.select().from(proposals).where(eq(proposals.publicToken, data.publicToken)).limit(1);
  return result[0] ?? null;
}

export async function updateProposal(id: number, ownerId: number, data: Partial<InsertProposal>) {
  const db = await getDb();
  if (!db) return;
  await db.update(proposals).set(data)
    .where(and(eq(proposals.id, id), eq(proposals.ownerId, ownerId)));
}

// ─── Bookings ─────────────────────────────────────────────────────────────────
// Auto-mark confirmed events as 'finished' once the event date is more than
// 1 day in the past. Runs cheaply on every list/byMonth fetch.
async function autoFinishPastBookings(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, ownerId: number) {
  try {
    // Flip confirmed → finished once the event's effective end (eventEndDate
    // when set, else eventDate) is more than 24 h in the past. Multi-day
    // events stay 'confirmed' until their end date passes.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.update(bookings)
      .set({ status: 'finished' })
      .where(and(
        eq(bookings.ownerId, ownerId),
        eq(bookings.status, 'confirmed'),
        or(
          and(isNull(bookings.eventEndDate), lt(bookings.eventDate, cutoff)),
          lt(bookings.eventEndDate, cutoff),
        ),
      ));
  } catch (e) {
    console.warn('[autoFinishPastBookings] failed:', e);
  }
}

export async function getBookings(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  await autoFinishPastBookings(db, ownerId);
  return db.select().from(bookings).where(eq(bookings.ownerId, ownerId)).orderBy(desc(bookings.eventDate));
}

export async function getBookingsByMonth(ownerId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) return [];
  await autoFinishPastBookings(db, ownerId);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);
  return db.select().from(bookings).where(
    and(eq(bookings.ownerId, ownerId), gte(bookings.eventDate, start), lte(bookings.eventDate, end))
  );
}

export async function createBooking(data: InsertBooking) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(bookings).values(data);
  const result = await db.select().from(bookings)
    .where(and(eq(bookings.ownerId, data.ownerId), eq(bookings.email, data.email)))
    .orderBy(desc(bookings.createdAt)).limit(1);
  return result[0] ?? null;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export async function getDashboardStats(ownerId: number) {
  const db = await getDb();
  if (!db) return { newLeads: 0, totalLeads: 0, proposalsSent: 0, bookingsThisMonth: 0, revenueThisMonth: 0, overdueFollowUps: 0, upcomingEvents: 0, overdueTasks: 0, conversionRate: 0, totalRevenueAllTime: 0, pendingPayments: 0 };
  const { tasks, bookings: bookingsTable, payments } = await import('../drizzle/schema');
  const allLeads = await db.select().from(leads).where(eq(leads.ownerId, ownerId));
  // Active enquiries: any lead not yet booked/lost/cancelled
  const newLeads = allLeads.filter(l => !['booked', 'lost', 'cancelled'].includes(l.status ?? '')).length;
  const now = new Date();
  const overdueFollowUps = allLeads.filter(l =>
    l.followUpDate &&
    new Date(l.followUpDate) <= now &&
    !['booked', 'lost', 'cancelled'].includes(l.status ?? '')
  ).length;
  const allProposals = await db.select().from(proposals).where(eq(proposals.ownerId, ownerId));
  const proposalsSent = allProposals.filter(p => ['sent', 'viewed', 'accepted'].includes(p.status)).length;
  const monthBookings = await getBookingsByMonth(ownerId, now.getFullYear(), now.getMonth() + 1);
  const revenueThisMonth = monthBookings.reduce((sum, b) => sum + Number(b.totalNzd ?? 0), 0);
  // Upcoming events (next 30 days) — bookings table + booked leads
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const allBookings = await db.select().from(bookingsTable).where(eq(bookingsTable.ownerId, ownerId));
  const upcomingFromBookings = allBookings.filter(b => b.eventDate && new Date(b.eventDate) >= now && new Date(b.eventDate) <= in30 && b.status !== 'cancelled').length;
  const upcomingFromLeads = allLeads.filter(l => l.status === 'booked' && l.eventDate && new Date(l.eventDate) >= now && new Date(l.eventDate) <= in30).length;
  const upcomingEvents = upcomingFromBookings + upcomingFromLeads;
  // Overdue tasks
  const allTasks = await db.select().from(tasks).where(eq(tasks.ownerId, ownerId));
  const overdueTasks = allTasks.filter(t => !t.completed && t.dueDate && t.dueDate < now.getTime()).length;
  // Conversion rate (leads -> booked)
  const bookedLeads = allLeads.filter(l => l.status === 'booked').length;
  const conversionRate = allLeads.length > 0 ? Math.round((bookedLeads / allLeads.length) * 100) : 0;
  // Total revenue all time
  const totalRevenueAllTime = allBookings.filter(b => b.status === 'confirmed' || b.status === 'finished').reduce((s, b) => s + Number(b.totalNzd ?? 0), 0);
  // Pending payments (bookings with outstanding balance)
  const allPayments = await db.select().from(payments).where(eq(payments.ownerId, ownerId));
  const paidByBooking: Record<number, number> = {};
  // Net paid = payments minus refunds, matches payments.summary route.
  allPayments.forEach(p => {
    const sign = p.type === 'refund' ? -1 : 1;
    paidByBooking[p.bookingId] = (paidByBooking[p.bookingId] ?? 0) + sign * Number(p.amount);
  });
  const pendingPayments = allBookings.filter(b => (b.status === 'confirmed' || b.status === 'finished') && Number(b.totalNzd ?? 0) > (paidByBooking[b.id] ?? 0)).length;
  return {
    newLeads,
    totalLeads: allLeads.length,
    proposalsSent,
    bookingsThisMonth: monthBookings.length,
    revenueThisMonth,
    overdueFollowUps,
    upcomingEvents,
    overdueTasks,
    conversionRate,
    totalRevenueAllTime,
    pendingPayments,
  };
}
