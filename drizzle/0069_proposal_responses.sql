ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "declineReason" text;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "proposalAcceptEmailEnabled" integer DEFAULT 1;
