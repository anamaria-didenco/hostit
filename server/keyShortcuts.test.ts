import { describe, it, expect } from "vitest";
import {
  isOwnKeysTarget,
  shouldRunSingleKeyShortcut,
  shortcutsEnabledFromStored,
} from "../shared/keyShortcuts";

const base = { modifier: false, defaultPrevented: false, overlayOpen: false, enabled: true };
const run = (over: Partial<Parameters<typeof shouldRunSingleKeyShortcut>[0]>) =>
  shouldRunSingleKeyShortcut({ target: { tagName: "BODY" }, ...base, ...over });

describe("single-key calendar shortcuts", () => {
  it("run when focus is on the page itself", () => {
    expect(run({ target: { tagName: "BODY" } })).toBe(true);
    expect(run({ target: null })).toBe(true);
    // <main tabindex=-1> after the skip link, or a plain focusable region
    expect(run({ target: { tagName: "MAIN" } })).toBe(true);
    expect(run({ target: { tagName: "DIV", role: null } })).toBe(true);
  });

  it("don't run from form fields (the old guard already skipped these)", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT", "input"]) expect(run({ target: { tagName } })).toBe(false);
    expect(run({ target: { tagName: "DIV", editable: true } })).toBe(false);
  });

  // The audit's bug: with focus on the TODAY button, "w" switched to Week view.
  it("don't run from buttons and links", () => {
    expect(run({ target: { tagName: "BUTTON" } })).toBe(false);
    expect(run({ target: { tagName: "A" } })).toBe(false);
    expect(run({ target: { tagName: "SUMMARY" } })).toBe(false);
  });

  it("don't run from custom widgets that handle their own keys", () => {
    for (const role of ["button", "link", "tab", "menuitem", "option", "gridcell", "grid", "slider", "combobox", "radio", "switch", "checkbox"]) {
      expect(run({ target: { tagName: "DIV", role } })).toBe(false);
    }
    expect(run({ target: { tagName: "DIV", role: " Button " } })).toBe(false);
    // a non-interactive role is still the page
    expect(run({ target: { tagName: "DIV", role: "region" } })).toBe(true);
  });

  // The audit's other bug: typing in the quick-create, Print week and
  // "Add a title" pop-ups changed the calendar behind them.
  it("don't run while a dialog, drawer or pop-up is open", () => {
    expect(run({ overlayOpen: true })).toBe(false);
  });

  it("don't run with Ctrl/Cmd/Alt, or when another handler took the key", () => {
    expect(run({ modifier: true })).toBe(false);
    expect(run({ defaultPrevented: true })).toBe(false);
  });

  it("can be turned off", () => {
    expect(run({ enabled: false })).toBe(false);
  });
});

describe("isOwnKeysTarget", () => {
  it("is false for nothing", () => {
    expect(isOwnKeysTarget(null)).toBe(false);
    expect(isOwnKeysTarget(undefined)).toBe(false);
    expect(isOwnKeysTarget({})).toBe(false);
  });
});

describe("shortcuts on/off choice", () => {
  it("is on by default and off only when this browser stored off", () => {
    expect(shortcutsEnabledFromStored(null)).toBe(true);
    expect(shortcutsEnabledFromStored(undefined)).toBe(true);
    expect(shortcutsEnabledFromStored("on")).toBe(true);
    expect(shortcutsEnabledFromStored("off")).toBe(false);
  });
});
