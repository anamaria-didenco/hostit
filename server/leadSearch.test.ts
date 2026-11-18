import { describe, it, expect } from "vitest";
import { leadMatchesSearch } from "@shared/leadSearch";

// The Enquiries search box. Invented clients, @example.test addresses.
const jane = {
  firstName: "Jane", lastName: "Smith", email: "jane.smith@example.test",
  phone: "(021) 555 0147", company: "Harbour Wines", eventType: "Christmas party", spaceName: "Courtyard",
};

describe("leadMatchesSearch", () => {
  it("finds a name typed in either order", () => {
    expect(leadMatchesSearch(jane, "jane smith")).toBe(true);
    expect(leadMatchesSearch(jane, "smith jane")).toBe(true);
    expect(leadMatchesSearch(jane, "  SMITH  ")).toBe(true);
  });

  it("matches a phone number typed with or without punctuation", () => {
    expect(leadMatchesSearch(jane, "021 555")).toBe(true);
    expect(leadMatchesSearch(jane, "021-555")).toBe(true);
    expect(leadMatchesSearch(jane, "0215550147")).toBe(true);
  });

  it("does not match fewer than 3 digits against the phone", () => {
    // "21" is in this phone's digits (0 2 1 5 5 5) but not its text: two
    // digits would match far too much. Three do.
    const pat = { firstName: "Pat", phone: "02-1555" };
    expect(leadMatchesSearch(pat, "21")).toBe(false);
    expect(leadMatchesSearch(pat, "021")).toBe(true);
  });

  it("matches the event type and the space", () => {
    expect(leadMatchesSearch(jane, "christmas")).toBe(true);
    expect(leadMatchesSearch(jane, "courtyard")).toBe(true);
    expect(leadMatchesSearch(jane, "harbour")).toBe(true);
  });

  it("matches everything when nothing is typed", () => {
    expect(leadMatchesSearch(jane, "")).toBe(true);
    expect(leadMatchesSearch(jane, "   ")).toBe(true);
    expect(leadMatchesSearch({}, "")).toBe(true);
  });

  it("fails when one word matches nothing, even if the others match", () => {
    expect(leadMatchesSearch(jane, "jane wedding")).toBe(false);
    expect(leadMatchesSearch({}, "jane")).toBe(false);
  });
});
