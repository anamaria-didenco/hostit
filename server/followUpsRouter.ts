/**
 * Settings → Follow-ups (alerts + automatic client emails) and the lead
 * drawer's response-time / "what's scheduled next" line.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb, getVenueSettings, upsertVenueSettings, addLeadActivity } from "./db";
import { leads } from "../drizzle/schema";
import {
  applySequenceUpdate, readSequenceSettings, SEQUENCE_KEYS, SEQUENCE_BY_KEY, type SequenceKey,
} from "@shared/followUpSequences";
import { DEFAULT_BUSINESS_HOURS } from "@shared/businessHours";
import { DEFAULT_REPLY_OVERDUE_HOURS, isAwaitingFirstReply, replyDueAt } from "./speedToLead";
import {
  enquiryFormLinkFor, leadFollowUpOutlook, proposalLinkFor, renderFollowUpEmail,
} from "./followUpSequences";

const sequenceKey = z.enum(SEQUENCE_KEYS as [SequenceKey, ...SequenceKey[]]);

async function readSettings(ownerId: number) {
  const vs = await getVenueSettings(ownerId);
  return {
    vs,
    alertEmailsEnabled: (vs?.alertEmailsEnabled ?? 1) !== 0,
    alertEmailKinds: ((vs?.alertEmailKinds as Record<string, boolean> | null) ?? {}),
    replyOverdueEnabled: (vs?.replyOverdueEnabled ?? 1) !== 0,
    replyOverdueHours: vs?.replyOverdueHours ?? DEFAULT_REPLY_OVERDUE_HOURS,
    sequences: readSequenceSettings(vs?.followUpSequences),
  };
}

export const followUpsRouter = router({
  settings: protectedProcedure.query(async ({ ctx }) => {
    const s = await readSettings(ctx.user.id);
    return {
      alertEmailsEnabled: s.alertEmailsEnabled,
      alertEmailKinds: s.alertEmailKinds,
      replyOverdueEnabled: s.replyOverdueEnabled,
      replyOverdueHours: s.replyOverdueHours,
      sequences: s.sequences,
      smtpConfigured: !!(s.vs?.smtpHost && s.vs?.smtpUser && s.vs?.smtpPass),
      hasNotificationEmail: !!s.vs?.notificationEmail?.trim(),
    };
  }),

  updateAlerts: protectedProcedure
    .input(z.object({
      alertEmailsEnabled: z.boolean().optional(),
      alertEmailKinds: z.record(z.string().max(40), z.boolean()).optional(),
      replyOverdueEnabled: z.boolean().optional(),
      replyOverdueHours: z.number().int().min(1).max(24).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, any> = {};
      if (input.alertEmailsEnabled !== undefined) data.alertEmailsEnabled = input.alertEmailsEnabled ? 1 : 0;
      if (input.alertEmailKinds !== undefined) data.alertEmailKinds = input.alertEmailKinds;
      if (input.replyOverdueEnabled !== undefined) data.replyOverdueEnabled = input.replyOverdueEnabled ? 1 : 0;
      if (input.replyOverdueHours !== undefined) data.replyOverdueHours = input.replyOverdueHours;
      await upsertVenueSettings(ctx.user.id, data);
      return { success: true };
    }),

  updateSequence: protectedProcedure
    .input(z.object({
      key: sequenceKey,
      enabled: z.boolean().optional(),
      delay: z.number().int().min(1).max(90).optional(),
      subject: z.string().max(255).optional(),
      body: z.string().max(5000).optional(),
      secondEnabled: z.boolean().optional(),
      secondDelay: z.number().int().min(1).max(90).optional(),
      secondSubject: z.string().max(255).optional(),
      secondBody: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { key, ...patch } = input;
      const s = await readSettings(ctx.user.id);
      const next = applySequenceUpdate(s.sequences, key, patch, new Date());
      await upsertVenueSettings(ctx.user.id, { followUpSequences: next } as any);
      return next[key];
    }),

  /** Render a sequence's email with sample details, exactly as it would send. */
  preview: protectedProcedure
    .input(z.object({ key: sequenceKey, subject: z.string().max(255), body: z.string().max(5000) }))
    .query(async ({ ctx, input }) => {
      const vs = await getVenueSettings(ctx.user.id);
      const def = SEQUENCE_BY_KEY[input.key];
      const eventDate = new Date(Date.now() + 60 * 86_400_000);
      return renderFollowUpEmail({
        subject: input.subject, body: input.body,
        lead: { firstName: "Jane", lastName: "Smith", email: "jane@example.com", eventType: "Birthday Party", eventDate, guestCount: 60 },
        venue: { ...(vs ?? {}), name: vs?.name || vs?.smtpFromName || "Your venue" },
        proposalLink: def.extraVars.includes("proposalLink") ? proposalLinkFor("example") : undefined,
        enquiryFormLink: enquiryFormLinkFor(vs?.slug),
      });
    }),

  /** Response time and the next automatic follow-up for one lead. */
  leadStatus: protectedProcedure
    .input(z.object({ leadId: z.number() }))
    .query(async ({ ctx, input }) => {
      const outlook = await leadFollowUpOutlook(ctx.user.id, input.leadId);
      if (!outlook) return null;
      const { lead } = outlook;
      const s = await readSettings(ctx.user.id);
      const awaiting = isAwaitingFirstReply(lead);
      return {
        createdAt: lead.createdAt,
        firstResponseAt: lead.firstResponseAt,
        awaitingReply: awaiting,
        replyDueAt: awaiting ? replyDueAt(lead.createdAt, s.replyOverdueHours, DEFAULT_BUSINESS_HOURS) : null,
        replyOverdueHours: s.replyOverdueHours,
        followUps: {
          anyEnabled: outlook.anyEnabled,
          paused: outlook.paused,
          sentCount: outlook.sentCount,
          next: outlook.next,
        },
      };
    }),

  /** "Stop for this lead" / resume. */
  setLeadPaused: protectedProcedure
    .input(z.object({ leadId: z.number(), paused: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
      const updated = await db.update(leads).set({ followUpsPaused: input.paused })
        .where(and(eq(leads.id, input.leadId), eq(leads.ownerId, ctx.user.id)))
        .returning({ id: leads.id });
      if (updated.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Enquiry not found" });
      await addLeadActivity({
        leadId: input.leadId, ownerId: ctx.user.id, type: "note",
        content: input.paused ? "Automatic follow-ups stopped for this enquiry" : "Automatic follow-ups turned back on for this enquiry",
      });
      return { paused: input.paused };
    }),
});


