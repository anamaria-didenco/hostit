import { describe, it, expect } from "vitest";
import { withKeyedLock } from "./keyedLock";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("withKeyedLock", () => {
  it("runs jobs with the same key one at a time, in order", async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) => async () => { log.push(`${name}:start`); await sleep(ms); log.push(`${name}:end`); return name; };
    const out = await Promise.all([
      withKeyedLock("k", job("a", 20)),
      withKeyedLock("k", job("b", 1)),
      withKeyedLock("k", job("c", 1)),
    ]);
    expect(out).toEqual(["a", "b", "c"]);
    expect(log).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("lets different keys run in parallel", async () => {
    const log: string[] = [];
    await Promise.all([
      withKeyedLock("x", async () => { log.push("x:start"); await sleep(20); log.push("x:end"); }),
      withKeyedLock("y", async () => { log.push("y:start"); await sleep(1); log.push("y:end"); }),
    ]);
    expect(log.indexOf("y:end")).toBeLessThan(log.indexOf("x:end"));
  });

  it("a failing job doesn't block the next one, and its error still reaches its caller", async () => {
    const failing = withKeyedLock("e", async () => { throw new Error("boom"); });
    const next = withKeyedLock("e", async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
