export const ENV = {
  appId: process.env.VITE_APP_ID ?? "hostit-local",
  cookieSecret: (() => {
    const s = process.env.JWT_SECRET ?? process.env.SESSION_SECRET;
    if (s && s.length >= 16) return s;
    if (process.env.NODE_ENV === "production") {
      // Fail loud in production — a hardcoded fallback would let anyone forge sessions.
      throw new Error(
        "[ENV] JWT_SECRET (or SESSION_SECRET) must be set to a value of at least 16 characters in production."
      );
    }
    return "hostit-dev-secret-please-set-JWT_SECRET-in-prod";
  })(),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "local-admin",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
};
