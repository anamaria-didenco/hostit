import {
  integer, pgEnum, pgTable, text, timestamp,
  varchar, decimal, boolean, bigint, json, serial
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "proposal_sent", "negotiating", "booked", "lost", "cancelled"]);
export const proposalStatusEnum = pgEnum("proposal_status", ["draft", "sent", "viewed", "accepted", "declined", "expired"]);
export const bookingStatusEnum = pgEnum("booking_status", ["confirmed", "tentative", "cancelled"]);
export const leadActivityTypeEnum = pgEnum("lead_activity_type", ["note", "status_change", "proposal_sent", "email", "call", "booking_created"]);
export const menuPackageTypeEnum = pgEnum("menu_package_type", ["food", "beverages", "food_and_beverages"]);
export const paymentTypeEnum = pgEnum("payment_type", ["deposit", "final", "partial", "refund", "other"]);
export const paymentMethodEnum = pgEnum("payment_method", ["bank_transfer", "cash", "credit_card", "eftpos", "other"]);
export const fnbSectionEnum = pgEnum("fnb_section", ["foh", "kitchen"]);
export const barOptionEnum = pgEnum("bar_option", ["bar_tab", "cash_bar", "bar_tab_then_cash", "unlimited"]);
export const communicationTypeEnum = pgEnum("communication_type", ["note", "email", "call", "sms", "meeting"]);
export const communicationDirectionEnum = pgEnum("communication_direction", ["inbound", "outbound", "internal"]);
export const contractStatusEnum = pgEnum("contract_status", ["draft", "sent", "signed", "declined", "expired"]);
export const eventBudgetTypeEnum = pgEnum("event_budget_type", ["income", "expense"]);
export const equipmentStatusEnum = pgEnum("equipment_status", ["needed", "confirmed", "delivered", "returned"]);
export const menuCategoryTypeEnum = pgEnum("menu_category_type", ["food", "drink"]);
export const menuItemPricingTypeEnum = pgEnum("menu_item_pricing_type", ["per_person", "per_item"]);

// ─── Users (venue staff / owners) ────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Venue Settings (single venue per account) ───────────────────────────────
export const venueSettings = pgTable("venue_settings", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
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
  smtpHost: varchar("smtpHost", { length: 255 }),
  smtpPort: integer("smtpPort").default(587),
  smtpUser: varchar("smtpUser", { length: 320 }),
  smtpPass: text("smtpPass"),
  smtpFromName: varchar("smtpFromName", { length: 255 }),
  smtpFromEmail: varchar("smtpFromEmail", { length: 320 }),
  smtpSecure: integer("smtpSecure").default(0),
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
  minGroupSize: integer("minGroupSize").default(0),
  autoCancelTentative: integer("autoCancelTentative").default(1),
  bannerImageUrl: text("bannerImageUrl"),
  venueType: varchar("venueType", { length: 100 }),
  priceCategory: varchar("priceCategory", { length: 10 }).default("$$$"),
  aboutVenue: text("aboutVenue"),
  minEventDuration: varchar("minEventDuration", { length: 20 }).default("1 hour"),
  maxEventDuration: varchar("maxEventDuration", { length: 20 }).default("6 hours"),
  minLeadTime: varchar("minLeadTime", { length: 20 }).default("1 week"),
  maxLeadTime: varchar("maxLeadTime", { length: 20 }).default("6 months"),
  bufferTime: varchar("bufferTime", { length: 20 }).default("30 minutes"),
  operatingHours: text("operatingHours"),
  customStatuses: text("customStatuses"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type VenueSettings = typeof venueSettings.$inferSelect;

// ─── Event Spaces (rooms within the venue) ───────────────────────────────────
export const eventSpaces = pgTable("event_spaces", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  minCapacity: integer("minCapacity"),
  maxCapacity: integer("maxCapacity"),
  minSpend: decimal("minSpend", { precision: 10, scale: 2 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EventSpace = typeof eventSpaces.$inferSelect;

// ─── Contacts (client CRM) ───────────────────────────────────────────────────
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = typeof contacts.$inferInsert;

// ─── Leads (event enquiries) ─────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  contactId: integer("contactId"),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  eventType: varchar("eventType", { length: 100 }),
  eventDate: timestamp("eventDate"),
  eventEndDate: timestamp("eventEndDate"),
  guestCount: integer("guestCount"),
  spaceId: integer("spaceId"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  message: text("message"),
  status: text("status").default("new").notNull(),
  assignedTo: integer("assignedTo"),
  source: varchar("source", { length: 100 }).default("lead_form"),
  internalNotes: text("internalNotes"),
  followUpDate: timestamp("followUpDate"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// ─── Proposals ───────────────────────────────────────────────────────────────
export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  leadId: integer("leadId").notNull(),
  contactId: integer("contactId"),
  publicToken: varchar("publicToken", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  status: proposalStatusEnum("status").default("draft").notNull(),
  eventDate: timestamp("eventDate"),
  eventEndDate: timestamp("eventEndDate"),
  guestCount: integer("guestCount"),
  spaceName: varchar("spaceName", { length: 255 }),
  subtotalNzd: decimal("subtotalNzd", { precision: 10, scale: 2 }),
  taxPercent: decimal("taxPercent", { precision: 5, scale: 2 }).default("15.00"),
  taxNzd: decimal("taxNzd", { precision: 10, scale: 2 }),
  totalNzd: decimal("totalNzd", { precision: 10, scale: 2 }),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }).default("25.00"),
  depositNzd: decimal("depositNzd", { precision: 10, scale: 2 }),
  introMessage: text("introMessage"),
  lineItems: text("lineItems"),
  termsAndConditions: text("termsAndConditions"),
  internalNotes: text("internalNotes"),
  sentAt: timestamp("sentAt"),
  viewedAt: timestamp("viewedAt"),
  respondedAt: timestamp("respondedAt"),
  expiresAt: timestamp("expiresAt"),
  clientMessage: text("clientMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

// ─── Bookings (confirmed events) ─────────────────────────────────────────────
export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  leadId: integer("leadId"),
  proposalId: integer("proposalId"),
  contactId: integer("contactId"),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }),
  email: varchar("email", { length: 320 }).notNull(),
  eventType: varchar("eventType", { length: 100 }),
  eventDate: timestamp("eventDate").notNull(),
  eventEndDate: timestamp("eventEndDate"),
  guestCount: integer("guestCount"),
  spaceName: varchar("spaceName", { length: 255 }),
  totalNzd: decimal("totalNzd", { precision: 10, scale: 2 }),
  depositNzd: decimal("depositNzd", { precision: 10, scale: 2 }),
  depositPaid: boolean("depositPaid").default(false).notNull(),
  status: bookingStatusEnum("status").default("confirmed").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

// ─── Lead Activity Log ────────────────────────────────────────────────────────
export const leadActivity = pgTable("lead_activity", {
  id: serial("id").primaryKey(),
  leadId: integer("leadId").notNull(),
  ownerId: integer("ownerId").notNull(),
  type: leadActivityTypeEnum("type").notNull(),
  content: text("content"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LeadActivity = typeof leadActivity.$inferSelect;

// ─── Menu Packages ────────────────────────────────────────────────────────────
export const menuPackages = pgTable("menu_packages", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: menuPackageTypeEnum("type").default("food").notNull(),
  pricePerHead: decimal("pricePerHead", { precision: 10, scale: 2 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type MenuPackage = typeof menuPackages.$inferSelect;
export type InsertMenuPackage = typeof menuPackages.$inferInsert;

// ─── Menu Items ───────────────────────────────────────────────────────────────
export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  packageId: integer("packageId").notNull(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  dietaryNotes: varchar("dietaryNotes", { length: 255 }),
  category: varchar("category", { length: 100 }),
  portionSize: varchar("portionSize", { length: 100 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

// ─── Email Templates ──────────────────────────────────────────────────────────
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

// ─── Runsheets ────────────────────────────────────────────────────────────────
export const runsheets = pgTable("runsheets", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  leadId: integer("leadId"),
  bookingId: integer("bookingId"),
  title: varchar("title", { length: 255 }).notNull(),
  eventDate: timestamp("eventDate"),
  venueName: varchar("venueName", { length: 255 }),
  spaceName: varchar("spaceName", { length: 255 }),
  guestCount: integer("guestCount"),
  eventType: varchar("eventType", { length: 100 }),
  notes: text("notes"),
  dietaries: json("dietaries").$type<{ name: string; count: number; notes?: string }[]>(),
  venueSetup: text("venueSetup"),
  proposalId: integer("proposalId"),
  publicToken: varchar("publicToken", { length: 64 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Runsheet = typeof runsheets.$inferSelect;
export type InsertRunsheet = typeof runsheets.$inferInsert;

// ─── Runsheet Items ───────────────────────────────────────────────────────────
export const runsheetItems = pgTable("runsheet_items", {
  id: serial("id").primaryKey(),
  runsheetId: integer("runsheetId").notNull(),
  ownerId: integer("ownerId").notNull().default(0),
  time: varchar("time", { length: 10 }).notNull(),
  duration: integer("duration").default(30),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  assignedTo: varchar("assignedTo", { length: 255 }),
  category: varchar("category", { length: 50 }).default("other").notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
});
export type RunsheetItem = typeof runsheetItems.$inferSelect;
export type InsertRunsheetItem = typeof runsheetItems.$inferInsert;

// ─── Proposal Drinks ──────────────────────────────────────────────────────────
export const proposalDrinks = pgTable("proposal_drinks", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposalId").notNull().unique(),
  ownerId: integer("ownerId").notNull(),
  barOption: barOptionEnum("barOption").default("cash_bar").notNull(),
  tabAmount: decimal("tabAmount", { precision: 10, scale: 2 }),
  selectedDrinks: json("selectedDrinks").$type<string[]>().notNull(),
  customDrinks: json("customDrinks").$type<{ name: string; description?: string; price?: number }[]>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ProposalDrinks = typeof proposalDrinks.$inferSelect;
export type InsertProposalDrinks = typeof proposalDrinks.$inferInsert;

// ─── Quote Items ──────────────────────────────────────────────────────────────
export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposalId").notNull(),
  ownerId: integer("ownerId").notNull(),
  type: varchar("type", { length: 50 }).default("custom").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 10, scale: 2 }).default("1").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).default("0").notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = typeof quoteItems.$inferInsert;

// ─── Quote Settings (per proposal) ───────────────────────────────────────────
export const quoteSettings = pgTable("quote_settings", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposalId").notNull().unique(),
  ownerId: integer("ownerId").notNull(),
  minimumSpend: decimal("minimumSpend", { precision: 10, scale: 2 }),
  foodTotal: decimal("foodTotal", { precision: 10, scale: 2 }),
  autoBarTab: boolean("autoBarTab").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type QuoteSettings = typeof quoteSettings.$inferSelect;

// ─── Floor Plans ──────────────────────────────────────────────────────────────
export const floorPlans = pgTable("floor_plans", {
  id: serial("id").primaryKey(),
  bookingId: integer("bookingId"),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).default("Floor Plan").notNull(),
  bgImageUrl: text("bgImageUrl"),
  shareToken: varchar("shareToken", { length: 100 }),
  canvasData: json("canvasData").$type<{
    width: number; height: number;
    elements: Array<{
      id: string; type: string; x: number; y: number;
      width: number; height: number; rotation: number;
      label?: string; color?: string;
    }>;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type FloorPlan = typeof floorPlans.$inferSelect;

// ─── Checklist Templates ──────────────────────────────────────────────────────
export const checklistTemplates = pgTable("checklist_templates", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  items: json("items").$type<Array<{ id: string; text: string; category?: string; required?: boolean }>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;

// ─── Checklist Instances (assigned to bookings) ───────────────────────────────
export const checklistInstances = pgTable("checklist_instances", {
  id: serial("id").primaryKey(),
  templateId: integer("templateId"),
  bookingId: integer("bookingId"),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  items: json("items").$type<Array<{ id: string; text: string; category?: string; required?: boolean; checked: boolean; checkedAt?: string; notes?: string }>>().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ChecklistInstance = typeof checklistInstances.$inferSelect;

// ─── Payments ─────────────────────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("bookingId").notNull(),
  ownerId: integer("ownerId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: paymentTypeEnum("type").default("deposit").notNull(),
  method: paymentMethodEnum("method").default("bank_transfer").notNull(),
  paidAt: timestamp("paidAt").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── FOH/Kitchen F&B Items (linked to runsheets) ─────────────────────────────
export const fnbItems = pgTable("fnb_items", {
  id: serial("id").primaryKey(),
  runsheetId: integer("runsheetId").notNull(),
  ownerId: integer("ownerId").notNull(),
  section: fnbSectionEnum("section").default("foh").notNull(),
  course: varchar("course", { length: 100 }),
  dishName: varchar("dishName", { length: 255 }).notNull(),
  description: text("description"),
  qty: integer("qty").default(1).notNull(),
  dietary: varchar("dietary", { length: 255 }),
  serviceTime: varchar("serviceTime", { length: 10 }),
  prepNotes: text("prepNotes"),
  platingNotes: text("platingNotes"),
  staffAssigned: varchar("staffAssigned", { length: 255 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FnbItem = typeof fnbItems.$inferSelect;
export type InsertFnbItem = typeof fnbItems.$inferInsert;

// ─── Analytics Goals ──────────────────────────────────────────────────────────
export const analyticsGoals = pgTable("analytics_goals", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  targetRevenue: decimal("targetRevenue", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type AnalyticsGoal = typeof analyticsGoals.$inferSelect;

// ─── Bar Menu Items ────────────────────────────────────────────────────────
export const barMenuItems = pgTable("bar_menu_items", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  category: varchar("category", { length: 100 }).notNull().default("General"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pricePerUnit: decimal("price_per_unit", { precision: 10, scale: 2 }),
  unit: varchar("unit", { length: 50 }).default("per drink"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type BarMenuItem = typeof barMenuItems.$inferSelect;
export type InsertBarMenuItem = typeof barMenuItems.$inferInsert;

// ─── User Preferences (dashboard layout, widget order/visibility) ─────────────
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull().unique(),
  dashboardLayout: json("dashboardLayout").$type<{
    widgetOrder: string[];
    hiddenWidgets: string[];
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type UserPreferences = typeof userPreferences.$inferSelect;

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: bigint("due_date", { mode: "number" }),
  completed: boolean("completed").notNull().default(false),
  completedAt: bigint("completed_at", { mode: "number" }),
  linkedLeadId: integer("linked_lead_id"),
  linkedBookingId: integer("linked_booking_id"),
  assignedTo: varchar("assigned_to", { length: 255 }),
  priority: varchar("priority", { length: 20 }).default("normal"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Taxes & Fees ─────────────────────────────────────────────────────────────
export const taxesFees = pgTable("taxes_fees", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("tax"),
  rate: varchar("rate", { length: 20 }).notNull(),
  rateType: varchar("rate_type", { length: 20 }).notNull().default("percentage"),
  appliesTo: varchar("applies_to", { length: 50 }).notNull().default("all"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type TaxFee = typeof taxesFees.$inferSelect;
export type InsertTaxFee = typeof taxesFees.$inferInsert;

// ─── Menu Sections (Perfect Venue-style) ──────────────────────────────────────
export const menuSections = pgTable("menu_sections", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
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
export const standaloneMenuItems = pgTable("standalone_menu_items", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  sectionId: integer("section_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pricePerPerson: varchar("price_per_person", { length: 20 }),
  priceFlat: varchar("price_flat", { length: 20 }),
  pricingType: varchar("pricing_type", { length: 20 }).notNull().default("per_person"),
  imageUrl: text("image_url"),
  hasSalesTax: boolean("has_sales_tax").notNull().default(false),
  hasAdminFee: boolean("has_admin_fee").notNull().default(true),
  hasGratuity: boolean("has_gratuity").notNull().default(true),
  applyToMin: boolean("apply_to_min").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type StandaloneMenuItem = typeof standaloneMenuItems.$inferSelect;
export type InsertStandaloneMenuItem = typeof standaloneMenuItems.$inferInsert;

// ─── Sales Categories ─────────────────────────────────────────────────────────
export const salesCategories = pgTable("sales_categories", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type SalesCategory = typeof salesCategories.$inferSelect;
export type InsertSalesCategory = typeof salesCategories.$inferInsert;

// ─── Quickstart Progress ──────────────────────────────────────────────────────
export const quickstartProgress = pgTable("quickstart_progress", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().unique(),
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
export const runsheetTemplates = pgTable("runsheet_templates", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { length: 100 }),
  items: json("items").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type RunsheetTemplate = typeof runsheetTemplates.$inferSelect;
export type InsertRunsheetTemplate = typeof runsheetTemplates.$inferInsert;

// ─── Menu Categories ──────────────────────────────────────────────────────────
export const menuCategories = pgTable("menu_categories", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: menuCategoryTypeEnum("type").notNull().default("food"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;

// ─── Menu Category Items ──────────────────────────────────────────────────────
export const menuCategoryItems = pgTable("menu_category_items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pricingType: menuItemPricingTypeEnum("pricing_type").notNull().default("per_person"),
  price: integer("price").notNull().default(0),
  unit: varchar("unit", { length: 50 }).default("person"),
  available: boolean("available").notNull().default(true),
  allergens: varchar("allergens", { length: 500 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type MenuCategoryItem = typeof menuCategoryItems.$inferSelect;
export type InsertMenuCategoryItem = typeof menuCategoryItems.$inferInsert;

// ─── Contracts ────────────────────────────────────────────────────────────────
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  bookingId: integer("booking_id"),
  leadId: integer("lead_id"),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  status: contractStatusEnum("status").notNull().default("draft"),
  clientName: varchar("client_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 255 }),
  signedAt: bigint("signed_at", { mode: "number" }),
  signatureData: text("signature_data"),
  signerIp: varchar("signer_ip", { length: 100 }),
  signerName: varchar("signer_name", { length: 255 }),
  sentAt: bigint("sent_at", { mode: "number" }),
  expiresAt: bigint("expires_at", { mode: "number" }),
  token: varchar("token", { length: 100 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;

// ─── Event Budgets ────────────────────────────────────────────────────────────
export const eventBudgets = pgTable("event_budgets", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  bookingId: integer("booking_id"),
  leadId: integer("lead_id"),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("other"),
  type: eventBudgetTypeEnum("type").notNull().default("expense"),
  estimatedAmount: integer("estimated_amount").notNull().default(0),
  actualAmount: integer("actual_amount").default(0),
  notes: text("notes"),
  isPaid: boolean("is_paid").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type EventBudget = typeof eventBudgets.$inferSelect;
export type InsertEventBudget = typeof eventBudgets.$inferInsert;

// ─── Equipment / Inventory ────────────────────────────────────────────────────
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("other"),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  unit: varchar("unit", { length: 50 }).default("item"),
  notes: text("notes"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = typeof equipment.$inferInsert;

// ─── Event Equipment Assignments ──────────────────────────────────────────────
export const eventEquipment = pgTable("event_equipment", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  bookingId: integer("booking_id"),
  leadId: integer("lead_id"),
  equipmentId: integer("equipment_id"),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("other"),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"),
  status: equipmentStatusEnum("status").notNull().default("needed"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type EventEquipmentItem = typeof eventEquipment.$inferSelect;
export type InsertEventEquipmentItem = typeof eventEquipment.$inferInsert;

// ─── Communications / Notes ───────────────────────────────────────────────────
export const communications = pgTable("communications", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  bookingId: integer("booking_id"),
  leadId: integer("lead_id"),
  type: communicationTypeEnum("type").notNull().default("note"),
  subject: varchar("subject", { length: 255 }),
  body: text("body").notNull(),
  direction: communicationDirectionEnum("direction").notNull().default("internal"),
  contactName: varchar("contact_name", { length: 255 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = typeof communications.$inferInsert;

// ─── Seating Charts ───────────────────────────────────────────────────────────
export const seatingCharts = pgTable("seating_charts", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  bookingId: integer("booking_id"),
  leadId: integer("lead_id"),
  name: varchar("name", { length: 255 }).notNull().default("Seating Chart"),
  canvasData: text("canvas_data"),
  guestCount: integer("guest_count").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type SeatingChart = typeof seatingCharts.$inferSelect;
export type InsertSeatingChart = typeof seatingCharts.$inferInsert;

// ─── Client Portal Tokens ─────────────────────────────────────────────────────
export const clientPortalTokens = pgTable("client_portal_tokens", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  bookingId: integer("booking_id"),
  leadId: integer("lead_id"),
  token: varchar("token", { length: 100 }).notNull(),
  clientName: varchar("client_name", { length: 255 }),
  clientEmail: varchar("client_email", { length: 255 }),
  permissions: text("permissions"),
  expiresAt: bigint("expires_at", { mode: "number" }),
  lastAccessedAt: bigint("last_accessed_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
export type ClientPortalToken = typeof clientPortalTokens.$inferSelect;
export type InsertClientPortalToken = typeof clientPortalTokens.$inferInsert;

// ─── Setup Instructions ───────────────────────────────────────────────────────
export const setupInstructions = pgTable("setup_instructions", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  images: json("images").$type<string[]>().default([]),
  category: varchar("category", { length: 100 }).default("general"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type SetupInstruction = typeof setupInstructions.$inferSelect;
export type InsertSetupInstruction = typeof setupInstructions.$inferInsert;

// ─── Table Setups ─────────────────────────────────────────────────────────────
export const tableSetups = pgTable("table_setups", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 255 }).notNull().default("Table Setup"),
  description: text("description"),
  canvasData: json("canvas_data").$type<{
    width: number;
    height: number;
    elements: Array<{
      id: string; type: string; x: number; y: number;
      width: number; height: number; rotation: number;
      label?: string; color?: string;
    }>;
  }>(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
export type TableSetup = typeof tableSetups.$inferSelect;
export type InsertTableSetup = typeof tableSetups.$inferInsert;
