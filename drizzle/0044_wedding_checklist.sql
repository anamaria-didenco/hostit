CREATE TABLE "wedding_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"runsheetId" integer NOT NULL,
	"ownerId" integer NOT NULL,
	"shareToken" varchar(64) NOT NULL,
	"answers" json DEFAULT '{}'::json,
	"submittedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_checklists_shareToken_unique" UNIQUE("shareToken")
);
