ALTER TABLE "bookings" ADD COLUMN "actualSpend" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "actualSpendNotes" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "actualSpendRecordedAt" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "spendPromptDismissedAt" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "beoShareToken" varchar(64);--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN "nbiSectionId" varchar(100);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_beoShareToken_unique" UNIQUE("beoShareToken");