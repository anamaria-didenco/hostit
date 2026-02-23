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
  { key: "new", label: "NEW", color: "border-amber bg-amber/20 text-amber-700" },
  { key: "contacted", label: "CONTACTED", color: "border-sky-400 bg-sky-50 text-sky-700" },
  { key: "proposal_sent", label: "PROPOSAL SENT", color: "border-violet-400 bg-violet-50 text-violet-700" },
  { key: "negotiating", label: "NEGOTIATING", color: "border-tomato bg-tomato/10 text-tomato" },
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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="font-alfa text-3xl text-tomato/20 animate-pulse">LOADING...</div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <div className="mb-6">
          <div className="flex items-center justify-center gap-0.5 mb-2">
            <span className="font-alfa text-5xl text-brown">HOST</span>
            <span className="font-pacifico text-4xl text-tomato">it</span>
          </div>
          <div className="font-bebas text-xs tracking-widest text-muted-foreground">EVENT CRM FOR RESTAURANTS & VENUES</div>
        </div>
        <h2 className="font-alfa text-2xl text-brown mb-3">SIGN IN TO YOUR DASHBOARD</h2>
        <p className="font-dm text-muted-foreground text-sm mb-6">Manage event enquiries, build proposals, and track bookings — all in one place.</p>
        <a href={getLoginUrl()}>
          <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none px-8 h-12 w-full text-base">
            SIGN IN
          </Button>
        </a>
        <div className="mt-6 border-t border-dashed border-border pt-6">
          <p className="font-dm text-xs text-muted-foreground mb-3">Looking to enquire about an event?</p>
          <Link href="/enquire">
            <Button variant="outline" className="border-2 border-border hover:border-tomato hover:text-tomato font-bebas tracking-widest rounded-none w-full text-xs">
              SUBMIT AN ENQUIRY
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-parchment font-dm flex flex-col">
      {/* Top Nav */}
      <nav className="bg-ink text-cream sticky top-0 z-50 shadow-lg border-b-4 border-tomato h-14 flex items-center">
        <div className="flex items-center gap-0.5 px-4 w-56 flex-shrink-0 border-r border-cream/10">
          <span className="font-alfa text-2xl text-tomato leading-none">HOST</span>
          <span className="font-pacifico text-xl text-amber leading-none mt-0.5">it</span>
          <span className="font-bebas text-xs text-cream/40 tracking-widest ml-2 mt-1">CRM</span>
        </div>
        <div className="flex-1 px-4 flex items-center justify-between">
          <div className="font-playfair italic text-amber/90 text-sm hidden md:block">
            {venueSettings?.name ?? "YOUR VENUE"}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <Button
              size="sm" variant="ghost"
              onClick={() => { navigator.clipboard.writeText(leadFormUrl); toast.success("Lead form link copied!"); }}
              className="text-cream/60 hover:text-amber font-bebas tracking-widest text-xs gap-1.5 hidden md:flex"
            >
              <Copy className="w-3 h-3" /> COPY LEAD FORM LINK
            </Button>
            <Link href={leadFormUrl}>
              <Button size="sm" variant="outline" className="border-amber/40 text-amber hover:bg-amber/10 font-bebas tracking-widest rounded-none text-xs bg-transparent gap-1">
                <ExternalLink className="w-3 h-3" /> LEAD FORM
              </Button>
            </Link>
            <span className="font-dm text-cream/50 text-xs hidden lg:block">{user?.name}</span>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-14 md:w-52 bg-linen text-ink flex-shrink-0 flex flex-col border-r border-border">
          {[
            { id: "overview", icon: <LayoutDashboard className="w-5 h-5" />, label: "OVERVIEW" },
            { id: "leads", icon: <MessageSquare className="w-5 h-5" />, label: "LEADS INBOX" },
            { id: "pipeline", icon: <TrendingUp className="w-5 h-5" />, label: "PIPELINE" },
            { id: "calendar", icon: <Calendar className="w-5 h-5" />, label: "CALENDAR" },
            { id: "contacts", icon: <Users className="w-5 h-5" />, label: "CONTACTS" },
            { id: "settings", icon: <Settings className="w-5 h-5" />, label: "SETTINGS" },
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-3 md:px-4 py-3.5 text-left transition-all font-bebas tracking-widest text-xs border-l-4 ${tab === item.id ? "bg-tomato text-cream border-amber" : "text-muted-foreground hover:bg-border hover:text-ink border-transparent"}`}>
              {item.icon}
              <span className="hidden md:block">{item.label}</span>
            </button>
          ))}
          <div className="mt-auto p-3 hidden md:block">
          <Link href="/enquire">
            <Button size="sm" className="w-full bg-tomato hover:bg-tomato/90 text-cream font-bebas tracking-widest rounded-none text-xs gap-1">
              <ExternalLink className="w-3 h-3" /> VIEW LEAD FORM
            </Button>
          </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="p-6">
              <div className="mb-6">
                <div className="font-bebas text-xs tracking-widest text-muted-foreground">DASHBOARD</div>
                <h1 className="font-alfa text-3xl text-ink">GOOD {new Date().getHours() < 12 ? "MORNING" : new Date().getHours() < 17 ? "AFTERNOON" : "EVENING"}</h1>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "NEW LEADS", value: stats?.newLeads ?? 0, sub: "awaiting response", color: "bg-amber", icon: <MessageSquare className="w-5 h-5 text-amber" /> },
                  { label: "TOTAL LEADS", value: stats?.totalLeads ?? 0, sub: "all time", color: "bg-ink", icon: <Users className="w-5 h-5 text-ink" /> },
                  { label: "PROPOSALS SENT", value: stats?.proposalsSent ?? 0, sub: "this period", color: "bg-tomato", icon: <FileText className="w-5 h-5 text-tomato" /> },
                  { label: "BOOKINGS THIS MONTH", value: stats?.bookingsThisMonth ?? 0, sub: `$${(stats?.revenueThisMonth ?? 0).toLocaleString()} NZD`, color: "bg-emerald-600", icon: <CheckCircle className="w-5 h-5 text-emerald-600" /> },
                ].map(s => (
                  <div key={s.label} className="bg-white border-2 border-border p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      {s.icon}
                      <div className={`w-1 h-8 ${s.color}`} />
                    </div>
                    <div className="font-alfa text-4xl text-tomato mb-1">{s.value}</div>
                    <div className="font-bebas text-xs tracking-widest text-muted-foreground leading-tight">{s.label}</div>
                    <div className="font-dm text-xs text-muted-foreground/60 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Recent Leads */}
              <div className="bg-cream-card border border-border shadow-sm mb-6">
                <div className="flex items-center justify-between p-4 border-b border-dashed border-border">
                  <h2 className="font-alfa text-lg text-ink">RECENT LEADS</h2>
                  <Button size="sm" variant="ghost" onClick={() => setTab("leads")} className="font-bebas tracking-widest text-xs text-tomato">VIEW ALL</Button>
                </div>
                {(allLeads ?? []).slice(0, 5).length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="font-dm text-muted-foreground text-sm mb-3">No leads yet. Share your lead form to start receiving enquiries.</p>
                    <Button size="sm" onClick={() => { navigator.clipboard.writeText(leadFormUrl); toast.success("Copied!"); }}
                      className="bg-tomato text-white font-bebas tracking-widest rounded-none text-xs gap-1">
                      <Copy className="w-3 h-3" /> COPY LEAD FORM LINK
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-dashed divide-border">
                    {(allLeads ?? []).slice(0, 5).map((lead: any) => (
                      <button key={lead.id} onClick={() => { setSelectedLead(lead); setTab("leads"); }}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left">
                        <div>
                          <div className="font-playfair font-semibold text-sm text-ink">{lead.firstName} {lead.lastName}</div>
                          <div className="font-dm text-xs text-muted-foreground">{lead.eventType || "Event"} · {lead.guestCount ? `${lead.guestCount} guests` : ""} {lead.eventDate ? `· ${new Date(lead.eventDate).toLocaleDateString("en-NZ")}` : ""}</div>
                        </div>
                        <div className={`font-bebas text-xs tracking-widest px-2 py-0.5 border rounded-none ${PIPELINE_STAGES.find(s => s.key === lead.status)?.color ?? "bg-muted border-border text-muted-foreground"}`}>
                          {lead.status.replace(/_/g, " ").toUpperCase()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lead Form CTA */}
              {!venueSettings && (
                <div className="bg-tomato/10 border-2 border-tomato/30 p-6">
                  <h3 className="font-alfa text-lg text-brown mb-2">SET UP YOUR VENUE</h3>
                  <p className="font-dm text-sm text-muted-foreground mb-4">Configure your venue details and lead form to start receiving enquiries.</p>
                  <Button onClick={() => setTab("settings")} className="bg-tomato text-white font-bebas tracking-widest rounded-none">CONFIGURE VENUE</Button>
                </div>
              )}
            </div>
          )}

          {/* ── LEADS INBOX ──────────────────────────────────────────────────── */}
          {tab === "leads" && (
            <div className="flex h-full">
              {/* Lead List */}
              <div className={`${selectedLead ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 lg:w-96 border-r border-border bg-cream-card flex-shrink-0`}>
                <div className="p-4 border-b border-dashed border-border">
                  <h2 className="font-alfa text-xl text-ink mb-3">LEADS INBOX</h2>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                      placeholder="Search leads..." className="pl-9 rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm" />
                  </div>
                  <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
                    <SelectTrigger className="rounded-none border-2 text-xs font-bebas tracking-widest focus:ring-0">
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
                <div className="flex-1 overflow-auto divide-y divide-dashed divide-border">
                  {filteredLeads.length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="font-dm text-muted-foreground text-sm">No leads found</p>
                    </div>
                  ) : filteredLeads.map((lead: any) => (
                    <button key={lead.id} onClick={() => setSelectedLead(lead)}
                      className={`w-full p-4 text-left hover:bg-muted/30 transition-colors ${selectedLead?.id === lead.id ? "bg-tomato/5 border-l-4 border-tomato" : "border-l-4 border-transparent"}`}>
                      <div className="flex items-start justify-between mb-1">
                        <div className="font-dm font-semibold text-sm text-brown truncate">{lead.firstName} {lead.lastName}</div>
                        <div className={`font-bebas text-xs tracking-widest px-1.5 py-0.5 border flex-shrink-0 ml-2 ${PIPELINE_STAGES.find(s => s.key === lead.status)?.color ?? "bg-muted border-border"}`}>
                          {lead.status.replace(/_/g, " ").toUpperCase()}
                        </div>
                      </div>
                      <div className="font-dm text-xs text-muted-foreground truncate">{lead.email}</div>
                      <div className="font-dm text-xs text-muted-foreground/60 mt-0.5">
                        {lead.eventType || "Event"}{lead.guestCount ? ` · ${lead.guestCount} guests` : ""}
                      </div>
                      <div className="font-dm text-xs text-muted-foreground/40 mt-1">
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
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLead(null)} className="md:hidden font-bebas tracking-widest text-xs gap-1">
                      <ChevronLeft className="w-4 h-4" /> BACK
                    </Button>
                    <div className="flex-1">
                      <h2 className="font-alfa text-2xl text-ink">{selectedLead.firstName} {selectedLead.lastName}</h2>
                      <div className="font-dm text-sm text-muted-foreground">{selectedLead.email}{selectedLead.phone ? ` · ${selectedLead.phone}` : ""}</div>
                    </div>
                    <Button onClick={() => setLocation(`/proposals/new?leadId=${selectedLead.id}`)}
                      className="bg-tomato text-white font-bebas tracking-widest rounded-none text-xs gap-1 flex-shrink-0">
                      <FileText className="w-3 h-3" /> CREATE PROPOSAL
                    </Button>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {/* Event Details */}
                    <div className="bg-cream-card border border-border p-4">
                      <h3 className="font-bebas text-sm tracking-widest text-muted-foreground mb-3">EVENT DETAILS</h3>
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
                            <span className="text-muted-foreground w-24 flex-shrink-0">{label}:</span>
                            <span className="text-foreground font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div className="bg-cream-card border border-border p-4">
                      <h3 className="font-bebas text-sm tracking-widest text-muted-foreground mb-3">PIPELINE STATUS</h3>
                      <div className="space-y-2">
                        {PIPELINE_STAGES.map(stage => (
                          <button key={stage.key}
                            onClick={() => updateStatus.mutate({ id: selectedLead.id, status: stage.key as any })}
                            className={`w-full text-left px-3 py-2 border-2 font-bebas text-xs tracking-widest transition-all ${selectedLead.status === stage.key ? stage.color + " border-current" : "border-border text-muted-foreground hover:border-current hover:" + stage.color}`}>
                            {selectedLead.status === stage.key ? "● " : "○ "}{stage.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Message */}
                  {selectedLead.message && (
                  <div className="bg-cream-card border border-border p-4 mb-6">
                    <h3 className="font-bebas text-sm tracking-widest text-muted-foreground mb-2">CLIENT MESSAGE</h3>
                      <p className="font-dm text-sm text-muted-foreground italic">"{selectedLead.message}"</p>
                    </div>
                  )}

                  {/* Activity Log */}
                  <div className="bg-cream-card border border-border p-4 mb-4">
                    <h3 className="font-bebas text-sm tracking-widest text-muted-foreground mb-3">ACTIVITY LOG</h3>
                    <div className="space-y-2 mb-4 max-h-48 overflow-auto">
                      {(selectedLeadActivity ?? []).length === 0 ? (
                        <p className="font-dm text-xs text-muted-foreground">No activity yet</p>
                      ) : (selectedLeadActivity ?? []).map((act: any) => (
                        <div key={act.id} className="flex gap-3 text-xs font-dm">
                          <div className="w-2 h-2 bg-tomato rounded-full mt-1.5 flex-shrink-0" />
                          <div>
                            <span className="font-bebas tracking-widest text-muted-foreground">{act.type.replace(/_/g, " ").toUpperCase()} · </span>
                            <span className="text-foreground">{act.content}</span>
                            <div className="text-muted-foreground/50 mt-0.5">{new Date(act.createdAt).toLocaleString("en-NZ")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={noteText} onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note..." className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm flex-1" />
                      <Button onClick={() => addNote.mutate({ leadId: selectedLead.id, content: noteText })}
                        disabled={!noteText.trim() || addNote.isPending}
                        className="bg-tomato text-white font-bebas tracking-widest rounded-none text-xs">ADD</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 hidden md:flex items-center justify-center text-center p-8">
                  <div>
                    <MessageSquare className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                    <div className="font-alfa text-xl text-muted-foreground/30">SELECT A LEAD</div>
                    <p className="font-dm text-muted-foreground/50 text-sm mt-2">Click a lead from the list to view details</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PIPELINE ─────────────────────────────────────────────────────── */}
          {tab === "pipeline" && (
            <div className="p-6 overflow-x-auto">
              <h1 className="font-alfa text-3xl text-ink mb-6">PIPELINE</h1>
              <div className="flex gap-4 min-w-max">
                {PIPELINE_STAGES.slice(0, 5).map(stage => {
                  const stageLeads = (allLeads ?? []).filter((l: any) => l.status === stage.key);
                  return (
                    <div key={stage.key} className="w-64 flex-shrink-0">
                      <div className={`font-bebas text-xs tracking-widest px-3 py-2 border-2 mb-2 ${stage.color}`}>
                        {stage.label} <span className="opacity-60">({stageLeads.length})</span>
                      </div>
                      <div className="space-y-2">
                        {stageLeads.map((lead: any) => (
                          <div key={lead.id} onClick={() => { setSelectedLead(lead); setTab("leads"); }}
                            className="bg-white border-2 border-border p-3 cursor-pointer hover:border-tomato transition-colors shadow-sm">
                            <div className="font-playfair font-semibold text-sm text-ink">{lead.firstName} {lead.lastName}</div>
                            <div className="font-dm text-xs text-muted-foreground">{lead.eventType || "Event"}</div>
                            {lead.eventDate && <div className="font-dm text-xs text-muted-foreground/60">{new Date(lead.eventDate).toLocaleDateString("en-NZ")}</div>}
                            {lead.budget && <div className="font-alfa text-sm text-tomato mt-1">${Number(lead.budget).toLocaleString()}</div>}
                          </div>
                        ))}
                        {stageLeads.length === 0 && (
                          <div className="border-2 border-dashed border-border p-4 text-center">
                            <p className="font-dm text-xs text-muted-foreground/40">No leads</p>
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
              <h1 className="font-alfa text-3xl text-ink mb-6">BOOKINGS CALENDAR</h1>
              <div className="bg-cream-card border border-border p-6 max-w-2xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setCalDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-muted transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="font-alfa text-2xl text-ink">{MONTHS[month]} {year}</div>
                  <button onClick={() => setCalDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-muted transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 mb-2">
                  {["SUN","MON","TUE","WED","THU","FRI","SAT"].map(d => (
                    <div key={d} className="text-center font-bebas text-xs tracking-widest text-muted-foreground py-2">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {[...Array(firstDay)].map((_, i) => <div key={`e-${i}`} />)}
                  {[...Array(daysInMonth)].map((_, i) => {
                    const day = i + 1;
                    const hasBooking = bookingDays.has(day);
                    const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                    return (
                      <div key={day} className={`aspect-square flex flex-col items-center justify-center text-sm font-dm border-2 transition-colors
                        ${hasBooking ? "bg-tomato/10 border-tomato" : isToday ? "border-amber bg-amber/10" : "border-transparent hover:bg-muted"}`}>
                        <span className={`${hasBooking ? "text-tomato font-bold" : isToday ? "text-brown font-semibold" : "text-foreground"}`}>{day}</span>
                        {hasBooking && <div className="w-1.5 h-1.5 bg-tomato rounded-full mt-0.5" />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-dashed border-border text-xs font-dm">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-tomato/10 border-2 border-tomato" /><span>Booking</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-amber/10 border-2 border-amber" /><span>Today</span></div>
                </div>
              </div>

              {/* Upcoming bookings list */}
              <div className="mt-6 max-w-2xl">
                <h2 className="font-alfa text-lg text-ink mb-3">THIS MONTH'S BOOKINGS</h2>
                {(monthBookings ?? []).length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-border p-6 text-center">
                    <p className="font-dm text-muted-foreground text-sm">No bookings this month</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(monthBookings ?? []).map((b: any) => (
                      <div key={b.id} className="bg-white border-2 border-border p-4 flex items-center justify-between">
                        <div>
                          <div className="font-dm font-semibold text-sm text-brown">{b.firstName} {b.lastName}</div>
                          <div className="font-dm text-xs text-muted-foreground">
                            {b.eventType || "Event"} · {new Date(b.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}
                            {b.guestCount ? ` · ${b.guestCount} guests` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          {b.totalNzd && <div className="font-alfa text-lg text-tomato">${Number(b.totalNzd).toLocaleString()}</div>}
                          <div className={`font-bebas text-xs tracking-widest ${b.depositPaid ? "text-green-600" : "text-amber"}`}>
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
              <h1 className="font-alfa text-3xl text-ink mb-6">CONTACTS</h1>
              {(contacts ?? []).length === 0 ? (
                <div className="bg-white border-2 border-dashed border-border p-12 text-center max-w-md">
                  <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <div className="font-alfa text-xl text-muted-foreground/30 mb-2">NO CONTACTS YET</div>
                  <p className="font-dm text-muted-foreground text-sm">Contacts are created automatically when leads are submitted.</p>
                </div>
              ) : (
                <div className="bg-cream-card border border-border shadow-sm max-w-2xl">
                  <div className="divide-y divide-dashed divide-border">
                    {(contacts ?? []).map((c: any) => (
                      <div key={c.id} className="p-4 flex items-center justify-between">
                        <div>
                          <div className="font-dm font-semibold text-sm text-brown">{c.firstName} {c.lastName}</div>
                          <div className="font-dm text-xs text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
                          {c.company && <div className="font-dm text-xs text-muted-foreground/60">{c.company}</div>}
                        </div>
                        <div className="font-dm text-xs text-muted-foreground/40">{new Date(c.createdAt).toLocaleDateString("en-NZ")}</div>
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
              <h1 className="font-alfa text-3xl text-ink mb-6">VENUE SETTINGS</h1>

              {settingsForm && (
                <form onSubmit={e => { e.preventDefault(); updateSettings.mutate(settingsForm); }} className="space-y-6">
                  <div className="bg-cream-card border border-border p-5 shadow-sm">
                    <h2 className="font-bebas text-sm tracking-widest text-muted-foreground mb-4">VENUE PROFILE</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">VENUE NAME</label>
                        <Input value={settingsForm.name} onChange={e => setSettingsForm((f: any) => ({ ...f, name: e.target.value }))}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">TAGLINE</label>
                        <Input value={settingsForm.tagline} onChange={e => setSettingsForm((f: any) => ({ ...f, tagline: e.target.value }))}
                          placeholder="Auckland's finest event space" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">CITY</label>
                        <Input value={settingsForm.city} onChange={e => setSettingsForm((f: any) => ({ ...f, city: e.target.value }))}
                          placeholder="Auckland" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PHONE</label>
                        <Input value={settingsForm.phone} onChange={e => setSettingsForm((f: any) => ({ ...f, phone: e.target.value }))}
                          placeholder="+64 9 000 0000" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">ADDRESS</label>
                        <Input value={settingsForm.address} onChange={e => setSettingsForm((f: any) => ({ ...f, address: e.target.value }))}
                          placeholder="123 Main St, Auckland CBD" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-cream-card border border-border p-5 shadow-sm">
                    <h2 className="font-bebas text-sm tracking-widest text-muted-foreground mb-4">LEAD FORM SETTINGS</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">FORM URL SLUG</label>
                        <div className="flex items-center gap-2">
                          <span className="font-dm text-xs text-muted-foreground bg-muted px-3 py-2 border-2 border-r-0 border-border">/enquire/</span>
                          <Input value={settingsForm.slug} onChange={e => setSettingsForm((f: any) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
                            placeholder="my-venue" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato flex-1" />
                        </div>
                        <p className="font-dm text-xs text-muted-foreground/60 mt-1">Share this link with clients: <span className="text-tomato">/enquire/{settingsForm.slug || "my-venue"}</span></p>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">FORM TITLE</label>
                        <Input value={settingsForm.leadFormTitle} onChange={e => setSettingsForm((f: any) => ({ ...f, leadFormTitle: e.target.value }))}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">FORM SUBTITLE</label>
                        <Textarea value={settingsForm.leadFormSubtitle} onChange={e => setSettingsForm((f: any) => ({ ...f, leadFormSubtitle: e.target.value }))}
                          placeholder="Tell us about your event and we'll be in touch within 24 hours."
                          rows={2} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">DEFAULT DEPOSIT %</label>
                        <Input type="number" value={settingsForm.depositPercent} onChange={e => setSettingsForm((f: any) => ({ ...f, depositPercent: e.target.value }))}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato w-32" />
                      </div>
                    </div>
                  </div>

                  <Button type="submit" disabled={updateSettings.isPending}
                    className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-11 px-8">
                    {updateSettings.isPending ? "SAVING..." : "SAVE SETTINGS"}
                  </Button>
                </form>
              )}

              {/* Event Spaces */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-alfa text-lg text-ink">EVENT SPACES</h2>
                  <Button size="sm" onClick={() => setShowAddSpace(true)} className="bg-tomato text-white font-bebas tracking-widest rounded-none text-xs gap-1">
                    <Plus className="w-3 h-3" /> ADD SPACE
                  </Button>
                </div>
                {(spaces ?? []).length === 0 ? (
                  <div className="bg-white border-2 border-dashed border-border p-6 text-center">
                    <p className="font-dm text-muted-foreground text-sm">No spaces added yet. Add your event rooms or areas.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(spaces ?? []).map((s: any) => (
                      <div key={s.id} className="bg-white border-2 border-border p-4 flex items-center justify-between">
                        <div>
                          <div className="font-dm font-semibold text-sm text-brown">{s.name}</div>
                          <div className="font-dm text-xs text-muted-foreground">
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
        <DialogContent className="max-w-md rounded-none border-2 border-brown/20">
          <DialogHeader>
            <div className="bg-ink -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-alfa text-xl text-cream">ADD EVENT SPACE</DialogTitle>
            </div>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createSpace.mutate({ name: spaceForm.name, description: spaceForm.description || undefined, minCapacity: spaceForm.minCapacity ? parseInt(spaceForm.minCapacity) : undefined, maxCapacity: spaceForm.maxCapacity ? parseInt(spaceForm.maxCapacity) : undefined, minSpend: spaceForm.minSpend ? parseFloat(spaceForm.minSpend) : undefined }); }} className="space-y-3">
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">SPACE NAME *</label>
              <Input required value={spaceForm.name} onChange={e => setSpaceForm(f => ({ ...f, name: e.target.value }))}
                placeholder="The Main Dining Room" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MIN CAPACITY</label>
                <Input type="number" value={spaceForm.minCapacity} onChange={e => setSpaceForm(f => ({ ...f, minCapacity: e.target.value }))}
                  placeholder="20" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MAX CAPACITY</label>
                <Input type="number" value={spaceForm.maxCapacity} onChange={e => setSpaceForm(f => ({ ...f, maxCapacity: e.target.value }))}
                  placeholder="120" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MIN SPEND (NZD)</label>
              <Input type="number" value={spaceForm.minSpend} onChange={e => setSpaceForm(f => ({ ...f, minSpend: e.target.value }))}
                placeholder="2000" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">DESCRIPTION</label>
              <Textarea value={spaceForm.description} onChange={e => setSpaceForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm" />
            </div>
            <Button type="submit" disabled={createSpace.isPending}
              className="w-full bg-tomato text-white font-bebas tracking-widest rounded-none h-10">
              {createSpace.isPending ? "ADDING..." : "ADD SPACE"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
