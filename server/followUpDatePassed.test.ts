import { describe, it, expect } from "vitest";
import { leadDatePassed, leadFollowUpState } from "../shared/followUp";
import { enquirySignal } from "../shared/enquirySignal";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 20, 0, 0, 0);

describe("leadDatePassed", () => {
  it("is true for an open enquiry whose date is more than a day gone", () => {
    expect(leadDatePassed({ status: "proposal_sent", eventDate: NOW - 3 * DAY }, NOW)).toBe(true);
  });
  it("is false for an event later today or tomorrow", () => {
    expect(leadDatePassed({ status: "proposal_sent", eventDate: NOW - 6 * 3_600_000 }, NOW)).toBe(false);
    expect(leadDatePassed({ status: "proposal_sent", eventDate: NOW + DAY }, NOW)).toBe(false);
  });
  it("is false for undated and closed enquiries", () => {
    expect(leadDatePassed({ status: "contacted", eventDate: null }, NOW)).toBe(false);
    expect(leadDatePassed({ status: "lost", eventDate: NOW - 30 * DAY }, NOW)).toBe(false);
    expect(leadDatePassed({ status: "confirmed", eventDate: NOW - 30 * DAY }, NOW)).toBe(false);
  });
});

describe("follow-ups skip enquiries whose date has passed", () => {
  it("no longer counts a long-quiet enquiry for a past date", () => {
    const lead = { status: "proposal_sent", eventDate: NOW - 150 * DAY, lastActivityAt: NOW - 160 * DAY };
    expect(leadFollowUpState(lead, NOW).needs).toBe(false);
  });
  it("still counts the same enquiry when its date is ahead", () => {
    const lead = { status: "proposal_sent", eventDate: NOW + 90 * DAY, lastActivityAt: NOW - 30 * DAY };
    expect(leadFollowUpState(lead, NOW)).toEqual({ needs: true, reason: "idle" });
  });
  it("signals 'Date passed' in the list instead of 'Gone quiet'", () => {
    const s = enquirySignal({ status: "proposal_sent", eventDate: NOW - 150 * DAY, lastActivityAt: NOW - 160 * DAY, firstResponseAt: NOW - 170 * DAY } as any, { nowMs: NOW });
    expect(s.text).toBe("Date passed");
    expect(s.group).toBe("progress");
  });
});
