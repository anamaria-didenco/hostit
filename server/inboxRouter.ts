/**
 * tRPC for the email inbox: Settings (connect, test, check now) and the
 * enquiry conversation (messages for a lead, who's waiting on whom).
 * Staff logins can't reach any of it ("inbox." is a blocked read prefix and
 * mutations are blocked by default); team-link sessions can't touch settings.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { leadMessages, leads, venueSettings } from "../drizzle/schema";
import { inboxConnected, pollInboxForOwner, testInboxConnection, venueInboxConfig } from "./inbox";
import { guessImapHost } from "./inboxParse";

const hostSchema = z.string().trim().max(255).regex(/^[A-Za-z0-9.-]*$/, "Use a server name like imap.gmail.com");
const connectionInput = z.object({
  host: hostSchema,
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(320),
  // Blank = keep the saved password. Never sent back to the browser.
  pass: z.string().max(500).optional(),
  // "Use the same login as outgoing email": take the saved SMTP password.
  useSmtpPassword: z.boolean().optional(),
  folder: z.string().trim().max(255).optional(),
});

function assertOwner(ctx: any) {
  if (ctx.isTeamMember) throw new TRPCError({ code: "FORBIDDEN", message: "Only the venue owner can change the inbox connection." });
}

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
  return d;
}

/** Which password to use: typed > SMTP (when asked and the login matches) > saved (when the account is unchanged). */
function resolvePassword(input: z.infer<typeof connectionInput>, vs: any): string {
  if (input.pass) return input.pass;
  if (input.useSmtpPassword && vs?.smtpPass && String(vs.smtpUser ?? "").trim().toLowerCase() === input.user.toLowerCase()) return vs.smtpPass;
  const sameAccount = String(vs?.imapHost ?? "").toLowerCase() === input.host.toLowerCase()
    && String(vs?.imapUser ?? "").toLowerCase() === input.user.toLowerCase();
  return sameAccount ? String(vs?.imapPass ?? "") : "";
}

export const inboxRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    assertOwner(ctx);
    const d = await db();
    const [vs] = await d.select().from(venueSettings).where(eq(venueSettings.ownerId, ctx.user.id)).limit(1);
    return {
      enabled: (vs?.imapEnabled ?? 0) === 1,
      host: vs?.imapHost ?? "",
      port: vs?.imapPort ?? 993,
      secure: (vs?.imapSecure ?? 1) === 1,
      user: vs?.imapUser ?? "",
      folder: vs?.imapFolder || "INBOX",
      hasPassword: !!vs?.imapPass,
      connected: inboxConnected(vs),
      lastCheckedAt: vs?.imapLastCheckedAt ?? null,
      lastError: vs?.imapLastError ?? null,
      // For "Use the same login as outgoing email".
      smtp: vs?.smtpUser ? {
        host: guessImapHost(vs.smtpHost),
        user: vs.smtpUser,
        hasPassword: !!vs.smtpPass,
      } : null,
    };
  }),

  saveSettings: protectedProcedure
    .input(connectionInput.extend({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx);
      const d = await db();
      const [vs] = await d.select().from(venueSettings).where(eq(venueSettings.ownerId, ctx.user.id)).limit(1);
      if (!vs) throw new TRPCError({ code: "BAD_REQUEST", message: "Save your venue details first." });
      const pass = resolvePassword(input, vs);
      const folder = input.folder || "INBOX";
      if (input.enabled && (!input.host || !input.user || !pass)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add the server, username and password before switching the inbox on." });
      }
      // A different mailbox means the saved UID cursor no longer applies.
      const accountChanged = (vs.imapHost ?? "").toLowerCase() !== input.host.toLowerCase()
        || (vs.imapUser ?? "").toLowerCase() !== input.user.toLowerCase()
        || (vs.imapFolder || "INBOX") !== folder
        || (vs.imapPort ?? 993) !== input.port;
      await d.update(venueSettings).set({
        imapEnabled: input.enabled ? 1 : 0,
        imapHost: input.host || null,
        imapPort: input.port,
        imapSecure: input.secure ? 1 : 0,
        imapUser: input.user || null,
        imapPass: pass || null,
        imapFolder: folder,
        ...(accountChanged ? { imapLastUid: null, imapUidValidity: null, imapLastCheckedAt: null, imapLastError: null } : {}),
        updatedAt: new Date(),
      }).where(eq(venueSettings.ownerId, ctx.user.id));
      return { success: true };
    }),

  testConnection: protectedProcedure
    .input(connectionInput)
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx);
      const d = await db();
      const [vs] = await d.select().from(venueSettings).where(eq(venueSettings.ownerId, ctx.user.id)).limit(1);
      const pass = resolvePassword(input, vs);
      if (!input.host || !input.user || !pass) {
        return { ok: false as const, message: "Fill in the server, username and password first." };
      }
      return testInboxConnection({ ...venueInboxConfig({}), host: input.host, port: input.port, secure: input.secure, user: input.user, pass, folder: input.folder || "INBOX" });
    }),

  checkNow: protectedProcedure.mutation(async ({ ctx }) => {
    assertOwner(ctx);
    try {
      const r = await pollInboxForOwner(ctx.user.id);
      return { ok: true as const, ...r };
    } catch (err: any) {
      return { ok: false as const, message: String(err?.message ?? "Couldn't check the inbox.") };
    }
  }),

  /** The conversation on one enquiry, oldest first. Never includes HTML. */
  forLead: protectedProcedure
    .input(z.object({ leadId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const d = await db();
      return d.select({
        id: leadMessages.id,
        direction: leadMessages.direction,
        fromEmail: leadMessages.fromEmail,
        fromName: leadMessages.fromName,
        toEmail: leadMessages.toEmail,
        subject: leadMessages.subject,
        bodyText: leadMessages.bodyText,
        fullText: leadMessages.fullText,
        attachments: leadMessages.attachments,
        messageId: leadMessages.messageId,
        references: leadMessages.references,
        receivedAt: leadMessages.receivedAt,
      })
        .from(leadMessages)
        .where(and(eq(leadMessages.ownerId, ctx.user.id), eq(leadMessages.leadId, input.leadId)))
        .orderBy(asc(leadMessages.receivedAt), asc(leadMessages.id))
        .limit(200);
    }),

  /** Latest message per enquiry, for the "Awaiting your reply" chip in the list. */
  replyStatus: protectedProcedure.query(async ({ ctx }) => {
    const d = await db();
    const rows = await d.execute(sql`
      SELECT DISTINCT ON (m."leadId") m."leadId" AS "leadId", m."direction" AS "direction", m."receivedAt" AS "at"
      FROM ${leadMessages} m
      JOIN ${leads} l ON l."id" = m."leadId" AND l."ownerId" = ${ctx.user.id}
      WHERE m."ownerId" = ${ctx.user.id}
      ORDER BY m."leadId", m."receivedAt" DESC, m."id" DESC
    `);
    const list = (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as { leadId: number; direction: string; at: string | Date }[];
    return list.map(r => ({ leadId: Number(r.leadId), direction: r.direction === "in" ? "in" as const : "out" as const, at: new Date(r.at) }));
  }),
});
