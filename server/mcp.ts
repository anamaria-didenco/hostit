// MCP (Model Context Protocol) HTTP endpoint for VenueFlow.
// Lets Claude (Desktop / claude.ai) connect to VenueFlow as a remote tool source.
// Auth: `Authorization: Bearer vfk_...` API token issued from Settings → Integrations.

import type { Request, Response } from "express";
import { createHash } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

async function authenticate(req: Request): Promise<{ ownerId: number; tokenId: number } | null> {
  const header = req.header("authorization") || req.header("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const token = m[1].trim();
  if (!token.startsWith("vfk_")) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { getDb } = await import("./db");
  const { apiTokens } = await import("../drizzle/schema");
  const { eq, and, isNull } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Best-effort lastUsedAt update; don't await failures.
  db.update(apiTokens).set({ lastUsedAt: Date.now() }).where(eq(apiTokens.id, row.id)).catch(() => {});
  return { ownerId: row.ownerId, tokenId: row.id };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function buildServer(ctx: { ownerId: number }): McpServer {
  const server = new McpServer({ name: "venueflow", version: "1.0.0" });

  // ─── Leads / enquiries ────────────────────────────────────────────────────
  server.tool(
    "list_leads",
    "List enquiry leads for the venue. Optionally filter by status (new, contacted, proposal_sent, negotiating, booked, lost, cancelled).",
    { status: z.string().optional() },
    async ({ status }) => {
      const { getDb } = await import("./db");
      const { leads } = await import("../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok([]);
      const where = status
        ? and(eq(leads.ownerId, ctx.ownerId), eq(leads.status, status as any))
        : eq(leads.ownerId, ctx.ownerId);
      const rows = await db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(200);
      return ok(rows);
    }
  );

  server.tool(
    "get_lead",
    "Fetch a single lead/enquiry by id, including notes and activity.",
    { id: z.number() },
    async ({ id }) => {
      const { getDb } = await import("./db");
      const { leads, leadActivity } = await import("../drizzle/schema");
      const { eq, and, asc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok(null);
      const [lead] = await db.select().from(leads)
        .where(and(eq(leads.id, id), eq(leads.ownerId, ctx.ownerId))).limit(1);
      if (!lead) return ok(null);
      const activity = await db.select().from(leadActivity)
        .where(eq(leadActivity.leadId, id)).orderBy(asc(leadActivity.createdAt));
      return ok({ lead, activity });
    }
  );

  server.tool(
    "create_lead",
    "Create a new enquiry/lead in the pipeline.",
    {
      firstName: z.string().min(1),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      eventType: z.string().optional(),
      eventDate: z.string().optional().describe("ISO date YYYY-MM-DD"),
      guestCount: z.number().optional(),
      message: z.string().optional(),
    },
    async (input) => {
      const { getDb } = await import("./db");
      const { leads } = await import("../drizzle/schema");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [created] = await db.insert(leads).values({
        ownerId: ctx.ownerId,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        eventType: input.eventType ?? null,
        eventDate: input.eventDate ?? null,
        guestCount: input.guestCount ?? null,
        message: input.message ?? null,
        status: "new",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any).returning({ id: leads.id });
      return ok({ id: created.id, success: true });
    }
  );

  server.tool(
    "update_lead_status",
    "Change a lead's pipeline status (new, contacted, proposal_sent, negotiating, booked, lost, cancelled).",
    { id: z.number(), status: z.string(), note: z.string().optional() },
    async ({ id, status, note }) => {
      const { getDb } = await import("./db");
      const { leads, leadActivity } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(leads).set({ status: status as any, updatedAt: Date.now() } as any)
        .where(and(eq(leads.id, id), eq(leads.ownerId, ctx.ownerId)));
      if (note) {
        await db.insert(leadActivity).values({
          leadId: id, ownerId: ctx.ownerId, type: "status_change", content: note, createdAt: Date.now(),
        } as any);
      }
      return ok({ success: true });
    }
  );

  server.tool(
    "add_lead_note",
    "Add an internal note to a lead's activity feed.",
    { leadId: z.number(), content: z.string().min(1) },
    async ({ leadId, content }) => {
      const { getDb } = await import("./db");
      const { leads, leadActivity } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Verify lead belongs to this owner before writing — prevents cross-tenant note injection.
      const [owned] = await db.select({ id: leads.id }).from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.ownerId, ctx.ownerId))).limit(1);
      if (!owned) throw new Error("Lead not found");
      await db.insert(leadActivity).values({
        leadId, ownerId: ctx.ownerId, type: "note", content, createdAt: Date.now(),
      } as any);
      return ok({ success: true });
    }
  );

  // ─── Bookings ─────────────────────────────────────────────────────────────
  server.tool(
    "list_bookings",
    "List confirmed/tentative bookings. Optionally filter by status (confirmed, tentative, cancelled, finished).",
    { status: z.string().optional() },
    async ({ status }) => {
      const { getDb } = await import("./db");
      const { bookings } = await import("../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok([]);
      const where = status
        ? and(eq(bookings.ownerId, ctx.ownerId), eq(bookings.status, status as any))
        : eq(bookings.ownerId, ctx.ownerId);
      const rows = await db.select().from(bookings).where(where).orderBy(desc(bookings.eventDate)).limit(200);
      return ok(rows);
    }
  );

  server.tool(
    "get_booking",
    "Fetch a single booking by id.",
    { id: z.number() },
    async ({ id }) => {
      const { getDb } = await import("./db");
      const { bookings } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok(null);
      const [row] = await db.select().from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.ownerId, ctx.ownerId))).limit(1);
      return ok(row ?? null);
    }
  );

  server.tool(
    "update_booking_status",
    "Update a booking's status (confirmed, tentative, cancelled, finished).",
    { id: z.number(), status: z.enum(["confirmed", "tentative", "cancelled", "finished"]) },
    async ({ id, status }) => {
      const { getDb } = await import("./db");
      const { bookings } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(bookings).set({ status, updatedAt: new Date() } as any)
        .where(and(eq(bookings.id, id), eq(bookings.ownerId, ctx.ownerId)));
      return ok({ success: true });
    }
  );

  // ─── Runsheets (incl. dietaries) ──────────────────────────────────────────
  server.tool(
    "list_runsheets",
    "List runsheets (event sheets), most recent first.",
    {},
    async () => {
      const { getDb } = await import("./db");
      const { runsheets } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok([]);
      const rows = await db.select({
        id: runsheets.id, title: runsheets.title, eventDate: runsheets.eventDate,
        bookingId: runsheets.bookingId, leadId: runsheets.leadId, spaceName: runsheets.spaceName,
        guestCount: runsheets.guestCount,
      }).from(runsheets).where(eq(runsheets.ownerId, ctx.ownerId)).orderBy(desc(runsheets.eventDate)).limit(200);
      return ok(rows);
    }
  );

  server.tool(
    "get_runsheet",
    "Fetch a runsheet by id, including timeline items, F&B items, dietaries and drinks.",
    { id: z.number() },
    async ({ id }) => {
      const { getDb } = await import("./db");
      const { runsheets, runsheetItems, fnbItems } = await import("../drizzle/schema");
      const { eq, and, asc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok(null);
      const [rs] = await db.select().from(runsheets)
        .where(and(eq(runsheets.id, id), eq(runsheets.ownerId, ctx.ownerId))).limit(1);
      if (!rs) return ok(null);
      const items = await db.select().from(runsheetItems)
        .where(eq(runsheetItems.runsheetId, id)).orderBy(asc(runsheetItems.sortOrder));
      const fnb = await db.select().from(fnbItems)
        .where(eq(fnbItems.runsheetId, id)).orderBy(asc(fnbItems.sortOrder));
      return ok({ runsheet: rs, items, fnb });
    }
  );

  server.tool(
    "set_runsheet_dietaries",
    "Set the dietary requirements summary on a runsheet. Replaces the existing list.",
    {
      id: z.number(),
      dietaries: z.array(z.object({
        name: z.string(),
        count: z.number(),
        notes: z.string().optional(),
      })),
    },
    async ({ id, dietaries }) => {
      const { getDb } = await import("./db");
      const { runsheets } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(runsheets).set({ dietaries, updatedAt: new Date() } as any)
        .where(and(eq(runsheets.id, id), eq(runsheets.ownerId, ctx.ownerId)));
      return ok({ success: true });
    }
  );

  server.tool(
    "list_staff_portal_links",
    "List staff portal share links for a runsheet (public live link tokens).",
    { runsheetId: z.number() },
    async ({ runsheetId }) => {
      const { getDb } = await import("./db");
      const { staffPortalLinks } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok([]);
      const rows = await db.select().from(staffPortalLinks)
        .where(and(eq(staffPortalLinks.runsheetId, runsheetId), eq(staffPortalLinks.ownerId, ctx.ownerId)));
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "https://venueflowhq.com";
      return ok(rows.map(r => ({ ...r, url: `${baseUrl}/staff/${r.token}` })));
    }
  );

  // ─── Daily checklists ─────────────────────────────────────────────────────
  server.tool(
    "list_daily_checklists",
    "List daily ops checklists.",
    {},
    async () => {
      const { getDb } = await import("./db");
      const { dailyChecklists } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok([]);
      const rows = await db.select().from(dailyChecklists)
        .where(eq(dailyChecklists.ownerId, ctx.ownerId)).orderBy(desc(dailyChecklists.createdAt)).limit(100);
      return ok(rows);
    }
  );

  // ─── Proposals ────────────────────────────────────────────────────────────
  server.tool(
    "list_proposals",
    "List proposals.",
    {},
    async () => {
      const { getDb } = await import("./db");
      const { proposals } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok([]);
      const rows = await db.select().from(proposals)
        .where(eq(proposals.ownerId, ctx.ownerId)).orderBy(desc(proposals.createdAt)).limit(100);
      return ok(rows);
    }
  );

  // ─── Search across leads & bookings ──────────────────────────────────────
  server.tool(
    "search",
    "Search leads and bookings by name, email or company. Useful for 'find Alice Lane', etc.",
    { query: z.string().min(1) },
    async ({ query }) => {
      const { getDb } = await import("./db");
      const { leads, bookings } = await import("../drizzle/schema");
      const { eq, and, or, ilike } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return ok({ leads: [], bookings: [] });
      const q = `%${query}%`;
      const leadRows = await db.select().from(leads).where(and(
        eq(leads.ownerId, ctx.ownerId),
        or(ilike(leads.firstName, q), ilike(leads.lastName, q), ilike(leads.email, q), ilike(leads.company, q)),
      )).limit(25);
      const bookRows = await db.select().from(bookings).where(and(
        eq(bookings.ownerId, ctx.ownerId),
        or(ilike(bookings.firstName, q), ilike(bookings.lastName, q), ilike(bookings.email, q), ilike(bookings.spaceName, q)),
      )).limit(25);
      return ok({ leads: leadRows, bookings: bookRows });
    }
  );

  return server;
}

export async function handleMcp(req: Request, res: Response): Promise<void> {
  try {
    const auth = await authenticate(req);
    if (!auth) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized — supply 'Authorization: Bearer vfk_...' header" },
        id: null,
      });
      return;
    }
    const server = buildServer({ ownerId: auth.ownerId });
    // Stateless mode — each request gets its own server+transport pair.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e: any) {
    console.error("[MCP] Error:", e);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP error", data: String(e?.message ?? e) },
        id: null,
      });
    }
  }
}
