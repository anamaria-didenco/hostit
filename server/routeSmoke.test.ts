import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Smoke coverage for the queries every page depends on.
 *
 * The point is not to assert business rules — the suites around this already do
 * that — but to catch the class of failure where a query stops resolving at all
 * and takes a whole page down with it. `leads.list` did exactly that: a column
 * in its SELECT list existed in schema.ts but in no migration, so every
 * authenticated page returned 500 on any database built from the migrations.
 *
 * Skipped without DATABASE_URL, so it never fails for the wrong reason.
 */

function createPublicContext(): TrpcContext {
  return {
    user: null,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("route smoke — critical queries resolve", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    caller = appRouter.createCaller(createPublicContext());
  });

  it("auth.me answers for an anonymous visitor", async () => {
    const me = await caller.auth.me();
    expect(me).toHaveProperty("user");
    expect(me).toHaveProperty("isTeamMember");
    expect(me).toHaveProperty("isStaff");
  });

  it("venue.getDefault resolves — the public enquiry form needs it", async () => {
    await expect(caller.venue.getDefault()).resolves.not.toThrow();
  });

  it("refuses protected queries without a session rather than erroring out", async () => {
    // A clean UNAUTHORIZED is the correct answer here. An INTERNAL_SERVER_ERROR
    // would mean the query itself is broken, which is what we're guarding.
    await expect(caller.leads.list({} as any)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.dashboard.stats()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
