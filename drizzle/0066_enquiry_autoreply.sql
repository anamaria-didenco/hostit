ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "enquiryAutoReplyEnabled" integer DEFAULT 1;
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "enquiryAutoReplyMessage" text;
