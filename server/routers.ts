import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  listVenues,
  getVenueBySlug,
  getVenueById,
  getVenuesByOwner,
  createVenue,
  updateVenue,
  createInquiry,
  getInquiriesByVenue,
  getInquiriesByPlanner,
  updateInquiryStatus,
  createProposal,
  getProposalsByVenue,
  getProposalsByPlanner,
  updateProposalStatus,
  getAvailabilityByVenue,
  setAvailability,
  getBookingsByVenue,
  getDashboardStats,
  seedVenues,
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

  venues: router({
    list: publicProcedure
      .input(z.object({
        city: z.string().optional(),
        venueType: z.enum(["restaurant","winery","rooftop_bar","heritage_building","garden","function_centre","hotel","beach","other"]).optional(),
        minCapacity: z.number().optional(),
        maxPrice: z.number().optional(),
      }).optional())
      .query(({ input }) => listVenues(input)),

    bySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(({ input }) => getVenueBySlug(input.slug)),

    byOwner: protectedProcedure
      .query(({ ctx }) => getVenuesByOwner(ctx.user.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(2),
        slug: z.string().min(2),
        description: z.string().optional(),
        shortDescription: z.string().optional(),
        venueType: z.enum(["restaurant","winery","rooftop_bar","heritage_building","garden","function_centre","hotel","beach","other"]),
        city: z.enum(["Auckland","Wellington","Christchurch","Queenstown","Hamilton","Dunedin","Tauranga","Napier","Nelson","Rotorua"]),
        suburb: z.string().optional(),
        address: z.string().optional(),
        capacity: z.number().min(1),
        minCapacity: z.number().optional(),
        minPriceNzd: z.number().optional(),
        maxPriceNzd: z.number().optional(),
        pricePerHead: z.number().optional(),
        amenities: z.array(z.string()).optional(),
        images: z.array(z.string()).optional(),
        coverImage: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => createVenue({
        ...input,
        ownerId: ctx.user.id,
        minPriceNzd: input.minPriceNzd?.toString() as any,
        maxPriceNzd: input.maxPriceNzd?.toString() as any,
        pricePerHead: input.pricePerHead?.toString() as any,
      })),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(2).optional(),
        description: z.string().optional(),
        shortDescription: z.string().optional(),
        venueType: z.enum(["restaurant","winery","rooftop_bar","heritage_building","garden","function_centre","hotel","beach","other"]).optional(),
        city: z.enum(["Auckland","Wellington","Christchurch","Queenstown","Hamilton","Dunedin","Tauranga","Napier","Nelson","Rotorua"]).optional(),
        suburb: z.string().optional(),
        address: z.string().optional(),
        capacity: z.number().min(1).optional(),
        minCapacity: z.number().optional(),
        minPriceNzd: z.number().optional(),
        maxPriceNzd: z.number().optional(),
        pricePerHead: z.number().optional(),
        amenities: z.array(z.string()).optional(),
        images: z.array(z.string()).optional(),
        coverImage: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(({ ctx, input }) => updateVenue(input.id, ctx.user.id, {
        ...input,
        minPriceNzd: input.minPriceNzd?.toString() as any,
        maxPriceNzd: input.maxPriceNzd?.toString() as any,
        pricePerHead: input.pricePerHead?.toString() as any,
      })),

    seed: publicProcedure.mutation(() => seedVenues()),
  }),

  inquiries: router({
    submit: publicProcedure
      .input(z.object({
        venueId: z.number(),
        plannerName: z.string().min(2),
        plannerEmail: z.string().email(),
        plannerPhone: z.string().optional(),
        eventType: z.string().optional(),
        eventDate: z.string().optional(),
        guestCount: z.number().optional(),
        message: z.string().optional(),
        budget: z.number().optional(),
      }))
      .mutation(({ ctx, input }) => createInquiry({
        venueId: input.venueId,
        plannerName: input.plannerName,
        plannerEmail: input.plannerEmail,
        plannerPhone: input.plannerPhone,
        eventType: input.eventType,
        eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
        guestCount: input.guestCount,
        message: input.message,
        budget: input.budget?.toString() as any,
        plannerId: ctx.user?.id,
      })),

    byVenue: protectedProcedure
      .input(z.object({ venueId: z.number() }))
      .query(({ input }) => getInquiriesByVenue(input.venueId)),

    byPlanner: protectedProcedure
      .query(({ ctx }) => getInquiriesByPlanner(ctx.user.id)),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["new","viewed","responded","proposal_sent","booked","declined","cancelled"]),
      }))
      .mutation(({ input }) => updateInquiryStatus(input.id, input.status)),
  }),

  proposals: router({
    create: protectedProcedure
      .input(z.object({
        inquiryId: z.number(),
        venueId: z.number(),
        title: z.string().min(2),
        message: z.string().optional(),
        eventDate: z.string().optional(),
        guestCount: z.number().optional(),
        packageName: z.string().optional(),
        lineItems: z.array(z.object({
          description: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
          total: z.number(),
        })).optional(),
        subtotal: z.number().optional(),
        gstAmount: z.number().optional(),
        totalNzd: z.number().optional(),
        depositRequired: z.number().optional(),
        validUntil: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => createProposal({
        inquiryId: input.inquiryId,
        venueId: input.venueId,
        ownerId: ctx.user.id,
        title: input.title,
        message: input.message,
        eventDate: input.eventDate ? new Date(input.eventDate) : undefined,
        guestCount: input.guestCount,
        packageName: input.packageName,
        lineItems: input.lineItems,
        subtotal: input.subtotal?.toString(),
        gstAmount: input.gstAmount?.toString(),
        totalNzd: input.totalNzd?.toString(),
        depositRequired: input.depositRequired?.toString(),
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        notes: input.notes,
      } as any)),

    byVenue: protectedProcedure
      .input(z.object({ venueId: z.number() }))
      .query(({ input }) => getProposalsByVenue(input.venueId)),

    byPlanner: protectedProcedure
      .query(({ ctx }) => getProposalsByPlanner(ctx.user.id)),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft","sent","viewed","accepted","declined","expired"]),
      }))
      .mutation(({ input }) => updateProposalStatus(input.id, input.status)),
  }),

  availability: router({
    byVenue: publicProcedure
      .input(z.object({ venueId: z.number() }))
      .query(({ input }) => getAvailabilityByVenue(input.venueId)),

    set: protectedProcedure
      .input(z.object({
        venueId: z.number(),
        date: z.string(),
        isAvailable: z.boolean(),
        note: z.string().optional(),
      }))
      .mutation(({ input }) => setAvailability({
        ...input,
        date: new Date(input.date),
      })),
  }),

  bookings: router({
    byVenue: protectedProcedure
      .input(z.object({ venueId: z.number() }))
      .query(({ input }) => getBookingsByVenue(input.venueId)),
  }),

  dashboard: router({
    stats: protectedProcedure
      .input(z.object({ ownerId: z.number() }))
      .query(({ input }) => getDashboardStats(input.ownerId)),
  }),
});

export type AppRouter = typeof appRouter;
