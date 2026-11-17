import { describe, expect, it } from "vitest";
import { createLoginLimiter } from "./_core/loginRateLimit";

const MIN = 60_000;

describe("login rate limit", () => {
  it("never locks anyone out for signing in successfully", () => {
    const limiter = createLoginLimiter(10, 5 * MIN);
    for (let i = 0; i < 25; i++) {
      expect(limiter.attempt("1.2.3.4", 1000 + i)).toBe(true);
      limiter.succeeded("1.2.3.4", 1000 + i);
    }
    // ...and still allows the next one, right or wrong.
    expect(limiter.attempt("1.2.3.4", 2000)).toBe(true);
  });

  it("locks a client out after 10 failed sign-ins in the window", () => {
    const limiter = createLoginLimiter(10, 5 * MIN);
    for (let i = 0; i < 10; i++) expect(limiter.attempt("1.2.3.4", 1000)).toBe(true);
    expect(limiter.attempt("1.2.3.4", 1000)).toBe(false);
    // A different client is unaffected.
    expect(limiter.attempt("5.6.7.8", 1000)).toBe(true);
  });

  it("still counts failures mixed in with successes", () => {
    const limiter = createLoginLimiter(10, 5 * MIN);
    for (let i = 0; i < 9; i++) {
      expect(limiter.attempt("1.2.3.4", 1000)).toBe(true); // wrong password
      expect(limiter.attempt("1.2.3.4", 1000)).toBe(true); // right password
      limiter.succeeded("1.2.3.4", 1000);
    }
    expect(limiter.attempt("1.2.3.4", 1000)).toBe(true); // the 10th wrong password
    expect(limiter.attempt("1.2.3.4", 1000)).toBe(false);
  });

  it("counts a burst of parallel attempts before any of them finishes", () => {
    const limiter = createLoginLimiter(10, 5 * MIN);
    const started = Array.from({ length: 15 }, () => limiter.attempt("1.2.3.4", 1000));
    expect(started.filter(Boolean)).toHaveLength(10);
  });

  it("lets the client try again once the window has passed", () => {
    const limiter = createLoginLimiter(10, 5 * MIN);
    for (let i = 0; i < 11; i++) limiter.attempt("1.2.3.4", 1000);
    expect(limiter.attempt("1.2.3.4", 1000 + 4 * MIN)).toBe(false);
    expect(limiter.attempt("1.2.3.4", 1000 + 5 * MIN)).toBe(true);
  });
});
