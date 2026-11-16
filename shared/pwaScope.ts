/**
 * Pages a venue's CLIENTS and token-link staff see — proposals, the client portal, the enquiry form,
 * shared floor plans, runsheet/checklist links. They are not the staff app, so the browser must not
 * offer to "install" VenueFlow from them (the installed app opens the staff dashboard, i.e. a login
 * wall for someone who just wanted to look at a proposal).
 */
const PUBLIC_PREFIXES = [
  "/enquire",
  "/proposal/",
  "/portal/",
  "/staff/",
  "/staff-checklist/",
  "/daily/",
  "/shift/",
  "/wedding-checklist/",
  "/floor-plan/share/",
  "/embed-docs",
  "/book",
];

export function isPublicClientPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_PREFIXES.some(prefix => (prefix.endsWith("/") ? p.startsWith(prefix) : p === prefix || p.startsWith(prefix + "/")));
}
