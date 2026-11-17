import { describe, it, expect } from "vitest";
import { signedOutAction } from "@shared/sessionExpiry";

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
