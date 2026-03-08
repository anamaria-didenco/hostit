import { useState } from "react";
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

// Convert hex to OKLCH-compatible CSS (we just use the hex directly for simplicity)
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

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    company: "", eventType: "", eventDate: "", guestCount: "", budget: "", message: "", source: "",
  });

  const submitLead = trpc.leads.submit.useMutation({
    onSuccess: () => { setSubmitted(true); toast.success("Enquiry submitted! We'll be in touch soon."); },
    onError: () => toast.error("Failed to submit. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue?.ownerId) return toast.error("Venue not found");
    submitLead.mutate({
      ownerId: venue.ownerId,
      firstName: form.firstName,
      lastName: form.lastName || undefined,
      email: form.email,
      phone: form.phone || undefined,
      company: form.company || undefined,
      eventType: form.eventType || undefined,
      eventDate: form.eventDate || undefined,
      guestCount: form.guestCount ? parseInt(form.guestCount) : undefined,
      budget: form.budget ? parseFloat(form.budget) : undefined,
      message: form.message || undefined,
      source: form.source || "lead_form",
    });
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f5f0]">
      <div className="text-2xl italic animate-pulse text-gray-400">Loading…</div>
    </div>
  );

  const venueName    = venue?.name ?? "HOSTit Venue";
  const formTitle    = venue?.leadFormTitle ?? "Book Your Event";
  const formSubtitle = venue?.leadFormSubtitle ?? "Tell us about your event and we'll get back to you within 24 hours.";
  const primaryColor = venue?.primaryColor ?? "#2D4A3E";
  const logoUrl      = venue?.logoUrl;
  const textOnPrimary = isLight(primaryColor) ? "#1a1a1a" : "#ffffff";

  const inputClass = "rounded-sm border border-gray-200 focus-visible:ring-1 focus-visible:ring-offset-0 font-inter text-sm bg-white";

  return (
    <div className="min-h-screen font-inter" style={{ backgroundColor: "#f8f5f0" }}>

      {/* ── Venue Header ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: primaryColor, color: textOnPrimary }}>
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          {/* Logo or venue initial */}
          <div className="flex items-center justify-center mb-5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={venueName}
                className="h-16 w-auto object-contain"
                style={isLight(primaryColor) ? {} : { filter: 'brightness(0) invert(1)' }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                style={{ backgroundColor: `${textOnPrimary}22`, color: textOnPrimary }}
              >
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
          <div className="text-3xl md:text-4xl font-bold leading-tight mb-2 font-serif" style={{ color: textOnPrimary }}>{venueName}</div>
          <h1 className="text-xl italic mb-3 font-serif" style={{ color: `${textOnPrimary}cc` }}>{formTitle}</h1>
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

      <div className="max-w-2xl mx-auto px-6 py-10">
        {submitted ? (
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-10 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-5" style={{ color: primaryColor }} />
            <h2 className="text-3xl font-bold mb-3 font-serif text-gray-800">Enquiry Received!</h2>
            <p className="text-gray-500 mb-2">
              Thank you for your enquiry. The team at <strong className="text-gray-800">{venueName}</strong> will be in touch within 24 hours.
            </p>
            <p className="text-sm text-gray-400">
              A confirmation has been noted. Please check your email for updates.
            </p>
            <div className="mt-8 pt-6 border-t border-dashed border-gray-200">
              <div className="font-bold text-xs tracking-widest text-gray-400">POWERED BY HOSTit</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Personal Details */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-xs tracking-widest mb-4 text-gray-400">YOUR DETAILS</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">FIRST NAME *</label>
                  <Input required value={form.firstName} onChange={set("firstName")} placeholder="Jane" className={inputClass} />
                </div>
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">LAST NAME</label>
                  <Input value={form.lastName} onChange={set("lastName")} placeholder="Smith" className={inputClass} />
                </div>
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">EMAIL *</label>
                  <Input required type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" className={inputClass} />
                </div>
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">PHONE</label>
                  <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="+64 21 000 0000" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">COMPANY / ORGANISATION</label>
                  <Input value={form.company} onChange={set("company")} placeholder="Acme Ltd" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Event Details */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-xs tracking-widest mb-4 text-gray-400">EVENT DETAILS</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">TYPE OF EVENT</label>
                  <Select value={form.eventType} onValueChange={v => setForm(f => ({ ...f, eventType: v }))}>
                    <SelectTrigger className="rounded-sm border border-gray-200 focus:ring-1 font-inter text-sm bg-white">
                      <SelectValue placeholder="Select event type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">PREFERRED DATE</label>
                  <Input type="date" value={form.eventDate} onChange={set("eventDate")}
                    min={new Date().toISOString().split("T")[0]} className={inputClass} />
                </div>
                <div>
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">GUEST COUNT</label>
                  <Input type="number" value={form.guestCount} onChange={set("guestCount")} placeholder="50" min="1" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="font-bold text-xs tracking-widest block mb-1 text-gray-500">APPROXIMATE BUDGET (NZD)</label>
                  <Input type="number" value={form.budget} onChange={set("budget")} placeholder="5000" className={inputClass} />
                </div>
              </div>
            </div>

            {/* How did you hear */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-xs tracking-widest mb-3 text-gray-400">HOW DID YOU HEAR ABOUT US?</h2>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger className="rounded-sm border border-gray-200 focus:ring-1 font-inter text-sm bg-white">
                  <SelectValue placeholder="Select an option…" />
                </SelectTrigger>
                <SelectContent>
                  {["Instagram","Facebook","Google Search","Website","Word of Mouth / Referral","Walk-In","Event Directory","Previous Client","Other"].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Message */}
            <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-xs tracking-widest mb-3 text-gray-400">TELL US MORE</h2>
              <Textarea value={form.message} onChange={set("message")}
                placeholder="Any additional details about your event, special requirements, dietary needs, AV equipment, etc."
                rows={4} className={`${inputClass} resize-none`} />
            </div>

            {/* Submit */}
            <Button type="submit" disabled={submitLead.isPending}
              className="w-full font-bold tracking-widest rounded-sm h-14 text-base shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor, color: textOnPrimary }}>
              {submitLead.isPending ? "SUBMITTING…" : "SUBMIT ENQUIRY"}
            </Button>

            <p className="font-inter text-xs text-center text-gray-400">
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
            <span className="font-inter text-xs cursor-pointer transition-colors text-gray-600 hover:text-gray-400">Venue owner? Sign in →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
