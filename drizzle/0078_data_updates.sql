-- One row per one-off data update applied to a venue (e.g. Bar Franco's
-- Event menus 2026 catalogue refresh). The boot job claims the row in the
-- same transaction as the update, so it runs exactly once and never fights
-- the edits the venue makes in Settings afterwards.
CREATE TABLE IF NOT EXISTS "data_updates" (
  "id" serial PRIMARY KEY,
  "ownerId" integer NOT NULL,
  "key" varchar(100) NOT NULL,
  "summary" json,
  "appliedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_updates_owner_key_idx" ON "data_updates" ("ownerId", "key");
