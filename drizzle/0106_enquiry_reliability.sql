-- Unfinished enquiries and the venue's emails.
-- leads.partialSeenAt: the last "still here" ping from a visitor's open form
-- on step 2 (leads.touchPartial). The Unfinished alert counts from it.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "partialSeenAt" timestamp;--> statement-breakpoint
-- A bell alert's email (notifyVenue): its status, tries, next try, last error
-- and when it went. Null emailStatus: no email wanted, or an alert from before.
ALTER TABLE "venue_notifications" ADD COLUMN IF NOT EXISTS "emailStatus" varchar(12);--> statement-breakpoint
ALTER TABLE "venue_notifications" ADD COLUMN IF NOT EXISTS "emailAttempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "venue_notifications" ADD COLUMN IF NOT EXISTS "emailNextAt" timestamp;--> statement-breakpoint
ALTER TABLE "venue_notifications" ADD COLUMN IF NOT EXISTS "emailLastError" varchar(500);--> statement-breakpoint
ALTER TABLE "venue_notifications" ADD COLUMN IF NOT EXISTS "emailedAt" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_notifications_email_due_idx" ON "venue_notifications" ("emailNextAt") WHERE "emailStatus" IN ('pending', 'sending');--> statement-breakpoint
-- The two emails a finished enquiry sends: the New Event Enquiry email to the
-- venue ("venue") and the visitor's confirmation ("auto_reply"). One row per
-- lead and kind, so a retry or a repeated SUBMIT can never queue a second.
CREATE TABLE IF NOT EXISTS "enquiry_emails" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "leadId" integer NOT NULL,
  "kind" varchar(20) NOT NULL,
  "status" varchar(12) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "nextAttemptAt" timestamp DEFAULT now() NOT NULL,
  "lastError" varchar(500),
  "sentAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "enquiry_emails_lead_kind_uq" ON "enquiry_emails" ("leadId", "kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enquiry_emails_due_idx" ON "enquiry_emails" ("nextAttemptAt") WHERE "status" IN ('pending', 'sending');
