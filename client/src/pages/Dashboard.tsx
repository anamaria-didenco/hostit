import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard, Users, FileText, Calendar, Settings, ChevronLeft, ChevronRight,
  Plus, Search, ExternalLink, MessageSquare, TrendingUp, CheckCircle, Clock, Copy,
  ChefHat, UtensilsCrossed, Wine, Trash2, Pencil, Mail, Send
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { substituteTemplateVars, TEMPLATE_VARIABLES } from "@/lib/templateVars";

// ─── Follow-Up Date Card ────────────────────────────────────────────────────
function FollowUpDateCard({ lead, onSaved }: { lead: any; onSaved: (date: Date | null) => void }) {
  const utils = trpc.useUtils();
  const setFollowUpDate = trpc.leads.setFollowUpDate.useMutation({
    onSuccess: (_, vars) => {
      onSaved(vars.followUpDate ? new Date(vars.followUpDate) : null);
      toast.success(vars.followUpDate ? 'Follow-up date saved' : 'Follow-up date cleared');
    },
    onError: () => toast.error('Failed to save follow-up date'),
  });

  const existing = lead.followUpDate ? new Date(lead.followUpDate) : null;
  const isOverdue = existing && existing <= new Date() && !['booked', 'lost', 'cancelled'].includes(lead.status);
  const isUpcoming = existing && existing > new Date();

  // Format date as YYYY-MM-DD for the input value
  const inputValue = existing
    ? existing.toLocaleDateString('en-CA') // en-CA gives YYYY-MM-DD
    : '';

  return (
    <div className="dante-card p-4 mb-4">
      <h3 className="font-bebas text-xs tracking-widest text-sage mb-3 flex items-center gap-2">
        FOLLOW-UP DATE
        {isOverdue && (
          <span className="bg-red-100 text-red-700 font-bebas text-xs tracking-widest px-2 py-0.5">OVERDUE</span>
        )}
        {isUpcoming && (
          <span className="bg-gold/20 text-amber-700 font-bebas text-xs tracking-widest px-2 py-0.5">SCHEDULED</span>
        )}
      </h3>
      <div className="flex gap-2 items-center">
        <input
          type="date"
          defaultValue={inputValue}
          key={inputValue} // re-mount when lead changes
          className="flex-1 border border-border px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest"
          onChange={e => {
            if (e.target.value) {
              setFollowUpDate.mutate({ id: lead.id, followUpDate: e.target.value });
            }
          }}
        />
        {existing && (
          <button
            onClick={() => setFollowUpDate.mutate({ id: lead.id, followUpDate: null })}
            className="border border-border font-bebas tracking-widest text-xs px-3 py-2 text-ink/60 hover:text-tomato hover:border-tomato transition-colors"
            title="Clear follow-up date"
          >
            CLEAR
          </button>
        )}
      </div>
      {isOverdue && existing && (
        <p className="font-dm text-xs text-red-600 mt-2">
          Overdue since {existing.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
      )}
      {isUpcoming && existing && (
        <p className="font-dm text-xs text-amber-700 mt-2">
          Scheduled for {existing.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
      )}
    </div>
  );
}

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
  const [tab, setTab] = useState<"overview"|"leads"|"pipeline"|"calendar"|"contacts"|"menu"|"settings">("overview");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [calDate, setCalDate] = useState(new Date());
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [spaceForm, setSpaceForm] = useState({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" });

  const utils = trpc.useUtils();

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user?.id });
  const { data: overdueLeads, refetch: refetchOverdue } = trpc.leads.overdue.useQuery(undefined, { enabled: !!user?.id });
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
  const { data: monthFollowUps } = trpc.leads.followUpsByMonth.useQuery(
    { year: calDate.getFullYear(), month: calDate.getMonth() + 1 },
    { enabled: !!user?.id }
  );

  const updateStatus = trpc.leads.updateStatus.useMutation({
    onSuccess: () => { refetchLeads(); if (selectedLead) utils.leads.getActivity.invalidate({ leadId: selectedLead.id }); toast.success("Status updated"); },
  });
  const bulkUpdateStatus = trpc.leads.bulkUpdateStatus.useMutation({
    onSuccess: (data) => {
      refetchLeads();
      refetchOverdue();
      setSelectedLeadIds(new Set());
      setBulkSelectMode(false);
      toast.success(`${data.updated} lead${data.updated === 1 ? '' : 's'} updated`);
    },
    onError: (err) => toast.error(err.message || 'Bulk update failed'),
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

  // Menu packages
  const { data: menuPackages, refetch: refetchMenuPackages } = trpc.menu.listPackages.useQuery(undefined, { enabled: !!user?.id });
  const [menuForm, setMenuForm] = useState({ name: "", type: "food" as "food"|"beverages"|"food_and_beverages", description: "", pricePerHead: "" });
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<number|null>(null);

  // Email compose state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: "", body: "" });
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  // Email Templates
  const { data: emailTemplates, refetch: refetchTemplates } = trpc.templates.list.useQuery(undefined, { enabled: isAuthenticated });
  const createTemplate = trpc.templates.create.useMutation({ onSuccess: () => { refetchTemplates(); setShowTemplateForm(false); setTemplateForm({ name: "", subject: "", body: "" }); toast.success("Template saved!"); } });
  const deleteTemplate = trpc.templates.delete.useMutation({ onSuccess: () => { refetchTemplates(); toast.success("Template deleted"); } });
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", subject: "", body: "" });
  const sendEmail = trpc.email.send.useMutation({
    onSuccess: (_, vars) => {
      setShowEmailModal(false);
      setEmailForm({ subject: "", body: "" });
      // If lead was "new", it's now "contacted" — update local state and notify
      if (selectedLead?.status === 'new') {
        const followUp = new Date();
        followUp.setDate(followUp.getDate() + 3);
        setSelectedLead((prev: any) => prev ? { ...prev, status: 'contacted', followUpDate: followUp } : prev);
        toast.success('Email sent! Lead moved to Contacted — follow-up set for 3 days from now.');
      } else {
        toast.success('Email sent successfully!');
      }
      if (selectedLead) utils.leads.getActivity.invalidate({ leadId: selectedLead.id });
      refetchLeads();
      refetchOverdue();
    },
    onError: (err) => toast.error(err.message || "Failed to send email"),
  });

  const createMenuPackage = trpc.menu.createPackage.useMutation({
    onSuccess: () => { refetchMenuPackages(); setShowMenuForm(false); setMenuForm({ name: "", type: "food", description: "", pricePerHead: "" }); toast.success("Menu package added!"); },
    onError: () => toast.error("Failed to add menu package"),
  });
  const updateMenuPackage = trpc.menu.updatePackage.useMutation({
    onSuccess: () => { refetchMenuPackages(); setEditingPackageId(null); setShowMenuForm(false); setMenuForm({ name: "", type: "food", description: "", pricePerHead: "" }); toast.success("Package updated!"); },
    onError: () => toast.error("Failed to update package"),
  });
  const deleteMenuPackage = trpc.menu.deletePackage.useMutation({
    onSuccess: () => { refetchMenuPackages(); toast.success("Package deleted"); },
    onError: () => toast.error("Failed to delete package"),
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
  const followUpDays = new Set((monthFollowUps ?? []).map((l: any) => new Date(l.followUpDate).getDate()));

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
            { id: "menu", icon: <ChefHat className="w-5 h-5" />, label: "MENU" },
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
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gold/15 mb-8">
                {[
                  { label: "NEW LEADS", value: stats?.newLeads ?? 0, sub: "awaiting response", accent: "text-gold", icon: <MessageSquare className="w-4 h-4 text-gold" /> },
                  { label: "TOTAL LEADS", value: stats?.totalLeads ?? 0, sub: "all time", accent: "text-ink", icon: <Users className="w-4 h-4 text-sage" /> },
                  { label: "PROPOSALS SENT", value: stats?.proposalsSent ?? 0, sub: "this period", accent: "text-forest", icon: <FileText className="w-4 h-4 text-forest" /> },
                  { label: "BOOKINGS THIS MONTH", value: stats?.bookingsThisMonth ?? 0, sub: `$${(stats?.revenueThisMonth ?? 0).toLocaleString()} NZD`, accent: "text-emerald-600", icon: <CheckCircle className="w-4 h-4 text-emerald-600" /> },
                  { label: "OVERDUE FOLLOW-UPS", value: stats?.overdueFollowUps ?? 0, sub: (stats?.overdueFollowUps ?? 0) > 0 ? "action required" : "all clear", accent: (stats?.overdueFollowUps ?? 0) > 0 ? "text-red-600" : "text-sage", icon: <span className={(stats?.overdueFollowUps ?? 0) > 0 ? "text-red-500 text-base" : "text-sage text-base"}>⏰</span> },
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

              {/* Overdue Follow-Ups */}
              {(overdueLeads ?? []).length > 0 && (
                <div className="mt-6 dante-card shadow-sm border-l-4 border-l-red-500">
                  <div className="flex items-center justify-between p-4 border-b border-gold/15">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                      <h2 className="font-cormorant text-xl font-semibold text-ink">Overdue Follow-Ups</h2>
                      <span className="bg-red-100 text-red-700 font-bebas text-xs tracking-widest px-2 py-0.5">{(overdueLeads ?? []).length}</span>
                    </div>
                    <button onClick={() => setTab("leads")} className="font-bebas tracking-widest text-xs text-forest hover:text-gold transition-colors">VIEW ALL LEADS</button>
                  </div>
                  <div className="divide-y divide-border/40">
                    {(overdueLeads ?? []).map((lead: any) => {
                      const daysOverdue = Math.floor((new Date().getTime() - new Date(lead.followUpDate).getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <button key={lead.id} onClick={() => { setSelectedLead(lead); setTab("leads"); }}
                          className="w-full flex items-center justify-between p-4 hover:bg-red-50/50 transition-colors text-left">
                          <div>
                            <div className="font-cormorant font-semibold text-base text-ink">{lead.firstName} {lead.lastName}</div>
                            <div className="font-dm text-xs text-ink/60">{lead.eventType || "Event"}{lead.guestCount ? ` · ${lead.guestCount} guests` : ""}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bebas text-xs tracking-widest text-red-600">
                              {daysOverdue === 0 ? 'DUE TODAY' : `${daysOverdue}d OVERDUE`}
                            </div>
                            <div className="font-dm text-xs text-ink/40">
                              {new Date(lead.followUpDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-cormorant text-2xl font-semibold text-ink">Leads Inbox</h2>
                    <button
                      onClick={() => { setBulkSelectMode(m => !m); setSelectedLeadIds(new Set()); }}
                      className={`font-bebas text-xs tracking-widest px-2.5 py-1 border transition-colors ${
                        bulkSelectMode ? 'bg-forest text-cream border-forest' : 'border-gold/40 text-ink/60 hover:border-gold hover:text-ink'
                      }`}>
                      {bulkSelectMode ? 'CANCEL' : 'SELECT'}
                    </button>
                  </div>
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
                {/* Select All bar — only visible in bulk mode */}
                {bulkSelectMode && filteredLeads.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-2 bg-linen border-b border-gold/15">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={selectedLeadIds.size === filteredLeads.length}
                        onChange={(e) => setSelectedLeadIds(e.target.checked ? new Set(filteredLeads.map((l: any) => l.id)) : new Set())}
                        className="w-4 h-4 accent-forest cursor-pointer" />
                      <span className="font-bebas text-xs tracking-widest text-ink/70">
                        {selectedLeadIds.size > 0 ? `${selectedLeadIds.size} SELECTED` : 'SELECT ALL'}
                      </span>
                    </label>
                  </div>
                )}
                <div className="flex-1 overflow-auto divide-y divide-border/40">
                  {filteredLeads.length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageSquare className="w-8 h-8 text-sage/30 mx-auto mb-2" />
                      <p className="font-dm text-sage text-sm">No leads found</p>
                    </div>
                  ) : filteredLeads.map((lead: any) => (
                    <div key={lead.id} className={`flex items-stretch ${
                      selectedLeadIds.has(lead.id) ? 'bg-forest/5' : ''
                    }`}>
                      {bulkSelectMode && (
                        <label className="flex items-center px-3 cursor-pointer">
                          <input type="checkbox"
                            checked={selectedLeadIds.has(lead.id)}
                            onChange={(e) => {
                              setSelectedLeadIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(lead.id); else next.delete(lead.id);
                                return next;
                              });
                            }}
                            className="w-4 h-4 accent-forest cursor-pointer" />
                        </label>
                      )}
                    <button onClick={() => { if (!bulkSelectMode) setSelectedLead(lead); }}
                      className={`flex-1 p-4 text-left hover:bg-linen transition-colors ${!bulkSelectMode && selectedLead?.id === lead.id ? "bg-forest/5 border-l-2 border-gold" : "border-l-2 border-transparent"}`}>
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
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-dm text-xs text-ink/50">{new Date(lead.createdAt).toLocaleDateString("en-NZ")}</span>
                        {lead.followUpDate && (() => {
                          const d = new Date(lead.followUpDate);
                          const overdue = d <= new Date() && !['booked','lost','cancelled'].includes(lead.status);
                          const upcoming = d > new Date();
                          if (overdue) return (
                            <span className="font-bebas text-xs tracking-widest px-1.5 py-0.5 bg-red-100 text-red-700 flex-shrink-0">OVERDUE</span>
                          );
                          if (upcoming) return (
                            <span className="font-bebas text-xs tracking-widest px-1.5 py-0.5 bg-gold/20 text-amber-700 flex-shrink-0">
                              FOLLOW UP {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                            </span>
                          );
                          return null;
                        })()}
                      </div>
                    </button>
                    </div>
                  ))}
                </div>
              </div>
              {/* Floating Bulk Action Toolbar */}
              {bulkSelectMode && selectedLeadIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-ink text-cream px-5 py-3 shadow-2xl border border-gold/30">
                  <span className="font-bebas tracking-widest text-sm text-gold">{selectedLeadIds.size} LEAD{selectedLeadIds.size !== 1 ? 'S' : ''}</span>
                  <span className="text-cream/30">|</span>
                  <span className="font-bebas tracking-widest text-xs text-cream/70">SET STATUS:</span>
                  <div className="flex items-center gap-1.5">
                    {PIPELINE_STAGES.map(s => (
                      <button key={s.key}
                        onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selectedLeadIds), status: s.key as any })}
                        disabled={bulkUpdateStatus.isPending}
                        className={`font-bebas text-xs tracking-widest px-2.5 py-1.5 border transition-colors hover:bg-gold hover:text-ink hover:border-gold disabled:opacity-50 ${
                          s.key === 'new' ? 'border-cream/30 text-cream/80' :
                          s.key === 'contacted' ? 'border-blue-400/50 text-blue-300' :
                          s.key === 'proposal_sent' ? 'border-purple-400/50 text-purple-300' :
                          s.key === 'negotiating' ? 'border-amber-400/50 text-amber-300' :
                          s.key === 'booked' ? 'border-emerald-400/50 text-emerald-300' :
                          s.key === 'lost' ? 'border-red-400/50 text-red-300' :
                          'border-cream/20 text-cream/50'
                        }`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setSelectedLeadIds(new Set()); setBulkSelectMode(false); }}
                    className="ml-2 text-cream/50 hover:text-cream font-bebas text-xs tracking-widest">
                    CLEAR
                  </button>
                </div>
              )}
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
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedLead.email && (
                        <button onClick={() => {
                          setEmailForm({ subject: `Re: Your event enquiry — ${selectedLead.eventType || 'Event'}`, body: `Hi ${selectedLead.firstName},\n\nThank you for your enquiry. ` });
                          setShowEmailModal(true);
                        }}
                          className="border-2 border-forest text-forest font-bebas tracking-widest text-xs px-4 py-2 flex items-center gap-1 hover:bg-forest hover:text-cream transition-all">
                          <Mail className="w-3 h-3" /> EMAIL
                        </button>
                      )}
                      <button onClick={() => setLocation(`/proposals/new?leadId=${selectedLead.id}`)}
                        className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1">
                        <FileText className="w-3 h-3" /> CREATE PROPOSAL
                      </button>
                    </div>
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
                  {/* Follow-Up Date */}
                  <FollowUpDateCard lead={selectedLead} onSaved={(updated) => {
                    refetchLeads();
                    utils.leads.getActivity.invalidate({ leadId: selectedLead.id });
                    setSelectedLead((prev: any) => prev ? { ...prev, followUpDate: updated } : prev);
                  }} />
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

          {/* ── EMAIL COMPOSE MODAL ───────────────────────────────────────── */}
          {showEmailModal && selectedLead && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
              <div className="bg-cream border-2 border-forest w-full max-w-lg shadow-2xl">
                <div className="bg-forest text-cream px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bebas tracking-widest text-sm">COMPOSE EMAIL</div>
                    <div className="font-dm text-xs text-cream/70">To: {selectedLead.firstName} {selectedLead.lastName} &lt;{selectedLead.email}&gt;</div>
                  </div>
                  <button onClick={() => setShowEmailModal(false)} className="text-cream/60 hover:text-cream text-xl leading-none">&times;</button>
                </div>
                <div className="p-6 space-y-4">
                  {/* Template picker */}
                  {(emailTemplates ?? []).length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTemplateDropdown(v => !v)}
                        className="w-full border border-gold/40 bg-gold/10 px-3 py-2 font-bebas tracking-widest text-xs text-forest hover:bg-gold/20 transition-colors flex items-center justify-between"
                      >
                        <span>USE A TEMPLATE</span>
                        <span className="text-sage/60">▾</span>
                      </button>
                      {showTemplateDropdown && (
                        <div className="absolute z-10 top-full left-0 right-0 bg-white border border-border shadow-lg max-h-48 overflow-y-auto">
                          {(emailTemplates ?? []).map((t: any) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                const lead = selectedLead ?? {};
                                const venue = venueSettings ?? {};
                                const subject = substituteTemplateVars(t.subject, lead, venue);
                                const body = substituteTemplateVars(t.body, lead, venue);
                                setEmailForm({ subject, body });
                                setShowTemplateDropdown(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-cream transition-colors border-b border-border/30 last:border-0"
                            >
                              <div className="font-bebas tracking-widest text-xs text-forest">{t.name}</div>
                              <div className="font-dm text-xs text-sage truncate">{t.subject}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SUBJECT</label>
                    <input
                      value={emailForm.subject}
                      onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
                      className="w-full border border-border px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest"
                      placeholder="Email subject"
                    />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MESSAGE</label>
                    <textarea
                      value={emailForm.body}
                      onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
                      rows={8}
                      className="w-full border border-border px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest resize-none"
                      placeholder="Write your message here..."
                    />
                    {/* Inline variable hint — shows which {{vars}} are still unreplaced */}
                    {emailForm.body && /\{\{\w+\}\}/.test(emailForm.body) && (
                      <div className="mt-1 px-2 py-1 bg-gold/10 border border-gold/30 font-dm text-xs text-amber-800 flex items-start gap-1.5">
                        <span className="flex-shrink-0 font-bold">!</span>
                        <span>
                          Some variables could not be substituted automatically:{" "}
                          {Array.from(emailForm.body.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.
                          {" "}Please replace them manually before sending.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 justify-end pt-2">
                    <button onClick={() => setShowEmailModal(false)}
                      className="border border-border font-bebas tracking-widest text-xs px-5 py-2 text-ink/60 hover:text-ink transition-colors">
                      CANCEL
                    </button>
                    <button
                      onClick={() => sendEmail.mutate({
                        to: selectedLead.email!,
                        toName: `${selectedLead.firstName} ${selectedLead.lastName}`,
                        subject: emailForm.subject,
                        body: emailForm.body,
                        leadId: selectedLead.id,
                      })}
                      disabled={sendEmail.isPending || !emailForm.subject || !emailForm.body}
                      className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream flex items-center gap-2 disabled:opacity-50">
                      <Send className="w-3 h-3" />
                      {sendEmail.isPending ? 'SENDING...' : 'SEND EMAIL'}
                    </button>
                  </div>
                </div>
              </div>
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
                    const hasFollowUp = followUpDays.has(day);
                    const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                    return (
                      <div key={day} className={`aspect-square flex flex-col items-center justify-center text-sm font-dm border transition-colors
                        ${hasBooking ? "bg-forest/10 border-forest" : hasFollowUp ? "bg-gold/10 border-gold" : isToday ? "border-gold bg-gold/5" : "border-transparent hover:bg-linen"}`}>
                        <span className={`${hasBooking ? "text-forest font-bold" : hasFollowUp ? "text-amber-700 font-semibold" : isToday ? "text-ink font-semibold" : "text-foreground"}`}>{day}</span>
                        <div className="flex gap-0.5 mt-0.5">
                          {hasBooking && <div className="w-1.5 h-1.5 bg-forest rounded-full" />}
                          {hasFollowUp && <div className="w-1.5 h-1.5 bg-gold rounded-full" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gold/15 text-xs font-dm">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-forest/10 border border-forest" /><span>Booking</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gold/10 border border-gold" /><span>Follow-Up</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gold/5 border border-gold" /><span>Today</span></div>
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

              {/* This month's follow-ups */}
              {(monthFollowUps ?? []).length > 0 && (
                <div className="mt-6 max-w-2xl">
                  <h2 className="font-cormorant text-xl font-semibold text-ink mb-3">This Month's Follow-Ups</h2>
                  <div className="space-y-2">
                    {(monthFollowUps ?? []).map((lead: any) => {
                      const followDate = new Date(lead.followUpDate);
                      const isPast = followDate <= new Date();
                      return (
                        <button key={lead.id}
                          onClick={() => { setSelectedLead(lead); setTab('leads'); }}
                          className="w-full dante-card p-4 flex items-center justify-between hover:bg-gold/5 transition-colors text-left">
                          <div>
                            <div className="font-cormorant font-semibold text-base text-ink">{lead.firstName} {lead.lastName}</div>
                            <div className="font-dm text-xs text-ink/60">{lead.eventType || 'Enquiry'} · {lead.email}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bebas text-xs tracking-widest ${isPast ? 'text-red-600' : 'text-amber-700'}`}>
                              {isPast ? 'OVERDUE' : 'FOLLOW UP'}
                            </div>
                            <div className="font-dm text-xs text-ink/50">
                              {followDate.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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

          {/* ── MENU ─────────────────────────────────────────────────────── */}
          {tab === "menu" && (
            <div className="p-6 max-w-3xl">
              <div className="gold-rule max-w-xs mb-3"><span>CATERING OPTIONS</span></div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="font-cormorant text-ink" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Menu Packages</h1>
                <Button onClick={() => { setEditingPackageId(null); setMenuForm({ name: "", type: "food", description: "", pricePerHead: "" }); setShowMenuForm(true); }}
                  className="btn-forest font-bebas tracking-widest text-xs px-5 py-2.5 text-cream gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> ADD PACKAGE
                </Button>
              </div>

              {showMenuForm && (
                <div className="dante-card p-5 mb-6 border-2 border-gold/30">
                  <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">{editingPackageId ? 'EDIT PACKAGE' : 'NEW PACKAGE'}</h2>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PACKAGE NAME</label>
                        <Input value={menuForm.name} onChange={e => setMenuForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="e.g. 3-Course Dinner" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-forest" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TYPE</label>
                        <Select value={menuForm.type} onValueChange={(v: any) => setMenuForm(f => ({ ...f, type: v }))}>
                          <SelectTrigger className="rounded-none border-2 focus:ring-0 focus:border-forest">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="food">Food</SelectItem>
                            <SelectItem value="beverages">Beverages</SelectItem>
                            <SelectItem value="food_and_beverages">Food & Beverages</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
                      <Textarea value={menuForm.description} onChange={e => setMenuForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Describe what's included..." rows={2}
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-forest resize-none text-sm" />
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PRICE PER HEAD (NZD)</label>
                      <Input type="number" value={menuForm.pricePerHead} onChange={e => setMenuForm(f => ({ ...f, pricePerHead: e.target.value }))}
                        placeholder="65.00" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-forest" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" onClick={() => {
                        if (editingPackageId) {
                          updateMenuPackage.mutate({ id: editingPackageId, name: menuForm.name, type: menuForm.type, description: menuForm.description || undefined, pricePerHead: menuForm.pricePerHead ? parseFloat(menuForm.pricePerHead) : undefined });
                        } else {
                          createMenuPackage.mutate({ name: menuForm.name, type: menuForm.type, description: menuForm.description || undefined, pricePerHead: menuForm.pricePerHead ? parseFloat(menuForm.pricePerHead) : undefined });
                        }
                      }} disabled={!menuForm.name || createMenuPackage.isPending || updateMenuPackage.isPending}
                        className="btn-forest font-bebas tracking-widest text-xs px-6 py-2.5 text-cream">
                        {editingPackageId ? 'UPDATE PACKAGE' : 'SAVE PACKAGE'}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setShowMenuForm(false)}
                        className="border-2 border-border font-bebas tracking-widest text-xs rounded-none">
                        CANCEL
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Food Packages */}
              {['food', 'beverages', 'food_and_beverages'].map(type => {
                const pkgs = (menuPackages ?? []).filter(p => p.type === type);
                if (pkgs.length === 0 && !showMenuForm) return null;
                const typeLabel = type === 'food' ? 'FOOD' : type === 'beverages' ? 'BEVERAGES' : 'FOOD & BEVERAGES';
                const TypeIcon = type === 'food' ? UtensilsCrossed : type === 'beverages' ? Wine : ChefHat;
                const iconColor = type === 'food' ? 'text-tomato' : type === 'beverages' ? 'text-gold' : 'text-forest';
                return (
                  <div key={type} className="mb-6">
                    <div className={`flex items-center gap-2 mb-3`}>
                      <TypeIcon className={`w-4 h-4 ${iconColor}`} />
                      <span className={`font-bebas text-xs tracking-widest ${iconColor}`}>{typeLabel} PACKAGES</span>
                    </div>
                    {pkgs.length === 0 ? (
                      <div className="text-center py-4 border border-dashed border-border">
                        <p className="font-dm text-sm text-muted-foreground">No {typeLabel.toLowerCase()} packages yet.</p>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {pkgs.map(pkg => (
                          <div key={pkg.id} className="dante-card p-4 flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="font-bebas text-sm tracking-wide text-ink">{pkg.name}</div>
                              {pkg.description && <div className="font-dm text-xs text-muted-foreground mt-0.5">{pkg.description}</div>}

                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {pkg.pricePerHead && (
                                <div className="font-alfa text-lg text-forest">${Number(pkg.pricePerHead).toFixed(2)}<span className="font-dm text-xs text-muted-foreground">/head</span></div>
                              )}
                              <button onClick={() => { setEditingPackageId(pkg.id); setMenuForm({ name: pkg.name, type: pkg.type as any, description: pkg.description ?? "", pricePerHead: pkg.pricePerHead ? String(pkg.pricePerHead) : "" }); setShowMenuForm(true); }}
                                className="text-sage/50 hover:text-forest transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm('Delete this package?')) deleteMenuPackage.mutate({ id: pkg.id }); }}
                                className="text-sage/50 hover:text-tomato transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {(!menuPackages || menuPackages.length === 0) && !showMenuForm && (
                <div className="text-center py-12 border-2 border-dashed border-border">
                  <ChefHat className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="font-cormorant text-xl text-muted-foreground">No menu packages yet</p>
                  <p className="font-dm text-sm text-muted-foreground/60 mt-1 mb-4">Add Food, Beverages, or Food & Beverages packages to include in your proposals.</p>
                  <Button onClick={() => setShowMenuForm(true)} className="btn-forest font-bebas tracking-widest text-xs px-6 py-2.5 text-cream gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> ADD YOUR FIRST PACKAGE
                  </Button>
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

              {/* Email / SMTP Settings */}
              <div className="mt-8 border-t border-gold/20 pt-8">
                <h2 className="font-cormorant text-xl font-semibold text-ink mb-1">Email Settings</h2>
                <p className="font-dm text-xs text-sage mb-4">Configure your SMTP server to send emails directly from the leads inbox. Use Gmail, Outlook, or any SMTP provider.</p>
                <form onSubmit={e => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  updateSettings.mutate({
                    smtpHost: fd.get('smtpHost') as string || undefined,
                    smtpPort: fd.get('smtpPort') ? parseInt(fd.get('smtpPort') as string) : undefined,
                    smtpUser: fd.get('smtpUser') as string || undefined,
                    smtpPass: fd.get('smtpPass') as string || undefined,
                    smtpFromName: fd.get('smtpFromName') as string || undefined,
                    smtpFromEmail: fd.get('smtpFromEmail') as string || undefined,
                    smtpSecure: fd.get('smtpSecure') === 'on' ? 1 : 0,
                  });
                }} className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SMTP HOST</label>
                    <Input name="smtpHost" defaultValue={venueSettings?.smtpHost ?? ''} placeholder="smtp.gmail.com"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SMTP PORT</label>
                    <Input name="smtpPort" type="number" defaultValue={venueSettings?.smtpPort ?? 587} placeholder="587"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SMTP USERNAME / EMAIL</label>
                    <Input name="smtpUser" defaultValue={venueSettings?.smtpUser ?? ''} placeholder="you@gmail.com"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SMTP PASSWORD / APP PASSWORD</label>
                    <Input name="smtpPass" type="password" defaultValue={venueSettings?.smtpPass ?? ''} placeholder="••••••••••••"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FROM NAME</label>
                    <Input name="smtpFromName" defaultValue={venueSettings?.smtpFromName ?? ''} placeholder="The Grand Hall"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FROM EMAIL ADDRESS</label>
                    <Input name="smtpFromEmail" defaultValue={venueSettings?.smtpFromEmail ?? ''} placeholder="events@yourvenue.co.nz"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-3">
                    <input type="checkbox" name="smtpSecure" id="smtpSecure" defaultChecked={(venueSettings?.smtpSecure ?? 0) === 1}
                      className="w-4 h-4 accent-forest" />
                    <label htmlFor="smtpSecure" className="font-dm text-sm text-ink">Use SSL (port 465) — leave unchecked for STARTTLS (port 587)</label>
                  </div>
                  <div className="md:col-span-2">
                    <button type="submit" disabled={updateSettings.isPending}
                      className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                      {updateSettings.isPending ? "SAVING..." : "SAVE EMAIL SETTINGS"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Email Templates */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-cormorant text-xl font-semibold text-ink">Email Templates</h2>
                    <p className="font-dm text-xs text-sage">Save reusable email templates to one-click populate the compose modal.</p>
                  </div>
                  <button onClick={() => setShowTemplateForm(true)} className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1">
                    <Plus className="w-3 h-3" /> NEW TEMPLATE
                  </button>
                </div>
                {(emailTemplates ?? []).length === 0 ? (
                  <div className="border border-dashed border-gold/20 p-6 text-center">
                    <p className="font-dm text-sage text-sm">No templates yet. Create your first template to speed up email replies.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(emailTemplates ?? []).map((t: any) => (
                      <div key={t.id} className="dante-card p-4 flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-cormorant font-semibold text-base text-ink">{t.name}</div>
                          <div className="font-bebas tracking-widest text-xs text-forest mt-0.5">{t.subject}</div>
                          <div className="font-dm text-xs text-ink/50 mt-1 line-clamp-2">{t.body}</div>
                        </div>
                        <button onClick={() => deleteTemplate.mutate({ id: t.id })} className="text-sage/40 hover:text-tomato transition-colors flex-shrink-0 mt-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* New Template Form */}
                {showTemplateForm && (
                  <div className="mt-4 dante-card p-5 border-2 border-gold/30">
                    <div className="font-cormorant text-lg font-semibold text-ink mb-4">New Template</div>
                    <div className="space-y-3">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TEMPLATE NAME</label>
                        <Input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Function Pack Follow-Up" className="rounded-none border-border font-dm text-sm" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SUBJECT LINE</label>
                        <Input value={templateForm.subject} onChange={e => setTemplateForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Following up on your enquiry" className="rounded-none border-border font-dm text-sm" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MESSAGE BODY</label>
                        <Textarea value={templateForm.body} onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))} rows={6} placeholder="Write your template message here..." className="rounded-none border-border font-dm text-sm resize-none" />
                      </div>
                      {/* Variable cheatsheet */}
                      <details className="group">
                        <summary className="font-bebas tracking-widest text-xs text-forest/70 cursor-pointer hover:text-forest select-none list-none flex items-center gap-1">
                          <span className="group-open:rotate-90 transition-transform inline-block">▶</span> AVAILABLE VARIABLES
                        </summary>
                        <div className="mt-2 p-3 bg-cream/60 border border-gold/20 grid grid-cols-2 gap-x-4 gap-y-1">
                          {TEMPLATE_VARIABLES.map(v => (
                            <button
                              key={v.token}
                              type="button"
                              onClick={() => setTemplateForm(f => ({ ...f, body: f.body + v.token }))}
                              title={`Insert ${v.label} — e.g. "${v.example}"`}
                              className="text-left group/var"
                            >
                              <span className="font-mono text-xs text-forest group-hover/var:text-gold transition-colors">{v.token}</span>
                              <span className="font-dm text-xs text-ink/40 ml-1">{v.label}</span>
                            </button>
                          ))}
                        </div>
                      </details>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setShowTemplateForm(false); setTemplateForm({ name: '', subject: '', body: '' }); }}
                          className="border border-border font-bebas tracking-widest text-xs px-4 py-2 text-ink/60 hover:text-ink transition-colors">CANCEL</button>
                        <button onClick={() => createTemplate.mutate(templateForm)} disabled={!templateForm.name || !templateForm.subject || !templateForm.body || createTemplate.isPending}
                          className="btn-forest font-bebas tracking-widest text-xs px-6 py-2 text-cream disabled:opacity-50">
                          {createTemplate.isPending ? 'SAVING...' : 'SAVE TEMPLATE'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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
