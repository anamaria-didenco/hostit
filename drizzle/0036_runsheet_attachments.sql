-- Add attachments column to runsheets for PDF files (drinks menus, etc.)
-- Each attachment: { id, name, url, size, contentType, uploadedAt }
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "attachments" jsonb;
