import { describe, it, expect } from "vitest";
import nodemailer from "nodemailer";
import { holdUntilFromYmd, ymdInDays, statusAfterRelease, buildHoldEmail, statusLabel } from "./holds";
import { escapeHtml } from "./sanitizeHtml";

describe("hold dates", () => {
  it("a hold 'until Sat 17 Oct' ends at the last second of that NZ day", () => {
    expect(holdUntilFromYmd("2026-10-17").toISOString()).toBe("2026-10-17T10:59:59.000Z");
  });
  it("counts default hold days in NZ calendar days, across the April DST change", () => {
    // 11pm NZDT Thu 2 April (= 10:00Z) + 7 days → Thu 9 April, not the 8th or 10th.
    expect(ymdInDays(new Date("2026-04-02T10:00:00Z"), 7)).toBe("2026-04-09");
    // Late evening UTC is already tomorrow in NZ.
    expect(ymdInDays(new Date("2026-10-08T12:30:00Z"), 1)).toBe("2026-10-10");
  });
});

describe("statusAfterRelease", () => {
  it("goes back to the status it had before the hold", () => {
    expect(statusAfterRelease("proposal_sent")).toBe("proposal_sent");
    expect(statusAfterRelease("negotiating")).toBe("negotiating");
  });
  it("falls back to contacted for new, missing or nonsense values", () => {
    expect(statusAfterRelease(null)).toBe("contacted");
    expect(statusAfterRelease("new")).toBe("contacted");
    expect(statusAfterRelease("tentative")).toBe("contacted");
    expect(statusAfterRelease("booked")).toBe("contacted");
  });
  it("uses the venue's own status labels", () => {
    expect(statusLabel("proposal_sent")).toBe("Proposal Sent");
    expect(statusLabel("proposal_sent", JSON.stringify([{ key: "proposal_sent", label: "Quoted" }]))).toBe("Quoted");
  });
});

describe("hold emails", () => {
  const input = {
    firstName: "Jane <b>",
    venueName: "Bar Franco",
    accent: "#2D4A3E",
    eventDate: new Date("2026-10-24T06:00:00Z"),
    spaceName: "Main Bar, Terrace",
    eventType: "Wedding",
    holdUntil: holdUntilFromYmd("2026-10-17"),
  };

  it("says the date is held until X, in NZ dates", () => {
    const e = buildHoldEmail("placed", input, escapeHtml);
    expect(e.subject).toBe("We're holding Saturday 24 October for you — Bar Franco");
    expect(e.text).toContain("We've put a hold on Saturday 24 October in the Main Bar and Terrace for your wedding.");
    expect(e.text).toContain("until Saturday 17 October");
    expect(e.html).toContain("Jane &lt;b&gt;");
    expect(e.html).not.toContain("<b>,");
  });

  it("builds the day-before reminder", () => {
    const e = buildHoldEmail("reminder", input, escapeHtml);
    expect(e.subject).toBe("Your hold on Saturday 24 October ends tomorrow — Bar Franco");
    expect(e.text).toContain("until tomorrow, Saturday 17 October");
    const today = buildHoldEmail("reminder", { ...input, ends: "today" }, escapeHtml);
    expect(today.subject).toBe("Your hold on Saturday 24 October ends today — Bar Franco");
    expect(today.text).toContain("until the end of today, Saturday 17 October");
  });

  it("renders through nodemailer", async () => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const e = buildHoldEmail("placed", input, escapeHtml);
    const info: any = await t.sendMail({ from: "venue@example.com", to: "jane@example.com", ...e });
    const msg = JSON.parse(info.message);
    expect(msg.subject).toBe(e.subject);
    expect(msg.html).toContain("Your date is on hold");
  });
});
