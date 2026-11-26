import { useState, useEffect, useId, useRef } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CheckCircle, MapPin, Phone, Mail, Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { halfHourSlots, initialSlotIndex, matchSlot, moveSlot } from "@shared/timeSlots";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { clearsChoice, onArrowChoose, rovingTabIndex } from "@/lib/rovingKeys";
import { scrollBehavior } from "@/lib/scrollBehavior";
import { canReuseLead, enquiryStorageKeys, holdsSentConfirmation, leadForSubmit, leadToSupersede, normaliseEmail, formPageKey, parseProgress, pickFormToken, pickTokenToSend, resumeFrom, sentConfirmation, serializeProgress, tokenWaitMs, type EnquiryProgress, type HeldLead } from "@/lib/enquiryProgress";
import { NO_DATE_KEY, applyPrefill, draftHasOwnAnswers, normalisePrefill, prefillFromUrl, rememberPrefill, vfPrefillFrom } from "@/lib/enquiryPrefill";
import { autoReplyNote, autoReplyState, buildEnquiryMessage, eventDateForWire, guestCountError, guestCountNote, guestCountToConfirm, guestCountValue, type AutoReplyState } from "@/lib/enquiryFields";
import { describeEnquiryError } from "@/lib/enquiryErrors";
import { isEnquiryTimeout } from "@/lib/requestTimeout";
import { clearNameDraft, frameTag, readNameDraft, writeNameDraft } from "@/lib/framedDraft";
import { createPartialPinger, type PingTarget } from "@/lib/partialPing";
import { ENQUIRY_LIMITS, STEP_ONE_FIELDS, isValidEnquiryEmail, tidyEnquiryEmail } from "@shared/enquiryRules";
import { isRealDateKey, isWallTime, wallDateKeyInTz } from "@shared/enquiryWallTime";
import { CLIENT_MIN_TOKEN_AGE_MS, PARTIAL_PING_EVERY_MS, SENT_CONFIRMATION_KEEP_MS, SUBMIT_WAITS_FOR_CAPTURE_MS } from "@shared/enquiryTiming";

const EVENT_TYPES = [
  "Wedding Reception", "Corporate Dinner", "Birthday Celebration",
  "Christmas Party", "Product Launch", "Team Event", "Cocktail Function",
  "Engagement Party", "Baby Shower", "Fundraiser", "Conference", "Other",
];

const SOURCE_OPTIONS = [
  "Instagram", "Facebook", "Google Search", "Website",
  "Word of Mouth / Referral", "Walk-In", "Event Directory", "Previous Client", "Other",
];

// Browser autofill hints for the contact fields — lets a phone's keyboard/
// autofill offer the right saved value instead of treating every field the
// same as generic free text.
const AUTOCOMPLETE: Record<string, string> = {
  firstName: "given-name",
  lastName: "family-name",
  email: "email",
  phone: "tel",
  company: "organization",
};

// The longest value each field can hold (the server's own limits), so a very
// long entry stops at the field instead of failing on send.
const MAX_LENGTH: Record<string, number> = {
  firstName: ENQUIRY_LIMITS.firstName,
  lastName: ENQUIRY_LIMITS.lastName,
  email: ENQUIRY_LIMITS.email,
  phone: ENQUIRY_LIMITS.phone,
  company: ENQUIRY_LIMITS.company,
};

import { DEFAULT_FORM_SUCCESS_MESSAGE, DEFAULT_LEAD_FORM_SUBTITLE } from "@shared/enquiryCopy";
import { DEFAULT_FORM_FIELDS, mergeFormFields, EVENT_FORMAT_OPTIONS, BUDGET_RANGE_OPTIONS, eventFormatLabel, budgetRangeLabel, type FormFieldDef } from "@shared/formFields";
import { isVenueSiteOrigin, originOf } from "@shared/adAttribution";
import { venueBrand } from "@shared/brand";
import { stepAnnouncement } from "@shared/focusReturn";

const FONT_MAP: Record<string, string> = {
  inter: "'Inter', system-ui, sans-serif",
  hanken: "'Hanken Grotesk', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  cormorant: "'Cormorant Garamond', Georgia, serif",
  dm: "'DM Serif Display', Georgia, serif",
};
// Display type for headings/section labels — the editorial pairing (serif
// display + a bold, wide-tracked grotesque for labels) that gives the form
// its identity, independent of whichever body font a venue has picked for
// its inputs and paragraph copy.
const HEADING_FONT = "'Spectral', Georgia, serif";

/* ── Per-event-type follow-up — one relevant question instead of a long
      fixed field list. Only event types where a natural follow-up exists
      get one; anything else (Product Launch, Conference, etc.) just skips
      straight to guests/date/budget. Answer is stored on the lead as
      `eventDetail`, separate from the free-text message. ────────────────── */
const EVENT_EXTRA: Record<string, { label: string; opts?: string[]; text?: boolean }> = {
  "Wedding Reception": { label: "Ceremony", opts: ["On site too", "Elsewhere"] },
  "Corporate Dinner": { label: "AV needs", opts: ["Screen & mic", "None"] },
  "Birthday Celebration": { label: "Format", opts: ["Seated dinner", "Standing & canapés"] },
  "Christmas Party": { label: "Format", opts: ["Seated dinner", "Standing & canapés"] },
  "Cocktail Function": { label: "Food", opts: ["Canapés", "Grazing table"] },
  "Other": { label: "What's the occasion?", text: true },
};
// These two follow-ups ask the venue's own Format question again (and could
// store "Standing & canapés" beside a seated format): only shown when the
// form doesn't ask Format itself.
const FORMAT_FOLLOW_UPS = new Set(["Birthday Celebration", "Christmas Party"]);
function eventExtraFor(eventType: string | undefined, formatAsked: boolean) {
  const extra = EVENT_EXTRA[eventType ?? ''];
  if (!extra || (formatAsked && FORMAT_FOLLOW_UPS.has(eventType ?? ''))) return null;
  return extra;
}
const MESSAGE_PLACEHOLDER: Record<string, string> = {
  "Wedding Reception": "Speeches, first dance, cake cutting, dietaries…",
  "Corporate Dinner": "Agenda, branding, invoicing details, dietaries…",
  "Christmas Party": "Secret Santa, arrival time, dietaries…",
  "Cocktail Function": "Arrival drinks, timing, dietaries…",
};

// NZ phone auto-format, applied on blur — never while the person is still
// typing, since reformatting mid-keystroke jumps the cursor.
function formatNZPhone(p: string): string {
  const d = (p || "").replace(/\D/g, "");
  if (d.length < 9) return p;
  if (d.startsWith("64") && d.length >= 10) { const r = d.slice(2); return `+64 ${r.slice(0, 2)} ${r.slice(2, 5)} ${r.slice(5)}`.trim(); }
  if (d.startsWith("0") && d.length <= 11) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`.trim();
  return p;
}

// Common domain typos — a one-tap "did you mean" fix, not a hard block.
const EMAIL_TYPOS: Record<string, string> = {
  "gmail.con": "gmail.com", "gmial.com": "gmail.com", "gmai.com": "gmail.com",
  "gnail.com": "gmail.com", "gmail.co": "gmail.com", "hotmail.con": "hotmail.com",
  "hotmial.com": "hotmail.com", "outlook.con": "outlook.com", "yahoo.con": "yahoo.com",
  "icloud.con": "icloud.com", "xtra.co.n": "xtra.co.nz",
};
function suggestEmailFix(email: string): string | null {
  const m = (email || "").trim().toLowerCase().match(/^([^@]+)@(.+)$/);
  if (!m) return null;
  const fix = EMAIL_TYPOS[m[2]];
  return fix ? `${m[1]}@${fix}` : null;
}

// Budget bracket ÷ guest count, shown live so people self-qualify rather
// than guessing whether their number is "too small to ask about".
function perGuestBudget(budgetRange: string, guests: number | null): string | null {
  const b = BUDGET_RANGE_OPTIONS.find(x => x.value === budgetRange);
  const n = guests ?? 0;
  if (!b || !(n >= 1)) return null;
  const f = (x: number) => "$" + Math.round(x / n).toLocaleString("en-NZ");
  return b.hi ? `≈ ${f(b.lo)}–${f(b.hi)} per guest` : `from ≈ ${f(b.lo)} per guest`;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function isLight(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// Prefill params (embed.js's data-event-type="christmas-party" etc.) are read
// in lib/enquiryPrefill.ts: matched loosely, and no match means no prefill.

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const NO_HELD: HeldLead = { leadId: null, leadToken: null, leadEmail: null, leadAt: null, fromThisPage: false };
const EMAIL_INVALID = "Enter a valid email address, like name@example.com.";
// The venue lookup is retried with backoff before the frame says it couldn't
// load, and keeps trying every 20 s after that.
const VENUE_RETRY = {
  retry: 3,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
  refetchInterval: (query: { state: { status: string } }) => (query.state.status === "error" ? 20_000 : false as const),
};

/* ── Custom date/time pickers ──────────────────────────────────────────
   Native <input type="date">/<input type="time"> only open their picker
   from the tiny calendar/clock glyph — clicking the rest of the bar just
   places a text cursor. Worse, showPicker() (which can open it from
   anywhere) throws a SecurityError when called from a cross-origin
   iframe — exactly the embed widget's real deployment, so that "fix"
   silently did nothing there. A real popover, built from our own click
   handler, works everywhere: full page and embedded alike. ──────────── */
function formatDateNZ(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Availability for the picker: which dates are fully booked (or, with a space
// chosen, that space is) and which are busy. Fetched per viewed month from
// leads.availability — dates and states only, never who booked.
type DayState = 'booked' | 'limited';
type AvailabilityOpts = { ownerId: number; spaceId?: number; enabled: boolean };
const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
function useMonthAvailability(opts: AvailabilityOpts | undefined, monthKey: string | null) {
  const { data } = trpc.leads.availability.useQuery(
    { ownerId: opts?.ownerId ?? 0, month: monthKey ?? '2000-01', spaceId: opts?.spaceId },
    { enabled: !!opts?.enabled && !!opts.ownerId && !!monthKey && /^\d{4}-\d{2}$/.test(monthKey), staleTime: 60_000, refetchOnWindowFocus: false },
  );
  return (iso: string): DayState | undefined =>
    !data?.enabled ? undefined : data.booked.includes(iso) ? 'booked' : data.limited.includes(iso) ? 'limited' : undefined;
}

function DatePickerField({ id, value, onChange, min, disabled, ariaInvalid, ariaDescribedby, inputClass, accentColor, accentTextColor, availability }: {
  id: string; value: string; onChange: (v: string) => void; min?: string; disabled?: boolean;
  ariaInvalid?: boolean; ariaDescribedby?: string; inputClass: string; accentColor: string; accentTextColor: string;
  availability?: AvailabilityOpts;
}) {
  const [open, setOpen] = useState(false);
  // A prefill param only has to look date-shaped (see prefillDate's regex) to
  // reach here — "2026-13-01" passes that check but parses to Invalid Date.
  // Guard it: an unguarded NaN year/month below turns into a negative or NaN
  // mondayOffset, and Array(NaN) throws, blanking the whole embed.
  const parsedRaw = value ? new Date(value + 'T00:00:00') : null;
  const parsed = parsedRaw && !isNaN(parsedRaw.getTime()) ? parsedRaw : null;
  const [viewDate, setViewDate] = useState<Date>(parsed ?? new Date());
  useEffect(() => { if (parsed) setViewDate(parsed); }, [value]);
  const gridRef = useRef<HTMLDivElement>(null);
  // Arrow keys can walk off the end of the month; focus lands once the next
  // month has rendered.
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const minDate = min ? new Date(min + 'T00:00:00') : null;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(mondayOffset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const stateOf = useMonthAvailability(availability, open ? monthKeyOf(viewDate) : null);
  const monthStates = cells.map(day => day == null ? undefined : stateOf(fmt(new Date(year, month, day))));
  const hasBooked = monthStates.includes('booked');
  const hasLimited = monthStates.includes('limited');

  const focusDate = (iso: string) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${iso}"]`);
    if (el && !el.disabled) { el.focus(); return true; }
    return false;
  };
  useEffect(() => {
    if (pendingFocus && focusDate(pendingFocus)) setPendingFocus(null);
  });
  const onDayKey = (e: React.KeyboardEvent, cellDate: Date) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in step)) return;
    e.preventDefault();
    const next = new Date(cellDate); next.setDate(cellDate.getDate() + step[e.key]);
    if (minDate && next < minDate) return;
    const iso = fmt(next);
    if (next.getMonth() !== month || next.getFullYear() !== year) {
      setViewDate(new Date(next.getFullYear(), next.getMonth(), 1));
      setPendingFocus(iso);
    } else focusDate(iso);
  };

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        {/* The visible label names the button, which hid the chosen date from
            screen readers: the value is its description instead. */}
        <button type="button" id={id} disabled={disabled}
          aria-haspopup="dialog" aria-invalid={ariaInvalid} aria-describedby={[`${id}-value`, ariaDescribedby].filter(Boolean).join(' ')}
          className={cn("h-9 w-full min-w-0 px-3 py-1", inputClass, "flex items-center justify-between text-left disabled:opacity-50 disabled:cursor-not-allowed")}>
          <span id={`${id}-value`} className={value ? '' : 'text-muted-foreground'}>{value ? formatDateNZ(value) : 'Select a date'}</span>
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3" aria-label="Choose a date"
        // Land on the chosen (or first open) day so arrow keys work at once.
        onOpenAutoFocus={e => {
          e.preventDefault();
          requestAnimationFrame(() => {
            const grid = gridRef.current;
            const target = grid?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
              ?? grid?.querySelector<HTMLButtonElement>('button[data-date]:not([disabled]):not([aria-disabled="true"])');
            target?.focus();
          });
        }}>
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month" className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold" aria-live="polite">{viewDate.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month" className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-gray-500 mb-1" aria-hidden="true">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div ref={gridRef} className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />;
            const cellDate = new Date(year, month, day);
            const isPast = minDate ? cellDate < minDate : false;
            const cellIso = fmt(cellDate);
            const isSelected = value === cellIso;
            const state = isPast ? undefined : monthStates[i];
            const booked = state === 'booked';
            const fullLabel = cellDate.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            return (
              <button key={i} type="button" disabled={isPast} data-date={cellIso}
                // Booked days stay focusable (aria-disabled, not disabled) so
                // keyboard and screen-reader users still hear why they're out.
                aria-disabled={booked || undefined}
                aria-pressed={isSelected}
                aria-label={`${fullLabel}${booked ? ', Booked' : state === 'limited' ? ', Limited availability' : ''}`}
                onClick={() => { if (booked) return; onChange(cellIso); setOpen(false); }}
                onKeyDown={e => onDayKey(e, cellDate)}
                className={cn(
                  'relative h-8 text-xs rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-1',
                  isPast ? 'text-gray-300 cursor-not-allowed'
                    : booked ? 'text-gray-400 line-through decoration-gray-400 cursor-not-allowed'
                    : isSelected ? 'font-semibold' : 'text-gray-800 hover:bg-gray-100',
                )}
                style={{ ...(isSelected && !booked ? { backgroundColor: accentColor, color: accentTextColor } : {}), outlineColor: accentColor }}>
                {day}
                {state === 'limited' && (
                  <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 bottom-[3px] w-1 h-1 rounded-full"
                    style={{ backgroundColor: isSelected ? accentTextColor : '#b08d57' }} />
                )}
              </button>
            );
          })}
        </div>
        {(hasBooked || hasLimited) && (
          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-500" aria-hidden="true">
            {hasLimited && <span className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full" style={{ backgroundColor: '#b08d57' }} />Popular</span>}
            {hasBooked && <span className="line-through decoration-gray-400">Booked</span>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TimePickerField({ id, value, onChange, ariaInvalid, ariaDescribedby, inputClass, accentColor, accentTextColor }: {
  id: string; value: string; onChange: (v: string) => void;
  ariaInvalid?: boolean; ariaDescribedby?: string; inputClass: string; accentColor: string; accentTextColor: string;
}) {
  const [open, setOpen] = useState(false);
  const times = halfHourSlots();
  // The list is one Tab stop (a listbox): it opens on the chosen time, or
  // 6:00 pm rather than midnight, and arrow keys or typing a time ("7p",
  // "730") move through it. Reaching 6:00 pm used to take ~38 key presses.
  const [active, setActive] = useState(() => initialSlotIndex(times, value));
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const focusSlot = (i: number) => {
    setActive(i);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[i]?.focus();
  };
  const onListKey = (e: React.KeyboardEvent) => {
    const moved = moveSlot(active, e.key, times.length);
    if (moved !== null) { e.preventDefault(); focusSlot(moved); return; }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.key === ' ') return;
    const now = Date.now();
    const text = (now - typed.current.at < 800 ? typed.current.text : "") + e.key;
    typed.current = { text, at: now };
    // A fresh single key looks past the current slot, so "6" steps 6:00 → 6:30.
    const hit = matchSlot(times, text, text.length === 1 ? active + 1 : active);
    if (hit !== -1) { e.preventDefault(); focusSlot(hit); }
  };

  return (
    <Popover open={open} onOpenChange={o => { if (o) setActive(initialSlotIndex(times, value)); setOpen(o); }}>
      <PopoverTrigger asChild>
        <button type="button" id={id}
          aria-haspopup="dialog" aria-invalid={ariaInvalid} aria-describedby={[`${id}-value`, ariaDescribedby].filter(Boolean).join(' ')}
          className={cn("h-9 w-full min-w-0 px-3 py-1", inputClass, "flex items-center justify-between text-left")}>
          <span id={`${id}-value`} className={value ? '' : 'text-muted-foreground'}>{value ? formatTime12h(value) : 'Select a time'}</span>
          <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-36 p-1 max-h-64 overflow-y-auto" aria-label="Choose a time"
        onOpenAutoFocus={e => { e.preventDefault(); requestAnimationFrame(() => focusSlot(initialSlotIndex(times, value))); }}>
        <div ref={listRef} role="listbox" aria-label="Times" onKeyDown={onListKey}>
        {times.map((t, i) => (
          <button key={t} type="button" role="option" aria-selected={value === t} tabIndex={i === active ? 0 : -1}
            onClick={() => { onChange(t); setOpen(false); }}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100"
            style={value === t ? { backgroundColor: accentColor, color: accentTextColor } : undefined}>
            {formatTime12h(t)}
          </button>
        ))}
        </div>
        {/* The list only offers half-hour steps — an exact time (e.g. 7:15)
            still needs a way in. A directly-clicked native time input opens
            fine even in a cross-origin embed; it's only a *programmatic*
            showPicker() call that a cross-origin iframe blocks. */}
        <div className="border-t border-gray-200 mt-1 pt-1 px-1">
          <input type="time" value={value} aria-label="Enter an exact time"
            onChange={e => { if (e.target.value) { onChange(e.target.value); setOpen(false); } }}
            className="w-full text-base border border-gray-200 rounded px-1.5 py-1" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Price guidance ───────────────────────────────────────────────────────
   A venue can publish, per space, a minimum spend (plus an optional higher
   Fri/Sat one) and "packages from $X pp" (leads.formConfig only returns
   them when the venue switched pricing on for that space). One short line
   so clients can self-qualify before they hit send. ─────────────────── */
type FormSpace = {
  id: number; name: string; minCapacity: number | null; maxCapacity: number | null;
  pricing: { minSpend: number | null; minSpendWeekend: number | null; packagesFromPp: number | null } | null;
};
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-NZ');
// Fri/Sat count as the weekend for minimum spends.
const weekendDay = (iso: string): 'Fridays' | 'Saturdays' | null => {
  const d = iso ? new Date(iso + 'T12:00:00') : null;
  if (!d || isNaN(d.getTime())) return null;
  return d.getDay() === 5 ? 'Fridays' : d.getDay() === 6 ? 'Saturdays' : null;
};
/** The minimum spend that applies on that date (or the lowest, undated). */
function minSpendOn(p: NonNullable<FormSpace['pricing']>, iso: string): number | null {
  if (iso) return (weekendDay(iso) && p.minSpendWeekend) || p.minSpend || null;
  return p.minSpend ?? p.minSpendWeekend ?? null;
}
function minSpendPhrase(p: NonNullable<FormSpace['pricing']>, iso: string): string | null {
  const wk = weekendDay(iso);
  if (iso) {
    if (wk && p.minSpendWeekend) return `minimum spend ${money(p.minSpendWeekend)} on ${wk}`;
    return p.minSpend ? `minimum spend ${money(p.minSpend)}` : null;
  }
  if (p.minSpend && p.minSpendWeekend && p.minSpendWeekend !== p.minSpend) return `minimum spend from ${money(p.minSpend)} (${money(p.minSpendWeekend)} Fri & Sat)`;
  if (p.minSpend) return `minimum spend ${money(p.minSpend)}`;
  return p.minSpendWeekend ? `minimum spend ${money(p.minSpendWeekend)} Fri & Sat` : null;
}
function priceGuidance(spaces: FormSpace[], chosen: FormSpace | undefined, guests: number | null, dateIso: string): { hint: string | null; budget: string | null } {
  if (chosen) {
    const p = chosen.pricing;
    const bits = [chosen.name];
    if (p) {
      const ms = minSpendPhrase(p, dateIso);
      if (ms) bits.push(ms);
      if (p.packagesFromPp) bits.push(`packages from ${money(p.packagesFromPp)} pp`);
    }
    const over = guests && chosen.maxCapacity && guests > chosen.maxCapacity
      ? `${chosen.name} suits up to ${chosen.maxCapacity} guests — we'll suggest the best fit.` : null;
    const est = p && guests ? Math.max(minSpendOn(p, dateIso) ?? 0, (p.packagesFromPp ?? 0) * guests) : 0;
    return {
      hint: over ?? (bits.length > 1 ? bits.join(' · ') : null),
      budget: est > 0 ? `Guide for ${guests} guests in ${chosen.name}: from about ${money(est)}` : null,
    };
  }
  if (!guests) return { hint: null, budget: null };
  const priced = spaces.filter(s => s.pricing);
  if (!priced.length) return { hint: null, budget: null };
  const fits = priced.filter(s => !s.maxCapacity || guests <= s.maxCapacity);
  const pool = fits.length ? fits : priced;
  const lowest = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => !!x); return v.length ? Math.min(...v) : null; };
  const ms = lowest(pool.map(s => minSpendOn(s.pricing!, dateIso)));
  const pp = lowest(pool.map(s => s.pricing!.packagesFromPp));
  const bits = [ms && `Minimum spends from ${money(ms)}`, pp && `packages from ${money(pp)} pp`].filter(Boolean) as string[];
  if (!bits.length) return { hint: null, budget: null };
  bits[0] = bits[0].charAt(0).toUpperCase() + bits[0].slice(1);
  const est = lowest(pool.map(s => Math.max(minSpendOn(s.pricing!, dateIso) ?? 0, (s.pricing!.packagesFromPp ?? 0) * guests) || null));
  return { hint: bits.join(' · '), budget: est ? `Guide for ${guests} guests: from about ${money(est)}` : null };
}

/* ── Cloudflare Turnstile (optional) ───────────────────────────────────────
   Only when the server hands back a site key (TURNSTILE_SITE_KEY and
   TURNSTILE_SECRET_KEY both set) — otherwise nothing loads from Cloudflare
   at all. The script is fetched once, on demand. ─────────────────────── */
let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if ((window as any).turnstile) return Promise.resolve();
  if (!turnstileScript) {
    turnstileScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { turnstileScript = null; reject(new Error('turnstile')); };
      document.head.appendChild(s);
    });
  }
  return turnstileScript;
}
function TurnstileBox({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (t: string | null) => void; resetKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(() => {
      const ts = (window as any).turnstile;
      if (cancelled || !ref.current || !ts) return;
      widgetId.current = ts.render(ref.current, {
        sitekey: siteKey,
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    }).catch(() => { /* blocked by an extension etc. — the server says so on send */ });
    return () => {
      cancelled = true;
      try { if (widgetId.current) (window as any).turnstile?.remove(widgetId.current); } catch {}
      widgetId.current = null;
    };
  }, [siteKey]);
  // After a failed send the token is spent — get a fresh one.
  useEffect(() => {
    if (resetKey && widgetId.current) { try { (window as any).turnstile?.reset(widgetId.current); onToken(null); } catch {} }
  }, [resetKey]);
  return <div ref={ref} className="flex justify-center min-h-0" />;
}

/* ── Post-submit walkthrough request ───────────────────────────────────────
   The client says which days and what time of day suit them; the venue
   confirms a real time later, once they know someone will be on site. So
   nothing here is a booking, and the copy never says it is. ── */
const WALKTHROUGH_TIME_OPTIONS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'any', label: 'Any time' },
] as const;
type WalkthroughTimeKey = typeof WALKTHROUGH_TIME_OPTIONS[number]['key'];
const MAX_WALKTHROUGH_DAYS = 5;

function WalkthroughRequest({ ownerId, leadId, leadToken, clientEmail, big, accentColor, accentTextColor, requested, onRequested }: {
  ownerId: number; leadId: number;
  /** Null after a reload outside the tab that sent it: what was asked for is shown, nothing can be changed. */
  leadToken: string | null;
  clientEmail: string; big: boolean;
  accentColor: string; accentTextColor: string;
  /** Already asked for (kept with the sent enquiry, shown after a reload). */
  requested?: string | null;
  onRequested: (summary: string) => void;
}) {
  const optionsQ = trpc.leads.walkthroughOptions.useQuery({ ownerId }, { staleTime: 60_000, refetchOnWindowFocus: false });
  const [dates, setDates] = useState<string[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<WalkthroughTimeKey>('any');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ summary: string; emailed: boolean } | null>(() => requested ? { summary: requested, emailed: false } : null);
  const [changing, setChanging] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = trpc.leads.requestWalkthrough.useMutation({
    onSuccess: (r) => { setDone({ summary: r.summary, emailed: r.emailed }); setChanging(false); setError(null); onRequested(r.summary); },
    onError: () => setError("We couldn't send that just now — please try again."),
  });
  const days = optionsQ.data?.days ?? [];
  const toggleDate = (key: string) => {
    setError(null);
    setDates(prev => prev.includes(key) ? prev.filter(d => d !== key) : prev.length >= MAX_WALKTHROUGH_DAYS ? prev : [...prev, key]);
  };

  if (skipped) return null;
  const wrap = `mt-6 ${big ? 'pt-6' : 'pt-5'} border-t border-gray-200 text-left`;
  const eyebrow = "font-bold text-[11px] tracking-[0.14em] uppercase";
  const label = "block font-bold text-[11px] tracking-[0.12em] uppercase text-gray-600 mb-1.5";

  if (done && !changing) {
    return (
      <div className={wrap}>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3.5" role="status">
          <div className={eyebrow} style={{ color: accentColor }}>Walkthrough requested</div>
          <div className={`font-semibold text-gray-900 mt-0.5 leading-snug ${big ? 'text-lg' : 'text-base'}`} style={{ fontFamily: HEADING_FONT }}>
            We&rsquo;ll be in touch to confirm a time.
          </div>
          <p className="text-xs text-gray-600 mt-1 leading-snug">
            You suggested {done.summary}.{' '}
            {/* After a reload the confirmation shows no personal details, so no address either. */}
            {done.emailed && (clientEmail
              ? <>We&rsquo;ve emailed a copy to <span className="font-medium text-gray-800 break-all">{clientEmail}</span>.</>
              : <>We&rsquo;ve emailed you a copy.</>)}
          </p>
          {leadToken && (
            <button type="button" onClick={() => setChanging(true)}
              className="mt-2 whitespace-nowrap font-bold text-[11px] tracking-wide uppercase text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline py-1.5">Change my request</button>
          )}
        </div>
      </div>
    );
  }

  if (!leadToken || optionsQ.isLoading || !optionsQ.data?.enabled) return null;

  return (
    <div className={wrap}>
      <div className={`font-semibold text-gray-900 ${big ? 'text-lg' : 'text-base'}`} style={{ fontFamily: HEADING_FONT }}>
        {changing ? 'Update your walkthrough request' : 'Want to see the space first?'}
      </div>
      <p className={`text-gray-600 ${big ? 'text-sm' : 'text-xs'} mt-0.5 mb-3`}>
        Tell us when suits and we&rsquo;ll confirm a time when the team is on site.
      </p>

      <div id={`wt-days-${leadId}`} className={label}>Days that suit you <span className="normal-case tracking-normal font-normal text-gray-500">(pick a few)</span></div>
      {/* Day strip — scrolls sideways on a phone. */}
      <div role="group" aria-labelledby={`wt-days-${leadId}`} className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 pr-8 snap-x [mask-image:linear-gradient(to_right,black_calc(100%_-_32px),transparent)]">
        {days.map(d => {
          const sel = dates.includes(d.key);
          const full = !sel && dates.length >= MAX_WALKTHROUGH_DAYS;
          const [wd, ...rest] = d.label.split(' ');
          return (
            <button key={d.key} type="button" aria-pressed={sel} aria-label={d.label} disabled={full}
              onClick={() => toggleDate(d.key)}
              className={`snap-start shrink-0 w-[58px] rounded-lg border py-1.5 text-center transition-colors disabled:opacity-40 ${sel ? 'shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              style={sel ? { backgroundColor: accentColor, borderColor: accentColor, color: accentTextColor } : undefined}>
              <span className={`block text-[11px] font-bold tracking-wider uppercase ${sel ? '' : 'text-gray-500'}`}>{wd}</span>
              <span className={`block text-sm font-semibold ${sel ? '' : 'text-gray-800'}`} style={{ fontFamily: HEADING_FONT }}>{rest.join(' ')}</span>
            </button>
          );
        })}
      </div>

      <div id={`wt-time-${leadId}`} className={`${label} mt-3`}>Time of day</div>
      <div role="radiogroup" aria-labelledby={`wt-time-${leadId}`} onKeyDown={onArrowChoose} className="flex flex-wrap gap-1.5">
        {WALKTHROUGH_TIME_OPTIONS.map((o, idx) => {
          const sel = timeOfDay === o.key;
          return (
            <button key={o.key} type="button" role="radio" aria-checked={sel}
              tabIndex={rovingTabIndex(sel, idx, WALKTHROUGH_TIME_OPTIONS.some(t => t.key === timeOfDay))}
              onClick={() => setTimeOfDay(o.key)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${sel ? 'font-semibold shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}
              style={sel ? { backgroundColor: accentColor, borderColor: accentColor, color: accentTextColor } : undefined}>
              {o.label}
            </button>
          );
        })}
      </div>

      <label htmlFor={`wt-note-${leadId}`} className={`${label} mt-3`}>Anything we should know? <span className="normal-case tracking-normal font-normal text-gray-500">(optional)</span></label>
      <input id={`wt-note-${leadId}`} type="text" maxLength={300} value={note} onChange={e => setNote(e.target.value)}
        placeholder="e.g. after 5pm on weekdays"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{ ['--tw-ring-color' as any]: accentColor }} />

      {error && <p role="alert" className="text-xs text-red-700 mt-2">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" disabled={request.isPending}
          onClick={() => leadToken && request.mutate({ ownerId, leadId, leadToken, dates, timeOfDay, note: note.trim() || undefined })}
          className="rounded-full px-4 py-2 text-xs font-bold tracking-wide uppercase shadow-sm disabled:opacity-60"
          style={{ backgroundColor: accentColor, color: accentTextColor }}>
          {request.isPending ? 'Sending…' : changing ? 'Update request' : 'Request a walkthrough'}
        </button>
        <button type="button" onClick={() => changing ? setChanging(false) : setSkipped(true)}
          className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700">
          {changing ? 'Keep my request' : 'No thanks — email is fine'}
        </button>
      </div>
    </div>
  );
}

/** "E51F1A" → "#E51F1A"; anything else (already "#…", rgb(), names) unchanged. */
function withHash(color: string): string {
  return /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color?.trim() ?? "") ? `#${color.trim()}` : color;
}

export default function LeadForm() {
  const { slug } = useParams<{ slug?: string }>();
  const formId = useId();
  const fieldElId = (f: FormFieldDef) => `${formId}-${f.id}`;
  const [submitted, setSubmitted] = useState(false);
  // Embed + per-embed customisation read from the URL, e.g.
  //   /enquire/<slug>?embed=1&accent=BE1622&font=Lora&bg=ffffff
  // These override the venue's saved branding so the same form can be themed
  // differently wherever it's embedded (like the NowBookIt widget).
  const sp = new URLSearchParams(window.location.search);
  const isEmbed = sp.get("embed") === "1";
  const paramAccent = sp.get("accent");   // hex, no leading #
  const paramFont = sp.get("font");       // any Google Font family name, or "inherit"
  const paramBg = sp.get("bg");           // hex (no #), or "transparent"
  // Embed styling API (all optional; defaults keep the current look):
  //   text   — body text colour (hex, no #)
  //   label  — field-label colour (hex, no #)
  //   border — input border colour (hex, no #)
  //   radius — corner radius in px (0–40)
  //   shadow — "off" removes the card shadow
  //   button — "outline" | "ghost" render the submit button unfilled
  const paramText = sp.get("text");
  const paramLabel = sp.get("label");
  const paramBorder = sp.get("border");
  const paramRadius = sp.get("radius");
  const paramShadow = sp.get("shadow");
  const paramButton = sp.get("button");
  // A stable id for THIS frame, set by embed.js, echoed back on every message
  // so a host page with two forms can tell which one spoke.
  const frameId = sp.get("frameId") || null;
  // Collapses the embed's 3-step wizard into one scrolling form — set by
  // embed.js from data-layout="compact". Most traffic to these pages is
  // mobile, where three steps is pure friction.
  const isCompact = isEmbed && sp.get("layout") === "compact";
  // Set by embed.js when this iframe is the panel of a floating bubble
  // widget rather than sitting inline in the page — drives the card's own
  // × close button (posts vf-close-widget back to embed.js) and, when
  // isSheet is also set, a bottom-sheet drag handle instead of that button.
  const isFloatingPlacement = isEmbed && sp.get("placement") === "floating";
  const isSheet = isFloatingPlacement && sp.get("sheet") === "1";
  const closeFloatingWidget = () => postToParent({ type: "vf-close-widget" });
  // Keys pressed in here never reach the host page, so Escape in the floating
  // panel asks embed.js to close it (and give focus back to the bubble). A
  // date or time pop-up open inside the form handles its own Escape first.
  useEffect(() => {
    if (!isFloatingPlacement) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) closeFloatingWidget(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFloatingPlacement]);
  // embed.js reads its OWN parent page's origin (the iframe can't — that's
  // the whole reason it's passed in) and appends it here so postMessage can
  // target that exact origin instead of "*". Validated, not trusted as-is:
  // a malformed value falls back to "*" rather than silently going dark, so
  // a hand-pasted old-style iframe (no embed.js, no param) still works.
  //
  // The real parent origin, best source first: the browser's own
  // ancestorOrigins (can't be faked by the page), then the parentOrigin param,
  // then the referrer (an iframe's referrer is the page that embeds it).
  // null when none is known.
  const parentOrigin: string | null = (() => {
    if (!isEmbed) return null;
    try {
      const ao = (window.location as any).ancestorOrigins;
      if (ao && ao.length > 0) { const o = originOf(ao[0]); if (o) return o; }
    } catch { /* not supported */ }
    return originOf(sp.get("parentOrigin")) ?? originOf(document.referrer);
  })();
  const paramParentOrigin = parentOrigin ?? "*";
  // Every message to the host page goes through here so it always carries the
  // frameId and targets the parent's exact origin. Documented message names:
  // vf-embed-height, vf-step-changed, vf-partial-captured, vf-enquiry-submitted,
  // vf-walkthrough-requested, vf-close-widget.
  const postToParent = (msg: Record<string, unknown>) => {
    try { window.parent?.postMessage({ ...msg, frameId }, paramParentOrigin); } catch { /* no parent / cross-origin */ }
  };
  // Messages that carry an enquiry (submitted, partial) only ever go to the
  // parent's exact origin — never "*". Unknown parent → not sent at all.
  const postEnquiryToParent = (msg: Record<string, unknown>) => {
    if (!parentOrigin) return;
    try { window.parent?.postMessage({ ...msg, frameId }, parentOrigin); } catch { /* no parent */ }
  };
  // Embed styling overrides, derived from URL params only, so the scoped-style
  // effect below can run before the venue data has loaded. Validate a hex param
  // (3–8 hex digits) → "#rrggbb", else null.
  const hexParam = (h: string | null) => (h && /^[0-9a-fA-F]{3,8}$/.test(h)) ? `#${h}` : null;
  const textOverride = hexParam(paramText);
  const labelOverride = hexParam(paramLabel);
  const borderOverride = hexParam(paramBorder);
  const radiusPx = (() => { const n = parseInt(paramRadius ?? "", 10); return Number.isFinite(n) && n >= 0 && n <= 40 ? n : null; })();
  const shadowOff = paramShadow === "off";
  const buttonUnfilled = paramButton === "outline" || paramButton === "ghost";
  // Colour for the outline/ghost button rule — param-driven so it's available
  // this early; falls back to the brand blue when no accent is set.
  const embedButtonColor = hexParam(paramAccent) ?? "#2f5488";
  // Ad-click attribution: embed.js reads these off the PARENT page's URL at
  // load time (the iframe can't — cross-origin) and passes them through as
  // plain query params. Captured here, carried on the submit payload below,
  // so a venue can answer "did this come from an ad, and which one?" even
  // if they never wire up conversion tracking at all.
  const clickAttribution = {
    gclid: sp.get("gclid") || undefined,
    gbraid: sp.get("gbraid") || undefined,
    wbraid: sp.get("wbraid") || undefined,
    fbclid: sp.get("fbclid") || undefined,
    // Where the ad click landed and when, kept by the venue's own page
    // (barfranco.nz stores them in a first-party cookie for 90 days).
    landingPage: sp.get("vf_landing") || (isEmbed ? document.referrer || undefined : undefined),
    adClickAt: sp.get("vf_click_ts") || undefined,
    utmSource: sp.get("utm_source") || undefined,
    utmMedium: sp.get("utm_medium") || undefined,
    utmCampaign: sp.get("utm_campaign") || undefined,
    utmTerm: sp.get("utm_term") || undefined,
    utmContent: sp.get("utm_content") || undefined,
  };
  // Prefill from embed.js's data-event-type/date/guests/format, e.g. a
  // Christmas landing page opening the form already on "Christmas Party" —
  // fewer taps, better mobile conversion. Each is independently optional.
  // Read once: an impossible date ("2026-13-01"), a format word the form
  // doesn't know or a guest count with no number in it is no prefill.
  const [urlPrefill] = useState(() => prefillFromUrl(sp, EVENT_TYPES));

  // The form's display type (Spectral + Hanken Grotesk) loads unconditionally
  // — it's the heading/label typeface for every venue now, independent of
  // whatever body font a venue or ?font= override picks for input text.
  useEffect(() => {
    const id = "vf-editorial-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,500&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  // Load the requested Google Font on the fly so any family works.
  useEffect(() => {
    if (!paramFont || paramFont === 'inherit' || !/^[a-zA-Z0-9 ]+$/.test(paramFont)) return;
    const id = "vf-embed-font";
    document.getElementById(id)?.remove();
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${paramFont.trim().replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [paramFont]);

  // Embed styling API — apply text/label/border colours, corner radius, shadow
  // and button style as one scoped <style> so it reaches every field without
  // threading props through the whole tree. Only overrides that are set emit a
  // rule; absent ones keep the default look, so existing embeds don't change.
  useEffect(() => {
    if (!isEmbed) return;
    const rules: string[] = [];
    // Blend into the host page: the iframe's own body/root must not paint a
    // background over the host's (that was the white frame around the form).
    rules.push(`html,body{background:transparent !important}`);
    // A clean, intentional disabled state for the primary button. A faded brand
    // colour reads as broken (the washed-out pink); a warm neutral reads as
    // "not ready yet" and matches the cream aesthetic.
    rules.push(`.vf-embed-root .vf-submit:disabled{opacity:1 !important;background:#e7e2d6 !important;color:#8f8676 !important;border-color:#e7e2d6 !important;box-shadow:none !important}`);
    // Warm input borders (3.8:1 on white, so the box edge is visible) unless
    // the embed sets its own border colour.
    if (!borderOverride) rules.push(`.vf-embed-root input,.vf-embed-root textarea,.vf-embed-root select{border-color:#8a8073}`);
    if (textOverride) rules.push(`.vf-embed-root,.vf-embed-root input,.vf-embed-root textarea,.vf-embed-root select{color:${textOverride}}`);
    if (labelOverride) rules.push(`.vf-embed-root label{color:${labelOverride}}`);
    if (borderOverride) rules.push(`.vf-embed-root input,.vf-embed-root textarea,.vf-embed-root select{border-color:${borderOverride}}`);
    if (radiusPx !== null) {
      rules.push(`.vf-card{border-radius:${radiusPx}px}`);
      rules.push(`.vf-embed-root input,.vf-embed-root textarea,.vf-embed-root select,.vf-embed-root .vf-submit{border-radius:${radiusPx}px}`);
    }
    if (shadowOff) rules.push(`.vf-card{box-shadow:none}`);
    if (buttonUnfilled) rules.push(`.vf-embed-root .vf-submit{background:transparent !important;color:${embedButtonColor} !important;border:1.5px solid ${embedButtonColor} !important}`);
    const id = "vf-embed-style";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!rules.length) { el?.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
    el.textContent = rules.join("");
    return () => { document.getElementById(id)?.remove(); };
  }, [isEmbed, textOverride, labelOverride, borderOverride, radiusPx, shadowOff, buttonUnfilled, embedButtonColor]);

  // Auto-resize: when embedded, post our content height to the parent page so a
  // tiny script in the embed snippet can size the <iframe> to fit — no inner
  // scrollbars, no empty space, regardless of which step is showing.
  //
  // A host page that never resizes the frame (it doesn't listen for
  // vf-embed-height) can cut step 2 off above BACK and SUBMIT. Only then,
  // once the frame has stayed shorter than the form for a moment, the button
  // row is kept at the bottom of the frame (frameShort). A host that does
  // resize the frame never gets it.
  const [frameShort, setFrameShort] = useState(false);
  useEffect(() => {
    if (!isEmbed) return;
    let lastPosted = 0;
    let lastInner = window.innerHeight;
    let hostResizes = false;
    let shortTimer: ReturnType<typeof setTimeout> | undefined;
    const tooShort = () => !hostResizes && window.innerHeight + 2 < document.body.scrollHeight;
    const evaluate = () => {
      clearTimeout(shortTimer);
      if (!tooShort()) { setFrameShort(false); return; }
      // A host that resizes the frame gets a moment to catch up first.
      shortTimer = setTimeout(() => setFrameShort(tooShort()), 1000);
    };
    const post = () => {
      // Measure the body, not documentElement: inside an iframe the root
      // element's scrollHeight is floored at the iframe's own height, so it can
      // only grow. body.scrollHeight tracks the real content and lets a shorter
      // step shrink the frame too.
      const h = Math.ceil(document.body.scrollHeight);
      lastPosted = h;
      postToParent({ type: "vf-embed-height", height: h });
      evaluate();
    };
    const onResize = () => {
      if (window.innerHeight !== lastInner) {
        lastInner = window.innerHeight;
        // The frame became the height just posted: the host page sizes it.
        if (lastPosted && Math.abs(window.innerHeight - lastPosted) <= 4) hostResizes = true;
      }
      post();
    };
    post();
    const ro = new ResizeObserver(() => post());
    ro.observe(document.body);
    // Safety posts for late reflow (custom font / images loading).
    const t1 = setTimeout(post, 400);
    const t2 = setTimeout(post, 1500);
    window.addEventListener("load", post);
    window.addEventListener("resize", onResize);
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); clearTimeout(shortTimer); window.removeEventListener("load", post); window.removeEventListener("resize", onResize); };
  }, [isEmbed]);

  // The venue. A lookup that failed (a deploy, a mobile blip) used to fall
  // through to a nameless form that could never send: it is retried with
  // backoff, and while it keeps failing the frame says so, with Try again.
  const venueBySlugQ = trpc.venue.getBySlug.useQuery({ slug: slug ?? "" }, { enabled: !!slug, ...VENUE_RETRY });
  const venueDefaultQ = trpc.venue.getDefault.useQuery(undefined, { enabled: !slug, ...VENUE_RETRY });
  const venueQ = slug ? venueBySlugQ : venueDefaultQ;
  const venue = venueQ.data;
  const isLoading = venueQ.isLoading;
  const venueFailed = venue === undefined && venueQ.isError;
  // Lead with the venue's Brand Pack accent (brandAccentColor → venue colour →
  // navy), exactly as the proposal page does via venueBrand(). This replaces the
  // old `venue.primaryColor ?? green` default, which left the enquiry form on
  // the stored primary colour (often the stock red) even when the venue had
  // chosen a Brand Pack accent the proposal already used.
  const brand = venueBrand(venue as any);

  // Spaces + published prices, the availability/walkthrough switches, the
  // optional Turnstile key and the signed "form opened at" token. Fetched
  // once: refetching would re-issue the token and could make a real person
  // look like a too-fast bot.
  const { data: formConfig } = trpc.leads.formConfig.useQuery(
    { ownerId: venue?.ownerId ?? 0 },
    { enabled: !!venue?.ownerId, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 3 },
  );
  // Where the visitor had got to before a reload (step, step-1 lead, first
  // token), kept beside the draft below: see enquiryProgress.ts.
  const storageKeys = enquiryStorageKeys(slug);
  // Whether this frame can use storage. Where it can't (a browser blocking
  // all third-party storage), the answers and the step are kept in the
  // frame's window.name instead (lib/framedDraft.ts), so the venue's page
  // reloading the frame doesn't wipe them. Never the lead's token.
  const [storageOk] = useState(() => {
    try { const k = "vf-storage-check"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch { return false; }
  });
  const [nameDraft] = useState(() => {
    try {
      if (!storageOk) return readNameDraft(window.name, storageKeys.slug, Date.now());
      const cleared = clearNameDraft(window.name);
      if (cleared !== window.name) window.name = cleared;
    } catch { /* no window.name either */ }
    return null;
  });
  // This frame's own name (window.name survives the venue's page reloading
  // the frame, not a whole-page reload or another page), and the page it is
  // on: "Enquiry Received!" comes back only where it was sent.
  const [thisFrame] = useState<string | null>(() => {
    if (!isEmbed || !storageOk) return null;
    try {
      const f = frameTag(window.name, () => Math.random().toString(36).slice(2));
      if (f.name !== window.name) window.name = f.name;
      return f.tag;
    } catch { return null; }
  });
  const [thisPage] = useState(() => formPageKey({ search: window.location.search, isEmbed, referrer: document.referrer, href: window.location.href }));
  // The sent enquiry's token, for the walkthrough offer after a reload: this
  // tab only (sessionStorage), never kept where another tab could use it.
  const sentTokenKey = `vf-lead-sent-${storageKeys.slug}`;
  const readSentToken = (): { leadId: number; token: string } | null => {
    try {
      const d = JSON.parse(sessionStorage.getItem(sentTokenKey) ?? "null");
      return d && Number.isInteger(d.leadId) && d.leadId > 0 && typeof d.token === "string" && d.token.length <= 64 ? { leadId: d.leadId, token: d.token } : null;
    } catch { return null; }
  };
  const [storedProgress] = useState<EnquiryProgress | null>(() => {
    if (!storageOk) {
      return nameDraft?.ownerId ? {
        slug: storageKeys.slug, ownerId: nameDraft.ownerId, step: nameDraft.step,
        leadId: null, leadToken: null, leadEmail: null, leadAt: null, formToken: null, formTokenAt: null, prefill: nameDraft.prefill,
      } : null;
    }
    try { return parseProgress(localStorage.getItem(storageKeys.progress), storageKeys.slug); } catch { return null; }
  });
  // The first token this draft had survives a reload (the venue's page
  // reloads the form when a date or guest count is picked there), so a
  // reload's brand-new token can't make the visitor look too fast.
  const formTokenRef = useRef<{ token: string; at: number } | null>(null);
  if (!formTokenRef.current && venue?.ownerId) formTokenRef.current = pickFormToken(storedProgress, venue.ownerId, formConfig?.formToken, Date.now());
  // This page's own token, and when it arrived: sent instead once it's old
  // enough to pass (formTokenToSend).
  const freshTokenRef = useRef<{ token: string; at: number } | null>(null);
  if (!freshTokenRef.current && formConfig?.formToken) freshTokenRef.current = { token: formConfig.formToken, at: Date.now() };
  const sendFormToken = () => pickTokenToSend(formTokenRef.current, freshTokenRef.current, Date.now())?.token;
  // The server drops a token under 3 s old as a bot, while the visitor sees
  // "Enquiry Received!" (an autofilled step 1, NEXT and a quick SUBMIT can be
  // that fast): wait out the rest before sending. Never sends early.
  const waitForFormToken = async () => {
    const ms = tokenWaitMs(pickTokenToSend(formTokenRef.current, freshTokenRef.current, Date.now()), Date.now(), CLIENT_MIN_TOKEN_AGE_MS);
    if (ms > 0) await sleep(ms);
  };
  // Honeypot: a field people never see. Anything typed here is a bot.
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  // Give the document a real title in both modes. On the standalone page it's
  // the browser-tab title; inside the embed iframe it's the frame's own
  // accessible name (a screen reader announces it when entering the frame), so
  // it should never be left as the generic app title.
  useEffect(() => {
    const name = venue?.name ?? "VenueFlowHQ Venue";
    document.title = venue === null ? "Venue not found" : isEmbed ? `Enquiry form — ${name}` : `Enquire — ${name}`;
  }, [isEmbed, venue, venue?.name]);

  // Half-filled forms survive a reload — someone who taps away to check their
  // calendar and comes back shouldn't have to retype everything. Scoped per
  // venue slug so different venues' drafts on the same device never collide.
  const draftKey = storageKeys.draft;
  const readDraft = (): Record<string, string> => {
    if (!storageOk) return nameDraft?.fields ?? {};
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return {};
      const d = JSON.parse(raw);
      if (!d || typeof d !== "object") return {};
      return Object.fromEntries(Object.entries(d).filter((e): e is [string, string] => typeof e[1] === "string"));
    } catch { return {}; }
  };
  // Only what the visitor put there: the page's own prefill, kept in the
  // draft (after "Enquiry Received!", say), is nothing they started.
  const [draftRestored] = useState(() => draftHasOwnAnswers(readDraft(), storedProgress?.prefill));
  const [form, setForm] = useState<Record<string, string>>(() => {
    const draft = { ...readDraft() };
    // A date or time that can't be real (an old draft, a hand-made link) is dropped, not sent.
    if (draft.eventDate && !isRealDateKey(draft.eventDate)) delete draft.eventDate;
    if (draft.eventTime && !isWallTime(draft.eventTime)) delete draft.eventTime;
    // URL prefill (an ad or email link, embed.js, the venue's page): on a
    // first visit it wins over an old draft as it always did; on a reload it
    // only changes a field the page sent something new for, so the page's
    // "40, seated" no longer overwrites what the visitor typed in the form.
    return applyPrefill(draft, urlPrefill, storedProgress ? (storedProgress.prefill ?? null) : null).form;
  });
  const formRef = useRef(form);
  formRef.current = form;
  // The prefill values seen last (kept in the progress record), for that
  // rule: this load's on top of the ones remembered, so a load whose URL has
  // none (the venue's page loads the frame bare first, then with its
  // finder's "40, seated") doesn't make the next load's look new.
  const [lastPrefill, setLastPrefill] = useState<Record<string, string>>(() => rememberPrefill(storedProgress?.prefill, urlPrefill));
  // This page's own prefill (its URL, then any vf-prefill), for a fresh form.
  const thisLoadPrefillRef = useRef<Record<string, string>>(urlPrefill);
  const lastPrefillRef = useRef(lastPrefill);
  lastPrefillRef.current = lastPrefill;
  const [showDraftNote, setShowDraftNote] = useState(draftRestored);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  // After a reload, pick up where the visitor was: the step and the step-1
  // lead. Taken as saved for now; checked against the venue once it has
  // loaded, before the form shows (resumeChecked, below).
  const [initialResume] = useState(() => resumeFrom(storedProgress, { ownerId: storedProgress?.ownerId ?? 0, detailsValid: true, email: form.email, nowMs: Date.now() }));
  const [resumeChecked, setResumeChecked] = useState(false);
  // Opened straight on step 2 by a reload: step 1's name and email aren't on
  // screen, so step 2 says whose enquiry this is, with Start fresh (someone
  // else on a shared device mustn't finish it unawares). Gone after BACK.
  const [resumedStep2, setResumedStep2] = useState(false);
  // Stepped embed widget state (Your Details → Your Event — contact info
  // comes first so a stranger who bails after step 1 still leaves behind a
  // name and email, not nothing).
  const [embedStep, setEmbedStep] = useState<number>(initialResume.step);
  // "We don't have a date yet" — an explicit answer, not a skipped field.
  // Clients without a date were guessing one or abandoning; this makes
  // no-date a first-class choice, stored on the lead as dateFlexible. Kept
  // with the answers, so a reload (or a prefilled date) doesn't undo it.
  const noDateYet = form[NO_DATE_KEY] === "1";
  const setNoDateYet = (on: boolean) => setForm(p => {
    const n = { ...p };
    if (on) n[NO_DATE_KEY] = "1"; else delete n[NO_DATE_KEY];
    return n;
  });
  // The step-1 lead startCapture saved, passed to submit() so it completes
  // this row instead of inserting a second one, with its token (the server
  // only completes that row when it's sent back, see leadToken.ts), the email
  // it was saved with, when (this device's clock), and whether this page
  // load saved it (enquiryProgress.ts: only then may a corrected email go
  // with it). Kept in a ref too, for the waits in NEXT and SUBMIT.
  const [held, setHeldState] = useState<HeldLead>(() => ({ leadId: initialResume.leadId, leadToken: initialResume.leadToken, leadEmail: initialResume.leadEmail, leadAt: initialResume.leadAt, fromThisPage: false }));
  const heldRef = useRef(held);
  const setHeld = (h: HeldLead) => { heldRef.current = h; setHeldState(h); };
  const capturedLead = held;
  // Field ids that failed validation on the last submit attempt — drives the
  // inline error text/aria-invalid under each field. Cleared on submit, and
  // implicitly "resolved" per-field the moment isFieldFilled() says so again
  // (no per-keystroke bookkeeping needed).
  const [touchedInvalid, setTouchedInvalid] = useState<Set<string>>(new Set());
  // A field the server refused, with the value it refused: marked at the
  // field until that value changes.
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, { message: string; value: string }>>({});
  // Why the last submit failed, shown (and announced) just above SUBMIT. A
  // toast sat right on top of that button: in the embed (the iframe is only as
  // tall as the form), and on a phone, where SUBMIT is at the bottom of the
  // screen when it's tapped.
  const [submitError, setSubmitError] = useState("");
  // A very large guest count waiting for "Did you mean …?" before sending.
  const [guestConfirm, setGuestConfirm] = useState<number | null>(null);
  // SUBMIT is busy: waiting for step 1's save or the timing token, or sending.
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  // The id of the lead row this submission created/updated — captured from
  // submit()'s response so the post-submit walkthrough step has something to
  // attach the chosen slot to.
  const [submittedLeadId, setSubmittedLeadId] = useState<number | null>(null);
  const [submittedLeadToken, setSubmittedLeadToken] = useState<string | null>(null);
  // A walkthrough already asked for on the enquiry a reload shows again.
  const [restoredWalkthrough, setRestoredWalkthrough] = useState<string | null>(null);
  // An enquiry this device sent from another page (or one that can't be
  // told apart) in the last hour: the form says so above step 1.
  const [sentElsewhereAt, setSentElsewhereAt] = useState<number | null>(null);
  const submittedRef = useRef(false);
  // Enquiries already announced to the host page, so a repeated SUBMIT (the
  // server answers "already received") is never counted twice.
  const postedSubmittedRef = useRef<Set<number>>(new Set());
  // Step 1's save while it's on its way, and a count that START FRESH bumps so
  // an answer for the person before is never taken for the next one.
  const captureRef = useRef<Promise<void> | null>(null);
  const genRef = useRef(0);

  // Availability of the date already chosen (same cache as the picker's), for
  // the gentle "this date is popular" note. Per space when one is picked.
  const formSpaces: FormSpace[] = formConfig?.spaces ?? [];
  const showSpacePicker = formSpaces.length >= 2;
  const pickedSpace = formSpaces.find(s => String(s.id) === form.spaceId);
  const availabilityOpts = venue?.ownerId && formConfig?.showAvailability
    ? { ownerId: venue.ownerId, spaceId: showSpacePicker ? pickedSpace?.id : undefined, enabled: true }
    : undefined;
  const chosenDateState = useMonthAvailability(
    availabilityOpts,
    !noDateYet && /^\d{4}-\d{2}-\d{2}$/.test(form.eventDate ?? '') ? form.eventDate!.slice(0, 7) : null,
  )(form.eventDate ?? '');
  // Whether the visitor's copy of the enquiry has gone (or is going): the
  // success screen only mentions their inbox when it's true.
  const [autoReply, setAutoReply] = useState<AutoReplyState>("none");

  // Tell the host page which wizard step is showing, so it can track funnel
  // drop-off. Fires on mount and whenever the step changes; compact/one-scroll
  // layouts stay on step 1.
  useEffect(() => {
    if (!isEmbed) return;
    postToParent({ type: "vf-step-changed", step: embedStep });
  }, [isEmbed, embedStep]);
  // A message about the last SUBMIT belongs to the step it was shown on.
  useEffect(() => { setSubmitError(""); setGuestConfirm(null); }, [embedStep]);
  // A quick second tap on NEXT landed on whatever step 2 has in that place
  // ("No date yet" got ticked): taps are ignored for a moment after the step
  // changes. Keyboard focus still moves at once.
  const [stepGuard, setStepGuard] = useState(false);
  const stepGuardFirstRun = useRef(true);
  useEffect(() => {
    if (stepGuardFirstRun.current) { stepGuardFirstRun.current = false; return; }
    setStepGuard(true);
    const t = setTimeout(() => setStepGuard(false), 400);
    return () => clearTimeout(t);
  }, [embedStep]);

  // Focus follows the form. The button just pressed (SUBMIT, NEXT, BACK) is
  // gone afterwards, which dropped focus to the top of the page: go to
  // "Enquiry Received!", or to the new step's title (read out; the next Tab
  // is its first field). Headings, not fields, so no phone keyboard pops up.
  const successHeadingRef = useRef<HTMLElement | null>(null);
  const stepHeadingRef = useRef<HTMLElement | null>(null);
  const setSuccessHeading = (el: HTMLElement | null) => { successHeadingRef.current = el; };
  const setStepHeading = (el: HTMLElement | null) => { stepHeadingRef.current = el; };
  const focusKey = `${submitted ? "done" : "form"}-${embedStep}`;
  const lastFocusKey = useRef(focusKey);
  useEffect(() => {
    if (lastFocusKey.current === focusKey) return;
    lastFocusKey.current = focusKey;
    (submitted ? successHeadingRef.current : stepHeadingRef.current)?.focus();
  }, [focusKey, submitted]);

  // Save the in-progress draft on every change. form's initial value was
  // already seeded from the draft (readDraft(), above) so this never races
  // with — or clobbers — the restore. Beside it, where the visitor has got
  // to, once the venue is known (it's tied to that venue) and checked.
  const ownerId = venue?.ownerId;
  const formToken = formTokenRef.current;
  useEffect(() => {
    if (submitted) return;
    const hasAny = Object.values(form).some(v => !!v);
    const step = embedStep === 2 ? 2 : 1;
    if (!storageOk) {
      try {
        window.name = hasAny
          ? writeNameDraft(window.name, { slug: storageKeys.slug, ownerId: ownerId ?? nameDraft?.ownerId ?? null, step, fields: form, prefill: lastPrefill, at: Date.now() })
          : clearNameDraft(window.name);
      } catch { /* nowhere to keep it */ }
      return;
    }
    // Not before the saved record has been read: the form here is the
    // draft plus this load's prefill, and a load that turns out to show
    // "Enquiry Received!" again mustn't save the page's prefill as a draft.
    if (!resumeChecked) return;
    try {
      if (hasAny) localStorage.setItem(draftKey, JSON.stringify(form));
      else localStorage.removeItem(draftKey);
      // "Enquiry Received!" kept for a reload stays until the visitor starts
      // another enquiry (types their details): the venue's page loads the
      // frame empty, then with its own "40, seated", neither of which is
      // anything the visitor did.
      const saved = parseProgress(localStorage.getItem(storageKeys.progress), storageKeys.slug);
      const keepSent = holdsSentConfirmation(saved, Date.now(), SENT_CONFIRMATION_KEEP_MS)
        && !STEP_ONE_FIELDS.some(f => (form[f] ?? '').trim());
      const sentFields = keepSent && saved ? {
        sentLeadId: saved.sentLeadId, sentLeadToken: null, sentAt: saved.sentAt,
        sentPage: saved.sentPage, sentFrame: saved.sentFrame, walkthroughSummary: saved.walkthroughSummary,
      } : {};
      // Nothing is written or removed before the saved record has been read against the venue.
      if (!hasAny) {
        if (!keepSent) localStorage.removeItem(storageKeys.progress);
      } else if (ownerId) {
        localStorage.setItem(storageKeys.progress, serializeProgress({
          slug: storageKeys.slug, ownerId, step,
          leadId: held.leadId, leadToken: held.leadToken, leadEmail: held.leadEmail, leadAt: held.leadAt,
          formToken: formToken?.token ?? null, formTokenAt: formToken?.at ?? null,
          prefill: lastPrefill,
          ...sentFields,
        }));
      }
    } catch { /* storage disabled/full — draft persistence is a nicety, not required */ }
  }, [form, submitted, draftKey, storageKeys.progress, storageKeys.slug, ownerId, resumeChecked, embedStep, held, formToken, lastPrefill, storageOk, nameDraft]);
  const clearDraft = () => {
    try { localStorage.removeItem(draftKey); localStorage.removeItem(storageKeys.progress); } catch {}
    try { const n = clearNameDraft(window.name); if (n !== window.name) window.name = n; } catch {}
    setShowDraftNote(false);
  };
  // "Enquiry Received!" survives a reload for a while (the venue's page
  // reloads the frame when its calendar is used, and an empty step 1 invited
  // a second, "unfinished" enquiry). localStorage only, and nothing about the
  // visitor: the enquiry's id, when, and the page and frame it was sent
  // from. Its token (for the walkthrough offer) stays in this tab only.
  const rememberSent = (leadId: number | null, leadToken: string | null) => {
    if (!storageOk || !ownerId) return;
    try {
      localStorage.setItem(storageKeys.progress, serializeProgress({
        slug: storageKeys.slug, ownerId, step: 1,
        leadId: null, leadToken: null, leadEmail: null, leadAt: null, formToken: null, formTokenAt: null,
        prefill: lastPrefillRef.current, sentLeadId: leadId, sentLeadToken: null, sentAt: Date.now(),
        sentPage: thisPage, sentFrame: thisFrame, walkthroughSummary: null,
      }));
    } catch { /* no storage: a reload shows the form */ }
    try {
      if (leadId && leadToken) sessionStorage.setItem(sentTokenKey, JSON.stringify({ leadId, token: leadToken }));
      else sessionStorage.removeItem(sentTokenKey);
    } catch { /* the walkthrough just isn't offered again after a reload */ }
  };
  // The walkthrough asked for, kept with the sent record, so a reload shows
  // it as asked for instead of offering it (and alerting the venue) again.
  const rememberWalkthrough = (summary: string) => {
    if (!storageOk) return;
    try {
      const saved = parseProgress(localStorage.getItem(storageKeys.progress), storageKeys.slug);
      if (saved?.sentAt != null) localStorage.setItem(storageKeys.progress, serializeProgress({ ...saved, walkthroughSummary: summary.slice(0, 300) }));
    } catch { /* a reload offers it again */ }
  };

  // The step-2 "still here" ping (lib/partialPing.ts): the venue's
  // "Unfinished enquiry" alert then counts from when the visitor was last
  // seen on step 2, not from step 1. Only with the lead this page holds for
  // the email on step 1, never while step 1's save is still on its way.
  const touchPartial = trpc.leads.touchPartial.useMutation();
  const touchRef = useRef(touchPartial.mutateAsync);
  touchRef.current = touchPartial.mutateAsync;
  const pingerRef = useRef<ReturnType<typeof createPartialPinger> | null>(null);
  if (!pingerRef.current) pingerRef.current = createPartialPinger({ everyMs: PARTIAL_PING_EVERY_MS, send: t => touchRef.current(t) });
  const pinger = pingerRef.current;
  const stepRef = useRef(embedStep);
  stepRef.current = embedStep;
  const pingTarget = (): PingTarget | null => {
    const h = heldRef.current;
    if (!isEmbed || isCompact || !ownerId || submittedRef.current || stepRef.current !== 2 || captureRef.current) return null;
    if (!canReuseLead(h, formRef.current.email)) return null;
    return { ownerId, leadId: h.leadId!, leadToken: h.leadToken! };
  };
  const pingTargetRef = useRef(pingTarget);
  pingTargetRef.current = pingTarget;
  const pageVisible = () => document.visibilityState === "visible";
  const noteStep2Activity = () => pinger.activity(pingTargetRef.current(), pageVisible());
  useEffect(() => {
    const tick = () => pinger.tick(pingTargetRef.current(), pageVisible());
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [pinger]);
  useEffect(() => {
    if (resumeChecked && resumedStep2) pinger.resumed(pingTargetRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeChecked]);

  // vf-prefill: the host page can change the event answers without
  // reloading the frame ({ type: "vf-prefill", eventType, date, guests,
  // format, fields }), only from window.parent, in embed mode, by the same
  // rule as a reload's prefill. Never the contact fields, never the step,
  // never a submit. Answered with vf-prefill-applied; vf-ready says the
  // form is there to take one (see EmbedDocs.tsx).
  useEffect(() => {
    if (!isEmbed) return;
    const onMessage = (ev: MessageEvent) => {
      const input = vfPrefillFrom(
        { source: ev.source, origin: ev.origin, data: ev.data },
        { isEmbed, parent: window.parent !== window ? window.parent : null, parentOrigin, frameId },
      );
      if (!input) return;
      // Choices only: never the visitor's own words or contact details.
      const { values, ignored } = normalisePrefill(input, EVENT_TYPES, { allowContact: false, onlyChoices: true });
      const r = applyPrefill(formRef.current, values, lastPrefillRef.current);
      formRef.current = r.form;
      setForm(r.form);
      const seen = rememberPrefill(lastPrefillRef.current, values);
      lastPrefillRef.current = seen;
      setLastPrefill(seen);
      thisLoadPrefillRef.current = rememberPrefill(thisLoadPrefillRef.current, values);
      postToParent({ type: "vf-prefill-applied", applied: r.applied, kept: r.kept, ignored });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbed]);
  const readyPostedRef = useRef(false);
  useEffect(() => {
    if (!isEmbed || !venue?.ownerId || readyPostedRef.current) return;
    readyPostedRef.current = true;
    postToParent({ type: "vf-ready", prefill: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbed, venue?.ownerId]);

  // The sticky BACK/SUBMIT row (frameShort, above): stepped embed, step 2,
  // inline frames only. Fields scrolled into view (focus, an invalid SUBMIT)
  // stop above it.
  const stickyActions = isEmbed && !isCompact && !isFloatingPlacement && frameShort && embedStep === 2 && !submitted;
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = stickyBarRef.current;
    if (!stickyActions || !el) { root.style.scrollPaddingBottom = ""; return; }
    const set = () => { root.style.scrollPaddingBottom = `${Math.ceil(el.getBoundingClientRect().height) + 8}px`; };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.scrollPaddingBottom = ""; };
  }, [stickyActions]);

  const resetForm = () => {
    genRef.current++;
    captureRef.current = null;
    pinger.stop();
    submittedRef.current = false;
    clearDraft();
    try { sessionStorage.removeItem(sentTokenKey); } catch { /* nothing kept */ }
    // A fresh form as this page opens it: the date, guests and format the
    // venue's page put in the frame's address are kept.
    setForm(applyPrefill({}, thisLoadPrefillRef.current, null).form);
    setRestoredWalkthrough(null);
    setSentElsewhereAt(null);
    setCustomFieldValues({});
    setEmbedStep(1);
    setResumedStep2(false);
    setHeld(NO_HELD);
    setSubmittedLeadId(null);
    setSubmittedLeadToken(null);
    setAutoReply("none");
    setTouchedInvalid(new Set());
    setServerFieldErrors({});
    setSubmitError("");
    setGuestConfirm(null);
    setSubmitted(false);
  };

  // A field the server refused: marked at the field with the server's words,
  // and for a step-1 field in the stepped embed, back to step 1 to fix it.
  const markServerError = (field: string, message: string, value: string, toStepOne: boolean) => {
    setServerFieldErrors(p => ({ ...p, [field]: { message, value } }));
    if (toStepOne && isEmbed && !isCompact) { setResumedStep2(false); setEmbedStep(1); }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`${formId}-${field}`);
      if (!el) return;
      el.focus({ preventScroll: isEmbed });
      if (isEmbed) el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    }));
  };

  // Autosaves a real, contactable lead the moment step 1 (Your Details) is
  // complete — firstName + email are always required by then. Without this,
  // everyone who taps an ad, gets as far as typing their name and email, then
  // bails on the event questions, simply vanishes: no record, no follow-up.
  // Enquiries already announced as partial, so each is sent once at most.
  const partialPostedRef = useRef<Set<number>>(new Set());
  const startCapture = trpc.leads.startCapture.useMutation();
  const startCaptureRef = useRef(startCapture.mutateAsync);
  startCaptureRef.current = startCapture.mutateAsync;
  // NEXT's save, in the background: NEXT never waits on it. Once per person,
  // so BACK then NEXT again (or a reload in between) doesn't save a second
  // lead. An email changed after an earlier NEXT on this page load updates
  // that same lead (leadToSupersede); anyone else (a lead restored after a
  // reload, or after START FRESH) gets their own. A save still on its way is
  // waited for first, so the email change can't miss the lead it answers with.
  const saveStep1 = (owner: number) => {
    const values = {
      firstName: (form.firstName ?? '').trim(),
      lastName: form.lastName?.trim() || undefined,
      email: (form.email ?? '').trim(),
      phone: form.phone?.trim() || undefined,
      company: form.company?.trim() || undefined,
    };
    if (!captureRef.current && canReuseLead(heldRef.current, values.email)) return;
    const typed = form;
    const hp = honeypot || undefined;
    const gen = genRef.current;
    const before = captureRef.current;
    const run = (async () => {
      if (before) await before.catch(() => {});
      if (gen !== genRef.current) return;
      const current = heldRef.current;
      if (canReuseLead(current, values.email)) return;
      const supersede = leadToSupersede(current, values);
      if (!supersede) setHeld(NO_HELD);
      await waitForFormToken();
      if (gen !== genRef.current) return;
      try {
        const data = await startCaptureRef.current({ ownerId: owner, ...values, hp, formToken: sendFormToken(), ...clickAttribution, ...(supersede ?? {}) });
        if (gen !== genRef.current) return;
        // leadId 0 means the server's bot check kept nothing: no lead to reuse.
        if (data.leadId > 0 && data.leadToken) {
          const same = supersede?.leadId === data.leadId;
          setHeld({
            leadId: data.leadId, leadToken: data.leadToken, leadEmail: normaliseEmail(values.email),
            leadAt: same ? (current.leadAt ?? Date.now()) : Date.now(), fromThisPage: true,
            leadName: { firstName: values.firstName, lastName: values.lastName ?? "", phone: values.phone ?? "" },
          });
          // Never after the enquiry itself was announced.
          if (!partialPostedRef.current.has(data.leadId) && !submittedRef.current) {
            partialPostedRef.current.add(data.leadId);
            postEnquiryToParent({ type: 'vf-partial-captured', enquiryId: data.leadId, budgetRange: formRef.current.budgetRange || null });
          }
        }
        // Dropped while a lead is held: keep it, so SUBMIT can still complete
        // it with the corrected email rather than leave it "Unfinished".
      } catch (e) {
        if (gen !== genRef.current || submittedRef.current) return;
        // A background save: a network failure stays quiet (SUBMIT falls back
        // to a normal insert). A refused step-1 answer is shown on step 1.
        const v = describeEnquiryError(e, isEnquiryTimeout(e));
        if (!v.network && v.stepOne && v.field) markServerError(v.field, v.field === 'email' ? EMAIL_INVALID : v.text, typed[v.field] ?? '', true);
      }
    })();
    const p: Promise<void> = run.finally(() => { if (captureRef.current === p) captureRef.current = null; });
    captureRef.current = p;
  };

  const submitLead = trpc.leads.submit.useMutation();
  const onSubmitted = (data: any, sent: Record<string, string>) => {
    const id = typeof data?.id === "number" ? data.id : 0;
    const token = typeof data?.leadToken === "string" && data.leadToken ? data.leadToken : null;
    submittedRef.current = true;
    pinger.stop();
    setSubmitted(true);
    setSubmittedLeadId(id > 0 ? id : null);
    setSubmittedLeadToken(id > 0 ? token : null);
    setAutoReply(autoReplyState(data));
    setRestoredWalkthrough(null);
    setSentElsewhereAt(null);
    clearDraft();
    rememberSent(id > 0 ? id : null, id > 0 ? token : null);
    // ── Conversion signal ───────────────────────────────────────────────
    // Embedding pages (and tag managers on them) need to know a submission
    // happened — Google Ads conversion tracking can't see inside the
    // iframe. Fired on BOTH modes; deliberately carries NO personal data,
    // only the qualifiers useful for value-based bidding.
    //
    // Only ever to the parent's exact origin, never "*". The enquiry id lets
    // the page count each enquiry once (Google Ads transaction_id). Email
    // and phone, for Google's enhanced conversions, go only to the venue's
    // own website (its domain over https); any other page gets the message
    // without them.
    // An id of 0 is the server's pretend success for a submission its bot
    // check dropped: nothing was saved, so it is not a conversion (the
    // venue's page would record an ad conversion "vf-0"). An enquiry this
    // page already announced (a repeated SUBMIT) isn't announced again.
    if (parentOrigin && id > 0 && !postedSubmittedRef.current.has(id)) {
      postedSubmittedRef.current.add(id);
      const toVenueSite = isVenueSiteOrigin(parentOrigin, (venue as any)?.website);
      postEnquiryToParent({
        type: "vf-enquiry-submitted",
        enquiryId: id,
        eventType: sent.eventType || null,
        guestCount: guestCountValue(sent.guestCount),
        budgetRange: sent.budgetRange || null,
        eventFormat: sent.eventFormat || null,
        source: clickAttribution.utmSource || (isEmbed ? "embed" : "web"),
        ...(toVenueSite ? { email: (sent.email ?? "").trim() || null, phone: (sent.phone ?? "").trim() || null } : {}),
      });
    }
    // ── Optional thank-you redirect (?redirect=…) ───────────────────────
    // Full-page mode only (navigating inside the iframe helps nobody). To
    // keep this from being an open-redirect lure, the target must be https
    // and on the venue's own website domain (or a subdomain of it).
    if (!isEmbed) {
      const target = sp.get("redirect");
      const site = ((venue as any)?.website ?? "").toString();
      if (target && site) {
        try {
          const t = new URL(target);
          const v = new URL(site.startsWith("http") ? site : `https://${site}`);
          const okHost = t.hostname === v.hostname || t.hostname.endsWith(`.${v.hostname.replace(/^www\./, "")}`) || t.hostname === v.hostname.replace(/^www\./, "");
          if (t.protocol === "https:" && okHost) {
            setTimeout(() => { window.location.href = t.href; }, 1200);
          }
        } catch { /* malformed redirect — ignore, show the normal thank-you */ }
      }
    }
  };
  const onSubmitError = (e: unknown, sent: Record<string, string>) => {
    // A Turnstile token is single-use — fetch a fresh one for the retry.
    setTurnstileReset(n => n + 1);
    // The real reason, in words a visitor can act on: no answer at all, a
    // field to fix (at that field, on its own step), "too many submissions".
    const v = describeEnquiryError(e, isEnquiryTimeout(e));
    if (v.field && visibleFields.some(f => f.id === v.field)) {
      markServerError(v.field, v.field === 'email' ? EMAIL_INVALID : v.text, sent[v.field] ?? '', v.stepOne);
      if (!(v.stepOne && isEmbed && !isCompact)) setSubmitError(v.text);
      return;
    }
    // Either way, give them a route that cannot fail — the venue's email.
    const fallback = (venue as any)?.email ? ` You can also email us directly at ${(venue as any).email}.` : "";
    setSubmitError(`${v.text}${fallback}`);
  };

  const doSubmit = async (opts: { guestsConfirmed?: number } = {}) => {
    if (sendingRef.current) return;
    if (!venue?.ownerId) {
      // The venue's details didn't load: try again, and keep everything typed.
      void venueQ.refetch();
      setSubmitError("We couldn't load the venue's details just now. Please wait a moment and tap SUBMIT again.");
      return;
    }
    // Every required field must actually be filled — checked explicitly here,
    // not just via each input's `required` attribute, because source,
    // eventFormat and budgetRange are button groups with no real <input>
    // behind them for native HTML validation to see, and the embed widget
    // submits via onClick, where native form validation never runs at all
    // (even for eventType's <select>). Guest count gets its own check below
    // since "filled" isn't the same as "a valid number".
    const invalid = requiredInOrder().filter(([f, isCustom]) => !isFieldFilled(f, isCustom) || serverErrorOn(f, isCustom)).map(([f]) => f);
    if (invalid.length > 0) {
      setTouchedInvalid(new Set(invalid.map(f => f.id)));
      setSubmitError("");
      // The errors are at the fields (and stay there), so the toast is only a
      // pointer to them: one at a time, timed like other toasts rather than
      // left up with a message that goes stale as the fields are fixed. None in
      // the embed, where it would cover the SUBMIT button.
      if (!isEmbed) toast.error(fieldErrorMessage(invalid[0]), { id: "lead-form-invalid", duration: 4000 });
      // A step-1 answer missing while step 2 is showing: back to step 1.
      const toStepOne = isEmbed && !isCompact && embedStep === 2 && detailFields.some(f => f.id === invalid[0].id);
      if (toStepOne) { setResumedStep2(false); setEmbedStep(1); }
      // Land keyboard/screen-reader focus right on the first problem field —
      // the toast alone is easy to miss, especially for a screen reader user
      // who isn't looking at the corner of the screen it appears in. In the
      // embed it can be far above SUBMIT, so bring it (and its label) into
      // view as well.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById(fieldElId(invalid[0]));
        if (!el) return;
        el.focus({ preventScroll: isEmbed });
        if (isEmbed) el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
      }));
      return;
    }
    setTouchedInvalid(new Set());
    setSubmitError("");
    toast.dismiss("lead-form-invalid");
    // "30-40" typed on Safari's number pad used to arrive as 3040: a very
    // large number is checked with the visitor first.
    const big = guestCountToConfirm(form.guestCount);
    if (big != null && opts.guestsConfirmed !== big) { setGuestConfirm(big); return; }
    setGuestConfirm(null);
    const sent = form;
    const owner = venue.ownerId;
    sendingRef.current = true;
    setSending(true);
    try {
      // Step 1's save may still be on its way (SUBMIT straight after NEXT):
      // wait a little for it, so this completes that lead instead of leaving
      // it behind as a stray "Partial" (and a false "Unfinished" alert).
      const pending = captureRef.current;
      if (pending) await Promise.race([pending.catch(() => {}), sleep(SUBMIT_WAITS_FOR_CAPTURE_MS)]);
      // The lead to complete: the visitor's own step 1 (no wait: the server
      // already timed it), or for a corrected email the lead this page saved.
      const target = leadForSubmit(heldRef.current, sent);
      if (!target?.own) await waitForFormToken();
      const when = eventDateForWire({ eventDate: sent.eventDate, eventTime: sent.eventTime, noDateYet: sent[NO_DATE_KEY] === "1" });
      const extra = eventExtraFor(sent.eventType, eventFields.some(f => f.id === 'eventFormat'));
      const data = await submitLead.mutateAsync({
        ownerId: owner,
        ...(target ? { leadId: target.leadId, leadToken: target.leadToken } : {}),
        firstName: (sent.firstName ?? '').trim(),
        lastName: sent.lastName?.trim() || undefined,
        email: (sent.email ?? '').trim(),
        phone: sent.phone?.trim() || undefined,
        company: sent.company?.trim() || undefined,
        eventType: sent.eventType || undefined,
        // The venue's wall clock: "2026-12-12" and "19:00" (the server puts
        // them in the venue's time zone, whatever this device is set to).
        eventDate: when.eventDate,
        eventTime: when.eventTime,
        dateFlexible: sent[NO_DATE_KEY] === "1",
        guestCount: guestCountValue(sent.guestCount) ?? undefined,
        eventFormat: (sent.eventFormat || undefined) as any,
        budgetRange: (sent.budgetRange || undefined) as any,
        budget: sent.budget ? parseFloat(sent.budget) : undefined,
        eventDetail: extra ? sent.eventDetail?.trim() || undefined : undefined,
        invoicingNote: sent.invoicingNote?.trim() || undefined,
        message: buildEnquiryMessage({ message: sent.message, custom: Object.entries(customFieldValues), guestCount: sent.guestCount, timeLine: when.timeLine }),
        source: sent.source || "lead_form",
        spaceId: showSpacePicker && pickedSpace ? pickedSpace.id : (formSpaces.length === 1 ? formSpaces[0].id : undefined),
        hp: honeypot || undefined,
        formToken: sendFormToken(),
        turnstileToken: turnstileToken ?? undefined,
        ...clickAttribution,
      });
      onSubmitted(data, sent);
    } catch (e) {
      onSubmitError(e, sent);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void doSubmit(); };
  // Every field SUBMIT checks, in the order they're checked (the first one
  // missing gets focus), each with whether it's a custom field.
  const requiredInOrder = (): Array<[FormFieldDef, boolean]> => [
    ...eventFields.map(f => [f, false] as [FormFieldDef, boolean]),
    ...detailFields.map(f => [f, false] as [FormFieldDef, boolean]),
    ...customFields.map(f => [f, true] as [FormFieldDef, boolean]),
    ...(sourceField ? [[sourceField, false] as [FormFieldDef, boolean]] : []),
    ...(messageField ? [[messageField, false] as [FormFieldDef, boolean]] : []),
  ];

  /**
   * Whether a field marked `required` in the venue's Lead Form settings is
   * actually filled in. This is the single source of truth both validation
   * paths below defer to, because "required" was previously only decorative
   * for anything beyond First Name / Email:
   *   - The embed's step gate checked ONLY firstName + email format, so a
   *     venue that requires Last Name, Phone or Company (this one does) had
   *     those silently skipped — confirmed with a real submission landing
   *     with all three blank despite the setting.
   *   - Neither mode enforces a required Event Type, Format, Budget range or
   *     "How did you hear" — they render as button groups, not <input>s, so
   *     there was never a real form control for native HTML validation (or
   *     this check) to see.
   */
  const isFieldFilled = (field: FormFieldDef, isCustomField = false): boolean => {
    // A guest count is read the way people type one ("30-40", "50+",
    // "approx 40"); one with no number in it, 0, or too many is never sent,
    // required or not.
    if (!isCustomField && field.id === 'guestCount') return !guestCountError(form.guestCount, !!field.required);
    // Exactly the server's email rule (shared/enquiryRules.ts), so an address
    // NEXT lets through is never refused at SUBMIT on step 2.
    if (!isCustomField && field.id === 'email' && (form.email ?? '').trim()) return isValidEnquiryEmail(form.email);
    if (!field.required) return true;
    if (isCustomField) return !!(customFieldValues[field.label] ?? '').trim();
    if (field.id === 'eventDate') return noDateYet || !!(form.eventDate ?? '').trim();
    return !!(form[field.id] ?? '').trim();
  };
  // The server refused this field's current value (it hasn't been changed since).
  const serverErrorOn = (f: FormFieldDef, isCustom = false) => {
    const e = isCustom ? undefined : serverFieldErrors[f.id];
    return !!e && e.value === (form[f.id] ?? '');
  };

  // Error id/message plumbing for inline field errors — the single place
  // that decides whether a field should show as invalid right now, so a
  // field's error disappears the moment it's actually fixed (isFieldFilled
  // says so again) without any separate per-keystroke clearing logic.
  const fieldErrorId = (f: FormFieldDef) => `${fieldElId(f)}-error`;
  const fieldHasError = (f: FormFieldDef, isCustom = false) => (touchedInvalid.has(f.id) && !isFieldFilled(f, isCustom)) || serverErrorOn(f, isCustom);
  // Something typed but not valid gets its own wording: "Please fill in
  // Email" for an address that is filled in (just malformed) misled people.
  const fieldErrorMessage = (f: FormFieldDef) => {
    if (f.id === 'email' && (form.email ?? '').trim()) return EMAIL_INVALID;
    if (f.id === 'guestCount') return guestCountError(form.guestCount, true) ?? "Please tell us how many guests you're expecting.";
    if (serverErrorOn(f)) return serverFieldErrors[f.id].message;
    return `Please fill in "${f.label}".`;
  };
  function FieldError({ field, isCustom }: { field: FormFieldDef; isCustom?: boolean }) {
    if (!fieldHasError(field, isCustom)) return null;
    return <p id={fieldErrorId(field)} role="alert" className="text-red-700 text-xs mt-1">{fieldErrorMessage(field)}</p>;
  }

  // A required field is only obvious if every field label says so. Some
  // labels (Event type, Guest Count, Format, Budget range in the embed's
  // Step 1; "WHAT KIND OF EVENT?" on the full page) were hardcoded text
  // with no asterisk at all, so a required field could block the Next/
  // Submit button with no visible reason why. One marker, used everywhere.
  const reqMark = (required?: boolean) => required ? <span className="text-red-700 font-bold"> *</span> : null;

  if (isLoading) return (
    <div className={isEmbed ? "flex items-center justify-center py-12" : "min-h-screen flex items-center justify-center bg-[#f8f5f0]"}>
      <div className="text-xl italic animate-pulse text-gray-600">Loading…</div>
    </div>
  );
  // The venue lookup kept failing (retried with backoff first, and again
  // every 20 s from here): say so and offer Try again, rather than a form
  // without a venue that could never send. Anything typed is kept.
  if (venueFailed) return (
    <main className={isEmbed ? "py-12 px-4 text-center" : "min-h-screen flex items-center justify-center bg-[#f8f5f0] px-4 text-center"}>
      <div className="max-w-md mx-auto" role="alert">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">We couldn&rsquo;t load the form</h1>
        <p className="text-sm text-gray-600 mb-4">Something interrupted the connection. Please check you&rsquo;re online and try again.</p>
        <button type="button" disabled={venueQ.isFetching} onClick={() => { void venueQ.refetch(); }}
          className="h-10 px-5 rounded-md border border-gray-300 bg-white text-sm font-bold tracking-wide uppercase text-gray-700 hover:border-gray-400 disabled:opacity-60">
          {venueQ.isFetching ? "Trying again…" : "Try again"}
        </button>
      </div>
    </main>
  );
  // A wrong or retired link used to show a normal-looking form that only
  // failed at submit, with a passing "Venue not found" toast.
  if (venue === null) return (
    <main className={isEmbed ? "py-12 px-4 text-center" : "min-h-screen flex items-center justify-center bg-[#f8f5f0] px-4 text-center"}>
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">Venue not found</h1>
        <p className="text-sm text-gray-600">This enquiry link doesn&rsquo;t match a venue. It may have changed: check the link with the venue, or contact them directly.</p>
      </div>
    </main>
  );

  const venueName    = venue?.name ?? "VenueFlowHQ Venue";
  const formTitle    = venue?.leadFormTitle ?? "Book Your Event";
  const formSubtitle = venue?.leadFormSubtitle ?? DEFAULT_LEAD_FORM_SUBTITLE;
  const accentOverride = hexParam(paramAccent);
  const bgOverride = hexParam(paramBg);
  const bgTransparent = paramBg === "transparent";

  const primaryColor = accentOverride ?? brand.accent;
  const logoUrl      = (venue as any)?.logoUrl;
  // The white-out filter below only makes sense for a logo with real
  // transparency — a JPEG (never transparent) turns into a solid white
  // square under it. PNG/SVG at least support transparency; anything else
  // (or no recognisable extension, e.g. a bare upload URL) is shown as-is.
  const logoIsInvertible = /\.(svg|png)(?:[?#]|$)/i.test(logoUrl ?? '');
  const logoScale    = (venue as any)?.logoScale ?? 100;
  // Default body font is now Hanken Grotesk (the editorial pairing's sans)
  // rather than Inter — a venue that explicitly picked a font keeps it.
  const formFont     = (venue as any)?.formFont ?? 'hanken';
  // A ?font= param wins (loaded from Google Fonts above); else the saved font.
  // font=inherit → a neutral system stack (the viewer's OS UI font), so the
  // form blends into most sites. A true cross-iframe inherit of the host page's
  // font isn't possible; a venue that needs an exact match passes data-font=Name.
  const fontFamily   = paramFont === "inherit"
    ? 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    : (paramFont && /^[a-zA-Z0-9 ]+$/.test(paramFont))
    ? `'${paramFont.trim()}', system-ui, sans-serif`
    : (FONT_MAP[formFont] ?? FONT_MAP.hanken);
  const textOnPrimary = isLight(primaryColor) ? "#1a1a1a" : "#ffffff";
  const galleryPhotoHeight = (venue as any)?.galleryPhotoHeight ?? 128;
  const successMsg   = (venue as any)?.formSuccessMessage || DEFAULT_FORM_SUCCESS_MESSAGE;
  // Only point people at their inbox when the confirmation email really went
  // (or is on its way: the server sends it just after answering).
  const inboxNote = autoReplyNote(autoReply);
  // Warm cream/linen defaults — a venue's own formPageBg/formCardBg still wins.
  const formPageBg      = bgTransparent ? "transparent" : (bgOverride || (venue as any)?.formPageBg || "#f4efe6");
  const formPageBgImage = bgTransparent ? null : ((venue as any)?.formPageBgImage || null);
  // Embedded forms blend into the host page by default (transparent card, no
  // frame) so they look native wherever they're dropped in; a venue that wants
  // a solid card can still set formCardBg or pass ?bg=<hex>. The full-page form
  // keeps its cream card.
  const formCardBg      = bgTransparent ? "transparent" : (bgOverride || (isEmbed ? "transparent" : ((venue as any)?.formCardBg || "#fffdf9")));
  // A colour saved without its "#" (e.g. "E51F1A") isn't valid CSS and rendered
  // the button and selected pills invisible — accept it either way.
  // When the venue has opted into a Brand Pack accent, it leads here too — the
  // way the proposal page is branded — rather than a legacy per-form button
  // colour. Venues with no Brand Pack accent keep their saved formButtonColor.
  const formButtonColor = withHash(
    accentOverride
    || ((venue as any)?.brandAccentColor ? brand.accent : ((venue as any)?.formButtonColor || primaryColor))
  );
  const textOnButton    = isLight(formButtonColor) ? "#1a1a1a" : "#ffffff";

  let galleryImages: string[] = [];
  try { galleryImages = JSON.parse((venue as any)?.formGalleryImages ?? '[]') || []; } catch {}

  // Merge, don't replace: a saved config from before a default field existed
  // (Company, Preferred Time) must still show that field.
  let fields: FormFieldDef[] = mergeFormFields(null);
  try {
    fields = mergeFormFields(JSON.parse((venue as any)?.customFormFields ?? ''));
  } catch {}
  // The space question only makes sense with two or more spaces to choose
  // from — otherwise it's dropped entirely (so "required" can't block a form
  // with nothing to pick).
  const visibleFields = fields.filter(f => f.visible && (f.id !== 'spaceId' || showSpacePicker));

  const detailIds = new Set(['firstName', 'lastName', 'email', 'phone', 'company']);
  const eventIds = new Set(['eventType', 'spaceId', 'eventDate', 'eventTime', 'guestCount', 'eventFormat', 'budgetRange', 'budget']);
  const detailFields = visibleFields.filter(f => detailIds.has(f.id));
  const eventFields = visibleFields.filter(f => eventIds.has(f.id));
  const sourceField = visibleFields.find(f => f.id === 'source');
  const messageField = visibleFields.find(f => f.id === 'message');
  const customFields = visibleFields.filter(f => !f.isDefault);

  // Pick up where the visitor was before a reload, now the venue is known:
  // another venue's record is ignored, and step 2 needs step 1's details
  // (the venue may have made another one required since). Set during this
  // first render, so nothing is shown or saved before it's checked.
  if (!resumeChecked && venue?.ownerId) {
    setResumeChecked(true);
    // Sent from this device a little while ago: on the page it was sent
    // from, show "Enquiry Received!" again, not an empty step 1; any other
    // page shows the form, with a line saying an enquiry was sent
    // (sentConfirmation). The enquiry sent is never used for another
    // SUBMIT: "Send another enquiry" starts clean.
    const sent = sentConfirmation(storedProgress, {
      ownerId: venue.ownerId, nowMs: Date.now(), keepMs: SENT_CONFIRMATION_KEEP_MS,
      page: thisPage, frame: thisFrame, tabToken: storageOk ? readSentToken() : null,
    });
    if (sent?.samePage) {
      submittedRef.current = true;
      setSubmitted(true);
      setSubmittedLeadId(sent.leadId);
      setSubmittedLeadToken(sent.leadToken);
      setRestoredWalkthrough(sent.walkthroughSummary);
      setEmbedStep(1);
      setHeld(NO_HELD);
      lastFocusKey.current = "done-1"; // not something the visitor did: focus stays put
    } else {
      if (sent) setSentElsewhereAt(sent.sentAt);
      const r = resumeFrom(storedProgress, { ownerId: venue.ownerId, detailsValid: detailFields.every(f => isFieldFilled(f)), email: form.email, nowMs: Date.now() });
      setResumedStep2(r.step === 2);
      if (r.step !== embedStep || r.leadId !== held.leadId) {
        setEmbedStep(r.step);
        // Restored, not saved by this page load: never given another email.
        setHeld({ leadId: r.leadId, leadToken: r.leadToken, leadEmail: r.leadEmail, leadAt: r.leadAt, fromThisPage: false });
        lastFocusKey.current = `form-${r.step}`; // not a step change the visitor made: focus stays put
      }
    }
  }

  // text-base (16px) on real inputs even in the compact embed: iOS Safari
  // zooms the page when a focused field's font is under 16px, which yanks the
  // host page around. 16px keeps the tap-to-focus steady.
  const inputClass = isEmbed
    ? "rounded-sm border border-[#6a7282] focus-visible:ring-1 focus-visible:ring-offset-0 text-base bg-white min-h-[40px] px-2"
    : "rounded-sm border border-[#6a7282] focus-visible:ring-1 focus-visible:ring-offset-0 text-base bg-white";

  // Price guidance once a space or a guest count is chosen (a one-space
  // venue's space counts as chosen).
  const guestsN = guestCountValue(form.guestCount);
  const guidance = priceGuidance(
    formSpaces,
    pickedSpace ?? (formSpaces.length === 1 && guestsN ? formSpaces[0] : undefined),
    guestsN,
    noDateYet ? '' : (form.eventDate ?? ''),
  );
  const spaceField = eventFields.find(f => f.id === 'spaceId');
  function renderPriceHint() {
    return (
      <div aria-live="polite">
        {guidance.hint && (
          <p className="text-xs italic leading-snug" style={{ fontFamily: HEADING_FONT, color: '#6a6256' }}>{guidance.hint}</p>
        )}
      </div>
    );
  }
  // Hidden from people (off-screen, not focusable, ignored by screen
  // readers); form-filling bots fill it in, and the server then drops the
  // submission while showing them a normal success. Its name says nothing a
  // browser's autofill or a password manager would take for a URL, email,
  // name, phone or code, and it is marked for those tools to skip. (On the
  // wire it is still `hp`.)
  function renderHoneypot() {
    return (
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Leave blank
          <input type="text" name="vf-hp-extra" tabIndex={-1} autoComplete="off"
            data-1p-ignore="" data-lpignore="true" data-bwignore="" data-form-type="other"
            value={honeypot} onChange={e => setHoneypot(e.target.value)} />
        </label>
      </div>
    );
  }
  function renderTurnstile() {
    if (!formConfig?.turnstileSiteKey) return null;
    return <TurnstileBox siteKey={formConfig.turnstileSiteKey} onToken={setTurnstileToken} resetKey={turnstileReset} />;
  }

  function renderField(field: FormFieldDef, isCustom = false) {
    const value = isCustom ? (customFieldValues[field.label] ?? '') : (form[field.id] ?? '');
    const onChange = isCustom
      ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomFieldValues(p => ({ ...p, [field.label]: e.target.value }))
      : (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [field.id]: e.target.value }));

    if (field.id === 'eventType') return renderEventTypeSelect();
    if (field.id === 'source') return renderSourcePills();
    if (field.id === 'eventFormat' || field.id === 'budgetRange' || field.id === 'spaceId') return renderChoicePills(field);

    const controlId = fieldElId(field);
    const hasError = fieldHasError(field, isCustom);
    const describedBy = hasError ? fieldErrorId(field) : undefined;

    if (field.type === 'textarea') {
      const placeholder = field.id === 'message'
        ? (MESSAGE_PLACEHOLDER[form.eventType ?? ''] || "Occasion, seating, dietaries…")
        : "Any additional details…";
      // The server's limits, so a long answer stops at the box instead of
      // failing at SUBMIT. Near the end of the message box, a count.
      const max = !isCustom && field.id === 'message' ? ENQUIRY_LIMITS.message : ENQUIRY_LIMITS.customField;
      const countId = `${controlId}-count`;
      const showCount = value.length >= max * 0.9;
      return (
        <>
          <Textarea id={controlId} value={value} onChange={onChange} required={field.required}
            maxLength={max}
            aria-invalid={hasError} aria-describedby={[describedBy, showCount ? countId : undefined].filter(Boolean).join(' ') || undefined}
            placeholder={placeholder}
            rows={isEmbed ? 2 : 4} className={`${inputClass} resize-none ${isEmbed ? 'py-1.5 px-2' : ''}`} />
          {showCount && (
            <p id={countId} className="text-[11px] text-gray-600 mt-0.5 text-right">{value.length.toLocaleString('en-NZ')} of {max.toLocaleString('en-NZ')} characters</p>
          )}
          <FieldError field={field} isCustom={isCustom} />
        </>
      );
    }
    // The date gets an explicit "no date yet" answer: clients without one were
    // guessing a date or walking away. Stored on the lead as dateFlexible.
    if (field.id === 'eventDate') {
      return (
        <div>
          <DatePickerField
            id={controlId}
            value={value}
            onChange={(v) => { setNoDateYet(false); setForm(p => ({ ...p, eventDate: v })); }}
            // Today at the venue, not on this device's calendar.
            min={wallDateKeyInTz(new Date(), formConfig?.timeZone ?? "Pacific/Auckland")}
            availability={availabilityOpts}
            disabled={noDateYet}
            ariaInvalid={hasError}
            ariaDescribedby={describedBy}
            inputClass={inputClass}
            accentColor={formButtonColor}
            accentTextColor={textOnButton}
          />
          <label className="flex items-center gap-1.5 mt-1.5 min-h-[24px] cursor-pointer select-none text-xs text-gray-600">
            <input type="checkbox" checked={noDateYet}
              onChange={e => { setNoDateYet(e.target.checked); if (e.target.checked) setForm(p => ({ ...p, eventDate: '', eventTime: '' })); }}
              className="h-3.5 w-3.5 accent-current" />
            No date yet — we&rsquo;re flexible
          </label>
          <FieldError field={field} isCustom={isCustom} />
          {/* Never a block — just a heads-up that we'll confirm. */}
          <div aria-live="polite">
            {value && !noDateYet && chosenDateState && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-snug" style={{ color: '#7a5c2e' }}>
                <span aria-hidden="true" className="mt-[5px] w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: '#b08d57' }} />
                {chosenDateState === 'limited'
                  ? <>This date is popular — we&rsquo;ll confirm availability.</>
                  : pickedSpace
                  ? <>{pickedSpace.name} looks booked that day — we&rsquo;ll confirm and suggest options.</>
                  : <>This date looks booked — we&rsquo;ll confirm and suggest nearby dates.</>}
              </p>
            )}
          </div>
        </div>
      );
    }
    if (field.id === 'eventTime') {
      // A time with no date can't be placed on a day: it goes into the
      // message instead ("Preferred time: 7:30 pm"), and this says so.
      const timeOnly = !!value && (noDateYet || !(form.eventDate ?? '').trim());
      return (
        <>
          <TimePickerField
            id={controlId}
            value={value}
            onChange={(v) => setForm(p => ({ ...p, eventTime: v }))}
            ariaInvalid={hasError}
            ariaDescribedby={[describedBy, timeOnly ? `${controlId}-note` : undefined].filter(Boolean).join(' ') || undefined}
            inputClass={inputClass}
            accentColor={formButtonColor}
            accentTextColor={textOnButton}
          />
          {timeOnly && <p id={`${controlId}-note`} className="text-[11px] text-gray-600 mt-1 leading-snug">No date yet, so we&rsquo;ll pass this time on in your message.</p>}
          <FieldError field={field} isCustom={isCustom} />
        </>
      );
    }
    // Email: a one-tap "did you mean gmail.com?" fix for a common domain
    // typo — never a hard block, just a suggestion under the field.
    if (field.id === 'email') {
      // An address the server would refuse only for a stray character (a
      // trailing full stop or comma, a space, an invisible character from a
      // paste) gets the same one-tap fix as a domain typo.
      const tidy = tidyEnquiryEmail(value);
      const fix = suggestEmailFix(tidy ?? value) ?? tidy;
      const showFix = !!fix && fix !== value.trim().toLowerCase();
      return (
        <>
          <Input id={controlId} type="email" value={value} onChange={onChange} required={field.required}
            autoComplete={!isCustom ? AUTOCOMPLETE.email : undefined}
            maxLength={!isCustom ? MAX_LENGTH.email : ENQUIRY_LIMITS.customField}
            aria-invalid={hasError} aria-describedby={describedBy}
            placeholder="" className={inputClass} />
          {showFix && (
            <button type="button" onClick={() => setForm(p => ({ ...p, email: fix as string }))}
              className="mt-1 block text-left text-xs text-gray-500">
              Did you mean <strong style={{ color: formButtonColor }}>{fix}</strong>?
            </button>
          )}
          <FieldError field={field} isCustom={isCustom} />
        </>
      );
    }
    // Guest count: a text box with the number pad, read leniently ("30-40",
    // "50+", "approx 40"). A number input threw a range away (Chrome) or
    // merged it into 3040 (Safari).
    if (!isCustom && field.id === 'guestCount') {
      const note = guestCountNote(value);
      const noteId = `${controlId}-note`;
      return (
        <>
          <Input id={controlId} type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off"
            value={value} onChange={e => { setGuestConfirm(null); onChange(e); }}
            required={field.required} maxLength={60}
            aria-invalid={hasError}
            aria-describedby={[describedBy, note ? noteId : undefined].filter(Boolean).join(' ') || undefined}
            className={inputClass} />
          <div aria-live="polite">
            {note && <p id={noteId} className="text-[11px] text-gray-600 mt-1 leading-snug">{note}</p>}
          </div>
          <FieldError field={field} isCustom={isCustom} />
        </>
      );
    }
    const input = (
      <Input
        id={controlId}
        type={field.type}
        value={value}
        onChange={onChange}
        // NZ phone auto-format, applied on blur (never mid-keystroke, or the
        // cursor jumps around while typing).
        onBlur={field.id === 'phone' ? (e: React.FocusEvent<HTMLInputElement>) => setForm(p => ({ ...p, phone: formatNZPhone(e.target.value) })) : undefined}
        required={field.required}
        autoComplete={!isCustom ? AUTOCOMPLETE[field.id] : undefined}
        maxLength={!isCustom ? MAX_LENGTH[field.id] : ENQUIRY_LIMITS.customField}
        aria-invalid={hasError}
        aria-describedby={describedBy}
        placeholder={field.id === 'phone' ? '+64 21 000 0000' : ''}
        className={inputClass}
      />
    );
    return <>{input}<FieldError field={field} isCustom={isCustom} /></>;
  }

  /* ── Qualifying pills: format + budget bracket. One tap, tap again to
        clear — never a typed number, the bracket IS the answer. Sized (and
        gapped) for a comfortable mobile tap target: these carry Format and
        Budget range, the fields that actually qualify a lead. A real
        radiogroup (not just visually pill-shaped buttons) so a screen
        reader announces the group's name, how many options, and which one
        (if any) is currently selected. ────────────────────────────────── */
  function renderChoicePills(field: FormFieldDef) {
    const options: ReadonlyArray<{ value: string; label: string }> = field.id === 'eventFormat' ? EVENT_FORMAT_OPTIONS
      : field.id === 'spaceId' ? formSpaces.map(sp => ({ value: String(sp.id), label: sp.name }))
      : BUDGET_RANGE_OPTIONS;
    const selected = form[field.id] ?? '';
    // Budget bracket ÷ guest count, live — helps people self-qualify instead
    // of guessing whether their headcount fits the bracket they picked.
    const perGuest = field.id === 'budgetRange' ? perGuestBudget(selected, guestsN) : null;
    const budgetGuide = field.id === 'budgetRange' ? guidance.budget : null;
    return (
      <>
        {/* One Tab stop per group; arrow keys move and choose, and Space keeps the
            choice, as radio buttons do. Clicking the chosen pill still clears it, as before. */}
        <div role="radiogroup" aria-labelledby={`${fieldElId(field)}-label`} id={fieldElId(field)} tabIndex={-1} onKeyDown={onArrowChoose} className="flex gap-2 flex-wrap items-center">
          {options.map((o, idx) => {
            const isSel = selected === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={isSel}
                tabIndex={rovingTabIndex(isSel, idx, options.some(x => x.value === selected))}
                onClick={e => setForm(p => ({ ...p, [field.id]: clearsChoice(isSel, e) ? '' : o.value }))}
                className={`rounded-full border transition-all ${isEmbed ? 'px-3 py-2 text-[11px]' : 'px-3.5 py-1.5 text-xs'} ${isSel ? 'font-semibold shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                style={isSel ? { backgroundColor: formButtonColor, color: textOnButton, borderColor: formButtonColor } : {}}>
                {o.label}
              </button>
            );
          })}
          {perGuest && (
            <span className="text-xs italic" style={{ fontFamily: HEADING_FONT, color: '#6a6256' }}>{perGuest}</span>
          )}
        </div>
        {budgetGuide && (
          <p className="mt-1.5 text-xs italic leading-snug" style={{ fontFamily: HEADING_FONT, color: '#6a6256' }}>{budgetGuide}</p>
        )}
        <FieldError field={field} />
      </>
    );
  }

  /* ── Event type — a plain dropdown. A real <select> also gives the
        full page's native form validation something to actually enforce
        `required` against, which the old tappable card grid never had. ── */
  function renderEventTypeSelect() {
    const field = eventFields.find(f => f.id === 'eventType');
    const hasError = field ? fieldHasError(field) : false;
    const extra = eventExtraFor(form.eventType, eventFields.some(f => f.id === 'eventFormat'));
    const isCorporate = form.eventType === 'Corporate Dinner';
    return (
      <>
        <select
          id={field ? fieldElId(field) : undefined}
          value={form.eventType ?? ''}
          onChange={e => setForm(p => ({ ...p, eventType: e.target.value, eventDetail: '' }))}
          required={field?.required}
          aria-invalid={hasError}
          aria-describedby={field && hasError ? fieldErrorId(field) : undefined}
          // Full width and the same height as the other fields: it used to render as a
          // narrow, 24px-tall native box beside them — the first thing a client sees.
          className={`${inputClass} w-full ${isEmbed ? "" : "min-h-[40px] px-3"}`}
        >
          <option value="">Select an event type…</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {field && <FieldError field={field} />}
        {/* One relevant follow-up per event type — never the whole fixed
            field list at once. */}
        {extra && (
          <div className="mt-2.5">
            <label id={`${formId}-event-detail-label`} className="font-semibold text-[11px] tracking-wide block mb-1.5 text-gray-600">{extra.label}</label>
            {extra.text ? (
              <Input type="text" value={form.eventDetail ?? ''} onChange={e => setForm(p => ({ ...p, eventDetail: e.target.value }))}
                aria-labelledby={`${formId}-event-detail-label`} maxLength={ENQUIRY_LIMITS.eventDetail}
                placeholder="Engagement, farewell, product launch…" className={inputClass} />
            ) : (
              <div role="radiogroup" aria-labelledby={`${formId}-event-detail-label`} onKeyDown={onArrowChoose} className="flex gap-2 flex-wrap">
                {extra.opts!.map((o, idx) => {
                  const isSel = form.eventDetail === o;
                  return (
                    <button key={o} type="button" role="radio" aria-checked={isSel}
                      tabIndex={rovingTabIndex(isSel, idx, extra.opts!.includes(form.eventDetail ?? ''))}
                      onClick={e => setForm(p => ({ ...p, eventDetail: clearsChoice(isSel, e) ? '' : o }))}
                      className={`rounded-full border transition-all ${isEmbed ? 'px-3 py-2 text-[11px]' : 'px-3.5 py-1.5 text-xs'} ${isSel ? 'font-semibold shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                      style={isSel ? { backgroundColor: formButtonColor, color: textOnButton, borderColor: formButtonColor } : {}}>
                      {o}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Corporate-only: an "invoice to" line, additive to whatever the
            venue already configured for Company (which stays governed by
            its own visible/required settings, unchanged here). */}
        {isCorporate && (
          <div className="mt-2.5">
            <label htmlFor={`${formId}-invoicingNote`} className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-600">Invoice to</label>
            <Input id={`${formId}-invoicingNote`} type="text" value={form.invoicingNote ?? ''} onChange={e => setForm(p => ({ ...p, invoicingNote: e.target.value }))}
              maxLength={ENQUIRY_LIMITS.invoicingNote}
              placeholder="Accounts email or PO no." className={inputClass} />
          </div>
        )}
      </>
    );
  }

  /* ── NowBookIt-style selectable pills (how did you hear) — same
        radiogroup treatment as the format/budget pills above. Previously
        the only group here with literally no selected-state exposed to
        assistive tech at all (no aria-pressed, nothing). ───────────────── */
  function renderSourcePills() {
    const selected = form.source ?? '';
    return (
      <>
        <div role="radiogroup" aria-labelledby={`${formId}-source-label`} id={`${formId}-source`} tabIndex={-1} onKeyDown={onArrowChoose} className="flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map((s, idx) => {
            const isSel = selected === s;
            return (
              <button key={s} type="button" role="radio" aria-checked={isSel}
                tabIndex={rovingTabIndex(isSel, idx, (SOURCE_OPTIONS as readonly string[]).includes(selected))}
                onClick={e => setForm(p => ({ ...p, source: clearsChoice(isSel, e) ? '' : s }))}
                className={`rounded-full border transition-all ${isEmbed ? 'px-3 py-2 text-[11px]' : 'px-3.5 py-1.5 text-xs'} ${isSel ? 'font-semibold shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                style={isSel ? { backgroundColor: formButtonColor, color: textOnButton, borderColor: formButtonColor } : {}}>
                {s}
              </button>
            );
          })}
        </div>
        {sourceField && <FieldError field={sourceField} />}
      </>
    );
  }

  /* ── "We kept what you'd started" — shown once, only when a restored
        draft actually had something in it. Dismissing it clears the draft
        so the banner doesn't come back on the next reload of a now-empty
        form. ───────────────────────────────────────────────────────────── */
  function renderDraftNote(size: 'sm' | 'lg') {
    if (!showDraftNote) return null;
    return (
      <div className={`flex items-center justify-between gap-2.5 rounded border border-gray-200 bg-gray-50 ${size === 'lg' ? 'px-4 py-2.5 text-sm mb-5' : 'px-3 py-2 text-xs mb-3'} text-gray-600`}>
        <span>Welcome back — we kept what you&rsquo;d started.</span>
        <button type="button" onClick={resetForm}
          className="font-bold text-[10px] tracking-wide uppercase whitespace-nowrap" style={{ color: formButtonColor }}>
          Start fresh
        </button>
      </div>
    );
  }

  /* ── Step 2 opened by a reload: whose enquiry this is (step 1's name and
        email aren't on screen), with Start fresh for anyone else. ──────── */
  function renderResumedNote() {
    const name = [form.firstName, form.lastName].map(v => (v ?? '').trim()).filter(Boolean).join(' ');
    const email = (form.email ?? '').trim();
    return (
      <div className="flex items-center justify-between gap-2.5 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Welcome back — sending as <strong className="font-semibold text-gray-800">{name}</strong>{email ? <> ({email})</> : null}. Not you?
        </span>
        <button type="button" onClick={resetForm}
          className="font-bold text-[10px] tracking-wide uppercase whitespace-nowrap" style={{ color: formButtonColor }}>
          Start fresh
        </button>
      </div>
    );
  }

  /* ── Post-submit walkthrough request — shared by both the embed and
        full-page confirmation screens (see WalkthroughRequest). Needs the
        lead submit() just created and its proof-of-ownership token. ───── */
  function renderWalkthroughStep(size: 'sm' | 'lg') {
    if (!venue?.ownerId || !submittedLeadId || formConfig?.walkthroughEnabled === false) return null;
    // After a reload: offered again only in the tab that sent it, soon after
    // (the token), and one already asked for is shown as asked for.
    if (!submittedLeadToken && !restoredWalkthrough) return null;
    return (
      <WalkthroughRequest ownerId={venue.ownerId} leadId={submittedLeadId} leadToken={submittedLeadToken}
        clientEmail={(form.email ?? '').trim()} big={size === 'lg'}
        accentColor={formButtonColor} accentTextColor={textOnButton}
        requested={restoredWalkthrough}
        onRequested={(summary) => { rememberWalkthrough(summary); postToParent({ type: "vf-walkthrough-requested" }); }} />
    );
  }

  /* ── An enquiry this device sent a little while ago, from another page (or
        one we can't tell apart): said above the form, not shown again. ── */
  function renderSentNote(size: 'sm' | 'lg') {
    if (sentElsewhereAt == null || submitted) return null;
    const time = new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(sentElsewhereAt));
    return (
      <div role="status" className={`rounded border border-gray-200 bg-gray-50 ${size === 'lg' ? 'px-4 py-2.5 text-sm mb-5' : 'px-3 py-2 text-xs mb-3'} text-gray-600`}>
        Your enquiry was sent at {time}, thank you. To send another one, fill in the form below.
      </div>
    );
  }

  /* ── "Did you mean 3,040 guests?" — asked before sending a very large
        guest count, with Yes (send it) and Change (back to the box). ──── */
  function renderGuestConfirm() {
    if (guestConfirm == null) return null;
    const guestField = eventFields.find(f => f.id === 'guestCount');
    return (
      <div role="alert" className="rounded border border-[#d8cdb8] bg-[#fbf7ef] px-3 py-2 text-xs text-gray-800">
        <p>Did you mean {guestConfirm.toLocaleString('en-NZ')} guests?</p>
        <div className="mt-1.5 flex gap-2">
          <button type="button" onClick={() => { const n = guestConfirm; setGuestConfirm(null); void doSubmit({ guestsConfirmed: n }); }}
            className="rounded px-3 py-1.5 font-bold tracking-wide uppercase text-[11px]" style={{ backgroundColor: formButtonColor, color: textOnButton }}>
            Yes
          </button>
          <button type="button" onClick={() => { setGuestConfirm(null); if (guestField) document.getElementById(fieldElId(guestField))?.focus(); }}
            className="rounded px-3 py-1.5 font-bold tracking-wide uppercase text-[11px] border border-gray-300 bg-white text-gray-700">
            Change
          </button>
        </div>
      </div>
    );
  }

  /* ── EMBED MODE — stepped widget (Booking → Your Details → Summary) ──── */
  if (isEmbed) {
    // Step 1 ("Your Details"): just the contact fields — the fastest
    // possible path to a name + email, so someone who bails on step 2 still
    // leaves behind a real, contactable lead (startCapture, below).
    const detailsValid = detailFields.every(f => isFieldFilled(f));
    // Step 2 ("Your Event"): everything else — event fields, any custom
    // fields, source and message. Submits directly; there's no Summary step,
    // and doSubmit marks anything missing at its field.
    const steps = ['Your Details', 'Your Event'];
    const eventTypeField = eventFields.find(f => f.id === 'eventType');
    const eventDateField = eventFields.find(f => f.id === 'eventDate');
    const timeField = eventFields.find(f => f.id === 'eventTime');
    const guestField = eventFields.find(f => f.id === 'guestCount');
    const formatField = eventFields.find(f => f.id === 'eventFormat');
    const budgetRangeField = eventFields.find(f => f.id === 'budgetRange');
    // What SUBMIT found missing, said again just above it: each field shows
    // its own message, but in the frame SUBMIT is often a screen below it.
    // Goes as soon as they're answered, like the field messages.
    const missing = requiredInOrder().filter(([f, isCustom]) => fieldHasError(f, isCustom)).map(([f]) => f);
    const missingNoteId = `${formId}-missing`;
    const missingNote = missing.length === 0 ? ""
      : `${fieldErrorMessage(missing[0])}${missing.length === 1 ? "" : missing.length === 2 ? " One more answer is missing above." : ` ${missing.length - 1} more answers are missing above.`}`;
    const renderMissingNote = () => missingNote
      ? <p id={missingNoteId} className="text-red-700 text-xs">{missingNote}</p>
      : null;

    // Capped at a card-like width: the widget fills whatever the host page's
    // iframe/container gives it, and some site builders give a "custom HTML"
    // embed the full column width on desktop — without a cap this stretches
    // into oversized buttons and a wide, squat calendar instead of the
    // compact card it's designed as.
    return (
      // overflow-clip (not hidden) while the button row is sticky: a hidden
      // overflow would make the card its own scroll box and the row wouldn't stick.
      <div style={{ fontFamily, backgroundColor: formCardBg }} className={cn("vf-embed-root vf-card w-full max-w-md mx-auto rounded-lg", stickyActions ? "overflow-clip" : "overflow-hidden", bgOverride && !bgTransparent ? "border border-[#e6dccb] shadow-sm" : "")}>

        {/* Bottom-sheet drag handle — floating placement, narrow viewport only. */}
        {isSheet && (
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-1 rounded-full bg-[#d8cdb8]" />
          </div>
        )}

        {/* Brand header bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 relative" style={{ backgroundColor: formButtonColor, color: textOnButton }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: textOnButton }} />
          <span className="font-bold text-[11px] tracking-widest uppercase truncate">{venueName} · Enquire</span>
          {isFloatingPlacement && (
            <button type="button" onClick={closeFloatingWidget} aria-label="Close"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-base leading-none hover:opacity-80"
              style={{ backgroundColor: `${textOnButton}22`, color: textOnButton }}>
              ×
            </button>
          )}
        </div>

        {/* Logo / name */}
        <div className="flex flex-col items-center gap-0.5 px-4 py-3 border-b border-[#eee6d8]">
          {logoUrl
            ? <img src={logoUrl} alt={venueName} style={{ height: `${Math.round(logoScale * 0.4)}px`, width: 'auto', objectFit: 'contain', maxWidth: '150px' }} />
            : <div className="font-semibold text-base text-gray-800" style={{ fontFamily: HEADING_FONT }}>{venueName}</div>}
          {logoUrl && <div className="text-[11px] text-gray-500">{venueName}</div>}
        </div>

        {submitted ? (
          <div role="status" className="text-center py-10 px-4">
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: formButtonColor }} />
            <p ref={setSuccessHeading} tabIndex={-1} className="font-semibold text-gray-800 text-sm mb-1" style={{ fontFamily: HEADING_FONT }}>Enquiry Received!</p>
            <p className="text-xs text-gray-600 leading-snug">{successMsg.replace('{venueName}', venueName)}</p>
            {inboxNote && <p className="text-xs text-gray-600 leading-snug mt-1">{inboxNote}</p>}
            {renderWalkthroughStep('sm')}
            <button type="button" onClick={resetForm}
              className="mt-5 h-9 px-4 border border-gray-200 rounded text-xs font-bold tracking-wide uppercase text-gray-600 hover:border-gray-300">
              Send another enquiry
            </button>
          </div>
        ) : isCompact ? (
          // ── COMPACT MODE (data-layout="compact") ── One continuous scroll
          // instead of the 3-step wizard: most traffic here is mobile, and
          // three steps of tapping NEXT is pure friction on a landing page a
          // visitor already committed to by tapping an ad. Same fields, same
          // renderField()/reqMark() as the wizard steps — just laid out flat.
          <div className="px-4 pb-4 pt-3 space-y-3">
            {renderSentNote('sm')}
            {renderDraftNote('sm')}
            {renderHoneypot()}
            {eventFields.some(f => f.id === 'eventType') && (
              <div>
                <label htmlFor={eventTypeField ? fieldElId(eventTypeField) : undefined} className="font-semibold text-[10px] tracking-wider block mb-1.5 text-gray-600 uppercase">Event type{reqMark(eventTypeField?.required)}</label>
                {renderEventTypeSelect()}
              </div>
            )}
            {spaceField && (
              <div>
                <label id={`${fieldElId(spaceField)}-label`} className="font-semibold text-[10px] tracking-wider block mb-1 text-gray-600 uppercase">{spaceField.label}{reqMark(spaceField.required)}</label>
                {renderField(spaceField)}
              </div>
            )}
            {eventDateField && (
              <div>
                <label htmlFor={fieldElId(eventDateField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{eventDateField.label}{reqMark(eventDateField.required)}</label>
                {renderField(eventDateField)}
              </div>
            )}
            {(timeField || guestField) && (
              <div className="grid grid-cols-2 gap-2">
                {timeField && (
                  <div>
                    <label htmlFor={fieldElId(timeField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{timeField.label}{reqMark(timeField.required)}</label>
                    {renderField(timeField)}
                  </div>
                )}
                {guestField && (
                  <div>
                    <label htmlFor={fieldElId(guestField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{guestField.label}{reqMark(guestField.required)}</label>
                    {renderField(guestField)}
                  </div>
                )}
              </div>
            )}
            {renderPriceHint()}
            {formatField && (
              <div>
                <label id={`${fieldElId(formatField)}-label`} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{formatField.label}{reqMark(formatField.required)}</label>
                {renderField(formatField)}
              </div>
            )}
            {budgetRangeField && (
              <div>
                <label id={`${fieldElId(budgetRangeField)}-label`} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{budgetRangeField.label}{reqMark(budgetRangeField.required)}</label>
                {renderField(budgetRangeField)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {detailFields.map(field => (
                <div key={field.id} className={field.id === 'company' ? 'col-span-2' : ''}>
                  <label htmlFor={fieldElId(field)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{field.label}{reqMark(field.required)}</label>
                  {renderField(field)}
                </div>
              ))}
            </div>
            {customFields.map(field => (
              <div key={field.id}>
                <label htmlFor={fieldElId(field)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{field.label}{reqMark(field.required)}</label>
                {renderField(field, true)}
              </div>
            ))}
            {messageField && (
              <div>
                <label htmlFor={fieldElId(messageField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{messageField.label}</label>
                {renderField(messageField)}
              </div>
            )}
            {sourceField && (
              <div>
                <label id={`${formId}-source-label`} className="font-semibold text-[10px] tracking-wider block mb-1 text-gray-600 uppercase">{sourceField.label}</label>
                {renderSourcePills()}
              </div>
            )}
            {renderTurnstile()}
            {renderMissingNote()}
            {submitError && <p role="alert" className="text-red-700 text-xs">{submitError}</p>}
            {renderGuestConfirm()}
            <button type="button" disabled={sending} onClick={() => { void doSubmit(); }}
              aria-describedby={missingNote ? missingNoteId : undefined}
              className="vf-submit w-full font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: formButtonColor, color: textOnButton }}>
              {sending ? 'SUBMITTING…' : 'SUBMIT ENQUIRY'}
            </button>
            <p className="text-[9px] text-center text-gray-600">By submitting you agree to be contacted by {venueName}.</p>
          </div>
        ) : (
          <>
            {/* The step circles are only colour: the step's title, for screen readers. */}
            <h2 ref={setStepHeading} tabIndex={-1} className="sr-only">{stepAnnouncement(embedStep, steps)}</h2>
            {/* Progress steps */}
            <div className="flex items-start justify-center gap-1 px-4 pt-3 pb-1">
              {steps.map((label, i) => {
                const n = i + 1;
                const on = embedStep >= n;
                return (
                  <div key={label} className="flex items-start gap-1">
                    <div className="flex flex-col items-center w-16">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
                        style={on ? { backgroundColor: formButtonColor, color: textOnButton } : { backgroundColor: '#e5e7eb', color: '#4b5563' }}>
                        {n}
                      </div>
                      <span className="text-[9px] mt-1 font-semibold text-center leading-tight" style={{ color: embedStep === n ? formButtonColor : '#4b5563' }}>{label}</span>
                    </div>
                    {i < steps.length - 1 && <div className="w-6 h-px mt-3" style={{ backgroundColor: embedStep > n ? formButtonColor : '#e5e7eb' }} />}
                  </div>
                );
              })}
            </div>

            <div className="px-4 pb-4 pt-1">
              {/* ── STEP 1: Your Details — contact info first. A stranger who
                    taps an ad shouldn't hit a 12-option dropdown and a
                    guest-count box before they've typed their name. ────── */}
              {embedStep === 1 && (
                // A real form, so Enter or Go on a phone keyboard is NEXT (with
                // the same checks), never a submit: SUBMIT is on step 2.
                <form noValidate className="space-y-2.5" style={stepGuard ? { pointerEvents: 'none' } : undefined}
                  onSubmit={e => {
                    e.preventDefault();
                    // Not disabled while incomplete (a faded button said nothing):
                    // mark what's missing at each field and go to the first one.
                    // An answer the server refused is missing too until it's changed.
                    const missing = detailFields.filter(f => !isFieldFilled(f) || serverErrorOn(f));
                    if (missing.length > 0) {
                      setTouchedInvalid(new Set(missing.map(f => f.id)));
                      requestAnimationFrame(() => { document.getElementById(fieldElId(missing[0]))?.focus(); });
                      return;
                    }
                    // Autosave a contactable lead the moment we have a name
                    // + email (saveStep1, in the background).
                    if (venue?.ownerId) saveStep1(venue.ownerId);
                    setEmbedStep(2);
                  }}>
                  {renderSentNote('sm')}
                  {renderDraftNote('sm')}
                  {renderHoneypot()}
                  <div className="grid grid-cols-2 gap-2">
                    {detailFields.map(field => (
                      <div key={field.id} className={field.id === 'company' ? 'col-span-2' : ''}>
                        <label htmlFor={fieldElId(field)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{field.label}{reqMark(field.required)}</label>
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                  <button type="submit"
                    className="vf-submit w-full font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: formButtonColor, color: textOnButton }}>NEXT →</button>
                </form>
              )}

              {/* ── STEP 2: Your Event — submits directly, no Summary step. ── */}
              {embedStep === 2 && (
                // What the visitor does here is the step-2 "still here" ping's cue.
                <div className="space-y-3" style={stepGuard ? { pointerEvents: 'none' } : undefined}
                  onInputCapture={noteStep2Activity} onPointerDownCapture={noteStep2Activity} onKeyDownCapture={noteStep2Activity}>
                  {resumedStep2 && renderResumedNote()}
                  {eventFields.some(f => f.id === 'eventType') && (
                    <div>
                      <label htmlFor={eventTypeField ? fieldElId(eventTypeField) : undefined} className="font-semibold text-[10px] tracking-wider block mb-1.5 text-gray-600 uppercase">Event type{reqMark(eventTypeField?.required)}</label>
                      {renderEventTypeSelect()}
                    </div>
                  )}

                  {spaceField && (
                    <div>
                      <label id={`${fieldElId(spaceField)}-label`} className="font-semibold text-[10px] tracking-wider block mb-1 text-gray-600 uppercase">{spaceField.label}{reqMark(spaceField.required)}</label>
                      {renderField(spaceField)}
                    </div>
                  )}

                  {eventDateField && (
                    <div>
                      <label htmlFor={fieldElId(eventDateField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{eventDateField.label}{reqMark(eventDateField.required)}</label>
                      {renderField(eventDateField)}
                    </div>
                  )}

                  {(timeField || guestField) && (
                    <div className="grid grid-cols-2 gap-2">
                      {timeField && (
                        <div>
                          <label htmlFor={fieldElId(timeField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{timeField.label}{reqMark(timeField.required)}</label>
                          {renderField(timeField)}
                        </div>
                      )}
                      {guestField && (
                        <div>
                          <label htmlFor={fieldElId(guestField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{guestField.label}{reqMark(guestField.required)}</label>
                          {renderField(guestField)}
                        </div>
                      )}
                    </div>
                  )}
                  {renderPriceHint()}

                  {/* Qualifying pills — format and budget bracket. */}
                  {formatField && (
                    <div>
                      <label id={`${fieldElId(formatField)}-label`} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{formatField.label}{reqMark(formatField.required)}</label>
                      {renderField(formatField)}
                    </div>
                  )}
                  {budgetRangeField && (
                    <div>
                      <label id={`${fieldElId(budgetRangeField)}-label`} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{budgetRangeField.label}{reqMark(budgetRangeField.required)}</label>
                      {renderField(budgetRangeField)}
                    </div>
                  )}

                  {customFields.map(field => (
                    <div key={field.id}>
                      <label htmlFor={fieldElId(field)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{field.label}{reqMark(field.required)}</label>
                      {renderField(field, true)}
                    </div>
                  ))}
                  {messageField && (
                    <div>
                      <label htmlFor={fieldElId(messageField)} className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-600 uppercase">{messageField.label}</label>
                      {renderField(messageField)}
                    </div>
                  )}
                  {sourceField && (
                    <div>
                      <label id={`${formId}-source-label`} className="font-semibold text-[10px] tracking-wider block mb-1 text-gray-600 uppercase">{sourceField.label}</label>
                      {renderSourcePills()}
                    </div>
                  )}

                  {renderHoneypot()}
                  {renderTurnstile()}
                  {/* Kept at the bottom of the frame when the host page cuts the
                      form off (stickyActions), with the notes about SUBMIT inside
                      it, so the row never covers them. */}
                  <div ref={stickyBarRef}
                    className={stickyActions ? "sticky bottom-0 z-10 -mx-4 px-4 pt-2 pb-2 space-y-3 border-t border-[#e6dccb] shadow-[0_-4px_10px_rgba(0,0,0,0.06)]" : "space-y-3"}
                    style={stickyActions ? { backgroundColor: formCardBg === 'transparent' ? '#fffdf9' : formCardBg } : undefined}>
                    {renderMissingNote()}
                    {submitError && <p role="alert" className="text-red-700 text-xs">{submitError}</p>}
                    {renderGuestConfirm()}
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => { setResumedStep2(false); setEmbedStep(1); }}
                        className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 bg-white">← BACK</button>
                      <button type="button" disabled={sending} onClick={() => { void doSubmit(); }}
                        aria-describedby={missingNote ? missingNoteId : undefined}
                        className="vf-submit flex-1 font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ backgroundColor: formButtonColor, color: textOnButton }}>
                        {sending ? 'SUBMITTING…' : 'SUBMIT ENQUIRY'}
                      </button>
                    </div>
                  </div>
                  <p className="text-[9px] text-center text-gray-600">By submitting you agree to be contacted by {venueName}.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  /* ── FULL-PAGE MODE ─────────────────────────────────────────────────── */
  const pageBgStyle: React.CSSProperties = {
    backgroundColor: formPageBg,
    ...(formPageBgImage ? { backgroundImage: `url(${formPageBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' } : {}),
  };
  const eventTypeFieldDef = eventFields.find(f => f.id === 'eventType');

  return (
    <main className="min-h-screen" style={{ ...pageBgStyle, fontFamily }}>

      {/* Venue Header */}
      <div style={{ backgroundColor: primaryColor, color: textOnPrimary }}>
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          <div className="flex items-center justify-center mb-5">
            {logoUrl ? (
              <img src={logoUrl} alt={venueName}
                style={{ height: `${Math.round(logoScale * 0.64)}px`, width: 'auto', objectFit: 'contain', maxWidth: '80%', ...(isLight(primaryColor) || !logoIsInvertible ? {} : { filter: 'brightness(0) invert(1)' }) }} />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                style={{ backgroundColor: `${textOnPrimary}22`, color: textOnPrimary }}>
                {venueName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 justify-center mb-6">
            <div className="flex-1 h-px" style={{ background: `${textOnPrimary}33` }} />
            <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: `${textOnPrimary}88` }} />
            <div className="flex-1 h-px" style={{ background: `${textOnPrimary}33` }} />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold leading-tight mb-2" style={{ color: textOnPrimary, fontFamily: HEADING_FONT }}>{venueName}</h1>
          {formTitle && <p className="text-xl italic mb-3" style={{ color: textOnPrimary, fontFamily: HEADING_FONT }}>{formTitle}</p>}
          <p className="text-sm leading-relaxed max-w-md mx-auto" style={{ color: `${textOnPrimary}e6` }}>{formSubtitle}</p>
          {(venue?.city || venue?.phone || venue?.email) && (
            <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
              {venue.city && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}e6` }}><MapPin className="w-3 h-3" /> {venue.city}</div>}
              {venue.phone && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}e6` }}><Phone className="w-3 h-3" /> {venue.phone}</div>}
              {venue.email && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}e6` }}><Mail className="w-3 h-3" /> {venue.email}</div>}
            </div>
          )}
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: `${primaryColor}66` }} />

      {/* Gallery strip */}
      {galleryImages.length > 0 && (
        <div className="w-full overflow-x-auto flex gap-2 px-4 py-3 bg-white border-b border-gray-100">
          {galleryImages.map((img, i) => (
            <img key={i} src={img} alt={`Venue ${i + 1}`}
              style={{ height: `${galleryPhotoHeight}px`, width: 'auto', objectFit: 'cover', flexShrink: 0 }}
              className="rounded-sm" />
          ))}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-10">
        {submitted ? (
          <div role="status" className="rounded-lg border border-gray-100 shadow-sm p-10 text-center" style={{ backgroundColor: formCardBg }}>
            <CheckCircle className="w-16 h-16 mx-auto mb-5" style={{ color: formButtonColor }} />
            <h2 ref={setSuccessHeading} tabIndex={-1} className="text-3xl font-bold mb-3 text-gray-800" style={{ fontFamily: HEADING_FONT }}>Enquiry Received!</h2>
            <p className="text-gray-500 mb-2">
              {successMsg.replace('{venueName}', venueName)}
            </p>
            {inboxNote && <p className="text-sm text-gray-600">{inboxNote}</p>}
            {renderWalkthroughStep('lg')}
            <button type="button" onClick={resetForm}
              className="mt-6 h-11 px-6 border border-gray-200 rounded text-sm font-bold tracking-wide uppercase text-gray-600 hover:border-gray-300">
              Send another enquiry
            </button>
            <div className="mt-8 pt-6 border-t border-dashed border-gray-200">
              <div className="font-bold text-xs tracking-widest text-gray-600">POWERED BY VenueFlowHQ</div>
            </div>
          </div>
        ) : (
          // noValidate: the form's own inline errors (at the field, announced,
          // focus moved) replace the browser's passing bubble.
          <form onSubmit={handleSubmit} noValidate className="space-y-5 relative">
            {renderHoneypot()}

            {/* One unified panel — NowBookIt-style: event-type cards first, then details */}
            <div className="rounded-xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-7" style={{ backgroundColor: formCardBg }}>

              {sentElsewhereAt != null && <div className="-mb-3">{renderSentNote('lg')}</div>}
              {showDraftNote && <div className="-mb-3">{renderDraftNote('lg')}</div>}

              {/* Event type — tappable cards (the signature NowBookIt element, shown first) */}
              {eventFields.some(f => f.id === 'eventType') && (
                <div>
                  <label htmlFor={eventTypeFieldDef ? fieldElId(eventTypeFieldDef) : undefined} className="font-bold text-xs tracking-widest block mb-3 text-gray-600">WHAT KIND OF EVENT?{reqMark(eventTypeFieldDef?.required)}</label>
                  {renderEventTypeSelect()}
                </div>
              )}

              {/* Remaining event details (date, time, guests). Qualifying pills
                  (format, budget bracket) are rendered separately below, full
                  width — squeezed into a half grid column they either wrap
                  ("Cocktail / standing" breaking mid-word) or, worse, end up
                  the lone item in the last row with a wide empty gap beside
                  them. A plain text/date/number input doesn't have that
                  problem, so only those stay in the compact grid. */}
              {(() => {
                const gridFields = eventFields.filter(f => f.id !== 'eventType' && f.id !== 'eventFormat' && f.id !== 'budgetRange' && f.id !== 'spaceId');
                const pillFields = eventFields.filter(f => f.id === 'eventFormat' || f.id === 'budgetRange');
                if (gridFields.length === 0 && pillFields.length === 0 && !spaceField) return null;
                return (
                  <div>
                    <div role="heading" aria-level={2} className="font-bold text-xs tracking-widest block mb-3 text-gray-600">EVENT DETAILS</div>
                    {/* Where first: availability and prices follow the space. */}
                    {spaceField && (
                      <div className="mb-4">
                        <label id={`${fieldElId(spaceField)}-label`} className="font-semibold text-[11px] tracking-wide block mb-1.5 text-gray-600">
                          {spaceField.label.toUpperCase()}{reqMark(spaceField.required)}
                        </label>
                        {renderField(spaceField)}
                      </div>
                    )}
                    {gridFields.length > 0 && (
                      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${pillFields.length > 0 || guidance.hint ? 'mb-4' : ''}`}>
                        {gridFields.map(field => (
                          <div key={field.id} className={field.id === 'budget' ? 'sm:col-span-2' : ''}>
                            <label htmlFor={fieldElId(field)} className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-600">
                              {field.label.toUpperCase()}{reqMark(field.required)}
                            </label>
                            {renderField(field)}
                          </div>
                        ))}
                      </div>
                    )}
                    {guidance.hint && <div className="mb-4 -mt-1">{renderPriceHint()}</div>}
                    {pillFields.map(field => (
                      <div key={field.id} className="mb-3 last:mb-0">
                        <label id={`${fieldElId(field)}-label`} className="font-semibold text-[11px] tracking-wide block mb-1.5 text-gray-600">
                          {field.label.toUpperCase()}{reqMark(field.required)}
                        </label>
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Your details. Single column below sm: at 390px a fixed 2-col
                  grid squeezed the Phone input so much its own placeholder
                  ("+64 21 000 0000") got clipped. */}
              {detailFields.length > 0 && (
                <div>
                  <div role="heading" aria-level={2} className="font-bold text-xs tracking-widest block mb-3 text-gray-600">YOUR DETAILS</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {detailFields.map(field => (
                      <div key={field.id} className={field.id === 'company' ? 'sm:col-span-2' : ''}>
                        <label htmlFor={fieldElId(field)} className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-600">
                          {field.label.toUpperCase()}{reqMark(field.required)}
                        </label>
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional custom fields */}
              {customFields.length > 0 && (
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-600">ADDITIONAL INFORMATION</label>
                  <div className="space-y-3">
                    {customFields.map(field => (
                      <div key={field.id}>
                        <label htmlFor={fieldElId(field)} className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-600">
                          {field.label.toUpperCase()}{reqMark(field.required)}
                        </label>
                        {renderField(field, true)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* How did you hear — pills */}
              {sourceField && (
                <div>
                  <label id={`${formId}-source-label`} className="font-bold text-xs tracking-widest block mb-3 text-gray-600">{sourceField.label.toUpperCase()}</label>
                  {renderSourcePills()}
                </div>
              )}

              {/* Message */}
              {messageField && (
                <div>
                  <label htmlFor={fieldElId(messageField)} className="font-bold text-xs tracking-widest block mb-3 text-gray-600">{messageField.label.toUpperCase()}</label>
                  {renderField(messageField)}
                </div>
              )}
            </div>

            {renderTurnstile()}
            {submitError && <p role="alert" className="text-red-700 text-sm">{submitError}</p>}
            {renderGuestConfirm()}
            <Button type="submit" disabled={sending}
              className="w-full font-bold tracking-widest rounded-lg h-14 text-base shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: formButtonColor, color: textOnButton }}>
              {sending ? "SUBMITTING…" : "SUBMIT ENQUIRY"}
            </Button>

            <p className="text-xs text-center text-gray-600">
              By submitting this form you agree to be contacted by {venueName} regarding your event enquiry.
            </p>
          </form>
        )}
      </div>

      <div className="py-6 text-center mt-4 bg-gray-800 border-t border-gray-700">
        <div className="font-bold text-xs tracking-widest text-gray-400">POWERED BY VenueFlowHQ · EVENT CRM FOR NEW ZEALAND VENUES</div>
        <div className="mt-2">
          <Link href="/dashboard">
            <span className="text-xs cursor-pointer underline underline-offset-2 transition-colors text-gray-300 hover:text-white">Venue owner? Sign in →</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
