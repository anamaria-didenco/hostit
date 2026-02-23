import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard, Users, FileText, Calendar, Settings, ChevronLeft, ChevronRight,
  Plus, Search, ExternalLink, MessageSquare, TrendingUp, CheckCircle, Clock, Copy
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

const PIPELINE_STAGES = [
  { key: "new", label: "NEW", color: "border-gold bg-gold/15 text-amber-800" },
  { key: "contacted", label: "CONTACTED", color: "border-sky-400 bg-sky-50 text-sky-700" },
  { key: "proposal_sent", label: "PROPOSAL SENT", color: "border-forest bg-forest/10 text-forest" },
  { key: "negotiating", label: "NEGOTIATING", color: "border-orange-400 bg-orange-50 text-orange-700" },
  { key: "booked", label: "BOOKED", color: "border-emerald-500 bg-emerald-50 text-emerald-700" },
  { key: "lost", label: "LOST", color: "border-stone-400 bg-stone-50 text-stone-500" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"overview"|"leads"|"pipeline"|"calendar"|"contacts"|"settings">("overview");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [calDate, setCalDate] = useState(new Date());
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [spaceForm, setSpaceForm] = useState({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" });

  const utils = trpc.useUtils();

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user?.id });
  const { data: allLeads, refetch: refetchLeads } = trpc.leads.list.useQuery(
    { status: leadStatusFilter === "all" ? undefined : leadStatusFilter },
    { enabled: !!user?.id }
  );
  const { data: selectedLeadActivity } = trpc.leads.getActivity.useQuery(
    { leadId: selectedLead?.id ?? 0 },
    { enabled: !!selectedLead?.id }
  );
  const { data: venueSettings, refetch: refetchSettings } = trpc.venue.get.useQuery(
    { ownerId: user?.id },
    { enabled: !!user?.id }
  );
  const { data: contacts, refetch: refetchContacts } = trpc.contacts.list.useQuery(undefined, { enabled: !!user?.id });
  const { data: spaces, refetch: refetchSpaces } = trpc.spaces.list.useQuery(undefined, { enabled: !!user?.id });
  const { data: monthBookings } = trpc.bookings.byMonth.useQuery(
    { year: calDate.getFullYear(), month: calDate.getMonth() + 1 },
    { enabled: !!user?.id }
  );

  const updateStatus = trpc.leads.updateStatus.useMutation({
    onSuccess: () => { refetchLeads(); if (selectedLead) utils.leads.getActivity.invalidate({ leadId: selectedLead.id }); toast.success("Status updated"); },
  });
  const addNote = trpc.leads.addNote.useMutation({
    onSuccess: () => { setNoteText(""); utils.leads.getActivity.invalidate({ leadId: selectedLead?.id }); toast.success("Note added"); },
  });
  const updateSettings = trpc.venue.update.useMutation({
    onSuccess: () => { refetchSettings(); toast.success("Settings saved!"); },
  });
  const createSpace = trpc.spaces.create.useMutation({
    onSuccess: () => { refetchSpaces(); setShowAddSpace(false); setSpaceForm({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" }); toast.success("Space added!"); },
  });

  const [settingsForm, setSettingsForm] = useState<any>(null);
  useMemo(() => {
    if (venueSettings && !settingsForm) {
      setSettingsForm({
        name: venueSettings.name ?? "",
        tagline: venueSettings.tagline ?? "",
        description: venueSettings.description ?? "",
        address: venueSettings.address ?? "",
        city: venueSettings.city ?? "",
        phone: venueSettings.phone ?? "",
        email: venueSettings.email ?? "",
        website: venueSettings.website ?? "",
        leadFormTitle: venueSettings.leadFormTitle ?? "Book Your Event",
        leadFormSubtitle: venueSettings.leadFormSubtitle ?? "",
        depositPercent: venueSettings.depositPercent ?? "25",
        slug: venueSettings.slug ?? "",
      });
    }
  }, [venueSettings]);

  const filteredLeads = (allLeads ?? []).filter(l =>
    !leadSearch || `${l.firstName} ${l.lastName} ${l.email} ${l.company ?? ""}`.toLowerCase().includes(leadSearch.toLowerCase())
  );

  // Calendar
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const bookingDays = new Set((monthBookings ?? []).map((b: any) => new Date(b.eventDate).getDate()));

  const leadFormUrl = venueSettings?.slug
    ? `${window.location.origin}/enquire/${venueSettings.slug}`
    : `${window.location.origin}/enquire`;

  if (loading) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="font-cormorant text-3xl text-forest/30 animate-pulse italic">Loading...</div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-forest-dark flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <div className="mb-8">
          <div className="flex items-center justify-center gap-1 mb-3">
            <span className="font-bebas text-5xl tracking-widest text-cream">HOST</span>
            <span className="logo-script text-5xl text-gold leading-none mt-1">it</span>
          </div>
          <div className="gold-rule max-w-xs mx-auto"><span>EVENT CRM FOR NZ VENUES</span></div>
        </div>
        <h2 className="font-cormorant text-3xl text-cream font-semibold mb-3">Sign in to your dashboard</h2>
        <p className="font-dm text-cream/80 text-sm mb-8">Manage event enquiries, build proposals, and track bookings — all in one place.</p>
        <a href={getLoginUrl()}>
          <button className="btn-forest w-full font-bebas tracking-widest text-sm py-3.5 text-cream">
            SIGN IN
          </button>
        </a>
        <div className="mt-6 border-t border-gold/20 pt-6">
          <p className="font-dm text-xs text-cream/70 mb-3">Looking to enquire about an event?</p>
          <Link href="/enquire">
            <button className="btn-gold-outline w-full font-bebas tracking-widest text-xs py-3">
              SUBMIT AN ENQUIRY
            </button>
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream font-dm flex flex-col">
      {/* Top Nav */}
      <nav className="bg-forest-dark sticky top-0 z-50 border-b border-gold/20 h-14 flex items-center">
        <div className="flex items-center gap-1 px-5 w-56 flex-shrink-0 border-r border-gold/15">
          <span className="font-bebas text-xl tracking-widest text-cream">HOST</span>
          <span className="logo-script text-2xl text-gold leading-none mt-0.5">it</span>
        </div>
        <div className="flex-1 px-5 flex items-center justify-between">
          <div className="font-cormorant italic text-gold/80 text-base hidden md:block">
            {venueSettings?.name ?? "Your Venue"}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={() => { navigator.clipboard.writeText(leadFormUrl); toast.success("Lead form link copied!"); }}
              className="font-bebas tracking-widest text-xs text-cream/80 hover:text-gold transition-colors gap-1.5 hidden md:flex items-center"
            >
              <Copy className="w-3 h-3" /> COPY LEAD FORM LINK
            </button>
            <Link href={leadFormUrl}>
              <button className="btn-gold-outline font-bebas tracking-widest text-xs px-3 py-1.5 flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> LEAD FORM
              </button>
            </Link>
            <span className="font-dm text-cream/70 text-xs hidden lg:block">{user?.name}</span>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — forest green like Dante's awning */}
        <aside className="w-14 md:w-52 bg-forest-dark flex-shrink-0 flex flex-col border-r border-gold/15">
          {[
            { id: "overview", icon: <LayoutDashboard className="w-5 h-5" />, label: "OVERVIEW" },
            { id: "leads", icon: <MessageSquare className="w-5 h-5" />, label: "LEADS INBOX" },
            { id: "pipeline", icon: <TrendingUp className="w-5 h-5" />, label: "PIPELINE" },
            { id: "calendar", icon: <Calendar className="w-5 h-5" />, label: "CALENDAR" },
            { id: "contacts", icon: <Users className="w-5 h-5" />, label: "CONTACTS" },
            { id: "settings", icon: <Settings className="w-5 h-5" />, label: "SETTINGS" },
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-3 md:px-4 py-3.5 text-left transition-all font-bebas tracking-widest text-xs ${
                tab === item.id
                  ? "text-gold bg-forest/60 border-l-2 border-gold pl-[calc(0.75rem-2px)] md:pl-[calc(1rem-2px)]"
                  : "text-cream/60 hover:text-gold hover:bg-forest/40 border-l-2 border-transparent"
              }`}>
              {item.icon}
              <span className="hidden md:block">{item.label}</span>
            </button>
          ))}
          <div className="mt-auto p-3 hidden md:block">
            <Link href="/enquire">
              <button className="btn-gold-outline w-full font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1">
                <ExternalLink className="w-3 h-3" /> VIEW LEAD FORM
              </button>
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="p-6">
              <div className="mb-8">
                <div className="gold-rule max-w-xs mb-3"><span>DASHBOARD</span></div>
                <h1 className="font-cormorant text-ink" style={{ fontSize: '2.5rem', fontWeight: 600 }}>
                  Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"}
                </h1>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gold/15 mb-8">
                {[
                  { label: "NEW LEADS", value: stats?.newLeads ?? 0, sub: "awaiting response", accent: "text-gold", icon: <MessageSquare className="w-4 h-4 text-gold" /> },
                  { label: "TOTAL LEADS", value: stats?.totalLeads ?? 0, sub: "all time", accent: "text-ink", icon: <Users className="w-4 h-4 text-sage" /> },
                  { label: "PROPOSALS SENT", value: stats?.proposalsSent ?? 0, sub: "this period", accent: "text-forest", icon: <FileText className="w-4 h-4 text-forest" /> },
                  { label: "BOOKINGS THIS MONTH", value: stats?.bookingsThisMonth ?? 0, sub: `$${(stats?.revenueThisMonth ?? 0).toLocaleString()} NZD`, accent: "text-emerald-600", icon: <CheckCircle className="w-4 h-4 text-emerald-600" /> },
                ].map(s => (
                  <div key={s.label} className="stat-card">
                    <div className="flex items-start justify-between mb-3">
                      {s.icon}
                    </div>
                    <div className={`font-cormorant text-5xl font-semibold mb-1 ${s.accent}`}>{s.value}</div>
                    <div className="font-bebas text-xs tracking-widest text-sage leading-tight">{s.label}</div>
                    <div className="font-dm text-xs text-sage/60 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Recent Leads */}
              <div className="dante-card shadow-sm mb-6">
                <div className="flex items-center justify-between p-4 border-b border-gold/15">
                  <h2 className="font-cormorant text-xl font-semibold text-ink">Recent Leads</h2>
                  <button onClick={() => setTab("leads")} className="font-bebas tracking-widest text-xs text-forest hover:text-gold transition-colors">VIEW ALL</button>
                </div>
                {(allLeads ?? []).slice(0, 5).length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="font-dm text-ink/60 text-sm mb-3">No leads yet. Share your lead form to start receiving enquiries.</p>
                    <Button size="sm" onClick={() => { navigator.clipboard.writeText(leadFormUrl); toast.success("Copied!"); }}
                      className="bg-tomato text-white font-bebas tracking-widest rounded-none text-xs gap-1">
                      <Copy className="w-3 h-3" /> COPY LEAD FORM LINK
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {(allLeads ?? []).slice(0, 5).map((lead: any) => (
                      <button key={lead.id} onClick={() => { setSelectedLead(lead); setTab("leads"); }}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left">
                        <div>
                          <div className="font-playfair font-semibold text-sm text-ink">{lead.firstName} {lead.lastName}</div>
                          <div className="font-dm text-xs text-ink/60">{lead.eventType || "Event"} · {lead.guestCount ? `${lead.guestCount} guests` : ""} {lead.eventDate ? `· ${new Date(lead.eventDate).toLocaleDateString("en-NZ")}` : ""}</div>
                        </div>
                        <div className={`font-bebas text-xs tracking-widest px-2 py-0.5 border rounded-none ${PIPELINE_STAGES.find(s => s.key === lead.status)?.color ?? "bg-muted border-border text-ink/60"}`}>
                          {lead.status.replace(/_/g, " ").toUpperCase()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lead Form CTA */}
              {!venueSettings && (
                <div className="bg-forest/8 border border-forest/20 border-l-2 border-l-gold p-6">
                  <h3 className="font-cormorant text-xl font-semibold text-ink mb-2">Set up your venue</h3>
                  <p className="font-dm text-sm text-sage mb-4">Configure your venue details and lead form to start receiving enquiries.</p>
                  <button onClick={() => setTab("settings")} className="btn-forest font-bebas tracking-widest text-xs px-6 py-2.5 text-cream">CONFIGURE VENUE</button>
                </div>
              )}
            </div>
          )}

          {/* ── LEADS INBOX ──────────────────────────────────────────────────── */}
          {tab === "leads" && (
            <div className="flex h-full">
              {/* Lead List */}
              <div className={`${selectedLead ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 lg:w-96 border-r border-gold/15 bg-warm-white flex-shrink-0`}>
                <div className="p-4 border-b border-gold/15">
                  <h2 className="font-cormorant text-2xl font-semibold text-ink mb-3">Leads Inbox</h2>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/60" />
                    <Input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                      placeholder="Search leads..." className="pl-9 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold text-sm" />
                  </div>
                  <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
                    <SelectTrigger className="rounded-none border border-gold/30 text-xs font-bebas tracking-widest focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="font-bebas text-xs tracking-widest">ALL LEADS</SelectItem>
                      {PIPELINE_STAGES.map(s => (
                        <SelectItem key={s.key} value={s.key} className="font-bebas text-xs tracking-widest">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 overflow-auto divide-y divide-border/40">
                  {filteredLeads.length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageSquare className="w-8 h-8 text-sage/30 mx-auto mb-2" />
                      <p className="font-dm text-sage text-sm">No leads found</p>
                    </div>
                  ) : filteredLeads.map((lead: any) => (
                    <button key={lead.id} onClick={() => setSelectedLead(lead)}
                      className={`w-full p-4 text-left hover:bg-linen transition-colors ${selectedLead?.id === lead.id ? "bg-forest/5 border-l-2 border-gold" : "border-l-2 border-transparent"}`}>
                      <div className="flex items-start justify-between mb-1">
                        <div className="font-cormorant font-semibold text-base text-ink truncate">{lead.firstName} {lead.lastName}</div>
                        <div className={`font-bebas text-xs tracking-widest px-1.5 py-0.5 border flex-shrink-0 ml-2 ${PIPELINE_STAGES.find(s => s.key === lead.status)?.color ?? "bg-muted border-border"}`}>
                          {lead.status.replace(/_/g, " ").toUpperCase()}
                        </div>
                      </div>
                      <div className="font-dm text-xs text-ink/60 truncate">{lead.email}</div>
                      <div className="font-dm text-xs text-ink/60 mt-0.5">
                        {lead.eventType || "Event"}{lead.guestCount ? ` · ${lead.guestCount} guests` : ""}
                      </div>
                      <div className="font-dm text-xs text-ink/50 mt-1">
                        {new Date(lead.createdAt).toLocaleDateString("en-NZ")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lead Detail */}
              {selectedLead ? (
                <div className="flex-1 overflow-auto p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => setSelectedLead(null)} className="md:hidden font-bebas tracking-widest text-xs text-forest flex items-center gap-1">
                      <ChevronLeft className="w-4 h-4" /> BACK
                    </button>
                    <div className="flex-1">
                      <h2 className="font-cormorant text-ink" style={{ fontSize: '1.8rem', fontWeight: 600 }}>{selectedLead.firstName} {selectedLead.lastName}</h2>
                      <div className="font-dm text-sm text-sage">{selectedLead.email}{selectedLead.phone ? ` · ${selectedLead.phone}` : ""}</div>
                    </div>
                    <button onClick={() => setLocation(`/proposals/new?leadId=${selectedLead.id}`)}
                      className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1 flex-shrink-0">
                      <FileText className="w-3 h-3" /> CREATE PROPOSAL
                    </button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {/* Event Details */}
                    <div className="dante-card p-4">
                      <h3 className="font-bebas text-xs tracking-widest text-sage mb-3">EVENT DETAILS</h3>
                      <div className="space-y-2 text-sm font-dm">
                        {[
                          ["Event Type", selectedLead.eventType],
                          ["Date", selectedLead.eventDate ? new Date(selectedLead.eventDate).toLocaleDateString("en-NZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : null],
                          ["Guests", selectedLead.guestCount],
                          ["Budget", selectedLead.budget ? `$${Number(selectedLead.budget).toLocaleString()} NZD` : null],
                          ["Company", selectedLead.company],
                          ["Source", selectedLead.source],
                        ].filter(([, v]) => v).map(([label, value]) => (
                          <div key={label as string} className="flex gap-2">
                            <span className="text-ink/60 w-24 flex-shrink-0">{label}:</span>
                            <span className="text-foreground font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="dante-card p-4">
                      <h3 className="font-bebas text-xs tracking-widest text-sage mb-3">PIPELINE STATUS</h3>
                      <div className="space-y-2">
                        {PIPELINE_STAGES.map(stage => (
                          <button key={stage.key}
                            onClick={() => updateStatus.mutate({ id: selectedLead.id, status: stage.key as any })}
                            className={`w-full text-left px-3 py-2 border-2 font-bebas text-xs tracking-widest transition-all ${selectedLead.status === stage.key ? stage.color + " border-current" : "border-border text-ink/60 hover:border-current hover:" + stage.color}`}>
                            {selectedLead.status === stage.key ? "● " : "○ "}{stage.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Message */}
                  {selectedLead.message && (
                  <div className="dante-card p-4 mb-6">
                    <h3 className="font-bebas text-xs tracking-widest text-sage mb-2">CLIENT MESSAGE</h3>
                      <p className="font-dm text-sm text-ink/60 italic">"{selectedLead.message}"</p>
                    </div>
                  )}

                  {/* Activity Log */}
                  <div className="dante-card p-4 mb-4">
                    <h3 className="font-bebas text-xs tracking-widest text-sage mb-3">ACTIVITY LOG</h3>
                    <div className="space-y-2 mb-4 max-h-48 overflow-auto">
                      {(selectedLeadActivity ?? []).length === 0 ? (
                        <p className="font-dm text-xs text-ink/60">No activity yet</p>
                      ) : (selectedLeadActivity ?? []).map((act: any) => (
                        <div key={act.id} className="flex gap-3 text-xs font-dm">
                          <div className="w-2 h-2 bg-tomato rounded-full mt-1.5 flex-shrink-0" />
                          <div>
                            <span className="font-bebas tracking-widest text-ink/60">{act.type.replace(/_/g, " ").toUpperCase()} · </span>
                            <span className="text-foreground">{act.content}</span>
                            <div className="text-ink/60/50 mt-0.5">{new Date(act.createdAt).toLocaleString("en-NZ")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={noteText} onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note..." className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold text-sm flex-1" />
                      <button onClick={() => addNote.mutate({ leadId: selectedLead.id, content: noteText })}
                        disabled={!noteText.trim() || addNote.isPending}
                        className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream disabled:opacity-40">ADD</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 hidden md:flex items-center justify-center text-center p-8">
                  <div>
                    <MessageSquare className="w-12 h-12 text-ink/60/20 mx-auto mb-4" />
                    <div className="font-alfa text-xl text-ink/60/30">SELECT A LEAD</div>
                    <p className="font-dm text-ink/60/50 text-sm mt-2">Click a lead from the list to view details</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PIPELINE ─────────────────────────────────────────────────────── */}
          {tab === "pipeline" && (
            <div className="p-6 overflow-x-auto">
              <div className="gold-rule max-w-xs mb-3"><span>CRM</span></div>
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Pipeline</h1>
              <div className="flex gap-4 min-w-max">
                {PIPELINE_STAGES.slice(0, 5).map(stage => {
                  const stageLeads = (allLeads ?? []).filter((l: any) => l.status === stage.key);
                  return (
                    <div key={stage.key} className="w-64 flex-shrink-0">
                      <div className={`font-bebas text-xs tracking-widest px-3 py-2 border mb-2 ${stage.color}`}>
                        {stage.label} <span className="opacity-60">({stageLeads.length})</span>
                      </div>
                      <div className="space-y-2">
                        {stageLeads.map((lead: any) => (
                          <div key={lead.id} onClick={() => { setSelectedLead(lead); setTab("leads"); }}
                            className="dante-card p-3 cursor-pointer hover:border-gold/40 transition-colors">
                            <div className="font-cormorant font-semibold text-base text-ink">{lead.firstName} {lead.lastName}</div>
                            <div className="font-dm text-xs text-sage">{lead.eventType || "Event"}</div>
                            {lead.eventDate && <div className="font-dm text-xs text-sage/60">{new Date(lead.eventDate).toLocaleDateString("en-NZ")}</div>}
                            {lead.budget && <div className="font-cormorant text-base font-semibold text-forest mt-1">${Number(lead.budget).toLocaleString()}</div>}
                          </div>
                        ))}
                        {stageLeads.length === 0 && (
                          <div className="border border-dashed border-gold/20 p-4 text-center">
                            <p className="font-dm text-xs text-sage/40">No leads</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CALENDAR ─────────────────────────────────────────────────────── */}
          {tab === "calendar" && (
            <div className="p-6">
              <div className="gold-rule max-w-xs mb-3"><span>SCHEDULE</span></div>
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Bookings Calendar</h1>
              <div className="dante-card p-6 max-w-2xl">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setCalDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-linen transition-colors text-forest">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="font-cormorant text-2xl font-semibold text-ink">{MONTHS[month]} {year}</div>
                  <button onClick={() => setCalDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-linen transition-colors text-forest">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 mb-2">
                  {["SUN","MON","TUE","WED","THU","FRI","SAT"].map(d => (
                    <div key={d} className="text-center font-bebas text-xs tracking-widest text-ink/60 py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {[...Array(firstDay)].map((_, i) => <div key={`e-${i}`} />)}
                  {[...Array(daysInMonth)].map((_, i) => {
                    const day = i + 1;
                    const hasBooking = bookingDays.has(day);
                    const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                    return (
                      <div key={day} className={`aspect-square flex flex-col items-center justify-center text-sm font-dm border transition-colors
                        ${hasBooking ? "bg-forest/10 border-forest" : isToday ? "border-gold bg-gold/10" : "border-transparent hover:bg-linen"}`}>
                        <span className={`${hasBooking ? "text-forest font-bold" : isToday ? "text-ink font-semibold" : "text-foreground"}`}>{day}</span>
                        {hasBooking && <div className="w-1.5 h-1.5 bg-forest rounded-full mt-0.5" />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gold/15 text-xs font-dm">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-forest/10 border border-forest" /><span>Booking</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gold/10 border border-gold" /><span>Today</span></div>
                </div>
              </div>

              {/* Upcoming bookings list */}
              <div className="mt-6 max-w-2xl">
                <h2 className="font-cormorant text-xl font-semibold text-ink mb-3">This Month's Bookings</h2>
                {(monthBookings ?? []).length === 0 ? (
                  <div className="border border-dashed border-gold/20 p-6 text-center">
                    <p className="font-dm text-sage text-sm">No bookings this month</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(monthBookings ?? []).map((b: any) => (
                      <div key={b.id} className="dante-card p-4 flex items-center justify-between">
                        <div>
                          <div className="font-cormorant font-semibold text-base text-ink">{b.firstName} {b.lastName}</div>
                          <div className="font-dm text-xs text-ink/60">
                            {b.eventType || "Event"} · {new Date(b.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}
                            {b.guestCount ? ` · ${b.guestCount} guests` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          {b.totalNzd && <div className="font-cormorant text-xl font-semibold text-forest">${Number(b.totalNzd).toLocaleString()}</div>}
                          <div className={`font-bebas text-xs tracking-widest ${b.depositPaid ? "text-emerald-600" : "text-gold"}`}>
                            {b.depositPaid ? "DEPOSIT PAID" : "DEPOSIT PENDING"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CONTACTS ─────────────────────────────────────────────────────── */}
          {tab === "contacts" && (
            <div className="p-6">
              <div className="gold-rule max-w-xs mb-3"><span>DATABASE</span></div>
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Contacts</h1>
              {(contacts ?? []).length === 0 ? (
                <div className="border border-dashed border-gold/20 p-12 text-center max-w-md">
                  <Users className="w-12 h-12 text-sage/20 mx-auto mb-4" />
                  <div className="font-cormorant text-xl text-sage/40 mb-2">No contacts yet</div>
                  <p className="font-dmtext-ink/60 text-xsm">Contacts are created automatically when leads are submitted.</p>
                </div>
              ) : (
                <div className="dante-card max-w-2xl">
                  <div className="divide-y divide-border/40">
                    {(contacts ?? []).map((c: any) => (
                      <div key={c.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="font-cormorant font-semibold text-base text-ink">{c.firstName} {c.lastName}</div>
                          <div className="font-dm text-xs text-ink/60">{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
                          {c.company && <div className="font-dm text-xs text-ink/60">{c.company}</div>}
                        </div>
                        <div className="font-dm text-xs text-ink/50">{new Date(c.createdAt).toLocaleDateString("en-NZ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS ─────────────────────────────────────────────────────── */}
          {tab === "settings" && (
            <div className="p-6 max-w-2xl">
              <div className="gold-rule max-w-xs mb-3"><span>CONFIGURATION</span></div>
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Venue Settings</h1>

              {settingsForm && (
                <form onSubmit={e => { e.preventDefault(); updateSettings.mutate(settingsForm); }} className="space-y-6">
                  <div className="dante-card p-5">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE PROFILE</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">VENUE NAME</label>
                        <Input value={settingsForm.name} onChange={e => setSettingsForm((f: any) => ({ ...f, name: e.target.value }))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TAGLINE</label>
                        <Input value={settingsForm.tagline} onChange={e => setSettingsForm((f: any) => ({ ...f, tagline: e.target.value }))}
                          placeholder="Auckland's finest event space" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CITY</label>
                        <Input value={settingsForm.city} onChange={e => setSettingsForm((f: any) => ({ ...f, city: e.target.value }))}
                          placeholder="Auckland" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PHONE</label>
                        <Input value={settingsForm.phone} onChange={e => setSettingsForm((f: any) => ({ ...f, phone: e.target.value }))}
                          placeholder="+64 9 000 0000" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ADDRESS</label>
                        <Input value={settingsForm.address} onChange={e => setSettingsForm((f: any) => ({ ...f, address: e.target.value }))}
                          placeholder="123 Main St, Auckland CBD" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                    </div>
                  </div>

                  <div className="dante-card p-5">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">LEAD FORM SETTINGS</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-ink/60 block mb-1">FORM URL SLUG</label>
                        <div className="flex items-center gap-2">
                          <span className="font-dm text-xs text-sage bg-linen px-3 py-2 border border-r-0 border-gold/30">/enquire/</span>
                          <Input value={settingsForm.slug} onChange={e => setSettingsForm((f: any) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
                            placeholder="my-venue" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold flex-1" />
                        </div>
                        <p className="font-dm text-xs text-sage/60 mt-1">Share this link with clients: <span className="text-forest">/enquire/{settingsForm.slug || "my-venue"}</span></p>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FORM TITLE</label>
                        <Input value={settingsForm.leadFormTitle} onChange={e => setSettingsForm((f: any) => ({ ...f, leadFormTitle: e.target.value }))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FORM SUBTITLE</label>
                        <Textarea value={settingsForm.leadFormSubtitle} onChange={e => setSettingsForm((f: any) => ({ ...f, leadFormSubtitle: e.target.value }))}
                          placeholder="Tell us about your event and we'll be in touch within 24 hours."
                          rows={2} className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DEFAULT DEPOSIT %</label>
                        <Input type="number" value={settingsForm.depositPercent} onChange={e => setSettingsForm((f: any) => ({ ...f, depositPercent: e.target.value }))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold w-32" />
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={updateSettings.isPending}
                    className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                    {updateSettings.isPending ? "SAVING..." : "SAVE SETTINGS"}
                  </button>
                </form>
              )}

              {/* Event Spaces */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-cormorant text-xl font-semibold text-ink">Event Spaces</h2>
                  <button onClick={() => setShowAddSpace(true)} className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1">
                    <Plus className="w-3 h-3" /> ADD SPACE
                  </button>
                </div>
                {(spaces ?? []).length === 0 ? (
                  <div className="border border-dashed border-gold/20 p-6 text-center">
                    <p className="font-dm text-sage text-sm">No spaces added yet. Add your event rooms or areas.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(spaces ?? []).map((s: any) => (
                      <div key={s.id} className="dante-card p-4 flex items-center justify-between">
                        <div>
                          <div className="font-cormorant font-semibold text-base text-ink">{s.name}</div>
                          <div className="font-dm text-xs text-ink/60">
                            {s.minCapacity && s.maxCapacity ? `${s.minCapacity}–${s.maxCapacity} guests` : s.maxCapacity ? `Up to ${s.maxCapacity} guests` : ""}
                            {s.minSpend ? ` · Min spend $${Number(s.minSpend).toLocaleString()}` : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Space Modal */}
      <Dialog open={showAddSpace} onOpenChange={setShowAddSpace}>
        <DialogContent className="max-w-md rounded-none border border-gold/30">
          <DialogHeader>
            <div className="bg-forest-dark -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-cormorant text-xl text-cream font-semibold">Add Event Space</DialogTitle>
            </div>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createSpace.mutate({ name: spaceForm.name, description: spaceForm.description || undefined, minCapacity: spaceForm.minCapacity ? parseInt(spaceForm.minCapacity) : undefined, maxCapacity: spaceForm.maxCapacity ? parseInt(spaceForm.maxCapacity) : undefined, minSpend: spaceForm.minSpend ? parseFloat(spaceForm.minSpend) : undefined }); }} className="space-y-3">
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SPACE NAME *</label>
              <Input required value={spaceForm.name} onChange={e => setSpaceForm(f => ({ ...f, name: e.target.value }))}
                placeholder="The Main Dining Room" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MIN CAPACITY</label>
                <Input type="number" value={spaceForm.minCapacity} onChange={e => setSpaceForm(f => ({ ...f, minCapacity: e.target.value }))}
                  placeholder="20" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MAX CAPACITY</label>
                <Input type="number" value={spaceForm.maxCapacity} onChange={e => setSpaceForm(f => ({ ...f, maxCapacity: e.target.value }))}
                  placeholder="120" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MIN SPEND (NZD)</label>
              <Input type="number" value={spaceForm.minSpend} onChange={e => setSpaceForm(f => ({ ...f, minSpend: e.target.value }))}
                placeholder="2000" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
              <Textarea value={spaceForm.description} onChange={e => setSpaceForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
            </div>
            <button type="submit" disabled={createSpace.isPending}
              className="btn-forest w-full font-bebas tracking-widest text-sm py-3 text-cream disabled:opacity-50">
              {createSpace.isPending ? "ADDING..." : "ADD SPACE"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
