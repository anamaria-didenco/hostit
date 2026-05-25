-- Capture per-item food/beverage pricing on the F&B sheet so the runsheet
-- running totals reflect what was actually selected.
ALTER TABLE "fnb_items" ADD COLUMN IF NOT EXISTS "unitPrice" numeric(10, 2);

-- Single free-text "how to pay" message shown under running totals on the
-- runsheet, live shift link, and BEO PDF.
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "paymentInstructions" text;
