import { describe, expect, it } from "vitest";
import { beoFileName } from "./beoPdf";
import { zonedWallTimeToDate } from "@shared/eventDate";

describe("beoFileName", () => {
  it("starts with the event date so a week of BEOs sorts in order", () => {
    // 6:30 pm in Auckland, whatever time zone the server runs in.
    const d = zonedWallTimeToDate(2026, 10, 24, 18, 30, "Pacific/Auckland");
    expect(beoFileName({ eventDate: d, eventType: "Engagement", clientName: "Kylie Jackson", kind: "Event Order" }))
      .toBe("2026-10-24 Engagement - Kylie Jackson - Event Order.pdf");
  });

  it("names the client copy", () => {
    // Date only (no time chosen).
    const d = new Date("2026-10-24T00:00:00Z");
    expect(beoFileName({ eventDate: d, eventType: "Wedding", clientName: "Ana Smith", kind: "Client Copy" }))
      .toBe("2026-10-24 Wedding - Ana Smith - Client Copy.pdf");
  });

  it("strips characters a file name can't hold and skips missing parts", () => {
    expect(beoFileName({ eventDate: null, eventType: "", clientName: 'Sam "Jo" / Lee', kind: "Event Order" }))
      .toBe("Sam Jo Lee - Event Order.pdf");
  });
});
