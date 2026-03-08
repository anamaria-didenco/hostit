/**
 * Template variable substitution for HOSTit email templates.
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
  message?: string | null;
}

export interface VenueVarData {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
}

function formatNZDate(raw: Date | string | number | null | undefined): string {
  if (!raw) return "";
  const d = new Date(raw as string | number | Date);
  if (isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-NZ", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatBudget(raw: string | number | null | undefined): string {
  if (!raw) return "";
  const n = Number(raw);
  if (isNaN(n)) return String(raw);
  return `$${n.toLocaleString("en-NZ")} NZD`;
}

/**
 * Replace all {{variable}} placeholders in `text` with values derived from
 * the provided lead and venue data.  Unknown variables are left unchanged so
 * the user can see what still needs to be filled in manually.
 */
export function substituteTemplateVars(
  text: string,
  lead: LeadVarData,
  venue?: VenueVarData
): string {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "";
  const venueAddress = [venue?.address, venue?.city].filter(Boolean).join(", ") || "";

  const vars: Record<string, string> = {
    contactName: fullName,
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    company: lead.company ?? "",
    eventType: lead.eventType ?? "",
    eventDate: formatNZDate(lead.eventDate),
    eventEndDate: formatNZDate(lead.eventEndDate),
    guestCount: lead.guestCount != null ? String(lead.guestCount) : "",
    budget: formatBudget(lead.budget),
    spaceName: "",          // spaceId only — resolved at call site if needed
    notes: lead.message ?? "",
    venueName: venue?.name ?? "",
    venuePhone: venue?.phone ?? "",
    venueEmail: venue?.email ?? "",
    venueAddress,
  };

  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    // Leave unknown variables as-is so the user notices them
    return match;
  });
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
];
