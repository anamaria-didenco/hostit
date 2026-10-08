import { describe, it, expect } from "vitest";
import { leadFollowUpState, IDLE_FOLLOWUP_DAYS } from "../shared/followUp";
import { leadNeedsReply, leadReplyWaitMs } from "../shared/needsReply";
import { PARTIAL_LEAD_NOTE } from "../shared/leadConstants";
import {
  parseTaskRules, rulesForStatus, describeTaskRule, BUILTIN_FUNCTION_PACK_RULE,
  dueAfterTrigger, dueBeforeEvent, ymdInTz, addDaysYmd,
} from "../shared/automatedTasks";
import { signatureProfiles, defaultSignatureId, effectiveFromName, LEGACY_SIGNATURE_ID } from "../shared/emailSignatures";
import { ENQUIRY_RESPONSE_PROMISE, DEFAULT_AUTO_REPLY_INTRO, DEFAULT_FORM_SUCCESS_MESSAGE, DEFAULT_LEAD_FORM_SUBTITLE } from "../shared/enquiryCopy";
import { reportRecipients } from "./enquiryReport";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8, 1, 0, 0); // Thu 8 Oct 2026, 2pm NZDT

describe("leadFollowUpState — gone quiet uses lastActivityAt", () => {
  it("is idle when nothing has happened for longer than the threshold", () => {
    const lead = { status: "contacted", lastActivityAt: new Date(NOW - (IDLE_FOLLOWUP_DAYS + 1) * DAY), updatedAt: new Date(NOW) };
    expect(leadFollowUpState(lead, NOW)).toEqual({ needs: true, reason: "idle" });
  });
  it("recent activity keeps a lead off the list even if it was created long ago", () => {
    const lead = { status: "contacted", createdAt: new Date(NOW - 60 * DAY), updatedAt: new Date(NOW - 60 * DAY), lastActivityAt: new Date(NOW - DAY) };
    expect(leadFollowUpState(lead, NOW).needs).toBe(false);
  });
  it("falls back to updatedAt/createdAt for rows without lastActivityAt", () => {
    expect(leadFollowUpState({ status: "new", createdAt: new Date(NOW - 30 * DAY) }, NOW).reason).toBe("idle");
  });
  it("a future follow-up date means handled; a past one is overdue; closed statuses never need it", () => {
    const old = new Date(NOW - 30 * DAY);
    expect(leadFollowUpState({ status: "new", lastActivityAt: old, followUpDate: new Date(NOW + DAY) }, NOW).needs).toBe(false);
    expect(leadFollowUpState({ status: "new", lastActivityAt: old, followUpDate: new Date(NOW - DAY) }, NOW).reason).toBe("overdue");
    expect(leadFollowUpState({ status: "booked", lastActivityAt: old }, NOW).needs).toBe(false);
  });
});

describe("leadNeedsReply", () => {
  it("is true for a new lead nobody has replied to", () => {
    expect(leadNeedsReply({ status: "new", respondedAt: null })).toBe(true);
  });
  it("is false once replied, or once the status has moved on", () => {
    expect(leadNeedsReply({ status: "new", respondedAt: new Date() })).toBe(false);
    expect(leadNeedsReply({ status: "contacted", respondedAt: null })).toBe(false);
  });
  it("ignores partial leads unless asked", () => {
    const partial = { status: "new", respondedAt: null, internalNotes: PARTIAL_LEAD_NOTE };
    expect(leadNeedsReply(partial)).toBe(false);
    expect(leadNeedsReply(partial, { includePartial: true })).toBe(true);
  });
  it("reports how long it has been waiting", () => {
    expect(leadReplyWaitMs({ status: "new", createdAt: new Date(NOW - 3 * 3_600_000) }, NOW)).toBe(3 * 3_600_000);
    expect(leadReplyWaitMs({ status: "contacted", createdAt: new Date(NOW) }, NOW)).toBeNull();
  });
});

describe("automated task rules", () => {
  it("parses the saved shape, maps medium→normal and gives legacy rules a stable key", () => {
    const raw = JSON.stringify([
      { name: "Confirm numbers", trigger: "days_before_event", daysOffset: "3", priority: "medium" },
      { id: "rule-1", name: "Send pack", trigger: "on_enquiry_received", daysOffset: "0", priority: "high" },
      { name: "Bogus", trigger: "nope" },
      { name: "", trigger: "on_enquiry_received" },
    ]);
    const a = parseTaskRules(raw);
    const b = parseTaskRules(raw);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ trigger: "days_before_event", days: 3, priority: "normal" });
    expect(a[0].key).toMatch(/^legacy:/);
    expect(a[0].key).toBe(b[0].key);
    expect(a[1]).toMatchObject({ key: "rule-1", priority: "high", days: 0 });
    expect(parseTaskRules("not json")).toEqual([]);
  });
  it("treats the old on_function_pack_sent key as a status rule", () => {
    const [r] = parseTaskRules([{ name: "Chase pack", trigger: "on_function_pack_sent", daysOffset: "2" }]);
    expect(r).toMatchObject({ trigger: "on_status_change", status: "function_pack_sent", days: 2 });
  });
  it("uses the built-in function-pack task only while the venue has no rule of its own", () => {
    expect(rulesForStatus([], "function_pack_sent")).toEqual([BUILTIN_FUNCTION_PACK_RULE]);
    const own = parseTaskRules([{ id: "x", name: "Mine", trigger: "on_status_change", status: "function_pack_sent" }]);
    expect(rulesForStatus(own, "function_pack_sent").map(r => r.key)).toEqual(["x"]);
    expect(rulesForStatus(own, "negotiating")).toEqual([]);
  });
  it("describes rules in plain language", () => {
    const [r] = parseTaskRules([{ id: "a", name: "x", trigger: "on_status_change", status: "negotiating", daysOffset: "1" }]);
    expect(describeTaskRule(r, () => "Negotiating")).toBe("Moved to Negotiating · due 1 day later");
  });
  it("computes due dates on NZ calendar days at local noon", () => {
    // Late evening in NZ: "tomorrow" is the next NZ day, not the next UTC day.
    const lateNz = Date.UTC(2026, 9, 8, 10, 0, 0); // 11pm NZDT Thu 8 Oct
    expect(ymdInTz(lateNz)).toBe("2026-10-08");
    const due = dueAfterTrigger(lateNz, 1);
    expect(ymdInTz(due)).toBe("2026-10-09");
    expect(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", hour12: false }).format(new Date(due))).toBe("12");
    // A date-only event stored as UTC midnight is that NZ day.
    const event = Date.UTC(2026, 9, 20);
    expect(ymdInTz(dueBeforeEvent(event, 3))).toBe("2026-10-17");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("email signatures", () => {
  it("defaults to the first saved profile", () => {
    const vs = { name: "Bar Franco", emailSignatures: [{ id: "a", label: "Ana" }, { id: "b", label: "Events" }] };
    expect(defaultSignatureId(vs)).toBe("a");
    expect(signatureProfiles(vs)).toHaveLength(2);
  });
  it("falls back to the older single venue signature", () => {
    const vs = { emailSignature: "Kind regards,\nBar Franco", emailSignatures: [] };
    expect(defaultSignatureId(vs)).toBe(LEGACY_SIGNATURE_ID);
    expect(signatureProfiles(vs)[0].signature).toContain("Kind regards");
    expect(defaultSignatureId({ emailSignatures: [] })).toBeNull();
  });
  it("sends under the venue's From name unless the profile sets its own", () => {
    const vs = { name: "Bar Franco", smtpFromName: "Bar Franco Events" };
    expect(effectiveFromName(vs, null)).toBe("Bar Franco Events");
    expect(effectiveFromName(vs, { id: "a", fromName: "  " })).toBe("Bar Franco Events");
    expect(effectiveFromName(vs, { id: "a", fromName: "Ana at Bar Franco" })).toBe("Ana at Bar Franco");
    expect(effectiveFromName({ name: "Bar Franco", smtpFromName: "" }, null)).toBe("Bar Franco");
  });
});

describe("enquiry copy", () => {
  it("promises one business day everywhere", () => {
    expect(ENQUIRY_RESPONSE_PROMISE).toBe("within one business day");
    for (const s of [DEFAULT_AUTO_REPLY_INTRO, DEFAULT_FORM_SUCCESS_MESSAGE, DEFAULT_LEAD_FORM_SUBTITLE]) {
      expect(s).toContain(ENQUIRY_RESPONSE_PROMISE);
      expect(s).not.toMatch(/24 hours/);
    }
  });
});

describe("weekly report recipients", () => {
  it("uses the venue's notification email first, splitting lists", () => {
    expect(reportRecipients("a@venue.nz; b@venue.nz")).toEqual(["a@venue.nz", "b@venue.nz"]);
  });
  it("falls back to REPORT_EMAIL / the default only when none is set", () => {
    const prev = process.env.REPORT_EMAIL;
    process.env.REPORT_EMAIL = "env@venue.nz";
    expect(reportRecipients("")).toEqual(["env@venue.nz"]);
    delete process.env.REPORT_EMAIL;
    expect(reportRecipients(null)).toEqual(["anamaria@barfranco.nz"]);
    if (prev !== undefined) process.env.REPORT_EMAIL = prev;
  });
});
