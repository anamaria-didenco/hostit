import React, { useState, useMemo, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard, Users, FileText, Calendar, Settings, ChevronLeft, ChevronRight, ChevronDown,
  Plus, Search, ExternalLink, MessageSquare, TrendingUp, CheckCircle, Clock, Copy,
  ChefHat, UtensilsCrossed, Wine, Trash2, Pencil, Mail, Send,
  BarChart2, DollarSign, X, MapPin, LayoutGrid, Camera, Eye, Grid, Image as ImageIcon, Edit2,
  ArrowUpDown
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { substituteTemplateVars, TEMPLATE_VARIABLES } from "@/lib/templateVars";
import { DashboardWidgets } from "@/components/DashboardWidgets";
import TasksPage from "@/pages/Tasks";
import ReportsPage from "@/pages/Reports";
import FloorPlanEditor, { type CanvasData } from "@/components/FloorPlanEditor";

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
  { key: "booked", label: "CONFIRMED", color: "border-emerald-500 bg-emerald-50 text-emerald-700" },
  { key: "lost", label: "LOST", color: "border-stone-400 bg-stone-50 text-stone-500" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Overview Widget Sub-Components ──────────────────────────────────────────────

function MiniCalendarWidget({ month, year, firstDay, daysInMonth, monthBookings, monthLeadEvents, onPrev, onNext, onDayClick, onViewCalendar, onCreateEvent }: {
  month: number; year: number; firstDay: number; daysInMonth: number;
  monthBookings: any; monthLeadEvents: any;
  onPrev: () => void; onNext: () => void;
  onDayClick: (dayBookings: any[], dayLeads: any[]) => void;
  onViewCalendar: () => void;
  onCreateEvent?: (date: string) => void;
}) {
  const [showLegend, setShowLegend] = React.useState(true);
  const [startDay, setStartDay] = React.useState<0 | 1>(0); // 0=Sun, 1=Mon
  const [showSettings, setShowSettings] = React.useState(false);

  // Reorder days based on startDay
  const DAY_LABELS_SUN = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const DAY_LABELS_MON = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
  const dayLabels = startDay === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN;

  // Adjust firstDay offset for Monday start
  const adjustedFirstDay = startDay === 1 ? (firstDay === 0 ? 6 : firstDay - 1) : firstDay;

  return (
    <div className="dante-card shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-gold/15">
        <button onClick={onPrev} className="p-1 hover:text-gold transition-colors"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex items-center gap-2">
          <h2 className="font-cormorant text-lg font-semibold text-ink">{MONTHS[month]} {year}</h2>
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`p-1 transition-colors ${showSettings ? 'text-gold' : 'text-ink/30 hover:text-ink/60'}`}
            title="Calendar settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
        <button onClick={onNext} className="p-1 hover:text-gold transition-colors"><ChevronRight className="w-4 h-4" /></button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-gold/15 bg-linen/50 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bebas tracking-widest text-[10px] text-ink/50">START WEEK ON</span>
            <div className="flex">
              <button
                onClick={() => setStartDay(0)}
                className={`font-bebas tracking-widest text-xs px-2.5 py-1 border transition-colors ${
                  startDay === 0 ? 'bg-forest text-cream border-forest' : 'border-gold/30 text-sage hover:border-forest hover:text-forest'
                }`}
              >SUN</button>
              <button
                onClick={() => setStartDay(1)}
                className={`font-bebas tracking-widest text-xs px-2.5 py-1 border border-l-0 transition-colors ${
                  startDay === 1 ? 'bg-forest text-cream border-forest' : 'border-gold/30 text-sage hover:border-forest hover:text-forest'
                }`}
              >MON</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bebas tracking-widest text-[10px] text-ink/50">LEGEND</span>
            <button
              onClick={() => setShowLegend(v => !v)}
              className={`font-bebas tracking-widest text-xs px-2.5 py-1 border transition-colors ${
                showLegend ? 'bg-forest text-cream border-forest' : 'border-gold/30 text-sage hover:border-forest hover:text-forest'
              }`}
            >
              {showLegend ? 'VISIBLE' : 'HIDDEN'}
            </button>
          </div>
        </div>
      )}

      {showLegend && (
        <div className="flex items-center gap-4 px-4 pt-3 pb-1 flex-wrap">
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Confirmed</span>
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Tentative</span>
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-stone-400 inline-block" />Cancelled</span>
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />Enquiry</span>
        </div>
      )}
      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {dayLabels.map(d => (
            <div key={d} className="text-center font-bebas text-[10px] tracking-widest text-ink/50 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {[...Array(adjustedFirstDay)].map((_, i) => <div key={`e-${i}`} />)}
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
            const isEmpty = dayBookings.length === 0 && dayLeads.length === 0;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            return (
              <div
                key={day}
                onClick={() => {
                  if (!isEmpty) {
                    onDayClick(dayBookings, dayLeads);
                  } else if (onCreateEvent) {
                    onCreateEvent(dateStr);
                  }
                }}
                className={`group relative min-h-[44px] flex flex-col p-1 border transition-colors ${cellBg} ${(!isEmpty || onCreateEvent) ? 'cursor-pointer' : ''} ${isEmpty && onCreateEvent ? 'hover:bg-forest/5 hover:border-forest/30' : ''}`}
              >
                <span className={`text-[11px] font-dm leading-none mb-0.5 ${isToday ? 'font-bold text-gold' : 'text-ink/70'}`}>{day}</span>
                {/* + icon shown on empty cells when onCreateEvent is wired */}
                {isEmpty && onCreateEvent && (
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="w-3.5 h-3.5 text-forest/60" />
                  </span>
                )}
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

// ── Settings Sidebar (Perfect Venue style) ─────────────────────────────────
function SettingsSidebar({ settingsSubTab, setSettingsSubTab, venueName, venueLogoUrl }: {
  settingsSubTab: string;
  setSettingsSubTab: (t: any) => void;
  venueName?: string;
  venueLogoUrl?: string;
}) {
  const items = [
    { id: "venue-details", label: "Venue Details" },
    { id: "venue-profile", label: "Venue Profile" },
    { id: "spaces", label: "Spaces" },
    { id: "lead-form", label: "Contact Form" },
    { id: "integrations", label: "Integrations" },
    { id: "menu", label: "Menu" },
    { id: "templates", label: "Proposal" },
    { id: "email", label: "Email" },
    { id: "automated-tasks", label: "Automated Tasks" },
    { id: "taxes", label: "Taxes & Fees" },
    { id: "team", label: "Team" },
    { id: "billing", label: "Billing" },
    { id: "floor-plans", label: "Floor Plans" },
    { id: "group-contact-form", label: "Group Contact Form" },
    { id: "group-settings", label: "Group Settings" },
    { id: "profile", label: "Profile" },
  ];
  const currentLabel = items.find(i => i.id === settingsSubTab)?.label ?? 'Settings';
  return (
    <>
      {/* Mobile: dropdown selector */}
      <div className="md:hidden border-b border-border bg-white px-4 py-3">
        <select
          value={settingsSubTab}
          onChange={e => setSettingsSubTab(e.target.value as any)}
          className="w-full font-inter text-sm border border-border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sage-green/40"
        >
          {items.map(item => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>
      {/* Desktop: sidebar */}
      <aside className="hidden md:flex w-52 bg-ivory-sand border-r border-border flex-shrink-0 flex-col">
        {/* Venue logo + name */}
        <div className="px-4 py-4 flex items-center gap-3 border-b border-border">
          <div className="w-10 h-10 rounded-full bg-sage-tint border border-sage-green/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {venueLogoUrl ? (
              <img src={venueLogoUrl} alt="logo" className="w-full h-full object-cover" />
            ) : (
              <span className="font-bebas text-sage-dark text-sm">{(venueName ?? 'V').charAt(0)}</span>
            )}
          </div>
          <span className="font-dm text-sm font-semibold text-ink truncate">{venueName ?? 'Your Venue'}</span>
        </div>
        <div className="flex-1 overflow-auto py-2">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => setSettingsSubTab(item.id as any)}
              className={`w-full text-left px-4 py-2 font-dm text-sm transition-colors ${
                settingsSubTab === item.id
                  ? "bg-sage-tint text-sage-dark font-semibold border-l-2 border-sage-green pl-[calc(1rem-2px)]"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-l-2 border-transparent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"overview"|"enquiries"|"pipeline"|"calendar"|"contacts"|"menu"|"settings"|"tasks"|"reports"|"expressbook">("overview");
  const [settingsSubTab, setSettingsSubTab] = useState<"venue-details"|"venue-profile"|"spaces"|"lead-form"|"integrations"|"expressbook"|"menu"|"templates"|"email"|"automated-tasks"|"taxes"|"team"|"billing"|"group-contact-form"|"group-settings"|"profile"|"email-settings"|"floor-plans">("venue-details");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [leadsSubTab, setLeadsSubTab] = useState<"new" | "all">("new");
  const [leadSortBy, setLeadSortBy] = useState<"enquiry_date"|"event_date"|"status">("enquiry_date");
  const [leadSortDir, setLeadSortDir] = useState<"desc"|"asc">("desc");
  const [eventSortBy, setEventSortBy] = useState<"event_date"|"date_booked"|"status">("event_date");
  const [eventSortDir, setEventSortDir] = useState<"asc"|"desc">("asc");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [calDate, setCalDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month'|'week'|'day'|'list'>('month');
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [spaceForm, setSpaceForm] = useState({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" });
  const [showEditSpace, setShowEditSpace] = useState(false);
  const [editingSpace, setEditingSpace] = useState<any>(null);
  const [editSpaceForm, setEditSpaceForm] = useState({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" });
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [quickCreateDate, setQuickCreateDate] = useState<string | null>(null);
  const [quickCreateForm, setQuickCreateForm] = useState({ firstName: '', lastName: '', eventType: '', guestCount: '', notes: '', status: 'new' as 'new' | 'contacted' | 'booked' });
  const [widgetEditMode, setWidgetEditMode] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(["stats", "calendar", "enquiries", "pipeline"]);
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(new Set());
  const [widgetSizes, setWidgetSizes] = useState<Record<string, 'half' | 'full'>>({});
  const [collapsedInboxSections, setCollapsedInboxSections] = useState<Set<string>>(new Set());
  const [showAddLead, setShowAddLead] = useState(false);
  const [addEnquiryForm, setAddEnquiryForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', eventType: '', eventDate: '', guestCount: '', budget: '', message: '', status: 'new' as const });

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
  const { data: monthLeadEvents, refetch: refetchMonthLeadEvents } = trpc.leads.eventsByMonth.useQuery(
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
      if (layout?.widgetSizes) setWidgetSizes(layout.widgetSizes);
    }
  }, [userPrefs]);
  const saveLayout = trpc.userPreferences.save.useMutation();

  function handleWidgetOrderChange(newOrder: string[]) {
    setWidgetOrder(newOrder);
    saveLayout.mutate({ widgetOrder: newOrder, hiddenWidgets: Array.from(hiddenWidgets), widgetSizes });
  }
  function handleToggleHidden(id: string) {
    setHiddenWidgets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveLayout.mutate({ widgetOrder: widgetOrder, hiddenWidgets: Array.from(next), widgetSizes });
      return next;
    });
  }
  function handleToggleWidgetSize(id: string) {
    setWidgetSizes(prev => {
      const current = prev[id] ?? 'half';
      const next = { ...prev, [id]: current === 'half' ? 'full' as const : 'half' as const };
      saveLayout.mutate({ widgetOrder, hiddenWidgets: Array.from(hiddenWidgets), widgetSizes: next });
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
  const createRunsheet = trpc.runsheets.create.useMutation({
    onSuccess: (data) => {
      toast.success('Runsheet created!');
      setLocation(`/runsheet?runsheetId=${data.id}`);
    },
    onError: () => toast.error('Failed to create runsheet'),
  });
  const deleteBooking = trpc.bookings.delete.useMutation({
    onSuccess: () => {
      setSelectedBooking(null);
      utils.bookings.list.invalidate();
      utils.bookings.byMonth.invalidate();
      toast.success('Event deleted');
    },
    onError: () => toast.error('Failed to delete event'),
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
  const markRead = trpc.leads.markRead.useMutation({
    onSuccess: (_data, vars) => {
      // Update the local lead list so the badge count drops immediately
      utils.leads.list.invalidate();
    },
  });

  // Helper: select a lead and mark it as read
  function selectLead(lead: any) {
    setSelectedLead(lead);
    // Note: selectLead is defined below; this is the inner implementation
    if (lead && !lead.readAt) {
      markRead.mutate({ id: lead.id });
    }
  }

  const createEnquiry = trpc.leads.create.useMutation({
    onSuccess: () => {
      refetchLeads();
      setShowAddLead(false);
      setAddEnquiryForm({ firstName: '', lastName: '', email: '', phone: '', company: '', eventType: '', eventDate: '', guestCount: '', budget: '', message: '', status: 'new' });
      toast.success('Enquiry added!');
    },
    onError: () => toast.error('Failed to add enquiry'),
  });
  const createEnquiryFromCalendar = trpc.leads.create.useMutation({
    onSuccess: () => {
      refetchLeads();
      refetchMonthLeadEvents();
      setQuickCreateDate(null);
      setQuickCreateForm({ firstName: '', lastName: '', eventType: '', guestCount: '', notes: '', status: 'new' });
      toast.success('Event added to calendar!');
    },
    onError: () => toast.error('Failed to create event'),
  });
  const updateSettings = trpc.venue.update.useMutation({
    onSuccess: () => { refetchSettings(); toast.success("Settings saved!"); },
  });
  const createSpace = trpc.spaces.create.useMutation({
    onSuccess: () => { refetchSpaces(); setShowAddSpace(false); setSpaceForm({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" }); toast.success("Space added!"); },
  });
  const updateSpace = trpc.spaces.update.useMutation({
    onSuccess: () => { refetchSpaces(); setShowEditSpace(false); setEditingSpace(null); toast.success("Space updated!"); },
  });
  const deleteSpace = trpc.spaces.delete.useMutation({
    onSuccess: () => { refetchSpaces(); toast.success("Space deleted!"); },
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

  // Menu Sections & Sales Categories (for Settings > Menu)
  const { data: menuSectionsList, refetch: refetchMenuSections } = trpc.menuSections.list.useQuery(undefined, { enabled: !!user?.id && settingsSubTab === 'menu' });
  const { data: salesCategoriesList, refetch: refetchSalesCategories } = trpc.salesCategories.list.useQuery(undefined, { enabled: !!user?.id && settingsSubTab === 'menu' });
  const [menuSettingsTab, setMenuSettingsTab] = useState<'sections'|'categories'|'items'>('sections');
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionForm, setSectionForm] = useState({ name: '', salesCategory: '', hasSalesTax: true, hasAdminFee: true, hasGratuity: true, applyToMin: true });
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const createMenuSection = trpc.menuSections.create.useMutation({ onSuccess: () => { refetchMenuSections(); setShowSectionForm(false); setSectionForm({ name: '', salesCategory: '', hasSalesTax: true, hasAdminFee: true, hasGratuity: true, applyToMin: true }); toast.success('Section added!'); } });
  const deleteMenuSection = trpc.menuSections.delete.useMutation({ onSuccess: () => { refetchMenuSections(); toast.success('Section deleted'); } });
  const createSalesCategory = trpc.salesCategories.create.useMutation({ onSuccess: () => { refetchSalesCategories(); setShowCategoryForm(false); setCategoryForm({ name: '' }); toast.success('Category added!'); } });
  const deleteSalesCategory = trpc.salesCategories.delete.useMutation({ onSuccess: () => { refetchSalesCategories(); toast.success('Category deleted'); } });

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

  // ── Floor Plans state ──────────────────────────────────────────────────
  const [editingFloorPlan, setEditingFloorPlan] = useState<any>(null); // null = list view, object = editor
  const { data: floorPlansList, refetch: refetchFloorPlans } = trpc.floorPlans.list.useQuery(
    {},
    { enabled: !!user?.id && settingsSubTab === 'floor-plans' }
  );
  const saveFloorPlan = trpc.floorPlans.save.useMutation({
    onSuccess: (result) => {
      refetchFloorPlans();
      // Update the editing plan with the returned id (for new plans)
      if (editingFloorPlan && !editingFloorPlan.id && result) {
        setEditingFloorPlan((prev: any) => ({ ...prev, id: (result as any).insertId ?? prev.id }));
      }
      toast.success('Floor plan saved!');
    },
    onError: () => toast.error('Failed to save floor plan'),
  });
  const deleteFloorPlan = trpc.floorPlans.delete.useMutation({
    onSuccess: () => { refetchFloorPlans(); toast.success('Floor plan deleted'); },
    onError: () => toast.error('Failed to delete floor plan'),
  });

  const [settingsForm, setSettingsForm] = useState<any>(null);
  useMemo(() => {
    if (!settingsForm) {
      const vs = venueSettings as any;
      setSettingsForm({
        name: vs?.name ?? "",
        tagline: vs?.tagline ?? "",
        description: vs?.description ?? "",
        address: vs?.address ?? "",
        city: vs?.city ?? "",
        phone: vs?.phone ?? "",
        email: vs?.email ?? "",
        website: vs?.website ?? "",
        leadFormTitle: vs?.leadFormTitle ?? "Book Your Event",
        leadFormSubtitle: vs?.leadFormSubtitle ?? "",
        depositPercent: vs?.depositPercent ?? "25",
        slug: vs?.slug ?? "",
        // New venue details fields
        internalName: vs?.internalName ?? "",
        notificationEmail: vs?.notificationEmail ?? "",
        addressLine1: vs?.addressLine1 ?? "",
        addressLine2: vs?.addressLine2 ?? "",
        suburb: vs?.suburb ?? "",
        state: vs?.state ?? "",
        postcode: vs?.postcode ?? "",
        country: vs?.country ?? "New Zealand",
        timezone: vs?.timezone ?? "Pacific/Auckland",
        eventTimeStart: vs?.eventTimeStart ?? "08:00",
        eventTimeEnd: vs?.eventTimeEnd ?? "22:00",
        minGroupSize: vs?.minGroupSize ?? 0,
        autoCancelTentative: vs?.autoCancelTentative ?? 1,
        // Venue profile fields
        bannerImageUrl: vs?.bannerImageUrl ?? "",
        venueType: vs?.venueType ?? "",
        priceCategory: vs?.priceCategory ?? "$$$",
        aboutVenue: vs?.aboutVenue ?? "",
        minEventDuration: vs?.minEventDuration ?? "1 hour",
        maxEventDuration: vs?.maxEventDuration ?? "6 hours",
        minLeadTime: vs?.minLeadTime ?? "1 week",
        maxLeadTime: vs?.maxLeadTime ?? "6 months",
        bufferTime: vs?.bufferTime ?? "30 minutes",
        primaryColor: vs?.primaryColor ?? "#2D4A3E",
        themeKey: vs?.themeKey ?? "sage",
        logoUrl: vs?.logoUrl ?? "",
        coverImageUrl: vs?.coverImageUrl ?? "",
        operatingHours: vs?.operatingHours ?? JSON.stringify([
          { day: "Sunday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Monday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Tuesday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Wednesday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Thursday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Friday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Saturday", enabled: true, start: "08:00", end: "22:00" },
        ]),
      });
    }
   }, [venueSettings]);

  // Apply colour theme from venue settings
  useEffect(() => {
    const themeKey = (venueSettings as any)?.themeKey ?? 'sage';
    document.documentElement.setAttribute('data-theme', themeKey);
  }, [venueSettings]);

  // Confirmed statuses are treated as Events (shown on Calendar), not Enquiries
  const CONFIRMED_STATUSES = ['booked', 'confirmed'];
  const activeEnquiries = (allLeads ?? []).filter((l: any) => !CONFIRMED_STATUSES.includes(l.status));
  const newEnquiries = activeEnquiries.filter((l: any) => l.status === "new");
  const unreadCount = newEnquiries.filter((l: any) => !l.readAt).length;
  const repliedLeads = activeEnquiries.filter((l: any) => l.status !== "new");
  // When a specific status filter is active, show all active enquiries from the server (don't re-filter by leadsSubTab)
  const leadsToShow = leadStatusFilter !== "all"
    ? activeEnquiries
    : leadsSubTab === "new" ? newEnquiries : repliedLeads;
  const filteredLeads = leadsToShow
    .filter((l: any) =>
      !leadSearch || `${l.firstName} ${l.lastName} ${l.email} ${l.company ?? ""}`.toLowerCase().includes(leadSearch.toLowerCase())
    )
    .slice()
    .sort((a: any, b: any) => {
      let cmp = 0;
      if (leadSortBy === 'enquiry_date') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (leadSortBy === 'event_date') {
        const aDate = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const bDate = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        cmp = aDate - bDate;
      } else if (leadSortBy === 'status') {
        const order = ['new','contacted','proposal_sent','site_visit','negotiating','booked','confirmed','lost','cancelled'];
        cmp = (order.indexOf(a.status) ?? 99) - (order.indexOf(b.status) ?? 99);
      }
      return leadSortDir === 'asc' ? cmp : -cmp;
    });

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="font-cormorant text-3xl text-forest/30 animate-pulse italic">Loading...</div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center max-w-sm w-full mx-4">
        <div className="mb-8">
          <div className="flex items-center justify-center mb-4">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
              alt="HOSTit"
              className="h-12 w-auto object-contain"
              style={{ filter: 'brightness(0)' }}
            />
          </div>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Event CRM for NZ Venues</p>
        </div>
        <h2 className="font-inter text-2xl text-gray-900 font-700 mb-2" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>Sign in to your dashboard</h2>
        <p className="font-inter text-gray-500 text-sm mb-8">Manage event enquiries, build proposals, and track bookings — all in one place.</p>
        <a href={getLoginUrl()}>
          <button className="btn-forest w-full text-sm py-3 text-white">
            Sign In
          </button>
        </a>
        <div className="mt-6 border-t border-gray-100 pt-6">
          <p className="font-inter text-xs text-gray-400 mb-3">Looking to enquire about an event?</p>
          <Link href="/enquire">
            <button className="btn-terra-outline w-full text-xs py-2.5">
              Submit an Enquiry
            </button>
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-inter flex flex-col">
      {/* ── TOP NAVIGATION BAR ──────────────────────────────────────────────── */}
      <nav className="bg-white sticky top-0 z-50 border-b border-border h-14 flex items-center px-4" style={{ boxShadow: '0 1px 0 oklch(0.850 0.025 68)' }}>
        {/* Logo */}
        <div className="flex items-center pr-5 border-r border-border mr-4 flex-shrink-0">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
            alt="HOSTit"
            className="h-7 w-auto object-contain"
            style={{ filter: 'brightness(0)' }}
          />
        </div>
        {/* Primary nav tabs — hidden on mobile (shown in bottom bar instead) */}
        <div className="hidden md:flex items-center">
          {[
            { id: "overview", label: "Home" },
            { id: "enquiries", label: "Enquiries" },
            { id: "calendar", label: "Calendar" },
            { id: "tasks", label: "Tasks" },
            { id: "reports", label: "Reports" },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id as any)}
              className={`h-14 px-4 font-inter text-sm transition-colors border-b-2 flex-shrink-0 relative ${
                tab === item.id
                  ? "text-sage-dark border-sage-green font-semibold"
                  : "text-gray-400 border-transparent hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {item.label}
              {item.id === "enquiries" && unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          ))}
          {/* Settings */}
          <button
            onClick={() => setTab("settings" as any)}
            className={`h-14 px-4 font-inter text-sm transition-colors border-b-2 flex-shrink-0 ${
              tab === "settings"
                ? "text-sage-dark border-sage-green font-semibold"
                : "text-gray-400 border-transparent hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Settings
          </button>
        </div>
        {/* Mobile: current tab label */}
        <div className="md:hidden flex-1 text-center">
          <span className="font-inter text-sm font-semibold text-sage-dark">
            {tab === "overview" ? "Home" : tab === "enquiries" ? "Enquiries" : tab === "calendar" ? "Calendar" : tab === "tasks" ? "Tasks" : tab === "reports" ? "Reports" : "Settings"}
          </span>
        </div>
        {/* Spacer (desktop only) */}
        <div className="hidden md:flex flex-1" />
        {/* Right: venue name + avatar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-inter text-stormy text-sm hidden md:block">{venueSettings?.name ?? "Your Venue"}</span>
          <div className="w-8 h-8 rounded-full bg-sage-green flex items-center justify-center font-inter text-white text-sm font-semibold">
            {(user?.name ?? "U").charAt(0).toUpperCase()}
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* No sidebar — full-width main content */}

        {/* Main Content */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="flex flex-col min-h-full md:h-full md:overflow-hidden">
              {/* Stats bar */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
                {[
                  { label: "New Enquiries", value: stats?.newLeads ?? 0, sub: "awaiting reply", iconBg: "bg-sage-tint", iconColor: "text-sage-dark", icon: <MessageSquare className="w-4 h-4" /> },
                  { label: "Total Enquiries", value: stats?.totalLeads ?? 0, sub: "all time", iconBg: "bg-gray-100", iconColor: "text-gray-500", icon: <Users className="w-4 h-4" /> },
                  { label: "Proposals Sent", value: stats?.proposalsSent ?? 0, sub: "this period", iconBg: "bg-sage-tint", iconColor: "text-sage-green", icon: <FileText className="w-4 h-4" /> },
                  { label: "Bookings This Month", value: stats?.bookingsThisMonth ?? 0, sub: `$${(stats?.revenueThisMonth ?? 0).toLocaleString()} NZD`, iconBg: "bg-sage-tint", iconColor: "text-sage-dark", icon: <CheckCircle className="w-4 h-4" /> },
                  { label: "Overdue Follow-ups", value: stats?.overdueFollowUps ?? 0, sub: (stats?.overdueFollowUps ?? 0) > 0 ? "action required" : "all clear", iconBg: (stats?.overdueFollowUps ?? 0) > 0 ? "bg-red-100" : "bg-gray-100", iconColor: (stats?.overdueFollowUps ?? 0) > 0 ? "text-red-600" : "text-gray-400", icon: <Clock className="w-4 h-4" /> },
                ].map(s => (
                  <div key={s.label} className="stat-card py-3">
                    <div className={`w-8 h-8 rounded-lg ${s.iconBg} ${s.iconColor} flex items-center justify-center mb-2`}>{s.icon}</div>
                    <div className="font-inter text-2xl text-gray-900" style={{ fontWeight: 700 }}>{s.value}</div>
                    <div className="font-inter text-xs font-semibold text-gray-500 leading-tight">{s.label}</div>
                    <div className="font-inter text-xs text-gray-400 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Main area: full calendar + sidebar */}
              <div className="flex flex-col md:flex-row flex-1 overflow-auto md:overflow-hidden">

                {/* Full Calendar */}
                <div className="flex-1 flex flex-col overflow-hidden md:border-r border-border">
                  {/* Calendar toolbar */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-white flex-shrink-0">
                    <button onClick={() => setCalDate(new Date(year, month - 1, 1))} className="p-1.5 hover:bg-sage-tint rounded-lg transition-colors text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => setCalDate(new Date(year, month + 1, 1))} className="p-1.5 hover:bg-sage-tint rounded-lg transition-colors text-gray-500"><ChevronRight className="w-4 h-4" /></button>
                    <h2 className="font-inter font-semibold text-gray-900 text-base flex-1" style={{ letterSpacing: '-0.02em' }}>{MONTHS[month]} {year}</h2>
                    <button onClick={() => setCalDate(new Date())} className="font-inter text-xs font-medium px-3 py-1.5 border border-border rounded-lg text-gray-500 hover:bg-sage-tint hover:text-sage-dark transition-colors">Today</button>
                    <button
                      onClick={() => { setAddEnquiryForm(f => ({ ...f })); setShowAddLead(true); }}
                      className="flex items-center gap-1.5 font-inter text-xs font-semibold px-3 py-1.5 bg-sage-green text-white rounded-lg hover:bg-sage-dark transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add Event
                    </button>
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border bg-gray-50 flex-shrink-0">
                    <span className="flex items-center gap-1.5 font-inter text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-sage-green inline-block" />Confirmed</span>
                    <span className="flex items-center gap-1.5 font-inter text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Tentative</span>
                    <span className="flex items-center gap-1.5 font-inter text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />Proposal</span>
                    <span className="flex items-center gap-1.5 font-inter text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />Enquiry</span>
                    <span className="flex items-center gap-1.5 font-inter text-xs text-gray-500"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />Cancelled</span>
                  </div>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
                    {["MON","TUE","WED","THU","FRI","SAT","SUN"].map(d => (
                      <div key={d} className={`text-center font-inter text-xs font-semibold py-2 border-r border-border last:border-r-0 ${
                        d === 'SAT' || d === 'SUN' ? 'text-sage-green bg-sage-tint/30' : 'text-gray-400'
                      }`}>{d}</div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div className="flex-1 overflow-auto">
                    {(() => {
                      const firstDayOfMonth = new Date(year, month, 1).getDay();
                      const mondayOffset = (firstDayOfMonth + 6) % 7;
                      const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
                      const cells = Array.from({ length: totalCells }, (_, i) => {
                        const dayNum = i - mondayOffset + 1;
                        return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
                      });
                      const weeks = [];
                      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                      const numWeeks = weeks.length;
                      return weeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0" style={{ minHeight: `${Math.floor(100 / numWeeks)}%` }}>
                          {week.map((day, di) => {
                            if (!day) return <div key={di} className="border-r border-border last:border-r-0 bg-gray-50/50" />;
                            const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                            const isWeekend = di >= 5;
                            const dayBookings = (monthBookings ?? []).filter((b: any) => new Date(b.eventDate).getDate() === day);
                            const dayLeads = (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getDate() === day);
                            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                            const statusColor = (status: string) => {
                              switch(status) {
                                case 'confirmed': case 'booked': return 'bg-sage-green text-white';
                                case 'tentative': return 'bg-amber-400 text-white';
                                case 'proposal_sent': return 'bg-violet-400 text-white';
                                case 'negotiating': return 'bg-orange-400 text-white';
                                case 'new': return 'bg-rose-400 text-white';
                                case 'contacted': return 'bg-rose-300 text-white';
                                case 'cancelled': case 'lost': return 'bg-gray-300 text-gray-600';
                                default: return 'bg-gray-200 text-gray-600';
                              }
                            };
                            return (
                              <div key={di}
                                className={`group border-r border-border last:border-r-0 flex flex-col p-1.5 gap-0.5 min-h-[90px] ${
                                  isWeekend ? 'bg-sage-tint/10' : 'bg-white'
                                } ${isToday ? 'ring-2 ring-inset ring-sage-green' : ''} hover:bg-sage-tint/20 transition-colors`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className={`font-inter text-xs font-semibold leading-none ${
                                    isToday ? 'w-5 h-5 bg-sage-green text-white rounded-full flex items-center justify-center text-[10px]' : isWeekend ? 'text-sage-dark' : 'text-gray-600'
                                  }`}>{day}</span>
                                  <button
                                    onClick={() => { setQuickCreateDate(dateStr); setQuickCreateForm({ firstName: '', lastName: '', eventType: '', guestCount: '', notes: '', status: 'new' }); }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-sage-tint rounded"
                                    title="Add event">
                                    <Plus className="w-3 h-3 text-sage-green" />
                                  </button>
                                </div>
                                {dayBookings.slice(0, 3).map((b: any) => (
                                  <button key={b.id}
                                    onClick={() => { setSelectedBooking(b); setTab('calendar'); }}
                                    className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight font-inter font-medium truncate ${statusColor(b.status)} hover:opacity-80 transition-opacity`}
                                    title={`${b.firstName} ${b.lastName ?? ''} — ${b.eventType ?? 'Event'} — ${b.status}`}>
                                    {b.eventType || b.firstName || 'Event'}
                                  </button>
                                ))}
                                {dayLeads.slice(0, 2).map((l: any) => (
                                  <button key={l.id}
                                    onClick={() => { selectLead(l); setTab('enquiries'); }}
                                    className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight font-inter font-medium truncate ${statusColor(l.status)} hover:opacity-80 transition-opacity`}
                                    title={`${l.firstName} ${l.lastName ?? ''} — ${l.eventType ?? 'Enquiry'} — ${l.status}`}>
                                    {l.eventType || l.firstName || 'Enquiry'}
                                  </button>
                                ))}
                                {(dayBookings.length + dayLeads.length) > 4 && (
                                  <span className="font-inter text-[9px] text-gray-400 px-1">+{dayBookings.length + dayLeads.length - 4} more</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Right sidebar: upcoming events + new enquiries */}
                <div className="w-full md:w-72 flex-shrink-0 flex flex-col md:overflow-hidden bg-white border-t md:border-t-0 border-border">
                  {/* Upcoming confirmed events */}
                  <div className="flex-1 overflow-auto border-b border-border">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <h3 className="font-inter text-sm font-semibold text-gray-900">Upcoming Events</h3>
                      <button onClick={() => setTab('calendar')} className="font-inter text-xs text-sage-green hover:text-sage-dark transition-colors">View all</button>
                    </div>
                    {(() => {
                      const upcoming = [...(monthBookings ?? []), ...(monthLeadEvents ?? []).filter((l: any) => l.status === 'booked' || l.status === 'confirmed')]
                        .filter((e: any) => new Date(e.eventDate) >= new Date())
                        .sort((a: any, b: any) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
                        .slice(0, 8);
                      if (upcoming.length === 0) return (
                        <div className="flex flex-col items-center justify-center p-6 text-center">
                          <Calendar className="w-8 h-8 text-gray-200 mb-2" />
                          <p className="font-inter text-xs text-gray-400">No upcoming events this month</p>
                        </div>
                      );
                      return (
                        <div className="divide-y divide-border">
                          {upcoming.map((e: any) => {
                            const isConfirmed = e.status === 'confirmed' || e.status === 'booked';
                            return (
                              <button key={e.id}
                                onClick={() => e._type === 'booking' ? setLocation(`/event/${e.id}`) : (setSelectedLead(e), setTab('enquiries'))}
                                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-sage-tint/30 transition-colors text-left">
                                <div className={`w-1.5 h-full min-h-[36px] rounded-full flex-shrink-0 mt-0.5 ${
                                  isConfirmed ? 'bg-sage-green' : e.status === 'tentative' ? 'bg-amber-400' : e.status === 'proposal_sent' ? 'bg-violet-400' : 'bg-rose-400'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-inter text-xs font-semibold text-gray-900 truncate">{e.firstName} {e.lastName}</div>
                                  <div className="font-inter text-xs text-gray-500 truncate">{e.eventType || (isConfirmed ? 'Event' : 'Enquiry')}</div>
                                  <div className="font-inter text-xs text-gray-400">{new Date(e.eventDate).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}{e.guestCount ? ` · ${e.guestCount} guests` : ''}</div>
                                </div>
                                <span className={`font-inter text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                                  isConfirmed ? 'bg-sage-tint text-sage-dark' : e.status === 'tentative' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                                }`}>{isConfirmed ? 'CONFIRMED' : e.status?.replace('_',' ').toUpperCase()}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* New enquiries */}
                  <div className="flex-1 overflow-auto">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <h3 className="font-inter text-sm font-semibold text-gray-900">New Enquiries</h3>
                        {newEnquiries.length > 0 && (
                          <span className="bg-sage-green text-white font-inter text-[10px] font-bold px-1.5 py-0.5 rounded-full">{newEnquiries.length}</span>
                        )}
                      </div>
                      <button onClick={() => { setLeadsSubTab('new'); setTab('enquiries'); }} className="font-inter text-xs text-sage-green hover:text-sage-dark transition-colors">View all</button>
                    </div>
                    {newEnquiries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center">
                        <CheckCircle className="w-8 h-8 text-sage-green/30 mb-2" />
                        <p className="font-inter text-xs text-gray-400">All caught up!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {newEnquiries.slice(0, 6).map((lead: any) => (
                          <button key={lead.id} onClick={() => { selectLead(lead); setLeadsSubTab('new'); setTab('enquiries'); }}
                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-sage-tint/30 transition-colors text-left">
                            <div className="w-2 h-2 rounded-full bg-rose-400 mt-1.5 flex-shrink-0 animate-pulse" />
                            <div className="flex-1 min-w-0">
                              <div className="font-inter text-xs font-semibold text-gray-900">{lead.firstName} {lead.lastName}</div>
                              <div className="font-inter text-xs text-gray-500 truncate">{lead.eventType || 'Event'}{lead.guestCount ? ` · ${lead.guestCount} guests` : ''}</div>
                              {lead.eventDate && <div className="font-inter text-xs text-gray-400">{new Date(lead.eventDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</div>}
                            </div>
                            <div className="font-inter text-[10px] text-gray-400 flex-shrink-0">
                              {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : ''}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {(overdueLeads ?? []).length > 0 && (
                      <div className="border-t border-red-200 bg-red-50/50 px-4 py-2 flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="font-inter text-xs font-semibold text-red-700">{(overdueLeads ?? []).length} overdue follow-up{(overdueLeads ?? []).length > 1 ? 's' : ''}</span>
                        <button onClick={() => setTab('enquiries')} className="ml-auto font-inter text-xs text-red-600 hover:text-red-800 transition-colors">View →</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ENQUIRIES INBOX ──────────────────────────────────────────────────── */}
          {tab === "enquiries" && (
            <div className="flex h-full">
              {/* Lead List */}
              <div className={`${selectedLead ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 lg:w-96 border-r border-gold/15 bg-warm-white flex-shrink-0`}>
                <div className="p-4 border-b border-gold/15">
                  {/* Sub-tab toggle */}
                  <div className="flex mb-3 bg-muted rounded-xl p-1 gap-1">
                    <button
                      onClick={() => { setLeadsSubTab("new"); setSelectedLead(null); }}
                      className={`flex-1 font-inter text-xs font-medium py-1.5 flex items-center justify-center gap-1.5 transition-colors rounded-lg ${
                        leadsSubTab === "new" ? "bg-white text-ink shadow-sm" : "text-stormy hover:text-ink"
                      }`}>
                      New
                      {newEnquiries.length > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                          leadsSubTab === "new" ? "bg-sage-green text-white" : "bg-gray-200 text-gray-600"
                        }`}>{newEnquiries.length}</span>
                      )}
                    </button>
                    <button
                      onClick={() => { setLeadsSubTab("all"); setSelectedLead(null); }}
                      className={`flex-1 font-inter text-xs font-medium py-1.5 flex items-center justify-center gap-1.5 transition-colors rounded-lg ${
                        leadsSubTab === "all" ? "bg-white text-ink shadow-sm" : "text-stormy hover:text-ink"
                      }`}>
                      All
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                        leadsSubTab === "all" ? "bg-sage-green text-white" : "bg-gray-200 text-gray-600"
                      }`}>{repliedLeads.length}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="font-cormorant text-2xl font-semibold text-ink">{leadsSubTab === "new" ? "New Enquiries" : "Enquiries"}</h2>
                      <button
                        onClick={() => setCollapsedInboxSections(prev => { const n = new Set(prev); n.has(leadsSubTab) ? n.delete(leadsSubTab) : n.add(leadsSubTab); return n; })}
                        className="p-1 text-ink/40 hover:text-ink transition-colors"
                        title={collapsedInboxSections.has(leadsSubTab) ? "Show list" : "Collapse list"}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${collapsedInboxSections.has(leadsSubTab) ? "-rotate-90" : ""}`} />
                      </button>
                    </div>
                    <button
                      onClick={() => { setBulkSelectMode(m => !m); setSelectedLeadIds(new Set()); }}
                      className={`font-bebas text-xs tracking-widest px-2.5 py-1 border transition-colors ${
                        bulkSelectMode ? 'bg-forest text-cream border-forest' : 'border-gold/40 text-ink/60 hover:border-gold hover:text-ink'
                      }`}>
                      {bulkSelectMode ? 'CANCEL' : 'SELECT'}
                    </button>
                  </div>
                  {/* Add Enquiry button */}
                  <button
                    onClick={() => setShowAddLead(true)}
                    className="w-full mb-2 bg-sage-green text-white font-inter font-medium text-sm py-2 rounded-xl flex items-center justify-center gap-1.5 hover:bg-sage-dark transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Enquiry
                  </button>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/60" />
                    <Input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                      placeholder="Search enquiries..." className="pl-9 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold text-sm" />
                  </div>
                  <Select value={leadStatusFilter} onValueChange={(v) => {
                    setLeadStatusFilter(v);
                    // When filtering by a specific status, switch to "all" sub-tab so results aren't hidden
                    if (v !== "all") setLeadsSubTab("all");
                  }}>
                    <SelectTrigger className={`rounded-xl border text-xs font-inter font-medium focus:ring-1 focus:ring-sage-green/40 transition-colors ${
                      leadStatusFilter !== "all"
                        ? "border-sage-green bg-sage-green/10 text-sage-dark"
                        : "border-gray-200 bg-white text-ink"
                    }`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="font-inter text-xs">All Statuses</SelectItem>
                      {PIPELINE_STAGES.map(s => (
                        <SelectItem key={s.key} value={s.key} className="font-inter text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Sort controls */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <Select value={leadSortBy} onValueChange={(v: any) => setLeadSortBy(v)}>
                      <SelectTrigger className="flex-1 rounded-xl border border-gray-200 bg-white text-xs font-inter font-medium focus:ring-1 focus:ring-sage-green/40 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enquiry_date" className="font-inter text-xs">Enquiry Date</SelectItem>
                        <SelectItem value="event_date" className="font-inter text-xs">Event Date</SelectItem>
                        <SelectItem value="status" className="font-inter text-xs">Status</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setLeadSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                      className="flex-shrink-0 h-8 w-8 flex items-center justify-center border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors"
                      title={leadSortDir === 'asc' ? 'Ascending' : 'Descending'}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-ink/60" />
                    </button>
                  </div>
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
                {!collapsedInboxSections.has(leadsSubTab) && <div className="flex-1 overflow-auto divide-y divide-border/40">
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
                    <button onClick={() => { if (!bulkSelectMode) selectLead(lead); }}
                      className={`flex-1 p-4 text-left hover:bg-linen transition-colors ${!bulkSelectMode && selectedLead?.id === lead.id ? "bg-forest/5 border-l-2 border-gold" : "border-l-2 border-transparent"}`}>
                      <div className="flex items-start justify-between mb-1">
                        <div className="font-cormorant font-semibold text-base text-ink truncate">{lead.firstName} {lead.lastName}</div>
                        <div className={`font-bebas text-xs tracking-widest px-1.5 py-0.5 border flex-shrink-0 ml-2 ${PIPELINE_STAGES.find(s => s.key === lead.status)?.color ?? "bg-muted border-border"}`}>
                          {lead.status === 'booked' ? 'CONFIRMED' : lead.status.replace(/_/g, " ").toUpperCase()}
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
                </div>}
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
                <div className="flex-1 overflow-auto p-4 md:p-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <button onClick={() => setSelectedLead(null)} className="md:hidden font-inter font-medium text-sm text-sage-dark flex items-center gap-1 py-1 pr-2">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="flex-1">
                      <h2 className="font-cormorant text-ink" style={{ fontSize: '1.8rem', fontWeight: 600 }}>{selectedLead.firstName} {selectedLead.lastName}</h2>
                      <div className="font-dm text-sm text-sage">{selectedLead.email}{selectedLead.phone ? ` · ${selectedLead.phone}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                      {selectedLead.email && (
                        <button onClick={() => {
                          setEmailForm({ subject: `Re: Your event enquiry — ${selectedLead.eventType || 'Event'}`, body: `Hi ${selectedLead.firstName},\n\nThank you for your enquiry. ` });
                          setShowEmailModal(true);
                        }}
                          className="border border-sage-green text-sage-dark font-inter font-medium text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-sage-green/10 transition-all">
                          <Mail className="w-3.5 h-3.5" /> Email
                        </button>
                      )}
                      <button onClick={() => setLocation(`/proposals/new?leadId=${selectedLead.id}`)}
                        className="bg-sage-green text-white font-inter font-medium text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-sage-dark transition-all">
                        <FileText className="w-3.5 h-3.5" /> Create Proposal
                      </button>
                      {['booked','confirmed'].includes(selectedLead.status) ? (
                        <button
                          onClick={() => {
                            const eventDate = selectedLead.eventDate ? new Date(selectedLead.eventDate).toISOString().slice(0,10) : undefined;
                            const guestCount = selectedLead.guestCount ? Number(selectedLead.guestCount) : undefined;
                            const eventType = selectedLead.eventType || 'Event';
                            const defaultItems = [
                              { time: '09:00', duration: 30, title: 'Venue Setup', description: 'Tables, chairs, decorations', assignedTo: 'FOH Team', category: 'Setup', sortOrder: 0 },
                              { time: '10:00', duration: 60, title: 'Kitchen Prep', description: 'Food preparation and mise en place', assignedTo: 'Kitchen', category: 'Kitchen', sortOrder: 1 },
                              { time: '17:00', duration: 30, title: 'Guest Arrival', description: 'Welcome drinks and seating', assignedTo: 'FOH', category: 'Service', sortOrder: 2 },
                              { time: '17:30', duration: 90, title: 'Entrée Service', description: 'First course service', assignedTo: 'FOH', category: 'Service', sortOrder: 3 },
                              { time: '19:00', duration: 90, title: 'Main Course', description: 'Main course service', assignedTo: 'FOH', category: 'Service', sortOrder: 4 },
                              { time: '20:30', duration: 60, title: 'Dessert & Coffee', description: 'Dessert service and tea/coffee', assignedTo: 'FOH', category: 'Service', sortOrder: 5 },
                              { time: '21:30', duration: 60, title: 'Pack Down', description: 'Clear tables, clean venue', assignedTo: 'All Staff', category: 'Cleanup', sortOrder: 6 },
                            ];
                            createRunsheet.mutate({
                              title: `${eventType} — ${selectedLead.firstName} ${selectedLead.lastName ?? ''}`,
                              leadId: selectedLead.id,
                              eventDate,
                              guestCount,
                              eventType,
                              items: defaultItems,
                            });
                          }}
                          disabled={createRunsheet.isPending}
                          className="border border-sage-green text-sage-dark font-inter font-medium text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-sage-green/10 transition-all disabled:opacity-50">
                          <Clock className="w-3.5 h-3.5" /> {createRunsheet.isPending ? 'Creating...' : 'Generate Runsheet'}
                        </button>
                      ) : (
                        <button onClick={() => setLocation(`/runsheet?leadId=${selectedLead.id}`)}
                          className="border border-gray-300 text-gray-600 font-inter font-medium text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-gray-50 transition-all">
                          <Clock className="w-3.5 h-3.5" /> Runsheet
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Delete enquiry from ${selectedLead.firstName} ${selectedLead.lastName ?? ''}? This cannot be undone.`)) {
                            deleteLead.mutate({ id: selectedLead.id });
                          }
                        }}
                        className="border border-red-200 text-red-400 font-inter font-medium text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-red-50 transition-all ml-auto">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {/* Event Details */}
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                      <h3 className="font-inter text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Event Details</h3>
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
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                      <h3 className="font-inter text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline Status</h3>
                      {/* Confirm Booking CTA */}
                      {!['booked','confirmed'].includes(selectedLead.status) && (
                        <button
                          onClick={() => updateStatus.mutate({ id: selectedLead.id, status: 'booked' as any })}
                          className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-sage-green text-white rounded-xl font-inter text-sm font-semibold hover:bg-sage-dark transition-colors shadow-sm">
                          <CheckCircle className="w-4 h-4" />
                          Confirm Booking → Move to Calendar
                        </button>
                      )}
                      {['booked','confirmed'].includes(selectedLead.status) && (
                        <div className="w-full mb-3 flex flex-col gap-2">
                          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-sage-tint border border-sage-green rounded-xl font-inter text-sm font-semibold text-sage-dark">
                            <CheckCircle className="w-4 h-4 text-sage-green" />
                            Confirmed Event — visible on Calendar
                          </div>
                          <button
                            onClick={() => { setTab('calendar' as any); setSelectedLead(null); }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-sage-green/40 text-sage-dark rounded-xl font-inter text-xs font-medium hover:bg-sage-tint transition-colors">
                            <Calendar className="w-3.5 h-3.5" /> View on Calendar
                          </button>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {PIPELINE_STAGES.map(stage => (
                          <button key={stage.key}
                            onClick={() => updateStatus.mutate({ id: selectedLead.id, status: stage.key as any })}
                            className={`w-full text-left px-3 py-2 rounded-lg border font-inter text-xs font-medium transition-all ${
                              selectedLead.status === stage.key
                                ? 'bg-sage-green/10 border-sage-green text-sage-dark'
                                : 'border-gray-100 text-gray-500 hover:border-sage-green/40 hover:bg-sage-green/5'
                            }`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${selectedLead.status === stage.key ? 'bg-sage-green' : 'bg-gray-300'}`} />
                            {stage.label}
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
                          <div key={lead.id} onClick={() => { selectLead(lead); setTab("enquiries"); }}
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
            <div className="flex flex-col h-full overflow-hidden">
              {/* Calendar Toolbar */}
              <div className="flex items-center gap-2 px-3 md:px-6 py-3 border-b border-gold/15 bg-cream flex-shrink-0">
                <button onClick={() => setCalDate(new Date(year, month - 1, 1))} className="p-1.5 hover:bg-linen border border-gold/20 text-forest transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setCalDate(new Date(year, month + 1, 1))} className="p-1.5 hover:bg-linen border border-gold/20 text-forest transition-colors"><ChevronRight className="w-4 h-4" /></button>
                <button onClick={() => setCalDate(new Date())} className="hidden sm:block font-bebas tracking-widest text-xs px-3 py-1.5 border border-gold/30 text-ink/70 hover:bg-linen transition-colors">TODAY</button>
                <h2 className="font-cormorant text-base md:text-xl font-semibold text-ink flex-1">{MONTHS[month]} {year}</h2>
                {/* View switcher — hidden on mobile */}
                <div className="hidden sm:flex border border-gold/30">
                  {(["month","week","day","list"] as const).map(v => (
                    <button key={v}
                      onClick={() => setCalendarView(v)}
                      className={`font-bebas tracking-widest text-xs px-3 py-1.5 transition-colors ${
                        calendarView === v ? 'bg-forest-dark text-cream' : 'text-ink/60 hover:bg-linen'
                      }`}>{v.toUpperCase()}</button>
                  ))}
                </div>
                <button onClick={() => setShowAddLead(true)}
                  className="btn-forest text-cream font-bebas tracking-widest text-xs px-3 md:px-4 py-1.5 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">ADD EVENT</span><span className="sm:hidden">ADD</span>
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 px-4 md:px-6 py-2 border-b border-gold/10 bg-linen/40 text-xs font-dm flex-shrink-0 overflow-x-auto">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-500 rounded-sm" /><span>Confirmed</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-sky-400 rounded-sm" /><span>Tentative</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-amber-300 rounded-sm" /><span>Enquiry / Lead</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-violet-400 rounded-sm" /><span>Proposal Sent</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-rose-400 rounded-sm" /><span>Negotiating</span></div>
              </div>

              {/* Month View */}
              {calendarView === "month" && (
              <div className="flex-1 overflow-auto">
                {/* Day headers - Mon to Sun like Function Tracker */}
                <div className="grid grid-cols-7 border-b border-gold/15">
                  {["MON","TUE","WED","THU","FRI","SAT","SUN"].map(d => (
                    <div key={d} className={`text-center font-bebas text-xs tracking-widest py-2 border-r border-gold/10 last:border-r-0 ${
                      d === 'SAT' || d === 'SUN' ? 'text-forest/70 bg-linen/30' : 'text-ink/60'
                    }`}>{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                {(() => {
                  // Build weeks array (Mon-Sun)
                  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun
                  const mondayOffset = (firstDayOfMonth + 6) % 7; // offset from Monday
                  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
                  const cells = Array.from({ length: totalCells }, (_, i) => {
                    const dayNum = i - mondayOffset + 1;
                    return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
                  });
                  const weeks = [];
                  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                  return weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 border-b border-gold/10 last:border-b-0" style={{ minHeight: '120px' }}>
                      {week.map((day, di) => {
                        if (!day) return <div key={di} className="border-r border-gold/10 last:border-r-0 bg-linen/20" />;
                        const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                        const isWeekend = di >= 5; // Sat=5, Sun=6
                        const dayBookings = (monthBookings ?? []).filter((b: any) => new Date(b.eventDate).getDate() === day);
                        const dayLeads = (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getDate() === day);
                        // Colour helper per status
                        const statusCard = (status: string) => {
                          switch(status) {
                            case 'confirmed': return 'bg-emerald-500 text-white';
                            case 'tentative': return 'bg-sky-400 text-white';
                            case 'proposal_sent': return 'bg-violet-400 text-white';
                            case 'negotiating': return 'bg-rose-400 text-white';
                            case 'new': return 'bg-amber-300 text-amber-900';
                            case 'contacted': return 'bg-amber-400 text-amber-900';
                            case 'booked': return 'bg-emerald-600 text-white';
                            case 'lost': return 'bg-stone-300 text-stone-700';
                            case 'cancelled': return 'bg-stone-200 text-stone-500';
                            default: return 'bg-gold/30 text-ink';
                          }
                        };
                        return (
                          <div key={di} className={`border-r border-gold/10 last:border-r-0 p-1 flex flex-col gap-0.5 ${
                            isWeekend ? 'bg-linen/20' : 'bg-white'
                          } ${isToday ? 'ring-2 ring-inset ring-gold' : ''}`}>
                            <span className={`text-xs font-dm leading-none mb-0.5 self-start px-1 rounded ${
                              isToday ? 'bg-forest-dark text-cream font-bold px-1.5 py-0.5' : isWeekend ? 'text-forest/70 font-semibold' : 'text-ink/70'
                            }`}>{day}</span>
                            {/* Booking cards */}
                            {dayBookings.map((b: any) => (
                              <div key={b.id} className="relative group/card w-full">
                                <button
                                  onClick={() => setLocation(`/event/${b.id}`)}
                                  className={`w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight font-dm truncate ${statusCard(b.status)} hover:opacity-80 transition-opacity`}
                                  title={`${b.firstName} ${b.lastName ?? ''} — ${b.eventType ?? 'Event'} — ${b.status} — ${b.guestCount ?? '?'} guests`}>
                                  <div className="font-semibold truncate">{b.eventType || 'Event'}</div>
                                  {b.startTime && <div className="opacity-80">{b.startTime} – {b.endTime}</div>}
                                  <div className="opacity-80 capitalize">{b.status === 'booked' ? 'Confirmed' : b.status}</div>
                                  {b.guestCount && <div className="opacity-80">Guests {b.guestCount}</div>}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${b.eventType || 'event'} for ${b.firstName}?`)) deleteBooking.mutate({ id: b.id }); }}
                                  className="absolute top-0 right-0 opacity-0 group-hover/card:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center"
                                  title="Delete event">
                                  <X className="w-2 h-2" />
                                </button>
                              </div>
                            ))}
                            {/* Lead/enquiry cards */}
                            {dayLeads.map((l: any) => (
                              <button key={l.id}
                                onClick={() => { selectLead(l); setTab('enquiries'); }}
                                className={`w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight font-dm truncate ${statusCard(l.status)} hover:opacity-80 transition-opacity`}
                                title={`${l.firstName} ${l.lastName ?? ''} — ${l.eventType ?? 'Enquiry'} — ${l.status} — ${l.guestCount ?? '?'} guests`}>
                                <div className="font-semibold truncate">{l.eventType || 'Enquiry'}</div>
                                <div className="opacity-80 capitalize">{l.status?.replace('_',' ')}</div>
                                {l.guestCount && <div className="opacity-80">Guests {l.guestCount}</div>}
                              </button>
                            ))}
                            {/* Edit icon for adding event on this day */}
                            <button
                              onClick={() => { setAddEnquiryForm(f => ({ ...f, eventDate: `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` })); setShowAddLead(true); }}
                              className="self-start mt-auto text-ink/20 hover:text-ink/50 transition-colors p-0.5"
                              title="Add event on this day">
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
              )}

              {/* List View */}
              {calendarView === "list" && (
              <div className="flex-1 overflow-auto p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="font-inter font-semibold text-gray-900 text-lg" style={{ letterSpacing: '-0.02em' }}>All Events — {MONTHS[month]} {year}</h2>
                  <div className="flex items-center gap-2">
                    <Select value={eventSortBy} onValueChange={(v: any) => setEventSortBy(v)}>
                      <SelectTrigger className="h-8 text-xs font-inter border-gray-200 rounded-lg w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="event_date" className="font-inter text-xs">Event Date</SelectItem>
                        <SelectItem value="date_booked" className="font-inter text-xs">Date Booked</SelectItem>
                        <SelectItem value="status" className="font-inter text-xs">Status</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setEventSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                      className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                      title={eventSortDir === 'asc' ? 'Ascending' : 'Descending'}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button onClick={() => setShowAddLead(true)} className="flex items-center gap-1.5 font-inter text-xs font-semibold px-3 py-1.5 bg-sage-green text-white rounded-lg hover:bg-sage-dark transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add Event
                    </button>
                  </div>
                </div>
                {(monthBookings ?? []).length === 0 && (monthLeadEvents ?? []).length === 0 ? (
                  <div className="border border-dashed border-sage-green/20 rounded-xl p-8 text-center">
                    <Calendar className="w-10 h-10 text-sage-green/30 mx-auto mb-3" />
                    <p className="font-inter text-sm text-gray-400">No events this month</p>
                    <button onClick={() => setShowAddLead(true)} className="mt-3 font-inter text-xs font-semibold px-4 py-2 bg-sage-green text-white rounded-lg hover:bg-sage-dark transition-colors">Add Event</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...(monthBookings ?? []).map((b: any) => ({ ...b, _type: 'booking' })), ...(monthLeadEvents ?? []).map((l: any) => ({ ...l, _type: 'lead' }))]
                      .sort((a: any, b: any) => {
                        let cmp = 0;
                        if (eventSortBy === 'event_date') {
                          cmp = new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
                        } else if (eventSortBy === 'date_booked') {
                          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                        } else if (eventSortBy === 'status') {
                          const ord = ['confirmed','booked','tentative','proposal_sent','negotiating','contacted','new','lost','cancelled'];
                          cmp = (ord.indexOf(a.status) ?? 99) - (ord.indexOf(b.status) ?? 99);
                        }
                        return eventSortDir === 'asc' ? cmp : -cmp;
                      })
                      .map((item: any) => {
                        const isConfirmed = item.status === 'confirmed' || item.status === 'booked';
                        const statusConfig: Record<string, { bar: string; badge: string; label: string }> = {
                          confirmed: { bar: 'bg-sage-green', badge: 'bg-sage-tint text-sage-dark', label: 'CONFIRMED' },
                          booked:    { bar: 'bg-sage-green', badge: 'bg-sage-tint text-sage-dark', label: 'CONFIRMED' },
                          tentative: { bar: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700', label: 'TENTATIVE' },
                          proposal_sent: { bar: 'bg-violet-400', badge: 'bg-violet-100 text-violet-700', label: 'PROPOSAL' },
                          negotiating: { bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'NEGOTIATING' },
                          new:       { bar: 'bg-rose-400', badge: 'bg-rose-100 text-rose-700', label: 'NEW ENQUIRY' },
                          contacted: { bar: 'bg-rose-300', badge: 'bg-rose-50 text-rose-600', label: 'CONTACTED' },
                          lost:      { bar: 'bg-gray-300', badge: 'bg-gray-100 text-gray-500', label: 'LOST' },
                          cancelled: { bar: 'bg-gray-200', badge: 'bg-gray-100 text-gray-400', label: 'CANCELLED' },
                        };
                        const sc = statusConfig[item.status] ?? { bar: 'bg-gray-200', badge: 'bg-gray-100 text-gray-500', label: item.status?.toUpperCase() };
                        return (
                          <div key={item.id} className={`flex items-stretch rounded-xl border overflow-hidden transition-all hover:shadow-sm ${
                            isConfirmed ? 'border-sage-green/30 bg-white' : 'border-gray-100 bg-white'
                          }`}>
                            <div className={`w-1 flex-shrink-0 ${sc.bar}`} />
                            <div className="flex-1 p-3 flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-inter font-semibold text-sm text-gray-900">{item.firstName} {item.lastName}</div>
                                <div className="font-inter text-xs text-gray-500 truncate">
                                  {item.eventType || (item._type === 'booking' ? 'Event' : 'Enquiry')}
                                  {' · '}{new Date(item.eventDate).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                                  {item.guestCount ? ` · ${item.guestCount} guests` : ''}
                                  {item.company ? ` · ${item.company}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                <span className={`font-inter text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.badge}`}>
                                  {sc.label}
                                </span>
                                {item._type === 'booking' ? (
                                  <button onClick={() => setLocation(`/event/${item.id}`)} className="font-inter text-xs font-semibold px-3 py-1.5 bg-sage-green text-white rounded-lg hover:bg-sage-dark transition-colors">Open</button>
                                ) : (
                                  <button onClick={() => { setSelectedLead(item); setTab('enquiries'); }} className="font-inter text-xs font-semibold px-3 py-1.5 border border-sage-green/40 text-sage-dark rounded-lg hover:bg-sage-tint transition-colors">View</button>
                                )}
                                {item._type === 'booking' && (
                                  <button
                                    onClick={() => { if (confirm(`Delete ${item.eventType || 'event'} for ${item.firstName}?`)) deleteBooking.mutate({ id: item.id }); }}
                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete event">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
              )}

              {/* Week View (simplified) */}
              {calendarView === "week" && (
              <div className="flex-1 overflow-auto p-6">
                <p className="font-dm text-sm text-ink/60 text-center mt-8">Week view — switch to Month or List for full details.</p>
              </div>
              )}

              {/* Day View (simplified) */}
              {calendarView === "day" && (
              <div className="flex-1 overflow-auto p-6">
                <p className="font-dm text-sm text-ink/60 text-center mt-8">Day view — switch to Month or List for full details.</p>
              </div>
              )}

              <div className="dante-card p-6 max-w-2xl hidden">
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
                            setTab('enquiries');
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
                          onClick={() => { selectLead(lead); setTab('enquiries'); }}
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
                          onClick={() => { selectLead(lead); setTab('enquiries'); }}
                          className="w-full dante-card p-4 flex items-center justify-between hover:bg-rose-50/50 transition-colors text-left">
                          <div>
                            <div className="font-cormorant font-semibold text-base text-ink">{lead.firstName} {lead.lastName}</div>
                            <div className="font-dm text-xs text-ink/60">{lead.eventType || 'Enquiry'} · {lead.guestCount ? `${lead.guestCount} guests · ` : ''}{lead.email}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-bebas text-xs tracking-widest ${statusColors[lead.status] ?? 'text-ink'}`}>
                              {lead.status === 'booked' ? 'CONFIRMED' : lead.status?.replace('_', ' ').toUpperCase()}
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
              {/* Backdrop — hidden on mobile (full-screen drawer) */}
              <div className="hidden md:flex flex-1 bg-black/40" onClick={() => setSelectedBooking(null)} />
              {/* Drawer — full screen on mobile, side panel on desktop */}
              <div className="w-full md:max-w-md bg-cream md:border-l border-gold/20 flex flex-col h-full overflow-y-auto shadow-2xl">
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
                      <button
                        onClick={() => {
                          if (confirm(`Delete event for ${selectedBooking.firstName} ${selectedBooking.lastName ?? ''}? This cannot be undone.`)) {
                            deleteBooking.mutate({ id: selectedBooking.id });
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-400 hover:bg-red-50 transition-colors font-bebas tracking-widest text-xs col-span-2">
                        <Trash2 className="w-3 h-3" /> DELETE EVENT
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

          {/* ── TASKS ─────────────────────────────────────────────────────── */}
          {tab === "tasks" && (
            <div className="flex-1">
              <TasksPage />
            </div>
          )}

          {/* ── REPORTS ─────────────────────────────────────────────────────── */}
          {tab === "reports" && (
            <div className="flex-1">
              <ReportsPage />
            </div>
          )}

          {/* ── EXPRESS BOOK ─────────────────────────────────────────────────── */}
          {tab === "expressbook" && (
            <div className="p-6 max-w-2xl">
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-2">Express Book</h1>
              <p className="font-dm text-sm text-sage mb-6">Allow clients to book directly without going through the enquiry process.</p>
              <div className="dante-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ExternalLink className="w-5 h-5 text-burgundy" />
                  <h2 className="font-cormorant text-xl font-semibold text-ink">Your Express Book Link</h2>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <input readOnly value={`${window.location.origin}/book`}
                    className="flex-1 border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-linen" />
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/book`); toast.success("Link copied!"); }}
                    className="bg-burgundy text-cream font-bebas tracking-widest text-xs px-4 py-2 hover:bg-burg-dark transition-colors flex items-center gap-1">
                    <Copy className="w-3 h-3" /> COPY
                  </button>
                </div>
                <p className="font-dm text-xs text-sage">Share this link on your website, social media, or in emails to let clients book directly.</p>
              </div>
              <div className="mt-4 dante-card p-5">
                <h2 className="font-bebas text-xs tracking-widest text-sage mb-3">PREVIEW</h2>
                <Link href="/book">
                  <button className="bg-burgundy text-cream font-bebas tracking-widest text-xs px-6 py-2.5 hover:bg-burg-dark transition-colors flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> VIEW EXPRESS BOOK FORM
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* ── SETTINGS ─────────────────────────────────────────────────────── */}
          {tab === "settings" && (
            <div className="flex flex-col md:flex-row" style={{ minHeight: 'calc(100vh - 3.5rem)' }}>
              {/* Settings sidebar — like Perfect Venue */}
              <SettingsSidebar settingsSubTab={settingsSubTab} setSettingsSubTab={setSettingsSubTab} venueName={venueSettings?.name ?? user?.name ?? 'Your Venue'} />
              <div className="flex-1 overflow-auto p-4 md:p-8">

              {/* ── VENUE DETAILS ────────────────────────────────── */}
              {settingsSubTab === "venue-details" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Venue Details</h1>
              {settingsForm && (
                <form onSubmit={e => { e.preventDefault(); updateSettings.mutate(settingsForm); }} className="space-y-6">

                  {/* ── Venue Details ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE DETAILS</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">VENUE NAME <span className="text-red-500">*</span></label>
                        <Input value={settingsForm.name} onChange={e => setSettingsForm((f: any) => ({ ...f, name: e.target.value }))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">INTERNAL NAME <span className="text-ink/40 font-dm normal-case text-xs">(e.g. Westside or location)</span></label>
                        <Input value={settingsForm.internalName} onChange={e => setSettingsForm((f: any) => ({ ...f, internalName: e.target.value }))}
                          placeholder="Westside" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">WEBSITE</label>
                        <Input value={settingsForm.website} onChange={e => setSettingsForm((f: any) => ({ ...f, website: e.target.value }))}
                          placeholder="https://yourvenue.co.nz" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">NOTIFICATION EMAIL</label>
                        <Input type="email" value={settingsForm.notificationEmail} onChange={e => setSettingsForm((f: any) => ({ ...f, notificationEmail: e.target.value }))}
                          placeholder="events@yourvenue.co.nz" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                        <p className="font-dm text-xs text-sage/60 mt-1">Add the email address you want to receive all HOSTit notifications.</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Venue Address ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE ADDRESS</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ADDRESS LINE 1</label>
                        <Input value={settingsForm.addressLine1} onChange={e => setSettingsForm((f: any) => ({ ...f, addressLine1: e.target.value }))}
                          placeholder="166 Cashel Street" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ADDRESS LINE 2</label>
                        <Input value={settingsForm.addressLine2} onChange={e => setSettingsForm((f: any) => ({ ...f, addressLine2: e.target.value }))}
                          placeholder="Christchurch Central City" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SUBURB / CITY</label>
                        <Input value={settingsForm.suburb} onChange={e => setSettingsForm((f: any) => ({ ...f, suburb: e.target.value }))}
                          placeholder="Christchurch" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">STATE / REGION</label>
                        <Input value={settingsForm.state} onChange={e => setSettingsForm((f: any) => ({ ...f, state: e.target.value }))}
                          placeholder="Canterbury" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">POSTCODE</label>
                        <Input value={settingsForm.postcode} onChange={e => setSettingsForm((f: any) => ({ ...f, postcode: e.target.value }))}
                          placeholder="8011" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">COUNTRY</label>
                        <Input value={settingsForm.country} onChange={e => setSettingsForm((f: any) => ({ ...f, country: e.target.value }))}
                          placeholder="New Zealand" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                    </div>
                  </div>

                  {/* ── Event Settings ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">EVENT SETTINGS</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TIME ZONE</label>
                        <select value={settingsForm.timezone} onChange={e => setSettingsForm((f: any) => ({ ...f, timezone: e.target.value }))}
                          className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                          {["Pacific/Auckland","Pacific/Chatham","Australia/Sydney","Australia/Melbourne","Australia/Brisbane","UTC"].map(tz => (
                            <option key={tz} value={tz}>{tz.replace("_"," ")}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CURRENCY</label>
                        <select value={settingsForm.currency ?? "NZD"} onChange={e => setSettingsForm((f: any) => ({ ...f, currency: e.target.value }))}
                          className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                          {["NZD","AUD","USD","GBP","EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EVENT TIME START</label>
                        <Input type="time" value={settingsForm.eventTimeStart} onChange={e => setSettingsForm((f: any) => ({ ...f, eventTimeStart: e.target.value }))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EVENT TIME END</label>
                        <Input type="time" value={settingsForm.eventTimeEnd} onChange={e => setSettingsForm((f: any) => ({ ...f, eventTimeEnd: e.target.value }))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MINIMUM GROUP SIZE</label>
                        <Input type="number" min={0} value={settingsForm.minGroupSize} onChange={e => setSettingsForm((f: any) => ({ ...f, minGroupSize: parseInt(e.target.value) || 0 }))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                      </div>
                      <div className="flex items-center gap-3 pt-6">
                        <input type="checkbox" id="autoCancelTentative" checked={settingsForm.autoCancelTentative === 1}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, autoCancelTentative: e.target.checked ? 1 : 0 }))}
                          className="w-4 h-4 accent-forest" />
                        <label htmlFor="autoCancelTentative" className="font-dm text-sm text-ink">Automatically cancel tentative events after their event date</label>
                      </div>
                    </div>
                  </div>

                  {/* ── Theme Colour Scheme ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">COLOUR SCHEME</h2>
                    <p className="font-dm text-sm text-ink/60 mb-4">Choose a colour palette for your HOSTit workspace. This applies across the dashboard, runsheets, and public forms.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { key: 'sage', label: 'Sage Green', swatches: ['#2D4A3E','#C9A84C','#F5F0E8','#1a2e27'] },
                        { key: 'forest', label: 'Deep Forest', swatches: ['#1B3A2D','#D4AF37','#FAF7F0','#0d1f18'] },
                        { key: 'dusty-merlot', label: 'Dusty Merlot', swatches: ['#62202F','#C9DAA8','#FBF7E8','#3d1320'] },
                        { key: 'brique', label: 'Brique', swatches: ['#741D28','#B9AC39','#FFD2D9','#4a1219'] },
                        { key: 'charcoal', label: 'Charcoal', swatches: ['#1C1C1E','#C9A84C','#F5F0E8','#0a0a0b'] },
                        { key: 'blush', label: 'Blush & Olive', swatches: ['#FF88BE','#B9AC39','#FFF5F8','#cc6699'] },
                      ].map(theme => (
                        <button
                          key={theme.key}
                          type="button"
                          onClick={() => setSettingsForm((f: any) => ({ ...f, themeKey: theme.key }))}
                          className={`p-3 border-2 transition-all text-left ${
                            settingsForm.themeKey === theme.key
                              ? 'border-forest bg-forest/5'
                              : 'border-gold/20 hover:border-gold/50'
                          }`}
                        >
                          <div className="flex gap-1 mb-2">
                            {theme.swatches.map((c, i) => (
                              <div key={i} className="h-5 flex-1 rounded-sm" style={{ backgroundColor: c }} />
                            ))}
                          </div>
                          <span className="font-bebas text-xs tracking-widest text-ink">{theme.label}</span>
                          {settingsForm.themeKey === theme.key && (
                            <span className="ml-2 font-bebas text-xs text-forest">✓ ACTIVE</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button type="submit" disabled={updateSettings.isPending}
                    className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                    {updateSettings.isPending ? "SAVING..." : "SAVE VENUE DETAILS"}
                  </button>
                </form>
              )}
              </div>
              )}

              {/* ── EMAIL SUB-TAB ────────────────────────────── */}
              {settingsSubTab === "email" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Email</h1>
              {/* Email / SMTP Settings */}
              <div className="border-gold/20">
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
              </div>
              )}

              {/* ── PROPOSAL/TEMPLATES SUB-TAB ────────────────── */}
              {settingsSubTab === "templates" && (
              <div>
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Proposal & Templates</h1>
              {/* Email Templates */}
              <div className="mt-0">
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
              </div>
              )}

              {/* ── MENU SUB-TAB (Menus & Floor Plans) ──────────── */}
              {settingsSubTab === "lead-form" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Contact Form</h1>

              {/* Form branding editor */}
              {settingsForm && (
              <form onSubmit={e => { e.preventDefault(); updateSettings.mutate(settingsForm); }} className="space-y-4">
                <div className="dante-card p-5 space-y-4">
                  <h2 className="font-bebas text-xs tracking-widest text-sage">FORM CONTENT</h2>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FORM TITLE</label>
                    <Input value={settingsForm.leadFormTitle ?? ''} onChange={e => setSettingsForm((f: any) => ({ ...f, leadFormTitle: e.target.value }))}
                      placeholder="Book Your Event" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FORM SUBTITLE</label>
                    <Textarea value={settingsForm.leadFormSubtitle ?? ''} onChange={e => setSettingsForm((f: any) => ({ ...f, leadFormSubtitle: e.target.value }))}
                      placeholder="Tell us about your event and we'll get back to you within 24 hours."
                      rows={2} className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
                  </div>
                </div>
                <div className="dante-card p-5 space-y-4">
                  <h2 className="font-bebas text-xs tracking-widest text-sage">FORM BRANDING</h2>
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-1">HEADER COLOUR</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={settingsForm.primaryColor ?? '#2D4A3E'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, primaryColor: e.target.value }))}
                          className="w-10 h-10 rounded border border-gold/30 cursor-pointer p-0.5" />
                        <Input value={settingsForm.primaryColor ?? '#2D4A3E'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, primaryColor: e.target.value }))}
                          placeholder="#2D4A3E" className="w-28 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-mono text-sm" />
                      </div>
                      <p className="font-dm text-xs text-ink/40 mt-1">Used as the form header background colour</p>
                    </div>
                    {/* Live preview swatch */}
                    <div className="flex-1">
                      <div className="rounded border border-gold/20 overflow-hidden">
                        <div className="p-4 text-center" style={{ backgroundColor: settingsForm.primaryColor ?? '#2D4A3E' }}>
                          <div className="text-xs font-bold" style={{ color: '#ffffff' }}>{settingsForm.leadFormTitle || 'Book Your Event'}</div>
                          <div className="text-xs mt-0.5 opacity-70" style={{ color: '#ffffff' }}>{venueSettings?.name ?? 'Your Venue'}</div>
                        </div>
                        <div className="bg-gray-50 p-2 text-center">
                          <div className="text-xs text-gray-400">Preview</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="dante-card p-5">
                  <h2 className="font-bebas text-xs tracking-widest text-sage mb-3">FORM LINK</h2>
                  <p className="font-dm text-sm text-ink/70 mb-3">Your public enquiry form is available at:</p>
                  <div className="flex items-center gap-2 bg-gold/5 border border-gold/20 rounded px-3 py-2">
                    <span className="font-mono text-sm text-ink/70 flex-1 truncate">{window.location.origin}/enquire/{venueSettings?.slug || 'your-venue'}</span>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/enquire/${venueSettings?.slug || ''}`); toast.success('Link copied!'); }}
                      className="font-bebas tracking-widest text-xs px-3 py-1 border border-gold/30 text-ink hover:bg-gold/10 flex-shrink-0">COPY</button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a href={`/enquire/${venueSettings?.slug || ''}`} target="_blank" rel="noopener noreferrer"
                      className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream">OPEN FORM</a>
                  </div>
                </div>
                <button type="submit" disabled={updateSettings.isPending}
                  className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                  {updateSettings.isPending ? 'SAVING...' : 'SAVE CHANGES'}
                </button>
              </form>
              )}
              </div>
              )}

              {/* ── MENU SUB-TAB (Menus & Floor Plans) ──────────── */}
              {settingsSubTab === "integrations" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Integrations</h1>
              <div className="space-y-4">
                {[{name:'Google Calendar',desc:'Sync bookings to your Google Calendar automatically.',icon:'📅'},{name:'Xero',desc:'Export invoices and payments to Xero accounting.',icon:'💼'},{name:'Mailchimp',desc:'Add new contacts to your Mailchimp mailing list.',icon:'📧'},{name:'Zapier',desc:'Connect HOSTit to 5,000+ apps via Zapier webhooks.',icon:'⚡'}].map(i => (
                  <div key={i.name} className="dante-card p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{i.icon}</span>
                      <div>
                        <div className="font-cormorant font-semibold text-base text-ink">{i.name}</div>
                        <div className="font-dm text-xs text-ink/60">{i.desc}</div>
                      </div>
                    </div>
                    <button onClick={() => toast.info('Integration coming soon')} className="font-bebas tracking-widest text-xs px-4 py-2 border border-gold/30 text-ink hover:bg-gold/10">CONNECT</button>
                  </div>
                ))}
              </div>
              </div>
              )}

              {/* ── TAXES & FEES SUB-TAB ───────────────────────── */}
              {settingsSubTab === "taxes" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Taxes & Fees</h1>
              <div className="dante-card p-5">
                <p className="font-dm text-sm text-ink/70 mb-4">Configure GST/VAT and service fees that apply to your proposals and invoices.</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-3 border-b border-gold/10">
                    <div>
                      <div className="font-cormorant font-semibold text-ink">GST (New Zealand)</div>
                      <div className="font-dm text-xs text-ink/60">15% applied to all taxable items</div>
                    </div>
                    <span className="font-bebas text-sm text-forest bg-forest/10 px-3 py-1">15%</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-cormorant font-semibold text-ink">Service Fee</div>
                      <div className="font-dm text-xs text-ink/60">Optional service charge added to proposals</div>
                    </div>
                    <button onClick={() => toast.info('Custom fees coming soon')} className="font-bebas tracking-widest text-xs px-3 py-1 border border-gold/30 text-ink hover:bg-gold/10">CONFIGURE</button>
                  </div>
                </div>
              </div>
              </div>
              )}

              {/* ── TEAM SUB-TAB ───────────────────────────────── */}
              {settingsSubTab === "team" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Team</h1>
              <div className="dante-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-dm text-sm text-ink/70">Manage team members who can access your HOSTit account.</p>
                  <button onClick={() => toast.info('Team invites coming soon')} className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1"><Plus className="w-3 h-3" /> INVITE</button>
                </div>
                <div className="border border-dashed border-gold/20 p-6 text-center">
                  <p className="font-dm text-sage text-sm">No team members yet. Invite staff to collaborate on events.</p>
                </div>
              </div>
              </div>
              )}

              {/* ── VENUE PROFILE (Menus & Floor Plans) ─────────── */}
              {(settingsSubTab === "venue-profile") && (
              <div>
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Venue Profile</h1>
              {settingsForm && (
                <form onSubmit={e => { e.preventDefault(); updateSettings.mutate(settingsForm); }} className="space-y-6">

                  {/* ── Venue Description ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE DESCRIPTION</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">VENUE PROFILE BANNER</label>
                        <div className="border border-dashed border-gold/30 rounded p-4 text-center bg-linen/30">
                          {settingsForm.bannerImageUrl ? (
                            <div className="relative">
                              <img src={settingsForm.bannerImageUrl} alt="Banner" className="w-full h-40 object-cover rounded" />
                              <button type="button" onClick={() => setSettingsForm((f: any) => ({ ...f, bannerImageUrl: "" }))}
                                className="absolute top-2 right-2 bg-white/80 rounded-full p-1 text-ink/60 hover:text-tomato">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer block">
                              <input type="file" accept="image/*" className="hidden" onChange={async e => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const fd = new FormData(); fd.append('file', file);
                                const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
                                const data = await res.json();
                                if (data.url) setSettingsForm((f: any) => ({ ...f, bannerImageUrl: data.url }));
                              }} />
                              <div className="py-6">
                                <ImageIcon className="w-8 h-8 text-gold/40 mx-auto mb-2" />
                                <p className="font-dm text-sm text-sage">Click to upload banner image</p>
                                <p className="font-dm text-xs text-sage/60">Upload an image at least 1920 x 1080</p>
                              </div>
                            </label>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">VENUE TYPE</label>
                        <select value={settingsForm.venueType} onChange={e => setSettingsForm((f: any) => ({ ...f, venueType: e.target.value }))}
                          className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                          <option value="">None</option>
                          {["Restaurant","Bar","Function Venue","Hotel","Rooftop","Garden","Winery","Brewery","Private Dining Room","Conference Centre","Other"].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-2">PRICE CATEGORY</label>
                        <div className="flex gap-4">
                          {["$$","$$$","$$$$"].map(p => (
                            <label key={p} className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="priceCategory" value={p} checked={settingsForm.priceCategory === p}
                                onChange={() => setSettingsForm((f: any) => ({ ...f, priceCategory: p }))}
                                className="accent-forest" />
                              <span className="font-dm text-sm text-ink">{p}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ABOUT YOUR VENUE</label>
                        <Textarea value={settingsForm.aboutVenue} onChange={e => setSettingsForm((f: any) => ({ ...f, aboutVenue: e.target.value }))}
                          placeholder="Describe your venue..." rows={4}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* ── Availability Settings ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">AVAILABILITY SETTINGS</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-2">EVENT DURATION</label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="font-dm text-xs text-sage/70 block mb-1">Minimum Duration</label>
                            <select value={settingsForm.minEventDuration} onChange={e => setSettingsForm((f: any) => ({ ...f, minEventDuration: e.target.value }))}
                              className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                              {["30 minutes","1 hour","2 hours","3 hours","4 hours"].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="font-dm text-xs text-sage/70 block mb-1">Maximum Duration</label>
                            <select value={settingsForm.maxEventDuration} onChange={e => setSettingsForm((f: any) => ({ ...f, maxEventDuration: e.target.value }))}
                              className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                              {["2 hours","3 hours","4 hours","6 hours","8 hours","10 hours","12 hours","No limit"].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-2">LEAD TIME</label>
                        <p className="font-dm text-xs text-sage/60 mb-2">To maximise your inquiries, we recommend your lead time be as short as possible.</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="font-dm text-xs text-sage/70 block mb-1">Minimum Lead Time</label>
                            <select value={settingsForm.minLeadTime} onChange={e => setSettingsForm((f: any) => ({ ...f, minLeadTime: e.target.value }))}
                              className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                              {["Same day","1 day","2 days","3 days","1 week","2 weeks","1 month"].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="font-dm text-xs text-sage/70 block mb-1">Maximum Lead Time</label>
                            <select value={settingsForm.maxLeadTime} onChange={e => setSettingsForm((f: any) => ({ ...f, maxLeadTime: e.target.value }))}
                              className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                              {["1 month","2 months","3 months","6 months","1 year","2 years"].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-2">BUFFER TIME</label>
                        <select value={settingsForm.bufferTime} onChange={e => setSettingsForm((f: any) => ({ ...f, bufferTime: e.target.value }))}
                          className="w-48 border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-gold">
                          {["None","15 minutes","30 minutes","45 minutes","1 hour","2 hours"].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ── Operating Hours ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">HOURS</h2>
                    <div className="space-y-3">
                      {(() => {
                        let hours: any[] = [];
                        try { hours = JSON.parse(settingsForm.operatingHours); } catch { hours = []; }
                        return hours.map((h: any, i: number) => (
                          <div key={h.day} className="flex items-center gap-4">
                            <div className="flex items-center gap-2 w-32">
                              <input type="checkbox" checked={h.enabled} id={`oh-${i}`}
                                onChange={e => {
                                  const updated = [...hours]; updated[i] = { ...h, enabled: e.target.checked };
                                  setSettingsForm((f: any) => ({ ...f, operatingHours: JSON.stringify(updated) }));
                                }} className="w-4 h-4 accent-forest" />
                              <label htmlFor={`oh-${i}`} className="font-dm text-sm text-ink">{h.day}</label>
                            </div>
                            <div className="flex items-center gap-2">
                              <div>
                                <label className="font-dm text-xs text-sage/60 block">Start Time</label>
                                <Input type="time" value={h.start} disabled={!h.enabled}
                                  onChange={e => {
                                    const updated = [...hours]; updated[i] = { ...h, start: e.target.value };
                                    setSettingsForm((f: any) => ({ ...f, operatingHours: JSON.stringify(updated) }));
                                  }}
                                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold w-32 disabled:opacity-40" />
                              </div>
                              <div>
                                <label className="font-dm text-xs text-sage/60 block">End Time</label>
                                <Input type="time" value={h.end} disabled={!h.enabled}
                                  onChange={e => {
                                    const updated = [...hours]; updated[i] = { ...h, end: e.target.value };
                                    setSettingsForm((f: any) => ({ ...f, operatingHours: JSON.stringify(updated) }));
                                  }}
                                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold w-32 disabled:opacity-40" />
                              </div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  <button type="submit" disabled={updateSettings.isPending}
                    className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                    {updateSettings.isPending ? "SAVING..." : "SAVE VENUE PROFILE"}
                  </button>
                </form>
              )}

              {/* ─── Menus & Floor Plans ─────────────────────────────── */}
              <div className="mt-10" style={{ display: 'none' }}>
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
              </div>
              )}

              {/* ── EVENT SPACES SUB-TAB ───────────────────────── */}
              {settingsSubTab === "spaces" && (
              <div>
              <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Event Spaces</h1>
              <div className="mt-0">
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
                          {s.description && <div className="font-dm text-xs text-ink/40 mt-0.5">{s.description}</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingSpace(s); setEditSpaceForm({ name: s.name, description: s.description ?? '', minCapacity: s.minCapacity ? String(s.minCapacity) : '', maxCapacity: s.maxCapacity ? String(s.maxCapacity) : '', minSpend: s.minSpend ? String(s.minSpend) : '' }); setShowEditSpace(true); }}
                            className="text-sage hover:text-forest-dark p-1"
                            title="Edit space"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteSpace.mutate({ id: s.id }); }}
                            className="text-red-400 hover:text-red-600 p-1"
                            title="Delete space"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
              )}


              {/* ── AUTOMATED TASKS ─────────────────────────────── */}
              {settingsSubTab === "automated-tasks" && (
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h1 className="font-cormorant text-ink" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Automated Tasks</h1>
                </div>
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Automated Tasks</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500">Create When</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500">Event Type</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[{name:'Final Head Count Due',when:'Off',type:'All Events'},{name:'Menu Selections Due',when:'Off',type:'All Events'},{name:'Order Rentals',when:'Off',type:'All Events'}].map((row,i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="p-3 text-sm text-gray-700">{row.name}</td>
                          <td className="p-3 text-sm text-gray-500">{row.when}</td>
                          <td className="p-3 text-sm text-gray-500">{row.type}</td>
                          <td className="p-3 text-right"><button className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* ── GROUP SETTINGS ──────────────────────────────── */}
              {settingsSubTab === "group-settings" && (
              <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="font-cormorant text-ink" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Group Settings</h1>
                {/* Automated Reminder Emails */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Automated Reminder Emails</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Send When</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Event Types</th>
                      <th className="p-3"></th>
                    </tr></thead>
                    <tbody>
                      {[{name:'Final Guest Count Reminder',when:'Off',type:'All Events'},{name:'Post-Event Feedback and Thank You',when:'Off',type:'All Events'},{name:'Remaining Balance Reminder',when:'Off',type:'All Events'}].map((row,i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="p-3 text-sm text-gray-700">{row.name}</td>
                          <td className="p-3 text-sm text-gray-500">{row.when}</td>
                          <td className="p-3 text-sm text-gray-500">{row.type}</td>
                          <td className="p-3 text-right"><button className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Template Emails */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Template Emails</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  <div className="p-3 text-xs text-gray-400 border-b border-gray-100">Name</div>
                  {['Available - Pay Deposit','Available - Select Menu Items','Lead Follow Up','New Event Software Email','Not Available','Proposal Sent Follow Up'].map((name,i) => (
                    <div key={i} className="flex items-center justify-between p-3 border-b border-gray-50 hover:bg-gray-50">
                      <span className="text-sm text-gray-700">{name}</span>
                      <button className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                {/* Attachment Library */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Attachment Library</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Date Added</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Size</th>
                    </tr></thead>
                    <tbody><tr><td colSpan={3} className="p-6 text-center text-sm text-gray-400">No attachments yet</td></tr></tbody>
                  </table>
                </div>
                {/* Reporting Settings */}
                <div className="bg-white border border-gray-200 rounded p-4">
                  <h2 className="font-semibold text-gray-800 mb-4">Reporting Settings</h2>
                  <label className="block text-xs text-gray-500 mb-1">Revenue projections based on</label>
                  <select className="w-full border border-gray-200 rounded p-2 text-sm text-gray-700">
                    <option>Grand Total</option>
                    <option>Subtotal</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-2">Choose whether to calculate revenue projections based on the grand total or subtotal.</p>
                </div>
                {/* Event Types */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Event Types</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  {['Anniversary','Birthday','Catering','Corporate','Engagement','Graduation','Happy Hour','Holiday Party','Large Group','Non Profit','Rehearsal Dinner','Wedding'].map((type,i) => (
                    <div key={i} className="flex items-center justify-between p-3 border-b border-gray-50 hover:bg-gray-50">
                      <span className="text-sm text-gray-700">{type}</span>
                      <button className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* ── EMAIL SETTINGS ──────────────────────────────── */}
              {settingsSubTab === "email-settings" && (
              <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="font-cormorant text-ink" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Email</h1>
                {/* Automated Reminder Emails */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Automated Reminder Emails</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Send When</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Event Types</th>
                    </tr></thead>
                    <tbody>
                      {[{name:'Final Guest Count Reminder',when:'Off',type:'All Events'},{name:'Post-Event Feedback and Thank You',when:'Off',type:'All Events'},{name:'Remaining Balance Reminder',when:'Off',type:'All Events'}].map((row,i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="p-3 text-sm text-gray-700">{row.name}</td>
                          <td className="p-3 text-sm text-gray-500">{row.when}</td>
                          <td className="p-3 text-sm text-gray-500">{row.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* System Emails */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="p-4 border-b border-gray-200"><h2 className="font-semibold text-gray-800">System Emails</h2></div>
                  <div className="p-3 text-xs text-gray-400 border-b border-gray-100">Name</div>
                  {['Additional Payment','Contact Form Responses','No Action','Pay Deposit','Pay Remaining Balance','Sign Agreement & Pay Deposit'].map((name,i) => (
                    <div key={i} className="p-3 border-b border-gray-50 text-sm text-gray-700 hover:bg-gray-50">{name}</div>
                  ))}
                </div>
                {/* Template Emails */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Template Emails</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  <div className="p-3 text-xs text-gray-400 border-b border-gray-100">Name</div>
                  {['Available - Pay Deposit','Available - Select Menu Items','Lead Follow Up','New Event Software Email','Not Available','Proposal Sent Follow Up'].map((name,i) => (
                    <div key={i} className="flex items-center justify-between p-3 border-b border-gray-50 hover:bg-gray-50">
                      <span className="text-sm text-gray-700">{name}</span>
                      <button className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                {/* Venue Out of Office */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="p-4 border-b border-gray-200"><h2 className="font-semibold text-gray-800">Venue Out of Office Email</h2></div>
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Start Date</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">End Date</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Status</th>
                    </tr></thead>
                    <tbody>
                      <tr className="border-b border-gray-50">
                        <td className="p-3 text-sm text-gray-700">Out of Office</td>
                        <td className="p-3 text-sm text-gray-500">—</td>
                        <td className="p-3 text-sm text-gray-500">—</td>
                        <td className="p-3"><span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Off</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Attachment Library */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Attachment Library</h2>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">From Action</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500">Size</th>
                    </tr></thead>
                    <tbody><tr><td colSpan={3} className="p-6 text-center text-sm text-gray-400">No attachments yet</td></tr></tbody>
                  </table>
                </div>
                {/* AI Reply Customisation */}
                <div className="bg-white border border-gray-200 rounded p-4">
                  <h2 className="font-semibold text-gray-800 mb-3">AI Reply Customisation</h2>
                  <textarea className="w-full border border-gray-200 rounded p-3 text-sm text-gray-700 h-24 resize-none" placeholder="Prompt" />
                  <p className="text-xs text-gray-400 mt-2">Customise the AI so that messages sent to your venue are tailored to your business. For example, you can tell the AI about your venue, your events program, and any other relevant information.</p>
                </div>
                {/* Customer Feedback */}
                <div className="bg-white border border-gray-200 rounded p-4">
                  <h2 className="font-semibold text-gray-800 mb-3">Customer Feedback &amp; Reviews</h2>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <span className="text-sm text-gray-700">Customer Feedback (Request feedback from customers a day after their event is completed.)</span>
                  </label>
                </div>
              </div>
              )}

              {/* ── PROFILE ─────────────────────────────────────── */}
              {settingsSubTab === "profile" && (
              <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="font-cormorant text-ink" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Profile</h1>
                {/* Account Details */}
                <div className="bg-white border border-gray-200 rounded p-6">
                  <h2 className="font-semibold text-gray-800 mb-4">Account Details</h2>
                  <div className="flex flex-col items-center mb-6">
                    <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-burgundy/50 transition-colors">
                      <Camera className="w-6 h-6 text-gray-400 mb-1" />
                      <span className="text-xs text-gray-400">Upload Image</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs text-gray-500 mb-1">First Name</label><input className="w-full border border-gray-200 rounded p-2 text-sm" placeholder="First Name" /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Last Name</label><input className="w-full border border-gray-200 rounded p-2 text-sm" placeholder="Last Name" /></div>
                  </div>
                  <div className="mt-4"><label className="block text-xs text-gray-500 mb-1">Email</label><input className="w-full border border-gray-200 rounded p-2 text-sm" placeholder="Email" /></div>
                  <div className="mt-4"><label className="block text-xs text-gray-500 mb-1">Phone</label><input className="w-full border border-gray-200 rounded p-2 text-sm" placeholder="Phone" /><p className="text-xs text-gray-400 mt-1">By providing your phone number, you agree to receive text messages. Message and data rates may apply.</p></div>
                  <div className="mt-4"><label className="block text-xs text-gray-500 mb-1">Scheduling Link</label><input className="w-full border border-gray-200 rounded p-2 text-sm" placeholder="Scheduling Link" /></div>
                </div>
                {/* Email Signature */}
                <div className="bg-white border border-gray-200 rounded p-4">
                  <h2 className="font-semibold text-gray-800 mb-3">Email Signature</h2>
                  <button className="border border-gray-300 text-gray-700 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Edit</button>
                </div>
                {/* Connect Google Calendar */}
                <div className="bg-white border border-gray-200 rounded p-4">
                  <h2 className="font-semibold text-gray-800 mb-3">Connect Google Calendar</h2>
                  <button className="bg-teal-500 hover:bg-teal-600 text-white text-sm px-4 py-2 rounded">Connect Google Calendar</button>
                  <div className="flex gap-6 mt-3">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" /><span className="text-sm text-gray-700">Show Lead &amp; Qualified</span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" /><span className="text-sm text-gray-700">Show Proposal Sent</span></label>
                  </div>
                </div>
                {/* Notifications */}
                <div className="bg-white border border-gray-200 rounded p-4">
                  <h2 className="font-semibold text-gray-800 mb-3">Notifications</h2>
                  <div className="mb-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Email</p>
                    <div className="flex flex-wrap gap-4">
                      {['New Leads','Payments','Weekly Digest','Customer Feedback'].map((n,i) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" defaultChecked={n==='Customer Feedback'} /><span className="text-sm text-gray-700">{n}</span></label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Text Message</p>
                    <p className="text-sm text-gray-400">To receive text messages, add a phone number to your account.</p>
                  </div>
                </div>
                {/* Password */}
                <div className="bg-white border border-gray-200 rounded p-4">
                  <h2 className="font-semibold text-gray-800 mb-4">Password</h2>
                  <div className="max-w-sm space-y-3">
                    <div className="relative"><input type="password" className="w-full border border-gray-200 rounded p-2 text-sm pr-10" placeholder="Old Password" /><Eye className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" /></div>
                    <div className="relative"><input type="password" className="w-full border border-gray-200 rounded p-2 text-sm pr-10" placeholder="New Password" /><Eye className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" /></div>
                    <div className="relative"><input type="password" className="w-full border border-gray-200 rounded p-2 text-sm pr-10" placeholder="New Password Confirmation" /><Eye className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" /></div>
                    <button className="btn-forest text-cream text-sm font-bebas tracking-widest px-6 py-2">Change Password</button>
                    <p className="text-xs text-gray-400">If you can't remember your old password, click below to send a reset password email. Make sure to log out before opening the email.</p>
                    <button className="border border-gray-300 text-gray-700 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Send Password Reset Email</button>
                  </div>
                </div>
              </div>
              )}

              {/* ── GROUP CONTACT FORM ──────────────────────────── */}
              {settingsSubTab === "group-contact-form" && settingsForm && (
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h1 className="font-cormorant text-ink" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Group Contact Form</h1>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/enquire/${venueSettings?.slug || ''}`); toast.success('Form link copied!'); }}
                      className="flex items-center gap-2 border border-gold/30 text-ink text-sm px-4 py-2 hover:bg-gold/10 font-bebas tracking-widest">
                      <ExternalLink className="w-4 h-4" /> COPY FORM LINK
                    </button>
                    <a href={`/enquire/${venueSettings?.slug || ''}`} target="_blank" rel="noopener noreferrer"
                      className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream">OPEN FORM</a>
                  </div>
                </div>

                <form onSubmit={e => { e.preventDefault(); updateSettings.mutate(settingsForm); }} className="space-y-4">
                  {/* Logo upload */}
                  <div className="dante-card p-5">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">LOGO</h2>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-full border-2 border-dashed border-gold/40 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                        {settingsForm.logoUrl ? (
                          <img src={settingsForm.logoUrl} alt="logo" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-gray-400 text-center px-2">No logo</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">UPLOAD LOGO</label>
                        <input type="file" accept="image/*"
                          onChange={async e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            const fd = new FormData(); fd.append('file', file);
                            const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
                            const { url } = await res.json();
                            setSettingsForm((f: any) => ({ ...f, logoUrl: url }));
                            toast.success('Logo uploaded!');
                          }}
                          className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:border file:border-gold/30 file:text-xs file:font-bebas file:tracking-widest file:bg-transparent file:text-ink hover:file:bg-gold/10 cursor-pointer" />
                        <p className="font-dm text-xs text-ink/40 mt-1">PNG, JPG or SVG. Recommended: square format.</p>
                      </div>
                    </div>
                  </div>

                  {/* Banner image upload */}
                  <div className="dante-card p-5">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">BANNER IMAGE</h2>
                    <div
                      className="w-full h-28 border-2 border-dashed border-gold/40 rounded flex items-center justify-center overflow-hidden bg-gray-50 mb-3 relative cursor-pointer"
                      onClick={() => document.getElementById('banner-upload')?.click()}
                    >
                      {settingsForm.coverImageUrl ? (
                        <img src={settingsForm.coverImageUrl} alt="banner" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-gray-400">Click to upload banner (recommended: 1500 × 250px)</span>
                      )}
                    </div>
                    <input id="banner-upload" type="file" accept="image/*" className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const fd = new FormData(); fd.append('file', file);
                        const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
                        const { url } = await res.json();
                        setSettingsForm((f: any) => ({ ...f, coverImageUrl: url }));
                        toast.success('Banner uploaded!');
                      }}
                    />
                    <p className="font-dm text-xs text-ink/40">Recommended size: 1500 × 250px. JPG or PNG.</p>
                  </div>

                  {/* Colours */}
                  <div className="dante-card p-5 space-y-4">
                    <h2 className="font-bebas text-xs tracking-widest text-sage">FORM COLOURS</h2>
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">HEADER / BUTTON COLOUR</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={settingsForm.primaryColor ?? '#2D4A3E'}
                            onChange={e => setSettingsForm((f: any) => ({ ...f, primaryColor: e.target.value }))}
                            className="w-10 h-10 rounded border border-gold/30 cursor-pointer p-0.5" />
                          <Input value={settingsForm.primaryColor ?? '#2D4A3E'}
                            onChange={e => setSettingsForm((f: any) => ({ ...f, primaryColor: e.target.value }))}
                            placeholder="#2D4A3E" className="w-28 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-mono text-sm" />
                        </div>
                      </div>
                      {/* Preview swatch */}
                      <div className="flex-1">
                        <div className="rounded border border-gold/20 overflow-hidden">
                          <div className="h-10" style={{ backgroundColor: settingsForm.primaryColor ?? '#2D4A3E' }} />
                          <div className="bg-gray-50 p-2 text-center text-xs text-gray-400">Header preview</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={updateSettings.isPending}
                    className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                    {updateSettings.isPending ? 'SAVING...' : 'SAVE CHANGES'}
                  </button>
                </form>
              </div>
              )}

              {/* ── FLOOR PLANS ─────────────────────────────────── */}
              {settingsSubTab === "floor-plans" && (
              <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
                {editingFloorPlan ? (
                  /* ── Editor view ── */
                  <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)', minHeight: 500 }}>
                    <div className="flex items-center gap-3 mb-3 flex-shrink-0">
                      <button
                        onClick={() => setEditingFloorPlan(null)}
                        className="flex items-center gap-1 text-xs font-bebas tracking-widest text-ink/50 hover:text-ink transition-colors"
                      >
                        <ChevronLeft className="w-3 h-3" /> BACK TO FLOOR PLANS
                      </button>
                    </div>
                    <div className="flex-1 border border-border rounded overflow-hidden" style={{ minHeight: 0 }}>
                      <FloorPlanEditor
                        key={editingFloorPlan.id ?? 'new'}
                        initialData={editingFloorPlan.canvasData ?? undefined}
                        name={editingFloorPlan.name ?? 'Floor Plan'}
                        isSaving={saveFloorPlan.isPending}
                        onSave={(canvasData: CanvasData, name: string) => {
                          saveFloorPlan.mutate({
                            id: editingFloorPlan.id ?? undefined,
                            name,
                            canvasData,
                          });
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  /* ── List view ── */
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h1 className="font-cormorant text-ink" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Floor Plans</h1>
                        <p className="font-dm text-sm text-ink/50 mt-1">Create and manage floor plan templates for your event spaces.</p>
                      </div>
                      <button
                        onClick={() => setEditingFloorPlan({ id: null, name: 'New Floor Plan', canvasData: null })}
                        className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> NEW FLOOR PLAN
                      </button>
                    </div>

                    {/* Info banner */}
                    <div className="bg-burgundy/5 border border-burgundy/20 rounded p-4 mb-6 flex items-start gap-3">
                      <Grid className="w-5 h-5 text-burgundy flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-dm text-sm text-ink font-medium">Interactive Floor Plan Builder</p>
                        <p className="font-dm text-xs text-ink/60 mt-1">Drag and drop tables, chairs, stages, bars, and more onto the canvas. Assign seat counts, rotate elements, and save templates to reuse across events.</p>
                      </div>
                    </div>

                    {/* Floor plans grid */}
                    {(floorPlansList ?? []).length === 0 ? (
                      <div className="bg-white border border-gray-200 rounded p-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Grid className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="font-cormorant text-xl font-semibold text-gray-700 mb-2">No Floor Plans Yet</h3>
                        <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">Create interactive floor plans for your event spaces. Drag and drop tables, chairs, and other elements to design your layouts.</p>
                        <button
                          onClick={() => setEditingFloorPlan({ id: null, name: 'New Floor Plan', canvasData: null })}
                          className="btn-forest text-cream text-xs font-bebas tracking-widest px-6 py-2"
                        >
                          CREATE FIRST FLOOR PLAN
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {(floorPlansList ?? []).map((plan: any) => (
                          <div key={plan.id} className="bg-white border border-gray-200 rounded overflow-hidden hover:border-burgundy/30 transition-colors group">
                            {/* Preview thumbnail */}
                            <div
                              className="h-36 bg-gray-50 border-b border-gray-100 flex items-center justify-center cursor-pointer relative"
                              onClick={() => setEditingFloorPlan(plan)}
                            >
                              {plan.canvasData?.elements?.length > 0 ? (
                                <div className="relative" style={{ transform: 'scale(0.18)', transformOrigin: 'center center', width: plan.canvasData.width, height: plan.canvasData.height, pointerEvents: 'none' }}>
                                  {plan.canvasData.elements.map((el: any) => (
                                    <div key={el.id} style={{
                                      position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
                                      backgroundColor: el.color ?? '#888',
                                      borderRadius: el.type?.includes('round') || el.type === 'chair' || el.type === 'plant' || el.type === 'pillar' ? '50%' : '3px',
                                      transform: `rotate(${el.rotation}deg)`,
                                      transformOrigin: 'center center',
                                    }} />
                                  ))}
                                </div>
                              ) : (
                                <Grid className="w-10 h-10 text-gray-300" />
                              )}
                              <div className="absolute inset-0 bg-burgundy/0 group-hover:bg-burgundy/5 transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 font-bebas tracking-widest text-xs text-burgundy bg-white/90 px-3 py-1 rounded transition-opacity">EDIT</span>
                              </div>
                            </div>
                            <div className="p-3 flex items-center justify-between">
                              <div>
                                <p className="font-dm text-sm font-semibold text-ink">{plan.name}</p>
                                <p className="font-dm text-xs text-ink/40">
                                  {plan.canvasData?.elements?.filter((e: any) => e.type?.includes('table')).length ?? 0} tables ·
                                  {' '}{plan.canvasData?.elements?.reduce((s: number, e: any) => s + (e.seats ?? 0), 0) ?? 0} seats
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setEditingFloorPlan(plan)}
                                  className="p-1.5 text-ink/30 hover:text-ink transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => { if (confirm('Delete this floor plan?')) deleteFloorPlan.mutate({ id: plan.id }); }}
                                  className="p-1.5 text-ink/30 hover:text-red-500 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* ── MENU ────────────────────────────────────────── */}
              {settingsSubTab === "menu" && (
              <div className="max-w-3xl mx-auto">
                <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Menu</h1>

                {/* Menu Sections */}
                <div className="bg-white border border-gray-200 rounded mb-6">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Menu Sections</h2>
                    <button onClick={() => setShowSectionForm(v => !v)} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  {showSectionForm && (
                    <form onSubmit={e => { e.preventDefault(); createMenuSection.mutate(sectionForm); }} className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SECTION NAME *</label>
                          <Input required value={sectionForm.name} onChange={e => setSectionForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Dinner, Catering" className="rounded-none border border-gold/30 text-sm" />
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SALES CATEGORY</label>
                          <select value={sectionForm.salesCategory} onChange={e => setSectionForm(f => ({ ...f, salesCategory: e.target.value }))} className="w-full border border-gold/30 rounded-none px-3 py-2 text-sm bg-white">
                            <option value="">None</option>
                            {(salesCategoriesList ?? []).map((c: any) => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-4 flex-wrap">
                        {(['hasSalesTax','hasAdminFee','hasGratuity','applyToMin'] as const).map(field => (
                          <label key={field} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={sectionForm[field]} onChange={e => setSectionForm(f => ({ ...f, [field]: e.target.checked }))} className="rounded" />
                            {field === 'hasSalesTax' ? 'Sales Tax' : field === 'hasAdminFee' ? 'Admin Fee' : field === 'hasGratuity' ? 'Gratuity' : 'Apply To Min'}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={createMenuSection.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">SAVE SECTION</button>
                        <button type="button" onClick={() => setShowSectionForm(false)} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
                      </div>
                    </form>
                  )}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left p-3 text-xs font-medium text-gray-500">#</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500">Name</th>
                        <th className="text-center p-3 text-xs font-medium text-gray-500">Sales Tax</th>
                        <th className="text-center p-3 text-xs font-medium text-gray-500">Admin Fee</th>
                        <th className="text-center p-3 text-xs font-medium text-gray-500">Gratuity</th>
                        <th className="text-center p-3 text-xs font-medium text-gray-500">Apply To Min</th>
                        <th className="text-left p-3 text-xs font-medium text-gray-500">Sales Category</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(menuSectionsList ?? []).length === 0 && (
                        <tr><td colSpan={8} className="p-6 text-center text-sm text-gray-400">No menu sections yet. Click Add to create one.</td></tr>
                      )}
                      {(menuSectionsList ?? []).map((s: any, i: number) => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="p-3 text-sm text-gray-500">{i + 1}</td>
                          <td className="p-3 text-sm font-medium text-gray-800">{s.name}</td>
                          <td className="p-3 text-center">{s.hasSalesTax ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="p-3 text-center">{s.hasAdminFee ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="p-3 text-center">{s.hasGratuity ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="p-3 text-center">{s.applyToMin ? <span className="text-green-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="p-3 text-sm text-gray-500">{s.salesCategory || 'None'}</td>
                          <td className="p-3 text-right"><button onClick={() => deleteMenuSection.mutate({ id: s.id })} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Sales Categories */}
                <div className="bg-white border border-gray-200 rounded mb-6">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Sales Categories</h2>
                    <button onClick={() => setShowCategoryForm(v => !v)} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  {showCategoryForm && (
                    <form onSubmit={e => { e.preventDefault(); createSalesCategory.mutate({ name: categoryForm.name }); }} className="p-4 border-b border-gray-100 bg-gray-50 flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CATEGORY NAME *</label>
                        <Input required value={categoryForm.name} onChange={e => setCategoryForm({ name: e.target.value })} placeholder="e.g. Food, Beverage, Catering" className="rounded-none border border-gold/30 text-sm" />
                      </div>
                      <button type="submit" disabled={createSalesCategory.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">SAVE</button>
                      <button type="button" onClick={() => setShowCategoryForm(false)} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
                    </form>
                  )}
                  <div className="divide-y divide-gray-50">
                    {(salesCategoriesList ?? []).length === 0 && (
                      <p className="p-6 text-center text-sm text-gray-400">No sales categories yet. Click Add to create one.</p>
                    )}
                    {(salesCategoriesList ?? []).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                        <span className="text-sm text-gray-800">{c.name}</span>
                        <button onClick={() => deleteSalesCategory.mutate({ id: c.id })} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Menu Items (grouped by package/section) */}
                <div className="bg-white border border-gray-200 rounded">
                  <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-800">Menu Items</h2>
                    <button onClick={() => { setShowMenuForm(true); setEditingPackageId(null); setMenuForm({ name: '', type: 'food', description: '', pricePerHead: '' }); }} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  {/* Section filter tabs */}
                  <div className="flex border-b border-gray-100 px-4 pt-2 gap-1 overflow-x-auto">
                    <button onClick={() => setMenuSettingsTab('sections')} className={`text-xs font-bebas tracking-widest px-3 py-1.5 border-b-2 transition-colors ${menuSettingsTab === 'sections' ? 'border-burgundy text-burgundy' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>All</button>
                    {(menuSectionsList ?? []).map((s: any) => (
                      <button key={s.id} onClick={() => setMenuSettingsTab('categories')} className="text-xs font-bebas tracking-widest px-3 py-1.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">{s.name}</button>
                    ))}
                  </div>
                  {showMenuForm && (
                    <form onSubmit={e => { e.preventDefault(); if (editingPackageId) { updateMenuPackage.mutate({ id: editingPackageId, name: menuForm.name, type: menuForm.type, description: menuForm.description || undefined, pricePerHead: menuForm.pricePerHead ? parseFloat(menuForm.pricePerHead) : undefined }); } else { createMenuPackage.mutate({ name: menuForm.name, type: menuForm.type, description: menuForm.description || undefined, pricePerHead: menuForm.pricePerHead ? parseFloat(menuForm.pricePerHead) : undefined }); } }} className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ITEM NAME *</label>
                          <Input required value={menuForm.name} onChange={e => setMenuForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Catering Package" className="rounded-none border border-gold/30 text-sm" />
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PRICE PER HEAD (NZD)</label>
                          <Input type="number" step="0.01" value={menuForm.pricePerHead} onChange={e => setMenuForm(f => ({ ...f, pricePerHead: e.target.value }))} placeholder="65.00" className="rounded-none border border-gold/30 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
                        <Input value={menuForm.description} onChange={e => setMenuForm(f => ({ ...f, description: e.target.value }))} placeholder="A choice of 3 courses" className="rounded-none border border-gold/30 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={createMenuPackage.isPending || updateMenuPackage.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">{editingPackageId ? 'UPDATE' : 'ADD ITEM'}</button>
                        <button type="button" onClick={() => { setShowMenuForm(false); setEditingPackageId(null); }} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
                      </div>
                    </form>
                  )}
                  <div className="divide-y divide-gray-50">
                    {(menuPackages ?? []).length === 0 && !showMenuForm && (
                      <p className="p-6 text-center text-sm text-gray-400">No menu items yet. Click Add to create one.</p>
                    )}
                    {(menuPackages ?? []).map((pkg: any) => (
                      <div key={pkg.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{pkg.name}</span>
                          {pkg.description && <span className="text-xs text-gray-400 ml-2">{pkg.description}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {pkg.pricePerHead && <span className="text-sm font-semibold text-gray-700">${Number(pkg.pricePerHead).toFixed(2)} <span className="text-xs text-gray-400 font-normal">per person</span></span>}
                          <button onClick={() => { setEditingPackageId(pkg.id); setMenuForm({ name: pkg.name, type: pkg.type, description: pkg.description ?? '', pricePerHead: pkg.pricePerHead ? String(pkg.pricePerHead) : '' }); setShowMenuForm(true); }} className="text-blue-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => deleteMenuPackage.mutate({ id: pkg.id })} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}

              {/* ── BILLING ─────────────────────────────────────── */}
              {settingsSubTab === "billing" && (
              <div className="max-w-3xl mx-auto">
                <h1 className="font-cormorant text-ink mb-6" style={{ fontSize: '2.2rem', fontWeight: 600 }}>Billing</h1>
                <div className="bg-white border border-gray-200 rounded p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold text-gray-800">Current Plan</h2>
                      <p className="text-sm text-gray-500 mt-1">Free Starter Plan</p>
                    </div>
                    <button className="btn-forest text-cream text-xs font-bebas tracking-widest px-6 py-2">UPGRADE</button>
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Payment Method</h3>
                    <p className="text-sm text-gray-400">No payment method on file.</p>
                    <button className="mt-3 border border-gray-300 text-gray-700 text-sm px-4 py-1.5 rounded hover:bg-gray-50">Add Payment Method</button>
                  </div>
                </div>
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

      {/* Edit Space Modal */}
      <Dialog open={showEditSpace} onOpenChange={setShowEditSpace}>
        <DialogContent className="max-w-md rounded-none border border-gold/30">
          <DialogHeader>
            <div className="bg-forest-dark -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-cormorant text-xl text-cream font-semibold">Edit Event Space</DialogTitle>
            </div>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (!editingSpace) return; updateSpace.mutate({ id: editingSpace.id, name: editSpaceForm.name, description: editSpaceForm.description || null, minCapacity: editSpaceForm.minCapacity ? parseInt(editSpaceForm.minCapacity) : null, maxCapacity: editSpaceForm.maxCapacity ? parseInt(editSpaceForm.maxCapacity) : null, minSpend: editSpaceForm.minSpend ? parseFloat(editSpaceForm.minSpend) : null }); }} className="space-y-3">
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SPACE NAME *</label>
              <Input required value={editSpaceForm.name} onChange={e => setEditSpaceForm(f => ({ ...f, name: e.target.value }))}
                placeholder="The Main Dining Room" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MIN CAPACITY</label>
                <Input type="number" value={editSpaceForm.minCapacity} onChange={e => setEditSpaceForm(f => ({ ...f, minCapacity: e.target.value }))}
                  placeholder="20" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MAX CAPACITY</label>
                <Input type="number" value={editSpaceForm.maxCapacity} onChange={e => setEditSpaceForm(f => ({ ...f, maxCapacity: e.target.value }))}
                  placeholder="120" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">MIN SPEND (NZD)</label>
              <Input type="number" value={editSpaceForm.minSpend} onChange={e => setEditSpaceForm(f => ({ ...f, minSpend: e.target.value }))}
                placeholder="2000" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
              <Textarea value={editSpaceForm.description} onChange={e => setEditSpaceForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
            </div>
            <button type="submit" disabled={updateSpace.isPending}
              className="btn-forest w-full font-bebas tracking-widest text-sm py-3 text-cream disabled:opacity-50">
              {updateSpace.isPending ? "SAVING..." : "SAVE CHANGES"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Create Event from Mini Calendar */}
      <Dialog open={!!quickCreateDate} onOpenChange={(open) => !open && setQuickCreateDate(null)}>
        <DialogContent className="max-w-md rounded-2xl border border-gray-200 shadow-xl">
          <DialogHeader>
            <div className="bg-sage-green -mx-6 -mt-6 px-6 py-4 mb-4 rounded-t-2xl">
              <DialogTitle className="font-inter text-lg text-white font-semibold">
                Add Event
              </DialogTitle>
              {quickCreateDate && (
                <p className="font-inter text-sm text-white/80 mt-0.5">
                  {new Date(quickCreateDate + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            if (!quickCreateDate) return;
            createEnquiryFromCalendar.mutate({
              firstName: quickCreateForm.firstName,
              lastName: quickCreateForm.lastName || undefined,
              eventType: quickCreateForm.eventType || undefined,
              eventDate: quickCreateDate,
              guestCount: quickCreateForm.guestCount ? parseInt(quickCreateForm.guestCount) : undefined,
              message: quickCreateForm.notes || undefined,
              status: quickCreateForm.status,
              source: 'manual',
            });
          }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-inter text-xs font-medium text-gray-500 block mb-1">First Name *</label>
                <Input required value={quickCreateForm.firstName}
                  onChange={e => setQuickCreateForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="First name" className="rounded-xl border-gray-200 text-sm" />
              </div>
              <div>
                <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Last Name</label>
                <Input value={quickCreateForm.lastName}
                  onChange={e => setQuickCreateForm(f => ({ ...f, lastName: e.target.value }))}
                  placeholder="Last name" className="rounded-xl border-gray-200 text-sm" />
              </div>
            </div>
            <div>
              <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Event Type</label>
              <Input value={quickCreateForm.eventType}
                onChange={e => setQuickCreateForm(f => ({ ...f, eventType: e.target.value }))}
                placeholder="e.g. Wedding, Birthday, Corporate" className="rounded-xl border-gray-200 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Guest Count</label>
                <Input type="number" value={quickCreateForm.guestCount}
                  onChange={e => setQuickCreateForm(f => ({ ...f, guestCount: e.target.value }))}
                  placeholder="e.g. 80" className="rounded-xl border-gray-200 text-sm" />
              </div>
              <div>
                <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Status</label>
                <Select value={quickCreateForm.status} onValueChange={v => setQuickCreateForm(f => ({ ...f, status: v as any }))}>
                  <SelectTrigger className="rounded-xl border-gray-200 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New Enquiry</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="booked">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Notes</label>
              <textarea value={quickCreateForm.notes}
                onChange={e => setQuickCreateForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} placeholder="Any additional details..."
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-inter focus:outline-none focus:ring-1 focus:ring-sage-green/40 resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setQuickCreateDate(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 font-inter text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={createEnquiryFromCalendar.isPending}
                className="flex-1 py-2.5 rounded-xl bg-sage-green text-white font-inter text-sm font-medium hover:bg-sage-dark transition-colors disabled:opacity-50">
                {createEnquiryFromCalendar.isPending ? 'Adding...' : 'Add Event'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Enquiry Modal */}
      <Dialog open={showAddLead} onOpenChange={setShowAddLead}>
        <DialogContent className="max-w-lg rounded-none border border-gold/30">
          <DialogHeader>
            <div className="bg-forest-dark -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-cormorant text-xl text-cream font-semibold">Add New Enquiry</DialogTitle>
            </div>
          </DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            createEnquiry.mutate({
              firstName: addEnquiryForm.firstName,
              lastName: addEnquiryForm.lastName || undefined,
              email: addEnquiryForm.email || undefined,
              phone: addEnquiryForm.phone || undefined,
              company: addEnquiryForm.company || undefined,
              eventType: addEnquiryForm.eventType || undefined,
              eventDate: addEnquiryForm.eventDate || undefined,
              guestCount: addEnquiryForm.guestCount ? parseInt(addEnquiryForm.guestCount) : undefined,
              budget: addEnquiryForm.budget ? parseFloat(addEnquiryForm.budget) : undefined,
              message: addEnquiryForm.message || undefined,
              status: addEnquiryForm.status,
              source: 'manual',
            });
          }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FIRST NAME *</label>
                <Input required value={addEnquiryForm.firstName} onChange={e => setAddEnquiryForm(f => ({ ...f, firstName: e.target.value }))}
                  placeholder="Jane" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">LAST NAME</label>
                <Input value={addEnquiryForm.lastName} onChange={e => setAddEnquiryForm(f => ({ ...f, lastName: e.target.value }))}
                  placeholder="Smith" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EMAIL</label>
                <Input type="email" value={addEnquiryForm.email} onChange={e => setAddEnquiryForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PHONE</label>
                <Input value={addEnquiryForm.phone} onChange={e => setAddEnquiryForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="021 000 0000" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EVENT TYPE</label>
                <Input value={addEnquiryForm.eventType} onChange={e => setAddEnquiryForm(f => ({ ...f, eventType: e.target.value }))}
                  placeholder="Wedding, Birthday, Corporate..." className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EVENT DATE</label>
                <Input type="date" value={addEnquiryForm.eventDate} onChange={e => setAddEnquiryForm(f => ({ ...f, eventDate: e.target.value }))}
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">GUEST COUNT</label>
                <Input type="number" value={addEnquiryForm.guestCount} onChange={e => setAddEnquiryForm(f => ({ ...f, guestCount: e.target.value }))}
                  placeholder="50" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">BUDGET (NZD)</label>
                <Input type="number" value={addEnquiryForm.budget} onChange={e => setAddEnquiryForm(f => ({ ...f, budget: e.target.value }))}
                  placeholder="5000" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">STATUS</label>
              <Select value={addEnquiryForm.status} onValueChange={v => setAddEnquiryForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger className="rounded-none border border-gold/30 text-xs font-bebas tracking-widest focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map(s => (
                    <SelectItem key={s.key} value={s.key} className="font-bebas text-xs tracking-widest">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">NOTES</label>
              <Textarea value={addEnquiryForm.message} onChange={e => setAddEnquiryForm(f => ({ ...f, message: e.target.value }))}
                rows={2} placeholder="Any additional details..." className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
            </div>
            <button type="submit" disabled={createEnquiry.isPending}
              className="btn-forest w-full font-bebas tracking-widest text-sm py-3 text-cream disabled:opacity-50">
              {createEnquiry.isPending ? 'ADDING...' : 'ADD ENQUIRY'}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── MOBILE BOTTOM TAB BAR (hidden on md+) ─────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border flex items-stretch h-16 safe-area-inset-bottom" style={{ boxShadow: '0 -1px 0 oklch(0.850 0.025 68)' }}>
        {[
          { id: "overview", label: "Home", icon: <LayoutDashboard className="w-5 h-5" /> },
          { id: "enquiries", label: "Enquiries", icon: <MessageSquare className="w-5 h-5" /> },
          { id: "calendar", label: "Calendar", icon: <Calendar className="w-5 h-5" /> },
          { id: "tasks", label: "Tasks", icon: <CheckCircle className="w-5 h-5" /> },
          { id: "settings", label: "More", icon: <Settings className="w-5 h-5" /> },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id as any)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
              tab === item.id ? "text-sage-dark" : "text-gray-400"
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-inter font-medium leading-none">{item.label}</span>
            {item.id === "enquiries" && unreadCount > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-14px)] min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
