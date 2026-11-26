import { describe, it, expect } from "vitest";
import {
  CLIENT_MIN_TOKEN_AGE_MS, ENQUIRY_REQUEST_TIMEOUT_MS, FINISHED_ENQUIRY_SILENCES_MS, PARTIAL_ALERT_AFTER_MS,
  PARTIAL_PING_CAP_MS, PARTIAL_PING_EVERY_MS, PARTIAL_PING_MIN_GAP_MS, SUBMIT_WAITS_FOR_CAPTURE_MS,
  acceptsPartialPing, isPartialSuperseded, partialAlertDueAt, partialLastSeenAt, type SupersedeCandidate,
} from "@shared/enquiryTiming";
import { NON_ENQUIRY_SOURCES, PARTIAL_LEAD_NOTE, partialAlertDedupeKey } from "@shared/leadConstants";
import { MIN_FORM_FILL_MS } from "./enquiryConversion";
import { NON_ENQUIRY_SOURCES as SPEED_TO_LEAD_SOURCES } from "./speedToLead";
import { FRESH_TOKEN_SAFE_MS, RESUME_LEAD_MS } from "../client/src/lib/enquiryProgress";

const MIN = 60_000;
const t0 = new Date("2026-12-01T07:00:00.000Z");
const at = (min: number) => new Date(t0.getTime() + min * MIN);

describe("the step-2 ping and the Unfinished alert", () => {
  it("counts the alert from step 1 when there was no ping", () => {
    expect(partialLastSeenAt(t0, null)).toEqual(t0);
    expect(partialAlertDueAt(t0, null)).toEqual(at(20));
    expect(partialAlertDueAt(t0, undefined)).toEqual(at(20));
  });

  it("counts it from the last ping", () => {
    expect(partialAlertDueAt(t0, at(25))).toEqual(at(45));
    expect(partialAlertDueAt(t0, at(90))).toEqual(at(110));
  });

  it("never lets a ping hold the alert back past the cap", () => {
    expect(partialAlertDueAt(t0, at(500))).toEqual(at(120 + 20));
    expect(PARTIAL_PING_CAP_MS).toBe(120 * MIN);
  });

  it("ignores a ping stamped before step 1 (a clock or data oddity)", () => {
    expect(partialAlertDueAt(t0, at(-5))).toEqual(at(20));
  });

  it("keeps a ping only within the cap and not too soon after the last", () => {
    expect(acceptsPartialPing(t0, null, at(1))).toBe(true);
    expect(acceptsPartialPing(t0, at(1), at(3))).toBe(false);
    expect(acceptsPartialPing(t0, at(1), at(5))).toBe(true);
    expect(acceptsPartialPing(t0, at(100), at(120))).toBe(true);
    expect(acceptsPartialPing(t0, at(100), at(121))).toBe(false);
    expect(acceptsPartialPing(t0, null, at(121))).toBe(false);
  });

  it("has the form ping less often than the server's gap, and inside the alert's 20 minutes", () => {
    expect(PARTIAL_PING_EVERY_MS).toBeGreaterThan(PARTIAL_PING_MIN_GAP_MS);
    expect(PARTIAL_PING_EVERY_MS).toBeLessThan(PARTIAL_ALERT_AFTER_MS);
    expect(PARTIAL_ALERT_AFTER_MS).toBe(20 * MIN);
    // A ping kept while the resume window is open still counts.
    expect(PARTIAL_PING_CAP_MS).toBeGreaterThan(RESUME_LEAD_MS);
  });
});

describe("form timings", () => {
  it("never sends a token the server would call too fast", () => {
    expect(CLIENT_MIN_TOKEN_AGE_MS).toBeGreaterThan(MIN_FORM_FILL_MS);
    expect(CLIENT_MIN_TOKEN_AGE_MS).toBeLessThanOrEqual(FRESH_TOKEN_SAFE_MS);
  });

  it("waits for step 1's save well inside the request timeout", () => {
    expect(SUBMIT_WAITS_FOR_CAPTURE_MS).toBeLessThan(ENQUIRY_REQUEST_TIMEOUT_MS);
    expect(ENQUIRY_REQUEST_TIMEOUT_MS).toBe(20_000);
  });
});

describe("shared lead constants", () => {
  it("lists the same non-enquiry sources as speed-to-lead", () => {
    expect([...NON_ENQUIRY_SOURCES].sort()).toEqual([...SPEED_TO_LEAD_SOURCES].sort());
  });

  it("names the Unfinished alert the way the alert job always has", () => {
    expect(partialAlertDedupeKey(433)).toBe("partial-enquiry:433");
  });
});

describe("left behind or abandoned", () => {
  const P = { id: 50, email: "Aroha@Example.test ", createdAt: at(0) };
  const lead = (over: Partial<SupersedeCandidate>): SupersedeCandidate => ({
    id: 60, email: "aroha@example.test", source: "lead_form", internalNotes: null, createdAt: at(10), reachedVenue: true, ...over,
  });

  it("is abandoned with nothing else from that email", () => {
    expect(isPartialSuperseded(P, [])).toBe(false);
    expect(isPartialSuperseded(P, [lead({ email: "someone.else@example.test" })])).toBe(false);
  });

  it("is left behind when a newer enquiry exists, finished or not (#308)", () => {
    expect(isPartialSuperseded(P, [lead({})])).toBe(true);
    expect(isPartialSuperseded(P, [lead({ internalNotes: PARTIAL_LEAD_NOTE })])).toBe(true);
    // Same moment: the higher id is the newer one.
    expect(isPartialSuperseded(P, [lead({ createdAt: at(0), id: 51, internalNotes: PARTIAL_LEAD_NOTE })])).toBe(true);
    expect(isPartialSuperseded(P, [lead({ createdAt: at(0), id: 49, internalNotes: PARTIAL_LEAD_NOTE })])).toBe(false);
  });

  it("is left behind when the same person finished an enquiry up to 24 h before it", () => {
    // Sent, then the page reloaded the form and they typed step 1 again.
    expect(isPartialSuperseded(P, [lead({ id: 40, createdAt: at(-1) })])).toBe(true);
    // Two tabs: the other tab's enquiry was started first and finished later.
    expect(isPartialSuperseded(P, [lead({ id: 49, createdAt: at(-0.2) })])).toBe(true);
    expect(isPartialSuperseded(P, [lead({ id: 40, createdAt: new Date(t0.getTime() - FINISHED_ENQUIRY_SILENCES_MS) })])).toBe(true);
  });

  it("still alerts for an older unfinished one, or an old finished one", () => {
    expect(isPartialSuperseded(P, [lead({ id: 40, createdAt: at(-30), internalNotes: PARTIAL_LEAD_NOTE })])).toBe(false);
    expect(isPartialSuperseded(P, [lead({ id: 40, createdAt: new Date(t0.getTime() - FINISHED_ENQUIRY_SILENCES_MS - 1) })])).toBe(false);
  });

  it("only counts enquiries that reached the venue", () => {
    for (const source of NON_ENQUIRY_SOURCES) {
      expect(isPartialSuperseded(P, [lead({ source })]), source).toBe(false);
      expect(isPartialSuperseded(P, [lead({ source, id: 40, createdAt: at(-1) })]), source).toBe(false);
    }
    expect(isPartialSuperseded(P, [lead({ source: null })])).toBe(false);
    // "How did you hear about us" is stored as the source of a finished enquiry.
    expect(isPartialSuperseded(P, [lead({ source: "Instagram" })])).toBe(true);
  });

  it("never counts a lead staff typed or imported, whatever source it was given", () => {
    // Dashboard > Add enquiry keeps the source picked (Phone, Walk-In, Website...), and a
    // CSV import keeps its Source column: neither went through the form.
    for (const source of ["Phone", "Website", "Walk-In", "Email", "Instagram", "lead_form"]) {
      expect(isPartialSuperseded(P, [lead({ source, reachedVenue: false, id: 40, createdAt: at(-180) })]), source).toBe(false);
      expect(isPartialSuperseded(P, [lead({ source, reachedVenue: undefined })]), source).toBe(false);
    }
    // Step 1 saved again on the form is the form's own (only startCapture writes the note).
    expect(isPartialSuperseded(P, [lead({ internalNotes: PARTIAL_LEAD_NOTE, reachedVenue: false })])).toBe(true);
  });

  it("never matches itself or an empty email", () => {
    expect(isPartialSuperseded(P, [lead({ id: 50 })])).toBe(false);
    expect(isPartialSuperseded({ ...P, email: "" }, [lead({ email: "" })])).toBe(false);
  });
});
