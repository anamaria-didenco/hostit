ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workspaceOwnerId" integer REFERENCES "users"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "users_workspace_owner_idx" ON "users" ("workspaceOwnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique" ON "users" (lower("email")) WHERE "email" IS NOT NULL;
