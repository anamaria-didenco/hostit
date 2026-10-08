CREATE TABLE IF NOT EXISTS "venue_notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "kind" varchar(40) NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text,
  "leadId" integer,
  "bookingId" integer,
  "link" varchar(500),
  "dedupeKey" varchar(160),
  "readAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "venue_notifications_owner_dedupe_uq" ON "venue_notifications" ("ownerId","dedupeKey") WHERE "dedupeKey" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_notifications_owner_created_idx" ON "venue_notifications" ("ownerId","createdAt");
