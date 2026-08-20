-- Restricted staff logins: events + runsheets only.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isStaff" boolean DEFAULT false NOT NULL;
