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

/**
 * Format a stored event timestamp into the venue's local date + time strings
 * suitable for sending to NowBookIt. NowBookIt expects naive local time, but
 * Postgres stores UTC, so we convert via Intl with the venue's timezone.
 */
function formatVenueDateTime(eventDate: Date | string, timeZone: string = "Pacific/Auckland"): { dateStr: string; timeStr: string } {
  const d = eventDate instanceof Date ? eventDate : new Date(eventDate);
  // en-CA gives YYYY-MM-DD; en-GB hour12:false gives HH:MM
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const timeStr = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { dateStr, timeStr };
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => ({
      user: opts.ctx.user,
      isTeamMember: opts.ctx.isTeamMember,
    })),
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
        const vs = await getVenueSettings(id);
        if (!vs) return null;
        // For unauthenticated callers, strip every sensitive field. Even authenticated
        // callers don't need these on this endpoint — there is a protected `getOwn`.
        const isOwnerSelf = ctx.user?.id === id;
        if (!isOwnerSelf) {
          const safe: any = { ...vs };
          delete safe.smtpHost; delete safe.smtpPort; delete safe.smtpUser; delete safe.smtpPass;
          delete safe.smtpFromEmail; delete safe.smtpFromName; delete safe.smtpSecure;
          delete safe.notificationEmail;
          delete safe.nbiApiKey; delete safe.nbiAccountId; delete safe.nbiVenueId;
          delete safe.nbiServiceId; delete safe.nbiSectionId; delete safe.nbiSyncEnabled; delete safe.nbiWebhookSecret;
          delete safe.automatedTaskRules;
          return safe;
        }
        return vs;
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
        depositPercent: z.coerce.number().optional(),
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
        customStatuses: z.string().optional(),
        customDietaryOptions: z.string().optional(),
        customSetupTemplates: z.string().optional(),
        automatedTaskRules: z.string().optional(),
        formFont: z.string().optional(),
        formGalleryImages: z.string().optional(),
        customFormFields: z.string().optional(),
        logoScale: z.coerce.number().optional(),
        galleryPhotoHeight: z.coerce.number().optional(),
        formPageBg: z.string().optional(),
        formPageBgImage: z.string().optional(),
        formCardBg: z.string().optional(),
        formButtonColor: z.string().optional(),
        formSuccessMessage: z.string().optional(),
        nbiApiKey: z.string().optional(),
        nbiVenueId: z.string().optional(),
        nbiAccountId: z.string().optional(),
        nbiServiceId: z.string().optional(),
        nbiSectionId: z.string().optional(),
        nbiSyncEnabled: z.number().optional(),
        emailSignature: z.string().optional(),
        emailSignatureLogo: z.string().optional(),
        customCourses: z.string().optional(),
        shiftSections: z.string().optional(),
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
        depositPercent: z.coerce.number().optional(),
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
    getDefault: publicProcedure.query(async () => {
      // Returns the first venue (single-venue system) for use on /enquire without a slug
      const { getDb } = await import("./db");
      const { venueSettings } = await import("../drizzle/schema");
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(venueSettings).limit(1);
      return result[0] ?? null;
    }),

    testEmail: protectedProcedure
      .input(z.object({ toEmail: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { venueSettings } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('Database unavailable');
        const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ctx.user.id)).limit(1);
        if (!vs?.smtpHost || !vs?.smtpUser || !vs?.smtpPass) {
          throw new Error('SMTP not configured. Please fill in Host, Username, and Password first.');
        }
        const nodemailer = await import('nodemailer');
        const port = vs.smtpPort ?? 587;
        const secure = (vs.smtpSecure ?? 0) === 1 || port === 465;
        const transporter = nodemailer.default.createTransport({
          host: vs.smtpHost, port, secure,
          auth: { user: vs.smtpUser, pass: vs.smtpPass },
          tls: { rejectUnauthorized: false },
        } as any);
        await transporter.verify();
        await transporter.sendMail({
          from: `"${vs.smtpFromName ?? vs.name ?? 'VenueFlowHQ'}" <${vs.smtpFromEmail ?? vs.smtpUser}>`,
          to: input.toEmail,
          subject: 'VenueFlowHQ — Test Email',
          html: `<div style="font-family:sans-serif;max-width:500px"><div style="background:#6b98e7;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.8">VenueFlowHQ</div><div style="font-size:20px;font-weight:bold;margin-top:4px">Test Email</div></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px"><p style="font-size:15px">Your email notifications are working correctly.</p><p style="font-size:13px;color:#6b7280">This test was sent from <strong>${vs.smtpHost}</strong>. New enquiry notifications will be delivered to <strong>${vs.notificationEmail ?? input.toEmail}</strong>.</p></div></div>`,
          text: 'Your VenueFlowHQ email notifications are working correctly.',
        });
        return { success: true };
      }),

    verifyNbi: protectedProcedure
      .input(z.object({ accountId: z.string(), venueId: z.string() }))
      .mutation(async ({ input }) => {
        const { verifyNbiCredentials } = await import('./nowbookit');
        return verifyNbiCredentials({ accountId: input.accountId, venueId: input.venueId });
      }),

    listNbiServices: protectedProcedure
      .input(z.object({ accountId: z.string(), venueId: z.string(), date: z.string().optional() }))
      .query(async ({ input }) => {
        const { listNbiServices } = await import('./nowbookit');
        return listNbiServices({ accountId: input.accountId, venueId: input.venueId }, input.date);
      }),

    /**
     * Returns the inbound webhook URL the user should paste into NowBookIt's
     * Bookings Webhook Url field. Generates the per-venue secret on first call.
     */
    getNbiWebhookUrl: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { venueSettings } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      let [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, ctx.user.id)).limit(1);
      if (!vs) return { url: null, secret: null };
      let secret = vs.nbiWebhookSecret;
      if (!secret) {
        const { randomBytes } = await import('crypto');
        secret = randomBytes(24).toString('hex');
        await db.update(venueSettings).set({ nbiWebhookSecret: secret }).where(eq(venueSettings.id, vs.id));
      }
      const base = process.env.PUBLIC_BASE_URL
        ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        ?? 'https://venueflowhq.com';
      return { url: `${base.replace(/\/$/, '')}/api/webhook/nowbookit/${secret}`, secret };
    }),

    /** Rotate the webhook secret — invalidates any URL pasted into NBI before. */
    regenerateNbiWebhookSecret: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { venueSettings } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new Error('DB not available');
      const { randomBytes } = await import('crypto');
      const secret = randomBytes(24).toString('hex');
      await db.update(venueSettings).set({ nbiWebhookSecret: secret }).where(eq(venueSettings.ownerId, ctx.user.id));
      const base = process.env.PUBLIC_BASE_URL
        ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
        ?? 'https://venueflowhq.com';
      return { url: `${base.replace(/\/$/, '')}/api/webhook/nowbookit/${secret}`, secret };
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
        status: z.string().optional(),
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

        // Send notification email to venue owner if they have configured one
        try {
          const { getDb } = await import('./db');
          const { venueSettings } = await import('../drizzle/schema');
          const { eq } = await import('drizzle-orm');
          const db = await getDb();
          if (db) {
            const [vs] = await db.select().from(venueSettings).where(eq(venueSettings.ownerId, input.ownerId)).limit(1);
            if (vs?.notificationEmail && vs?.smtpHost && vs?.smtpUser && vs?.smtpPass) {
              console.log(`[LeadSubmit] Sending notification to ${vs.notificationEmail} via ${vs.smtpHost}:${vs.smtpPort ?? 587}`);
              const nodemailer = await import('nodemailer');
              const port = vs.smtpPort ?? 587;
              const secure = (vs.smtpSecure ?? 0) === 1 || port === 465;
              const transporter = nodemailer.default.createTransport({
                host: vs.smtpHost,
                port,
                secure,
                auth: { user: vs.smtpUser, pass: vs.smtpPass },
                tls: { rejectUnauthorized: false },
              } as any);
              const fromName = vs.smtpFromName ?? vs.name ?? 'VenueFlowHQ';
              const fromEmail = vs.smtpFromEmail ?? vs.smtpUser;
              const clientName = [input.firstName, input.lastName].filter(Boolean).join(' ');
              // Format event date as "Saturday 12 April 2026"
              const formattedEventDate = input.eventDate
                ? (() => {
                    // input.eventDate may be either "YYYY-MM-DD" or a full ISO timestamp.
                    // For bare dates, anchor to local midnight to avoid UTC-shift; for ISO,
                    // use as-is (stored time is already meaningful).
                    const raw = String(input.eventDate);
                    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T00:00:00') : new Date(raw);
                    return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                  })()
                : null;

              // Check for existing bookings/leads on the same event date
              let existingOnDayHtml = '';
              if (input.eventDate) {
                try {
                  const { bookings: bTable, leads: lTable } = await import('../drizzle/schema');
                  const { and, gte, lt } = await import('drizzle-orm');
                  // Compute the calendar day window regardless of whether input.eventDate
                  // is "YYYY-MM-DD" or a full ISO timestamp.
                  const eventD = new Date(input.eventDate);
                  const dayStart = new Date(eventD.getFullYear(), eventD.getMonth(), eventD.getDate(), 0, 0, 0);
                  const dayEnd = new Date(eventD.getFullYear(), eventD.getMonth(), eventD.getDate(), 23, 59, 59);
                  const [existingBookings, existingLeads] = await Promise.all([
                    db.select().from(bTable).where(
                      and(eq(bTable.ownerId, input.ownerId), gte(bTable.eventDate, dayStart), lt(bTable.eventDate, dayEnd))
                    ),
                    db.select().from(lTable).where(
                      and(eq(lTable.ownerId, input.ownerId), gte(lTable.eventDate as any, dayStart), lt(lTable.eventDate as any, dayEnd))
                    ),
                  ]);
                  // Build a lookup from status key → custom label using venue's stored customStatuses
                  const customStatusLabels: Record<string, string> = {};
                  try {
                    const rawStatuses = vs.customStatuses ? JSON.parse(vs.customStatuses as string) : [];
                    for (const s of rawStatuses) customStatusLabels[s.key] = s.label;
                  } catch { /* ignore */ }
                  const statusLabel = (s: string) => customStatusLabels[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                  const statusColor: Record<string, string> = {
                    confirmed: '#16a34a', booked: '#16a34a',
                    negotiating: '#d97706', tentative: '#d97706',
                    proposal_sent: '#f59e0b', function_pack_sent: '#facc15',
                    new: '#6b7280', contacted: '#3b82f6',
                    cancelled: '#dc2626', lost: '#6b7280',
                  };
                  const bookingRows = existingBookings
                    .filter(b => b.status !== 'cancelled')
                    .map(b => `<tr style="border-bottom:1px solid #f3f4f6">
                      <td style="padding:5px 8px;font-size:13px">${b.firstName} ${b.lastName ?? ''}</td>
                      <td style="padding:5px 8px;font-size:13px">${b.eventType ?? '—'}</td>
                      <td style="padding:5px 8px;font-size:13px">${b.spaceName ? `<span style="color:#6b7280">${b.spaceName}</span>` : '—'}</td>
                      <td style="padding:5px 8px;font-size:13px">${b.guestCount ?? '—'} guests</td>
                      <td style="padding:5px 8px;font-size:12px"><span style="background:${statusColor[b.status] ?? '#6b7280'};color:#fff;padding:2px 7px;border-radius:3px;font-weight:600">${statusLabel(b.status)}</span></td>
                    </tr>`);
                  const leadRows = existingLeads
                    .filter((l: any) => l.id !== lead?.id && !['lost','cancelled'].includes(l.status))
                    .map((l: any) => `<tr style="border-bottom:1px solid #f3f4f6">
                      <td style="padding:5px 8px;font-size:13px">${l.firstName} ${l.lastName ?? ''}</td>
                      <td style="padding:5px 8px;font-size:13px">${l.eventType ?? '—'}</td>
                      <td style="padding:5px 8px;font-size:13px">${(l as any).spaceName ? `<span style="color:#6b7280">${(l as any).spaceName}</span>` : '—'}</td>
                      <td style="padding:5px 8px;font-size:13px">${l.guestCount ?? '—'} guests</td>
                      <td style="padding:5px 8px;font-size:12px"><span style="background:${statusColor[l.status] ?? '#6b7280'};color:#fff;padding:2px 7px;border-radius:3px;font-weight:600">${statusLabel(l.status)} (enquiry)</span></td>
                    </tr>`);
                  const allRows = [...bookingRows, ...leadRows];
                  if (allRows.length > 0) {
                    existingOnDayHtml = `
                    <div style="margin-top:16px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:12px 14px">
                      <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">⚠ You Already Have ${allRows.length} Event${allRows.length > 1 ? 's' : ''} on This Day</div>
                      <table style="width:100%;border-collapse:collapse">
                        <thead><tr style="background:#fde68a">
                          <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Name</th>
                          <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Type</th>
                          <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Space / Room</th>
                          <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Guests</th>
                          <th style="padding:4px 8px;font-size:11px;text-align:left;color:#78350f">Status</th>
                        </tr></thead>
                        <tbody>${allRows.join('')}</tbody>
                      </table>
                    </div>`;
                  }
                } catch (checkErr) {
                  console.warn('[LeadSubmit] Could not check existing bookings:', checkErr);
                }
              }

              const rows = [
                input.email && `<tr><td style="padding:4px 0;color:#666;font-size:14px;width:130px">Email</td><td style="padding:4px 0;font-size:14px"><a href="mailto:${input.email}">${input.email}</a></td></tr>`,
                input.phone && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Phone</td><td style="padding:4px 0;font-size:14px">${input.phone}</td></tr>`,
                input.company && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Company</td><td style="padding:4px 0;font-size:14px">${input.company}</td></tr>`,
                input.eventType && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Event type</td><td style="padding:4px 0;font-size:14px">${input.eventType}</td></tr>`,
                formattedEventDate && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Event date</td><td style="padding:4px 0;font-size:14px;font-weight:bold;color:#2D4A3E">${formattedEventDate}</td></tr>`,
                input.guestCount && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Guests</td><td style="padding:4px 0;font-size:14px">${input.guestCount}</td></tr>`,
                input.budget && `<tr><td style="padding:4px 0;color:#666;font-size:14px">Budget</td><td style="padding:4px 0;font-size:14px">$${input.budget} NZD</td></tr>`,
                input.message && `<tr><td style="padding:4px 0;color:#666;font-size:14px;vertical-align:top">Message</td><td style="padding:4px 0;font-size:14px">${input.message}</td></tr>`,
              ].filter(Boolean).join('');
              const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#6b98e7;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.8">VenueFlowHQ</div>
    <div style="font-size:22px;font-weight:bold;margin-top:4px">New Enquiry Received</div>
    <div style="font-size:15px;opacity:0.9;margin-top:2px">${clientName}</div>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    ${existingOnDayHtml}
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af">
      This notification was sent by VenueFlowHQ · Log in to your dashboard to respond.
    </div>
  </div>
</div>`;
              await transporter.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                replyTo: input.email || fromEmail,
                to: vs.notificationEmail,
                subject: `New Event Enquiry: ${clientName}`,
                html,
                text: `New Enquiry from ${clientName}\nEmail: ${input.email}\n${input.phone ? 'Phone: ' + input.phone + '\n' : ''}${input.eventType ? 'Event type: ' + input.eventType + '\n' : ''}${formattedEventDate ? 'Event date: ' + formattedEventDate + '\n' : ''}${input.guestCount ? 'Guests: ' + input.guestCount + '\n' : ''}${input.message ? 'Message: ' + input.message : ''}`,
              });
              console.log(`[LeadSubmit] Notification email sent to ${vs.notificationEmail}`);
            } else {
              const missing = [];
              if (!vs?.notificationEmail) missing.push('notificationEmail');
              if (!vs?.smtpHost) missing.push('smtpHost');
              if (!vs?.smtpUser) missing.push('smtpUser');
              if (!vs?.smtpPass) missing.push('smtpPass');
              if (missing.length) console.log(`[LeadSubmit] Notification email skipped — missing settings: ${missing.join(', ')}`);
            }
          }
        } catch (notifyErr: any) {
          console.error('[LeadSubmit] Notification email error:', notifyErr?.message ?? notifyErr);
        }

        return lead;
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.string(),
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
              const created = await createBooking({
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
              // Push to NBI immediately so confirmed bookings created via
              // lead status changes also appear in the NBI diary.
              const newId = (created as any)?.id ?? (created as any)?.[0]?.id;
              if (newId) {
                const { pushBookingToNbi } = await import('./nowbookit');
                await pushBookingToNbi(newId, ctx.user.id, { source: 'leads.updateStatus→booked' });
              }
            }
          }
        }
        // When function/event pack is sent, auto-schedule a 5-day follow-up task
        if (input.status === "function_pack_sent") {
          const { getDb } = await import('./db');
          const { tasks } = await import('../drizzle/schema');
          const db = await getDb();
          if (db) {
            const lead = await getLeadById(input.id);
            const leadName = lead ? `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}` : 'client';
            const fiveDaysFromNow = Date.now() + 5 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            await db.insert(tasks).values({
              ownerId: ctx.user.id,
              title: `Follow up with ${leadName}`,
              description: `Function pack was sent — check in with ${leadName} to confirm they've received it and answer any questions.`,
              dueDate: fiveDaysFromNow,
              linkedLeadId: input.id,
              priority: 'high',
              completed: false,
              createdAt: now,
              updatedAt: now,
            });
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
        firstName: z.string().optional(),
        lastName: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().optional(),
        company: z.string().nullable().optional(),
        eventType: z.string().nullable().optional(),
        eventDate: z.string().nullable().optional(),
        guestCount: z.coerce.number().nullable().optional(),
        budget: z.coerce.number().nullable().optional(),
        message: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, followUpDate, eventDate, ...rest } = input;
        await updateLead(id, {
          ...rest,
          followUpDate: followUpDate ? new Date(followUpDate) : undefined,
          eventDate: eventDate ? new Date(eventDate) : eventDate === null ? null : undefined,
        } as any);
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
        status: z.string(),
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
        status: z.string().optional(),
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

    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { leads, leadActivity } = await import('../drizzle/schema');
        const { eq, and, inArray } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return { deleted: 0 };
        await db.delete(leadActivity).where(inArray(leadActivity.leadId, input.ids));
        const result = await db.delete(leads)
          .where(and(inArray(leads.id, input.ids), eq(leads.ownerId, ctx.user.id)));
        return { deleted: input.ids.length };
      }),

    parseEnquiryText: protectedProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm');
        const prompt = `You are a venue event coordinator assistant. Parse the following text (an email, message, or event brief) and extract all relevant enquiry details.

Return a JSON object with any of the following fields that are present in the text:
- "firstName": string — client's first name
- "lastName": string — client's last name
- "email": string — client's email address
- "phone": string — client's phone number
- "company": string — company or organisation name if mentioned
- "eventType": string — type of event (e.g. "Wedding", "Corporate Dinner", "Birthday", "Conference")
- "eventDate": string — ISO date format YYYY-MM-DD
- "guestCount": integer — number of guests
- "budget": number — budget in NZD if mentioned
- "spaceName": string — venue space or room name if mentioned
- "message": string — a concise 1-3 sentence summary of the enquiry capturing key details not covered by other fields

Rules:
- Only include fields that are clearly stated or strongly implied in the text
- For eventDate, convert any written date to YYYY-MM-DD format
- For guestCount, use the number mentioned (e.g. "80 guests" → 80)
- Do not invent or guess information not present in the text

Text to parse:
${input.text}

Return ONLY valid JSON. Example: {"firstName":"Jane","lastName":"Smith","email":"jane@example.com","eventType":"Wedding","eventDate":"2026-09-14","guestCount":80,"message":"Jane is enquiring about a Saturday wedding reception for 80 guests in September."}`;

        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a helpful assistant that outputs valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' } as any,
        });
        const rawContent = response.choices?.[0]?.message?.content ?? '{}';
        try {
          const parsed = JSON.parse(typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent));
          return { success: true, data: parsed };
        } catch {
          return { success: false, data: {} };
        }
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

          // Attempt to send email to client if SMTP configured
          if (proposal.publicToken) {
            try {
              const { getDb } = await import('./db');
              const { venueSettings, leads } = await import('../drizzle/schema');
              const { eq } = await import('drizzle-orm');
              const db = await getDb();
              if (db) {
                const [vs, lead] = await Promise.all([
                  db.select().from(venueSettings).where(eq(venueSettings.ownerId, ctx.user.id)).limit(1).then(r => r[0]),
                  db.select({ firstName: leads.firstName, lastName: leads.lastName, email: leads.email }).from(leads).where(eq(leads.id, proposal.leadId)).limit(1).then(r => r[0]),
                ]);
                if (vs?.smtpHost && vs?.smtpUser && vs?.smtpPass && lead?.email) {
                  const nodemailer = await import('nodemailer');
                  const transporter = nodemailer.default.createTransport({
                    host: vs.smtpHost, port: vs.smtpPort ?? 587,
                    secure: (vs.smtpSecure ?? 0) === 1,
                    auth: { user: vs.smtpUser, pass: vs.smtpPass },
                  });
                  const proposalUrl = `${process.env.REPLIT_DEV_DOMAIN ? 'https://' + process.env.REPLIT_DEV_DOMAIN : 'https://' + (process.env.REPLIT_DOMAINS ?? '').split(',')[0]}/proposal/${proposal.publicToken}`;
                  const fromName = vs.smtpFromName ?? vs.name ?? 'VenueFlowHQ';
                  const fromEmail = vs.smtpFromEmail ?? vs.smtpUser;
                  const clientName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
                  await transporter.sendMail({
                    from: `"${fromName}" <${fromEmail}>`,
                    to: `"${clientName}" <${lead.email}>`,
                    subject: `Your event proposal — ${proposal.title}`,
                    html: `<p>Hi ${lead.firstName},</p><p>Please find your event proposal below:</p><p><a href="${proposalUrl}" style="background:#4f7942;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View Proposal</a></p><p>Or copy this link: <a href="${proposalUrl}">${proposalUrl}</a></p><p>This proposal includes pricing, details, and terms for your event. Please don't hesitate to reach out if you have any questions.</p><p>Warm regards,<br>${fromName}</p>`,
                    text: `Hi ${lead.firstName},\n\nPlease find your event proposal here: ${proposalUrl}\n\nWarm regards,\n${fromName}`,
                  });
                }
              }
            } catch (emailErr) {
              console.error('[ProposalSend] Email error (non-fatal):', emailErr);
            }
          }
        }
        return { success: true, token: proposal?.publicToken, emailSent: true };
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
            const created = await createBooking({
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
            // Push to NBI so accepted proposals appear in the NBI diary too.
            const newId = (created as any)?.id ?? (created as any)?.[0]?.id;
            if (newId) {
              const { pushBookingToNbi } = await import('./nowbookit');
              await pushBookingToNbi(newId, proposal.ownerId, { source: 'proposals.respond→accepted' });
            }
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

    /**
     * Returns the booking row for a given leadId. If the lead has status
     * "booked"/"confirmed" but no booking row exists yet (legacy leads), one
     * is auto-created so the rich event drawer can show full quick actions.
     */
    ensureForLead: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const existing = await getBookings(ctx.user.id);
        const found = existing.find((b: any) => b.leadId === input.leadId);
        if (found) return found;
        const lead = await getLeadById(input.leadId);
        if (!lead) throw new Error('Lead not found');
        if (!['booked', 'confirmed', 'finished'].includes(lead.status ?? '')) {
          throw new Error('Lead is not booked yet');
        }
        const created = await createBooking({
          ownerId: ctx.user.id,
          leadId: input.leadId,
          firstName: lead.firstName,
          lastName: lead.lastName ?? undefined,
          email: lead.email,
          eventType: lead.eventType ?? undefined,
          eventDate: lead.eventDate ?? new Date(),
          eventEndDate: lead.eventEndDate ?? undefined,
          guestCount: lead.guestCount ?? undefined,
          status: lead.status === 'finished' ? 'finished' : 'confirmed',
        } as any);
        return created;
      }),

    /**
     * Bookings whose event ended ≥2 days ago and have no actualSpend recorded
     * yet — surfaced as a prompt on the Overview so the user records what was
     * actually spent. Dismissible per-booking via spendPromptDismissedAt.
     */
    pendingSpend: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { bookings } = await import('../drizzle/schema');
      const { eq, and, isNull, lte, or, sql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const rows = await db.select().from(bookings).where(and(
        eq(bookings.ownerId, ctx.user.id),
        eq(bookings.status, 'confirmed'),
        isNull(bookings.actualSpend),
        isNull(bookings.spendPromptDismissedAt),
        // event finished — use eventEndDate if set, otherwise eventDate
        or(
          and(sql`${bookings.eventEndDate} IS NOT NULL`, lte(bookings.eventEndDate, cutoff)),
          and(isNull(bookings.eventEndDate), lte(bookings.eventDate, cutoff)),
        )!,
      ));
      // newest events first
      rows.sort((a: any, b: any) => +new Date(b.eventDate) - +new Date(a.eventDate));
      return rows.slice(0, 10);
    }),

    recordActualSpend: protectedProcedure
      .input(z.object({
        id: z.number(),
        actualSpend: z.number().nullable(),
        actualSpendNotes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(bookings).set({
          actualSpend: input.actualSpend !== null ? String(input.actualSpend) : null,
          actualSpendNotes: input.actualSpendNotes ?? null,
          actualSpendRecordedAt: new Date(),
        }).where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)));
        return { success: true };
      }),

    dismissSpendPrompt: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(bookings).set({ spendPromptDismissedAt: new Date() })
          .where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)));
        return { success: true };
      }),

    /** Mint (or return existing) public token used as the live event-pack URL. */
    getOrCreateBeoToken: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [row] = await db.select().from(bookings)
          .where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id))).limit(1);
        if (!row) throw new Error('Booking not found');
        if (row.beoShareToken) return { token: row.beoShareToken };
        const { randomBytes } = await import('crypto');
        const token = randomBytes(20).toString('hex');
        await db.update(bookings).set({ beoShareToken: token })
          .where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)));
        return { token };
      }),

    revokeBeoToken: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(bookings).set({ beoShareToken: null })
          .where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)));
        return { success: true };
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
        // ── NowBookIt sync — fires when the booking transitions into 'confirmed' ──
        if (rest.status === 'confirmed') {
          const { pushBookingToNbi } = await import('./nowbookit');
          await pushBookingToNbi(id, ctx.user.id, { source: 'bookings.update' });
        }
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

    /**
     * Manually push a single booking into NowBookIt. Routes through
     * pushBookingToNbi so it benefits from the same contact/lead enrichment
     * (phone + lastName lookup) and placeholder fallbacks. Without that,
     * bookings created without a contact/lead would 400 with NBI's
     * "PostBookings requires Customer's: FirstName, LastName, Phone".
     */
    pushToNbi: protectedProcedure
      .input(z.object({ id: z.number(), force: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { pushBookingToNbi } = await import('./nowbookit');
        const result = await pushBookingToNbi(input.id, ctx.user.id, {
          source: 'bookings.pushToNbi(manual)',
          force: input.force,
        });
        if (result.pushed) {
          return { success: true, nbiBookingId: result.nbiBookingId };
        }
        if (result.reason === 'already_pushed') {
          return { success: true, nbiBookingId: result.nbiBookingId, alreadyPushed: true };
        }
        if (result.reason?.startsWith('not_configured')) {
          throw new Error('NowBookIt is not connected. Add your Account ID and Venue ID in Settings → Integrations.');
        }
        if (result.reason === 'missing_event_date') {
          throw new Error('This booking has no event date set. Add an event date and time before pushing to NowBookIt.');
        }
        if (result.reason === 'booking_not_found') {
          throw new Error('Booking not found');
        }
        throw new Error(result.error || result.reason || 'NowBookIt rejected the booking');
      }),

    /**
     * Mark a booking as already synced in NowBookIt without actually pushing
     * it. Use when NBI returned a 409 conflict but the booking does (or will)
     * exist in NBI manually — stops VenueFlow from trying to re-push.
     * Pass an optional NBI booking id; otherwise we set a "manual-sync" tag.
     */
    markNbiSynced: protectedProcedure
      .input(z.object({ id: z.number(), nbiBookingId: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const value = (input.nbiBookingId?.trim() || `manual-sync-${Date.now()}`).slice(0, 100);
        const [updated] = await db.update(bookings)
          .set({ nbiBookingId: value })
          .where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)))
          .returning();
        if (!updated) throw new Error('Booking not found');
        return { success: true, nbiBookingId: updated.nbiBookingId };
      }),

    /**
     * Clear the NowBookIt sync marker so the booking can be re-pushed cleanly.
     */
    clearNbiSync: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { bookings } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(bookings)
          .set({ nbiBookingId: null })
          .where(and(eq(bookings.id, input.id), eq(bookings.ownerId, ctx.user.id)));
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
        }).returning({ id: menuPackages.id });
        return { id: result.id };
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
        }).returning({ id: menuItems.id });
        return { id: result.id };
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
        }).returning({ id: barMenuItems.id });
        return { id: result.id };
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
        attachments: z.array(z.object({
          filename: z.string(),
          content: z.string(),
          contentType: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.isTeamMember) throw new Error('Team members cannot send emails. Contact your venue manager.');
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

        const fromName = settings.smtpFromName ?? settings.name ?? 'VenueFlowHQ';
        const fromEmail = settings.smtpFromEmail ?? settings.smtpUser;

        // Build HTML: body + optional signature (logo + text)
        const bodyHtml = input.body.replace(/\n/g, '<br>');
        const sigLogo = (settings as any).emailSignatureLogo ?? '';
        const sigText = (settings as any).emailSignature ?? '';
        const signatureHtml = (sigLogo || sigText)
          ? `<br><br><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">${sigLogo ? `<img src="${sigLogo}" alt="" style="max-height:60px;width:auto;display:block;margin-bottom:8px">` : ''}${sigText ? `<span style="white-space:pre-wrap">${sigText}</span>` : ''}`
          : '';
        const fullHtml = `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#1a1209">${bodyHtml}${signatureHtml}</div>`;

        // Process attachments (base64 encoded)
        const attachments = (input.attachments ?? []).map(a => ({
          filename: a.filename,
          content: Buffer.from(a.content.split(',').pop() ?? a.content, 'base64'),
          contentType: a.contentType,
        }));

        // Reply-To = notification email (or sender) so customer replies land
        // in the user's normal inbox. BCC the same address so the user keeps
        // a copy of every outgoing message in their email log.
        const replyAndBcc = settings.notificationEmail || fromEmail;

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: input.toName ? `"${input.toName}" <${input.to}>` : input.to,
          replyTo: replyAndBcc,
          bcc: replyAndBcc,
          subject: input.subject,
          html: fullHtml,
          text: input.body,
          attachments,
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
          const [result] = await db.insert(floorPlans).values({ ownerId: ctx.user.id, bookingId: input.bookingId, name: input.name, bgImageUrl: input.bgImageUrl, canvasData: input.canvasData }).returning({ id: floorPlans.id });
          return { id: result.id };
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
    generateShareLink: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { floorPlans } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const { randomBytes } = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const token = randomBytes(20).toString('hex');
        await db.update(floorPlans).set({ shareToken: token }).where(and(eq(floorPlans.id, input.id), eq(floorPlans.ownerId, ctx.user.id)));
        return { token };
      }),
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { floorPlans } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [plan] = await db.select().from(floorPlans).where(eq(floorPlans.shareToken, input.token)).limit(1);
        return plan ?? null;
      }),
  }),

  // ─── Setup Instructions ──────────────────────────────────────────────────────
  setupInstructions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { setupInstructions } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(setupInstructions).where(eq(setupInstructions.ownerId, ctx.user.id)).orderBy(asc(setupInstructions.sortOrder), asc(setupInstructions.createdAt));
    }),
    create: protectedProcedure
      .input(z.object({ title: z.string().min(1), content: z.string().optional(), category: z.string().optional(), images: z.array(z.string()).optional() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { setupInstructions } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        await db.insert(setupInstructions).values({ ownerId: ctx.user.id, title: input.title, content: input.content ?? null, category: input.category ?? 'general', images: input.images ?? [], sortOrder: 0, createdAt: now, updatedAt: now });
        return { success: true };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), title: z.string().min(1).optional(), content: z.string().nullable().optional(), category: z.string().optional(), images: z.array(z.string()).optional() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { setupInstructions } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(setupInstructions).set({ ...rest, updatedAt: Date.now() }).where(and(eq(setupInstructions.id, id), eq(setupInstructions.ownerId, ctx.user.id)));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { setupInstructions } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(setupInstructions).where(and(eq(setupInstructions.id, input.id), eq(setupInstructions.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Table Setups ────────────────────────────────────────────────────────────
  tableSetups: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { tableSetups } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(tableSetups).where(eq(tableSetups.ownerId, ctx.user.id)).orderBy(desc(tableSetups.createdAt));
    }),
    save: protectedProcedure
      .input(z.object({ id: z.number().optional(), name: z.string().default('Table Setup'), description: z.string().optional(), canvasData: z.any().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { tableSetups } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        if (input.id) {
          await db.update(tableSetups).set({ name: input.name, description: input.description ?? null, canvasData: input.canvasData, updatedAt: now }).where(and(eq(tableSetups.id, input.id), eq(tableSetups.ownerId, ctx.user.id)));
          return { id: input.id };
        } else {
          const [result] = await db.insert(tableSetups).values({ ownerId: ctx.user.id, name: input.name, description: input.description ?? null, canvasData: input.canvasData, createdAt: now, updatedAt: now }).returning({ id: tableSetups.id });
          return { id: result.id };
        }
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { tableSetups } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(tableSetups).where(and(eq(tableSetups.id, input.id), eq(tableSetups.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Waitlist ────────────────────────────────────────────────────────────────
  waitlist: router({
    join: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        venueName: z.string().optional(),
        message: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { waitlist } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(waitlist).values({
          name: input.name,
          email: input.email,
          venueName: input.venueName ?? null,
          message: input.message ?? null,
        });
        return { success: true };
      }),

    list: protectedProcedure.query(async () => {
      const { getDb } = await import('./db');
      const { waitlist } = await import('../drizzle/schema');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(waitlist).orderBy(waitlist.createdAt);
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
        const [result] = await db.insert(checklistTemplates).values({ ownerId: ctx.user.id, name: input.name, description: input.description, items: input.items }).returning({ id: checklistTemplates.id });
        return { id: result.id, ...input };
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
        const [result] = await db.insert(checklistInstances).values({ templateId: input.templateId, bookingId: input.bookingId, ownerId: ctx.user.id, name: input.name ?? template.name, items }).returning({ id: checklistInstances.id });
        return { id: result.id };
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

    getOrCreateForRunsheet: protectedProcedure
      .input(z.object({
        runsheetId: z.number(),
        name: z.string().optional(),
        defaultItems: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), checked: z.boolean() })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistInstances } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const crypto = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const existing = await db.select().from(checklistInstances)
          .where(and(eq(checklistInstances.runsheetId, input.runsheetId), eq(checklistInstances.ownerId, ctx.user.id)))
          .limit(1);
        if (existing[0]) return existing[0];
        const shareToken = crypto.randomBytes(24).toString('hex');
        const items = (input.defaultItems ?? []).map(i => ({ ...i, checked: false, checkedAt: undefined, notes: undefined }));
        const [result] = await db.insert(checklistInstances).values({
          runsheetId: input.runsheetId,
          ownerId: ctx.user.id,
          name: input.name ?? 'Staff Checklist',
          items,
          shareToken,
        }).returning();
        return result;
      }),

    getByShareToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { checklistInstances } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.shareToken, input.token)).limit(1);
        return instance ?? null;
      }),

    toggleItemByToken: publicProcedure
      .input(z.object({ token: z.string(), itemId: z.string(), checked: z.boolean() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { checklistInstances } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [instance] = await db.select().from(checklistInstances).where(eq(checklistInstances.shareToken, input.token)).limit(1);
        if (!instance) throw new Error('Checklist not found');
        const items = (instance.items as any[]).map(item =>
          item.id === input.itemId
            ? { ...item, checked: input.checked, checkedAt: input.checked ? new Date().toISOString() : undefined }
            : item
        );
        await db.update(checklistInstances).set({ items, updatedAt: new Date() }).where(eq(checklistInstances.id, instance.id));
        return { success: true, items };
      }),

    saveItemsForRunsheet: protectedProcedure
      .input(z.object({
        runsheetId: z.number(),
        items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), checked: z.boolean(), checkedAt: z.string().optional(), notes: z.string().optional() })),
      }))
      .mutation(async ({ input, ctx }) => {
        const { getDb } = await import('./db');
        const { checklistInstances } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(checklistInstances)
          .set({ items: input.items, updatedAt: new Date() })
          .where(and(eq(checklistInstances.runsheetId, input.runsheetId), eq(checklistInstances.ownerId, ctx.user.id)));
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
        venueArea: z.string().optional(),
        eventStartTime: z.string().optional(),
        eventEndTime: z.string().optional(),
        guestCount: z.number().optional(),
        eventType: z.string().optional(),
        notes: z.string().optional(),
        dietaries: z.array(z.object({ name: z.string(), count: z.number(), notes: z.string().optional() })).optional(),
        venueSetup: z.string().optional(),
        footerText: z.string().optional(),
        gstInclusive: z.boolean().optional(),
        paymentNotes: z.string().optional(),
        costItems: z.array(z.object({ _id: z.string(), label: z.string(), qty: z.number(), unitPrice: z.number(), category: z.string().optional() })).optional(),
        drinksData: z.object({ barOption: z.string(), tabAmount: z.number().optional(), selectedDrinks: z.array(z.string()), customDrinks: z.array(z.object({ name: z.string(), description: z.string().optional(), price: z.number().optional() })), barNotes: z.string().optional() }).nullable().optional(),
        items: z.array(z.object({
          time: z.string(),
          duration: z.number().optional(),
          title: z.string(),
          description: z.string().optional(),
          assignedTo: z.string().optional(),
          category: z.string().optional(),
          sortOrder: z.number().default(0),
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
          highlight: z.string().optional(),
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
          venueArea: input.venueArea ?? null,
          eventStartTime: input.eventStartTime ?? null,
          eventEndTime: input.eventEndTime ?? null,
          guestCount: input.guestCount ?? null,
          eventType: input.eventType ?? null,
          notes: input.notes ?? null,
          dietaries: input.dietaries ?? null,
          venueSetup: input.venueSetup ?? null,
          footerText: input.footerText ?? null,
          gstInclusive: input.gstInclusive ?? false,
          paymentNotes: input.paymentNotes ?? null,
          costItems: input.costItems ?? null,
          drinksData: input.drinksData ?? null,
          proposalId: input.proposalId ?? null,
          publicToken: token,
        }).returning({ id: runsheets.id });
        const id = result.id;
        if (input.items?.length) {
          await db.insert(runsheetItems).values(
            input.items.map((item, i) => ({
              runsheetId: id,
              ownerId: ctx.user.id,
              time: item.time,
              duration: item.duration ?? 0,
              title: item.title,
              description: item.description ?? null,
              assignedTo: item.assignedTo ?? null,
              category: item.category ?? 'other',
              sortOrder: item.sortOrder ?? i,
              bold: item.bold ?? false,
              italic: item.italic ?? false,
              highlight: item.highlight ?? null,
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
        venueArea: z.string().optional(),
        eventStartTime: z.string().optional().nullable(),
        eventEndTime: z.string().optional().nullable(),
        guestCount: z.number().optional(),
        eventType: z.string().optional(),
        notes: z.string().optional(),
        dietaries: z.array(z.object({ name: z.string(), count: z.number(), notes: z.string().optional() })).optional(),
        venueSetup: z.string().optional(),
        footerText: z.string().optional(),
        proposalId: z.number().nullable().optional(),
        floorPlanId: z.number().nullable().optional(),
        fnbColumns: z.object({ dietary: z.boolean().optional(), serviceTime: z.boolean().optional(), staff: z.boolean().optional(), notes: z.boolean().optional(), qty: z.boolean().optional() }).optional(),
        costItems: z.array(z.object({ _id: z.string(), label: z.string(), qty: z.number(), unitPrice: z.number(), category: z.string().optional() })).nullable().optional(),
        drinksData: z.object({ barOption: z.string(), tabAmount: z.number().optional(), selectedDrinks: z.array(z.string()), customDrinks: z.array(z.object({ name: z.string(), description: z.string().optional(), price: z.number().optional() })), barNotes: z.string().optional() }).nullable().optional(),
        gstInclusive: z.boolean().optional(),
        paymentNotes: z.string().optional().nullable(),
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
        if (fields.venueArea !== undefined) updateData.venueArea = fields.venueArea;
        if (fields.eventStartTime !== undefined) updateData.eventStartTime = fields.eventStartTime;
        if (fields.eventEndTime !== undefined) updateData.eventEndTime = fields.eventEndTime;
        if (fields.guestCount !== undefined) updateData.guestCount = fields.guestCount;
        if (fields.eventType !== undefined) updateData.eventType = fields.eventType;
        if (fields.notes !== undefined) updateData.notes = fields.notes;
        if (fields.eventDate !== undefined) updateData.eventDate = fields.eventDate ? new Date(fields.eventDate) : null;
        if (fields.dietaries !== undefined) updateData.dietaries = fields.dietaries;
        if (fields.venueSetup !== undefined) updateData.venueSetup = fields.venueSetup;
        if (fields.footerText !== undefined) updateData.footerText = fields.footerText;
        if (fields.proposalId !== undefined) updateData.proposalId = fields.proposalId;
        if (fields.floorPlanId !== undefined) updateData.floorPlanId = fields.floorPlanId;
        if (fields.fnbColumns !== undefined) updateData.fnbColumns = fields.fnbColumns;
        if (fields.costItems !== undefined) updateData.costItems = fields.costItems;
        if (fields.drinksData !== undefined) updateData.drinksData = fields.drinksData;
        if (fields.gstInclusive !== undefined) updateData.gstInclusive = fields.gstInclusive;
        if (fields.paymentNotes !== undefined) updateData.paymentNotes = fields.paymentNotes;
        updateData.updatedAt = new Date();
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
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        highlight: z.string().nullable().optional(),
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
          duration: input.duration ?? 0,
          title: input.title,
          description: input.description ?? null,
          assignedTo: input.assignedTo ?? null,
          category: input.category ?? 'other',
          sortOrder: input.sortOrder,
          bold: input.bold ?? false,
          italic: input.italic ?? false,
          highlight: input.highlight ?? null,
        }).returning({ id: runsheetItems.id });
        return { id: result.id };
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
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        highlight: z.string().nullable().optional(),
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
        }).returning({ id: payments.id });
        return { id: result.id, success: true };
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
          course: z.string().nullable().optional(),
          dishName: z.string(),
          description: z.string().nullable().optional(),
          qty: z.number().int().default(1),
          dietary: z.string().nullable().optional(),
          serviceTime: z.string().nullable().optional(),
          prepNotes: z.string().nullable().optional(),
          platingNotes: z.string().nullable().optional(),
          staffAssigned: z.string().nullable().optional(),
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
        }).returning({ id: leads.id });
        // Notify owner
        try {
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: `New Express Book Request — ${input.firstName} ${input.lastName ?? ''}`,
            content: `${input.eventType} on ${input.eventDate} for ${input.guestCount} guests. Email: ${input.email}`,
          });
        } catch {}
        return { success: true, leadId: result.id };
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
        }).returning({ id: runsheetTemplates.id });
        return { id: result.id, success: true };
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
    // ── AI F&B Parse ──
    parseFnbText: protectedProcedure
      .input(z.object({
        text: z.string().min(1),
        eventType: z.string().optional(),
        guestCount: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm');
        const guestHint = input.guestCount ? ` The event has ${input.guestCount} guests.` : '';
        const typeHint = input.eventType ? ` Event type: ${input.eventType}.` : '';
        const prompt = `You are a professional venue event coordinator. Parse the following catering brief or menu notes and extract ALL food and beverage items into a structured list.${typeHint}${guestHint}\n\nReturn a JSON object with a single key "fnbItems" containing an array of items. Each item must have:\n- "section": either "foh" (front of house/service) or "kitchen" (kitchen prep)\n- "course": one of exactly: Canapes, Entree, Main, Dessert, Cheese, Late Night Snack, Breakfast, Morning Tea, Lunch, Afternoon Tea, Drinks, Other\n- "dishName": the name of the dish or item\n- "description": brief description if available (can be empty string)\n- "qty": quantity/portions as integer (use guest count if mentioned, else 1)\n- "dietary": dietary notes e.g. "V, GF" (can be empty string)\n- "serviceTime": time in HH:MM 24h format if mentioned (can be empty string)\n- "prepNotes": any kitchen prep notes (can be empty string)\n\nRules:\n- Group items by course logically (canapes before entree, etc.)\n- If a dish has multiple dietary variants (e.g. "beef and a vegetarian option"), create separate rows\n- Infer course from context (e.g. "on arrival" = Canapes, "sit down" = Entree/Main)\n- For drinks, use course = "Drinks"\n- If quantities are "per person" and guest count is known, multiply\n\nText to parse:\n${input.text}\n\nReturn ONLY valid JSON.`;
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a helpful assistant that outputs valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' } as any,
        });
        const rawContent = response.choices?.[0]?.message?.content ?? '{}';
        const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        try {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed.fnbItems) ? parsed.fnbItems : (Array.isArray(parsed) ? parsed : []);
          return { fnbItems: items.slice(0, 80), success: true };
        } catch {
          return { fnbItems: [], success: false, error: 'Failed to parse AI response' };
        }
      }),
    // ── AI Runsheet Parse ──
    parseRunsheetText: protectedProcedure
      .input(z.object({ text: z.string().min(1), eventType: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm');
        const prompt = `You are a venue event coordinator assistant. Parse the following text and extract ALL available event information into structured sections.

Return a JSON object with any of these sections that have data in the text:
- "eventDetails": an object with any of: eventDate (ISO date YYYY-MM-DD), guestCount (integer), eventType (string e.g. "Wedding", "Corporate"), contactName (string), contactEmail (string), contactPhone (string), spaceName (string), venueSetup (string describing room/table layout)
- "dietaries": array of { name (string e.g. "Vegetarian"), count (integer, default 1), notes (string, optional) }
- "fnbItems": array of { course (one of: Canapes, Entree, Main, Dessert, Cheese, Late Night Snack, Breakfast, Morning Tea, Lunch, Afternoon Tea, Drinks, Other), dishName (string), qty (integer), serviceTime (HH:MM 24h, optional), dietary (string, optional) }
- "timelineItems": array of { time (HH:MM 24h format), duration (integer minutes), title (string), description (string, optional), category (one of: setup, guest, food, beverage, speech, entertainment, packdown, other) }

Rules:
- Only include sections for data actually present in the text
- Estimate durations if not stated; estimate times from context if missing
- For dietary counts, use the number mentioned or 1 if unspecified
- Event type context: ${input.eventType ?? 'general event'}

Text to parse:
${input.text}

Return ONLY valid JSON. Example structure:
{"eventDetails":{"eventDate":"2026-06-15","guestCount":80,"eventType":"Wedding","contactName":"Jane Smith"},"dietaries":[{"name":"Vegetarian","count":5,"notes":"2 also vegan"}],"fnbItems":[{"course":"Canapes","dishName":"Smoked salmon blini","qty":80,"serviceTime":"17:00"}],"timelineItems":[{"time":"16:00","duration":60,"title":"Venue setup","category":"setup"}]}`;
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a helpful assistant that outputs valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' } as any,
        });
        const rawContent = response.choices?.[0]?.message?.content ?? '{}';
        const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return { timelineItems: parsed, fnbItems: [], dietaries: [], eventDetails: null, success: true };
          if (parsed.items || parsed.timeline) return { timelineItems: (parsed.items ?? parsed.timeline ?? []).slice(0, 60), fnbItems: [], dietaries: [], eventDetails: null, success: true };
          return {
            eventDetails: parsed.eventDetails ?? null,
            dietaries: Array.isArray(parsed.dietaries) ? parsed.dietaries : [],
            fnbItems: Array.isArray(parsed.fnbItems) ? parsed.fnbItems.slice(0, 60) : [],
            timelineItems: Array.isArray(parsed.timelineItems) ? parsed.timelineItems.slice(0, 60) : [],
            success: true,
          };
        } catch {
          return { timelineItems: [], fnbItems: [], dietaries: [], eventDetails: null, success: false, error: 'Failed to parse response' };
        }
      }),
    // ── AI Checklist Parse ──
    parseChecklistText: protectedProcedure
      .input(z.object({ text: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm');
        const prompt = `You are a venue operations assistant. Convert the following pasted text (a to-do list, brief, email or notes) into a structured staff CHECKLIST.

Return a JSON object:
{
  "name": short checklist title (e.g. "Bar Opening Checklist"),
  "category": one of: general, bar, restaurant, kitchen, opening, closing, cleaning,
  "items": array of { "text": short imperative task (max ~120 chars), "note": optional clarifying detail or "" }
}

Rules:
- One row per discrete task. Split combined tasks ("wipe tables and chairs" → 2 items) only when clearly separate.
- Strip bullet characters, numbering, and emojis from the start of each task.
- Pick the most specific category from the list (default "general").
- Infer a sensible short name from the content if no title is given.
- Keep tasks in the original order.
- Max 80 items.

Text to parse:
${input.text}

Return ONLY valid JSON.`;
        const response = await invokeLLM({
          messages: [
            { role: 'system', content: 'You are a helpful assistant that outputs valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' } as any,
        });
        const rawContent = response.choices?.[0]?.message?.content ?? '{}';
        const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        try {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);
          const allowed = new Set(['general','bar','restaurant','kitchen','opening','closing','cleaning']);
          const cat = typeof parsed.category === 'string' && allowed.has(parsed.category) ? parsed.category : 'general';
          return {
            name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 120) : 'Pasted Checklist',
            category: cat,
            items: items.slice(0, 80).map((it: any) => ({
              text: String(it.text ?? it.title ?? '').trim().slice(0, 200),
              note: String(it.note ?? it.description ?? '').trim().slice(0, 400),
            })).filter((it: any) => it.text),
            success: true,
          };
        } catch {
          return { name: '', category: 'general', items: [], success: false, error: 'Failed to parse AI response' };
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
      .input(z.object({ name: z.string(), category: z.string().default('other'), quantity: z.number().default(1), notes: z.string().optional(), providedBy: z.enum(['venue','client']).default('venue'), bookingId: z.number().optional(), leadId: z.number().optional(), equipmentId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { eventEquipment } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.insert(eventEquipment).values({ ownerId: ctx.user.id, bookingId: input.bookingId ?? null, leadId: input.leadId ?? null, equipmentId: input.equipmentId ?? null, name: input.name, category: input.category, quantity: input.quantity, notes: input.notes ?? null, providedBy: input.providedBy, status: 'needed', sortOrder: 0, createdAt: Date.now() });
        return { success: true };
      }),
    updateEvent: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), quantity: z.number().optional(), notes: z.string().optional(), providedBy: z.enum(['venue','client']).optional(), status: z.enum(['needed','confirmed','delivered','returned']).optional() }))
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
        if (input.providedBy !== undefined) updates.providedBy = input.providedBy;
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

  // ─── Staff Portal ─────────────────────────────────────────────────────────
  staffPortal: router({
    // Public: fetch runsheet data by token (no auth required)
    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { staffPortalLinks, runsheets, runsheetItems, fnbItems } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [link] = await db.select().from(staffPortalLinks).where(eq(staffPortalLinks.token, input.token)).limit(1);
        if (!link) return null;
        if (link.expiresAt && link.expiresAt < Date.now()) return null;
        await db.update(staffPortalLinks).set({ lastAccessedAt: Date.now() }).where(eq(staffPortalLinks.id, link.id));
        const [runsheet] = await db.select().from(runsheets).where(eq(runsheets.id, link.runsheetId)).limit(1);
        if (!runsheet) return null;
        const items = await db.select().from(runsheetItems).where(eq(runsheetItems.runsheetId, link.runsheetId));
        const fnb = await db.select().from(fnbItems).where(eq(fnbItems.runsheetId, link.runsheetId));
        const { checklistInstances } = await import('../drizzle/schema');
        const cryptoMod = await import('crypto');
        let [checklistInstance] = await db.select().from(checklistInstances).where(eq(checklistInstances.runsheetId, link.runsheetId)).limit(1);
        if (!checklistInstance) {
          const shareToken = cryptoMod.randomBytes(24).toString('hex');
          const [created] = await db.insert(checklistInstances).values({
            runsheetId: link.runsheetId,
            ownerId: link.ownerId,
            name: runsheet.title ? `${runsheet.title} — Staff Checklist` : 'Staff Checklist',
            items: [],
            shareToken,
          }).returning();
          checklistInstance = created;
        } else if (!checklistInstance.shareToken) {
          const shareToken = cryptoMod.randomBytes(24).toString('hex');
          await db.update(checklistInstances).set({ shareToken }).where(eq(checklistInstances.id, checklistInstance.id));
          checklistInstance = { ...checklistInstance, shareToken };
        }
        // Fetch contact info from lead if linked
        let contactName: string | null = null;
        let contactEmail: string | null = null;
        let contactPhone: string | null = null;
        if (runsheet.leadId) {
          const { leads } = await import('../drizzle/schema');
          const [lead] = await db.select().from(leads).where(eq(leads.id, runsheet.leadId)).limit(1);
          if (lead) {
            contactName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
            contactEmail = lead.email;
            contactPhone = lead.phone ?? null;
          }
        }
        // Fetch payment records if runsheet is linked to a booking
        let paymentsData: { id: number; amount: string; type: string; method: string; paidAt: Date; notes: string | null }[] = [];
        if (runsheet.bookingId) {
          const { payments } = await import('../drizzle/schema');
          paymentsData = await db.select({
            id: payments.id,
            amount: payments.amount,
            type: payments.type,
            method: payments.method,
            paidAt: payments.paidAt,
            notes: payments.notes,
          }).from(payments).where(eq(payments.bookingId, runsheet.bookingId)).orderBy(payments.paidAt);
        }
        return { link, runsheet, items, fnb, contactName, contactEmail, contactPhone, payments: paymentsData, checklist: checklistInstance ?? null };
      }),

    // Protected: create a new staff portal link
    createLink: protectedProcedure
      .input(z.object({
        runsheetId: z.number(),
        label: z.string().optional(),
        expiresInDays: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { staffPortalLinks } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const crypto = await import('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = input.expiresInDays ? Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000 : null;
        const [created] = await db.insert(staffPortalLinks).values({
          ownerId: ctx.user.id,
          runsheetId: input.runsheetId,
          token,
          label: input.label ?? 'Staff Link',
          expiresAt: expiresAt ?? undefined,
          createdAt: Date.now(),
        }).returning();
        return created;
      }),

    // Protected: list all links for a runsheet
    listLinks: protectedProcedure
      .input(z.object({ runsheetId: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { staffPortalLinks } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        return db.select().from(staffPortalLinks).where(and(
          eq(staffPortalLinks.ownerId, ctx.user.id),
          eq(staffPortalLinks.runsheetId, input.runsheetId),
        ));
      }),

    // Protected: list every staff portal link for the current owner with the
    // joined runsheet info, so users can find a link even when they don't
    // remember which runsheet it was attached to.
    listAll: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { staffPortalLinks, runsheets } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: staffPortalLinks.id,
          token: staffPortalLinks.token,
          label: staffPortalLinks.label,
          createdAt: staffPortalLinks.createdAt,
          lastAccessedAt: staffPortalLinks.lastAccessedAt,
          expiresAt: staffPortalLinks.expiresAt,
          runsheetId: staffPortalLinks.runsheetId,
          runsheetTitle: runsheets.title,
          eventDate: runsheets.eventDate,
          venueName: runsheets.venueName,
          spaceName: runsheets.spaceName,
        })
        .from(staffPortalLinks)
        .leftJoin(runsheets, eq(runsheets.id, staffPortalLinks.runsheetId))
        .where(eq(staffPortalLinks.ownerId, ctx.user.id))
        .orderBy(desc(staffPortalLinks.createdAt));
      return rows;
    }),

    // Protected: delete a link
    deleteLink: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { staffPortalLinks } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(staffPortalLinks).where(and(
          eq(staffPortalLinks.id, input.id),
          eq(staffPortalLinks.ownerId, ctx.user.id),
        ));
        return { success: true };
      }),
  }),

  // ─── Furniture Inventory ──────────────────────────────────────────────────
  furnitureInventory: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { furnitureInventory } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(furnitureInventory)
        .where(eq(furnitureInventory.ownerId, ctx.user.id))
        .orderBy(asc(furnitureInventory.createdAt));
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        type: z.string().default('rect_table'),
        color: z.string().default('#d4a574'),
        width: z.number().int().positive().default(80),
        height: z.number().int().positive().default(80),
        seats: z.number().int().positive().optional(),
        quantity: z.number().int().positive().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { furnitureInventory } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const now = Date.now();
        const [result] = await db.insert(furnitureInventory).values({
          ownerId: ctx.user.id,
          name: input.name,
          type: input.type,
          color: input.color,
          width: input.width,
          height: input.height,
          seats: input.seats ?? null,
          quantity: input.quantity ?? null,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        }).returning({ id: furnitureInventory.id });
        return { success: true, id: result.id };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        type: z.string().optional(),
        color: z.string().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        seats: z.number().int().positive().nullable().optional(),
        quantity: z.number().int().positive().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { furnitureInventory } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(furnitureInventory)
          .set({ ...rest, updatedAt: Date.now() })
          .where(and(eq(furnitureInventory.id, id), eq(furnitureInventory.ownerId, ctx.user.id)));
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { furnitureInventory } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(furnitureInventory)
          .where(and(eq(furnitureInventory.id, input.id), eq(furnitureInventory.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Daily / Standalone Checklists ────────────────────────────────────────
  dailyChecklists: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
      const { eq, asc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      const lists = await db.select().from(dailyChecklists)
        .where(eq(dailyChecklists.ownerId, ctx.user.id))
        .orderBy(asc(dailyChecklists.sortOrder), asc(dailyChecklists.createdAt));
      const itemCounts = await db.select().from(dailyChecklistItems)
        .where(eq(dailyChecklistItems.ownerId, ctx.user.id));
      return lists.map(l => ({
        ...l,
        itemCount: itemCounts.filter(i => i.checklistId === l.id).length,
        checkedCount: itemCounts.filter(i => i.checklistId === l.id && i.checked === 1).length,
      }));
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [checklist] = await db.select().from(dailyChecklists)
          .where(and(eq(dailyChecklists.id, input.id), eq(dailyChecklists.ownerId, ctx.user.id))).limit(1);
        if (!checklist) return null;
        const items = await db.select().from(dailyChecklistItems)
          .where(eq(dailyChecklistItems.checklistId, input.id))
          .orderBy(asc(dailyChecklistItems.sortOrder));
        return { ...checklist, items };
      }),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems, venueSettings } = await import('../drizzle/schema');
        const { eq, asc } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [checklist] = await db.select().from(dailyChecklists)
          .where(eq(dailyChecklists.token, input.token)).limit(1);
        if (!checklist) return null;
        const items = await db.select().from(dailyChecklistItems)
          .where(eq(dailyChecklistItems.checklistId, checklist.id))
          .orderBy(asc(dailyChecklistItems.sortOrder));
        const [venue] = await db.select({ logoUrl: venueSettings.logoUrl, name: venueSettings.name })
          .from(venueSettings).where(eq(venueSettings.ownerId, checklist.ownerId)).limit(1);
        return { ...checklist, items, venueLogoUrl: venue?.logoUrl ?? null, venueName: venue?.name ?? null };
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        assignedDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists } = await import('../drizzle/schema');
        const crypto = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const token = crypto.randomBytes(24).toString('hex');
        const now = Date.now();
        const [created] = await db.insert(dailyChecklists).values({
          ownerId: ctx.user.id,
          name: input.name,
          description: input.description ?? null,
          category: input.category ?? 'general',
          assignedDate: input.assignedDate ?? null,
          token,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        }).returning();
        return created;
      }),

    createWithItems: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        assignedDate: z.string().optional(),
        items: z.array(z.object({ text: z.string().min(1), note: z.string().optional() })).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const crypto = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const token = crypto.randomBytes(24).toString('hex');
        const now = Date.now();
        const created = await db.transaction(async (tx) => {
          const [cl] = await tx.insert(dailyChecklists).values({
            ownerId: ctx.user.id,
            name: input.name,
            description: input.description ?? null,
            category: input.category ?? 'general',
            assignedDate: input.assignedDate ?? null,
            token,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          }).returning();
          if (input.items.length > 0) {
            await tx.insert(dailyChecklistItems).values(
              input.items.map((it, i) => ({
                checklistId: cl.id,
                ownerId: ctx.user.id,
                text: it.text,
                note: it.note ?? null,
                photoUrl: null,
                sortOrder: i,
                checked: 0,
                createdAt: now + i,
              }))
            );
          }
          return cl;
        });
        return created;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        assignedDate: z.string().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(dailyChecklists).set({ ...rest, updatedAt: Date.now() })
          .where(and(eq(dailyChecklists.id, id), eq(dailyChecklists.ownerId, ctx.user.id)));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(dailyChecklistItems).where(eq(dailyChecklistItems.checklistId, input.id));
        await db.delete(dailyChecklists).where(and(eq(dailyChecklists.id, input.id), eq(dailyChecklists.ownerId, ctx.user.id)));
        return { success: true };
      }),

    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, and, asc } = await import('drizzle-orm');
        const crypto = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [original] = await db.select().from(dailyChecklists)
          .where(and(eq(dailyChecklists.id, input.id), eq(dailyChecklists.ownerId, ctx.user.id))).limit(1);
        if (!original) throw new Error('Checklist not found');
        const items = await db.select().from(dailyChecklistItems)
          .where(eq(dailyChecklistItems.checklistId, original.id))
          .orderBy(asc(dailyChecklistItems.sortOrder));
        const token = crypto.randomBytes(24).toString('hex');
        const now = Date.now();
        const [newCl] = await db.insert(dailyChecklists).values({
          ownerId: ctx.user.id,
          name: `${original.name} (Copy)`,
          description: original.description,
          category: original.category,
          assignedDate: original.assignedDate,
          token,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        }).returning();
        if (items.length > 0) {
          await db.insert(dailyChecklistItems).values(
            items.map(it => ({
              ownerId: ctx.user.id,
              checklistId: newCl.id,
              text: it.text,
              note: it.note,
              photoUrl: it.photoUrl,
              sortOrder: it.sortOrder,
              checked: 0,
              checkedBy: null,
              checkedAt: null,
              createdAt: now,
              updatedAt: now,
            }))
          );
        }
        return newCl;
      }),

    addItem: protectedProcedure
      .input(z.object({
        checklistId: z.number(),
        text: z.string().min(1),
        note: z.string().optional(),
        photoUrl: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklistItems } = await import('../drizzle/schema');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [item] = await db.insert(dailyChecklistItems).values({
          checklistId: input.checklistId,
          ownerId: ctx.user.id,
          text: input.text,
          note: input.note ?? null,
          photoUrl: input.photoUrl ?? null,
          sortOrder: input.sortOrder ?? 0,
          checked: 0,
          createdAt: Date.now(),
        }).returning();
        return item;
      }),

    updateItem: protectedProcedure
      .input(z.object({
        id: z.number(),
        text: z.string().optional(),
        note: z.string().optional(),
        photoUrl: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...rest } = input;
        await db.update(dailyChecklistItems).set(rest)
          .where(and(eq(dailyChecklistItems.id, id), eq(dailyChecklistItems.ownerId, ctx.user.id)));
        return { success: true };
      }),

    deleteItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(dailyChecklistItems)
          .where(and(eq(dailyChecklistItems.id, input.id), eq(dailyChecklistItems.ownerId, ctx.user.id)));
        return { success: true };
      }),

    addItemByToken: publicProcedure
      .input(z.object({ token: z.string(), text: z.string().min(1), note: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, count } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [cl] = await db.select().from(dailyChecklists).where(eq(dailyChecklists.token, input.token)).limit(1);
        if (!cl) throw new Error('Checklist not found');
        const [{ total }] = await db.select({ total: count() }).from(dailyChecklistItems).where(eq(dailyChecklistItems.checklistId, cl.id));
        const [item] = await db.insert(dailyChecklistItems).values({
          checklistId: cl.id,
          ownerId: cl.ownerId,
          text: input.text.trim(),
          note: input.note?.trim() ?? null,
          sortOrder: Number(total),
          checked: 0,
          createdAt: Date.now(),
        }).returning();
        return item;
      }),

    deleteItemByToken: publicProcedure
      .input(z.object({ token: z.string(), itemId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [cl] = await db.select().from(dailyChecklists).where(eq(dailyChecklists.token, input.token)).limit(1);
        if (!cl) throw new Error('Checklist not found');
        await db.delete(dailyChecklistItems)
          .where(and(eq(dailyChecklistItems.id, input.itemId), eq(dailyChecklistItems.checklistId, cl.id)));
        return { success: true };
      }),

    editItemByToken: publicProcedure
      .input(z.object({ token: z.string(), itemId: z.number(), text: z.string().min(1), note: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [cl] = await db.select().from(dailyChecklists).where(eq(dailyChecklists.token, input.token)).limit(1);
        if (!cl) throw new Error('Checklist not found');
        await db.update(dailyChecklistItems)
          .set({ text: input.text.trim(), note: input.note?.trim() ?? null })
          .where(and(eq(dailyChecklistItems.id, input.itemId), eq(dailyChecklistItems.checklistId, cl.id)));
        return { success: true };
      }),

    toggleItemByToken: publicProcedure
      .input(z.object({
        token: z.string(),
        itemId: z.number(),
        checked: z.boolean(),
        checkedBy: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [cl] = await db.select().from(dailyChecklists).where(eq(dailyChecklists.token, input.token)).limit(1);
        if (!cl) throw new Error('Checklist not found');
        await db.update(dailyChecklistItems).set({
          checked: input.checked ? 1 : 0,
          checkedAt: input.checked ? Date.now() : null,
          checkedBy: input.checkedBy ?? null,
        }).where(eq(dailyChecklistItems.id, input.itemId));
        return { success: true };
      }),

    resetByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const { dailyChecklists, dailyChecklistItems } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const [cl] = await db.select().from(dailyChecklists).where(eq(dailyChecklists.token, input.token)).limit(1);
        if (!cl) throw new Error('Checklist not found');
        await db.update(dailyChecklistItems).set({ checked: 0, checkedAt: null, checkedBy: null })
          .where(eq(dailyChecklistItems.checklistId, cl.id));
        return { success: true };
      }),
  }),

  shiftRunsheets: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { shiftRunsheets } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(shiftRunsheets)
        .where(eq(shiftRunsheets.ownerId, ctx.user.id))
        .orderBy(desc(shiftRunsheets.date), desc(shiftRunsheets.createdAt));
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { shiftRunsheets } = await import('../drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [sr] = await db.select().from(shiftRunsheets)
          .where(and(eq(shiftRunsheets.id, input.id), eq(shiftRunsheets.ownerId, ctx.user.id))).limit(1);
        return sr ?? null;
      }),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { shiftRunsheets, dailyChecklists, dailyChecklistItems, venueSettings, runsheets, fnbItems, bookings } = await import('../drizzle/schema');
        const { eq, and, inArray, gte, lt } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [sr] = await db.select().from(shiftRunsheets).where(eq(shiftRunsheets.token, input.token)).limit(1);
        if (!sr) return null;
        // Fetch venue logo/name for header display
        const [venue] = await db.select({ logoUrl: venueSettings.logoUrl, name: venueSettings.name, shiftSections: venueSettings.shiftSections })
          .from(venueSettings).where(eq(venueSettings.ownerId, sr.ownerId)).limit(1);
        const ids = (sr.linkedChecklistIds as number[] | null) ?? [];
        let checklists: { id: number; name: string; token: string; items: any[] }[] = [];
        if (ids.length > 0) {
          const cls = await db.select().from(dailyChecklists).where(inArray(dailyChecklists.id, ids));
          const items = await db.select().from(dailyChecklistItems).where(inArray(dailyChecklistItems.checklistId, ids));
          checklists = ids
            .map(id => {
              const cl = cls.find(c => c.id === id);
              if (!cl) return null;
              return { id: cl.id, name: cl.name, token: cl.token, items: items.filter(it => it.checklistId === id).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) };
            })
            .filter(Boolean) as any[];
        }

        // ── Event runsheets matching this shift's date — surface F&B + venue area ──
        let events: any[] = [];
        if (sr.date) {
          // Compute the day window in the venue's timezone (default Pacific/Auckland).
          // sr.date is "YYYY-MM-DD" representing a calendar day in venue's local time.
          const venueTz = (venue as any)?.timezone ?? 'Pacific/Auckland';
          // Find the UTC instant that corresponds to YYYY-MM-DD 00:00:00 in venueTz.
          const computeUtcAtVenueMidnight = (dateStr: string): Date | null => {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
            if (!m) return null;
            const [, y, mo, d] = m;
            // Iteratively converge on the offset for that local date.
            let guess = new Date(`${y}-${mo}-${d}T00:00:00Z`);
            for (let i = 0; i < 3; i++) {
              const parts = new Intl.DateTimeFormat('en-US', { timeZone: venueTz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(guess);
              const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
              const localY = get('year'), localM = get('month'), localD = get('day');
              const localH = get('hour') === 24 ? 0 : get('hour');
              const localMin = get('minute'), localS = get('second');
              const localAsUtc = Date.UTC(localY, localM - 1, localD, localH, localMin, localS);
              const wantAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), 0, 0, 0);
              const offsetMs = localAsUtc - wantAsUtc;
              guess = new Date(guess.getTime() - offsetMs);
            }
            return guess;
          };
          const dayStart = computeUtcAtVenueMidnight(sr.date);
          const nextDay = sr.date ? new Date(new Date(sr.date + 'T00:00:00Z').getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10) : null;
          const dayEnd = nextDay ? computeUtcAtVenueMidnight(nextDay) : null;
          if (dayStart && dayEnd) {
            const dayRunsheets = await db.select().from(runsheets)
              .where(and(
                eq(runsheets.ownerId, sr.ownerId),
                gte(runsheets.eventDate, dayStart),
                lt(runsheets.eventDate, dayEnd),
              ));
            if (dayRunsheets.length > 0) {
              const rsIds = dayRunsheets.map((r: any) => r.id);
              const bookingIds = dayRunsheets.map((r: any) => r.bookingId).filter(Boolean) as number[];
              const allFnb = await db.select().from(fnbItems).where(inArray(fnbItems.runsheetId, rsIds));
              const bks = bookingIds.length > 0
                ? await db.select({ id: bookings.id, firstName: bookings.firstName, lastName: bookings.lastName, eventType: bookings.eventType, guestCount: bookings.guestCount, spaceName: bookings.spaceName }).from(bookings).where(inArray(bookings.id, bookingIds))
                : [];
              events = dayRunsheets.map((r: any) => {
                const bk = bks.find((b: any) => b.id === r.bookingId);
                const clientName = bk ? [bk.firstName, bk.lastName].filter(Boolean).join(' ').trim() : '';
                return {
                  id: r.id,
                  bookingId: r.bookingId,
                  clientName: clientName || null,
                  eventType: bk?.eventType ?? null,
                  guestCount: bk?.guestCount ?? null,
                  venueArea: r.venueArea ?? null,
                  spaceName: r.spaceName ?? bk?.spaceName ?? null,
                  eventStartTime: r.eventStartTime ?? null,
                  eventEndTime: r.eventEndTime ?? null,
                  drinksData: r.drinksData ?? null,
                  fnb: allFnb
                    .filter((f: any) => f.runsheetId === r.id)
                    .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
                };
              }).sort((a, b) => (a.eventStartTime ?? '').localeCompare(b.eventStartTime ?? ''));
            }
          }
        }

        return { ...sr, checklists, events, venueLogoUrl: venue?.logoUrl ?? null, venueName: venue?.name ?? null, shiftSections: venue?.shiftSections ?? null };
      }),

    create: protectedProcedure
      .input(z.object({
        date: z.string().optional(),
        dutyManager: z.string().optional(),
        sections: z.record(z.string(), z.string().optional()).optional(),
        specials: z.string().optional(),
        budget: z.string().optional(),
        specialNotes: z.string().optional(),
        marketFish: z.string().optional(),
        thingsToPush: z.string().optional(),
        linkedChecklistIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { shiftRunsheets } = await import('../drizzle/schema');
        const cryptoMod = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const token = cryptoMod.randomBytes(24).toString('hex');
        const now = Date.now();
        const [created] = await db.insert(shiftRunsheets).values({
          ownerId: ctx.user.id,
          date: input.date ?? null,
          dutyManager: input.dutyManager ?? null,
          sections: input.sections ?? null,
          specials: input.specials ?? null,
          budget: input.budget ?? null,
          specialNotes: input.specialNotes ?? null,
          marketFish: input.marketFish ?? null,
          thingsToPush: input.thingsToPush ?? null,
          linkedChecklistIds: input.linkedChecklistIds ?? null,
          token,
          createdAt: now,
          updatedAt: now,
        }).returning();
        return created;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        date: z.string().optional().nullable(),
        dutyManager: z.string().optional().nullable(),
        sections: z.record(z.string(), z.string().optional()).optional().nullable(),
        specials: z.string().optional().nullable(),
        budget: z.string().optional().nullable(),
        specialNotes: z.string().optional().nullable(),
        marketFish: z.string().optional().nullable(),
        thingsToPush: z.string().optional().nullable(),
        linkedChecklistIds: z.array(z.number()).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { shiftRunsheets } = await import('../drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const { id, ...fields } = input;
        await db.update(shiftRunsheets).set({ ...fields, updatedAt: Date.now() })
          .where(and(eq(shiftRunsheets.id, id), eq(shiftRunsheets.ownerId, ctx.user.id)));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { shiftRunsheets } = await import('../drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(shiftRunsheets)
          .where(and(eq(shiftRunsheets.id, input.id), eq(shiftRunsheets.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),

  team: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { teamMembers } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      return db.select().from(teamMembers).where(eq(teamMembers.ownerId, ctx.user.id)).orderBy(desc(teamMembers.createdAt));
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), email: z.string().optional(), role: z.string().default('staff') }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { teamMembers } = await import('../drizzle/schema');
        const crypto = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const accessToken = crypto.randomBytes(32).toString('hex');
        const [member] = await db.insert(teamMembers).values({
          ownerId: ctx.user.id,
          name: input.name,
          email: input.email ?? null,
          role: input.role,
          accessToken,
          isActive: true,
          createdAt: Date.now(),
        }).returning();
        return member;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { teamMembers } = await import('../drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.delete(teamMembers).where(and(eq(teamMembers.id, input.id), eq(teamMembers.ownerId, ctx.user.id)));
        return { success: true };
      }),

    getByToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const { getDb } = await import('./db');
        const { teamMembers, users } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) return null;
        const [member] = await db.select().from(teamMembers)
          .where(and(eq(teamMembers.accessToken, input.token), eq(teamMembers.isActive, true)))
          .limit(1);
        if (!member) return null;
        const [owner] = await db.select().from(users).where(eq(users.id, member.ownerId)).limit(1);
        if (!owner) return null;
        return { member, ownerOpenId: owner.openId, ownerName: owner.name };
      }),
  }),
  apiTokens: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import('./db');
      const { apiTokens } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({
        id: apiTokens.id,
        name: apiTokens.name,
        prefix: apiTokens.prefix,
        scopes: apiTokens.scopes,
        lastUsedAt: apiTokens.lastUsedAt,
        revokedAt: apiTokens.revokedAt,
        createdAt: apiTokens.createdAt,
      }).from(apiTokens).where(eq(apiTokens.ownerId, ctx.user.id)).orderBy(desc(apiTokens.createdAt));
      return rows;
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(120) }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { apiTokens } = await import('../drizzle/schema');
        const cryptoMod = await import('crypto');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        const raw = cryptoMod.randomBytes(32).toString('base64url');
        const token = `vfk_${raw}`;
        const prefix = token.slice(0, 12);
        const tokenHash = cryptoMod.createHash('sha256').update(token).digest('hex');
        const [created] = await db.insert(apiTokens).values({
          ownerId: ctx.user.id,
          name: input.name,
          prefix,
          tokenHash,
          scopes: [],
          createdAt: Date.now(),
        }).returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt });
        return { ...created, token };
      }),
    revoke: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { apiTokens } = await import('../drizzle/schema');
        const { and, eq } = await import('drizzle-orm');
        const db = await getDb();
        if (!db) throw new Error('DB not available');
        await db.update(apiTokens).set({ revokedAt: Date.now() })
          .where(and(eq(apiTokens.id, input.id), eq(apiTokens.ownerId, ctx.user.id)));
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
