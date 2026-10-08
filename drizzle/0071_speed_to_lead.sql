ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "firstResponseAt" timestamp;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastInboundAt" timestamp;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastStaffEmailAt" timestamp;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "followUpsPaused" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "alertEmailsEnabled" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "alertEmailKinds" jsonb;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "replyOverdueEnabled" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "replyOverdueHours" integer DEFAULT 2;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "followUpSequences" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_sequence_sends" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "leadId" integer NOT NULL,
  "sequenceKey" varchar(40) NOT NULL,
  "step" integer DEFAULT 1 NOT NULL,
  "refId" integer DEFAULT 0 NOT NULL,
  "toEmail" varchar(320),
  "subject" varchar(255),
  "sentAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_sequence_sends_uq" ON "lead_sequence_sends" ("leadId","sequenceKey","step","refId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_sequence_sends_owner_idx" ON "lead_sequence_sends" ("ownerId","sentAt");
--> statement-breakpoint
-- Backfill: the first time staff visibly responded — an email sent from the
-- app, a proposal sent, or a status change away from "new".
UPDATE "leads" l SET "firstResponseAt" = sub.t FROM (
  SELECT a."leadId", MIN(a."createdAt") AS t
  FROM "lead_activity" a
  WHERE (a."type" = 'email' AND a."content" LIKE 'Email sent to%')
     OR a."type" = 'proposal_sent'
     OR (a."type" = 'status_change' AND a."content" NOT LIKE '%changed to new%')
  GROUP BY a."leadId"
) sub
WHERE l."id" = sub."leadId" AND l."firstResponseAt" IS NULL AND sub.t >= l."createdAt";
--> statement-breakpoint
UPDATE "leads" l SET "lastStaffEmailAt" = sub.t FROM (
  SELECT a."leadId", MAX(a."createdAt") AS t
  FROM "lead_activity" a
  WHERE a."type" = 'email' AND a."content" LIKE 'Email sent to%'
  GROUP BY a."leadId"
) sub
WHERE l."id" = sub."leadId" AND l."lastStaffEmailAt" IS NULL;
