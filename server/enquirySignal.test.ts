import { describe, it, expect } from "vitest";
import { formatWait, enquirySignal, enquiryAction } from "../shared/enquirySignal";

const NOW = Date.UTC(2026, 9, 18, 16, 20); // Sun 18 Oct 2026, 4:20pm
const ago = (ms: number) => new Date(NOW - ms);
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("formatWait", () => {
  it("shows two units at most, largest first", () => {
    expect(formatWait(2 * DAY + 1 * HOUR)).toBe("2d 1h");
    expect(formatWait(4 * HOUR + 49 * 60_000)).toBe("4h 49m");
    expect(formatWait(40 * 60_000)).toBe("40m");
    expect(formatWait(2 * DAY)).toBe("2d"); // no trailing 0h
    expect(formatWait(5 * HOUR)).toBe("5h");
    expect(formatWait(30_000)).toBe("just now");
  });
});

describe("enquirySignal", () => {
  it("new, unanswered → needs reply, waiting time, longest-wait sorts higher", () => {
    const fresh = enquirySignal({ status: "new", createdAt: ago(2 * HOUR + 8 * 60_000) }, { nowMs: NOW });
    const old = enquirySignal({ status: "new", createdAt: ago(2 * DAY + HOUR) }, { nowMs: NOW });
    expect(fresh.group).toBe("reply");
    expect(fresh.text).toBe("Waiting 2h 8m");
    expect(fresh.tone).toBe("amber"); // under a day
    expect(old.text).toBe("Waiting 2d 1h");
    expect(old.tone).toBe("red"); // over a day
    expect(old.sortKey).toBeGreaterThan(fresh.sortKey); // longest wait first
  });

  it("client replied and it's unanswered → reply group with 'Replied Xago'", () => {
    const s = enquirySignal(
      { status: "contacted", respondedAt: ago(3 * DAY) },
      { nowMs: NOW, clientRepliedAtMs: NOW - 40 * 60_000 },
    );
    expect(s.group).toBe("reply");
    expect(s.text).toBe("Replied 40m ago");
    expect(s.tone).toBe("blue");
  });

  it("overdue follow-up → followup group, red when days overdue", () => {
    const s = enquirySignal(
      { status: "proposal_sent", respondedAt: ago(10 * DAY), followUpDate: ago(3 * DAY) },
      { nowMs: NOW },
    );
    expect(s.group).toBe("followup");
    expect(s.text).toBe("Follow-up overdue · 3d");
    expect(s.tone).toBe("red");
  });

  it("gone quiet (idle, no follow-up date) → amber hourglass", () => {
    const s = enquirySignal(
      { status: "contacted", respondedAt: ago(9 * DAY), lastActivityAt: ago(9 * DAY) },
      { nowMs: NOW },
    );
    expect(s.group).toBe("followup");
    expect(s.text).toBe("Gone quiet · 9d");
    expect(s.tone).toBe("amber");
  });

  it("partial enquiry → gray, didn't finish the form", () => {
    const s = enquirySignal({ status: "new" }, { nowMs: NOW, partial: true });
    expect(s.group).toBe("progress");
    expect(s.text).toBe("Didn't finish the form");
    expect(s.tone).toBe("gray");
  });

  it("booked → confirmed group, soonest event sorts higher", () => {
    const soon = enquirySignal({ status: "booked" }, { nowMs: NOW, eventDateMs: NOW + 5 * DAY });
    const later = enquirySignal({ status: "booked" }, { nowMs: NOW, eventDateMs: NOW + 40 * DAY });
    expect(soon.group).toBe("confirmed");
    expect(soon.sortKey).toBeGreaterThan(later.sortKey);
  });

  it("tentative hold → amber with days left", () => {
    const s = enquirySignal({ status: "tentative" }, { nowMs: NOW, holdUntilMs: NOW + 5 * DAY });
    expect(s.text).toBe("Hold ends · 5d");
    expect(s.tone).toBe("amber");
  });

  it("lost/finished → closed group", () => {
    expect(enquirySignal({ status: "lost" }, { nowMs: NOW }).group).toBe("closed");
    expect(enquirySignal({ status: "finished" }, { nowMs: NOW }).group).toBe("closed");
  });
});

describe("enquiryAction", () => {
  it("reply → Reply (inline), followup → Nudge (inline), else Open", () => {
    expect(enquiryAction("reply")).toMatchObject({ label: "Reply", reply: true, primary: true });
    expect(enquiryAction("followup")).toMatchObject({ label: "Nudge", reply: true, primary: true });
    expect(enquiryAction("confirmed")).toMatchObject({ label: "Open", reply: false, primary: false });
    expect(enquiryAction("progress")).toMatchObject({ label: "Open", reply: false });
  });
});
