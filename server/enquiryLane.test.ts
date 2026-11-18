import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composite, contrastRatio, parseColor, type RGBA } from "../shared/contrast";
import { LANE_INK, LANE_MARK, LANE_TINT, groupLane, rowLane, type Lane } from "../shared/enquiryLane";
import { enrichRows, type LeadLike, type ListCtx, type ListRow, type ReplyStatusMap } from "../shared/enquiryFilters";
import { DEFAULT_STATUSES } from "../shared/enquiryStatuses";
import { PARTIAL_LEAD_NOTE } from "../shared/leadConstants";
import { zonedWallTimeToDate } from "../shared/eventDate";

// The Enquiries list's colour code (shared/enquiryLane.ts): which lane each
// enquiry sits in, and that the lane colours read on every surface a row, a
// heading or a Board card can have, in every theme in index.css. Every client
// here is invented (@example.test).

const CSS = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const root = tokens(/:root\s*\{([^}]*)\}/.exec(CSS)![1]);
const themes: [string, Record<string, string>][] = [[":root", root]];
for (const m of CSS.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)) themes.push([m[1], { ...root, ...tokens(m[2]) }]);

const CREAM = "#fffdf9";
const over = (top: string, alpha: number, bottom: RGBA): RGBA => {
  const t = parseColor(top)!;
  return composite([t[0], t[1], t[2], alpha], bottom);
};

/** Every surface a lane's dot, band and words sit on, in one theme. */
function surfaces(t: Record<string, string>, lane: Lane): [string, RGBA][] {
  const card = parseColor(t.card)!, bg = parseColor(t.background)!, muted = parseColor(t.muted)!;
  return [
    ["card", card],
    ["page", bg],
    ["Board card", parseColor(CREAM)!],
    ["selected row", over(t.primary, 0.13, card)],
    ["hovered row", over(t.muted, 0.7, card)],
    ...(lane === "calm" ? [] : [
      ["heading wash", composite(parseColor(LANE_TINT[lane])!, card)],
      ["heading wash on muted", composite(parseColor(LANE_TINT[lane])!, muted)],
    ] as [string, RGBA][]),
  ];
}

const LANES: Lane[] = ["red", "amber", "blue", "green", "grey"];

describe("lane colours", () => {
  it("found the themes", () => {
    expect(themes.length).toBeGreaterThanOrEqual(10);
  });
  for (const [name, t] of themes) {
    it(`${name}: words 4.5:1 and marks 3:1 on every surface`, () => {
      const bad: string[] = [];
      for (const lane of LANES) {
        for (const [where, s] of surfaces(t, lane)) {
          const ir = contrastRatio(LANE_INK[lane], s), mr = contrastRatio(LANE_MARK[lane], s);
          if (ir < 4.5) bad.push(`${lane} words on ${where}: ${ir.toFixed(2)}`);
          if (mr < 3) bad.push(`${lane} mark on ${where}: ${mr.toFixed(2)}`);
        }
      }
      // Calm rows use the theme's muted ink.
      for (const [where, s] of surfaces(t, "calm")) {
        const r = contrastRatio(t["muted-foreground"], s);
        if (r < 4.5) bad.push(`calm words on ${where}: ${r.toFixed(2)}`);
      }
      expect(bad).toEqual([]);
    });
  }
});

// ── Which lane ─────────────────────────────────────────────────────────────

// Tue 17 Nov 2026, 10:00 in Auckland.
const TZ = "Pacific/Auckland";
const NOW = Date.UTC(2026, 10, 16, 21, 0);
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms);
const nz = (y: number, m: number, d: number, h = 12) => zonedWallTimeToDate(y, m, d, h, 0, TZ);
const dateOnly = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const ctx: ListCtx = { nowMs: NOW, tz: TZ, statusOrder: DEFAULT_STATUSES.map(s => s.key) };

let nextId = 1;
function row(o: Partial<LeadLike> = {}, extra: { inbound?: Date; clash?: boolean } = {}): ListRow {
  const id = nextId++;
  const lead = {
    id, firstName: "Test", lastName: `Client${id}`, email: `client${id}@example.test`,
    status: "contacted", createdAt: ago(30 * DAY), respondedAt: ago(29 * DAY), lastActivityAt: ago(2 * DAY),
    eventDate: null, ...o,
  } as LeadLike;
  const replyStatus: ReplyStatusMap = new Map();
  if (extra.inbound) replyStatus.set(id, { direction: "in", at: extra.inbound });
  const clashMap: Record<number, unknown[]> = extra.clash ? { [id]: [{ id: 1 }] } : {};
  return enrichRows([lead], { ...ctx, replyStatus, clashMap, isPartial: l => l.internalNotes === PARTIAL_LEAD_NOTE })[0];
}
const lane = (r: ListRow) => rowLane(r, ctx);

describe("rowLane", () => {
  it("no first reply yet is blue, however long it has waited", () => {
    const fresh = row({ status: "new", respondedAt: null, createdAt: ago(2 * HOUR), eventDate: dateOnly(2027, 2, 6) });
    const old = row({ status: "new", respondedAt: null, createdAt: ago(9 * DAY), eventDate: dateOnly(2027, 2, 6) });
    expect(fresh.signal.kind).toBe("waiting");
    expect(lane(fresh)).toEqual({ lane: "blue", text: "Waiting 2h" });
    expect(lane(old).lane).toBe("blue");
  });

  it("the client wrote back, gone quiet and a hold ending are amber", () => {
    const replied = row({ eventDate: dateOnly(2027, 1, 9) }, { inbound: ago(2 * DAY) });
    expect(replied.signal.kind).toBe("client_replied");
    expect(lane(replied).lane).toBe("amber");
    const quiet = row({ lastActivityAt: ago(40 * DAY), eventDate: null });
    expect(quiet.signal.kind).toBe("gone_quiet");
    expect(lane(quiet).lane).toBe("amber");
    const hold = row({ status: "tentative", holdUntil: new Date(NOW + 5 * DAY), eventDate: dateOnly(2026, 12, 5) });
    expect(hold.signal.kind).toBe("hold");
    expect(lane(hold)).toMatchObject({ lane: "amber", text: "Hold ends · 5d" });
  });

  it("a follow-up due today is amber, one a day or more overdue is red", () => {
    const today = row({ status: "proposal_sent", followUpDate: ago(2 * HOUR), eventDate: dateOnly(2027, 2, 6) });
    expect(today.signal.kind).toBe("followup_overdue");
    expect(lane(today)).toEqual({ lane: "amber", text: "Follow up today" });
    const late = row({ status: "proposal_sent", followUpDate: ago(DAY + HOUR), eventDate: dateOnly(2027, 2, 6) });
    expect(late.signal.kind).toBe("followup_overdue");
    expect(lane(late)).toEqual({ lane: "red", text: "Follow-up overdue · 1d" });
  });

  it("an expired hold is red", () => {
    const r = row({ status: "tentative", holdUntil: ago(DAY), eventDate: dateOnly(2026, 12, 5) });
    expect(r.signal.kind).toBe("hold_expired");
    expect(lane(r).lane).toBe("red");
  });

  it("a date clash is red, with the Needs words moved under it", () => {
    const waiting = row({ status: "new", respondedAt: null, createdAt: ago(3 * DAY), eventDate: nz(2026, 11, 29, 13) }, { clash: true });
    expect(lane(waiting)).toEqual({ lane: "red", text: "Date clash", sub: "Waiting 3d" });
    // When the clash is the whole story, there is no second line.
    const plain = row({ eventDate: nz(2026, 11, 29, 13) }, { clash: true });
    expect(plain.signal.kind).toBe("clash");
    expect(lane(plain)).toEqual({ lane: "red", text: "Date clash", sub: undefined });
  });

  it("an open enquiry whose date has passed is red, with the Needs words under it", () => {
    const waiting = row({ status: "new", respondedAt: null, createdAt: ago(20 * DAY), eventDate: nz(2026, 11, 13, 18) });
    expect(lane(waiting)).toEqual({ lane: "red", text: "Date passed", sub: "Waiting 20d" });
    const plain = row({ eventDate: dateOnly(2026, 11, 14) });
    expect(plain.signal.kind).toBe("date_passed");
    expect(lane(plain)).toEqual({ lane: "red", text: "Date passed", sub: undefined });
  });

  it("a booking still to come is green, and stays green with a clash", () => {
    const soon = row({ status: "booked", eventDate: dateOnly(2026, 11, 29) });
    expect(lane(soon)).toEqual({ lane: "green", text: "Event in 12d" });
    const clash = row({ status: "booked", eventDate: nz(2026, 11, 29, 19) }, { clash: true });
    expect(lane(clash).lane).toBe("green");
    expect(lane(row({ status: "booked", eventDate: null })).lane).toBe("green");
  });

  it("a booking whose day is over is grey, and so is every closed enquiry", () => {
    expect(lane(row({ status: "booked", eventDate: dateOnly(2026, 10, 2) }))).toEqual({ lane: "grey", text: "Event passed" });
    expect(lane(row({ status: "lost", lostReason: "price", eventDate: dateOnly(2026, 12, 1) }))).toEqual({ lane: "grey", text: "Lost · Price / budget" });
    expect(lane(row({ status: "finished", eventDate: dateOnly(2026, 8, 1) })).lane).toBe("grey");
    expect(lane(row({ status: "cancelled", eventDate: dateOnly(2026, 12, 1) })).lane).toBe("grey");
  });

  it("nothing due is calm: in progress, a future follow-up, a form never finished", () => {
    expect(lane(row({ status: "site_visit", eventDate: dateOnly(2027, 1, 9) }))).toEqual({ lane: "calm", text: "In progress" });
    expect(lane(row({ status: "negotiating", followUpDate: dateOnly(2026, 11, 24), eventDate: dateOnly(2026, 12, 12) }))).toEqual({ lane: "calm", text: "Follow up Tue 24 Nov" });
    const partial = row({ status: "new", respondedAt: null, internalNotes: PARTIAL_LEAD_NOTE, createdAt: ago(HOUR) });
    expect(partial.signal.kind).toBe("partial");
    expect(lane(partial).lane).toBe("calm");
  });

  it("view tabs: Needs reply blue, Follow-up due amber, Confirmed green, Closed grey; Open and All mix lanes", () => {
    expect(["reply", "followup", "open", "confirmed", "closed", "all"].map(groupLane)).toEqual(["blue", "amber", "calm", "green", "grey", "calm"]);
  });
});
