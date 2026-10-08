ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapEnabled" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapHost" varchar(255);
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapPort" integer DEFAULT 993;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapSecure" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapUser" varchar(320);
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapPass" text;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapFolder" varchar(255) DEFAULT 'INBOX';
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapLastUid" bigint;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapUidValidity" bigint;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapLastCheckedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "imapLastError" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastInboundAt" timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "leadId" integer NOT NULL,
  "direction" varchar(3) NOT NULL,
  "fromEmail" varchar(320),
  "fromName" varchar(255),
  "toEmail" text,
  "subject" varchar(500),
  "bodyText" text,
  "fullText" text,
  "bodyHtml" text,
  "attachments" jsonb,
  "messageId" varchar(500) NOT NULL,
  "inReplyTo" varchar(500),
  "references" text,
  "receivedAt" timestamp DEFAULT now() NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_messages_owner_message_uq" ON "lead_messages" ("ownerId","messageId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_messages_owner_lead_received_idx" ON "lead_messages" ("ownerId","leadId","receivedAt");
