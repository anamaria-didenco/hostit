import {
  int, mysqlEnum, mysqlTable, text, timestamp,
  varchar, decimal, boolean, bigint, json
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
  themeKey: varchar("themeKey", { length: 50 }).default("sage"),
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
  // Venue Details extra fields
  internalName: varchar("internalName", { length: 255 }),
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  addressLine1: varchar("addressLine1", { length: 500 }),
  addressLine2: varchar("addressLine2", { length: 500 }),
  suburb: varchar("suburb", { length: 100 }),
  state: varchar("state", { length: 100 }),
  postcode: varchar("postcode", { length: 20 }),
  country: varchar("country", { length: 100 }).default("New Zealand"),
  timezone: varchar("timezone", { length: 100 }).default("Pacific/Auckland"),
  eventTimeStart: varchar("eventTimeStart", { length: 10 }).default("08:00"),
  eventTimeEnd: varchar("eventTimeEnd", { length: 10 }).default("22:00"),
  minGroupSize: int("minGroupSize").default(0),
  autoCancelTentative: int("autoCancelTentative").default(1),
  // Venue Profile fields
  bannerImageUrl: text("bannerImageUrl"),
  venueType: varchar("venueType", { length: 100 }),
  priceCategory: varchar("priceCategory", { length: 10 }).default("$$$"),
  aboutVenue: text("aboutVenue"),
  minEventDuration: varchar("minEventDuration", { length: 20 }).default("1 hour"),
  maxEventDuration: varchar("maxEventDuration", { length: 20 }).default("6 hours"),
  minLeadTime: varchar("minLeadTime", { length: 20 }).default("1 week"),
  maxLeadTime: varchar("maxLeadTime", { length: 20 }).default("6 months"),
  bufferTime: varchar("bufferTime", { length: 20 }).default("30 minutes"),
  // Operating hours JSON: [{day,enabled,start,end}]
  operatingHours: text("operatingHours"),
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
  readAt: timestamp("readAt"),
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
  category: varchar("category", { length: 100 }),
  portionSize: varchar("portionSize", { length: 100 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;
// ─── Email Templates ──────────────────────────────────────────────────────────
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

// ─── Runsheets ────────────────────────────────────────────────────────────────
export const runsheets = mysqlTable("runsheets", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  leadId: int("leadId"),
  bookingId: int("bookingId"),
  title: varchar("title", { length: 255 }).notNull(),
  eventDate: timestamp("eventDate"),
  venueName: varchar("venueName", { length: 255 }),
  spaceName: varchar("spaceName", { length: 255 }),
  guestCount: int("guestCount"),
  eventType: varchar("eventType", { length: 100 }),
  notes: text("notes"),
  dietaries: json("dietaries").$type<{ name: string; count: number; notes?: string }[]>(),
  venueSetup: text("venueSetup"),
  proposalId: int("proposalId"),
  publicToken: varchar("publicToken", { length: 64 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Runsheet = typeof runsheets.$inferSelect;
export type InsertRunsheet = typeof runsheets.$inferInsert;

// ─── Runsheet Items ───────────────────────────────────────────────────────────
export const runsheetItems = mysqlTable("runsheet_items", {
  id: int("id").autoincrement().primaryKey(),
  runsheetId: int("runsheetId").notNull(),
  ownerId: int("ownerId").notNull().default(0),
  time: varchar("time", { length: 10 }).notNull(), // e.g. "17:30"
  duration: int("duration").default(30), // minutes
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignedTo: varchar("assignedTo", { length: 255 }),
  category: varchar("category", { length: 50 }).default("other").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
});
export type RunsheetItem = typeof runsheetItems.$inferSelect;
export type InsertRunsheetItem = typeof runsheetItems.$inferInsert;

// ─── Proposal Drinks ──────────────────────────────────────────────────────────
export const proposalDrinks = mysqlTable("proposal_drinks", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull().unique(),
  ownerId: int("ownerId").notNull(),
  barOption: mysqlEnum("barOption", ["bar_tab", "cash_bar", "bar_tab_then_cash", "unlimited"]).default("cash_bar").notNull(),
  tabAmount: decimal("tabAmount", { precision: 10, scale: 2 }),
  selectedDrinks: json("selectedDrinks").$type<string[]>().notNull(),
  customDrinks: json("customDrinks").$type<{ name: string; description?: string; price?: number }[]>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProposalDrinks = typeof proposalDrinks.$inferSelect;
export type InsertProposalDrinks = typeof proposalDrinks.$inferInsert;

// ─── Quote Items ──────────────────────────────────────────────────────────────
export const quoteItems = mysqlTable("quote_items", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  ownerId: int("ownerId").notNull(),
  type: varchar("type", { length: 50 }).default("custom").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 10, scale: 2 }).default("1").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).default("0").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = typeof quoteItems.$inferInsert;

// ─── Quote Settings (per proposal) ───────────────────────────────────────────
export const quoteSettings = mysqlTable("quote_settings", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull().unique(),
  ownerId: int("ownerId").notNull(),
  minimumSpend: decimal("minimumSpend", { precision: 10, scale: 2 }),
  foodTotal: decimal("foodTotal", { precision: 10, scale: 2 }),
  autoBarTab: boolean("autoBarTab").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QuoteSettings = typeof quoteSettings.$inferSelect;

// ─── Floor Plans ──────────────────────────────────────────────────────────────
export const floorPlans = mysqlTable("floor_plans", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("bookingId"),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).default("Floor Plan").notNull(),
  bgImageUrl: text("bgImageUrl"),
  canvasData: json("canvasData").$type<{
    width: number; height: number;
    elements: Array<{
      id: string; type: string; x: number; y: number;
      width: number; height: number; rotation: number;
      label?: string; color?: string;
    }>;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FloorPlan = typeof floorPlans.$inferSelect;

// ─── Checklist Templates ──────────────────────────────────────────────────────
export const checklistTemplates = mysqlTable("checklist_templates", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  items: json("items").$type<Array<{ id: string; text: string; category?: string; required?: boolean }>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;

// ─── Checklist Instances (assigned to bookings) ───────────────────────────────
export const checklistInstances = mysqlTable("checklist_instances", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId"),
  bookingId: int("bookingId"),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  items: json("items").$type<Array<{ id: string; text: string; category?: string; required?: boolean; checked: boolean; checkedAt?: string; notes?: string }>>().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChecklistInstance = typeof checklistInstances.$inferSelect;

// ─── Payments ─────────────────────────────────────────────────────────────────
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  bookingId: int("bookingId").notNull(),
  ownerId: int("ownerId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: mysqlEnum("type", ["deposit", "final", "partial", "refund", "other"]).default("deposit").notNull(),
  method: mysqlEnum("method", ["bank_transfer", "cash", "credit_card", "eftpos", "other"]).default("bank_transfer").notNull(),
  paidAt: timestamp("paidAt").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── FOH/Kitchen F&B Items (linked to runsheets) ─────────────────────────────
export const fnbItems = mysqlTable("fnb_items", {
  id: int("id").autoincrement().primaryKey(),
  runsheetId: int("runsheetId").notNull(),
  ownerId: int("ownerId").notNull(),
  section: mysqlEnum("section", ["foh", "kitchen"]).default("foh").notNull(),
  course: varchar("course", { length: 100 }), // e.g. "Canapes", "Entree", "Main", "Dessert"
  dishName: varchar("dishName", { length: 255 }).notNull(),
  description: text("description"),
  qty: int("qty").default(1).notNull(),
  dietary: varchar("dietary", { length: 255 }), // e.g. "GF:10, V:5, VG:3"
  serviceTime: varchar("serviceTime", { length: 10 }), // e.g. "18:30"
  prepNotes: text("prepNotes"),
  platingNotes: text("platingNotes"),
  staffAssigned: varchar("staffAssigned", { length: 255 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FnbItem = typeof fnbItems.$inferSelect;
export type InsertFnbItem = typeof fnbItems.$inferInsert;

// ─── Analytics Goals ──────────────────────────────────────────────────────────
export const analyticsGoals = mysqlTable("analytics_goals", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(), // 1-12, or 0 for annual goal
  targetRevenue: decimal("targetRevenue", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AnalyticsGoal = typeof analyticsGoals.$inferSelect;

// ─── Bar Menu Items ────────────────────────────────────────────────────────
export const barMenuItems = mysqlTable("bar_menu_items", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  category: varchar("category", { length: 100 }).notNull().default("General"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pricePerUnit: decimal("price_per_unit", { precision: 10, scale: 2 }),
  unit: varchar("unit", { length: 50 }).default("per drink"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type BarMenuItem = typeof barMenuItems.$inferSelect;
export type InsertBarMenuItem = typeof barMenuItems.$inferInsert;

// ─── User Preferences (dashboard layout, widget order/visibility) ─────────────
export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().unique(),
  dashboardLayout: json("dashboardLayout").$type<{
    widgetOrder: string[];
    hiddenWidgets: string[];
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserPreferences = typeof userPreferences.$inferSelect;

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: bigint("due_date", { mode: "number" }),
  completed: boolean("completed").notNull().default(false),
  completedAt: bigint("completed_at", { mode: "number" }),
  linkedLeadId: int("linked_lead_id"),
  linkedBookingId: int("linked_booking_id"),
  assignedTo: varchar("assigned_to", { length: 255 }),
  priority: varchar("priority", { length: 20 }).default("normal"), // low | normal | high
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Taxes & Fees ─────────────────────────────────────────────────────────────
export const taxesFees = mysqlTable("taxes_fees", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("tax"), // tax | fee
  rate: varchar("rate", { length: 20 }).notNull(), // e.g. "15" for 15% or "25.00" for flat fee
  rateType: varchar("rate_type", { length: 20 }).notNull().default("percentage"), // percentage | flat
  appliesTo: varchar("applies_to", { length: 50 }).notNull().default("all"), // all | food | beverage
  isActive: boolean("is_active").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type TaxFee = typeof taxesFees.$inferSelect;
export type InsertTaxFee = typeof taxesFees.$inferInsert;

// ─── Menu Sections (Perfect Venue-style) ──────────────────────────────────────
export const menuSections = mysqlTable("menu_sections", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  hasSalesTax: boolean("has_sales_tax").notNull().default(true),
  hasAdminFee: boolean("has_admin_fee").notNull().default(true),
  hasGratuity: boolean("has_gratuity").notNull().default(true),
  applyToMin: boolean("apply_to_min").notNull().default(true),
  salesCategory: varchar("sales_category", { length: 100 }).default("Food"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MenuSection = typeof menuSections.$inferSelect;
export type InsertMenuSection = typeof menuSections.$inferInsert;

// ─── Standalone Menu Items (per section) ─────────────────────────────────────
export const standaloneMenuItems = mysqlTable("standalone_menu_items", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  sectionId: int("section_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pricePerPerson: varchar("price_per_person", { length: 20 }),
  priceFlat: varchar("price_flat", { length: 20 }),
  pricingType: varchar("pricing_type", { length: 20 }).notNull().default("per_person"), // per_person | flat | per_hour
  imageUrl: text("image_url"),
  hasSalesTax: boolean("has_sales_tax").notNull().default(false),
  hasAdminFee: boolean("has_admin_fee").notNull().default(true),
  hasGratuity: boolean("has_gratuity").notNull().default(true),
  applyToMin: boolean("apply_to_min").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type StandaloneMenuItem = typeof standaloneMenuItems.$inferSelect;
export type InsertStandaloneMenuItem = typeof standaloneMenuItems.$inferInsert;

// ─── Sales Categories ─────────────────────────────────────────────────────────
export const salesCategories = mysqlTable("sales_categories", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type SalesCategory = typeof salesCategories.$inferSelect;
export type InsertSalesCategory = typeof salesCategories.$inferInsert;

// ─── Quickstart Progress ──────────────────────────────────────────────────────
export const quickstartProgress = mysqlTable("quickstart_progress", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull().unique(),
  venueDetails: boolean("venue_details").notNull().default(false),
  contactForm: boolean("contact_form").notNull().default(false),
  bankAccount: boolean("bank_account").notNull().default(false),
  menu: boolean("menu").notNull().default(false),
  spaces: boolean("spaces").notNull().default(false),
  taxesFees: boolean("taxes_fees").notNull().default(false),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type QuickstartProgress = typeof quickstartProgress.$inferSelect;

// ─── Runsheet Templates ───────────────────────────────────────────────────────
export const runsheetTemplates = mysqlTable("runsheet_templates", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 100 }),
  items: json("items").notNull(), // Array of RunsheetItem objects
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type RunsheetTemplate = typeof runsheetTemplates.$inferSelect;
export type InsertRunsheetTemplate = typeof runsheetTemplates.$inferInsert;

// ─── Menu Categories ──────────────────────────────────────────────────────────
export const menuCategories = mysqlTable("menu_categories", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["food", "drink"]).notNull().default("food"),
  description: text("description"),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;

// ─── Menu Category Items ──────────────────────────────────────────────────────
export const menuCategoryItems = mysqlTable("menu_category_items", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("category_id").notNull(),
  ownerId: int("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pricingType: mysqlEnum("pricing_type", ["per_person", "per_item"]).notNull().default("per_person"),
  price: int("price").notNull().default(0), // stored in cents
  unit: varchar("unit", { length: 50 }).default("person"), // e.g. "person", "piece", "bottle", "kg"
  available: boolean("available").notNull().default(true),
  allergens: varchar("allergens", { length: 500 }),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MenuCategoryItem = typeof menuCategoryItems.$inferSelect;
export type InsertMenuCategoryItem = typeof menuCategoryItems.$inferInsert;
