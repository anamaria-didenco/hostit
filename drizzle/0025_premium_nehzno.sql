CREATE TABLE "shift_runsheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"date" varchar(10),
	"duty_manager" text,
	"sections" jsonb,
	"specials" text,
	"budget" text,
	"special_notes" text,
	"market_fish" text,
	"things_to_push" text,
	"linked_checklist_ids" json,
	"token" varchar(64) NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "shift_runsheets_token_unique" UNIQUE("token")
);
