import { describe, it, expect } from "vitest";
import { planKeyAction } from "../shared/floorPlanKeys";

describe("floor plan keys", () => {
  // The review's bug: the arrows moved the focused item while Delete and R
  // acted on the selected one. Every key now names the selected item.
  it("act on the selected item, the one the properties panel shows", () => {
    expect(planKeyAction({ key: "ArrowRight" }, true, "t1")).toEqual({ kind: "nudge", id: "t1", dx: 1, dy: 0, big: false });
    expect(planKeyAction({ key: "ArrowLeft" }, true, "t1")).toEqual({ kind: "nudge", id: "t1", dx: -1, dy: 0, big: false });
    expect(planKeyAction({ key: "ArrowUp", shift: true }, true, "t1")).toEqual({ kind: "nudge", id: "t1", dx: 0, dy: -1, big: true });
    expect(planKeyAction({ key: "ArrowDown" }, true, "t1")).toEqual({ kind: "nudge", id: "t1", dx: 0, dy: 1, big: false });
    expect(planKeyAction({ key: "Delete" }, true, "t1")).toEqual({ kind: "delete", id: "t1" });
    expect(planKeyAction({ key: "Backspace" }, true, "t1")).toEqual({ kind: "delete", id: "t1" });
    expect(planKeyAction({ key: "r" }, true, "t1")).toEqual({ kind: "rotate", id: "t1" });
    expect(planKeyAction({ key: "R", shift: true }, true, "t1")).toEqual({ kind: "rotate", id: "t1" });
  });

  // After Escape the focused item is no longer selected: the arrows used to
  // keep moving it although the panel showed nothing.
  it("do nothing when nothing is selected", () => {
    for (const key of ["ArrowRight", "Delete", "Backspace", "r"]) expect(planKeyAction({ key }, true, null)).toBeNull();
  });

  // The review's other bug: after a click on a table, focus stayed on
  // "Zoom in", yet R rotated and Delete deleted the table.
  it("never fire while focus is on a button or other control", () => {
    for (const key of ["ArrowRight", "ArrowDown", "Delete", "Backspace", "r", "R"]) {
      expect(planKeyAction({ key }, false, "t1")).toBeNull();
    }
  });

  it("leave Ctrl/Cmd/Alt+R and other keys alone", () => {
    expect(planKeyAction({ key: "r", modifier: true }, true, "t1")).toBeNull();
    for (const key of ["Enter", " ", "Tab", "Escape", "d", "x"]) expect(planKeyAction({ key }, true, "t1")).toBeNull();
  });
});
