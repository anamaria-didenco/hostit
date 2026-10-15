import { describe, it, expect } from "vitest";
import { isDepositDue, isNewEnquiry, isOpenEnquiry, formatWait, daysAwayLabel } from "@shared/needsToday";

describe("needs-today rules", () => {
  it("deposit due: confirmed, required and unpaid only (Payments board rule)", () => {
    expect(isDepositDue({ status: "confirmed", depositRequired: true, depositPaid: false })).toBe(true);
    expect(isDepositDue({ status: "confirmed", depositRequired: false, depositPaid: false })).toBe(false);
    expect(isDepositDue({ status: "confirmed", depositRequired: true, depositPaid: true })).toBe(false);
    expect(isDepositDue({ status: "tentative", depositRequired: true, depositPaid: false })).toBe(false);
    expect(isDepositDue({ status: "cancelled", depositRequired: true, depositPaid: false })).toBe(false);
  });

  it("NEW is part of OPEN; won, lost and cancelled are neither", () => {
    expect(isNewEnquiry("new")).toBe(true);
    expect(isOpenEnquiry("new")).toBe(true);
    expect(isOpenEnquiry("proposal_sent")).toBe(true);
    for (const s of ["booked", "confirmed", "finished", "lost", "cancelled"]) expect(isOpenEnquiry(s), s).toBe(false);
    expect(isNewEnquiry("contacted")).toBe(false);
  });

  it("words for waits and distances", () => {
    expect(formatWait(0.2)).toBe("1h");
    expect(formatWait(32)).toBe("32h");
    expect(formatWait(72)).toBe("3d");
    expect(daysAwayLabel(0)).toBe("today");
    expect(daysAwayLabel(1)).toBe("tomorrow");
    expect(daysAwayLabel(5)).toBe("in 5 days");
  });
});
