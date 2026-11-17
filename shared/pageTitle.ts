// Browser-tab titles. Every screen gets its own, so screen-reader users hear
// where they are, and a client with the proposal and the portal open in two
// tabs (or a venue owner with an event, its run sheet and the dashboard) can
// tell them apart. Pure so the route table can be tested from server/.

/** The name staff screens end with. Client-facing screens end with the venue instead. */
export const APP_NAME = "VenueFlow";

type Part = string | null | undefined | false;

/** Whether `part` already appears in `text` as whole words, ignoring case. */
function saysAlready(text: string, part: string): boolean {
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

/**
 * Join the parts of a title with " · ", dropping empty parts and any part an
 * earlier one already says, and end with `suffix` (pass null for no suffix).
 *   pageTitle(["Run sheet", "Grace Holloway"])                  → "Run sheet · Grace Holloway · VenueFlow"
 *   pageTitle(["Proposal", "Corporate", "The Harbour Room"], null) → "Proposal · Corporate · The Harbour Room"
 *   pageTitle(["Proposal", "Birthday at The Harbour Room", "The Harbour Room"], null)
 *                                                                → "Proposal · Birthday at The Harbour Room"
 */
export function pageTitle(parts: Part[], suffix: string | null = APP_NAME): string {
  const out: string[] = [];
  for (const p of [...parts, suffix]) {
    if (typeof p !== "string") continue;
    const s = p.replace(/\s+/g, " ").trim();
    if (s && !out.some(o => saysAlready(o, s))) out.push(s);
  }
  return out.join(" · ");
}

// The title each route shows until (or unless) its page sets a more specific
// one from its data, e.g. "Event" becomes "Event · Grace Holloway · VenueFlow".
// `client` routes are opened by the venue's clients and staff on the day, so
// they don't carry the app's name.
const ROUTES: Array<{ re: RegExp; label: string; client?: boolean }> = [
  { re: /^\/embed-docs\/?$/, label: "Embed the enquiry form" },
  { re: /^\/login\/?$/, label: "Sign in" },
  { re: /^\/signup\/?$/, label: "Create your account" },
  { re: /^\/welcome\/?$/, label: "Welcome" },
  { re: /^\/enquire(\/[^/]+)?\/?$/, label: "Enquire", client: true },
  { re: /^\/proposal\/[^/]+\/?$/, label: "Proposal", client: true },
  { re: /^\/dashboard\/?$/, label: "Dashboard" },
  { re: /^\/proposals\/new\/?$/, label: "Proposal builder" },
  { re: /^\/floor-plan\/share\/[^/]+\/?$/, label: "Floor plan", client: true },
  { re: /^\/floor-plan\/?$/, label: "Floor plan" },
  { re: /^\/checklist\/?$/, label: "Event checklist" },
  { re: /^\/runsheet\/?$/, label: "Run sheet" },
  { re: /^\/payments\/?$/, label: "Payments" },
  { re: /^\/event\/[^/]+\/?$/, label: "Event" },
  { re: /^\/portal\/[^/]+\/?$/, label: "Your event", client: true },
  { re: /^\/staff\/[^/]+\/?$/, label: "Staff portal", client: true },
  { re: /^\/staff-checklist\/[^/]+\/?$/, label: "Staff checklist", client: true },
  { re: /^\/daily-checklists\/?$/, label: "Daily checklists" },
  { re: /^\/daily\/[^/]+\/?$/, label: "Daily checklist", client: true },
  { re: /^\/shift\/[^/]+\/?$/, label: "Shift run sheet", client: true },
  { re: /^\/staff-links\/?$/, label: "Staff links" },
  { re: /^\/wedding-checklist\/[^/]+\/?$/, label: "Wedding checklist", client: true },
];

/**
 * The default title for a path, or null for the landing page, which keeps the
 * marketing title from index.html. Unknown paths are the 404 page.
 */
export function routeTitle(pathname: string): string | null {
  const path = (pathname || "/").split(/[?#]/)[0];
  if (path === "/" || path === "") return null;
  const hit = ROUTES.find(r => r.re.test(path));
  if (!hit) return pageTitle(["Page not found"]);
  return pageTitle([hit.label], hit.client ? null : APP_NAME);
}
