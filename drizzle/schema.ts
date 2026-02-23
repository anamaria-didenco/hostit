import {
  int, mysqlEnum, mysqlTable, text, timestamp,
  varchar, decimal, boolean, bigint
} from "drizzle-orm/mysql-core";

// ─── Users (venue staff / owners) ────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Venue Settings (single venue per account) ───────────────────────────────
export const venueSettings = mysqlTable("venue_settings", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull().default("My Venue"),
  slug: varchar("slug", { length: 100 }).notNull().default("my-venue"),
  tagline: text("tagline"),
  description: text("description"),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 500 }),
  logoUrl: text("logoUrl"),
  coverImageUrl: text("coverImageUrl"),
  primaryColor: varchar("primaryColor", { length: 20 }).default("#C8102E"),
  leadFormTitle: varchar("leadFormTitle", { length: 255 }).default("Book Your Event"),
  leadFormSubtitle: text("leadFormSubtitle"),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }).default("25.00"),
  currency: varchar("currency", { length: 10 }).default("NZD"),
  // SMTP email settings
  smtpHost: varchar("smtpHost", { length: 255 }),
  smtpPort: int("smtpPort").default(587),
  smtpUser: varchar("smtpUser", { length: 320 }),
  smtpPass: text("smtpPass"),
  smtpFromName: varchar("smtpFromName", { length: 255 }),
  smtpFromEmail: varchar("smtpFromEmail", { length: 320 }),
  smtpSecure: int("smtpSecure").default(0), // 0=STARTTLS, 1=SSL
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VenueSettings = typeof venueSettings.$inferSelect;

// ─── Event Spaces (rooms within the venue) ───────────────────────────────────
export const eventSpaces = mysqlTable("event_spaces", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  minCapacity: int("minCapacity"),
  maxCapacity: int("maxCapacity"),
  minSpend: decimal("minSpend", { precision: 10, scale: 2 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EventSpace = typeof eventSpaces.$inferSelect;

// ─── Contacts (client CRM) ───────────────────────────────────────────────────
export const contacts = mysqlTable("contacts", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Leads (event enquiries) ─────────────────────────────────────────────────
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  contactId: int("contactId"),
  // Contact info (denormalised for quick access)
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  // Event details
  eventType: varchar("eventType", { length: 100 }),
  eventDate: timestamp("eventDate"),
  eventEndDate: timestamp("eventEndDate"),
  guestCount: int("guestCount"),
  spaceId: int("spaceId"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  message: text("message"),
  // Pipeline status
  status: mysqlEnum("status", [
    "new", "contacted", "proposal_sent", "negotiating", "booked", "lost", "cancelled"
  ]).default("new").notNull(),
  assignedTo: int("assignedTo"),
  source: varchar("source", { length: 100 }).default("lead_form"),
  internalNotes: text("internalNotes"),
  followUpDate: timestamp("followUpDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// ─── Proposals ───────────────────────────────────────────────────────────────
export const proposals = mysqlTable("proposals", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  leadId: int("leadId").notNull(),
  contactId: int("contactId"),
  // Public access token (for client-facing URL)
  publicToken: varchar("publicToken", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "sent", "viewed", "accepted", "declined", "expired"]).default("draft").notNull(),
  // Event details on proposal
  eventDate: timestamp("eventDate"),
  eventEndDate: timestamp("eventEndDate"),
  guestCount: int("guestCount"),
  spaceName: varchar("spaceName", { length: 255 }),
  // Financial
  subtotalNzd: decimal("subtotalNzd", { precision: 10, scale: 2 }),
  taxPercent: decimal("taxPercent", { precision: 5, scale: 2 }).default("15.00"),
  taxNzd: decimal("taxNzd", { precision: 10, scale: 2 }),
  totalNzd: decimal("totalNzd", { precision: 10, scale: 2 }),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }).default("25.00"),
  depositNzd: decimal("depositNzd", { precision: 10, scale: 2 }),
  // Content
  introMessage: text("introMessage"),
  lineItems: text("lineItems"),   // JSON array of {description, qty, unitPrice, total}
  termsAndConditions: text("termsAndConditions"),
  internalNotes: text("internalNotes"),
  // Timestamps
  sentAt: timestamp("sentAt"),
  viewedAt: timestamp("viewedAt"),
  respondedAt: timestamp("respondedAt"),
  expiresAt: timestamp("expiresAt"),
  clientMessage: text("clientMessage"),  // message from client on accept/decline
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

// ─── Bookings (confirmed events) ─────────────────────────────────────────────
export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  leadId: int("leadId"),
  proposalId: int("proposalId"),
  contactId: int("contactId"),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }).notNull(),
  eventType: varchar("eventType", { length: 100 }),
  eventDate: timestamp("eventDate").notNull(),
  eventEndDate: timestamp("eventEndDate"),
  guestCount: int("guestCount"),
  spaceName: varchar("spaceName", { length: 255 }),
  totalNzd: decimal("totalNzd", { precision: 10, scale: 2 }),
  depositNzd: decimal("depositNzd", { precision: 10, scale: 2 }),
  depositPaid: boolean("depositPaid").default(false).notNull(),
  status: mysqlEnum("status", ["confirmed", "tentative", "cancelled"]).default("confirmed").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

// ─── Lead Activity Log ────────────────────────────────────────────────────────
export const leadActivity = mysqlTable("lead_activity", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  ownerId: int("ownerId").notNull(),
  type: mysqlEnum("type", ["note", "status_change", "proposal_sent", "email", "call", "booking_created"]).notNull(),
  content: text("content"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LeadActivity = typeof leadActivity.$inferSelect;

// ─── Menu Packages ────────────────────────────────────────────────────────────
export const menuPackages = mysqlTable("menu_packages", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["food", "beverages", "food_and_beverages"]).default("food").notNull(),
  pricePerHead: decimal("pricePerHead", { precision: 10, scale: 2 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MenuPackage = typeof menuPackages.$inferSelect;
export type InsertMenuPackage = typeof menuPackages.$inferInsert;

// ─── Menu Items ───────────────────────────────────────────────────────────────
export const menuItems = mysqlTable("menu_items", {
  id: int("id").autoincrement().primaryKey(),
  packageId: int("packageId").notNull(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  dietaryNotes: varchar("dietaryNotes", { length: 255 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;
