// Activity lines are stored as plain text written by the server, e.g.
// "Status changed to proposal_sent" or "Status changed to lost — Too pricey".
// The raw key is fine as data but shouldn't reach the screen: show the same
// status name the venue sees everywhere else ("Proposal Sent", "Confirmed").

export type StatusName = { key: string; label: string };

// Keys that were renamed over time and still sit in old activity rows.
const ALIASES: Record<string, string> = { confirmed: "booked", booked: "confirmed" };

export function statusNameFor(key: string, statuses: readonly StatusName[]): string {
  const k = key.toLowerCase().trim();
  const hit = statuses.find(s => s.key === k) ?? statuses.find(s => s.key === ALIASES[k]);
  if (hit) return hit.label;
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// "Status changed to proposal_sent", "Bulk status update: changed to lost — …"
const STATUS_CHANGE = /(\bchanged to )([a-z][a-z0-9_]*)/i;

export function humanizeActivity(content: string, statuses: readonly StatusName[]): string {
  if (!content) return content;
  return content.replace(STATUS_CHANGE, (_m, lead: string, key: string) => `${lead}${statusNameFor(key, statuses)}`);
}
