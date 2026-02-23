import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Calendar, FileText, MessageSquare, Plus, ChevronLeft, ChevronRight, Check, X, Eye, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber/20 text-amber border-amber/30",
  viewed: "bg-blue-100 text-blue-700 border-blue-200",
  responded: "bg-purple-100 text-purple-700 border-purple-200",
  proposal_sent: "bg-orange-100 text-orange-700 border-orange-200",
  booked: "bg-green-100 text-green-700 border-green-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function OwnerDashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showAddVenue, setShowAddVenue] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);

  const { data: stats, refetch: refetchStats } = trpc.dashboard.stats.useQuery(
    { ownerId: user?.id ?? 0 },
    { enabled: !!user?.id }
  );
  const { data: ownerVenues, refetch: refetchVenues } = trpc.venues.byOwner.useQuery(
    undefined,
    { enabled: !!user?.id }
  );
  const firstVenueId = ownerVenues?.[0]?.id;
  const { data: inquiries, refetch: refetchInquiries } = trpc.inquiries.byVenue.useQuery(
    { venueId: firstVenueId ?? 0 },
    { enabled: !!firstVenueId }
  );
  const { data: availability, refetch: refetchAvail } = trpc.availability.byVenue.useQuery(
    { venueId: firstVenueId ?? 0 },
    { enabled: !!firstVenueId }
  );

  const updateStatus = trpc.inquiries.updateStatus.useMutation({
    onSuccess: () => { refetchInquiries(); toast.success("Status updated"); },
  });
  const setAvail = trpc.availability.set.useMutation({
    onSuccess: () => { refetchAvail(); toast.success("Availability updated"); },
  });
  const createProposal = trpc.proposals.create.useMutation({
    onSuccess: () => { toast.success("Proposal created!"); setShowProposalModal(false); refetchInquiries(); },
    onError: () => toast.error("Failed to create proposal"),
  });

  // Venue creation form
  const [venueForm, setVenueForm] = useState({
    name: "", slug: "", shortDescription: "", description: "",
    venueType: "restaurant" as any, city: "Auckland" as any,
    suburb: "", address: "", capacity: "50", minCapacity: "",
    minPriceNzd: "", maxPriceNzd: "", pricePerHead: "",
  });
  const createVenue = trpc.venues.create.useMutation({
    onSuccess: () => { toast.success("Venue listed!"); setShowAddVenue(false); refetchVenues(); refetchStats(); },
    onError: () => toast.error("Failed to create venue"),
  });

  // Proposal form
  const [proposalForm, setProposalForm] = useState({
    title: "", message: "", packageName: "", eventDate: "",
    guestCount: "", totalNzd: "", depositRequired: "", notes: "",
  });

  // Calendar helpers
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const availMap = new Map((availability ?? []).map((a: any) => [
    new Date(a.date).toISOString().split("T")[0],
    a.isAvailable,
  ]));

  const toggleDay = (day: number) => {
    if (!firstVenueId) return;
    const date = new Date(year, month, day);
    const key = date.toISOString().split("T")[0];
    const current = availMap.get(key);
    setAvail.mutate({ venueId: firstVenueId, date: key, isAvailable: current === false ? true : false });
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="font-alfa text-3xl text-tomato/20 animate-pulse">LOADING...</div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-24 h-24 bg-tomato flex items-center justify-center mx-auto mb-6">
          <Building2 className="w-12 h-12 text-white" />
        </div>
        <h1 className="font-alfa text-3xl text-brown mb-3">VENUE OWNER PORTAL</h1>
        <p className="font-dm text-muted-foreground mb-6">Sign in to manage your venues, bookings, and proposals.</p>
        <a href={getLoginUrl()}>
          <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none px-8 h-11">
            SIGN IN TO CONTINUE
          </Button>
        </a>
        <div className="mt-4">
          <Link href="/"><Button variant="ghost" className="font-dm text-muted-foreground text-sm">← Back to HOSTit</Button></Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-dm flex flex-col">
      {/* Nav */}
      <nav className="bg-brown text-cream sticky top-0 z-50 shadow-lg border-b-4 border-tomato">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center gap-0.5 cursor-pointer">
              <span className="font-alfa text-3xl text-tomato tracking-tight leading-none">HOST</span>
              <span className="font-pacifico text-2xl text-amber leading-none mt-1">it</span>
            </div>
          </Link>
          <div className="font-bebas text-amber tracking-widest text-sm">VENUE OWNER DASHBOARD</div>
          <div className="flex items-center gap-3">
            <span className="font-dm text-cream/60 text-xs hidden md:block">{user?.name}</span>
            <Link href="/venues">
              <Button size="sm" variant="outline" className="border-amber/40 text-amber hover:bg-amber/10 font-bebas tracking-widest rounded-none text-xs bg-transparent">
                VIEW SITE
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-16 md:w-56 bg-brown text-cream flex-shrink-0 flex flex-col">
          <div className="p-4 hidden md:block border-b border-cream/10">
            <div className="font-bebas text-xs tracking-widest text-cream/40">MANAGEMENT</div>
          </div>
          {[
            { id: "overview", icon: <Building2 className="w-5 h-5" />, label: "OVERVIEW" },
            { id: "inquiries", icon: <MessageSquare className="w-5 h-5" />, label: "INQUIRIES" },
            { id: "proposals", icon: <FileText className="w-5 h-5" />, label: "PROPOSALS" },
            { id: "calendar", icon: <Calendar className="w-5 h-5" />, label: "CALENDAR" },
            { id: "venues", icon: <Plus className="w-5 h-5" />, label: "MY VENUES" },
          ].map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors font-bebas tracking-widest text-xs ${activeTab === item.id ? "bg-tomato text-white" : "text-cream/60 hover:bg-cream/5 hover:text-cream"}`}>
              {item.icon}
              <span className="hidden md:block">{item.label}</span>
            </button>
          ))}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto p-6">

          {/* Overview */}
          {activeTab === "overview" && (
            <div>
              <div className="mb-6">
                <h1 className="font-alfa text-3xl text-brown">WELCOME BACK</h1>
                <p className="font-dm text-muted-foreground text-sm mt-1">{user?.name} · Venue Owner</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "VENUES", value: stats?.venueCount ?? 0, color: "bg-tomato" },
                  { label: "INQUIRIES", value: stats?.inquiryCount ?? 0, color: "bg-amber" },
                  { label: "PROPOSALS", value: stats?.proposalCount ?? 0, color: "bg-brown" },
                  { label: "BOOKINGS", value: stats?.bookingCount ?? 0, color: "bg-green-600" },
                ].map(s => (
                  <div key={s.label} className="bg-card border-2 border-border p-4">
                    <div className={`w-8 h-1 ${s.color} mb-3`} />
                    <div className="font-alfa text-4xl text-brown">{s.value}</div>
                    <div className="font-bebas text-xs tracking-widest text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Recent Inquiries */}
              <div className="bg-card border-2 border-border p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-alfa text-lg text-brown">RECENT INQUIRIES</h2>
                  <Button size="sm" variant="ghost" onClick={() => setActiveTab("inquiries")} className="font-bebas tracking-widest text-xs text-tomato">VIEW ALL</Button>
                </div>
                {(inquiries ?? []).slice(0, 3).length === 0 ? (
                  <p className="font-dm text-muted-foreground text-sm text-center py-4">No inquiries yet</p>
                ) : (
                  <div className="space-y-2">
                    {(inquiries ?? []).slice(0, 3).map((inq: any) => (
                      <div key={inq.id} className="flex items-center justify-between py-2 border-b border-dashed border-border last:border-0">
                        <div>
                          <div className="font-dm font-semibold text-sm">{inq.plannerName}</div>
                          <div className="font-dm text-xs text-muted-foreground">{inq.eventType || "Event"} · {inq.guestCount ? `${inq.guestCount} guests` : "Guest count TBC"}</div>
                        </div>
                        <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${STATUS_COLORS[inq.status] ?? "bg-muted"}`}>
                          {inq.status.replace("_", " ").toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {ownerVenues?.length === 0 && (
                <div className="bg-amber/10 border-2 border-amber/30 p-6 text-center">
                  <div className="font-alfa text-xl text-brown mb-2">LIST YOUR FIRST VENUE</div>
                  <p className="font-dm text-muted-foreground text-sm mb-4">Start receiving inquiries from event planners across New Zealand.</p>
                  <Button onClick={() => { setActiveTab("venues"); setShowAddVenue(true); }}
                    className="bg-tomato text-white font-bebas tracking-widest rounded-none">
                    ADD VENUE
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Inquiries */}
          {activeTab === "inquiries" && (
            <div>
              <h1 className="font-alfa text-3xl text-brown mb-6">INQUIRIES</h1>
              {(inquiries ?? []).length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-border">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <div className="font-alfa text-2xl text-muted-foreground/30 mb-2">NO INQUIRIES YET</div>
                  <p className="font-dm text-muted-foreground text-sm">Inquiries from event planners will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(inquiries ?? []).map((inq: any) => (
                    <div key={inq.id} className="bg-card border-2 border-border hover:border-tomato transition-colors p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-playfair text-lg text-brown font-semibold">{inq.plannerName}</div>
                          <div className="font-dm text-sm text-muted-foreground">{inq.plannerEmail} {inq.plannerPhone ? `· ${inq.plannerPhone}` : ""}</div>
                        </div>
                        <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${STATUS_COLORS[inq.status] ?? "bg-muted"}`}>
                          {inq.status.replace("_", " ").toUpperCase()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs font-dm">
                        {inq.eventType && <div><span className="text-muted-foreground">Event: </span>{inq.eventType}</div>}
                        {inq.eventDate && <div><span className="text-muted-foreground">Date: </span>{new Date(inq.eventDate).toLocaleDateString("en-NZ")}</div>}
                        {inq.guestCount && <div><span className="text-muted-foreground">Guests: </span>{inq.guestCount}</div>}
                        {inq.budget && <div><span className="text-muted-foreground">Budget: </span>${Number(inq.budget).toLocaleString()} NZD</div>}
                      </div>
                      {inq.message && <p className="font-dm text-sm text-muted-foreground bg-muted p-3 mb-3 italic">"{inq.message}"</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={inq.status} onValueChange={(v) => updateStatus.mutate({ id: inq.id, status: v as any })}>
                          <SelectTrigger className="w-40 h-7 text-xs font-bebas tracking-widest rounded-none border-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["new","viewed","responded","proposal_sent","booked","declined","cancelled"].map(s => (
                              <SelectItem key={s} value={s} className="font-bebas text-xs tracking-widest">{s.replace("_"," ").toUpperCase()}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedInquiry(inq); setShowProposalModal(true); }}
                          className="border-2 border-tomato text-tomato hover:bg-tomato hover:text-white font-bebas tracking-widest rounded-none text-xs gap-1">
                          <Send className="w-3 h-3" /> SEND PROPOSAL
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Proposals */}
          {activeTab === "proposals" && (
            <div>
              <h1 className="font-alfa text-3xl text-brown mb-6">PROPOSALS</h1>
              <div className="text-center py-16 border-2 border-dashed border-border">
                <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <div className="font-alfa text-2xl text-muted-foreground/30 mb-2">PROPOSALS</div>
                <p className="font-dm text-muted-foreground text-sm mb-4">Create proposals from the Inquiries tab by clicking "Send Proposal".</p>
                <Button onClick={() => setActiveTab("inquiries")} className="bg-tomato text-white font-bebas tracking-widest rounded-none">
                  VIEW INQUIRIES
                </Button>
              </div>
            </div>
          )}

          {/* Calendar */}
          {activeTab === "calendar" && (
            <div>
              <h1 className="font-alfa text-3xl text-brown mb-2">AVAILABILITY CALENDAR</h1>
              <p className="font-dm text-muted-foreground text-sm mb-6">Click dates to toggle availability. Red = blocked, green = available.</p>
              {!firstVenueId ? (
                <div className="text-center py-12 border-2 border-dashed border-border">
                  <p className="font-dm text-muted-foreground mb-4">Add a venue first to manage availability.</p>
                  <Button onClick={() => { setActiveTab("venues"); setShowAddVenue(true); }} className="bg-tomato text-white font-bebas tracking-widest rounded-none">ADD VENUE</Button>
                </div>
              ) : (
                <div className="bg-card border-2 border-border p-6 max-w-lg">
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => setCalendarDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-muted transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="font-alfa text-xl text-brown">{MONTHS[month]} {year}</div>
                    <button onClick={() => setCalendarDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-muted transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-2">
                    {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                      <div key={d} className="text-center font-bebas text-xs tracking-widest text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  {/* Days */}
                  <div className="grid grid-cols-7 gap-1">
                    {[...Array(firstDay)].map((_, i) => <div key={`empty-${i}`} />)}
                    {[...Array(daysInMonth)].map((_, i) => {
                      const day = i + 1;
                      const key = new Date(year, month, day).toISOString().split("T")[0];
                      const avail = availMap.get(key);
                      const isToday = new Date().toISOString().split("T")[0] === key;
                      return (
                        <button key={day} onClick={() => toggleDay(day)}
                          className={`aspect-square flex items-center justify-center text-sm font-dm transition-colors border-2
                            ${avail === false ? "bg-tomato/20 border-tomato text-tomato font-semibold" :
                              avail === true ? "bg-green-100 border-green-400 text-green-700" :
                              isToday ? "border-amber bg-amber/10 text-brown font-semibold" :
                              "border-transparent hover:bg-muted text-foreground"}`}>
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-dashed border-border text-xs font-dm">
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-tomato/20 border-2 border-tomato" /><span>Blocked</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-100 border-2 border-green-400" /><span>Available</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 border-2 border-border" /><span>Default</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* My Venues */}
          {activeTab === "venues" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-alfa text-3xl text-brown">MY VENUES</h1>
                <Button onClick={() => setShowAddVenue(true)} className="bg-tomato text-white font-bebas tracking-widest rounded-none gap-2">
                  <Plus className="w-4 h-4" /> ADD VENUE
                </Button>
              </div>
              {(ownerVenues ?? []).length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-border">
                  <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <div className="font-alfa text-2xl text-muted-foreground/30 mb-2">NO VENUES YET</div>
                  <Button onClick={() => setShowAddVenue(true)} className="bg-tomato text-white font-bebas tracking-widest rounded-none mt-4">ADD YOUR FIRST VENUE</Button>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {(ownerVenues ?? []).map((v: any) => (
                    <div key={v.id} className="bg-card border-2 border-border p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-playfair text-lg text-brown font-semibold">{v.name}</h3>
                        <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${v.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}>
                          {v.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </div>
                      <div className="font-dm text-sm text-muted-foreground mb-3">{v.city} · Up to {v.capacity} guests</div>
                      <Link href={`/venues/${v.slug}`}>
                        <Button size="sm" variant="outline" className="border-2 border-border hover:border-tomato hover:text-tomato font-bebas tracking-widest rounded-none text-xs gap-1">
                          <Eye className="w-3 h-3" /> VIEW LISTING
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add Venue Modal */}
      <Dialog open={showAddVenue} onOpenChange={setShowAddVenue}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-none border-2 border-brown/20">
          <DialogHeader>
            <div className="bg-tomato -mx-6 -mt-6 p-6 mb-4 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 12px)', backgroundSize: '17px 17px' }} />
              <DialogTitle className="font-alfa text-2xl text-white relative z-10">LIST YOUR VENUE</DialogTitle>
            </div>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createVenue.mutate({ ...venueForm, capacity: parseInt(venueForm.capacity), minCapacity: venueForm.minCapacity ? parseInt(venueForm.minCapacity) : undefined, minPriceNzd: venueForm.minPriceNzd ? parseFloat(venueForm.minPriceNzd) : undefined, maxPriceNzd: venueForm.maxPriceNzd ? parseFloat(venueForm.maxPriceNzd) : undefined, pricePerHead: venueForm.pricePerHead ? parseFloat(venueForm.pricePerHead) : undefined }); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">VENUE NAME *</label>
                <Input required value={venueForm.name} onChange={e => setVenueForm(f => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
                  placeholder="The Grand Hall" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">VENUE TYPE *</label>
                <Select value={venueForm.venueType} onValueChange={v => setVenueForm(f => ({ ...f, venueType: v as any }))}>
                  <SelectTrigger className="rounded-none border-2 focus:ring-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["restaurant","winery","rooftop_bar","heritage_building","garden","function_centre","hotel","beach","other"].map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g," ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">CITY *</label>
                <Select value={venueForm.city} onValueChange={v => setVenueForm(f => ({ ...f, city: v as any }))}>
                  <SelectTrigger className="rounded-none border-2 focus:ring-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Auckland","Wellington","Christchurch","Queenstown","Hamilton","Dunedin","Tauranga","Napier","Nelson","Rotorua"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">SUBURB</label>
                <Input value={venueForm.suburb} onChange={e => setVenueForm(f => ({ ...f, suburb: e.target.value }))}
                  placeholder="CBD" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MAX CAPACITY *</label>
                <Input required type="number" value={venueForm.capacity} onChange={e => setVenueForm(f => ({ ...f, capacity: e.target.value }))}
                  placeholder="100" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MIN PRICE (NZD)</label>
                <Input type="number" value={venueForm.minPriceNzd} onChange={e => setVenueForm(f => ({ ...f, minPriceNzd: e.target.value }))}
                  placeholder="2000" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PRICE PER HEAD (NZD)</label>
                <Input type="number" value={venueForm.pricePerHead} onChange={e => setVenueForm(f => ({ ...f, pricePerHead: e.target.value }))}
                  placeholder="75" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div className="col-span-2">
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">SHORT DESCRIPTION</label>
                <Input value={venueForm.shortDescription} onChange={e => setVenueForm(f => ({ ...f, shortDescription: e.target.value }))}
                  placeholder="One-line description for listings" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div className="col-span-2">
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">FULL DESCRIPTION</label>
                <Textarea value={venueForm.description} onChange={e => setVenueForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe your venue in detail..." rows={4}
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none" />
              </div>
            </div>
            <Button type="submit" disabled={createVenue.isPending}
              className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-11">
              {createVenue.isPending ? "LISTING..." : "LIST VENUE"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Proposal Modal */}
      <Dialog open={showProposalModal} onOpenChange={setShowProposalModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-none border-2 border-brown/20">
          <DialogHeader>
            <div className="bg-brown -mx-6 -mt-6 p-6 mb-4">
              <DialogTitle className="font-alfa text-2xl text-cream">CREATE PROPOSAL</DialogTitle>
              {selectedInquiry && <div className="font-dm text-cream/60 text-sm mt-1">For: {selectedInquiry.plannerName}</div>}
            </div>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!selectedInquiry || !firstVenueId || !user) return;
            createProposal.mutate({
              inquiryId: selectedInquiry.id,
              venueId: firstVenueId,
              title: proposalForm.title,
              message: proposalForm.message || undefined,
              packageName: proposalForm.packageName || undefined,
              eventDate: proposalForm.eventDate || undefined,
              guestCount: proposalForm.guestCount ? parseInt(proposalForm.guestCount) : undefined,
              totalNzd: proposalForm.totalNzd ? parseFloat(proposalForm.totalNzd) : undefined,
              depositRequired: proposalForm.depositRequired ? parseFloat(proposalForm.depositRequired) : undefined,
              notes: proposalForm.notes || undefined,
            });
          }} className="space-y-4">
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PROPOSAL TITLE *</label>
              <Input required value={proposalForm.title} onChange={e => setProposalForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Wedding Package — The Grand Hall" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PACKAGE NAME</label>
                <Input value={proposalForm.packageName} onChange={e => setProposalForm(f => ({ ...f, packageName: e.target.value }))}
                  placeholder="Premium Package" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EVENT DATE</label>
                <Input type="date" value={proposalForm.eventDate} onChange={e => setProposalForm(f => ({ ...f, eventDate: e.target.value }))}
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">TOTAL (NZD)</label>
                <Input type="number" value={proposalForm.totalNzd} onChange={e => setProposalForm(f => ({ ...f, totalNzd: e.target.value }))}
                  placeholder="8500" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">DEPOSIT (NZD)</label>
                <Input type="number" value={proposalForm.depositRequired} onChange={e => setProposalForm(f => ({ ...f, depositRequired: e.target.value }))}
                  placeholder="2000" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MESSAGE TO CLIENT</label>
              <Textarea value={proposalForm.message} onChange={e => setProposalForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Thank you for your enquiry. We'd love to host your event..." rows={3}
                className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">NOTES / INCLUSIONS</label>
              <Textarea value={proposalForm.notes} onChange={e => setProposalForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Includes: catering, AV, setup & pack-down..." rows={2}
                className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none" />
            </div>
            <Button type="submit" disabled={createProposal.isPending}
              className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-11">
              {createProposal.isPending ? "CREATING..." : "CREATE & SEND PROPOSAL"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
