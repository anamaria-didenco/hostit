/**
 * The enquiry form's field definitions — one source of truth.
 *
 * LeadForm (the public form) and Dashboard (the form editor) each carried their
 * own copy of these defaults, and they had already drifted: the editor's copy
 * was missing the Preferred Time field entirely. Worse, a venue's SAVED config
 * replaced the defaults wholesale, so any field added after the venue first
 * saved its form — Company, for one — silently never appeared on the live form
 * and could not even be turned on in the editor.
 */

export type FormFieldDef = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'select' | 'textarea';
  required: boolean;
  visible: boolean;
  isDefault: boolean;
};

/** The event's service format — a qualifying answer, not free text. */
export const EVENT_FORMAT_OPTIONS = [
  { value: 'seated', label: 'Seated dinner' },
  { value: 'cocktail', label: 'Cocktail / standing' },
  { value: 'both', label: 'A bit of both' },
] as const;

/**
 * Budget as a BRACKET, not a number box. Serious budgets aren't scared of the
 * question and small ones self-select out — the bracket alone qualifies the
 * enquiry. The legacy free-number budget field is superseded by this and
 * hidden by default (still in the editor to re-enable).
 */
export const BUDGET_RANGE_OPTIONS = [
  { value: 'under_5k', label: 'Under $5k' },
  { value: '5_10k', label: '$5–10k' },
  { value: '10_20k', label: '$10–20k' },
  { value: '20k_plus', label: '$20k+' },
] as const;

export function eventFormatLabel(v: string | null | undefined): string | null {
  return EVENT_FORMAT_OPTIONS.find(o => o.value === v)?.label ?? null;
}
export function budgetRangeLabel(v: string | null | undefined): string | null {
  return BUDGET_RANGE_OPTIONS.find(o => o.value === v)?.label ?? null;
}

export const DEFAULT_FORM_FIELDS: FormFieldDef[] = [
  { id: 'firstName', label: 'First Name', type: 'text', required: true, visible: true, isDefault: true },
  { id: 'lastName', label: 'Last Name', type: 'text', required: false, visible: true, isDefault: true },
  { id: 'email', label: 'Email', type: 'email', required: true, visible: true, isDefault: true },
  { id: 'phone', label: 'Phone', type: 'tel', required: false, visible: true, isDefault: true },
  { id: 'company', label: 'Company / Organisation', type: 'text', required: false, visible: true, isDefault: true },
  { id: 'eventType', label: 'Type of Event', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'eventDate', label: 'Preferred Date', type: 'date', required: false, visible: true, isDefault: true },
  { id: 'eventTime', label: 'Preferred Time', type: 'time', required: false, visible: true, isDefault: true },
  { id: 'guestCount', label: 'Guest Count', type: 'number', required: true, visible: true, isDefault: true },
  { id: 'eventFormat', label: 'Format', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'budgetRange', label: 'Budget range', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'budget', label: 'Approximate Budget (NZD)', type: 'number', required: false, visible: false, isDefault: true },
  { id: 'source', label: 'How did you hear about us?', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'message', label: 'Message / Tell us more', type: 'textarea', required: false, visible: true, isDefault: true },
];

/**
 * A venue's stored config, brought up to date.
 *
 * The stored fields keep their order and settings; any default field the
 * config predates is appended with its default settings. A field the venue
 * deliberately hid stays hidden — it is PRESENT in the config with
 * visible:false, which is different from absent.
 *
 * Guest count is the one exception to "the stored config wins": an enquiry
 * without numbers can't be quoted or checked against capacity, so it is always
 * on the form and always required.
 */
export function mergeFormFields(stored: unknown): FormFieldDef[] {
  const base: FormFieldDef[] =
    Array.isArray(stored) && stored.length > 0
      ? (stored as FormFieldDef[]).map(f => ({ ...f }))
      : DEFAULT_FORM_FIELDS.map(f => ({ ...f }));
  const have = new Set(base.map(f => f.id));
  for (const d of DEFAULT_FORM_FIELDS) {
    if (!have.has(d.id)) base.push({ ...d });
  }
  // A config that predates the budget BRACKET keeps its old numeric budget
  // visible; the bracket supersedes it, so hide the number box on upgrade.
  // A venue that deliberately re-enables it afterwards is respected (the
  // config then contains budgetRange, and this branch never runs again).
  if (!have.has('budgetRange')) {
    const legacy = base.find(f => f.id === 'budget');
    if (legacy) legacy.visible = false;
  }
  const guests = base.find(f => f.id === 'guestCount');
  if (guests) { guests.visible = true; guests.required = true; }
  return base;
}
