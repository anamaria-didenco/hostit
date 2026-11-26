import { describe, it, expect } from "vitest";
import { calSignal, CAL_TONE } from "../client/src/components/CalendarParts";
import { statusPalette } from "../shared/statusPalette";
import { COLOR_PRESETS } from "../client/src/components/StatusManager";

// The Calendar's one signal per event (client/src/components/CalendarParts.tsx):
// the venue's own status colour, worked out exactly as the Enquiries status
// pills and Board headings are (shared/statusPalette.ts), so a status looks the
// same on both screens and Settings > Statuses reaches the calendar. Red is
// kept for a double-booking or an overdue follow-up. Invented data only.

const swatch = (id: string) => COLOR_PRESETS.find(c => c.id === id)!.swatch;

describe("calSignal", () => {
  it("uses the status pill's colours for every status and preset", () => {
    for (const preset of COLOR_PRESETS) {
      for (const status of ["new", "contacted", "proposal_sent", "negotiating", "tentative", "booked", "finished"]) {
        const sig = calSignal({ status, firstName: "Kiri" }, { isLead: status !== "booked", statusLabel: "Any", statusColour: preset.swatch });
        const pal = statusPalette(preset.swatch);
        expect({ mark: sig.mark, ink: sig.ink, red: sig.red }, `${preset.id} ${status}`).toEqual({ mark: pal.outline, ink: pal.ink, red: false });
      }
    }
  });

  it("is red for a double-booked event and an overdue follow-up, with words", () => {
    const clash = calSignal({ status: "confirmed", clashFlaggedAt: new Date() }, { isLead: false, statusLabel: "Confirmed", statusColour: swatch("forest") });
    expect(clash).toMatchObject({ red: true, mark: CAL_TONE.red.fg, label: "Double-booked" });
    const overdue = calSignal({ status: "proposal_sent" }, { isLead: true, overdue: true, statusLabel: "Proposal sent", statusColour: swatch("amber") });
    expect(overdue).toMatchObject({ red: true, label: "Follow-up overdue" });
    // A cancelled event is never red: it is drawn quietly instead.
    const cancelled = calSignal({ status: "cancelled", clashFlaggedAt: new Date() }, { isLead: false, statusLabel: "Cancelled", statusColour: swatch("forest") });
    expect(cancelled).toMatchObject({ red: false, muted: true });
  });

  it("marks a held date (it gets a dashed chip) and names it", () => {
    const held = calSignal({ status: "tentative", holdUntil: new Date(Date.now() + 86_400_000) }, { isLead: true, statusLabel: "On hold", statusColour: swatch("amber") });
    expect(held).toMatchObject({ held: true, label: "On hold", red: false, status: "tentative" });
    const lapsed = calSignal({ status: "tentative", holdUntil: new Date(Date.now() - 86_400_000) }, { isLead: true, statusLabel: "On hold", statusColour: swatch("amber") });
    expect(lapsed.held).toBe(false);
  });

  it("keeps the status words as the label", () => {
    expect(calSignal({ status: "contacted" }, { isLead: true, statusLabel: "Contacted", statusColour: swatch("sky") }).label).toBe("Contacted");
  });
});
