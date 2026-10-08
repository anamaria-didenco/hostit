ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lostReason" varchar(40);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lostReasonNote" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastWinBackAt" timestamp;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "winBackAnnualTypes" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_owner_email_lower_idx" ON "leads" ("ownerId", lower("email"));
