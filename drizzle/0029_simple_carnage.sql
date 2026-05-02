ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "nbiAccountId" varchar(100);--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "nbiServiceId" varchar(100);--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "nbiWebhookSecret" varchar(64);
