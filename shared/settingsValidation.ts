/**
 * Checks for the settings an owner types in, run before saving so a typo is
 * caught at the field instead of being saved with "Settings saved!" (an empty
 * venue name left the public enquiry page with no heading; a mistyped mail
 * server only failed later, with a raw error, when an email was sent).
 *
 * Each returns the message to show at the field, or null when the value is fine.
 * Blank optional fields are fine.
 */

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
// A host name (letters, digits, dashes, dot-separated) or an IPv4 address.
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function isEmailAddress(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function venueNameError(name: string | null | undefined): string | null {
  return (name ?? "").trim() ? null : "Enter your venue's name. It is the heading of your enquiry form.";
}

/** A web address, with or without https:// in front ("yourvenue.co.nz" is fine). */
export function websiteError(website: string | null | undefined): string | null {
  const v = (website ?? "").trim();
  if (!v) return null;
  const msg = "Enter a web address like https://yourvenue.co.nz";
  if (/\s/.test(v)) return msg;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return msg;
    if (!HOST_RE.test(url.hostname) || !url.hostname.includes(".")) return msg;
    return null;
  } catch {
    return msg;
  }
}

/** One or more email addresses separated by commas (semicolons also work, as when sending). */
export function emailListError(list: string | null | undefined): string | null {
  const parts = (list ?? "").split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  const bad = parts.find(p => !isEmailAddress(p));
  return bad ? `"${bad}" isn't an email address. Separate addresses with commas.` : null;
}

export function emailError(email: string | null | undefined): string | null {
  const v = (email ?? "").trim();
  if (!v) return null;
  return isEmailAddress(v) ? null : "Enter an email address like you@yourvenue.co.nz";
}

export function smtpHostError(host: string | null | undefined): string | null {
  const v = (host ?? "").trim();
  if (!v) return null;
  return HOST_RE.test(v) ? null : "Enter the mail server's name, like smtp.gmail.com (letters, numbers, dots and dashes only).";
}

export function smtpPortError(port: string | number | null | undefined): string | null {
  const v = String(port ?? "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? null : "Enter a port number from 1 to 65535 (usually 587, or 465 for SSL).";
}

/** Settings > Venue > Basic details. Keys are the field ids on that form. */
export function venueDetailsErrors(form: { name?: string | null; website?: string | null; notificationEmail?: string | null }): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = venueNameError(form.name);
  if (name) errors["vs-venue-name"] = name;
  const website = websiteError(form.website);
  if (website) errors["vs-website"] = website;
  const notify = emailListError(form.notificationEmail);
  if (notify) errors["vs-notification-email"] = notify;
  return errors;
}

/** Settings > Email > SMTP. Keys are the input names on that form. */
export function smtpSettingsErrors(form: { smtpHost?: string | null; smtpPort?: string | number | null; smtpUser?: string | null; smtpFromEmail?: string | null }): Record<string, string> {
  const errors: Record<string, string> = {};
  const host = smtpHostError(form.smtpHost);
  if (host) errors.smtpHost = host;
  const port = smtpPortError(form.smtpPort);
  if (port) errors.smtpPort = port;
  const from = emailError(form.smtpFromEmail);
  if (from) errors.smtpFromEmail = from;
  return errors;
}

/**
 * The same checks on what venue.update receives (keys are its input names), so a
 * save from anywhere else (the Profile & Branding save also sends the Basic
 * Details fields, and the API) can't store them either. Only fields that are
 * sent are checked.
 */
export function venueUpdateErrors(input: { name?: string; website?: string; notificationEmail?: string; smtpHost?: string; smtpPort?: number; smtpFromEmail?: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  const checks: [keyof typeof input, (v: any) => string | null][] = [
    ["name", venueNameError], ["website", websiteError], ["notificationEmail", emailListError],
    ["smtpHost", smtpHostError], ["smtpPort", smtpPortError], ["smtpFromEmail", emailError],
  ];
  for (const [key, check] of checks) {
    if (input[key] === undefined) continue;
    const message = check(input[key]);
    if (message) errors[key] = message;
  }
  return errors;
}

/** A percentage the owner types (GST, deposit): 0 to 100. */
export function percentError(value: number, what: string): string | null {
  return Number.isFinite(value) && value >= 0 && value <= 100 ? null : `${what} must be between 0 and 100%.`;
}
