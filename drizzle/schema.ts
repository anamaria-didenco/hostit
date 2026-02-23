import {
  boolean,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  userType: mysqlEnum("userType", ["planner", "owner"]).default("planner").notNull(),
  phone: varchar("phone", { length: 32 }),
  company: text("company"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const venues = mysqlTable("venues", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  shortDescription: varchar("shortDescription", { length: 500 }),
  venueType: mysqlEnum("venueType", [
    "restaurant",
    "winery",
    "rooftop_bar",
    "heritage_building",
    "garden",
    "function_centre",
    "hotel",
    "beach",
    "other",
  ]).notNull(),
  city: mysqlEnum("city", [
    "Auckland",
    "Wellington",
    "Christchurch",
    "Queenstown",
    "Hamilton",
    "Dunedin",
    "Tauranga",
    "Napier",
    "Nelson",
    "Rotorua",
  ]).notNull(),
  suburb: varchar("suburb", { length: 100 }),
  address: text("address"),
  capacity: int("capacity").notNull(),
  minCapacity: int("minCapacity").default(10),
  minPriceNzd: decimal("minPriceNzd", { precision: 10, scale: 2 }),
  maxPriceNzd: decimal("maxPriceNzd", { precision: 10, scale: 2 }),
  pricePerHead: decimal("pricePerHead", { precision: 10, scale: 2 }),
  amenities: json("amenities").$type<string[]>(),
  images: json("images").$type<string[]>(),
  coverImage: text("coverImage"),
  isActive: boolean("isActive").default(true).notNull(),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  rating: decimal("rating", { precision: 3, scale: 1 }).default("0.0"),
  reviewCount: int("reviewCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Venue = typeof venues.$inferSelect;
export type InsertVenue = typeof venues.$inferInsert;

export const inquiries = mysqlTable("inquiries", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull(),
  plannerId: int("plannerId"),
  plannerName: varchar("plannerName", { length: 255 }).notNull(),
  plannerEmail: varchar("plannerEmail", { length: 320 }).notNull(),
  plannerPhone: varchar("plannerPhone", { length: 32 }),
  eventType: varchar("eventType", { length: 100 }),
  eventDate: timestamp("eventDate"),
  guestCount: int("guestCount"),
  message: text("message"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  status: mysqlEnum("status", [
    "new",
    "viewed",
    "responded",
    "proposal_sent",
    "booked",
    "declined",
    "cancelled",
  ])
    .default("new")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Inquiry = typeof inquiries.$inferSelect;
export type InsertInquiry = typeof inquiries.$inferInsert;

export const proposals = mysqlTable("proposals", {
  id: int("id").autoincrement().primaryKey(),
  inquiryId: int("inquiryId").notNull(),
  venueId: int("venueId").notNull(),
  ownerId: int("ownerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  eventDate: timestamp("eventDate"),
  guestCount: int("guestCount"),
  packageName: varchar("packageName", { length: 255 }),
  lineItems: json("lineItems").$type<
    Array<{ description: string; quantity: number; unitPrice: number; total: number }>
  >(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  gstAmount: decimal("gstAmount", { precision: 10, scale: 2 }),
  totalNzd: decimal("totalNzd", { precision: 10, scale: 2 }),
  depositRequired: decimal("depositRequired", { precision: 10, scale: 2 }),
  validUntil: timestamp("validUntil"),
  status: mysqlEnum("status", [
    "draft",
    "sent",
    "viewed",
    "accepted",
    "declined",
    "expired",
  ])
    .default("draft")
    .notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

export const availability = mysqlTable("availability", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull(),
  date: timestamp("date").notNull(),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Availability = typeof availability.$inferSelect;
export type InsertAvailability = typeof availability.$inferInsert;

export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  inquiryId: int("inquiryId").notNull(),
  proposalId: int("proposalId"),
  venueId: int("venueId").notNull(),
  plannerId: int("plannerId"),
  plannerName: varchar("plannerName", { length: 255 }).notNull(),
  plannerEmail: varchar("plannerEmail", { length: 320 }).notNull(),
  eventDate: timestamp("eventDate").notNull(),
  guestCount: int("guestCount"),
  totalNzd: decimal("totalNzd", { precision: 10, scale: 2 }),
  depositPaid: boolean("depositPaid").default(false),
  status: mysqlEnum("status", [
    "confirmed",
    "pending_deposit",
    "completed",
    "cancelled",
  ])
    .default("pending_deposit")
    .notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
