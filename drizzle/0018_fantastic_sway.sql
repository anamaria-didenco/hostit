ALTER TABLE "bookings" ADD COLUMN "nbiBookingId" varchar(100);--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "nbiApiKey" text;--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "nbiVenueId" varchar(100);--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "nbiSyncEnabled" integer DEFAULT 0;