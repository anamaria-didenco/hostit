CREATE TABLE "furniture_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) DEFAULT 'rect_table' NOT NULL,
	"color" varchar(20) DEFAULT '#d4a574' NOT NULL,
	"width" integer DEFAULT 80 NOT NULL,
	"height" integer DEFAULT 80 NOT NULL,
	"seats" integer,
	"quantity" integer,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
