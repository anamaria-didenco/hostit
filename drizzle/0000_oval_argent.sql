CREATE TYPE "public"."bar_option" AS ENUM('bar_tab', 'cash_bar', 'bar_tab_then_cash', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'tentative', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."communication_direction" AS ENUM('inbound', 'outbound', 'internal');--> statement-breakpoint
CREATE TYPE "public"."communication_type" AS ENUM('note', 'email', 'call', 'sms', 'meeting');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('draft', 'sent', 'signed', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."equipment_status" AS ENUM('needed', 'confirmed', 'delivered', 'returned');--> statement-breakpoint
CREATE TYPE "public"."event_budget_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."fnb_section" AS ENUM('foh', 'kitchen');--> statement-breakpoint
CREATE TYPE "public"."lead_activity_type" AS ENUM('note', 'status_change', 'proposal_sent', 'email', 'call', 'booking_created');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'proposal_sent', 'negotiating', 'booked', 'lost', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."menu_category_type" AS ENUM('food', 'drink');--> statement-breakpoint
CREATE TYPE "public"."menu_item_pricing_type" AS ENUM('per_person', 'per_item');--> statement-breakpoint
CREATE TYPE "public"."menu_package_type" AS ENUM('food', 'beverages', 'food_and_beverages');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank_transfer', 'cash', 'credit_card', 'eftpos', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('deposit', 'final', 'partial', 'refund', 'other');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "analytics_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"targetRevenue" numeric(10, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"category" varchar(100) DEFAULT 'General' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price_per_unit" numeric(10, 2),
	"unit" varchar(50) DEFAULT 'per drink',
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"leadId" integer,
	"proposalId" integer,
	"contactId" integer,
	"firstName" varchar(100) NOT NULL,
	"lastName" varchar(100),
	"email" varchar(320) NOT NULL,
	"eventType" varchar(100),
	"eventDate" timestamp NOT NULL,
	"eventEndDate" timestamp,
	"guestCount" integer,
	"spaceName" varchar(255),
	"totalNzd" numeric(10, 2),
	"depositNzd" numeric(10, 2),
	"depositPaid" boolean DEFAULT false NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"templateId" integer,
	"bookingId" integer,
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"items" json NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"items" json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_portal_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"booking_id" integer,
	"lead_id" integer,
	"token" varchar(100) NOT NULL,
	"client_name" varchar(255),
	"client_email" varchar(255),
	"permissions" text,
	"expires_at" bigint,
	"last_accessed_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"booking_id" integer,
	"lead_id" integer,
	"type" "communication_type" DEFAULT 'note' NOT NULL,
	"subject" varchar(255),
	"body" text NOT NULL,
	"direction" "communication_direction" DEFAULT 'internal' NOT NULL,
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"firstName" varchar(100) NOT NULL,
	"lastName" varchar(100),
	"email" varchar(320) NOT NULL,
	"phone" varchar(50),
	"company" varchar(255),
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"booking_id" integer,
	"lead_id" integer,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"client_name" varchar(255),
	"client_email" varchar(255),
	"signed_at" bigint,
	"signature_data" text,
	"signer_ip" varchar(100),
	"signer_name" varchar(255),
	"sent_at" bigint,
	"expires_at" bigint,
	"token" varchar(100),
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) DEFAULT 'other' NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" varchar(50) DEFAULT 'item',
	"notes" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"booking_id" integer,
	"lead_id" integer,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) DEFAULT 'other' NOT NULL,
	"type" "event_budget_type" DEFAULT 'expense' NOT NULL,
	"estimated_amount" integer DEFAULT 0 NOT NULL,
	"actual_amount" integer DEFAULT 0,
	"notes" text,
	"is_paid" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_equipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"booking_id" integer,
	"lead_id" integer,
	"equipment_id" integer,
	"name" varchar(255) NOT NULL,
	"category" varchar(100) DEFAULT 'other' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"status" "equipment_status" DEFAULT 'needed' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_spaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"minCapacity" integer,
	"maxCapacity" integer,
	"minSpend" numeric(10, 2),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"bookingId" integer,
	"ownerId" integer NOT NULL,
	"name" varchar(255) DEFAULT 'Floor Plan' NOT NULL,
	"bgImageUrl" text,
	"canvasData" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fnb_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"runsheetId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"section" "fnb_section" DEFAULT 'foh' NOT NULL,
	"course" varchar(100),
	"dishName" varchar(255) NOT NULL,
	"description" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"dietary" varchar(255),
	"serviceTime" varchar(10),
	"prepNotes" text,
	"platingNotes" text,
	"staffAssigned" varchar(255),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"leadId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"type" "lead_activity_type" NOT NULL,
	"content" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"contactId" integer,
	"firstName" varchar(100) NOT NULL,
	"lastName" varchar(100),
	"email" varchar(320) NOT NULL,
	"phone" varchar(50),
	"company" varchar(255),
	"eventType" varchar(100),
	"eventDate" timestamp,
	"eventEndDate" timestamp,
	"guestCount" integer,
	"spaceId" integer,
	"budget" numeric(10, 2),
	"message" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"assignedTo" integer,
	"source" varchar(100) DEFAULT 'lead_form',
	"internalNotes" text,
	"followUpDate" timestamp,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "menu_category_type" DEFAULT 'food' NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_category_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"pricing_type" "menu_item_pricing_type" DEFAULT 'per_person' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"unit" varchar(50) DEFAULT 'person',
	"available" boolean DEFAULT true NOT NULL,
	"allergens" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"packageId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"dietaryNotes" varchar(255),
	"category" varchar(100),
	"portionSize" varchar(100),
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" "menu_package_type" DEFAULT 'food' NOT NULL,
	"pricePerHead" numeric(10, 2),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"has_sales_tax" boolean DEFAULT true NOT NULL,
	"has_admin_fee" boolean DEFAULT true NOT NULL,
	"has_gratuity" boolean DEFAULT true NOT NULL,
	"apply_to_min" boolean DEFAULT true NOT NULL,
	"sales_category" varchar(100) DEFAULT 'Food',
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"bookingId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"type" "payment_type" DEFAULT 'deposit' NOT NULL,
	"method" "payment_method" DEFAULT 'bank_transfer' NOT NULL,
	"paidAt" timestamp NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_drinks" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"barOption" "bar_option" DEFAULT 'cash_bar' NOT NULL,
	"tabAmount" numeric(10, 2),
	"selectedDrinks" json NOT NULL,
	"customDrinks" json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_drinks_proposalId_unique" UNIQUE("proposalId")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"contactId" integer,
	"publicToken" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"eventDate" timestamp,
	"eventEndDate" timestamp,
	"guestCount" integer,
	"spaceName" varchar(255),
	"subtotalNzd" numeric(10, 2),
	"taxPercent" numeric(5, 2) DEFAULT '15.00',
	"taxNzd" numeric(10, 2),
	"totalNzd" numeric(10, 2),
	"depositPercent" numeric(5, 2) DEFAULT '25.00',
	"depositNzd" numeric(10, 2),
	"introMessage" text,
	"lineItems" text,
	"termsAndConditions" text,
	"internalNotes" text,
	"sentAt" timestamp,
	"viewedAt" timestamp,
	"respondedAt" timestamp,
	"expiresAt" timestamp,
	"clientMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_publicToken_unique" UNIQUE("publicToken")
);
--> statement-breakpoint
CREATE TABLE "quickstart_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"venue_details" boolean DEFAULT false NOT NULL,
	"contact_form" boolean DEFAULT false NOT NULL,
	"bank_account" boolean DEFAULT false NOT NULL,
	"menu" boolean DEFAULT false NOT NULL,
	"spaces" boolean DEFAULT false NOT NULL,
	"taxes_fees" boolean DEFAULT false NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "quickstart_progress_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"type" varchar(50) DEFAULT 'custom' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"qty" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unitPrice" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"minimumSpend" numeric(10, 2),
	"foodTotal" numeric(10, 2),
	"autoBarTab" boolean DEFAULT true NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quote_settings_proposalId_unique" UNIQUE("proposalId")
);
--> statement-breakpoint
CREATE TABLE "runsheet_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"runsheetId" integer NOT NULL,
	"ownerId" integer DEFAULT 0 NOT NULL,
	"time" varchar(10) NOT NULL,
	"duration" integer DEFAULT 30,
	"title" varchar(255) NOT NULL,
	"description" text,
	"assignedTo" varchar(255),
	"category" varchar(50) DEFAULT 'other' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runsheet_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"event_type" varchar(100),
	"items" json NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runsheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"leadId" integer,
	"bookingId" integer,
	"title" varchar(255) NOT NULL,
	"eventDate" timestamp,
	"venueName" varchar(255),
	"spaceName" varchar(255),
	"guestCount" integer,
	"eventType" varchar(100),
	"notes" text,
	"dietaries" json,
	"venueSetup" text,
	"proposalId" integer,
	"publicToken" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "runsheets_publicToken_unique" UNIQUE("publicToken")
);
--> statement-breakpoint
CREATE TABLE "sales_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seating_charts" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"booking_id" integer,
	"lead_id" integer,
	"name" varchar(255) DEFAULT 'Seating Chart' NOT NULL,
	"canvas_data" text,
	"guest_count" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standalone_menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"section_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price_per_person" varchar(20),
	"price_flat" varchar(20),
	"pricing_type" varchar(20) DEFAULT 'per_person' NOT NULL,
	"image_url" text,
	"has_sales_tax" boolean DEFAULT false NOT NULL,
	"has_admin_fee" boolean DEFAULT true NOT NULL,
	"has_gratuity" boolean DEFAULT true NOT NULL,
	"apply_to_min" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_date" bigint,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" bigint,
	"linked_lead_id" integer,
	"linked_booking_id" integer,
	"assigned_to" varchar(255),
	"priority" varchar(20) DEFAULT 'normal',
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxes_fees" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) DEFAULT 'tax' NOT NULL,
	"rate" varchar(20) NOT NULL,
	"rate_type" varchar(20) DEFAULT 'percentage' NOT NULL,
	"applies_to" varchar(50) DEFAULT 'all' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"dashboardLayout" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_ownerId_unique" UNIQUE("ownerId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "venue_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"name" varchar(255) DEFAULT 'My Venue' NOT NULL,
	"slug" varchar(100) DEFAULT 'my-venue' NOT NULL,
	"tagline" text,
	"description" text,
	"address" text,
	"city" varchar(100),
	"phone" varchar(50),
	"email" varchar(320),
	"website" varchar(500),
	"logoUrl" text,
	"coverImageUrl" text,
	"primaryColor" varchar(20) DEFAULT '#C8102E',
	"themeKey" varchar(50) DEFAULT 'sage',
	"leadFormTitle" varchar(255) DEFAULT 'Book Your Event',
	"leadFormSubtitle" text,
	"depositPercent" numeric(5, 2) DEFAULT '25.00',
	"currency" varchar(10) DEFAULT 'NZD',
	"smtpHost" varchar(255),
	"smtpPort" integer DEFAULT 587,
	"smtpUser" varchar(320),
	"smtpPass" text,
	"smtpFromName" varchar(255),
	"smtpFromEmail" varchar(320),
	"smtpSecure" integer DEFAULT 0,
	"internalName" varchar(255),
	"notificationEmail" varchar(320),
	"addressLine1" varchar(500),
	"addressLine2" varchar(500),
	"suburb" varchar(100),
	"state" varchar(100),
	"postcode" varchar(20),
	"country" varchar(100) DEFAULT 'New Zealand',
	"timezone" varchar(100) DEFAULT 'Pacific/Auckland',
	"eventTimeStart" varchar(10) DEFAULT '08:00',
	"eventTimeEnd" varchar(10) DEFAULT '22:00',
	"minGroupSize" integer DEFAULT 0,
	"autoCancelTentative" integer DEFAULT 1,
	"bannerImageUrl" text,
	"venueType" varchar(100),
	"priceCategory" varchar(10) DEFAULT '$$$',
	"aboutVenue" text,
	"minEventDuration" varchar(20) DEFAULT '1 hour',
	"maxEventDuration" varchar(20) DEFAULT '6 hours',
	"minLeadTime" varchar(20) DEFAULT '1 week',
	"maxLeadTime" varchar(20) DEFAULT '6 months',
	"bufferTime" varchar(20) DEFAULT '30 minutes',
	"operatingHours" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
