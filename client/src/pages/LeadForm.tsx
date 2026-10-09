import { useState, useEffect, useId, useRef } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CheckCircle, MapPin, Phone, Mail, Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { combineLocalDateTime, toLocalDateInput } from "@/lib/dateTime";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

import { DEFAULT_FORM_SUCCESS_MESSAGE, DEFAULT_LEAD_FORM_SUBTITLE } from "@shared/enquiryCopy";
import { DEFAULT_FORM_FIELDS, mergeFormFields, EVENT_FORMAT_OPTIONS, BUDGET_RANGE_OPTIONS, eventFormatLabel, budgetRangeLabel, type FormFieldDef } from "@shared/formFields";

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
function perGuestBudget(budgetRange: string, guestCount: string): string | null {
  const b = BUDGET_RANGE_OPTIONS.find(x => x.value === budgetRange);
  const n = parseInt(guestCount, 10);
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

// Prefill params (embed.js's data-event-type="christmas-party" etc.) come
// from whatever a venue typed into a script tag, not a dropdown, so they're
// matched loosely against the real option strings — case/punctuation/spacing
// insensitive — rather than requiring an exact string. No match, no prefill;
// never a crash or a silently-wrong selection.
const normLoose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
function fuzzyMatch(raw: string | null, options: readonly string[]): string | undefined {
  if (!raw) return undefined;
  const target = normLoose(raw);
  return options.find(o => normLoose(o) === target);
}
function fuzzyMatchOption(raw: string | null, options: ReadonlyArray<{ value: string; label: string }>): string | undefined {
  if (!raw) return undefined;
  const target = normLoose(raw);
  return options.find(o => normLoose(o.value) === target || normLoose(o.label) === target)?.value;
}

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
        <button type="button" id={id} disabled={disabled}
          aria-haspopup="dialog" aria-invalid={ariaInvalid} aria-describedby={ariaDescribedby}
          className={cn("h-9 w-full min-w-0 px-3 py-1", inputClass, "flex items-center justify-between text-left disabled:opacity-50 disabled:cursor-not-allowed")}>
          <span className={value ? '' : 'text-muted-foreground'}>{value ? formatDateNZ(value) : 'Select a date'}</span>
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
  const times: string[] = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id={id}
          aria-haspopup="dialog" aria-invalid={ariaInvalid} aria-describedby={ariaDescribedby}
          className={cn("h-9 w-full min-w-0 px-3 py-1", inputClass, "flex items-center justify-between text-left")}>
          <span className={value ? '' : 'text-muted-foreground'}>{value ? formatTime12h(value) : 'Select a time'}</span>
          <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-36 p-1 max-h-64 overflow-y-auto">
        {times.map(t => (
          <button key={t} type="button" onClick={() => { onChange(t); setOpen(false); }}
            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100"
            style={value === t ? { backgroundColor: accentColor, color: accentTextColor } : undefined}>
            {formatTime12h(t)}
          </button>
        ))}
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

function WalkthroughRequest({ ownerId, leadId, leadToken, clientEmail, big, accentColor, accentTextColor, onRequested }: {
  ownerId: number; leadId: number; leadToken: string; clientEmail: string; big: boolean;
  accentColor: string; accentTextColor: string; onRequested: () => void;
}) {
  const optionsQ = trpc.leads.walkthroughOptions.useQuery({ ownerId }, { staleTime: 60_000, refetchOnWindowFocus: false });
  const [dates, setDates] = useState<string[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<WalkthroughTimeKey>('any');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ summary: string; emailed: boolean } | null>(null);
  const [changing, setChanging] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = trpc.leads.requestWalkthrough.useMutation({
    onSuccess: (r) => { setDone({ summary: r.summary, emailed: r.emailed }); setChanging(false); setError(null); onRequested(); },
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
            {done.emailed && <>We&rsquo;ve emailed a copy to <span className="font-medium text-gray-800 break-all">{clientEmail}</span>.</>}
          </p>
          <button type="button" onClick={() => setChanging(true)}
            className="mt-2 whitespace-nowrap font-bold text-[11px] tracking-wide uppercase text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline py-1.5">Change my request</button>
        </div>
      </div>
    );
  }

  if (optionsQ.isLoading || !optionsQ.data?.enabled) return null;

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
      <div role="radiogroup" aria-labelledby={`wt-time-${leadId}`} className="flex flex-wrap gap-1.5">
        {WALKTHROUGH_TIME_OPTIONS.map(o => {
          const sel = timeOfDay === o.key;
          return (
            <button key={o.key} type="button" role="radio" aria-checked={sel}
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
          onClick={() => request.mutate({ ownerId, leadId, leadToken, dates, timeOfDay, note: note.trim() || undefined })}
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
  // embed.js reads its OWN parent page's origin (the iframe can't — that's
  // the whole reason it's passed in) and appends it here so postMessage can
  // target that exact origin instead of "*". Validated, not trusted as-is:
  // a malformed value falls back to "*" rather than silently going dark, so
  // a hand-pasted old-style iframe (no embed.js, no param) still works.
  const paramParentOrigin = (() => {
    const raw = sp.get("parentOrigin");
    if (!raw) return "*";
    try { return new URL(raw).origin; } catch { return "*"; }
  })();
  // Every message to the host page goes through here so it always carries the
  // frameId and targets the parent's exact origin. Documented message names:
  // vf-embed-height, vf-step-changed, vf-partial-captured, vf-enquiry-submitted,
  // vf-walkthrough-requested, vf-close-widget.
  const postToParent = (msg: Record<string, unknown>) => {
    try { window.parent?.postMessage({ ...msg, frameId }, paramParentOrigin); } catch { /* no parent / cross-origin */ }
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
    utmSource: sp.get("utm_source") || undefined,
    utmMedium: sp.get("utm_medium") || undefined,
    utmCampaign: sp.get("utm_campaign") || undefined,
    utmTerm: sp.get("utm_term") || undefined,
    utmContent: sp.get("utm_content") || undefined,
  };
  // Prefill from embed.js's data-event-type/date/guests/format, e.g. a
  // Christmas landing page opening the form already on "Christmas Party" —
  // fewer taps, better mobile conversion. Each is independently optional.
  const prefillEventType = fuzzyMatch(sp.get("prefillEventType"), EVENT_TYPES);
  const prefillDateRaw = sp.get("prefillDate");
  const prefillDate = prefillDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(prefillDateRaw) ? prefillDateRaw : undefined;
  const prefillGuestsRaw = parseInt(sp.get("prefillGuests") ?? '', 10);
  const prefillGuests = Number.isFinite(prefillGuestsRaw) && prefillGuestsRaw > 0 ? String(prefillGuestsRaw) : undefined;
  const prefillFormat = fuzzyMatchOption(sp.get("prefillFormat"), EVENT_FORMAT_OPTIONS);

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
    // Soft, warm input borders unless the embed sets its own border colour.
    if (!borderOverride) rules.push(`.vf-embed-root input,.vf-embed-root textarea,.vf-embed-root select{border-color:#cdbfa4}`);
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
  useEffect(() => {
    if (!isEmbed) return;
    const post = () => {
      // Measure the body, not documentElement: inside an iframe the root
      // element's scrollHeight is floored at the iframe's own height, so it can
      // only grow. body.scrollHeight tracks the real content and lets a shorter
      // step shrink the frame too.
      const h = Math.ceil(document.body.scrollHeight);
      postToParent({ type: "vf-embed-height", height: h });
    };
    post();
    const ro = new ResizeObserver(() => post());
    ro.observe(document.body);
    // Safety posts for late reflow (custom font / images loading).
    const t1 = setTimeout(post, 400);
    const t2 = setTimeout(post, 1500);
    window.addEventListener("load", post);
    window.addEventListener("resize", post);
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); window.removeEventListener("load", post); window.removeEventListener("resize", post); };
  }, [isEmbed]);

  const { data: venueBySlug, isLoading: loadingBySlug } = trpc.venue.getBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug }
  );
  const { data: venueDefault, isLoading: loadingDefault } = trpc.venue.getDefault.useQuery(
    undefined,
    { enabled: !slug }
  );
  const venue = slug ? venueBySlug : venueDefault;
  const isLoading = slug ? loadingBySlug : loadingDefault;

  // Spaces + published prices, the availability/walkthrough switches, the
  // optional Turnstile key and the signed "form opened at" token. Fetched
  // once: refetching would re-issue the token and could make a real person
  // look like a too-fast bot.
  const { data: formConfig } = trpc.leads.formConfig.useQuery(
    { ownerId: venue?.ownerId ?? 0 },
    { enabled: !!venue?.ownerId, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false },
  );
  const formTokenRef = useRef<string | null>(null);
  if (formConfig?.formToken && !formTokenRef.current) formTokenRef.current = formConfig.formToken;
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
    document.title = isEmbed ? `Enquiry form — ${name}` : `Enquire — ${name}`;
  }, [isEmbed, venue?.name]);

  // Half-filled forms survive a reload — someone who taps away to check their
  // calendar and comes back shouldn't have to retype everything. Scoped per
  // venue slug so different venues' drafts on the same device never collide.
  // URL prefill (an ad/email link) always wins over a stale draft field.
  const draftKey = `vf-lead-draft-${slug ?? "default"}`;
  const readDraft = (): Record<string, string> => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return {};
      const d = JSON.parse(raw);
      return d && typeof d === "object" ? d : {};
    } catch { return {}; }
  };
  const [draftRestored] = useState(() => Object.values(readDraft()).some(v => !!v));
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = { ...readDraft() };
    if (prefillEventType) initial.eventType = prefillEventType;
    if (prefillDate) initial.eventDate = prefillDate;
    if (prefillGuests) initial.guestCount = prefillGuests;
    if (prefillFormat) initial.eventFormat = prefillFormat;
    // Arbitrary preselection: any prefill_<fieldId> param sets that field, so a
    // venue can open the form on a chosen package, company, etc. from a link.
    sp.forEach((value, key) => {
      if (key.startsWith("prefill_") && value) {
        const fieldId = key.slice("prefill_".length);
        if (fieldId && initial[fieldId] === undefined) initial[fieldId] = value.slice(0, 500);
      }
    });
    return initial;
  });
  const [showDraftNote, setShowDraftNote] = useState(draftRestored);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  // Stepped embed widget state (Your Details → Your Event — contact info
  // comes first so a stranger who bails after step 1 still leaves behind a
  // name and email, not nothing).
  const [embedStep, setEmbedStep] = useState(1);
  // "We don't have a date yet" — an explicit answer, not a skipped field.
  // Clients without a date were guessing one or abandoning; this makes
  // no-date a first-class choice, stored on the lead as dateFlexible.
  const [noDateYet, setNoDateYet] = useState(false);
  // Set once startCapture succeeds after step 1 — passed to submit() so it
  // UPDATEs this row instead of inserting a second one. Staying null just
  // means submit() falls back to a normal insert; the visitor's flow never
  // waits on or breaks over this write.
  const [capturedLeadId, setCapturedLeadId] = useState<number | null>(null);
  // startCapture's proof that this visitor created capturedLeadId — the
  // server only completes that row when it's sent back (see leadToken.ts).
  const [capturedLeadToken, setCapturedLeadToken] = useState<string | null>(null);
  // Field ids that failed validation on the last submit attempt — drives the
  // inline error text/aria-invalid under each field. Cleared on submit, and
  // implicitly "resolved" per-field the moment isFieldFilled() says so again
  // (no per-keystroke bookkeeping needed).
  const [touchedInvalid, setTouchedInvalid] = useState<Set<string>>(new Set());
  // The id of the lead row this submission created/updated — captured from
  // submit()'s response so the post-submit walkthrough step has something to
  // attach the chosen slot to. Distinct from capturedLeadId (set earlier, by
  // startCapture): that one only ever fires in the step-wizard's step 1.
  const [submittedLeadId, setSubmittedLeadId] = useState<number | null>(null);
  const [submittedLeadToken, setSubmittedLeadToken] = useState<string | null>(null);

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
  // Whether the server actually sent the "we've got your enquiry" email (off
  // in Settings, or email not set up, means it didn't) — the success screen
  // only tells people to check their inbox when there's something in it.
  const [autoReplySent, setAutoReplySent] = useState(false);

  // Tell the host page which wizard step is showing, so it can track funnel
  // drop-off. Fires on mount and whenever the step changes; compact/one-scroll
  // layouts stay on step 1.
  useEffect(() => {
    if (!isEmbed) return;
    postToParent({ type: "vf-step-changed", step: embedStep });
  }, [isEmbed, embedStep]);

  // Save the in-progress draft on every change. form's initial value was
  // already seeded from the draft (readDraft(), above) so this never races
  // with — or clobbers — the restore.
  useEffect(() => {
    if (submitted) return;
    try {
      const hasAny = Object.values(form).some(v => !!v) || noDateYet;
      if (hasAny) localStorage.setItem(draftKey, JSON.stringify(form));
      else localStorage.removeItem(draftKey);
    } catch { /* storage disabled/full — draft persistence is a nicety, not required */ }
  }, [form, noDateYet, submitted, draftKey]);
  const clearDraft = () => {
    try { localStorage.removeItem(draftKey); } catch {}
    setShowDraftNote(false);
  };
  const resetForm = () => {
    clearDraft();
    setForm({});
    setCustomFieldValues({});
    setNoDateYet(false);
    setEmbedStep(1);
    setCapturedLeadId(null);
    setCapturedLeadToken(null);
    setSubmittedLeadId(null);
    setSubmittedLeadToken(null);
    setAutoReplySent(false);
    setTouchedInvalid(new Set());
    setSubmitted(false);
  };

  // Autosaves a real, contactable lead the moment step 1 (Your Details) is
  // complete — firstName + email are always required by then. Without this,
  // everyone who taps an ad, gets as far as typing their name and email, then
  // bails on the event questions, simply vanishes: no record, no follow-up.
  const startCapture = trpc.leads.startCapture.useMutation({
    onSuccess: (data) => {
      setCapturedLeadId(data.leadId);
      setCapturedLeadToken(data.leadToken);
      postToParent({ type: 'vf-partial-captured' });
    },
    // No error toast — this is a background nicety. If it fails, submit()
    // just falls back to a normal insert; the visitor never sees a hiccup.
  });

  const submitLead = trpc.leads.submit.useMutation({
    onSuccess: (data: any) => {
      setSubmitted(true);
      setSubmittedLeadId(data?.id ?? null);
      setSubmittedLeadToken(data?.leadToken ?? null);
      setAutoReplySent(data?.autoReplySent === true);
      clearDraft();
      // ── Conversion signal ───────────────────────────────────────────────
      // Embedding pages (and tag managers on them) need to know a submission
      // happened — Google Ads conversion tracking can't see inside the
      // iframe. Fired on BOTH modes; deliberately carries NO personal data,
      // only the qualifiers useful for value-based bidding.
      postToParent({
        type: "vf-enquiry-submitted",
        eventType: form.eventType || null,
        guestCount: form.guestCount ? parseInt(form.guestCount) : null,
        budgetRange: form.budgetRange || null,
        eventFormat: form.eventFormat || null,
        source: clickAttribution.utmSource || (isEmbed ? "embed" : "web"),
      });
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
    },
    onError: (e) => {
      // The real reason, not a shrug: "too many submissions" and a validation
      // problem need different reactions from the person filling the form.
      // Either way, give them a route that cannot fail — the venue's email.
      // A Turnstile token is single-use — fetch a fresh one for the retry.
      setTurnstileReset(n => n + 1);
      const reason = e?.message?.trim() || "Something went wrong submitting the form.";
      const fallback = (venue as any)?.email ? ` You can also email us directly at ${(venue as any).email}.` : "";
      toast.error(`${reason}${fallback}`, { duration: 12000 });
    },
  });

  const doSubmit = () => {
    if (!venue?.ownerId) return toast.error("Venue not found");
    // Every required field must actually be filled — checked explicitly here,
    // not just via each input's `required` attribute, because source,
    // eventFormat and budgetRange are button groups with no real <input>
    // behind them for native HTML validation to see, and the embed widget
    // submits via onClick, where native form validation never runs at all
    // (even for eventType's <select>). Guest count gets its own check below
    // since "filled" isn't the same as "a valid number".
    const requiredGroups: Array<[FormFieldDef[], boolean]> = [
      [eventFields, false],
      [detailFields, false],
      [customFields, true],
      [sourceField ? [sourceField] : [], false],
      [messageField ? [messageField] : [], false],
    ];
    const invalid: FormFieldDef[] = [];
    for (const [group, isCustom] of requiredGroups) {
      for (const f of group) {
        if (!isFieldFilled(f, isCustom)) invalid.push(f);
      }
    }
    if (invalid.length > 0) {
      setTouchedInvalid(new Set(invalid.map(f => f.id)));
      toast.error(fieldErrorMessage(invalid[0]));
      // Land keyboard/screen-reader focus right on the first problem field —
      // the toast alone is easy to miss, especially for a screen reader user
      // who isn't looking at the corner of the screen it appears in.
      requestAnimationFrame(() => { document.getElementById(fieldElId(invalid[0]))?.focus(); });
      return;
    }
    setTouchedInvalid(new Set());
    const customParts = Object.entries(customFieldValues)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v}`);
    const fullMessage = [form.message, ...customParts].filter(Boolean).join('\n\n');
    submitLead.mutate({
      ownerId: venue.ownerId,
      // If step 1's autosave landed, complete that same row instead of
      // inserting a second one. If it never fired (or is still in flight),
      // this is undefined and the server falls back to a normal insert.
      leadId: capturedLeadId ?? undefined,
      leadToken: capturedLeadToken ?? undefined,
      firstName: (form.firstName ?? '').trim(),
      lastName: form.lastName?.trim() || undefined,
      email: (form.email ?? '').trim(),
      phone: form.phone?.trim() || undefined,
      company: form.company?.trim() || undefined,
      eventType: form.eventType || undefined,
      eventDate: noDateYet ? undefined : combineLocalDateTime(form.eventDate, form.eventTime),
      dateFlexible: noDateYet,
      guestCount: form.guestCount ? parseInt(form.guestCount) : undefined,
      eventFormat: (form.eventFormat || undefined) as any,
      budgetRange: (form.budgetRange || undefined) as any,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      eventDetail: form.eventDetail?.trim() || undefined,
      invoicingNote: form.invoicingNote?.trim() || undefined,
      message: fullMessage || undefined,
      source: form.source || "lead_form",
      spaceId: showSpacePicker && pickedSpace ? pickedSpace.id : (formSpaces.length === 1 ? formSpaces[0].id : undefined),
      hp: honeypot || undefined,
      formToken: formTokenRef.current ?? undefined,
      turnstileToken: turnstileToken ?? undefined,
      ...clickAttribution,
    });
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); doSubmit(); };

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
    if (!field.required) return true;
    if (isCustomField) return !!(customFieldValues[field.label] ?? '').trim();
    if (field.id === 'eventDate') return noDateYet || !!(form.eventDate ?? '').trim();
    if (field.id === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((form.email ?? '').trim());
    // "Filled" isn't the same as "a valid number" — reject "abc", "0", "-5".
    if (field.id === 'guestCount') return parseInt(form.guestCount ?? '', 10) >= 1;
    return !!(form[field.id] ?? '').trim();
  };

  // Error id/message plumbing for inline field errors — the single place
  // that decides whether a field should show as invalid right now, so a
  // field's error disappears the moment it's actually fixed (isFieldFilled
  // says so again) without any separate per-keystroke clearing logic.
  const fieldErrorId = (f: FormFieldDef) => `${fieldElId(f)}-error`;
  const fieldHasError = (f: FormFieldDef, isCustom = false) => touchedInvalid.has(f.id) && !isFieldFilled(f, isCustom);
  const fieldErrorMessage = (f: FormFieldDef) =>
    f.id === 'guestCount' ? "Please tell us how many guests you're expecting." : `Please fill in "${f.label}".`;
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

  const venueName    = venue?.name ?? "VenueFlowHQ Venue";
  const formTitle    = venue?.leadFormTitle ?? "Book Your Event";
  const formSubtitle = venue?.leadFormSubtitle ?? DEFAULT_LEAD_FORM_SUBTITLE;
  const accentOverride = hexParam(paramAccent);
  const bgOverride = hexParam(paramBg);
  const bgTransparent = paramBg === "transparent";

  const primaryColor = accentOverride ?? venue?.primaryColor ?? "#2D4A3E";
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
  // Only point people at their inbox when the confirmation email really went.
  const inboxNote = autoReplySent
    ? "We've emailed you a copy — check your inbox (and junk folder)."
    : null;
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
  const formButtonColor = withHash(accentOverride || (venue as any)?.formButtonColor || primaryColor);
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

  // text-base (16px) on real inputs even in the compact embed: iOS Safari
  // zooms the page when a focused field's font is under 16px, which yanks the
  // host page around. 16px keeps the tap-to-focus steady.
  const inputClass = isEmbed
    ? "rounded-sm border border-[#6a7282] focus-visible:ring-1 focus-visible:ring-offset-0 text-base bg-white min-h-[40px] px-2"
    : "rounded-sm border border-[#6a7282] focus-visible:ring-1 focus-visible:ring-offset-0 text-base bg-white";

  // Price guidance once a space or a guest count is chosen (a one-space
  // venue's space counts as chosen).
  const guestsN = parseInt(form.guestCount ?? '', 10) >= 1 ? parseInt(form.guestCount!, 10) : null;
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
  // submission while showing them a normal success.
  function renderHoneypot() {
    return (
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Leave this empty
          <input type="text" name="vf-confirm-url" tabIndex={-1} autoComplete="off" value={honeypot} onChange={e => setHoneypot(e.target.value)} />
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
      return (
        <>
          <Textarea id={controlId} value={value} onChange={onChange} required={field.required}
            aria-invalid={hasError} aria-describedby={describedBy}
            placeholder={placeholder}
            rows={isEmbed ? 2 : 4} className={`${inputClass} resize-none ${isEmbed ? 'py-1.5 px-2' : ''}`} />
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
            min={toLocalDateInput(new Date())}
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
      return (
        <>
          <TimePickerField
            id={controlId}
            value={value}
            onChange={(v) => setForm(p => ({ ...p, eventTime: v }))}
            ariaInvalid={hasError}
            ariaDescribedby={describedBy}
            inputClass={inputClass}
            accentColor={formButtonColor}
            accentTextColor={textOnButton}
          />
          <FieldError field={field} isCustom={isCustom} />
        </>
      );
    }
    // Email: a one-tap "did you mean gmail.com?" fix for a common domain
    // typo — never a hard block, just a suggestion under the field.
    if (field.id === 'email') {
      const fix = suggestEmailFix(value);
      const showFix = !!fix && fix !== value.trim().toLowerCase();
      return (
        <>
          <Input id={controlId} type="email" value={value} onChange={onChange} required={field.required}
            autoComplete={!isCustom ? AUTOCOMPLETE.email : undefined}
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
    const perGuest = field.id === 'budgetRange' ? perGuestBudget(selected, form.guestCount ?? '') : null;
    const budgetGuide = field.id === 'budgetRange' ? guidance.budget : null;
    return (
      <>
        <div role="radiogroup" aria-labelledby={`${fieldElId(field)}-label`} id={fieldElId(field)} tabIndex={-1} className="flex gap-2 flex-wrap items-center">
          {options.map(o => {
            const isSel = selected === o.value;
            return (
              <button key={o.value} type="button" role="radio" aria-checked={isSel}
                onClick={() => setForm(p => ({ ...p, [field.id]: isSel ? '' : o.value }))}
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
    const extra = EVENT_EXTRA[form.eventType ?? ''];
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
          className={`${inputClass} min-h-[24px]`}
        >
          <option value="">Select an event type…</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {field && <FieldError field={field} />}
        {/* One relevant follow-up per event type — never the whole fixed
            field list at once. */}
        {extra && (
          <div className="mt-2.5">
            <label className="font-semibold text-[11px] tracking-wide block mb-1.5 text-gray-600">{extra.label}</label>
            {extra.text ? (
              <Input type="text" value={form.eventDetail ?? ''} onChange={e => setForm(p => ({ ...p, eventDetail: e.target.value }))}
                placeholder="Engagement, farewell, product launch…" className={inputClass} />
            ) : (
              <div className="flex gap-2 flex-wrap">
                {extra.opts!.map(o => {
                  const isSel = form.eventDetail === o;
                  return (
                    <button key={o} type="button" role="radio" aria-checked={isSel}
                      onClick={() => setForm(p => ({ ...p, eventDetail: isSel ? '' : o }))}
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
            <label className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-600">Invoice to</label>
            <Input type="text" value={form.invoicingNote ?? ''} onChange={e => setForm(p => ({ ...p, invoicingNote: e.target.value }))}
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
        <div role="radiogroup" aria-labelledby={`${formId}-source-label`} id={`${formId}-source`} tabIndex={-1} className="flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map(s => {
            const isSel = selected === s;
            return (
              <button key={s} type="button" role="radio" aria-checked={isSel}
                onClick={() => setForm(p => ({ ...p, source: isSel ? '' : s }))}
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

  /* ── Post-submit walkthrough request — shared by both the embed and
        full-page confirmation screens (see WalkthroughRequest). Needs the
        lead submit() just created and its proof-of-ownership token. ───── */
  function renderWalkthroughStep(size: 'sm' | 'lg') {
    if (!venue?.ownerId || !submittedLeadId || !submittedLeadToken || formConfig?.walkthroughEnabled === false) return null;
    return (
      <WalkthroughRequest ownerId={venue.ownerId} leadId={submittedLeadId} leadToken={submittedLeadToken}
        clientEmail={(form.email ?? '').trim()} big={size === 'lg'}
        accentColor={formButtonColor} accentTextColor={textOnButton}
        onRequested={() => postToParent({ type: "vf-walkthrough-requested" })} />
    );
  }

  /* ── EMBED MODE — stepped widget (Booking → Your Details → Summary) ──── */
  if (isEmbed) {
    // Step 1 ("Your Details"): just the contact fields — the fastest
    // possible path to a name + email, so someone who bails on step 2 still
    // leaves behind a real, contactable lead (startCapture, below).
    const detailsValid = detailFields.every(f => isFieldFilled(f));
    // Step 2 ("Your Event"): everything else — event fields, any custom
    // fields, source and message. Submits directly; there's no Summary step.
    const eventStepValid = eventFields.every(f => isFieldFilled(f))
      && customFields.every(f => isFieldFilled(f, true))
      && (!sourceField || isFieldFilled(sourceField))
      && (!messageField || isFieldFilled(messageField));
    const steps = ['Your Details', 'Your Event'];
    const eventTypeField = eventFields.find(f => f.id === 'eventType');
    const eventDateField = eventFields.find(f => f.id === 'eventDate');
    const timeField = eventFields.find(f => f.id === 'eventTime');
    const guestField = eventFields.find(f => f.id === 'guestCount');
    const formatField = eventFields.find(f => f.id === 'eventFormat');
    const budgetRangeField = eventFields.find(f => f.id === 'budgetRange');

    // Capped at a card-like width: the widget fills whatever the host page's
    // iframe/container gives it, and some site builders give a "custom HTML"
    // embed the full column width on desktop — without a cap this stretches
    // into oversized buttons and a wide, squat calendar instead of the
    // compact card it's designed as.
    return (
      <div style={{ fontFamily, backgroundColor: formCardBg }} className={cn("vf-embed-root vf-card w-full max-w-md mx-auto overflow-hidden rounded-lg", bgOverride && !bgTransparent ? "border border-[#e6dccb] shadow-sm" : "")}>

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
            <p className="font-semibold text-gray-800 text-sm mb-1" style={{ fontFamily: HEADING_FONT }}>Enquiry Received!</p>
            <p className="text-xs text-gray-600 leading-snug">{successMsg.replace('{venueName}', venueName)}</p>
            {inboxNote && <p className="text-xs text-gray-600 leading-snug mt-1">{inboxNote}</p>}
            {renderWalkthroughStep('sm')}
            <button type="button" onClick={resetForm}
              className="mt-5 h-9 px-4 border border-gray-200 rounded text-xs font-bold tracking-wide uppercase text-gray-600 hover:border-gray-300">
              Send another
            </button>
          </div>
        ) : isCompact ? (
          // ── COMPACT MODE (data-layout="compact") ── One continuous scroll
          // instead of the 3-step wizard: most traffic here is mobile, and
          // three steps of tapping NEXT is pure friction on a landing page a
          // visitor already committed to by tapping an ad. Same fields, same
          // renderField()/reqMark() as the wizard steps — just laid out flat.
          <div className="px-4 pb-4 pt-3 space-y-3">
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
            <button type="button" disabled={!(detailsValid && eventStepValid) || submitLead.isPending} onClick={doSubmit}
              className="vf-submit w-full font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: formButtonColor, color: textOnButton }}>
              {submitLead.isPending ? 'SUBMITTING…' : 'SUBMIT ENQUIRY'}
            </button>
            <p className="text-[9px] text-center text-gray-300">By submitting you agree to be contacted by {venueName}.</p>
          </div>
        ) : (
          <>
            {/* Progress steps */}
            <div className="flex items-start justify-center gap-1 px-4 pt-3 pb-1">
              {steps.map((label, i) => {
                const n = i + 1;
                const on = embedStep >= n;
                return (
                  <div key={label} className="flex items-start gap-1">
                    <div className="flex flex-col items-center w-16">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
                        style={on ? { backgroundColor: formButtonColor, color: textOnButton } : { backgroundColor: '#e5e7eb', color: '#9ca3af' }}>
                        {n}
                      </div>
                      <span className="text-[9px] mt-1 font-semibold text-center leading-tight" style={{ color: embedStep === n ? formButtonColor : '#9ca3af' }}>{label}</span>
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
                <div className="space-y-2.5">
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
                  <button type="button" disabled={!detailsValid} onClick={() => {
                    // Autosave a contactable lead the moment we have a name
                    // + email — once per visit, so going Back then Next
                    // again doesn't create a second partial row.
                    if (!capturedLeadId && venue?.ownerId) {
                      startCapture.mutate({
                        ownerId: venue.ownerId,
                        firstName: (form.firstName ?? '').trim(),
                        lastName: form.lastName?.trim() || undefined,
                        email: (form.email ?? '').trim(),
                        phone: form.phone?.trim() || undefined,
                        company: form.company?.trim() || undefined,
                        hp: honeypot || undefined,
                        formToken: formTokenRef.current ?? undefined,
                        ...clickAttribution,
                      });
                    }
                    setEmbedStep(2);
                  }}
                    className="vf-submit w-full font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: formButtonColor, color: textOnButton }}>NEXT →</button>
                </div>
              )}

              {/* ── STEP 2: Your Event — submits directly, no Summary step. ── */}
              {embedStep === 2 && (
                <div className="space-y-3">
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
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setEmbedStep(1)}
                      className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs border border-gray-200 text-gray-500 hover:bg-gray-50">← BACK</button>
                    <button type="button" disabled={!eventStepValid || submitLead.isPending} onClick={doSubmit}
                      className="vf-submit flex-1 font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ backgroundColor: formButtonColor, color: textOnButton }}>
                      {submitLead.isPending ? 'SUBMITTING…' : 'SUBMIT ENQUIRY'}
                    </button>
                  </div>
                  <p className="text-[9px] text-center text-gray-300">By submitting you agree to be contacted by {venueName}.</p>
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
            <h2 className="text-3xl font-bold mb-3 text-gray-800" style={{ fontFamily: HEADING_FONT }}>Enquiry Received!</h2>
            <p className="text-gray-500 mb-2">
              {successMsg.replace('{venueName}', venueName)}
            </p>
            {inboxNote && <p className="text-sm text-gray-600">{inboxNote}</p>}
            {renderWalkthroughStep('lg')}
            <button type="button" onClick={resetForm}
              className="mt-6 h-11 px-6 border border-gray-200 rounded text-sm font-bold tracking-wide uppercase text-gray-600 hover:border-gray-300">
              Send another
            </button>
            <div className="mt-8 pt-6 border-t border-dashed border-gray-200">
              <div className="font-bold text-xs tracking-widest text-gray-600">POWERED BY VenueFlowHQ</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 relative">
            {renderHoneypot()}

            {/* One unified panel — NowBookIt-style: event-type cards first, then details */}
            <div className="rounded-xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-7" style={{ backgroundColor: formCardBg }}>

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
                    <label className="font-bold text-xs tracking-widest block mb-3 text-gray-600">EVENT DETAILS</label>
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
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-600">YOUR DETAILS</label>
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
            <Button type="submit" disabled={submitLead.isPending}
              className="w-full font-bold tracking-widest rounded-lg h-14 text-base shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: formButtonColor, color: textOnButton }}>
              {submitLead.isPending ? "SUBMITTING…" : "SUBMIT ENQUIRY"}
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
