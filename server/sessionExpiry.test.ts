import { describe, it, expect } from "vitest";
import { meWhileKept, signedOutAction } from "@shared/sessionExpiry";

describe("signedOutAction (the session ends while the app is open)", () => {
  it("keeps a staff page that has typing on it, instead of jumping to sign-in", () => {
    expect(signedOutAction({ typedOnPage: true, publicPage: false })).toBe("keep-page");
  });

  it("still goes to sign-in when nothing was typed", () => {
    expect(signedOutAction({ typedOnPage: false, publicPage: false })).toBe("go-to-sign-in");
  });

  it("leaves client-facing pages as they were", () => {
    expect(signedOutAction({ typedOnPage: true, publicPage: true })).toBe("go-to-sign-in");
  });
});

describe("meWhileKept (a kept page isn't swapped for the sign-in card)", () => {
  const owner = { user: { id: 1, name: "Owner" }, isStaff: false };
  const nobody = { user: null, isStaff: false };

  it("keeps the person while the page is kept and the check says nobody", () => {
    expect(meWhileKept(nobody, owner)).toBe(owner);
    expect(meWhileKept(undefined, owner)).toBe(owner);
  });

  it("uses the fresh answer once someone is signed in again", () => {
    const again = { user: { id: 1, name: "Owner" }, isStaff: false };
    expect(meWhileKept(again, owner)).toBe(again);
  });

  it("changes nothing when no page is being kept", () => {
    expect(meWhileKept(nobody, null)).toBe(nobody);
    expect(meWhileKept(undefined, null)).toBeUndefined();
  });
});
