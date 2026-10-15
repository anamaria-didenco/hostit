// Self-serve venue-owner sign-up. Kept as its own module (not inline in the
// Express route) so the core — validate, de-dupe, hash, create the owner +
// their venue_settings row — is unit-testable without standing up the server.
//
// Never logs the email or password: callers log SignupError.code at most.

import { getDb } from "./db";
import { users as usersTable, venueSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export type SignupInput = { email: string; password: string; name?: string };
export type SignupResult = { id: number; openId: string; email: string; name: string };

/** A sign-up that was refused for a reason worth telling the user about. */
export class SignupError extends Error {
  constructor(public code: "invalid_email" | "weak_password" | "email_taken" | "db_unavailable", message: string) {
    super(message);
    this.name = "SignupError";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create a brand-new venue owner (users row, role admin, local password) and
 * their venue_settings row. Throws SignupError on a bad input, a taken email,
 * or no database. Returns the created owner's identity (no secrets).
 */
export async function createVenueOwner(input: SignupInput): Promise<SignupResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    throw new SignupError("invalid_email", "Enter a valid email address.");
  }
  const password = String(input.password ?? "");
  if (password.length < 8 || password.length > 200) {
    throw new SignupError("weak_password", "Use a password of at least 8 characters.");
  }

  const db = await getDb();
  if (!db) throw new SignupError("db_unavailable", "Sign-up is temporarily unavailable. Please try again shortly.");

  // Email must be unique across all users (owners, logins, staff).
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing[0]) throw new SignupError("email_taken", "An account with that email already exists. Try signing in instead.");

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 10);

  // openId is the platform identity key. A `signup-` prefix keeps self-serve
  // owners clear of OAuth openIds and the `login-` extra-login prefix, and —
  // unlike the DB-less `local-` synthetic admin — still resolves against the
  // users table on every request.
  const openId = `signup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const name = input.name?.trim() || email.split("@")[0];

  const [created] = await db
    .insert(usersTable)
    .values({
      openId,
      name,
      email,
      loginMethod: "local",
      role: "admin",
      passwordHash,
      workspaceOwnerId: null,
      isStaff: false,
    })
    .returning({ id: usersTable.id, openId: usersTable.openId, email: usersTable.email, name: usersTable.name });

  // Give the new owner a venue so the dashboard and the "Set up your venue"
  // checklist have a row to render immediately. Slug carries the id to stay
  // distinct from other fresh accounts' default "my-venue".
  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "venue";
  await db.insert(venueSettings).values({
    ownerId: created.id,
    name: `${name}'s Venue`,
    slug: `${slugBase}-${created.id}`,
  });

  return { id: created.id, openId: created.openId, email: created.email!, name: created.name ?? name };
}
