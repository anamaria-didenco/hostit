-- Follow-up dates become tasks. A task created from an enquiry's follow-up
-- date carries source = 'follow_up', so the date and the task stay in step
-- (server/followUpTask.ts) and can be told apart from hand-made tasks.
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source" varchar(30);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_source_lead_idx" ON "tasks" ("linked_lead_id") WHERE "source" IS NOT NULL;
--> statement-breakpoint
-- Backfill: enquiries that already have a future follow-up date get their one
-- open follow-up task (not lost/cancelled; skipped where the lead already has
-- an open follow-up task of either kind). Owned by the lead's account and
-- assigned to the lead's owner when one is set.
INSERT INTO "tasks" ("owner_id", "title", "description", "due_date", "completed", "linked_lead_id", "assigned_to", "priority", "source", "created_at", "updated_at")
SELECT
  l."ownerId",
  left('Follow up with ' || coalesce(nullif(btrim(concat_ws(' ', l."firstName", l."lastName")), ''), 'client'), 255),
  NULL,
  (extract(epoch from l."followUpDate") * 1000)::bigint,
  false,
  l."id",
  (SELECT tm."name" FROM "team_members" tm WHERE tm."id" = l."assignedTo" AND tm."owner_id" = l."ownerId"),
  'normal',
  'follow_up',
  (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint
FROM "leads" l
WHERE l."followUpDate" IS NOT NULL
  AND l."followUpDate" > (now() AT TIME ZONE 'utc')
  AND coalesce(l."status", '') NOT IN ('lost', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM "tasks" t
    WHERE t."linked_lead_id" = l."id" AND t."owner_id" = l."ownerId" AND t."completed" = false
      AND (t."source" = 'follow_up' OR t."title" LIKE 'Follow up with %')
  );
