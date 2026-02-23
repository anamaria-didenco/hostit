import { useState } from "react";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Users, Star, ArrowLeft, Check, Calendar, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function VenueDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [currentImg, setCurrentImg] = useState(0);
  const [showInquiry, setShowInquiry] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: venue, isLoading } = trpc.venues.bySlug.useQuery({ slug: slug ?? "" });

  const [form, setForm] = useState({
    plannerName: "", plannerEmail: "", plannerPhone: "",
    eventType: "", eventDate: "", guestCount: "",
    message: "", budget: "",
  });

  const submitInquiry = trpc.inquiries.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Enquiry sent! The venue will be in touch soon.");
    },
    onError: () => toast.error("Failed to send enquiry. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue) return;
    submitInquiry.mutate({
      venueId: venue.id,
      plannerName: form.plannerName,
      plannerEmail: form.plannerEmail,
      plannerPhone: form.plannerPhone || undefined,
      eventType: form.eventType || undefined,
      eventDate: form.eventDate || undefined,
      guestCount: form.guestCount ? parseInt(form.guestCount) : undefined,
      message: form.message || undefined,
      budget: form.budget ? parseFloat(form.budget) : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="font-alfa text-4xl text-tomato/20 animate-pulse">LOADING...</div>
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="font-alfa text-4xl text-muted-foreground/20 mb-4">VENUE NOT FOUND</div>
          <Link href="/venues">
            <Button className="bg-tomato text-white font-bebas tracking-widest rounded-none">BACK TO VENUES</Button>
          </Link>
        </div>
      </div>
    );
  }

  const images: string[] = (() => {
    try { return JSON.parse(venue.images as any ?? "[]"); } catch { return venue.coverImage ? [venue.coverImage] : []; }
  })();
  const amenities: string[] = (() => {
    try { return JSON.parse(venue.amenities as any ?? "[]"); } catch { return []; }
  })();

  return (
    <div className="min-h-screen bg-background font-dm">
      {/* Nav */}
      <nav className="bg-brown text-cream sticky top-0 z-50 shadow-lg border-b-4 border-tomato">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center gap-0.5 cursor-pointer">
              <span className="font-alfa text-3xl text-tomato tracking-tight leading-none">HOST</span>
              <span className="font-pacifico text-2xl text-amber leading-none mt-1">it</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/venues" className="text-cream/70 hover:text-amber transition-colors font-bebas tracking-widest text-sm">FIND A VENUE</Link>
            <Link href="/owner/dashboard" className="text-cream/70 hover:text-amber transition-colors font-bebas tracking-widest text-sm">FOR OWNERS</Link>
          </div>
          <Button
            onClick={() => setShowInquiry(true)}
            className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-sm"
          >
            ENQUIRE NOW
          </Button>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="bg-muted border-b border-border">
        <div className="container mx-auto px-4 py-2 flex items-center gap-2 text-xs font-dm text-muted-foreground">
          <Link href="/" className="hover:text-tomato transition-colors">Home</Link>
          <span>/</span>
          <Link href="/venues" className="hover:text-tomato transition-colors">Venues</Link>
          <span>/</span>
          <span className="text-foreground">{venue.name}</span>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Image Gallery */}
            <div className="relative mb-6 bg-muted border-2 border-border overflow-hidden">
              <div className="aspect-[16/9] relative">
                {images.length > 0 ? (
                  <img src={images[currentImg]} alt={venue.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-tomato/20 to-amber/20 flex items-center justify-center">
                    <span className="font-alfa text-6xl text-brown/20">{venue.name[0]}</span>
                  </div>
                )}
                {/* Venue type overlay */}
                <div className="absolute bottom-0 left-0 bg-tomato text-white font-bebas text-sm tracking-widest px-4 py-2">
                  {venue.venueType.replace(/_/g, " ").toUpperCase()}
                </div>
                {images.length > 1 && (
                  <>
                    <button onClick={() => setCurrentImg((currentImg - 1 + images.length) % images.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={() => setCurrentImg((currentImg + 1) % images.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-10 right-3 bg-black/50 text-white font-dm text-xs px-2 py-1">
                      {currentImg + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>
              {/* Thumbnail strip */}
              {images.length > 1 && (
                <div className="flex gap-2 p-2 bg-muted/50">
                  {images.map((img, i) => (
                    <button key={i} onClick={() => setCurrentImg(i)}
                      className={`w-16 h-12 overflow-hidden border-2 transition-all ${i === currentImg ? "border-tomato" : "border-transparent opacity-60 hover:opacity-100"}`}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Venue Header */}
            <div className="mb-6">
              <div className="flex items-start justify-between mb-2">
                <h1 className="font-playfair text-3xl md:text-4xl text-brown font-bold leading-tight">{venue.name}</h1>
                {venue.rating && Number(venue.rating) > 0 && (
                  <div className="flex items-center gap-1.5 bg-amber/20 px-3 py-1.5 flex-shrink-0 ml-4">
                    <Star className="w-4 h-4 fill-amber text-amber" />
                    <span className="font-alfa text-xl text-brown">{venue.rating}</span>
                    {venue.reviewCount && <span className="font-dm text-xs text-muted-foreground">({venue.reviewCount})</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground font-dm mb-4">
                <MapPin className="w-4 h-4 text-tomato" />
                <span>{venue.address || `${venue.suburb ? venue.suburb + ", " : ""}${venue.city}`}</span>
              </div>
              <div className="retro-divider text-tomato/40 font-bebas my-4" />
            </div>

            {/* Description */}
            <div className="mb-8">
              <h2 className="font-alfa text-xl text-brown tracking-wide mb-3">ABOUT THIS VENUE</h2>
              <p className="font-dm text-foreground/80 leading-relaxed">{venue.description || venue.shortDescription}</p>
            </div>

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="mb-8">
                <h2 className="font-alfa text-xl text-brown tracking-wide mb-4">AMENITIES & FEATURES</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {amenities.map((item) => (
                    <div key={item} className="flex items-center gap-2 font-dm text-sm">
                      <div className="w-5 h-5 bg-tomato flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Pricing Card */}
            <div className="bg-card border-2 border-brown/20 p-6 mb-4 sticky top-24">
              <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-border">
                <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-1">STARTING FROM</div>
                {venue.minPriceNzd ? (
                  <div className="font-alfa text-4xl text-tomato">${Number(venue.minPriceNzd).toLocaleString()}</div>
                ) : (
                  <div className="font-alfa text-2xl text-tomato">POA</div>
                )}
                <div className="font-dm text-xs text-muted-foreground">NZD · Prices vary by package</div>
              </div>

              {/* Key Stats */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-muted p-3 text-center">
                  <Users className="w-5 h-5 text-tomato mx-auto mb-1" />
                  <div className="font-alfa text-xl text-brown">{venue.capacity}</div>
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground">MAX GUESTS</div>
                </div>
                {venue.minCapacity && (
                  <div className="bg-muted p-3 text-center">
                    <Users className="w-5 h-5 text-amber mx-auto mb-1" />
                    <div className="font-alfa text-xl text-brown">{venue.minCapacity}</div>
                    <div className="font-bebas text-xs tracking-widest text-muted-foreground">MIN GUESTS</div>
                  </div>
                )}
                {venue.pricePerHead && (
                  <div className="bg-muted p-3 text-center col-span-2">
                    <DollarSign className="w-5 h-5 text-tomato mx-auto mb-1" />
                    <div className="font-alfa text-xl text-brown">${Number(venue.pricePerHead)}/head</div>
                    <div className="font-bebas text-xs tracking-widest text-muted-foreground">PER PERSON</div>
                  </div>
                )}
              </div>

              <Button
                onClick={() => setShowInquiry(true)}
                className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-12 text-base mb-3"
              >
                SEND ENQUIRY
              </Button>
              <p className="font-dm text-xs text-muted-foreground text-center">
                Free to enquire · No booking fees
              </p>
            </div>

            {/* Back to search */}
            <Link href="/venues">
              <Button variant="outline" className="w-full border-2 border-border text-muted-foreground hover:border-tomato hover:text-tomato font-bebas tracking-widest rounded-none gap-2">
                <ArrowLeft className="w-4 h-4" /> BACK TO VENUES
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Inquiry Modal */}
      {showInquiry && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowInquiry(false); }}>
          <div className="bg-background w-full max-w-lg max-h-[90vh] overflow-y-auto border-2 border-brown/20 shadow-2xl">
            {/* Modal Header */}
            <div className="bg-tomato p-6 relative">
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 12px)', backgroundSize: '17px 17px' }}
              />
              <div className="relative z-10">
                <div className="font-bebas text-white/60 tracking-widest text-xs mb-1">SEND AN ENQUIRY</div>
                <h2 className="font-alfa text-2xl text-white">{venue.name}</h2>
                <div className="font-dm text-white/70 text-sm mt-1">{venue.city}</div>
              </div>
              <button onClick={() => setShowInquiry(false)} className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl font-dm z-10">×</button>
            </div>

            <div className="p-6">
              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-tomato flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="font-alfa text-2xl text-brown mb-2">ENQUIRY SENT!</h3>
                  <p className="font-dm text-muted-foreground mb-6">The venue team will be in touch within 24 hours.</p>
                  <Button onClick={() => { setShowInquiry(false); setSubmitted(false); }}
                    className="bg-tomato text-white font-bebas tracking-widest rounded-none">
                    CLOSE
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">YOUR NAME *</label>
                      <Input required value={form.plannerName} onChange={e => setForm(f => ({ ...f, plannerName: e.target.value }))}
                        placeholder="Jane Smith" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EMAIL *</label>
                      <Input required type="email" value={form.plannerEmail} onChange={e => setForm(f => ({ ...f, plannerEmail: e.target.value }))}
                        placeholder="jane@example.com" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PHONE</label>
                      <Input value={form.plannerPhone} onChange={e => setForm(f => ({ ...f, plannerPhone: e.target.value }))}
                        placeholder="+64 21 000 000" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EVENT TYPE</label>
                      <Input value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))}
                        placeholder="Wedding, Corporate..." className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EVENT DATE</label>
                      <Input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">GUEST COUNT</label>
                      <Input type="number" value={form.guestCount} onChange={e => setForm(f => ({ ...f, guestCount: e.target.value }))}
                        placeholder="50" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                    </div>
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">BUDGET (NZD)</label>
                    <Input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                      placeholder="5000" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MESSAGE</label>
                    <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Tell us about your event..." rows={3}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none" />
                  </div>
                  <Button type="submit" disabled={submitInquiry.isPending}
                    className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-12 text-base">
                    {submitInquiry.isPending ? "SENDING..." : "SEND ENQUIRY"}
                  </Button>
                  <p className="font-dm text-xs text-muted-foreground text-center">
                    Your details are only shared with this venue.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="bg-brown text-cream border-t-4 border-tomato py-8 mt-8">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-0.5 mb-2">
            <span className="font-alfa text-3xl text-tomato">HOST</span>
            <span className="font-pacifico text-2xl text-amber">it</span>
          </div>
          <p className="font-dm text-cream/30 text-xs">© 2025 HOSTit. New Zealand's Premier Venue Platform.</p>
        </div>
      </footer>
    </div>
  );
}
