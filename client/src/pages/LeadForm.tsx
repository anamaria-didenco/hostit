import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, MapPin, Phone, Mail } from "lucide-react";
import { trpc } from "@/lib/trpc";
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
  type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'textarea';
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

  const { data: venue, isLoading } = trpc.venue.getBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug }
  );

  const [form, setForm] = useState<Record<string, string>>({});
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  const submitLead = trpc.leads.submit.useMutation({
    onSuccess: () => { setSubmitted(true); toast.success("Enquiry submitted! We'll be in touch soon."); },
    onError: () => toast.error("Failed to submit. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue?.ownerId) return toast.error("Venue not found");
    // Append any custom field values to the message
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
      eventDate: form.eventDate || undefined,
      guestCount: form.guestCount ? parseInt(form.guestCount) : undefined,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      message: fullMessage || undefined,
      source: form.source || "lead_form",
    });
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f5f0]">
      <div className="text-2xl italic animate-pulse text-gray-400">Loading…</div>
    </div>
  );

  const venueName    = venue?.name ?? "HOSTit Venue";
  const formTitle    = venue?.leadFormTitle ?? "Book Your Event";
  const formSubtitle = venue?.leadFormSubtitle ?? "Tell us about your event and we'll get back to you within 24 hours.";
  const primaryColor = venue?.primaryColor ?? "#2D4A3E";
  const logoUrl      = (venue as any)?.logoUrl;
  const formFont     = (venue as any)?.formFont ?? 'inter';
  const fontFamily   = FONT_MAP[formFont] ?? FONT_MAP.inter;
  const textOnPrimary = isLight(primaryColor) ? "#1a1a1a" : "#ffffff";

  // Parse gallery images
  let galleryImages: string[] = [];
  try { galleryImages = JSON.parse((venue as any)?.formGalleryImages ?? '[]') || []; } catch {}

  // Parse form fields
  let fields: FormFieldDef[] = DEFAULT_FORM_FIELDS;
  try {
    const parsed = JSON.parse((venue as any)?.customFormFields ?? '');
    if (Array.isArray(parsed) && parsed.length > 0) fields = parsed;
  } catch {}
  const visibleFields = fields.filter(f => f.visible);

  // Group fields into sections: details (firstName..company), event (eventType..budget), source, message, custom
  const detailIds = new Set(['firstName', 'lastName', 'email', 'phone', 'company']);
  const eventIds = new Set(['eventType', 'eventDate', 'guestCount', 'budget']);
  const detailFields = visibleFields.filter(f => detailIds.has(f.id));
  const eventFields = visibleFields.filter(f => eventIds.has(f.id));
  const sourceField = visibleFields.find(f => f.id === 'source');
  const messageField = visibleFields.find(f => f.id === 'message');
  const customFields = visibleFields.filter(f => !f.isDefault);

  const inputClass = "rounded-sm border border-gray-200 focus-visible:ring-1 focus-visible:ring-offset-0 text-sm bg-white";

  function renderField(field: FormFieldDef, isCustom = false) {
    const value = isCustom ? (customFieldValues[field.label] ?? '') : (form[field.id] ?? '');
    const onChange = isCustom
      ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCustomFieldValues(p => ({ ...p, [field.label]: e.target.value }))
      : (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [field.id]: e.target.value }));

    if (field.id === 'eventType') {
      return (
        <Select value={form.eventType ?? ''} onValueChange={v => setForm(p => ({ ...p, eventType: v }))}>
          <SelectTrigger className="rounded-sm border border-gray-200 focus:ring-1 text-sm bg-white">
            <SelectValue placeholder="Select event type…" />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (field.id === 'source') {
      return (
        <Select value={form.source ?? ''} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
          <SelectTrigger className="rounded-sm border border-gray-200 focus:ring-1 text-sm bg-white">
            <SelectValue placeholder="Select an option…" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === 'textarea') {
      return (
        <Textarea value={value} onChange={onChange} required={field.required}
          placeholder="Any additional details about your event, special requirements, dietary needs, etc."
          rows={4} className={`${inputClass} resize-none`} />
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f8f5f0", fontFamily }}>

      {/* ── Venue Header ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: primaryColor, color: textOnPrimary }}>
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center mb-5">
            {logoUrl ? (
              <img src={logoUrl} alt={venueName} className="h-16 w-auto object-contain"
                style={isLight(primaryColor) ? {} : { filter: 'brightness(0) invert(1)' }} />
            ) : (
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                style={{ backgroundColor: `${textOnPrimary}22`, color: textOnPrimary }}>
                {venueName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          {/* Decorative rule */}
          <div className="flex items-center gap-3 justify-center mb-6">
            <div className="flex-1 h-px" style={{ background: `${textOnPrimary}33` }} />
            <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: `${textOnPrimary}88` }} />
            <div className="flex-1 h-px" style={{ background: `${textOnPrimary}33` }} />
          </div>
          <div className="text-3xl md:text-4xl font-bold leading-tight mb-2" style={{ color: textOnPrimary }}>{venueName}</div>
          <h1 className="text-xl italic mb-3" style={{ color: `${textOnPrimary}cc` }}>{formTitle}</h1>
          <p className="text-sm leading-relaxed max-w-md mx-auto" style={{ color: `${textOnPrimary}99` }}>{formSubtitle}</p>
          {/* Venue contact info */}
          {(venue?.city || venue?.phone || venue?.email) && (
            <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
              {venue.city && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}88` }}><MapPin className="w-3 h-3" /> {venue.city}</div>}
              {venue.phone && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}88` }}><Phone className="w-3 h-3" /> {venue.phone}</div>}
              {venue.email && <div className="flex items-center gap-1.5 text-xs" style={{ color: `${textOnPrimary}88` }}><Mail className="w-3 h-3" /> {venue.email}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Accent band */}
      <div className="h-1" style={{ backgroundColor: `${primaryColor}66` }} />

      {/* ── Gallery strip ─────────────────────────────────────── */}
      {galleryImages.length > 0 && (
        <div className="w-full overflow-x-auto flex gap-2 px-4 py-3 bg-white border-b border-gray-100">
          {galleryImages.map((img, i) => (
            <img key={i} src={img} alt={`Venue ${i + 1}`}
              className="h-32 w-auto object-cover flex-shrink-0 rounded-sm" />
          ))}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-10">
        {submitted ? (
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-10 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-5" style={{ color: primaryColor }} />
            <h2 className="text-3xl font-bold mb-3 text-gray-800">Enquiry Received!</h2>
            <p className="text-gray-500 mb-2">
              Thank you for your enquiry. The team at <strong className="text-gray-800">{venueName}</strong> will be in touch within 24 hours.
            </p>
            <p className="text-sm text-gray-400">A confirmation has been noted. Please check your email for updates.</p>
            <div className="mt-8 pt-6 border-t border-dashed border-gray-200">
              <div className="font-bold text-xs tracking-widest text-gray-400">POWERED BY HOSTit</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Personal Details */}
            {detailFields.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
                <h2 className="font-bold text-xs tracking-widest mb-4 text-gray-400">YOUR DETAILS</h2>
                <div className="grid grid-cols-2 gap-3">
                  {detailFields.map(field => (
                    <div key={field.id} className={field.id === 'company' ? 'col-span-2' : ''}>
                      <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">
                        {field.label.toUpperCase()}{field.required && ' *'}
                      </label>
                      {renderField(field)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event Details */}
            {eventFields.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
                <h2 className="font-bold text-xs tracking-widest mb-4 text-gray-400">EVENT DETAILS</h2>
                <div className="grid grid-cols-2 gap-3">
                  {eventFields.map(field => (
                    <div key={field.id} className={(field.id === 'eventType' || field.id === 'budget') ? 'col-span-2' : ''}>
                      <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">
                        {field.label.toUpperCase()}{field.required && ' *'}
                      </label>
                      {renderField(field)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom fields */}
            {customFields.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
                <h2 className="font-bold text-xs tracking-widest mb-4 text-gray-400">ADDITIONAL INFORMATION</h2>
                <div className="space-y-3">
                  {customFields.map(field => (
                    <div key={field.id}>
                      <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">
                        {field.label.toUpperCase()}{field.required && ' *'}
                      </label>
                      {renderField(field, true)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How did you hear */}
            {sourceField && (
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
                <h2 className="font-bold text-xs tracking-widest mb-3 text-gray-400">{sourceField.label.toUpperCase()}</h2>
                {renderField(sourceField)}
              </div>
            )}

            {/* Message */}
            {messageField && (
              <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
                <h2 className="font-bold text-xs tracking-widest mb-3 text-gray-400">{messageField.label.toUpperCase()}</h2>
                {renderField(messageField)}
              </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={submitLead.isPending}
              className="w-full font-bold tracking-widest rounded-sm h-14 text-base shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor, color: textOnPrimary }}>
              {submitLead.isPending ? "SUBMITTING…" : "SUBMIT ENQUIRY"}
            </Button>

            <p className="text-xs text-center text-gray-400">
              By submitting this form you agree to be contacted by {venueName} regarding your event enquiry.
            </p>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="py-8 text-center mt-4 bg-gray-800 border-t border-gray-700">
        <div className="font-bold text-xs tracking-widest text-gray-500">POWERED BY HOSTit · EVENT CRM FOR NEW ZEALAND VENUES</div>
        <div className="mt-3">
          <Link href="/dashboard">
            <span className="text-xs cursor-pointer transition-colors text-gray-600 hover:text-gray-400">Venue owner? Sign in →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
