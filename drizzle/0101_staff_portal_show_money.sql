-- Opt-in to showing money (payments received, F&B unit prices, how-it's-billed
-- steps) on the anonymous staff/shift portal links. Off by default so a shared
-- link never leaks payment figures; a venue turns it on to collect balances on
-- the night.
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "staffPortalShowMoney" integer DEFAULT 0;
