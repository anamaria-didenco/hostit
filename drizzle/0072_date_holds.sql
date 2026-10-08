ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "holdUntil" timestamp;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "holdNote" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "statusBeforeHold" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "holdReminderSentAt" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_hold_until_idx" ON "leads" ("holdUntil") WHERE "holdUntil" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "clashFlaggedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "defaultHoldDays" integer DEFAULT 7;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "holdClientReminderEnabled" integer DEFAULT 0;
