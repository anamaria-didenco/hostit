CREATE TABLE "staff_portal_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"runsheet_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"label" varchar(255),
	"expires_at" bigint,
	"last_accessed_at" bigint,
	"created_at" bigint NOT NULL,
	CONSTRAINT "staff_portal_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "runsheets" ADD COLUMN "floorPlanId" integer;