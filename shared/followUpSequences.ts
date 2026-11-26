/**
 * Automatic follow-up emails to clients: what each sequence is, its default
 * wording and delay, and how the venue's saved settings are read.
 *
 * Shared by the server job (server/followUpSequences.ts) and the Settings →
 * Follow-ups page, so the defaults and descriptions can't drift apart.
 * Every sequence is OFF until the venue turns it on.
 */

export type SequenceKey =
  | "enquiry_no_reply"
  | "proposal_viewed"
  | "proposal_expiring"
  | "partial_form"
  | "quiet_lead";

export const SEQUENCE_KEYS: SequenceKey[] = [
  "enquiry_no_reply", "proposal_viewed", "proposal_expiring", "partial_form", "quiet_lead",
];

export type DelayUnit = "hours" | "days";

export type SequenceConfig = {
  enabled: boolean;
  /** ISO time the sequence was last switched on. Only triggers after this
   *  moment qualify, so switching on never emails historic leads. */
  enabledAt: string | null;
  delay: number;
  subject: string;
  body: string;
  /** enquiry_no_reply only: an optional second nudge. */
  secondEnabled?: boolean;
  secondDelay?: number;
  secondSubject?: string;
  secondBody?: string;
};

export type SequenceDef = {
  key: SequenceKey;
  title: string;
  /** Plain description of exactly when it sends (shown in Settings). */
  when: (cfg: SequenceConfig) => string;
  unit: DelayUnit;
  delayLabel: string;
  minDelay: number;
  maxDelay: number;
  defaults: SequenceConfig;
  /** Extra variables this sequence can use. */
  extraVars: string[];
  /** Short label used in the lead drawer ("Nudge email on Tue 14 Oct"). */
  shortLabel: string;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const SEQUENCES: SequenceDef[] = [
  {
    key: "enquiry_no_reply",
    title: "Enquiry: client hasn't replied",
    shortLabel: "Nudge email",
    unit: "days", delayLabel: "Days after your last email", minDelay: 1, maxDelay: 30,
    when: c => `Sends ${plural(c.delay, "day", "days")} after the last email you sent from VenueFlow, while the enquiry is still “Contacted” and the client hasn't replied.${c.secondEnabled ? ` A second nudge follows ${plural(c.secondDelay ?? 7, "day", "days")} after that same email if there's still no reply.` : ""}`,
    extraVars: [],
    defaults: {
      enabled: false, enabledAt: null, delay: 3,
      subject: "Checking in on your event — {{venueName}}",
      body: "Hi {{firstName}},\n\nWe wanted to make sure our last email reached you.\n\nIf you have any questions about your {{eventType}}, just reply. We're happy to help.\n\nSpeak soon,\n{{venueName}}",
      secondEnabled: false, secondDelay: 7,
      secondSubject: "Still planning your event? — {{venueName}}",
      secondBody: "Hi {{firstName}},\n\nWe haven't heard back, so this is our last check-in.\n\nIf you're still planning your {{eventType}}, just reply and we'll pick it up from there. If your plans have changed, that's completely fine. We'd be glad to host you another time.\n\nAll the best,\n{{venueName}}",
    },
  },
  {
    key: "proposal_viewed",
    title: "Proposal viewed but not accepted",
    shortLabel: "Proposal nudge",
    unit: "days", delayLabel: "Days after they first open it", minDelay: 1, maxDelay: 30,
    when: c => `Sends ${plural(c.delay, "day", "days")} after the client first opens their proposal, if they haven't accepted or declined, the enquiry is still “Proposal sent”, and nobody has emailed since. You'll also get an alert in the bell.`,
    extraVars: ["proposalLink"],
    defaults: {
      enabled: false, enabledAt: null, delay: 2,
      subject: "Happy to talk through your proposal — {{venueName}}",
      body: "Hi {{firstName}},\n\nWe hope the proposal has everything you need.\n\nIf anything needs changing, or you'd like to go over any of it, just reply.\n\nHere it is again:\n{{proposalLink}}\n\nSpeak soon,\n{{venueName}}",
    },
  },
  {
    key: "proposal_expiring",
    title: "Proposal about to expire",
    shortLabel: "Expiry reminder",
    unit: "days", delayLabel: "Days before it expires", minDelay: 1, maxDelay: 14,
    when: c => `Sends ${plural(c.delay, "day", "days")} before a sent proposal's expiry date, if it hasn't been accepted or declined and the client hasn't replied since it was sent. Proposals without an expiry date never get this.`,
    extraVars: ["proposalLink"],
    defaults: {
      enabled: false, enabledAt: null, delay: 2,
      subject: "Your proposal expires soon — {{venueName}}",
      body: "Hi {{firstName}},\n\nA quick note to say the proposal for your {{eventType}} expires soon.\n\nIf you'd like to go ahead, you can accept it here:\n{{proposalLink}}\n\nIf you have any questions first, just reply.\n\nSpeak soon,\n{{venueName}}",
    },
  },
  {
    key: "partial_form",
    title: "Unfinished enquiry form",
    shortLabel: "Finish-your-enquiry email",
    unit: "hours", delayLabel: "Hours after they stop", minDelay: 1, maxDelay: 72,
    when: c => `Sends once, ${plural(c.delay, "hour", "hours")} after someone fills in their contact details on your enquiry form but doesn't finish it, as long as nobody has responded yet.`,
    extraVars: ["enquiryFormLink"],
    defaults: {
      enabled: false, enabledAt: null, delay: 2,
      subject: "Would you like to finish your enquiry? — {{venueName}}",
      body: "Hi {{firstName}},\n\nYou started an enquiry with us, and we'd be glad to hear the rest.\n\nIt only takes a minute. You can finish it here:\n{{enquiryFormLink}}\n\nOr just reply to this email with your date and guest numbers, and we'll take it from there.\n\nSpeak soon,\n{{venueName}}",
    },
  },
  {
    key: "quiet_lead",
    title: "Quiet lead check-in",
    shortLabel: "Check-in email",
    unit: "days", delayLabel: "Days with no activity", minDelay: 7, maxDelay: 60,
    when: c => `Sends once per enquiry, after ${plural(c.delay, "day", "days")} with no activity at all (no emails, notes or status changes) while it's “Contacted”, “Proposal sent” or “Negotiating”.`,
    extraVars: [],
    defaults: {
      enabled: false, enabledAt: null, delay: 14,
      subject: "Still thinking about your event? — {{venueName}}",
      body: "Hi {{firstName}},\n\nIt's been a little while, so we wanted to check in on your {{eventType}}.\n\nIf you're still planning it, just reply and let us know where things stand. We'd be glad to help.\n\nSpeak soon,\n{{venueName}}",
    },
  },
];

export const SEQUENCE_BY_KEY: Record<SequenceKey, SequenceDef> =
  Object.fromEntries(SEQUENCES.map(s => [s.key, s])) as Record<SequenceKey, SequenceDef>;

type WordingField = "subject" | "body" | "secondSubject" | "secondBody";

/**
 * Earlier built-in wording, field by field. Saving any sequence stores the
 * whole map, defaults included, so a venue that has ever switched one on holds
 * these word for word without having typed them. readSequenceSettings reads
 * a saved field that matches one of these as today's default; wording a venue
 * actually wrote is never touched. When a default changes again, add the old
 * text here.
 */
export const LEGACY_SEQUENCE_DEFAULTS: Record<SequenceKey, Partial<Record<WordingField, string[]>>> = {
  enquiry_no_reply: {
    subject: ["Just checking in — {{venueName}}"],
    body: ["Hi {{firstName}},\n\nI just wanted to check my last email reached you. Do you have any questions about your {{eventType}} with us? I'm happy to help with whatever you need.\n\nWarm regards,\n{{venueName}}"],
    secondSubject: ["Are you still planning your event? — {{venueName}}"],
    secondBody: ["Hi {{firstName}},\n\nI haven't heard back, so I thought I'd check in one last time. If you're still planning your {{eventType}}, just reply and we'll pick it up from there. If your plans have changed, no worries at all.\n\nWarm regards,\n{{venueName}}"],
  },
  proposal_viewed: {
    subject: ["Any questions about your proposal? — {{venueName}}"],
    body: ["Hi {{firstName}},\n\nI saw you've had a look at your proposal. Is there anything you'd like to change or talk through? You can view it again here:\n{{proposalLink}}\n\nWarm regards,\n{{venueName}}"],
  },
  proposal_expiring: {
    body: ["Hi {{firstName}},\n\nJust a heads-up that your proposal for your {{eventType}} expires soon. If you'd like to go ahead, you can accept it here:\n{{proposalLink}}\n\nWarm regards,\n{{venueName}}"],
  },
  partial_form: {
    subject: ["Did you want to finish your enquiry? — {{venueName}}"],
    body: ["Hi {{firstName}},\n\nIt looks like you started an enquiry with us but didn't get to the end. If you're still keen, you can finish it here — it only takes a minute:\n{{enquiryFormLink}}\n\nOr just reply to this email with your date and numbers.\n\nWarm regards,\n{{venueName}}"],
  },
  quiet_lead: {
    body: ["Hi {{firstName}},\n\nIt's been a little while, so I wanted to check in on your {{eventType}}. Are you still planning it? We'd love to help — just reply and let me know where things are at.\n\nWarm regards,\n{{venueName}}"],
  },
};

const sameWording = (a: string, b: string) => a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();

/** A saved field that is an earlier built-in default reads as today's default. */
function currentWording(key: SequenceKey, field: WordingField, saved: string, nowDefault: string): string {
  return (LEGACY_SEQUENCE_DEFAULTS[key][field] ?? []).some(old => sameWording(saved, old)) ? nowDefault : saved;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v: unknown, fallback: string, max: number): string =>
  typeof v === "string" && v.trim() ? v.slice(0, max) : fallback;

/** The venue's saved settings merged over the defaults (bad values repaired). */
export function readSequenceSettings(raw: unknown): Record<SequenceKey, SequenceConfig> {
  const saved = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const out = {} as Record<SequenceKey, SequenceConfig>;
  for (const def of SEQUENCES) {
    const s = saved[def.key] && typeof saved[def.key] === "object" ? saved[def.key] : {};
    const d = def.defaults;
    const enabled = s.enabled === true;
    const cfg: SequenceConfig = {
      enabled,
      enabledAt: enabled && typeof s.enabledAt === "string" && !Number.isNaN(Date.parse(s.enabledAt)) ? s.enabledAt : null,
      delay: clampInt(s.delay, def.minDelay, def.maxDelay, d.delay),
      subject: currentWording(def.key, "subject", str(s.subject, d.subject, 255), d.subject),
      body: currentWording(def.key, "body", str(s.body, d.body, 5000), d.body),
    };
    if (def.key === "enquiry_no_reply") {
      cfg.secondEnabled = s.secondEnabled === true;
      cfg.secondDelay = clampInt(s.secondDelay, def.minDelay, def.maxDelay, d.secondDelay ?? 7);
      cfg.secondSubject = currentWording(def.key, "secondSubject", str(s.secondSubject, d.secondSubject ?? "", 255), d.secondSubject ?? "");
      cfg.secondBody = currentWording(def.key, "secondBody", str(s.secondBody, d.secondBody ?? "", 5000), d.secondBody ?? "");
    }
    out[def.key] = cfg;
  }
  return out;
}

/**
 * Apply an edit from Settings. Switching a sequence on stamps enabledAt with
 * `now`; switching it off clears it, so turning it back on later never picks
 * up the leads that went past in between.
 */
export function applySequenceUpdate(
  current: Record<SequenceKey, SequenceConfig>,
  key: SequenceKey,
  patch: Partial<Omit<SequenceConfig, "enabledAt">>,
  now: Date,
): Record<SequenceKey, SequenceConfig> {
  const prev = current[key];
  const next: SequenceConfig = { ...prev, ...patch, enabledAt: prev.enabledAt };
  if (patch.enabled === true && !prev.enabled) next.enabledAt = now.toISOString();
  if (patch.enabled === false) next.enabledAt = null;
  if (next.enabled && !next.enabledAt) next.enabledAt = now.toISOString();
  return readSequenceSettings({ ...current, [key]: next });
}

/** Alert kinds the venue can mute individually for email (the bell always shows them). */
export const ALERT_KIND_LABELS: { kind: string; label: string }[] = [
  { kind: "partial_enquiry", label: "Someone started the enquiry form but didn't send it" },
  { kind: "reply_overdue", label: "An enquiry is waiting for a reply" },
  { kind: "proposal_stalled", label: "A proposal was opened but not accepted" },
  { kind: "proposal_viewed", label: "A client opened a proposal" },
  { kind: "proposal_accepted", label: "A client accepted a proposal" },
  { kind: "proposal_declined", label: "A client declined a proposal" },
  { kind: "contract_signed", label: "A client signed a contract" },
  { kind: "client_replied", label: "A client replied by email" },
  { kind: "walkthrough_requested", label: "A client asked for a walkthrough" },
  { kind: "hold_expiring", label: "A date hold is about to end" },
  { kind: "hold_released", label: "A date hold was released automatically" },
  { kind: "hold_lapsed", label: "A date hold ran out" },
  { kind: "double_booking", label: "Possible double booking" },
];
