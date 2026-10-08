/**
 * Server side of the shared conversion definition (shared/conversion.ts):
 * loads a venue's leads, bookings, proposals and activity once and turns them
 * into the Reports page, the dashboard tile and the Analytics funnel. The
 * maths lives in the shared module; this file only fetches and resolves the
 * NZ-calendar period.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { leads, bookings, proposals, leadActivity, venueSettings } from "../drizzle/schema";
import { zonedDayBoundUtc } from "../shared/tz";
import {
  type ConvActivity, type PeriodPreset, type Range,
  cohortBuckets, cohortConversion, conversionBy, conversionFunnel, dayKeyInTz, enquiryCohort,
  firstResponseTimes, isImportedBooking, leadOutcome, bookedLeadIds, median, pipelineByStage,
  presetRange, tally, timeToBook,
} from "../shared/conversion";
import { lostReasonsByLead } from "./lostReasons";

export const DEFAULT_TZ = "Pacific/Auckland";
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type PeriodInput = { preset?: PeriodPreset; from?: string; to?: string };

export async function venueTimezone(ownerId: number): Promise<string> {
  const db = await getDb();
  if (!db) return DEFAULT_TZ;
  const [vs] = await db.select({ tz: venueSettings.timezone }).from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const tz = vs?.tz || DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en-NZ", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

/** A period as NZ calendar days plus the UTC instants that bound them. */
export function resolvePeriod(input: PeriodInput | undefined, tz: string, now = Date.now()) {
  const today = dayKeyInTz(now, tz);
  let from: string, to: string;
  if (input?.from && input?.to && YMD.test(input.from) && YMD.test(input.to)) {
    [from, to] = input.from <= input.to ? [input.from, input.to] : [input.to, input.from];
  } else {
    ({ from, to } = presetRange(input?.preset ?? "3m", today));
  }
  const range: Range = { start: zonedDayBoundUtc(from, tz, "start"), end: zonedDayBoundUtc(to, tz, "end") };
  return { from, to, today, range };
}

/** Everything the conversion maths needs for one venue, real enquiries or not
 *  (the shared rules do the filtering, so nothing is excluded twice or missed). */
export async function loadConversionData(ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const [allLeads, allBookings, allProposals] = await Promise.all([
    db.select().from(leads).where(eq(leads.ownerId, ownerId)),
    db.select().from(bookings).where(eq(bookings.ownerId, ownerId)),
    db.select().from(proposals).where(eq(proposals.ownerId, ownerId)),
  ]);
  // Imported NowBookIt diary bookings have no lead, so they can't affect a
  // lead's outcome — drop them here anyway so no sum can pick them up.
  return { leads: allLeads, bookings: allBookings.filter(b => !isImportedBooking(b)), proposals: allProposals };
}

async function loadActivity(ownerId: number, leadIds: number[]): Promise<ConvActivity[]> {
  const db = await getDb();
  if (!db || leadIds.length === 0) return [];
  return db.select({ leadId: leadActivity.leadId, type: leadActivity.type, content: leadActivity.content, createdAt: leadActivity.createdAt })
    .from(leadActivity)
    .where(and(eq(leadActivity.ownerId, ownerId), inArray(leadActivity.leadId, leadIds)));
}

/** Dashboard tile: conversion of the last 12 months' enquiries (NZ calendar). */
export async function conversionHeadline(ownerId: number, now = Date.now()) {
  const data = await loadConversionData(ownerId);
  if (!data) return null;
  const { range } = resolvePeriod({ preset: "12m" }, await venueTimezone(ownerId), now);
  return cohortConversion(data.leads, data.bookings, range);
}

/** Cohort tally for an explicit UTC range (used by the weekly email and Analytics). */
export async function conversionForRange(ownerId: number, range: Range) {
  const data = await loadConversionData(ownerId);
  if (!data) return null;
  return { ...data, cohort: enquiryCohort(data.leads, range), tally: cohortConversion(data.leads, data.bookings, range) };
}

const HOUR_MS = 60 * 60 * 1000;

export async function buildConversionReport(ownerId: number, input?: PeriodInput, now = Date.now()) {
  const tz = await venueTimezone(ownerId);
  const period = resolvePeriod(input, tz, now);
  const data = await loadConversionData(ownerId);
  const empty = { enquiries: 0, won: 0, lost: 0, open: 0, rate: null, wonValue: 0 };
  if (!data) {
    return {
      period: { from: period.from, to: period.to, today: period.today, tz },
      summary: empty, series: { unit: "month" as const, buckets: [] },
      breakdowns: { source: [], utmSource: [], utmCampaign: [], eventType: [] },
      funnel: [], timeToBook: { medianDays: null, count: 0 },
      responseTime: { medianHours: null, count: 0, within24h: 0, awaitingReply: 0 },
      pipeline: { stages: [], total: 0, count: 0, unvalued: 0, byBasis: { proposal: 0, budget_range: 0, budget: 0 } },
      lostReasons: null,
    };
  }
  const cohort = enquiryCohort(data.leads, period.range);
  const activity = await loadActivity(ownerId, cohort.map(l => l.id));

  const booked = bookedLeadIds(data.bookings);
  const replies = firstResponseTimes(cohort, activity);
  const replyMs = Array.from(replies.values());
  const med = median(replyMs);

  // Lost reasons — only when the column exists (see lostReasons.ts).
  let lostReasons: Array<{ reason: string | null; count: number }> | null = null;
  const reasons = await lostReasonsByLead(ownerId);
  if (reasons) {
    const counts = new Map<string | null, number>();
    for (const l of cohort) {
      if (leadOutcome(l, booked) !== "lost") continue;
      const r = reasons.get(l.id)?.trim() || null;
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    lostReasons = Array.from(counts, ([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }

  return {
    period: { from: period.from, to: period.to, today: period.today, tz },
    summary: tally(cohort, data.bookings),
    series: cohortBuckets(cohort, data.bookings, period.from, period.to, tz),
    breakdowns: {
      source: conversionBy(cohort, data.bookings, l => l.source, "Not recorded"),
      utmSource: conversionBy(cohort, data.bookings, l => l.utmSource, "No UTM tag"),
      utmCampaign: conversionBy(cohort, data.bookings, l => l.utmCampaign, "No campaign"),
      eventType: conversionBy(cohort, data.bookings, l => l.eventType, "Not given"),
    },
    funnel: conversionFunnel(cohort, data.proposals, activity, data.bookings),
    timeToBook: timeToBook(cohort, data.bookings, data.proposals, activity),
    responseTime: {
      medianHours: med == null ? null : Math.round((med / HOUR_MS) * 10) / 10,
      count: replyMs.length,
      within24h: replyMs.filter(v => v <= 24 * HOUR_MS).length,
      // Open enquiries in the period that haven't had a first reply yet.
      awaitingReply: cohort.filter(l => !replies.has(l.id) && leadOutcome(l, booked) === "open").length,
    },
    // The pipeline is "right now", not the period: every open enquiry whose
    // event hasn't already been and gone.
    pipeline: pipelineByStage(data.leads, data.bookings, data.proposals, now),
    lostReasons,
  };
}
