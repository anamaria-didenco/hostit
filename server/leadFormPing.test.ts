import { describe, it, expect } from "vitest";
import { createPartialPinger, type PingTarget } from "../client/src/lib/partialPing";
import { PARTIAL_PING_EVERY_MS, PARTIAL_PING_MIN_GAP_MS } from "@shared/enquiryTiming";

/** When the step-2 form says "still here" (client/src/lib/partialPing.ts). */
const MIN = 60_000;
const lead: PingTarget = { ownerId: 7, leadId: 433, leadToken: "tok" };

function setup(answer: () => Promise<unknown> = async () => ({ alive: true })) {
  let t = 1_800_000_000_000;
  const sent: number[] = [];
  const pinger = createPartialPinger({ everyMs: PARTIAL_PING_EVERY_MS, now: () => t, send: async () => { sent.push(t); return answer(); } });
  const flush = () => new Promise(r => setTimeout(r, 0));
  return { pinger, sent, flush, advance: (ms: number) => { t += ms; }, start: t };
}

describe("the step-2 ping", () => {
  it("pings well apart from the server's throttle", () => {
    expect(PARTIAL_PING_EVERY_MS).toBe(5 * MIN);
    expect(PARTIAL_PING_EVERY_MS).toBeGreaterThan(PARTIAL_PING_MIN_GAP_MS);
  });

  it("pings on the first thing the visitor does, then at most every 5 minutes while they keep going", async () => {
    const { pinger, sent, flush, advance, start } = setup();
    pinger.activity(lead, true); await flush();
    for (let i = 0; i < 10; i++) { advance(30_000); pinger.activity(lead, true); await flush(); }
    expect(sent).toEqual([start, start + 5 * MIN]);
  });

  it("a tick sends one only if they did something since the last ping, and the page is showing", async () => {
    const { pinger, sent, flush, advance, start } = setup();
    pinger.activity(lead, true); await flush();
    advance(4 * MIN); pinger.activity(lead, true); await flush(); // too soon: noted, not sent
    advance(MIN); pinger.tick(lead, false); await flush();          // hidden
    expect(sent).toEqual([start]);
    pinger.tick(lead, true); await flush();
    expect(sent).toEqual([start, start + 5 * MIN]);
    advance(10 * MIN); pinger.tick(lead, true); await flush();     // nothing done since: a tab left open
    expect(sent).toHaveLength(2);
  });

  it("pings once when step 2 comes back after a reload", async () => {
    const { pinger, sent, flush, advance, start } = setup();
    pinger.resumed(lead); await flush();
    pinger.resumed(lead); await flush();
    advance(MIN); pinger.activity(lead, true); await flush();
    expect(sent).toEqual([start]);
  });

  it("stops for good once the server says the lead isn't an untouched partial", async () => {
    const { pinger, sent, flush, advance } = setup(async () => ({ alive: false }));
    pinger.activity(lead, true); await flush(); await flush();
    advance(6 * MIN); pinger.activity(lead, true); pinger.tick(lead, true); await flush();
    expect(sent).toHaveLength(1);
    expect(pinger.state().stopped).toBe(true);
  });

  it("ignores errors (an older server, a dropped connection) and never retries at once", async () => {
    const { pinger, sent, flush, advance } = setup(async () => { throw new Error("Failed to fetch"); });
    pinger.activity(lead, true); await flush(); await flush();
    advance(MIN); pinger.activity(lead, true); await flush();
    expect(sent).toHaveLength(1);
    expect(pinger.state().stopped).toBe(false);
  });

  it("never pings without a lead to ping for, and after stop()", async () => {
    const { pinger, sent, flush, advance } = setup();
    pinger.activity(null, true); pinger.tick(null, true); pinger.resumed(null); await flush();
    expect(sent).toHaveLength(0);
    pinger.activity(lead, true); await flush();
    pinger.stop();
    advance(6 * MIN); pinger.activity(lead, true); pinger.tick(lead, true); await flush();
    expect(sent).toHaveLength(1);
  });

  it("starts afresh for a different lead (a corrected email saved a new one)", async () => {
    const { pinger, sent, flush, advance } = setup();
    pinger.activity(lead, true); await flush();
    pinger.stop();
    advance(MIN); pinger.activity({ ...lead, leadId: 434 }, true); await flush();
    expect(sent).toHaveLength(2);
  });
});
