import { describe, it, expect } from "vitest";
import { NAME_DRAFT_KEEP_MS, clearNameDraft, frameTag, readNameDraft, writeNameDraft, type NameDraft } from "../client/src/lib/framedDraft";

/** The window.name fallback when the frame can't use storage (client/src/lib/framedDraft.ts). */
const now = 1_800_000_000_000;
const draft = (over: Partial<NameDraft> = {}): NameDraft => ({
  slug: "bar-franco", ownerId: 7, step: 2,
  fields: { firstName: "Aroha", email: "aroha@example.test", guestCount: "25", eventFormat: "cocktail" },
  prefill: { guestCount: "40", eventFormat: "seated" },
  at: now, ...over,
});

describe("keeping the answers in window.name", () => {
  it("reads back the answers, the step and the prefill values seen", () => {
    const name = writeNameDraft("", draft());
    expect(readNameDraft(name, "bar-franco", now + 60_000)).toEqual(draft());
  });
  it("never holds the lead's token or the form token, whatever it's given", () => {
    const sneaky = { ...draft(), leadId: 433, leadToken: "tok_secret", formToken: "mfz0.secret" } as unknown as NameDraft;
    const name = writeNameDraft("", sneaky);
    expect(name).not.toContain("tok_secret");
    expect(name).not.toContain("mfz0.secret");
    expect(name).not.toContain("leadId");
  });
  it("is only for this venue, and only for an hour (the host could read it)", () => {
    expect(NAME_DRAFT_KEEP_MS).toBe(60 * 60_000);
    const name = writeNameDraft("", draft());
    expect(readNameDraft(name, "other-venue", now)).toBeNull();
    expect(readNameDraft(name, "bar-franco", now + NAME_DRAFT_KEEP_MS)).not.toBeNull();
    expect(readNameDraft(name, "bar-franco", now + NAME_DRAFT_KEEP_MS + 1)).toBeNull();
  });
  it("ignores a name that isn't one of ours, or is broken", () => {
    expect(readNameDraft("vf", "bar-franco", now)).toBeNull();
    expect(readNameDraft("vf-draft:{oops", "bar-franco", now)).toBeNull();
    expect(readNameDraft(null, "bar-franco", now)).toBeNull();
  });
  it("keeps the frame's own name (a host's iframe name) and gives it back when cleared", () => {
    const name = writeNameDraft("vf-frame", draft());
    expect(clearNameDraft(name)).toBe("vf-frame");
    expect(clearNameDraft(writeNameDraft(name, draft({ step: 1 })))).toBe("vf-frame"); // written again
    expect(clearNameDraft("vf-frame")).toBe("vf-frame");
  });
  it("drops anything that isn't a plain answer", () => {
    const name = writeNameDraft("", draft({ fields: { guestCount: "25", bad: 7 as unknown as string, "<x>": "y" } }));
    expect(readNameDraft(name, "bar-franco", now)!.fields).toEqual({ guestCount: "25" });
  });
});

describe("telling this frame from a new one", () => {
  it("names an unnamed frame once, and knows it again after the venue's page reloads it", () => {
    const first = frameTag("", () => "k3j2h1g0");
    expect(first).toEqual({ tag: "vf-frame:k3j2h1g0", name: "vf-frame:k3j2h1g0" });
    expect(frameTag(first.name, () => "other123")).toEqual(first);
  });
  it("leaves a host's own frame name alone, and then can't tell frames apart", () => {
    expect(frameTag("enquiry-form", () => "k3j2h1g0")).toEqual({ tag: null, name: "enquiry-form" });
    expect(frameTag("vf-frame:<bad>", () => "k3j2h1g0")).toEqual({ tag: null, name: "vf-frame:<bad>" });
  });
});
