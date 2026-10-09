ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "walkthroughRequest" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "walkthroughRequestedAt" timestamp;
--> statement-breakpoint
-- Old-style requests (a slot label with no confirmed time) become requests.
UPDATE "leads" SET "walkthroughRequest" = "walkthroughSlot", "walkthroughSlot" = NULL
  WHERE "walkthroughAt" IS NULL AND "walkthroughSlot" IS NOT NULL AND "walkthroughRequest" IS NULL;
