import { useState, useEffect, useId } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CheckCircle, MapPin, Phone, Mail, Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { combineLocalDateTime } from "@/lib/dateTime";
import { toast } from "sonner";

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

import { DEFAULT_FORM_FIELDS, mergeFormFields, EVENT_FORMAT_OPTIONS, BUDGET_RANGE_OPTIONS, eventFormatLabel, budgetRangeLabel, type FormFieldDef } from "@shared/formFields";

const FONT_MAP: Record<string, string> = {
  inter: "'Inter', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  cormorant: "'Cormorant Garamond', Georgia, serif",
  dm: "'DM Serif Display', Georgia, serif",
};

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

function DatePickerField({ id, value, onChange, min, disabled, ariaInvalid, ariaDescribedby, inputClass, accentColor, accentTextColor }: {
  id: string; value: string; onChange: (v: string) => void; min?: string; disabled?: boolean;
  ariaInvalid?: boolean; ariaDescribedby?: string; inputClass: string; accentColor: string; accentTextColor: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value + 'T00:00:00') : null;
  const [viewDate, setViewDate] = useState<Date>(parsed ?? new Date());
  useEffect(() => { if (parsed) setViewDate(parsed); }, [value]);

  const minDate = min ? new Date(min + 'T00:00:00') : null;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const mondayOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(mondayOffset).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id={id} disabled={disabled}
          aria-haspopup="dialog" aria-invalid={ariaInvalid} aria-describedby={ariaDescribedby}
          className={`${inputClass} flex items-center justify-between text-left disabled:opacity-50 disabled:cursor-not-allowed`}>
          <span className={value ? '' : 'text-muted-foreground'}>{value ? formatDateNZ(value) : 'Select a date'}</span>
          <CalendarIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month" className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold">{viewDate.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month" className="p-1 hover:bg-gray-100 rounded"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-400 mb-1">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />;
            const cellDate = new Date(year, month, day);
            const isPast = minDate ? cellDate < minDate : false;
            const cellIso = fmt(cellDate);
            const isSelected = value === cellIso;
            return (
              <button key={i} type="button" disabled={isPast}
                onClick={() => { onChange(cellIso); setOpen(false); }}
                aria-current={isSelected ? 'date' : undefined}
                className={`text-xs py-1.5 rounded transition-colors ${isPast ? 'text-gray-300 cursor-not-allowed' : isSelected ? 'font-semibold' : 'hover:bg-gray-100'}`}
                style={isSelected ? { backgroundColor: accentColor, color: accentTextColor } : undefined}>
                {day}
              </button>
            );
          })}
        </div>
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
          className={`${inputClass} flex items-center justify-between text-left`}>
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
      </PopoverContent>
    </Popover>
  );
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
  const paramFont = sp.get("font");       // any Google Font family name
  const paramBg = sp.get("bg");           // hex, no leading #
  // Collapses the embed's 3-step wizard into one scrolling form — set by
  // embed.js from data-layout="compact". Most traffic to these pages is
  // mobile, where three steps is pure friction.
  const isCompact = isEmbed && sp.get("layout") === "compact";
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

  // Load the requested Google Font on the fly so any family works.
  useEffect(() => {
    if (!paramFont || !/^[a-zA-Z0-9 ]+$/.test(paramFont)) return;
    const id = "vf-embed-font";
    document.getElementById(id)?.remove();
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${paramFont.trim().replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }, [paramFont]);

  // Auto-resize: when embedded, post our content height to the parent page so a
  // tiny script in the embed snippet can size the <iframe> to fit — no inner
  // scrollbars, no empty space, regardless of which step is showing.
  useEffect(() => {
    if (!isEmbed) return;
    const post = () => {
      const h = Math.ceil(document.documentElement.scrollHeight);
      try { window.parent?.postMessage({ type: "vf-embed-height", height: h }, paramParentOrigin); } catch { /* cross-origin */ }
    };
    post();
    const ro = new ResizeObserver(() => post());
    ro.observe(document.documentElement);
    // Safety posts for late reflow (custom font / images loading).
    const t1 = setTimeout(post, 400);
    const t2 = setTimeout(post, 1500);
    window.addEventListener("load", post);
    return () => { ro.disconnect(); clearTimeout(t1); clearTimeout(t2); window.removeEventListener("load", post); };
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

  // Full-page mode is a real, standalone page a visitor navigates to
  // directly — give it a real document title. The embed widget lives inside
  // someone else's page/iframe, where overwriting document.title would be
  // meaningless (or surprising), so it's skipped there.
  useEffect(() => {
    if (isEmbed) return;
    document.title = `Enquire — ${venue?.name ?? "VenueFlowHQ Venue"}`;
  }, [isEmbed, venue?.name]);

  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (prefillEventType) initial.eventType = prefillEventType;
    if (prefillDate) initial.eventDate = prefillDate;
    if (prefillGuests) initial.guestCount = prefillGuests;
    if (prefillFormat) initial.eventFormat = prefillFormat;
    return initial;
  });
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
  // Field ids that failed validation on the last submit attempt — drives the
  // inline error text/aria-invalid under each field. Cleared on submit, and
  // implicitly "resolved" per-field the moment isFieldFilled() says so again
  // (no per-keystroke bookkeeping needed).
  const [touchedInvalid, setTouchedInvalid] = useState<Set<string>>(new Set());

  // Autosaves a real, contactable lead the moment step 1 (Your Details) is
  // complete — firstName + email are always required by then. Without this,
  // everyone who taps an ad, gets as far as typing their name and email, then
  // bails on the event questions, simply vanishes: no record, no follow-up.
  const startCapture = trpc.leads.startCapture.useMutation({
    onSuccess: (data) => {
      setCapturedLeadId(data.leadId);
      try { window.parent?.postMessage({ type: 'vf-partial-captured' }, paramParentOrigin); } catch { /* no parent, or cross-origin quirk */ }
    },
    // No error toast — this is a background nicety. If it fails, submit()
    // just falls back to a normal insert; the visitor never sees a hiccup.
  });

  const submitLead = trpc.leads.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      // ── Conversion signal ───────────────────────────────────────────────
      // Embedding pages (and tag managers on them) need to know a submission
      // happened — Google Ads conversion tracking can't see inside the
      // iframe. Fired on BOTH modes; deliberately carries NO personal data,
      // only the qualifiers useful for value-based bidding.
      try {
        window.parent?.postMessage({
          type: "vf-enquiry-submitted",
          eventType: form.eventType || null,
          guestCount: form.guestCount ? parseInt(form.guestCount) : null,
          budgetRange: form.budgetRange || null,
          eventFormat: form.eventFormat || null,
        }, paramParentOrigin);
      } catch { /* no parent, or cross-origin quirk — the thank-you still shows */ }
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
      message: fullMessage || undefined,
      source: form.source || "lead_form",
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
  const formSubtitle = venue?.leadFormSubtitle ?? "Tell us about your event and we'll get back to you within 24 hours.";
  // Validate a hex param (3–8 hex digits) → "#rrggbb", else null.
  const hexParam = (h: string | null) => (h && /^[0-9a-fA-F]{3,8}$/.test(h)) ? `#${h}` : null;
  const accentOverride = hexParam(paramAccent);
  const bgOverride = hexParam(paramBg);

  const primaryColor = accentOverride ?? venue?.primaryColor ?? "#2D4A3E";
  const logoUrl      = (venue as any)?.logoUrl;
  // The white-out filter below only makes sense for a logo with real
  // transparency — a JPEG (never transparent) turns into a solid white
  // square under it. PNG/SVG at least support transparency; anything else
  // (or no recognisable extension, e.g. a bare upload URL) is shown as-is.
  const logoIsInvertible = /\.(svg|png)(?:[?#]|$)/i.test(logoUrl ?? '');
  const logoScale    = (venue as any)?.logoScale ?? 100;
  const formFont     = (venue as any)?.formFont ?? 'inter';
  // A ?font= param wins (loaded from Google Fonts above); else the saved font.
  const fontFamily   = (paramFont && /^[a-zA-Z0-9 ]+$/.test(paramFont))
    ? `'${paramFont.trim()}', system-ui, sans-serif`
    : (FONT_MAP[formFont] ?? FONT_MAP.inter);
  const textOnPrimary = isLight(primaryColor) ? "#1a1a1a" : "#ffffff";
  const galleryPhotoHeight = (venue as any)?.galleryPhotoHeight ?? 128;
  const successMsg   = (venue as any)?.formSuccessMessage || "Thank you for your enquiry. The team at {venueName} will be in touch within 24 hours.";
  const formPageBg      = bgOverride || (venue as any)?.formPageBg || "#f8f5f0";
  const formPageBgImage = (venue as any)?.formPageBgImage || null;
  const formCardBg      = bgOverride || (venue as any)?.formCardBg || "#ffffff";
  const formButtonColor = accentOverride || (venue as any)?.formButtonColor || primaryColor;
  const textOnButton    = isLight(formButtonColor) ? "#1a1a1a" : "#ffffff";

  let galleryImages: string[] = [];
  try { galleryImages = JSON.parse((venue as any)?.formGalleryImages ?? '[]') || []; } catch {}

  // Merge, don't replace: a saved config from before a default field existed
  // (Company, Preferred Time) must still show that field.
  let fields: FormFieldDef[] = mergeFormFields(null);
  try {
    fields = mergeFormFields(JSON.parse((venue as any)?.customFormFields ?? ''));
  } catch {}
  const visibleFields = fields.filter(f => f.visible);

  const detailIds = new Set(['firstName', 'lastName', 'email', 'phone', 'company']);
  const eventIds = new Set(['eventType', 'eventDate', 'eventTime', 'guestCount', 'eventFormat', 'budgetRange', 'budget']);
  const detailFields = visibleFields.filter(f => detailIds.has(f.id));
  const eventFields = visibleFields.filter(f => eventIds.has(f.id));
  const sourceField = visibleFields.find(f => f.id === 'source');
  const messageField = visibleFields.find(f => f.id === 'message');
  const customFields = visibleFields.filter(f => !f.isDefault);

  const inputClass = isEmbed
    ? "rounded-sm border border-[#6a7282] focus-visible:ring-1 focus-visible:ring-offset-0 text-xs bg-white h-7 px-2"
    : "rounded-sm border border-[#6a7282] focus-visible:ring-1 focus-visible:ring-offset-0 text-sm bg-white";

  function renderField(field: FormFieldDef, isCustom = false) {
    const value = isCustom ? (customFieldValues[field.label] ?? '') : (form[field.id] ?? '');
    const onChange = isCustom
      ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomFieldValues(p => ({ ...p, [field.label]: e.target.value }))
      : (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [field.id]: e.target.value }));

    if (field.id === 'eventType') return renderEventTypeSelect();
    if (field.id === 'source') return renderSourcePills();
    if (field.id === 'eventFormat' || field.id === 'budgetRange') return renderChoicePills(field);

    const controlId = fieldElId(field);
    const hasError = fieldHasError(field, isCustom);
    const describedBy = hasError ? fieldErrorId(field) : undefined;

    if (field.type === 'textarea') {
      return (
        <>
          <Textarea id={controlId} value={value} onChange={onChange} required={field.required}
            aria-invalid={hasError} aria-describedby={describedBy}
            placeholder="Any additional details…"
            rows={isEmbed ? 2 : 4} className={`${inputClass} resize-none ${isEmbed ? 'text-xs py-1 px-2' : ''}`} />
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
            min={new Date().toISOString().split("T")[0]}
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
    const input = (
      <Input
        id={controlId}
        type={field.type}
        value={value}
        onChange={onChange}
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
    const options = field.id === 'eventFormat' ? EVENT_FORMAT_OPTIONS : BUDGET_RANGE_OPTIONS;
    const selected = form[field.id] ?? '';
    return (
      <>
        <div role="radiogroup" aria-labelledby={`${fieldElId(field)}-label`} id={fieldElId(field)} tabIndex={-1} className="flex gap-2 flex-wrap">
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
        </div>
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
    return (
      <>
        <select
          id={field ? fieldElId(field) : undefined}
          value={form.eventType ?? ''}
          onChange={e => setForm(p => ({ ...p, eventType: e.target.value }))}
          required={field?.required}
          aria-invalid={hasError}
          aria-describedby={field && hasError ? fieldErrorId(field) : undefined}
          className={`${inputClass} min-h-[24px]`}
        >
          <option value="">Select an event type…</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {field && <FieldError field={field} />}
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
      <div style={{ fontFamily, backgroundColor: '#fff' }} className="w-full max-w-md mx-auto overflow-hidden rounded-lg border border-gray-200 shadow-sm">

        {/* Brand header bar */}
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ backgroundColor: formButtonColor, color: textOnButton }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: textOnButton }} />
          <span className="font-bold text-[11px] tracking-widest uppercase truncate">{venueName} · Enquire</span>
        </div>

        {/* Logo / name */}
        <div className="flex flex-col items-center gap-0.5 px-4 py-3 border-b border-gray-100">
          {logoUrl
            ? <img src={logoUrl} alt={venueName} style={{ height: `${Math.round(logoScale * 0.4)}px`, width: 'auto', objectFit: 'contain', maxWidth: '150px' }} />
            : <div className="font-bold text-base text-gray-800">{venueName}</div>}
          {logoUrl && <div className="text-[11px] text-gray-500">{venueName}</div>}
        </div>

        {submitted ? (
          <div role="status" className="text-center py-10 px-4">
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: formButtonColor }} />
            <p className="font-semibold text-gray-800 text-sm mb-1">Enquiry Received!</p>
            <p className="text-xs text-gray-600 leading-snug">{successMsg.replace('{venueName}', venueName)}</p>
          </div>
        ) : isCompact ? (
          // ── COMPACT MODE (data-layout="compact") ── One continuous scroll
          // instead of the 3-step wizard: most traffic here is mobile, and
          // three steps of tapping NEXT is pure friction on a landing page a
          // visitor already committed to by tapping an ad. Same fields, same
          // renderField()/reqMark() as the wizard steps — just laid out flat.
          <div className="px-4 pb-4 pt-3 space-y-3">
            {eventFields.some(f => f.id === 'eventType') && (
              <div>
                <label htmlFor={eventTypeField ? fieldElId(eventTypeField) : undefined} className="font-semibold text-[10px] tracking-wider block mb-1.5 text-gray-600 uppercase">Event type{reqMark(eventTypeField?.required)}</label>
                {renderEventTypeSelect()}
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
            <button type="button" disabled={!(detailsValid && eventStepValid) || submitLead.isPending} onClick={doSubmit}
              className="w-full font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
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
                        ...clickAttribution,
                      });
                    }
                    setEmbedStep(2);
                  }}
                    className="w-full font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
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

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setEmbedStep(1)}
                      className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs border border-gray-200 text-gray-500 hover:bg-gray-50">← BACK</button>
                    <button type="button" disabled={!eventStepValid || submitLead.isPending} onClick={doSubmit}
                      className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
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
          <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-2" style={{ color: textOnPrimary }}>{venueName}</h1>
          {formTitle && <p className="text-xl italic mb-3" style={{ color: textOnPrimary }}>{formTitle}</p>}
          <p className="text-sm leading-relaxed max-w-md mx-auto" style={{ color: `${textOnPrimary}e6` }}>{formSubtitle}</p>
          {(venue?.city || venue?.phone || venue?.email) && (
            <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
              {venue.city && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}88` }}><MapPin className="w-3 h-3" /> {venue.city}</div>}
              {venue.phone && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}88` }}><Phone className="w-3 h-3" /> {venue.phone}</div>}
              {venue.email && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}88` }}><Mail className="w-3 h-3" /> {venue.email}</div>}
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
            <h2 className="text-3xl font-bold mb-3 text-gray-800">Enquiry Received!</h2>
            <p className="text-gray-500 mb-2">
              {successMsg.replace('{venueName}', venueName)}
            </p>
            <p className="text-sm text-gray-600">Please check your email for updates.</p>
            <div className="mt-8 pt-6 border-t border-dashed border-gray-200">
              <div className="font-bold text-xs tracking-widest text-gray-600">POWERED BY VenueFlowHQ</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* One unified panel — NowBookIt-style: event-type cards first, then details */}
            <div className="rounded-xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-7" style={{ backgroundColor: formCardBg }}>

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
                const gridFields = eventFields.filter(f => f.id !== 'eventType' && f.id !== 'eventFormat' && f.id !== 'budgetRange');
                const pillFields = eventFields.filter(f => f.id === 'eventFormat' || f.id === 'budgetRange');
                if (gridFields.length === 0 && pillFields.length === 0) return null;
                return (
                  <div>
                    <label className="font-bold text-xs tracking-widest block mb-3 text-gray-600">EVENT DETAILS</label>
                    {gridFields.length > 0 && (
                      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${pillFields.length > 0 ? 'mb-4' : ''}`}>
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
