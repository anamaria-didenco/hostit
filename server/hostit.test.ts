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

// ─── Drinks Selection Tests ───────────────────────────────────────────────────
describe("drinks selection", () => {
  it("proposals.saveDrinks > saves a drinks selection for a proposal", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lead = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "DrinksTest", email: "drinks@test.com" });
    const proposal = await caller.proposals.create({ leadId: lead.id, title: "Drinks Test Proposal", status: "draft" });
    const result = await caller.proposals.saveDrinks({
      proposalId: proposal.id,
      barOption: "bar_tab",
      tabAmount: 1500,
      selectedDrinks: ["aperol_spritz", "classic_negroni", "tallero_prosecco"],
      customDrinks: [{ name: "House Limoncello", description: "House made", price: 15 }],
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    // Verify saved by fetching
    const saved = await caller.proposals.getDrinks({ proposalId: proposal.id });
    expect(saved).toBeDefined();
    expect(saved?.barOption).toBe("bar_tab");
    // Cleanup
    await caller.leads.delete({ id: lead.id });
  });

  it("proposals.saveDrinks > requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.proposals.saveDrinks({
      proposalId: 1,
      barOption: "cash_bar",
      selectedDrinks: [],
      customDrinks: [],
    })).rejects.toThrow();
  });

  it("proposals.saveDrinks > validates barOption enum", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.proposals.saveDrinks({
      proposalId: 1,
      barOption: "invalid_option" as any,
      selectedDrinks: [],
      customDrinks: [],
    })).rejects.toThrow();
  });

  it("proposals.getDrinks > returns null for proposal with no drinks saved", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lead = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "NoDrinks", email: "nodrinks@test.com" });
    const proposal = await caller.proposals.create({ leadId: lead.id, title: "No Drinks Proposal", status: "draft" });
    const result = await caller.proposals.getDrinks({ proposalId: proposal.id });
    expect(result).toBeNull();
    // Cleanup
    await caller.leads.delete({ id: lead.id });
  });
});

// ─── Quote Tests ──────────────────────────────────────────────────────────────
describe("quote", () => {
  it("quote.save > saves minimum spend settings for a proposal", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lead = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "QuoteTest", email: "quotetest@test.com" });
    const proposal = await caller.proposals.create({ leadId: lead.id, title: "Quote Test Proposal", status: "draft" });
    const result = await caller.quote.save({
      proposalId: proposal.id,
      minimumSpend: 5000,
      autoBarTab: true,
      notes: "Min spend includes food and bar tab",
      items: [
        { type: "hire", name: "Centrepieces", description: "Floral centrepieces", qty: 10, unitPrice: 50, sortOrder: 0 },
        { type: "styling", name: "Fairy Lights", description: "Ceiling installation", qty: 1, unitPrice: 300, sortOrder: 1 },
      ],
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    // Cleanup
    await caller.leads.delete({ id: lead.id });
  });

  it("quote.get > returns saved quote for a proposal", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const lead = await caller.leads.submit({ ownerId: ctx.user!.id, firstName: "QuoteGet", email: "quoteget@test.com" });
    const proposal = await caller.proposals.create({ leadId: lead.id, title: "Quote Get Proposal", status: "draft" });
    await caller.quote.save({
      proposalId: proposal.id,
      minimumSpend: 3000,
      autoBarTab: false,
      items: [],
    });
    const result = await caller.quote.get({ proposalId: proposal.id });
    expect(result).toBeDefined();
    expect(result?.settings).not.toBeNull();
    expect(Number(result?.settings?.minimumSpend)).toBe(3000);
    // Cleanup
    await caller.leads.delete({ id: lead.id });
  });

  it("quote.save > requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.quote.save({
      proposalId: 1,
      items: [],
    })).rejects.toThrow();
  });
});

// ─── Floor Plan Tests ─────────────────────────────────────────────────────────
describe("floorPlans", () => {
  it("floorPlans.save > creates a new floor plan", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.floorPlans.save({
      name: "Test Floor Plan",
      canvasData: { elements: [{ id: "abc", type: "round_table", x: 100, y: 100, w: 80, h: 80 }] },
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    // Cleanup
    await caller.floorPlans.delete({ id: result.id });
  });

  it("floorPlans.list > returns floor plans for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const plan = await caller.floorPlans.save({ name: "List Test Plan", canvasData: {} });
    const list = await caller.floorPlans.list({});
    expect(Array.isArray(list)).toBe(true);
    const ids = list.map((p: any) => p.id);
    expect(ids).toContain(plan.id);
    // Cleanup
    await caller.floorPlans.delete({ id: plan.id });
  });

  it("floorPlans.save > requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.floorPlans.save({ name: "Unauth Plan", canvasData: {} })).rejects.toThrow();
  });
});

// ─── Checklist Tests ──────────────────────────────────────────────────────────
describe("checklists", () => {
  it("checklists.createTemplate > creates a checklist template", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.checklists.createTemplate({
      name: "Wedding Setup",
      description: "Standard wedding reception setup",
      items: [
        { id: "1", text: "Set up tables and chairs" },
        { id: "2", text: "Prepare bar station" },
        { id: "3", text: "Check AV equipment" },
      ],
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    // Cleanup
    await caller.checklists.deleteTemplate({ id: result.id });
  });

  it("checklists.listTemplates > returns templates for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const template = await caller.checklists.createTemplate({
      name: "List Test Template",
      items: [{ id: "1", text: "Task 1" }],
    });
    const list = await caller.checklists.listTemplates();
    expect(Array.isArray(list)).toBe(true);
    const ids = list.map((t: any) => t.id);
    expect(ids).toContain(template.id);
    // Cleanup
    await caller.checklists.deleteTemplate({ id: template.id });
  });

  it("checklists.createTemplate > requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.checklists.createTemplate({
      name: "Unauth Template",
      items: [],
    })).rejects.toThrow();
  });
});

// ─── Runsheet Tests ───────────────────────────────────────────────────────────
describe("runsheets", () => {
  it("runsheets.create > creates a runsheet with items", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.runsheets.create({
      title: "Test Wedding Runsheet",
      eventType: "Wedding",
      guestCount: 80,
      items: [
        { time: "14:00", duration: 60, title: "Setup", category: "setup", sortOrder: 0 },
        { time: "15:00", duration: 30, title: "Guest arrival", category: "guest", sortOrder: 1 },
      ],
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    // Cleanup
    await caller.runsheets.delete({ id: result.id });
  });

  it("runsheets.get > returns runsheet with items", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const created = await caller.runsheets.create({
      title: "Get Test Runsheet",
      eventType: "Birthday",
      items: [
        { time: "18:00", duration: 30, title: "Arrival", category: "guest", sortOrder: 0 },
      ],
    });
    const sheet = await caller.runsheets.get({ id: created.id });
    expect(sheet).not.toBeNull();
    expect(sheet!.title).toBe("Get Test Runsheet");
    expect(Array.isArray(sheet!.items)).toBe(true);
    expect(sheet!.items.length).toBe(1);
    // Cleanup
    await caller.runsheets.delete({ id: created.id });
  });

  it("runsheets.list > returns list for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const created = await caller.runsheets.create({
      title: "List Test Runsheet",
    });
    const list = await caller.runsheets.list({});
    expect(Array.isArray(list)).toBe(true);
    const ids = list.map((r: any) => r.id);
    expect(ids).toContain(created.id);
    // Cleanup
    await caller.runsheets.delete({ id: created.id });
  });

  it("runsheets.update > updates runsheet metadata", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const created = await caller.runsheets.create({ title: "Update Test" });
    const result = await caller.runsheets.update({
      id: created.id,
      title: "Updated Title",
      guestCount: 120,
    });
    expect(result.success).toBe(true);
    const sheet = await caller.runsheets.get({ id: created.id });
    expect(sheet!.title).toBe("Updated Title");
    expect(sheet!.guestCount).toBe(120);
    // Cleanup
    await caller.runsheets.delete({ id: created.id });
  });

  it("runsheets.create > requires authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.runsheets.create({ title: "Unauth" })).rejects.toThrow();
  });
});
