import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getVenueSettings, upsertVenueSettings,
  getEventSpaces, createEventSpace,
  getContacts, getContactById, createContact,
  getLeads, getLeadById, createLead, updateLeadStatus, updateLead,
  getLeadActivity, addLeadActivity,
  getProposals, getProposalById, getProposalByToken, getProposalsByLead, createProposal, updateProposal,
  getBookings, getBookingsByMonth, createBooking,
  getDashboardStats,
} from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Venue Settings ────────────────────────────────────────────────────────
  venue: router({
    get: publicProcedure
      .input(z.object({ ownerId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const id = input.ownerId ?? ctx.user?.id;
        if (!id) return null;
        return getVenueSettings(id);
      }),

    update: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        slug: z.string().optional(),
        tagline: z.string().optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        leadFormTitle: z.string().optional(),
        leadFormSubtitle: z.string().optional(),
        depositPercent: z.number().optional(),
        currency: z.string().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        smtpFromName: z.string().optional(),
        smtpFromEmail: z.string().optional(),
        smtpSecure: z.number().optional(),
        // New venue details fields
        internalName: z.string().optional(),
        notificationEmail: z.string().optional(),
        addressLine1: z.string().optional(),
        addressLine2: z.string().optional(),
        suburb: z.string().optional(),
        state: z.string().optional(),
        postcode: z.string().optional(),
        country: z.string().optional(),
        timezone: z.string().optional(),
        eventTimeStart: z.string().optional(),
        eventTimeEnd: z.string().optional(),
        minGroupSize: z.number().optional(),
        autoCancelTentative: z.number().optional(),
        // Venue profile fields
        bannerImageUrl: z.string().optional(),
        venueType: z.string().optional(),
        priceCategory: z.string().optional(),
        aboutVenue: z.string().optional(),
        minEventDuration: z.string().optional(),
        maxEventDuration: z.string().optional(),
        minLeadTime: z.string().optional(),
        maxLeadTime: z.string().optional(),
        bufferTime: z.string().optional(),
        operatingHours: z.string().optional(),
        primaryColor: z.string().optional(),
        themeKey: z.string().optional(),
        logoUrl: z.string().optional(),
        coverImageUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const data: Record<string, any> = { ...input };
        if (input.depositPercent !== undefined) data.depositPercent = input.depositPercent.toString();
        return upsertVenueSettings(ctx.user.id, data);
      }),
    getOwn: protectedProcedure.query(async ({ ctx }) => {      return getVenueSettings(ctx.user.id);
    }),

    upsert: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        slug: z.string().optional(),
        tagline: z.string().optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        leadFormTitle: z.string().optional(),
        leadFormSubtitle: z.string().optional(),
        depositPercent: z.number().optional(),
        smtpHost: z.string().optional(),
        smtpPort: z.number().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        smtpFromName: z.string().optional(),
        smtpFromEmail: z.string().optional(),
        smtpSecure: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const data: Record<string, any> = { ...input };
        if (input.depositPercent !== undefined) data.depositPercent = input.depositPercent.toString();
        return upsertVenueSettings(ctx.user.id, data);
      }),

    getBySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        // Find venue by slug for public lead form
        const { getDb } = await import("./db");
        const { venueSettings } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return null;
        const result = await db.select().from(venueSettings).where(eq(venueSettings.slug, input.slug)).limit(1);
        return result[0] ?? null;
      }),
  }),

  // ─── Event Spaces ──────────────────────────────────────────────────────────
  spaces: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getEventSpaces(ctx.user.id);
    }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import("./db");
        const { eventSpaces } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) return;
        await db.delete(eventSpaces).where(and(eq(eventSpaces.id, input.id), eq(eventSpaces.ownerId, ctx.user.id)));
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        minCapacity: z.number().optional(),
        maxCapacity: z.number().optional(),
        minSpend: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return createEventSpace({ ownerId: ctx.user.id, ...input });
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        minCapacity: z.number().optional().nullable(),
        maxCapacity: z.number().optional().nullable(),
        minSpend: z.number().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { eventSpaces } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return;
        const { id, ...fields } = input;
        await db.update(eventSpaces).set(fields as any).where(and(eq(eventSpaces.id, id), eq(eventSpaces.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Contacts ──────────────────────────────────────────────────────────────
  contacts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getContacts(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getContactById(input.id);
      }),

    create: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email(),
        phone: z.string().optional(),
        company: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return createContact({ ownerId: ctx.user.id, ...input });
      }),
  }),

  // ─── Leads ─────────────────────────────────────────────────────────────────
  leads: router({
    create: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        phone: z.string().optional(),
        company: z.string().optional(),
        eventType: z.string().optional(),
        eventDate: z.string().optional(),
        guestCount: z.number().optional(),
        budget: z.number().optional(),
        message: z.string().optional(),
        status: z.enum(["new", "contacted", "proposal_sent", "negotiating", "booked", "lost", "cancelled"]).optional(),
        source: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return createLead({
          ownerId: ctx.user.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email || '',
          phone: input.phone,
          company: input.company,
          eventType: input.eventType,
          eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
          guestCount: input.guestCount,
          budget: input.budget?.toString() as any,
          message: input.message,
          source: input.source ?? "manual",
          status: input.status ?? "new",
        });
      }),

    list: protectedProcedure
      .input(z.object({ status: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        return getLeads(ctx.user.id, input.status);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getLeadById(input.id);
      }),

    // Public: submit from lead form
    submit: publicProcedure
      .input(z.object({
        ownerId: z.number(),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email(),
        phone: z.string().optional(),
        company: z.string().optional(),
        eventType: z.string().optional(),
        eventDate: z.string().optional(),
        guestCount: z.number().optional(),
        budget: z.number().optional(),
        message: z.string().optional(),
        source: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const lead = await createLead({
          ownerId: input.ownerId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          company: input.company,
          eventType: input.eventType,
          eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
          guestCount: input.guestCount,
          budget: input.budget?.toString() as any,
          message: input.message,
          source: input.source ?? "lead_form",
          status: "new",
        });
        return lead;
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["new", "contacted", "proposal_sent", "negotiating", "booked", "lost", "cancelled"]),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateLeadStatus(input.id, input.status, undefined);
        await addLeadActivity({
          leadId: input.id,
          ownerId: ctx.user.id,
          type: "status_change",
          content: `Status changed to ${input.status}${input.note ? ": " + input.note : ""}`,
        });
        // When marking as booked, auto-create a booking record if one doesn't exist
        if (input.status === "booked") {
          const lead = await getLeadById(input.id);
          if (lead) {
            const existingBookings = await getBookings(ctx.user.id);
            const alreadyBooked = existingBookings.some((b: any) => b.leadId === input.id);
            if (!alreadyBooked) {
              await createBooking({
                ownerId: ctx.user.id,
                leadId: input.id,
                firstName: lead.firstName,
                lastName: lead.lastName ?? undefined,
                email: lead.email,
                eventType: lead.eventType ?? undefined,
                eventDate: lead.eventDate ?? new Date(),
                guestCount: lead.guestCount ?? undefined,
                status: "confirmed",
              });
            }
          }
        }
        return { success: true };
      }),

    addNote: protectedProcedure
      .input(z.object({ leadId: z.number(), content: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await addLeadActivity({ leadId: input.leadId, ownerId: ctx.user.id, type: "note", content: input.content });
        return { success: true };
      }),

    getActivity: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return getLeadActivity(input.leadId);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        internalNotes: z.string().optional(),
        followUpDate: z.string().optional(),
        assignedTo: z.number().optional(),
        source: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, followUpDate, ...rest } = input;
        await updateLead(id, {
          ...rest,
          followUpDate: followUpDate ? new Date(followUpDate) : undefined,
        });
        return { success: true };
      }),

    activity: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return getLeadActivity(input.leadId);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { leads } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return;
         await db.delete(leads).where(and(eq(leads.id, input.id), eq(leads.ownerId, ctx.user.id)));
        return { success: true };
      }),
    // Mark a lead as read (clears the unread badge)
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { leads } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false };
        await db.update(leads)
          .set({ readAt: new Date() })
          .where(and(eq(leads.id, input.id), eq(leads.ownerId, ctx.user.id)));
        return { success: true };
      }),

    // Dedicated follow-up date setter (convenience wrapper around update)
    setFollowUpDate: protectedProcedure
      .input(z.object({
        id: z.number(),
        followUpDate: z.string().nullable(), // ISO date string or null to clear
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateLead, addLeadActivity } = await import('./db');
        await updateLead(input.id, {
          followUpDate: input.followUpDate ? new Date(input.followUpDate) : null as any,
        });
        await addLeadActivity({
          leadId: input.id,
          ownerId: ctx.user.id,
          type: 'note',
          content: input.followUpDate
            ? `Follow-up date set to ${new Date(input.followUpDate).toLocaleDateString('en-NZ', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`
            : 'Follow-up date cleared',
        });
        return { success: true };
      }),
    // Returns leads where followUpDate is in the past and status is still active
    overdue: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { leads } = await import('../drizzle/schema');
      const { eq, and, lte, isNotNull, notInArray } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      return db.select().from(leads).where(
        and(
          eq(leads.ownerId, ctx.user.id),
          isNotNull(leads.followUpDate),
          lte(leads.followUpDate, now),
          notInArray(leads.status, ['booked', 'lost', 'cancelled']),
        )
      ).orderBy(leads.followUpDate);
    }),
    // Returns leads with a followUpDate in the given month (for calendar display)
    followUpsByMonth: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { leads } = await import('../drizzle/schema');
        const { eq, and, gte, lt, isNotNull } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const start = new Date(input.year, input.month - 1, 1);
        const end = new Date(input.year, input.month, 1);
        return db.select().from(leads).where(
          and(
            eq(leads.ownerId, ctx.user.id),
            isNotNull(leads.followUpDate),
            gte(leads.followUpDate, start),
            lt(leads.followUpDate, end),
          )
        ).orderBy(leads.followUpDate);
      }),
    // Leads with eventDate in a given month (for calendar)
    eventsByMonth: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { leads } = await import('../drizzle/schema');
        const { eq, and, gte, lt, isNotNull } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const start = new Date(input.year, input.month - 1, 1);
        const end = new Date(input.year, input.month, 1);
        return db.select().from(leads).where(
          and(
            eq(leads.ownerId, ctx.user.id),
            isNotNull(leads.eventDate),
            gte(leads.eventDate, start),
            lt(leads.eventDate, end),
          )
        ).orderBy(leads.eventDate);
      }),
    // Bulk update status for multiple leads
    bulkUpdateStatus: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()).min(1),
        status: z.enum(['new', 'contacted', 'proposal_sent', 'negotiating', 'booked', 'lost', 'cancelled']),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb, addLeadActivity } = await import('./db');
        const { leads } = await import('../drizzle/schema');
        const { eq, and, inArray } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { updated: 0 };
        // Only update leads owned by this user
        await db.update(leads)
          .set({ status: input.status })
          .where(and(inArray(leads.id, input.ids), eq(leads.ownerId, ctx.user.id)));
        // Log activity for each lead
        await Promise.all(input.ids.map(leadId =>
          addLeadActivity({
            leadId,
            ownerId: ctx.user.id,
            type: 'status_change',
            content: `Bulk status update: changed to ${input.status}`,
          })
        ));
        return { updated: input.ids.length };
      }),

    // Bulk import leads from CSV
    bulkCreate: protectedProcedure
      .input(z.array(z.object({
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        eventType: z.string().optional(),
        eventDate: z.string().optional(),
        guestCount: z.number().optional(),
        budget: z.number().optional(),
        message: z.string().optional(),
        status: z.enum(["new", "contacted", "proposal_sent", "negotiating", "booked", "lost", "cancelled"]).optional(),
        source: z.string().optional(),
        internalNotes: z.string().optional(),
      })).min(1).max(500))
      .mutation(async ({ input, ctx }) => {
        const { createLead } = await import('./db');
        let imported = 0;
        const errors: string[] = [];
        for (const row of input) {
          try {
            await createLead({
              ownerId: ctx.user.id,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email ?? '',
              phone: row.phone,
              company: row.company,
              eventType: row.eventType,
              eventDate: row.eventDate ? new Date(row.eventDate) : undefined,
              guestCount: row.guestCount,
              budget: row.budget?.toString() as any,
              message: row.message,
              internalNotes: row.internalNotes,
              source: row.source ?? "csv_import",
              status: row.status ?? "new",
            });
            imported++;
          } catch (err: any) {
            errors.push(`Row ${imported + errors.length + 1}: ${err?.message ?? 'Unknown error'}`);
          }
        }
        return { imported, errors };
      }),
  }),
  // ─── Proposals ─────────────────────────────────────────────────────────────
  proposals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getProposals(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getProposalById(input.id);
      }),

    byLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ input }) => {
        return getProposalsByLead(input.leadId);
      }),

    // Public: client views proposal by token
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const proposal = await getProposalByToken(input.token);
        if (!proposal) return null;
        // Mark as viewed if sent
        if (proposal.status === "sent") {
          await updateProposal(proposal.id, { status: "viewed", viewedAt: new Date() });
        }
        // Also fetch venue settings for branding
        const venue = await getVenueSettings(proposal.ownerId);
        return { proposal, venue };
      }),

    create: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        title: z.string().min(1),
        introMessage: z.string().optional(),
        eventDate: z.string().optional(),
        eventEndDate: z.string().optional(),
        guestCount: z.number().optional(),
        spaceName: z.string().optional(),
        lineItems: z.array(z.object({
          description: z.string(),
          qty: z.number(),
          unitPrice: z.number(),
          total: z.number(),
        })).optional(),
        subtotalNzd: z.number().optional(),
        taxPercent: z.number().optional(),
        taxNzd: z.number().optional(),
        totalNzd: z.number().optional(),
        depositPercent: z.number().optional(),
        depositNzd: z.number().optional(),
        termsAndConditions: z.string().optional(),
        internalNotes: z.string().optional(),
        expiresAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const token = nanoid(32);
        const proposal = await createProposal({
          ownerId: ctx.user.id,
          leadId: input.leadId,
          publicToken: token,
          title: input.title,
          status: "draft",
          introMessage: input.introMessage,
          eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
          eventEndDate: input.eventEndDate ? new Date(input.eventEndDate) : undefined,
          guestCount: input.guestCount,
          spaceName: input.spaceName,
          lineItems: input.lineItems ? JSON.stringify(input.lineItems) : undefined,
          subtotalNzd: input.subtotalNzd?.toString() as any,
          taxPercent: input.taxPercent?.toString() as any,
          taxNzd: input.taxNzd?.toString() as any,
          totalNzd: input.totalNzd?.toString() as any,
          depositPercent: input.depositPercent?.toString() as any,
          depositNzd: input.depositNzd?.toString() as any,
          termsAndConditions: input.termsAndConditions,
          internalNotes: input.internalNotes,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        });
        return proposal;
      }),

    send: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await updateProposal(input.id, { status: "sent", sentAt: new Date() });
        const proposal = await getProposalById(input.id);
        if (proposal) {
          await updateLeadStatus(proposal.leadId, "proposal_sent");
          await addLeadActivity({
            leadId: proposal.leadId,
            ownerId: ctx.user.id,
            type: "proposal_sent",
            content: `Proposal "${proposal.title}" sent to client`,
          });
        }
        return { success: true, token: proposal?.publicToken };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        introMessage: z.string().optional(),
        lineItems: z.array(z.object({
          description: z.string(),
          qty: z.number(),
          unitPrice: z.number(),
          total: z.number(),
        })).optional(),
        subtotalNzd: z.number().optional(),
        taxPercent: z.number().optional(),
        taxNzd: z.number().optional(),
        totalNzd: z.number().optional(),
        depositPercent: z.number().optional(),
        depositNzd: z.number().optional(),
        termsAndConditions: z.string().optional(),
        spaceName: z.string().optional(),
        guestCount: z.number().optional(),
        eventDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, lineItems, eventDate, subtotalNzd, taxPercent, taxNzd, totalNzd, depositPercent, depositNzd, ...rest } = input;
        await updateProposal(id, {
          ...rest,
          lineItems: lineItems ? JSON.stringify(lineItems) : undefined,
          eventDate: eventDate ? new Date(eventDate) : undefined,
          subtotalNzd: subtotalNzd?.toString() as any,
          taxPercent: taxPercent?.toString() as any,
          taxNzd: taxNzd?.toString() as any,
          totalNzd: totalNzd?.toString() as any,
          depositPercent: depositPercent?.toString() as any,
          depositNzd: depositNzd?.toString() as any,
        });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { proposals } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return;
        await db.delete(proposals).where(and(eq(proposals.id, input.id), eq(proposals.ownerId, ctx.user.id)));
        return { success: true };
      }),

    // Save drinks selection for a proposal
    saveDrinks: protectedProcedure
      .input(z.object({
        proposalId: z.number(),
        barOption: z.enum(["bar_tab", "cash_bar", "bar_tab_then_cash", "unlimited"]),
        tabAmount: z.number().optional(),
        selectedDrinks: z.array(z.string()),
        customDrinks: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          price: z.number().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { proposalDrinks } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB unavailable');
        // Verify proposal belongs to owner
        const proposal = await getProposalById(input.proposalId);
        if (!proposal || proposal.ownerId !== ctx.user.id) throw new Error('Not found');
        // Upsert
        const existing = await db.select().from(proposalDrinks)
          .where(and(eq(proposalDrinks.proposalId, input.proposalId), eq(proposalDrinks.ownerId, ctx.user.id)))
          .limit(1);
        if (existing.length > 0) {
          await db.update(proposalDrinks)
            .set({
              barOption: input.barOption,
              tabAmount: input.tabAmount?.toString() as any,
              selectedDrinks: input.selectedDrinks,
              customDrinks: input.customDrinks,
            })
            .where(eq(proposalDrinks.proposalId, input.proposalId));
        } else {
          await db.insert(proposalDrinks).values({
            proposalId: input.proposalId,
            ownerId: ctx.user.id,
            barOption: input.barOption,
            tabAmount: input.tabAmount?.toString() as any,
            selectedDrinks: input.selectedDrinks,
            customDrinks: input.customDrinks,
          });
        }
        return { success: true };
      }),
    // Get drinks selection for a proposal (protected)
    getDrinks: protectedProcedure
      .input(z.object({ proposalId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { proposalDrinks } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(proposalDrinks)
          .where(and(eq(proposalDrinks.proposalId, input.proposalId), eq(proposalDrinks.ownerId, ctx.user.id)))
          .limit(1);
        return rows[0] ?? null;
      }),
    // Get drinks selection by public token (for proposal view)
    getDrinksByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const proposal = await getProposalByToken(input.token);
        if (!proposal) return null;
        const { getDb } = await import('./db');
        const { proposalDrinks } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const rows = await db.select().from(proposalDrinks)
          .where(eq(proposalDrinks.proposalId, proposal.id))
          .limit(1);
        return rows[0] ?? null;
      }),
    // Public: client responds to proposal
    respond: publicProcedure
      .input(z.object({
        token: z.string(),
        action: z.enum(["accepted", "declined"]),
        clientMessage: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const proposal = await getProposalByToken(input.token);
        if (!proposal) throw new Error("Proposal not found");
        if (!["sent", "viewed"].includes(proposal.status)) throw new Error("Proposal cannot be responded to");
        await updateProposal(proposal.id, {
          status: input.action,
          respondedAt: new Date(),
          clientMessage: input.clientMessage,
        });
        // If accepted, create a booking
        if (input.action === "accepted") {
          const lead = await getLeadById(proposal.leadId);
          if (lead) {
            await createBooking({
              ownerId: proposal.ownerId,
              leadId: proposal.leadId,
              proposalId: proposal.id,
              firstName: lead.firstName,
              lastName: lead.lastName ?? undefined,
              email: lead.email,
              eventType: lead.eventType ?? undefined,
              eventDate: proposal.eventDate ?? lead.eventDate ?? new Date(),
              eventEndDate: proposal.eventEndDate ?? undefined,
              guestCount: proposal.guestCount ?? lead.guestCount ?? undefined,
              spaceName: proposal.spaceName ?? undefined,
              totalNzd: proposal.totalNzd as any,
              depositNzd: proposal.depositNzd as any,
              status: "confirmed",
            });
            await updateLeadStatus(proposal.leadId, "booked");
            await addLeadActivity({
              leadId: proposal.leadId,
              ownerId: proposal.ownerId,
              type: "booking_created",
              content: `Client accepted proposal "${proposal.title}" — booking confirmed!`,
            });
          }
        }
        return { success: true, status: input.action };
      }),
  }),

  // ─── Bookings ──────────────────────────────────────────────────────────────
  bookings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getBookings(ctx.user.id);
    }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const result = await db.select().from(bookings)
          .where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)))
          .limit(1);
        return result[0] ?? null;
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional(),
        eventType: z.string().optional(),
        eventDate: z.string().optional(),
        eventEndDate: z.string().nullable().optional(),
        guestCount: z.number().nullable().optional(),
        spaceName: z.string().nullable().optional(),
        totalNzd: z.number().nullable().optional(),
        depositNzd: z.number().nullable().optional(),
        depositPaid: z.boolean().optional(),
        status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        const updates: Record<string, unknown> = {};
        if (rest.firstName !== undefined) updates.firstName = rest.firstName;
        if (rest.lastName !== undefined) updates.lastName = rest.lastName;
        if (rest.email !== undefined) updates.email = rest.email;
        if (rest.eventType !== undefined) updates.eventType = rest.eventType;
        if (rest.eventDate !== undefined) updates.eventDate = new Date(rest.eventDate);
        if (rest.eventEndDate !== undefined) updates.eventEndDate = rest.eventEndDate ? new Date(rest.eventEndDate) : null;
        if (rest.guestCount !== undefined) updates.guestCount = rest.guestCount;
        if (rest.spaceName !== undefined) updates.spaceName = rest.spaceName;
        if (rest.totalNzd !== undefined) updates.totalNzd = rest.totalNzd !== null ? String(rest.totalNzd) : null;
        if (rest.depositNzd !== undefined) updates.depositNzd = rest.depositNzd !== null ? String(rest.depositNzd) : null;
        if (rest.depositPaid !== undefined) updates.depositPaid = rest.depositPaid;
        if (rest.status !== undefined) updates.status = rest.status;
        if (rest.notes !== undefined) updates.notes = rest.notes;
        await db.update(bookings).set(updates).where(and(eq(bookings.id, id), eq(bookings.ownerId, ctx.user.id)));
        return { success: true };
      }),
    byMonth: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        return getBookingsByMonth(ctx.user.id, input.year, input.month);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(bookings).where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Menu Packages & Items ────────────────────────────────────────────────
  menu: router({
    // List all packages for the owner
    listPackages: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { menuPackages } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(menuPackages)
        .where(eq(menuPackages.ownerId, ctx.user.id))
        .orderBy(asc(menuPackages.type), asc(menuPackages.name));
    }),
    // List items for a specific package
    listItems: protectedProcedure
      .input(z.object({ packageId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuItems } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        return db.select().from(menuItems)
          .where(and(eq(menuItems.packageId, input.packageId), eq(menuItems.ownerId, ctx.user.id)))
          .orderBy(asc(menuItems.sortOrder), asc(menuItems.id));
      }),
    // Create a package
    createPackage: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(['food', 'beverages', 'food_and_beverages']),
        pricePerHead: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuPackages } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [result] = await db.insert(menuPackages).values({
          ownerId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          type: input.type,
          pricePerHead: input.pricePerHead ? String(input.pricePerHead) : null,
        });
        return { id: (result as any).insertId };
      }),
    // Update a package
    updatePackage: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        type: z.enum(['food', 'beverages', 'food_and_beverages']).optional(),
        pricePerHead: z.number().nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuPackages } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.type !== undefined) updates.type = input.type;
        if (input.pricePerHead !== undefined) updates.pricePerHead = input.pricePerHead !== null ? String(input.pricePerHead) : null;
        if (input.isActive !== undefined) updates.isActive = input.isActive;
        await db.update(menuPackages).set(updates).where(and(eq(menuPackages.id, input.id), eq(menuPackages.ownerId, ctx.user.id)));
        return { success: true };
      }),
    // Delete a package
    deletePackage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuPackages, menuItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(menuItems).where(and(eq(menuItems.packageId, input.id), eq(menuItems.ownerId, ctx.user.id)));
        await db.delete(menuPackages).where(and(eq(menuPackages.id, input.id), eq(menuPackages.ownerId, ctx.user.id)));
        return { success: true };
      }),
    // Add an item to a package
    addItem: protectedProcedure
      .input(z.object({
        packageId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        dietaryNotes: z.string().optional(),
        category: z.string().optional(),
        portionSize: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuItems } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [result] = await db.insert(menuItems).values({
          packageId: input.packageId,
          ownerId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          dietaryNotes: input.dietaryNotes ?? null,
          category: input.category ?? null,
          portionSize: input.portionSize ?? null,
          sortOrder: input.sortOrder ?? 0,
        });
        return { id: (result as any).insertId };
      }),
    // Update an item
    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        dietaryNotes: z.string().optional(),
        category: z.string().optional(),
        portionSize: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.dietaryNotes !== undefined) updates.dietaryNotes = input.dietaryNotes;
        if (input.category !== undefined) updates.category = input.category;
        if (input.portionSize !== undefined) updates.portionSize = input.portionSize;
        if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
        await db.update(menuItems).set(updates).where(and(eq(menuItems.id, input.id), eq(menuItems.ownerId, ctx.user.id)));
        return { success: true };
      }),
    // Delete an item
    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(menuItems).where(and(eq(menuItems.id, input.id), eq(menuItems.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),
  // ─── Bar Menu Items ──────────────────────────────────────────────────────
  barMenu: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { barMenuItems } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(barMenuItems).where(eq(barMenuItems.ownerId, ctx.user.id)).orderBy(asc(barMenuItems.sortOrder), asc(barMenuItems.name));
    }),
    add: protectedProcedure
      .input(z.object({
        category: z.string().min(1).default('General'),
        name: z.string().min(1),
        description: z.string().optional(),
        pricePerUnit: z.number().optional(),
        unit: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { barMenuItems } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [result] = await db.insert(barMenuItems).values({
          ownerId: ctx.user.id,
          category: input.category,
          name: input.name,
          description: input.description ?? null,
          pricePerUnit: input.pricePerUnit != null ? String(input.pricePerUnit) : null,
          unit: input.unit ?? 'per drink',
          sortOrder: input.sortOrder ?? 0,
          createdAt: Date.now(),
        });
        return { id: (result as any).insertId };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        category: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        pricePerUnit: z.number().nullable().optional(),
        unit: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { barMenuItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const updates: Record<string, unknown> = {};
        if (input.category !== undefined) updates.category = input.category;
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.pricePerUnit !== undefined) updates.pricePerUnit = input.pricePerUnit != null ? String(input.pricePerUnit) : null;
        if (input.unit !== undefined) updates.unit = input.unit;
        if (input.isActive !== undefined) updates.isActive = input.isActive;
        if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
        await db.update(barMenuItems).set(updates).where(and(eq(barMenuItems.id, input.id), eq(barMenuItems.ownerId, ctx.user.id)));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { barMenuItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(barMenuItems).where(and(eq(barMenuItems.id, input.id), eq(barMenuItems.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),
  // ─── Email ───────────────────────────────────────────────────────────────
  email: router({
    send: protectedProcedure
      .input(z.object({
        to: z.string().email(),
        toName: z.string().optional(),
        subject: z.string().min(1),
        body: z.string().min(1),
        leadId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { venueSettings, leadActivity } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const nodemailer = await import('nodemailer');
        const db = await getDb();
        if (!db) throw new Error('DB not available');

        // Fetch SMTP settings for this venue owner
        const [settings] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ctx.user.id)).limit(1);
        if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
          throw new Error('SMTP not configured. Please add your email settings in Settings → Email.');
        }

        const transporter = nodemailer.default.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort ?? 587,
          secure: (settings.smtpSecure ?? 0) === 1,
          auth: { user: settings.smtpUser, pass: settings.smtpPass },
        });

        const fromName = settings.smtpFromName ?? settings.name ?? 'HOSTit';
        const fromEmail = settings.smtpFromEmail ?? settings.smtpUser;

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: input.toName ? `"${input.toName}" <${input.to}>` : input.to,
          subject: input.subject,
          html: input.body.replace(/\n/g, '<br>'),
          text: input.body,
        });

        // Log as lead activity if leadId provided
        if (input.leadId) {
          await db.insert(leadActivity).values({
            leadId: input.leadId,
            ownerId: ctx.user.id,
            type: 'email',
            content: `Email sent to ${input.to}\n\nSubject: ${input.subject}\n\n${input.body}`,
          });
          // Auto-advance: if lead is still "new", move it to "contacted"
          const { leads } = await import('../drizzle/schema');
          const [currentLead] = await db.select({ status: leads.status, followUpDate: leads.followUpDate })
            .from(leads).where(eq(leads.id, input.leadId)).limit(1);
          if (currentLead?.status === 'new') {
            // Set status to contacted and set a default follow-up in 3 days if none set
            const followUpDate = currentLead.followUpDate ?? (() => {
              const d = new Date();
              d.setDate(d.getDate() + 3);
              return d;
            })();
            await db.update(leads)
              .set({ status: 'contacted', followUpDate })
              .where(eq(leads.id, input.leadId));
            await db.insert(leadActivity).values({
              leadId: input.leadId,
              ownerId: ctx.user.id,
              type: 'status_change',
              content: `Status auto-advanced to contacted after email reply. Follow-up set for ${followUpDate.toLocaleDateString('en-NZ', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}.`,
            });
          }
        }
        return { success: true };
      }),
  }),

  // ─── Email Templates ──────────────────────────────────────────────────────
  templates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { emailTemplates } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(emailTemplates).where(eq(emailTemplates.ownerId, ctx.user.id)).orderBy(desc(emailTemplates.createdAt));
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        subject: z.string().min(1),
        body: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { emailTemplates } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(emailTemplates).values({ ...input, ownerId: ctx.user.id });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        subject: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { emailTemplates } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...data } = input;
        await db.update(emailTemplates).set(data).where(and(eq(emailTemplates.id, id), eq(emailTemplates.ownerId, ctx.user.id)));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { emailTemplates } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(emailTemplates).where(and(eq(emailTemplates.id, input.id), eq(emailTemplates.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),
  // ─── Quote ───────────────────────────────────────────────────────────────
  quote: router({
    save: protectedProcedure
      .input(z.object({
        proposalId: z.number(),
        minimumSpend: z.number().optional(),
        foodTotal: z.number().optional(),
        autoBarTab: z.boolean().default(true),
        notes: z.string().optional(),
        items: z.array(z.object({
          id: z.number().optional(),
          type: z.string().default('custom'),
          name: z.string(),
          description: z.string().optional(),
          qty: z.number().default(1),
          unitPrice: z.number().default(0),
          sortOrder: z.number().default(0),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { quoteSettings, quoteItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        // Upsert quote settings
        const existing = await db.select().from(quoteSettings)
          .where(and(eq(quoteSettings.proposalId, input.proposalId), eq(quoteSettings.ownerId, ctx.user.id)))
          .limit(1);
        if (existing.length > 0) {
          await db.update(quoteSettings)
            .set({ minimumSpend: input.minimumSpend?.toString(), foodTotal: input.foodTotal?.toString(), autoBarTab: input.autoBarTab, notes: input.notes })
            .where(eq(quoteSettings.id, existing[0].id));
        } else {
          await db.insert(quoteSettings).values({ proposalId: input.proposalId, ownerId: ctx.user.id, minimumSpend: input.minimumSpend?.toString(), foodTotal: input.foodTotal?.toString(), autoBarTab: input.autoBarTab, notes: input.notes });
        }
        // Replace all quote items for this proposal
        await db.delete(quoteItems).where(and(eq(quoteItems.proposalId, input.proposalId), eq(quoteItems.ownerId, ctx.user.id)));
        if (input.items.length > 0) {
          await db.insert(quoteItems).values(input.items.map((item, i) => ({
            proposalId: input.proposalId,
            ownerId: ctx.user.id,
            type: item.type,
            name: item.name,
            description: item.description,
            qty: item.qty.toString(),
            unitPrice: item.unitPrice.toString(),
            sortOrder: item.sortOrder ?? i,
          })));
        }
        return { success: true };
      }),
    get: protectedProcedure
      .input(z.object({ proposalId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { quoteSettings, quoteItems } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [settings] = await db.select().from(quoteSettings)
          .where(and(eq(quoteSettings.proposalId, input.proposalId), eq(quoteSettings.ownerId, ctx.user.id)))
          .limit(1);
        const items = await db.select().from(quoteItems)
          .where(and(eq(quoteItems.proposalId, input.proposalId), eq(quoteItems.ownerId, ctx.user.id)))
          .orderBy(asc(quoteItems.sortOrder));
        return { settings: settings ?? null, items };
      }),
    getByToken: publicProcedure
      .input(z.object({ token: z.string(), proposalId: z.number() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { quoteSettings, quoteItems, proposals } = await import('../drizzle/schema');
        const { eq, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [proposal] = await db.select().from(proposals).where(eq(proposals.publicToken, input.token)).limit(1);
        if (!proposal || proposal.id !== input.proposalId) return null;
        const [settings] = await db.select().from(quoteSettings).where(eq(quoteSettings.proposalId, input.proposalId)).limit(1);
        const items = await db.select().from(quoteItems).where(eq(quoteItems.proposalId, input.proposalId)).orderBy(asc(quoteItems.sortOrder));
        return { settings: settings ?? null, items };
      }),
  }),

  // ─── Floor Plans ────────────────────────────────────────────────────────────
  floorPlans: router({
    list: protectedProcedure
      .input(z.object({ bookingId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { floorPlans } = await import('../drizzle/schema');
        const { eq, and, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions = [eq(floorPlans.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(floorPlans.bookingId, input.bookingId));
        return db.select().from(floorPlans).where(and(...conditions)).orderBy(desc(floorPlans.createdAt));
      }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { floorPlans } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [plan] = await db.select().from(floorPlans).where(and(eq(floorPlans.id, input.id), eq(floorPlans.ownerId, ctx.user.id))).limit(1);
        return plan ?? null;
      }),
    save: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        bookingId: z.number().optional(),
        name: z.string().default('Floor Plan'),
        bgImageUrl: z.string().optional(),
        canvasData: z.any().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { floorPlans } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        if (input.id) {
          await db.update(floorPlans).set({ name: input.name, bgImageUrl: input.bgImageUrl, canvasData: input.canvasData, bookingId: input.bookingId }).where(and(eq(floorPlans.id, input.id), eq(floorPlans.ownerId, ctx.user.id)));
          return { id: input.id };
        } else {
          const [result] = await db.insert(floorPlans).values({ ownerId: ctx.user.id, bookingId: input.bookingId, name: input.name, bgImageUrl: input.bgImageUrl, canvasData: input.canvasData });
          return { id: (result as any).insertId };
        }
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { floorPlans } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(floorPlans).where(and(eq(floorPlans.id, input.id), eq(floorPlans.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Checklists ─────────────────────────────────────────────────────────────
  checklists: router({
    listTemplates: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { checklistTemplates } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(checklistTemplates).where(eq(checklistTemplates.ownerId, ctx.user.id)).orderBy(desc(checklistTemplates.createdAt));
    }),
    createTemplate: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), required: z.boolean().optional() })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistTemplates } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [result] = await db.insert(checklistTemplates).values({ ownerId: ctx.user.id, name: input.name, description: input.description, items: input.items });
        return { id: (result as any).insertId, ...input };
      }),
    updateTemplate: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), required: z.boolean().optional() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistTemplates } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...data } = input;
        await db.update(checklistTemplates).set(data).where(and(eq(checklistTemplates.id, id), eq(checklistTemplates.ownerId, ctx.user.id)));
        return { success: true };
      }),
    deleteTemplate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistTemplates } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(checklistTemplates).where(and(eq(checklistTemplates.id, input.id), eq(checklistTemplates.ownerId, ctx.user.id)));
        return { success: true };
      }),
    assignToBooking: protectedProcedure
      .input(z.object({
        templateId: z.number(),
        bookingId: z.number(),
        name: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistTemplates, checklistInstances } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [template] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, input.templateId)).limit(1);
        if (!template) throw new Error('Template not found');
        const items = (template.items as any[]).map(item => ({ ...item, checked: false }));
        const [result] = await db.insert(checklistInstances).values({ templateId: input.templateId, bookingId: input.bookingId, ownerId: ctx.user.id, name: input.name ?? template.name, items });
        return { id: (result as any).insertId };
      }),
    getForBooking: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistInstances } = await import('../drizzle/schema');
        const { eq, and, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        return db.select().from(checklistInstances).where(and(eq(checklistInstances.bookingId, input.bookingId), eq(checklistInstances.ownerId, ctx.user.id))).orderBy(desc(checklistInstances.createdAt));
      }),
    updateInstance: protectedProcedure
      .input(z.object({
        id: z.number(),
        items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), required: z.boolean().optional(), checked: z.boolean(), checkedAt: z.string().optional(), notes: z.string().optional() })),
        completedAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistInstances } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(checklistInstances)
          .set({ items: input.items, completedAt: input.completedAt ? new Date(input.completedAt) : undefined })
          .where(and(eq(checklistInstances.id, input.id), eq(checklistInstances.ownerId, ctx.user.id)));
        return { success: true };
      }),
    deleteInstance: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistInstances } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(checklistInstances).where(and(eq(checklistInstances.id, input.id), eq(checklistInstances.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Runsheets ────────────────────────────────────────────────────────────
  runsheets: router({
    list: protectedProcedure
      .input(z.object({ leadId: z.number().optional(), bookingId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheets } = await import('../drizzle/schema');
        const { eq, and, or } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions = [eq(runsheets.ownerId, ctx.user.id)];
        if (input.leadId) conditions.push(eq(runsheets.leadId, input.leadId));
        if (input.bookingId) conditions.push(eq(runsheets.bookingId, input.bookingId));
        return db.select().from(runsheets).where(and(...conditions)).orderBy(runsheets.createdAt);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheets, runsheetItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [sheet] = await db.select().from(runsheets)
          .where(and(eq(runsheets.id, input.id), eq(runsheets.ownerId, ctx.user.id)));
        if (!sheet) return null;
        const items = await db.select().from(runsheetItems)
          .where(eq(runsheetItems.runsheetId, input.id))
          .orderBy(runsheetItems.sortOrder);
        return { ...sheet, items };
      }),

    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        leadId: z.number().optional(),
        bookingId: z.number().optional(),
        proposalId: z.number().optional(),
        eventDate: z.string().optional(),
        venueName: z.string().optional(),
        spaceName: z.string().optional(),
        guestCount: z.number().optional(),
        eventType: z.string().optional(),
        notes: z.string().optional(),
        dietaries: z.array(z.object({ name: z.string(), count: z.number(), notes: z.string().optional() })).optional(),
        venueSetup: z.string().optional(),
        items: z.array(z.object({
          time: z.string(),
          duration: z.number().optional(),
          title: z.string(),
          description: z.string().optional(),
          assignedTo: z.string().optional(),
          category: z.string().optional(),
          sortOrder: z.number().default(0),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheets, runsheetItems } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const [result] = await db.insert(runsheets).values({
          ownerId: ctx.user.id,
          leadId: input.leadId ?? null,
          bookingId: input.bookingId ?? null,
          title: input.title,
          eventDate: input.eventDate ? new Date(input.eventDate) : null,
          venueName: input.venueName ?? null,
          spaceName: input.spaceName ?? null,
          guestCount: input.guestCount ?? null,
          eventType: input.eventType ?? null,
          notes: input.notes ?? null,
          dietaries: input.dietaries ?? null,
          venueSetup: input.venueSetup ?? null,
          proposalId: input.proposalId ?? null,
          publicToken: token,
        });
        const id = (result as any).insertId as number;
        if (input.items?.length) {
          await db.insert(runsheetItems).values(
            input.items.map((item, i) => ({
              runsheetId: id,
              ownerId: ctx.user.id,
              time: item.time,
              duration: item.duration ?? 30,
              title: item.title,
              description: item.description ?? null,
              assignedTo: item.assignedTo ?? null,
              category: item.category ?? 'other',
              sortOrder: item.sortOrder ?? i,
            }))
          );
        }
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        eventDate: z.string().optional().nullable(),
        venueName: z.string().optional(),
        spaceName: z.string().optional(),
        guestCount: z.number().optional(),
        eventType: z.string().optional(),
        notes: z.string().optional(),
        dietaries: z.array(z.object({ name: z.string(), count: z.number(), notes: z.string().optional() })).optional(),
        venueSetup: z.string().optional(),
        proposalId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheets } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...fields } = input;
        const updateData: Record<string, any> = {};
        if (fields.title !== undefined) updateData.title = fields.title;
        if (fields.venueName !== undefined) updateData.venueName = fields.venueName;
        if (fields.spaceName !== undefined) updateData.spaceName = fields.spaceName;
        if (fields.guestCount !== undefined) updateData.guestCount = fields.guestCount;
        if (fields.eventType !== undefined) updateData.eventType = fields.eventType;
        if (fields.notes !== undefined) updateData.notes = fields.notes;
        if (fields.eventDate !== undefined) updateData.eventDate = fields.eventDate ? new Date(fields.eventDate) : null;
        if (fields.dietaries !== undefined) updateData.dietaries = fields.dietaries;
        if (fields.venueSetup !== undefined) updateData.venueSetup = fields.venueSetup;
        if (fields.proposalId !== undefined) updateData.proposalId = fields.proposalId;
        await db.update(runsheets).set(updateData)
          .where(and(eq(runsheets.id, id), eq(runsheets.ownerId, ctx.user.id)));
        return { success: true };
      }),

    addItem: protectedProcedure
      .input(z.object({
        runsheetId: z.number(),
        time: z.string(),
        duration: z.number().optional(),
        title: z.string(),
        description: z.string().nullable().optional(),
        assignedTo: z.string().nullable().optional(),
        category: z.string().optional(),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheetItems } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [result] = await db.insert(runsheetItems).values({
          runsheetId: input.runsheetId,
          ownerId: ctx.user.id,
          time: input.time,
          duration: input.duration ?? 30,
          title: input.title,
          description: input.description ?? null,
          assignedTo: input.assignedTo ?? null,
          category: input.category ?? 'other',
          sortOrder: input.sortOrder,
        });
        return { id: (result as any).insertId as number };
      }),

    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        time: z.string().optional(),
        duration: z.number().optional(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        assignedTo: z.string().nullable().optional(),
        category: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheetItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...fields } = input;
        await db.update(runsheetItems).set(fields as any)
          .where(and(eq(runsheetItems.id, id), eq(runsheetItems.ownerId, ctx.user.id)));
        return { success: true };
      }),

    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheetItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(runsheetItems)
          .where(and(eq(runsheetItems.id, input.id), eq(runsheetItems.ownerId, ctx.user.id)));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheets, runsheetItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(runsheetItems).where(eq(runsheetItems.runsheetId, input.id));
        await db.delete(runsheets)
          .where(and(eq(runsheets.id, input.id), eq(runsheets.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Payments ──────────────────────────────────────────────────────────────
  payments: router({
    list: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { payments } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        return db.select().from(payments)
          .where(and(eq(payments.bookingId, input.bookingId), eq(payments.ownerId, ctx.user.id)))
          .orderBy(payments.paidAt);
      }),
    add: protectedProcedure
      .input(z.object({
        bookingId: z.number(),
        amount: z.number().positive(),
        type: z.enum(['deposit', 'final', 'partial', 'refund', 'other']).default('deposit'),
        method: z.enum(['bank_transfer', 'cash', 'credit_card', 'eftpos', 'other']).default('bank_transfer'),
        paidAt: z.string(), // ISO date string
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { payments } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [result] = await db.insert(payments).values({
          bookingId: input.bookingId,
          ownerId: ctx.user.id,
          amount: String(input.amount),
          type: input.type,
          method: input.method,
          paidAt: new Date(input.paidAt),
          notes: input.notes,
        });
        return { id: (result as any).insertId, success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { payments } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(payments).where(and(eq(payments.id, input.id), eq(payments.ownerId, ctx.user.id)));
        return { success: true };
      }),
    summary: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { payments, bookings } = await import('../drizzle/schema');
        const { eq, and, sum } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { totalPaid: 0, outstanding: 0, status: 'unpaid' as const };
        const [booking] = await db.select().from(bookings)
          .where(and(eq(bookings.id, input.bookingId), eq(bookings.ownerId, ctx.user.id)));
        if (!booking) return { totalPaid: 0, outstanding: 0, status: 'unpaid' as const };
        const pmts = await db.select().from(payments)
          .where(and(eq(payments.bookingId, input.bookingId), eq(payments.ownerId, ctx.user.id)));
        const totalPaid = pmts.filter(p => p.type !== 'refund').reduce((s, p) => s + Number(p.amount), 0);
        const refunds = pmts.filter(p => p.type === 'refund').reduce((s, p) => s + Number(p.amount), 0);
        const netPaid = totalPaid - refunds;
        const total = Number(booking.totalNzd ?? 0);
        const outstanding = Math.max(0, total - netPaid);
        const status = netPaid <= 0 ? 'unpaid' : outstanding <= 0 ? 'paid_in_full' : netPaid >= Number(booking.depositNzd ?? 0) ? 'deposit_paid' : 'partial';
        return { totalPaid: netPaid, outstanding, status, total };
      }),
  }),

  // ─── F&B Items (FOH / Kitchen) ────────────────────────────────────────────
  fnb: router({
    list: protectedProcedure
      .input(z.object({ runsheetId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { fnbItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        return db.select().from(fnbItems)
          .where(and(eq(fnbItems.runsheetId, input.runsheetId), eq(fnbItems.ownerId, ctx.user.id)))
          .orderBy(fnbItems.sortOrder, fnbItems.serviceTime);
      }),
    save: protectedProcedure
      .input(z.object({
        runsheetId: z.number(),
        items: z.array(z.object({
          id: z.number().optional(),
          section: z.enum(['foh', 'kitchen']),
          course: z.string().optional(),
          dishName: z.string(),
          description: z.string().optional(),
          qty: z.number().int().default(1),
          dietary: z.string().optional(),
          serviceTime: z.string().optional(),
          prepNotes: z.string().optional(),
          platingNotes: z.string().optional(),
          staffAssigned: z.string().optional(),
          sortOrder: z.number().int().default(0),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { fnbItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        // Delete all existing items for this runsheet owned by user, then re-insert
        await db.delete(fnbItems).where(and(eq(fnbItems.runsheetId, input.runsheetId), eq(fnbItems.ownerId, ctx.user.id)));
        if (input.items.length > 0) {
          await db.insert(fnbItems).values(input.items.map((item, idx) => ({
            runsheetId: input.runsheetId,
            ownerId: ctx.user.id,
            section: item.section,
            course: item.course,
            dishName: item.dishName,
            description: item.description,
            qty: item.qty,
            dietary: item.dietary,
            serviceTime: item.serviceTime,
            prepNotes: item.prepNotes,
            platingNotes: item.platingNotes,
            staffAssigned: item.staffAssigned,
            sortOrder: item.sortOrder ?? idx,
          })));
        }
        return { success: true };
      }),
  }),

  // ─── Analytics ────────────────────────────────────────────────────────────
  analytics: router({
    revenueByMonth: protectedProcedure
      .input(z.object({ year: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and, gte, lt } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const start = new Date(input.year, 0, 1);
        const end = new Date(input.year + 1, 0, 1);
        const rows = await db.select().from(bookings)
          .where(and(eq(bookings.ownerId, ctx.user.id), gte(bookings.eventDate, start), lt(bookings.eventDate, end)));
        const byMonth = Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          label: new Date(input.year, i, 1).toLocaleString('en-NZ', { month: 'short' }),
          revenue: 0,
          count: 0,
        }));
        for (const b of rows) {
          if (b.status === 'cancelled') continue;
          const m = new Date(b.eventDate).getMonth();
          byMonth[m].revenue += Number(b.totalNzd ?? 0);
          byMonth[m].count += 1;
        }
        return byMonth;
      }),
    pipeline: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { leads, proposals, bookings } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return { enquiries: 0, proposals: 0, confirmed: 0, pipeline: 0, confirmed_revenue: 0 };
      const allLeads = await db.select().from(leads).where(eq(leads.ownerId, ctx.user.id));
      const allProposals = await db.select().from(proposals).where(eq(proposals.ownerId, ctx.user.id));
      const allBookings = await db.select().from(bookings).where(eq(bookings.ownerId, ctx.user.id));
      const confirmedRevenue = allBookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + Number(b.totalNzd ?? 0), 0);
      const pipelineRevenue = allProposals.filter(p => p.status === 'sent' || p.status === 'viewed').reduce((s, p) => s + Number(p.totalNzd ?? 0), 0);
      return {
        enquiries: allLeads.length,
        proposals: allProposals.filter(p => ['sent','viewed'].includes(p.status)).length,
        confirmed: allBookings.filter(b => b.status !== 'cancelled').length,
        pipeline: pipelineRevenue,
        confirmed_revenue: confirmedRevenue,
      };
    }),
    topEventTypes: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { bookings } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(bookings).where(eq(bookings.ownerId, ctx.user.id));
      const map: Record<string, { count: number; revenue: number }> = {};
      for (const b of rows) {
        if (b.status === 'cancelled') continue;
        const k = b.eventType ?? 'Other';
        if (!map[k]) map[k] = { count: 0, revenue: 0 };
        map[k].count += 1;
        map[k].revenue += Number(b.totalNzd ?? 0);
      }
      return Object.entries(map).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    }),
    setGoal: protectedProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int().min(0).max(12), targetRevenue: z.number().positive() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { analyticsGoals } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const existing = await db.select().from(analyticsGoals)
          .where(and(eq(analyticsGoals.ownerId, ctx.user.id), eq(analyticsGoals.year, input.year), eq(analyticsGoals.month, input.month)));
        if (existing.length > 0) {
          await db.update(analyticsGoals).set({ targetRevenue: String(input.targetRevenue) })
            .where(and(eq(analyticsGoals.ownerId, ctx.user.id), eq(analyticsGoals.year, input.year), eq(analyticsGoals.month, input.month)));
        } else {
          await db.insert(analyticsGoals).values({ ownerId: ctx.user.id, year: input.year, month: input.month, targetRevenue: String(input.targetRevenue) });
        }
        return { success: true };
      }),
    getGoals: protectedProcedure
      .input(z.object({ year: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { analyticsGoals } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        return db.select().from(analyticsGoals)
          .where(and(eq(analyticsGoals.ownerId, ctx.user.id), eq(analyticsGoals.year, input.year)));
      }),
    sourceBreakdown: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { leads } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(leads).where(eq(leads.ownerId, ctx.user.id));
      const map: Record<string, number> = {};
      for (const lead of rows) {
        const src = lead.source ?? 'Unknown';
        map[src] = (map[src] ?? 0) + 1;
      }
      return Object.entries(map)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
    }),
  }),

  // ─── Express Book (public enquiry form with availability) ─────────────────
  expressBook: router({
    checkAvailability: publicProcedure
      .input(z.object({ date: z.string(), ownerId: z.number() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and, gte, lt } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { available: true, bookedSpaces: [] };
        const day = new Date(input.date);
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);
        const dayBookings = await db.select().from(bookings)
          .where(and(eq(bookings.ownerId, input.ownerId), gte(bookings.eventDate, day), lt(bookings.eventDate, nextDay)));
        const bookedSpaces = dayBookings.filter(b => b.status !== 'cancelled').map(b => b.spaceName).filter(Boolean);
        return { available: bookedSpaces.length === 0, bookedSpaces };
      }),
    getVenueInfo: publicProcedure
      .input(z.object({ ownerId: z.number() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { venueSettings, eventSpaces, menuPackages } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [venue] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, input.ownerId));
        const spaces = await db.select().from(eventSpaces).where(eq(eventSpaces.ownerId, input.ownerId));
        const packages = await db.select().from(menuPackages).where(eq(menuPackages.ownerId, input.ownerId));
        return { venue, spaces, packages };
      }),
    submit: publicProcedure
      .input(z.object({
        ownerId: z.number(),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email(),
        phone: z.string().optional(),
        eventType: z.string().min(1),
        eventDate: z.string(),
        guestCount: z.number().int().positive(),
        spaceName: z.string().optional(),
        selectedPackageIds: z.array(z.number()).optional(),
        dietaryNotes: z.string().optional(),
        budget: z.string().optional(),
        notes: z.string().optional(),
        origin: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { leads } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [result] = await db.insert(leads).values({
          ownerId: input.ownerId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          eventType: input.eventType,
          eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
          guestCount: input.guestCount,
          budget: input.budget,
          message: (input.dietaryNotes ? `Dietary: ${input.dietaryNotes}\n` : '') + (input.notes ?? ''),
          internalNotes: input.spaceName ? `Space preference: ${input.spaceName}` : undefined,
          status: 'new',
          source: 'express_book',
        });
        // Notify owner
        try {
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: `New Express Book Request — ${input.firstName} ${input.lastName ?? ''}`,
            content: `${input.eventType} on ${input.eventDate} for ${input.guestCount} guests. Email: ${input.email}`,
          });
        } catch {}
        return { success: true, leadId: (result as any).insertId };
      }),
  }),

   // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getDashboardStats(ctx.user.id);
    }),
  }),
  // ─── Tasks ────────────────────────────────────────────────────────────────
  tasks: router({
    list: protectedProcedure
      .input(z.object({ filter: z.enum(['all', 'mine', 'overdue', 'upcoming', 'completed']).optional() }).optional())
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { tasks } = await import('../drizzle/schema');
        const { eq, and, lte, gte, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const now = Date.now();
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        let rows = await db.select().from(tasks).where(eq(tasks.ownerId, ctx.user.id)).orderBy(desc(tasks.createdAt));
        const filter = input?.filter ?? 'all';
        if (filter === 'overdue') rows = rows.filter(t => !t.completed && t.dueDate && t.dueDate < now);
        else if (filter === 'upcoming') rows = rows.filter(t => !t.completed && t.dueDate && t.dueDate >= now);
        else if (filter === 'completed') rows = rows.filter(t => t.completed);
        else if (filter === 'mine') rows = rows.filter(t => !t.completed);
        else rows = rows.filter(t => !t.completed);
        return rows;
      }),
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueDate: z.number().optional(),
        linkedLeadId: z.number().optional(),
        linkedBookingId: z.number().optional(),
        assignedTo: z.string().optional(),
        priority: z.enum(['low', 'normal', 'high']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { tasks } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        const result = await db.insert(tasks).values({
          ownerId: ctx.user.id,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate,
          linkedLeadId: input.linkedLeadId,
          linkedBookingId: input.linkedBookingId,
          assignedTo: input.assignedTo,
          priority: input.priority ?? 'normal',
          completed: false,
          createdAt: now,
          updatedAt: now,
        });
        return { success: true, id: (result as any).insertId };
      }),
    complete: protectedProcedure
      .input(z.object({ id: z.number(), completed: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { tasks } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(tasks).set({
          completed: input.completed,
          completedAt: input.completed ? Date.now() : null,
          updatedAt: Date.now(),
        }).where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.user.id)));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { tasks } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(tasks).where(and(eq(tasks.id, input.id), eq(tasks.ownerId, ctx.user.id)));
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.number().nullable().optional(),
        priority: z.enum(['low', 'normal', 'high']).optional(),
        linkedLeadId: z.number().nullable().optional(),
        linkedBookingId: z.number().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { tasks } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(tasks).set({ ...rest, updatedAt: Date.now() }).where(and(eq(tasks.id, id), eq(tasks.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Taxes & Fees ──────────────────────────────────────────────────────────
  taxesFees: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { taxesFees } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(taxesFees).where(eq(taxesFees.ownerId, ctx.user.id));
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        type: z.enum(['tax', 'fee']),
        rate: z.string(),
        rateType: z.enum(['percentage', 'flat']),
        appliesTo: z.enum(['all', 'food', 'beverage']),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { taxesFees } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const result = await db.insert(taxesFees).values({ ...input, ownerId: ctx.user.id, createdAt: Date.now() });
        return { success: true, id: (result as any).insertId };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        type: z.enum(['tax', 'fee']).optional(),
        rate: z.string().optional(),
        rateType: z.enum(['percentage', 'flat']).optional(),
        appliesTo: z.enum(['all', 'food', 'beverage']).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { taxesFees } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(taxesFees).set(rest).where(and(eq(taxesFees.id, id), eq(taxesFees.ownerId, ctx.user.id)));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { taxesFees } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(taxesFees).where(and(eq(taxesFees.id, input.id), eq(taxesFees.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Menu Sections (Perfect Venue-style) ──────────────────────────────────
  menuSections: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { menuSections } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(menuSections).where(eq(menuSections.ownerId, ctx.user.id)).orderBy(asc(menuSections.sortOrder));
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string(), salesCategory: z.string().optional(), hasSalesTax: z.boolean().optional(), hasAdminFee: z.boolean().optional(), hasGratuity: z.boolean().optional(), applyToMin: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuSections } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(menuSections).values({ ...input, ownerId: ctx.user.id, hasSalesTax: input.hasSalesTax ?? true, hasAdminFee: input.hasAdminFee ?? true, hasGratuity: input.hasGratuity ?? true, applyToMin: input.applyToMin ?? true, createdAt: Date.now() });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), salesCategory: z.string().optional(), hasSalesTax: z.boolean().optional(), hasAdminFee: z.boolean().optional(), hasGratuity: z.boolean().optional(), applyToMin: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuSections } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(menuSections).set(rest).where(and(eq(menuSections.id, id), eq(menuSections.ownerId, ctx.user.id)));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuSections, standaloneMenuItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(standaloneMenuItems).where(and(eq(standaloneMenuItems.sectionId, input.id), eq(standaloneMenuItems.ownerId, ctx.user.id)));
        await db.delete(menuSections).where(and(eq(menuSections.id, input.id), eq(menuSections.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),
  // ─── Standalone Menu Items ────────────────────────────────────────────────
  standaloneMenuItems: router({
    listBySection: protectedProcedure
      .input(z.object({ sectionId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { standaloneMenuItems } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        return db.select().from(standaloneMenuItems).where(and(eq(standaloneMenuItems.sectionId, input.sectionId), eq(standaloneMenuItems.ownerId, ctx.user.id))).orderBy(asc(standaloneMenuItems.sortOrder));
      }),
    listAll: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { standaloneMenuItems } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(standaloneMenuItems).where(eq(standaloneMenuItems.ownerId, ctx.user.id)).orderBy(asc(standaloneMenuItems.sortOrder));
    }),
    create: protectedProcedure
      .input(z.object({ sectionId: z.number(), name: z.string(), description: z.string().optional(), pricePerPerson: z.string().optional(), priceFlat: z.string().optional(), pricingType: z.enum(['per_person','flat','per_hour']).optional(), imageUrl: z.string().optional(), hasSalesTax: z.boolean().optional(), hasAdminFee: z.boolean().optional(), hasGratuity: z.boolean().optional(), applyToMin: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { standaloneMenuItems } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(standaloneMenuItems).values({ ...input, ownerId: ctx.user.id, pricingType: input.pricingType ?? 'per_person', hasSalesTax: input.hasSalesTax ?? false, hasAdminFee: input.hasAdminFee ?? true, hasGratuity: input.hasGratuity ?? true, applyToMin: input.applyToMin ?? true, createdAt: Date.now() });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { standaloneMenuItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(standaloneMenuItems).where(and(eq(standaloneMenuItems.id, input.id), eq(standaloneMenuItems.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),
  // ─── Sales Categories ─────────────────────────────────────────────────────
  salesCategories: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { salesCategories } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(salesCategories).where(eq(salesCategories.ownerId, ctx.user.id)).orderBy(asc(salesCategories.sortOrder));
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { salesCategories } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(salesCategories).values({ name: input.name, ownerId: ctx.user.id, createdAt: Date.now() });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { salesCategories } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(salesCategories).where(and(eq(salesCategories.id, input.id), eq(salesCategories.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),
  // ─── Quickstart Progress ──────────────────────────────────────────────────
  quickstart: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { quickstartProgress } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(quickstartProgress).where(eq(quickstartProgress.ownerId, ctx.user.id));
      return rows[0] ?? null;
    }),
    markStep: protectedProcedure
      .input(z.object({ step: z.enum(['venueDetails','contactForm','bankAccount','menu','spaces','taxesFees']), value: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { quickstartProgress } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const existing = await db.select().from(quickstartProgress).where(eq(quickstartProgress.ownerId, ctx.user.id));
        const update: Record<string, any> = { [input.step]: input.value, updatedAt: Date.now() };
        if (existing.length > 0) {
          await db.update(quickstartProgress).set(update).where(eq(quickstartProgress.ownerId, ctx.user.id));
        } else {
          await db.insert(quickstartProgress).values({ ownerId: ctx.user.id, venueDetails: false, contactForm: false, bankAccount: false, menu: false, spaces: false, taxesFees: false, updatedAt: Date.now(), [input.step]: input.value });
        }
        return { success: true };
      }),
  }),
  // ─── User Preferences (dashboard layout) ──────────────────────────────────
  userPreferences: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { userPreferences } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(userPreferences).where(eq(userPreferences.ownerId, ctx.user.id));
      return rows[0] ?? null;
    }),
    save: protectedProcedure
      .input(z.object({
        widgetOrder: z.array(z.string()),
        hiddenWidgets: z.array(z.string()),
        widgetSizes: z.record(z.string(), z.enum(['half', 'full'])).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { userPreferences } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const layout = { widgetOrder: input.widgetOrder, hiddenWidgets: input.hiddenWidgets, widgetSizes: input.widgetSizes ?? {} };
        const existing = await db.select().from(userPreferences).where(eq(userPreferences.ownerId, ctx.user.id));
        if (existing.length > 0) {
          await db.update(userPreferences).set({ dashboardLayout: layout }).where(eq(userPreferences.ownerId, ctx.user.id));
        } else {
          await db.insert(userPreferences).values({ ownerId: ctx.user.id, dashboardLayout: layout });
        }
        return { success: true };
      }),
  }),

  // ── Runsheet Templates ────────────────────────────────────────────────────
  runsheetTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { runsheetTemplates } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(runsheetTemplates)
        .where(eq(runsheetTemplates.ownerId, ctx.user.id))
        .orderBy(desc(runsheetTemplates.createdAt));
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        eventType: z.string().optional(),
        items: z.array(z.any()),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheetTemplates } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        const [result] = await db.insert(runsheetTemplates).values({
          ownerId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          eventType: input.eventType ?? null,
          items: input.items,
          createdAt: now,
          updatedAt: now,
        });
        return { id: (result as any).insertId, success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { runsheetTemplates } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(runsheetTemplates)
          .where(and(eq(runsheetTemplates.id, input.id), eq(runsheetTemplates.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Menu Catalog ─────────────────────────────────────────────────────────────
  menuCatalog: router({
    // ── Categories ──
    listCategories: protectedProcedure
      .input(z.object({ type: z.enum(['food', 'drink', 'all']).optional() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategories } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions: any[] = [eq(menuCategories.ownerId, ctx.user.id)];
        if (input.type && input.type !== 'all') conditions.push(eq(menuCategories.type, input.type as any));
        return db.select().from(menuCategories).where(and(...conditions)).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
      }),
    createCategory: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        type: z.enum(['food', 'drink']),
        description: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategories } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(menuCategories).values({
          ownerId: ctx.user.id,
          name: input.name,
          type: input.type,
          description: input.description ?? null,
          sortOrder: input.sortOrder ?? 0,
          createdAt: Date.now(),
        });
        const rows = await db.select().from(menuCategories)
          .where(eq(menuCategories.ownerId, ctx.user.id))
          .orderBy((t: any) => t.createdAt);
        return rows[rows.length - 1];
      }),
    updateCategory: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        type: z.enum(['food', 'drink']).optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategories } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(menuCategories).set(rest as any).where(and(eq(menuCategories.id, id), eq(menuCategories.ownerId, ctx.user.id)));
        return { success: true };
      }),
    deleteCategory: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategories, menuCategoryItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(menuCategoryItems).where(and(eq(menuCategoryItems.categoryId, input.id), eq(menuCategoryItems.ownerId, ctx.user.id)));
        await db.delete(menuCategories).where(and(eq(menuCategories.id, input.id), eq(menuCategories.ownerId, ctx.user.id)));
        return { success: true };
      }),
    // ── Items ──
    listItems: protectedProcedure
      .input(z.object({ categoryId: z.number().optional(), type: z.enum(['food', 'drink', 'all']).optional() }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategoryItems, menuCategories } = await import('../drizzle/schema');
        const { eq, and, asc, inArray } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        if (input.categoryId) {
          return db.select().from(menuCategoryItems)
            .where(and(eq(menuCategoryItems.categoryId, input.categoryId), eq(menuCategoryItems.ownerId, ctx.user.id)))
            .orderBy(asc(menuCategoryItems.sortOrder), asc(menuCategoryItems.createdAt));
        }
        if (input.type && input.type !== 'all') {
          const cats = await db.select({ id: menuCategories.id }).from(menuCategories)
            .where(and(eq(menuCategories.ownerId, ctx.user.id), eq(menuCategories.type, input.type as any)));
          if (!cats.length) return [];
          return db.select().from(menuCategoryItems)
            .where(and(inArray(menuCategoryItems.categoryId, cats.map((c: any) => c.id)), eq(menuCategoryItems.ownerId, ctx.user.id)))
            .orderBy(asc(menuCategoryItems.sortOrder));
        }
        return db.select().from(menuCategoryItems)
          .where(eq(menuCategoryItems.ownerId, ctx.user.id))
          .orderBy(asc(menuCategoryItems.sortOrder), asc(menuCategoryItems.createdAt));
      }),
    createItem: protectedProcedure
      .input(z.object({
        categoryId: z.number(),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        pricingType: z.enum(['per_person', 'per_item']).default('per_person'),
        price: z.number().min(0).default(0),
        unit: z.string().optional(),
        available: z.boolean().default(true),
        allergens: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategoryItems } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(menuCategoryItems).values({
          categoryId: input.categoryId,
          ownerId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          pricingType: input.pricingType,
          price: Math.round((input.price ?? 0) * 100),
          unit: input.unit ?? 'person',
          available: input.available ?? true,
          allergens: input.allergens ?? null,
          sortOrder: input.sortOrder ?? 0,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().nullable().optional(),
        pricingType: z.enum(['per_person', 'per_item']).optional(),
        price: z.number().min(0).optional(),
        unit: z.string().optional(),
        available: z.boolean().optional(),
        allergens: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategoryItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, price, ...rest } = input;
        const updateData: any = { ...rest };
        if (price !== undefined) updateData.price = Math.round(price * 100);
        await db.update(menuCategoryItems).set(updateData).where(and(eq(menuCategoryItems.id, id), eq(menuCategoryItems.ownerId, ctx.user.id)));
        return { success: true };
      }),
    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategoryItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { success: false };
        await db.delete(menuCategoryItems).where(and(eq(menuCategoryItems.id, input.id), eq(menuCategoryItems.ownerId, ctx.user.id)));
        return { success: true };
      }),
    bulkCreateItems: protectedProcedure
      .input(z.array(z.object({
        categoryId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        pricingType: z.enum(['per_person', 'per_item']).default('per_person'),
        price: z.number().min(0).default(0),
        unit: z.string().optional(),
        allergens: z.string().optional(),
      })))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { menuCategoryItems } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        const rows = input.map((item, i) => ({
          categoryId: item.categoryId,
          ownerId: ctx.user.id,
          name: item.name,
          description: item.description ?? null,
          pricingType: item.pricingType,
          price: Math.round((item.price ?? 0) * 100),
          unit: item.unit ?? 'person',
          available: true,
          allergens: item.allergens ?? null,
          sortOrder: i,
          createdAt: now + i,
        }));
        if (rows.length > 0) await db.insert(menuCategoryItems).values(rows);
        return { success: true, count: rows.length };
      }),
    // ── AI Runsheet Parse ──
    parseRunsheetText: protectedProcedure
      .input(z.object({ text: z.string().min(1), eventType: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm');
        const prompt = `You are a venue event coordinator. Parse the following text into a structured runsheet timeline.
Extract all time-based items and return them as a JSON object with an "items" array.
Each item must have: time (HH:MM 24h), duration (minutes, estimate if not given), title (short), description (optional detail), category (one of: Setup, Service, Kitchen, Speech, Entertainment, Cleanup, Other).
If a time is missing, estimate based on context. Event type: ${input.eventType ?? 'general event'}.

Text to parse:
${input.text}

Return ONLY valid JSON like: {"items": [{"time":"09:00","duration":30,"title":"...","description":"...","category":"Setup"}]}`;
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a helpful assistant that outputs valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' } as any,
        });
        const rawContent = response.choices?.[0]?.message?.content ?? '{"items":[]}';
        const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        try {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.timeline ?? []);
          return { items: items.slice(0, 60), success: true };
        } catch {
          return { items: [], success: false, error: 'Failed to parse response' };
        }
      }),
  }),


  // ─── Contracts ───────────────────────────────────────────────────────────────
  contracts: router({
    list: protectedProcedure
      .input(z.object({ bookingId: z.number().optional(), leadId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq, and, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions: any[] = [eq(contracts.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(contracts.bookingId, input.bookingId));
        else if (input.leadId) conditions.push(eq(contracts.leadId, input.leadId));
        return db.select().from(contracts).where(and(...conditions)).orderBy(desc(contracts.createdAt));
      }),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const rows = await db.select().from(contracts).where(and(eq(contracts.id, input.id), eq(contracts.ownerId, ctx.user.id))).limit(1);
        if (!rows[0]) throw new Error('Not found');
        return rows[0];
      }),
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const rows = await db.select().from(contracts).where(eq(contracts.token, input.token)).limit(1);
        if (!rows[0]) throw new Error('Not found');
        return rows[0];
      }),
    create: protectedProcedure
      .input(z.object({
        title: z.string(),
        body: z.string(),
        bookingId: z.number().optional(),
        leadId: z.number().optional(),
        clientName: z.string().optional(),
        clientEmail: z.string().optional(),
        expiresAt: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const { nanoid: nid } = await import('nanoid');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const token = nid(32);
        const now = Date.now();
        await db.insert(contracts).values({
          ownerId: ctx.user.id,
          bookingId: input.bookingId ?? null,
          leadId: input.leadId ?? null,
          title: input.title,
          body: input.body,
          status: 'draft',
          clientName: input.clientName ?? null,
          clientEmail: input.clientEmail ?? null,
          expiresAt: input.expiresAt ?? null,
          token,
          createdAt: now,
          updatedAt: now,
        });
        const rows = await db.select().from(contracts).where(and(eq(contracts.ownerId, ctx.user.id), eq(contracts.token, token))).limit(1);
        return rows[0];
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        body: z.string().optional(),
        status: z.enum(['draft','sent','signed','declined','expired']).optional(),
        clientName: z.string().optional(),
        clientEmail: z.string().optional(),
        expiresAt: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const updates: any = { updatedAt: Date.now() };
        if (input.title !== undefined) updates.title = input.title;
        if (input.body !== undefined) updates.body = input.body;
        if (input.status !== undefined) updates.status = input.status;
        if (input.clientName !== undefined) updates.clientName = input.clientName;
        if (input.clientEmail !== undefined) updates.clientEmail = input.clientEmail;
        if (input.expiresAt !== undefined) updates.expiresAt = input.expiresAt;
        await db.update(contracts).set(updates).where(and(eq(contracts.id, input.id), eq(contracts.ownerId, ctx.user.id)));
        return { success: true };
      }),
    send: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        await db.update(contracts).set({ status: 'sent', sentAt: now, updatedAt: now }).where(and(eq(contracts.id, input.id), eq(contracts.ownerId, ctx.user.id)));
        return { success: true };
      }),
    sign: publicProcedure
      .input(z.object({ token: z.string(), signerName: z.string(), signatureData: z.string(), signerIp: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        await db.update(contracts).set({
          status: 'signed',
          signedAt: now,
          signatureData: input.signatureData,
          signerName: input.signerName,
          signerIp: input.signerIp ?? '',
          updatedAt: now,
        }).where(and(eq(contracts.token, input.token), eq(contracts.status, 'sent')));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { contracts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(contracts).where(and(eq(contracts.id, input.id), eq(contracts.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Event Budgets ──────────────────────────────────────────────────────────
  budgets: router({
    list: protectedProcedure
      .input(z.object({ bookingId: z.number().optional(), leadId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventBudgets } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions: any[] = [eq(eventBudgets.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(eventBudgets.bookingId, input.bookingId));
        else if (input.leadId) conditions.push(eq(eventBudgets.leadId, input.leadId));
        return db.select().from(eventBudgets).where(and(...conditions)).orderBy(asc(eventBudgets.sortOrder), asc(eventBudgets.createdAt));
      }),
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        category: z.string().default('other'),
        type: z.enum(['income','expense']).default('expense'),
        estimatedAmount: z.number().default(0),
        actualAmount: z.number().optional(),
        notes: z.string().optional(),
        bookingId: z.number().optional(),
        leadId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventBudgets } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(eventBudgets).values({
          ownerId: ctx.user.id,
          bookingId: input.bookingId ?? null,
          leadId: input.leadId ?? null,
          name: input.name,
          category: input.category,
          type: input.type,
          estimatedAmount: input.estimatedAmount,
          actualAmount: input.actualAmount ?? 0,
          notes: input.notes ?? null,
          isPaid: false,
          sortOrder: 0,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(['income','expense']).optional(),
        estimatedAmount: z.number().optional(),
        actualAmount: z.number().optional(),
        notes: z.string().optional(),
        isPaid: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventBudgets } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const updates: any = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.category !== undefined) updates.category = input.category;
        if (input.type !== undefined) updates.type = input.type;
        if (input.estimatedAmount !== undefined) updates.estimatedAmount = input.estimatedAmount;
        if (input.actualAmount !== undefined) updates.actualAmount = input.actualAmount;
        if (input.notes !== undefined) updates.notes = input.notes;
        if (input.isPaid !== undefined) updates.isPaid = input.isPaid;
        if (Object.keys(updates).length > 0) {
          await db.update(eventBudgets).set(updates).where(and(eq(eventBudgets.id, input.id), eq(eventBudgets.ownerId, ctx.user.id)));
        }
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventBudgets } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(eventBudgets).where(and(eq(eventBudgets.id, input.id), eq(eventBudgets.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Equipment ──────────────────────────────────────────────────────────────
  equipment: router({
    listCatalog: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { equipment } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(equipment).where(eq(equipment.ownerId, ctx.user.id)).orderBy(asc(equipment.category), asc(equipment.name));
    }),
    createCatalog: protectedProcedure
      .input(z.object({ name: z.string(), category: z.string().default('other'), description: z.string().optional(), quantity: z.number().default(1), unit: z.string().default('item'), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { equipment } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(equipment).values({ ownerId: ctx.user.id, name: input.name, category: input.category, description: input.description ?? null, quantity: input.quantity, unit: input.unit, notes: input.notes ?? null, createdAt: Date.now() });
        return { success: true };
      }),
    deleteCatalog: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { equipment } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(equipment).where(and(eq(equipment.id, input.id), eq(equipment.ownerId, ctx.user.id)));
        return { success: true };
      }),
    listEvent: protectedProcedure
      .input(z.object({ bookingId: z.number().optional(), leadId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventEquipment } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions: any[] = [eq(eventEquipment.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(eventEquipment.bookingId, input.bookingId));
        else if (input.leadId) conditions.push(eq(eventEquipment.leadId, input.leadId));
        return db.select().from(eventEquipment).where(and(...conditions)).orderBy(asc(eventEquipment.sortOrder), asc(eventEquipment.createdAt));
      }),
    addToEvent: protectedProcedure
      .input(z.object({ name: z.string(), category: z.string().default('other'), quantity: z.number().default(1), notes: z.string().optional(), bookingId: z.number().optional(), leadId: z.number().optional(), equipmentId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventEquipment } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(eventEquipment).values({ ownerId: ctx.user.id, bookingId: input.bookingId ?? null, leadId: input.leadId ?? null, equipmentId: input.equipmentId ?? null, name: input.name, category: input.category, quantity: input.quantity, notes: input.notes ?? null, status: 'needed', sortOrder: 0, createdAt: Date.now() });
        return { success: true };
      }),
    updateEvent: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), quantity: z.number().optional(), notes: z.string().optional(), status: z.enum(['needed','confirmed','delivered','returned']).optional() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventEquipment } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const updates: any = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.quantity !== undefined) updates.quantity = input.quantity;
        if (input.notes !== undefined) updates.notes = input.notes;
        if (input.status !== undefined) updates.status = input.status;
        if (Object.keys(updates).length > 0) {
          await db.update(eventEquipment).set(updates).where(and(eq(eventEquipment.id, input.id), eq(eventEquipment.ownerId, ctx.user.id)));
        }
        return { success: true };
      }),
    deleteEvent: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventEquipment } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(eventEquipment).where(and(eq(eventEquipment.id, input.id), eq(eventEquipment.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Communications ──────────────────────────────────────────────────────────
  comms: router({
    list: protectedProcedure
      .input(z.object({ bookingId: z.number().optional(), leadId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { communications } = await import('../drizzle/schema');
        const { eq, and, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions: any[] = [eq(communications.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(communications.bookingId, input.bookingId));
        else if (input.leadId) conditions.push(eq(communications.leadId, input.leadId));
        return db.select().from(communications).where(and(...conditions)).orderBy(desc(communications.createdAt));
      }),
    create: protectedProcedure
      .input(z.object({
        type: z.enum(['note','email','call','sms','meeting']).default('note'),
        subject: z.string().optional(),
        body: z.string(),
        direction: z.enum(['inbound','outbound','internal']).default('internal'),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        bookingId: z.number().optional(),
        leadId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { communications } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(communications).values({
          ownerId: ctx.user.id,
          bookingId: input.bookingId ?? null,
          leadId: input.leadId ?? null,
          type: input.type,
          subject: input.subject ?? null,
          body: input.body,
          direction: input.direction,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          createdAt: Date.now(),
        });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { communications } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(communications).where(and(eq(communications.id, input.id), eq(communications.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Seating Charts ──────────────────────────────────────────────────────────
  seating: router({
    get: protectedProcedure
      .input(z.object({ bookingId: z.number().optional(), leadId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { seatingCharts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const conditions: any[] = [eq(seatingCharts.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(seatingCharts.bookingId, input.bookingId));
        else if (input.leadId) conditions.push(eq(seatingCharts.leadId, input.leadId));
        const rows = await db.select().from(seatingCharts).where(and(...conditions)).limit(1);
        return rows[0] ?? null;
      }),
    save: protectedProcedure
      .input(z.object({
        bookingId: z.number().optional(),
        leadId: z.number().optional(),
        canvasData: z.string(),
        guestCount: z.number().default(0),
        name: z.string().default('Seating Chart'),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { seatingCharts } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        const conditions: any[] = [eq(seatingCharts.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(seatingCharts.bookingId, input.bookingId));
        else if (input.leadId) conditions.push(eq(seatingCharts.leadId, input.leadId));
        const existing = await db.select().from(seatingCharts).where(and(...conditions)).limit(1);
        if (existing[0]) {
          await db.update(seatingCharts).set({ canvasData: input.canvasData, guestCount: input.guestCount, name: input.name, updatedAt: now }).where(and(eq(seatingCharts.id, existing[0].id), eq(seatingCharts.ownerId, ctx.user.id)));
        } else {
          await db.insert(seatingCharts).values({ ownerId: ctx.user.id, bookingId: input.bookingId ?? null, leadId: input.leadId ?? null, name: input.name, canvasData: input.canvasData, guestCount: input.guestCount, createdAt: now, updatedAt: now });
        }
        return { success: true };
      }),
  }),

  // ─── Client Portal ───────────────────────────────────────────────────────────
  portal: router({
    create: protectedProcedure
      .input(z.object({
        bookingId: z.number().optional(),
        leadId: z.number().optional(),
        clientName: z.string().optional(),
        clientEmail: z.string().optional(),
        permissions: z.object({
          viewProposal: z.boolean().default(true),
          viewRunsheet: z.boolean().default(false),
          viewBudget: z.boolean().default(false),
          approveProposal: z.boolean().default(true),
          signContract: z.boolean().default(false),
        }).default({ viewProposal: true, viewRunsheet: false, viewBudget: false, approveProposal: true, signContract: false }),
        expiresAt: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { clientPortalTokens } = await import('../drizzle/schema');
        const { nanoid: nid } = await import('nanoid');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const token = nid(32);
        const now = Date.now();
        await db.insert(clientPortalTokens).values({
          ownerId: ctx.user.id,
          bookingId: input.bookingId ?? null,
          leadId: input.leadId ?? null,
          token,
          clientName: input.clientName ?? null,
          clientEmail: input.clientEmail ?? null,
          permissions: JSON.stringify(input.permissions),
          expiresAt: input.expiresAt ?? null,
          createdAt: now,
        });
        return { token };
      }),
    list: protectedProcedure
      .input(z.object({ bookingId: z.number().optional(), leadId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { clientPortalTokens } = await import('../drizzle/schema');
        const { eq, and, desc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return [];
        const conditions: any[] = [eq(clientPortalTokens.ownerId, ctx.user.id)];
        if (input.bookingId) conditions.push(eq(clientPortalTokens.bookingId, input.bookingId));
        else if (input.leadId) conditions.push(eq(clientPortalTokens.leadId, input.leadId));
        return db.select().from(clientPortalTokens).where(and(...conditions)).orderBy(desc(clientPortalTokens.createdAt));
      }),
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { clientPortalTokens, bookings, leads, proposals } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const rows = await db.select().from(clientPortalTokens).where(eq(clientPortalTokens.token, input.token)).limit(1);
        const row = rows[0];
        if (!row) throw new Error('Portal link not found or expired');
        // Update last accessed
        await db.update(clientPortalTokens).set({ lastAccessedAt: Date.now() }).where(eq(clientPortalTokens.token, input.token));
        const permissions = row.permissions ? JSON.parse(row.permissions) : {};
        let booking = null, lead = null, proposal = null;
        if (row.bookingId) {
          const br = await db.select().from(bookings).where(eq(bookings.id, row.bookingId)).limit(1);
          booking = br[0] ?? null;
        }
        if (row.leadId) {
          const lr = await db.select().from(leads).where(eq(leads.id, row.leadId)).limit(1);
          lead = lr[0] ?? null;
        }
        if (permissions.viewProposal && row.leadId) {
          const pr = await db.select().from(proposals).where(eq(proposals.leadId, row.leadId)).limit(1);
          proposal = pr[0] ?? null;
        }
        return { token: row, permissions, booking, lead, proposal };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { clientPortalTokens } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(clientPortalTokens).where(and(eq(clientPortalTokens.id, input.id), eq(clientPortalTokens.ownerId, ctx.user.id)));
        return { success: true };
      }),
   }),
});
export type AppRouter = typeof appRouter;
