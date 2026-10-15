// The success toast for an inline edit, named after what was actually changed.
// A single field says so ("Date saved", "Guests saved"); a save that touched
// several returns null so the caller can use its own generic wording.

const FIELD_LABELS: Record<string, string> = {
  eventDate: "Date",
  eventEndDate: "End time",
  guestCount: "Guests",
  spaceName: "Space",
  minimumSpend: "Minimum spend",
  totalNzd: "Total",
  depositNzd: "Deposit",
  notes: "Notes",
  email: "Email",
  phone: "Phone",
  company: "Company",
  eventType: "Event type",
  budget: "Budget",
};

// Keys that ride along with an edit without being the thing edited.
const IGNORED_KEYS = new Set(["id", "allowClash"]);

export function savedToastLabel(vars: Record<string, unknown> | null | undefined): string | null {
  const keys = Object.keys(vars ?? {}).filter(k => !IGNORED_KEYS.has(k) && (vars as any)[k] !== undefined);
  if (keys.length === 0) return null;
  // A start time and an end time change together as "date and time".
  if (keys.length === 2 && keys.includes("eventDate") && keys.includes("eventEndDate")) return "Date saved";
  if (keys.length !== 1) return null;
  const label = FIELD_LABELS[keys[0]];
  return label ? `${label} saved` : null;
}
