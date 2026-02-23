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

export default function LeadForm() {
  const { slug } = useParams<{ slug?: string }>();
  const [submitted, setSubmitted] = useState(false);

  const { data: venue, isLoading } = trpc.venue.getBySlug.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug }
  );

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    eventType: "",
    eventDate: "",
    guestCount: "",
    budget: "",
    message: "",
  });

  const submitLead = trpc.leads.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Enquiry submitted! We'll be in touch soon.");
    },
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
      source: "lead_form",
    });
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  if (isLoading) return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <div className="font-alfa text-3xl text-tomato/20 animate-pulse">LOADING...</div>
    </div>
  );

  // Generic form if no slug/venue found
  const venueName = venue?.name ?? "HOSTit Venue";
  const formTitle = venue?.leadFormTitle ?? "Book Your Event";
  const formSubtitle = venue?.leadFormSubtitle ?? "Tell us about your event and we'll get back to you within 24 hours.";

  return (
    <div className="min-h-screen bg-[#FAF7F2] font-dm">
      {/* Vintage Header */}
      <div className="bg-brown text-cream">
        <div className="max-w-2xl mx-auto px-6 py-10 text-center">
          <div className="flex items-center justify-center gap-0.5 mb-4">
            <span className="font-alfa text-4xl text-tomato">HOST</span>
            <span className="font-pacifico text-3xl text-amber">it</span>
          </div>

          {/* Decorative rule */}
          <div className="flex items-center gap-3 justify-center mb-5">
            <div className="flex-1 h-px bg-cream/20" />
            <div className="w-1.5 h-1.5 bg-amber rotate-45" />
            <div className="flex-1 h-px bg-cream/20" />
          </div>

          <div className="font-alfa text-3xl md:text-4xl text-cream leading-tight mb-2">{venueName}</div>
          <h1 className="font-bebas text-xl tracking-widest text-amber mb-3">{formTitle}</h1>
          <p className="font-dm text-sm text-cream/60 max-w-md mx-auto">{formSubtitle}</p>

          {/* Venue contact info */}
          {(venue?.city || venue?.phone || venue?.email) && (
            <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
              {venue.city && (
                <div className="flex items-center gap-1.5 text-cream/40 text-xs font-dm">
                  <MapPin className="w-3 h-3" /> {venue.city}
                </div>
              )}
              {venue.phone && (
                <div className="flex items-center gap-1.5 text-cream/40 text-xs font-dm">
                  <Phone className="w-3 h-3" /> {venue.phone}
                </div>
              )}
              {venue.email && (
                <div className="flex items-center gap-1.5 text-cream/40 text-xs font-dm">
                  <Mail className="w-3 h-3" /> {venue.email}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Red accent stripe */}
      <div className="h-2 bg-tomato" />

      <div className="max-w-2xl mx-auto px-6 py-10">
        {submitted ? (
          <div className="bg-white border-2 border-green-400 p-10 text-center shadow-sm">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-5" />
            <h2 className="font-alfa text-3xl text-brown mb-3">ENQUIRY RECEIVED!</h2>
            <p className="font-dm text-muted-foreground mb-2">
              Thank you for your enquiry. The team at <strong>{venueName}</strong> will be in touch within 24 hours.
            </p>
            <p className="font-dm text-sm text-muted-foreground/60">
              A confirmation has been noted. Please check your email for updates.
            </p>
            <div className="mt-8 pt-6 border-t border-dashed border-border">
              <div className="flex items-center justify-center gap-0.5">
                <span className="font-alfa text-lg text-brown">HOST</span>
                <span className="font-pacifico text-base text-tomato">it</span>
              </div>
              <div className="font-bebas text-xs tracking-widest text-muted-foreground mt-1">EVENT CRM FOR NEW ZEALAND VENUES</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Personal Details */}
            <div className="bg-white border-2 border-border p-6 shadow-sm">
              <h2 className="font-alfa text-sm text-brown mb-4">YOUR DETAILS</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">FIRST NAME *</label>
                  <Input required value={form.firstName} onChange={set("firstName")}
                    placeholder="Jane" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">LAST NAME</label>
                  <Input value={form.lastName} onChange={set("lastName")}
                    placeholder="Smith" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EMAIL *</label>
                  <Input required type="email" value={form.email} onChange={set("email")}
                    placeholder="jane@example.com" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PHONE</label>
                  <Input type="tel" value={form.phone} onChange={set("phone")}
                    placeholder="+64 21 000 0000" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
                <div className="col-span-2">
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">COMPANY / ORGANISATION</label>
                  <Input value={form.company} onChange={set("company")}
                    placeholder="Acme Ltd" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
              </div>
            </div>

            {/* Event Details */}
            <div className="bg-white border-2 border-border p-6 shadow-sm">
              <h2 className="font-alfa text-sm text-brown mb-4">EVENT DETAILS</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">TYPE OF EVENT</label>
                  <Select value={form.eventType} onValueChange={v => setForm(f => ({ ...f, eventType: v }))}>
                    <SelectTrigger className="rounded-none border-2 focus:ring-0 focus:border-tomato">
                      <SelectValue placeholder="Select event type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PREFERRED DATE</label>
                  <Input type="date" value={form.eventDate} onChange={set("eventDate")}
                    min={new Date().toISOString().split("T")[0]}
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">GUEST COUNT</label>
                  <Input type="number" value={form.guestCount} onChange={set("guestCount")}
                    placeholder="50" min="1"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
                <div className="col-span-2">
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">APPROXIMATE BUDGET (NZD)</label>
                  <Input type="number" value={form.budget} onChange={set("budget")}
                    placeholder="5000"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                </div>
              </div>
            </div>

            {/* Message */}
            <div className="bg-white border-2 border-border p-6 shadow-sm">
              <h2 className="font-alfa text-sm text-brown mb-3">TELL US MORE</h2>
              <Textarea value={form.message} onChange={set("message")}
                placeholder="Any additional details about your event, special requirements, dietary needs, AV equipment, etc."
                rows={4} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm" />
            </div>

            {/* Submit */}
            <Button type="submit" disabled={submitLead.isPending}
              className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-14 text-lg shadow-sm">
              {submitLead.isPending ? "SUBMITTING..." : "SUBMIT ENQUIRY"}
            </Button>

            <p className="font-dm text-xs text-muted-foreground text-center">
              By submitting this form you agree to be contacted by {venueName} regarding your event enquiry.
            </p>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="bg-brown text-cream py-6 text-center mt-8">
        <div className="flex items-center justify-center gap-0.5 mb-1">
          <span className="font-alfa text-base text-tomato">HOST</span>
          <span className="font-pacifico text-sm text-amber">it</span>
        </div>
        <div className="font-bebas text-xs tracking-widest text-cream/30">EVENT CRM · MADE FOR NEW ZEALAND VENUES</div>
        <div className="mt-3">
          <Link href="/dashboard">
            <span className="font-dm text-xs text-cream/30 hover:text-cream/60 cursor-pointer transition-colors">Venue owner? Sign in →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
