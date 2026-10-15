import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { users as usersTable, venueSettings } from "../drizzle/schema";
import { createVenueOwner, SignupError } from "./signup";
import { rateLimit } from "./_core/rateLimit";

// End-to-end against the real database: self-serve sign-up creates an owner and
// their venue, refuses a duplicate email, and the limiter the endpoint reuses
// actually trips. Everything it creates is deleted in cleanup. Skipped without
// DATABASE_URL.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

// Throwaway, obviously-fake addresses so nothing real is ever touched.
const rand = Math.random().toString(36).slice(2, 10);
const EMAIL = `signup-test-${rand}@example.invalid`;
const createdUserIds: number[] = [];

d("createVenueOwner", () => {
  afterAll(async () => {
    const db = await getDb();
    if (!db || createdUserIds.length === 0) return;
    // Remove the venue rows first, then the users we created.
    await db.delete(venueSettings).where(inArray(venueSettings.ownerId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  });

  it("creates an admin owner and a venue_settings row", async () => {
    const owner = await createVenueOwner({ email: EMAIL, password: "s3cretpw!", name: "Test Owner" });
    createdUserIds.push(owner.id);

    expect(owner.email).toBe(EMAIL);
    expect(owner.openId).toMatch(/^signup-/);

    const db = (await getDb())!;
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, owner.id)).limit(1);
    expect(row).toBeTruthy();
    expect(row.role).toBe("admin");
    expect(row.loginMethod).toBe("local");
    expect(row.workspaceOwnerId).toBeNull();
    expect(row.isStaff).toBe(false);
    expect(row.passwordHash).toBeTruthy();
    // The raw password is never stored.
    expect(row.passwordHash).not.toBe("s3cretpw!");

    const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, owner.id)).limit(1);
    expect(vs).toBeTruthy();
    expect(vs.welcomeSeenAt).toBeNull();
  });

  it("refuses a duplicate email (case-insensitive)", async () => {
    await expect(createVenueOwner({ email: EMAIL.toUpperCase(), password: "anotherpw1" }))
      .rejects.toMatchObject({ code: "email_taken" });
    await expect(createVenueOwner({ email: EMAIL.toUpperCase(), password: "anotherpw1" }))
      .rejects.toBeInstanceOf(SignupError);
  });

  it("rejects an invalid email or weak password before touching the DB", async () => {
    await expect(createVenueOwner({ email: "not-an-email", password: "longenough1" }))
      .rejects.toMatchObject({ code: "invalid_email" });
    await expect(createVenueOwner({ email: `ok-${rand}@example.invalid`, password: "short" }))
      .rejects.toMatchObject({ code: "weak_password" });
  });
});

describe("signup rate limiter", () => {
  it("trips after the allowed number of attempts in the window", () => {
    // The limiter bypasses under NODE_ENV=test; flip it so we exercise the real
    // behaviour the /api/auth/signup middleware relies on, then restore.
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const name = `auth:signup-test-${rand}`;
      const ip = "203.0.113.7";
      expect(rateLimit(name, ip, 3, 60_000)).toBe(true);
      expect(rateLimit(name, ip, 3, 60_000)).toBe(true);
      expect(rateLimit(name, ip, 3, 60_000)).toBe(true);
      expect(rateLimit(name, ip, 3, 60_000)).toBe(false); // 4th over the limit
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
