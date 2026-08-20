-- Repair two columns/tables the app queries but no migration ever created.
--
-- Both exist on the long-lived production database because they were applied
-- out-of-band (an early `drizzle-kit push`), so nothing looked wrong. But a
-- database built purely from these migration files — a new environment, a
-- restore from scratch, a second venue instance — did not have them, and:
--
--   * leads."spaceName" is in the SELECT list of leads.list, which the whole
--     dashboard depends on, so every authenticated page returned 500.
--   * api_tokens backs the MCP bearer-token check and Settings → API tokens.
--
-- IF NOT EXISTS throughout, so this is a no-op against production.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "spaceName" varchar(255);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"prefix" varchar(12) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"scopes" json DEFAULT '[]'::json,
	"last_used_at" bigint,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
