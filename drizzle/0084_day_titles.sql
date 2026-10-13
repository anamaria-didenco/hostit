-- A title for a calendar day ("Robbie Williams concert day"), one per venue per date.
CREATE TABLE IF NOT EXISTS "day_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "date" varchar(10) NOT NULL,
  "title" varchar(120) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "day_notes_owner_date_idx" ON "day_notes" ("ownerId", "date");
