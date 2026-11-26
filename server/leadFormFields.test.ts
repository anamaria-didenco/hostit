import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  autoReplyNote, autoReplyState, buildEnquiryMessage, eventDateForWire, guestCountError, guestCountNote, guestCountToConfirm, guestCountValue, wallTimeLabel,
} from "../client/src/lib/enquiryFields";
import { ENQUIRY_LIMITS } from "@shared/enquiryRules";

/** How the website form reads and sends answers (client/src/lib/enquiryFields.ts). */

describe("guest count as people type it", () => {
  it("takes a range, a plus or words, and sends the top number", () => {
    expect(guestCountValue("30-40")).toBe(40);
    expect(guestCountValue("30 to 40")).toBe(40);
    expect(guestCountValue("50+")).toBe(50);
    expect(guestCountValue("approx 40")).toBe(40);
    expect(guestCountValue("40 people")).toBe(40);
    expect(guestCountValue("1,200")).toBe(1200);
    expect(guestCountValue("40")).toBe(40);
  });
  it("says what it will send when the answer wasn't one plain number", () => {
    expect(guestCountNote("30-40")).toBe("We'll note this as 40 guests.");
    expect(guestCountNote("~1")).toBe("We'll note this as 1 guest.");
    expect(guestCountNote("40")).toBeNull();
    expect(guestCountNote("")).toBeNull();
  });
  it("still refuses nothing, 0, negatives and too many, each in plain words", () => {
    expect(guestCountError("", true)).toBe("Please tell us how many guests you're expecting.");
    expect(guestCountError("", false)).toBeNull();
    expect(guestCountError("lots", true)).toBe("Please enter one number, e.g. 40.");
    expect(guestCountError("lots", false)).toBe("Please enter one number, e.g. 40."); // typed, even if optional
    expect(guestCountError("0", true)).toBe("Enter 1 or more guests.");
    expect(guestCountError("-5", true)).toBe("Enter 1 or more guests.");
    expect(guestCountError("120150", true)).toBe("That number looks too big. Please check it.");
    expect(guestCountError("30-40", true)).toBeNull();
    expect(guestCountValue("0")).toBeNull();
  });
  it("asks 'Did you mean …?' above 2000 (Safari merged '30-40' into 3040)", () => {
    expect(guestCountToConfirm("3040")).toBe(3040);
    expect(guestCountToConfirm("2000")).toBeNull();
    expect(guestCountToConfirm("30-40")).toBeNull();
  });
});

describe("the event's date and time on the wire", () => {
  it("sends the venue's wall clock: the day and the time as picked, whatever this device's zone", () => {
    expect(eventDateForWire({ eventDate: "2026-12-12", eventTime: "19:00", noDateYet: false })).toEqual({ eventDate: "2026-12-12", eventTime: "19:00", timeLine: null });
    expect(eventDateForWire({ eventDate: "2026-12-12", eventTime: "", noDateYet: false })).toEqual({ eventDate: "2026-12-12", timeLine: null });
  });
  it("never sends an impossible date (it used to throw inside SUBMIT)", () => {
    expect(eventDateForWire({ eventDate: "2026-13-01", eventTime: "19:00", noDateYet: false })).toEqual({ timeLine: "Preferred time: 7:00 pm" });
    expect(eventDateForWire({ eventDate: "2026-02-30", eventTime: "", noDateYet: false })).toEqual({ timeLine: null });
  });
  it("keeps a time picked without a date, in the message", () => {
    expect(eventDateForWire({ eventDate: "", eventTime: "19:30", noDateYet: false })).toEqual({ timeLine: "Preferred time: 7:30 pm" });
    expect(eventDateForWire({ eventDate: "2026-12-12", eventTime: "12:00", noDateYet: true })).toEqual({ timeLine: "Preferred time: 12:00 pm" });
    expect(eventDateForWire({ eventDate: "", eventTime: "7pm", noDateYet: false })).toEqual({ timeLine: null });
  });
  it("writes times the way the venue reads them", () => {
    expect(wallTimeLabel("00:15")).toBe("12:15 am");
    expect(wallTimeLabel("12:00")).toBe("12:00 pm");
    expect(wallTimeLabel("23:45")).toBe("11:45 pm");
  });
});

describe("the message sent", () => {
  it("is what was typed, then the venue's questions, then the lines the form adds", () => {
    expect(buildEnquiryMessage({
      message: " Arrival drinks at 6. ",
      custom: [["Dietaries", "two vegan"], ["Parking", "  "]],
      guestCount: "30-40",
      timeLine: "Preferred time: 7:30 pm",
    })).toBe("Arrival drinks at 6.\n\nDietaries: two vegan\n\nGuests (as typed): 30-40\n\nPreferred time: 7:30 pm");
  });
  it("is nothing when there's nothing to say", () => {
    expect(buildEnquiryMessage({ message: "", custom: [], guestCount: "40", timeLine: null })).toBeUndefined();
  });
  it("stays under the server's limit for the whole message", () => {
    const long = buildEnquiryMessage({ message: "x".repeat(ENQUIRY_LIMITS.message), custom: Array.from({ length: 12 }, (_, i) => [`Q${i}`, "y".repeat(500)] as [string, string]) })!;
    expect(long.length).toBe(ENQUIRY_LIMITS.messageTotal);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("the note about the visitor's copy", () => {
  it("only says it went when it went, and that it's on its way when it is", () => {
    expect(autoReplyNote(autoReplyState({ autoReply: "sent", autoReplySent: true }))).toBe("We've emailed you a copy — check your inbox (and junk folder).");
    expect(autoReplyNote(autoReplyState({ autoReply: "sending", autoReplySent: false }))).toBe("We're emailing you a copy now. If it isn't in your inbox in a few minutes, check your junk folder.");
    expect(autoReplyNote(autoReplyState({ autoReply: "none", autoReplySent: false }))).toBeNull();
  });
  it("reads an older server's autoReplySent", () => {
    expect(autoReplyState({ id: 7, autoReplySent: true })).toBe("sent");
    expect(autoReplyState({ id: 7, autoReplySent: false })).toBe("none");
    expect(autoReplyState({ id: 0, leadToken: "" })).toBe("none"); // the bot-check answer
    expect(autoReplyState(null)).toBe("none");
  });
});

describe("the hidden anti-spam field", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../client/src/pages/LeadForm.tsx"), "utf8");
  const input = src.slice(src.indexOf("function renderHoneypot()"), src.indexOf("function renderTurnstile()"));
  it("has a name autofill and password managers won't take for a real field, and asks them to skip it", () => {
    const name = /name="([^"]+)"/.exec(input)?.[1] ?? "";
    expect(name).toBeTruthy();
    for (const word of ["url", "website", "email", "name", "phone", "confirm", "code"]) expect(name.toLowerCase()).not.toContain(word);
    for (const attr of ['autoComplete="off"', "data-1p-ignore", 'data-lpignore="true"', "data-bwignore", 'data-form-type="other"', "tabIndex={-1}", 'aria-hidden="true"']) expect(input).toContain(attr);
  });
  it("still goes to the server as hp, so bots are still dropped", () => {
    expect(src).toContain("hp: honeypot || undefined");
  });
});
