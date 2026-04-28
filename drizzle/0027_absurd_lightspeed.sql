CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(320),
	"role" varchar(50) DEFAULT 'staff' NOT NULL,
	"access_token" varchar(128) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" bigint NOT NULL,
	"last_accessed_at" bigint,
	CONSTRAINT "team_members_access_token_unique" UNIQUE("access_token")
);
