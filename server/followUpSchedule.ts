/**
 * When is each automatic follow-up due for a lead, and when must it stop?
 * Pure: the job (followUpSequences.ts) and the lead drawer both use it, and
 * the unit tests pin it down.
 *
 * Rules shared by every sequence:
 *  - Only triggers at or after the moment the sequence was switched on
 *    (enabledAt) qualify, so switching one on never emails historic leads.
 *  - A step stops once the client has replied (lastInboundAt) after its
 *    trigger, the lead has moved to another status, or the lead is paused.
 *  - Each step goes out at most once (lead_sequence_sends), and a lead never
 *    gets two automatic emails within 24 hours of each other.
 */
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";
import type { SequenceConfig, SequenceKey } from "@shared/followUpSequences";

export type PlanLead = {
  id: number;
  status: string | null;
  email: string | null;
  source: string | null;
  internalNotes: string | null;
  createdAt: Date;
  firstResponseAt: Date | null;
  lastInboundAt: Date | null;
  lastStaffEmailAt: Date | null;
  followUpsPaused: boolean | null;
  /** Latest lead_activity row (notes, emails, status changes), if any. */
  lastActivityAt: Date | null;
};

export type PlanProposal = {
  id: number;
  status: string;
  publicToken: string;
  sentAt: Date | null;
  viewedAt: Date | null;
  expiresAt: Date | null;
};

export type PlanSend = { sequenceKey: string; step: number; refId: number; sentAt: Date };

export type PlannedStep = {
  key: SequenceKey;
  step: number;
  /** Proposal id for proposal sequences, else 0. */
  refId: number;
  triggerAt: Date;
  dueAt: Date;
  proposalToken?: string;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const MIN_GAP_BETWEEN_AUTO_EMAILS_MS = DAY;

const ms = (d: Date | null | undefined) => (d ? new Date(d).getTime() : null);
const after = (a: Date | null | undefined, b: Date) => { const t = ms(a); return t != null && t > b.getTime(); };

const enabledFor = (cfg: SequenceConfig | undefined, trigger: Date): cfg is SequenceConfig => {
  if (!cfg?.enabled || !cfg.enabledAt) return false;
  return trigger.getTime() >= Date.parse(cfg.enabledAt);
};

/**
 * Every follow-up step that is still to come for this lead (due now or
 * later), earliest first. Steps already sent or stopped are left out.
 */
export function planLeadSteps(
  lead: PlanLead,
  proposals: PlanProposal[],
  sends: PlanSend[],
  settings: Record<SequenceKey, SequenceConfig>,
  now: Date,
): PlannedStep[] {
  if (lead.followUpsPaused || !lead.email?.trim() || lead.source === "healthcheck") return [];
  const sent = (key: SequenceKey, step: number, refId = 0) =>
    sends.find(s => s.sequenceKey === key && s.step === step && s.refId === refId);
  const status = lead.status ?? "";
  const out: PlannedStep[] = [];

  // (a) Enquiry: the client hasn't replied to the venue's last email.
  const a = settings.enquiry_no_reply;
  const lastEmail = lead.lastStaffEmailAt ? new Date(lead.lastStaffEmailAt) : null;
  if (status === "contacted" && lastEmail && enabledFor(a, lastEmail) && !after(lead.lastInboundAt, lastEmail)) {
    const first = sent("enquiry_no_reply", 1);
    if (!first) {
      out.push({ key: "enquiry_no_reply", step: 1, refId: 0, triggerAt: lastEmail, dueAt: new Date(lastEmail.getTime() + a.delay * DAY) });
    } else if (a.secondEnabled && !sent("enquiry_no_reply", 2) && first.sentAt.getTime() >= lastEmail.getTime()) {
      // Only if nobody has emailed since the first nudge (staff took over otherwise).
      const due = Math.max(lastEmail.getTime() + (a.secondDelay ?? 7) * DAY, first.sentAt.getTime() + DAY);
      out.push({ key: "enquiry_no_reply", step: 2, refId: 0, triggerAt: lastEmail, dueAt: new Date(due) });
    }
  }

  // (b) Proposal opened but not accepted or declined — the most recently opened one.
  const b = settings.proposal_viewed;
  const viewed = proposals
    .filter(p => p.status === "viewed" && p.viewedAt)
    .sort((x, y) => ms(y.viewedAt)! - ms(x.viewedAt)!)[0];
  if (viewed && status === "proposal_sent") {
    const t = new Date(viewed.viewedAt!);
    const expired = viewed.expiresAt && ms(viewed.expiresAt)! <= now.getTime();
    if (enabledFor(b, t) && !expired && !after(lead.lastInboundAt, t) && !after(lead.lastStaffEmailAt, t)
      && !sent("proposal_viewed", 1, viewed.id)) {
      out.push({ key: "proposal_viewed", step: 1, refId: viewed.id, triggerAt: t, dueAt: new Date(t.getTime() + b.delay * DAY), proposalToken: viewed.publicToken });
    }
  }

  // (c) Proposal about to expire.
  const c = settings.proposal_expiring;
  if (status === "proposal_sent" || status === "negotiating") {
    for (const p of proposals) {
      if ((p.status !== "sent" && p.status !== "viewed") || !p.expiresAt) continue;
      const expires = ms(p.expiresAt)!;
      if (expires <= now.getTime()) continue;
      const due = new Date(expires - c.delay * DAY);
      // A proposal sent with less than a day of runway doesn't need a reminder.
      const sentAt = p.sentAt ? new Date(p.sentAt) : null;
      if (sentAt && due.getTime() < sentAt.getTime() + DAY) continue;
      if (!enabledFor(c, due) || (sentAt && after(lead.lastInboundAt, sentAt)) || sent("proposal_expiring", 1, p.id)) continue;
      out.push({ key: "proposal_expiring", step: 1, refId: p.id, triggerAt: due, dueAt: due, proposalToken: p.publicToken });
    }
  }

  // (d) Unfinished enquiry form.
  const d = settings.partial_form;
  if (status === "new" && lead.internalNotes === PARTIAL_LEAD_NOTE && !lead.firstResponseAt && !lead.lastStaffEmailAt) {
    const t = new Date(lead.createdAt);
    if (enabledFor(d, t) && !after(lead.lastInboundAt, t) && !sent("partial_form", 1)) {
      out.push({ key: "partial_form", step: 1, refId: 0, triggerAt: t, dueAt: new Date(t.getTime() + d.delay * HOUR) });
    }
  }

  // (e) Quiet lead: no activity of any kind for N days.
  const e = settings.quiet_lead;
  if (["contacted", "proposal_sent", "negotiating"].includes(status) && !sent("quiet_lead", 1)) {
    const lastSend = sends.reduce((m, s) => Math.max(m, s.sentAt.getTime()), 0);
    const t = new Date(Math.max(
      new Date(lead.createdAt).getTime(), ms(lead.lastActivityAt) ?? 0, ms(lead.lastInboundAt) ?? 0,
      ms(lead.lastStaffEmailAt) ?? 0, lastSend,
    ));
    if (enabledFor(e, t)) {
      out.push({ key: "quiet_lead", step: 1, refId: 0, triggerAt: t, dueAt: new Date(t.getTime() + e.delay * DAY) });
    }
  }

  // Never two automatic emails within a day of each other.
  const lastAuto = sends.reduce((m, s) => Math.max(m, s.sentAt.getTime()), 0);
  if (lastAuto) {
    for (const s of out) {
      if (s.dueAt.getTime() < lastAuto + MIN_GAP_BETWEEN_AUTO_EMAILS_MS) s.dueAt = new Date(lastAuto + MIN_GAP_BETWEEN_AUTO_EMAILS_MS);
    }
  }
  return out.sort((x, y) => x.dueAt.getTime() - y.dueAt.getTime());
}

/** The single step to send right now, if any (at most one per lead per run). */
export function dueStep(steps: PlannedStep[], now: Date): PlannedStep | null {
  return steps.find(s => s.dueAt.getTime() <= now.getTime()) ?? null;
}
