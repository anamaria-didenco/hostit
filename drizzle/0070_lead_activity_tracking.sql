ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lastActivityAt" timestamp DEFAULT now();
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "respondedAt" timestamp;
--> statement-breakpoint
UPDATE "leads" l SET "lastActivityAt" = GREATEST(
  l."createdAt",
  COALESCE((SELECT max(a."createdAt") FROM "lead_activity" a WHERE a."leadId" = l."id" AND a."ownerId" = l."ownerId"), l."createdAt")
);
--> statement-breakpoint
UPDATE "leads" l SET "respondedAt" = sub."firstReply"
FROM (
  SELECT a."leadId", a."ownerId", min(a."createdAt") AS "firstReply"
  FROM "lead_activity" a
  WHERE a."type" IN ('email', 'call', 'status_change', 'proposal_sent', 'booking_created')
  GROUP BY a."leadId", a."ownerId"
) sub
WHERE l."id" = sub."leadId" AND l."ownerId" = sub."ownerId" AND l."respondedAt" IS NULL;
--> statement-breakpoint
UPDATE "leads" SET "respondedAt" = "createdAt" WHERE "respondedAt" IS NULL AND "status" <> 'new';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automated_task_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "ruleKey" varchar(160) NOT NULL,
  "subjectKey" varchar(60) NOT NULL,
  "taskId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "automated_task_runs_uq" ON "automated_task_runs" ("ownerId","ruleKey","subjectKey");
