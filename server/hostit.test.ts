import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-owner-001",
    email: "owner@venue.co.nz",
    name: "Test Venue Owner",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return { ctx };
}

function createPublicContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return { ctx };
}

describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("owner@venue.co.nz");
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const clearedCookies: string[] = [];
    const { ctx } = createAuthContext();
    ctx.res.clearCookie = (name: string) => { clearedCookies.push(name); };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBeGreaterThan(0);
  });
});

describe("venue.get", () => {
  it("returns null for unknown ownerId without DB", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.venue.get({ ownerId: 9999 });
    expect(result).toBeNull();
  });
});

describe("venue.getBySlug", () => {
  it("returns null for non-existent slug", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.venue.getBySlug({ slug: "non-existent-xyz" });
    expect(result).toBeNull();
  });
});

describe("leads.submit", () => {
  it("rejects invalid email", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.leads.submit({ ownerId: 1, firstName: "Jane", email: "not-valid" })
    ).rejects.toThrow();
  });

  it("rejects missing firstName", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.leads.submit({ ownerId: 1, firstName: "", email: "jane@example.com" })
    ).rejects.toThrow();
  });
});

describe("leads.list", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.leads.list({})).rejects.toThrow();
  });

  it("returns array for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.leads.list({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("proposals.getByToken", () => {
  it("returns null for unknown token", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.getByToken({ token: "nonexistent-token-xyz" });
    expect(result).toBeNull();
  });
});

describe("proposals.list", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.proposals.list()).rejects.toThrow();
  });

  it("returns array for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.proposals.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("bookings.list", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.bookings.list()).rejects.toThrow();
  });

  it("returns array for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.bookings.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("dashboard.stats", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.dashboard.stats()).rejects.toThrow();
  });

  it("returns stats object for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboard.stats();
    expect(result).toHaveProperty("newLeads");
    expect(result).toHaveProperty("totalLeads");
    expect(result).toHaveProperty("proposalsSent");
    expect(result).toHaveProperty("bookingsThisMonth");
    expect(result).toHaveProperty("revenueThisMonth");
  });
});

describe("contacts.list", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.contacts.list()).rejects.toThrow();
  });
});

describe("spaces.list", () => {
  it("requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.spaces.list()).rejects.toThrow();
  });
});

describe("templates", () => {
  it("templates.list > requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.templates.list()).rejects.toThrow();
  });

  it("templates.list > returns empty array when no templates exist for user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.templates.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("templates.create > creates a template successfully", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.templates.create({
      name: "Vitest Template",
      subject: "Hello {{contactName}}",
      body: "Dear {{contactName}}, thank you for your enquiry about {{eventDate}}.",
    });
    expect(result.success).toBe(true);

    // Verify it appears in list
    const list = await caller.templates.list();
    const found = list.find((t: any) => t.name === "Vitest Template");
    expect(found).toBeDefined();
    expect(found?.subject).toBe("Hello {{contactName}}");

    // Cleanup
    await caller.templates.delete({ id: found!.id });
  });

  it("templates.update > updates subject field", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.templates.create({
      name: "Update Test Template",
      subject: "Original Subject",
      body: "Original body.",
    });

    const list = await caller.templates.list();
    const t = list.find((x: any) => x.name === "Update Test Template");
    expect(t).toBeDefined();

    const updated = await caller.templates.update({ id: t!.id, subject: "Updated Subject" });
    expect(updated.success).toBe(true);

    const listAfter = await caller.templates.list();
    const tAfter = listAfter.find((x: any) => x.name === "Update Test Template");
    expect(tAfter?.subject).toBe("Updated Subject");

    // Cleanup
    await caller.templates.delete({ id: t!.id });
  });

  it("templates.delete > removes a template", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await caller.templates.create({
      name: "Delete Test Template",
      subject: "To be deleted",
      body: "This will be removed.",
    });

    const list = await caller.templates.list();
    const t = list.find((x: any) => x.name === "Delete Test Template");
    expect(t).toBeDefined();

    const deleted = await caller.templates.delete({ id: t!.id });
    expect(deleted.success).toBe(true);

    const listAfter = await caller.templates.list();
    const stillThere = listAfter.find((x: any) => x.name === "Delete Test Template");
    expect(stillThere).toBeUndefined();
  });
});

// ─── Follow-Up Date Tests ─────────────────────────────────────────────────────
describe("follow-up dates", () => {
  it("leads.setFollowUpDate > sets a follow-up date on a lead", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lead = await caller.leads.submit({
      ownerId: ctx.user!.id,
      firstName: "FollowUp",
      lastName: "Test",
      email: "followup@test.com",
      eventType: "Conference",
    });
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const isoDate = futureDate.toISOString().split("T")[0];
    const result = await caller.leads.setFollowUpDate({ id: lead.id, followUpDate: isoDate });
    expect(result.success).toBe(true);
    const fetched = await caller.leads.get({ id: lead.id });
    expect(fetched?.followUpDate).toBeDefined();
    await caller.leads.delete({ id: lead.id });
  });

  it("leads.setFollowUpDate > clears a follow-up date when null is passed", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lead = await caller.leads.submit({
      ownerId: ctx.user!.id,
      firstName: "ClearFollowUp",
      lastName: "Test",
      email: "clearfollowup@test.com",
    });
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    await caller.leads.setFollowUpDate({ id: lead.id, followUpDate: futureDate.toISOString().split("T")[0] });
    const cleared = await caller.leads.setFollowUpDate({ id: lead.id, followUpDate: null });
    expect(cleared.success).toBe(true);
    const fetched = await caller.leads.get({ id: lead.id });
    expect(fetched?.followUpDate).toBeNull();
    await caller.leads.delete({ id: lead.id });
  });

  it("leads.overdue > returns only leads with past followUpDate and active status", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const overdueLead = await caller.leads.submit({
      ownerId: ctx.user!.id,
      firstName: "Overdue",
      lastName: "Lead",
      email: "overdue@test.com",
      eventType: "Wedding",
    });
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 2);
    await caller.leads.setFollowUpDate({ id: overdueLead.id, followUpDate: pastDate.toISOString().split("T")[0] });
    const upcomingLead = await caller.leads.submit({
      ownerId: ctx.user!.id,
      firstName: "Upcoming",
      lastName: "Lead",
      email: "upcoming@test.com",
    });
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    await caller.leads.setFollowUpDate({ id: upcomingLead.id, followUpDate: futureDate.toISOString().split("T")[0] });
    const overdue = await caller.leads.overdue();
    const overdueIds = overdue.map((l: any) => l.id);
    expect(overdueIds).toContain(overdueLead.id);
    expect(overdueIds).not.toContain(upcomingLead.id);
    await caller.leads.delete({ id: overdueLead.id });
    await caller.leads.delete({ id: upcomingLead.id });
  });

  it("leads.overdue > excludes booked/lost/cancelled leads even if past followUpDate", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lead = await caller.leads.submit({
      ownerId: ctx.user!.id,
      firstName: "Booked",
      lastName: "Lead",
      email: "booked@test.com",
    });
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    await caller.leads.setFollowUpDate({ id: lead.id, followUpDate: pastDate.toISOString().split("T")[0] });
    await caller.leads.updateStatus({ id: lead.id, status: "booked" });
    const overdue = await caller.leads.overdue();
    const overdueIds = overdue.map((l: any) => l.id);
    expect(overdueIds).not.toContain(lead.id);
    await caller.leads.delete({ id: lead.id });
  });

  it("dashboard.stats > overdueFollowUps count increments when overdue lead added", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const statsBefore = await caller.dashboard.stats();
    const beforeCount = statsBefore.overdueFollowUps ?? 0;
    const lead = await caller.leads.submit({
      ownerId: ctx.user!.id,
      firstName: "StatOverdue",
      lastName: "Lead",
      email: "statoverdue@test.com",
    });
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    await caller.leads.setFollowUpDate({ id: lead.id, followUpDate: pastDate.toISOString().split("T")[0] });
    const statsAfter = await caller.dashboard.stats();
    expect(statsAfter.overdueFollowUps).toBe(beforeCount + 1);
    await caller.leads.delete({ id: lead.id });
  });
});

// ─── Bulk Status Update Tests ─────────────────────────────────────────────────
describe("bulk status update", () => {
  it("leads.bulkUpdateStatus > updates multiple leads at once", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Create 3 new leads
    const lead1 = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "Bulk1", email: "bulk1@test.com" });
    const lead2 = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "Bulk2", email: "bulk2@test.com" });
    const lead3 = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "Bulk3", email: "bulk3@test.com" });
    expect(lead1.status).toBe("new");
    // Bulk update all 3 to "contacted"
    const result = await caller.leads.bulkUpdateStatus({ ids: [lead1.id, lead2.id, lead3.id], status: "contacted" });
    expect(result.updated).toBe(3);
    // Verify each was updated
    const fetched1 = await caller.leads.get({ id: lead1.id });
    const fetched2 = await caller.leads.get({ id: lead2.id });
    expect(fetched1?.status).toBe("contacted");
    expect(fetched2?.status).toBe("contacted");
    // Cleanup
    await caller.leads.delete({ id: lead1.id });
    await caller.leads.delete({ id: lead2.id });
    await caller.leads.delete({ id: lead3.id });
  });

  it("leads.bulkUpdateStatus > rejects empty ids array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.leads.bulkUpdateStatus({ ids: [], status: "contacted" })).rejects.toThrow();
  });

  it("leads.bulkUpdateStatus > requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.leads.bulkUpdateStatus({ ids: [1], status: "contacted" })).rejects.toThrow();
  });

  it("leads.followUpsByMonth > returns leads with followUpDate in the given month", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const now = new Date();
    const lead = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "CalLead", email: "callead@test.com" });
    const thisMonthDate = new Date(now.getFullYear(), now.getMonth(), 15);
    await caller.leads.setFollowUpDate({ id: lead.id, followUpDate: thisMonthDate.toISOString().split("T")[0] });
    const results = await caller.leads.followUpsByMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
    const ids = results.map((l: any) => l.id);
    expect(ids).toContain(lead.id);
    // Cleanup
    await caller.leads.delete({ id: lead.id });
  });
});
