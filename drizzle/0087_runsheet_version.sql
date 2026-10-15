-- Edit-conflict protection for the run sheet builder. Every save of the sheet
-- bumps "version"; a save based on an older version from a different editor
-- (another person, another tab) is refused so it can't overwrite their work.
-- "lastEditorId" is the random id of the open builder that saved last, so one
-- builder's own overlapping autosaves never count as a conflict.
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "lastEditorId" varchar(64);
