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

// Paradiso colour tokens
const T = {
  teal:      'oklch(0.280 0.065 178)',
  tealMid:   'oklch(0.400 0.075 178)',
  terra:     'oklch(0.450 0.155 25)',
  cream:     'oklch(0.958 0.020 88)',
  ivory:     'oklch(0.978 0.014 86)',
  ink:       'oklch(0.220 0.018 45)',
  stone:     'oklch(0.500 0.025 60)',
  border:    'oklch(0.875 0.022 80)',
};

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
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: T.cream }}>
      <div className="font-playfair text-2xl italic animate-pulse" style={{ color: T.terra }}>Loading…</div>
    </div>
  );

  const venueName   = venue?.name ?? "HOSTit Venue";
  const formTitle   = venue?.leadFormTitle ?? "Book Your Event";
  const formSubtitle = venue?.leadFormSubtitle ?? "Tell us about your event and we'll get back to you within 24 hours.";

  const inputClass = "rounded-none border-2 focus-visible:ring-0 focus-visible:border-[oklch(0.400_0.075_178)] font-inter text-sm";

  return (
    <div className="min-h-screen font-inter" style={{ backgroundColor: T.cream }}>

      {/* ── Paradiso Header ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: T.teal, color: T.cream }}>
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          {/* Logo */}
          <div className="flex items-center justify-center mb-5">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
              alt="HOSTit"
              className="h-14 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
          {/* Terracotta rule */}
          <div className="flex items-center gap-3 justify-center mb-6">
            <div className="flex-1 h-px" style={{ background: `${T.terra}55` }} />
            <div className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: T.terra }} />
            <div className="flex-1 h-px" style={{ background: `${T.terra}55` }} />
          </div>
          <div className="font-playfair text-3xl md:text-4xl font-bold leading-tight mb-2" style={{ color: T.cream }}>{venueName}</div>
          <h1 className="font-playfair italic text-xl mb-3" style={{ color: 'oklch(0.750 0.080 25)' }}>{formTitle}</h1>
          <p className="font-inter text-sm leading-relaxed max-w-md mx-auto" style={{ color: 'oklch(0.850 0.018 88)' }}>{formSubtitle}</p>
          {/* Venue contact info */}
          {(venue?.city || venue?.phone || venue?.email) && (
            <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
              {venue.city && <div className="flex items-center gap-1.5 text-xs" style={{ color: 'oklch(0.800 0.018 88)' }}><MapPin className="w-3 h-3" /> {venue.city}</div>}
              {venue.phone && <div className="flex items-center gap-1.5 text-xs" style={{ color: 'oklch(0.800 0.018 88)' }}><Phone className="w-3 h-3" /> {venue.phone}</div>}
              {venue.email && <div className="flex items-center gap-1.5 text-xs" style={{ color: 'oklch(0.800 0.018 88)' }}><Mail className="w-3 h-3" /> {venue.email}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Stripe accent band */}
      <div className="h-3 stripe-pattern" />

      <div className="max-w-2xl mx-auto px-6 py-10">
        {submitted ? (
          <div className="paradiso-card p-10 text-center" style={{ borderTop: `2px solid ${T.tealMid}` }}>
            <CheckCircle className="w-16 h-16 mx-auto mb-5" style={{ color: T.tealMid }} />
            <h2 className="font-playfair text-3xl font-bold mb-3" style={{ color: T.ink }}>Enquiry Received!</h2>
            <p className="font-inter mb-2" style={{ color: T.stone }}>
              Thank you for your enquiry. The team at <strong style={{ color: T.ink }}>{venueName}</strong> will be in touch within 24 hours.
            </p>
            <p className="font-inter text-sm" style={{ color: `${T.stone}99` }}>
              A confirmation has been noted. Please check your email for updates.
            </p>
            <div className="mt-8 pt-6 border-t border-dashed" style={{ borderColor: T.border }}>
              <div className="flex items-center justify-center">
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
                  alt="HOSTit"
                  className="h-8 w-auto object-contain"
                />
              </div>
              <div className="font-bebas text-xs tracking-widest mt-1" style={{ color: T.stone }}>EVENT CRM FOR NEW ZEALAND VENUES</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Personal Details */}
            <div className="paradiso-card p-6">
              <h2 className="font-bebas text-xs tracking-widest mb-4" style={{ color: T.stone }}>YOUR DETAILS</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>FIRST NAME *</label>
                  <Input required value={form.firstName} onChange={set("firstName")} placeholder="Jane" className={inputClass} />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>LAST NAME</label>
                  <Input value={form.lastName} onChange={set("lastName")} placeholder="Smith" className={inputClass} />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>EMAIL *</label>
                  <Input required type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" className={inputClass} />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>PHONE</label>
                  <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="+64 21 000 0000" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>COMPANY / ORGANISATION</label>
                  <Input value={form.company} onChange={set("company")} placeholder="Acme Ltd" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Event Details */}
            <div className="paradiso-card p-6">
              <h2 className="font-bebas text-xs tracking-widest mb-4" style={{ color: T.stone }}>EVENT DETAILS</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>TYPE OF EVENT</label>
                  <Select value={form.eventType} onValueChange={v => setForm(f => ({ ...f, eventType: v }))}>
                    <SelectTrigger className="rounded-none border-2 focus:ring-0 font-inter text-sm">
                      <SelectValue placeholder="Select event type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>PREFERRED DATE</label>
                  <Input type="date" value={form.eventDate} onChange={set("eventDate")}
                    min={new Date().toISOString().split("T")[0]} className={inputClass} />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>GUEST COUNT</label>
                  <Input type="number" value={form.guestCount} onChange={set("guestCount")} placeholder="50" min="1" className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>APPROXIMATE BUDGET (NZD)</label>
                  <Input type="number" value={form.budget} onChange={set("budget")} placeholder="5000" className={inputClass} />
                </div>
              </div>
            </div>

            {/* How did you hear */}
            <div className="paradiso-card p-6">
              <h2 className="font-bebas text-xs tracking-widest mb-3" style={{ color: T.stone }}>HOW DID YOU HEAR ABOUT US?</h2>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger className="rounded-none border-2 focus:ring-0 font-inter text-sm">
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
            <div className="paradiso-card p-6">
              <h2 className="font-bebas text-xs tracking-widest mb-3" style={{ color: T.stone }}>TELL US MORE</h2>
              <Textarea value={form.message} onChange={set("message")}
                placeholder="Any additional details about your event, special requirements, dietary needs, AV equipment, etc."
                rows={4} className={`${inputClass} resize-none`} />
            </div>

            {/* Submit */}
            <Button type="submit" disabled={submitLead.isPending}
              className="w-full font-bebas tracking-widest rounded-none h-14 text-lg shadow-sm transition-colors"
              style={{ backgroundColor: T.terra, color: T.cream }}>
              {submitLead.isPending ? "SUBMITTING…" : "SUBMIT ENQUIRY"}
            </Button>

            <p className="font-inter text-xs text-center" style={{ color: T.stone }}>
              By submitting this form you agree to be contacted by {venueName} regarding your event enquiry.
            </p>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="py-8 text-center mt-4" style={{ backgroundColor: T.ink, borderTop: `2px solid ${T.terra}55` }}>
        <div className="flex items-center justify-center mb-1">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
            alt="HOSTit"
            className="h-8 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>
        <div className="font-bebas text-xs tracking-widest" style={{ color: 'oklch(0.500 0.020 60)' }}>EVENT CRM · MADE FOR NEW ZEALAND VENUES</div>
        <div className="mt-3">
          <Link href="/dashboard">
            <span className="font-inter text-xs cursor-pointer transition-colors" style={{ color: 'oklch(0.450 0.020 60)' }}>Venue owner? Sign in →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
