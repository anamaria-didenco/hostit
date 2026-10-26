-- Client portal v1: details the client confirms from their portal, and files
-- they upload.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "finalGuestCount" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "clientDietaries" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "clientDetailNotes" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "clientDetailsSubmittedAt" bigint;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_uploads" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_id" integer NOT NULL,
  "booking_id" integer,
  "lead_id" integer,
  "filename" varchar(255) NOT NULL,
  "content_type" varchar(100) NOT NULL,
  "size" integer NOT NULL,
  "data" text NOT NULL,
  "caption" varchar(255),
  "created_at" bigint NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_uploads_booking_idx" ON "portal_uploads" ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_uploads_lead_idx" ON "portal_uploads" ("lead_id");
