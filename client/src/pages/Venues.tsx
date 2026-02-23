import { useState, useMemo } from "react";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Star, Search, SlidersHorizontal, X, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

const VENUE_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "winery", label: "Winery" },
  { value: "rooftop_bar", label: "Rooftop Bar" },
  { value: "heritage_building", label: "Heritage Building" },
  { value: "garden", label: "Garden Venue" },
  { value: "function_centre", label: "Function Centre" },
  { value: "hotel", label: "Hotel" },
  { value: "beach", label: "Beach Venue" },
];
const CITIES = ["Auckland", "Wellington", "Christchurch", "Queenstown", "Hamilton", "Dunedin", "Tauranga", "Napier", "Nelson", "Rotorua"];

export default function Venues() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);

  const [city, setCity] = useState(params.get("city") || "");
  const [venueType, setVenueType] = useState(params.get("type") || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: venues, isLoading } = trpc.venues.list.useQuery({
    city: city || undefined,
    venueType: venueType as any || undefined,
  });

  const filtered = useMemo(() => {
    if (!venues) return [];
    if (!searchQuery) return venues;
    const q = searchQuery.toLowerCase();
    return venues.filter((v: any) =>
      v.name.toLowerCase().includes(q) ||
      v.city.toLowerCase().includes(q) ||
      (v.suburb || "").toLowerCase().includes(q)
    );
  }, [venues, searchQuery]);

  const clearFilters = () => { setCity(""); setVenueType(""); setSearchQuery(""); };
  const hasFilters = city || venueType || searchQuery;

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
          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/venues" className="text-amber font-bebas tracking-widest">FIND A VENUE</Link>
            <Link href="/owner/dashboard" className="text-cream/70 hover:text-amber transition-colors font-bebas tracking-widest">FOR OWNERS</Link>
            <Link href="/planner/portal" className="text-cream/70 hover:text-amber transition-colors font-bebas tracking-widest">MY EVENTS</Link>
          </div>
          <Link href="/owner/dashboard">
            <Button size="sm" variant="outline" className="border-2 border-amber text-amber hover:bg-amber hover:text-brown font-bebas tracking-widest rounded-none bg-transparent text-xs">
              LIST VENUE
            </Button>
          </Link>
        </div>
      </nav>

      {/* Search Header */}
      <div className="bg-tomato relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 12px)', backgroundSize: '17px 17px' }}
        />
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/">
              <Button size="sm" variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 rounded-none p-1">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <h1 className="font-alfa text-3xl text-white tracking-wide">FIND YOUR VENUE</h1>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <Input
                placeholder="Search venues, suburbs, cities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/10 border-2 border-white/20 text-white placeholder:text-white/40 font-dm rounded-none focus-visible:ring-0 focus-visible:border-amber"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="border-2 border-white/30 text-white hover:bg-white/10 font-bebas tracking-widest rounded-none gap-2 bg-transparent"
            >
              <SlidersHorizontal className="w-4 h-4" />
              FILTERS
              {hasFilters && <span className="w-2 h-2 rounded-full bg-amber inline-block" />}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-4 bg-white/10 border-2 border-white/20 p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="font-bebas text-xs tracking-widest text-white/60 block mb-1">CITY</label>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger className="bg-white/10 border-2 border-white/20 text-white font-dm text-sm rounded-none focus:ring-0">
                    <SelectValue placeholder="All Cities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Cities</SelectItem>
                    {CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-white/60 block mb-1">VENUE TYPE</label>
                <Select value={venueType} onValueChange={setVenueType}>
                  <SelectTrigger className="bg-white/10 border-2 border-white/20 text-white font-dm text-sm rounded-none focus:ring-0">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Types</SelectItem>
                    {VENUE_TYPES.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hasFilters && (
                <div className="flex items-end">
                  <Button size="sm" variant="ghost" onClick={clearFilters} className="text-white/60 hover:text-white font-bebas tracking-widest rounded-none gap-1">
                    <X className="w-3 h-3" /> CLEAR
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="font-bebas tracking-widest text-muted-foreground text-sm">
            {isLoading ? "LOADING..." : `${filtered.length} VENUE${filtered.length !== 1 ? "S" : ""} FOUND`}
          </p>
          {city && <div className="bg-tomato text-white font-bebas text-xs tracking-widest px-3 py-1">{city.toUpperCase()}</div>}
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card border-2 border-border animate-pulse">
                <div className="h-48 bg-muted" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-border">
            <div className="font-alfa text-4xl text-muted-foreground/20 mb-4">NO VENUES FOUND</div>
            <p className="font-dm text-muted-foreground mb-6">Try adjusting your search filters</p>
            <Button onClick={clearFilters} className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none">
              CLEAR FILTERS
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((venue: any) => (
              <Link key={venue.id} href={`/venues/${venue.slug}`}>
                <div className="group bg-card border-2 border-border hover:border-tomato overflow-hidden cursor-pointer transition-all hover:shadow-xl">
                  <div className="relative h-48 overflow-hidden bg-muted">
                    {venue.coverImage ? (
                      <img src={venue.coverImage} alt={venue.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-tomato/20 to-amber/20 flex items-center justify-center">
                        <span className="font-alfa text-4xl text-brown/20">{venue.name[0]}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 bg-tomato text-white font-bebas text-xs tracking-widest px-3 py-1">
                      {venue.venueType.replace("_", " ").toUpperCase()}
                    </div>
                    {venue.isFeatured && (
                      <div className="absolute top-3 right-3 bg-amber text-brown font-bebas text-xs tracking-widest px-2 py-1">FEATURED</div>
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
                    {venue.shortDescription && (
                      <p className="font-dm text-xs text-muted-foreground mb-3 line-clamp-2">{venue.shortDescription}</p>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t-2 border-dashed border-border">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-dm">
                        <Users className="w-3 h-3" />Up to {venue.capacity}
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
        )}
      </div>

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
