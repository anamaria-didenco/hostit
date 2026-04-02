ALTER TABLE "runsheet_items" ALTER COLUMN "duration" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "runsheet_items" ADD COLUMN "bold" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "runsheet_items" ADD COLUMN "italic" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "runsheet_items" ADD COLUMN "highlight" varchar(50);