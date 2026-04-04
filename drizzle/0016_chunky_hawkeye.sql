ALTER TABLE "venue_settings" ADD COLUMN "formPageBg" varchar(20) DEFAULT '#f8f5f0';--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "formPageBgImage" text;--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "formCardBg" varchar(20) DEFAULT '#ffffff';--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "formButtonColor" varchar(20);--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "formSuccessMessage" text;