/**
 * Automatic follow-up emails to clients (Settings → Follow-ups), plus the
 * "proposal opened but not accepted" venue alert.
 *
 * One job runs every 15 minutes. For each venue with SMTP set up it plans every
 * lead's next step (followUpSchedule.ts), claims the step in
 * lead_sequence_sends (unique per lead/sequence/step/proposal) and only then
 * sends — so a re-run, a restart or two overlapping runs can never send the
 * same step twice. If the send fails the claim is removed so it can retry.
 * No SMTP = nothing sent and nothing marked as sent.
 */
import { and, desc, eq, inArray, max, ne } from "drizzle-orm";
import { getDb } from "./db";
import { leadActivity, leadSequenceSends, leads, proposals, venueSettings } from "../drizzle/schema";
import { buildVenueMailer } from "./paymentsEmail";
import { escapeHtml } from "./sanitizeHtml";
import { publicBaseUrl } from "./publicUrl";
import { notifyVenue } from "./notify";
import { substituteTemplateVars } from "../client/src/lib/templateVars";
import {
  readSequenceSettings, SEQUENCE_BY_KEY, SEQUENCES,
  type SequenceConfig, type SequenceKey,
} from "@shared/followUpSequences";
import { dueStep, planLeadSteps, type PlanLead, type PlanProposal, type PlanSend, type PlannedStep } from "./followUpSchedule";

const ACTIVE_STATUSES = ["new", "contacted", "proposal_sent", "negotiating"];
const TZ = "Pacific/Auckland";

type VenueLike = { name?: string | null; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; slug?: string | null; primaryColor?: string | null };
type LeadLike = {
  firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; company?: string | null;
  eventType?: string | null; eventDate?: Date | string | null; guestCount?: number | null; budget?: string | number | null; message?: string | null;
};

export const proposalLinkFor = (token: string) => `${publicBaseUrl()}/proposal/${token}`;
export const enquiryFormLinkFor = (slug?: string | null) => `${publicBaseUrl()}/enquire/${encodeURIComponent(slug || "")}`;

/** The subject and body a step uses (step 2 of the first sequence has its own). */
export function stepWording(cfg: SequenceConfig, step: number): { subject: string; body: string } {
  return step === 2 && cfg.secondSubject && cfg.secondBody
    ? { subject: cfg.secondSubject, body: cfg.secondBody }
    : { subject: cfg.subject, body: cfg.body };
}

/**
 * Fill in the template and wrap it in the venue's branded email. Every value
 * is escaped; bare links in the body become clickable.
 */
export function renderFollowUpEmail(opts: {
  subject: string; body: string; lead: LeadLike; venue: VenueLike;
  proposalLink?: string; enquiryFormLink?: string;
}): { subject: string; html: string; text: string } {
  const { lead, venue } = opts;
  const extra: Record<string, string> = {
    // Server runs in UTC — format the event date in NZ time, and read
    // "your {{eventType}}" naturally when no type was given.
    eventDate: lead.eventDate ? new Date(lead.eventDate).toLocaleDateString("en-NZ", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "",
    eventType: lead.eventType?.trim() || "event",
    firstName: lead.firstName?.trim() || "there",
    proposalLink: opts.proposalLink ?? "",
    enquiryFormLink: opts.enquiryFormLink ?? "",
  };
  const fill = (s: string) => substituteTemplateVars(s, lead as any, venue, extra);
  const subject = fill(opts.subject).replace(/[\r\n]+/g, " ").trim().slice(0, 255);
  const text = fill(opts.body).trim();
  const linkify = (escaped: string) =>
    escaped.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" style="color:inherit">${url}</a>`);
  const paragraphs = text.split(/\n{2,}/).map(p =>
    `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`).join("");
  const venueName = venue.name || "";
  const accent = venue.primaryColor && /^#[0-9a-fA-F]{6}$/.test(venue.primaryColor) ? venue.primaryColor : "#2D4A3E";
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;color:#1f2430">
  <div style="background:${accent};color:#fff;padding:16px 26px;border-radius:10px 10px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif">${escapeHtml(venueName)}</div>
  </div>
  <div style="background:#fffdf9;border:1px solid #ece3d2;border-top:none;padding:22px 26px 10px;border-radius:0 0 10px 10px">${paragraphs}</div>
</div>`;
  return { subject, html, text };
}

async function loadPlanInputs(ownerId: number, leadIds: number[]) {
  const db = await getDb();
  if (!db || leadIds.length === 0) return { props: new Map<number, PlanProposal[]>(), sends: new Map<number, PlanSend[]>(), activity: new Map<number, Date>() };
  const [propRows, sendRows, actRows] = await Promise.all([
    db.select({
      id: proposals.id, leadId: proposals.leadId, status: proposals.status, publicToken: proposals.publicToken,
      sentAt: proposals.sentAt, viewedAt: proposals.viewedAt, expiresAt: proposals.expiresAt,
    }).from(proposals).where(and(eq(proposals.ownerId, ownerId), inArray(proposals.leadId, leadIds), inArray(proposals.status, ["sent", "viewed"]))),
    db.select().from(leadSequenceSends).where(and(eq(leadSequenceSends.ownerId, ownerId), inArray(leadSequenceSends.leadId, leadIds))),
    db.select({ leadId: leadActivity.leadId, at: max(leadActivity.createdAt) }).from(leadActivity)
      .where(and(eq(leadActivity.ownerId, ownerId), inArray(leadActivity.leadId, leadIds)))
      .groupBy(leadActivity.leadId),
  ]);
  const props = new Map<number, PlanProposal[]>();
  for (const p of propRows) props.set(p.leadId, [...(props.get(p.leadId) ?? []), p]);
  const sends = new Map<number, PlanSend[]>();
  for (const s of sendRows) sends.set(s.leadId, [...(sends.get(s.leadId) ?? []), s]);
  const activity = new Map<number, Date>();
  for (const a of actRows) if (a.at) activity.set(a.leadId, new Date(a.at));
  return { props, sends, activity };
}

const toPlanLead = (l: any, lastActivityAt: Date | null): PlanLead => ({
  id: l.id, status: l.status, email: l.email, source: l.source, internalNotes: l.internalNotes,
  createdAt: l.createdAt, firstResponseAt: l.firstResponseAt, lastInboundAt: l.lastInboundAt,
  lastStaffEmailAt: l.lastStaffEmailAt, followUpsPaused: l.followUpsPaused, lastActivityAt,
});

/** What's next for one lead — for the lead drawer. */
export async function leadFollowUpOutlook(ownerId: number, leadId: number, now: Date = new Date()) {
  const db = await getDb();
  if (!db) return null;
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.ownerId, ownerId))).limit(1);
  if (!lead) return null;
  const [vs] = await db.select({ seq: venueSettings.followUpSequences }).from(venueSettings).where(eq(venueSettings.ownerId, ownerId)).limit(1);
  const settings = readSequenceSettings(vs?.seq);
  const { props, sends, activity } = await loadPlanInputs(ownerId, [leadId]);
  const leadSends = sends.get(leadId) ?? [];
  const steps = planLeadSteps(toPlanLead(lead, activity.get(leadId) ?? null), props.get(leadId) ?? [], leadSends, settings, now);
  const next = steps[0] ?? null;
  return {
    lead,
    anyEnabled: SEQUENCES.some(s => settings[s.key].enabled),
    paused: !!lead.followUpsPaused,
    sentCount: leadSends.length,
    next: next ? { key: next.key, step: next.step, label: SEQUENCE_BY_KEY[next.key].shortLabel, dueAt: next.dueAt } : null,
  };
}

export type SequenceRunResult = { sent: Array<{ leadId: number; key: SequenceKey; step: number; refId: number }>; skippedNoSmtp: number[]; failed: number };

async function sendStep(ownerId: number, mailer: NonNullable<Awaited<ReturnType<typeof buildVenueMailer>>>, lead: any, step: PlannedStep, cfg: SequenceConfig): Promise<"sent" | "claimed_elsewhere" | "failed"> {
  const db = (await getDb())!;
  const venue = mailer.venue as VenueLike;
  const wording = stepWording(cfg, step.step);
  const email = renderFollowUpEmail({
    ...wording, lead, venue: { ...venue, name: venue.name || mailer.fromName },
    proposalLink: step.proposalToken ? proposalLinkFor(step.proposalToken) : undefined,
    enquiryFormLink: enquiryFormLinkFor(venue.slug),
  });
  const claimed = await db.insert(leadSequenceSends).values({
    ownerId, leadId: lead.id, sequenceKey: step.key, step: step.step, refId: step.refId,
    toEmail: String(lead.email).slice(0, 320), subject: email.subject,
  }).onConflictDoNothing().returning({ id: leadSequenceSends.id });
  if (claimed.length === 0) return "claimed_elsewhere";
  try {
    const clientName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").replace(/"/g, "");
    await mailer.transporter.sendMail({
      from: `"${String(mailer.fromName).replace(/"/g, "")}" <${mailer.fromEmail}>`,
      to: clientName ? `"${clientName}" <${lead.email}>` : lead.email,
      replyTo: mailer.fromEmail,
      subject: email.subject, html: email.html, text: email.text,
    });
  } catch (err) {
    console.error(`[followUps] ${step.key} step ${step.step} to lead ${lead.id} failed:`, err);
    await db.delete(leadSequenceSends).where(eq(leadSequenceSends.id, claimed[0].id));
    return "failed";
  }
  await db.insert(leadActivity).values({
    leadId: lead.id, ownerId, type: "email",
    content: `Automatic follow-up (${SEQUENCE_BY_KEY[step.key].title}) sent to ${lead.email}\n\nSubject: ${email.subject}\n\n${email.text}`,
  });
  return "sent";
}

/**
 * The "proposal opened but not accepted" alert for the venue — sent whether
 * or not the client nudge is switched on. Uses that sequence's delay.
 */
async function alertStalledProposals(ownerId: number, cfg: SequenceConfig, now: Date, nudged: Set<number>) {
  const db = (await getDb())!;
  const rows = await db.select({
    proposalId: proposals.id, title: proposals.title, viewedAt: proposals.viewedAt, expiresAt: proposals.expiresAt,
    leadId: leads.id, firstName: leads.firstName, lastName: leads.lastName, status: leads.status,
    lastInboundAt: leads.lastInboundAt, lastStaffEmailAt: leads.lastStaffEmailAt,
  }).from(proposals).innerJoin(leads, eq(leads.id, proposals.leadId))
    .where(and(eq(proposals.ownerId, ownerId), eq(proposals.status, "viewed"), eq(leads.ownerId, ownerId), eq(leads.status, "proposal_sent")));
  for (const r of rows) {
    if (!r.viewedAt) continue;
    const viewed = new Date(r.viewedAt).getTime();
    const due = viewed + cfg.delay * 86_400_000;
    // Due, but not so long ago that it's stale (first run after a deploy).
    if (now.getTime() < due || now.getTime() - due > 3 * 86_400_000) continue;
    if (r.expiresAt && new Date(r.expiresAt).getTime() <= now.getTime()) continue;
    if ((r.lastInboundAt && new Date(r.lastInboundAt).getTime() > viewed) || (r.lastStaffEmailAt && new Date(r.lastStaffEmailAt).getTime() > viewed)) continue;
    const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || "A client";
    await notifyVenue(ownerId, {
      kind: "proposal_stalled",
      title: `${name} opened their proposal but hasn't accepted`,
      body: `They first opened “${r.title}” ${cfg.delay} day${cfg.delay === 1 ? "" : "s"} ago and haven't accepted or declined yet.${nudged.has(r.proposalId) ? " We've sent them an automatic nudge." : " A quick call or email might help."}`,
      leadId: r.leadId,
      dedupeKey: `proposal_stalled:${r.proposalId}`,
    });
  }
}

/** One pass of every venue's follow-up sequences. Exported for tests. */
export async function runFollowUpSequences(now: Date = new Date(), opts: { ownerIds?: number[] } = {}): Promise<SequenceRunResult> {
  const result: SequenceRunResult = { sent: [], skippedNoSmtp: [], failed: 0 };
  const db = await getDb();
  if (!db) return result;
  const venues = await db.select({ ownerId: venueSettings.ownerId, seq: venueSettings.followUpSequences }).from(venueSettings)
    .where(opts.ownerIds ? inArray(venueSettings.ownerId, opts.ownerIds) : undefined);
  for (const v of venues) {
    try {
      const settings = readSequenceSettings(v.seq);
      const nudged = new Set<number>();
      if (SEQUENCES.some(s => settings[s.key].enabled)) {
        const mailer = await buildVenueMailer(v.ownerId);
        if (!mailer) {
          result.skippedNoSmtp.push(v.ownerId);
        } else {
          const rows = await db.select().from(leads).where(and(
            eq(leads.ownerId, v.ownerId),
            inArray(leads.status, ACTIVE_STATUSES),
            eq(leads.followUpsPaused, false),
            ne(leads.email, ""),
          ));
          const { props, sends, activity } = await loadPlanInputs(v.ownerId, rows.map(r => r.id));
          for (const lead of rows) {
            const steps = planLeadSteps(toPlanLead(lead, activity.get(lead.id) ?? null), props.get(lead.id) ?? [], sends.get(lead.id) ?? [], settings, now);
            const step = dueStep(steps, now);
            if (!step) continue;
            const outcome = await sendStep(v.ownerId, mailer, lead, step, settings[step.key]);
            if (outcome === "sent") {
              result.sent.push({ leadId: lead.id, key: step.key, step: step.step, refId: step.refId });
              if (step.key === "proposal_viewed") nudged.add(step.refId);
            } else if (outcome === "failed") result.failed++;
          }
        }
      }
      await alertStalledProposals(v.ownerId, settings.proposal_viewed, now, nudged);
    } catch (err) {
      console.error(`[followUps] venue ${v.ownerId} failed:`, err);
    }
  }
  return result;
}

/** Latest automatic sends for a lead (newest first). */
export async function listLeadSends(ownerId: number, leadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leadSequenceSends)
    .where(and(eq(leadSequenceSends.ownerId, ownerId), eq(leadSequenceSends.leadId, leadId)))
    .orderBy(desc(leadSequenceSends.sentAt));
}
