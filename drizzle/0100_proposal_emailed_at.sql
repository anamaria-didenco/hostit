-- When a proposal was actually emailed to the client. Null means it was
-- marked "sent" (its link is live and shareable) but no email was delivered:
-- SMTP wasn't configured, the lead had no email, or the send failed. Lets the
-- UI tell "Emailed" apart from "Link ready — not emailed", so "Sent" never
-- quietly implies the client received it.
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "emailedAt" timestamp;
