import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, proposals, venueSettings } from "../drizzle/schema";
import { PUBLIC_VENUE_FIELDS, publicVenue } from "./publicVenue";

/**
 * Anyone without this venue's login sees only the allow-listed settings: the
 * public enquiry form, the client's proposal page and venue.get for a
 * stranger. The staff email list, staff briefing, statuses, proposal template
 * and every credential stay private.
 */

// Values that must never reach a visitor, each easy to spot in a JSON dump.
const PRIVATE = {
  staffEmails: [{ name: "Private Staffer", email: "private.staffer@example.test" }],
  staffBriefingSubject: "PRIVATE-BRIEFING-SUBJECT",
  staffBriefingBody: "PRIVATE-BRIEFING-BODY",
  notificationEmail: "private.alerts@example.test",
  smtpPass: "PRIVATE-SMTP-PASS",
  nbiApiKey: "PRIVATE-NBI-KEY",
  nbiWebhookSecret: "PRIVATE-NBI-WEBHOOK",
  proposalTemplateHtml: "<p>PRIVATE-TEMPLATE {{venue.name}}</p>",
  paymentInstructions: "PRIVATE-PAYMENT-INSTRUCTIONS",
  customStatuses: JSON.stringify([{ key: "new", label: "PRIVATE-STATUS-LABEL", colorId: "blue" }]),
  internalName: "PRIVATE-INTERNAL-NAME",
};
const PRIVATE_MARKERS = ["private.staffer@example.test", "PRIVATE-"];
const leaks = (v: unknown) => PRIVATE_MARKERS.filter(m => JSON.stringify(v).includes(m));

const ALLOWED = [...PUBLIC_VENUE_FIELDS].sort();

describe("publicVenue()", () => {
  it("keeps exactly the allow-listed fields and drops everything else", () => {
    const row: any = { id: 1, ownerId: 7, slug: "test-venue", name: "Test Venue", city: "Christchurch", ...PRIVATE };
    const out = publicVenue(row);
    expect(Object.keys(out).sort()).toEqual(ALLOWED);
    expect(out.name).toBe("Test Venue");
    expect(out.city).toBe("Christchurch");
    expect(leaks(out)).toEqual([]);
  });

  it("allow-lists no setting that is private or a credential", () => {
    for (const key of ["staffEmails", "staffBriefingBody", "staffBriefingSubject", "notificationEmail", "smtpPass",
      "smtpUser", "imapPass", "nbiApiKey", "nbiWebhookSecret", "proposalTemplateHtml", "paymentInstructions",
      "customStatuses", "internalName", "emailSignature", "automatedTaskRules", "followUpSequences"]) {
      expect(PUBLIC_VENUE_FIELDS as readonly string[]).not.toContain(key);
    }
  });
});

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 930000 + Math.floor(Math.random() * 9999);
const SLUG = `public-venue-test-${OWNER}`;
const TOKEN = `pv-test-${OWNER}`;

function ctxFor(user: { id: number } | null, flags: { isTeamMember?: boolean; isStaff?: boolean } = {}): TrpcContext {
  return {
    user: user ? {
      id: user.id, openId: `public-venue-${user.id}`, email: "owner@example.test", name: "Test Owner",
      loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any : null,
    isTeamMember: flags.isTeamMember ?? false,
    isStaff: flags.isStaff ?? false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

d("public venue settings (DB)", () => {
  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({
      ownerId: OWNER, name: "Public Test Venue", slug: SLUG, city: "Christchurch",
      email: "hello@example.test", leadFormTitle: "Plan your event", ...PRIVATE,
    } as any);
    const [lead] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Ava", email: "ava@example.test" }).returning();
    await db.insert(proposals).values({ ownerId: OWNER, leadId: lead.id, publicToken: TOKEN, title: "Test proposal", status: "draft" } as any);
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("venue.getBySlug (the public enquiry form) returns only the public fields", async () => {
    const v = await appRouter.createCaller(ctxFor(null)).venue.getBySlug({ slug: SLUG });
    expect(v).not.toBeNull();
    expect(Object.keys(v!).sort()).toEqual(ALLOWED);
    expect(v!.name).toBe("Public Test Venue");
    expect(v!.leadFormTitle).toBe("Plan your event");
    expect(leaks(v)).toEqual([]);
  });

  it("venue.getDefault returns only the public fields", async () => {
    const v = await appRouter.createCaller(ctxFor(null)).venue.getDefault();
    if (v) expect(Object.keys(v).sort()).toEqual(ALLOWED);
  });

  it("the client's proposal page gets the public venue fields only", async () => {
    const res = await appRouter.createCaller(ctxFor(null)).proposals.getByToken({ token: TOKEN });
    expect(res?.venue).toBeTruthy();
    expect(Object.keys(res!.venue!).sort()).toEqual(ALLOWED);
    expect(leaks(res!.venue)).toEqual([]);
  });

  it("venue.get for someone without this venue's login: public fields, the rest null", async () => {
    for (const ctx of [ctxFor(null), ctxFor({ id: OWNER + 1 })]) {
      const v: any = await appRouter.createCaller(ctx).venue.get({ ownerId: OWNER });
      expect(v.name).toBe("Public Test Venue");
      expect(leaks(v)).toEqual([]);
      for (const [k, val] of Object.entries(v)) {
        if (!(PUBLIC_VENUE_FIELDS as readonly string[]).includes(k)) expect(val, k).toBeNull();
      }
    }
  });

  it("venue.get for the venue's own team login: no credentials or staff emails, the rest as before", async () => {
    const v: any = await appRouter.createCaller(ctxFor({ id: OWNER }, { isTeamMember: true })).venue.get({ ownerId: OWNER });
    expect(v.staffEmails).toBeNull();
    expect(v.smtpPass).toBeNull();
    expect(v.nbiApiKey).toBeNull();
    expect(v.notificationEmail).toBeNull();
    expect(v.staffBriefingBody).toBe(PRIVATE.staffBriefingBody);
  });

  it("venue.get for the owner: the full row", async () => {
    const v: any = await appRouter.createCaller(ctxFor({ id: OWNER })).venue.get({ ownerId: OWNER });
    expect(v.staffEmails).toEqual(PRIVATE.staffEmails);
    expect(v.smtpPass).toBe(PRIVATE.smtpPass);
  });

  it("the unused public expressBook.getVenueInfo (any venue's private prices and kitchen notes) is gone", () => {
    const procedures = (appRouter as any)._def.procedures;
    expect(procedures["expressBook.submit"]).toBeDefined(); // the lookup itself works
    expect(procedures["expressBook.getVenueInfo"]).toBeUndefined();
  });
});
