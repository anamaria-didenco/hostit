/**
 * The app's public address, for every link that leaves the app (proposal and
 * portal links in client emails, webhooks, staff links).
 *
 * Production runs on Render, which sets PUBLIC_BASE_URL. Never build links
 * from REPLIT_DEV_DOMAIN / REPLIT_DOMAINS: those aren't set on Render, which
 * produced dead links like `https:///proposal/<token>`.
 */
export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "https://venueflowhq.com").replace(/\/$/, "");
}
