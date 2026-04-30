import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  BarChart2, DollarSign, X, MapPin, LayoutGrid, Camera, Eye, EyeOff, Grid, Image as ImageIcon, Edit2,
  ArrowUpDown, CreditCard, AlertCircle, Upload, List, Columns, Table2, MoveUp, MoveDown, Lock, Type,
  SlidersHorizontal, GripVertical, Bell, Paperclip, Download, Printer
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { substituteTemplateVars, TEMPLATE_VARIABLES } from "@/lib/templateVars";
import { DashboardWidgets } from "@/components/DashboardWidgets";
import CsvImportModal from "@/components/CsvImportModal";
import StatusManager, { parseCustomStatuses, getStatusClasses, getStatusCalClasses, getStatusBarClasses, getStatusDayClasses, COLOR_PRESETS, type StatusDef } from "@/components/StatusManager";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import TasksPage from "@/pages/Tasks";
import ReportsPage from "@/pages/Reports";
import FloorPlanEditor, { type CanvasData } from "@/components/FloorPlanEditor";
import EventSpendSection from "@/components/EventSpendSection";

// ─── Contact Form Config ─────────────────────────────────────────────────────
type FormFieldDef = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'textarea';
  required: boolean;
  visible: boolean;
  isDefault: boolean;
};

const DEFAULT_FORM_FIELDS: FormFieldDef[] = [
  { id: 'firstName', label: 'First Name', type: 'text', required: true, visible: true, isDefault: true },
  { id: 'lastName', label: 'Last Name', type: 'text', required: false, visible: true, isDefault: true },
  { id: 'email', label: 'Email', type: 'email', required: true, visible: true, isDefault: true },
  { id: 'phone', label: 'Phone', type: 'tel', required: false, visible: true, isDefault: true },
  { id: 'company', label: 'Company / Organisation', type: 'text', required: false, visible: true, isDefault: true },
  { id: 'eventType', label: 'Type of Event', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'eventDate', label: 'Preferred Date', type: 'date', required: false, visible: true, isDefault: true },
  { id: 'guestCount', label: 'Guest Count', type: 'number', required: false, visible: true, isDefault: true },
  { id: 'budget', label: 'Approximate Budget (NZD)', type: 'number', required: false, visible: true, isDefault: true },
  { id: 'source', label: 'How did you hear about us?', type: 'select', required: false, visible: true, isDefault: true },
  { id: 'message', label: 'Message / Tell us more', type: 'textarea', required: false, visible: true, isDefault: true },
];

const FORM_FONTS = [
  { key: 'inter', label: 'Modern', sub: 'Inter / Sans-serif' },
  { key: 'serif', label: 'Elegant', sub: 'Georgia / Serif' },
  { key: 'cormorant', label: 'Classic', sub: 'Cormorant Garamond' },
  { key: 'dm', label: 'Refined', sub: 'DM Serif Display' },
];

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
  { key: "new", label: "NEW", color: "border-amber-400 bg-amber-100 text-amber-900" },
  { key: "contacted", label: "CONTACTED", color: "border-sky-400 bg-sky-100 text-sky-800" },
  { key: "proposal_sent", label: "PROPOSAL SENT", color: "border-blue-600 bg-blue-100 text-blue-900" },
  { key: "negotiating", label: "NEGOTIATING", color: "border-orange-400 bg-orange-100 text-orange-800" },
  { key: "booked", label: "CONFIRMED", color: "border-blue-500 bg-blue-100 text-blue-800" },
  { key: "lost", label: "LOST", color: "border-stone-400 bg-stone-200 text-stone-700" },
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
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-forest inline-block" />Confirmed</span>
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
            const dayBookings = (monthBookings ?? []).filter((b: any) => new Date(b.eventDate).getUTCDate() === day);
            const _bookedLeadIds = new Set((monthBookings ?? []).map((b: any) => b.leadId).filter(Boolean));
            const dayLeads = (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getUTCDate() === day && !_bookedLeadIds.has(l.id) && l.status !== 'lost');
            const hasConfirmed = dayBookings.some((b: any) => b.status === 'confirmed');
            const hasTentative = dayBookings.some((b: any) => b.status === 'tentative');
            const hasCancelled = dayBookings.some((b: any) => b.status === 'cancelled');
            const hasEnquiry = dayLeads.length > 0;
            const cellBg = hasConfirmed ? 'bg-blue-50 border-blue-300' : hasTentative ? 'bg-amber-50 border-amber-300' : hasCancelled ? 'bg-stone-50 border-stone-300' : hasEnquiry ? 'bg-rose-50 border-rose-300' : isToday ? 'bg-gold/10 border-gold' : 'border-transparent hover:bg-linen';
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
                    <span key={b.id} className={`w-2 h-2 rounded-full flex-shrink-0 ${b.status === 'confirmed' ? 'bg-forest' : b.status === 'tentative' ? 'bg-amber-400' : 'bg-stone-400'}`} />
                  ))}
                  {dayLeads.slice(0, 2).map((l: any) => (
                    <span key={l.id} className="w-2 h-2 rounded-full flex-shrink-0 bg-rose-400" />
                  ))}
                </div>
                {dayBookings.slice(0, 1).map((b: any) => (
                  <div key={b.id} className={`text-[9px] leading-tight font-dm truncate w-full mt-0.5 ${b.status === 'confirmed' ? 'text-forest' : b.status === 'tentative' ? 'text-amber-700' : 'text-stone-500'}`}>{b.firstName}</div>
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
          <CheckCircle className="w-10 h-10 text-forest mb-3" />
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

// ── Kanban Stage Customisation Dialog ─────────────────────────────────────
function KanbanSettingsDialog({
  open, onClose, allStages, currentPrefs, onSave,
}: {
  open: boolean;
  onClose: () => void;
  allStages: { key: string; label: string; color: string; swatch?: string }[];
  currentPrefs: { visible: string[]; order: string[] } | null;
  onSave: (prefs: { visible: string[]; order: string[] }) => void;
}) {
  const initialOrder = React.useMemo(() => {
    if (currentPrefs?.order?.length) {
      const ordered = currentPrefs.order.map(k => allStages.find(s => s.key === k)).filter(Boolean) as typeof allStages;
      const rest = allStages.filter(s => !currentPrefs.order.includes(s.key));
      return [...ordered, ...rest];
    }
    return allStages;
  }, [allStages, currentPrefs]);

  const [order, setOrder] = React.useState<typeof allStages>(initialOrder);
  const [visible, setVisible] = React.useState<Set<string>>(() => {
    if (currentPrefs?.visible?.length) return new Set(currentPrefs.visible);
    return new Set(allStages.map(s => s.key));
  });

  function moveUp(i: number) {
    if (i === 0) return;
    setOrder(prev => { const a = [...prev]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; });
  }
  function moveDown(i: number) {
    if (i === order.length - 1) return;
    setOrder(prev => { const a = [...prev]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; });
  }
  function toggleVisible(key: string) {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-inter text-base font-bold text-gray-900">Customise Pipeline Columns</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500 -mt-2 mb-3">Choose which stages to show and drag to reorder them.</p>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {order.map((stage, i) => (
            <div key={stage.key}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-white hover:bg-gray-50 transition-colors">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.swatch ?? '#d4c5a9' }} />
              <span className="flex-1 font-inter text-sm font-medium text-gray-800">{stage.label}</span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => moveUp(i)} disabled={i === 0}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors">
                  <MoveUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveDown(i)} disabled={i === order.length - 1}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors">
                  <MoveDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleVisible(stage.key)}
                  className={`ml-1 w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${visible.has(stage.key) ? 'bg-sage-green' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${visible.has(stage.key) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <button
            onClick={() => { onSave({ visible: Array.from(visible), order: order.map(s => s.key) }); onClose(); }}
            className="flex-1 bg-sage-green text-white font-inter text-sm font-semibold py-2 rounded-lg hover:bg-sage-dark transition-colors">
            Save
          </button>
          <button
            onClick={() => { onSave({ visible: allStages.map(s => s.key), order: allStages.map(s => s.key) }); onClose(); }}
            className="font-inter text-xs text-gray-400 hover:text-gray-600 px-3 py-2">
            Reset
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PipelineSnapshotWidget({ allLeads, onViewLeads, stages }: { allLeads: any; onViewLeads: () => void; stages?: { key: string; label: string; color: string }[] }) {
  const stageList = stages ?? PIPELINE_STAGES;
  const counts = stageList.map(s => ({
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

// ── Helper: redirects the "menu" top-level tab to Settings > Menu & Catalogue ──
function MenuTabRedirect({ setTab, setSettingsSubTab }: {
  setTab: (t: "settings") => void;
  setSettingsSubTab: (t: "menu") => void;
}) {
  useEffect(() => {
    setTab("settings");
    setSettingsSubTab("menu");
  }, []);
  return null;
}

// ── Settings Sidebar (Perfect Venue style) ─────────────────────────────────
function WaitlistPanel() {
  const waitlistData = trpc.waitlist.list.useQuery();
  const entries = waitlistData.data ?? [];
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-cormorant text-3xl font-semibold text-ink">Waitlist</h1>
        <span className="font-bebas tracking-widest text-xs text-forest bg-forest/10 px-3 py-1.5 rounded">{entries.length} {entries.length === 1 ? 'ENTRY' : 'ENTRIES'}</span>
      </div>
      {waitlistData.isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No waitlist entries yet.</div>
      ) : (
        <div className="bg-white border border-border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-ivory-sand">
                <th className="text-left px-4 py-3 font-bebas tracking-widest text-xs text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-bebas tracking-widest text-xs text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-bebas tracking-widest text-xs text-gray-500">Venue</th>
                <th className="text-left px-4 py-3 font-bebas tracking-widest text-xs text-gray-500">Message</th>
                <th className="text-left px-4 py-3 font-bebas tracking-widest text-xs text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any, i: number) => (
                <tr key={e.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-ivory-sand/40'}`}>
                  <td className="px-4 py-3 font-dm text-ink">{e.name}</td>
                  <td className="px-4 py-3 text-forest">
                    <a href={`mailto:${e.email}`} className="hover:underline">{e.email}</a>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.venueName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{e.message ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsSidebar({ settingsSubTab, setSettingsSubTab, venueName, venueLogoUrl }: {
  settingsSubTab: string;
  setSettingsSubTab: (t: any) => void;
  venueName?: string;
  venueLogoUrl?: string;
}) {
  const items = [
    { id: "venue", label: "Venue" },
    { id: "lead-form", label: "Contact Form" },
    { id: "floor-plans", label: "Floor Plans" },
    { id: "integrations", label: "Integrations" },
    { id: "menu", label: "Menu & Catalogue" },
    { id: "templates", label: "Templates" },
    { id: "email", label: "Email" },
    { id: "automated-tasks", label: "Automated Tasks" },
    { id: "taxes", label: "Taxes & Fees" },
    { id: "team", label: "Team" },
    { id: "billing", label: "Billing" },
    { id: "group-settings", label: "Group Settings" },
    { id: "statuses", label: "Enquiry Statuses" },
    { id: "waitlist", label: "Waitlist" },
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
          <div className="my-2 border-t border-border" />
          <a
            href="/daily-checklists"
            className="w-full text-left px-4 py-2 font-dm text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-l-2 border-transparent flex items-center justify-between group"
          >
            Daily Checklists
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
          <a
            href="/eon-report.html"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-left px-4 py-2 font-dm text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-l-2 border-transparent flex items-center justify-between group"
          >
            EON Report
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </a>
        </div>
      </aside>
    </>
  );
}

async function compressToDataUrl(file: File, maxW: number, maxH: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Failed to load image')); };
    img.src = blobUrl;
  });
}

export default function Dashboard() {
  const { user, isAuthenticated, loading, isTeamMember } = useAuth();
  const [, setLocation] = useLocation();
  type DashTab = "overview"|"enquiries"|"pipeline"|"calendar"|"contacts"|"menu"|"settings"|"tasks"|"reports"|"expressbook";
  type SettingsSubTab = "venue"|"lead-form"|"integrations"|"menu"|"templates"|"email"|"automated-tasks"|"taxes"|"team"|"billing"|"group-settings"|"profile"|"email-settings"|"floor-plans"|"statuses"|"waitlist";
  const DASH_TABS: readonly DashTab[] = ["overview","enquiries","pipeline","calendar","contacts","menu","settings","tasks","reports","expressbook"];
  const SETTINGS_SUB_TABS: readonly SettingsSubTab[] = ["venue","lead-form","integrations","menu","templates","email","automated-tasks","taxes","team","billing","group-settings","profile","email-settings","floor-plans","statuses","waitlist"];
  const isDashTab = (v: string | null): v is DashTab => v !== null && (DASH_TABS as readonly string[]).includes(v);
  const isSettingsSubTab = (v: string | null): v is SettingsSubTab => v !== null && (SETTINGS_SUB_TABS as readonly string[]).includes(v);
  const _qp = new URLSearchParams(window.location.search);
  const _rawTab = _qp.get('tab');
  const _rawSub = _qp.get('sub');
  const _initTab: DashTab = isDashTab(_rawTab) ? _rawTab : "overview";
  const _initSubTab: SettingsSubTab = isSettingsSubTab(_rawSub) ? _rawSub : "venue";
  const [tab, setTab] = useState<DashTab>(_initTab);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>(_initSubTab);
  const [venueSettingsSection, setVenueSettingsSection] = useState<"details"|"profile"|"spaces">("details");
  const [menuSettingsSection, setMenuSettingsSection] = useState<"packages"|"catalogue">("packages");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [leadsSubTab, setLeadsSubTab] = useState<"new" | "all">("new");
  const [leadSortBy, setLeadSortBy] = useState<"enquiry_date"|"event_date"|"status">("enquiry_date");
  const [leadSortDir, setLeadSortDir] = useState<"desc"|"asc">("desc");
  const [leadDateFilter, setLeadDateFilter] = useState<"all"|"future"|"today"|"weekend"|"month"|"year"|"custom">("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [leadViewMode, setLeadViewMode] = useState<"list"|"table"|"kanban">("list");
  const [kanbanDetailOpen, setKanbanDetailOpen] = useState(false);
  const [kanbanSettingsOpen, setKanbanSettingsOpen] = useState(false);
  const [kanbanStagePrefs, setKanbanStagePrefs] = useState<{ visible: string[]; order: string[] } | null>(null);
  const [eventSortBy, setEventSortBy] = useState<"event_date"|"date_booked"|"status">("event_date");
  const [eventSortDir, setEventSortDir] = useState<"asc"|"desc">("asc");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
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
  const [showStatsCustomize, setShowStatsCustomize] = useState(false);
  const [hiddenStats, setHiddenStats] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('vfhq_hidden_stats') ?? '[]')); } catch { return new Set(); }
  });
  const [widgetSizes, setWidgetSizes] = useState<Record<string, 'half' | 'full'>>({});
  const [collapsedInboxSections, setCollapsedInboxSections] = useState<Set<string>>(new Set());
  const [showAddLead, setShowAddLead] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [enquiryPasteText, setEnquiryPasteText] = useState('');
  const [enquiryParsing, setEnquiryParsing] = useState(false);
  const [enquiryPasteMode, setEnquiryPasteMode] = useState(true);
  const [addEnquiryForm, setAddEnquiryForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', eventType: '', eventDate: '', guestCount: '', budget: '', message: '', status: 'new' as const });

  const utils = trpc.useUtils();

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user?.id });
  const { data: overdueLeads, refetch: refetchOverdue } = trpc.leads.overdue.useQuery(undefined, { enabled: !!user?.id });
  const { data: allLeads, refetch: refetchLeads } = trpc.leads.list.useQuery(
    { status: (leadStatusFilter === "all" || leadStatusFilter === "overdue_followup") ? undefined : leadStatusFilter },
    { enabled: !!user?.id, refetchInterval: 30_000 }
  );

  // ── In-app new enquiry notifications ──────────────────────────────────────
  const knownMaxLeadId = useRef<number | null>(null);
  const notifPermission = useRef<string>("default");
  useEffect(() => {
    if (typeof Notification !== "undefined") {
      notifPermission.current = Notification.permission;
      if (Notification.permission === "default") {
        Notification.requestPermission().then(p => { notifPermission.current = p; });
      }
    }
  }, []);
  useEffect(() => {
    if (!allLeads || allLeads.length === 0) return;
    const maxId = Math.max(...allLeads.map((l: any) => l.id));
    if (knownMaxLeadId.current === null) {
      knownMaxLeadId.current = maxId;
      return;
    }
    if (maxId > knownMaxLeadId.current) {
      const newest = allLeads.find((l: any) => l.id === maxId);
      const name = [newest?.firstName, newest?.lastName].filter(Boolean).join(" ") || "Someone";
      toast.success(`New enquiry from ${name}!`, {
        description: newest?.email ?? "",
        duration: 8000,
        action: { label: "View", onClick: () => setSelectedLead(newest) },
      });
      if (notifPermission.current === "granted") {
        new Notification("New Enquiry — VenueFlow", {
          body: `${name}${newest?.email ? " · " + newest.email : ""}`,
          icon: "/logo-icon.png",
        });
      }
      knownMaxLeadId.current = maxId;
    }
  }, [allLeads]);
  const { data: selectedLeadActivity } = trpc.leads.getActivity.useQuery(
    { leadId: selectedLead?.id ?? 0 },
    { enabled: !!selectedLead?.id }
  );
  const { data: selectedLeadRunsheets } = trpc.runsheets.list.useQuery(
    { leadId: selectedLead?.id ?? 0 },
    { enabled: !!selectedLead?.id }
  );
  const { data: venueSettings, refetch: refetchSettings } = trpc.venue.get.useQuery(
    { ownerId: user?.id },
    { enabled: !!user?.id }
  );
  const pipelineStages = React.useMemo(() => {
    const defs = parseCustomStatuses((venueSettings as any)?.customStatuses);
    return defs.map(d => {
      const preset = COLOR_PRESETS.find(c => c.id === d.colorId) ?? COLOR_PRESETS[0];
      return {
        key: d.key,
        label: d.label,
        color: preset.classes,
        swatch: preset.swatch,
        calClasses: preset.calClasses,
        barClasses: preset.barClasses,
        dayClasses: preset.dayClasses,
      };
    });
  }, [venueSettings]);

  const getStatusInfo = React.useCallback((key: string) => {
    // 'confirmed' (booking status enum) should display identically to 'booked' (lead status)
    const lookupKey = key === 'confirmed' ? 'booked' : key;
    const s = pipelineStages.find(p => p.key === lookupKey);
    if (s) return s;
    return {
      key,
      label: (key ?? '').replace(/_/g, ' ').toUpperCase(),
      color: "border-gray-400 bg-gray-100 text-gray-700",
      swatch: "#9ca3af",
      calClasses: "bg-gray-300 text-gray-800",
      barClasses: "bg-gray-300",
      dayClasses: "border-l-4 border-gray-400 bg-gray-50",
    };
  }, [pipelineStages]);

  const saveKanbanPrefs = React.useCallback((prefs: { visible: string[]; order: string[] }) => {
    const key = `kanban_stage_prefs_${user?.id ?? "default"}`;
    localStorage.setItem(key, JSON.stringify(prefs));
    setKanbanStagePrefs(prefs);
  }, [user?.id]);

  const kanbanStages = React.useMemo(() => {
    if (!kanbanStagePrefs) return pipelineStages;
    const { visible, order } = kanbanStagePrefs;
    const ordered = order.length > 0
      ? order.map(k => pipelineStages.find(s => s.key === k)).filter(Boolean) as typeof pipelineStages
      : pipelineStages;
    return ordered.filter(s => !visible.length || visible.includes(s.key));
  }, [pipelineStages, kanbanStagePrefs]);
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
  // Adjacent month data for week/day view (handles month boundaries)
  const adjNextMonthDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1);
  const adjPrevMonthDate = new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1);
  const { data: adjMonthBookings } = trpc.bookings.byMonth.useQuery(
    { year: adjNextMonthDate.getFullYear(), month: adjNextMonthDate.getMonth() + 1 },
    { enabled: !!user?.id }
  );
  const { data: adjMonthLeadEvents } = trpc.leads.eventsByMonth.useQuery(
    { year: adjNextMonthDate.getFullYear(), month: adjNextMonthDate.getMonth() + 1 },
    { enabled: !!user?.id }
  );
  const { data: adjPrevMonthBookings } = trpc.bookings.byMonth.useQuery(
    { year: adjPrevMonthDate.getFullYear(), month: adjPrevMonthDate.getMonth() + 1 },
    { enabled: !!user?.id && calendarView === 'week' }
  );
  const { data: adjPrevMonthLeadEvents } = trpc.leads.eventsByMonth.useQuery(
    { year: adjPrevMonthDate.getFullYear(), month: adjPrevMonthDate.getMonth() + 1 },
    { enabled: !!user?.id && calendarView === 'week' }
  );


  // ── Widget layout preferences ──────────────────────────────────────────
  const { data: userPrefs } = trpc.userPreferences.get.useQuery(undefined, {
    enabled: !!user?.id,
  });
  // Load saved layout when prefs arrive
  const prefsLoaded = useRef(false);
  const suppressStatusToast = useRef(false);
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

  const [editingEventDetails, setEditingEventDetails] = useState(false);
  const [eventDetailForm, setEventDetailForm] = useState<any>({});
  const updateLeadDetails = trpc.leads.update.useMutation({
    onSuccess: (_data, vars) => {
      refetchLeads();
      setSelectedLead((prev: any) => prev ? { ...prev, ...vars } : prev);
      setEditingEventDetails(false);
      toast.success("Event details saved");
    },
    onError: () => toast.error("Failed to save event details"),
  });
  const updateStatus = trpc.leads.updateStatus.useMutation({
    onSuccess: (_data, variables) => {
      refetchLeads();
      setSelectedLead((prev: any) => prev ? { ...prev, status: variables.status } : prev);
      if (selectedLead) utils.leads.getActivity.invalidate({ leadId: selectedLead.id });
      if (suppressStatusToast.current) {
        suppressStatusToast.current = false;
        return;
      }
      if (variables.status === 'function_pack_sent') {
        toast.success("Status updated — a follow-up reminder has been added to your Tasks for 5 days from now.");
      } else {
        toast.success("Status updated");
      }
    },
    onError: () => {
      suppressStatusToast.current = false;
    },
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
  const bulkDelete = trpc.leads.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate();
      utils.leads.overdue.invalidate();
      setSelectedLeadIds(new Set());
      setBulkSelectMode(false);
      setShowBulkDeleteConfirm(false);
      toast.success(`${data.deleted} enquir${data.deleted === 1 ? 'y' : 'ies'} deleted`);
    },
    onError: (err) => toast.error(err.message || 'Delete failed'),
  });
  const addNote = trpc.leads.addNote.useMutation({
    onSuccess: () => {
      setNoteText("");
      utils.leads.getActivity.invalidate({ leadId: selectedLead?.id });
      if (selectedLead?.status === 'new') {
        suppressStatusToast.current = true;
        updateStatus.mutate({ id: selectedLead.id, status: 'contacted' });
        setSelectedLead((prev: any) => prev ? { ...prev, status: 'contacted' } : prev);
        toast.success("Note added! Enquiry moved to Events.");
      } else {
        toast.success("Note added");
      }
    },
  });
  const createRunsheet = trpc.runsheets.create.useMutation({
    onSuccess: (data, variables) => {
      toast.success('Runsheet created!');
      const leadParam = variables.leadId ? `&leadId=${variables.leadId}` : '';
      setLocation(`/runsheet?id=${data.id}${leadParam}`);
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
      utils.leads.list.invalidate();
      utils.leads.overdue.invalidate();
      utils.dashboard.stats.invalidate();
      setSelectedLead(null);
      toast.success("Record deleted");
    },
    onError: () => toast.error("Failed to delete record"),
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
    setEditingEventDetails(false);
    // Note: selectLead is defined below; this is the inner implementation
    if (lead && !lead.readAt) {
      markRead.mutate({ id: lead.id });
    }
  }

  const parseEnquiryMutation = trpc.leads.parseEnquiryText.useMutation({
    onSuccess: (result) => {
      if (result.success && result.data) {
        const d = result.data as any;
        setAddEnquiryForm(f => ({
          ...f,
          firstName: d.firstName ?? f.firstName,
          lastName: d.lastName ?? f.lastName,
          email: d.email ?? f.email,
          phone: d.phone ?? f.phone,
          company: d.company ?? f.company,
          eventType: d.eventType ?? f.eventType,
          eventDate: d.eventDate ?? f.eventDate,
          guestCount: d.guestCount ? String(d.guestCount) : f.guestCount,
          budget: d.budget ? String(d.budget) : f.budget,
          message: d.message ?? f.message,
        }));
        setEnquiryPasteMode(false);
        toast.success('Details extracted — review and confirm below');
      } else {
        toast.error('Could not extract details — try adding manually');
      }
      setEnquiryParsing(false);
    },
    onError: () => { toast.error('Failed to parse text'); setEnquiryParsing(false); },
  });

  const createEnquiry = trpc.leads.create.useMutation({
    onSuccess: () => {
      refetchLeads();
      setShowAddLead(false);
      setAddEnquiryForm({ firstName: '', lastName: '', email: '', phone: '', company: '', eventType: '', eventDate: '', guestCount: '', budget: '', message: '', status: 'new' });
      setEnquiryPasteText('');
      setEnquiryPasteMode(true);
      toast.success('Added successfully!');
    },
    onError: () => toast.error('Failed to add record'),
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
    onError: (err) => toast.error(err.message || "Failed to save settings"),
  });
  const testEmailMutation = trpc.venue.testEmail.useMutation({
    onSuccess: () => toast.success("Test email sent! Check your inbox."),
    onError: (err) => toast.error(err.message || "Failed to send test email"),
  });
  const verifyNbiMutation = trpc.venue.verifyNbi.useMutation({
    onSuccess: (data) => {
      if (data.valid) {
        toast.success(`Connected to NowBookIt${data.venueName ? ` — ${data.venueName}` : ''}!`);
      } else {
        toast.error(`NowBookIt connection failed: ${data.error ?? 'Unknown error'}`);
      }
    },
    onError: (err) => toast.error(err.message || "Failed to verify NowBookIt credentials"),
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
  const [emailAttachments, setEmailAttachments] = useState<Array<{ filename: string; content: string; contentType: string }>>([]);
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
      setEmailAttachments([]);
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
  const { data: menuSectionsList, refetch: refetchMenuSections } = trpc.menuSections.list.useQuery(undefined, { enabled: !!user?.id && settingsSubTab === 'menu' && menuSettingsSection === 'packages' });
  const { data: salesCategoriesList, refetch: refetchSalesCategories } = trpc.salesCategories.list.useQuery(undefined, { enabled: !!user?.id && settingsSubTab === 'menu' && menuSettingsSection === 'packages' });
  const [menuSettingsTab, setMenuSettingsTab] = useState<'sections'|'categories'|'items'>('sections');
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionForm, setSectionForm] = useState({ name: '', salesCategory: '', hasSalesTax: true, hasAdminFee: true, hasGratuity: true, applyToMin: true });
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const createMenuSection = trpc.menuSections.create.useMutation({ onSuccess: () => { refetchMenuSections(); setShowSectionForm(false); setSectionForm({ name: '', salesCategory: '', hasSalesTax: true, hasAdminFee: true, hasGratuity: true, applyToMin: true }); toast.success('Section added!'); } });
  const deleteMenuSection = trpc.menuSections.delete.useMutation({ onSuccess: () => { refetchMenuSections(); toast.success('Section deleted'); } });
  const createSalesCategory = trpc.salesCategories.create.useMutation({ onSuccess: () => { refetchSalesCategories(); setShowCategoryForm(false); setCategoryForm({ name: '' }); toast.success('Category added!'); } });
  const deleteSalesCategory = trpc.salesCategories.delete.useMutation({ onSuccess: () => { refetchSalesCategories(); toast.success('Category deleted'); } });

  // Menu Catalogue state
  const { data: catalogCategories, refetch: refetchCatalogCategories } = trpc.menuCatalog.listCategories.useQuery({ type: 'all' }, { enabled: !!user?.id && settingsSubTab === 'menu' && menuSettingsSection === 'catalogue' });
  const [catalogActiveType, setCatalogActiveType] = useState<'food'|'drink'>('food');
  const [catalogActiveCategoryId, setCatalogActiveCategoryId] = useState<number|null>(null);
  const { data: catalogItems, refetch: refetchCatalogItems } = trpc.menuCatalog.listItems.useQuery(
    { categoryId: catalogActiveCategoryId ?? undefined },
    { enabled: !!user?.id && settingsSubTab === 'menu' && menuSettingsSection === 'catalogue' && catalogActiveCategoryId !== null }
  );
  const [showCatalogCategoryForm, setShowCatalogCategoryForm] = useState(false);
  const [catalogCategoryForm, setCatalogCategoryForm] = useState({ name: '', type: 'food' as 'food'|'drink', description: '' });
  const [showCatalogItemForm, setShowCatalogItemForm] = useState(false);
  const [editingCatalogItemId, setEditingCatalogItemId] = useState<number|null>(null);
  const [catalogItemForm, setCatalogItemForm] = useState({ name: '', description: '', pricingType: 'per_person' as 'per_person'|'per_item', price: '', unit: 'person', allergens: '' });
  const [catalogCsvText, setCatalogCsvText] = useState('');
  const [showCatalogCsvImport, setShowCatalogCsvImport] = useState(false);
  const [catalogGuestCount, setCatalogGuestCount] = useState('');
  const duplicateCatalogItem = trpc.menuCatalog.createItem.useMutation({
    onSuccess: () => { refetchCatalogItems(); toast.success('Item duplicated!'); }
  });

  // Automated task rules
  const [showAddTaskRule, setShowAddTaskRule] = useState(false);
  const [taskRuleForm, setTaskRuleForm] = useState({ name: '', trigger: 'days_before_event', daysOffset: '3', priority: 'medium' });

  // Team members
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: '', email: '', role: 'staff' });
  const { data: teamList, refetch: refetchTeam } = trpc.team.list.useQuery(undefined, { enabled: !!user?.id });
  const createTeamMember = trpc.team.create.useMutation({ onSuccess: () => { refetchTeam(); setTeamForm({ name: '', email: '', role: 'staff' }); setShowTeamForm(false); toast.success('Team member added!'); } });
  const deleteTeamMember = trpc.team.delete.useMutation({ onSuccess: () => { refetchTeam(); toast.success('Team member removed'); } });

  const createCatalogCategory = trpc.menuCatalog.createCategory.useMutation({
    onSuccess: () => { refetchCatalogCategories(); setShowCatalogCategoryForm(false); setCatalogCategoryForm({ name: '', type: 'food', description: '' }); toast.success('Category created!'); }
  });
  const deleteCatalogCategory = trpc.menuCatalog.deleteCategory.useMutation({
    onSuccess: () => { refetchCatalogCategories(); setCatalogActiveCategoryId(null); toast.success('Category deleted'); }
  });
  const createCatalogItem = trpc.menuCatalog.createItem.useMutation({
    onSuccess: () => { refetchCatalogItems(); setShowCatalogItemForm(false); setEditingCatalogItemId(null); setCatalogItemForm({ name: '', description: '', pricingType: 'per_person', price: '', unit: 'person', allergens: '' }); toast.success('Item added!'); }
  });
  const updateCatalogItem = trpc.menuCatalog.updateItem.useMutation({
    onSuccess: () => { refetchCatalogItems(); setShowCatalogItemForm(false); setEditingCatalogItemId(null); setCatalogItemForm({ name: '', description: '', pricingType: 'per_person', price: '', unit: 'person', allergens: '' }); toast.success('Item updated!'); }
  });
  const deleteCatalogItem = trpc.menuCatalog.deleteItem.useMutation({
    onSuccess: () => { refetchCatalogItems(); toast.success('Item deleted'); }
  });
  const bulkCreateCatalogItems = trpc.menuCatalog.bulkCreateItems.useMutation({
    onSuccess: (data) => { refetchCatalogItems(); setShowCatalogCsvImport(false); setCatalogCsvText(''); toast.success(`Imported ${data.count} items!`); }
  });

  // Bar menu state
  const { data: barMenuItemsList, refetch: refetchBarMenu } = trpc.barMenu.list.useQuery(undefined, { enabled: isAuthenticated });
  const [showBarItemForm, setShowBarItemForm] = useState(false);
  const [barItemForm, setBarItemForm] = useState({ category: "Wine", name: "", description: "", pricePerUnit: "", unit: "per glass" });
  const [editingBarItemId, setEditingBarItemId] = useState<number|null>(null);

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
      if (result?.id) {
        setEditingFloorPlan((prev: any) => ({ ...prev, id: result.id }));
      }
      toast.success('Floor plan saved!');
    },
    onError: () => toast.error('Failed to save floor plan'),
  });
  const deleteFloorPlan = trpc.floorPlans.delete.useMutation({
    onSuccess: () => { refetchFloorPlans(); toast.success('Floor plan deleted'); },
    onError: () => toast.error('Failed to delete floor plan'),
  });

  // Furniture inventory
  const { data: furnitureInventory, refetch: refetchFurnitureInventory } = trpc.furnitureInventory.list.useQuery(
    undefined, { enabled: !!user?.id && settingsSubTab === 'floor-plans' }
  );
  const [showInvForm, setShowInvForm] = useState(false);
  const [editingInvId, setEditingInvId] = useState<number | null>(null);
  const [invForm, setInvForm] = useState({ name: '', type: 'rect_table', color: '#d4a574', width: 120, height: 60, seats: '', quantity: '', notes: '' });
  const createFurniture = trpc.furnitureInventory.create.useMutation({
    onSuccess: () => { refetchFurnitureInventory(); setShowInvForm(false); setEditingInvId(null); setInvForm({ name: '', type: 'rect_table', color: '#d4a574', width: 120, height: 60, seats: '', quantity: '', notes: '' }); toast.success('Item added'); },
    onError: () => toast.error('Failed to add item'),
  });
  const updateFurniture = trpc.furnitureInventory.update.useMutation({
    onSuccess: () => { refetchFurnitureInventory(); setEditingInvId(null); setShowInvForm(false); setInvForm({ name: '', type: 'rect_table', color: '#d4a574', width: 120, height: 60, seats: '', quantity: '', notes: '' }); toast.success('Item updated'); },
    onError: () => toast.error('Failed to update item'),
  });
  const deleteFurniture = trpc.furnitureInventory.delete.useMutation({
    onSuccess: () => { refetchFurnitureInventory(); toast.success('Item removed'); },
    onError: () => toast.error('Failed to remove item'),
  });
  const handleSaveFurniture = () => {
    if (!invForm.name.trim()) { toast.error('Name is required'); return; }
    const payload = { name: invForm.name.trim(), type: invForm.type, color: invForm.color, width: invForm.width, height: invForm.height, seats: invForm.seats ? parseInt(invForm.seats) : undefined, quantity: invForm.quantity ? parseInt(invForm.quantity) : undefined, notes: invForm.notes || undefined };
    if (editingInvId) { updateFurniture.mutate({ id: editingInvId, ...payload }); } else { createFurniture.mutate(payload); }
  };

  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [formFields, setFormFields] = useState<FormFieldDef[] | null>(null);
  const [galleryDragIdx, setGalleryDragIdx] = useState<number | null>(null);
  const [galleryDragOverIdx, setGalleryDragOverIdx] = useState<number | null>(null);
  const [newCustomFieldLabel, setNewCustomFieldLabel] = useState('');
  const [newCustomFieldType, setNewCustomFieldType] = useState<FormFieldDef['type']>('text');

  useEffect(() => {
    if (settingsSubTab === 'lead-form' && settingsForm && formFields === null) {
      if (settingsForm.customFormFields) {
        try {
          const parsed = JSON.parse(settingsForm.customFormFields);
          if (Array.isArray(parsed)) { setFormFields(parsed); return; }
        } catch {}
      }
      setFormFields(DEFAULT_FORM_FIELDS.map(f => ({ ...f })));
    }
  }, [settingsSubTab, settingsForm, formFields]);

  useMemo(() => {
    if (!settingsForm && venueSettings) {
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
        formFont: vs?.formFont ?? "inter",
        formGalleryImages: vs?.formGalleryImages ?? "[]",
        logoScale: vs?.logoScale ?? 100,
        galleryPhotoHeight: vs?.galleryPhotoHeight ?? 128,
        formPageBg: (vs as any)?.formPageBg ?? "#f8f5f0",
        formPageBgImage: (vs as any)?.formPageBgImage ?? "",
        formCardBg: (vs as any)?.formCardBg ?? "#ffffff",
        formButtonColor: (vs as any)?.formButtonColor ?? "",
        formSuccessMessage: (vs as any)?.formSuccessMessage ?? "",
        operatingHours: vs?.operatingHours ?? JSON.stringify([
          { day: "Sunday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Monday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Tuesday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Wednesday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Thursday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Friday", enabled: true, start: "08:00", end: "22:00" },
          { day: "Saturday", enabled: true, start: "08:00", end: "22:00" },
        ]),
        emailSignature: vs?.emailSignature ?? "",
        emailSignatureLogo: (vs as any)?.emailSignatureLogo ?? "",
        customCourses: vs?.customCourses ?? "",
      });
    }
   }, [venueSettings]);

  // Apply colour theme from venue settings
  useEffect(() => {
    const themeKey = (venueSettings as any)?.themeKey ?? 'sage';
    document.documentElement.setAttribute('data-theme', themeKey);
  }, [venueSettings]);

  // Load kanban stage prefs from localStorage once user is known
  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`kanban_stage_prefs_${user.id}`);
      if (raw) setKanbanStagePrefs(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [user?.id]);

  // Confirmed statuses are treated as Events (shown on Calendar), not Enquiries
  const CONFIRMED_STATUSES = ['booked', 'confirmed'];
  const allEnquiries = (allLeads ?? []);
  const activeEnquiries = allEnquiries.filter((l: any) => !CONFIRMED_STATUSES.includes(l.status));
  const newEnquiries = activeEnquiries
    .filter((l: any) => l.status === "new")
    .slice()
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadCount = newEnquiries.filter((l: any) => !l.readAt).length;
  const repliedLeads = allEnquiries.filter((l: any) => l.status !== "new");

  // Auto-switch to "all" when there are no new enquiries
  useEffect(() => {
    if (allLeads && newEnquiries.length === 0 && leadsSubTab === "new") {
      setLeadsSubTab("all");
    }
  }, [newEnquiries.length, allLeads]);

  function applyDateFilter(list: any[]) {
    if (leadDateFilter === "all") return list;
    const now = new Date();
    return list.filter((l: any) => {
      const d = l.eventDate ? new Date(l.eventDate) : null;
      if (!d) return false;
      if (leadDateFilter === "future") {
        const today = new Date(); today.setHours(0,0,0,0);
        return d >= today;
      }
      if (leadDateFilter === "today") {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      }
      if (leadDateFilter === "weekend") {
        // Find the upcoming Saturday and Sunday
        const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...,6=Sat
        const daysToSat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
        const sat = new Date(now); sat.setDate(now.getDate() + daysToSat); sat.setHours(0,0,0,0);
        const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
        const dNorm = new Date(d); dNorm.setHours(0,0,0,0);
        return dNorm.getTime() === sat.getTime() || dNorm.getTime() === sun.getTime();
      }
      if (leadDateFilter === "month") {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (leadDateFilter === "year") {
        return d.getFullYear() === now.getFullYear();
      }
      if (leadDateFilter === "custom") {
        const from = customDateFrom ? new Date(customDateFrom) : null;
        const to = customDateTo ? new Date(customDateTo) : null;
        if (from && d < from) return false;
        if (to) { const toEnd = new Date(to); toEnd.setHours(23,59,59,999); if (d > toEnd) return false; }
        return true;
      }
      return true;
    });
  }

  const leadsToShow = leadStatusFilter === "overdue_followup"
    ? applyDateFilter(allEnquiries).filter((l: any) => l.followUpDate && new Date(l.followUpDate) < new Date())
    : leadStatusFilter !== "all"
    ? applyDateFilter(allEnquiries)
    : leadsSubTab === "new" ? applyDateFilter(newEnquiries) : applyDateFilter(repliedLeads);
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
        const order = ['new','contacted','proposal_sent','site_visit','negotiating','function_pack_sent','booked','confirmed','lost','cancelled'];
        cmp = (order.indexOf(a.status) ?? 99) - (order.indexOf(b.status) ?? 99);
      }
      return leadSortDir === 'asc' ? cmp : -cmp;
    });

  // Calendar
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const bookingDays = new Set((monthBookings ?? []).map((b: any) => new Date(b.eventDate).getUTCDate()));
  const followUpDays = new Set((monthFollowUps ?? []).map((l: any) => new Date(l.followUpDate).getUTCDate()));
  const leadEventDays = new Set((monthLeadEvents ?? []).map((l: any) => new Date(l.eventDate).getUTCDate()));
  // Deduplicate: leads that already have a booking record should not show as separate lead cards
  const bookedLeadIds = new Set((monthBookings ?? []).map((b: any) => b.leadId).filter(Boolean));

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
            <img src="/logo-full.png" alt="VenueFlow" className="h-9 w-auto" />
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
    <div className="h-screen bg-background font-inter flex flex-col overflow-hidden">
      {/* ── TOP NAVIGATION BAR ──────────────────────────────────────────────── */}
      <nav className="bg-white sticky top-0 z-50 border-b border-border h-14 flex items-center px-4" style={{ boxShadow: '0 1px 0 oklch(0.850 0.025 68)' }}>
        {/* Logo */}
        <button onClick={() => setTab("overview" as any)} className="flex items-center pr-5 border-r border-border mr-4 flex-shrink-0 focus:outline-none">
          <img src="/logo-full.png" alt="VenueFlow" className="h-7 w-auto" />
        </button>
        {/* Primary nav tabs — hidden on mobile (shown in bottom bar instead) */}
        <div className="hidden md:flex items-center">
          {[
            { id: "overview", label: "Home" },
            { id: "enquiries", label: "Events" },
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
            {tab === "overview" ? "Home" : tab === "enquiries" ? "Events" : tab === "calendar" ? "Calendar" : tab === "tasks" ? "Tasks" : tab === "reports" ? "Reports" : "Settings"}
          </span>
        </div>
        {/* Spacer (desktop only) */}
        <div className="hidden md:flex flex-1" />
        {/* Right: venue name + avatar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Notification bell */}
          <button
            onClick={() => { setTab("enquiries" as any); setLeadsSubTab("new"); }}
            className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            title={unreadCount > 0 ? `${unreadCount} unread enquir${unreadCount === 1 ? 'y' : 'ies'}` : "No new enquiries"}
          >
            <Bell className={`w-4.5 h-4.5 ${unreadCount > 0 ? 'text-sage-dark' : 'text-gray-400'}`} />
            {unreadCount > 0 && (
              <>
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </>
            )}
          </button>
          <ThemeSwitcher />
          <span className="font-inter text-stormy text-sm hidden md:block">{venueSettings?.name ?? "Your Venue"}</span>
          <div className="w-8 h-8 rounded-full bg-sage-green flex items-center justify-center font-inter text-white text-sm font-semibold">
            {(user?.name ?? "U").charAt(0).toUpperCase()}
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* No sidebar — full-width main content */}

        {/* Main Content */}
        <main className={`flex-1 ${tab === "enquiries" ? "overflow-hidden" : "overflow-auto pb-16 md:pb-0"}`}>

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          {tab === "overview" && (() => {
            const allStats = [
              { id: "active_enquiries", label: "Active Enquiries", value: stats?.newLeads ?? 0, sub: "in pipeline", icon: <MessageSquare className="w-5 h-5 text-sage-dark" /> },
              { id: "upcoming_events", label: "Upcoming Events", value: stats?.upcomingEvents ?? 0, sub: "next 30 days", icon: <Calendar className="w-5 h-5 text-blue-500" /> },
              { id: "proposals_sent", label: "Proposals Sent", value: stats?.proposalsSent ?? 0, sub: "this period", icon: <FileText className="w-5 h-5 text-forest" /> },
              { id: "conversion_rate", label: "Conversion Rate", value: `${stats?.conversionRate ?? 0}%`, sub: "leads → booked", icon: <TrendingUp className="w-5 h-5 text-forest" /> },
              { id: "revenue_month", label: "Revenue This Month", value: `$${Math.round(stats?.revenueThisMonth ?? 0).toLocaleString()}`, sub: "confirmed bookings", icon: <DollarSign className="w-5 h-5 text-amber-600" /> },
              { id: "overdue_tasks", label: "Overdue Tasks", value: stats?.overdueTasks ?? 0, sub: (stats?.overdueTasks ?? 0) > 0 ? "action required" : "all clear", icon: <AlertCircle className={`w-5 h-5 ${(stats?.overdueTasks ?? 0) > 0 ? 'text-red-500' : 'text-sage/40'}`} /> },
              { id: "overdue_followups", label: "Overdue Follow-ups", value: stats?.overdueFollowUps ?? 0, sub: (stats?.overdueFollowUps ?? 0) > 0 ? "action required" : "all clear", icon: <Clock className={`w-5 h-5 ${(stats?.overdueFollowUps ?? 0) > 0 ? 'text-red-600' : 'text-sage/40'}`} /> },
            ];
            const visibleStats = allStats.filter(s => !hiddenStats.has(s.id));
            return (
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="font-cormorant text-3xl font-semibold text-ink">Overview</h1>
                  <p className="font-dm text-sm text-sage mt-0.5">Your venue at a glance</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowStatsCustomize(v => !v)}
                      className="flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-2 border border-border text-sage hover:text-ink hover:border-ink/30 transition-colors"
                    >
                      <Settings className="w-3 h-3" /> CUSTOMISE
                    </button>
                    {showStatsCustomize && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-border shadow-lg p-3 z-30 w-52">
                        <div className="font-bebas text-xs tracking-widest text-ink/50 mb-2">SHOW / HIDE CARDS</div>
                        {allStats.map(s => (
                          <label key={s.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-linen px-1">
                            <input type="checkbox" checked={!hiddenStats.has(s.id)} onChange={() => {
                              setHiddenStats(prev => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                                localStorage.setItem('vfhq_hidden_stats', JSON.stringify([...next]));
                                return next;
                              });
                            }} className="w-3.5 h-3.5 accent-forest" />
                            <span className="font-dm text-xs text-ink">{s.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setAddEnquiryForm(f => ({ ...f })); setShowAddLead(true); }}
                    className="flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-2 bg-forest text-cream hover:bg-forest-dark transition-colors">
                    <Plus className="w-3.5 h-3.5" /> ADD EVENT
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              {visibleStats.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {visibleStats.map(s => (
                    <div key={s.id} className="dante-card p-5">
                      <div className="mb-3">{s.icon}</div>
                      <div className="font-cormorant text-4xl font-semibold text-ink mb-1">{s.value}</div>
                      <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
                      <div className="font-dm text-xs text-sage/60 mt-0.5">{s.sub}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Calendar + Sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar card */}
                <div className="lg:col-span-2 dante-card overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0">
                    <button onClick={() => setCalDate(new Date(year, month - 1, 1))} className="p-1.5 hover:bg-linen transition-colors text-sage"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => setCalDate(new Date(year, month + 1, 1))} className="p-1.5 hover:bg-linen transition-colors text-sage"><ChevronRight className="w-4 h-4" /></button>
                    <h2 className="font-cormorant text-lg font-semibold text-ink flex-1">{MONTHS[month]} {year}</h2>
                    <button onClick={() => setCalDate(new Date())} className="font-bebas tracking-widest text-xs px-3 py-1.5 border border-border text-sage hover:bg-linen transition-colors">TODAY</button>
                    <button onClick={() => setTab('calendar' as any)} className="font-bebas tracking-widest text-xs px-3 py-1.5 border border-forest/30 text-forest hover:bg-forest/5 transition-colors">FULL VIEW</button>
                  </div>
                  <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
                    {["MON","TUE","WED","THU","FRI","SAT","SUN"].map(d => (
                      <div key={d} className={`text-center font-bebas tracking-widest text-xs py-2 border-r border-border last:border-r-0 ${
                        d === 'SAT' || d === 'SUN' ? 'text-forest bg-linen/40' : 'text-sage'
                      }`}>{d}</div>
                    ))}
                  </div>
                  <div className="overflow-auto" style={{ minHeight: 340 }}>
                    {(() => {
                      const firstDayOfMonth = new Date(year, month, 1).getDay();
                      const mondayOffset = (firstDayOfMonth + 6) % 7;
                      const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
                      const nxtYear = adjNextMonthDate.getFullYear();
                      const nxtMonth = adjNextMonthDate.getMonth();
                      const adjBLIds = new Set((adjMonthBookings ?? []).map((b: any) => b.leadId).filter(Boolean));
                      const cells = Array.from({ length: totalCells }, (_, i) => {
                        const dayNum = i - mondayOffset + 1;
                        if (dayNum >= 1 && dayNum <= daysInMonth) return { day: dayNum, isOverflow: false };
                        if (dayNum > daysInMonth) return { day: dayNum - daysInMonth, isOverflow: true };
                        return null;
                      });
                      const weeks = [];
                      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                      const numWeeks = weeks.length;
                      return weeks.map((week, wi) => (
                        <div key={wi} className="grid grid-cols-7 border-b border-border last:border-b-0" style={{ minHeight: `${Math.floor(340 / numWeeks)}px` }}>
                          {week.map((cell, di) => {
                            if (!cell) return <div key={di} className="border-r border-border last:border-r-0 bg-linen/20" />;
                            const { day, isOverflow } = cell;
                            const cellYear = isOverflow ? nxtYear : year;
                            const cellMonth = isOverflow ? nxtMonth : month;
                            const isToday = new Date().getDate() === day && new Date().getMonth() === cellMonth && new Date().getFullYear() === cellYear;
                            const isWeekend = di >= 5;
                            const dayBookings = isOverflow
                              ? (adjMonthBookings ?? []).filter((b: any) => new Date(b.eventDate).getUTCDate() === day)
                              : (monthBookings ?? []).filter((b: any) => new Date(b.eventDate).getUTCDate() === day);
                            const dayLeads = isOverflow
                              ? (adjMonthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getUTCDate() === day && !adjBLIds.has(l.id) && l.status !== 'lost')
                              : (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getUTCDate() === day && !bookedLeadIds.has(l.id) && l.status !== 'lost');
                            const dateStr = `${cellYear}-${String(cellMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                            return (
                              <div key={di}
                                className={`group border-r border-border last:border-r-0 flex flex-col p-1.5 gap-0.5 min-h-[56px] ${
                                  isOverflow ? 'bg-linen/40 opacity-60' : isWeekend ? 'bg-linen/20' : 'bg-white'
                                } ${isToday ? 'ring-2 ring-inset ring-forest' : ''} ${!isOverflow ? 'hover:bg-linen/30 transition-colors' : ''}`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className={`font-dm text-xs font-semibold leading-none ${
                                    isToday ? 'w-5 h-5 bg-forest text-cream rounded-full flex items-center justify-center text-[10px]' : isOverflow ? 'text-ink/30' : isWeekend ? 'text-forest' : 'text-ink/60'
                                  }`}>{day}</span>
                                  {!isOverflow && (
                                    <button
                                      onClick={() => { setQuickCreateDate(dateStr); setQuickCreateForm({ firstName: '', lastName: '', eventType: '', guestCount: '', notes: '', status: 'new' }); }}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-linen rounded"
                                      title="Add event">
                                      <Plus className="w-3 h-3 text-forest" />
                                    </button>
                                  )}
                                </div>
                                {dayBookings.slice(0, 2).map((b: any) => (
                                  <button key={b.id}
                                    onClick={() => { setSelectedBooking(b); }}
                                    className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-snug font-dm ${getStatusInfo(b.status).calClasses} hover:opacity-80 transition-opacity`}
                                    title={`${b.firstName} ${b.lastName ?? ''} — ${b.eventType ?? 'Event'}`}>
                                    <div className="font-semibold truncate">{b.firstName} {b.lastName}</div>
                                    <div className="opacity-80 font-bebas tracking-widest text-[9px] mt-0.5">{getStatusInfo(b.status).label.toUpperCase()}</div>
                                  </button>
                                ))}
                                {dayLeads.slice(0, 1).map((l: any) => (
                                  <button key={l.id}
                                    onClick={() => { selectLead(l); setTab('enquiries'); }}
                                    className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-snug font-dm ${getStatusInfo(l.status).calClasses} hover:opacity-80 transition-opacity`}
                                    title={`${l.firstName} ${l.lastName ?? ''} — ${l.eventType ?? 'Enquiry'}`}>
                                    <div className="font-semibold truncate">{l.firstName} {l.lastName}</div>
                                    <div className="opacity-80 font-bebas tracking-widest text-[9px] mt-0.5">{getStatusInfo(l.status).label.toUpperCase()}</div>
                                  </button>
                                ))}
                                {(dayBookings.length + dayLeads.length) > 3 && (
                                  <span className="font-dm text-[9px] text-sage px-1">+{dayBookings.length + dayLeads.length - 3} more</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Sidebar cards */}
                <div className="space-y-4">
                  {/* Upcoming Events */}
                  <div className="dante-card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <h3 className="font-cormorant text-base font-semibold text-ink">Upcoming Events</h3>
                      <button onClick={() => setTab('calendar')} className="font-dm text-xs text-forest hover:text-forest-dark transition-colors">View all</button>
                    </div>
                    {(() => {
                      const upcoming = [...(monthBookings ?? []), ...(monthLeadEvents ?? []).filter((l: any) => (l.status === 'booked' || l.status === 'confirmed') && !bookedLeadIds.has(l.id))]
                        .filter((e: any) => new Date(e.eventDate) >= new Date())
                        .sort((a: any, b: any) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
                        .slice(0, 8);
                      if (upcoming.length === 0) return (
                        <div className="flex flex-col items-center justify-center p-6 text-center">
                          <Calendar className="w-8 h-8 text-sage/20 mx-auto mb-2" />
                          <p className="font-dm text-xs text-sage/50">No upcoming events this month</p>
                        </div>
                      );
                      return (
                        <div className="divide-y divide-border max-h-56 overflow-auto">
                          {upcoming.map((e: any) => {
                            const isConfirmed = e.status === 'confirmed' || e.status === 'booked';
                            return (
                              <button key={e.id}
                                onClick={() => e._type === 'booking' ? setLocation(`/event/${e.id}`) : (setSelectedLead(e), setTab('enquiries'))}
                                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-linen transition-colors text-left">
                                <div className="w-1 min-h-[32px] rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: getStatusInfo(e.status).swatch }} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-dm text-xs font-semibold text-ink truncate">{e.firstName} {e.lastName}</div>
                                  <div className="font-dm text-xs text-sage">{new Date(e.eventDate).toLocaleDateString('en-NZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}{e.guestCount ? ` · ${e.guestCount}` : ''}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* New Enquiries */}
                  <div className="dante-card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <div className="flex items-center gap-2">
                        <h3 className="font-cormorant text-base font-semibold text-ink">New Enquiries</h3>
                        {newEnquiries.length > 0 && (
                          <span className="bg-forest text-cream font-bebas text-[10px] tracking-widest px-1.5 py-0.5">{newEnquiries.length}</span>
                        )}
                      </div>
                      <button onClick={() => { setLeadsSubTab('new'); setTab('enquiries'); }} className="font-dm text-xs text-forest hover:text-forest-dark transition-colors">View all</button>
                    </div>
                    {newEnquiries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center">
                        <CheckCircle className="w-8 h-8 text-forest/20 mx-auto mb-2" />
                        <p className="font-dm text-xs text-sage/50">All caught up!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border max-h-56 overflow-auto">
                        {newEnquiries.slice(0, 6).map((lead: any) => (
                          <button key={lead.id} onClick={() => { selectLead(lead); setLeadsSubTab('new'); setTab('enquiries'); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-linen transition-colors text-left">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: getStatusInfo(lead.status).swatch }} />
                            <div className="flex-1 min-w-0">
                              <div className="font-dm text-xs font-semibold text-ink truncate">{lead.firstName} {lead.lastName}</div>
                              <div className="font-dm text-xs text-sage truncate">{lead.eventType || 'Event'}{lead.eventDate ? ` · ${new Date(lead.eventDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}` : ''}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {(overdueLeads ?? []).length > 0 && (
                      <div className="border-t border-red-200 bg-red-50/50 px-4 py-2 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        <span className="font-bebas text-xs tracking-widest text-red-700">{(overdueLeads ?? []).length} OVERDUE FOLLOW-UP{(overdueLeads ?? []).length > 1 ? 'S' : ''}</span>
                        <button onClick={() => { setTab('enquiries'); setLeadsSubTab('all'); setLeadStatusFilter('overdue_followup'); setSelectedLead(null); }} className="ml-auto font-dm text-xs text-red-600 hover:text-red-800 transition-colors">View →</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ── ENQUIRIES INBOX ──────────────────────────────────────────────────── */}
          {tab === "enquiries" && (
            <div className="flex flex-col h-full overflow-hidden">

              {/* ── TOP TOOLBAR ──────────────────────────────────────────────── */}
              <div className="flex-shrink-0 bg-white border-b border-gold/15">
                {/* Row 1: Sub-tabs + view modes + actions */}
                <div className="flex items-center gap-2 px-4 py-3 flex-wrap gap-y-2">
                  {/* Sub-tabs or heading */}
                  {newEnquiries.length > 0 ? (
                    <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
                      <button onClick={() => { setLeadsSubTab("new"); setSelectedLead(null); }}
                        className={`font-inter text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${leadsSubTab === "new" ? "bg-white text-ink shadow-sm" : "text-stormy hover:text-ink"}`}>
                        New
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${leadsSubTab === "new" ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700"}`}>{newEnquiries.length}</span>
                      </button>
                      <button onClick={() => { setLeadsSubTab("all"); setSelectedLead(null); }}
                        className={`font-inter text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${leadsSubTab === "all" ? "bg-white text-ink shadow-sm" : "text-stormy hover:text-ink"}`}>
                        All Events
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${leadsSubTab === "all" ? "bg-sage-green text-white" : "bg-gray-200 text-gray-600"}`}>{(allEnquiries ?? []).length}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="font-cormorant text-xl font-semibold text-ink">
                        {leadViewMode === "kanban" ? "Pipeline" : "All Events"}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500">{filteredLeads.length}</span>
                    </div>
                  )}

                  {/* View mode toggle */}
                  <div className="flex border border-gold/30 rounded-lg overflow-hidden">
                    {([
                      { mode: "list" as const, icon: <List className="w-3.5 h-3.5" />, title: "List view" },
                      { mode: "table" as const, icon: <Table2 className="w-3.5 h-3.5" />, title: "Table view" },
                      { mode: "kanban" as const, icon: <Columns className="w-3.5 h-3.5" />, title: "Kanban view" },
                    ]).map(({ mode, icon, title }) => (
                      <button key={mode} onClick={() => { setLeadViewMode(mode); setSelectedLead(null); }}
                        title={title}
                        className={`px-2.5 py-1.5 transition-colors ${leadViewMode === mode ? "bg-forest text-cream" : "text-ink/50 hover:bg-linen hover:text-ink"}`}>
                        {icon}
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setShowAddLead(true)}
                      className="flex items-center gap-1.5 bg-sage-green text-white font-inter font-medium text-xs px-3 py-2 rounded-lg hover:bg-sage-dark transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add New
                    </button>
                    <button onClick={() => setShowCsvImport(true)} title="Import from CSV"
                      className="px-3 py-2 rounded-lg border border-gold/40 text-ink/60 hover:border-gold hover:text-ink hover:bg-white/60 transition-colors text-xs font-inter font-medium flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" /> CSV
                    </button>
                    {leadViewMode !== "kanban" && (
                      <button onClick={() => { setBulkSelectMode(m => !m); setSelectedLeadIds(new Set()); }}
                        className={`font-bebas text-xs tracking-widest px-2.5 py-1.5 border rounded-lg transition-colors ${bulkSelectMode ? 'bg-forest text-cream border-forest' : 'border-gold/40 text-ink/60 hover:border-gold hover:text-ink'}`}>
                        {bulkSelectMode ? 'CANCEL' : 'SELECT'}
                      </button>
                    )}
                    {leadViewMode === "kanban" && (
                      <button onClick={() => setKanbanSettingsOpen(true)}
                        className="flex items-center gap-1.5 font-inter text-xs font-medium px-3 py-1.5 border border-gold/30 text-ink/60 rounded-lg hover:bg-linen transition-colors">
                        <SlidersHorizontal className="w-3.5 h-3.5" /> Customise
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Search + Filters (hidden in kanban) */}
                {leadViewMode !== "kanban" && (
                  <div className="flex items-center gap-2 px-4 pb-3 flex-wrap gap-y-2">
                    <div className="relative flex-1 min-w-[160px] max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/40" />
                      <Input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                        placeholder="Search enquiries..." className="pl-8 h-8 text-xs rounded-lg border border-gray-200 focus-visible:ring-0 focus-visible:border-sage-green" />
                    </div>
                    <Select value={leadStatusFilter} onValueChange={(v) => { setLeadStatusFilter(v); if (v !== "all") setLeadsSubTab("all"); }}>
                      <SelectTrigger className={`h-8 w-36 text-xs font-inter rounded-lg border focus:ring-1 focus:ring-sage-green/40 ${leadStatusFilter !== "all" ? "border-sage-green bg-sage-green/10 text-sage-dark" : "border-gray-200 bg-white text-ink"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="font-inter text-xs">All Statuses</SelectItem>
                        <SelectItem value="overdue_followup" className="font-inter text-xs text-red-600">⚠ Overdue Follow-ups</SelectItem>
                        {pipelineStages.map(s => (
                          <SelectItem key={s.key} value={s.key} className="font-inter text-xs">{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={leadDateFilter} onValueChange={(v: any) => { setLeadDateFilter(v); if (v !== "custom") { setCustomDateFrom(""); setCustomDateTo(""); } }}>
                      <SelectTrigger className={`h-8 w-36 text-xs font-inter rounded-lg border focus:ring-1 focus:ring-sage-green/40 ${leadDateFilter !== "all" ? "border-sage-green bg-sage-green/10 text-sage-dark" : "border-gray-200 bg-white text-ink"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="font-inter text-xs">All Dates</SelectItem>
                        <SelectItem value="today" className="font-inter text-xs">Today</SelectItem>
                        <SelectItem value="weekend" className="font-inter text-xs">This Weekend</SelectItem>
                        <SelectItem value="month" className="font-inter text-xs">This Month</SelectItem>
                        <SelectItem value="year" className="font-inter text-xs">This Year</SelectItem>
                        <SelectItem value="future" className="font-inter text-xs">Upcoming</SelectItem>
                        <SelectItem value="custom" className="font-inter text-xs">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                    {leadDateFilter === "custom" && (
                      <>
                        <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)}
                          className="h-8 text-xs border border-gray-200 rounded-lg px-2 bg-white text-ink focus:outline-none focus:border-sage-green" placeholder="From" />
                        <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)}
                          className="h-8 text-xs border border-gray-200 rounded-lg px-2 bg-white text-ink focus:outline-none focus:border-sage-green" placeholder="To" />
                      </>
                    )}
                    <Select value={leadSortBy} onValueChange={(v: any) => setLeadSortBy(v)}>
                      <SelectTrigger className="h-8 w-36 text-xs font-inter rounded-lg border border-gray-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enquiry_date" className="font-inter text-xs">Enquiry Date</SelectItem>
                        <SelectItem value="event_date" className="font-inter text-xs">Event Date</SelectItem>
                        <SelectItem value="status" className="font-inter text-xs">Status</SelectItem>
                      </SelectContent>
                    </Select>
                    <button onClick={() => setLeadSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                      className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                      title={leadSortDir === 'asc' ? 'Ascending' : 'Descending'}>
                      <ArrowUpDown className="w-3.5 h-3.5 text-ink/60" />
                    </button>
                    <span className="font-dm text-xs text-ink/40 ml-auto">{filteredLeads.length} record{filteredLeads.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {/* Bulk select all bar */}
                {bulkSelectMode && filteredLeads.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-linen border-t border-gold/10">
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
              </div>

              {/* ── CONTENT AREA ──────────────────────────────────────────────── */}
              <div className="flex flex-1 overflow-hidden">

                {/* ── TABLE VIEW ─────────────────────────────────────── */}
                {leadViewMode === "table" && (
                  <div className={`${selectedLead ? "w-[55%] border-r border-gold/15" : "flex-1"} overflow-auto`}>
                    {filteredLeads.length === 0 ? (
                      <div className="p-12 text-center">
                        <MessageSquare className="w-10 h-10 text-sage/30 mx-auto mb-3" />
                        <p className="font-dm text-sage text-sm">No records found</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm border-collapse min-w-[700px]">
                        <thead className="sticky top-0 bg-cream z-10 border-b border-gold/20">
                          <tr>
                            {bulkSelectMode && <th className="w-10 px-3 py-2.5"><input type="checkbox" checked={selectedLeadIds.size === filteredLeads.length} onChange={e => setSelectedLeadIds(e.target.checked ? new Set(filteredLeads.map((l: any) => l.id)) : new Set())} className="w-3.5 h-3.5 accent-forest" /></th>}
                            {[
                              { key: "name", label: "Name" },
                              { key: "event", label: "Event Type" },
                              { key: "event_date", label: "Event Date" },
                              { key: "guests", label: "Guests" },
                              { key: "status", label: "Status" },
                              { key: "enquiry_date", label: "Enquiry" },
                            ].map(col => (
                              <th key={col.key}
                                onClick={() => { if (["event_date","status","enquiry_date"].includes(col.key)) { setLeadSortBy(col.key === "enquiry_date" ? "enquiry_date" : col.key as any); setLeadSortDir(d => d === "asc" ? "desc" : "asc"); } }}
                                className={`px-4 py-2.5 text-left font-bebas tracking-widest text-xs text-ink/60 whitespace-nowrap bg-cream ${["event_date","status","enquiry_date"].includes(col.key) ? "cursor-pointer hover:text-ink select-none" : ""}`}>
                                {col.label}
                                {(col.key === "event_date" && leadSortBy === "event_date") || (col.key === "enquiry_date" && leadSortBy === "enquiry_date") || (col.key === "status" && leadSortBy === "status")
                                  ? <span className="ml-1 opacity-60">{leadSortDir === "asc" ? "↑" : "↓"}</span> : null}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {filteredLeads.map((lead: any) => {
                            const statusStage = pipelineStages.find(s => s.key === lead.status);
                            return (
                              <tr key={lead.id}
                                onClick={() => { if (!bulkSelectMode) selectLead(lead); }}
                                className={`hover:bg-linen/60 transition-colors cursor-pointer ${selectedLead?.id === lead.id ? "bg-forest/5" : ""} ${selectedLeadIds.has(lead.id) ? "bg-forest/5" : ""}`}
                                style={{ borderLeft: `3px solid ${statusStage?.swatch ?? '#d4c5a9'}` }}>
                                {bulkSelectMode && (
                                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={selectedLeadIds.has(lead.id)}
                                      onChange={e => { setSelectedLeadIds(prev => { const n = new Set(prev); e.target.checked ? n.add(lead.id) : n.delete(lead.id); return n; }); }}
                                      className="w-3.5 h-3.5 accent-forest cursor-pointer" />
                                  </td>
                                )}
                                <td className="px-4 py-3 font-cormorant font-semibold text-base text-ink whitespace-nowrap">{lead.firstName} {lead.lastName}</td>
                                <td className="px-4 py-3 font-dm text-xs text-ink/70 max-w-[160px] truncate">{lead.eventType || "—"}</td>
                                <td className="px-4 py-3 font-dm text-xs text-ink/60 whitespace-nowrap">{lead.eventDate ? new Date(lead.eventDate).toLocaleDateString("en-NZ", { day:"numeric", month:"short", year:"numeric" }) : "—"}</td>
                                <td className="px-4 py-3 font-dm text-xs text-ink/60 whitespace-nowrap">{lead.guestCount ?? "—"}</td>
                                <td className="px-4 py-3">
                                  <span className={`font-bebas text-[10px] tracking-widest px-2 py-0.5 border ${statusStage?.color ?? "bg-stone-100 border-stone-300 text-stone-700"}`}>
                                    {statusStage?.label ?? lead.status.replace(/_/g, " ")}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-dm text-xs text-ink/50 whitespace-nowrap">{new Date(lead.createdAt).toLocaleDateString("en-NZ", { day:"numeric", month:"short" })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {/* ── LIST VIEW sidebar ─────────────────────────────── */}
                {leadViewMode === "list" && <div className={`${selectedLead ? "hidden md:block md:w-80 lg:w-96 flex-shrink-0" : "flex-1"} border-r border-gold/15 bg-warm-white overflow-y-auto divide-y divide-border/40`}>
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
                      className={`flex-1 p-3 text-left hover:bg-linen transition-colors border-l-4 ${!bulkSelectMode && selectedLead?.id === lead.id ? "bg-forest/5" : ""}`}
                      style={{ borderLeftColor: pipelineStages.find(s => s.key === lead.status)?.swatch ?? '#d4c5a9' }}>
                      <div className="flex items-start gap-3">
                        {/* Left: name + contact */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="font-cormorant font-semibold text-base text-ink truncate min-w-0 flex-1">{lead.firstName} {lead.lastName}</div>
                            <div className={`font-bebas text-[10px] tracking-widest px-1.5 py-0.5 border flex-shrink-0 ${pipelineStages.find(s => s.key === lead.status)?.color ?? "bg-muted border-border"}`}>
                              {pipelineStages.find(s => s.key === lead.status)?.label ?? lead.status.replace(/_/g, " ").toUpperCase()}
                            </div>
                          </div>
                          <div className="font-dm text-xs text-ink/55 truncate">{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</div>
                          <div className="font-dm text-xs text-ink/50 mt-0.5">
                            {lead.eventType || "Event"}{lead.guestCount ? ` · ${lead.guestCount} guests` : ""}
                          </div>
                        </div>
                        {/* Right: dates */}
                        <div className="flex-shrink-0 text-right space-y-1 min-w-[110px]">
                          {lead.eventDate ? (
                            <div>
                              <div className="font-bebas text-[9px] tracking-widest text-sage/60 uppercase">Event Date</div>
                              <div className="font-dm text-xs font-semibold text-forest">
                                {new Date(lead.eventDate).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-bebas text-[9px] tracking-widest text-sage/40 uppercase">Event Date</div>
                              <div className="font-dm text-xs text-ink/30 italic">not set</div>
                            </div>
                          )}
                          <div>
                            <div className="font-bebas text-[9px] tracking-widest text-sage/60 uppercase">Enquiry</div>
                            <div className="font-dm text-xs text-ink/50">
                              {new Date(lead.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                          {lead.followUpDate && (() => {
                            const d = new Date(lead.followUpDate);
                            const overdue = d <= new Date() && !['booked','lost','cancelled'].includes(lead.status);
                            if (overdue) return <span className="font-bebas text-[9px] tracking-widest px-1 py-0.5 bg-red-100 text-red-700 block">OVERDUE</span>;
                            if (d > new Date()) return <span className="font-bebas text-[9px] tracking-widest px-1 py-0.5 bg-gold/20 text-amber-700 block">FOLLOW UP {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</span>;
                            return null;
                          })()}
                        </div>
                      </div>
                    </button>
                      </div>
                  ))}
                </div>}

                {/* ── KANBAN VIEW ──────────────────────────────────────── */}
                {leadViewMode === "kanban" && (
                  <div className="flex-1 overflow-x-auto p-5 bg-background">
                    <div className="flex gap-3 min-w-max h-full">
                      {kanbanStages.map(stage => {
                        const stageLeads = filteredLeads.filter((l: any) => l.status === stage.key);
                        return (
                          <div key={stage.key} className="w-72 flex-shrink-0 flex flex-col gap-2">
                            {/* Column header */}
                            <div className="flex items-center justify-between px-3 py-2.5 bg-white rounded-xl border border-border flex-shrink-0"
                              style={{ borderTop: `3px solid ${stage.swatch ?? '#d4c5a9'}` }}>
                              <span className="font-inter text-xs font-bold text-gray-700 uppercase tracking-wider">{stage.label}</span>
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 min-w-[20px] text-center">{stageLeads.length}</span>
                            </div>
                            {/* Cards */}
                            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pb-2">
                              {stageLeads.map((lead: any) => (
                                <button key={lead.id}
                                  onClick={() => { selectLead(lead); setKanbanDetailOpen(true); }}
                                  className="w-full bg-white rounded-xl border border-border hover:border-sage-green hover:shadow-md transition-all text-left p-3.5 group"
                                  style={{ borderLeft: `3px solid ${stage.swatch ?? '#d4c5a9'}` }}>
                                  <div className="font-inter font-semibold text-sm text-gray-900 truncate group-hover:text-sage-dark">
                                    {lead.firstName} {lead.lastName}
                                  </div>
                                  {lead.eventType && (
                                    <div className="font-inter text-xs text-gray-500 mt-0.5 truncate">{lead.eventType}</div>
                                  )}
                                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                    {lead.eventDate && (
                                      <span>{new Date(lead.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    )}
                                    {lead.guestCount && <span>{lead.guestCount} guests</span>}
                                  </div>
                                  {lead.followUpDate && (() => {
                                    const d = new Date(lead.followUpDate);
                                    const overdue = d <= new Date() && !['booked', 'lost', 'cancelled'].includes(lead.status);
                                    if (overdue) return (
                                      <div className="mt-2 text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-md inline-block">
                                        Overdue follow-up
                                      </div>
                                    );
                                    return (
                                      <div className="mt-2 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md inline-block">
                                        Follow up {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                                      </div>
                                    );
                                  })()}
                                </button>
                              ))}
                              {stageLeads.length === 0 && (
                                <div className="rounded-xl border-2 border-dashed border-border p-5 text-center">
                                  <p className="text-xs text-gray-300 font-medium">No leads</p>
                                </div>
                              )}
                              <button
                                onClick={() => setShowAddLead(true)}
                                className="w-full py-2 rounded-xl border border-dashed border-gray-200 text-xs text-gray-300 hover:border-sage-green hover:text-sage-green transition-colors flex items-center justify-center gap-1">
                                <Plus className="w-3 h-3" /> Add
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Lead Detail — shared between list + table modes */}
                {leadViewMode !== "kanban" && (selectedLead ? (
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
                      {selectedLead.email && !isTeamMember && (
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
                      {selectedLeadRunsheets && selectedLeadRunsheets.length > 0 ? (
                        <button onClick={() => setLocation(`/runsheet?id=${selectedLeadRunsheets[selectedLeadRunsheets.length - 1].id}&leadId=${selectedLead.id}`)}
                          className="border border-sage-green text-sage-dark font-inter font-medium text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 hover:bg-sage-green/10 transition-all">
                          <Clock className="w-3.5 h-3.5" /> Edit Runsheet
                        </button>
                      ) : ['booked','confirmed'].includes(selectedLead.status) ? (
                        <button
                          onClick={() => {
                            const eventDate = selectedLead.eventDate ? new Date(selectedLead.eventDate).toISOString().slice(0,10) : undefined;
                            const guestCount = selectedLead.guestCount ? Number(selectedLead.guestCount) : undefined;
                            const eventType = selectedLead.eventType || 'Event';
                            createRunsheet.mutate({
                              title: `${eventType} — ${selectedLead.firstName} ${selectedLead.lastName ?? ''}`,
                              leadId: selectedLead.id,
                              eventDate,
                              guestCount,
                              eventType,
                              notes: selectedLead.message ?? undefined,
                              venueName: (venueSettings as any)?.name ?? undefined,
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
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-inter text-xs font-semibold text-gray-400 uppercase tracking-wider">Event Details</h3>
                        {!editingEventDetails ? (
                          <button onClick={() => {
                            setEventDetailForm({
                              firstName: selectedLead.firstName ?? '',
                              lastName: selectedLead.lastName ?? '',
                              email: selectedLead.email ?? '',
                              phone: selectedLead.phone ?? '',
                              company: selectedLead.company ?? '',
                              eventType: selectedLead.eventType ?? '',
                              eventDate: selectedLead.eventDate ? new Date(selectedLead.eventDate).toISOString().slice(0, 10) : '',
                              guestCount: selectedLead.guestCount ?? '',
                              budget: selectedLead.budget ?? '',
                            });
                            setEditingEventDetails(true);
                          }} className="text-xs text-sage hover:text-forest font-dm flex items-center gap-1">
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setEditingEventDetails(false)} className="text-xs text-ink/40 hover:text-ink font-dm">Cancel</button>
                            <button onClick={() => {
                              updateLeadDetails.mutate({
                                id: selectedLead.id,
                                firstName: eventDetailForm.firstName || undefined,
                                lastName: eventDetailForm.lastName || null,
                                email: eventDetailForm.email || undefined,
                                phone: eventDetailForm.phone || null,
                                company: eventDetailForm.company || null,
                                eventType: eventDetailForm.eventType || null,
                                eventDate: eventDetailForm.eventDate || null,
                                guestCount: eventDetailForm.guestCount !== '' ? Number(eventDetailForm.guestCount) : null,
                                budget: eventDetailForm.budget !== '' ? Number(eventDetailForm.budget) : null,
                              });
                            }} disabled={updateLeadDetails.isPending} className="text-xs text-forest hover:text-forest-dark font-dm font-semibold">
                              {updateLeadDetails.isPending ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                      {!editingEventDetails ? (
                        <div className="space-y-2 text-sm font-dm">
                          {[
                            ["Name", `${selectedLead.firstName} ${selectedLead.lastName ?? ''}`.trim()],
                            ["Email", selectedLead.email],
                            ["Phone", selectedLead.phone],
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
                      ) : (
                        <div className="space-y-2 text-sm">
                          {[
                            { label: "First Name", key: "firstName", type: "text" },
                            { label: "Last Name", key: "lastName", type: "text" },
                            { label: "Email", key: "email", type: "email" },
                            { label: "Phone", key: "phone", type: "text" },
                            { label: "Company", key: "company", type: "text" },
                            { label: "Event Type", key: "eventType", type: "text" },
                            { label: "Date", key: "eventDate", type: "date" },
                            { label: "Guests", key: "guestCount", type: "number" },
                            { label: "Budget (NZD)", key: "budget", type: "number" },
                          ].map(({ label, key, type }) => (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-ink/60 w-24 flex-shrink-0 text-xs">{label}:</span>
                              <input
                                type={type}
                                value={eventDetailForm[key] ?? ''}
                                onChange={e => setEventDetailForm((f: any) => ({ ...f, [key]: e.target.value }))}
                                className="flex-1 border-b border-gold/40 focus:border-forest bg-transparent text-sm text-ink focus:outline-none py-0.5 font-dm"
                              />
                            </div>
                          ))}
                        </div>
                      )}
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
                        {pipelineStages.map(stage => {
                          const isActive = selectedLead.status === stage.key;
                          return (
                            <button key={stage.key}
                              onClick={() => updateStatus.mutate({ id: selectedLead.id, status: stage.key as any })}
                              className="w-full text-left px-3 py-2 border font-inter text-xs font-medium transition-all"
                              style={isActive ? {
                                backgroundColor: stage.swatch + '22',
                                borderColor: stage.swatch,
                                color: '#1a1a1a',
                                borderLeftWidth: '3px',
                              } : {
                                backgroundColor: 'transparent',
                                borderColor: '#f0ede8',
                                color: '#888',
                              }}
                            >
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-2 flex-shrink-0"
                                style={{ backgroundColor: isActive ? stage.swatch : stage.swatch + '66' }}
                              />
                              {stage.label}
                            </button>
                          );
                        })}
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
              ))}
              </div>{/* ── End content area ────────────────────────────────────── */}

              {/* Floating Bulk Action Toolbar */}
              {bulkSelectMode && selectedLeadIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-ink text-cream px-5 py-3 shadow-2xl border border-gold/30">
                  <span className="font-bebas tracking-widest text-sm text-gold">{selectedLeadIds.size} LEAD{selectedLeadIds.size !== 1 ? 'S' : ''}</span>
                  <span className="text-cream/30">|</span>
                  <span className="font-bebas tracking-widest text-xs text-cream/70">SET STATUS:</span>
                  <div className="flex items-center gap-1.5">
                    {pipelineStages.map(s => (
                      <button key={s.key}
                        onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selectedLeadIds), status: s.key as any })}
                        disabled={bulkUpdateStatus.isPending}
                        className={`font-bebas text-xs tracking-widest px-2.5 py-1.5 border transition-colors hover:bg-gold hover:text-ink hover:border-gold disabled:opacity-50`}
                        style={{ borderColor: s.swatch ?? '#d4c5a9', color: s.swatch ?? '#d4c5a9' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => { setSelectedLeadIds(new Set()); setBulkSelectMode(false); }}
                    className="ml-2 text-cream/50 hover:text-cream font-bebas text-xs tracking-widest">
                    CLEAR
                  </button>
                  <span className="text-cream/30">|</span>
                  <button
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    className="font-bebas text-xs tracking-widest px-2.5 py-1.5 border border-red-400/50 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors">
                    DELETE
                  </button>
                </div>
              )}

              {/* Kanban Stage Customisation Dialog */}
              {kanbanSettingsOpen && (
                <KanbanSettingsDialog
                  open={kanbanSettingsOpen}
                  onClose={() => setKanbanSettingsOpen(false)}
                  allStages={pipelineStages}
                  currentPrefs={kanbanStagePrefs}
                  onSave={saveKanbanPrefs}
                />
              )}
              {/* Kanban Lead Quick-View Modal */}
              {leadViewMode === "kanban" && kanbanDetailOpen && selectedLead && (
                <Dialog open={kanbanDetailOpen} onOpenChange={(v) => { setKanbanDetailOpen(v); if (!v) setSelectedLead(null); }}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="font-inter text-xl font-bold text-gray-900 leading-tight">
                        {selectedLead.firstName} {selectedLead.lastName}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Status badge */}
                      <div className="flex items-center gap-2">
                        {(() => {
                          const stage = pipelineStages.find((s: any) => s.key === selectedLead.status);
                          return stage ? (
                            <span className={`font-inter text-xs font-bold px-2.5 py-1 rounded-lg border ${stage.color}`}>{stage.label}</span>
                          ) : null;
                        })()}
                      </div>
                      {/* Contact */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {selectedLead.email && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Email</p>
                            <p className="text-gray-900 truncate">{selectedLead.email}</p>
                          </div>
                        )}
                        {selectedLead.phone && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Phone</p>
                            <p className="text-gray-900">{selectedLead.phone}</p>
                          </div>
                        )}
                        {selectedLead.eventType && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Event Type</p>
                            <p className="text-gray-900">{selectedLead.eventType}</p>
                          </div>
                        )}
                        {selectedLead.eventDate && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Event Date</p>
                            <p className="text-gray-900">{new Date(selectedLead.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                          </div>
                        )}
                        {selectedLead.guestCount && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Guests</p>
                            <p className="text-gray-900">{selectedLead.guestCount}</p>
                          </div>
                        )}
                        {selectedLead.budget && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Budget</p>
                            <p className="text-gray-900">${Number(selectedLead.budget).toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                      {selectedLead.message && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Message</p>
                          <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{selectedLead.message}</p>
                        </div>
                      )}
                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                        {selectedLead.email && !isTeamMember && (
                          <button
                            onClick={() => {
                              setEmailForm({ subject: `Re: Your event enquiry — ${selectedLead.eventType || 'Event'}`, body: `Hi ${selectedLead.firstName},\n\nThank you for your enquiry. ` });
                              setShowEmailModal(true);
                              setKanbanDetailOpen(false);
                            }}
                            className="flex items-center gap-1.5 font-inter text-xs font-medium border border-sage-green text-sage-dark px-3 py-2 rounded-lg hover:bg-sage-green/10 transition-colors">
                            <Mail className="w-3.5 h-3.5" /> Email
                          </button>
                        )}
                        <button
                          onClick={() => { setKanbanDetailOpen(false); setLocation(`/proposals/new?leadId=${selectedLead.id}`); }}
                          className="flex items-center gap-1.5 font-inter text-xs font-semibold bg-sage-green text-white px-3 py-2 rounded-lg hover:bg-sage-dark transition-colors">
                          <FileText className="w-3.5 h-3.5" /> Create Proposal
                        </button>
                        <button
                          onClick={() => { setLeadViewMode("list"); setKanbanDetailOpen(false); }}
                          className="ml-auto font-inter text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 px-2 py-2">
                          Full details <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
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
                    {/* Signature preview */}
                    {(venueSettings?.emailSignature || (venueSettings as any)?.emailSignatureLogo) && (
                      <div className="mt-1 border-t border-dashed border-gold/30 pt-2">
                        <p className="font-bebas text-[9px] tracking-widest text-sage/60 mb-1">SIGNATURE (auto-appended)</p>
                        {(venueSettings as any)?.emailSignatureLogo && (
                          <img src={(venueSettings as any).emailSignatureLogo} alt="Logo" className="h-8 w-auto object-contain mb-1 opacity-60" />
                        )}
                        {venueSettings?.emailSignature && (
                          <pre className="font-dm text-xs text-ink/40 whitespace-pre-wrap leading-relaxed">{venueSettings.emailSignature}</pre>
                        )}
                      </div>
                    )}
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
                  {/* Attachments */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bebas text-xs tracking-widest text-sage">ATTACHMENTS</label>
                      <label className="font-bebas tracking-widest text-[10px] text-forest cursor-pointer hover:text-gold transition-colors flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> ATTACH FILE
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={async e => {
                            const files = Array.from(e.target.files ?? []);
                            const loaded = await Promise.all(files.map(f => new Promise<{ filename: string; content: string; contentType: string }>(resolve => {
                              const reader = new FileReader();
                              reader.onload = () => resolve({ filename: f.name, content: reader.result as string, contentType: f.type || 'application/octet-stream' });
                              reader.readAsDataURL(f);
                            })));
                            setEmailAttachments(prev => [...prev, ...loaded]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    {emailAttachments.length > 0 && (
                      <div className="space-y-1">
                        {emailAttachments.map((att, i) => (
                          <div key={i} className="flex items-center justify-between bg-linen border border-gold/20 px-3 py-1.5 text-xs font-dm">
                            <span className="truncate text-ink/70">{att.filename}</span>
                            <button onClick={() => setEmailAttachments(prev => prev.filter((_, j) => j !== i))} className="text-sage hover:text-tomato ml-2 flex-shrink-0 transition-colors">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 justify-end pt-2">
                    <button onClick={() => { setShowEmailModal(false); setEmailAttachments([]); }}
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
                        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
                      })}
                      disabled={sendEmail.isPending || !emailForm.subject || !emailForm.body}
                      className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream flex items-center gap-2 disabled:opacity-50">
                      <Send className="w-3 h-3" />
                      {sendEmail.isPending ? 'SENDING...' : `SEND EMAIL${emailAttachments.length > 0 ? ` (+${emailAttachments.length})` : ''}`}
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
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-6">Pipeline</h1>
              <div className="flex gap-4 min-w-max">
                {pipelineStages.slice(0, 5).map(stage => {
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
                <button
                  onClick={() => {
                    if (calendarView === 'week') { const d = new Date(calDate); d.setDate(d.getDate() - 7); setCalDate(d); }
                    else if (calendarView === 'day') { const d = new Date(calDate); d.setDate(d.getDate() - 1); setCalDate(d); }
                    else setCalDate(new Date(year, month - 1, 1));
                  }}
                  className="p-1.5 hover:bg-linen border border-gold/20 text-forest transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                <button
                  onClick={() => {
                    if (calendarView === 'week') { const d = new Date(calDate); d.setDate(d.getDate() + 7); setCalDate(d); }
                    else if (calendarView === 'day') { const d = new Date(calDate); d.setDate(d.getDate() + 1); setCalDate(d); }
                    else setCalDate(new Date(year, month + 1, 1));
                  }}
                  className="p-1.5 hover:bg-linen border border-gold/20 text-forest transition-colors"><ChevronRight className="w-4 h-4" /></button>
                <button onClick={() => setCalDate(new Date())} className="hidden sm:block font-bebas tracking-widest text-xs px-3 py-1.5 border border-gold/30 text-ink/70 hover:bg-linen transition-colors">TODAY</button>
                <h2 className="font-cormorant text-base md:text-xl font-semibold text-ink flex-1">
                  {calendarView === 'week' ? (() => {
                    const dow = (calDate.getDay() + 6) % 7;
                    const ws = new Date(calDate); ws.setDate(calDate.getDate() - dow);
                    const we = new Date(ws); we.setDate(ws.getDate() + 6);
                    return `${ws.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${we.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                  })() : calendarView === 'day'
                    ? calDate.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    : `${MONTHS[month]} ${year}`}
                </h2>
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
                {pipelineStages.map(s => (
                  <div key={s.key} className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.swatch }} />
                    <span>{s.label}</span>
                  </div>
                ))}
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
                  const nextYear = adjNextMonthDate.getFullYear();
                  const nextMonth = adjNextMonthDate.getMonth();
                  const adjBookedLeadIds = new Set((adjMonthBookings ?? []).map((b: any) => b.leadId).filter(Boolean));
                  // Each cell: { day, isOverflow } — overflow = belongs to next month
                  const cells = Array.from({ length: totalCells }, (_, i) => {
                    const dayNum = i - mondayOffset + 1;
                    if (dayNum >= 1 && dayNum <= daysInMonth) return { day: dayNum, isOverflow: false };
                    if (dayNum > daysInMonth) return { day: dayNum - daysInMonth, isOverflow: true };
                    return null; // leading blank (prev month)
                  });
                  const weeks = [];
                  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                  const statusCard = (status: string) => getStatusInfo(status).calClasses;
                  return weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 border-b border-gold/10 last:border-b-0" style={{ minHeight: '120px' }}>
                      {week.map((cell, di) => {
                        if (!cell) return <div key={di} className="border-r border-gold/10 last:border-r-0 bg-linen/20" />;
                        const { day, isOverflow } = cell;
                        const cellYear = isOverflow ? nextYear : year;
                        const cellMonth = isOverflow ? nextMonth : month;
                        const isToday = new Date().getDate() === day && new Date().getMonth() === cellMonth && new Date().getFullYear() === cellYear;
                        const isWeekend = di >= 5;
                        const dayBookings = isOverflow
                          ? (adjMonthBookings ?? []).filter((b: any) => new Date(b.eventDate).getDate() === day)
                          : (monthBookings ?? []).filter((b: any) => new Date(b.eventDate).getDate() === day);
                        const dayLeads = isOverflow
                          ? (adjMonthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getDate() === day && !adjBookedLeadIds.has(l.id) && l.status !== 'lost')
                          : (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getDate() === day && !bookedLeadIds.has(l.id) && l.status !== 'lost');
                        const dateStr = `${cellYear}-${String(cellMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        return (
                          <div key={di} className={`border-r border-gold/10 last:border-r-0 p-1 flex flex-col gap-0.5 ${
                            isOverflow ? 'bg-linen/40 opacity-60' : isWeekend ? 'bg-linen/20' : 'bg-white'
                          } ${isToday ? 'ring-2 ring-inset ring-gold' : ''}`}>
                            <span className={`text-xs font-dm leading-none mb-0.5 self-start px-1 rounded ${
                              isToday ? 'bg-forest-dark text-cream font-bold px-1.5 py-0.5' : isOverflow ? 'text-ink/30' : isWeekend ? 'text-forest/70 font-semibold' : 'text-ink/70'
                            }`}>{day}</span>
                            {/* Booking cards */}
                            {dayBookings.map((b: any) => (
                              <div key={b.id} className="relative group/card w-full">
                                <button
                                  onClick={() => setSelectedBooking(b)}
                                  className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-snug font-dm ${statusCard(b.status)} hover:opacity-80 transition-opacity`}
                                  title={`${b.firstName} ${b.lastName ?? ''} — ${b.eventType ?? 'Event'} — ${b.guestCount ?? '?'} guests`}>
                                  <div className="font-semibold truncate">{b.firstName} {b.lastName}</div>
                                  {b.eventType && <div className="opacity-85 truncate">{b.eventType}</div>}
                                  {b.startTime && <div className="opacity-70">{b.startTime}{b.endTime ? ` – ${b.endTime}` : ''}</div>}
                                  {b.guestCount && <div className="opacity-70">{b.guestCount} guests</div>}
                                  <div className="opacity-80 font-bebas tracking-widest text-[9px] mt-0.5">{getStatusInfo(b.status).label.toUpperCase()}</div>
                                </button>
                                {!isOverflow && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${b.eventType || 'event'} for ${b.firstName}?`)) deleteBooking.mutate({ id: b.id }); }}
                                    className="absolute top-0.5 right-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center"
                                    title="Delete event">
                                    <X className="w-2 h-2" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {/* Lead/enquiry cards */}
                            {dayLeads.map((l: any) => (
                              <button key={l.id}
                                onClick={() => setSelectedBooking({ ...l, _isLead: true })}
                                className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-snug font-dm ${statusCard(l.status)} hover:opacity-80 transition-opacity`}
                                title={`${l.firstName} ${l.lastName ?? ''} — ${l.eventType ?? 'Enquiry'} — ${l.guestCount ?? '?'} guests`}>
                                <div className="font-semibold truncate">{l.firstName} {l.lastName}</div>
                                {l.eventType && <div className="opacity-85 truncate">{l.eventType}</div>}
                                {l.guestCount && <div className="opacity-70">{l.guestCount} guests</div>}
                                <div className="opacity-80 font-bebas tracking-widest text-[9px] mt-0.5">{getStatusInfo(l.status).label.toUpperCase()}</div>
                              </button>
                            ))}
                            {/* Add event button */}
                            {!isOverflow && (
                              <button
                                onClick={() => { setAddEnquiryForm(f => ({ ...f, eventDate: dateStr })); setShowAddLead(true); }}
                                className="self-start mt-auto text-ink/20 hover:text-ink/50 transition-colors p-0.5"
                                title="Add event on this day">
                                <Edit2 className="w-2.5 h-2.5" />
                              </button>
                            )}
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
                    <button
                      onClick={() => {
                        const rows = [
                          ...(monthBookings ?? []).map((b: any) => ({ ...b, _type: 'booking' })),
                          ...(monthLeadEvents ?? []).filter((l: any) => !bookedLeadIds.has(l.id)).map((l: any) => ({ ...l, _type: 'lead' })),
                        ].sort((a: any, b: any) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
                        const header = ['Type','First Name','Last Name','Email','Phone','Event Type','Event Date','Guests','Status','Company','Space','Notes','Created'];
                        const csvRows = [header, ...rows.map((r: any) => [
                          r._type === 'booking' ? 'Booking' : 'Enquiry',
                          r.firstName ?? '',
                          r.lastName ?? '',
                          r.email ?? '',
                          r.phone ?? '',
                          r.eventType ?? '',
                          r.eventDate ? new Date(r.eventDate).toLocaleDateString('en-NZ') : '',
                          r.guestCount ?? '',
                          r.status ?? '',
                          r.company ?? '',
                          r.space ?? '',
                          (r.notes ?? r.message ?? '').replace(/[\r\n,]/g, ' '),
                          r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-NZ') : '',
                        ])];
                        const csv = csvRows.map(row => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `VenueFlow-Events-${MONTHS[month]}-${year}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                      title="Export to CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-gray-500" />
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
                    {[...(monthBookings ?? []).map((b: any) => ({ ...b, _type: 'booking' })), ...(monthLeadEvents ?? []).filter((l: any) => !bookedLeadIds.has(l.id) && l.status !== 'lost').map((l: any) => ({ ...l, _type: 'lead' }))]
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
                        const si = getStatusInfo(item.status);
                        return (
                          <div key={item.id} className="flex items-stretch rounded-xl border border-gray-100 overflow-hidden transition-all hover:shadow-sm bg-white">
                            <div className={`w-1 flex-shrink-0 ${si.barClasses}`} />
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
                                <span className={`font-bebas tracking-widest text-[10px] px-2 py-0.5 rounded ${si.calClasses}`}>
                                  {si.label.toUpperCase()}
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

              {/* ── WEEK VIEW ───────────────────────────────────────────────────── */}
              {calendarView === "week" && (() => {
                // Monday of current week
                const dow = (calDate.getDay() + 6) % 7;
                const weekStart = new Date(calDate);
                weekStart.setDate(calDate.getDate() - dow);
                weekStart.setHours(0,0,0,0);
                const days = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(weekStart);
                  d.setDate(weekStart.getDate() + i);
                  return d;
                });
                const todayStr = new Date().toDateString();
                const statusCard = (status: string) => getStatusInfo(status).calClasses;
                const statusLabel = (s: string) => getStatusInfo(s).label.toUpperCase();
                // Combine prev + current + next month for full week boundary support
                const allBookings: any[] = [...(adjPrevMonthBookings ?? []), ...(monthBookings ?? []), ...(adjMonthBookings ?? [])];
                const allBookedLeadIds = new Set(allBookings.map((b: any) => b.leadId).filter(Boolean));
                const allLeads: any[] = [...(adjPrevMonthLeadEvents ?? []), ...(monthLeadEvents ?? []), ...(adjMonthLeadEvents ?? [])].filter((l: any) => !allBookedLeadIds.has(l.id) && l.status !== 'lost');
                return (
                <div className="flex-1 overflow-auto">
                  {/* Day column headers */}
                  <div className="grid grid-cols-7 border-b border-gold/15 sticky top-0 bg-cream z-10">
                    {days.map((d, i) => {
                      const isToday = d.toDateString() === todayStr;
                      return (
                        <button
                          key={i}
                          onClick={() => { setCalDate(d); setCalendarView('day'); }}
                          className={`text-center py-2 border-r border-gold/10 last:border-r-0 hover:bg-linen/60 transition-colors w-full ${isToday ? 'bg-gold/10' : ''}`}
                          title={d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}>
                          <div className="font-bebas tracking-widest text-[10px] text-ink/50">
                            {['MON','TUE','WED','THU','FRI','SAT','SUN'][i]}
                          </div>
                          <div className={`font-cormorant text-lg font-semibold leading-tight ${
                            isToday ? 'text-white bg-forest rounded-full w-7 h-7 flex items-center justify-center mx-auto' : 'text-ink hover:text-forest'
                          }`}>
                            {d.getDate()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Event cells */}
                  <div className="grid grid-cols-7 min-h-[calc(100vh-16rem)]">
                    {days.map((d, i) => {
                      const isToday = d.toDateString() === todayStr;
                      const isWeekend = i >= 5;
                      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                      const dayBookings = allBookings.filter((b: any) => {
                        if (!b.eventDate) return false;
                        const bd = new Date(b.eventDate);
                        return bd.getFullYear() === d.getFullYear() && bd.getMonth() === d.getMonth() && bd.getDate() === d.getDate();
                      });
                      const dayLeads = allLeads.filter((l: any) => {
                        if (!l.eventDate) return false;
                        const ld = new Date(l.eventDate);
                        return ld.getFullYear() === d.getFullYear() && ld.getMonth() === d.getMonth() && ld.getDate() === d.getDate();
                      });
                      return (
                        <div key={i} className={`border-r border-gold/10 last:border-r-0 p-1.5 flex flex-col gap-1 min-h-[140px] ${
                          isWeekend ? 'bg-linen/20' : 'bg-white'
                        } ${isToday ? 'ring-2 ring-inset ring-gold/40' : ''}`}>
                          {dayBookings.map((b: any) => (
                            <button key={b.id}
                              onClick={() => setSelectedBooking(b)}
                              className={`w-full text-left rounded px-1.5 py-1.5 text-[10px] leading-snug font-dm ${statusCard(b.status)} hover:opacity-80 transition-opacity`}>
                              <div className="font-semibold truncate">{b.firstName} {b.lastName}</div>
                              {b.eventType && <div className="opacity-85 truncate">{b.eventType}</div>}
                              {b.startTime && <div className="opacity-75">{b.startTime}{b.endTime ? ` – ${b.endTime}` : ''}</div>}
                              {b.guestCount && <div className="opacity-70">{b.guestCount} pax</div>}
                              <div className="opacity-80 font-bebas tracking-widest text-[8px] mt-0.5">{statusLabel(b.status)}</div>
                            </button>
                          ))}
                          {dayLeads.map((l: any) => (
                            <button key={l.id}
                              onClick={() => setSelectedBooking({ ...l, _isLead: true })}
                              className={`w-full text-left rounded px-1.5 py-1.5 text-[10px] leading-snug font-dm ${statusCard(l.status)} hover:opacity-80 transition-opacity`}>
                              <div className="font-semibold truncate">{l.firstName} {l.lastName}</div>
                              {l.eventType && <div className="opacity-85 truncate">{l.eventType}</div>}
                              {l.guestCount && <div className="opacity-70">{l.guestCount} pax</div>}
                              <div className="opacity-80 font-bebas tracking-widest text-[8px] mt-0.5">{statusLabel(l.status)}</div>
                            </button>
                          ))}
                          {dayBookings.length === 0 && dayLeads.length === 0 && (
                            <button
                              onClick={() => { setAddEnquiryForm(f => ({ ...f, eventDate: ds })); setShowAddLead(true); }}
                              className="text-ink/20 hover:text-ink/50 transition-colors self-start mt-1 p-0.5"
                              title="Add event">
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })()}

              {/* ── DAY VIEW ────────────────────────────────────────────────────── */}
              {calendarView === "day" && (() => {
                const todayStr = new Date().toDateString();
                const isToday = calDate.toDateString() === todayStr;
                const statusCard = (status: string) => getStatusInfo(status).dayClasses;
                const statusDot = (s: string) => {
                  return getStatusInfo(s).barClasses;
                };
                const allBookings: any[] = [...(monthBookings ?? []), ...(adjMonthBookings ?? [])];
                const allLeads: any[] = [...(monthLeadEvents ?? []), ...(adjMonthLeadEvents ?? [])];
                const dayBookings = allBookings.filter((b: any) => {
                  if (!b.eventDate) return false;
                  const bd = new Date(b.eventDate);
                  return bd.getFullYear() === calDate.getFullYear() && bd.getMonth() === calDate.getMonth() && bd.getDate() === calDate.getDate();
                });
                const dayLeads = allLeads.filter((l: any) => {
                  if (!l.eventDate) return false;
                  const ld = new Date(l.eventDate);
                  return ld.getFullYear() === calDate.getFullYear() && ld.getMonth() === calDate.getMonth() && ld.getDate() === calDate.getDate();
                });
                const ds = `${calDate.getFullYear()}-${String(calDate.getMonth()+1).padStart(2,'0')}-${String(calDate.getDate()).padStart(2,'0')}`;
                const totalEvents = dayBookings.length + dayLeads.length;
                return (
                <div className="flex-1 overflow-auto p-4 md:p-6">
                  <div className="max-w-3xl mx-auto">
                    {/* Day header */}
                    <div className={`flex items-center gap-3 mb-6 pb-4 border-b ${isToday ? 'border-gold/40' : 'border-gold/15'}`}>
                      <div className={`text-5xl font-cormorant font-light ${isToday ? 'text-forest' : 'text-ink/70'}`}>
                        {calDate.getDate()}
                      </div>
                      <div>
                        <div className="font-bebas tracking-widest text-sm text-ink/50">
                          {calDate.toLocaleDateString('en-NZ', { weekday: 'long' }).toUpperCase()}
                        </div>
                        <div className="font-cormorant text-xl text-ink">
                          {calDate.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}
                        </div>
                        {isToday && <div className="font-bebas tracking-widest text-[10px] text-forest mt-0.5">TODAY</div>}
                      </div>
                      <div className="ml-auto flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-bebas tracking-widest text-2xl text-ink/80">{totalEvents}</div>
                          <div className="font-dm text-[10px] text-ink/40 leading-none">EVENT{totalEvents !== 1 ? 'S' : ''}</div>
                        </div>
                        <button
                          onClick={() => { setAddEnquiryForm(f => ({ ...f, eventDate: ds })); setShowAddLead(true); }}
                          className="btn-forest text-cream font-bebas tracking-widest text-xs px-3 py-1.5 flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" /> ADD EVENT
                        </button>
                      </div>
                    </div>

                    {/* Events */}
                    {totalEvents === 0 ? (
                      <div className="text-center py-16">
                        <div className="font-cormorant text-3xl text-ink/20 mb-2">No events</div>
                        <p className="font-dm text-sm text-ink/40">Nothing scheduled for this day.</p>
                        <button
                          onClick={() => { setAddEnquiryForm(f => ({ ...f, eventDate: ds })); setShowAddLead(true); }}
                          className="mt-4 font-bebas tracking-widest text-xs text-forest border border-forest/30 px-4 py-2 hover:bg-forest/5 transition-colors">
                          + ADD AN EVENT
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dayBookings.map((b: any) => (
                          <button key={b.id}
                            onClick={() => setSelectedBooking(b)}
                            className={`w-full text-left p-4 ${statusCard(b.status)} hover:opacity-90 transition-opacity`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${statusDot(b.status)}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-cormorant text-lg font-semibold text-ink">
                                    {b.firstName} {b.lastName}
                                  </span>
                                  {b.eventType && (
                                    <span className="font-bebas tracking-widest text-[10px] text-gold bg-gold/15 px-1.5 py-0.5">
                                      {b.eventType}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs font-dm text-ink/60 flex-wrap">
                                  {b.startTime && (
                                    <span className="flex items-center gap-1">
                                      <span className="font-semibold">{b.startTime}</span>
                                      {b.endTime && <span>– {b.endTime}</span>}
                                    </span>
                                  )}
                                  {b.guestCount && <span>{b.guestCount} guests</span>}
                                  {b.spaceName && <span>{b.spaceName}</span>}
                                </div>
                              </div>
                              <div className={`font-bebas tracking-widest text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getStatusInfo(b.status).calClasses}`}>
                                {getStatusInfo(b.status).label.toUpperCase()}
                              </div>
                            </div>
                          </button>
                        ))}
                        {dayLeads.map((l: any) => (
                          <button key={l.id}
                            onClick={() => setSelectedBooking({ ...l, _isLead: true })}
                            className={`w-full text-left p-4 ${statusCard(l.status)} hover:opacity-90 transition-opacity`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${statusDot(l.status)}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-cormorant text-lg font-semibold text-ink">
                                    {l.firstName} {l.lastName}
                                  </span>
                                  {l.eventType && (
                                    <span className="font-bebas tracking-widest text-[10px] text-gold bg-gold/15 px-1.5 py-0.5">
                                      {l.eventType}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs font-dm text-ink/60 flex-wrap">
                                  {l.guestCount && <span>{l.guestCount} guests</span>}
                                  {l.spaceName && <span>{l.spaceName}</span>}
                                </div>
                              </div>
                              <div className={`font-bebas tracking-widest text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${getStatusInfo(l.status).calClasses}`}>
                                {getStatusInfo(l.status).label.toUpperCase()}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

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
                    const dayLeads = (monthLeadEvents ?? []).filter((l: any) => new Date(l.eventDate).getDate() === day && !bookedLeadIds.has(l.id) && l.status !== 'lost');
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
                            b.status === 'confirmed' ? 'text-forest' : b.status === 'tentative' ? 'text-amber-600' : 'text-stone-400'
                          }`}>{b.status?.toUpperCase()}</div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          {b.totalNzd && <div className="font-cormorant text-xl font-semibold text-forest">${Number(b.totalNzd).toLocaleString()}</div>}
                          <div className={`font-bebas text-xs tracking-widest ${b.depositPaid ? "text-forest" : "text-gold"}`}>
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
                        negotiating: 'text-orange-600', booked: 'text-forest', lost: 'text-stone-500', cancelled: 'text-stone-400',
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
                            <div className={`font-bebas text-xs tracking-widest px-1.5 py-0.5 rounded ${getStatusInfo(lead.status).calClasses}`}>
                              {getStatusInfo(lead.status).label.toUpperCase()}
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
          {/* ── CONTACTS ─────────────────────────────────────────────────────── */}
          {tab === "contacts" && (
            <div className="p-6">
              <div className="mb-6">
                <h1 className="font-cormorant text-3xl font-semibold text-ink">Contacts</h1>
                <p className="font-dm text-sm text-sage mt-0.5">All contacts from enquiries and bookings</p>
              </div>
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

          {/* ── MENU tab: redirect to Settings > Menu & Catalogue ─────────── */}
          {tab === "menu" && <MenuTabRedirect setTab={setTab} setSettingsSubTab={setSettingsSubTab} />}

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

              {/* ── VENUE (unified: Details + Profile + Spaces) ─────── */}
              {settingsSubTab === "venue" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-4">Venue Settings</h1>

              {/* Section tabs */}
              <div className="flex gap-0 mb-6 border-b border-gold/20">
                {([
                  { id: 'details', label: 'Basic Details' },
                  { id: 'profile', label: 'Profile & Branding' },
                  { id: 'spaces', label: 'Spaces' },
                ] as const).map(s => (
                  <button key={s.id} onClick={() => setVenueSettingsSection(s.id)}
                    className={`font-bebas tracking-widest text-sm px-5 py-2.5 border-b-2 transition-colors ${
                      venueSettingsSection === s.id ? 'border-forest text-forest' : 'border-transparent text-ink/40 hover:text-ink/70'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* ── BASIC DETAILS SECTION ── */}
              {venueSettingsSection === "details" && settingsForm && (
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
                        <p className="font-dm text-xs text-sage/60 mt-1">Email address to receive new enquiry notifications. Requires SMTP configured in Settings → Email.</p>
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
                    <p className="font-dm text-sm text-ink/60 mb-4">Choose a colour palette for your VenueFlowHQ workspace. This applies across the dashboard, runsheets, and public forms.</p>
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
                  {/* ── Runsheet Courses ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-1">RUNSHEET F&amp;B COURSES</h2>
                    <p className="font-dm text-xs text-ink/50 mb-3">Customise the F&amp;B course categories used in your runsheets (one per line). Leave blank to use defaults.</p>
                    <textarea
                      rows={6}
                      value={(() => {
                        if (settingsForm.customCourses) {
                          try {
                            const arr = JSON.parse(settingsForm.customCourses);
                            if (Array.isArray(arr)) return arr.join('\n');
                          } catch {}
                          return settingsForm.customCourses;
                        }
                        return ['Canapes', 'Entree', 'Main', 'Dessert', 'Cheese', 'Late Night Snack', 'Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Drinks', 'Other'].join('\n');
                      })()}
                      onChange={e => {
                        const lines = e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean);
                        setSettingsForm((f: any) => ({ ...f, customCourses: JSON.stringify(lines) }));
                      }}
                      placeholder={'Canapes\nEntree\nMain\nDessert\nCheese\nDrinks\nOther'}
                      className="w-full border border-gold/30 rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white resize-y"
                    />
                    <p className="font-dm text-[10px] text-ink/30 mt-1">Changes save with the button below.</p>
                  </div>

                  <button type="submit" disabled={updateSettings.isPending}
                    className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                    {updateSettings.isPending ? "SAVING..." : "SAVE VENUE DETAILS"}
                  </button>
                </form>
              )}

              {/* ── PROFILE & BRANDING SECTION ── */}
              {venueSettingsSection === "profile" && settingsForm && (
                <form onSubmit={e => { e.preventDefault(); updateSettings.mutate(settingsForm); }} className="space-y-6">

                  {/* ── Banner Image ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE PROFILE BANNER</h2>
                    <div className="border border-dashed border-gold/30 rounded p-4 text-center bg-linen/30">
                      {settingsForm.bannerImageUrl ? (
                        <div className="relative">
                          <img src={settingsForm.bannerImageUrl} alt="Banner" className="w-full h-48 object-cover rounded"
                            onError={e => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              toast.error("Banner image could not be loaded. Please upload a new image.");
                            }} />
                          <button type="button" onClick={() => {
                            setSettingsForm((f: any) => ({ ...f, bannerImageUrl: "" }));
                            updateSettings.mutate({ bannerImageUrl: "" });
                          }}
                            className="absolute top-2 right-2 bg-white/80 rounded-full p-1 text-ink/60 hover:text-tomato">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block">
                          <input type="file" accept="image/*" className="hidden" onChange={async e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            try {
                              const dataUrl = await compressToDataUrl(file, 1600, 800, 0.80);
                              setSettingsForm((f: any) => ({ ...f, bannerImageUrl: dataUrl }));
                              updateSettings.mutate({ bannerImageUrl: dataUrl });
                            } catch {
                              toast.error("Banner upload failed. Please check your connection and try again.");
                            }
                          }} />
                          <div className="py-8">
                            <ImageIcon className="w-8 h-8 text-gold/40 mx-auto mb-2" />
                            <p className="font-dm text-sm text-sage">Click to upload banner image</p>
                            <p className="font-dm text-xs text-sage/60">Recommended: 1920 × 1080px or wider</p>
                          </div>
                        </label>
                      )}
                    </div>
                    {settingsForm.bannerImageUrl && (
                      <p className="font-dm text-xs text-sage/60 mt-2">Banner image saved. Use the × button to remove it.</p>
                    )}
                  </div>

                  {/* ── Venue Description ── */}
                  <div className="dante-card p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE DESCRIPTION</h2>
                    <div className="space-y-4">
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
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">OPERATING HOURS</h2>
                    <div className="space-y-3">
                      {(() => {
                        let hours: any[] = [];
                        try { hours = JSON.parse(settingsForm.operatingHours); } catch { hours = []; }
                        return hours.map((h: any, i: number) => (
                          <div key={h.day} className="flex items-center gap-4">
                            <div className="flex items-center gap-2 w-32">
                              <input type="checkbox" checked={h.enabled} id={`oh2-${i}`}
                                onChange={e => {
                                  const updated = [...hours]; updated[i] = { ...h, enabled: e.target.checked };
                                  setSettingsForm((f: any) => ({ ...f, operatingHours: JSON.stringify(updated) }));
                                }} className="w-4 h-4 accent-forest" />
                              <label htmlFor={`oh2-${i}`} className="font-dm text-sm text-ink">{h.day}</label>
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

              {/* ── SPACES SECTION ── */}
              {venueSettingsSection === "spaces" && (
              <div>
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
              )}

              </div>
              )}

              {/* ── EMAIL SUB-TAB ────────────────────────────── */}
              {settingsSubTab === "email" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-6">Email</h1>
              {/* Email / SMTP Settings */}
              <div className="border-gold/20">
                <h2 className="font-cormorant text-xl font-semibold text-ink mb-1">Email Notifications</h2>
                <p className="font-dm text-xs text-sage mb-4">When a new enquiry is submitted, VenueFlow emails you the details. Configure SMTP below so it can send on your behalf.</p>

                {/* Config status */}
                {(() => {
                  const missing = [];
                  if (!venueSettings?.smtpHost) missing.push('SMTP Host');
                  if (!venueSettings?.smtpUser) missing.push('Username');
                  if (!venueSettings?.smtpPass) missing.push('Password');
                  if (!venueSettings?.notificationEmail) missing.push('Notification Email (in Venue tab)');
                  const allGood = missing.length === 0;
                  return (
                    <div className={`flex items-start gap-3 p-3 mb-5 rounded border ${allGood ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${allGood ? 'bg-green-500' : 'bg-amber-400'}`} />
                      <div>
                        <p className={`font-dm text-sm font-medium ${allGood ? 'text-green-800' : 'text-amber-800'}`}>
                          {allGood ? 'Email notifications are configured' : 'Email notifications not yet configured'}
                        </p>
                        {!allGood && <p className="font-dm text-xs text-amber-700 mt-0.5">Missing: {missing.join(', ')}</p>}
                      </div>
                    </div>
                  );
                })()}

                {/* Google Workspace recommended setup */}
                <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-5">
                  <p className="font-dm text-sm font-semibold text-blue-900 mb-1">📧 Recommended: Google Workspace / Gmail</p>
                  <p className="font-dm text-xs text-blue-800 mb-3">Since <strong>barfranco.nz</strong> uses Google Workspace, sending through Google's servers guarantees delivery to your inbox — no spam filtering.</p>
                  <ol className="font-dm text-xs text-blue-800 space-y-1.5 list-decimal list-inside">
                    <li>Go to <strong>myaccount.google.com</strong> → Security → 2-Step Verification (enable if not already on)</li>
                    <li>Search for <strong>"App passwords"</strong> on that page → Create one called "VenueFlow"</li>
                    <li>Copy the 16-character password Google gives you</li>
                    <li>Fill in the fields below using the values in the grey box, paste the App Password in the password field</li>
                  </ol>
                  <div className="mt-3 bg-blue-100 rounded p-3 font-mono text-xs text-blue-900 space-y-1">
                    <div><span className="text-blue-600">SMTP Host:</span> smtp.gmail.com</div>
                    <div><span className="text-blue-600">Port:</span> 587</div>
                    <div><span className="text-blue-600">Username:</span> anamaria@barfranco.nz</div>
                    <div><span className="text-blue-600">Password:</span> [16-char App Password from Google]</div>
                  </div>
                </div>

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
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">USERNAME (your Google Workspace email)</label>
                    <Input name="smtpUser" defaultValue={venueSettings?.smtpUser ?? ''} placeholder="anamaria@barfranco.nz"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PASSWORD (Google App Password — 16 chars)</label>
                    <Input name="smtpPass" type="password" defaultValue={venueSettings?.smtpPass ?? ''} placeholder="xxxx xxxx xxxx xxxx"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FROM NAME (shown in inbox)</label>
                    <Input name="smtpFromName" defaultValue={venueSettings?.smtpFromName ?? ''} placeholder="Bar Franco Events"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-1">FROM EMAIL ADDRESS</label>
                    <Input name="smtpFromEmail" defaultValue={venueSettings?.smtpFromEmail ?? ''} placeholder="anamaria@barfranco.nz"
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-3">
                    <input type="checkbox" name="smtpSecure" id="smtpSecure" defaultChecked={(venueSettings?.smtpSecure ?? 0) === 1}
                      className="w-4 h-4 accent-forest" />
                    <label htmlFor="smtpSecure" className="font-dm text-sm text-ink">Use SSL (port 465) — leave unchecked for STARTTLS (port 587, recommended for Gmail)</label>
                  </div>
                  <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={updateSettings.isPending}
                      className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50">
                      {updateSettings.isPending ? "SAVING..." : "SAVE EMAIL SETTINGS"}
                    </button>
                    <button type="button" disabled={testEmailMutation.isPending}
                      onClick={() => {
                        const email = venueSettings?.notificationEmail || venueSettings?.smtpUser;
                        if (!email) { toast.error("Set a Notification Email in Venue Settings first"); return; }
                        testEmailMutation.mutate({ toEmail: email });
                      }}
                      className="font-bebas tracking-widest text-sm px-6 py-3 border border-gold/40 text-ink hover:bg-gold/10 transition-colors disabled:opacity-50">
                      {testEmailMutation.isPending ? "SENDING..." : "SEND TEST EMAIL"}
                    </button>
                    <p className="font-dm text-xs text-sage/60 w-full md:w-auto">Save first, then send a test to confirm delivery.</p>
                  </div>
                </form>
              </div>

              {/* ── Email Signature ─────────────────────────────────────── */}
              <div className="mt-8">
                <h2 className="font-cormorant text-xl font-semibold text-ink mb-1">Email Signature</h2>
                <p className="font-dm text-xs text-sage mb-4">Automatically appended to every outbound email sent from VenueFlow.</p>
                <div className="space-y-3">
                  {/* Logo upload */}
                  <div>
                    <p className="font-bebas tracking-widest text-[10px] text-sage mb-2">LOGO / PHOTO</p>
                    <div className="flex items-start gap-3">
                      {settingsForm?.emailSignatureLogo && (
                        <div className="relative flex-shrink-0">
                          <img src={settingsForm.emailSignatureLogo} alt="Signature logo" className="h-14 w-auto object-contain border border-gold/20 bg-white p-1" />
                          <button
                            type="button"
                            onClick={() => setSettingsForm((f: any) => ({ ...f, emailSignatureLogo: "" }))}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center leading-none hover:bg-red-600"
                          >✕</button>
                        </div>
                      )}
                      <label className="border border-dashed border-gold/40 px-4 py-2.5 cursor-pointer hover:bg-gold/5 transition-colors flex items-center gap-2">
                        <span className="font-bebas tracking-widest text-xs text-sage">{settingsForm?.emailSignatureLogo ? "CHANGE IMAGE" : "UPLOAD LOGO / PHOTO"}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => setSettingsForm((f: any) => ({ ...f, emailSignatureLogo: reader.result as string }));
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <Textarea
                    value={settingsForm?.emailSignature ?? ""}
                    onChange={e => setSettingsForm((f: any) => ({ ...f, emailSignature: e.target.value }))}
                    rows={5}
                    placeholder={`e.g.\n\nKind regards,\nAna Maria\nBar Franco Events\nph: 03 123 4567 | www.barfranco.nz`}
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-dm text-sm resize-none"
                  />
                  {(settingsForm?.emailSignature || settingsForm?.emailSignatureLogo) && (
                    <div className="bg-stone-50 border border-stone-200 p-3">
                      <p className="font-bebas tracking-widest text-[10px] text-sage mb-2">PREVIEW</p>
                      <div className="border-t border-stone-200 pt-2">
                        {settingsForm?.emailSignatureLogo && (
                          <img src={settingsForm.emailSignatureLogo} alt="Logo" className="h-10 w-auto object-contain mb-2" />
                        )}
                        {settingsForm?.emailSignature && (
                          <pre className="font-dm text-xs text-ink/70 whitespace-pre-wrap leading-relaxed">{settingsForm.emailSignature}</pre>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => updateSettings.mutate({ emailSignature: settingsForm?.emailSignature ?? "", emailSignatureLogo: settingsForm?.emailSignatureLogo ?? "" })}
                    disabled={updateSettings.isPending}
                    className="btn-forest font-bebas tracking-widest text-sm px-8 py-3 text-cream disabled:opacity-50"
                  >
                    {updateSettings.isPending ? "SAVING..." : "SAVE SIGNATURE"}
                  </button>
                </div>
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
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-6">Proposal & Templates</h1>
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
                <div className="flex items-center justify-between mb-4">
                  <h1 className="font-cormorant text-3xl font-semibold text-ink">Contact Form</h1>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/enquire/${venueSettings?.slug || ''}`); toast.success('Form link copied!'); }}
                      className="flex items-center gap-2 border border-gold/30 text-ink text-sm px-4 py-2 hover:bg-gold/10 font-bebas tracking-widest">
                      <Copy className="w-4 h-4" /> COPY LINK
                    </button>
                    <a href={`/enquire/${venueSettings?.slug || ''}`} target="_blank" rel="noopener noreferrer"
                      className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1.5">
                      <ExternalLink className="w-3.5 h-3.5" /> OPEN FORM
                    </a>
                  </div>
                </div>
                {/* Iframe embed code */}
                {venueSettings?.slug && (() => {
                  const embedUrl = `${window.location.origin}/enquire/${venueSettings.slug}?embed=1`;
                  const iframeCode = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="440"\n  frameborder="0"\n  style="border:none;"\n  title="Event Enquiry Form"\n></iframe>`;
                  return (
                    <div className="mb-6 bg-sage-tint border border-sage-green/20 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-inter font-semibold text-sm text-gray-900">Embed on your website</p>
                          <p className="font-inter text-xs text-gray-500 mt-0.5">Copy this code and paste it into your website HTML where you want the form to appear.</p>
                        </div>
                        <button
                          onClick={() => { navigator.clipboard.writeText(iframeCode); toast.success('Embed code copied!'); }}
                          className="flex items-center gap-1.5 font-inter text-xs font-semibold px-3 py-2 bg-sage-green text-white rounded-lg hover:bg-sage-dark transition-colors flex-shrink-0 ml-4">
                          <Copy className="w-3.5 h-3.5" /> Copy Code
                        </button>
                      </div>
                      <pre className="bg-white border border-border rounded-lg p-3 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all select-all">{iframeCode}</pre>
                    </div>
                  );
                })()}

              {settingsForm && (
              <form onSubmit={e => {
                e.preventDefault();
                updateSettings.mutate({
                  logoUrl: settingsForm.logoUrl,
                  primaryColor: settingsForm.primaryColor,
                  formFont: settingsForm.formFont,
                  formGalleryImages: settingsForm.formGalleryImages,
                  leadFormTitle: settingsForm.leadFormTitle,
                  leadFormSubtitle: settingsForm.leadFormSubtitle,
                  logoScale: settingsForm.logoScale,
                  galleryPhotoHeight: settingsForm.galleryPhotoHeight,
                  formPageBg: settingsForm.formPageBg,
                  formPageBgImage: settingsForm.formPageBgImage || undefined,
                  formCardBg: settingsForm.formCardBg,
                  formButtonColor: settingsForm.formButtonColor || undefined,
                  formSuccessMessage: settingsForm.formSuccessMessage || undefined,
                  ...(formFields ? { customFormFields: JSON.stringify(formFields) } : {}),
                });
              }} className="space-y-4">

                {/* ── BRANDING ── */}
                <div className="dante-card p-5 space-y-5">
                  <h2 className="font-bebas text-xs tracking-widest text-sage">BRANDING</h2>

                  {/* Logo */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-4">
                      <div className="w-24 h-24 rounded border-2 border-dashed border-gold/40 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0" style={{ padding: '4px' }}>
                        {settingsForm.logoUrl ? (
                          <img src={settingsForm.logoUrl} alt="logo" style={{ width: `${settingsForm.logoScale ?? 100}%`, height: `${settingsForm.logoScale ?? 100}%`, objectFit: 'contain' }} />
                        ) : (
                          <span className="text-[10px] text-gray-400 text-center px-1">No logo</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">LOGO</label>
                        <input type="file" accept="image/*"
                          onChange={async e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            try {
                              const dataUrl = await compressToDataUrl(file, 400, 400, 0.90);
                              setSettingsForm((f: any) => ({ ...f, logoUrl: dataUrl }));
                              toast.success('Logo uploaded!');
                            } catch { toast.error('Logo upload failed.'); }
                          }}
                          className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:border file:border-gold/30 file:text-xs file:font-bebas file:tracking-widest file:bg-transparent file:text-ink hover:file:bg-gold/10 cursor-pointer" />
                        <p className="font-dm text-xs text-ink/40 mt-1">PNG, JPG or SVG. Recommended: square format.</p>
                        {settingsForm.logoUrl && (
                          <button type="button" onClick={() => setSettingsForm((f: any) => ({ ...f, logoUrl: '' }))}
                            className="mt-1 font-dm text-xs text-red-400 hover:text-red-600">Remove logo</button>
                        )}
                      </div>
                    </div>
                    {settingsForm.logoUrl && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bebas text-xs tracking-widest text-sage">LOGO SIZE</label>
                          <span className="font-dm text-xs text-ink/50">{settingsForm.logoScale ?? 100}%</span>
                        </div>
                        <input type="range" min={30} max={200} step={5}
                          value={settingsForm.logoScale ?? 100}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, logoScale: Number(e.target.value) }))}
                          className="w-full accent-sage-green" />
                        <div className="flex justify-between font-dm text-[10px] text-ink/30 mt-0.5">
                          <span>Smaller</span><span>Larger</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Colour + Font row */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-2">HEADER COLOUR</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={settingsForm.primaryColor ?? '#2D4A3E'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, primaryColor: e.target.value }))}
                          className="w-10 h-10 rounded border border-gold/30 cursor-pointer p-0.5" />
                        <Input value={settingsForm.primaryColor ?? '#2D4A3E'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, primaryColor: e.target.value }))}
                          placeholder="#2D4A3E" className="w-28 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-mono text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-2 flex items-center gap-1"><Type className="w-3 h-3" /> FONT</label>
                      <div className="grid grid-cols-2 gap-2">
                        {FORM_FONTS.map(font => (
                          <button key={font.key} type="button"
                            onClick={() => setSettingsForm((f: any) => ({ ...f, formFont: font.key }))}
                            className={`text-left px-3 py-2 border text-xs transition-colors ${(settingsForm.formFont ?? 'inter') === font.key ? 'border-forest bg-forest/5 text-forest' : 'border-gold/30 hover:border-gold/60'}`}>
                            <div className="font-dm font-semibold">{font.label}</div>
                            <div className="text-ink/40">{font.sub}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Live preview */}
                  <div className="border border-gold/20 overflow-hidden rounded">
                    <div className="px-6 py-5 text-center" style={{ backgroundColor: settingsForm.primaryColor ?? '#2D4A3E' }}>
                      {settingsForm.logoUrl && (
                        <div className="flex justify-center mb-2">
                          <img src={settingsForm.logoUrl} alt="logo" style={{ height: `${Math.round((settingsForm.logoScale ?? 100) * 0.4)}px`, width: 'auto', objectFit: 'contain', maxWidth: '100%' }} />
                        </div>
                      )}
                      <div className="text-base font-bold text-white">{venueSettings?.name ?? 'Your Venue'}</div>
                      <div className="text-sm text-white/80 mt-0.5">{settingsForm.leadFormTitle || 'Book Your Event'}</div>
                    </div>
                    <div className="bg-gray-50 py-1.5 text-center text-[10px] text-gray-400 font-bebas tracking-widest">HEADER PREVIEW</div>
                  </div>
                </div>

                {/* ── BACKGROUND & COLOURS ── */}
                <div className="dante-card p-5 space-y-5">
                  <h2 className="font-bebas text-xs tracking-widest text-sage">BACKGROUND &amp; COLOURS</h2>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Page background colour */}
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-2">PAGE BACKGROUND</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={settingsForm.formPageBg ?? '#f8f5f0'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, formPageBg: e.target.value }))}
                          className="w-10 h-10 rounded border border-gold/30 cursor-pointer p-0.5" />
                        <Input value={settingsForm.formPageBg ?? '#f8f5f0'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, formPageBg: e.target.value }))}
                          placeholder="#f8f5f0" className="w-28 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-mono text-sm" />
                      </div>
                      <p className="font-dm text-[10px] text-ink/40 mt-1">Colour behind the form</p>
                    </div>

                    {/* Form card background colour */}
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-2">FORM CARD BACKGROUND</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={settingsForm.formCardBg ?? '#ffffff'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, formCardBg: e.target.value }))}
                          className="w-10 h-10 rounded border border-gold/30 cursor-pointer p-0.5" />
                        <Input value={settingsForm.formCardBg ?? '#ffffff'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, formCardBg: e.target.value }))}
                          placeholder="#ffffff" className="w-28 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-mono text-sm" />
                      </div>
                      <p className="font-dm text-[10px] text-ink/40 mt-1">Colour of the form panels</p>
                    </div>

                    {/* Button colour */}
                    <div>
                      <label className="font-bebas text-xs tracking-widest text-sage block mb-2">BUTTON COLOUR <span className="font-dm text-[9px] tracking-normal normal-case text-ink/30">(optional — defaults to header colour)</span></label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={settingsForm.formButtonColor || settingsForm.primaryColor || '#2D4A3E'}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, formButtonColor: e.target.value }))}
                          className="w-10 h-10 rounded border border-gold/30 cursor-pointer p-0.5" />
                        <Input value={settingsForm.formButtonColor ?? ''}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, formButtonColor: e.target.value }))}
                          placeholder="Same as header colour" className="flex-1 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-mono text-sm" />
                        {settingsForm.formButtonColor && (
                          <button type="button" onClick={() => setSettingsForm((f: any) => ({ ...f, formButtonColor: '' }))}
                            className="font-dm text-xs text-red-400 hover:text-red-600 whitespace-nowrap">Reset</button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Background image */}
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-sage block mb-2">BACKGROUND IMAGE <span className="font-dm text-[9px] tracking-normal normal-case text-ink/30">(optional — shows behind the form)</span></label>
                    {settingsForm.formPageBgImage ? (
                      <div className="flex items-start gap-3">
                        <div className="w-32 h-20 rounded border border-gold/20 overflow-hidden flex-shrink-0">
                          <img src={settingsForm.formPageBgImage} alt="bg" className="w-full h-full object-cover" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-dm text-xs text-ink/60">Background image set</p>
                          <button type="button" onClick={() => setSettingsForm((f: any) => ({ ...f, formPageBgImage: '' }))}
                            className="font-dm text-xs text-red-400 hover:text-red-600">Remove image</button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center gap-3 border border-dashed border-gold/30 p-3 cursor-pointer hover:border-gold/60 hover:bg-gold/5 transition-colors rounded">
                        <Upload className="w-4 h-4 text-ink/30 flex-shrink-0" />
                        <span className="font-dm text-xs text-ink/40">Upload a background image (JPG, PNG)</span>
                        <input type="file" accept="image/*" className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            try {
                              const dataUrl = await compressToDataUrl(file, 1920, 1080, 0.82);
                              setSettingsForm((f: any) => ({ ...f, formPageBgImage: dataUrl }));
                              toast.success('Background image uploaded!');
                            } catch { toast.error('Image upload failed.'); }
                          }} />
                      </label>
                    )}
                    <p className="font-dm text-[10px] text-ink/40 mt-1">When set, the background image overlays your page background colour. The form cards sit on top.</p>
                  </div>

                  {/* Live preview of bg */}
                  <div className="border border-gold/20 rounded overflow-hidden">
                    <div className="relative py-4 px-4"
                      style={{
                        backgroundColor: settingsForm.formPageBg ?? '#f8f5f0',
                        backgroundImage: settingsForm.formPageBgImage ? `url(${settingsForm.formPageBgImage})` : undefined,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                      }}>
                      <div className="rounded border border-gray-100 p-3 shadow-sm text-center text-xs text-gray-500"
                        style={{ backgroundColor: settingsForm.formCardBg ?? '#ffffff' }}>
                        Form panel preview
                      </div>
                      <div className="mt-2 mx-auto w-fit">
                        <div className="rounded-sm text-white text-[10px] font-bold px-4 py-1.5"
                          style={{ backgroundColor: settingsForm.formButtonColor || settingsForm.primaryColor || '#2D4A3E' }}>
                          SUBMIT ENQUIRY
                        </div>
                      </div>
                    </div>
                    <div className="bg-gray-50 py-1.5 text-center text-[10px] text-gray-400 font-bebas tracking-widest">BACKGROUND PREVIEW</div>
                  </div>
                </div>

                {/* ── SUCCESS MESSAGE ── */}
                <div className="dante-card p-5 space-y-3">
                  <h2 className="font-bebas text-xs tracking-widest text-sage">SUCCESS MESSAGE</h2>
                  <p className="font-dm text-xs text-ink/50">Shown after the form is submitted. Use <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px]">&#123;venueName&#125;</code> to insert your venue name.</p>
                  <Textarea
                    value={settingsForm.formSuccessMessage ?? ''}
                    onChange={e => setSettingsForm((f: any) => ({ ...f, formSuccessMessage: e.target.value }))}
                    placeholder={`Thank you for your enquiry. The team at {venueName} will be in touch within 24 hours.`}
                    rows={3}
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold font-dm text-sm resize-none" />
                </div>

                {/* ── PHOTOS ── */}
                <div className="dante-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bebas text-xs tracking-widest text-sage">PHOTOS</h2>
                    <span className="font-dm text-xs text-ink/40">
                      {(() => { try { return JSON.parse(settingsForm.formGalleryImages || '[]').length; } catch { return 0; } })()} / 6 photos
                    </span>
                  </div>
                  <p className="font-dm text-xs text-ink/50">Photos display as a gallery strip on your public contact form.</p>

                  {/* Photo height slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bebas text-xs tracking-widest text-sage">PHOTO HEIGHT</label>
                      <span className="font-dm text-xs text-ink/50">{settingsForm.galleryPhotoHeight ?? 128}px</span>
                    </div>
                    <input type="range" min={60} max={320} step={8}
                      value={settingsForm.galleryPhotoHeight ?? 128}
                      onChange={e => setSettingsForm((f: any) => ({ ...f, galleryPhotoHeight: Number(e.target.value) }))}
                      className="w-full accent-sage-green" />
                    <div className="flex justify-between font-dm text-[10px] text-ink/30 mt-0.5">
                      <span>Shorter</span><span>Taller</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-center gap-3">
                    {(() => {
                      let imgs: string[] = [];
                      try { imgs = JSON.parse(settingsForm.formGalleryImages || '[]'); } catch {}
                      const ph = settingsForm.galleryPhotoHeight ?? 128;
                      const tileW = 140;
                      const reorder = (from: number, to: number) => {
                        const next = [...imgs];
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        setSettingsForm((f: any) => ({ ...f, formGalleryImages: JSON.stringify(next) }));
                      };
                      return [
                        ...imgs.map((url, i) => (
                          <div
                            key={url + i}
                            draggable
                            onDragStart={() => setGalleryDragIdx(i)}
                            onDragOver={e => { e.preventDefault(); setGalleryDragOverIdx(i); }}
                            onDrop={e => {
                              e.preventDefault();
                              if (galleryDragIdx !== null && galleryDragIdx !== i) reorder(galleryDragIdx, i);
                              setGalleryDragIdx(null); setGalleryDragOverIdx(null);
                            }}
                            onDragEnd={() => { setGalleryDragIdx(null); setGalleryDragOverIdx(null); }}
                            className={`relative group bg-gray-100 overflow-hidden border-2 cursor-grab active:cursor-grabbing transition-all flex-shrink-0 ${
                              galleryDragOverIdx === i && galleryDragIdx !== i
                                ? "border-sage-green scale-105 shadow-lg"
                                : galleryDragIdx === i
                                  ? "border-gold/40 opacity-50"
                                  : "border-gold/20"
                            }`}
                            style={{ width: `${tileW}px`, height: `${ph}px` }}
                          >
                            <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
                            <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <GripVertical className="w-3.5 h-3.5 text-white drop-shadow" />
                            </div>
                            <button type="button"
                              onClick={() => {
                                const newImgs = imgs.filter((_, j) => j !== i);
                                setSettingsForm((f: any) => ({ ...f, formGalleryImages: JSON.stringify(newImgs) }));
                              }}
                              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )),
                        imgs.length < 6 ? (
                          <label key="add" className="bg-gray-50 border-2 border-dashed border-gold/30 flex flex-col items-center justify-center cursor-pointer hover:border-gold/60 hover:bg-gold/5 transition-colors flex-shrink-0" style={{ width: `${tileW}px`, height: `${ph}px` }}>
                            <Upload className="w-5 h-5 text-ink/30 mb-1" />
                            <span className="font-dm text-xs text-ink/40">Upload photo</span>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0]; if (!file) return;
                                try {
                                  const dataUrl = await compressToDataUrl(file, 1200, 900, 0.82);
                                  const current: string[] = (() => { try { return JSON.parse(settingsForm.formGalleryImages || '[]'); } catch { return []; } })();
                                  setSettingsForm((f: any) => ({ ...f, formGalleryImages: JSON.stringify([...current, dataUrl]) }));
                                  toast.success('Photo added!');
                                } catch { toast.error('Photo upload failed.'); }
                              }} />
                          </label>
                        ) : null,
                      ];
                    })()}
                  </div>
                </div>

                {/* ── CONTENT ── */}
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

                {/* ── FORM FIELDS ── */}
                <div className="dante-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bebas text-xs tracking-widest text-sage">FORM FIELDS</h2>
                    <span className="font-dm text-xs text-ink/40">Toggle visibility, required, and labels</span>
                  </div>
                  {formFields && (
                    <div className="border border-gold/20 divide-y divide-gold/10">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-linen">
                        <div className="col-span-1 font-bebas text-[9px] tracking-widest text-ink/40">VIS</div>
                        <div className="col-span-1 font-bebas text-[9px] tracking-widest text-ink/40">REQ</div>
                        <div className="col-span-5 font-bebas text-[9px] tracking-widest text-ink/40">LABEL</div>
                        <div className="col-span-2 font-bebas text-[9px] tracking-widest text-ink/40">TYPE</div>
                        <div className="col-span-3"></div>
                      </div>
                      {formFields.map((field, i) => (
                        <div key={field.id} className={`grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm ${!field.visible ? 'opacity-50' : ''}`}>
                          {/* Visible toggle */}
                          <div className="col-span-1">
                            <button type="button" onClick={() => setFormFields(prev => prev ? prev.map((f, j) => j === i ? { ...f, visible: !f.visible } : f) : prev)}
                              className={`${field.visible ? 'text-forest' : 'text-ink/30'} hover:opacity-80 transition-colors`}>
                              {field.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                          </div>
                          {/* Required toggle */}
                          <div className="col-span-1">
                            <button type="button"
                              disabled={field.id === 'firstName' || field.id === 'email'}
                              onClick={() => setFormFields(prev => prev ? prev.map((f, j) => j === i ? { ...f, required: !f.required } : f) : prev)}
                              className={`${field.required ? 'text-amber-500' : 'text-ink/20'} hover:opacity-80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed`}>
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {/* Label */}
                          <div className="col-span-5">
                            <input type="text" value={field.label}
                              onChange={e => setFormFields(prev => prev ? prev.map((f, j) => j === i ? { ...f, label: e.target.value } : f) : prev)}
                              className="w-full text-sm font-dm text-ink bg-transparent border border-transparent hover:border-gold/40 focus:border-forest focus:outline-none px-1 py-0.5 rounded-sm" />
                          </div>
                          {/* Type badge */}
                          <div className="col-span-2">
                            <span className="font-bebas text-[10px] tracking-wide text-ink/40 bg-linen px-1.5 py-0.5">{field.type}</span>
                          </div>
                          {/* Actions */}
                          <div className="col-span-3 flex items-center gap-1 justify-end">
                            <button type="button" disabled={i === 0}
                              onClick={() => setFormFields(prev => { if (!prev) return prev; const a = [...prev]; [a[i-1], a[i]] = [a[i], a[i-1]]; return a; })}
                              className="text-ink/30 hover:text-ink transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-0.5">
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" disabled={i === formFields.length - 1}
                              onClick={() => setFormFields(prev => { if (!prev) return prev; const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a; })}
                              className="text-ink/30 hover:text-ink transition-colors disabled:opacity-20 disabled:cursor-not-allowed p-0.5">
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                            {!field.isDefault && (
                              <button type="button"
                                onClick={() => setFormFields(prev => prev ? prev.filter((_, j) => j !== i) : prev)}
                                className="text-ink/30 hover:text-red-500 transition-colors p-0.5">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add custom field */}
                  <div className="flex items-center gap-2 pt-1">
                    <Input value={newCustomFieldLabel} onChange={e => setNewCustomFieldLabel(e.target.value)}
                      placeholder="New field label..."
                      className="flex-1 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm" />
                    <select value={newCustomFieldType} onChange={e => setNewCustomFieldType(e.target.value as FormFieldDef['type'])}
                      className="border border-gold/30 text-sm font-dm px-2 py-2 focus:outline-none focus:border-forest">
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="textarea">Paragraph</option>
                    </select>
                    <Button type="button"
                      onClick={() => {
                        if (!newCustomFieldLabel.trim()) return;
                        const newField: FormFieldDef = {
                          id: `custom_${Date.now()}`,
                          label: newCustomFieldLabel.trim(),
                          type: newCustomFieldType,
                          required: false,
                          visible: true,
                          isDefault: false,
                        };
                        setFormFields(prev => prev ? [...prev, newField] : [newField]);
                        setNewCustomFieldLabel('');
                      }}
                      className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-none px-3 gap-1">
                      <Plus className="w-3.5 h-3.5" /> ADD
                    </Button>
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
              {settingsSubTab === "integrations" && (() => {
                const nbiConnected = !!(venueSettings as any)?.nbiApiKey && !!(venueSettings as any)?.nbiVenueId;
                const nbiEnabled = (venueSettings as any)?.nbiSyncEnabled === 1;
                return (
                <div className="max-w-3xl mx-auto">
                <h1 className="font-cormorant text-3xl font-semibold text-ink mb-2">Integrations</h1>
                <p className="font-dm text-sm text-ink/50 mb-6">Connect VenueFlowHQ with your other tools. When a booking is confirmed, synced integrations update automatically.</p>
                <div className="space-y-4">

                  {/* ── NowBookIt ── */}
                  <div className="dante-card overflow-hidden">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-[#e8f0fb] flex items-center justify-center flex-shrink-0">
                          <span className="font-bebas text-[#6b98e7] text-sm tracking-wider">NBI</span>
                        </div>
                        <div>
                          <div className="font-cormorant font-semibold text-base text-ink flex items-center gap-2">
                            NowBookIt
                            {nbiConnected && nbiEnabled && (
                              <span className="inline-flex items-center gap-1 font-dm text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />CONNECTED
                              </span>
                            )}
                            {nbiConnected && !nbiEnabled && (
                              <span className="inline-flex items-center gap-1 font-dm text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PAUSED</span>
                            )}
                          </div>
                          <div className="font-dm text-xs text-ink/60">When a booking is confirmed, it's automatically created in your NowBookIt diary so tables can't be double-booked.</div>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gold/20 bg-cream/40 p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">API KEY</label>
                          <input
                            type="password"
                            id="nbi-api-key"
                            defaultValue={(venueSettings as any)?.nbiApiKey ?? ''}
                            placeholder="paste your NowBookIt API key"
                            className="w-full font-dm text-sm border border-gold/30 rounded px-3 py-2 bg-white focus:outline-none focus:border-forest"
                          />
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">VENUE ID</label>
                          <input
                            type="text"
                            id="nbi-venue-id"
                            defaultValue={(venueSettings as any)?.nbiVenueId ?? ''}
                            placeholder="e.g. 12345"
                            className="w-full font-dm text-sm border border-gold/30 rounded px-3 py-2 bg-white focus:outline-none focus:border-forest"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <div
                            className={`relative w-10 h-5 rounded-full transition-colors ${nbiEnabled ? 'bg-forest' : 'bg-stone-300'}`}
                            onClick={() => {
                              const apiKey = (document.getElementById('nbi-api-key') as HTMLInputElement)?.value || (venueSettings as any)?.nbiApiKey || '';
                              const venueId = (document.getElementById('nbi-venue-id') as HTMLInputElement)?.value || (venueSettings as any)?.nbiVenueId || '';
                              if (!apiKey || !venueId) { toast.error('Enter your API Key and Venue ID first'); return; }
                              updateSettings.mutate({ nbiApiKey: apiKey, nbiVenueId: venueId, nbiSyncEnabled: nbiEnabled ? 0 : 1 });
                            }}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${nbiEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="font-dm text-sm text-ink">{nbiEnabled ? 'Sync enabled — confirmed bookings push to NowBookIt' : 'Sync disabled'}</span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const apiKey = (document.getElementById('nbi-api-key') as HTMLInputElement)?.value;
                              const venueId = (document.getElementById('nbi-venue-id') as HTMLInputElement)?.value;
                              if (!apiKey || !venueId) { toast.error('Enter your API Key and Venue ID first'); return; }
                              verifyNbiMutation.mutate({ apiKey, venueId });
                            }}
                            disabled={verifyNbiMutation.isPending}
                            className="font-bebas tracking-widest text-xs px-4 py-2 border border-[#6b98e7] text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded disabled:opacity-50"
                          >
                            {verifyNbiMutation.isPending ? 'TESTING…' : 'TEST CONNECTION'}
                          </button>
                          <button
                            onClick={() => {
                              const apiKey = (document.getElementById('nbi-api-key') as HTMLInputElement)?.value;
                              const venueId = (document.getElementById('nbi-venue-id') as HTMLInputElement)?.value;
                              updateSettings.mutate({ nbiApiKey: apiKey || undefined, nbiVenueId: venueId || undefined });
                            }}
                            disabled={updateSettings.isPending}
                            className="font-bebas tracking-widest text-xs px-4 py-2 bg-forest text-cream hover:bg-forest/90 rounded disabled:opacity-50"
                          >
                            {updateSettings.isPending ? 'SAVING…' : 'SAVE'}
                          </button>
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200/50 rounded p-3 text-xs font-dm text-ink/60 leading-relaxed">
                        <strong className="text-ink/80">Where to find these:</strong> Log in to NowBookIt → Settings → API Access. Copy your API Key and Venue ID from there. Once connected, every booking you mark as <em>Confirmed</em> in VenueFlow will appear automatically in your NowBookIt diary.
                      </div>
                    </div>
                  </div>

                  {/* ── Placeholder integrations ── */}
                  {[{name:'Google Calendar',desc:'Sync bookings to your Google Calendar automatically.',icon:'📅'},{name:'Xero',desc:'Export invoices and payments to Xero accounting.',icon:'💼'},{name:'Mailchimp',desc:'Add new contacts to your Mailchimp mailing list.',icon:'📧'},{name:'Zapier',desc:'Connect VenueFlowHQ to 5,000+ apps via Zapier webhooks.',icon:'⚡'}].map(i => (
                    <div key={i.name} className="dante-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{i.icon}</span>
                        <div>
                          <div className="font-cormorant font-semibold text-base text-ink">{i.name}</div>
                          <div className="font-dm text-xs text-ink/60">{i.desc}</div>
                        </div>
                      </div>
                      <button onClick={() => toast.info('Integration coming soon')} className="font-bebas tracking-widest text-xs px-4 py-2 border border-gold/30 text-ink hover:bg-gold/10">COMING SOON</button>
                    </div>
                  ))}
                </div>
                </div>
                );
              })()}

              {/* ── TAXES & FEES SUB-TAB ───────────────────────── */}
              {settingsSubTab === "taxes" && (
              <div className="max-w-3xl mx-auto">
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-6">Taxes & Fees</h1>
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
              {settingsSubTab === "team" && (() => {
                const ROLES = [{ value: 'staff', label: 'Staff' }, { value: 'manager', label: 'Manager' }, { value: 'admin', label: 'Admin' }];
                const getAccessLink = (token: string) => `${window.location.origin}/api/team-login/${token}`;
                return (
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h1 className="font-cormorant text-3xl font-semibold text-ink">Team</h1>
                    <button onClick={() => setShowTeamForm(true)} className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1">
                      <Plus className="w-3 h-3" /> ADD MEMBER
                    </button>
                  </div>
                  <div className="dante-card p-5 mb-4">
                    <p className="font-dm text-sm text-ink/60">Each team member gets a unique login link. When they click it, they're signed in to your venue dashboard. You can revoke access at any time by removing them.</p>
                  </div>
                  {showTeamForm && (
                    <div className="dante-card p-5 mb-4">
                      <h2 className="font-bebas tracking-widest text-base text-ink mb-4">ADD TEAM MEMBER</h2>
                      <div className="space-y-3">
                        <div>
                          <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">NAME *</label>
                          <input value={teamForm.name} onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))} className="w-full border border-gold/30 px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest" placeholder="e.g. Sarah Jones" />
                        </div>
                        <div>
                          <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">EMAIL (OPTIONAL)</label>
                          <input value={teamForm.email} onChange={e => setTeamForm(p => ({ ...p, email: e.target.value }))} className="w-full border border-gold/30 px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest" placeholder="sarah@venue.co.nz" />
                        </div>
                        <div>
                          <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">ROLE</label>
                          <select value={teamForm.role} onChange={e => setTeamForm(p => ({ ...p, role: e.target.value }))} className="w-full border border-gold/30 px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white">
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => { if (teamForm.name.trim()) createTeamMember.mutate({ name: teamForm.name.trim(), email: teamForm.email || undefined, role: teamForm.role }); }} disabled={!teamForm.name.trim() || createTeamMember.isPending} className="btn-forest text-cream font-bebas tracking-widest text-xs px-5 py-2 disabled:opacity-50">
                            {createTeamMember.isPending ? 'ADDING...' : 'ADD MEMBER'}
                          </button>
                          <button onClick={() => setShowTeamForm(false)} className="font-bebas tracking-widest text-xs px-5 py-2 border border-gold/30 text-ink/60 hover:bg-linen transition-colors">CANCEL</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!teamList || teamList.length === 0 ? (
                    <div className="dante-card p-8 text-center">
                      <p className="font-dm text-sage text-sm">No team members yet. Add staff so they can access the dashboard with their own login link.</p>
                    </div>
                  ) : (
                    <div className="dante-card divide-y divide-gold/20">
                      {teamList.map((member: any) => {
                        const link = getAccessLink(member.accessToken);
                        return (
                          <div key={member.id} className="p-4 flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="font-dm text-sm font-semibold text-ink">{member.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-bebas tracking-widest text-[10px] px-1.5 py-0.5 bg-linen text-ink/60">{member.role.toUpperCase()}</span>
                                {member.email && <span className="font-dm text-xs text-ink/40 truncate">{member.email}</span>}
                                {member.lastAccessedAt && <span className="font-dm text-xs text-ink/30">Last login: {new Date(member.lastAccessedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => { navigator.clipboard.writeText(link); toast.success('Login link copied!'); }}
                                className="font-bebas tracking-widest text-xs px-3 py-1.5 border border-forest/30 text-forest hover:bg-forest/5 transition-colors flex items-center gap-1"
                              >
                                COPY LINK
                              </button>
                              <button
                                onClick={() => { if (confirm(`Remove ${member.name}? Their login link will stop working.`)) deleteTeamMember.mutate({ id: member.id }); }}
                                className="font-bebas tracking-widest text-xs px-3 py-1.5 border border-red-200 text-red-400 hover:bg-red-50 transition-colors"
                              >
                                REMOVE
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })()}



              {/* ── AUTOMATED TASKS ─────────────────────────────── */}
              {settingsSubTab === "automated-tasks" && (() => {
                const taskRules: { name: string; trigger: string; daysOffset: string; priority: string }[] = (() => {
                  try { return JSON.parse((venueSettings as any)?.automatedTaskRules || '[]'); } catch { return []; }
                })();
                const TRIGGER_LABELS: Record<string, string> = {
                  days_before_event: 'Days before event',
                  on_booking_confirmed: 'On booking confirmed',
                  on_function_pack_sent: 'On function pack sent',
                  on_enquiry_received: 'On new enquiry',
                };
                const saveRules = (rules: typeof taskRules) => {
                  updateSettings.mutate({ automatedTaskRules: JSON.stringify(rules) });
                };
                return (
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h1 className="font-cormorant text-3xl font-semibold text-ink">Automated Tasks</h1>
                  </div>
                  <p className="font-dm text-sm text-ink/60 mb-4">When a trigger fires, a task is automatically created and linked to the event.</p>
                  <div className="bg-white border border-gray-200 rounded">
                    <div className="flex items-center justify-between p-4 border-b border-gray-200">
                      <h2 className="font-semibold text-gray-800">Task Rules</h2>
                      <button onClick={() => { setTaskRuleForm({ name: '', trigger: 'days_before_event', daysOffset: '3', priority: 'medium' }); setShowAddTaskRule(true); }} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add Rule</button>
                    </div>
                    {taskRules.length === 0 ? (
                      <div className="p-8 text-center">
                        <p className="font-dm text-sm text-ink/40">No automated task rules yet. Add one to get started.</p>
                      </div>
                    ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left p-3 text-xs font-medium text-gray-500">Task Name</th>
                          <th className="text-left p-3 text-xs font-medium text-gray-500">Trigger</th>
                          <th className="text-left p-3 text-xs font-medium text-gray-500">Priority</th>
                          <th className="p-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {taskRules.map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="p-3 text-sm text-gray-700">{row.name}</td>
                            <td className="p-3 text-sm text-gray-500">
                              {TRIGGER_LABELS[row.trigger] || row.trigger}
                              {row.trigger === 'days_before_event' && row.daysOffset ? ` (${row.daysOffset}d)` : ''}
                            </td>
                            <td className="p-3 text-sm text-gray-500 capitalize">{row.priority}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => { const next = taskRules.filter((_, j) => j !== i); saveRules(next); }} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* ── GROUP SETTINGS ──────────────────────────────── */}
              {settingsSubTab === "group-settings" && (
              <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="font-cormorant text-3xl font-semibold text-ink">Group Settings</h1>
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
                <h1 className="font-cormorant text-3xl font-semibold text-ink">Email</h1>
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
                <h1 className="font-cormorant text-3xl font-semibold text-ink">Profile</h1>
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
                        bgImageUrl={editingFloorPlan.bgImageUrl ?? undefined}
                        isSaving={saveFloorPlan.isPending}
                        planId={editingFloorPlan.id ?? undefined}
                        shareToken={editingFloorPlan.shareToken ?? undefined}
                        onShareTokenGenerated={(token: string) => {
                          setEditingFloorPlan((prev: any) => ({ ...prev, shareToken: token }));
                          refetchFloorPlans();
                        }}
                        onSave={(canvasData: CanvasData, name: string, bgImageUrl?: string) => {
                          saveFloorPlan.mutate({
                            id: editingFloorPlan.id ?? undefined,
                            name,
                            canvasData,
                            bgImageUrl,
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
                        <h1 className="font-cormorant text-3xl font-semibold text-ink">Floor Plans</h1>
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

                    {/* ── Furniture Inventory ── */}
                    <div className="bg-white border border-gray-200 rounded mb-8">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <div>
                          <h2 className="font-semibold text-gray-800 text-sm">Furniture Inventory</h2>
                          <p className="font-dm text-xs text-gray-400 mt-0.5">Define your actual tables and chairs — colours, sizes, quantities. These appear in the floor plan builder so you place real items.</p>
                        </div>
                        {!showInvForm && !editingInvId && (
                          <button
                            onClick={() => { setShowInvForm(true); setEditingInvId(null); setInvForm({ name: '', type: 'rect_table', color: '#d4a574', width: 120, height: 60, seats: '', quantity: '', notes: '' }); }}
                            className="flex items-center gap-1.5 bg-ink text-cream font-bebas tracking-widest text-xs px-4 py-2 hover:bg-ink/80 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> ADD ITEM
                          </button>
                        )}
                      </div>

                      {/* Add / Edit form */}
                      {(showInvForm || editingInvId) && (
                        <div className="p-5 border-b border-gray-100 bg-gray-50">
                          <h3 className="font-bebas tracking-widest text-xs text-gray-500 mb-3">{editingInvId ? 'EDIT ITEM' : 'NEW INVENTORY ITEM'}</h3>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="col-span-2">
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">NAME *</label>
                              <input value={invForm.name} onChange={e => setInvForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Round Table — White Linen"
                                className="w-full border border-gray-200 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-burgundy" />
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">SHAPE</label>
                              <select value={invForm.type} onChange={e => { const t = e.target.value; const defs: Record<string,{w:number,h:number}> = {round_table:{w:80,h:80},rect_table:{w:120,h:60},chair:{w:30,h:30},bar:{w:160,h:50},stage:{w:200,h:80},dance_floor:{w:200,h:200},dj_booth:{w:80,h:60},buffet:{w:160,h:50},gift_table:{w:100,h:50},entrance:{w:60,h:20}}; const d = defs[t] ?? {w:80,h:60}; setInvForm(f => ({ ...f, type: t, width: d.w, height: d.h })); }}
                                className="w-full border border-gray-200 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-burgundy bg-white">
                                <option value="round_table">Round Table</option>
                                <option value="rect_table">Rect Table</option>
                                <option value="chair">Chair</option>
                                <option value="bar">Bar</option>
                                <option value="stage">Stage</option>
                                <option value="dance_floor">Dance Floor</option>
                                <option value="dj_booth">DJ Booth</option>
                                <option value="buffet">Buffet Table</option>
                                <option value="gift_table">Gift Table</option>
                                <option value="entrance">Entrance</option>
                              </select>
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">COLOUR</label>
                              <div className="flex items-center gap-2">
                                <input type="color" value={invForm.color} onChange={e => setInvForm(f => ({ ...f, color: e.target.value }))}
                                  className="w-10 h-8 border border-gray-200 rounded cursor-pointer flex-shrink-0" />
                                <div style={{ width: 32, height: 32, backgroundColor: invForm.color, borderRadius: invForm.type === 'round_table' ? '50%' : 2, border: '1.5px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                                <span className="font-dm text-xs text-gray-400">{invForm.color}</span>
                              </div>
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">WIDTH (px)</label>
                              <input type="number" min="20" value={invForm.width} onChange={e => setInvForm(f => ({ ...f, width: parseInt(e.target.value) || 20 }))}
                                className="w-full border border-gray-200 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-burgundy" />
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">HEIGHT (px)</label>
                              <input type="number" min="20" value={invForm.height} onChange={e => setInvForm(f => ({ ...f, height: parseInt(e.target.value) || 20 }))}
                                className="w-full border border-gray-200 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-burgundy" />
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">SEATS</label>
                              <input type="number" min="1" value={invForm.seats} placeholder="–" onChange={e => setInvForm(f => ({ ...f, seats: e.target.value }))}
                                className="w-full border border-gray-200 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-burgundy" />
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">QTY OWNED</label>
                              <input type="number" min="1" value={invForm.quantity} placeholder="–" onChange={e => setInvForm(f => ({ ...f, quantity: e.target.value }))}
                                className="w-full border border-gray-200 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-burgundy" />
                            </div>
                            <div className="col-span-2">
                              <label className="font-bebas text-xs tracking-widest text-gray-500 block mb-1">NOTES</label>
                              <input value={invForm.notes} placeholder="e.g. Stored in back room" onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))}
                                className="w-full border border-gray-200 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-burgundy" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setShowInvForm(false); setEditingInvId(null); }} className="border border-gray-200 font-bebas tracking-widest text-xs px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors">CANCEL</button>
                            <button onClick={handleSaveFurniture} disabled={createFurniture.isPending || updateFurniture.isPending}
                              className="bg-burgundy text-cream font-bebas tracking-widest text-xs px-6 py-2 hover:bg-burgundy/90 transition-colors disabled:opacity-50">
                              {createFurniture.isPending || updateFurniture.isPending ? 'SAVING...' : 'SAVE ITEM'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inventory list */}
                      {!furnitureInventory || furnitureInventory.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                          <p className="font-dm text-sm">No furniture items yet.</p>
                          <p className="font-dm text-xs mt-1">Add your tables and chairs to use them when building floor plans.</p>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-50">
                              <th className="text-left p-3 pl-5 text-xs font-medium text-gray-400 font-bebas tracking-widest">ITEM</th>
                              <th className="text-left p-3 text-xs font-medium text-gray-400 font-bebas tracking-widest">SHAPE</th>
                              <th className="text-left p-3 text-xs font-medium text-gray-400 font-bebas tracking-widest">SIZE</th>
                              <th className="text-left p-3 text-xs font-medium text-gray-400 font-bebas tracking-widest">SEATS</th>
                              <th className="text-left p-3 text-xs font-medium text-gray-400 font-bebas tracking-widest">QTY</th>
                              <th className="p-3"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(furnitureInventory as any[]).map((item) => (
                              <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                <td className="p-3 pl-5">
                                  <div className="flex items-center gap-3">
                                    <div style={{ width: 28, height: 28, backgroundColor: item.color, borderRadius: item.type === 'round_table' ? '50%' : 2, border: '1.5px solid rgba(0,0,0,0.15)', flexShrink: 0 }} />
                                    <div>
                                      <p className="font-dm text-sm text-gray-800 font-medium">{item.name}</p>
                                      {item.notes && <p className="font-dm text-xs text-gray-400 italic">{item.notes}</p>}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 font-dm text-sm text-gray-500">{item.type.replace('_', ' ')}</td>
                                <td className="p-3 font-dm text-sm text-gray-500">{item.width}×{item.height}</td>
                                <td className="p-3 font-dm text-sm text-gray-500">{item.seats ?? '—'}</td>
                                <td className="p-3 font-dm text-sm text-gray-500">{item.quantity ?? '—'}</td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => { setEditingInvId(item.id); setShowInvForm(false); setInvForm({ name: item.name, type: item.type, color: item.color, width: item.width, height: item.height, seats: item.seats?.toString() ?? '', quantity: item.quantity?.toString() ?? '', notes: item.notes ?? '' }); }}
                                      className="text-gray-400 hover:text-gray-700 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => { if (confirm(`Remove "${item.name}"?`)) deleteFurniture.mutate({ id: item.id }); }}
                                      className="text-red-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
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

              {/* ── MENU & CATALOGUE ─────────────────────────────── */}
              {settingsSubTab === "menu" && (
              <div className="max-w-5xl mx-auto">
                <h1 className="font-cormorant text-3xl font-semibold text-ink mb-4">Menu & Catalogue</h1>

                {/* Sub-section tabs */}
                <div className="flex gap-0 mb-6 border-b border-gold/20">
                  {([
                    { id: 'packages', label: 'F&B Packages' },
                    { id: 'catalogue', label: 'Menu Catalogue' },
                  ] as const).map(s => (
                    <button key={s.id} onClick={() => setMenuSettingsSection(s.id)}
                      className={`font-bebas tracking-widest text-sm px-5 py-2.5 border-b-2 transition-colors ${
                        menuSettingsSection === s.id ? 'border-forest text-forest' : 'border-transparent text-ink/40 hover:text-ink/70'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* ── PACKAGES TAB ── */}
                {menuSettingsSection === 'packages' && (<div className="max-w-3xl mx-auto space-y-6">
                <p className="font-dm text-sm text-ink/60 mb-2">Create F&amp;B packages with pricing. These packages can be selected in proposals and runsheets.</p>

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
                          <td className="p-3 text-center">{s.hasSalesTax ? <span className="text-forest">✓</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="p-3 text-center">{s.hasAdminFee ? <span className="text-forest">✓</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="p-3 text-center">{s.hasGratuity ? <span className="text-forest">✓</span> : <span className="text-gray-300">—</span>}</td>
                          <td className="p-3 text-center">{s.applyToMin ? <span className="text-forest">✓</span> : <span className="text-gray-300">—</span>}</td>
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
                </div>)}

                {/* ── CATALOGUE TAB ── */}
                {menuSettingsSection === 'catalogue' && (<div>
                <p className="font-dm text-sm text-ink/50 mb-6">Build your food and drink catalogue. Items can be selected when building proposals and runsheets.</p>

                {/* Type tabs */}
                <div className="flex gap-0 mb-6 border-b border-gold/20">
                  {(['food','drink'] as const).map(t => (
                    <button key={t} onClick={() => { setCatalogActiveType(t); setCatalogActiveCategoryId(null); }}
                      className={`font-bebas tracking-widest text-sm px-6 py-2.5 border-b-2 transition-colors ${
                        catalogActiveType === t ? 'border-forest text-forest' : 'border-transparent text-ink/40 hover:text-ink/70'
                      }`}>
                      {t === 'food' ? '🍽 FOOD' : '🍷 DRINKS'}
                    </button>
                  ))}
                </div>

                <div className="flex gap-4">
                  {/* Left: Category list */}
                  <div className="w-56 flex-shrink-0">
                    <div className="bg-white border border-gold/20 rounded">
                      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gold/10">
                        <span className="font-bebas tracking-widest text-xs text-ink/50">CATEGORIES</span>
                        <button onClick={() => { setCatalogCategoryForm({ name: '', type: catalogActiveType, description: '' }); setShowCatalogCategoryForm(true); }}
                          className="text-forest hover:text-forest-dark"><Plus className="w-4 h-4" /></button>
                      </div>
                      {showCatalogCategoryForm && (
                        <form onSubmit={e => { e.preventDefault(); createCatalogCategory.mutate({ name: catalogCategoryForm.name, type: catalogActiveType, description: catalogCategoryForm.description || undefined }); }}
                          className="p-3 border-b border-gold/10 bg-linen/40 space-y-2">
                          <Input required value={catalogCategoryForm.name} onChange={e => setCatalogCategoryForm(f => ({ ...f, name: e.target.value }))}
                            placeholder={catalogActiveType === 'food' ? 'e.g. Canapés' : 'e.g. Wines'}
                            className="rounded-none border border-gold/30 text-sm h-8" />
                          <div className="flex gap-1.5">
                            <button type="submit" disabled={createCatalogCategory.isPending} className="btn-forest text-cream font-bebas tracking-widest text-xs px-3 py-1">ADD</button>
                            <button type="button" onClick={() => setShowCatalogCategoryForm(false)} className="border border-gray-300 text-gray-500 text-xs px-3 py-1">Cancel</button>
                          </div>
                        </form>
                      )}
                      <div className="divide-y divide-gold/10">
                        {(catalogCategories ?? []).filter((c: any) => c.type === catalogActiveType).length === 0 && !showCatalogCategoryForm && (
                          <p className="p-4 text-xs text-center text-ink/40">No categories yet</p>
                        )}
                        {(catalogCategories ?? []).filter((c: any) => c.type === catalogActiveType).map((cat: any) => (
                          <div key={cat.id}
                            className={`flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors group ${
                              catalogActiveCategoryId === cat.id ? 'bg-forest/8 border-l-2 border-forest' : 'hover:bg-linen/60'
                            }`}
                            onClick={() => setCatalogActiveCategoryId(cat.id)}>
                            <span className={`font-dm text-sm truncate ${ catalogActiveCategoryId === cat.id ? 'text-forest font-semibold' : 'text-ink/70' }`}>{cat.name}</span>
                            <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${cat.name}" and all its items?`)) deleteCatalogCategory.mutate({ id: cat.id }); }}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                              <Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Items panel */}
                  <div className="flex-1 min-w-0">
                    {catalogActiveCategoryId === null ? (
                      <div className="bg-white border border-gold/20 rounded flex items-center justify-center h-48">
                        <p className="font-dm text-sm text-ink/40">Select a category to view and manage its items</p>
                      </div>
                    ) : (
                      <div className="bg-white border border-gold/20 rounded">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gold/10">
                          <span className="font-bebas tracking-widest text-xs text-ink/50">
                            {(catalogCategories ?? []).find((c: any) => c.id === catalogActiveCategoryId)?.name?.toUpperCase() ?? 'ITEMS'}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 border border-gold/30 px-2 py-1">
                              <Users className="w-3 h-3 text-sage" />
                              <input
                                type="number"
                                min="1"
                                value={catalogGuestCount}
                                onChange={e => setCatalogGuestCount(e.target.value)}
                                placeholder="Guests"
                                className="w-16 font-dm text-xs text-ink bg-transparent outline-none placeholder:text-ink/30"
                              />
                            </div>
                            <button onClick={() => setShowCatalogCsvImport(v => !v)}
                              className="border border-gold/30 text-ink/60 font-bebas tracking-widest text-xs px-3 py-1.5 hover:border-forest hover:text-forest transition-colors">CSV IMPORT</button>
                            <button onClick={() => { setEditingCatalogItemId(null); setCatalogItemForm({ name: '', description: '', pricingType: 'per_person', price: '', unit: 'person', allergens: '' }); setShowCatalogItemForm(true); }}
                              className="btn-forest text-cream font-bebas tracking-widest text-xs px-3 py-1.5">+ ADD ITEM</button>
                          </div>
                        </div>

                        {/* CSV Import panel */}
                        {showCatalogCsvImport && (
                          <div className="p-4 border-b border-gold/10 bg-linen/40 space-y-3">
                            <p className="font-dm text-xs text-ink/60">Paste CSV data below. Format: <code className="bg-gold/10 px-1">name, description, pricing_type (per_person/per_item), price, unit, allergens</code></p>
                            <Textarea value={catalogCsvText} onChange={e => setCatalogCsvText(e.target.value)}
                              placeholder="Smoked Salmon Blini, Served with crème fraîche, per_person, 8.50, person, gluten\nVegetable Spring Roll, Crispy and golden, per_item, 3.00, piece,"
                              className="rounded-none border border-gold/30 font-mono text-xs h-28" />
                            <div className="flex gap-2">
                              <button onClick={() => {
                                const rows = catalogCsvText.trim().split('\n').filter(Boolean).map(line => {
                                  const [name, description, pricingType, price, unit, allergens] = line.split(',').map(s => s.trim());
                                  return { categoryId: catalogActiveCategoryId!, name: name || '', description: description || undefined,
                                    pricingType: (pricingType === 'per_item' ? 'per_item' : 'per_person') as 'per_person'|'per_item',
                                    price: parseFloat(price) || 0, unit: unit || 'person', allergens: allergens || undefined };
                                }).filter(r => r.name);
                                if (rows.length) bulkCreateCatalogItems.mutate(rows);
                              }} disabled={bulkCreateCatalogItems.isPending || !catalogCsvText.trim()}
                                className="btn-forest text-cream font-bebas tracking-widest text-xs px-4 py-1.5">IMPORT {catalogCsvText.trim().split('\n').filter(Boolean).length} ROWS</button>
                              <button onClick={() => { setShowCatalogCsvImport(false); setCatalogCsvText(''); }} className="border border-gray-300 text-gray-500 text-xs px-3 py-1.5">Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Add/Edit item form */}
                        {showCatalogItemForm && (
                          <form onSubmit={e => { e.preventDefault();
                            const data = { name: catalogItemForm.name, description: catalogItemForm.description || undefined,
                              pricingType: catalogItemForm.pricingType, price: parseFloat(catalogItemForm.price) || 0,
                              unit: catalogItemForm.unit || 'person', allergens: catalogItemForm.allergens || undefined };
                            if (editingCatalogItemId) updateCatalogItem.mutate({ id: editingCatalogItemId, ...data });
                            else createCatalogItem.mutate({ categoryId: catalogActiveCategoryId!, ...data });
                          }} className="p-4 border-b border-gold/10 bg-linen/30 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ITEM NAME *</label>
                                <Input required value={catalogItemForm.name} onChange={e => setCatalogItemForm(f => ({ ...f, name: e.target.value }))}
                                  placeholder="e.g. Smoked Salmon Blini" className="rounded-none border border-gold/30 text-sm h-9" />
                              </div>
                              <div>
                                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PRICE (NZD)</label>
                                <Input type="number" step="0.01" value={catalogItemForm.price} onChange={e => setCatalogItemForm(f => ({ ...f, price: e.target.value }))}
                                  placeholder="8.50" className="rounded-none border border-gold/30 text-sm h-9" />
                              </div>
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
                              <Input value={catalogItemForm.description} onChange={e => setCatalogItemForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="Optional description" className="rounded-none border border-gold/30 text-sm h-9" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PRICING TYPE</label>
                                <div className="flex">
                                  <button type="button" onClick={() => setCatalogItemForm(f => ({ ...f, pricingType: 'per_person', unit: 'person' }))}
                                    className={`flex-1 font-bebas tracking-widest text-xs py-2 border transition-colors ${
                                      catalogItemForm.pricingType === 'per_person' ? 'bg-forest text-cream border-forest' : 'border-gold/30 text-ink/50 hover:border-forest'
                                    }`}>PER PERSON</button>
                                  <button type="button" onClick={() => setCatalogItemForm(f => ({ ...f, pricingType: 'per_item', unit: 'piece' }))}
                                    className={`flex-1 font-bebas tracking-widest text-xs py-2 border border-l-0 transition-colors ${
                                      catalogItemForm.pricingType === 'per_item' ? 'bg-forest text-cream border-forest' : 'border-gold/30 text-ink/50 hover:border-forest'
                                    }`}>PER ITEM</button>
                                </div>
                              </div>
                              <div>
                                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">UNIT LABEL</label>
                                <Input value={catalogItemForm.unit} onChange={e => setCatalogItemForm(f => ({ ...f, unit: e.target.value }))}
                                  placeholder={catalogItemForm.pricingType === 'per_person' ? 'person' : 'piece'}
                                  className="rounded-none border border-gold/30 text-sm h-9" />
                              </div>
                            </div>
                            <div>
                              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ALLERGENS</label>
                              <Input value={catalogItemForm.allergens} onChange={e => setCatalogItemForm(f => ({ ...f, allergens: e.target.value }))}
                                placeholder="e.g. gluten, dairy, nuts" className="rounded-none border border-gold/30 text-sm h-9" />
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" disabled={createCatalogItem.isPending || updateCatalogItem.isPending}
                                className="btn-forest text-cream font-bebas tracking-widest text-xs px-4 py-2">{editingCatalogItemId ? 'UPDATE' : 'ADD ITEM'}</button>
                              <button type="button" onClick={() => { setShowCatalogItemForm(false); setEditingCatalogItemId(null); }}
                                className="border border-gray-300 text-gray-500 text-xs px-3 py-2">Cancel</button>
                            </div>
                          </form>
                        )}

                        {/* Items list */}
                        {(() => {
                          const items = catalogItems ?? [];
                          const guests = parseInt(catalogGuestCount) || 0;
                          const totalCost = items.reduce((sum: number, item: any) => {
                            if (item.price <= 0) return sum;
                            return sum + (item.pricingType === 'per_person' ? (item.price / 100) * guests : item.price / 100);
                          }, 0);
                          return (
                          <div>
                            <div className="divide-y divide-gold/10">
                              {items.length === 0 && !showCatalogItemForm && (
                                <p className="p-6 text-center text-sm text-ink/40">No items yet. Click + Add Item to get started, or use CSV Import.</p>
                              )}
                              {items.map((item: any) => {
                                const unitPrice = item.price / 100;
                                const lineTotal = item.price > 0 && guests > 0
                                  ? (item.pricingType === 'per_person' ? unitPrice * guests : unitPrice)
                                  : null;
                                return (
                                <div key={item.id} className="flex items-start justify-between px-4 py-3 hover:bg-linen/30 group">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-dm text-sm font-medium text-ink">{item.name}</span>
                                      <span className={`font-bebas tracking-widest text-[10px] px-1.5 py-0.5 ${
                                        item.pricingType === 'per_person' ? 'bg-forest/10 text-forest' : 'bg-gold/15 text-amber-700'
                                      }`}>{item.pricingType === 'per_person' ? 'PER PERSON' : 'PER ITEM'}</span>
                                      {item.allergens && <span className="font-dm text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{item.allergens}</span>}
                                    </div>
                                    {item.description && <p className="font-dm text-xs text-ink/50 mt-0.5 truncate">{item.description}</p>}
                                  </div>
                                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                                    {item.price > 0 && (
                                      <div className="text-right">
                                        <div className="font-dm text-sm font-semibold text-ink">
                                          ${unitPrice.toFixed(2)}
                                          <span className="text-xs text-ink/40 font-normal"> /{item.unit ?? (item.pricingType === 'per_person' ? 'person' : 'item')}</span>
                                        </div>
                                        {lineTotal !== null && (
                                          <div className="font-bebas text-xs tracking-widest text-forest">
                                            = ${lineTotal.toFixed(2)} {item.pricingType === 'per_person' ? `× ${guests}` : ''}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <button
                                      onClick={() => duplicateCatalogItem.mutate({
                                        categoryId: catalogActiveCategoryId!,
                                        name: `${item.name} (copy)`,
                                        description: item.description ?? undefined,
                                        pricingType: item.pricingType,
                                        price: item.price / 100,
                                        unit: item.unit ?? 'person',
                                        allergens: item.allergens ?? undefined,
                                      })}
                                      title="Duplicate item"
                                      className="opacity-0 group-hover:opacity-100 text-sage hover:text-ink transition-opacity">
                                      <Copy className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => {
                                      setEditingCatalogItemId(item.id);
                                      setCatalogItemForm({ name: item.name, description: item.description ?? '', pricingType: item.pricingType, price: item.price > 0 ? String(item.price / 100) : '', unit: item.unit ?? 'person', allergens: item.allergens ?? '' });
                                      setShowCatalogItemForm(true);
                                    }} className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 transition-opacity">
                                      <Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteCatalogItem.mutate({ id: item.id }); }}
                                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                                      <Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                            {/* Running total */}
                            {guests > 0 && items.some((i: any) => i.price > 0) && (
                              <div className="flex items-center justify-between px-4 py-3 bg-linen/50 border-t border-gold/20">
                                <div>
                                  <span className="font-bebas tracking-widest text-xs text-ink/50">ESTIMATED TOTAL</span>
                                  <span className="font-dm text-xs text-ink/40 ml-2">({guests} guest{guests !== 1 ? 's' : ''})</span>
                                </div>
                                <span className="font-cormorant text-2xl font-semibold text-ink">${totalCost.toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
                </div>)}

              </div>
              )}

              {settingsSubTab === "statuses" && (
              <div className="max-w-2xl mx-auto">
                <h1 className="font-cormorant text-3xl font-semibold text-ink mb-2">Enquiry Statuses</h1>
                <p className="text-sm text-gray-500 mb-6">Define the pipeline stages your enquiries move through. Rename, reorder, add or remove stages to match your workflow.</p>
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <StatusManager
                    initialStatuses={parseCustomStatuses((venueSettings as any)?.customStatuses)}
                    onSaved={() => refetchSettings()}
                  />
                </div>
              </div>
              )}

              {settingsSubTab === "billing" && (
              <div className="max-w-3xl mx-auto">
                <h1 className="font-cormorant text-3xl font-semibold text-ink mb-6">Billing</h1>
                <div className="bg-white border border-gray-200 rounded p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold text-gray-800">Current Plan</h2>
                      <p className="text-sm text-forest font-semibold mt-1">VenueFlowHQ — Full Access</p>
                      <p className="text-xs text-gray-400 mt-0.5">All features unlocked</p>
                    </div>
                    <span className="bg-forest/10 text-forest text-xs font-bebas tracking-widest px-4 py-2 rounded">ACTIVE</span>
                  </div>
                </div>
              </div>
              )}

              {settingsSubTab === "waitlist" && <WaitlistPanel />}

              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── BOOKING SLIDE-OUT PANEL ─────────────────────────────────────── */}
      {selectedBooking && createPortal(
        <div className="fixed inset-0 z-[9999] flex">
          {/* Backdrop */}
          <div className="hidden md:flex flex-1 bg-black/40" onClick={() => setSelectedBooking(null)} />
          {/* Drawer */}
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
                  selectedBooking.status === 'confirmed' || selectedBooking.status === 'booked' ? 'text-forest bg-blue-50 border-blue-200'
                  : selectedBooking.status === 'tentative' ? 'text-amber-600 bg-amber-50 border-amber-200'
                  : selectedBooking.status === 'new' ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-stone-500 bg-stone-50 border-stone-200'
                }`}>{selectedBooking._isLead ? 'ENQUIRY' : (selectedBooking.status?.toUpperCase() ?? 'EVENT')}</span>
                {selectedBooking.eventType && <span className="font-dm text-xs text-ink/60">{selectedBooking.eventType}</span>}
              </div>
              {/* Key Details */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bebas text-xs tracking-widest text-ink/40">DATE</div>
                    <div className="font-dm text-sm text-ink">
                      {selectedBooking.eventDate ? new Date(selectedBooking.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : '—'}
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
              {/* Financials — bookings only */}
              {!selectedBooking._isLead && (
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
                    selectedBooking.depositPaid ? 'text-forest' : 'text-amber-600'
                  }`}>{selectedBooking.depositPaid ? '✓ DEPOSIT PAID' : '⚠ DEPOSIT PENDING'}</div>
                </div>
              )}
              {/* Quick Actions */}
              <div>
                <div className="font-bebas text-xs tracking-widest text-ink/40 mb-2">QUICK ACTIONS</div>
                <div className="grid grid-cols-2 gap-2">
                  {selectedBooking._isLead ? (
                    <>
                      <button onClick={() => { const lead = selectedBooking; setSelectedBooking(null); selectLead(lead); setTab('enquiries'); }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs col-span-2">
                        <FileText className="w-3 h-3 text-gold" /> OPEN ENQUIRY
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/event/${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                        <FileText className="w-3 h-3 text-gold" /> OPEN EVENT
                      </button>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/event/${selectedBooking.id}?tab=budget`); }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                        <TrendingUp className="w-3 h-3 text-gold" /> SPEND
                      </button>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/runsheet?bookingId=${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                        <Clock className="w-3 h-3 text-gold" /> RUNSHEET
                      </button>
                      <button onClick={() => {
                          const a = document.createElement('a');
                          a.href = `/api/beo/${selectedBooking.id}`;
                          a.download = `BEO-${selectedBooking.firstName}-${selectedBooking.lastName ?? ''}.pdf`;
                          document.body.appendChild(a); a.click(); document.body.removeChild(a);
                          toast.success('Generating BEO PDF...');
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-700 text-white hover:bg-amber-800 transition-colors font-bebas tracking-widest text-xs">
                        <Printer className="w-3 h-3" /> BEO PDF
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
                    </>
                  )}
                </div>
              </div>
              {selectedBooking.notes && (
                <div>
                  <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">NOTES</div>
                  <div className="font-dm text-sm text-ink/80 whitespace-pre-wrap bg-cream border border-gold/20 p-3">{selectedBooking.notes}</div>
                </div>
              )}
              {/* Event Spend — bookings only */}
              {!selectedBooking._isLead && <EventSpendSection bookingId={selectedBooking.id} />}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Add Task Rule Modal */}
      <Dialog open={showAddTaskRule} onOpenChange={setShowAddTaskRule}>
        <DialogContent className="max-w-md rounded-none border border-gold/30">
          <DialogHeader>
            <div className="bg-forest-dark -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-cormorant text-xl text-cream font-semibold">Add Task Rule</DialogTitle>
            </div>
          </DialogHeader>
          <form onSubmit={e => {
            e.preventDefault();
            if (!taskRuleForm.name.trim()) return;
            const existing: any[] = (() => { try { return JSON.parse((venueSettings as any)?.automatedTaskRules || '[]'); } catch { return []; } })();
            const next = [...existing, { name: taskRuleForm.name.trim(), trigger: taskRuleForm.trigger, daysOffset: taskRuleForm.daysOffset, priority: taskRuleForm.priority }];
            updateSettings.mutate({ automatedTaskRules: JSON.stringify(next) }, { onSuccess: () => { refetchSettings(); setShowAddTaskRule(false); toast.success('Task rule added!'); } });
          }} className="space-y-3">
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TASK NAME *</label>
              <Input required value={taskRuleForm.name} onChange={e => setTaskRuleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Confirm final guest numbers" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TRIGGER</label>
              <select value={taskRuleForm.trigger} onChange={e => setTaskRuleForm(f => ({ ...f, trigger: e.target.value }))} className="w-full border border-gold/30 bg-white text-sm px-3 py-2 focus:outline-none focus:border-gold">
                <option value="days_before_event">Days before event</option>
                <option value="on_booking_confirmed">On booking confirmed</option>
                <option value="on_function_pack_sent">On function pack sent</option>
                <option value="on_enquiry_received">On new enquiry received</option>
              </select>
            </div>
            {taskRuleForm.trigger === 'days_before_event' && (
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DAYS BEFORE EVENT</label>
                <Input type="number" min="1" value={taskRuleForm.daysOffset} onChange={e => setTaskRuleForm(f => ({ ...f, daysOffset: e.target.value }))} className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
              </div>
            )}
            <div>
              <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PRIORITY</label>
              <select value={taskRuleForm.priority} onChange={e => setTaskRuleForm(f => ({ ...f, priority: e.target.value }))} className="w-full border border-gold/30 bg-white text-sm px-3 py-2 focus:outline-none focus:border-gold">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <button type="submit" disabled={updateSettings.isPending} className="btn-forest w-full font-bebas tracking-widest text-sm py-3 text-cream disabled:opacity-50">
              {updateSettings.isPending ? 'SAVING...' : 'ADD RULE'}
            </button>
          </form>
        </DialogContent>
      </Dialog>

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

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete {selectedLeadIds.size} record{selectedLeadIds.size === 1 ? '' : 's'}?</h3>
            <p className="text-sm text-gray-500 mb-6">This will permanently remove the selected records and all their activity history. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDelete.mutate({ ids: Array.from(selectedLeadIds) })}
                disabled={bulkDelete.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors"
              >
                {bulkDelete.isPending ? 'Deleting…' : `Delete ${selectedLeadIds.size}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImported={() => { refetchLeads(); }}
        />
      )}

      {/* Add Enquiry Modal */}
      <Dialog open={showAddLead} onOpenChange={open => { setShowAddLead(open); if (!open) { setEnquiryPasteText(''); setEnquiryPasteMode(true); } }}>
        <DialogContent className="max-w-lg rounded-none border border-gold/30 max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="bg-forest-dark -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-cormorant text-xl text-cream font-semibold">Add New</DialogTitle>
              <p className="font-dm text-white/50 text-xs mt-1">Paste an email or brief to auto-fill, or enter details manually.</p>
            </div>
          </DialogHeader>

          {/* ── Smart Paste panel ── */}
          {enquiryPasteMode ? (
            <div className="space-y-3">
              <div className="bg-forest/5 border border-forest/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bebas tracking-widest text-xs text-forest">SMART PASTE</span>
                  <span className="font-dm text-[10px] text-ink/40 ml-1">— paste a client email, booking request, or any text</span>
                </div>
                <textarea
                  autoFocus
                  rows={7}
                  value={enquiryPasteText}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text');
                    e.preventDefault();
                    setEnquiryPasteText(text);
                  }}
                  onChange={e => setEnquiryPasteText(e.target.value)}
                  placeholder={"Paste a client email, message or booking request here...\n\nExamples:\n• \"Hi, I'm looking to book a wedding for 80 guests on 14 September...\"\n• A forwarded email from a client\n• A booking brief or inquiry form response"}
                  className="w-full font-dm text-sm text-ink bg-white border border-gold/30 focus:outline-none focus:border-forest resize-none p-3 placeholder:text-ink/30"
                  style={{ minHeight: 140 }}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    disabled={!enquiryPasteText.trim() || enquiryParsing}
                    onClick={() => {
                      setEnquiryParsing(true);
                      parseEnquiryMutation.mutate({ text: enquiryPasteText });
                    }}
                    className="flex-1 bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-sm py-2.5 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                  >
                    {enquiryParsing ? (
                      <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" /> EXTRACTING...</>
                    ) : (
                      'EXTRACT DETAILS WITH AI'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnquiryPasteMode(false)}
                    className="px-4 py-2.5 border border-gold/30 font-bebas tracking-widest text-xs text-ink/50 hover:text-ink hover:border-gold transition-colors"
                  >
                    MANUAL
                  </button>
                </div>
              </div>
            </div>
          ) : (
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
              {enquiryPasteText && (
                <button type="button" onClick={() => setEnquiryPasteMode(true)}
                  className="w-full text-left px-3 py-2 bg-forest/5 border border-forest/20 font-dm text-xs text-forest hover:bg-forest/10 transition-colors">
                  ← Back to Smart Paste
                </button>
              )}
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
                  <label className="font-bebas text-xs tracking-widest text-sage block mb-1">COMPANY</label>
                  <Input value={addEnquiryForm.company} onChange={e => setAddEnquiryForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="Acme Ltd" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EVENT TYPE</label>
                  <Input value={addEnquiryForm.eventType} onChange={e => setAddEnquiryForm(f => ({ ...f, eventType: e.target.value }))}
                    placeholder="Wedding, Birthday, Corporate..." className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EVENT DATE</label>
                  <Input type="date" value={addEnquiryForm.eventDate} onChange={e => setAddEnquiryForm(f => ({ ...f, eventDate: e.target.value }))}
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-sage block mb-1">GUEST COUNT</label>
                  <Input type="number" value={addEnquiryForm.guestCount} onChange={e => setAddEnquiryForm(f => ({ ...f, guestCount: e.target.value }))}
                    placeholder="50" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bebas text-xs tracking-widest text-sage block mb-1">BUDGET (NZD)</label>
                  <Input type="number" value={addEnquiryForm.budget} onChange={e => setAddEnquiryForm(f => ({ ...f, budget: e.target.value }))}
                    placeholder="5000" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-sage block mb-1">STATUS</label>
                  <Select value={addEnquiryForm.status} onValueChange={v => setAddEnquiryForm(f => ({ ...f, status: v as any }))}>
                    <SelectTrigger className="rounded-none border border-gold/30 text-xs font-bebas tracking-widest focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pipelineStages.map(s => (
                        <SelectItem key={s.key} value={s.key} className="font-bebas text-xs tracking-widest">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">NOTES</label>
                <Textarea value={addEnquiryForm.message} onChange={e => setAddEnquiryForm(f => ({ ...f, message: e.target.value }))}
                  rows={2} placeholder="Any additional details..." className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
              </div>
              <button type="submit" disabled={createEnquiry.isPending}
                className="btn-forest w-full font-bebas tracking-widest text-sm py-3 text-cream disabled:opacity-50">
                {createEnquiry.isPending ? 'ADDING...' : 'ADD NEW'}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── MOBILE BOTTOM TAB BAR (hidden on md+) ─────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border flex items-stretch h-16 safe-area-inset-bottom" style={{ boxShadow: '0 -1px 0 oklch(0.850 0.025 68)' }}>
        {[
          { id: "overview", label: "Home", icon: <LayoutDashboard className="w-5 h-5" /> },
          { id: "enquiries", label: "Events", icon: <MessageSquare className="w-5 h-5" /> },
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
