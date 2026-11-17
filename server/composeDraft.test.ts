import { describe, it, expect } from "vitest";
import { composeDraftKey, composeDraftSlot } from "../shared/composeDraft";

const slot = (leadId: unknown, reply?: { inReplyTo?: string | null; references?: string[] | null } | null) =>
  composeDraftSlot(composeDraftKey(leadId, reply));

describe("composer draft slot", () => {
  it("is the same for the same enquiry", () => {
    expect(slot(12)).toBe(slot(12));
    expect(slot(12, { inReplyTo: "<a@mail>", references: ["<a@mail>"] })).toBe(slot(12, { inReplyTo: "<a@mail>", references: ["<a@mail>"] }));
  });

  it("differs for another enquiry from the same client", () => {
    // Two events booked under one email address: the draft is about one of them.
    expect(slot(12)).not.toBe(slot(13));
  });

  it("follows the email thread, not the single message being answered", () => {
    // The client wrote again in the same thread: their newer message's References start with the first one.
    const first = slot(12, { inReplyTo: "<a1@mail>", references: ["<a1@mail>"] });
    const later = slot(12, { inReplyTo: "<a2@mail>", references: ["<a1@mail>", "<a2@mail>"] });
    expect(later).toBe(first);
    // No References: the message itself names the thread.
    expect(slot(12, { inReplyTo: "<a1@mail>", references: [] })).toBe(first);
  });

  it("keeps replies in different threads, and a reply and a new email, apart", () => {
    expect(slot(12, { inReplyTo: "<a@mail>", references: ["<a@mail>"] })).not.toBe(slot(12, { inReplyTo: "<b@mail>", references: ["<b@mail>"] }));
    expect(slot(12, { inReplyTo: "<a@mail>", references: ["<a@mail>"] })).not.toBe(slot(12));
  });

  it("needs a known enquiry", () => {
    expect(slot(undefined)).toBeNull();
    expect(slot("12")).toBeNull();
    expect(slot(Number.NaN)).toBeNull();
    expect(composeDraftKey(12, { inReplyTo: "", references: [""] })).toEqual({ leadId: 12, thread: null });
  });
});
