import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Users, Star, ArrowRight, Calendar, FileText, Search, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ── Inline SVG Illustrations (vintage line-art style) ──────────────────────
const WaiterIllustration = () => (
  <svg viewBox="0 0 120 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Running waiter silhouette - Campari Bar Manero style */}
    <ellipse cx="72" cy="22" rx="12" ry="13" fill="oklch(0.28 0.08 30)" />
    {/* Body */}
    <path d="M60 35 Q55 55 50 70 Q45 80 42 95" stroke="oklch(0.28 0.08 30)" strokeWidth="8" strokeLinecap="round" fill="none"/>
    {/* Jacket lapels */}
    <path d="M60 35 L52 50 L60 48 L68 50 L60 35Z" fill="oklch(0.28 0.08 30)"/>
    <path d="M60 46 L57 52 L63 52Z" fill="white"/>
    {/* Arm holding tray */}
    <path d="M60 42 Q80 35 95 30" stroke="oklch(0.28 0.08 30)" strokeWidth="6" strokeLinecap="round" fill="none"/>
    {/* Tray */}
    <ellipse cx="95" cy="28" rx="16" ry="4" fill="oklch(0.28 0.08 30)"/>
    {/* Bottle on tray */}
    <rect x="93" y="12" width="5" height="16" rx="2" fill="oklch(0.52 0.22 28)"/>
    <rect x="94" y="8" width="3" height="5" rx="1" fill="oklch(0.52 0.22 28)"/>
    {/* Other arm */}
    <path d="M58 48 Q45 55 40 60" stroke="oklch(0.28 0.08 30)" strokeWidth="6" strokeLinecap="round" fill="none"/>
    <path d="M40 58 L35 68 L45 65Z" fill="oklch(0.965 0.018 88)"/>
    {/* Legs running */}
    <path d="M42 95 Q35 115 25 130" stroke="oklch(0.28 0.08 30)" strokeWidth="7" strokeLinecap="round" fill="none"/>
    <path d="M42 95 Q50 110 55 125" stroke="oklch(0.28 0.08 30)" strokeWidth="7" strokeLinecap="round" fill="none"/>
    {/* Shoes */}
    <ellipse cx="22" cy="132" rx="8" ry="4" fill="oklch(0.28 0.08 30)" transform="rotate(-20 22 132)"/>
    <ellipse cx="57" cy="127" rx="8" ry="4" fill="oklch(0.28 0.08 30)" transform="rotate(15 57 127)"/>
  </svg>
);

const DinerLadyIllustration = () => (
  <svg viewBox="0 0 100 130" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Seated diner - Fabiola's style */}
    <circle cx="50" cy="20" r="14" fill="oklch(0.52 0.22 28)" opacity="0.15" stroke="oklch(0.52 0.22 28)" strokeWidth="2"/>
    <ellipse cx="50" cy="16" rx="9" ry="10" fill="oklch(0.76 0.14 75)" opacity="0.5"/>
    {/* Hair */}
    <path d="M41 14 Q45 5 50 8 Q55 5 59 14" stroke="oklch(0.28 0.08 30)" strokeWidth="3" fill="none" strokeLinecap="round"/>
    {/* Face */}
    <circle cx="46" cy="17" r="1.5" fill="oklch(0.28 0.08 30)"/>
    <circle cx="54" cy="17" r="1.5" fill="oklch(0.28 0.08 30)"/>
    <path d="M46 22 Q50 25 54 22" stroke="oklch(0.52 0.22 28)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    {/* Body/dress */}
    <path d="M41 30 Q35 50 33 75 Q40 80 50 80 Q60 80 67 75 Q65 50 59 30Z" fill="oklch(0.52 0.22 28)" opacity="0.8"/>
    {/* Arms raised with wine glass */}
    <path d="M41 38 Q30 32 25 28" stroke="oklch(0.28 0.08 30)" strokeWidth="4" strokeLinecap="round" fill="none"/>
    {/* Wine glass */}
    <path d="M22 20 L28 20 L27 28 L23 28Z" fill="oklch(0.52 0.22 28)" opacity="0.6"/>
    <rect x="24" y="28" width="2" height="6" fill="oklch(0.28 0.08 30)" opacity="0.5"/>
    <rect x="21" y="34" width="8" height="2" rx="1" fill="oklch(0.28 0.08 30)" opacity="0.5"/>
    {/* Other arm */}
    <path d="M59 38 Q70 35 75 32" stroke="oklch(0.28 0.08 30)" strokeWidth="4" strokeLinecap="round" fill="none"/>
    {/* Legs */}
    <path d="M40 78 Q38 95 36 110" stroke="oklch(0.28 0.08 30)" strokeWidth="5" strokeLinecap="round" fill="none"/>
    <path d="M60 78 Q62 95 64 110" stroke="oklch(0.28 0.08 30)" strokeWidth="5" strokeLinecap="round" fill="none"/>
  </svg>
);

const CITIES = ["Auckland", "Wellington", "Christchurch", "Queenstown", "Hamilton", "Dunedin"];
const VENUE_TYPES = [
  { value: "restaurant", label: "Restaurants", icon: "🍽️" },
  { value: "winery", label: "Wineries", icon: "🍷" },
  { value: "rooftop_bar", label: "Rooftop Bars", icon: "🌆" },
  { value: "heritage_building", label: "Heritage", icon: "🏛️" },
  { value: "garden", label: "Gardens", icon: "🌿" },
  { value: "function_centre", label: "Functions", icon: "🎉" },
];

export default function Home() {
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const { data: venues } = trpc.venues.list.useQuery({});
  const seedMutation = trpc.venues.seed.useMutation({
    onSuccess: () => window.location.reload(),
  });

  const featured = venues?.filter(v => v.isFeatured).slice(0, 3) ?? [];
  const allVenues = venues ?? [];

  return (
    <div className="min-h-screen bg-background font-dm overflow-x-hidden">

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="bg-brown text-cream sticky top-0 z-50 shadow-lg border-b-4 border-tomato">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center gap-0.5 cursor-pointer">
              <span className="font-alfa text-3xl text-tomato tracking-tight leading-none">HOST</span>
              <span className="font-pacifico text-2xl text-amber leading-none mt-1">it</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/venues" className="text-cream/80 hover:text-amber transition-colors font-dm tracking-wide">Find a Venue</Link>
            <Link href="/owner/dashboard" className="text-cream/80 hover:text-amber transition-colors font-dm tracking-wide">For Owners</Link>
            <Link href="/planner/portal" className="text-cream/80 hover:text-amber transition-colors font-dm tracking-wide">My Events</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/venues">
              <Button size="sm" className="bg-tomato hover:bg-tomato/90 text-white font-dm text-xs px-4 rounded-none border-2 border-tomato">
                Find a Venue
              </Button>
            </Link>
            <Link href="/owner/dashboard">
              <Button size="sm" variant="outline" className="border-2 border-amber text-amber hover:bg-amber hover:text-brown font-dm text-xs px-4 rounded-none bg-transparent">
                List Venue
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="bg-parchment relative overflow-hidden min-h-[90vh] flex items-center">
        {/* Large decorative background text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <span className="font-alfa text-[22vw] text-tomato/5 leading-none whitespace-nowrap">HOSTit</span>
        </div>

        <div className="container mx-auto px-4 relative z-10 py-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Left: Text */}
            <div>
              {/* Stamp badge */}
              <div className="inline-flex items-center gap-2 mb-6">
                <div className="bg-amber text-brown font-bebas tracking-[0.2em] text-xs px-4 py-1.5 badge-stamp">
                  NEW ZEALAND'S VENUE PLATFORM
                </div>
              </div>

              <h1 className="font-alfa text-5xl md:text-7xl text-brown leading-[0.95] mb-2">
                FIND YOUR<br/>
                <span className="text-tomato">PERFECT</span><br/>
                VENUE
              </h1>

              <div className="retro-divider text-amber my-5 font-bebas">
                <span>Auckland · Wellington · Christchurch · Queenstown</span>
              </div>

              <p className="font-dm text-foreground/70 text-lg mb-8 max-w-md leading-relaxed">
                Discover extraordinary venues across New Zealand for weddings, 
                corporate events, private dining, and every occasion worth celebrating.
              </p>

              {/* Search form */}
              <div className="bg-card border-2 border-brown/20 p-4 mb-6 shadow-sm">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">CITY</label>
                    <select
                      value={selectedCity}
                      onChange={e => setSelectedCity(e.target.value)}
                      className="w-full border-2 border-border bg-background font-dm text-sm px-3 py-2 focus:outline-none focus:border-tomato rounded-none"
                    >
                      <option value="">All Cities</option>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">VENUE TYPE</label>
                    <select
                      value={selectedType}
                      onChange={e => setSelectedType(e.target.value)}
                      className="w-full border-2 border-border bg-background font-dm text-sm px-3 py-2 focus:outline-none focus:border-tomato rounded-none"
                    >
                      <option value="">All Types</option>
                      {VENUE_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <Link href={`/venues${selectedCity || selectedType ? `?city=${selectedCity}&type=${selectedType}` : ''}`}>
                  <Button className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest text-base rounded-none h-11">
                    <Search className="w-4 h-4 mr-2" />
                    SEARCH VENUES
                  </Button>
                </Link>
              </div>

              <div className="flex items-center gap-6 text-sm font-dm text-muted-foreground">
                <span><strong className="font-alfa text-tomato text-xl">148+</strong> Venues</span>
                <span className="text-border">|</span>
                <span><strong className="font-alfa text-tomato text-xl">10</strong> Cities</span>
                <span className="text-border">|</span>
                <span><strong className="font-alfa text-tomato text-xl">2,400+</strong> Events</span>
              </div>
            </div>

            {/* Right: Illustration */}
            <div className="relative hidden md:flex items-center justify-center">
              {/* Large tomato red circle background */}
              <div className="w-80 h-80 rounded-full bg-tomato flex items-center justify-center relative">
                {/* Waiter illustration */}
                <div className="w-48 h-64 absolute -top-8">
                  <WaiterIllustration />
                </div>
                {/* Decorative text around circle */}
                <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
                  <path id="circle-text" d="M 100,100 m -75,0 a 75,75 0 1,1 150,0 a 75,75 0 1,1 -150,0" fill="none"/>
                  <text className="font-bebas" fontSize="10" fill="oklch(0.985 0.010 90)" opacity="0.6" letterSpacing="4">
                    <textPath href="#circle-text">FIND · ENQUIRE · BOOK · CELEBRATE · FIND · ENQUIRE · BOOK · CELEBRATE · </textPath>
                  </text>
                </svg>
              </div>
              {/* Floating badge */}
              <div className="absolute top-4 right-4 bg-amber text-brown p-3 badge-stamp text-center shadow-lg">
                <div className="font-bebas text-xs tracking-widest leading-tight">EST.</div>
                <div className="font-alfa text-2xl leading-tight">2025</div>
                <div className="font-bebas text-xs tracking-widest leading-tight">NZ</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Venue Types ────────────────────────────────────────────────── */}
      <section className="bg-tomato py-12 relative overflow-hidden">
        {/* Decorative stripes */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 12px)', backgroundSize: '17px 17px' }}
        />
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-8">
            <h2 className="font-alfa text-3xl text-white tracking-wide">BROWSE BY TYPE</h2>
            <div className="w-16 h-1 bg-amber mx-auto mt-2" />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {VENUE_TYPES.map((type) => (
              <Link key={type.value} href={`/venues?type=${type.value}`}>
                <div className="group bg-white/10 hover:bg-amber border-2 border-white/20 hover:border-amber p-4 text-center cursor-pointer transition-all">
                  <div className="text-3xl mb-2">{type.icon}</div>
                  <div className="font-bebas text-white group-hover:text-brown text-sm tracking-widest">{type.label}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Venues ────────────────────────────────────────────── */}
      <section className="bg-background py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="retro-divider text-tomato mb-3 font-bebas max-w-xs">
                <span>HANDPICKED FOR YOU</span>
              </div>
              <h2 className="font-alfa text-4xl text-brown">FEATURED VENUES</h2>
            </div>
            <Link href="/venues" className="hidden md:flex items-center gap-2 text-tomato font-bebas tracking-widest text-sm hover:gap-3 transition-all">
              VIEW ALL <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {allVenues.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-border">
              <p className="font-dm text-muted-foreground mb-4">No venues loaded yet.</p>
              <Button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none"
              >
                {seedMutation.isPending ? "Loading..." : "LOAD SAMPLE VENUES"}
              </Button>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
            {(featured.length > 0 ? featured : allVenues.slice(0, 3)).map((venue) => (
              <Link key={venue.id} href={`/venues/${venue.slug}`}>
                <div className="group bg-card border-2 border-border hover:border-tomato overflow-hidden cursor-pointer transition-all hover:shadow-xl">
                  <div className="relative h-52 overflow-hidden bg-muted">
                    {venue.coverImage ? (
                      <img src={venue.coverImage} alt={venue.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-tomato/20 to-amber/20 flex items-center justify-center">
                        <span className="font-alfa text-4xl text-brown/20">{venue.name[0]}</span>
                      </div>
                    )}
                    {/* Venue type badge */}
                    <div className="absolute bottom-0 left-0 bg-tomato text-white font-bebas text-xs tracking-widest px-3 py-1">
                      {venue.venueType.replace("_", " ").toUpperCase()}
                    </div>
                    {venue.isFeatured && (
                      <div className="absolute top-3 right-3 bg-amber text-brown font-bebas text-xs tracking-widest px-2 py-1">
                        FEATURED
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-playfair text-xl text-brown font-bold leading-tight">{venue.name}</h3>
                      {venue.rating && Number(venue.rating) > 0 && (
                        <div className="flex items-center gap-1 text-xs flex-shrink-0 ml-2 bg-amber/20 px-2 py-0.5">
                          <Star className="w-3 h-3 fill-amber text-amber" />
                          <span className="font-dm font-semibold text-brown">{venue.rating}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground text-xs mb-3 font-dm">
                      <MapPin className="w-3 h-3 text-tomato" />
                      {venue.suburb ? `${venue.suburb}, ` : ""}{venue.city}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t-2 border-dashed border-border">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-dm">
                        <Users className="w-3 h-3" />
                        Up to {venue.capacity}
                      </div>
                      <div className="text-right">
                        {venue.minPriceNzd ? (
                          <span className="font-alfa text-tomato text-lg">${Number(venue.minPriceNzd).toLocaleString()} <span className="font-dm text-xs text-muted-foreground font-normal">NZD</span></span>
                        ) : (
                          <span className="font-dm text-xs text-tomato">Enquire for pricing</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-8 md:hidden">
            <Link href="/venues">
              <Button variant="outline" className="border-2 border-tomato text-tomato hover:bg-tomato hover:text-white font-bebas tracking-widest rounded-none">
                VIEW ALL VENUES <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section className="bg-amber py-16 relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-64 opacity-10 flex items-center">
          <DinerLadyIllustration />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-12">
            <h2 className="font-alfa text-4xl text-brown tracking-wide">HOW IT WORKS</h2>
            <div className="w-16 h-1 bg-tomato mx-auto mt-2" />
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: <Search className="w-8 h-8" />, num: "01", title: "SEARCH & DISCOVER", desc: "Browse hundreds of curated venues across New Zealand, filtered by location, capacity, type, and budget." },
              { icon: <FileText className="w-8 h-8" />, num: "02", title: "ENQUIRE & PROPOSE", desc: "Submit your event details to shortlisted venues and receive customised proposals with full NZD pricing." },
              { icon: <Calendar className="w-8 h-8" />, num: "03", title: "BOOK & CELEBRATE", desc: "Confirm your booking, manage all details in one place, and focus on making your event unforgettable." },
            ].map((item) => (
              <div key={item.num} className="text-center">
                <div className="w-16 h-16 bg-tomato flex items-center justify-center mx-auto mb-4 text-white">
                  {item.icon}
                </div>
                <div className="font-alfa text-5xl text-brown/20 mb-1">{item.num}</div>
                <h3 className="font-bebas text-xl text-brown tracking-widest mb-3">{item.title}</h3>
                <p className="font-dm text-brown/70 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For Venue Owners ───────────────────────────────────────────── */}
      <section className="bg-background py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-0 border-2 border-brown/20 overflow-hidden">
            {/* Left: tomato red panel with illustration */}
            <div className="bg-tomato relative p-8 flex flex-col justify-between min-h-64">
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 12px)', backgroundSize: '17px 17px' }}
              />
              <div className="relative z-10">
                <div className="font-bebas text-white/60 tracking-[0.3em] text-xs mb-2">FOR VENUE OWNERS</div>
                <h2 className="font-alfa text-4xl text-white leading-tight mb-4">GROW YOUR<br/>EVENTS<br/>BUSINESS</h2>
              </div>
              <div className="relative z-10 flex items-end justify-between">
                <div>
                  <div className="font-alfa text-6xl text-amber">148+</div>
                  <div className="font-bebas text-white/70 tracking-widest text-sm">VENUES LISTED</div>
                </div>
                <div className="w-32 h-40 opacity-80">
                  <WaiterIllustration />
                </div>
              </div>
            </div>
            {/* Right: content */}
            <div className="bg-card p-8 md:p-10">
              <p className="font-dm text-muted-foreground mb-6 leading-relaxed">
                List your venue on HOSTit and connect with thousands of event planners across New Zealand. 
                Manage bookings, send proposals, and track your revenue — all in one elegant dashboard.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Centralised booking & inquiry management",
                  "Custom quotes & proposal builder",
                  "Calendar & availability control",
                  "Real-time analytics & reporting",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 font-dm text-sm">
                    <div className="w-5 h-5 bg-tomato flex items-center justify-center flex-shrink-0">
                      <ChevronRight className="w-3 h-3 text-white" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/owner/dashboard">
                <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none px-8 h-11">
                  LIST YOUR VENUE <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Cities ─────────────────────────────────────────────────────── */}
      <section className="bg-brown py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="font-alfa text-2xl text-cream tracking-wide">BROWSE BY CITY</h2>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {CITIES.map((city) => (
              <Link key={city} href={`/venues?city=${city}`}>
                <div className="group flex items-center gap-2 border-2 border-cream/20 hover:border-amber hover:bg-amber/10 px-5 py-3 cursor-pointer transition-all">
                  <MapPin className="w-4 h-4 text-tomato" />
                  <span className="font-bebas text-cream group-hover:text-amber tracking-widest text-sm">{city.toUpperCase()}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="bg-brown text-cream border-t-4 border-tomato py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-0.5 mb-4">
                <span className="font-alfa text-4xl text-tomato tracking-tight">HOST</span>
                <span className="font-pacifico text-3xl text-amber">it</span>
              </div>
              <p className="font-dm text-cream/50 text-sm leading-relaxed">
                New Zealand's premier venue management platform for extraordinary events.
              </p>
              <div className="mt-4 retro-divider text-amber/40 font-bebas max-w-[180px]">
                <span>NZ MADE</span>
              </div>
            </div>
            <div>
              <h4 className="font-bebas text-amber tracking-widest mb-4">FOR PLANNERS</h4>
              <ul className="space-y-2 font-dm text-sm text-cream/50">
                <li><Link href="/venues" className="hover:text-amber transition-colors">Find a Venue</Link></li>
                <li><Link href="/planner/portal" className="hover:text-amber transition-colors">My Inquiries</Link></li>
                <li><Link href="/planner/portal" className="hover:text-amber transition-colors">My Proposals</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bebas text-amber tracking-widest mb-4">FOR VENUES</h4>
              <ul className="space-y-2 font-dm text-sm text-cream/50">
                <li><Link href="/owner/dashboard" className="hover:text-amber transition-colors">List Your Venue</Link></li>
                <li><Link href="/owner/dashboard" className="hover:text-amber transition-colors">Manage Bookings</Link></li>
                <li><Link href="/owner/dashboard" className="hover:text-amber transition-colors">Proposals</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bebas text-amber tracking-widest mb-4">CONTACT</h4>
              <ul className="space-y-2 font-dm text-sm text-cream/50">
                <li>hello@hostit.co.nz</li>
                <li>+64 9 555 0100</li>
                <li>Auckland, New Zealand</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-cream/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="font-dm text-cream/30 text-xs">© 2025 HOSTit. All rights reserved. New Zealand.</p>
            <div className="retro-divider text-amber/30 font-bebas max-w-xs">
              <span>L'APERITIVO DEGLI EVENTI</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
