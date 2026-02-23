import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  venues, InsertVenue, Venue,
  inquiries, InsertInquiry,
  proposals, InsertProposal,
  availability, InsertAvailability,
  bookings,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

import { ENV } from './_core/env';

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Venues ───────────────────────────────────────────────────────────────────

export async function listVenues(filters?: {
  city?: string;
  venueType?: Venue["venueType"];
  minCapacity?: number;
  maxPrice?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(venues).where(eq(venues.isActive, true)).$dynamic();
  const results = await query.orderBy(desc(venues.isFeatured), desc(venues.rating));
  return results.filter(v => {
    if (filters?.city && v.city !== filters.city) return false;
    if (filters?.venueType && v.venueType !== filters.venueType) return false;
    if (filters?.minCapacity && v.capacity < filters.minCapacity) return false;
    if (filters?.maxPrice && v.minPriceNzd && Number(v.minPriceNzd) > filters.maxPrice) return false;
    return true;
  });
}

export async function getVenueBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(venues).where(eq(venues.slug, slug)).limit(1);
  return result[0] ?? null;
}

export async function getVenueById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getVenuesByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(venues).where(eq(venues.ownerId, ownerId)).orderBy(desc(venues.createdAt));
}

export async function createVenue(data: Omit<InsertVenue, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(venues).values(data as InsertVenue);
  const result = await db.select().from(venues).where(eq(venues.slug, data.slug!)).limit(1);
  return result[0];
}

export async function updateVenue(id: number, ownerId: number, data: Partial<InsertVenue>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(venues).set(data).where(and(eq(venues.id, id), eq(venues.ownerId, ownerId)));
  return getVenueById(id);
}

// ─── Inquiries ────────────────────────────────────────────────────────────────

export async function createInquiry(data: Omit<InsertInquiry, "id" | "createdAt" | "updatedAt" | "status">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(inquiries).values({ ...data, status: "new" } as InsertInquiry);
  const results = await db.select().from(inquiries)
    .where(and(eq(inquiries.venueId, data.venueId), eq(inquiries.plannerEmail, data.plannerEmail)))
    .orderBy(desc(inquiries.createdAt)).limit(1);
  return results[0];
}

export async function getInquiriesByVenue(venueId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inquiries).where(eq(inquiries.venueId, venueId)).orderBy(desc(inquiries.createdAt));
}

export async function getInquiriesByPlanner(plannerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inquiries).where(eq(inquiries.plannerId, plannerId)).orderBy(desc(inquiries.createdAt));
}

export async function updateInquiryStatus(id: number, status: InsertInquiry["status"]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(inquiries).set({ status }).where(eq(inquiries.id, id));
  return { success: true };
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export async function createProposal(data: Omit<InsertProposal, "id" | "createdAt" | "updatedAt" | "status">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(proposals).values({ ...data, status: "draft" } as InsertProposal);
  const results = await db.select().from(proposals)
    .where(and(eq(proposals.inquiryId, data.inquiryId), eq(proposals.ownerId, data.ownerId)))
    .orderBy(desc(proposals.createdAt)).limit(1);
  return results[0];
}

export async function getProposalsByVenue(venueId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(proposals).where(eq(proposals.venueId, venueId)).orderBy(desc(proposals.createdAt));
}

export async function getProposalsByPlanner(plannerId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get proposals for inquiries submitted by this planner
  const plannerInquiries = await db.select().from(inquiries).where(eq(inquiries.plannerId, plannerId));
  if (plannerInquiries.length === 0) return [];
  const inquiryIds = plannerInquiries.map(i => i.id);
  const allProposals = await db.select().from(proposals).orderBy(desc(proposals.createdAt));
  return allProposals.filter(p => inquiryIds.includes(p.inquiryId));
}

export async function updateProposalStatus(id: number, status: InsertProposal["status"]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(proposals).set({ status }).where(eq(proposals.id, id));
  return { success: true };
}

// ─── Availability ─────────────────────────────────────────────────────────────

export async function getAvailabilityByVenue(venueId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(availability).where(eq(availability.venueId, venueId)).orderBy(asc(availability.date));
}

export async function setAvailability(data: { venueId: number; date: Date; isAvailable: boolean; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if entry exists for this date
  const existing = await db.select().from(availability)
    .where(and(eq(availability.venueId, data.venueId))).limit(100);
  const dateStr = data.date.toISOString().split("T")[0];
  const match = existing.find(e => e.date.toISOString().split("T")[0] === dateStr);
  if (match) {
    await db.update(availability).set({ isAvailable: data.isAvailable, note: data.note }).where(eq(availability.id, match.id));
  } else {
    await db.insert(availability).values(data as InsertAvailability);
  }
  return { success: true };
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function getBookingsByVenue(venueId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(bookings).where(eq(bookings.venueId, venueId)).orderBy(desc(bookings.createdAt));
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(ownerId: number) {
  const db = await getDb();
  if (!db) return { venueCount: 0, inquiryCount: 0, proposalCount: 0, bookingCount: 0 };
  const ownerVenues = await db.select().from(venues).where(eq(venues.ownerId, ownerId));
  const venueIds = ownerVenues.map(v => v.id);
  if (venueIds.length === 0) return { venueCount: 0, inquiryCount: 0, proposalCount: 0, bookingCount: 0 };
  const allInquiries = await db.select().from(inquiries);
  const allProposals = await db.select().from(proposals).where(eq(proposals.ownerId, ownerId));
  const allBookings = await db.select().from(bookings);
  return {
    venueCount: ownerVenues.length,
    inquiryCount: allInquiries.filter(i => venueIds.includes(i.venueId)).length,
    proposalCount: allProposals.length,
    bookingCount: allBookings.filter(b => venueIds.includes(b.venueId)).length,
    venues: ownerVenues,
  };
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

export async function seedVenues() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(venues).limit(1);
  if (existing.length > 0) return { message: "Already seeded" };

  // Create a demo owner user first
  await db.insert(users).values({
    openId: "demo-owner-001",
    name: "HOSTit Demo",
    email: "demo@hostit.co.nz",
    loginMethod: "demo",
    role: "admin",
  }).onDuplicateKeyUpdate({ set: { name: "HOSTit Demo" } });

  const ownerResult = await db.select().from(users).where(eq(users.openId, "demo-owner-001")).limit(1);
  const ownerId = ownerResult[0]?.id ?? 1;

  const seedData: Omit<InsertVenue, "id" | "createdAt" | "updatedAt">[] = [
    {
      ownerId,
      name: "The Grand Harbour Hall",
      slug: "grand-harbour-hall-auckland",
      shortDescription: "A stunning waterfront heritage building with panoramic harbour views, perfect for gala dinners and corporate events.",
      description: "Set in a lovingly restored 1920s warehouse on Auckland's Viaduct Harbour, The Grand Harbour Hall combines original kauri timber floors and exposed brick with modern amenities. Floor-to-ceiling windows frame the Waitemata Harbour, creating an unforgettable backdrop for any event.",
      venueType: "heritage_building",
      city: "Auckland",
      suburb: "Viaduct Harbour",
      address: "12 Viaduct Harbour Ave, Auckland CBD",
      capacity: 320,
      minCapacity: 50,
      minPriceNzd: "4500" as any,
      maxPriceNzd: "18000" as any,
      pricePerHead: "85" as any,
      amenities: JSON.stringify(["Full catering kitchen", "AV equipment", "Dance floor", "Bridal suite", "Valet parking", "Waterfront terrace", "Bar service", "WiFi"]) as any,
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80",
        "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&q=80",
      ]) as any,
      coverImage: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80",
      isActive: true,
      isFeatured: true,
      rating: "4.9" as any,
      reviewCount: 48,
    },
    {
      ownerId,
      name: "Villa Martinborough Estate",
      slug: "villa-martinborough-estate",
      shortDescription: "Boutique winery estate in the heart of Martinborough wine country — intimate, romantic, and utterly memorable.",
      description: "Nestled among pinot noir vines, Villa Martinborough Estate offers an exclusive private hire experience. The stone cellar door, barrel room, and manicured gardens create a magical setting for weddings, intimate dinners, and wine-paired corporate events.",
      venueType: "winery",
      city: "Wellington",
      suburb: "Martinborough",
      address: "Princess St, Martinborough 5711",
      capacity: 130,
      minCapacity: 20,
      minPriceNzd: "2800" as any,
      maxPriceNzd: "12000" as any,
      pricePerHead: "110" as any,
      amenities: JSON.stringify(["Cellar door bar", "Wine tasting", "Garden ceremony space", "Catering kitchen", "Accommodation referrals", "AV system", "Outdoor terrace"]) as any,
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800&q=80",
        "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80",
      ]) as any,
      coverImage: "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800&q=80",
      isActive: true,
      isFeatured: true,
      rating: "4.8" as any,
      reviewCount: 31,
    },
    {
      ownerId,
      name: "Skyline Rooftop Terrace",
      slug: "skyline-rooftop-terrace-christchurch",
      shortDescription: "Christchurch's most stylish rooftop venue with 360° city views and a sophisticated cocktail bar.",
      description: "Perched atop a heritage building in Christchurch's revitalised CBD, Skyline Rooftop Terrace is the city's most sought-after event space. With retractable roof panels, a full cocktail bar, and panoramic views of the Southern Alps, it's perfect for cocktail parties, product launches, and intimate celebrations.",
      venueType: "rooftop_bar",
      city: "Christchurch",
      suburb: "Central City",
      address: "Level 8, 150 Cashel St, Christchurch",
      capacity: 90,
      minCapacity: 20,
      minPriceNzd: "1800" as any,
      maxPriceNzd: "7500" as any,
      pricePerHead: "65" as any,
      amenities: JSON.stringify(["Full cocktail bar", "Retractable roof", "City views", "Canapé catering", "Sound system", "Heating lamps", "Dedicated event manager"]) as any,
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80",
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80",
      ]) as any,
      coverImage: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80",
      isActive: true,
      isFeatured: false,
      rating: "4.7" as any,
      reviewCount: 22,
    },
    {
      ownerId,
      name: "Queenstown Alpine Lodge",
      slug: "queenstown-alpine-lodge",
      shortDescription: "Dramatic mountain backdrop, lakeside gardens, and rustic luxury in the adventure capital of the world.",
      description: "The Queenstown Alpine Lodge sits on the shores of Lake Wakatipu with The Remarkables as a breathtaking backdrop. This exclusive venue features a grand stone fireplace, private jetty, and manicured lakeside gardens — ideal for destination weddings and executive retreats.",
      venueType: "function_centre",
      city: "Queenstown",
      suburb: "Frankton",
      address: "45 Lake Esplanade, Queenstown 9300",
      capacity: 200,
      minCapacity: 30,
      minPriceNzd: "5500" as any,
      maxPriceNzd: "22000" as any,
      pricePerHead: "120" as any,
      amenities: JSON.stringify(["Lakeside ceremony space", "Private jetty", "Full catering", "Accommodation", "Helipad access", "AV system", "Bridal suite", "Outdoor fire pits"]) as any,
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80",
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
      ]) as any,
      coverImage: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80",
      isActive: true,
      isFeatured: true,
      rating: "5.0" as any,
      reviewCount: 19,
    },
    {
      ownerId,
      name: "The Botanic Garden Pavilion",
      slug: "botanic-garden-pavilion-wellington",
      shortDescription: "An enchanting glass pavilion surrounded by heritage rose gardens in Wellington's beloved Botanic Garden.",
      description: "Nestled within Wellington's iconic Botanic Garden, this glass-and-steel pavilion offers a magical indoor-outdoor setting. Surrounded by heritage rose gardens and native bush, it's a favourite for garden weddings, charity galas, and intimate corporate lunches.",
      venueType: "garden",
      city: "Wellington",
      suburb: "Kelburn",
      address: "101 Glenmore St, Wellington 6012",
      capacity: 150,
      minCapacity: 30,
      minPriceNzd: "2200" as any,
      maxPriceNzd: "9000" as any,
      pricePerHead: "75" as any,
      amenities: JSON.stringify(["Glass pavilion", "Rose garden access", "Catering kitchen", "Outdoor ceremony lawn", "Parking", "Accessible facilities", "AV equipment"]) as any,
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80",
        "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80",
      ]) as any,
      coverImage: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80",
      isActive: true,
      isFeatured: false,
      rating: "4.6" as any,
      reviewCount: 27,
    },
    {
      ownerId,
      name: "Osteria del Porto",
      slug: "osteria-del-porto-auckland",
      shortDescription: "Authentic Italian-inspired restaurant on the waterfront — private dining rooms and full venue hire available.",
      description: "Osteria del Porto brings the warmth of an Italian trattoria to Auckland's waterfront. With three private dining rooms, a wood-fired kitchen, and an extensive Italian wine list, it's the perfect setting for intimate dinners, milestone celebrations, and corporate entertaining.",
      venueType: "restaurant",
      city: "Auckland",
      suburb: "Wynyard Quarter",
      address: "3 Jellicoe St, Wynyard Quarter, Auckland",
      capacity: 80,
      minCapacity: 10,
      minPriceNzd: "1200" as any,
      maxPriceNzd: "6000" as any,
      pricePerHead: "95" as any,
      amenities: JSON.stringify(["Private dining rooms", "Wood-fired kitchen", "Italian wine cellar", "Custom menus", "Sommelier service", "Waterfront views", "Valet parking"]) as any,
      images: JSON.stringify([
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80",
      ]) as any,
      coverImage: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80",
      isActive: true,
      isFeatured: false,
      rating: "4.8" as any,
      reviewCount: 35,
    },
  ];

  for (const venue of seedData) {
    await db.insert(venues).values(venue as InsertVenue).onDuplicateKeyUpdate({ set: { name: venue.name } });
  }

  return { message: `Seeded ${seedData.length} venues` };
}
