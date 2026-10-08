-- Enquiry form: availability on the date picker, per-space price guidance,
-- real walkthrough booking.
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "showAvailabilityOnForm" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "walkthroughEnabled" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "walkthroughDays" varchar(20) DEFAULT '2,3,4,5,6';
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "walkthroughStart" varchar(5) DEFAULT '10:00';
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "walkthroughEnd" varchar(5) DEFAULT '16:00';
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "walkthroughSlotMinutes" integer DEFAULT 30;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "walkthroughDaysAhead" integer DEFAULT 14;
--> statement-breakpoint
ALTER TABLE "event_spaces" ADD COLUMN IF NOT EXISTS "minSpendWeekend" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "event_spaces" ADD COLUMN IF NOT EXISTS "packagesFromPp" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "event_spaces" ADD COLUMN IF NOT EXISTS "showPricingOnForm" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "walkthroughAt" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_owner_walkthrough_idx" ON "leads" ("ownerId","walkthroughAt") WHERE "walkthroughAt" IS NOT NULL;
