CREATE TABLE "daily_checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"checklist_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"text" text NOT NULL,
	"photo_url" text,
	"note" text,
	"sort_order" integer DEFAULT 0,
	"checked" integer DEFAULT 0,
	"checked_at" bigint,
	"checked_by" varchar(255),
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(50) DEFAULT 'general',
	"token" varchar(64) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "daily_checklists_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "emailSignature" text;