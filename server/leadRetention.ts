/**
 * Keeping and winning back clients: template links, returning-client and
 * duplicate detection, merging duplicates, lead owners and win-back emails.
 * The tRPC procedures in routers.ts are thin wrappers over these.
 */
import { and, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { addLeadActivity, getDb, getLeadById } from "./db";
import {
  bookings, clientPortalTokens, contacts, leadActivity, leads, proposals, teamMembers, venueSettings,
  runsheets, tasks, contracts, eventBudgets, eventEquipment, communications, seatingCharts, venueNotifications,
  type Lead,
} from "../drizzle/schema";
import { publicBaseUrl } from "./publicUrl";
import { buildVenueMailer, fmtNzd } from "./paymentsEmail";
import { escapeHtml } from "./sanitizeHtml";
import { leadLink } from "./notify";
import { blankTemplateVars, substituteTemplateVars, type TemplateLinkVars } from "../client/src/lib/templateVars";
import {
  BOOKED_STATUSES, CLOSED_STATUSES, computeClientFlags, normaliseEmail, normalisePhone, sameClient, type ClientFlag,
} from "../shared/clientMatch";
import {
  QUIET_DAYS, WIN_BACK_COOLDOWN_DAYS, isAnnualEventType, parseAnnualTypes, sameTimeNextYearWindow, winBackEligibility,
} from "../shared/winBack";

const DAY_MS = 86_400_000;

// ─── Template links ─────────────────────────────────────────────────────────

/**
 * The values behind {{proposalLink}}, {{portalLink}}, {{enquiryFormLink}} and
 * {{depositAmount}} for one lead. Links use the public base URL, never the
 * request host. Missing pieces come back null (the template shows them blank).
 */
export async function resolveTemplateLinks(ownerId: number, lead: Pick<Lead, "id">): Promise<TemplateLinkVars & { holdUntil: Date | null }> {
  const db = await getDb();
  const base = publicBaseUrl();
  const out: TemplateLinkVars & { holdUntil: Date | null } = {
    proposalLink: null, portalLink: null, enquiryFormLink: null, depositAmount: null, holdUntil: null, timeZone: "Pacific/Auckland",
  };
  if (!db) return out;
  const [vs] = await db.select({ slug: venueSettings.slug, timezone: venueSettings.timezone })
    .from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  out.timeZone = vs?.timezone || "Pacific/Auckland";
  out.enquiryFormLink = vs?.slug ? `${base}/enquire/${encodeURIComponent(vs.slug)}` : `${base}/enquire`;

  // Latest proposal — preferring one that has actually gone out over a draft.
  const props = await db.select({ publicToken: proposals.publicToken, status: proposals.status, depositNzd: proposals.depositNzd })
    .from(proposals).where(and(eq(proposals.ownerId, ownerId), eq(proposals.leadId, lead.id)))
    .orderBy(desc(proposals.createdAt)).limit(10);
  const prop = props.find(p => p.status !== "draft") ?? props[0];
  if (prop?.publicToken) out.proposalLink = `${base}/proposal/${prop.publicToken}`;

  const leadBookings = await db.select({ id: bookings.id, depositNzd: bookings.depositNzd, status: bookings.status })
    .from(bookings).where(and(eq(bookings.ownerId, ownerId), eq(bookings.leadId, lead.id)))
    .orderBy(desc(bookings.createdAt));
  const bookingIds = leadBookings.map(b => b.id);

  // Latest live portal link, for the lead itself or any of its bookings.
  const nowMs = Date.now();
  const portalRows = await db.select({ token: clientPortalTokens.token, expiresAt: clientPortalTokens.expiresAt })
    .from(clientPortalTokens)
    .where(and(
      eq(clientPortalTokens.ownerId, ownerId),
      bookingIds.length
        ? or(eq(clientPortalTokens.leadId, lead.id), inArray(clientPortalTokens.bookingId, bookingIds))
        : eq(clientPortalTokens.leadId, lead.id),
    ))
    .orderBy(desc(clientPortalTokens.createdAt)).limit(5);
  const portal = portalRows.find(p => !p.expiresAt || p.expiresAt > nowMs);
  if (portal?.token) out.portalLink = `${base}/portal/${portal.token}`;

  const liveBooking = leadBookings.find(b => b.status !== "cancelled");
  const deposit = Number(liveBooking?.depositNzd ?? prop?.depositNzd ?? 0);
  if (deposit > 0) out.depositAmount = fmtNzd(deposit);

  const full = await getLeadById(lead.id, ownerId);
  // holdUntil is added by another feature — read it defensively.
  const hold = (full as any)?.holdUntil;
  out.holdUntil = hold ? new Date(hold) : null;
  return out;
}

type VenueRow = typeof venueSettings.$inferSelect;
function venueVars(vs: Partial<VenueRow> | null | undefined) {
  return { name: vs?.name ?? null, phone: vs?.phone ?? null, email: vs?.email ?? null, address: vs?.address ?? null, city: vs?.city ?? null };
}

/** Fill a template's subject and body for one lead, server-side. */
export async function renderTemplateForLead(ownerId: number, lead: Lead, subject: string, body: string, venue?: Partial<VenueRow> | null) {
  const links = await resolveTemplateLinks(ownerId, lead);
  const leadVars = { ...lead, holdUntil: links.holdUntil } as any;
  const v = venueVars(venue);
  return {
    subject: substituteTemplateVars(subject, leadVars, v, links).replace(/\s+/g, " ").trim(),
    body: substituteTemplateVars(body, leadVars, v, links),
    // Known variables that came out empty, and unknown ones still unfilled.
    blank: blankTemplateVars(`${subject}\n${body}`, leadVars, v, links),
    unfilled: Array.from(new Set(Array.from(substituteTemplateVars(`${subject}\n${body}`, leadVars, v, links).matchAll(/\{\{\w+\}\}/g)).map(m => m[0]))),
  };
}

// ─── Returning clients & duplicates ─────────────────────────────────────────

/** The SQL prefilter for "might be the same phone": same last 7 digits. */
function phoneTail(phone: string | null | undefined): string | null {
  const p = normalisePhone(phone);
  return p ? p.slice(-7) : null;
}

/** An existing contact for this email/phone, if any (email wins). */
export async function findContactIdFor(ownerId: number, email?: string | null, phone?: string | null): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const e = normaliseEmail(email);
  const tail = phoneTail(phone);
  if (!e && !tail) return null;
  const conds = [] as any[];
  if (e) conds.push(sql`lower(${contacts.email}) = ${e}`);
  if (tail) conds.push(sql`right(regexp_replace(coalesce(${contacts.phone}, ''), '[^0-9]', '', 'g'), 7) = ${tail}`);
  const rows = await db.select({ id: contacts.id, email: contacts.email, phone: contacts.phone })
    .from(contacts).where(and(eq(contacts.ownerId, ownerId), or(...conds))).orderBy(desc(contacts.createdAt)).limit(20);
  const byEmail = e ? rows.find(r => normaliseEmail(r.email) === e) : undefined;
  if (byEmail) return byEmail.id;
  const p = normalisePhone(phone);
  return rows.find(r => p && normalisePhone(r.phone) === p)?.id ?? null;
}

/** Flags for every lead of this owner, for the enquiries list (one query each for leads and bookings). */
export async function clientFlagsForOwner(ownerId: number, allLeads?: Array<Pick<Lead, "id" | "email" | "phone" | "status" | "createdAt" | "eventDate">>): Promise<Map<number, ClientFlag>> {
  const db = await getDb();
  if (!db) return new Map();
  const leadRows = allLeads ?? await db.select({
    id: leads.id, email: leads.email, phone: leads.phone, status: leads.status, createdAt: leads.createdAt, eventDate: leads.eventDate,
  }).from(leads).where(and(eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck")));
  const bookingRows = await db.select({
    id: bookings.id, leadId: bookings.leadId, email: bookings.email, status: bookings.status, eventDate: bookings.eventDate,
  }).from(bookings).where(eq(bookings.ownerId, ownerId));
  return computeClientFlags(leadRows, bookingRows);
}

/** Every other enquiry and booking from the same client, for the lead drawer. */
export async function getClientHistory(ownerId: number, leadId: number) {
  const db = await getDb();
  if (!db) return null;
  const lead = await getLeadById(leadId, ownerId);
  if (!lead) return null;
  const e = normaliseEmail(lead.email);
  const tail = phoneTail(lead.phone);
  const conds = [] as any[];
  if (e) conds.push(sql`lower(${leads.email}) = ${e}`);
  if (tail) conds.push(sql`right(regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g'), 7) = ${tail}`);
  const candidates = conds.length
    ? await db.select().from(leads)
        .where(and(eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), or(...conds)))
        .orderBy(desc(leads.createdAt)).limit(100)
    : [];
  const matched = candidates.filter(l => l.id !== lead.id && sameClient(l, lead));
  const leadIds = [lead.id, ...matched.map(l => l.id)];
  const bookingConds = [inArray(bookings.leadId, leadIds)] as any[];
  if (e) bookingConds.push(sql`lower(${bookings.email}) = ${e}`);
  const bookingRows = await db.select({
    id: bookings.id, leadId: bookings.leadId, email: bookings.email, eventDate: bookings.eventDate, eventType: bookings.eventType,
    status: bookings.status, guestCount: bookings.guestCount, totalNzd: bookings.totalNzd,
  }).from(bookings).where(and(eq(bookings.ownerId, ownerId), or(...bookingConds))).orderBy(desc(bookings.eventDate)).limit(100);
  const flag = computeClientFlags([lead, ...matched], bookingRows).get(lead.id) ?? null;

  let contact = null as null | { id: number; name: string; email: string };
  const contactId = lead.contactId ?? await findContactIdFor(ownerId, lead.email, lead.phone);
  if (contactId) {
    const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId))).limit(1);
    if (c) contact = { id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" "), email: c.email };
  }
  return {
    contact,
    flag,
    leads: matched.map(l => ({
      id: l.id, firstName: l.firstName, lastName: l.lastName, email: l.email, status: l.status,
      eventType: l.eventType, eventDate: l.eventDate, guestCount: l.guestCount, createdAt: l.createdAt,
      lostReason: l.lostReason, spaceName: l.spaceName,
      isDuplicate: flag?.duplicateIds.includes(l.id) ?? false,
    })),
    // The lead's own booking is shown elsewhere in the drawer.
    bookings: bookingRows.filter(b => b.leadId !== lead.id).map(({ email: _e, ...b }) => b),
  };
}

/**
 * Fold a duplicate enquiry into the one being kept: everything attached to it
 * (activity, proposals, bookings, tasks, documents, alerts) moves across, blank
 * details on the kept lead are filled from it, a note records what was merged,
 * and the duplicate is deleted. All in one transaction.
 */
export async function mergeLeads(ownerId: number, keepId: number, mergeId: number) {
  if (keepId === mergeId) throw new Error("Pick two different enquiries to merge.");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const keep = await getLeadById(keepId, ownerId);
  const dupe = await getLeadById(mergeId, ownerId);
  if (!keep || !dupe) throw new Error("Enquiry not found.");
  if (!sameClient(keep, dupe)) throw new Error("These enquiries don't share an email or phone number, so they can't be merged.");
  if (BOOKED_STATUSES.includes(dupe.status ?? "") && !BOOKED_STATUSES.includes(keep.status ?? "")) {
    throw new Error("The enquiry you're merging away is booked. Open that one and merge the other into it instead.");
  }

  const fill: Partial<Lead> = {};
  const blank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
  for (const k of ["phone", "company", "contactId", "eventType", "eventDate", "guestCount", "budget", "budgetRange", "eventFormat", "spaceName", "spaceId", "message", "lastName"] as const) {
    if (blank((keep as any)[k]) && !blank((dupe as any)[k])) (fill as any)[k] = (dupe as any)[k];
  }
  const when = new Date(dupe.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" });
  const note = [
    `Merged in enquiry #${dupe.id} from ${[dupe.firstName, dupe.lastName].filter(Boolean).join(" ")}${dupe.email ? ` (${dupe.email})` : ""}, received ${when}${dupe.eventType ? `, ${dupe.eventType}` : ""}. Its activity is now on this enquiry.`,
    dupe.message?.trim() ? `Their message: ${dupe.message.trim()}` : null,
    dupe.internalNotes?.trim() ? `Its internal notes: ${dupe.internalNotes.trim()}` : null,
  ].filter(Boolean).join("\n\n");

  await db.transaction(async (tx) => {
    await tx.update(leadActivity).set({ leadId: keepId }).where(and(eq(leadActivity.leadId, mergeId), eq(leadActivity.ownerId, ownerId)));
    await tx.update(proposals).set({ leadId: keepId }).where(and(eq(proposals.leadId, mergeId), eq(proposals.ownerId, ownerId)));
    await tx.update(bookings).set({ leadId: keepId }).where(and(eq(bookings.leadId, mergeId), eq(bookings.ownerId, ownerId)));
    await tx.update(runsheets).set({ leadId: keepId }).where(and(eq(runsheets.leadId, mergeId), eq(runsheets.ownerId, ownerId)));
    await tx.update(tasks).set({ linkedLeadId: keepId }).where(and(eq(tasks.linkedLeadId, mergeId), eq(tasks.ownerId, ownerId)));
    await tx.update(contracts).set({ leadId: keepId }).where(and(eq(contracts.leadId, mergeId), eq(contracts.ownerId, ownerId)));
    await tx.update(eventBudgets).set({ leadId: keepId }).where(and(eq(eventBudgets.leadId, mergeId), eq(eventBudgets.ownerId, ownerId)));
    await tx.update(eventEquipment).set({ leadId: keepId }).where(and(eq(eventEquipment.leadId, mergeId), eq(eventEquipment.ownerId, ownerId)));
    await tx.update(communications).set({ leadId: keepId }).where(and(eq(communications.leadId, mergeId), eq(communications.ownerId, ownerId)));
    await tx.update(seatingCharts).set({ leadId: keepId }).where(and(eq(seatingCharts.leadId, mergeId), eq(seatingCharts.ownerId, ownerId)));
    await tx.update(clientPortalTokens).set({ leadId: keepId }).where(and(eq(clientPortalTokens.leadId, mergeId), eq(clientPortalTokens.ownerId, ownerId)));
    await tx.update(venueNotifications).set({ leadId: keepId }).where(and(eq(venueNotifications.leadId, mergeId), eq(venueNotifications.ownerId, ownerId)));
    await tx.update(leads).set({ ...fill, updatedAt: new Date() } as any).where(and(eq(leads.id, keepId), eq(leads.ownerId, ownerId)));
    await tx.insert(leadActivity).values({ leadId: keepId, ownerId, type: "note", content: note });
    await tx.delete(leads).where(and(eq(leads.id, mergeId), eq(leads.ownerId, ownerId)));
  });
  return { keptId: keepId, mergedId: mergeId, filled: Object.keys(fill) };
}

// ─── Lead owner ──────────────────────────────────────────────────────────────

/**
 * Set (or clear) who looks after a lead. `teamMemberId` is a team_members id —
 * logins all act as the workspace owner, so team members are the only named
 * people. Optionally emails the new owner; the result says honestly whether it
 * went.
 */
export async function setLeadOwner(ownerId: number, leadId: number, teamMemberId: number | null, notify: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const lead = await getLeadById(leadId, ownerId);
  if (!lead) throw new Error("Enquiry not found.");
  let member: typeof teamMembers.$inferSelect | null = null;
  if (teamMemberId != null) {
    const [m] = await db.select().from(teamMembers).where(and(eq(teamMembers.id, teamMemberId), eq(teamMembers.ownerId, ownerId))).limit(1);
    if (!m) throw new Error("That team member no longer exists.");
    member = m;
  }
  if ((lead.assignedTo ?? null) === (teamMemberId ?? null)) return { changed: false, emailed: false as boolean, emailReason: null as string | null };
  await db.update(leads).set({ assignedTo: teamMemberId, updatedAt: new Date() }).where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId)));
  await addLeadActivity({ leadId, ownerId, type: "note", content: member ? `Owner set to ${member.name}` : "Owner cleared (unassigned)" });

  let emailed = false;
  let emailReason: string | null = null;
  if (member && notify) {
    if (!member.email) emailReason = "no_email";
    else {
      const mailer = await buildVenueMailer(ownerId);
      if (!mailer) emailReason = "smtp_not_configured";
      else {
        const clientName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
        const url = `${publicBaseUrl()}${leadLink(leadId)}`;
        const bits = [lead.eventType, lead.eventDate ? new Date(lead.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" }) : null, lead.guestCount ? `${lead.guestCount} guests` : null].filter(Boolean).join(" · ");
        try {
          await mailer.transporter.sendMail({
            from: `"VenueFlowHQ" <${mailer.fromEmail}>`,
            to: member.email,
            subject: `Enquiry assigned to you: ${clientName}`,
            html: `<div style="font-family:sans-serif;max-width:520px;color:#1f2430"><p style="font-size:15px">Hi ${escapeHtml(member.name)},</p><p style="font-size:15px;line-height:1.5">You're now looking after the enquiry from <strong>${escapeHtml(clientName)}</strong>${bits ? ` (${escapeHtml(bits)})` : ""}.</p><p><a href="${escapeHtml(url)}" style="background:#2d3a2e;color:#fffdf9;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Open the enquiry</a></p></div>`,
            text: `Hi ${member.name},\n\nYou're now looking after the enquiry from ${clientName}${bits ? ` (${bits})` : ""}.\n\n${url}`,
          });
          emailed = true;
        } catch (err) {
          console.error("[setLeadOwner] email failed", err);
          emailReason = "send_failed";
        }
      }
    }
  }
  return { changed: true, emailed, emailReason };
}

// ─── Win back ────────────────────────────────────────────────────────────────

export type WinBackRow = {
  id: number; firstName: string; lastName: string | null; email: string; status: string;
  eventType: string | null; eventDate: Date | null; guestCount: number | null;
  lostReason: string | null; lastActivityAt: Date | null; lastWinBackAt: Date | null;
  eligible: boolean; nextEligibleAt: Date | null;
};

function toRow(l: Lead, lastActivityAt: Date | null, nowMs: number): WinBackRow {
  const el = winBackEligibility(l.lastWinBackAt, nowMs);
  return {
    id: l.id, firstName: l.firstName, lastName: l.lastName, email: l.email, status: l.status,
    eventType: l.eventType, eventDate: l.eventDate, guestCount: l.guestCount,
    lostReason: l.lostReason, lastActivityAt, lastWinBackAt: l.lastWinBackAt,
    eligible: el.eligible && !!normaliseEmail(l.email), nextEligibleAt: el.nextAt,
  };
}

/** Lost leads (not "event cancelled") and open leads with 30+ quiet days. */
export async function winBackCandidates(ownerId: number, nowMs = Date.now()) {
  const db = await getDb();
  if (!db) return { lost: [] as WinBackRow[], quiet: [] as WinBackRow[] };
  const lostRows = await db.select().from(leads).where(and(
    eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), eq(leads.status, "lost"),
    or(isNull(leads.lostReason), ne(leads.lostReason, "event_cancelled")),
  )).orderBy(desc(leads.updatedAt)).limit(300);
  const openRows = await db.select().from(leads).where(and(
    eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), notInArray(leads.status, CLOSED_STATUSES),
  )).limit(1000);
  const ids = [...lostRows, ...openRows].map(l => l.id);
  const lastAct = new Map<number, Date>();
  if (ids.length) {
    const acts = await db.select({ leadId: leadActivity.leadId, last: sql<string>`max(${leadActivity.createdAt})` })
      .from(leadActivity).where(and(eq(leadActivity.ownerId, ownerId), inArray(leadActivity.leadId, ids)))
      .groupBy(leadActivity.leadId);
    for (const a of acts) if (a.last) lastAct.set(a.leadId, new Date(a.last));
  }
  const latest = (l: Lead) => {
    const ts = [l.createdAt, l.updatedAt, lastAct.get(l.id)].filter(Boolean).map(d => new Date(d as any).getTime());
    return ts.length ? new Date(Math.max(...ts)) : null;
  };
  const cutoff = nowMs - QUIET_DAYS * DAY_MS;
  const quiet = openRows
    .map(l => ({ l, last: latest(l) }))
    .filter(x => x.last && x.last.getTime() < cutoff)
    .sort((a, b) => a.last!.getTime() - b.last!.getTime())
    .map(x => toRow(x.l, x.last, nowMs));
  return { lost: lostRows.map(l => toRow(l, latest(l), nowMs)), quiet };
}

/**
 * "Same time next year": clients whose annual-type event was 10–11 months
 * ago, so the venue can invite them back. Clients who've already enquired
 * again since are left out.
 */
export async function sameTimeNextYear(ownerId: number, nowMs = Date.now()) {
  const db = await getDb();
  if (!db) return { rows: [] as WinBackRow[], annualTypes: [] as string[], eventTypes: [] as string[], from: null as Date | null, to: null as Date | null };
  const [vs] = await db.select({ raw: venueSettings.winBackAnnualTypes, tz: venueSettings.timezone })
    .from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const annualTypes = parseAnnualTypes(vs?.raw);
  const { from, to } = sameTimeNextYearWindow(nowMs, vs?.tz || "Pacific/Auckland");
  const inWindow = await db.select().from(leads).where(and(
    eq(leads.ownerId, ownerId), ne(leads.source, "healthcheck"), inArray(leads.status, BOOKED_STATUSES),
    gte(leads.eventDate, from), lt(leads.eventDate, to),
  )).orderBy(leads.eventDate).limit(500);
  // Event types this venue has actually booked, to choose from in Settings.
  const typeRows = await db.selectDistinct({ t: leads.eventType }).from(leads)
    .where(and(eq(leads.ownerId, ownerId), inArray(leads.status, BOOKED_STATUSES))).limit(200);
  const eventTypes = Array.from(new Set(typeRows.map(r => r.t?.trim()).filter((t): t is string => !!t))).sort((a, b) => a.localeCompare(b));

  const annual = inWindow.filter(l => isAnnualEventType(l.eventType, annualTypes) && normaliseEmail(l.email));
  let rows: WinBackRow[] = [];
  if (annual.length) {
    // Skip anyone who has made a newer enquiry since their event.
    const emails = Array.from(new Set(annual.map(l => normaliseEmail(l.email)!)));
    const newer = await db.select({ id: leads.id, email: leads.email, phone: leads.phone, createdAt: leads.createdAt })
      .from(leads).where(and(eq(leads.ownerId, ownerId), inArray(sql`lower(${leads.email})`, emails)));
    rows = annual
      .filter(l => !newer.some(n => n.id !== l.id && sameClient(n, l) && l.eventDate && new Date(n.createdAt) > new Date(l.eventDate)))
      .map(l => toRow(l, null, nowMs));
  }
  return { rows, annualTypes, eventTypes, from, to };
}

export async function setAnnualTypes(ownerId: number, types: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const clean = Array.from(new Set(types.map(t => t.trim()).filter(Boolean))).slice(0, 50);
  const [existing] = await db.select({ id: venueSettings.id }).from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  if (!existing) throw new Error("Save your venue details first.");
  await db.update(venueSettings).set({ winBackAnnualTypes: JSON.stringify(clean) }).where(eq(venueSettings.ownerId, ownerId));
  return { annualTypes: clean };
}

export type WinBackSkip = { id: number; name: string; reason: "not_found" | "no_email" | "sent_recently" | "event_cancelled" | "missing_details" | "smtp_not_configured" | "send_failed"; detail?: string };

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

/**
 * Send a win-back email to each selected lead, personalised per lead. Skips
 * (and says why) anyone without an email, anyone emailed a win-back in the
 * last 90 days, "event cancelled" losses, and anyone the template can't be
 * filled for. The 90-day claim is taken before sending and released if the
 * send fails, so two clicks can never double-send.
 */
export async function sendWinBack(ownerId: number, leadIds: number[], subject: string, body: string, nowMs = Date.now()) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const ids = Array.from(new Set(leadIds));
  const rows = ids.length ? await db.select().from(leads).where(and(eq(leads.ownerId, ownerId), inArray(leads.id, ids))) : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const skipped: WinBackSkip[] = [];
  const sent: number[] = [];
  const name = (l: Lead) => [l.firstName, l.lastName].filter(Boolean).join(" ");

  const mailer = await buildVenueMailer(ownerId);
  const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);

  for (const id of ids) {
    const l = byId.get(id);
    if (!l) { skipped.push({ id, name: `#${id}`, reason: "not_found" }); continue; }
    if (!normaliseEmail(l.email)) { skipped.push({ id, name: name(l), reason: "no_email" }); continue; }
    if (l.status === "lost" && l.lostReason === "event_cancelled") { skipped.push({ id, name: name(l), reason: "event_cancelled" }); continue; }
    if (!winBackEligibility(l.lastWinBackAt, nowMs).eligible) { skipped.push({ id, name: name(l), reason: "sent_recently" }); continue; }
    const r = await renderTemplateForLead(ownerId, l, subject, body, vs);
    const missing = [...r.blank, ...r.unfilled];
    if (missing.length) { skipped.push({ id, name: name(l), reason: "missing_details", detail: missing.join(", ") }); continue; }
    if (!mailer) { skipped.push({ id, name: name(l), reason: "smtp_not_configured" }); continue; }

    // Claim the 90-day slot first; a concurrent send loses the race here.
    const cutoff = new Date(nowMs - WIN_BACK_COOLDOWN_DAYS * DAY_MS);
    const claimed = await db.update(leads).set({ lastWinBackAt: new Date(nowMs) })
      .where(and(eq(leads.id, id), eq(leads.ownerId, ownerId), or(isNull(leads.lastWinBackAt), lt(leads.lastWinBackAt, cutoff))))
      .returning({ id: leads.id });
    if (!claimed.length) { skipped.push({ id, name: name(l), reason: "sent_recently" }); continue; }
    try {
      const replyTo = vs?.notificationEmail?.split(/[,;]/)[0]?.trim() || mailer.fromEmail;
      await mailer.transporter.sendMail({
        from: `"${mailer.fromName}" <${mailer.fromEmail}>`,
        to: `"${name(l).replace(/"/g, "")}" <${l.email}>`,
        replyTo,
        subject: r.subject,
        html: `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#1a1209">${textToHtml(r.body)}</div>`,
        text: r.body,
      });
    } catch (err) {
      console.error("[winBack] send failed for lead", id, err);
      await db.update(leads).set({ lastWinBackAt: l.lastWinBackAt ?? null }).where(and(eq(leads.id, id), eq(leads.ownerId, ownerId)));
      skipped.push({ id, name: name(l), reason: "send_failed" });
      continue;
    }
    sent.push(id);
    await addLeadActivity({ leadId: id, ownerId, type: "email", content: `Win-back email sent to ${l.email}\n\nSubject: ${r.subject}\n\n${r.body}` });
  }
  return { sent: sent.length, sentIds: sent, skipped, smtpConfigured: !!mailer };
}
