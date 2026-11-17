import { describe, it, expect } from "vitest";
import { isTypingField, meWhileKept, signedOutAction, signedOutNoticeComesBack, stillHoldsTyping } from "@shared/sessionExpiry";

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

describe("what counts as typing to keep", () => {
  it("counts text boxes, text areas and editable text", () => {
    expect(isTypingField({ tag: "INPUT" })).toBe(true);
    expect(isTypingField({ tag: "INPUT", type: "email" })).toBe(true);
    expect(isTypingField({ tag: "INPUT", type: "date" })).toBe(true);
    expect(isTypingField({ tag: "TEXTAREA" })).toBe(true);
    expect(isTypingField({ tag: "DIV", contentEditable: true })).toBe(true);
  });

  it("doesn't count search boxes, tick boxes or list choices", () => {
    expect(isTypingField({ tag: "INPUT", type: "search" })).toBe(false);
    expect(isTypingField({ tag: "INPUT", role: "searchbox" })).toBe(false);
    expect(isTypingField({ tag: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTypingField({ tag: "INPUT", type: "radio" })).toBe(false);
    expect(isTypingField({ tag: "SELECT" })).toBe(false);
  });

  it("only while the field is still on the page and not emptied again", () => {
    expect(stillHoldsTyping({ onPage: true, value: "Wiremu" })).toBe(true);
    expect(stillHoldsTyping({ onPage: true, value: "" })).toBe(false); // typed, then cleared
    expect(stillHoldsTyping({ onPage: true, value: "   " })).toBe(false);
    expect(stillHoldsTyping({ onPage: false, value: "Wiremu" })).toBe(false); // its dialog has closed
  });
});

describe("signedOutNoticeComesBack (after Dismiss)", () => {
  it("comes back when a save fails, or a screen can't load", () => {
    expect(signedOutNoticeComesBack({ showing: false, backgroundRefresh: false })).toBe(true);
  });

  it("doesn't come back when a screen already showing only fails to refresh in the background", () => {
    expect(signedOutNoticeComesBack({ showing: false, backgroundRefresh: true })).toBe(false);
  });

  it("isn't shown twice", () => {
    expect(signedOutNoticeComesBack({ showing: true, backgroundRefresh: false })).toBe(false);
  });
});
