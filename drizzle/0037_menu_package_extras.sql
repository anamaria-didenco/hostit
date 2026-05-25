-- Add optional custom-price label, chef notes, and staff PDF to menu packages.
ALTER TABLE "menu_packages" ADD COLUMN IF NOT EXISTS "customPriceLabel" varchar(120);
ALTER TABLE "menu_packages" ADD COLUMN IF NOT EXISTS "chefNotes" text;
ALTER TABLE "menu_packages" ADD COLUMN IF NOT EXISTS "pdfUrl" varchar(500);
ALTER TABLE "menu_packages" ADD COLUMN IF NOT EXISTS "pdfName" varchar(255);
