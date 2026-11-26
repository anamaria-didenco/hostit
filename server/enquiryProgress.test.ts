import { describe, it, expect } from "vitest";
import {
  FORM_TOKEN_REUSE_MS, FRESH_TOKEN_SAFE_MS, RESUME_LEAD_MS, canReuseLead, enquiryStorageKeys, formTokenToSend, leadForSubmit, leadStillResumable,
  leadToSupersede, parseProgress, pickFormToken, pickTokenToSend, resumeFrom, sentConfirmation, serializeProgress, tokenWaitMs,
  type EnquiryProgress, type HeldLead,
} from "../client/src/lib/enquiryProgress";
import { MIN_FORM_FILL_MS } from "./enquiryConversion";
import { CLIENT_MIN_TOKEN_AGE_MS, SENT_CONFIRMATION_KEEP_MS } from "@shared/enquiryTiming";

/** The website form's progress kept across a reload (client/src/lib/enquiryProgress.ts). */
const saved = (over: Partial<EnquiryProgress> = {}): EnquiryProgress => ({
  slug: "bar-franco", ownerId: 7, step: 2,
  leadId: 433, leadToken: "tok_abcdefghijklmnopqrstuvwxyz0123", leadEmail: "aroha@example.test", leadAt: 1_800_000_060_000,
  formToken: "mfz0q3k0.abcdefghijklmnopqrstuv", formTokenAt: 1_800_000_000_000,
  prefill: { guestCount: "40", eventFormat: "seated" },
  sentLeadId: null, sentLeadToken: null, sentAt: null,
  ...over,
});

describe("enquiry progress storage", () => {
  it("sits beside the draft under the same per-venue key scheme", () => {
    expect(enquiryStorageKeys("bar-franco")).toEqual({ slug: "bar-franco", draft: "vf-lead-draft-bar-franco", progress: "vf-lead-progress-bar-franco" });
    expect(enquiryStorageKeys(undefined)).toEqual({ slug: "default", draft: "vf-lead-draft-default", progress: "vf-lead-progress-default" });
  });

  it("reads back what it wrote", () => {
    const p = saved();
    expect(parseProgress(serializeProgress(p), "bar-franco")).toEqual(p);
  });

  it("never hands one venue's record to another slug", () => {
    expect(parseProgress(serializeProgress(saved()), "other-venue")).toBeNull();
  });

  it("ignores missing, broken or half-written records", () => {
    expect(parseProgress(null, "bar-franco")).toBeNull();
    expect(parseProgress("{not json", "bar-franco")).toBeNull();
    expect(parseProgress(JSON.stringify({ slug: "bar-franco" }), "bar-franco")).toBeNull(); // no ownerId
    const noToken = parseProgress(serializeProgress(saved({ leadToken: null })), "bar-franco")!;
    expect(noToken).toMatchObject({ leadId: null, leadToken: null, leadEmail: null, leadAt: null, step: 2 });
    const fake = parseProgress(serializeProgress(saved({ leadId: 0, leadToken: "" })), "bar-franco")!; // a bot-check "success"
    expect(fake.leadId).toBeNull();
    const odd = parseProgress(JSON.stringify({ ...saved(), step: 7, formTokenAt: "yesterday", leadAt: "earlier" }), "bar-franco")!;
    expect(odd.step).toBe(1);
    expect(odd.formToken).toBeNull();
    expect(odd.leadAt).toBeNull();
  });
});

describe("reusing the step-1 lead", () => {
  const lead = { leadId: 433, leadToken: "tok", leadEmail: "aroha@example.test", leadAt: 1 };
  it("is reused for the same email, whatever the case or spaces", () => {
    expect(canReuseLead(lead, "aroha@example.test")).toBe(true);
    expect(canReuseLead(lead, "  Aroha@Example.TEST ")).toBe(true);
  });
  it("isn't for a changed email: that is someone else's enquiry", () => {
    expect(canReuseLead(lead, "mere@example.test")).toBe(false);
    expect(canReuseLead(lead, "")).toBe(false);
  });
  it("needs a real saved lead", () => {
    expect(canReuseLead({ ...lead, leadId: null }, "aroha@example.test")).toBe(false);
    expect(canReuseLead({ ...lead, leadId: 0 }, "aroha@example.test")).toBe(false);
    expect(canReuseLead({ ...lead, leadToken: null }, "aroha@example.test")).toBe(false);
    expect(canReuseLead(null, "aroha@example.test")).toBe(false);
  });
});

describe("resuming after a reload", () => {
  const leadAt = saved().leadAt!;
  const venue = { ownerId: 7, detailsValid: true, email: "aroha@example.test", nowMs: leadAt + 90_000 };
  const none = { leadId: null, leadToken: null, leadEmail: null, leadAt: null };
  it("comes back on step 2 with the same lead", () => {
    expect(resumeFrom(saved(), venue)).toEqual({ step: 2, leadId: 433, leadToken: saved().leadToken, leadEmail: "aroha@example.test", leadAt });
  });
  it("starts at step 1 with no lead when nothing was saved", () => {
    expect(resumeFrom(null, venue)).toEqual({ step: 1, ...none });
  });
  it("never resumes another venue's lead", () => {
    expect(resumeFrom(saved(), { ...venue, ownerId: 8 })).toEqual({ step: 1, ...none });
  });
  it("only picks the lead up again for a while; after that it's step 1 and a new lead at NEXT", () => {
    expect(resumeFrom(saved(), { ...venue, nowMs: leadAt + RESUME_LEAD_MS })).toMatchObject({ step: 2, leadId: 433 });
    expect(resumeFrom(saved(), { ...venue, nowMs: leadAt + RESUME_LEAD_MS + 1 })).toEqual({ step: 1, ...none });
    expect(resumeFrom(saved(), { ...venue, nowMs: leadAt + 3 * 86_400_000 })).toEqual({ step: 1, ...none }); // three days on
    expect(resumeFrom(saved({ leadAt: null }), venue)).toEqual({ step: 1, ...none }); // no time kept: not resumed
  });
  it("a clock set back a little still resumes; far back doesn't", () => {
    expect(leadStillResumable(leadAt, leadAt - 30_000)).toBe(true);
    expect(leadStillResumable(leadAt, leadAt - 3_600_000)).toBe(false);
    expect(leadStillResumable(null, leadAt)).toBe(false);
  });
  it("keeps step 2 when no lead was saved (nothing to go stale)", () => {
    expect(resumeFrom(saved({ leadId: null, leadToken: null, leadAt: null }), { ...venue, nowMs: leadAt + 3 * 86_400_000 })).toEqual({ step: 2, ...none });
  });
  it("goes back to step 1 when step 1's details aren't all there", () => {
    expect(resumeFrom(saved(), { ...venue, detailsValid: false })).toMatchObject({ step: 1, leadId: 433 });
  });
  it("drops the lead when the draft's email isn't the one it was saved with", () => {
    expect(resumeFrom(saved(), { ...venue, email: "mere@example.test" })).toMatchObject({ step: 2, leadId: null, leadToken: null });
  });
  it("stays on step 1 when that's where they were", () => {
    expect(resumeFrom(saved({ step: 1 }), venue)).toMatchObject({ step: 1, leadId: 433 });
  });
});

describe("the form-opened token across reloads", () => {
  const at = saved().formTokenAt!;
  it("keeps the first token, not the reload's brand-new one", () => {
    expect(pickFormToken(saved(), 7, "fresh.token", at + 60_000)).toEqual({ token: saved().formToken, at });
  });
  it("uses the page's own token when none was kept, or it's another venue's, or it's old", () => {
    expect(pickFormToken(null, 7, "fresh.token", at)).toEqual({ token: "fresh.token", at });
    expect(pickFormToken(saved(), 8, "fresh.token", at + 1000)).toEqual({ token: "fresh.token", at: at + 1000 });
    const later = at + FORM_TOKEN_REUSE_MS + 1;
    expect(pickFormToken(saved(), 7, "fresh.token", later)).toEqual({ token: "fresh.token", at: later });
    expect(pickFormToken(saved(), 7, "fresh.token", at - 5000)).toEqual({ token: "fresh.token", at: at - 5000 }); // clock went back
  });
  it("is null until there's a token at all", () => {
    expect(pickFormToken(null, 7, undefined, at)).toBeNull();
    expect(pickFormToken(saved(), 7, null, at + 1000)!.token).toBe(saved().formToken);
  });
});

describe("which token goes with NEXT and SUBMIT", () => {
  const first = { token: "first.token", at: 1_800_000_000_000 };
  const reloadAt = first.at + 600_000;
  const fresh = { token: "fresh.token", at: reloadAt };
  it("waits comfortably longer than the server's minimum", () => {
    expect(FRESH_TOKEN_SAFE_MS).toBeGreaterThan(MIN_FORM_FILL_MS);
  });
  it("sends the first token in the seconds after a reload, when the page's own would be too fast", () => {
    expect(formTokenToSend(first, fresh, reloadAt + 1000)).toBe("first.token");
    expect(formTokenToSend(first, fresh, reloadAt + FRESH_TOKEN_SAFE_MS - 1)).toBe("first.token");
  });
  it("sends the page's own once it will pass, so a kept token that went bad (a server secret change) can't sink the enquiry", () => {
    expect(formTokenToSend(first, fresh, reloadAt + FRESH_TOKEN_SAFE_MS)).toBe("fresh.token");
    expect(formTokenToSend(first, fresh, reloadAt + 60_000)).toBe("fresh.token");
  });
  it("falls back to whichever there is", () => {
    expect(formTokenToSend(null, fresh, reloadAt + 1000)).toBe("fresh.token");
    expect(formTokenToSend(first, null, reloadAt)).toBe("first.token");
    expect(formTokenToSend(null, null, reloadAt)).toBeUndefined();
  });
});

describe("what else the record keeps", () => {
  it("keeps the prefill values seen last, and nothing that isn't a plain field and short text", () => {
    const raw = JSON.stringify({ ...saved(), prefill: { guestCount: "40", "bad key": "x", eventDate: 7, message: "y".repeat(501), eventFormat: "cocktail" } });
    expect(parseProgress(raw, "bar-franco")!.prefill).toEqual({ guestCount: "40", eventFormat: "cocktail" });
    expect(parseProgress(JSON.stringify({ ...saved(), prefill: ["40"] }), "bar-franco")!.prefill).toBeNull();
    expect(parseProgress(JSON.stringify({ ...saved(), prefill: undefined }), "bar-franco")!.prefill).toBeNull(); // a record from before
  });
  it("keeps the enquiry just sent: its id and token only together, its time on its own", () => {
    const sent = saved({ sentLeadId: 501, sentLeadToken: "tok_sent", sentAt: 1_800_000_900_000 });
    expect(parseProgress(serializeProgress(sent), "bar-franco")).toMatchObject({ sentLeadId: 501, sentLeadToken: "tok_sent", sentAt: 1_800_000_900_000 });
    const noToken = parseProgress(serializeProgress(saved({ sentLeadId: 501, sentAt: 1_800_000_900_000 })), "bar-franco")!;
    expect(noToken).toMatchObject({ sentLeadId: null, sentLeadToken: null, sentAt: 1_800_000_900_000 });
  });
});

describe("Enquiry Received! after a reload", () => {
  const sentAt = 1_800_000_900_000;
  const rec = saved({ step: 1, leadId: null, leadToken: null, leadEmail: null, leadAt: null, sentLeadId: 501, sentLeadToken: "tok_sent", sentAt });
  const at = (ms: number) => ({ ownerId: 7, nowMs: sentAt + ms, keepMs: SENT_CONFIRMATION_KEEP_MS });
  it("shows again for an hour, with what the walkthrough offer needs", () => {
    expect(SENT_CONFIRMATION_KEEP_MS).toBe(60 * 60_000);
    expect(sentConfirmation(rec, at(5 * 60_000))).toEqual({ leadId: 501, leadToken: "tok_sent" });
    expect(sentConfirmation(rec, at(SENT_CONFIRMATION_KEEP_MS))).not.toBeNull();
  });
  it("is gone after that (the next person on a shared device gets a clean form), and never for another venue", () => {
    expect(sentConfirmation(rec, at(SENT_CONFIRMATION_KEEP_MS + 1))).toBeNull();
    expect(sentConfirmation(rec, { ...at(1000), ownerId: 8 })).toBeNull();
    expect(sentConfirmation(saved(), at(1000))).toBeNull(); // nothing sent
  });
  it("still shows for a dropped bot-check 'success' (nothing to offer a walkthrough for)", () => {
    const fake = saved({ sentLeadId: null, sentLeadToken: null, sentAt });
    expect(sentConfirmation(fake, at(1000))).toEqual({ leadId: null, leadToken: null });
  });
});

describe("which lead SUBMIT completes and NEXT updates", () => {
  const own: HeldLead = { leadId: 433, leadToken: "tok", leadEmail: "aroha@example.test", leadAt: 1, fromThisPage: true };
  const restored: HeldLead = { ...own, fromThisPage: false };
  it("the visitor's own step 1 for the same email (the free completion: no wait for the timing token)", () => {
    expect(leadForSubmit(own, " Aroha@Example.test")).toEqual({ leadId: 433, leadToken: "tok", own: true });
    expect(leadForSubmit(restored, "aroha@example.test")).toEqual({ leadId: 433, leadToken: "tok", own: true }); // a reload's resume, as before
  });
  it("for a corrected email, only the lead this page load saved (counted and checked by the server)", () => {
    expect(leadForSubmit(own, "aroha@example.test.nz")).toEqual({ leadId: 433, leadToken: "tok", own: false });
    expect(leadForSubmit(restored, "mere@example.test")).toBeNull(); // maybe another person on a shared device
  });
  it("nothing without a real lead or an email", () => {
    expect(leadForSubmit(null, "aroha@example.test")).toBeNull();
    expect(leadForSubmit({ ...own, leadId: 0 }, "aroha@example.test")).toBeNull();
    expect(leadForSubmit({ ...own, leadToken: null }, "aroha@example.test")).toBeNull();
    expect(leadForSubmit(own, "  ")).toBeNull();
  });
  it("NEXT after BACK and an email fix updates this page's lead; resumed or after START FRESH, it's a new lead", () => {
    expect(leadToSupersede(own, "aroha@gmail.example.test")).toEqual({ leadId: 433, leadToken: "tok" });
    expect(leadToSupersede(own, "AROHA@example.test")).toBeNull(); // same email: nothing to save
    expect(leadToSupersede(restored, "mere@example.test")).toBeNull();
    expect(leadToSupersede({ leadId: null, leadToken: null, leadEmail: null, leadAt: null, fromThisPage: false }, "mere@example.test")).toBeNull();
  });
});

describe("waiting out the timing token", () => {
  const first = { token: "first.token", at: 1_800_000_000_000 };
  it("picks the same token formTokenToSend sends, with when it arrived", () => {
    const fresh = { token: "fresh.token", at: first.at + 600_000 };
    expect(pickTokenToSend(first, fresh, fresh.at + 1000)).toEqual(first);
    expect(pickTokenToSend(first, fresh, fresh.at + FRESH_TOKEN_SAFE_MS)).toEqual(fresh);
    expect(pickTokenToSend(null, null, 0)).toBeNull();
  });
  it("holds a send until the token is old enough for the server, and not otherwise", () => {
    expect(CLIENT_MIN_TOKEN_AGE_MS).toBeGreaterThan(MIN_FORM_FILL_MS);
    expect(tokenWaitMs(first, first.at + 300, CLIENT_MIN_TOKEN_AGE_MS)).toBe(CLIENT_MIN_TOKEN_AGE_MS - 300);
    expect(tokenWaitMs(first, first.at + 1641, CLIENT_MIN_TOKEN_AGE_MS)).toBe(CLIENT_MIN_TOKEN_AGE_MS - 1641);
    expect(tokenWaitMs(first, first.at + CLIENT_MIN_TOKEN_AGE_MS, CLIENT_MIN_TOKEN_AGE_MS)).toBe(0);
    expect(tokenWaitMs(first, first.at + 600_000, CLIENT_MIN_TOKEN_AGE_MS)).toBe(0);
    expect(tokenWaitMs(null, first.at, CLIENT_MIN_TOKEN_AGE_MS)).toBe(0); // no token: the server lets it through
    expect(tokenWaitMs(first, first.at - 10_000, CLIENT_MIN_TOKEN_AGE_MS)).toBe(CLIENT_MIN_TOKEN_AGE_MS); // the clock went back
  });
});
