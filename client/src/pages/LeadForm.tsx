import { useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, MapPin, Phone, Mail } from "lucide-react";
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

type FormFieldDef = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'select' | 'textarea';
  required: boolean;
  visible: boolean;
  isDefault: boolean;
};

const DEFAULT_FORM_FIELDS: FormFieldDef[] = [
  { id: 'firstName', label: 'First Name', type: 'text', required: true, visible: true, isDefault: true },
  { id: 'lastName', label: 'Last Name', type: 'text', required: false, visible: true, isDefault: true },
  { id: 'email', label: 'Email', type: 'email', required: true, visible: true, isDefault: true },
  { id: 'phone', label: 'Phone', type: 'tel', required: false, visible: true, isDefault: true },
  { id: 'company', label: 'Company / Organisation', type: 'text', required: false, visible: true, isDefault: true },
  { id: 'eventType', label: 'Type of Event', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'eventDate', label: 'Preferred Date', type: 'date', required: false, visible: true, isDefault: true },
  { id: 'eventTime', label: 'Preferred Time', type: 'time', required: false, visible: true, isDefault: true },
  { id: 'guestCount', label: 'Guest Count', type: 'number', required: false, visible: true, isDefault: true },
  { id: 'budget', label: 'Approximate Budget (NZD)', type: 'number', required: false, visible: true, isDefault: true },
  { id: 'source', label: 'How did you hear about us?', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'message', label: 'Message / Tell us more', type: 'textarea', required: false, visible: true, isDefault: true },
];

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

export default function LeadForm() {
  const { slug } = useParams<{ slug?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const isEmbed = new URLSearchParams(window.location.search).get("embed") === "1";

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

  const [form, setForm] = useState<Record<string, string>>({});
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  // Stepped embed widget state (NowBookIt-style: Booking → Your Details → Summary)
  const [embedStep, setEmbedStep] = useState(1);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  const submitLead = trpc.leads.submit.useMutation({
    onSuccess: () => { setSubmitted(true); },
    onError: () => toast.error("Failed to submit. Please try again."),
  });

  const doSubmit = () => {
    if (!venue?.ownerId) return toast.error("Venue not found");
    const customParts = Object.entries(customFieldValues)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v}`);
    const fullMessage = [form.message, ...customParts].filter(Boolean).join('\n\n');
    submitLead.mutate({
      ownerId: venue.ownerId,
      firstName: form.firstName ?? '',
      lastName: form.lastName || undefined,
      email: form.email ?? '',
      phone: form.phone || undefined,
      company: form.company || undefined,
      eventType: form.eventType || undefined,
      eventDate: combineLocalDateTime(form.eventDate, form.eventTime),
      guestCount: form.guestCount ? parseInt(form.guestCount) : undefined,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      message: fullMessage || undefined,
      source: form.source || "lead_form",
    });
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); doSubmit(); };

  if (isLoading) return (
    <div className={isEmbed ? "flex items-center justify-center py-12" : "min-h-screen flex items-center justify-center bg-[#f8f5f0]"}>
      <div className="text-xl italic animate-pulse text-gray-400">Loading…</div>
    </div>
  );

  const venueName    = venue?.name ?? "VenueFlowHQ Venue";
  const formTitle    = venue?.leadFormTitle ?? "Book Your Event";
  const formSubtitle = venue?.leadFormSubtitle ?? "Tell us about your event and we'll get back to you within 24 hours.";
  const primaryColor = venue?.primaryColor ?? "#2D4A3E";
  const logoUrl      = (venue as any)?.logoUrl;
  const logoScale    = (venue as any)?.logoScale ?? 100;
  const formFont     = (venue as any)?.formFont ?? 'inter';
  const fontFamily   = FONT_MAP[formFont] ?? FONT_MAP.inter;
  const textOnPrimary = isLight(primaryColor) ? "#1a1a1a" : "#ffffff";
  const galleryPhotoHeight = (venue as any)?.galleryPhotoHeight ?? 128;
  const successMsg   = (venue as any)?.formSuccessMessage || "Thank you for your enquiry. The team at {venueName} will be in touch within 24 hours.";
  const formPageBg      = (venue as any)?.formPageBg || "#f8f5f0";
  const formPageBgImage = (venue as any)?.formPageBgImage || null;
  const formCardBg      = (venue as any)?.formCardBg || "#ffffff";
  const formButtonColor = (venue as any)?.formButtonColor || primaryColor;
  const textOnButton    = isLight(formButtonColor) ? "#1a1a1a" : "#ffffff";

  let galleryImages: string[] = [];
  try { galleryImages = JSON.parse((venue as any)?.formGalleryImages ?? '[]') || []; } catch {}

  let fields: FormFieldDef[] = DEFAULT_FORM_FIELDS;
  try {
    const parsed = JSON.parse((venue as any)?.customFormFields ?? '');
    if (Array.isArray(parsed) && parsed.length > 0) fields = parsed;
  } catch {}
  const visibleFields = fields.filter(f => f.visible);

  const detailIds = new Set(['firstName', 'lastName', 'email', 'phone', 'company']);
  const eventIds = new Set(['eventType', 'eventDate', 'eventTime', 'guestCount', 'budget']);
  const detailFields = visibleFields.filter(f => detailIds.has(f.id));
  const eventFields = visibleFields.filter(f => eventIds.has(f.id));
  const sourceField = visibleFields.find(f => f.id === 'source');
  const messageField = visibleFields.find(f => f.id === 'message');
  const customFields = visibleFields.filter(f => !f.isDefault);

  const inputClass = isEmbed
    ? "rounded-sm border border-gray-200 focus-visible:ring-1 focus-visible:ring-offset-0 text-xs bg-white h-7 px-2"
    : "rounded-sm border border-gray-200 focus-visible:ring-1 focus-visible:ring-offset-0 text-sm bg-white";

  function renderField(field: FormFieldDef, isCustom = false) {
    const value = isCustom ? (customFieldValues[field.label] ?? '') : (form[field.id] ?? '');
    const onChange = isCustom
      ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomFieldValues(p => ({ ...p, [field.label]: e.target.value }))
      : (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [field.id]: e.target.value }));

    if (field.id === 'eventType') return renderEventTypeCards();
    if (field.id === 'source') return renderSourcePills();
    if (field.type === 'textarea') {
      return (
        <Textarea value={value} onChange={onChange} required={field.required}
          placeholder="Any additional details…"
          rows={isEmbed ? 2 : 4} className={`${inputClass} resize-none ${isEmbed ? 'text-xs py-1 px-2' : ''}`} />
      );
    }
    return (
      <Input
        type={field.type}
        value={value}
        onChange={onChange}
        required={field.required}
        min={field.type === 'date' ? new Date().toISOString().split("T")[0] : undefined}
        placeholder={field.type === 'date' ? undefined : field.id === 'phone' ? '+64 21 000 0000' : field.id === 'guestCount' ? '50' : field.id === 'budget' ? '5000' : ''}
        className={inputClass}
      />
    );
  }

  /* ── NowBookIt-style selectable cards (event type) ─────────────────── */
  function renderEventTypeCards() {
    const selected = form.eventType ?? '';
    return (
      <div className={`grid gap-2 ${isEmbed ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {EVENT_TYPES.map(t => {
          const isSel = selected === t;
          return (
            <button key={t} type="button"
              onClick={() => setForm(p => ({ ...p, eventType: isSel ? '' : t }))}
              className={`rounded-lg border text-center transition-all ${isEmbed ? 'px-2 py-2 text-[11px]' : 'px-3 py-3 text-sm'} ${isSel ? 'font-semibold shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
              style={isSel ? { backgroundColor: formButtonColor, color: textOnButton, borderColor: formButtonColor } : {}}>
              {t}
            </button>
          );
        })}
      </div>
    );
  }

  /* ── NowBookIt-style selectable pills (how did you hear) ───────────── */
  function renderSourcePills() {
    const selected = form.source ?? '';
    return (
      <div className="flex flex-wrap gap-1.5">
        {SOURCE_OPTIONS.map(s => {
          const isSel = selected === s;
          return (
            <button key={s} type="button"
              onClick={() => setForm(p => ({ ...p, source: isSel ? '' : s }))}
              className={`rounded-full border transition-all ${isEmbed ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-xs'} ${isSel ? 'font-semibold shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
              style={isSel ? { backgroundColor: formButtonColor, color: textOnButton, borderColor: formButtonColor } : {}}>
              {s}
            </button>
          );
        })}
      </div>
    );
  }

  /* ── EMBED MODE — stepped widget (Booking → Your Details → Summary) ──── */
  if (isEmbed) {
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const selectedDate = form.eventDate ? new Date(form.eventDate + 'T00:00:00') : null;

    // Calendar grid for the displayed month (Monday-first)
    const calYear = calMonth.getFullYear();
    const calIdx = calMonth.getMonth();
    const startOffset = (new Date(calYear, calIdx, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(calYear, calIdx + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const prevDisabled = calYear < today.getFullYear() || (calYear === today.getFullYear() && calIdx <= today.getMonth());
    const goMonth = (delta: number) => { const m = new Date(calMonth); m.setMonth(m.getMonth() + delta); setCalMonth(m); };
    const fmtSelected = selectedDate
      ? selectedDate.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
      : 'Select a date';

    const detailsValid = !!(form.firstName ?? '').trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((form.email ?? '').trim());
    const steps = ['Booking', 'Your Details', 'Summary'];
    const timeField = eventFields.find(f => f.id === 'eventTime');
    const guestField = eventFields.find(f => f.id === 'guestCount');

    return (
      <div style={{ fontFamily, backgroundColor: '#fff' }} className="w-full overflow-hidden rounded-lg border border-gray-200 shadow-sm">

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
          <div className="text-center py-10 px-4">
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: formButtonColor }} />
            <p className="font-semibold text-gray-800 text-sm mb-1">Enquiry Received!</p>
            <p className="text-xs text-gray-400 leading-snug">{successMsg.replace('{venueName}', venueName)}</p>
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
              {/* ── STEP 1: Booking ── */}
              {embedStep === 1 && (
                <div className="space-y-3">
                  {eventFields.some(f => f.id === 'eventType') && (
                    <div>
                      <label className="font-semibold text-[10px] tracking-wider block mb-1.5 text-gray-400 uppercase">Event type</label>
                      {renderEventTypeCards()}
                    </div>
                  )}

                  {eventFields.some(f => f.id === 'eventDate') && (
                    <div>
                      <div className="flex items-center justify-between px-3 py-2 rounded-t-md" style={{ backgroundColor: formButtonColor, color: textOnButton }}>
                        <span className="font-bold text-sm">{calYear}</span>
                        <span className="text-xs opacity-90">{fmtSelected}</span>
                      </div>
                      <div className="border border-t-0 border-gray-200 rounded-b-md px-2 py-2">
                        <div className="flex items-center justify-between px-1 mb-1.5">
                          <button type="button" disabled={prevDisabled} onClick={() => goMonth(-1)}
                            className="w-6 h-6 flex items-center justify-center text-gray-500 disabled:opacity-25 hover:bg-gray-100 rounded">‹</button>
                          <span className="text-xs font-semibold text-gray-700">{MONTH_NAMES[calIdx]} {calYear}</span>
                          <button type="button" onClick={() => goMonth(1)}
                            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded">›</button>
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 text-center">
                          {DOW.map(d => <div key={d} className="text-[9px] text-gray-400 font-semibold py-0.5">{d}</div>)}
                          {cells.map((d, i) => {
                            if (d === null) return <div key={`e${i}`} />;
                            const cellDate = new Date(calYear, calIdx, d);
                            const isPast = cellDate < today;
                            const isSel = !!selectedDate && cellDate.getTime() === selectedDate.getTime();
                            const dateStr = `${calYear}-${String(calIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            return (
                              <button key={d} type="button" disabled={isPast}
                                onClick={() => setForm(p => ({ ...p, eventDate: dateStr }))}
                                className={`text-[11px] h-7 rounded-full transition-colors ${isPast ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`}
                                style={isSel ? { backgroundColor: formButtonColor, color: textOnButton, fontWeight: 700 } : {}}>
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {(timeField || guestField) && (
                    <div className="grid grid-cols-2 gap-2">
                      {timeField && (
                        <div>
                          <label className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-400 uppercase">{timeField.label}</label>
                          {renderField(timeField)}
                        </div>
                      )}
                      {guestField && (
                        <div>
                          <label className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-400 uppercase">{guestField.label}</label>
                          {renderField(guestField)}
                        </div>
                      )}
                    </div>
                  )}

                  <button type="button" onClick={() => setEmbedStep(2)}
                    className="w-full font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90"
                    style={{ backgroundColor: formButtonColor, color: textOnButton }}>NEXT →</button>
                </div>
              )}

              {/* ── STEP 2: Your Details ── */}
              {embedStep === 2 && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    {detailFields.map(field => (
                      <div key={field.id} className={field.id === 'company' ? 'col-span-2' : ''}>
                        <label className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-400 uppercase">{field.label}{field.required && ' *'}</label>
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                  {customFields.map(field => (
                    <div key={field.id}>
                      <label className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-400 uppercase">{field.label}{field.required && ' *'}</label>
                      {renderField(field, true)}
                    </div>
                  ))}
                  {messageField && (
                    <div>
                      <label className="font-semibold text-[10px] tracking-wider block mb-0.5 text-gray-400 uppercase">{messageField.label}</label>
                      {renderField(messageField)}
                    </div>
                  )}
                  {sourceField && (
                    <div>
                      <label className="font-semibold text-[10px] tracking-wider block mb-1 text-gray-400 uppercase">{sourceField.label}</label>
                      {renderSourcePills()}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setEmbedStep(1)}
                      className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs border border-gray-200 text-gray-500 hover:bg-gray-50">← BACK</button>
                    <button type="button" disabled={!detailsValid} onClick={() => setEmbedStep(3)}
                      className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                      style={{ backgroundColor: formButtonColor, color: textOnButton }}>NEXT →</button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Summary ── */}
              {embedStep === 3 && (
                <div className="space-y-3">
                  <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
                    {([
                      ['Event', form.eventType],
                      ['Date', selectedDate ? selectedDate.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''],
                      ['Time', form.eventTime],
                      ['Guests', form.guestCount],
                      ['Name', [form.firstName, form.lastName].filter(Boolean).join(' ')],
                      ['Email', form.email],
                      ['Phone', form.phone],
                    ] as [string, string | undefined][]).filter(([, v]) => v && v.trim()).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 px-3 py-1.5 text-xs">
                        <span className="text-gray-400 font-semibold uppercase text-[10px] tracking-wider flex-shrink-0">{k}</span>
                        <span className="text-gray-800 text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEmbedStep(2)}
                      className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs border border-gray-200 text-gray-500 hover:bg-gray-50">← BACK</button>
                    <button type="button" disabled={submitLead.isPending} onClick={doSubmit}
                      className="flex-1 font-bold tracking-widest rounded-md h-9 text-xs shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
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

  return (
    <div className="min-h-screen" style={{ ...pageBgStyle, fontFamily }}>

      {/* Venue Header */}
      <div style={{ backgroundColor: primaryColor, color: textOnPrimary }}>
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          <div className="flex items-center justify-center mb-5">
            {logoUrl ? (
              <img src={logoUrl} alt={venueName}
                style={{ height: `${Math.round(logoScale * 0.64)}px`, width: 'auto', objectFit: 'contain', maxWidth: '80%', ...(isLight(primaryColor) ? {} : { filter: 'brightness(0) invert(1)' }) }} />
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
          <div className="text-3xl md:text-4xl font-bold leading-tight mb-2" style={{ color: textOnPrimary }}>{venueName}</div>
          <h1 className="text-xl italic mb-3" style={{ color: `${textOnPrimary}cc` }}>{formTitle}</h1>
          <p className="text-sm leading-relaxed max-w-md mx-auto" style={{ color: `${textOnPrimary}99` }}>{formSubtitle}</p>
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
          <div className="rounded-lg border border-gray-100 shadow-sm p-10 text-center" style={{ backgroundColor: formCardBg }}>
            <CheckCircle className="w-16 h-16 mx-auto mb-5" style={{ color: formButtonColor }} />
            <h2 className="text-3xl font-bold mb-3 text-gray-800">Enquiry Received!</h2>
            <p className="text-gray-500 mb-2">
              {successMsg.replace('{venueName}', venueName)}
            </p>
            <p className="text-sm text-gray-400">Please check your email for updates.</p>
            <div className="mt-8 pt-6 border-t border-dashed border-gray-200">
              <div className="font-bold text-xs tracking-widest text-gray-400">POWERED BY VenueFlowHQ</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* One unified panel — NowBookIt-style: event-type cards first, then details */}
            <div className="rounded-xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-7" style={{ backgroundColor: formCardBg }}>

              {/* Event type — tappable cards (the signature NowBookIt element, shown first) */}
              {eventFields.some(f => f.id === 'eventType') && (
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-500">WHAT KIND OF EVENT?</label>
                  {renderEventTypeCards()}
                </div>
              )}

              {/* Remaining event details (date, time, guests, budget) */}
              {eventFields.filter(f => f.id !== 'eventType').length > 0 && (
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-500">EVENT DETAILS</label>
                  <div className="grid grid-cols-2 gap-3">
                    {eventFields.filter(f => f.id !== 'eventType').map(field => (
                      <div key={field.id} className={field.id === 'budget' ? 'col-span-2' : ''}>
                        <label className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-400">
                          {field.label.toUpperCase()}{field.required && ' *'}
                        </label>
                        {renderField(field)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Your details */}
              {detailFields.length > 0 && (
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-500">YOUR DETAILS</label>
                  <div className="grid grid-cols-2 gap-3">
                    {detailFields.map(field => (
                      <div key={field.id} className={field.id === 'company' ? 'col-span-2' : ''}>
                        <label className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-400">
                          {field.label.toUpperCase()}{field.required && ' *'}
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
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-500">ADDITIONAL INFORMATION</label>
                  <div className="space-y-3">
                    {customFields.map(field => (
                      <div key={field.id}>
                        <label className="font-semibold text-[11px] tracking-wide block mb-1 text-gray-400">
                          {field.label.toUpperCase()}{field.required && ' *'}
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
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-500">{sourceField.label.toUpperCase()}</label>
                  {renderSourcePills()}
                </div>
              )}

              {/* Message */}
              {messageField && (
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-3 text-gray-500">{messageField.label.toUpperCase()}</label>
                  {renderField(messageField)}
                </div>
              )}
            </div>

            <Button type="submit" disabled={submitLead.isPending}
              className="w-full font-bold tracking-widest rounded-lg h-14 text-base shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: formButtonColor, color: textOnButton }}>
              {submitLead.isPending ? "SUBMITTING…" : "SUBMIT ENQUIRY"}
            </Button>

            <p className="text-xs text-center text-gray-400">
              By submitting this form you agree to be contacted by {venueName} regarding your event enquiry.
            </p>
          </form>
        )}
      </div>

      <div className="py-6 text-center mt-4 bg-gray-800 border-t border-gray-700">
        <div className="font-bold text-xs tracking-widest text-gray-500">POWERED BY VenueFlowHQ · EVENT CRM FOR NEW ZEALAND VENUES</div>
        <div className="mt-2">
          <Link href="/dashboard">
            <span className="text-xs cursor-pointer transition-colors text-gray-600 hover:text-gray-400">Venue owner? Sign in →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
