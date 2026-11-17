/**
 * The live staff link must not reload its BEO, or announce "Runsheet updated",
 * on a 30-second poll that brought nothing new. It used to on every poll: the
 * payload holds Dates, superjson rebuilds them, and React Query's structural
 * sharing never treats a Date as equal. These tests replay a poll the same way
 * the browser does (superjson over the wire, then replaceEqualDeep).
 */
import { describe, expect, it } from "vitest";
import superjson from "superjson";
import { replaceEqualDeep } from "@tanstack/react-query";
import { staffLinkContentKey } from "../shared/staffLinkContent";

function payload(over: Record<string, unknown> = {}) {
  return {
    link: { id: 1, label: "Staff Link" },
    venue: { name: "The Harbour Room" },
    runsheet: {
      id: 7, bookingId: 3, title: "Grace Holloway — Birthday",
      updatedAt: new Date("2026-11-16T23:07:17.629Z"), eventDate: new Date("2026-11-20T05:00:00.000Z"),
      attachments: [{ id: "a1", name: "Drinks menu.pdf", url: "/uploads/1-a.pdf", size: 593 }],
    },
    items: [{ id: 1, time: "17:30", title: "Staff briefing" }],
    fnb: [],
    payments: [{ id: 4, amount: "500.00", type: "deposit", method: "bank_transfer", paidAt: new Date("2026-11-01T00:00:00.000Z"), notes: null }],
    checklist: { id: 9, shareToken: "t", items: [{ id: "1", text: "Ice in wells", checked: false }] },
    billing: null,
    showMoney: true,
    ...over,
  };
}

/** What the page holds after a poll: the server's answer, through superjson, structurally shared with the last copy. */
function poll(previous: unknown, server: unknown) {
  const received = superjson.parse(superjson.stringify(server));
  return replaceEqualDeep(previous, received);
}

describe("staffLinkContentKey", () => {
  it("reproduces the old bug: an unchanged poll still gives `data` a new identity", () => {
    const first = poll(undefined, payload());
    const second = poll(first, payload());
    expect(second).not.toBe(first);
  });

  it("stays the same across a poll that changed nothing", () => {
    const first = poll(undefined, payload());
    const second = poll(first, payload());
    expect(staffLinkContentKey(second)).toBe(staffLinkContentKey(first));
  });

  it("changes when the runsheet is edited", () => {
    const first = poll(undefined, payload());
    const edited = poll(first, payload({ items: [{ id: 1, time: "17:45", title: "Staff briefing" }] }));
    expect(staffLinkContentKey(edited)).not.toBe(staffLinkContentKey(first));
    const saved = poll(first, payload({ runsheet: { ...payload().runsheet, updatedAt: new Date("2026-11-17T01:00:00.000Z") } }));
    expect(staffLinkContentKey(saved)).not.toBe(staffLinkContentKey(first));
  });

  it("ignores a checklist tick, which the BEO doesn't show", () => {
    const first = poll(undefined, payload());
    const ticked = poll(first, payload({ checklist: { id: 9, shareToken: "t", items: [{ id: "1", text: "Ice in wells", checked: true }] } }));
    expect(staffLinkContentKey(ticked)).toBe(staffLinkContentKey(first));
  });

  it("is empty until there is something to show", () => {
    expect(staffLinkContentKey(undefined)).toBe("");
    expect(staffLinkContentKey(null)).toBe("");
  });
});
