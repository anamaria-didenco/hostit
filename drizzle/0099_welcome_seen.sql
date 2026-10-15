-- When the one-screen welcome intro was dismissed, per account (NULL = a
-- brand-new self-serve signup that hasn't seen it yet).
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "welcomeSeenAt" timestamp;
