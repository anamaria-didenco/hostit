ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "landingPage" varchar(500);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "adClickAt" timestamp;
