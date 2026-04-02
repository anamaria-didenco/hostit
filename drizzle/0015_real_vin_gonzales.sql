CREATE TABLE "waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"venue_name" varchar(255),
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
