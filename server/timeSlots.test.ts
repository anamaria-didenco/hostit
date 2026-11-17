import { describe, expect, it } from "vitest";
import { halfHourSlots, initialSlotIndex, matchSlot, moveSlot } from "../shared/timeSlots";

const slots = halfHourSlots();
const at = (hhmm: string) => slots.indexOf(hhmm);

describe("enquiry form time list", () => {
  it("has 48 half-hour slots from midnight", () => {
    expect(slots).toHaveLength(48);
    expect(slots[0]).toBe("00:00");
    expect(slots[47]).toBe("23:30");
  });

  it("opens on 6:00 pm when nothing is chosen (not midnight)", () => {
    expect(initialSlotIndex(slots, "")).toBe(at("18:00"));
    expect(initialSlotIndex(slots, null)).toBe(at("18:00"));
  });

  it("opens on the chosen time, or the next slot for an exact time", () => {
    expect(initialSlotIndex(slots, "11:30")).toBe(at("11:30"));
    expect(initialSlotIndex(slots, "19:15")).toBe(at("19:30"));
    expect(initialSlotIndex(slots, "23:45")).toBe(at("23:30"));
  });

  it("jumps to a typed time, evening first from the default slot", () => {
    const from = at("18:00");
    expect(matchSlot(slots, "7", from)).toBe(at("19:00"));
    expect(matchSlot(slots, "7a", from)).toBe(at("07:00"));
    expect(matchSlot(slots, "7p", from)).toBe(at("19:00"));
    expect(matchSlot(slots, "730", from)).toBe(at("19:30"));
    expect(matchSlot(slots, "7:30 PM", from)).toBe(at("19:30"));
    expect(matchSlot(slots, "19:30", 0)).toBe(at("19:30"));
    expect(matchSlot(slots, "12p", from)).toBe(at("12:00"));
  });

  it("matches the times shown before 24-hour ones", () => {
    // A lone "1" from 6:30 pm is the next label starting with 1, not 18:30.
    expect(matchSlot(slots, "1", at("18:30"))).toBe(at("22:00"));
    expect(matchSlot(slots, "1p", at("18:30"))).toBe(at("13:00"));
    // Nothing shown starts with "19" or "18", so those are 24-hour times.
    expect(matchSlot(slots, "19", at("18:30"))).toBe(at("19:00"));
    expect(matchSlot(slots, "1830", 0)).toBe(at("18:30"));
    expect(matchSlot(slots, "0730", at("18:00"))).toBe(at("07:30"));
  });

  it("returns -1 for nothing typed or no match", () => {
    expect(matchSlot(slots, "", 0)).toBe(-1);
    expect(matchSlot(slots, "x", 0)).toBe(-1);
    expect(matchSlot(slots, "25", 0)).toBe(-1);
  });

  it("moves with the arrow, page and Home/End keys, staying in the list", () => {
    expect(moveSlot(36, "ArrowDown", 48)).toBe(37);
    expect(moveSlot(36, "ArrowUp", 48)).toBe(35);
    expect(moveSlot(47, "ArrowDown", 48)).toBe(47);
    expect(moveSlot(0, "ArrowUp", 48)).toBe(0);
    expect(moveSlot(36, "PageDown", 48)).toBe(40);
    expect(moveSlot(2, "PageUp", 48)).toBe(0);
    expect(moveSlot(20, "Home", 48)).toBe(0);
    expect(moveSlot(20, "End", 48)).toBe(47);
    expect(moveSlot(20, "a", 48)).toBeNull();
  });
});
