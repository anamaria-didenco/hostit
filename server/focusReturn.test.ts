import { describe, expect, it } from "vitest";
import { rowToRefocus, shouldReturnFocus, stepAnnouncement, tickAnnouncement } from "@shared/focusReturn";

describe("focus after a dialog closes", () => {
  it("goes back to the opener when focus was lost to the page or is still on the closing dialog", () => {
    expect(shouldReturnFocus({ connected: true }, "body")).toBe(true);
    expect(shouldReturnFocus({ connected: true }, "inside-dialog")).toBe(true);
  });

  it("leaves focus alone when something else took it on purpose", () => {
    // e.g. Confirm booking focuses the "You're booked in" banner, a finder
    // result opens the event drawer.
    expect(shouldReturnFocus({ connected: true }, "elsewhere")).toBe(false);
  });

  it("does nothing when there was no opener, or it has gone (a menu item, a row that left the list)", () => {
    expect(shouldReturnFocus(null, "body")).toBe(false);
    expect(shouldReturnFocus({ connected: false }, "body")).toBe(false);
  });
});

describe("focus after a list row goes away", () => {
  it("lands on the row now in the same place (the next one)", () => {
    expect(rowToRefocus(2, 5)).toBe(2);
    expect(rowToRefocus(0, 3)).toBe(0);
  });

  it("lands on the new last row when the last one went", () => {
    expect(rowToRefocus(4, 4)).toBe(3);
    expect(rowToRefocus(9, 1)).toBe(0);
  });

  it("reports an empty list", () => {
    expect(rowToRefocus(0, 0)).toBe(-1);
  });

  it("treats a bad index as the top of the list", () => {
    expect(rowToRefocus(-1, 3)).toBe(0);
    expect(rowToRefocus(Number.NaN, 3)).toBe(0);
  });
});

describe("what a screen reader hears", () => {
  it("names the checklist item and its new state", () => {
    expect(tickAnnouncement("Turn on coffee machine", true)).toBe("Checked: Turn on coffee machine");
    expect(tickAnnouncement("  Turn on coffee machine ", false)).toBe("Unchecked: Turn on coffee machine");
    expect(tickAnnouncement("", true)).toBe("Checked: item");
  });

  it("says which step of the enquiry form is showing", () => {
    const steps = ["Your Details", "Your Event"];
    expect(stepAnnouncement(1, steps)).toBe("Step 1 of 2: Your Details");
    expect(stepAnnouncement(2, steps)).toBe("Step 2 of 2: Your Event");
    expect(stepAnnouncement(7, steps)).toBe("Step 2 of 2: Your Event");
    expect(stepAnnouncement(0, steps)).toBe("Step 1 of 2: Your Details");
    expect(stepAnnouncement(1, [])).toBe("");
  });
});
