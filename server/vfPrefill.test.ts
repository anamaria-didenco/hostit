import { describe, it, expect } from "vitest";
import {
  NO_DATE_KEY, applyPrefill, draftHasOwnAnswers, matchEventType, normalisePrefill, prefillFromUrl, rememberPrefill, vfPrefillFrom,
} from "../client/src/lib/enquiryPrefill";

/** The website form's prefill rule (client/src/lib/enquiryPrefill.ts), for reloads and vf-prefill messages. */
const TYPES = ["Wedding Reception", "Corporate Dinner", "Birthday Celebration", "Christmas Party", "Other"];
const url = (q: string) => prefillFromUrl(new URLSearchParams(q), TYPES);

describe("reading prefill from the form's URL", () => {
  it("reads the venue page's finder state", () => {
    expect(url("prefillDate=2026-12-04&prefillGuests=40&prefillFormat=seated")).toEqual({ eventDate: "2026-12-04", guestCount: "40", eventFormat: "seated" });
  });
  it("understands 'standing' (the venue page's word) as Cocktail / standing", () => {
    expect(url("prefillFormat=standing").eventFormat).toBe("cocktail");
    expect(url("prefillFormat=Standing%20%26%20canap%C3%A9s").eventFormat).toBe("cocktail");
    expect(url("prefillFormat=both").eventFormat).toBe("both");
  });
  it("never guesses: an unknown format, an impossible date or a guest count with no number is no prefill", () => {
    expect(url("prefillFormat=banquet&prefillDate=2026-13-01&prefillGuests=lots")).toEqual({});
    expect(url("prefillDate=2026-02-30")).toEqual({});
    expect(url("prefillGuests=0")).toEqual({});
  });
  it("reads a guest count the way people type one", () => {
    expect(url("prefillGuests=30-40").guestCount).toBe("30-40");
    expect(url("prefillGuests=120").guestCount).toBe("120");
  });
  it("matches the event type loosely, and takes any prefill_<field> up to 500 characters", () => {
    expect(url("prefillEventType=christmas-party").eventType).toBe("Christmas Party");
    expect(url("prefillEventType=Gala").eventType).toBeUndefined();
    expect(url(`prefill_company=Fernleaf%20Testing&prefill_message=${"x".repeat(600)}`)).toEqual({ company: "Fernleaf Testing", message: "x".repeat(500) });
  });
  it("lets the named parameter win over a prefill_ for the same field", () => {
    expect(url("prefill_guestCount=10&prefillGuests=40").guestCount).toBe("40");
  });
});

describe("applying prefill over what the visitor typed", () => {
  const page = { eventDate: "2026-12-04", guestCount: "40", eventFormat: "seated" };

  it("first visit (no record of earlier values): the page's values win over an old draft, as before", () => {
    const r = applyPrefill({ guestCount: "25", company: "Old Co" }, { ...page, company: "New Co" }, null);
    expect(r.form).toMatchObject({ guestCount: "40", eventFormat: "seated", eventDate: "2026-12-04", company: "Old Co" });
    expect(r.applied.sort()).toEqual(["eventDate", "eventFormat", "guestCount"]);
    expect(r.kept).toEqual(["company"]); // a prefill_<field> only ever filled an empty one
  });

  it("a reload with the page's same values keeps the visitor's 25 and Cocktail, and fills a still-empty date", () => {
    const typed = { guestCount: "25", eventFormat: "cocktail" };
    const r = applyPrefill(typed, page, { guestCount: "40", eventFormat: "seated" });
    expect(r.form).toEqual({ guestCount: "25", eventFormat: "cocktail", eventDate: "2026-12-04" });
    expect(r.kept.sort()).toEqual(["eventFormat", "guestCount"]);
    expect(r.applied).toEqual(["eventDate"]);
  });

  it("a real change on the page (slider moved to 60) changes that one field only", () => {
    const typed = { guestCount: "25", eventFormat: "cocktail", eventDate: "2027-02-18" };
    const r = applyPrefill(typed, { ...page, guestCount: "60" }, page);
    expect(r.form).toEqual({ guestCount: "60", eventFormat: "cocktail", eventDate: "2027-02-18" });
    expect(r.applied).toEqual(["guestCount"]);
  });

  it("the page's older date doesn't come back over the date picked in the form", () => {
    const r = applyPrefill({ eventDate: "2027-02-18" }, { eventDate: "2026-12-04", guestCount: "50" }, { eventDate: "2026-12-04", guestCount: "40" });
    expect(r.form.eventDate).toBe("2027-02-18");
  });

  it("'No date yet' is an answer: an unchanged page date doesn't undo it, a new one does", () => {
    const flexible = { [NO_DATE_KEY]: "1", eventDate: "" };
    expect(applyPrefill(flexible, { eventDate: "2026-12-04" }, { eventDate: "2026-12-04" }).form).toEqual(flexible);
    const changed = applyPrefill(flexible, { eventDate: "2026-12-11" }, { eventDate: "2026-12-04" });
    expect(changed.form).toEqual({ eventDate: "2026-12-11" });
  });

  it("a new event type clears the old type's follow-up answer", () => {
    const r = applyPrefill({ eventType: "Wedding Reception", eventDetail: "On site too" }, { eventType: "Christmas Party" }, {});
    expect(r.form).toEqual({ eventType: "Christmas Party", eventDetail: "" });
  });

  it("a field the page never sent before only fills an empty one, unless it's one of the named ones", () => {
    // The page hadn't sent a message before: one now can't be the visitor's latest choice on the page.
    const r = applyPrefill({ message: "My own words", budgetRange: "10_20k" }, { message: "host text", budgetRange: "5_10k", guestCount: "60" }, { guestCount: "40" });
    expect(r.form).toEqual({ message: "My own words", budgetRange: "10_20k", guestCount: "60" });
    expect(r.kept.sort()).toEqual(["budgetRange", "message"]);
    expect(applyPrefill({}, { message: "host text" }, { guestCount: "40" }).form).toEqual({ message: "host text" });
    // A named one the page sends for the first time is the visitor's choice on the page (a date picked there).
    expect(applyPrefill({ eventDate: "2027-02-18" }, { eventDate: "2027-03-01" }, { guestCount: "40" }).form.eventDate).toBe("2027-03-01");
  });

  it("the venue's page loading the frame bare, then with its 40 / seated, keeps the visitor's 25 / Cocktail", () => {
    // Before a whole-page reload: the visitor typed 25 and picked Cocktail; the page's last values were 40 / seated.
    let remembered: Record<string, string> = { guestCount: "40", eventFormat: "seated" };
    let form: Record<string, string> = { guestCount: "25", eventFormat: "cocktail" };
    // Load 1: the frame's bare src, no prefill in its URL.
    form = applyPrefill(form, {}, remembered).form;
    remembered = rememberPrefill(remembered, {});
    expect(remembered).toEqual({ guestCount: "40", eventFormat: "seated" });
    // Load 2, about 0.6 s later: the page adds its finder's values to the src.
    const r = applyPrefill(form, { guestCount: "40", eventFormat: "seated" }, remembered);
    expect(r.form).toEqual({ guestCount: "25", eventFormat: "cocktail" });
    expect(r.kept.sort()).toEqual(["eventFormat", "guestCount"]);
    // Then a real change on the page still wins.
    remembered = rememberPrefill(remembered, { guestCount: "40", eventFormat: "seated" });
    expect(applyPrefill(r.form, { guestCount: "60", eventFormat: "seated" }, remembered).form).toEqual({ guestCount: "60", eventFormat: "cocktail" });
  });

  it("counts a field that already holds the value as applied, without changing anything", () => {
    const r = applyPrefill({ guestCount: "40" }, { guestCount: "40" }, { guestCount: "40" });
    expect(r).toEqual({ form: { guestCount: "40" }, applied: ["guestCount"], kept: [] });
  });
});

describe("whether a kept draft is something the visitor started", () => {
  const page = { eventDate: "2026-12-13", guestCount: "40", eventFormat: "seated" };
  it("not when it holds only what the venue's page prefilled (after Enquiry Received!, say)", () => {
    expect(draftHasOwnAnswers({ ...page }, page)).toBe(false);
    expect(draftHasOwnAnswers({ eventDate: "", guestCount: "40" }, page)).toBe(false);
    expect(draftHasOwnAnswers({}, null)).toBe(false);
  });
  it("yes for anything they typed or changed", () => {
    expect(draftHasOwnAnswers({ ...page, firstName: "Kiri" }, page)).toBe(true);
    expect(draftHasOwnAnswers({ ...page, guestCount: "25" }, page)).toBe(true);
    expect(draftHasOwnAnswers({ [NO_DATE_KEY]: "1" }, page)).toBe(true);
    expect(draftHasOwnAnswers({ guestCount: "40" }, null)).toBe(true);
  });
});

describe("vf-prefill messages from the host page", () => {
  const parent = { name: "the host page's window" };
  const ctx = { isEmbed: true, parent, parentOrigin: "https://www.venue.example.test", frameId: "weddings" };
  const msg = (data: unknown, over: Partial<{ source: unknown; origin: string }> = {}) =>
    ({ source: parent, origin: "https://www.venue.example.test", data, ...over });

  it("takes one from the parent window, at its exact origin, for this frame", () => {
    expect(vfPrefillFrom(msg({ type: "vf-prefill", guests: 60 }), ctx)).toMatchObject({ guests: 60 });
    expect(vfPrefillFrom(msg({ type: "vf-prefill", frameId: "weddings", date: "2026-12-04" }), ctx)).toMatchObject({ date: "2026-12-04" });
  });
  it("ignores anything else: another window, another origin, another frame, another message, or outside an embed", () => {
    const data = { type: "vf-prefill", guests: 60 };
    expect(vfPrefillFrom(msg(data, { source: {} }), ctx)).toBeNull();
    expect(vfPrefillFrom(msg(data, { origin: "https://evil.example.test" }), ctx)).toBeNull();
    expect(vfPrefillFrom(msg({ ...data, frameId: "functions" }), ctx)).toBeNull();
    expect(vfPrefillFrom(msg({ type: "vf-embed-height", height: 900 }), ctx)).toBeNull();
    expect(vfPrefillFrom(msg("vf-prefill"), ctx)).toBeNull();
    expect(vfPrefillFrom(msg(data), { ...ctx, isEmbed: false })).toBeNull();
    expect(vfPrefillFrom(msg(data), { ...ctx, parent: null })).toBeNull(); // the page isn't in a frame
  });
  it("takes any origin from the parent when the parent's origin isn't known", () => {
    expect(vfPrefillFrom(msg({ type: "vf-prefill", guests: 60 }, { origin: "https://other.example.test" }), { ...ctx, parentOrigin: null })).not.toBeNull();
  });
  it("never touches the contact fields, and says what it refused", () => {
    const r = normalisePrefill({
      guests: "100-120", format: "standing", date: "2026-02-30", eventType: "Gala",
      fields: { email: "someone@example.test", firstName: "Mere", budgetRange: "10_20k", "<script>": "x", spaceId: 2 },
    }, TYPES, { allowContact: false });
    expect(r.values).toEqual({ guestCount: "100-120", eventFormat: "cocktail", budgetRange: "10_20k", spaceId: "2" });
    expect(r.ignored.sort()).toEqual(["<script>", "email", "eventDate", "eventType", "firstName"].sort());
  });
  it("takes only choices from the host page, never the visitor's own words", () => {
    const r = normalisePrefill({
      guests: 40,
      fields: { message: "host text", eventDetail: "Ruby wedding", invoicingNote: "Acme", budgetRange: "10_20k", spaceId: 2, eventTime: "19:00", source: "Instagram" },
    }, TYPES, { allowContact: false, onlyChoices: true });
    expect(r.values).toEqual({ guestCount: "40", budgetRange: "10_20k", spaceId: "2", eventTime: "19:00", source: "Instagram" });
    expect(r.ignored.sort()).toEqual(["eventDetail", "invoicingNote", "message"]);
    // A time that isn't one is no prefill.
    expect(normalisePrefill({ fields: { eventTime: "99:99" } }, TYPES, { allowContact: false, onlyChoices: true })).toEqual({ values: {}, ignored: ["eventTime"] });
  });
  it("a whole message: the visitor's answers stay unless the page sends something new", () => {
    const form = { firstName: "Mere", email: "mere@example.test", guestCount: "25", eventFormat: "cocktail" };
    const seen = { guestCount: "40", eventFormat: "seated" };
    const { values } = normalisePrefill({ guests: 40, format: "seated", date: "2026-12-11" }, TYPES, { allowContact: false });
    const r = applyPrefill(form, values, seen);
    expect(r.form).toEqual({ ...form, eventDate: "2026-12-11" });
    expect(r.kept.sort()).toEqual(["eventFormat", "guestCount"]);
  });
  it("matches event types loosely", () => {
    expect(matchEventType("WEDDING reception", TYPES)).toBe("Wedding Reception");
    expect(matchEventType(42, TYPES)).toBeUndefined();
  });
});
