CREATE TABLE "setup_instructions" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text,
	"images" json DEFAULT '[]'::json,
	"category" varchar(100) DEFAULT 'general',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_setups" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) DEFAULT 'Table Setup' NOT NULL,
	"description" text,
	"canvas_data" json,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "floor_plans" ADD COLUMN "shareToken" varchar(100);