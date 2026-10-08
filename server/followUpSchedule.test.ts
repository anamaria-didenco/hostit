import { describe, expect, it } from "vitest";
import { dueStep, planLeadSteps, type PlanLead, type PlanProposal, type PlanSend } from "./followUpSchedule";
import { applySequenceUpdate, readSequenceSettings, type SequenceKey } from "@shared/followUpSequences";
import { PARTIAL_LEAD_NOTE } from "@shared/leadConstants";
import { renderFollowUpEmail } from "./followUpSequences";

const DAY = 86_400_000;
const T0 = new Date("2026-10-01T00:00:00.000Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

/** Settings with the given sequences switched on at T0. */
function on(...keys: SequenceKey[]) {
  let s = readSequenceSettings(null);
  for (const k of keys) s = applySequenceUpdate(s, k, { enabled: true }, T0);
  return s;
}

const lead = (over: Partial<PlanLead> = {}): PlanLead => ({
  id: 1, status: "contacted", email: "jane@example.com", source: "lead_form", internalNotes: null,
  createdAt: at(0.5), firstResponseAt: at(1), lastInboundAt: null, lastStaffEmailAt: at(1),
  followUpsPaused: false, lastActivityAt: at(1), ...over,
});
const proposal = (over: Partial<PlanProposal> = {}): PlanProposal => ({
  id: 7, status: "viewed", publicToken: "tok", sentAt: at(1), viewedAt: at(2), expiresAt: null, ...over,
});
const sent = (sequenceKey: SequenceKey, step: number, day: number, refId = 0): PlanSend => ({ sequenceKey, step, refId, sentAt: at(day) });

describe("settings", () => {
  it("every sequence is off by default", () => {
    const s = readSequenceSettings(null);
    expect(Object.values(s).every(c => !c.enabled && c.enabledAt === null)).toBe(true);
    expect(planLeadSteps(lead(), [], [], s, at(30))).toEqual([]);
  });

  it("switching on stamps enabledAt; off clears it; re-saving keeps the original stamp", () => {
    let s = applySequenceUpdate(readSequenceSettings(null), "quiet_lead", { enabled: true }, T0);
    expect(s.quiet_lead.enabledAt).toBe(T0.toISOString());
    s = applySequenceUpdate(s, "quiet_lead", { subject: "Hi" }, at(5));
    expect(s.quiet_lead.enabledAt).toBe(T0.toISOString());
    s = applySequenceUpdate(s, "quiet_lead", { enabled: false }, at(6));
    expect(s.quiet_lead.enabledAt).toBeNull();
  });

  it("repairs bad saved values", () => {
    const s = readSequenceSettings({ quiet_lead: { enabled: true, enabledAt: "nope", delay: -4, subject: "" } });
    expect(s.quiet_lead.delay).toBe(7);
    expect(s.quiet_lead.subject).toContain("Still thinking");
  });
});

describe("(a) client hasn't replied to the venue's last email", () => {
  const s = on("enquiry_no_reply");

  it("is due N days after the last staff email", () => {
    const steps = planLeadSteps(lead(), [], [], s, at(2));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ key: "enquiry_no_reply", step: 1, dueAt: at(4) });
    expect(dueStep(steps, at(3.9))).toBeNull();
    expect(dueStep(steps, at(4))?.key).toBe("enquiry_no_reply");
  });

  it("stops when the client replied after the email, or the lead moved on", () => {
    expect(planLeadSteps(lead({ lastInboundAt: at(2) }), [], [], s, at(5))).toEqual([]);
    expect(planLeadSteps(lead({ status: "negotiating" }), [], [], s, at(5)).filter(x => x.key === "enquiry_no_reply")).toEqual([]);
    expect(planLeadSteps(lead({ followUpsPaused: true }), [], [], s, at(5))).toEqual([]);
  });

  it("only counts emails sent after the sequence was switched on", () => {
    expect(planLeadSteps(lead({ lastStaffEmailAt: at(-1) }), [], [], s, at(5))).toEqual([]);
  });

  it("never repeats step 1; a second nudge needs its own switch and no staff email since", () => {
    expect(planLeadSteps(lead(), [], [sent("enquiry_no_reply", 1, 4)], s, at(9))).toEqual([]);
    const s2 = applySequenceUpdate(s, "enquiry_no_reply", { secondEnabled: true, secondDelay: 7 }, at(1));
    const steps = planLeadSteps(lead(), [], [sent("enquiry_no_reply", 1, 4)], s2, at(5));
    expect(steps[0]).toMatchObject({ step: 2, dueAt: at(8) });
    // Staff emailed again after the first nudge → staff have taken over.
    expect(planLeadSteps(lead({ lastStaffEmailAt: at(6) }), [], [sent("enquiry_no_reply", 1, 4)], s2, at(9))
      .filter(x => x.key === "enquiry_no_reply")).toEqual([]);
  });
});

describe("(b) proposal opened but not accepted", () => {
  const s = on("proposal_viewed");
  const l = lead({ status: "proposal_sent", lastStaffEmailAt: at(1) });

  it("is due N days after the first view, with the proposal link", () => {
    const steps = planLeadSteps(l, [proposal()], [], s, at(3));
    expect(steps[0]).toMatchObject({ key: "proposal_viewed", refId: 7, dueAt: at(4), proposalToken: "tok" });
  });

  it("stops on accept/decline, a staff email after the view, a client reply, or expiry", () => {
    expect(planLeadSteps(l, [proposal({ status: "accepted" })], [], s, at(5))).toEqual([]);
    expect(planLeadSteps(l, [proposal({ status: "declined" })], [], s, at(5))).toEqual([]);
    expect(planLeadSteps({ ...l, lastStaffEmailAt: at(3) }, [proposal()], [], s, at(5))).toEqual([]);
    expect(planLeadSteps({ ...l, lastInboundAt: at(3) }, [proposal()], [], s, at(5))).toEqual([]);
    expect(planLeadSteps(l, [proposal({ expiresAt: at(3) })], [], s, at(5))).toEqual([]);
    expect(planLeadSteps({ ...l, status: "booked" }, [proposal()], [], s, at(5))).toEqual([]);
    expect(planLeadSteps(l, [proposal()], [sent("proposal_viewed", 1, 4, 7)], s, at(5))).toEqual([]);
  });
});

describe("(c) proposal about to expire", () => {
  const s = on("proposal_expiring");
  const l = lead({ status: "proposal_sent" });

  it("is due N days before expiry on sent or viewed proposals", () => {
    const steps = planLeadSteps(l, [proposal({ status: "sent", viewedAt: null, expiresAt: at(10) })], [], s, at(3));
    expect(steps[0]).toMatchObject({ key: "proposal_expiring", dueAt: at(8) });
  });

  it("skips expired, accepted, no-expiry, short-fuse proposals and leads where the client replied", () => {
    expect(planLeadSteps(l, [proposal({ expiresAt: at(10) })], [], s, at(10))).toEqual([]);
    expect(planLeadSteps(l, [proposal({ status: "accepted", expiresAt: at(10) })], [], s, at(3))).toEqual([]);
    expect(planLeadSteps(l, [proposal({ expiresAt: null })], [], s, at(3))).toEqual([]);
    expect(planLeadSteps(l, [proposal({ sentAt: at(1), expiresAt: at(3.5) })], [], s, at(1.2))).toEqual([]);
    expect(planLeadSteps({ ...l, lastInboundAt: at(2) }, [proposal({ expiresAt: at(10) })], [], s, at(3))).toEqual([]);
  });

  it("doesn't fire for a reminder moment that passed before switch-on", () => {
    const late = applySequenceUpdate(readSequenceSettings(null), "proposal_expiring", { enabled: true }, at(9));
    expect(planLeadSteps(l, [proposal({ expiresAt: at(10) })], [], late, at(9.5))).toEqual([]);
  });
});

describe("(d) unfinished enquiry form", () => {
  const s = on("partial_form");
  const partial = lead({ status: "new", internalNotes: PARTIAL_LEAD_NOTE, firstResponseAt: null, lastStaffEmailAt: null, createdAt: at(1) });

  it("is due N hours after the partial lead was captured", () => {
    const steps = planLeadSteps(partial, [], [], s, at(1));
    expect(steps[0]).toMatchObject({ key: "partial_form", dueAt: new Date(at(1).getTime() + 2 * 3_600_000) });
  });

  it("stops once completed, responded to, or sent", () => {
    expect(planLeadSteps({ ...partial, internalNotes: null }, [], [], s, at(2))).toEqual([]);
    expect(planLeadSteps({ ...partial, firstResponseAt: at(1.05) }, [], [], s, at(2))).toEqual([]);
    expect(planLeadSteps(partial, [], [sent("partial_form", 1, 1.1)], s, at(2))).toEqual([]);
    expect(planLeadSteps({ ...partial, createdAt: at(-3) }, [], [], s, at(2))).toEqual([]);
  });
});

describe("(e) quiet lead check-in", () => {
  const s = on("quiet_lead");

  it("is due 14 days after the last activity of any kind", () => {
    const steps = planLeadSteps(lead({ lastActivityAt: at(3) }), [], [], s, at(5));
    expect(steps[0]).toMatchObject({ key: "quiet_lead", dueAt: at(17) });
  });

  it("is sent once, and not for leads that went quiet before switch-on", () => {
    expect(planLeadSteps(lead(), [], [sent("quiet_lead", 1, 16)], s, at(40))).toEqual([]);
    expect(planLeadSteps(lead({ createdAt: at(-30), lastActivityAt: at(-20), lastStaffEmailAt: at(-20), firstResponseAt: at(-29) }), [], [], s, at(5))).toEqual([]);
    expect(planLeadSteps(lead({ status: "lost" }), [], [], s, at(40))).toEqual([]);
  });
});

describe("across sequences", () => {
  it("never sends two automatic emails within a day", () => {
    const s = on("enquiry_no_reply");
    // The nudge would be due at day 4, but another automatic email went at 3.5.
    const steps = planLeadSteps(lead(), [], [sent("proposal_viewed", 1, 3.5, 7)], s, at(4));
    expect(steps[0]).toMatchObject({ key: "enquiry_no_reply", dueAt: at(4.5) });
    expect(dueStep(steps, at(4))).toBeNull();
  });

  it("nothing at all without an email address", () => {
    expect(planLeadSteps(lead({ email: "" }), [], [], on("quiet_lead"), at(40))).toEqual([]);
  });
});

describe("renderFollowUpEmail", () => {
  it("fills variables, escapes client values, and links URLs", () => {
    const r = renderFollowUpEmail({
      subject: "Hi {{firstName}}", body: "Hello {{firstName}},\n\nSee {{proposalLink}}\n{{venueName}}",
      lead: { firstName: "<b>Jane</b>", eventType: null },
      venue: { name: "Bar Franco" },
      proposalLink: "https://venueflowhq.com/proposal/abc",
    });
    expect(r.subject).toBe("Hi <b>Jane</b>");
    expect(r.html).toContain("&lt;b&gt;Jane&lt;/b&gt;");
    expect(r.html).not.toContain("<b>Jane</b>");
    expect(r.html).toContain('<a href="https://venueflowhq.com/proposal/abc"');
    expect(r.text).toContain("Bar Franco");
  });

  it("reads naturally when details are missing", () => {
    const r = renderFollowUpEmail({ subject: "x", body: "Hi {{firstName}}, your {{eventType}}", lead: {}, venue: {} });
    expect(r.text).toBe("Hi there, your event");
  });
});
