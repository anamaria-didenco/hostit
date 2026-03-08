import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calendar, Users, CheckCircle, ChevronRight, MapPin, Star } from "lucide-react";

const EVENT_TYPES = [
  "Wedding", "Birthday", "Corporate", "Engagement", "Anniversary",
  "Baby Shower", "Hens / Bucks", "Christmas Party", "Cocktail Event", "Other",
];

const STEPS = ["Your Event", "Choose Space", "Your Details", "Confirm"];

export default function ExpressBook() {
  const params = new URLSearchParams(window.location.search);
  const ownerIdParam = params.get("owner") ? Number(params.get("owner")) : null;

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [ownerId, setOwnerId] = useState<number | null>(ownerIdParam);

  // Form state
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [spaceName, setSpaceName] = useState("");
  const [selectedPackageIds, setSelectedPackageIds] = useState<number[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Availability check
  const [availabilityDate, setAvailabilityDate] = useState("");
  const { data: availability, refetch: checkAvail } = trpc.expressBook.checkAvailability.useQuery(
    { date: availabilityDate, ownerId: ownerId! },
    { enabled: false }
  );

  const { data: venueInfo } = trpc.expressBook.getVenueInfo.useQuery(
    { ownerId: ownerId! },
    { enabled: !!ownerId }
  );

  const submitMutation = trpc.expressBook.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => {
      toast.error("Failed to submit — please try again.");
      setSubmitting(false);
    },
  });

  // Try to get ownerId from venue info if not in URL
  useEffect(() => {
    if (!ownerId) {
      // Default to owner 1 if no param (single-venue deployment)
      setOwnerId(1);
    }
  }, []);

  async function handleDateCheck() {
    if (!eventDate) { toast.error("Select a date first"); return; }
    setAvailabilityDate(eventDate);
    setTimeout(() => checkAvail(), 100);
  }

  async function handleSubmit() {
    if (!firstName.trim() || !email.trim()) {
      toast.error("First name and email are required");
      return;
    }
    setSubmitting(true);
    await submitMutation.mutateAsync({
      ownerId: ownerId!,
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      email: email.trim(),
      phone: phone.trim() || undefined,
      eventType,
      eventDate,
      guestCount: Number(guestCount),
      spaceName: spaceName || undefined,
      selectedPackageIds: selectedPackageIds.length > 0 ? selectedPackageIds : undefined,
      dietaryNotes: dietaryNotes || undefined,
      budget: budget || undefined,
      notes: notes || undefined,
      origin: window.location.origin,
    });
  }

  const venueName = venueInfo?.venue?.name ?? "Bar Franco";
  const venueAddress = venueInfo?.venue?.address ?? "Wellington, New Zealand";

  if (submitted) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h1 className="font-cormorant text-3xl font-semibold text-ink mb-2">Enquiry Received!</h1>
            <p className="font-dm text-ink/60">
              Thank you, {firstName}. We've received your enquiry and will be in touch within 24 hours to discuss your event.
            </p>
          </div>
          <div className="bg-white border border-border p-5 text-left space-y-2">
            <div className="flex justify-between text-sm font-dm">
              <span className="text-ink/50">Event</span>
              <span className="text-ink font-medium">{eventType}</span>
            </div>
            <div className="flex justify-between text-sm font-dm">
              <span className="text-ink/50">Date</span>
              <span className="text-ink font-medium">
                {new Date(eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <div className="flex justify-between text-sm font-dm">
              <span className="text-ink/50">Guests</span>
              <span className="text-ink font-medium">{guestCount}</span>
            </div>
            {spaceName && (
              <div className="flex justify-between text-sm font-dm">
                <span className="text-ink/50">Space</span>
                <span className="text-ink font-medium">{spaceName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="bg-ink text-cream px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <MapPin className="w-4 h-4 text-amber" />
            <span className="font-dm text-sm text-cream/60">{venueAddress}</span>
          </div>
          <h1 className="font-cormorant text-3xl font-semibold">{venueName}</h1>
          <p className="font-dm text-sm text-cream/60 mt-1">Express Booking Enquiry</p>
        </div>
      </div>

      {/* Step progress */}
      <div className="bg-white border-b border-border px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1 ${i === step ? "text-burgundy" : i < step ? "text-green-600" : "text-ink/30"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bebas ${
                  i < step ? "bg-green-600 text-white" : i === step ? "bg-burgundy text-white" : "bg-ink/10 text-ink/40"
                }`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="font-bebas tracking-widest text-xs hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-ink/20" />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Step 0: Event details */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-cormorant text-2xl font-semibold text-ink mb-1">Tell us about your event</h2>
              <p className="font-dm text-sm text-ink/50">We'll check availability and find the perfect space for you.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">EVENT TYPE *</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => setEventType(t)}
                      className={`px-4 py-2 font-dm text-sm border-2 transition-colors ${
                        eventType === t
                          ? "bg-burgundy text-cream border-burgundy"
                          : "border-border text-ink hover:border-burgundy/50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">EVENT DATE *</label>
                  <Input
                    type="date"
                    value={eventDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={e => { setEventDate(e.target.value); setAvailabilityDate(""); }}
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                  {eventDate && (
                    <button
                      onClick={handleDateCheck}
                      className="mt-2 text-xs font-bebas tracking-widest text-burgundy hover:underline"
                    >
                      CHECK AVAILABILITY →
                    </button>
                  )}
                  {availability && availabilityDate === eventDate && (
                    <div className={`mt-2 text-xs font-dm flex items-center gap-1 ${availability.available ? "text-green-600" : "text-red-600"}`}>
                      {availability.available
                        ? <><CheckCircle className="w-3.5 h-3.5" /> Date is available!</>
                        : <>Date has existing bookings. Contact us to discuss options.</>
                      }
                    </div>
                  )}
                </div>
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">GUEST COUNT *</label>
                  <Input
                    type="number"
                    min={1}
                    value={guestCount}
                    onChange={e => setGuestCount(e.target.value)}
                    placeholder="e.g. 80"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">ESTIMATED BUDGET</label>
                <Input
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  placeholder="e.g. $5,000–$8,000"
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                />
              </div>
            </div>

            <Button
              onClick={() => {
                if (!eventType) { toast.error("Select an event type"); return; }
                if (!eventDate) { toast.error("Select a date"); return; }
                if (!guestCount || Number(guestCount) < 1) { toast.error("Enter guest count"); return; }
                setStep(1);
              }}
              className="bg-burgundy hover:bg-burgundy/90 text-cream rounded-none font-bebas tracking-widest px-8"
            >
              NEXT: CHOOSE SPACE →
            </Button>
          </div>
        )}

        {/* Step 1: Space & menu selection */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-cormorant text-2xl font-semibold text-ink mb-1">Choose your space</h2>
              <p className="font-dm text-sm text-ink/50">Select a space and menu package (optional).</p>
            </div>

            {/* Spaces */}
            {venueInfo?.spaces && venueInfo.spaces.length > 0 ? (
              <div className="space-y-3">
                <label className="font-bebas tracking-widest text-xs text-ink/50 block">AVAILABLE SPACES</label>
                {venueInfo.spaces.map((space: any) => (
                  <button
                    key={space.id}
                    onClick={() => setSpaceName(space.name)}
                    className={`w-full text-left p-4 border-2 transition-colors ${
                      spaceName === space.name ? "border-burgundy bg-burgundy/5" : "border-border hover:border-burgundy/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-dm font-semibold text-ink">{space.name}</div>
                        {space.capacity && (
                          <div className="text-xs font-dm text-ink/50 flex items-center gap-1 mt-0.5">
                            <Users className="w-3 h-3" /> Up to {space.capacity} guests
                          </div>
                        )}
                        {space.description && (
                          <div className="text-xs font-dm text-ink/60 mt-1">{space.description}</div>
                        )}
                      </div>
                      {spaceName === space.name && (
                        <CheckCircle className="w-5 h-5 text-burgundy shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setSpaceName("")}
                  className={`w-full text-left p-3 border-2 transition-colors text-sm font-dm ${
                    spaceName === "" ? "border-burgundy bg-burgundy/5" : "border-border hover:border-burgundy/40"
                  }`}
                >
                  No preference / let us recommend
                </button>
              </div>
            ) : (
              <div className="bg-cream border border-border p-4 text-sm font-dm text-ink/60">
                Our team will recommend the best space based on your event details.
              </div>
            )}

            {/* Menu packages */}
            {venueInfo?.packages && venueInfo.packages.length > 0 && (
              <div className="space-y-3">
                <label className="font-bebas tracking-widest text-xs text-ink/50 block">MENU PACKAGES (OPTIONAL)</label>
                {venueInfo.packages.map((pkg: any) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPackageIds(prev =>
                      prev.includes(pkg.id) ? prev.filter(id => id !== pkg.id) : [...prev, pkg.id]
                    )}
                    className={`w-full text-left p-4 border-2 transition-colors ${
                      selectedPackageIds.includes(pkg.id) ? "border-burgundy bg-burgundy/5" : "border-border hover:border-burgundy/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-dm font-semibold text-ink">{pkg.name}</div>
                        {pkg.pricePerHead && (
                          <div className="text-xs font-dm text-ink/50 mt-0.5">
                            ${pkg.pricePerHead} per head
                          </div>
                        )}
                        {pkg.description && (
                          <div className="text-xs font-dm text-ink/60 mt-1">{pkg.description}</div>
                        )}
                      </div>
                      {selectedPackageIds.includes(pkg.id) && (
                        <CheckCircle className="w-5 h-5 text-burgundy shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => setStep(0)}
                variant="outline"
                className="rounded-none font-bebas tracking-widest border-2"
              >
                ← BACK
              </Button>
              <Button
                onClick={() => setStep(2)}
                className="bg-burgundy hover:bg-burgundy/90 text-cream rounded-none font-bebas tracking-widest px-8"
              >
                NEXT: YOUR DETAILS →
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Contact details */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-cormorant text-2xl font-semibold text-ink mb-1">Your details</h2>
              <p className="font-dm text-sm text-ink/50">We'll use these to get in touch with you.</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">FIRST NAME *</label>
                  <Input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                </div>
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">LAST NAME</label>
                  <Input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">EMAIL *</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                />
              </div>
              <div>
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">PHONE</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+64 21 000 0000"
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                />
              </div>
              <div>
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">DIETARY REQUIREMENTS</label>
                <Input
                  value={dietaryNotes}
                  onChange={e => setDietaryNotes(e.target.value)}
                  placeholder="e.g. 3 vegetarian, 1 gluten free..."
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                />
              </div>
              <div>
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">ANYTHING ELSE?</label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any other details, questions, or special requests..."
                  rows={3}
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy font-dm text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setStep(1)}
                variant="outline"
                className="rounded-none font-bebas tracking-widest border-2"
              >
                ← BACK
              </Button>
              <Button
                onClick={() => {
                  if (!firstName.trim()) { toast.error("Enter your first name"); return; }
                  if (!email.trim()) { toast.error("Enter your email"); return; }
                  setStep(3);
                }}
                className="bg-burgundy hover:bg-burgundy/90 text-cream rounded-none font-bebas tracking-widest px-8"
              >
                REVIEW & CONFIRM →
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-cormorant text-2xl font-semibold text-ink mb-1">Review your enquiry</h2>
              <p className="font-dm text-sm text-ink/50">Please check your details before submitting.</p>
            </div>

            <div className="bg-white border border-border divide-y divide-border">
              {[
                { label: "Event Type", value: eventType },
                { label: "Date", value: new Date(eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" }) },
                { label: "Guests", value: guestCount },
                spaceName && { label: "Space", value: spaceName },
                budget && { label: "Budget", value: budget },
                { label: "Name", value: `${firstName} ${lastName}`.trim() },
                { label: "Email", value: email },
                phone && { label: "Phone", value: phone },
                dietaryNotes && { label: "Dietary", value: dietaryNotes },
                notes && { label: "Notes", value: notes },
              ].filter(Boolean).map((row: any, i) => (
                <div key={i} className="flex justify-between px-5 py-3 text-sm font-dm">
                  <span className="text-ink/50">{row.label}</span>
                  <span className="text-ink font-medium text-right max-w-xs">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber/10 border border-amber/30 p-4 text-sm font-dm text-ink/70">
              <Star className="w-4 h-4 text-amber inline mr-2" />
              By submitting this enquiry, our team will contact you within 24 hours to confirm availability and discuss your event in detail.
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setStep(2)}
                variant="outline"
                className="rounded-none font-bebas tracking-widest border-2"
              >
                ← BACK
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-burgundy hover:bg-burgundy/90 text-cream rounded-none font-bebas tracking-widest px-8 flex items-center gap-2"
              >
                {submitting ? "SUBMITTING..." : "SUBMIT ENQUIRY →"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
