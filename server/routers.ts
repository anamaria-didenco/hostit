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
      }))
      .mutation(async ({ input, ctx }) => {
        const data: Record<string, any> = { ...input };
        if (input.depositPercent !== undefined) data.depositPercent = input.depositPercent.toString();
        return upsertVenueSettings(ctx.user.id, data);
      }),

    getOwn: protectedProcedure.query(async ({ ctx }) => {
      return getVenueSettings(ctx.user.id);
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

    byMonth: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number() }))
      .query(async ({ input, ctx }) => {
        return getBookingsByMonth(ctx.user.id, input.year, input.month);
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

  // ─── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getDashboardStats(ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
