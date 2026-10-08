/**
 * Template variable substitution for VenueFlowHQ email templates.
 *
 * Supported variables:
 *   {{contactName}}   – Full name (firstName + lastName)
 *   {{firstName}}     – First name only
 *   {{lastName}}      – Last name only
 *   {{email}}         – Contact email address
 *   {{phone}}         – Contact phone number
 *   {{company}}       – Company / organisation name
 *   {{eventType}}     – Type of event (e.g. "Birthday", "Corporate Dinner")
 *   {{eventDate}}     – Event date formatted for NZ locale (e.g. "Saturday, 14 June 2025")
 *   {{eventEndDate}}  – Event end date formatted for NZ locale
 *   {{guestCount}}    – Number of guests
 *   {{budget}}        – Budget in NZD (e.g. "$5,000 NZD")
 *   {{spaceName}}     – Preferred space / room name
 *   {{notes}}         – Client's message / notes
 *   {{venueName}}     – Venue name from settings
 *   {{venuePhone}}    – Venue phone number from settings
 *   {{venueEmail}}    – Venue email address from settings
 *   {{venueAddress}}  – Venue address from settings
 *   {{proposalLink}}  – Link to the lead's latest proposal (blank if none)
 *   {{portalLink}}    – Link to the client's portal (blank if none)
 *   {{enquiryFormLink}} – The venue's public enquiry form
 *   {{depositAmount}} – Deposit due, e.g. "$1,250.00" (blank if none)
 *   {{holdUntil}}     – Date the venue is holding the date until (blank if none)
 *
 * The link values only exist on the server (they need the public base URL and
 * a lookup), so the client gets them from `leads.getTemplateLinks` and passes
 * them in as `links`.
 */

export interface LeadVarData {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  eventType?: string | null;
  eventDate?: Date | string | number | null;
  eventEndDate?: Date | string | number | null;
  guestCount?: number | null;
  budget?: string | number | null;
  spaceId?: number | null;
  spaceName?: string | null;
  message?: string | null;
  // Added by another feature; read defensively.
  holdUntil?: Date | string | number | null;
}

export interface VenueVarData {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
}

/** Values that need a server lookup — see `leads.getTemplateLinks`. */
export interface TemplateLinkVars {
  proposalLink?: string | null;
  portalLink?: string | null;
  enquiryFormLink?: string | null;
  depositAmount?: string | null;
  /** Format dates in this zone (the server runs UTC). Default: the browser's. */
  timeZone?: string;
}

function formatNZDate(raw: Date | string | number | null | undefined, timeZone?: string): string {
  if (!raw) return "";
  const d = new Date(raw as string | number | Date);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-NZ", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

function formatBudget(raw: string | number | null | undefined): string {
  if (!raw) return "";
  const n = Number(raw);
  if (isNaN(n)) return String(raw);
  // Bounded on purpose: a bare toLocaleString defaults to up to 3 decimals,
  // so a budget of 5000.005 printed as "$5,000.005".
  return `$${Math.round(n).toLocaleString("en-NZ")} NZD`;
}

/** Every known variable's value for this lead (unknown keys are absent). */
export function templateVarValues(
  lead: LeadVarData,
  venue?: VenueVarData,
  links?: TemplateLinkVars
): Record<string, string> {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "";
  const venueAddress = [venue?.address, venue?.city].filter(Boolean).join(", ") || "";
  const tz = links?.timeZone;

  return {
    contactName: fullName,
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    company: lead.company ?? "",
    eventType: lead.eventType ?? "",
    eventDate: formatNZDate(lead.eventDate, tz),
    eventEndDate: formatNZDate(lead.eventEndDate, tz),
    guestCount: lead.guestCount != null ? String(lead.guestCount) : "",
    budget: formatBudget(lead.budget),
    spaceName: lead.spaceName ?? "",
    notes: lead.message ?? "",
    venueName: venue?.name ?? "",
    venuePhone: venue?.phone ?? "",
    venueEmail: venue?.email ?? "",
    venueAddress,
    proposalLink: links?.proposalLink ?? "",
    portalLink: links?.portalLink ?? "",
    enquiryFormLink: links?.enquiryFormLink ?? "",
    depositAmount: links?.depositAmount ?? "",
    holdUntil: formatNZDate(lead.holdUntil, tz),
  };
}

/**
 * Replace all {{variable}} placeholders in `text` with values derived from
 * the provided lead and venue data.  Unknown variables are left unchanged so
 * the user can see what still needs to be filled in manually.
 */
export function substituteTemplateVars(
  text: string,
  lead: LeadVarData,
  venue?: VenueVarData,
  links?: TemplateLinkVars
): string {
  const vars = templateVarValues(lead, venue, links);
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    // Leave unknown variables as-is so the user notices them
    return match;
  });
}

/**
 * Known variables used in `text` that came out empty for this lead (e.g. a
 * {{proposalLink}} when no proposal exists yet), so the sender can fix the
 * wording before it goes out.
 */
export function blankTemplateVars(
  text: string,
  lead: LeadVarData,
  venue?: VenueVarData,
  links?: TemplateLinkVars
): string[] {
  const vars = templateVarValues(lead, venue, links);
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(/\{\{(\w+)\}\}/g))) {
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(vars, key) && !vars[key] && !out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/** All supported variable tokens with human-readable descriptions. */
export const TEMPLATE_VARIABLES: { token: string; label: string; example: string }[] = [
  { token: "{{contactName}}",  label: "Full name",         example: "Jane Smith" },
  { token: "{{firstName}}",    label: "First name",        example: "Jane" },
  { token: "{{lastName}}",     label: "Last name",         example: "Smith" },
  { token: "{{email}}",        label: "Email address",     example: "jane@example.com" },
  { token: "{{phone}}",        label: "Phone number",      example: "+64 21 123 456" },
  { token: "{{company}}",      label: "Company",           example: "Acme Ltd" },
  { token: "{{eventType}}",    label: "Event type",        example: "Birthday Party" },
  { token: "{{eventDate}}",    label: "Event date",        example: "Saturday, 14 June 2025" },
  { token: "{{guestCount}}",   label: "Guest count",       example: "80" },
  { token: "{{budget}}",       label: "Budget",            example: "$5,000 NZD" },
  { token: "{{spaceName}}",    label: "Space / room",      example: "The Garden Room" },
  { token: "{{notes}}",        label: "Client notes",      example: "Dietary requirements…" },
  { token: "{{venueName}}",    label: "Venue name",        example: "The Grand Hall" },
  { token: "{{venuePhone}}",   label: "Venue phone",       example: "+64 9 123 4567" },
  { token: "{{venueEmail}}",   label: "Venue email",       example: "events@venue.co.nz" },
  { token: "{{venueAddress}}", label: "Venue address",     example: "12 Queen St, Auckland" },
  { token: "{{proposalLink}}", label: "Proposal link",     example: "https://venueflowhq.com/proposal/…" },
  { token: "{{portalLink}}",   label: "Client portal link", example: "https://venueflowhq.com/portal/…" },
  { token: "{{enquiryFormLink}}", label: "Enquiry form link", example: "https://venueflowhq.com/enquire/…" },
  { token: "{{depositAmount}}", label: "Deposit amount",   example: "$1,250.00" },
  { token: "{{holdUntil}}",    label: "Date held until",   example: "Friday, 20 June 2025" },
];
