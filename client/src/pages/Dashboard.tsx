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
  SlidersHorizontal, GripVertical, Bell, Paperclip, Download, Printer, CheckSquare,
  Link as LinkIcon
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AccountLoginsSection } from "@/components/AccountLoginsSection";
import { fmtEventTime, combineLocalDateTime } from "@/lib/dateTime";
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
          <span className="flex items-center gap-1.5 font-dm text-xs text-ink/60"><span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" />Finished</span>
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
            const dayBookings = (monthBookings ?? []).filter(Boolean).filter((b: any) => new Date(b.eventDate).getUTCDate() === day);
            const _bookedLeadIds = new Set((monthBookings ?? []).filter(Boolean).map((b: any) => b.leadId).filter(Boolean));
            const dayLeads = (monthLeadEvents ?? []).filter(Boolean).filter((l: any) => new Date(l.eventDate).getUTCDate() === day && !_bookedLeadIds.has(l.id) && l.status !== 'lost');
            const hasConfirmed = dayBookings.some((b: any) => b.status === 'confirmed');
            const hasFinished = dayBookings.some((b: any) => b.status === 'finished');
            const hasTentative = dayBookings.some((b: any) => b.status === 'tentative');
            const hasCancelled = dayBookings.some((b: any) => b.status === 'cancelled');
            const hasEnquiry = dayLeads.length > 0;
            const cellBg = hasConfirmed ? 'bg-blue-50 border-blue-300' : hasFinished ? 'bg-teal-50 border-teal-300' : hasTentative ? 'bg-amber-50 border-amber-300' : hasCancelled ? 'bg-stone-50 border-stone-300' : hasEnquiry ? 'bg-rose-50 border-rose-300' : isToday ? 'bg-gold/10 border-gold' : 'border-transparent hover:bg-linen';
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
                    <span key={b.id} className={`w-2 h-2 rounded-full flex-shrink-0 ${b.status === 'confirmed' ? 'bg-forest' : b.status === 'finished' ? 'bg-teal-400' : b.status === 'tentative' ? 'bg-amber-400' : 'bg-stone-400'}`} />
                  ))}
                  {dayLeads.slice(0, 2).map((l: any) => (
                    <span key={l.id} className="w-2 h-2 rounded-full flex-shrink-0 bg-rose-400" />
                  ))}
                </div>
                {dayBookings.slice(0, 1).map((b: any) => (
                  <div key={b.id} className={`text-[9px] leading-tight font-dm truncate w-full mt-0.5 ${b.status === 'confirmed' ? 'text-forest' : b.status === 'finished' ? 'text-teal-600' : b.status === 'tentative' ? 'text-amber-700' : 'text-stone-500'}`}>{b.firstName}</div>
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
    count: (allLeads ?? []).filter(Boolean).filter((l: any) => l.status === s.key).length,
  }));
  const total = (allLeads ?? []).filter(Boolean).length;
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

// ── API Tokens (Claude / MCP integration) ────────────────────────────────
function ApiTokensSection() {
  const [newName, setNewName] = React.useState("");
  const [newToken, setNewToken] = React.useState<string | null>(null);
  const { data: tokens, refetch } = trpc.apiTokens.list.useQuery();
  const createMutation = trpc.apiTokens.create.useMutation({
    onSuccess: (r: any) => { setNewToken(r.token); setNewName(""); refetch(); },
    onError: (e: any) => toast.error(e?.message || "Failed to create token"),
  });
  const revokeMutation = trpc.apiTokens.revoke.useMutation({
    onSuccess: () => { toast.success("Token revoked"); refetch(); },
  });
  const mcpUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://venueflowhq.com'}/mcp`;

  return (
    <div className="dante-card overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-[#f3eee2] flex items-center justify-center flex-shrink-0">
            <span className="font-bebas text-[#c97b29] text-sm tracking-wider">AI</span>
          </div>
          <div>
            <div className="font-cormorant font-semibold text-base text-ink">Claude / MCP Connector</div>
            <div className="font-dm text-xs text-ink/60">Let Claude read and update your leads, bookings, runsheets and dietaries via the Model Context Protocol.</div>
          </div>
        </div>
      </div>
      <div className="border-t border-gold/20 bg-cream/40 p-5 space-y-4">
        <div>
          <div className="font-bebas text-xs tracking-widest text-sage mb-1">MCP SERVER URL</div>
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs bg-white border border-gold/30 px-3 py-2 flex-1 truncate">{mcpUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(mcpUrl); toast.success("Copied"); }}
              className="font-bebas tracking-widest text-xs px-3 py-2 border border-gold/30 hover:bg-gold/10">COPY</button>
          </div>
          <p className="font-dm text-[11px] text-ink/50 mt-1">In Claude Desktop or Claude.ai, add this as a custom MCP connector with HTTP transport. Use a token below as the bearer auth header.</p>
        </div>

        <div className="border-t border-gold/20 pt-4">
          <div className="font-bebas text-xs tracking-widest text-forest mb-2">CREATE NEW TOKEN</div>
          <div className="flex items-center gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Claude Desktop"
              className="flex-1 font-dm text-sm border border-gold/30 px-3 py-2 bg-white focus:outline-none focus:border-forest" />
            <button onClick={() => newName.trim() && createMutation.mutate({ name: newName.trim() })}
              disabled={!newName.trim() || createMutation.isPending}
              className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream disabled:opacity-50">
              {createMutation.isPending ? 'CREATING…' : 'CREATE TOKEN'}
            </button>
          </div>
          {newToken && (
            <div className="mt-3 bg-amber-50 border border-amber-300 p-3">
              <div className="font-bebas text-xs tracking-widest text-amber-800 mb-1">COPY THIS TOKEN NOW — IT WON'T BE SHOWN AGAIN</div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11px] bg-white border border-amber-300 px-2 py-1.5 flex-1 break-all">{newToken}</code>
                <button onClick={() => { navigator.clipboard.writeText(newToken); toast.success("Copied"); }}
                  className="font-bebas tracking-widest text-xs px-3 py-1.5 border border-amber-400 bg-white hover:bg-amber-100">COPY</button>
                <button onClick={() => setNewToken(null)} className="font-bebas tracking-widest text-xs px-2 py-1.5 text-amber-800 hover:underline">DISMISS</button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gold/20 pt-4">
          <div className="font-bebas text-xs tracking-widest text-forest mb-2">ACTIVE TOKENS</div>
          {(!tokens || tokens.length === 0) ? (
            <div className="font-dm text-xs text-ink/50 italic">No tokens yet.</div>
          ) : (
            <div className="space-y-2">
              {tokens.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between bg-white border border-gold/20 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-dm text-sm text-ink truncate">{t.name} {t.revokedAt ? <span className="text-red-600 text-xs">(revoked)</span> : null}</div>
                    <div className="font-mono text-[11px] text-ink/40">{t.prefix}…{t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ''}</div>
                  </div>
                  {!t.revokedAt && (
                    <button onClick={() => { if (confirm(`Revoke "${t.name}"?`)) revokeMutation.mutate({ id: t.id }); }}
                      className="font-bebas tracking-widest text-xs px-3 py-1.5 border border-red-300 text-red-700 hover:bg-red-50">REVOKE</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
    { id: "statuses", label: "Enquiry Statuses" },
    { id: "waitlist", label: "Waitlist" },
  ];
  const currentLabel = items.find(i => i.id === settingsSubTab)?.label ?? 'Settings';
  return (
    <>
      {/* Mobile: dropdown selector + external links (mirrors desktop sidebar) */}
      <div className="md:hidden border-b border-border bg-white px-4 py-3 space-y-2">
        <select
          value={settingsSubTab}
          onChange={e => setSettingsSubTab(e.target.value as any)}
          className="w-full font-inter text-sm border border-border rounded-lg px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sage-green/40"
        >
          {items.map(item => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        {/* External links — these are full-page routes, not settings sub-tabs,
            so we render them as buttons rather than smuggling them into the
            <select> above. Without these, mobile users had no way to reach
            /daily-checklists at all. */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href="/daily-checklists"
            className="flex items-center justify-center gap-1.5 px-3 py-2 font-inter text-sm font-medium text-sage-dark bg-sage-tint border border-sage-green/30 rounded-lg hover:bg-sage-tint/80 transition-colors"
          >
            Daily Checklists
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
          <a
            href="/eon-report.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-2 font-inter text-sm font-medium text-gray-600 bg-gray-50 border border-border rounded-lg hover:bg-gray-100 transition-colors"
          >
            EON Report
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
          <a
            href="/ordering-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 font-inter text-sm font-medium text-gray-600 bg-gray-50 border border-border rounded-lg hover:bg-gray-100 transition-colors"
          >
            Ordering Guide
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
        </div>
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
            href="/staff-links"
            className="w-full text-left px-4 py-2 font-dm text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-l-2 border-transparent flex items-center justify-between group"
          >
            Staff Portal Links
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
          <a
            href="/ordering-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-left px-4 py-2 font-dm text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 border-l-2 border-transparent flex items-center justify-between group"
          >
            Ordering Guide
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

function PostEventSpendPrompt() {
  const utils = trpc.useUtils();
  const { data: pending } = trpc.bookings.pendingSpend.useQuery();
  const recordSpend = trpc.bookings.recordActualSpend.useMutation({
    onSuccess: () => { utils.bookings.pendingSpend.invalidate(); toast.success('Actual spend recorded'); },
    onError: (e) => toast.error(e.message ?? 'Failed to save'),
  });
  const dismiss = trpc.bookings.dismissSpendPrompt.useMutation({
    onSuccess: () => utils.bookings.pendingSpend.invalidate(),
  });
  const [drafts, setDrafts] = useState<Record<number, { spend: string; notes: string }>>({});
  if (!pending || pending.length === 0) return null;
  return (
    <div className="dante-card p-5 border-l-4 border-l-amber-500 bg-amber-50/40">
      <div className="flex items-start gap-3 mb-3">
        <DollarSign className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-cormorant text-lg font-semibold text-ink">Record actual spend</div>
          <div className="font-dm text-xs text-ink/60">
            {pending.length} {pending.length === 1 ? 'event' : 'events'} finished 2+ days ago without a final spend recorded — track what was actually paid for accurate reporting.
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {pending.map((b: any) => {
          const draft = drafts[b.id] ?? { spend: '', notes: '' };
          const dateStr = b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
          const quoted = b.totalNzd ? Number(b.totalNzd) : null;
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-2 p-3 bg-white border border-amber-200/60">
              <div className="flex-1 min-w-[180px]">
                <div className="font-dm text-sm font-medium text-ink">{b.firstName} {b.lastName ?? ''}</div>
                <div className="font-dm text-xs text-ink/50">{dateStr}{quoted ? ` · Quoted $${quoted.toLocaleString()}` : ''}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-dm text-sm text-ink/60">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draft.spend}
                  onChange={e => setDrafts(d => ({ ...d, [b.id]: { ...draft, spend: e.target.value } }))}
                  className="w-28 border border-gold/30 px-2 py-1 text-sm font-dm rounded-none focus:outline-none focus:border-forest"
                />
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={draft.notes}
                  onChange={e => setDrafts(d => ({ ...d, [b.id]: { ...draft, notes: e.target.value } }))}
                  className="w-40 border border-gold/30 px-2 py-1 text-sm font-dm rounded-none focus:outline-none focus:border-forest"
                />
                <button
                  type="button"
                  onClick={() => {
                    const num = parseFloat(draft.spend);
                    if (!isFinite(num) || num < 0) { toast.error('Enter a valid amount'); return; }
                    recordSpend.mutate({ id: b.id, actualSpend: num, actualSpendNotes: draft.notes || undefined });
                  }}
                  disabled={recordSpend.isPending}
                  className="font-bebas tracking-widest text-[11px] px-3 py-1.5 bg-forest text-cream hover:bg-forest-dark transition-colors disabled:opacity-50">
                  SAVE
                </button>
                <button
                  type="button"
                  onClick={() => dismiss.mutate({ id: b.id })}
                  title="Dismiss"
                  className="text-ink/40 hover:text-ink transition-colors p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const [menuSettingsSection, setMenuSettingsSection] = useState<"packages"|"catalogue">("catalogue");
  const [showCatalogAiPanel, setShowCatalogAiPanel] = useState(false);
  const [catalogAiText, setCatalogAiText] = useState("");
  const [catalogPdfLoading, setCatalogPdfLoading] = useState(false);
  const extractTextFromPdf = async (file: File): Promise<string> => {
    const pdfjs: any = await import("pdfjs-dist");
    // Use the bundled worker so it works in production without external CDNs.
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const totalPages = pdf.numPages;
    const pageCount = Math.min(totalPages, 50);
    const pages: string[] = [];
    try {
      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        try {
          const content = await page.getTextContent();
          // Group text items by approximate line (y position) so prices stay with names.
          const items = (content.items as any[]).filter(it => typeof it.str === "string");
          const lines = new Map<number, Array<{ x: number; str: string }>>();
          for (const it of items) {
            const y = Math.round((it.transform?.[5] ?? 0) * 2) / 2;
            const x = it.transform?.[4] ?? 0;
            if (!lines.has(y)) lines.set(y, []);
            lines.get(y)!.push({ x, str: it.str });
          }
          const sortedYs = [...lines.keys()].sort((a, b) => b - a);
          for (const y of sortedYs) {
            const row = lines.get(y)!.sort((a, b) => a.x - b.x).map(p => p.str).join(" ").replace(/\s+/g, " ").trim();
            if (row) pages.push(row);
          }
        } finally {
          try { page.cleanup?.(); } catch {}
        }
      }
    } finally {
      try { pdf.cleanup?.(); } catch {}
      try { await pdf.destroy?.(); } catch {}
    }
    if (totalPages > 50) {
      toast.info(`PDF has ${totalPages} pages — only the first 50 were processed.`);
    }
    return pages.join("\n");
  };
  const [catalogAiPreview, setCatalogAiPreview] = useState<Array<{ name: string; description?: string; price?: number; pricingType?: 'per_person'|'per_item'; unit?: string; allergens?: string }>>([]);
  const parseFnbForCatalog = trpc.menuCatalog.parseFnbText.useMutation();
  const [leadSearch, setLeadSearch] = useState("");
  // Multi-select status filter — empty array means "All Statuses".
  const [leadStatusFilter, setLeadStatusFilter] = useState<string[]>([]);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!statusFilterOpen) return;
    const onClick = (e: MouseEvent) => {
      if (statusFilterRef.current && !statusFilterRef.current.contains(e.target as Node)) {
        setStatusFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [statusFilterOpen]);
  const toggleLeadStatus = (key: string) => {
    setLeadStatusFilter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setLeadsSubTab("all");
  };
  const [leadsSubTab, setLeadsSubTab] = useState<"new" | "all">("new");

  // ── Events table display prefs — persisted to localStorage ────────────────
  const LEAD_TABLE_PREFS_KEY = "vf_lead_table_prefs_v1";
  const _savedLTP = (() => { try { const r = localStorage.getItem(LEAD_TABLE_PREFS_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; } })();
  const [leadSortBy, setLeadSortByRaw] = useState<"enquiry_date"|"event_date"|"status">(_savedLTP.sortBy ?? "event_date");
  const [leadSortDir, setLeadSortDirRaw] = useState<"asc"|"desc">(_savedLTP.sortDir ?? "asc");
  const [leadDateFilter, setLeadDateFilterRaw] = useState<"all"|"future"|"today"|"weekend"|"month"|"year"|"custom">(_savedLTP.dateFilter ?? "future");
  const [leadStatusExclude, setLeadStatusExcludeRaw] = useState<string[]>(_savedLTP.excludeStatuses ?? ["lost", "finished"]);

  // Persist whenever any pref changes
  useEffect(() => {
    try { localStorage.setItem(LEAD_TABLE_PREFS_KEY, JSON.stringify({ sortBy: leadSortBy, sortDir: leadSortDir, dateFilter: leadDateFilter, excludeStatuses: leadStatusExclude })); } catch {}
  }, [leadSortBy, leadSortDir, leadDateFilter, leadStatusExclude]);

  // Wrapped setters (same signature as original so all existing callsites work unchanged)
  const setLeadSortBy = (v: "enquiry_date"|"event_date"|"status") => setLeadSortByRaw(v);
  const setLeadSortDir = (fn: "asc"|"desc" | ((d: "asc"|"desc") => "asc"|"desc")) =>
    setLeadSortDirRaw(prev => typeof fn === "function" ? fn(prev) : fn);
  const setLeadDateFilter = (v: "all"|"future"|"today"|"weekend"|"month"|"year"|"custom") => setLeadDateFilterRaw(v);
  const toggleLeadStatusExclude = (key: string) =>
    setLeadStatusExcludeRaw(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [leadViewMode, setLeadViewMode] = useState<"list"|"table"|"kanban">("table");
  const [showEventsCalendar, setShowEventsCalendar] = useState<boolean>(true);

  // ── Color-code calendar events by space, so it's easy to see *where* a booking
  // is at a glance. Hash the space name into a fixed palette of soft accents
  // (returns a CSS color string usable as borderLeftColor / a small dot).
  const SPACE_PALETTE = ['#6b98e7','#e4a25b','#7fb069','#c97b9c','#9b8acc','#5fb6ad','#d97a5b','#b88e4a','#8aa9d6','#a07cc5'];
  const spaceColor = (name?: string | null) => {
    if (!name) return null;
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return SPACE_PALETTE[h % SPACE_PALETTE.length];
  };
  const [kanbanDetailOpen, setKanbanDetailOpen] = useState(false);
  const [kanbanSettingsOpen, setKanbanSettingsOpen] = useState(false);
  const [kanbanStagePrefs, setKanbanStagePrefs] = useState<{ visible: string[]; order: string[] } | null>(null);
  // ── Events table display prefs (persisted to localStorage) ──────────────
  const EVENT_TABLE_PREFS_KEY = `vf_events_table_prefs_v1_${user?.id ?? "default"}`;
  const DEFAULT_EVENT_TABLE_PREFS = {
    sortBy: "event_date" as "event_date" | "date_booked" | "status",
    sortDir: "asc" as "asc" | "desc",
    upcomingOnly: true,
    hideStatuses: ["lost", "finished"] as string[],
  };
  const [eventTablePrefs, _setEventTablePrefs] = useState(() => {
    try {
      const raw = localStorage.getItem(`vf_events_table_prefs_v1_${user?.id ?? "default"}`);
      if (raw) return { ...DEFAULT_EVENT_TABLE_PREFS, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_EVENT_TABLE_PREFS };
  });
  const setEventTablePrefs = React.useCallback((updates: Partial<typeof DEFAULT_EVENT_TABLE_PREFS>) => {
    _setEventTablePrefs(prev => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem(EVENT_TABLE_PREFS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [EVENT_TABLE_PREFS_KEY]);
  const eventSortBy = eventTablePrefs.sortBy;
  const eventSortDir = eventTablePrefs.sortDir;
  const [eventStatusFilterOpen, setEventStatusFilterOpen] = useState(false);
  const eventStatusFilterRef = useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!eventStatusFilterOpen) return;
    const handler = (e: MouseEvent) => {
      if (eventStatusFilterRef.current && !eventStatusFilterRef.current.contains(e.target as Node)) {
        setEventStatusFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [eventStatusFilterOpen]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [calDate, setCalDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month'|'week'|'day'|'list'>('month');
  const [showJumpDate, setShowJumpDate] = useState(false);
  const calSwipeStart = useRef<{ x: number; y: number; t: number } | null>(null);

  // Calendar navigation helpers — used by toolbar buttons, keyboard, and swipe.
  const navCalendar = (dir: -1 | 1) => {
    if (calendarView === 'week') { const d = new Date(calDate); d.setDate(d.getDate() + 7 * dir); setCalDate(d); }
    else if (calendarView === 'day') { const d = new Date(calDate); d.setDate(d.getDate() + dir); setCalDate(d); }
    else setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1));
  };
  const navCalendarToday = () => setCalDate(new Date());

  // Close any open jump-to-date popover whenever the user switches tabs (prevents
  // the overview mini-calendar and full calendar from leaking popover state into each other).
  useEffect(() => { setShowJumpDate(false); }, [tab]);

  // Keyboard shortcuts when on Calendar tab (desktop): ←/→ prev/next, T today, M/W/D/L view switch.
  // Also closes the jump-to-date popover on Escape.
  useEffect(() => {
    if (tab !== 'calendar') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape' && showJumpDate) { e.preventDefault(); setShowJumpDate(false); return; }
      if (showJumpDate || showAddLead || selectedBooking) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); navCalendar(-1); break;
        case 'ArrowRight': e.preventDefault(); navCalendar(1); break;
        case 't': case 'T': e.preventDefault(); navCalendarToday(); break;
        case 'm': case 'M': e.preventDefault(); setCalendarView('month'); break;
        case 'w': case 'W': e.preventDefault(); setCalendarView('week'); break;
        case 'd': case 'D': e.preventDefault(); setCalendarView('day'); break;
        case 'l': case 'L': e.preventDefault(); setCalendarView('list'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe handlers for mobile calendar nav (horizontal only).
  // Skips when the touch starts inside a horizontally-scrollable ancestor (e.g. week view at min-w-[700px])
  // so that intentional content panning never triggers prev/next.
  const onCalTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]; if (!t) return;
    let el: HTMLElement | null = e.target as HTMLElement | null;
    let scrollableAncestor = false;
    while (el && el !== e.currentTarget) {
      const cs = window.getComputedStyle(el);
      const ox = cs.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
        scrollableAncestor = true; break;
      }
      el = el.parentElement;
    }
    if (scrollableAncestor) { calSwipeStart.current = null; return; }
    calSwipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onCalTouchEnd = (e: React.TouchEvent) => {
    const start = calSwipeStart.current; calSwipeStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0]; if (!t) return;
    const dx = t.clientX - start.x; const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > 600) return;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.7) return; // mostly vertical → ignore
    navCalendar(dx > 0 ? -1 : 1);
  };
  const [showAddSpace, setShowAddSpace] = useState(false);
  const [spaceForm, setSpaceForm] = useState({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" });
  const [showEditSpace, setShowEditSpace] = useState(false);
  const [editingSpace, setEditingSpace] = useState<any>(null);
  const [editSpaceForm, setEditSpaceForm] = useState({ name: "", description: "", minCapacity: "", maxCapacity: "", minSpend: "" });
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [quickCreateDate, setQuickCreateDate] = useState<string | null>(null);
  const [quickCreateForm, setQuickCreateForm] = useState({ firstName: '', lastName: '', eventType: '', eventTime: '', guestCount: '', notes: '', status: 'new' as 'new' | 'contacted' | 'booked', spaceName: '' });
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
  const [addEnquiryForm, setAddEnquiryForm] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '', eventType: '', eventDate: '', eventTime: '', guestCount: '', budget: '', message: '', status: 'new' as string, spaceName: '' });

  const utils = trpc.useUtils();

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { enabled: !!user?.id });
  const { data: allLeads, refetch: refetchLeads } = trpc.leads.list.useQuery(
    // Server filters by a single status; multi-select filters fan out client-side.
    { status: leadStatusFilter.length === 1 ? leadStatusFilter[0] : undefined },
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
    const safeLeads = allLeads.filter((l: any) => l && l.id != null);
    if (safeLeads.length === 0) return;
    const maxId = Math.max(...safeLeads.map((l: any) => l.id));
    if (knownMaxLeadId.current === null) {
      knownMaxLeadId.current = maxId;
      return;
    }
    if (maxId > knownMaxLeadId.current) {
      const newest = safeLeads.find((l: any) => l.id === maxId);
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
  // Auto-open a lead drawer when ?leadId=N is in the URL (e.g. from Event → View Enquiry)
  const leadIdParamApplied = useRef(false);
  useEffect(() => {
    if (leadIdParamApplied.current) return;
    if (!allLeads || allLeads.length === 0) return;
    const qp = new URLSearchParams(window.location.search);
    const idStr = qp.get('leadId');
    if (!idStr) { leadIdParamApplied.current = true; return; }
    const id = parseInt(idStr, 10);
    const lead = allLeads.find((l: any) => l && l.id === id);
    if (lead) setSelectedLead(lead);
    leadIdParamApplied.current = true;
  }, [allLeads]);
  const { data: selectedLeadActivity } = trpc.leads.getActivity.useQuery(
    { leadId: selectedLead?.id ?? 0 },
    { enabled: !!selectedLead?.id }
  );
  const { data: selectedLeadRunsheets } = trpc.runsheets.list.useQuery(
    { leadId: selectedLead?.id ?? 0 },
    { enabled: !!selectedLead?.id }
  );
  const drawerLeadId = selectedBooking?._isLead ? selectedBooking.id : null;
  const { data: drawerLeadRunsheets } = trpc.runsheets.list.useQuery(
    { leadId: drawerLeadId ?? 0 },
    { enabled: !!drawerLeadId }
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

  const rescheduleLead = trpc.leads.update.useMutation({
    onSuccess: () => {
      refetchLeads();
      utils.leads.eventsByMonth.invalidate();
      utils.bookings.byMonth.invalidate();
      utils.dashboard.invalidate();
      toast.success("Event rescheduled");
    },
    onError: () => toast.error("Failed to reschedule"),
  });
  const rescheduleBooking = trpc.bookings.update.useMutation({
    // Booking edits cascade to the parent lead on the server, so we also
    // need to refresh the lead-driven queries (events table, calendar
    // enquiry layer, dashboard tiles) — otherwise the table keeps the
    // stale row even after a successful save.
    onSuccess: () => {
      utils.bookings.list.invalidate();
      utils.bookings.byMonth.invalidate();
      utils.leads.list.invalidate();
      utils.leads.eventsByMonth.invalidate();
      utils.dashboard.invalidate();
      refetchLeads();
      toast.success("Event rescheduled");
    },
    onError: () => toast.error("Failed to reschedule"),
  });
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  function handleEventDrop(payload: { id: number; type: 'lead'|'booking'; eventDate: string }, newDateStr: string) {
    if (!payload || !newDateStr) return;
    const orig = new Date(payload.eventDate);
    let newIso: string;
    if (isNaN(orig.getTime())) {
      newIso = newDateStr;
    } else {
      // Date-only ("timeless") events: UTC midnight with zero seconds/ms — keep
      // them date-only so we don't conjure a fake time on reschedule.
      const isTimeless = orig.getUTCHours() === 0 && orig.getUTCMinutes() === 0
        && orig.getUTCSeconds() === 0 && orig.getUTCMilliseconds() === 0;
      if (isTimeless) {
        newIso = newDateStr;
      } else {
        // Timed events: preserve local time-of-day on the new date.
        const hh = String(orig.getHours()).padStart(2, '0');
        const mm = String(orig.getMinutes()).padStart(2, '0');
        const ss = String(orig.getSeconds()).padStart(2, '0');
        const ms = String(orig.getMilliseconds()).padStart(3, '0');
        newIso = new Date(`${newDateStr}T${hh}:${mm}:${ss}.${ms}`).toISOString();
        // Reapply the 1ms midnight-collision guard from combineLocalDateTime.
        if (newIso.endsWith('T00:00:00.000Z')) {
          newIso = new Date(`${newDateStr}T${hh}:${mm}:${ss}.001`).toISOString();
        }
      }
    }
    if (payload.type === 'booking') {
      rescheduleBooking.mutate({ id: payload.id, eventDate: newIso });
    } else {
      rescheduleLead.mutate({ id: payload.id, eventDate: newIso });
    }
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
  // Inline edit state for the booking slide-out panel: only one field at a time.
  // `value` is held as a string while editing (forms only deal in strings) and
  // coerced to the right type at save.
  const [drawerEdit, setDrawerEdit] = useState<{ field: string; value: string } | null>(null);
  function saveDrawerField(field: string, raw: string) {
    if (!selectedBooking) return;
    // Email and eventDate are non-nullable on the server schemas — silently
    // ignore "clear to empty" attempts rather than firing a request that will
    // fail validation and leave the optimistic state out of sync.
    if ((field === "email" || field === "eventDate") && raw.trim() === "") {
      setDrawerEdit(null);
      return;
    }
    let mutValue: any = raw;
    if (field === "guestCount") mutValue = raw === "" ? null : Number(raw);
    else if (field === "totalNzd" || field === "depositNzd" || field === "minimumSpend") mutValue = raw === "" ? null : Number(raw);
    else if (field === "eventDate" || field === "eventEndDate") mutValue = raw === "" ? null : new Date(raw).toISOString();
    else if (field === "spaceName") mutValue = raw === "" ? null : raw;
    else mutValue = raw; // email and any other string field
    // Optimistic local update — keep the prior value so we can roll back if the
    // server rejects the mutation.
    const prevValue = (selectedBooking as any)[field];
    setSelectedBooking((prev: any) => prev ? { ...prev, [field]: field === "eventDate" ? mutValue : mutValue } : prev);
    const onErr = () => {
      setSelectedBooking((prev: any) => (prev && prev.id === selectedBooking.id) ? { ...prev, [field]: prevValue } : prev);
      toast.error("Failed to save change — reverted");
    };
    if (selectedBooking._isLead) {
      rescheduleLead.mutate({ id: selectedBooking.id, [field]: mutValue } as any, { onError: onErr });
    } else {
      rescheduleBooking.mutate({ id: selectedBooking.id, [field]: mutValue } as any, { onError: onErr });
    }
    setDrawerEdit(null);
  }
  // ISO datetime → value for <input type="datetime-local"> (yyyy-MM-ddTHH:mm in LOCAL time).
  function toDatetimeLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // ISO datetime → "HH:MM" in LOCAL time (for <input type="time">).
  function toTimeLocal(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // Combine an existing ISO date (or a fallback date) with an "HH:MM" string
  // and return a new datetime-local value (yyyy-MM-ddTHH:mm) ready for save.
  // If no base date is available we anchor to the existing start date.
  function combineDateAndTime(baseIso: string | null | undefined, hhmm: string, fallbackIso?: string | null): string {
    const anchor = baseIso || fallbackIso;
    if (!anchor || !hhmm) return "";
    const d = new Date(anchor);
    if (isNaN(d.getTime())) return "";
    const [hStr, mStr] = hhmm.split(":");
    const h = Number(hStr); const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return "";
    d.setHours(h, m, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
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
      setSelectedLead((prev: any) => prev && prev.id === variables.id ? { ...prev, status: variables.status } : prev);
      if (selectedLead?.id === variables.id) utils.leads.getActivity.invalidate({ leadId: selectedLead.id });
      // Status changes (especially → 'booked') affect bookings list, calendar, and dashboard tiles.
      utils.bookings.invalidate();
      utils.dashboard.invalidate();
      utils.leads.eventsByMonth.invalidate();
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
      setSelectedLeadIds(new Set());
      setBulkSelectMode(false);
      toast.success(`${data.updated} lead${data.updated === 1 ? '' : 's'} updated`);
    },
    onError: (err) => toast.error(err.message || 'Bulk update failed'),
  });
  const bulkDelete = trpc.leads.bulkDelete.useMutation({
    onSuccess: (data) => {
      utils.leads.list.invalidate();
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
  const ensureBookingForLead = trpc.bookings.ensureForLead.useMutation({
    onSuccess: (booking: any) => {
      if (booking) {
        setSelectedBooking(booking);
        utils.bookings.list.invalidate();
        utils.bookings.byMonth.invalidate();
        utils.leads.eventsByMonth.invalidate();
      }
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to open event'),
  });
  /**
   * Open the rich event drawer for any calendar item. If the item is a real
   * booking, just show it. If it's a lead with status booked/confirmed/finished,
   * resolve (or auto-create) the matching booking row so the drawer renders the
   * full quick-actions set (OPEN EVENT, BEO PDF, FLOOR PLAN, etc.). Otherwise
   * fall back to the lead drawer.
   */
  function openEventDrawer(item: any) {
    if (!item) return;
    const isBookingType = item._type === 'booking' || (!('_type' in item) && 'leadId' in item && !item._isLead);
    if (isBookingType) { setSelectedBooking(item); return; }
    if (['booked', 'confirmed', 'finished'].includes(item.status)) {
      setSelectedBooking({ ...item, _isLead: true });
      ensureBookingForLead.mutate({ leadId: item.id });
      return;
    }
    setSelectedBooking({ ...item, _isLead: true });
  }
  const deleteBooking = trpc.bookings.delete.useMutation({
    onSuccess: () => {
      setSelectedBooking(null);
      utils.bookings.list.invalidate();
      utils.bookings.byMonth.invalidate();
      utils.leads.eventsByMonth.invalidate();
      utils.dashboard.stats.invalidate();
      toast.success('Event deleted');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to delete event'),
  });
  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => {
      utils.leads.list.invalidate();
      utils.leads.eventsByMonth.invalidate();
      utils.bookings.byMonth.invalidate();
      utils.dashboard.stats.invalidate();
      setSelectedLead(null);
      setSelectedBooking(null);
      toast.success("Record deleted");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete record"),
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
    onSuccess: (created: any, vars: any) => {
      // Mirror the calendar quick-create: if the user added the enquiry
      // already marked as Booked/Confirmed, materialise a booking row so
      // it actually becomes a real event (calendar, BEO, runsheet).
      // Without this, "Add Enquiry → Booked" left the row stuck as an
      // enquiry forever even though the status said booked.
      if (vars?.status === 'booked' && created?.id) {
        ensureBookingForLead.mutate({ leadId: created.id });
      }
      refetchLeads();
      utils.bookings.byMonth.invalidate();
      utils.leads.eventsByMonth.invalidate();
      setShowAddLead(false);
      setAddEnquiryForm({ firstName: '', lastName: '', email: '', phone: '', company: '', eventType: '', eventDate: '', eventTime: '', guestCount: '', budget: '', message: '', status: 'new', spaceName: '' });
      setEnquiryPasteText('');
      setEnquiryPasteMode(true);
      toast.success(vars?.status === 'booked' ? 'Confirmed event added!' : 'Added successfully!');
    },
    onError: () => toast.error('Failed to add record'),
  });
  const createEnquiryFromCalendar = trpc.leads.create.useMutation({
    onSuccess: (created: any, vars: any) => {
      // If user picked "Confirmed", materialise a real booking row so it's
      // a true Event (not a pending enquiry) — server already sets the lead's
      // status to 'booked'; we just need the matching booking record so it
      // shows on the calendar and BEO/Runsheet are unlocked.
      if (vars?.status === 'booked' && created?.id) {
        ensureBookingForLead.mutate({ leadId: created.id });
      }
      refetchLeads();
      refetchMonthLeadEvents();
      utils.bookings.byMonth.invalidate();
      setQuickCreateDate(null);
      setQuickCreateForm({ firstName: '', lastName: '', eventType: '', eventTime: '', guestCount: '', notes: '', status: 'new', spaceName: '' });
      toast.success(vars?.status === 'booked' ? 'Confirmed event added!' : 'Event added to calendar!');
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
  const [nbiServiceList, setNbiServiceList] = useState<{ id: string; name: string; serviceType: string; duration: number; sections?: { id: string; name: string }[] }[]>([]);
  const [nbiSelectedServiceId, setNbiSelectedServiceId] = useState<string>('');
  // Auto-load NBI services when integrations tab opens with saved credentials
  const nbiAccountIdSaved = (venueSettings as any)?.nbiAccountId as string | undefined;
  const nbiVenueIdSaved = (venueSettings as any)?.nbiVenueId as string | undefined;
  const { data: nbiServicesAuto } = trpc.venue.listNbiServices.useQuery(
    { accountId: nbiAccountIdSaved ?? '', venueId: nbiVenueIdSaved ?? '' },
    { enabled: !!nbiAccountIdSaved && !!nbiVenueIdSaved, staleTime: 60_000 * 5 },
  );
  useEffect(() => {
    if (nbiServicesAuto && nbiServicesAuto.length && nbiServiceList.length === 0) {
      setNbiServiceList(nbiServicesAuto as any);
    }
  }, [nbiServicesAuto]);

  const verifyNbiMutation = trpc.venue.verifyNbi.useMutation({
    onSuccess: async (data) => {
      if (!data.valid) {
        toast.error(`NowBookIt connection failed: ${data.error ?? 'Unknown error'}`);
        return;
      }
      const svc = (data as any).services ?? [];
      setNbiServiceList(svc);
      // ── Auto-save credentials + enable auto-sync as soon as the test passes.
      // This removes a footgun where users clicked TEST CONNECTION, saw the
      // success toast, and assumed the integration was live — without ever
      // hitting SAVE or the toggle. Critically, we await the save and only
      // claim "auto-sync ON" once the DB write succeeded.
      const accountId = (document.getElementById('nbi-account-id') as HTMLInputElement)?.value || '';
      const venueId = (document.getElementById('nbi-venue-id') as HTMLInputElement)?.value || '';
      const serviceId = (document.getElementById('nbi-service-id') as HTMLSelectElement)?.value || '';
      const sectionId = (document.getElementById('nbi-section-id') as HTMLSelectElement)?.value || '';
      if (!accountId || !venueId) {
        toast.success(`Verified${svc.length ? ` · ${svc.length} service${svc.length === 1 ? '' : 's'}` : ''} — but no Account/Venue ID to save.`);
        return;
      }
      try {
        await updateSettings.mutateAsync({
          nbiAccountId: accountId,
          nbiVenueId: venueId,
          nbiServiceId: serviceId || undefined,
          nbiSectionId: sectionId || undefined,
          nbiSyncEnabled: 1,
        });
        toast.success(`Connected — auto-sync ON${svc.length ? ` · ${svc.length} service${svc.length === 1 ? '' : 's'}` : ''}.`);
      } catch (e: any) {
        toast.error(`Verified, but couldn't save settings: ${e?.message ?? 'Unknown error'}. Please click SAVE manually.`);
      }
    },
    onError: (err) => toast.error(err.message || "Failed to verify NowBookIt credentials"),
  });
  // Inbound webhook URL (NBI → VFHQ). Generated lazily server-side.
  const { data: nbiWebhook, refetch: refetchNbiWebhook } = trpc.venue.getNbiWebhookUrl.useQuery(
    undefined,
    { enabled: !!nbiAccountIdSaved && !!nbiVenueIdSaved, staleTime: Infinity },
  );
  const regenWebhookMutation = trpc.venue.regenerateNbiWebhookSecret.useMutation({
    onSuccess: () => { refetchNbiWebhook(); toast.success('Webhook URL regenerated — paste the new one into NowBookIt.'); },
    onError: (err) => toast.error(err.message || 'Failed to regenerate webhook'),
  });
  const pushToNbiMutation = trpc.bookings.pushToNbi.useMutation({
    onSuccess: (data) => {
      if (data.alreadyPushed) {
        toast.success(`Already in NowBookIt (#${data.nbiBookingId})`);
      } else {
        toast.success(`Pushed to NowBookIt${data.nbiBookingId ? ` (#${data.nbiBookingId})` : ''}!`);
      }
      utils.bookings.list.invalidate();
      utils.bookings.byMonth.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to push to NowBookIt"),
  });
  const markNbiSyncedMutation = trpc.bookings.markNbiSynced.useMutation({
    onSuccess: () => {
      toast.success("Marked as synced in NowBookIt — VenueFlow will stop trying to re-push.");
      utils.bookings.list.invalidate();
      utils.bookings.byMonth.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update sync status"),
  });
  const clearNbiSyncMutation = trpc.bookings.clearNbiSync.useMutation({
    onSuccess: () => {
      toast.success("Cleared NowBookIt sync — you can push again.");
      utils.bookings.list.invalidate();
      utils.bookings.byMonth.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to clear sync"),
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
  const getBeoTokenMutation = trpc.bookings.getOrCreateBeoToken.useMutation();

  // Menu packages
  const { data: menuPackages, refetch: refetchMenuPackages } = trpc.menu.listPackages.useQuery(undefined, { enabled: !!user?.id });
  const [menuForm, setMenuForm] = useState({ name: "", type: "food" as "food"|"beverages"|"food_and_beverages", description: "", pricePerHead: "", customPriceLabel: "", chefNotes: "", pdfUrl: "", pdfName: "" });
  const [menuPdfUploading, setMenuPdfUploading] = useState(false);
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
    },
    onError: (err) => toast.error(err.message || "Failed to send email"),
  });

  const createMenuPackage = trpc.menu.createPackage.useMutation({
    onSuccess: () => { refetchMenuPackages(); setShowMenuForm(false); setMenuForm({ name: "", type: "food", description: "", pricePerHead: "", customPriceLabel: "", chefNotes: "", pdfUrl: "", pdfName: "" }); toast.success("Menu package added!"); },
    onError: () => toast.error("Failed to add menu package"),
  });
  const updateMenuPackage = trpc.menu.updatePackage.useMutation({
    onSuccess: () => { refetchMenuPackages(); setEditingPackageId(null); setShowMenuForm(false); setMenuForm({ name: "", type: "food", description: "", pricePerHead: "", customPriceLabel: "", chefNotes: "", pdfUrl: "", pdfName: "" }); toast.success("Package updated!"); },
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
  // Bulk select / edit / delete state for the catalogue items list. The set
  // is reset whenever the active category changes so selections never leak
  // across categories.
  const [catalogSelectedIds, setCatalogSelectedIds] = useState<Set<number>>(new Set());
  React.useEffect(() => { setCatalogSelectedIds(new Set()); }, [catalogActiveCategoryId]);
  const toggleCatalogSelected = (id: number) => setCatalogSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const bulkDeleteCatalogItems = trpc.menuCatalog.bulkDeleteItems.useMutation({
    onSuccess: (d) => { refetchCatalogItems(); setCatalogSelectedIds(new Set()); toast.success(`Deleted ${d.count} item${d.count !== 1 ? 's' : ''}`); },
    onError: () => toast.error('Bulk delete failed'),
  });
  const bulkUpdateCatalogItems = trpc.menuCatalog.bulkUpdateItems.useMutation({
    onSuccess: (d) => { refetchCatalogItems(); setCatalogSelectedIds(new Set()); toast.success(`Updated ${d.count} item${d.count !== 1 ? 's' : ''}`); },
    onError: () => toast.error('Bulk update failed'),
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
        paymentInstructions: (vs as any)?.paymentInstructions ?? "",
        staffBriefingSubject: (vs as any)?.staffBriefingSubject ?? "",
        staffBriefingBody: (vs as any)?.staffBriefingBody ?? "",
        customCourses: (() => {
          if (vs?.customCourses) {
            try {
              const arr = JSON.parse(vs.customCourses);
              if (Array.isArray(arr)) return arr.join('\n');
            } catch {}
            return vs.customCourses;
          }
          return '';
        })(),
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

  // Confirmed statuses are treated as Events (shown on Calendar), not Enquiries.
  // Filter out any null/undefined entries defensively — a single bad row from
  // the API would otherwise crash every downstream `.map(l => l.id)` and
  // break the whole dashboard render.
  const CONFIRMED_STATUSES = ['booked', 'confirmed'];
  const allEnquiries = (allLeads ?? []).filter(Boolean).filter((l: any) => l && typeof l === 'object' && l.id != null);
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

  // When the user has picked one or more statuses, fetch+filter from the full
  // enquiry set. Multiple selections OR together.
  const leadsToShow = leadStatusFilter.length > 0
    ? applyDateFilter(allEnquiries).filter((l: any) => leadStatusFilter.includes(l.status))
    : leadsSubTab === "new" ? applyDateFilter(newEnquiries) : applyDateFilter(repliedLeads);
  const filteredLeads = leadsToShow
    .filter((l: any) => !leadStatusExclude.includes(l.status))
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
  const safeMonthBookings = (monthBookings ?? []).filter(Boolean).filter((b: any) => b && b.id != null && b.eventDate);
  const safeMonthLeadEvents = (monthLeadEvents ?? []).filter(Boolean).filter((l: any) => l && l.id != null && l.eventDate);
  const bookingDays = new Set(safeMonthBookings.map((b: any) => new Date(b.eventDate).getUTCDate()));
  const leadEventDays = new Set((monthLeadEvents ?? []).filter(Boolean).map((l: any) => new Date(l.eventDate).getUTCDate()));
  // Deduplicate: leads that already have a booking record should not show as separate lead cards
  const bookedLeadIds = new Set((monthBookings ?? []).filter(Boolean).map((b: any) => b.leadId).filter(Boolean));

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

  const monthCalendarCard = (
                  <div className="lg:col-span-2 dante-card overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border flex-shrink-0 relative">
                    <button onClick={() => setCalDate(new Date(year, month - 1, 1))} className="p-1.5 hover:bg-linen transition-colors text-sage"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => setCalDate(new Date(year, month + 1, 1))} className="p-1.5 hover:bg-linen transition-colors text-sage"><ChevronRight className="w-4 h-4" /></button>
                    <div className="flex-1 min-w-0 relative">
                      <button
                        type="button"
                        onClick={() => setShowJumpDate(v => !v)}
                        title="Click to jump to a different month"
                        aria-haspopup="dialog"
                        aria-expanded={showJumpDate}
                        className="font-cormorant text-lg font-semibold text-ink hover:text-forest transition-colors flex items-center gap-1.5 max-w-full">
                        <span className="truncate">{MONTHS[month]} {year}</span>
                        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showJumpDate ? 'rotate-180' : ''}`} />
                      </button>
                      {showJumpDate && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowJumpDate(false)} />
                          <div role="dialog" aria-label="Jump to date" className="absolute left-0 top-full mt-2 z-50 bg-white border border-gold/30 shadow-xl p-3 w-72">
                            <div className="flex items-center justify-between mb-3">
                              <button onClick={() => setCalDate(new Date(year - 1, month, 1))}
                                className="p-1.5 hover:bg-linen border border-gold/20 text-forest"><ChevronLeft className="w-4 h-4" /></button>
                              <span className="font-cormorant text-lg font-semibold text-ink">{year}</span>
                              <button onClick={() => setCalDate(new Date(year + 1, month, 1))}
                                className="p-1.5 hover:bg-linen border border-gold/20 text-forest"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                            <div className="grid grid-cols-3 gap-1 mb-3">
                              {MONTHS.map((m, i) => {
                                const isCurrent = i === month;
                                const isThisMonth = i === new Date().getMonth() && year === new Date().getFullYear();
                                return (
                                  <button key={m}
                                    onClick={() => { setCalDate(new Date(year, i, 1)); setShowJumpDate(false); }}
                                    className={`font-bebas tracking-widest text-xs py-2 border transition-colors ${
                                      isCurrent ? 'bg-forest-dark text-cream border-forest-dark'
                                      : isThisMonth ? 'border-gold text-forest hover:bg-linen'
                                      : 'border-gold/20 text-ink/70 hover:bg-linen'
                                    }`}>{m.slice(0, 3).toUpperCase()}</button>
                                );
                              })}
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-gold/15">
                              <button onClick={() => { setCalDate(new Date()); setShowJumpDate(false); }}
                                className="flex-1 font-bebas tracking-widest text-xs py-2 border border-gold/30 text-ink/80 hover:bg-linen">TODAY</button>
                              <input type="date" defaultValue={`${year}-${String(month+1).padStart(2,'0')}-${String(calDate.getDate()).padStart(2,'0')}`}
                                onChange={e => { if (e.target.value) { setCalDate(new Date(e.target.value)); setShowJumpDate(false); } }}
                                className="flex-1 font-dm text-xs px-2 py-1.5 border border-gold/30 text-ink/80 focus:outline-none focus:border-gold" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
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
                      const adjBLIds = new Set((adjMonthBookings ?? []).filter(Boolean).map((b: any) => b.leadId).filter(Boolean));
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
                              ? (adjMonthBookings ?? []).filter(Boolean).filter((b: any) => new Date(b.eventDate).getUTCDate() === day)
                              : (monthBookings ?? []).filter(Boolean).filter((b: any) => new Date(b.eventDate).getUTCDate() === day);
                            const dayLeads = isOverflow
                              ? (adjMonthLeadEvents ?? []).filter(Boolean).filter((l: any) => new Date(l.eventDate).getUTCDate() === day && !adjBLIds.has(l.id) && l.status !== 'lost')
                              : (monthLeadEvents ?? []).filter(Boolean).filter((l: any) => new Date(l.eventDate).getUTCDate() === day && !bookedLeadIds.has(l.id) && l.status !== 'lost');
                            const dateStr = `${cellYear}-${String(cellMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                            return (
                              <div key={di}
                                className={`group border-r border-border last:border-r-0 flex flex-col p-1.5 gap-0.5 min-h-[56px] ${
                                  isOverflow ? 'bg-linen/40 opacity-60' : isWeekend ? 'bg-linen/20' : 'bg-white'
                                } ${isToday ? 'ring-2 ring-inset ring-forest' : ''} ${dragOverDate === dateStr ? 'bg-forest/10 ring-2 ring-inset ring-forest/40' : ''} ${!isOverflow ? 'hover:bg-linen/30 transition-colors' : ''}`}
                                onDragOver={!isOverflow ? (e) => { e.preventDefault(); setDragOverDate(dateStr); } : undefined}
                                onDragLeave={!isOverflow ? () => setDragOverDate(prev => prev === dateStr ? null : prev) : undefined}
                                onDrop={!isOverflow ? (e) => {
                                  e.preventDefault(); setDragOverDate(null);
                                  try { const data = JSON.parse(e.dataTransfer.getData('application/json')); handleEventDrop(data, dateStr); } catch {}
                                } : undefined}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className={`font-dm text-xs font-semibold leading-none ${
                                    isToday ? 'w-5 h-5 bg-forest text-cream rounded-full flex items-center justify-center text-[10px]' : isOverflow ? 'text-ink/30' : isWeekend ? 'text-forest' : 'text-ink/60'
                                  }`}>{day}</span>
                                  {!isOverflow && (
                                    <button
                                      onClick={() => { setQuickCreateDate(dateStr); setQuickCreateForm({ firstName: '', lastName: '', eventType: '', eventTime: '', guestCount: '', notes: '', status: 'new', spaceName: '' }); }}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-linen rounded"
                                      title="Add event">
                                      <Plus className="w-3 h-3 text-forest" />
                                    </button>
                                  )}
                                </div>
                                {dayBookings.slice(0, 2).map((b: any) => (
                                  <button key={b.id}
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ id: b.id, type: 'booking', eventDate: b.eventDate })); e.dataTransfer.effectAllowed = 'move'; }}
                                    onClick={() => { setSelectedBooking(b); }}
                                    style={spaceColor(b.spaceName) ? { borderLeft: `3px solid ${spaceColor(b.spaceName)}` } : undefined}
                                    className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-snug font-dm ${getStatusInfo(b.status).calClasses} hover:opacity-80 transition-opacity cursor-move`}
                                    title={`${b.firstName} ${b.lastName ?? ''} — ${b.eventType ?? 'Event'}${b.guestCount ? ` — ${b.guestCount} guests` : ''}${b.spaceName ? ` — ${b.spaceName}` : ''}`}>
                                    <div className="font-semibold truncate">{b.firstName} {b.lastName}</div>
                                    {(b.guestCount || b.spaceName) && (
                                      <div className="opacity-75 truncate text-[9px] font-semibold">{b.guestCount ? `${b.guestCount} pax` : ''}{b.guestCount && b.spaceName ? ' · ' : ''}{b.spaceName ?? ''}</div>
                                    )}
                                    <div className="opacity-80 font-bebas tracking-widest text-[9px] mt-0.5">{getStatusInfo(b.status).label.toUpperCase()}</div>
                                  </button>
                                ))}
                                {dayLeads.slice(0, 1).map((l: any) => (
                                  <button key={l.id}
                                    draggable
                                    onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ id: l.id, type: 'lead', eventDate: l.eventDate })); e.dataTransfer.effectAllowed = 'move'; }}
                                    onClick={() => { openEventDrawer({ ...l, _isLead: true }); }}
                                    style={spaceColor(l.spaceName) ? { borderLeft: `3px solid ${spaceColor(l.spaceName)}` } : undefined}
                                    className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-snug font-dm ${getStatusInfo(l.status).calClasses} hover:opacity-80 transition-opacity cursor-move`}
                                    title={`${l.firstName} ${l.lastName ?? ''} — ${l.eventType ?? 'Enquiry'}${l.guestCount ? ` — ${l.guestCount} guests` : ''}`}>
                                    <div className="font-semibold truncate">{l.firstName} {l.lastName}</div>
                                    {l.guestCount && (
                                      <div className="opacity-75 truncate text-[9px]">{l.guestCount} pax</div>
                                    )}
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

              {/* KPI Cards — clickable, route to relevant tab */}
              {visibleStats.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  {visibleStats.map(s => {
                    const target: DashTab = (
                      s.id === 'active_enquiries' ? 'enquiries' :
                      s.id === 'upcoming_events' ? 'calendar' :
                      s.id === 'proposals_sent' ? 'pipeline' :
                      s.id === 'conversion_rate' ? 'reports' :
                      s.id === 'revenue_month' ? 'reports' :
                      s.id === 'overdue_tasks' ? 'tasks' :
                      'overview'
                    );
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setTab(target); }}
                        aria-label={`Open ${s.label}`}
                        className="dante-card p-3 md:p-5 text-left hover:shadow-md hover:border-forest/40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <div className="mb-2 md:mb-3">{s.icon}</div>
                        <div className="font-cormorant text-2xl md:text-4xl font-semibold text-ink mb-1 leading-tight">{s.value}</div>
                        <div className="font-bebas text-[10px] md:text-xs tracking-widest text-sage leading-snug">{s.label}</div>
                        <div className="font-dm text-[10px] md:text-xs text-sage/60 mt-0.5 leading-tight">{s.sub}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Post-Event Spend Prompt — surfaces 2 days after event end */}
              <PostEventSpendPrompt />
              

              {/* Calendar + Sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar card */}
                {monthCalendarCard}

                {/* Sidebar cards */}
                <div className="space-y-4">
                  {/* Upcoming Events */}
                  <div className="dante-card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <h3 className="font-cormorant text-base font-semibold text-ink">Upcoming Events</h3>
                      <button onClick={() => setTab('calendar')} className="font-dm text-xs text-forest hover:text-forest-dark transition-colors">View all</button>
                    </div>
                    {(() => {
                      const upcoming = [...(monthBookings ?? []).filter(Boolean), ...(monthLeadEvents ?? []).filter(Boolean).filter((l: any) => (l.status === 'booked' || l.status === 'confirmed') && !bookedLeadIds.has(l.id))]
                        .filter((e: any) => !['cancelled','lost','declined'].includes(e.status))
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
                                onClick={() => openEventDrawer(e._type === 'booking' ? e : { ...e, _isLead: true })}
                                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-linen transition-colors text-left">
                                <div className="w-1 min-h-[32px] rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: getStatusInfo(e.status).swatch }} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-dm text-xs font-semibold text-ink truncate">{e.firstName} {e.lastName}</div>
                                  <div className="font-dm text-xs text-sage">{new Date(e.eventDate).toLocaleDateString('en-NZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}{fmtEventTime(e.eventDate) ? ` · ${fmtEventTime(e.eventDate)}` : ''}{e.guestCount ? ` · ${e.guestCount}` : ''}</div>
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
                              <div className="font-dm text-xs text-sage truncate">{lead.eventType || 'Event'}{lead.eventDate ? ` · ${new Date(lead.eventDate).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}${fmtEventTime(lead.eventDate) ? ' ' + fmtEventTime(lead.eventDate) : ''}` : ''}</div>
                            </div>
                          </button>
                        ))}
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
            <div className="flex h-full overflow-hidden">

              {/* ── EVENTS SUB-SIDEBAR ─────────────────────────────────────── */}
              <aside className="hidden md:flex flex-col w-48 flex-shrink-0 bg-forest-dark text-cream/90 border-r border-forest overflow-y-auto">
                <div className="px-4 py-3 border-b border-forest/40">
                  <div className="font-bebas tracking-widest text-xs text-gold">EVENTS</div>
                </div>
                {([
                  { key: 'calendar', label: 'Calendar', icon: <Calendar className="w-3.5 h-3.5" />, onClick: () => setTab('calendar' as any) },
                  { key: 'table', label: 'View Events Table', icon: <Table2 className="w-3.5 h-3.5" />, onClick: () => { setLeadViewMode('table'); setLeadStatusFilter([]); setLeadsSubTab('all'); setSelectedLead(null); }, active: leadViewMode === 'table' && leadStatusFilter.length === 0 },
                  { key: 'add_event', label: 'Add Event', icon: <Plus className="w-3.5 h-3.5" />, onClick: () => { setAddEnquiryForm(f => ({ ...f, status: 'booked' })); setEnquiryPasteMode(false); setShowAddLead(true); } },
                  { key: 'add_enquiry', label: 'Add Enquiry', icon: <Plus className="w-3.5 h-3.5" />, onClick: () => { setAddEnquiryForm(f => ({ ...f, status: 'new' })); setEnquiryPasteMode(true); setShowAddLead(true); } },
                  { key: 'add_quote', label: 'Add Quote', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => setLocation('/proposals/new') },
                  { key: 'view_enquiries', label: 'View Enquiries', icon: <MessageSquare className="w-3.5 h-3.5" />, onClick: () => { setLeadViewMode('table'); setLeadStatusFilter(['new']); setLeadsSubTab('all'); setSelectedLead(null); }, active: leadStatusFilter.length === 1 && leadStatusFilter[0] === 'new' },
                  { key: 'view_quotes', label: 'View Quotes', icon: <FileText className="w-3.5 h-3.5" />, onClick: () => { setLeadViewMode('table'); setLeadStatusFilter(['proposal_sent']); setLeadsSubTab('all'); setSelectedLead(null); }, active: leadStatusFilter.length === 1 && leadStatusFilter[0] === 'proposal_sent' },
                ]).map((item: any) => (
                  <button
                    key={item.key}
                    onClick={item.onClick}
                    className={`flex items-center gap-2 px-4 py-2.5 text-left font-dm text-xs border-l-2 transition-colors ${item.active ? 'bg-forest border-gold text-cream' : 'border-transparent hover:bg-forest hover:border-gold/40'}`}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </aside>

              {/* ── MAIN EVENTS COLUMN ─────────────────────────────────────── */}
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

              {/* ── TOP TOOLBAR ──────────────────────────────────────────────── */}
              <div className="flex-shrink-0 bg-white border-b border-gold/15">
                {/* Row 1: Sub-tabs + view modes + actions */}
                <div className="flex items-center gap-2 px-3 md:px-4 py-3 flex-wrap gap-y-2">
                  {/* Sub-tabs or heading */}
                  {newEnquiries.length > 0 ? (
                    <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
                      <button onClick={() => { setLeadsSubTab("new"); setSelectedLead(null); }}
                        className={`font-bebas tracking-widest text-xs px-3 py-1.5 flex items-center gap-1.5 transition-colors ${leadsSubTab === "new" ? "bg-white text-ink shadow-sm" : "text-ink/40 hover:text-ink"}`}>
                        NEW
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${leadsSubTab === "new" ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700"}`}>{newEnquiries.length}</span>
                      </button>
                      <button onClick={() => { setLeadsSubTab("all"); setSelectedLead(null); }}
                        className={`font-bebas tracking-widest text-xs px-3 py-1.5 flex items-center gap-1.5 transition-colors ${leadsSubTab === "all" ? "bg-white text-ink shadow-sm" : "text-ink/40 hover:text-ink"}`}>
                        ALL EVENTS
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${leadsSubTab === "all" ? "bg-forest text-white" : "bg-gray-200 text-gray-600"}`}>{(allEnquiries ?? []).length}</span>
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
                      { mode: "table" as const, icon: <Table2 className="w-3.5 h-3.5" />, title: "Table view" },
                      { mode: "list" as const, icon: <List className="w-3.5 h-3.5" />, title: "List view" },
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
                      className="flex items-center gap-1.5 bg-forest-dark text-cream font-bebas tracking-widest text-xs px-3 py-2 hover:bg-forest transition-colors">
                      <Plus className="w-3.5 h-3.5" /> ADD NEW
                    </button>
                    <button onClick={() => setShowCsvImport(true)} title="Import from CSV"
                      className="px-3 py-2 border border-gold/30 text-ink/60 hover:border-gold hover:text-ink hover:bg-gold/5 transition-colors text-xs font-bebas tracking-widest flex items-center gap-1.5">
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
                        className="flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-1.5 border border-gold/30 text-ink/60 hover:bg-linen transition-colors">
                        <SlidersHorizontal className="w-3.5 h-3.5" /> CUSTOMISE
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
                    {/* Multi-select status filter — checkboxes let the user
                        view multiple statuses at once or hide ones they don't
                        care about. Empty selection means "All Statuses". */}
                    <div className="relative" ref={statusFilterRef}>
                      <button
                        type="button"
                        onClick={() => setStatusFilterOpen(o => !o)}
                        className={`h-8 px-3 text-xs font-inter rounded-lg border flex items-center gap-2 ${(leadStatusFilter.length > 0 || leadStatusExclude.length > 0) ? "border-sage-green bg-sage-green/10 text-sage-dark" : "border-gray-200 bg-white text-ink"}`}>
                        <span className="truncate">
                          {leadStatusFilter.length === 0
                            ? leadStatusExclude.length > 0
                              ? `${leadStatusExclude.length} hidden`
                              : "All Statuses"
                            : leadStatusFilter.length === 1
                            ? (pipelineStages.find(s => s.key === leadStatusFilter[0])?.label ?? leadStatusFilter[0])
                            : `${leadStatusFilter.length} statuses`}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                      </button>
                      {statusFilterOpen && (
                        <div className="absolute z-50 mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 max-h-[70vh] overflow-y-auto">
                          {/* Show section */}
                          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 mb-1">
                            <span className="font-bebas tracking-widest text-[10px] text-ink/40">SHOW ONLY</span>
                            {leadStatusFilter.length > 0 && (
                              <button onClick={() => setLeadStatusFilter([])} className="text-[10px] font-dm text-forest hover:underline">CLEAR</button>
                            )}
                          </div>
                          {pipelineStages.map(s => (
                            <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-linen/40 cursor-pointer">
                              <input type="checkbox" checked={leadStatusFilter.includes(s.key)} onChange={() => toggleLeadStatus(s.key)} className="cursor-pointer" />
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.swatch }} />
                              <span className="text-xs font-inter text-ink">{s.label}</span>
                            </label>
                          ))}
                          {/* Hidden section */}
                          <div className="flex items-center justify-between px-2 py-1 border-t border-gray-100 mt-1 mb-1">
                            <span className="font-bebas tracking-widest text-[10px] text-ink/40">HIDDEN BY DEFAULT</span>
                            {leadStatusExclude.length > 0 && (
                              <button onClick={() => setLeadStatusExcludeRaw([])} className="text-[10px] font-dm text-forest hover:underline">SHOW ALL</button>
                            )}
                          </div>
                          {[...pipelineStages, ...(["confirmed","tentative","cancelled","finished"].filter(k => !pipelineStages.find(s => s.key === k)).map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), swatch: "#9ca3af" })))].map(s => (
                            <label key={`excl-${s.key}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-linen/40 cursor-pointer">
                              <input type="checkbox" checked={leadStatusExclude.includes(s.key)} onChange={() => toggleLeadStatusExclude(s.key)} className="cursor-pointer" />
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: (s as any).swatch ?? '#9ca3af' }} />
                              <span className="text-xs font-inter text-ink/70">{s.label} <span className="text-ink/40">(hide)</span></span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
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
                  <div className="flex-1 overflow-auto">
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
                        <tbody className="divide-y divide-white/50">
                          {filteredLeads.map((lead: any) => {
                            const statusStage = pipelineStages.find(s => s.key === lead.status);
                            const rowBg = statusStage?.swatch ? statusStage.swatch + '22' : 'transparent';
                            return (
                              <tr key={lead.id}
                                onClick={() => { if (!bulkSelectMode) { if (lead && !lead.readAt) markRead.mutate({ id: lead.id }); openEventDrawer({ ...lead, _isLead: true }); } }}
                                className={`transition-colors cursor-pointer ${selectedLeadIds.has(lead.id) ? "brightness-90" : ""}`}
                                style={{ backgroundColor: rowBg, borderLeft: `4px solid ${statusStage?.swatch ?? '#d4c5a9'}` }}
                                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.93)')}
                                onMouseLeave={e => (e.currentTarget.style.filter = '')}>
                                {bulkSelectMode && (
                                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={selectedLeadIds.has(lead.id)}
                                      onChange={e => { setSelectedLeadIds(prev => { const n = new Set(prev); e.target.checked ? n.add(lead.id) : n.delete(lead.id); return n; }); }}
                                      className="w-3.5 h-3.5 accent-forest cursor-pointer" />
                                  </td>
                                )}
                                <td className="px-4 py-3 font-cormorant font-semibold text-base text-ink whitespace-nowrap">{lead.firstName} {lead.lastName}</td>
                                <td className="px-4 py-3 font-dm text-xs text-ink/70 max-w-[160px] truncate">{lead.eventType || "—"}</td>
                                <td className="px-4 py-3 font-dm text-xs text-ink/60 whitespace-nowrap">{lead.eventDate ? `${new Date(lead.eventDate).toLocaleDateString("en-NZ", { day:"numeric", month:"short", year:"numeric" })}${fmtEventTime(lead.eventDate) ? ' · ' + fmtEventTime(lead.eventDate) : ''}` : "—"}</td>
                                <td className="px-4 py-3 font-dm text-xs text-ink/60 whitespace-nowrap">{lead.guestCount ?? "—"}</td>
                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                  <select
                                    value={lead.status}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => {
                                      const newStatus = e.target.value;
                                      if (newStatus === lead.status) return;
                                      if (['booked','confirmed','tentative'].includes(newStatus) && !lead.spaceName?.trim()) {
                                        toast.error('Pick an event space on this enquiry first.');
                                        return;
                                      }
                                      updateStatus.mutate({ id: lead.id, status: newStatus as any });
                                    }}
                                    title="Change status"
                                    className={`font-bebas text-[10px] tracking-widest pl-2 pr-6 py-0.5 border cursor-pointer hover:opacity-80 transition-opacity appearance-none bg-no-repeat ${statusStage?.color ?? "bg-stone-100 border-stone-300 text-stone-700"}`}
                                    style={{
                                      backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
                                      backgroundPosition: "right 6px center",
                                      backgroundSize: "10px",
                                    }}>
                                    {pipelineStages.map(s => (
                                      <option key={s.key} value={s.key}>{s.label}</option>
                                    ))}
                                  </select>
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
                                {fmtEventTime(lead.eventDate) && (
                                  <span className="text-forest/70"> · {fmtEventTime(lead.eventDate)}</span>
                                )}
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
                                      <span>
                                        {new Date(lead.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                                        {fmtEventTime(lead.eventDate) && ` · ${fmtEventTime(lead.eventDate)}`}
                                      </span>
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

                {/* Lead Detail — only used in list mode (table mode opens event drawer instead) */}
                {leadViewMode === "list" && (selectedLead ? (
                  <div className="flex-1 overflow-auto p-4 md:p-6">
                  <div className="flex items-center gap-3 mb-4 md:mb-6">
                    <button onClick={() => setSelectedLead(null)} className="md:hidden font-bebas tracking-widest text-xs text-ink/60 hover:text-ink flex items-center gap-1 py-1 pr-2">
                      <ChevronLeft className="w-4 h-4" /> BACK
                    </button>
                    <div className="flex-1">
                      <h2 className="font-cormorant text-ink" style={{ fontSize: '1.8rem', fontWeight: 600 }}>{selectedLead.firstName} {selectedLead.lastName}</h2>
                      <div className="font-dm text-sm text-ink/60">{selectedLead.email}{selectedLead.phone ? ` · ${selectedLead.phone}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                      {selectedLead.email && !isTeamMember && (
                        <button onClick={() => {
                          setEmailForm({ subject: `Re: Your event enquiry — ${selectedLead.eventType || 'Event'}`, body: `Hi ${selectedLead.firstName},\n\nThank you for your enquiry. ` });
                          setShowEmailModal(true);
                        }}
                          className="border border-forest/30 text-forest font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1.5 hover:bg-forest/10 transition-all">
                          <Mail className="w-3.5 h-3.5" /> EMAIL
                        </button>
                      )}
                      <button onClick={() => setLocation(`/proposals/new?leadId=${selectedLead.id}`)}
                        className="bg-forest-dark text-cream font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1.5 hover:bg-forest transition-all">
                        <FileText className="w-3.5 h-3.5" /> CREATE PROPOSAL
                      </button>
                      {selectedLeadRunsheets && selectedLeadRunsheets.length > 0 ? (
                        <button onClick={() => setLocation(`/runsheet?id=${selectedLeadRunsheets[selectedLeadRunsheets.length - 1].id}&leadId=${selectedLead.id}`)}
                          className="border border-forest/30 text-forest font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1.5 hover:bg-forest/10 transition-all">
                          <Clock className="w-3.5 h-3.5" /> EDIT RUNSHEET
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
                          className="border border-forest/30 text-forest font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1.5 hover:bg-forest/10 transition-all disabled:opacity-50">
                          <Clock className="w-3.5 h-3.5" /> {createRunsheet.isPending ? 'CREATING...' : 'GENERATE RUNSHEET'}
                        </button>
                      ) : (
                        <button onClick={() => setLocation(`/runsheet?leadId=${selectedLead.id}`)}
                          className="border border-gold/30 text-ink/60 font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1.5 hover:bg-gold/10 transition-all">
                          <Clock className="w-3.5 h-3.5" /> RUNSHEET
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Delete enquiry from ${selectedLead.firstName} ${selectedLead.lastName ?? ''}? This cannot be undone.`)) {
                            deleteLead.mutate({ id: selectedLead.id });
                          }
                        }}
                        className="border border-red-200 text-red-400 font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1.5 hover:bg-red-50 transition-all ml-auto">
                        <Trash2 className="w-3.5 h-3.5" /> DELETE
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-6">
                    {/* Event Details */}
                    <div className="dante-card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bebas text-xs tracking-widest text-ink/40">EVENT DETAILS</h3>
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
                          }} className="text-xs text-ink/50 hover:text-ink font-bebas tracking-widest flex items-center gap-1">
                            <Edit2 className="w-3 h-3" /> EDIT
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => setEditingEventDetails(false)} className="text-xs text-ink/40 hover:text-ink font-bebas tracking-widest">CANCEL</button>
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
                            }} disabled={updateLeadDetails.isPending} className="text-xs text-forest hover:text-forest-dark font-bebas tracking-widest">
                              {updateLeadDetails.isPending ? 'SAVING...' : 'SAVE'}
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
                    <div className="dante-card p-4">
                      <h3 className="font-bebas text-xs tracking-widest text-ink/40 mb-3">PIPELINE STATUS</h3>
                      {/* Confirm Booking CTA */}
                      {!['booked','confirmed'].includes(selectedLead.status) && (
                        <button
                          onClick={() => {
                            if (!selectedLead.spaceName?.trim()) {
                              toast.error('Pick an event space on this enquiry before confirming.');
                              return;
                            }
                            updateStatus.mutate({ id: selectedLead.id, status: 'booked' as any });
                          }}
                          className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-forest-dark text-cream font-bebas tracking-widest text-xs hover:bg-forest transition-colors">
                          <CheckCircle className="w-4 h-4 text-gold" />
                          CONFIRM BOOKING → MOVE TO CALENDAR
                        </button>
                      )}
                      {['booked','confirmed'].includes(selectedLead.status) && (
                        <div className="w-full mb-3 flex flex-col gap-2">
                          <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 font-bebas tracking-widest text-xs text-forest">
                            <CheckCircle className="w-4 h-4 text-forest" />
                            CONFIRMED EVENT — VISIBLE ON CALENDAR
                          </div>
                          <button
                            onClick={() => { setTab('calendar' as any); setSelectedLead(null); }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-forest/30 text-forest font-bebas tracking-widest text-xs hover:bg-forest/10 transition-colors">
                            <Calendar className="w-3.5 h-3.5" /> VIEW ON CALENDAR
                          </button>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {pipelineStages.map(stage => {
                          const isActive = selectedLead.status === stage.key;
                          return (
                            <button key={stage.key}
                              onClick={() => {
                                if (['booked','confirmed','tentative'].includes(stage.key) && !selectedLead.spaceName?.trim()) {
                                  toast.error('Pick an event space on this enquiry first.');
                                  return;
                                }
                                updateStatus.mutate({ id: selectedLead.id, status: stage.key as any });
                              }}
                              className="w-full text-left px-3 py-2 border font-bebas tracking-widest text-xs transition-all"
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
                    <h3 className="font-bebas text-xs tracking-widest text-ink/40 mb-2">CLIENT MESSAGE</h3>
                      <p className="font-dm text-sm text-ink/60 italic">"{selectedLead.message}"</p>
                    </div>
                  )}

                  {/* Activity Log */}
                  <div className="dante-card p-4 mb-4">
                    <h3 className="font-bebas text-xs tracking-widest text-ink/40 mb-3">ACTIVITY LOG</h3>
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
                    <h3 className="font-bebas text-xs tracking-widest text-ink/40 mb-3">ENQUIRY SOURCE</h3>
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
                </div>
              ) : leadViewMode === "list" ? (
                <div className="flex-1 hidden md:flex items-center justify-center text-center p-8">
                  <div>
                    <MessageSquare className="w-12 h-12 text-ink/60/20 mx-auto mb-4" />
                    <div className="font-alfa text-xl text-ink/60/30">SELECT A LEAD</div>
                    <p className="font-dm text-ink/60/50 text-sm mt-2">Click a lead from the list to view details</p>
                  </div>
                </div>
              ) : null)}
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
                        onClick={() => {
                          if (['booked','confirmed','tentative'].includes(s.key)) {
                            const ids = Array.from(selectedLeadIds);
                            const missing = (allLeads ?? []).filter((l: any) => ids.includes(l.id) && !l.spaceName?.trim()).length;
                            if (missing > 0) {
                              toast.error(`${missing} of these enquiries have no space set — fix those first.`);
                              return;
                            }
                          }
                          bulkUpdateStatus.mutate({ ids: Array.from(selectedLeadIds), status: s.key as any });
                        }}
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
                      <DialogTitle className="font-cormorant text-xl font-semibold text-ink leading-tight">
                        {selectedLead.firstName} {selectedLead.lastName}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Status badge */}
                      <div className="flex items-center gap-2">
                        {(() => {
                          const stage = pipelineStages.find((s: any) => s.key === selectedLead.status);
                          return stage ? (
                            <span className={`font-bebas text-xs tracking-widest px-2.5 py-1 border ${stage.color}`}>{stage.label}</span>
                          ) : null;
                        })()}
                      </div>
                      {/* Contact */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {selectedLead.email && (
                          <div>
                            <p className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">EMAIL</p>
                            <p className="font-dm text-sm text-ink truncate">{selectedLead.email}</p>
                          </div>
                        )}
                        {selectedLead.phone && (
                          <div>
                            <p className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">PHONE</p>
                            <p className="font-dm text-sm text-ink">{selectedLead.phone}</p>
                          </div>
                        )}
                        {selectedLead.eventType && (
                          <div>
                            <p className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">EVENT TYPE</p>
                            <p className="font-dm text-sm text-ink">{selectedLead.eventType}</p>
                          </div>
                        )}
                        {selectedLead.eventDate && (
                          <div>
                            <p className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">EVENT DATE</p>
                            <p className="font-dm text-sm text-ink">
                              {new Date(selectedLead.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                              {fmtEventTime(selectedLead.eventDate) && (
                                <span className="text-forest"> · {fmtEventTime(selectedLead.eventDate)}</span>
                              )}
                            </p>
                          </div>
                        )}
                        {selectedLead.guestCount && (
                          <div>
                            <p className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">GUESTS</p>
                            <p className="font-dm text-sm text-ink">{selectedLead.guestCount}</p>
                          </div>
                        )}
                        {selectedLead.budget && (
                          <div>
                            <p className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">BUDGET</p>
                            <p className="font-dm text-sm text-ink">${Number(selectedLead.budget).toLocaleString()}</p>
                          </div>
                        )}
                      </div>
                      {selectedLead.message && (
                        <div>
                          <p className="font-bebas text-xs tracking-widest text-ink/40 mb-1">MESSAGE</p>
                          <p className="font-dm text-sm text-ink/70 leading-relaxed line-clamp-3">{selectedLead.message}</p>
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
                            className="flex items-center gap-1.5 font-bebas tracking-widest text-xs border border-forest/30 text-forest px-3 py-2 hover:bg-forest/10 transition-colors">
                            <Mail className="w-3.5 h-3.5" /> EMAIL
                          </button>
                        )}
                        <button
                          onClick={() => { setKanbanDetailOpen(false); setLocation(`/proposals/new?leadId=${selectedLead.id}`); }}
                          className="flex items-center gap-1.5 font-bebas tracking-widest text-xs bg-forest-dark text-cream px-3 py-2 hover:bg-forest transition-colors">
                          <FileText className="w-3.5 h-3.5" /> CREATE PROPOSAL
                        </button>
                        <button
                          onClick={() => { setLeadViewMode("list"); setKanbanDetailOpen(false); }}
                          className="ml-auto font-bebas tracking-widest text-xs text-ink/40 hover:text-ink flex items-center gap-1 px-2 py-2">
                          FULL DETAILS <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              </div>
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
                        bookingId: (selectedLead as any)._fromBookingId,
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
          {/* end EMAIL MODAL */}

          {/* ── PIPELINE ─────────────────────────────────────────────────────── */}
          {tab === "pipeline" && (
            <div className="p-6 overflow-x-auto">
              <div className="gold-rule max-w-xs mb-3"><span>CRM</span></div>
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-6">Pipeline</h1>
              <div className="flex gap-4 min-w-max">
                {pipelineStages.slice(0, 5).map(stage => {
                  const stageLeads = (allLeads ?? []).filter(Boolean).filter((l: any) => l.status === stage.key);
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
              <div className="border-b border-gold/15 bg-cream flex-shrink-0">
                {/* Row 1 (mobile): Title + Add. Desktop: everything in one row */}
                <div className="flex items-center gap-2 px-3 md:px-6 py-3">
                  {/* Desktop-only prev/next/today on row 1 */}
                  <button onClick={() => navCalendar(-1)} aria-label="Previous" title="Previous (←)"
                    className="hidden md:inline-flex p-1.5 hover:bg-linen border border-gold/20 text-forest transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => navCalendar(1)} aria-label="Next" title="Next (→)"
                    className="hidden md:inline-flex p-1.5 hover:bg-linen border border-gold/20 text-forest transition-colors"><ChevronRight className="w-4 h-4" /></button>
                  <button onClick={navCalendarToday} title="Today (T)"
                    className="hidden md:inline-flex font-bebas tracking-widest text-xs px-3 py-1.5 border border-gold/30 text-ink/70 hover:bg-linen transition-colors">TODAY</button>
                  <button onClick={() => setTab('enquiries')} className="hidden sm:flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-1.5 border border-gold/30 text-ink/70 hover:bg-linen transition-colors" title="Back to events list">
                    <List className="w-3 h-3" /> EVENTS
                  </button>
                  <div className="flex-1 min-w-0 relative">
                    <button
                      type="button"
                      onClick={() => setShowJumpDate(v => !v)}
                      title="Click to jump to a different month"
                      aria-haspopup="dialog"
                      aria-expanded={showJumpDate}
                      aria-controls="cal-jump-popover"
                      className="font-cormorant text-base md:text-xl font-semibold text-ink truncate hover:text-forest transition-colors flex items-center gap-1.5 max-w-full">
                      <span className="truncate">
                        {calendarView === 'week' ? (() => {
                          const dow = (calDate.getDay() + 6) % 7;
                          const ws = new Date(calDate); ws.setDate(calDate.getDate() - dow);
                          const we = new Date(ws); we.setDate(ws.getDate() + 6);
                          return `${ws.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${we.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`;
                        })() : calendarView === 'day'
                          ? calDate.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                          : `${MONTHS[month]} ${year}`}
                      </span>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showJumpDate ? 'rotate-180' : ''}`} />
                    </button>
                    {showJumpDate && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowJumpDate(false)} />
                        <div id="cal-jump-popover" role="dialog" aria-label="Jump to date" className="absolute left-0 top-full mt-2 z-50 bg-white border border-gold/30 shadow-xl p-3 w-72">
                          {/* Year stepper */}
                          <div className="flex items-center justify-between mb-3">
                            <button onClick={() => setCalDate(new Date(year - 1, month, 1))}
                              className="p-1.5 hover:bg-linen border border-gold/20 text-forest"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="font-cormorant text-lg font-semibold text-ink">{year}</span>
                            <button onClick={() => setCalDate(new Date(year + 1, month, 1))}
                              className="p-1.5 hover:bg-linen border border-gold/20 text-forest"><ChevronRight className="w-4 h-4" /></button>
                          </div>
                          {/* Month grid */}
                          <div className="grid grid-cols-3 gap-1 mb-3">
                            {MONTHS.map((m, i) => {
                              const isCurrent = i === month;
                              const isThisMonth = i === new Date().getMonth() && year === new Date().getFullYear();
                              return (
                                <button key={m}
                                  onClick={() => { setCalDate(new Date(year, i, 1)); setShowJumpDate(false); }}
                                  className={`font-bebas tracking-widest text-xs py-2 border transition-colors ${
                                    isCurrent ? 'bg-forest-dark text-cream border-forest-dark'
                                    : isThisMonth ? 'border-gold text-forest hover:bg-linen'
                                    : 'border-gold/20 text-ink/70 hover:bg-linen'
                                  }`}>{m.slice(0, 3).toUpperCase()}</button>
                              );
                            })}
                          </div>
                          {/* Quick actions */}
                          <div className="flex gap-2 pt-2 border-t border-gold/15">
                            <button onClick={() => { navCalendarToday(); setShowJumpDate(false); }}
                              className="flex-1 font-bebas tracking-widest text-xs py-2 border border-gold/30 text-ink/80 hover:bg-linen">TODAY</button>
                            <input type="date" defaultValue={`${year}-${String(month+1).padStart(2,'0')}-${String(calDate.getDate()).padStart(2,'0')}`}
                              onChange={e => { if (e.target.value) { setCalDate(new Date(e.target.value)); setShowJumpDate(false); } }}
                              className="flex-1 font-dm text-xs px-2 py-1.5 border border-gold/30 text-ink/80 focus:outline-none focus:border-gold" />
                          </div>
                          <p className="hidden md:block font-dm text-[10px] text-sage/60 mt-3 leading-snug">
                            Tip: use <kbd className="px-1 border border-gold/30 bg-linen">←</kbd> <kbd className="px-1 border border-gold/30 bg-linen">→</kbd> to navigate, <kbd className="px-1 border border-gold/30 bg-linen">T</kbd> for today, <kbd className="px-1 border border-gold/30 bg-linen">M/W/D/L</kbd> to switch views.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Desktop-only view switcher on row 1 */}
                  <div className="hidden md:flex border border-gold/30">
                    {(["month","week","day","list"] as const).map(v => (
                      <button key={v}
                        onClick={() => setCalendarView(v)}
                        className={`font-bebas tracking-widest text-xs px-3 py-1.5 transition-colors ${
                          calendarView === v ? 'bg-forest-dark text-cream' : 'text-ink/60 hover:bg-linen'
                        }`}>{v.toUpperCase()}</button>
                    ))}
                  </div>
                  <button onClick={() => setShowAddLead(true)}
                    className="btn-forest text-cream font-bebas tracking-widest text-xs px-3 md:px-4 py-2 flex items-center gap-1 flex-shrink-0">
                    <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">ADD EVENT</span><span className="sm:hidden">ADD</span>
                  </button>
                </div>
                {/* Row 2 (mobile only): Big tap-friendly nav controls */}
                <div className="md:hidden flex items-center gap-2 px-3 pb-3">
                  <button onClick={() => navCalendar(-1)} aria-label="Previous"
                    className="flex-1 flex items-center justify-center py-2.5 hover:bg-linen border border-gold/30 text-forest transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                  <button onClick={navCalendarToday}
                    className="flex-1 font-bebas tracking-widest text-xs py-2.5 border border-gold/30 text-ink/80 hover:bg-linen transition-colors">TODAY</button>
                  <button onClick={() => navCalendar(1)} aria-label="Next"
                    className="flex-1 flex items-center justify-center py-2.5 hover:bg-linen border border-gold/30 text-forest transition-colors"><ChevronRight className="w-5 h-5" /></button>
                </div>
                {/* Row 3 (mobile only): View switcher full-width */}
                <div className="md:hidden grid grid-cols-4 px-3 pb-3 gap-0 border-0">
                  {(["month","week","day","list"] as const).map(v => (
                    <button key={v}
                      onClick={() => setCalendarView(v)}
                      className={`font-bebas tracking-widest text-xs py-2 border border-gold/30 -ml-px first:ml-0 transition-colors ${
                        calendarView === v ? 'bg-forest-dark text-cream border-forest-dark' : 'text-ink/70 hover:bg-linen'
                      }`}>{v.toUpperCase()}</button>
                  ))}
                </div>
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

              {/* Swipe-enabled views wrapper (mobile gestures, desktop unaffected) */}
              <div className="flex-1 flex flex-col overflow-hidden" onTouchStart={onCalTouchStart} onTouchEnd={onCalTouchEnd}>

              {/* Month View — desktop grid */}
              {calendarView === "month" && (
              <div className="hidden md:block flex-1 overflow-auto" style={{ minHeight: '600px' }}>
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
                  const adjBookedLeadIds = new Set((adjMonthBookings ?? []).filter(Boolean).map((b: any) => b.leadId).filter(Boolean));
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
                          ? (adjMonthBookings ?? []).filter(Boolean).filter((b: any) => new Date(b.eventDate).getDate() === day)
                          : (monthBookings ?? []).filter(Boolean).filter((b: any) => new Date(b.eventDate).getDate() === day);
                        const dayLeads = isOverflow
                          ? (adjMonthLeadEvents ?? []).filter(Boolean).filter((l: any) => new Date(l.eventDate).getDate() === day && !adjBookedLeadIds.has(l.id) && l.status !== 'lost')
                          : (monthLeadEvents ?? []).filter(Boolean).filter((l: any) => new Date(l.eventDate).getDate() === day && !bookedLeadIds.has(l.id) && l.status !== 'lost');
                        const dateStr = `${cellYear}-${String(cellMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        return (
                          <div key={di} className={`border-r border-gold/10 last:border-r-0 p-1 flex flex-col gap-0.5 ${
                            isOverflow ? 'bg-linen/40 opacity-60' : isWeekend ? 'bg-linen/20' : 'bg-white'
                          } ${isToday ? 'ring-2 ring-inset ring-gold' : ''} ${dragOverDate === dateStr ? 'bg-forest/10 ring-2 ring-inset ring-forest/40' : ''}`}
                            onDragOver={!isOverflow ? (e) => { e.preventDefault(); setDragOverDate(dateStr); } : undefined}
                            onDragLeave={!isOverflow ? () => setDragOverDate(prev => prev === dateStr ? null : prev) : undefined}
                            onDrop={!isOverflow ? (e) => {
                              e.preventDefault(); setDragOverDate(null);
                              try { const data = JSON.parse(e.dataTransfer.getData('application/json')); handleEventDrop(data, dateStr); } catch {}
                            } : undefined}>
                            <span className={`text-xs font-dm leading-none mb-0.5 self-start px-1 rounded ${
                              isToday ? 'bg-forest-dark text-cream font-bold px-1.5 py-0.5' : isOverflow ? 'text-ink/30' : isWeekend ? 'text-forest/70 font-semibold' : 'text-ink/70'
                            }`}>{day}</span>
                            {/* Space-split stripe — one coloured segment per distinct space
                                booked that day (bookings + live leads), widths proportional
                                to the event count. So a day with 1 bar event and 1 restaurant
                                event renders as a literal half-and-half bar. */}
                            {(() => {
                              const counts = new Map<string, number>();
                              for (const b of dayBookings) {
                                const n = b.spaceName || 'Unassigned';
                                counts.set(n, (counts.get(n) ?? 0) + 1);
                              }
                              for (const l of dayLeads) {
                                const n = l.spaceName || 'Unassigned';
                                counts.set(n, (counts.get(n) ?? 0) + 1);
                              }
                              if (counts.size === 0) return null;
                              const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
                              const segs = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                              return (
                                <div
                                  className="flex w-full h-1.5 rounded-sm overflow-hidden mb-0.5"
                                  title={segs.map(([n, c]) => `${n}: ${c}`).join(' · ')}>
                                  {segs.map(([name, c]) => (
                                    <div
                                      key={name}
                                      style={{
                                        width: `${(c / total) * 100}%`,
                                        background: spaceColor(name) ?? '#c9a84c',
                                      }} />
                                  ))}
                                </div>
                              );
                            })()}
                            {/* Booking cards */}
                            {dayBookings.map((b: any) => (
                              <div key={b.id} className="relative group/card w-full">
                                <button
                                  draggable
                                  onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ id: b.id, type: 'booking', eventDate: b.eventDate })); e.dataTransfer.effectAllowed = 'move'; }}
                                  onClick={() => setSelectedBooking(b)}
                                  style={spaceColor(b.spaceName) ? { borderLeft: `4px solid ${spaceColor(b.spaceName)}` } : undefined}
                                  className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-snug font-dm ${statusCard(b.status)} hover:opacity-80 transition-opacity cursor-move`}
                                  title={`${b.firstName} ${b.lastName ?? ''} — ${b.eventType ?? 'Event'} — ${b.guestCount ?? '?'} guests${b.spaceName ? ` — ${b.spaceName}` : ''}`}>
                                  <div className="font-semibold truncate">{b.firstName} {b.lastName}</div>
                                  {b.eventType && <div className="opacity-85 truncate">{b.eventType}</div>}
                                  {b.startTime && <div className="opacity-70">{b.startTime}{b.endTime ? ` – ${b.endTime}` : ''}</div>}
                                  {b.guestCount ? <div className="opacity-70 truncate">{b.guestCount} guests</div> : null}
                                  {b.spaceName && (
                                    <div className="mt-0.5">
                                      <span
                                        className="inline-block px-1 py-px rounded text-[9px] font-bebas tracking-wider text-white truncate max-w-full"
                                        style={{ background: spaceColor(b.spaceName) ?? '#8b6914' }}>
                                        {b.spaceName.toUpperCase()}
                                      </span>
                                    </div>
                                  )}
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
                              <div key={l.id} className="relative group/card w-full">
                                <button
                                  draggable
                                  onDragStart={(e) => { e.dataTransfer.setData('application/json', JSON.stringify({ id: l.id, type: 'lead', eventDate: l.eventDate })); e.dataTransfer.effectAllowed = 'move'; }}
                                  onClick={() => openEventDrawer({ ...l, _isLead: true })}
                                  style={spaceColor(l.spaceName) ? { borderLeft: `4px solid ${spaceColor(l.spaceName)}` } : undefined}
                                  className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-snug font-dm ${statusCard(l.status)} hover:opacity-80 transition-opacity cursor-move`}
                                  title={`${l.firstName} ${l.lastName ?? ''} — ${l.eventType ?? 'Enquiry'} — ${l.guestCount ?? '?'} guests`}>
                                  <div className="font-semibold truncate">{l.firstName} {l.lastName}</div>
                                  {l.eventType && <div className="opacity-85 truncate">{l.eventType}</div>}
                                  {l.guestCount ? <div className="opacity-70 truncate">{l.guestCount} guests</div> : null}
                                  {l.spaceName && (
                                    <div className="mt-0.5">
                                      <span
                                        className="inline-block px-1 py-px rounded text-[9px] font-bebas tracking-wider text-white truncate max-w-full"
                                        style={{ background: spaceColor(l.spaceName) ?? '#8b6914' }}>
                                        {l.spaceName.toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                  <div className="opacity-80 font-bebas tracking-widest text-[9px] mt-0.5">{getStatusInfo(l.status).label.toUpperCase()}</div>
                                </button>
                                {!isOverflow && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete enquiry from ${l.firstName} ${l.lastName ?? ''}? This cannot be undone.`)) deleteLead.mutate({ id: l.id }); }}
                                    className="absolute top-0.5 right-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center"
                                    title="Delete enquiry">
                                    <X className="w-2 h-2" />
                                  </button>
                                )}
                              </div>
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

              {/* Month View — mobile agenda (grouped by day, only days with events) */}
              {calendarView === "month" && (
                <div className="md:hidden flex-1 overflow-auto p-3 space-y-3">
                  {(() => {
                    const allEvents = [
                      ...((monthBookings ?? []).filter(Boolean) as any[]).map((b: any) => ({ ...b, _kind: 'booking' as const })),
                      ...((monthLeadEvents ?? []).filter(Boolean) as any[]).filter((l: any) => !bookedLeadIds.has(l.id) && l.status !== 'lost').map((l: any) => ({ ...l, _kind: 'lead' as const })),
                    ].filter(e => e.eventDate)
                      .sort((a: any, b: any) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
                    if (allEvents.length === 0) {
                      return (
                        <div className="border border-dashed border-gold/30 p-8 text-center bg-white">
                          <Calendar className="w-8 h-8 text-sage/40 mx-auto mb-2" />
                          <p className="font-dm text-sm text-sage">No events in {MONTHS[month]}</p>
                          <button onClick={() => setShowAddLead(true)} className="mt-3 font-bebas tracking-widest text-xs text-forest border border-forest/30 px-3 py-1.5">+ ADD EVENT</button>
                        </div>
                      );
                    }
                    // Group by yyyy-mm-dd
                    const grouped: Record<string, any[]> = {};
                    allEvents.forEach((e: any) => {
                      const d = new Date(e.eventDate);
                      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                      (grouped[key] ||= []).push(e);
                    });
                    const todayKey = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; })();
                    return Object.entries(grouped).map(([key, events]) => {
                      const d = new Date(key + 'T00:00:00');
                      const isToday = key === todayKey;
                      return (
                        <div key={key} className="bg-white border border-gold/20 overflow-hidden">
                          <div className={`px-3 py-2 border-b border-gold/15 flex items-center justify-between ${isToday ? 'bg-forest text-cream' : 'bg-linen/50'}`}>
                            <div className="font-bebas tracking-widest text-xs">
                              {d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
                              {isToday && <span className="ml-2 opacity-80">· TODAY</span>}
                            </div>
                            <div className={`text-[10px] font-dm ${isToday ? 'opacity-80' : 'text-ink/40'}`}>{events.length} event{events.length !== 1 ? 's' : ''}</div>
                          </div>
                          <div className="divide-y divide-gold/10">
                            {events.map((e: any) => (
                              <button key={`${e._kind}-${e.id}`}
                                onClick={() => e._kind === 'booking' ? setSelectedBooking(e) : openEventDrawer({ ...e, _isLead: true })}
                                className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-linen/40 active:bg-linen/60 transition-colors"
                                style={{ borderLeft: `3px solid ${getStatusInfo(e.status).swatch}` }}>
                                <div className="flex-1 min-w-0">
                                  <div className="font-cormorant font-semibold text-base text-ink truncate">{e.firstName} {e.lastName}</div>
                                  <div className="font-dm text-xs text-ink/60 truncate">
                                    {e.eventType ?? (e._kind === 'lead' ? 'Enquiry' : 'Event')}
                                    {fmtEventTime(e.eventDate) && ` · ${fmtEventTime(e.eventDate)}`}
                                    {e.guestCount ? ` · ${e.guestCount} guests` : ''}
                                    {e.spaceName ? ` · ${e.spaceName}` : ''}
                                  </div>
                                </div>
                                <span className={`font-bebas text-[9px] tracking-widest px-1.5 py-0.5 rounded flex-shrink-0 ${getStatusInfo(e.status).calClasses}`}>
                                  {getStatusInfo(e.status).label.toUpperCase()}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* List View */}
              {calendarView === "list" && (
              <div className="flex-1 overflow-auto p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="font-inter font-semibold text-gray-900 text-lg" style={{ letterSpacing: '-0.02em' }}>All Events — {MONTHS[month]} {year}</h2>
                  <div className="flex items-center gap-2">
                    {/* Upcoming-only toggle */}
                    <button
                      onClick={() => setEventTablePrefs({ upcomingOnly: !eventTablePrefs.upcomingOnly })}
                      className={`h-8 px-3 text-xs font-inter rounded-lg border flex items-center gap-1.5 transition-colors ${eventTablePrefs.upcomingOnly ? "border-sage-green bg-sage-green/10 text-sage-dark font-semibold" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                      title="Show only upcoming events (today and future)"
                    >
                      Upcoming
                    </button>
                    {/* Status filter dropdown */}
                    <div className="relative" ref={eventStatusFilterRef}>
                      <button
                        type="button"
                        onClick={() => setEventStatusFilterOpen(o => !o)}
                        className={`h-8 px-3 text-xs font-inter rounded-lg border flex items-center gap-1.5 transition-colors ${eventTablePrefs.hideStatuses.length > 0 ? "border-sage-green bg-sage-green/10 text-sage-dark" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                        title="Filter by status"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        Status
                        {eventTablePrefs.hideStatuses.length > 0 && (
                          <span className="bg-sage-green text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                            {eventTablePrefs.hideStatuses.length}
                          </span>
                        )}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                      {eventStatusFilterOpen && (
                        <div className="absolute right-0 z-50 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 max-h-[60vh] overflow-y-auto">
                          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 mb-1">
                            <span className="font-bebas tracking-widest text-[10px] text-ink/40">HIDE STATUSES</span>
                            {eventTablePrefs.hideStatuses.length > 0 && (
                              <button
                                onClick={() => setEventTablePrefs({ hideStatuses: [] })}
                                className="text-[10px] font-dm text-forest hover:underline">
                                SHOW ALL
                              </button>
                            )}
                          </div>
                          {[...pipelineStages, ...(["confirmed","tentative","cancelled","finished"].filter(k => !pipelineStages.find(s => s.key === k)).map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1) })))].map(s => (
                            <label key={s.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-linen/40 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={eventTablePrefs.hideStatuses.includes(s.key)}
                                onChange={() => setEventTablePrefs({
                                  hideStatuses: eventTablePrefs.hideStatuses.includes(s.key)
                                    ? eventTablePrefs.hideStatuses.filter(k => k !== s.key)
                                    : [...eventTablePrefs.hideStatuses, s.key]
                                })}
                                className="cursor-pointer"
                              />
                              <span className="text-xs font-inter text-ink">{s.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <Select value={eventSortBy} onValueChange={(v: any) => setEventTablePrefs({ sortBy: v })}>
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
                      onClick={() => setEventTablePrefs({ sortDir: eventSortDir === 'asc' ? 'desc' : 'asc' })}
                      className="h-8 w-8 flex items-center justify-center border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                      title={eventSortDir === 'asc' ? 'Ascending' : 'Descending'}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => {
                        const rows = [
                          ...(monthBookings ?? []).filter(Boolean).map((b: any) => ({ ...b, _type: 'booking' })),
                          ...(monthLeadEvents ?? []).filter(Boolean).filter((l: any) => !bookedLeadIds.has(l.id)).map((l: any) => ({ ...l, _type: 'lead' })),
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
                {(monthBookings ?? []).filter(Boolean).length === 0 && (monthLeadEvents ?? []).filter(Boolean).length === 0 ? (
                  <div className="border border-dashed border-sage-green/20 rounded-xl p-8 text-center">
                    <Calendar className="w-10 h-10 text-sage-green/30 mx-auto mb-3" />
                    <p className="font-inter text-sm text-gray-400">No events this month</p>
                    <button onClick={() => setShowAddLead(true)} className="mt-3 font-inter text-xs font-semibold px-4 py-2 bg-sage-green text-white rounded-lg hover:bg-sage-dark transition-colors">Add Event</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Filtered-empty hint (data exists but filters hide everything) */}
                    {(() => {
                      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
                      const all = [
                        ...(monthBookings ?? []).filter(Boolean).map((b: any) => ({ ...b, _type: 'booking' })),
                        ...(monthLeadEvents ?? []).filter(Boolean).filter((l: any) => !bookedLeadIds.has(l.id)).map((l: any) => ({ ...l, _type: 'lead' })),
                      ];
                      const filtered = all
                        .filter((item: any) => !eventTablePrefs.hideStatuses.includes(item.status))
                        .filter((item: any) => !eventTablePrefs.upcomingOnly || new Date(item.eventDate) >= todayStart);
                      if (all.length > 0 && filtered.length === 0) {
                        return (
                          <div className="border border-dashed border-sage-green/20 rounded-xl p-8 text-center">
                            <SlidersHorizontal className="w-8 h-8 text-sage-green/30 mx-auto mb-3" />
                            <p className="font-inter text-sm text-gray-400">No events match your current filters</p>
                            <button
                              onClick={() => setEventTablePrefs({ ...DEFAULT_EVENT_TABLE_PREFS, hideStatuses: [] })}
                              className="mt-3 font-inter text-xs font-semibold px-4 py-2 border border-sage-green text-sage-dark rounded-lg hover:bg-sage-green/10 transition-colors"
                            >
                              Clear Filters
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {(() => {
                      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                      return [
                        ...(monthBookings ?? []).filter(Boolean).map((b: any) => ({ ...b, _type: 'booking' })),
                        ...(monthLeadEvents ?? []).filter(Boolean).filter((l: any) => !bookedLeadIds.has(l.id)).map((l: any) => ({ ...l, _type: 'lead' })),
                      ]
                        // status hide filter — normalise "confirmed" → "confirmed" (bookings) as-is
                        .filter((item: any) => !eventTablePrefs.hideStatuses.includes(item.status))
                        // upcoming only filter
                        .filter((item: any) => !eventTablePrefs.upcomingOnly || new Date(item.eventDate) >= todayStart)
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
                        });
                    })().map((item: any) => {
                        const si = getStatusInfo(item.status);
                        return (
                          <div
                            key={item.id}
                            className="flex items-stretch border-b border-white/30 overflow-hidden transition-all hover:brightness-95"
                            style={{ backgroundColor: si.swatch + '33' }}
                          >
                            <div className="w-1 flex-shrink-0" style={{ backgroundColor: si.swatch }} />
                            <div className="flex-1 p-3 flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="font-cormorant font-semibold text-base text-ink">{item.firstName} {item.lastName}</div>
                                <div className="font-dm text-xs text-ink/70 truncate">
                                  {item.eventType || (item._type === 'booking' ? 'Event' : 'Enquiry')}
                                  {' · '}{new Date(item.eventDate).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                                  {fmtEventTime(item.eventDate) && ` · ${fmtEventTime(item.eventDate)}`}
                                  {item.guestCount ? ` · ${item.guestCount} guests` : ''}
                                  {item.company ? ` · ${item.company}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                <span className="font-bebas tracking-widest text-[10px] px-2 py-0.5 rounded text-white" style={{ backgroundColor: si.swatch }}>
                                  {si.label.toUpperCase()}
                                </span>
                                {item._type === 'booking' ? (
                                  <button onClick={() => setLocation(`/event/${item.id}`)} className="font-bebas tracking-widest text-xs px-3 py-1.5 bg-forest-dark text-cream hover:bg-forest transition-colors">OPEN</button>
                                ) : (
                                  <button onClick={() => { setSelectedLead(item); setTab('enquiries'); }} className="font-bebas tracking-widest text-xs px-3 py-1.5 border border-forest/30 text-forest hover:bg-forest/10 transition-colors">VIEW</button>
                                )}
                                <button
                                  onClick={() => {
                                    const label = item._type === 'booking' ? 'event' : 'enquiry';
                                    if (confirm(`Delete ${label} for ${item.firstName} ${item.lastName ?? ''}?`)) {
                                      if (item._type === 'booking') deleteBooking.mutate({ id: item.id });
                                      else deleteLead.mutate({ id: item.id });
                                    }
                                  }}
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100/60 rounded transition-colors"
                                  title={`Delete ${item._type === 'booking' ? 'event' : 'enquiry'}`}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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
                const allBookings: any[] = [...(adjPrevMonthBookings ?? []).filter(Boolean), ...(monthBookings ?? []).filter(Boolean), ...(adjMonthBookings ?? []).filter(Boolean)];
                const allBookedLeadIds = new Set(allBookings.map((b: any) => b.leadId).filter(Boolean));
                const allLeads: any[] = [...(adjPrevMonthLeadEvents ?? []).filter(Boolean), ...(monthLeadEvents ?? []).filter(Boolean), ...(adjMonthLeadEvents ?? []).filter(Boolean)].filter((l: any) => !allBookedLeadIds.has(l.id) && l.status !== 'lost');
                return (
                <div className="flex-1 overflow-auto">
                  <div className="md:min-w-0 min-w-[700px]">
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
                              onClick={() => openEventDrawer({ ...l, _isLead: true })}
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
                const allBookings: any[] = [...(monthBookings ?? []).filter(Boolean), ...(adjMonthBookings ?? []).filter(Boolean)];
                const allLeads: any[] = [...(monthLeadEvents ?? []).filter(Boolean), ...(adjMonthLeadEvents ?? []).filter(Boolean)];
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
                            onClick={() => openEventDrawer({ ...l, _isLead: true })}
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
                    const hasLeadEvent = leadEventDays.has(day);
                    const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                    // Find bookings and lead events for this day
                    const dayBookings = (monthBookings ?? []).filter(Boolean).filter((b: any) => new Date(b.eventDate).getDate() === day);
                    const dayLeads = (monthLeadEvents ?? []).filter(Boolean).filter((l: any) => new Date(l.eventDate).getDate() === day && !bookedLeadIds.has(l.id) && l.status !== 'lost');
                    const bgClass = hasBooking
                      ? "bg-forest/10 border-forest"
                      : hasLeadEvent
                      ? "bg-rose-50 border-rose-400"
                      : isToday
                      ? "border-gold bg-gold/5"
                      : "border-transparent hover:bg-linen";
                    const textClass = hasBooking
                      ? "text-forest font-bold"
                      : hasLeadEvent
                      ? "text-rose-700 font-semibold"
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

              {/* Upcoming bookings list — only shown in LIST view (the calendar grid views already display these) */}
              {calendarView === "list" && (
              <div className="mt-6 max-w-2xl px-6">
                <h2 className="font-cormorant text-xl font-semibold text-ink mb-3">This Month's Bookings</h2>
                {(monthBookings ?? []).filter(Boolean).length === 0 ? (
                  <div className="border border-dashed border-gold/20 p-6 text-center">
                    <p className="font-dm text-sage text-sm">No bookings this month</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(monthBookings ?? []).filter(Boolean).map((b: any) => (
                      <div id={`booking-${b.id}`} key={b.id} className="dante-card p-4 flex items-center justify-between hover:bg-gold/5 transition-colors cursor-pointer"
                        onClick={() => setSelectedBooking(b)}>
                        <div>
                          <button
                            onClick={e => { e.stopPropagation(); setLocation(`/event/${b.id}`); }}
                            className="font-cormorant font-semibold text-base text-ink hover:text-forest hover:underline text-left">
                            {b.firstName} {b.lastName}
                          </button>
                          <div className="font-dm text-xs text-ink/60">
                            {b.eventType || "Event"} · {new Date(b.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}{fmtEventTime(b.eventDate) && ` · ${fmtEventTime(b.eventDate)}`}
                            {b.guestCount ? ` · ${b.guestCount} guests` : ""}
                          </div>
                          <div className={`font-bebas text-xs tracking-widest mt-1 ${
                            b.status === 'confirmed' ? 'text-forest' : b.status === 'finished' ? 'text-teal-600' : b.status === 'tentative' ? 'text-amber-600' : 'text-stone-400'
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
              )}

              {/* This month's lead events */}
              {calendarView === "list" && (monthLeadEvents ?? []).filter(Boolean).length > 0 && (
                <div className="mt-6 max-w-2xl px-6">
                  <h2 className="font-cormorant text-xl font-semibold text-ink mb-3">This Month's Enquiries &amp; Leads</h2>
                  <div className="space-y-2">
                    {(monthLeadEvents ?? []).filter(Boolean).map((lead: any) => {
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
              </div>{/* end swipe wrapper */}
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
              <div className="flex gap-0 mb-6 border-b border-gold/20 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                {([
                  { id: 'details', label: 'Basic Details' },
                  { id: 'profile', label: 'Profile & Branding' },
                  { id: 'spaces', label: 'Spaces' },
                ] as const).map(s => (
                  <button key={s.id} onClick={() => setVenueSettingsSection(s.id)}
                    className={`font-bebas tracking-widest text-sm px-4 md:px-5 py-2.5 border-b-2 transition-colors flex-shrink-0 whitespace-nowrap ${
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
                  <div className="dante-card p-4 md:p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE DETAILS</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="dante-card p-4 md:p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">VENUE ADDRESS</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <div className="dante-card p-4 md:p-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-4">EVENT SETTINGS</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PAYMENT INSTRUCTIONS</label>
                        <Textarea
                          value={settingsForm.paymentInstructions ?? ""}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, paymentInstructions: e.target.value }))}
                          placeholder={"How clients pay you. e.g.\nBank transfer to 12-3456-7890123-00\nReference: <event date + surname>\nDeposit due to confirm; balance by event day."}
                          rows={4}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm" />
                        <p className="font-dm text-xs text-sage/60 mt-1">Shown under running totals on every runsheet, the live staff link, and the BEO PDF.</p>
                      </div>
                      <div className="col-span-2 border-t border-gold/20 pt-4 mt-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">STAFF BRIEFING EMAIL — SUBJECT</label>
                        <Input
                          value={settingsForm.staffBriefingSubject ?? ""}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, staffBriefingSubject: e.target.value }))}
                          placeholder="Staff Briefing — {eventTitle}"
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">STAFF BRIEFING EMAIL — BODY</label>
                        <Textarea
                          value={settingsForm.staffBriefingBody ?? ""}
                          onChange={e => setSettingsForm((f: any) => ({ ...f, staffBriefingBody: e.target.value }))}
                          placeholder={"Hi team,\n\nHere's the briefing for {eventTitle} on {eventDate}.\n\nLive runsheet (updates as we edit): {runsheetUrl}\n\nFull BEO is attached for printing or offline reference.\n\nThanks!"}
                          rows={8}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-none text-sm font-dm" />
                        <p className="font-dm text-xs text-sage/60 mt-1">
                          Used when you bulk-email staff from a runsheet. Leave blank to use the default wording. Placeholders: <code className="bg-linen px-1">{`{eventTitle}`}</code> <code className="bg-linen px-1">{`{eventDate}`}</code> <code className="bg-linen px-1">{`{runsheetUrl}`}</code> <code className="bg-linen px-1">{`{venueName}`}</code>
                        </p>
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
                            {Number(s.minSpend) > 0 ? ` · Min spend $${Number(s.minSpend).toLocaleString()}` : ""}
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
              <h1 className="font-cormorant text-3xl font-semibold text-ink mb-6">Templates</h1>
              <div className="mt-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-cormorant text-xl font-semibold text-ink">Checklist Templates</h2>
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
                const nbiConnected = !!(venueSettings as any)?.nbiAccountId && !!(venueSettings as any)?.nbiVenueId;
                const nbiEnabled = (venueSettings as any)?.nbiSyncEnabled === 1;
                return (
                <div className="max-w-3xl mx-auto">
                <h1 className="font-cormorant text-3xl font-semibold text-ink mb-2">Integrations</h1>
                <p className="font-dm text-sm text-ink/50 mb-6">Connect VenueFlowHQ with your other tools. When a booking is confirmed, synced integrations update automatically.</p>
                <div className="space-y-4">

                  {/* ── Claude / MCP ── */}
                  <ApiTokensSection />

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
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">ACCOUNT ID</label>
                          <input
                            type="text"
                            id="nbi-account-id"
                            defaultValue={(venueSettings as any)?.nbiAccountId ?? ''}
                            placeholder="e.g. e9d59bc3-73d5-4e64-a6e7-32a753b7dd3a"
                            className="w-full font-dm text-sm border border-gold/30 rounded px-3 py-2 bg-white focus:outline-none focus:border-forest font-mono"
                          />
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">VENUE ID</label>
                          <input
                            type="text"
                            id="nbi-venue-id"
                            defaultValue={(venueSettings as any)?.nbiVenueId ?? ''}
                            placeholder="e.g. 12388"
                            className="w-full font-dm text-sm border border-gold/30 rounded px-3 py-2 bg-white focus:outline-none focus:border-forest font-mono"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DEFAULT SERVICE</label>
                          <select
                            id="nbi-service-id"
                            defaultValue={(venueSettings as any)?.nbiServiceId ?? ''}
                            onChange={(e) => {
                              // Reset section when service changes — sections are per-service.
                              const sectionEl = document.getElementById('nbi-section-id') as HTMLSelectElement | null;
                              if (sectionEl) sectionEl.value = '';
                              // Force a re-render of the section list by updating local state.
                              setNbiSelectedServiceId(e.target.value);
                            }}
                            className="w-full font-dm text-sm border border-gold/30 rounded px-3 py-2 bg-white focus:outline-none focus:border-forest"
                          >
                            <option value="">Auto-pick first available</option>
                            {(nbiServiceList ?? []).map((s: any) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SECTION / AREA</label>
                          <select
                            id="nbi-section-id"
                            defaultValue={(venueSettings as any)?.nbiSectionId ?? ''}
                            className="w-full font-dm text-sm border border-gold/30 rounded px-3 py-2 bg-white focus:outline-none focus:border-forest"
                          >
                            <option value="">Auto-pick first section</option>
                            {(() => {
                              const selectedSvcId = nbiSelectedServiceId || (venueSettings as any)?.nbiServiceId || '';
                              const svc = (nbiServiceList ?? []).find((s: any) => s.id === selectedSvcId) || (nbiServiceList ?? [])[0];
                              return ((svc?.sections ?? []) as any[]).map((sec: any) => (
                                <option key={sec.id} value={sec.id}>{sec.name}</option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                      <p className="font-dm text-[11px] text-ink/50 -mt-2">Pick the service (e.g. <em>Drinks &amp; Snacks</em>) and the section/area in your venue (e.g. <em>Bar Area Level 1</em>) where new VenueFlow bookings should land.</p>

                      {/* Direction header — makes it obvious which way bookings flow */}
                      <div className="border-t border-gold/20 pt-3 mt-1">
                        <div className="font-bebas text-xs tracking-widest text-forest mb-2">VENUEFLOW → NOWBOOKIT (push bookings out)</div>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <div
                            className={`relative w-10 h-5 rounded-full transition-colors ${nbiEnabled ? 'bg-forest' : 'bg-stone-300'}`}
                            onClick={() => {
                              const accountId = (document.getElementById('nbi-account-id') as HTMLInputElement)?.value || (venueSettings as any)?.nbiAccountId || '';
                              const venueId = (document.getElementById('nbi-venue-id') as HTMLInputElement)?.value || (venueSettings as any)?.nbiVenueId || '';
                              if (!accountId || !venueId) { toast.error('Enter your Account ID and Venue ID first'); return; }
                              const serviceId = (document.getElementById('nbi-service-id') as HTMLSelectElement)?.value || '';
                              const sectionId = (document.getElementById('nbi-section-id') as HTMLSelectElement)?.value || '';
                              updateSettings.mutate({ nbiAccountId: accountId, nbiVenueId: venueId, nbiServiceId: serviceId, nbiSectionId: sectionId || undefined, nbiSyncEnabled: nbiEnabled ? 0 : 1 });
                            }}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${nbiEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </div>
                          <span className="font-dm text-sm text-ink">{nbiEnabled ? 'Auto-sync on — confirmed bookings push to NowBookIt' : 'Auto-sync off (you can still push manually from each booking)'}</span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const accountId = (document.getElementById('nbi-account-id') as HTMLInputElement)?.value;
                              const venueId = (document.getElementById('nbi-venue-id') as HTMLInputElement)?.value;
                              if (!accountId || !venueId) { toast.error('Enter your Account ID and Venue ID first'); return; }
                              verifyNbiMutation.mutate({ accountId, venueId });
                            }}
                            disabled={verifyNbiMutation.isPending}
                            className="font-bebas tracking-widest text-xs px-4 py-2 border border-[#6b98e7] text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded disabled:opacity-50"
                          >
                            {verifyNbiMutation.isPending ? 'TESTING…' : 'TEST CONNECTION'}
                          </button>
                          <button
                            onClick={() => {
                              const accountId = (document.getElementById('nbi-account-id') as HTMLInputElement)?.value;
                              const venueId = (document.getElementById('nbi-venue-id') as HTMLInputElement)?.value;
                              const serviceId = (document.getElementById('nbi-service-id') as HTMLSelectElement)?.value;
                              const sectionId = (document.getElementById('nbi-section-id') as HTMLSelectElement)?.value;
                              updateSettings.mutate({ nbiAccountId: accountId || undefined, nbiVenueId: venueId || undefined, nbiServiceId: serviceId || undefined, nbiSectionId: sectionId || undefined });
                            }}
                            disabled={updateSettings.isPending}
                            className="font-bebas tracking-widest text-xs px-4 py-2 bg-forest text-cream hover:bg-forest/90 rounded disabled:opacity-50"
                          >
                            {updateSettings.isPending ? 'SAVING…' : 'SAVE'}
                          </button>
                        </div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200/50 rounded p-3 text-xs font-dm text-ink/60 leading-relaxed">
                        <strong className="text-ink/80">No API key needed.</strong> VenueFlow uses NowBookIt's public booking endpoint — the same one a customer hits when they book through your widget. Find your <strong>Account ID</strong> and <strong>Venue ID</strong> in your NowBookIt booking widget URL: <code className="bg-white/70 px-1 rounded text-[10px]">bookings.nowbookit.com/?accountid=<strong>&lt;ACCOUNT_ID&gt;</strong>&amp;venueid=<strong>&lt;VENUE_ID&gt;</strong></code>. Once connected, confirmed VenueFlow bookings appear in your NowBookIt diary automatically. You can also push individual bookings manually from each booking's side panel.
                      </div>

                      {/* ── Inbound webhook (NBI → VFHQ) ── */}
                      {nbiConnected && (
                        <div className="border-t border-gold/20 pt-4 mt-2">
                          <div className="font-bebas text-xs tracking-widest text-sage mb-2">NOWBOOKIT → VENUEFLOW (pull bookings in)</div>
                          <label className="font-bebas text-[11px] tracking-widest text-ink/60 block mb-1">INBOUND WEBHOOK URL</label>
                          <p className="font-dm text-[11px] text-ink/60 mb-2 leading-relaxed">
                            <strong className="text-ink/80">Only needed for the reverse direction.</strong> Paste this URL into NowBookIt → <strong>Integrations → Add API Key Integration → Bookings tab</strong>, then enable <em>Bookings Webhooks</em>. Bookings made <em>directly in NowBookIt</em> will then appear in VenueFlow automatically.
                            <br />
                            <span className="text-ink/50">Bookings made in VenueFlow already push to NowBookIt via the auto-sync toggle above — you don't need this URL for that.</span>
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={nbiWebhook?.url ?? 'Loading…'}
                              onFocus={(e) => e.currentTarget.select()}
                              className="flex-1 font-mono text-[11px] border border-gold/30 rounded px-3 py-2 bg-white text-ink/80 focus:outline-none focus:border-forest"
                            />
                            <button
                              onClick={() => {
                                if (!nbiWebhook?.url) return;
                                navigator.clipboard.writeText(nbiWebhook.url);
                                toast.success('Webhook URL copied');
                              }}
                              className="font-bebas tracking-widest text-xs px-3 py-2 border border-[#6b98e7] text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded"
                            >COPY</button>
                            <button
                              onClick={() => {
                                if (!confirm('Regenerate the webhook URL? The current one will stop working until you paste the new one into NowBookIt.')) return;
                                regenWebhookMutation.mutate();
                              }}
                              disabled={regenWebhookMutation.isPending}
                              className="font-bebas tracking-widest text-xs px-3 py-2 border border-gold/30 text-ink/70 hover:bg-gold/10 rounded disabled:opacity-50"
                            >{regenWebhookMutation.isPending ? '…' : 'ROTATE'}</button>
                          </div>
                        </div>
                      )}
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
                  <AccountLoginsSection />
                  <div className="flex items-center justify-between mb-6">
                    <h1 className="font-cormorant text-3xl font-semibold text-ink">Team Access Links</h1>
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

              {/* Group Settings tab removed — panel was non-functional placeholder UI */}
              {false && settingsSubTab === ("group-settings" as any) && (
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
                <div className="bg-white border border-gray-200 rounded p-4 opacity-60">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-800">Password</h2>
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded">Coming soon</span>
                  </div>
                  <div className="max-w-sm space-y-3 pointer-events-none">
                    <div className="relative"><input type="password" disabled className="w-full border border-gray-200 rounded p-2 text-sm pr-10 bg-gray-50" placeholder="Old Password" /><Eye className="w-4 h-4 text-gray-300 absolute right-3 top-2.5" /></div>
                    <div className="relative"><input type="password" disabled className="w-full border border-gray-200 rounded p-2 text-sm pr-10 bg-gray-50" placeholder="New Password" /><Eye className="w-4 h-4 text-gray-300 absolute right-3 top-2.5" /></div>
                    <div className="relative"><input type="password" disabled className="w-full border border-gray-200 rounded p-2 text-sm pr-10 bg-gray-50" placeholder="New Password Confirmation" /><Eye className="w-4 h-4 text-gray-300 absolute right-3 top-2.5" /></div>
                    <button disabled className="btn-forest text-cream text-sm font-bebas tracking-widest px-6 py-2 opacity-50 cursor-not-allowed">Change Password</button>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">Password change is being wired up — for now, contact your admin to reset your password.</p>
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
                <h1 className="font-cormorant text-3xl font-semibold text-ink mb-2">Menu</h1>
                <p className="font-dm text-sm text-ink/60 mb-6">Build your food &amp; beverage menu. Create custom categories under Food and Beverages, then add items inside each — by hand, by pasting CSV, or by letting AI parse a description for you.</p>

                {/* ── Runsheet F&B Courses (moved here from Venue Settings) ── */}
                {settingsForm && (
                  <div className="dante-card p-6 mb-6">
                    <h2 className="font-bebas text-xs tracking-widest text-sage mb-1">RUNSHEET F&amp;B COURSES</h2>
                    <p className="font-dm text-xs text-ink/50 mb-3">Customise the course headers used inside Runsheet Builder (one per line). Leave blank to use defaults.</p>
                    <textarea
                      rows={6}
                      value={settingsForm.customCourses || ''}
                      onChange={e => {
                        setSettingsForm((f: any) => ({ ...f, customCourses: e.target.value }));
                      }}
                      placeholder={'Canapes\nEntree\nMain\nDessert\nCheese\nDrinks\nOther'}
                      className="w-full border border-gold/20 rounded-sm px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const raw = settingsForm.customCourses ?? '';
                        const lines = raw.split('\n').map((s: string) => s.trim()).filter(Boolean);
                        updateSettings.mutate({ customCourses: JSON.stringify(lines) });
                      }}
                      disabled={updateSettings.isPending}
                      className="mt-3 btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream disabled:opacity-50">
                      {updateSettings.isPending ? 'SAVING…' : 'SAVE COURSES'}
                    </button>
                  </div>
                )}

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
                    <button onClick={() => { setShowMenuForm(true); setEditingPackageId(null); setMenuForm({ name: '', type: 'food', description: '', pricePerHead: '', customPriceLabel: '', chefNotes: '', pdfUrl: '', pdfName: '' }); }} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">Add</button>
                  </div>
                  {/* Section filter tabs */}
                  <div className="flex border-b border-gray-100 px-4 pt-2 gap-1 overflow-x-auto">
                    <button onClick={() => setMenuSettingsTab('sections')} className={`text-xs font-bebas tracking-widest px-3 py-1.5 border-b-2 transition-colors ${menuSettingsTab === 'sections' ? 'border-burgundy text-burgundy' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>All</button>
                    {(menuSectionsList ?? []).map((s: any) => (
                      <button key={s.id} onClick={() => setMenuSettingsTab('categories')} className="text-xs font-bebas tracking-widest px-3 py-1.5 border-b-2 border-transparent text-gray-500 hover:text-gray-700">{s.name}</button>
                    ))}
                  </div>
                  {showMenuForm && (
                    <form onSubmit={e => {
                      e.preventDefault();
                      // Send empty strings as null when editing so users can clear a field.
                      // On create we omit them so server defaults to null.
                      const payload = {
                        name: menuForm.name,
                        type: menuForm.type,
                        description: menuForm.description || undefined,
                        pricePerHead: menuForm.pricePerHead ? parseFloat(menuForm.pricePerHead) : (editingPackageId ? null : undefined),
                        customPriceLabel: menuForm.customPriceLabel || (editingPackageId ? null : undefined),
                        chefNotes: menuForm.chefNotes || (editingPackageId ? null : undefined),
                        pdfUrl: menuForm.pdfUrl || (editingPackageId ? null : undefined),
                        pdfName: menuForm.pdfName || (editingPackageId ? null : undefined),
                      };
                      if (editingPackageId) {
                        updateMenuPackage.mutate({ id: editingPackageId, ...payload } as any);
                      } else {
                        createMenuPackage.mutate(payload as any);
                      }
                    }} className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
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
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CUSTOM PRICE LABEL (OPTIONAL)</label>
                        <Input value={menuForm.customPriceLabel} onChange={e => setMenuForm(f => ({ ...f, customPriceLabel: e.target.value }))} placeholder={'e.g. "$95pp" or "$1500 flat" or "POA" — shown instead of the price-per-head'} className="rounded-none border border-gold/30 text-sm" />
                        <p className="font-dm text-[11px] text-ink/40 mt-1">When set, this overrides the per-head price wherever this menu is displayed.</p>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SHORT DESCRIPTION</label>
                        <Input value={menuForm.description} onChange={e => setMenuForm(f => ({ ...f, description: e.target.value }))} placeholder="A choice of 3 courses" className="rounded-none border border-gold/30 text-sm" />
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CHEF / STAFF MENU TEXT (PASTE FULL MENU)</label>
                        <textarea
                          value={menuForm.chefNotes}
                          onChange={e => setMenuForm(f => ({ ...f, chefNotes: e.target.value }))}
                          rows={8}
                          placeholder={"Paste the full menu here exactly as you want chefs to see it. Line breaks and spacing are preserved.\n\nENTRÉE\n— Hapuka crudo, finger lime, kohlrabi\n— Heirloom tomato, smoked ricotta, basil\n\nMAIN\n— Wagyu sirloin, bone marrow jus\n— Market fish, brown butter"}
                          className="w-full rounded-none border border-gold/30 text-sm font-mono p-2 whitespace-pre-wrap"
                        />
                        <p className="font-dm text-[11px] text-ink/40 mt-1">Plain text only — paste from anywhere and the layout is kept as-is.</p>
                      </div>
                      <div>
                        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">CHEF MENU PDF (APPENDED TO BEO)</label>
                        {menuForm.pdfUrl ? (
                          <div className="flex items-center gap-2 p-2 bg-white border border-gold/30">
                            <FileText className="w-4 h-4 text-forest" />
                            <a href={menuForm.pdfUrl} target="_blank" rel="noopener noreferrer" className="font-dm text-sm text-forest hover:underline truncate flex-1">{menuForm.pdfName || 'View PDF'}</a>
                            <button type="button" onClick={() => setMenuForm(f => ({ ...f, pdfUrl: '', pdfName: '' }))} className="text-red-400 hover:text-red-600 text-xs font-bebas tracking-widest">REMOVE</button>
                          </div>
                        ) : (
                          <label className={`inline-flex items-center gap-2 font-bebas tracking-widest text-xs px-3 py-2 border cursor-pointer ${menuPdfUploading ? 'bg-forest/40 text-cream border-forest cursor-wait' : 'border-forest/40 text-forest hover:bg-forest/10'}`}>
                            {menuPdfUploading ? 'UPLOADING…' : 'UPLOAD PDF'}
                            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={menuPdfUploading}
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.type !== 'application/pdf') { toast.error('PDFs only'); return; }
                                if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }
                                setMenuPdfUploading(true);
                                const tId = toast.loading(`Uploading ${file.name}...`);
                                try {
                                  const fd = new FormData();
                                  fd.append('file', file);
                                  const res = await fetch('/api/upload-pdf', { method: 'POST', body: fd, credentials: 'include' });
                                  if (!res.ok) {
                                    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
                                    throw new Error(err.error || 'Upload failed');
                                  }
                                  const { url, name } = await res.json();
                                  setMenuForm(f => ({ ...f, pdfUrl: url, pdfName: name }));
                                  toast.success(`${name} attached`, { id: tId });
                                } catch (err: any) {
                                  toast.error(err?.message || 'Upload failed', { id: tId });
                                } finally {
                                  setMenuPdfUploading(false);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                        )}
                        <p className="font-dm text-[11px] text-ink/40 mt-1">Staff can open or print this PDF straight from the menu — useful for printed table menus.</p>
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
                      <div key={pkg.id} className="px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-800">{pkg.name}</span>
                              {pkg.description && <span className="text-xs text-gray-400">{pkg.description}</span>}
                            </div>
                            {pkg.pdfUrl && (
                              <a href={pkg.pdfUrl} target="_blank" rel="noopener noreferrer"
                                 className="inline-flex items-center gap-1 mt-1 text-xs text-forest hover:underline">
                                <FileText className="w-3 h-3" /> {pkg.pdfName || 'Open PDF'}
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {pkg.customPriceLabel
                              ? <span className="text-sm font-semibold text-gray-700">{pkg.customPriceLabel}</span>
                              : pkg.pricePerHead && <span className="text-sm font-semibold text-gray-700">${Number(pkg.pricePerHead).toFixed(2)} <span className="text-xs text-gray-400 font-normal">per person</span></span>
                            }
                            <button onClick={() => { setEditingPackageId(pkg.id); setMenuForm({ name: pkg.name, type: pkg.type, description: pkg.description ?? '', pricePerHead: pkg.pricePerHead ? String(pkg.pricePerHead) : '', customPriceLabel: pkg.customPriceLabel ?? '', chefNotes: pkg.chefNotes ?? '', pdfUrl: pkg.pdfUrl ?? '', pdfName: pkg.pdfName ?? '' }); setShowMenuForm(true); }} className="text-blue-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => deleteMenuPackage.mutate({ id: pkg.id })} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                        {pkg.chefNotes && (
                          <details className="mt-2 group">
                            <summary className="cursor-pointer text-[11px] font-bebas tracking-widest text-gray-500 hover:text-forest">
                              ▾ CHEF / STAFF MENU
                            </summary>
                            <pre className="mt-1 p-3 bg-cream-card border border-gold/15 font-mono text-xs text-ink/80 whitespace-pre-wrap break-words">{pkg.chefNotes}</pre>
                          </details>
                        )}
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
                      {t === 'food' ? '🍽 FOOD' : '🍷 BEVERAGES'}
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
                            placeholder={catalogActiveType === 'food' ? 'e.g. Canapés, Grazing, Shared Plates…' : 'e.g. Wines, Cocktails, Beer, Non-Alcoholic…'}
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
                            <button onClick={() => { setShowCatalogAiPanel(v => !v); setShowCatalogCsvImport(false); }}
                              className={`font-bebas tracking-widest text-xs px-3 py-1.5 transition-colors border ${showCatalogAiPanel ? 'bg-forest text-cream border-forest' : 'border-forest/40 text-forest hover:bg-forest/10'}`}>✨ AI ADD</button>
                            <label className={`font-bebas tracking-widest text-xs px-3 py-1.5 transition-colors border cursor-pointer ${catalogPdfLoading ? 'bg-forest/40 text-cream border-forest cursor-wait' : 'border-forest/40 text-forest hover:bg-forest/10'}`}>
                              {catalogPdfLoading ? 'READING…' : '📄 UPLOAD PDF'}
                              <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={catalogPdfLoading}
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (!file || !catalogActiveCategoryId) return;
                                  if (file.size > 25 * 1024 * 1024) { toast.error("PDF is too large (max 25 MB)"); return; }
                                  setCatalogPdfLoading(true);
                                  try {
                                    const text = await extractTextFromPdf(file);
                                    if (!text.trim()) { toast.error("Couldn't read any text from that PDF — it may be scanned/image-only."); return; }
                                    setShowCatalogAiPanel(true);
                                    setShowCatalogCsvImport(false);
                                    setCatalogAiText(text);
                                    const res = await parseFnbForCatalog.mutateAsync({ text });
                                    const isBeverageCategory = catalogActiveType !== 'food';
                                    const parsed = (res.fnbItems ?? []).map((x: any) => {
                                      const raw = String(x.dishName ?? x.name ?? '').trim();
                                      const priceMatch = raw.match(/\$?\s*(\d+(?:\.\d+)?)/);
                                      const cleanName = raw.replace(/[-–—:|]?\s*\$?\s*\d+(?:\.\d+)?\s*(?:pp|per\s*person|per\s*item|each|per\s*bottle|per\s*glass)?\s*$/i, '').trim() || raw;
                                      const desc = String(x.description ?? '').trim();
                                      const aiPrice = typeof x.price === 'number' ? x.price : (typeof x.price === 'string' ? parseFloat(x.price) : NaN);
                                      const descPriceMatch = !priceMatch ? desc.match(/\$?\s*(\d+(?:\.\d+)?)/) : null;
                                      const fallbackPriceStr = priceMatch?.[1] ?? descPriceMatch?.[1];
                                      const price = Number.isFinite(aiPrice) && aiPrice > 0 ? aiPrice : (fallbackPriceStr ? parseFloat(fallbackPriceStr) : 0);
                                      const lower = (raw + ' ' + desc).toLowerCase();
                                      const aiPricingType = x.pricingType === 'per_item' || x.pricingType === 'per_person' ? x.pricingType : null;
                                      const keywordPerItem = /(\bper\s*item\b|\beach\b|\bpiece\b|\bbottle\b|\bglass\b|\bcocktail\b|\bdrink\b|\bcan\b|\btap\b|\bpint\b|\bschooner\b)/.test(lower);
                                      const pricingType: 'per_person'|'per_item' = aiPricingType ?? (keywordPerItem ? 'per_item' : (isBeverageCategory ? 'per_item' : 'per_person'));
                                      const unit = (typeof x.unit === 'string' && x.unit.trim()) ? x.unit.trim() : (pricingType === 'per_item' ? 'piece' : 'person');
                                      return { name: cleanName, description: desc || undefined, price, pricingType, unit, allergens: x.dietary || undefined };
                                    }).filter((x: any) => x.name);
                                    setCatalogAiPreview(parsed);
                                    if (!parsed.length) toast.error("AI couldn't find any items in that PDF");
                                    else toast.success(`Found ${parsed.length} items — review and confirm below`);
                                  } catch (err: any) {
                                    toast.error('PDF parse failed: ' + (err?.message ?? 'unknown error'));
                                  } finally {
                                    setCatalogPdfLoading(false);
                                  }
                                }} />
                            </label>
                            <button onClick={() => { setShowCatalogCsvImport(v => !v); setShowCatalogAiPanel(false); }}
                              className="border border-gold/30 text-ink/60 font-bebas tracking-widest text-xs px-3 py-1.5 hover:border-forest hover:text-forest transition-colors">CSV / PASTE</button>
                            <button onClick={() => { setEditingCatalogItemId(null); setCatalogItemForm({ name: '', description: '', pricingType: 'per_person', price: '', unit: 'person', allergens: '' }); setShowCatalogItemForm(true); }}
                              className="btn-forest text-cream font-bebas tracking-widest text-xs px-3 py-1.5">+ ADD ITEM</button>
                          </div>
                        </div>

                        {/* AI smart-add panel */}
                        {showCatalogAiPanel && (
                          <div className="p-4 border-b border-gold/10 bg-forest/5 space-y-3">
                            <div>
                              <p className="font-dm text-xs text-ink/70 mb-1"><span className="font-semibold text-forest">✨ AI Smart Add</span> — paste anything: a menu PDF excerpt, a supplier list, an email, even a rough description. AI will extract items into the current category.</p>
                              <p className="font-dm text-[11px] text-ink/40">Adding to <span className="font-semibold text-ink/70">{(catalogCategories ?? []).find((c: any) => c.id === catalogActiveCategoryId)?.name ?? '—'}</span></p>
                            </div>
                            <Textarea value={catalogAiText} onChange={e => setCatalogAiText(e.target.value)}
                              placeholder={catalogActiveType === 'food'
                                ? "e.g.\n• Smoked salmon blini with creme fraiche - $8.50pp\n• Pork belly bao buns - $9 each\n• Vegetarian arancini, pea & mint - $6.50pp (V, GF available)\n\n…or just paste a whole menu and let AI sort it out."
                                : "e.g.\nNZ Pinot Noir 2022 - $14 per glass / $65 per bottle\nLocal IPA on tap - $12\nEspresso Martini cocktail - $18\nHouse-made lemonade (non-alc) - $7"}
                              className="rounded-none border border-forest/30 text-sm h-32" />
                            {catalogAiPreview.length > 0 && (
                              <div className="bg-white border border-forest/30 rounded p-2 max-h-56 overflow-auto">
                                <p className="font-bebas tracking-widest text-[11px] text-forest mb-2 px-1">PREVIEW · {catalogAiPreview.length} ITEMS — review then confirm</p>
                                <div className="divide-y divide-gold/10">
                                  {catalogAiPreview.map((it, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 px-1 py-1.5">
                                      <div className="min-w-0 flex-1">
                                        <div className="font-dm text-sm text-ink truncate">{it.name}</div>
                                        {it.description && <div className="font-dm text-[11px] text-ink/50 truncate">{it.description}</div>}
                                      </div>
                                      <span className="font-dm text-xs text-ink/70 whitespace-nowrap">${(it.price ?? 0).toFixed(2)} <span className="text-ink/40">/ {it.unit ?? (it.pricingType === 'per_item' ? 'item' : 'person')}</span></span>
                                      <button onClick={() => setCatalogAiPreview(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 flex-wrap">
                              {catalogAiPreview.length === 0 ? (
                                <button onClick={async () => {
                                  if (!catalogAiText.trim() || !catalogActiveCategoryId) return;
                                  try {
                                    const res = await parseFnbForCatalog.mutateAsync({ text: catalogAiText });
                                    const isBeverageCategory = catalogActiveType !== 'food';
                                    const parsed = (res.fnbItems ?? []).map((x: any) => {
                                      const raw = String(x.dishName ?? x.name ?? '').trim();
                                      const priceMatch = raw.match(/\$?\s*(\d+(?:\.\d+)?)/);
                                      const cleanName = raw.replace(/[-–—:|]?\s*\$?\s*\d+(?:\.\d+)?\s*(?:pp|per\s*person|per\s*item|each|per\s*bottle|per\s*glass)?\s*$/i, '').trim() || raw;
                                      const desc = String(x.description ?? '').trim();
                                      // Prefer AI-supplied price; fall back to scraping the name/description.
                                      const aiPrice = typeof x.price === 'number' ? x.price : (typeof x.price === 'string' ? parseFloat(x.price) : NaN);
                                      const descPriceMatch = !priceMatch ? desc.match(/\$?\s*(\d+(?:\.\d+)?)/) : null;
                                      const fallbackPriceStr = priceMatch?.[1] ?? descPriceMatch?.[1];
                                      const price = Number.isFinite(aiPrice) && aiPrice > 0
                                        ? aiPrice
                                        : (fallbackPriceStr ? parseFloat(fallbackPriceStr) : 0);
                                      // Prefer AI-supplied pricingType; fall back to keyword check; default to per_item for drinks.
                                      const lower = (raw + ' ' + desc).toLowerCase();
                                      const aiPricingType = x.pricingType === 'per_item' || x.pricingType === 'per_person' ? x.pricingType : null;
                                      const keywordPerItem = /(\bper\s*item\b|\beach\b|\bpiece\b|\bbottle\b|\bglass\b|\bcocktail\b|\bdrink\b|\bcan\b|\btap\b|\bpint\b|\bschooner\b)/.test(lower);
                                      const pricingType: 'per_person'|'per_item' = aiPricingType
                                        ?? (keywordPerItem ? 'per_item' : (isBeverageCategory ? 'per_item' : 'per_person'));
                                      const unit = (typeof x.unit === 'string' && x.unit.trim()) ? x.unit.trim() : (pricingType === 'per_item' ? 'piece' : 'person');
                                      return { name: cleanName, description: desc || undefined, price, pricingType, unit, allergens: x.dietary || undefined };
                                    }).filter((x: any) => x.name);
                                    setCatalogAiPreview(parsed);
                                    if (!parsed.length) toast.error("AI couldn't find any items in that text");
                                  } catch (err: any) {
                                    toast.error('AI parse failed: ' + (err?.message ?? 'unknown error'));
                                  }
                                }} disabled={parseFnbForCatalog.isPending || !catalogAiText.trim() || !catalogActiveCategoryId}
                                  className="btn-forest text-cream font-bebas tracking-widest text-xs px-4 py-1.5">{parseFnbForCatalog.isPending ? 'PARSING…' : '✨ PARSE WITH AI'}</button>
                              ) : (
                                <>
                                  <button onClick={() => {
                                    if (!catalogActiveCategoryId) return;
                                    const rows = catalogAiPreview.map(it => ({ categoryId: catalogActiveCategoryId, name: it.name, description: it.description, pricingType: it.pricingType ?? 'per_person', price: it.price ?? 0, unit: it.unit ?? (it.pricingType === 'per_item' ? 'piece' : 'person'), allergens: it.allergens }));
                                    bulkCreateCatalogItems.mutate(rows, { onSuccess: () => { setCatalogAiPreview([]); setCatalogAiText(''); setShowCatalogAiPanel(false); } });
                                  }} disabled={bulkCreateCatalogItems.isPending}
                                    className="btn-forest text-cream font-bebas tracking-widest text-xs px-4 py-1.5">ADD {catalogAiPreview.length} ITEMS</button>
                                  <button onClick={() => setCatalogAiPreview([])}
                                    className="border border-gold/30 text-ink/60 font-bebas tracking-widest text-xs px-3 py-1.5">RE-PARSE</button>
                                </>
                              )}
                              <button onClick={() => { setShowCatalogAiPanel(false); setCatalogAiText(''); setCatalogAiPreview([]); }}
                                className="border border-gray-300 text-gray-500 text-xs px-3 py-1.5">Cancel</button>
                            </div>
                          </div>
                        )}

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
                          const selectedCount = catalogSelectedIds.size;
                          const allSelected = items.length > 0 && items.every((i: any) => catalogSelectedIds.has(i.id));
                          return (
                          <div>
                            {/* Bulk action bar — appears whenever 1+ rows are selected. */}
                            {selectedCount > 0 && (
                              <div className="flex items-center justify-between px-4 py-2.5 bg-forest/10 border-b border-forest/20">
                                <span className="font-bebas tracking-widest text-xs text-forest">
                                  {selectedCount} SELECTED
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => bulkUpdateCatalogItems.mutate({ ids: Array.from(catalogSelectedIds), patch: { pricingType: 'per_person' } })}
                                    disabled={bulkUpdateCatalogItems.isPending}
                                    className="font-bebas tracking-widest text-[11px] px-2.5 py-1 border border-forest/40 text-forest hover:bg-forest/15">
                                    SET PER PERSON
                                  </button>
                                  <button
                                    onClick={() => bulkUpdateCatalogItems.mutate({ ids: Array.from(catalogSelectedIds), patch: { pricingType: 'per_item' } })}
                                    disabled={bulkUpdateCatalogItems.isPending}
                                    className="font-bebas tracking-widest text-[11px] px-2.5 py-1 border border-forest/40 text-forest hover:bg-forest/15">
                                    SET PER ITEM
                                  </button>
                                  <button
                                    onClick={() => {
                                      const raw = window.prompt('Set price for all selected items (in dollars, e.g. 12.50). Leave blank to cancel.');
                                      if (!raw) return;
                                      const n = Number(raw);
                                      if (!Number.isFinite(n) || n < 0) { toast.error('Invalid price'); return; }
                                      bulkUpdateCatalogItems.mutate({ ids: Array.from(catalogSelectedIds), patch: { price: n } });
                                    }}
                                    disabled={bulkUpdateCatalogItems.isPending}
                                    className="font-bebas tracking-widest text-[11px] px-2.5 py-1 border border-forest/40 text-forest hover:bg-forest/15">
                                    SET PRICE…
                                  </button>
                                  <button
                                    onClick={() => {
                                      const target = (catalogCategories ?? []).filter((c: any) => c.type === catalogActiveType && c.id !== catalogActiveCategoryId);
                                      if (target.length === 0) { toast.error('No other categories to move to'); return; }
                                      const choice = window.prompt(`Move ${selectedCount} item${selectedCount !== 1 ? 's' : ''} to which category?\n\n${target.map((c: any, i: number) => `${i + 1}. ${c.name}`).join('\n')}\n\nEnter a number:`);
                                      if (!choice) return;
                                      const idx = parseInt(choice, 10) - 1;
                                      if (Number.isNaN(idx) || idx < 0 || idx >= target.length) { toast.error('Invalid choice'); return; }
                                      bulkUpdateCatalogItems.mutate({ ids: Array.from(catalogSelectedIds), patch: { categoryId: target[idx].id } });
                                    }}
                                    disabled={bulkUpdateCatalogItems.isPending}
                                    className="font-bebas tracking-widest text-[11px] px-2.5 py-1 border border-forest/40 text-forest hover:bg-forest/15">
                                    MOVE TO…
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!confirm(`Delete ${selectedCount} item${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`)) return;
                                      bulkDeleteCatalogItems.mutate({ ids: Array.from(catalogSelectedIds) });
                                    }}
                                    disabled={bulkDeleteCatalogItems.isPending}
                                    className="font-bebas tracking-widest text-[11px] px-2.5 py-1 border border-red-400 text-red-600 hover:bg-red-50">
                                    DELETE
                                  </button>
                                  <button
                                    onClick={() => setCatalogSelectedIds(new Set())}
                                    className="font-bebas tracking-widest text-[11px] px-2 py-1 text-ink/40 hover:text-ink/70">
                                    CLEAR
                                  </button>
                                </div>
                              </div>
                            )}
                            {/* Select-all row */}
                            {items.length > 0 && (
                              <div className="flex items-center gap-2 px-4 py-2 border-b border-gold/10 bg-linen/30">
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={() => {
                                    setCatalogSelectedIds(allSelected ? new Set() : new Set(items.map((i: any) => i.id)));
                                  }}
                                  className="cursor-pointer"
                                />
                                <span className="font-bebas tracking-widest text-[10px] text-ink/40">{allSelected ? 'DESELECT ALL' : 'SELECT ALL'}</span>
                              </div>
                            )}
                            <div className="divide-y divide-gold/10">
                              {items.length === 0 && !showCatalogItemForm && (
                                <p className="p-6 text-center text-sm text-ink/40">No items yet. Click + Add Item to get started, or use CSV Import.</p>
                              )}
                              {items.map((item: any) => {
                                const unitPrice = item.price / 100;
                                const lineTotal = item.price > 0 && guests > 0
                                  ? (item.pricingType === 'per_person' ? unitPrice * guests : unitPrice)
                                  : null;
                                const isSelected = catalogSelectedIds.has(item.id);
                                return (
                                <div key={item.id} className={`flex items-start justify-between px-4 py-3 group ${isSelected ? 'bg-forest/5' : 'hover:bg-linen/30'}`}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleCatalogSelected(item.id)}
                                    className="mt-1 mr-3 cursor-pointer flex-shrink-0"
                                  />
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
            <div className="bg-forest-dark px-4 md:px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-bebas tracking-widest text-xs text-gold mb-0.5">EVENT DETAILS</div>
                <div className="font-cormorant text-cream font-semibold text-lg">{selectedBooking.firstName} {selectedBooking.lastName}</div>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="text-cream/60 hover:text-cream">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="p-4 md:p-5 space-y-5 flex-1">
              {/* Status + Type */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-bebas text-xs tracking-widest px-2 py-1 border ${
                  selectedBooking.status === 'confirmed' || selectedBooking.status === 'booked' ? 'text-forest bg-blue-50 border-blue-200'
                  : selectedBooking.status === 'finished' ? 'text-teal-700 bg-teal-50 border-teal-200'
                  : selectedBooking.status === 'tentative' ? 'text-amber-600 bg-amber-50 border-amber-200'
                  : selectedBooking.status === 'new' ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-stone-500 bg-stone-50 border-stone-200'
                }`}>{selectedBooking._isLead && !['confirmed','booked','finished'].includes(selectedBooking.status) ? 'ENQUIRY' : (selectedBooking.status?.toUpperCase() ?? 'EVENT')}</span>
                {selectedBooking.eventType && <span className="font-dm text-xs text-ink/60">{selectedBooking.eventType}</span>}
              </div>
              {/* Quick Status Changer — works for both leads and bookings */}
              <div>
                <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1.5">CHANGE STATUS</div>
                <Select
                  value={selectedBooking.status ?? ''}
                  onValueChange={(newStatus) => {
                    const prevStatus = selectedBooking.status;
                    if (newStatus === prevStatus) return;
                    // Rule: every event must have a space selected before it
                    // can move into a live state (booked/confirmed/tentative).
                    const needsSpace = ['booked', 'confirmed', 'tentative'].includes(newStatus);
                    if (needsSpace && !selectedBooking.spaceName?.trim()) {
                      toast.error('Pick a space in the SPACE field above first — it\'s the row with the pin icon.', { duration: 5000 });
                      return;
                    }
                    if (selectedBooking._isLead) {
                      // Lead row → use leads.updateStatus (also auto-creates a booking when → booked)
                      updateStatus.mutate({ id: selectedBooking.id, status: newStatus as any });
                      setSelectedBooking((prev: any) => prev ? { ...prev, status: newStatus } : prev);
                      utils.leads.eventsByMonth.invalidate();
                    } else {
                      // Real booking row — bookings.update only accepts confirmed/tentative/cancelled/finished
                      const allowed = ['confirmed','tentative','cancelled','finished'];
                      if (!allowed.includes(newStatus)) { toast.error('Use the enquiry pipeline for that status'); return; }
                      rescheduleBooking.mutate({ id: selectedBooking.id, status: newStatus as any });
                      setSelectedBooking((prev: any) => prev ? { ...prev, status: newStatus } : prev);
                      utils.bookings.byMonth.invalidate();
                      utils.bookings.list.invalidate();
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs rounded-sm border-gold/30">
                    <SelectValue placeholder="Set status" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedBooking._isLead
                      ? pipelineStages.map(s => (
                          <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                        ))
                      : (
                        <>
                          <SelectItem value="confirmed" className="text-xs">Confirmed</SelectItem>
                          <SelectItem value="tentative" className="text-xs">Tentative</SelectItem>
                          <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                          <SelectItem value="finished" className="text-xs">Finished</SelectItem>
                        </>
                      )}
                  </SelectContent>
                </Select>
              </div>
              {/* Key Details — every row is click-to-edit. Pencil reveals an
                  inline input; Save commits via bookings.update or leads.update,
                  Cancel/Esc/blur reverts. */}
              <div className="space-y-3">
                {/* DATE */}
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="font-bebas text-xs tracking-widest text-ink/40">DATE</div>
                      {drawerEdit?.field !== "eventDate" && (
                        <button onClick={() => setDrawerEdit({ field: "eventDate", value: toDatetimeLocal(selectedBooking.eventDate) })}
                          className="text-ink/30 hover:text-forest" aria-label="Edit date">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {drawerEdit?.field === "eventDate" ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input type="datetime-local" value={drawerEdit.value}
                          onChange={e => setDrawerEdit({ field: "eventDate", value: e.target.value })}
                          className="h-8 text-xs" autoFocus />
                        <button onClick={() => saveDrawerField("eventDate", drawerEdit.value)}
                          className="px-2 py-1 bg-forest text-cream text-xs">Save</button>
                        <button onClick={() => setDrawerEdit(null)}
                          className="px-2 py-1 border border-ink/20 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="font-dm text-sm text-ink">
                          {selectedBooking.eventDate ? new Date(selectedBooking.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : '—'}
                        </div>
                        {/* Always-on inline START / END time editors — change saves immediately */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1">
                            <span className="font-bebas text-[10px] tracking-widest text-ink/40">START</span>
                            <Input
                              type="time"
                              value={toTimeLocal(selectedBooking.eventDate)}
                              disabled={!selectedBooking.eventDate}
                              onChange={e => {
                                const combined = combineDateAndTime(selectedBooking.eventDate, e.target.value);
                                if (combined) saveDrawerField("eventDate", combined);
                              }}
                              className="h-7 text-xs px-2 w-[90px]"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-bebas text-[10px] tracking-widest text-ink/40">END</span>
                            <Input
                              type="time"
                              value={toTimeLocal(selectedBooking.eventEndDate)}
                              disabled={!selectedBooking.eventDate}
                              onChange={e => {
                                if (!e.target.value) {
                                  saveDrawerField("eventEndDate", "");
                                  return;
                                }
                                const combined = combineDateAndTime(selectedBooking.eventEndDate, e.target.value, selectedBooking.eventDate);
                                if (combined) saveDrawerField("eventEndDate", combined);
                              }}
                              className="h-7 text-xs px-2 w-[90px]"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {/* GUESTS */}
                <div className="flex items-start gap-3">
                  <Users className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="font-bebas text-xs tracking-widest text-ink/40">GUESTS</div>
                      {drawerEdit?.field !== "guestCount" && (
                        <button onClick={() => setDrawerEdit({ field: "guestCount", value: selectedBooking.guestCount?.toString() ?? "" })}
                          className="text-ink/30 hover:text-forest" aria-label="Edit guests">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {drawerEdit?.field === "guestCount" ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input type="number" min="0" value={drawerEdit.value}
                          onChange={e => setDrawerEdit({ field: "guestCount", value: e.target.value })}
                          className="h-8 text-xs w-24" autoFocus />
                        <button onClick={() => saveDrawerField("guestCount", drawerEdit.value)}
                          className="px-2 py-1 bg-forest text-cream text-xs">Save</button>
                        <button onClick={() => setDrawerEdit(null)}
                          className="px-2 py-1 border border-ink/20 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div className="font-dm text-sm text-ink">{selectedBooking.guestCount ?? '—'}</div>
                    )}
                  </div>
                </div>
                {/* MINIMUM SPEND — customisable; hidden when empty unless editing */}
                <div className="flex items-start gap-3">
                  <DollarSign className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="font-bebas text-xs tracking-widest text-ink/40">MINIMUM SPEND</div>
                      {drawerEdit?.field !== "minimumSpend" && (
                        <button onClick={() => setDrawerEdit({ field: "minimumSpend", value: selectedBooking.minimumSpend != null ? String(selectedBooking.minimumSpend) : "" })}
                          className="text-ink/30 hover:text-forest" aria-label="Edit minimum spend">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {drawerEdit?.field === "minimumSpend" ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input type="number" min="0" step="0.01" value={drawerEdit.value}
                          onChange={e => setDrawerEdit({ field: "minimumSpend", value: e.target.value })}
                          placeholder="e.g. 2500" className="h-8 text-xs flex-1" autoFocus />
                        <button onClick={() => saveDrawerField("minimumSpend", drawerEdit.value)}
                          className="px-2 py-1 bg-forest text-cream text-xs">Save</button>
                        <button onClick={() => setDrawerEdit(null)}
                          className="px-2 py-1 border border-ink/20 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div className="font-dm text-sm text-ink">
                        {selectedBooking.minimumSpend != null && selectedBooking.minimumSpend !== ""
                          ? `$${Number(selectedBooking.minimumSpend).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}`
                          : <span className="text-ink/30 italic">Not set</span>}
                      </div>
                    )}
                  </div>
                </div>
                {/* SPACE — shown for both leads and bookings. Leads must be
                    able to pick a space too, otherwise the "set status to
                    Tentative/Confirmed" path is blocked with no way to fix
                    it from the side drawer. leads.update accepts spaceName,
                    so saveDrawerField handles both paths automatically. */}
                <div className="flex items-start gap-3">
                  <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${!selectedBooking.spaceName?.trim() ? 'text-amber-600' : 'text-gold'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">SPACE {!selectedBooking.spaceName?.trim() && <span className="text-amber-600 normal-case">— required to confirm</span>}</div>
                    {/* Always-on space picker (no click-to-edit dance) so the
                        user can never get stuck unable to set one. */}
                    {spaces && spaces.length > 0 ? (
                      <Select value={selectedBooking.spaceName || "__none__"}
                        onValueChange={v => saveDrawerField("spaceName", v === "__none__" ? "" : v)}>
                        <SelectTrigger className={`h-8 text-xs ${!selectedBooking.spaceName?.trim() ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-gold/30'}`}>
                          <SelectValue placeholder="Pick a space" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-xs italic text-ink/50">— None —</SelectItem>
                          {spaces.map((s: any) => (
                            <SelectItem key={s.id} value={s.name} className="text-xs">{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-xs text-ink/60 italic">No spaces yet — add one in Settings → Spaces</div>
                    )}
                  </div>
                </div>
                {/* EMAIL */}
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="font-bebas text-xs tracking-widest text-ink/40">EMAIL</div>
                      {drawerEdit?.field !== "email" && (
                        <button onClick={() => setDrawerEdit({ field: "email", value: selectedBooking.email ?? "" })}
                          className="text-ink/30 hover:text-forest" aria-label="Edit email">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {drawerEdit?.field === "email" ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input type="email" value={drawerEdit.value}
                          onChange={e => setDrawerEdit({ field: "email", value: e.target.value })}
                          className="h-8 text-xs flex-1" autoFocus />
                        <button onClick={() => saveDrawerField("email", drawerEdit.value)}
                          className="px-2 py-1 bg-forest text-cream text-xs">Save</button>
                        <button onClick={() => setDrawerEdit(null)}
                          className="px-2 py-1 border border-ink/20 text-xs">Cancel</button>
                      </div>
                    ) : (
                      <div className="font-dm text-sm text-ink truncate">{selectedBooking.email || '—'}</div>
                    )}
                  </div>
                </div>
              </div>
              {/* Financials — bookings only. Total/Deposit are click-to-edit;
                  the deposit-paid badge toggles on click. */}
              {!selectedBooking._isLead && (
                <div className="bg-forest-dark/5 border border-gold/20 p-4">
                  <div className="font-bebas text-xs tracking-widest text-ink/40 mb-3">FINANCIALS</div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* TOTAL */}
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="font-bebas text-xs tracking-widest text-ink/40">TOTAL</div>
                        {drawerEdit?.field !== "totalNzd" && (
                          <button onClick={() => setDrawerEdit({ field: "totalNzd", value: selectedBooking.totalNzd != null ? String(selectedBooking.totalNzd) : "" })}
                            className="text-ink/30 hover:text-forest" aria-label="Edit total">
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {drawerEdit?.field === "totalNzd" ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input type="number" min="0" step="0.01" value={drawerEdit.value}
                            onChange={e => setDrawerEdit({ field: "totalNzd", value: e.target.value })}
                            className="h-8 text-sm" autoFocus />
                          <button onClick={() => saveDrawerField("totalNzd", drawerEdit.value)}
                            className="px-2 py-1 bg-forest text-cream text-xs">Save</button>
                        </div>
                      ) : (
                        <div className="font-cormorant text-xl font-semibold text-ink">${Number(selectedBooking.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      )}
                    </div>
                    {/* DEPOSIT */}
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="font-bebas text-xs tracking-widest text-ink/40">DEPOSIT</div>
                        {drawerEdit?.field !== "depositNzd" && (
                          <button onClick={() => setDrawerEdit({ field: "depositNzd", value: selectedBooking.depositNzd != null ? String(selectedBooking.depositNzd) : "" })}
                            className="text-ink/30 hover:text-forest" aria-label="Edit deposit">
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {drawerEdit?.field === "depositNzd" ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input type="number" min="0" step="0.01" value={drawerEdit.value}
                            onChange={e => setDrawerEdit({ field: "depositNzd", value: e.target.value })}
                            className="h-8 text-sm" autoFocus />
                          <button onClick={() => saveDrawerField("depositNzd", drawerEdit.value)}
                            className="px-2 py-1 bg-forest text-cream text-xs">Save</button>
                        </div>
                      ) : (
                        <div className="font-cormorant text-xl font-semibold text-ink">${Number(selectedBooking.depositNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      )}
                    </div>
                  </div>
                  {/* Three states: NOT REQUIRED · PENDING · PAID. The
                      "deposit not taken" case (mates rates, internal
                      events) silences the amber warning so the drawer
                      doesn't nag the user about a deposit they were
                      never going to collect. */}
                  {selectedBooking.depositRequired === false ? (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-bebas text-xs tracking-widest text-ink/50">— DEPOSIT NOT REQUIRED</span>
                      <button
                        onClick={() => {
                          setSelectedBooking((prev: any) => prev ? { ...prev, depositRequired: true } : prev);
                          rescheduleBooking.mutate({ id: selectedBooking.id, depositRequired: true } as any);
                        }}
                        className="font-bebas text-[10px] tracking-widest text-forest hover:underline"
                        title="Click to start tracking a deposit again">
                        REQUIRE DEPOSIT
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <button
                        onClick={() => {
                          const next = !selectedBooking.depositPaid;
                          setSelectedBooking((prev: any) => prev ? { ...prev, depositPaid: next } : prev);
                          rescheduleBooking.mutate({ id: selectedBooking.id, depositPaid: next } as any);
                        }}
                        className={`font-bebas text-xs tracking-widest cursor-pointer hover:opacity-80 ${
                          selectedBooking.depositPaid ? 'text-forest' : 'text-amber-600'
                        }`}
                        title="Click to toggle">
                        {selectedBooking.depositPaid ? '✓ DEPOSIT PAID — click to mark unpaid' : '⚠ DEPOSIT PENDING — click to mark paid'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedBooking((prev: any) => prev ? { ...prev, depositRequired: false, depositPaid: false } : prev);
                          rescheduleBooking.mutate({ id: selectedBooking.id, depositRequired: false } as any);
                        }}
                        className="font-bebas text-[10px] tracking-widest text-ink/40 hover:text-ink"
                        title="This booking doesn't require a deposit at all">
                        NO DEPOSIT
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Quick Actions */}
              <div>
                <div className="font-bebas text-xs tracking-widest text-ink/40 mb-2">QUICK ACTIONS</div>
                <div className="grid grid-cols-2 gap-2">
                  {selectedBooking._isLead ? (
                    <>
                      <button onClick={() => {
                          const lead = selectedBooking;
                          setSelectedBooking(null);
                          // Make sure the enquiries tab is in a state that actually shows this lead's detail
                          setLeadViewMode('list');
                          setLeadStatusFilter([]);
                          setLeadsSubTab('all');
                          selectLead(lead);
                          setTab('enquiries');
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                        <FileText className="w-3 h-3 text-gold" /> {['confirmed','booked','finished'].includes(selectedBooking.status) ? 'VIEW DETAILS' : 'OPEN ENQUIRY'}
                      </button>
                      <button onClick={() => { setSelectedBooking(null); setLocation(`/proposals/new?leadId=${selectedBooking.id}`); }}
                        className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                        <FileText className="w-3 h-3 text-gold" /> CREATE PROPOSAL
                      </button>
                      {drawerLeadRunsheets && drawerLeadRunsheets.length > 0 ? (
                        <button onClick={() => { setSelectedBooking(null); setLocation(`/runsheet?id=${drawerLeadRunsheets[drawerLeadRunsheets.length - 1].id}&leadId=${selectedBooking.id}`); }}
                          className="flex items-center gap-2 px-3 py-2 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                          <Clock className="w-3 h-3 text-gold" /> EDIT RUNSHEET
                        </button>
                      ) : ['booked','confirmed'].includes(selectedBooking.status) ? (
                        <button
                          onClick={() => {
                            createRunsheet.mutate({
                              title: `${selectedBooking.firstName ?? ''}${selectedBooking.lastName ? ' ' + selectedBooking.lastName : ''}${selectedBooking.eventType ? ' — ' + selectedBooking.eventType : ''}`.trim() || 'Untitled Runsheet',
                              leadId: selectedBooking.id,
                              eventDate: selectedBooking.eventDate ?? undefined,
                              guestCount: selectedBooking.guestCount ?? undefined,
                              venueName: (venueSettings as any)?.name ?? undefined,
                            });
                          }}
                          disabled={createRunsheet.isPending}
                          className="flex items-center gap-2 px-3 py-2 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs disabled:opacity-50">
                          <Clock className="w-3 h-3" /> {createRunsheet.isPending ? 'CREATING...' : 'GENERATE RUNSHEET'}
                        </button>
                      ) : (
                        <button onClick={() => { setSelectedBooking(null); setLocation(`/runsheet?leadId=${selectedBooking.id}`); }}
                          className="flex items-center gap-2 px-3 py-2 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs">
                          <Clock className="w-3 h-3" /> RUNSHEET
                        </button>
                      )}
                      {selectedBooking.email && !isTeamMember && (
                        <button
                          onClick={() => {
                            // Synthesise a lead-shape so the email modal (which expects selectedLead)
                            // renders. Carry the booking id forward so the server can log this email
                            // back to the originating enquiry's activity timeline.
                            setSelectedLead({
                              id: selectedBooking._isLead ? selectedBooking.id : (selectedBooking.leadId ?? undefined),
                              _fromBookingId: selectedBooking._isLead ? undefined : selectedBooking.id,
                              firstName: selectedBooking.firstName,
                              lastName: selectedBooking.lastName,
                              email: selectedBooking.email,
                            } as any);
                            setEmailForm({ subject: `Re: Your event enquiry — ${selectedBooking.eventType || 'Event'}`, body: `Hi ${selectedBooking.firstName},\n\nThank you for your enquiry. ` });
                            setShowEmailModal(true);
                            setSelectedBooking(null);
                          }}
                          className="flex items-center gap-2 px-3 py-2 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs">
                          <Mail className="w-3 h-3" /> EMAIL
                        </button>
                      )}
                      {!['confirmed','booked','finished'].includes(selectedBooking.status) && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete enquiry from ${selectedBooking.firstName} ${selectedBooking.lastName ?? ''}? This cannot be undone.`)) {
                              deleteLead.mutate({ id: selectedBooking.id });
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-400 hover:bg-red-50 transition-colors font-bebas tracking-widest text-xs">
                          <Trash2 className="w-3 h-3" /> DELETE
                        </button>
                      )}
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
                      <button
                        onClick={async () => {
                          try {
                            const { token } = await getBeoTokenMutation.mutateAsync({ id: selectedBooking.id });
                            const url = `${window.location.origin}/api/beo/public/${token}`;
                            await navigator.clipboard.writeText(url);
                            toast.success('Live event pack link copied to clipboard');
                          } catch (e: any) { toast.error(e.message ?? 'Failed to create link'); }
                        }}
                        className="flex items-center gap-2 px-3 py-2 border border-amber-700 text-amber-700 hover:bg-amber-50 transition-colors font-bebas tracking-widest text-xs">
                        <LinkIcon className="w-3 h-3" /> COPY EVENT PACK LINK
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
                      {(venueSettings as any)?.nbiAccountId && (venueSettings as any)?.nbiVenueId && (
                        <>
                          <button
                            onClick={() => pushToNbiMutation.mutate({ id: selectedBooking.id, force: !!selectedBooking.nbiBookingId })}
                            disabled={pushToNbiMutation.isPending}
                            className={`flex items-center gap-2 px-3 py-2 transition-colors font-bebas tracking-widest text-xs col-span-2 disabled:opacity-50 ${selectedBooking.nbiBookingId ? 'border border-[#6b98e7]/50 text-[#6b98e7] hover:bg-[#6b98e7]/10' : 'bg-[#6b98e7] text-white hover:bg-[#5a87d6]'}`}>
                            <span className="font-bebas text-[10px] tracking-wider">NBI</span>
                            {pushToNbiMutation.isPending
                              ? 'PUSHING…'
                              : selectedBooking.nbiBookingId
                              ? `IN NOWBOOKIT (#${selectedBooking.nbiBookingId}) — RE-PUSH`
                              : 'PUSH TO NOWBOOKIT'}
                          </button>
                          {!selectedBooking.nbiBookingId ? (
                            <button
                              onClick={() => {
                                const ref = prompt(
                                  "If this booking already exists in NowBookIt, paste its NBI booking id (or leave blank to just mark it synced).\n\nThis stops VenueFlow from trying to push it again.",
                                  ""
                                );
                                if (ref === null) return;
                                markNbiSyncedMutation.mutate({ id: selectedBooking.id, nbiBookingId: ref || undefined });
                              }}
                              disabled={markNbiSyncedMutation.isPending}
                              className="flex items-center gap-2 px-3 py-2 border border-ink/20 text-ink/60 hover:bg-ink/5 transition-colors font-bebas tracking-widest text-xs col-span-2 disabled:opacity-50">
                              {markNbiSyncedMutation.isPending ? 'MARKING…' : 'MARK AS ALREADY SYNCED IN NBI'}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (confirm("Clear the NowBookIt sync marker for this booking? You'll be able to push it again, but if NBI already has it you may get a 409 conflict.")) {
                                  clearNbiSyncMutation.mutate({ id: selectedBooking.id });
                                }
                              }}
                              disabled={clearNbiSyncMutation.isPending}
                              className="flex items-center gap-2 px-3 py-2 border border-ink/20 text-ink/60 hover:bg-ink/5 transition-colors font-bebas tracking-widest text-xs col-span-2 disabled:opacity-50">
                              {clearNbiSyncMutation.isPending ? 'CLEARING…' : 'CLEAR NBI SYNC'}
                            </button>
                          )}
                        </>
                      )}
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
            if (!quickCreateForm.spaceName.trim()) { toast.error('Please pick an event space.'); return; }
            createEnquiryFromCalendar.mutate({
              firstName: quickCreateForm.firstName,
              lastName: quickCreateForm.lastName || undefined,
              eventType: quickCreateForm.eventType || undefined,
              eventDate: combineLocalDateTime(quickCreateDate, quickCreateForm.eventTime),
              guestCount: quickCreateForm.guestCount ? parseInt(quickCreateForm.guestCount) : undefined,
              message: quickCreateForm.notes || undefined,
              status: quickCreateForm.status,
              source: 'manual',
              spaceName: quickCreateForm.spaceName,
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Event Type</label>
                <Input value={quickCreateForm.eventType}
                  onChange={e => setQuickCreateForm(f => ({ ...f, eventType: e.target.value }))}
                  placeholder="e.g. Wedding" className="rounded-xl border-gray-200 text-sm" />
              </div>
              <div>
                <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Event Time</label>
                <Input type="time" value={quickCreateForm.eventTime}
                  onChange={e => setQuickCreateForm(f => ({ ...f, eventTime: e.target.value }))}
                  className="rounded-xl border-gray-200 text-sm" />
              </div>
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
              <label className="font-inter text-xs font-medium text-gray-500 block mb-1">Space <span className="text-red-500">*</span></label>
              {spaces && spaces.length > 0 ? (
                <Select value={quickCreateForm.spaceName} onValueChange={v => setQuickCreateForm(f => ({ ...f, spaceName: v }))}>
                  <SelectTrigger className="rounded-xl border-gray-200 text-sm"><SelectValue placeholder="Pick a space" /></SelectTrigger>
                  <SelectContent>
                    {spaces.map((s: any) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={quickCreateForm.spaceName}
                  onChange={e => setQuickCreateForm(f => ({ ...f, spaceName: e.target.value }))}
                  placeholder="e.g. Main Room — add spaces in Settings → Venue → Spaces"
                  className="rounded-xl border-gray-200 text-sm" />
              )}
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
          onImported={() => { refetchLeads(); utils.bookings.invalidate(); utils.dashboard.invalidate(); utils.leads.invalidate(); }}
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
              if (!addEnquiryForm.spaceName.trim()) { toast.error('Please pick an event space.'); return; }
              createEnquiry.mutate({
                firstName: addEnquiryForm.firstName,
                lastName: addEnquiryForm.lastName || undefined,
                email: addEnquiryForm.email || undefined,
                phone: addEnquiryForm.phone || undefined,
                company: addEnquiryForm.company || undefined,
                eventType: addEnquiryForm.eventType || undefined,
                eventDate: combineLocalDateTime(addEnquiryForm.eventDate, addEnquiryForm.eventTime),
                guestCount: addEnquiryForm.guestCount ? parseInt(addEnquiryForm.guestCount) : undefined,
                budget: addEnquiryForm.budget ? parseFloat(addEnquiryForm.budget) : undefined,
                message: addEnquiryForm.message || undefined,
                status: addEnquiryForm.status,
                source: 'manual',
                spaceName: addEnquiryForm.spaceName,
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
                  <label className="font-bebas text-xs tracking-widest text-sage block mb-1">EVENT TIME</label>
                  <Input type="time" value={addEnquiryForm.eventTime} onChange={e => setAddEnquiryForm(f => ({ ...f, eventTime: e.target.value }))}
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
                <label className="font-bebas text-xs tracking-widest text-sage block mb-1">SPACE <span className="text-red-500">*</span></label>
                {spaces && spaces.length > 0 ? (
                  <Select value={addEnquiryForm.spaceName} onValueChange={v => setAddEnquiryForm(f => ({ ...f, spaceName: v }))}>
                    <SelectTrigger className="rounded-none border border-gold/30 focus:ring-0"><SelectValue placeholder="Pick a space" /></SelectTrigger>
                    <SelectContent>
                      {spaces.map((s: any) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={addEnquiryForm.spaceName}
                    onChange={e => setAddEnquiryForm(f => ({ ...f, spaceName: e.target.value }))}
                    placeholder="e.g. Main Room — add spaces in Settings → Venue → Spaces"
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold" />
                )}
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
          // Daily Checklists is a separate route, not a tab — rendered as an
          // anchor below so mobile users can reach it without diving into More.
          { id: "checklists", label: "Checklists", icon: <CheckSquare className="w-5 h-5" />, href: "/daily-checklists" },
          { id: "tasks", label: "Tasks", icon: <CheckCircle className="w-5 h-5" /> },
          { id: "settings", label: "More", icon: <Settings className="w-5 h-5" /> },
        ].map(item => {
          const baseClass = `flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
            tab === item.id ? "text-sage-dark" : "text-gray-400"
          }`;
          if ((item as any).href) {
            return (
              <a key={item.id} href={(item as any).href} className={baseClass}>
                {item.icon}
                <span className="text-[10px] font-inter font-medium leading-none">{item.label}</span>
              </a>
            );
          }
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id as any)}
              className={baseClass}
            >
              {item.icon}
              <span className="text-[10px] font-inter font-medium leading-none">{item.label}</span>
              {item.id === "enquiries" && unreadCount > 0 && (
                <span className="absolute top-1.5 right-[calc(50%-14px)] min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
