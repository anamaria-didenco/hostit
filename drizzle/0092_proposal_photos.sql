-- Photos on a proposal (the room, the table, the food). Stored in the
-- database: the server's disk is wiped on every deploy, so files saved there
-- would vanish. Images are resized in the browser before upload.
CREATE TABLE IF NOT EXISTS "proposal_photos" (
  "id" serial PRIMARY KEY NOT NULL,
  "ownerId" integer NOT NULL,
  "proposalId" integer NOT NULL,
  "contentType" varchar(50) NOT NULL,
  "data" text NOT NULL,
  "caption" varchar(255),
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_photos_proposal_idx" ON "proposal_photos" ("proposalId");
