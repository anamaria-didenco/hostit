/**
 * Tests for portal.getByToken — the public endpoint that powers the client
 * portal links emailed to event organisers. Pinning down the expiry +
 * not-found behaviour because the UX is unforgiving when this returns the
 * wrong status (the page hangs on a spinner instead of showing an error).
 */
import { afterAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { clientPortalTokens } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    isTeamMember: false,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1" } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const TEST_TOKEN_PREFIX = "test-portal-expiry-";
const insertedTokens: string[] = [];

async function insertToken(token: string, expiresAt: number | null) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(clientPortalTokens).values({
    ownerId: 1,
    token,
    permissions: JSON.stringify({}),
    expiresAt: expiresAt ?? undefined,
    createdAt: Date.now(),
  });
  insertedTokens.push(token);
  return true;
}

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  for (const t of insertedTokens) {
    await db.delete(clientPortalTokens).where(eq(clientPortalTokens.token, t));
  }
});

describe("portal.getByToken", () => {
  it("throws NOT_FOUND for an unknown token (so the client gets 404, not 500)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.portal.getByToken({ token: `${TEST_TOKEN_PREFIX}does-not-exist-${Date.now()}` }),
    ).rejects.toMatchObject({
      // TRPCError exposes `code` as a string like 'NOT_FOUND'.
      code: "NOT_FOUND",
    });
  });

  it("throws NOT_FOUND for an expired token", async () => {
    const db = await getDb();
    if (!db) {
      console.warn("[portal.getByToken.test] DB unavailable, skipping expired-token case");
      return;
    }
    const token = `${TEST_TOKEN_PREFIX}expired-${Date.now()}`;
    // expiresAt 1 hour in the past
    await insertToken(token, Date.now() - 60 * 60 * 1000);
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.portal.getByToken({ token })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns the token row for a valid, non-expired token", async () => {
    const db = await getDb();
    if (!db) {
      console.warn("[portal.getByToken.test] DB unavailable, skipping happy-path case");
      return;
    }
    const token = `${TEST_TOKEN_PREFIX}valid-${Date.now()}`;
    // expiresAt 1 hour in the future
    await insertToken(token, Date.now() + 60 * 60 * 1000);
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.portal.getByToken({ token });
    expect(result.token.token).toBe(token);
    expect(result.booking).toBeNull();
    expect(result.lead).toBeNull();
  });

  it("returns the token row when expiresAt is null (no expiry set)", async () => {
    const db = await getDb();
    if (!db) {
      console.warn("[portal.getByToken.test] DB unavailable, skipping no-expiry case");
      return;
    }
    const token = `${TEST_TOKEN_PREFIX}no-expiry-${Date.now()}`;
    await insertToken(token, null);
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.portal.getByToken({ token });
    expect(result.token.token).toBe(token);
  });
});

// Sanity check that TRPCError still maps the way we expect — guards against
// future tRPC upgrades silently changing the error shape on the wire.
describe("TRPCError mapping (sanity)", () => {
  it("NOT_FOUND TRPCError carries the right code string", () => {
    const e = new TRPCError({ code: "NOT_FOUND", message: "x" });
    expect(e.code).toBe("NOT_FOUND");
  });
});
