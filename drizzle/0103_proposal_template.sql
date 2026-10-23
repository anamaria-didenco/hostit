-- Per-venue custom HTML proposal template (Settings → Brand Pack). When
-- enabled, the client proposal page and the PDF render this branded HTML with
-- {{token}}/{{block}} substitution instead of the built-in layout. Null/off =
-- the built-in layout (the previous behaviour).
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "proposalTemplateHtml" text;--> statement-breakpoint
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "proposalTemplateEnabled" integer DEFAULT 0;
