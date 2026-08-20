import { describe, it, expect } from "vitest";
import { assertEditable, isGoneFromXero } from "./xero";

/**
 * The reported problem: a DRINKS invoice showing DELETED sat in "Already sent
 * for this event" labelled "locked", with no way to remove it — and, because
 * the duplicate guard ignored only VOIDED, it also blocked sending a
 * replacement drinks invoice. The event could not be invoiced at all.
 *
 * "Locked" must mean one thing only: approved or paid, where changing the
 * invoice would move the GST return.
 */

describe("what VenueFlow may still do to a Xero invoice", () => {
  it("treats deleted and voided as gone, not locked", () => {
    expect(isGoneFromXero("DELETED")).toBe(true);
    expect(isGoneFromXero("VOIDED")).toBe(true);
  });

  it("does not treat a live invoice as gone", () => {
    for (const s of ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", null]) {
      expect(isGoneFromXero(s)).toBe(false);
    }
  });

  it("still refuses to change an approved or paid invoice", () => {
    expect(() => assertEditable("AUTHORISED", "delete")).toThrow(/GST return/i);
    expect(() => assertEditable("PAID", "update")).toThrow(/GST return/i);
  });

  it("still allows drafts through", () => {
    expect(() => assertEditable("DRAFT", "update")).not.toThrow();
    expect(() => assertEditable("SUBMITTED", "delete")).not.toThrow();
    expect(() => assertEditable(null, "delete")).not.toThrow();
  });

  it("says plainly that an already-deleted invoice is already deleted", () => {
    expect(() => assertEditable("DELETED", "delete")).toThrow(/already deleted/i);
  });
});
