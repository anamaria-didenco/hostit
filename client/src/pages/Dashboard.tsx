import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard, Users, FileText, Calendar, Settings, ChevronLeft, ChevronRight,
  Plus, Search, ExternalLink, MessageSquare, TrendingUp, CheckCircle, Clock, Copy,
  ChefHat, UtensilsCrossed, Wine, Trash2, Pencil, Mail, Send,
  BarChart2, DollarSign, X, MapPin, LayoutGrid
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { substituteTemplateVars, TEMPLATE_VARIABLES } from "@/lib/templateVars";
import { DashboardWidgets } from "@/components/DashboardWidgets";

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

// ── Overview Widget Sub-Components ──────────────────────────────────────────────

function MiniCalendarWidget({ month, year, firstDay, daysInMonth, monthBookings, monthLeadEvents, onPrev, onNext, onDayClick, onViewCalendar }: {
  month: number; year: number; firstDay: number; daysInMonth: number;
  monthBookings: any; monthLeadEvents: any;
  onPrev: () => void; onNext: () => void;
  onDayClick: (dayBookings: any[], dayLeads: any[]) => void;
  onViewCalendar: () => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="dante-card shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-gold/15">
          <button onClick={onPrev} className="p-1 hover:text-gold transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="font-cormorant text-lg font-semibold text-ink">{MONTHS[month]} {year}</h2>
          <button onClick={onNext} className="p-1 hover:text-gold transition-colors"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-4 px-4 pt-3 pb-1 flex-wrap">
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Confirmed</span>
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Tentative</span>
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-stone-400 inline-block" />Cancelled</span>
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />Enquiry</span>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-7 mb-1">
            {["SUN","MON","TUE","WED","THU","FRI","SAT"].map(d => (
              <div key={d} className="text-center font-bebas text-[10px] tracking-widest text-ink/50 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {[...Array(firstDay)].map((_, i) => <div key={`e-${i}`} />)}
            {[...Array(daysInMonth)].map((_, i) => {
              const day = i + 1;
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
              const dayBookings = (monthBookings ?? []).filter((b: any) => new Date(b.eventDate).getDate() === day);
              const dayLeads = (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getDate() === day);
              const hasConfirmed = dayBookings.some((b: any) => b.status === 'confirmed');
              const hasTentative = dayBookings.some((b: any) => b.status === 'tentative');
              const hasCancelled = dayBookings.some((b: any) => b.status === 'cancelled');
              const hasEnquiry = dayLeads.length > 0;
              const cellBg = hasConfirmed ? 'bg-emerald-50 border-emerald-300' : hasTentative ? 'bg-amber-50 border-amber-300' : hasCancelled ? 'bg-stone-50 border-stone-300' : hasEnquiry ? 'bg-rose-50 border-rose-300' : isToday ? 'bg-gold/10 border-gold' : 'border-transparent hover:bg-linen';
              return (
                <div key={day} onClick={() => onDayClick(dayBookings, dayLeads)}
                  className={`relative min-h-[44px] flex flex-col p-1 border transition-colors ${cellBg} ${(dayBookings.length > 0 || dayLeads.length > 0) ? 'cursor-pointer' : ''}`}
                >
                  <span className={`text-[11px] font-dm leading-none mb-0.5 ${isToday ? 'font-bold text-gold' : 'text-ink/70'}`}>{day}</span>
                  <div className="flex flex-wrap gap-0.5 mt-auto">
                    {dayBookings.slice(0, 3).map((b: any) => (
                      <span key={b.id} className={`w-2 h-2 rounded-full flex-shrink-0 ${b.status === 'confirmed' ? 'bg-emerald-500' : b.status === 'tentative' ? 'bg-amber-400' : 'bg-stone-400'}`} />
                    ))}
                    {dayLeads.slice(0, 2).map((l: any) => (
                      <span key={l.id} className="w-2 h-2 rounded-full flex-shrink-0 bg-rose-400" />
                    ))}
                  </div>
                  {dayBookings.slice(0, 1).map((b: any) => (
                    <div key={b.id} className={`text-[9px] leading-tight font-dm truncate w-full mt-0.5 ${b.status === 'confirmed' ? 'text-emerald-700' : b.status === 'tentative' ? 'text-amber-700' : 'text-stone-500'}`}>{b.firstName}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-3 border-t border-gold/15">
          <button onClick={onViewCalendar} className="w-full font-bebas tracking-widest text-xs text-forest hover:text-gold transition-colors py-1">VIEW FULL CALENDAR →</button>
        </div>
      </div>
    </div>
  );
}

function NewEnquiriesWidget({ newEnquiries, overdueLeads, onSelectLead, onViewAll, onViewOverdue }: {
  newEnquiries: any[]; overdueLeads: any;
  onSelectLead: (lead: any) => void; onViewAll: () => void; onViewOverdue: () => void;
}) {
  return (
    <div className="dante-card shadow-sm flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-gold/15">
        <div className="flex items-center gap-3">
          <h2 className="font-cormorant text-lg font-semibold text-ink">New Enquiries</h2>
          {newEnquiries.length > 0 && (
            <span className="bg-gold/20 text-amber-800 font-bebas text-xs tracking-widest px-2 py-0.5 border border-gold/30">{newEnquiries.length}</span>
          )}
        </div>
        <button onClick={onViewAll} className="font-bebas tracking-widest text-xs text-forest hover:text-gold transition-colors">VIEW ALL</button>
      </div>
      {newEnquiries.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <CheckCircle className="w-10 h-10 text-emerald-400 mb-3" />
          <p className="font-cormorant text-lg text-ink/60 italic">All caught up!</p>
          <p className="font-dm text-xs text-ink/40 mt-1">No new enquiries waiting for a reply.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/40 overflow-y-auto max-h-[420px]">
          {newEnquiries.slice(0, 8).map((lead: any) => (
            <button key={lead.id} onClick={() => onSelectLead(lead)}
              className="w-full flex items-start gap-3 p-4 hover:bg-gold/5 transition-colors text-left">
              <div className="w-2 h-2 rounded-full bg-gold mt-1.5 flex-shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <div className="font-cormorant font-semibold text-sm text-ink">{lead.firstName} {lead.lastName}</div>
                <div className="font-dm text-xs text-ink/60 truncate">{lead.eventType || 'Event'}{lead.guestCount ? ` · ${lead.guestCount} guests` : ''}{lead.eventDate ? ` · ${new Date(lead.eventDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}` : ''}</div>
                {lead.message && <div className="font-dm text-xs text-ink/40 truncate mt-0.5 italic">"{lead.message}"</div>}
              </div>
              <div className="font-dm text-xs text-ink/40 flex-shrink-0">
                {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : ''}
              </div>
            </button>
          ))}
        </div>
      )}
      {(overdueLeads ?? []).length > 0 && (
        <div className="border-t border-red-200 bg-red-50/50">
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="font-bebas text-xs tracking-widest text-red-700">{(overdueLeads ?? []).length} OVERDUE FOLLOW-UP{(overdueLeads ?? []).length > 1 ? 'S' : ''}</span>
            <button onClick={onViewOverdue} className="ml-auto font-bebas text-xs tracking-widest text-red-600 hover:text-red-800 transition-colors">VIEW →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineSnapshotWidget({ allLeads, onViewLeads }: { allLeads: any; onViewLeads: () => void }) {
  const counts = PIPELINE_STAGES.map(s => ({
    ...s,
    count: (allLeads ?? []).filter((l: any) => l.status === s.key).length,
  }));
  const total = (allLeads ?? []).length;
  return (
    <div className="dante-card shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-cormorant text-lg font-semibold text-ink">Pipeline Snapshot</h2>
        <button onClick={onViewLeads} className="font-bebas tracking-widest text-xs text-forest hover:text-gold transition-colors">VIEW ALL</button>
      </div>
      <div className="space-y-2">
        {counts.map(s => (
          <div key={s.key} className="flex items-center gap-3">
            <span className={`font-bebas text-xs tracking-widest w-28 flex-shrink-0 ${s.color.split(' ').find(c => c.startsWith('text-')) ?? 'text-ink'}`}>{s.label}</span>
            <div className="flex-1 bg-gold/10 h-2 overflow-hidden">
              <div className={`h-2 transition-all ${s.color.split(' ').find(c => c.startsWith('bg-')) ?? 'bg-gold'}`}
                style={{ width: total > 0 ? `${(s.count / total) * 100}%` : '0%' }} />
            </div>
            <span className="font-dm text-xs text-ink/60 w-6 text-right">{s.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gold/15 font-dm text-xs text-ink/50">{total} total leads</div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"overview"|"leads"|"pipeline"|"calendar"|"contacts"|"menu"|"settings">("overview");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [leadsSubTab, setLeadsSubTab] = useState<"new" | "all">("new");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [calDate, setCalDate] = useState(new Date());
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [spaceForm, setSpaceForm] = useState({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" });
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [widgetEditMode, setWidgetEditMode] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(["stats", "calendar", "enquiries", "pipeline"]);
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(new Set());

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
  const { data: monthLeadEvents } = trpc.leads.eventsByMonth.useQuery(
    { year: calDate.getFullYear(), month: calDate.getMonth() + 1 },
    { enabled: !!user?.id }
  );

  // ── Widget layout preferences ──────────────────────────────────────────
  const { data: userPrefs } = trpc.userPreferences.get.useQuery(undefined, {
    enabled: !!user?.id,
  });
  // Load saved layout when prefs arrive
  const prefsLoaded = useRef(false);
  useEffect(() => {
    if (userPrefs && !prefsLoaded.current) {
      prefsLoaded.current = true;
      const layout = userPrefs.dashboardLayout as any;
      if (layout?.widgetOrder?.length) setWidgetOrder(layout.widgetOrder);
      if (layout?.hiddenWidgets?.length) setHiddenWidgets(new Set(layout.hiddenWidgets));
    }
  }, [userPrefs]);
  const saveLayout = trpc.userPreferences.save.useMutation();

  function handleWidgetOrderChange(newOrder: string[]) {
    setWidgetOrder(newOrder);
    saveLayout.mutate({ widgetOrder: newOrder, hiddenWidgets: Array.from(hiddenWidgets) });
  }
  function handleToggleHidden(id: string) {
    setHiddenWidgets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveLayout.mutate({ widgetOrder: widgetOrder, hiddenWidgets: Array.from(next) });
      return next;
    });
  }

  const updateLeadSource = trpc.leads.update.useMutation({
    onSuccess: (_data, vars) => {
      refetchLeads();
      setSelectedLead((prev: any) => prev ? { ...prev, source: vars.source } : prev);
      toast.success("Source updated");
    },
    onError: () => toast.error("Failed to update source"),
  });
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
  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => {
      refetchLeads();
      refetchOverdue();
      setSelectedLead(null);
      toast.success("Enquiry deleted");
    },
    onError: () => toast.error("Failed to delete enquiry"),
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

  // Checklist templates
  const { data: checklistTemplates, refetch: refetchChecklistTemplates } = trpc.checklists.listTemplates.useQuery(undefined, { enabled: isAuthenticated });
  const createChecklistTemplate = trpc.checklists.createTemplate.useMutation({
    onSuccess: () => { refetchChecklistTemplates(); setShowChecklistForm(false); setChecklistForm({ name: "", description: "", items: "" }); toast.success("Checklist template saved!"); },
    onError: () => toast.error("Failed to save checklist template"),
  });
  const deleteChecklistTemplate = trpc.checklists.deleteTemplate.useMutation({
    onSuccess: () => { refetchChecklistTemplates(); toast.success("Template deleted"); },
    onError: () => toast.error("Failed to delete template"),
  });
  const [showChecklistForm, setShowChecklistForm] = useState(false);
  const [checklistForm, setChecklistForm] = useState({ name: "", description: "", items: "" });

  // Bar menu state
  const { data: barMenuItemsList, refetch: refetchBarMenu } = trpc.barMenu.list.useQuery(undefined, { enabled: isAuthenticated });
  const [showBarItemForm, setShowBarItemForm] = useState(false);
  const [barItemForm, setBarItemForm] = useState({ category: "Wine", name: "", description: "", pricePerUnit: "", unit: "per glass" });
  const [editingBarItemId, setEditingBarItemId] = useState<number|null>(null);
  const [settingsFoodTab, setSettingsFoodTab] = useState<"food"|"bar"|"floorplans">("food");
  const addBarItem = trpc.barMenu.add.useMutation({
    onSuccess: () => { refetchBarMenu(); setShowBarItemForm(false); setBarItemForm({ category: "Wine", name: "", description: "", pricePerUnit: "", unit: "per glass" }); setEditingBarItemId(null); toast.success("Drink added!"); },
    onError: () => toast.error("Failed to add drink"),
  });
  const updateBarItem = trpc.barMenu.update.useMutation({
    onSuccess: () => { refetchBarMenu(); setShowBarItemForm(false); setEditingBarItemId(null); toast.success("Drink updated!"); },
    onError: () => toast.error("Failed to update drink"),
  });
  const deleteBarItem = trpc.barMenu.delete.useMutation({
    onSuccess: () => { refetchBarMenu(); toast.success("Drink deleted"); },
    onError: () => toast.error("Failed to delete drink"),
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

  const newEnquiries = (allLeads ?? []).filter((l: any) => l.status === "new");
  const repliedLeads = (allLeads ?? []).filter((l: any) => l.status !== "new");
  const leadsToShow = leadsSubTab === "new" ? newEnquiries : repliedLeads;
  const filteredLeads = leadsToShow.filter((l: any) =>
    !leadSearch || `${l.firstName} ${l.lastName} ${l.email} ${l.company ?? ""}`.toLowerCase().includes(leadSearch.toLowerCase())
  );

  // Calendar
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const bookingDays = new Set((monthBookings ?? []).map((b: any) => new Date(b.eventDate).getDate()));
  const followUpDays = new Set((monthFollowUps ?? []).map((l: any) => new Date(l.followUpDate).getDate()));
  const leadEventDays = new Set((monthLeadEvents ?? []).map((l: any) => new Date(l.eventDate).getDate()));

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
          <div className="flex items-center justify-center mb-3">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
              alt="HOSTit"
              className="h-16 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
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
        <div className="flex items-center px-5 w-56 flex-shrink-0 border-r border-gold/15">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
            alt="HOSTit"
            className="h-8 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
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
                  ? "text-sky-300 bg-white/10 border-l-2 border-sky-300 pl-[calc(0.75rem-2px)] md:pl-[calc(1rem-2px)]"
                  : "text-cream hover:text-sky-200 hover:bg-white/10 border-l-2 border-transparent"
              }`}>
              {item.icon}
              <span className="hidden md:block">{item.label}</span>
            </button>
          ))}
          <div className="mt-auto p-3 hidden md:block space-y-1.5">
            <Link href="/analytics">
              <button className="w-full border border-cream/30 text-cream hover:bg-white/10 hover:border-cream/60 transition-colors font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1">
                <BarChart2 className="w-3 h-3" /> ANALYTICS
              </button>
            </Link>
            <Link href="/payments">
              <button className="w-full border border-cream/30 text-cream hover:bg-white/10 hover:border-cream/60 transition-colors font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1">
                <DollarSign className="w-3 h-3" /> PAYMENTS
              </button>
            </Link>
            <Link href="/book">
              <button className="w-full border border-cream/30 text-cream hover:bg-white/10 hover:border-cream/60 transition-colors font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1">
                <ExternalLink className="w-3 h-3" /> EXPRESS BOOK
              </button>
            </Link>
            <Link href="/menu">
              <button className="w-full border border-cream/30 text-cream hover:bg-white/10 hover:border-cream/60 transition-colors font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1">
                <UtensilsCrossed className="w-3 h-3" /> F&B MENU
              </button>
            </Link>
            <Link href="/enquire">
              <button className="w-full border border-cream/30 text-cream hover:bg-white/10 hover:border-cream/60 transition-colors font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1">
                <ExternalLink className="w-3 h-3" /> LEAD FORM
              </button>
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="p-6">
              {/* Header */}
              <div className="mb-6 flex items-end justify-between">
                <div>
                  <div className="gold-rule max-w-xs mb-3"><span>DASHBOARD</span></div>
                  <h1 className="font-cormorant text-ink" style={{ fontSize: '2.5rem', fontWeight: 600 }}>
                    Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"}
                  </h1>
                </div>
                <button
                  onClick={() => setWidgetEditMode(v => !v)}
                  className={`flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-1.5 border transition-colors ${
                    widgetEditMode
                      ? "bg-forest-dark text-cream border-forest-dark"
                      : "border-gold/40 text-sage hover:border-forest hover:text-forest"
                  }`}
                  title="Customise dashboard layout"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  {widgetEditMode ? "DONE" : "CUSTOMISE"}
                </button>
              </div>
              {widgetEditMode && (
                <div className="mb-4 px-4 py-3 bg-gold/10 border border-gold/30 font-dm text-xs text-ink/70">
                  <strong className="font-bebas tracking-widest text-ink">EDIT MODE</strong> — Drag the <span className="font-semibold">⠿</span> handle to reorder widgets, or toggle visibility. Changes are saved automatically.
                </div>
              )}

              {/* Stats row — always visible, not draggable */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gold/15 mb-6">
                {[
                  { label: "NEW ENQUIRIES", value: stats?.newLeads ?? 0, sub: "awaiting reply", accent: "text-gold", icon: <MessageSquare className="w-4 h-4 text-gold" /> },
                  { label: "TOTAL LEADS", value: stats?.totalLeads ?? 0, sub: "all time", accent: "text-ink", icon: <Users className="w-4 h-4 text-sage" /> },
                  { label: "PROPOSALS SENT", value: stats?.proposalsSent ?? 0, sub: "this period", accent: "text-forest", icon: <FileText className="w-4 h-4 text-forest" /> },
                  { label: "BOOKINGS THIS MONTH", value: stats?.bookingsThisMonth ?? 0, sub: `$${(stats?.revenueThisMonth ?? 0).toLocaleString()} NZD`, accent: "text-emerald-600", icon: <CheckCircle className="w-4 h-4 text-emerald-600" /> },
                  { label: "OVERDUE FOLLOW-UPS", value: stats?.overdueFollowUps ?? 0, sub: (stats?.overdueFollowUps ?? 0) > 0 ? "action required" : "all clear", accent: (stats?.overdueFollowUps ?? 0) > 0 ? "text-red-600" : "text-sage", icon: <span className={(stats?.overdueFollowUps ?? 0) > 0 ? "text-red-500 text-base" : "text-sage text-base"}>⏰</span> },
                ].map(s => (
                  <div key={s.label} className="stat-card">
                    <div className="flex items-start justify-between mb-3">{s.icon}</div>
                    <div className={`font-cormorant text-5xl font-semibold mb-1 ${s.accent}`}>{s.value}</div>
                    <div className="font-bebas text-xs tracking-widest text-sage leading-tight">{s.label}</div>
                    <div className="font-dm text-xs text-sage/60 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Draggable two-column widgets */}
              <DashboardWidgets
                order={widgetOrder}
                hidden={hiddenWidgets}
                editMode={widgetEditMode}
                onOrderChange={handleWidgetOrderChange}
                onToggleHidden={handleToggleHidden}
                widgets={[
                  {
                    id: "calendar",
                    label: "MINI CALENDAR",
                    content: <MiniCalendarWidget
                      month={month} year={year} firstDay={firstDay} daysInMonth={daysInMonth}
                      monthBookings={monthBookings} monthLeadEvents={monthLeadEvents}
                      onPrev={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                      onNext={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                      onDayClick={(dayBookings: any[], dayLeads: any[]) => {
                        if (dayBookings.length > 0) setTab('calendar');
                        else if (dayLeads.length > 0) { setSelectedLead(dayLeads[0]); setTab('leads'); }
                      }}
                      onViewCalendar={() => setTab('calendar')}
                    />,
                  },
                  {
                    id: "enquiries",
                    label: "NEW ENQUIRIES",
                    content: <NewEnquiriesWidget
                      newEnquiries={newEnquiries}
                      overdueLeads={overdueLeads}
                      onSelectLead={(lead: any) => { setSelectedLead(lead); setLeadsSubTab('new'); setTab('leads'); }}
                      onViewAll={() => { setLeadsSubTab('new'); setTab('leads'); }}
                      onViewOverdue={() => setTab('leads')}
                    />,
                  },
                  {
                    id: "pipeline",
                    label: "PIPELINE SNAPSHOT",
                    content: <PipelineSnapshotWidget allLeads={allLeads} onViewLeads={() => setTab('leads')} />,
                  },
                ]}
              />

              {/* Lead Form CTA */}
              {!venueSettings && (
                <div className="mt-6 bg-forest/8 border border-forest/20 border-l-2 border-l-gold p-6">
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
                  {/* Sub-tab toggle */}
                  <div className="flex mb-3 border border-gold/30">
                    <button
                      onClick={() => { setLeadsSubTab("new"); setSelectedLead(null); }}
                      className={`flex-1 font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1.5 transition-colors ${
                        leadsSubTab === "new" ? "bg-forest-dark text-cream" : "text-ink/60 hover:bg-gold/10"
                      }`}>
                      NEW ENQUIRIES
                      {newEnquiries.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-dm font-semibold ${
                          leadsSubTab === "new" ? "bg-gold text-forest-dark" : "bg-forest/20 text-forest"
                        }`}>{newEnquiries.length}</span>
                      )}
                    </button>
                    <button
                      onClick={() => { setLeadsSubTab("all"); setSelectedLead(null); }}
                      className={`flex-1 font-bebas tracking-widest text-xs py-2 flex items-center justify-center gap-1.5 transition-colors ${
                        leadsSubTab === "all" ? "bg-forest-dark text-cream" : "text-ink/60 hover:bg-gold/10"
                      }`}>
                      ALL LEADS
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-dm font-semibold ${
                        leadsSubTab === "all" ? "bg-gold text-forest-dark" : "bg-forest/20 text-forest"
                      }`}>{repliedLeads.length}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-cormorant text-2xl font-semibold text-ink">{leadsSubTab === "new" ? "New Enquiries" : "Leads"}</h2>
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
                      <button onClick={() => setLocation(`/runsheet?leadId=${selectedLead.id}`)}
                        className="border-2 border-burgundy text-burgundy font-bebas tracking-widest text-xs px-4 py-2 flex items-center gap-1 hover:bg-burgundy hover:text-cream transition-all">
                        <Clock className="w-3 h-3" /> CREATE RUNSHEET
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete enquiry from ${selectedLead.firstName} ${selectedLead.lastName ?? ''}? This cannot be undone.`)) {
                            deleteLead.mutate({ id: selectedLead.id });
                          }
                        }}
                        className="border-2 border-red-300 text-red-500 font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1 hover:bg-red-50 transition-all ml-auto">
                        <Trash2 className="w-3 h-3" /> DELETE
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
                  {/* Enquiry Source */}
                  <div className="dante-card p-4 mb-4">
                    <h3 className="font-bebas text-xs tracking-widest text-sage mb-3">ENQUIRY SOURCE</h3>
                    <Select
                      value={selectedLead.source ?? ""}
                      onValueChange={(v) => updateLeadSource.mutate({ id: selectedLead.id, source: v })}
                    >
                      <SelectTrigger className="rounded-none border border-gold/30 focus:ring-0 font-dm text-sm">
                        <SelectValue placeholder="Select source…" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Instagram","Facebook","Google Search","Website","Word of Mouth / Referral","Walk-In","Event Directory","Previous Client","lead_form","express_book","Other"].map(s => (
                          <SelectItem key={s} value={s}>{s === "lead_form" ? "Lead Form" : s === "express_book" ? "Express Book" : s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    const hasLeadEvent = leadEventDays.has(day);
                    const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                    // Find bookings and lead events for this day
                    const dayBookings = (monthBookings ?? []).filter((b: any) => new Date(b.eventDate).getDate() === day);
                    const dayLeads = (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getDate() === day);
                    const bgClass = hasBooking
                      ? "bg-forest/10 border-forest"
                      : hasLeadEvent
                      ? "bg-rose-50 border-rose-400"
                      : hasFollowUp
                      ? "bg-gold/10 border-gold"
                      : isToday
                      ? "border-gold bg-gold/5"
                      : "border-transparent hover:bg-linen";
                    const textClass = hasBooking
                      ? "text-forest font-bold"
                      : hasLeadEvent
                      ? "text-rose-700 font-semibold"
                      : hasFollowUp
                      ? "text-amber-700 font-semibold"
                      : isToday
                      ? "text-ink font-semibold"
                      : "text-foreground";
                    const isClickable = hasBooking || hasLeadEvent;
                    return (
                      <div
                        key={day}
                        title={dayBookings.length > 0
                          ? dayBookings.map((b: any) => `${b.firstName} ${b.lastName ?? ''} — ${b.eventType ?? 'Event'} (${b.status})`).join('\n')
                          : dayLeads.length > 0
                          ? dayLeads.map((l: any) => `${l.firstName} ${l.lastName ?? ''} — ${l.eventType ?? 'Enquiry'} (${l.status})`).join('\n')
                          : undefined}
                        onClick={() => {
                          if (dayBookings.length > 0) {
                            // scroll to booking in the list below
                            document.getElementById(`booking-${dayBookings[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                          } else if (dayLeads.length > 0) {
                            setSelectedLead(dayLeads[0]);
                            setTab('leads');
                          }
                        }}
                        className={`relative min-h-[52px] flex flex-col p-1 text-sm font-dm border transition-colors ${bgClass} ${isClickable ? 'cursor-pointer' : ''}`}
                      >
                        <span className={`${textClass} text-xs leading-none mb-0.5`}>{day}</span>
                        {dayBookings.slice(0, 2).map((b: any) => (
                          <div key={b.id} className="text-[9px] leading-tight font-dm text-forest bg-forest/10 px-0.5 rounded truncate w-full">
                            {b.firstName} {b.lastName ? b.lastName[0] + '.' : ''}
                          </div>
                        ))}
                        {dayLeads.slice(0, 1).map((l: any) => (
                          <div key={l.id} className="text-[9px] leading-tight font-dm text-rose-700 bg-rose-50 px-0.5 rounded truncate w-full">
                            {l.firstName} {l.lastName ? l.lastName[0] + '.' : ''}
                          </div>
                        ))}
                        {(dayBookings.length + dayLeads.length) > 2 && (
                          <div className="text-[9px] text-ink/40">+{dayBookings.length + dayLeads.length - 2} more</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gold/15 text-xs font-dm flex-wrap">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-forest/10 border border-forest" /><span>Booking</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-rose-50 border border-rose-400" /><span>Enquiry / Lead</span></div>
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
                      <div id={`booking-${b.id}`} key={b.id} className="dante-card p-4 flex items-center justify-between hover:bg-gold/5 transition-colors cursor-pointer"
                        onClick={() => setSelectedBooking(b)}>
                        <div>
                          <button
                            onClick={e => { e.stopPropagation(); setLocation(`/event/${b.id}`); }}
                            className="font-cormorant font-semibold text-base text-ink hover:text-forest hover:underline text-left">
                            {b.firstName} {b.lastName}
                          </button>
                          <div className="font-dm text-xs text-ink/60">
                            {b.eventType || "Event"} · {new Date(b.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}
                            {b.guestCount ? ` · ${b.guestCount} guests` : ""}
                          </div>
                          <div className={`font-bebas text-xs tracking-widest mt-1 ${
                            b.status === 'confirmed' ? 'text-emerald-600' : b.status === 'tentative' ? 'text-amber-600' : 'text-stone-400'
                          }`}>{b.status?.toUpperCase()}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          {b.totalNzd && <div className="font-cormorant text-xl font-semibold text-forest">${Number(b.totalNzd).toLocaleString()}</div>}
                          <div className={`font-bebas text-xs tracking-widest ${b.depositPaid ? "text-emerald-600" : "text-gold"}`}>
                            {b.depositPaid ? "DEPOSIT PAID" : "DEPOSIT PENDING"}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={e => { e.stopPropagation(); setLocation(`/event/${b.id}`); }}
                              className="font-bebas tracking-widest text-xs border border-forest/40 text-forest px-2 py-1 hover:bg-forest hover:text-cream transition-all flex items-center gap-1">
                              OPEN
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setLocation(`/runsheet?bookingId=${b.id}`); }}
                              className="font-bebas tracking-widest text-xs border border-burgundy/40 text-burgundy px-2 py-1 hover:bg-burgundy hover:text-cream transition-all flex items-center gap-1">
                              <Clock className="w-3 h-3" /> RUNSHEET
                            </button>
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
              {/* This month's lead events */}
              {(monthLeadEvents ?? []).length > 0 && (
                <div className="mt-6 max-w-2xl">
                  <h2 className="font-cormorant text-xl font-semibold text-ink mb-3">This Month's Enquiries &amp; Leads</h2>
                  <div className="space-y-2">
                    {(monthLeadEvents ?? []).map((lead: any) => {
                      const eventDate = new Date(lead.eventDate);
                      const statusColors: Record<string, string> = {
                        new: 'text-amber-700', contacted: 'text-sky-700', proposal_sent: 'text-forest',
                        negotiating: 'text-orange-600', booked: 'text-emerald-700', lost: 'text-stone-500', cancelled: 'text-stone-400',
                      };
                      return (
                        <button key={lead.id}
                          onClick={() => { setSelectedLead(lead); setTab('leads'); }}
                          className="w-full dante-card p-4 flex items-center justify-between hover:bg-rose-50/50 transition-colors text-left">
                          <div>
                            <div className="font-cormorant font-semibold text-base text-ink">{lead.firstName} {lead.lastName}</div>
                            <div className="font-dm text-xs text-ink/60">{lead.eventType || 'Enquiry'} · {lead.guestCount ? `${lead.guestCount} guests · ` : ''}{lead.email}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bebas text-xs tracking-widest ${statusColors[lead.status] ?? 'text-ink'}`}>
                              {lead.status?.replace('_', ' ').toUpperCase()}
                            </div>
                            <div className="font-dm text-xs text-ink/50">
                              {eventDate.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
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
          {/* ── BOOKING SLIDE-OUT PANEL ─────────────────────────────────────── */}
          {selectedBooking && (
            <div className="fixed inset-0 z-50 flex">
              {/* Backdrop */}
              <div className="flex-1 bg-black/40" onClick={() => setSelectedBooking(null)} />
              {/* Drawer */}
              <div className="w-full max-w-md bg-cream border-l border-gold/20 flex flex-col h-full overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="bg-forest-dark px-5 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-bebas tracking-widest text-xs text-gold mb-0.5">EVENT DETAILS</div>
                    <div className="font-cormorant text-cream font-semibold text-lg">{selectedBooking.firstName} {selectedBooking.lastName}</div>
                  </div>
                  <button onClick={() => setSelectedBooking(null)} className="text-cream/60 hover:text-cream">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Body */}
                <div className="p-5 space-y-5 flex-1">
                  {/* Status + Type */}
                  <div className="flex items-center gap-2">
                    <span className={`font-bebas text-xs tracking-widest px-2 py-1 border ${
                      selectedBooking.status === 'confirmed' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                      : selectedBooking.status === 'tentative' ? 'text-amber-600 bg-amber-50 border-amber-200'
                      : 'text-stone-500 bg-stone-50 border-stone-200'
                    }`}>{selectedBooking.status?.toUpperCase()}</span>
                    {selectedBooking.eventType && <span className="font-dm text-xs text-ink/60">{selectedBooking.eventType}</span>}
                  </div>
                  {/* Key Details */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Calendar className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-bebas text-xs tracking-widest text-ink/40">DATE</div>
                        <div className="font-dm text-sm text-ink">
                          {new Date(selectedBooking.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </div>
                        {selectedBooking.eventEndDate && (
                          <div className="font-dm text-xs text-ink/50">
                            until {new Date(selectedBooking.eventEndDate).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                    </div>
                    {selectedBooking.guestCount && (
                      <div className="flex items-start gap-3">
                        <Users className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-bebas text-xs tracking-widest text-ink/40">GUESTS</div>
                          <div className="font-dm text-sm text-ink">{selectedBooking.guestCount}</div>
                        </div>
                      </div>
                    )}
                    {selectedBooking.spaceName && (
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-bebas text-xs tracking-widest text-ink/40">SPACE</div>
                          <div className="font-dm text-sm text-ink">{selectedBooking.spaceName}</div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <Mail className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-bebas text-xs tracking-widest text-ink/40">EMAIL</div>
                        <div className="font-dm text-sm text-ink">{selectedBooking.email}</div>
                      </div>
                    </div>
                  </div>
                  {/* Financials */}
                  <div className="bg-forest-dark/5 border border-gold/20 p-4">
                    <div className="font-bebas text-xs tracking-widest text-ink/40 mb-3">FINANCIALS</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="font-bebas text-xs tracking-widest text-ink/40">TOTAL</div>
                        <div className="font-cormorant text-xl font-semibold text-ink">${Number(selectedBooking.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <div className="font-bebas text-xs tracking-widest text-ink/40">DEPOSIT</div>
                        <div className="font-cormorant text-xl font-semibold text-ink">${Number(selectedBooking.depositNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    <div className={`mt-2 font-bebas text-xs tracking-widest ${
                      selectedBooking.depositPaid ? 'text-emerald-600' : 'text-amber-600'
                    }`}>{selectedBooking.depositPaid ? '✓ DEPOSIT PAID' : '⚠ DEPOSIT PENDING'}</div>
                  </div>
                  {/* Quick Actions */}
                  <div>
                    <div className="font-bebas text-xs tracking-widest text-ink/40 mb-2">QUICK ACTIONS</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/event/${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                        <FileText className="w-3 h-3 text-gold" /> OPEN EVENT
                      </button>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/runsheet?bookingId=${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                        <Clock className="w-3 h-3 text-gold" /> RUNSHEET
                      </button>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/floor-plan?bookingId=${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs">
                        <LayoutGrid className="w-3 h-3" /> FLOOR PLAN
                      </button>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/checklist?bookingId=${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs">
                        <CheckCircle className="w-3 h-3" /> CHECKLIST
                      </button>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/payments?bookingId=${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs col-span-2">
                        <DollarSign className="w-3 h-3" /> PAYMENTS
                      </button>
                    </div>
                  </div>
                  {selectedBooking.notes && (
                    <div>
                      <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">NOTES</div>
                      <div className="font-dm text-sm text-ink/80 whitespace-pre-wrap bg-cream border border-gold/20 p-3">{selectedBooking.notes}</div>
                    </div>
                  )}
                </div>
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
              {/* Checklist Templates */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-cormorant text-xl font-semibold text-ink">Staff Checklist Templates</h2>
                  <button onClick={() => setShowChecklistForm(v => !v)}
                    className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1">
                    <Plus className="w-3 h-3" /> {showChecklistForm ? 'CANCEL' : 'NEW TEMPLATE'}
                  </button>
                </div>
                <p className="font-dm text-xs text-sage mb-4">Create reusable event-day checklists. Assign them to bookings to generate event-specific task lists for your staff.</p>

                {showChecklistForm && (
                  <div className="dante-card p-5 mb-4 space-y-3">
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TEMPLATE NAME *</label>
                      <Input required value={checklistForm.name} onChange={e => setChecklistForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Wedding Reception Setup" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
                      <Input value={checklistForm.description} onChange={e => setChecklistForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Brief description of when to use this template" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CHECKLIST ITEMS (one per line) *</label>
                      <Textarea value={checklistForm.items} onChange={e => setChecklistForm(f => ({ ...f, items: e.target.value }))}
                        placeholder={"Set up tables and chairs\nPrepare bar station\nCheck AV equipment\nBriefing with staff\nWelcome guests"}
                        rows={6} className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm font-dm" />
                      <p className="font-dm text-xs text-sage mt-1">Each line becomes a separate checkbox item.</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!checklistForm.name || !checklistForm.items.trim()) { toast.error('Name and items are required'); return; }
                        const items = checklistForm.items.split('\n').map(s => s.trim()).filter(Boolean).map((text, i) => ({ id: String(i + 1), text }));
                        createChecklistTemplate.mutate({ name: checklistForm.name, description: checklistForm.description || undefined, items });
                      }}
                      disabled={createChecklistTemplate.isPending}
                      className="btn-forest font-bebas tracking-widest text-xs px-6 py-2 text-cream disabled:opacity-50">
                      {createChecklistTemplate.isPending ? 'SAVING...' : 'SAVE TEMPLATE'}
                    </button>
                  </div>
                )}

                {(checklistTemplates ?? []).length === 0 && !showChecklistForm ? (
                  <div className="border border-dashed border-gold/20 p-6 text-center">
                    <p className="font-dm text-sage text-sm">No checklist templates yet. Create one to assign to bookings.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(checklistTemplates ?? []).map((t: any) => {
                      const items = Array.isArray(t.items) ? t.items : [];
                      return (
                        <div key={t.id} className="dante-card p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-cormorant font-semibold text-base text-ink">{t.name}</div>
                              {t.description && <div className="font-dm text-xs text-ink/60 mt-0.5">{t.description}</div>}
                              <div className="font-dm text-xs text-sage mt-1">{items.length} item{items.length !== 1 ? 's' : ''}</div>
                              <div className="mt-2 space-y-1">
                                {items.slice(0, 5).map((item: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <div className="w-3.5 h-3.5 border border-sage/40 flex-shrink-0" />
                                    <span className="font-dm text-xs text-ink/70">{item.text}</span>
                                  </div>
                                ))}
                                {items.length > 5 && <div className="font-dm text-xs text-sage">+{items.length - 5} more items...</div>}
                              </div>
                            </div>
                            <button onClick={() => { if (confirm('Delete this template?')) deleteChecklistTemplate.mutate({ id: t.id }); }}
                              className="text-sage hover:text-tomato transition-colors ml-4 flex-shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ─── Menus & Floor Plans ─────────────────────────────── */}
              <div className="mt-10">
                <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Menus &amp; Floor Plans</h2>
                {/* Sub-tabs */}
                <div className="flex gap-0 mb-6 border-b border-gold/20">
                  {(["food","bar","floorplans"] as const).map(t => (
                    <button key={t} onClick={() => setSettingsFoodTab(t)}
                      className={`font-bebas tracking-widest text-xs px-5 py-2 border-b-2 transition-colors ${
                        settingsFoodTab === t ? "border-forest text-forest" : "border-transparent text-ink/50 hover:text-ink"
                      }`}>
                      {t === "food" ? "FOOD MENU" : t === "bar" ? "DRINKS MENU" : "FLOOR PLANS"}
                    </button>
                  ))}
                </div>

                {/* Food Menu */}
                {settingsFoodTab === "food" && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-dm text-sm text-ink/60">Manage your food packages and items. Full editor available in <button onClick={() => setLocation('/menu')} className="text-forest underline">Menu Management</button>.</p>
                    </div>
                    {(menuPackages ?? []).length === 0 ? (
                      <div className="border border-dashed border-gold/20 p-6 text-center">
                        <p className="font-dm text-sage text-sm">No food packages yet.</p>
                        <button onClick={() => setLocation('/menu')} className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream mt-3 inline-block">CREATE FOOD PACKAGE</button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(menuPackages ?? []).map((pkg: any) => (
                          <div key={pkg.id} className="dante-card p-4 flex items-center justify-between">
                            <div>
                              <div className="font-cormorant font-semibold text-base text-ink">{pkg.name}</div>
                              <div className="font-dm text-xs text-ink/60">
                                {pkg.type} {pkg.pricePerHead ? `· $${Number(pkg.pricePerHead).toFixed(0)}/head` : ""}
                                {pkg.items?.length ? ` · ${pkg.items.length} items` : ""}
                              </div>
                            </div>
                            <button onClick={() => setLocation('/menu')} className="font-bebas tracking-widest text-xs text-forest hover:underline">EDIT</button>
                          </div>
                        ))}
                        <button onClick={() => setLocation('/menu')} className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream mt-2 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> ADD PACKAGE
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Bar / Drinks Menu */}
                {settingsFoodTab === "bar" && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <p className="font-dm text-sm text-ink/60">{(barMenuItemsList ?? []).length} drink{(barMenuItemsList ?? []).length !== 1 ? "s" : ""} on your menu</p>
                      <button onClick={() => { setEditingBarItemId(null); setBarItemForm({ category: "Wine", name: "", description: "", pricePerUnit: "", unit: "per glass" }); setShowBarItemForm(true); }}
                        className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1">
                        <Plus className="w-3 h-3" /> ADD DRINK
                      </button>
                    </div>

                    {showBarItemForm && (
                      <div className="dante-card p-5 mb-4">
                        <h3 className="font-bebas tracking-widest text-sm text-ink mb-3">{editingBarItemId ? "EDIT DRINK" : "ADD DRINK"}</h3>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CATEGORY</label>
                            <select value={barItemForm.category} onChange={e => setBarItemForm(f => ({ ...f, category: e.target.value }))}
                              className="w-full border border-border px-3 py-2 font-dm text-sm text-ink bg-white">
                              {["Wine","Beer","Spirits","Cocktails","Non-Alcoholic","Champagne","Other"].map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="font-bebas text-xs tracking-widest text-sage block mb-1">NAME *</label>
                            <Input value={barItemForm.name} onChange={e => setBarItemForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="Sauvignon Blanc" className="rounded-none border border-gold/30" />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
                          <Input value={barItemForm.description} onChange={e => setBarItemForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Marlborough, NZ" className="rounded-none border border-gold/30" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div>
                            <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PRICE</label>
                            <Input type="number" value={barItemForm.pricePerUnit} onChange={e => setBarItemForm(f => ({ ...f, pricePerUnit: e.target.value }))}
                              placeholder="12.00" className="rounded-none border border-gold/30" />
                          </div>
                          <div>
                            <label className="font-bebas text-xs tracking-widest text-sage block mb-1">UNIT</label>
                            <select value={barItemForm.unit} onChange={e => setBarItemForm(f => ({ ...f, unit: e.target.value }))}
                              className="w-full border border-border px-3 py-2 font-dm text-sm text-ink bg-white">
                              {["per glass","per bottle","per jug","per person","per hour"].map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => {
                            if (!barItemForm.name.trim()) return toast.error("Name required");
                            if (editingBarItemId) {
                              updateBarItem.mutate({ id: editingBarItemId, category: barItemForm.category, name: barItemForm.name, description: barItemForm.description || undefined, pricePerUnit: barItemForm.pricePerUnit ? parseFloat(barItemForm.pricePerUnit) : undefined, unit: barItemForm.unit });
                            } else {
                              addBarItem.mutate({ category: barItemForm.category, name: barItemForm.name, description: barItemForm.description || undefined, pricePerUnit: barItemForm.pricePerUnit ? parseFloat(barItemForm.pricePerUnit) : undefined, unit: barItemForm.unit });
                            }
                          }} className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream">
                            {editingBarItemId ? "UPDATE" : "ADD"}
                          </button>
                          <button onClick={() => { setShowBarItemForm(false); setEditingBarItemId(null); }} className="font-bebas tracking-widest text-xs px-4 py-2 border border-border text-ink/60 hover:text-ink">CANCEL</button>
                        </div>
                      </div>
                    )}

                    {(barMenuItemsList ?? []).length === 0 && !showBarItemForm ? (
                      <div className="border border-dashed border-gold/20 p-6 text-center">
                        <Wine className="w-8 h-8 text-gold/40 mx-auto mb-2" />
                        <p className="font-dm text-sage text-sm">No drinks on your menu yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(
                          (barMenuItemsList ?? []).reduce((acc: Record<string, any[]>, item: any) => {
                            (acc[item.category] = acc[item.category] || []).push(item);
                            return acc;
                          }, {})
                        ).map(([cat, items]) => (
                          <div key={cat}>
                            <div className="font-bebas tracking-widest text-xs text-sage mb-1 mt-3">{cat}</div>
                            {(items as any[]).map((item: any) => (
                              <div key={item.id} className="dante-card p-3 flex items-center justify-between mb-1">
                                <div>
                                  <div className="font-cormorant font-semibold text-sm text-ink">{item.name}</div>
                                  {item.description && <div className="font-dm text-xs text-ink/50">{item.description}</div>}
                                  {item.pricePerUnit && <div className="font-dm text-xs text-forest">${Number(item.pricePerUnit).toFixed(2)} {item.unit}</div>}
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => { setEditingBarItemId(item.id); setBarItemForm({ category: item.category, name: item.name, description: item.description ?? "", pricePerUnit: item.pricePerUnit ? String(item.pricePerUnit) : "", unit: item.unit ?? "per glass" }); setShowBarItemForm(true); }}
                                    className="text-ink/40 hover:text-forest"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => deleteBarItem.mutate({ id: item.id })} className="text-ink/40 hover:text-tomato"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Floor Plans */}
                {settingsFoodTab === "floorplans" && (
                  <div>
                    <p className="font-dm text-sm text-ink/60 mb-4">Create and manage reusable floor plan layouts for your spaces. Open the full floor plan builder to design a new layout.</p>
                    <button onClick={() => setLocation('/floor-plan')} className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4" /> OPEN FLOOR PLAN BUILDER
                    </button>
                    <p className="font-dm text-xs text-ink/40 mt-3">Floor plans are saved per event in the Floor Plan Builder. You can access them from any booking's Event Detail page.</p>
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
