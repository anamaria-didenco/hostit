import React from "react";
import {
  Clock, Bell, Hourglass, CornerUpLeft, Send, ArrowRight, CalendarClock,
  CircleDashed, AlertTriangle, CheckCircle2, MinusCircle, SlidersHorizontal, X,
} from "lucide-react";
import {
  enquirySignal, enquiryAction, type SignalTone, type EnquiryGroup,
} from "@shared/enquirySignal";
import { STARTER_TEMPLATES } from "@shared/starterTemplates";
import { eventFormatLabel, budgetRangeLabel } from "@shared/formFields";
import { leadDatePassed } from "@shared/followUp";
import MovedNote from "@/components/MovedNote";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronDown, Check } from "lucide-react";

// ── Filters ─────────────────────────────────────────────────────────────────
// A filter bar inside the list: event date, event type, space, party size,
// plus Unread / Date clash toggles. Tab counts follow the filters, so the
// numbers always match what you'll see.
type WhenFilter = "any" | "month" | "3m" | "later" | "nodate";
type SizeFilter = "any" | "s" | "m" | "l";
interface Filters { when: WhenFilter; types: string[]; spaces: string[]; size: SizeFilter; unread: boolean; clash: boolean }
const NO_FILTERS: Filters = { when: "any", types: [], spaces: [], size: "any", unread: false, clash: false };
const WHEN_OPTS: { id: WhenFilter; label: string }[] = [
  { id: "any", label: "Any date" }, { id: "month", label: "This month" }, { id: "3m", label: "Next 3 months" },
  { id: "later", label: "Later than 3 months" }, { id: "nodate", label: "No date yet" },
];
const SIZE_OPTS: { id: SizeFilter; label: string }[] = [
  { id: "any", label: "Any size" }, { id: "s", label: "Under 30" }, { id: "m", label: "30–80" }, { id: "l", label: "Over 80" },
];
const FILTERS_KEY = "vf.enquiryFilters.v1";

function matchesWhen(lead: any, when: WhenFilter, nowMs: number): boolean {
  if (when === "any") return true;
  if (!lead.eventDate) return when === "nodate";
  if (when === "nodate") return false;
  const t = new Date(lead.eventDate).getTime();
  const now = new Date(nowMs);
  if (when === "month") return new Date(t).getFullYear() === now.getFullYear() && new Date(t).getMonth() === now.getMonth();
  const in3m = new Date(now); in3m.setMonth(in3m.getMonth() + 3);
  if (when === "3m") return t >= now.setHours(0, 0, 0, 0) && t < in3m.getTime();
  return t >= in3m.getTime();
}
function matchesSize(lead: any, size: SizeFilter): boolean {
  if (size === "any") return true;
  const g = Number(lead.guestCount) || 0;
  if (!g) return false;
  return size === "s" ? g < 30 : size === "m" ? g >= 30 && g <= 80 : g > 80;
}

/** Distinct values of a lead field, most common first, with counts. */
function optionsOf(leads: any[], key: string): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const l of leads) { const v = String(l?.[key] ?? "").trim(); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
  return Array.from(m, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** A filter pill that opens a small menu. Blue when it's narrowing the list. */
function FilterPill({ label, active, children }: { label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button"
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-[6px] border-[1.5px] font-sans text-[13px] font-semibold whitespace-nowrap transition-colors ${active ? "border-primary bg-accent text-primary" : "border-input bg-card text-foreground hover:border-primary"}`}>
          {label}<ChevronDown className="w-3.5 h-3.5 opacity-70" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-60 p-1.5 bg-card border border-border shadow-lg">
        {children}
      </PopoverContent>
    </Popover>
  );
}
function MenuOption({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick}
      className="w-full flex items-center gap-2 px-2 h-9 rounded-[4px] text-left font-sans text-[13px] text-foreground hover:bg-accent">
      <span className={`w-4 h-4 rounded-[4px] border-[1.5px] flex items-center justify-center flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
        {on && <Check className="w-3 h-3" strokeWidth={3} aria-hidden />}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count != null && <span className="text-[12px] text-muted-foreground">{count}</span>}
    </button>
  );
}

/**
 * The Option-C enquiries list: one signal-first list where every row leads with
 * what the enquiry needs from you (a toned chip — "Waiting 2d 1h", "Follow-up
 * overdue", "Gone quiet"), sorted so the most urgent rises to the top, with a
 * context-aware action (Reply / Nudge / Open) and an inline quick-reply.
 */

type ReplyStatus = Map<number, { direction: string; at: Date }>;

export interface EnquiryListCProps {
  leads: any[];
  nowMs: number;
  venueName: string;
  replyStatus: ReplyStatus;
  clashMap?: Record<number, any[]>;
  isPartial: (lead: any) => boolean;
  statusInfo: (status: string | null | undefined) => { label: string; dot: string };
  onOpen: (lead: any) => void;
  onSend: (args: { lead: any; subject: string; body: string }) => void;
  sending?: boolean;
  isStaff?: boolean;
  /** Reports the ids in the order shown, so the drawer can page prev/next. */
  onRowsChange?: (ids: number[]) => void;
  /** Close enquiries whose event date has passed (marks them Lost). */
  onCloseAsLost?: (ids: number[]) => void;
  closing?: boolean;
  /** Enquiries whose status was just changed — kept in place with a "Moved to
      … · Undo" note instead of vanishing from the tab they no longer match. */
  movedRows?: Record<number, { from: string; to: string; at: number }>;
  onUndoMove?: (id: number) => void;
  undoPendingId?: number | null;
  /** The enquiry open in the drawer, highlighted in the list. */
  selectedId?: number | null;
}

const TONE: Record<SignalTone, { fg: string; bg: string }> = {
  red: { fg: "#c0392b", bg: "#fbecea" },
  amber: { fg: "#8a5f18", bg: "#f7efdd" },
  blue: { fg: "#2f5488", bg: "#e8edf6" },
  green: { fg: "#3f7350", bg: "#e8f0e6" },
  gray: { fg: "#6a6256", bg: "#f4efe6" },
};

/** How the list is ordered. "urgent" is the signal order (default). */
type SortKey = "urgent" | "newest" | "oldest" | "event";
const SORTS: { id: SortKey; label: string; note: string }[] = [
  { id: "urgent", label: "Most urgent", note: "" },
  { id: "newest", label: "Came in: newest first", note: "Newest enquiries first" },
  { id: "oldest", label: "Came in: oldest first", note: "Oldest enquiries first" },
  { id: "event", label: "Event date: soonest", note: "Soonest event first" },
];

/** Section heads for the "Most urgent" order: rows are grouped by the tone of
 *  their signal, so urgency is said once per group instead of once per row. */
const TONE_ORDER: SignalTone[] = ["red", "amber", "blue", "green", "gray"];
const TONE_TITLE: Record<SignalTone, string> = {
  red: "Overdue", amber: "Needs attention", blue: "In progress", green: "Confirmed", gray: "Other",
};

const DAY_MS = 86_400_000;
/** How far off the event is: "today", "in 5 days", "in 16 wks", "in 14 mths". */
function untilLabel(d: Date, nowMs: number): string | null {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(nowMs); b.setHours(0, 0, 0, 0);
  const days = Math.round((a.getTime() - b.getTime()) / DAY_MS);
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 120) return `in ${Math.round(days / 7)} wks`;
  return `in ${Math.round(days / 30.4)} mths`;
}

function initials(lead: any): string {
  return `${(lead.firstName ?? "").trim().charAt(0)}${(lead.lastName ?? "").trim().charAt(0)}`.toUpperCase() || "?";
}

/** When the enquiry came in, in venue time: "Mon 2 Nov, 9:14am". */
function fmtCameIn(value: unknown): string {
  const d = value ? new Date(value as any) : null;
  if (!d || isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

const ICON: Record<string, React.ComponentType<any>> = {
  "circle-check": CheckCircle2, "circle-minus": MinusCircle, "circle-dashed": CircleDashed,
  "corner-up-left": CornerUpLeft, clock: Clock, bell: Bell, hourglass: Hourglass,
  "calendar-clock": CalendarClock, "triangle-alert": AlertTriangle, "arrow-right": ArrowRight,
  send: Send,
};
function Icon({ name, size = 13 }: { name: string; size?: number }) {
  const C = ICON[name] ?? ArrowRight;
  return <C style={{ width: size, height: size }} strokeWidth={2.2} aria-hidden />;
}

type ListTab = EnquiryGroup | "all" | "passed";

const TABS: { id: ListTab; label: string }[] = [
  { id: "reply", label: "Needs reply" },
  { id: "followup", label: "Follow-up due" },
  { id: "confirmed", label: "Confirmed" },
  { id: "all", label: "All" },
  // Only shown when there's something in it.
  { id: "passed", label: "Date passed" },
];

// "Sat, 27 Nov" this year; "Sat, 27 Nov 2027" otherwise — a date without its
// year is ambiguous once enquiries run into next year.
function fmtListDate(d: Date, nowMs: number): string {
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Resolve the simple placeholders a quick reply can fill client-side; leave
 *  anything needing a link as a readable bracketed cue for the sender. */
function resolveTemplate(text: string, lead: any, venueName: string): string {
  const eventDate = lead.eventDate
    ? new Date(lead.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })
    : "your date";
  return text
    .replace(/\{\{firstName\}\}/g, lead.firstName || "there")
    .replace(/\{\{venueName\}\}/g, venueName || "the venue")
    .replace(/\{\{eventDate\}\}/g, eventDate)
    .replace(/\{\{proposalLink\}\}/g, "[your proposal link]")
    .replace(/\{\{portalLink\}\}/g, "[your booking link]")
    .replace(/\{\{holdUntil\}\}/g, "[hold date]")
    .replace(/\{\{depositAmount\}\}/g, "[deposit]")
    .replace(/\{\{enquiryFormLink\}\}/g, "[enquiry form]")
    .replace(/\{\{alternativeDates\}\}/g, "[alternative dates]")
    .replace(/\{\{[^}]+\}\}/g, "");
}

// Quick-reply chips: the link-free, most-common replies, matched to the row's
// intent. The full template set (with proposal/portal links) lives in the
// composer behind "Open enquiry".
const QUICK_FOR: Record<string, string[]> = {
  reply: ["First reply: date available", "Checking in"],
  followup: ["Proposal follow-up", "Checking in"],
};

// Only say something when there is something to say: "No budget given" on
// every row was noise.
function moneyRange(lead: any): string {
  const b = budgetRangeLabel(lead.budgetRange);
  return b ? `Budget ${b}` : "";
}

export default function EnquiryListC(props: EnquiryListCProps) {
  const { leads, nowMs, venueName, replyStatus, clashMap, isPartial, statusInfo, onOpen, onSend, sending, onCloseAsLost, closing, movedRows, onUndoMove, undoPendingId, selectedId } = props;
  // null = not chosen yet: open on the first tab that has something in it,
  // rather than an empty "Needs reply 0" while follow-ups are due.
  const [pickedTab, setTab] = React.useState<ListTab | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [replyId, setReplyId] = React.useState<number | null>(null);
  // Order the list by when enquiries came in, or by event date, so it's easy to
  // see who to follow up on first. "urgent" keeps the signal-first order.
  const [sortBy, setSortBy] = React.useState<SortKey>("urgent");
  const [tplName, setTplName] = React.useState<string>("");
  const [draft, setDraft] = React.useState("");
  // A just-moved row keeps its place in the tab it was moved from, even though
  // its new status no longer matches it. We remember which tab each move was
  // pinned to; the pin drops when the parent clears the mark (undo, or a
  // search/filter change) so it doesn't leak into other tabs.
  const [pinnedMoves, setPinnedMoves] = React.useState<Map<number, ListTab>>(new Map());

  const enriched = React.useMemo(() => leads.map((lead) => {
    const id = lead.id as number;
    const rs = replyStatus.get(id);
    const signal = enquirySignal(lead, {
      nowMs,
      partial: isPartial(lead),
      clientRepliedAtMs: rs?.direction === "in" ? rs.at.getTime() : null,
      hasClash: (clashMap?.[id]?.length ?? 0) > 0,
      holdUntilMs: lead.holdUntil ? new Date(lead.holdUntil).getTime() : null,
      eventDateMs: lead.eventDate ? new Date(lead.eventDate).getTime() : null,
    });
    return { lead, signal };
  }), [leads, nowMs, replyStatus, clashMap, isPartial]);

  // Filters — remembered between visits on this device.
  const [filters, setFiltersRaw] = React.useState<Filters>(() => {
    try { return { ...NO_FILTERS, ...JSON.parse(localStorage.getItem(FILTERS_KEY) ?? "{}") }; } catch { return NO_FILTERS; }
  });
  const setFilters = (f: Filters) => {
    setFiltersRaw(f);
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)); } catch { /* private mode */ }
  };
  const typeOpts = React.useMemo(() => optionsOf(leads, "eventType"), [leads]);
  const spaceOpts = React.useMemo(() => optionsOf(leads, "spaceName"), [leads]);
  const activeFilters = (filters.when !== "any" ? 1 : 0) + (filters.size !== "any" ? 1 : 0)
    + (filters.types.length ? 1 : 0) + (filters.spaces.length ? 1 : 0) + (filters.unread ? 1 : 0) + (filters.clash ? 1 : 0);
  const toggleIn = (list: string[], v: string) => list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const pillLabel = (base: string, picked: string[]) =>
    picked.length === 0 ? base : picked.length === 1 ? picked[0] : `${picked[0]} +${picked.length - 1}`;

  const filtered = React.useMemo(() => enriched.filter(({ lead }) =>
    matchesWhen(lead, filters.when, nowMs)
    && matchesSize(lead, filters.size)
    && (!filters.types.length || filters.types.includes(String(lead.eventType ?? "").trim()))
    && (!filters.spaces.length || filters.spaces.includes(String(lead.spaceName ?? "").trim()))
    && (!filters.unread || (lead.status === "new" && !lead.readAt))
    && (!filters.clash || (clashMap?.[lead.id]?.length ?? 0) > 0),
  ), [enriched, filters, nowMs, clashMap]);

  const isPassed = React.useCallback((lead: any) => leadDatePassed(lead, nowMs), [nowMs]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { reply: 0, followup: 0, confirmed: 0, all: 0, passed: 0, overdue: 0 };
    for (const { lead, signal } of filtered) {
      if (signal.group !== "closed") c.all++;
      if (signal.group in c) c[signal.group]++;
      if (signal.group === "followup" && signal.tone === "red") c.overdue++;
      // Not the ones a client has just written to: those need a reply first.
      if (signal.group === "progress" && isPassed(lead)) c.passed++;
    }
    return c;
  }, [filtered, isPassed]);

  const defaultTab: ListTab = counts.reply ? "reply" : counts.followup ? "followup" : "all";
  const tab: ListTab = pickedTab ?? defaultTab;
  // Settle the opening tab once the list has loaded, so a refetch (a reply
  // sent, a new enquiry in) doesn't flip the view under you.
  React.useEffect(() => {
    if (pickedTab === null && enriched.length > 0) setTab(defaultTab);
  }, [pickedTab, enriched.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track which tab each moved row is pinned to, and drop pins the parent has
  // cleared (undo, or a search/filter change empties movedRows).
  React.useEffect(() => {
    const moved = movedRows ?? {};
    setPinnedMoves((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const id of next.keys()) if (!(id in moved)) { next.delete(id); changed = true; }
      for (const key of Object.keys(moved)) {
        const id = Number(key);
        if (!next.has(id)) { next.set(id, tab); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [movedRows, tab]);

  const rows = React.useMemo(() => {
    const picked = filtered.filter(({ lead, signal }) =>
      pinnedMoves.get(lead.id) === tab ? true
      : tab === "passed" ? signal.group === "progress" && isPassed(lead)
      : tab === "all" ? signal.group !== "closed" : signal.group === tab);
    const cameIn = (l: any) => new Date(l.createdAt).getTime() || 0;
    const eventAt = (l: any) => (l.eventDate ? new Date(l.eventDate).getTime() : Infinity);
    if (sortBy === "newest") return picked.sort((a, b) => cameIn(b.lead) - cameIn(a.lead));
    if (sortBy === "oldest") return picked.sort((a, b) => cameIn(a.lead) - cameIn(b.lead));
    if (sortBy === "event") return picked.sort((a, b) => eventAt(a.lead) - eventAt(b.lead));
    // Most urgent: by tone first (red, amber, …) so rows of a kind sit together
    // under one section head, then by the signal's own urgency within it.
    const rank = (t: SignalTone) => TONE_ORDER.indexOf(t);
    return picked.sort((a, b) => rank(a.signal.tone) - rank(b.signal.tone) || b.signal.sortKey - a.signal.sortKey);
  }, [filtered, tab, isPassed, pinnedMoves, sortBy]);

  const grouped = sortBy === "urgent" && new Set(rows.map((r) => r.signal.tone)).size > 1;

  // Leaving the "Date passed" tab (or emptying it) cancels a pending confirm.
  React.useEffect(() => { setConfirmClose(false); }, [tab, counts.passed]);

  const { onRowsChange } = props;
  const orderKey = rows.map((r) => r.lead.id).join(",");
  React.useEffect(() => {
    onRowsChange?.(rows.map((r) => r.lead.id));
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = tab === "reply" ? `${counts.reply} waiting on you · longest first`
    : tab === "followup" ? "Quoted or gone quiet · most overdue first"
    : tab === "confirmed" ? "Booked in · soonest event first"
    : tab === "passed" ? "Still open, but the event date has gone by"
    : `${counts.all} enquiries`;
  const emptyText = tab === "reply" ? "Nobody is waiting on a reply."
    : tab === "followup" ? "No follow-ups due. Everyone's been looked after."
    : tab === "passed" ? "No enquiries left open past their date."
    : "Nothing here.";

  const startReply = (lead: any) => {
    const names = QUICK_FOR[enquirySignal(lead, { nowMs }).group] ?? [];
    const tpl = STARTER_TEMPLATES.find((t) => t.name === names[0]) ?? STARTER_TEMPLATES[0];
    setReplyId(lead.id);
    setTplName(tpl.name);
    setDraft(resolveTemplate(tpl.body, lead, venueName));
  };

  const doSend = (lead: any) => {
    if (!draft.trim()) return;
    const tpl = STARTER_TEMPLATES.find((t) => t.name === tplName) ?? STARTER_TEMPLATES[0];
    onSend({ lead, subject: resolveTemplate(tpl.subject, lead, venueName), body: draft });
    setReplyId(null); setDraft("");
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="px-4 md:px-6 pt-4 pb-10 flex flex-col gap-3.5">
        {/* Summary strip — the four numbers that say where the pipeline
            stands; each one jumps to its tab. Confirmed is the headline cell. */}
        <div className="grid grid-cols-2 md:grid-cols-4 rounded-[8px] border-[1.5px] border-border bg-card overflow-hidden">
          {([
            { id: "reply" as ListTab, label: "Needs reply", n: counts.reply,
              note: counts.reply ? "waiting on you" : "Inbox clear", noteColor: counts.reply ? "#c0392b" : "#3f7350" },
            { id: "followup" as ListTab, label: "Follow-ups due", n: counts.followup,
              note: counts.overdue ? `${counts.overdue} overdue` : "none overdue", noteColor: counts.overdue ? "#c0392b" : undefined },
            { id: "all" as ListTab, label: "Open enquiries", n: counts.all, note: "not yet booked or closed" },
            { id: "confirmed" as ListTab, label: "Confirmed", n: counts.confirmed, note: "booked in", inv: true },
          ]).map((c, i) => (
            <button key={c.id} type="button" onClick={() => { setTab(c.id); setReplyId(null); }}
              aria-label={`${c.label}: ${c.n}. Show these.`}
              className={`text-left px-4 py-3 flex flex-col gap-0.5 transition-colors ${c.inv ? "bg-primary text-primary-foreground hover:brightness-110" : "hover:bg-accent/60"} ${i % 2 === 0 ? "border-r-[1.5px] border-border" : "md:border-r-[1.5px] md:border-border"} ${i < 2 ? "border-b-[1.5px] border-border md:border-b-0" : ""} ${i === 3 ? "md:border-r-0" : ""}`}>
              <span className={`font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] ${c.inv ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{c.label}</span>
              <span className="font-sans text-[26px] leading-tight font-semibold">{c.n}</span>
              <span className={`font-sans text-[12px] font-semibold ${c.inv ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                style={!c.inv && c.noteColor ? { color: c.noteColor } : undefined}>{c.note}</span>
            </button>
          ))}
        </div>

        {/* View tabs */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          {/* One line of tabs that scrolls sideways on a phone, rather than
              wrapping "Follow-up due" and cutting off "Date passed". */}
          <div className="flex items-center gap-1 border-b border-border/60 -mb-px max-w-full overflow-x-auto">
            {TABS.filter((t) => t.id !== "passed" || counts.passed > 0 || tab === "passed").map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} onClick={() => { setTab(t.id); setReplyId(null); }}
                  aria-pressed={on}
                  className={`relative px-3 py-2 font-sans text-sm font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 ${on ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
                  {t.label}
                  {/* Full-strength muted ink: the /70 count was 2.9:1, under AA. */}
                  <span className={`ml-1.5 text-xs font-bold ${on ? "text-primary" : "text-muted-foreground"}`}>{counts[t.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Filter bar — one row of pills; scrolls sideways on a phone. */}
        <div className="flex items-center gap-2 max-w-full overflow-x-auto pb-0.5" role="group" aria-label="Filter enquiries">
          <FilterPill label={WHEN_OPTS.find((o) => o.id === filters.when)!.label} active={filters.when !== "any"}>
            {WHEN_OPTS.map((o) => (
              <MenuOption key={o.id} label={o.label} on={filters.when === o.id} onClick={() => setFilters({ ...filters, when: o.id })} />
            ))}
          </FilterPill>
          {typeOpts.length > 0 && (
            <FilterPill label={pillLabel("Event type", filters.types)} active={filters.types.length > 0}>
              <div className="max-h-72 overflow-y-auto">
                {typeOpts.map((o) => (
                  <MenuOption key={o.value} label={o.value} count={o.count} on={filters.types.includes(o.value)}
                    onClick={() => setFilters({ ...filters, types: toggleIn(filters.types, o.value) })} />
                ))}
              </div>
            </FilterPill>
          )}
          {spaceOpts.length > 0 && (
            <FilterPill label={pillLabel("Space", filters.spaces)} active={filters.spaces.length > 0}>
              {spaceOpts.map((o) => (
                <MenuOption key={o.value} label={o.value} count={o.count} on={filters.spaces.includes(o.value)}
                  onClick={() => setFilters({ ...filters, spaces: toggleIn(filters.spaces, o.value) })} />
              ))}
            </FilterPill>
          )}
          <FilterPill label={filters.size === "any" ? "Guests" : `${SIZE_OPTS.find((o) => o.id === filters.size)!.label} guests`} active={filters.size !== "any"}>
            {SIZE_OPTS.map((o) => (
              <MenuOption key={o.id} label={o.label} on={filters.size === o.id} onClick={() => setFilters({ ...filters, size: o.id })} />
            ))}
          </FilterPill>
          <span className="w-px h-6 bg-border flex-shrink-0" aria-hidden />
          {([["unread", "Unread"], ["clash", "Date clash"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filters[k]} onClick={() => setFilters({ ...filters, [k]: !filters[k] })}
              className={`h-9 px-3 rounded-full border-[1.5px] font-sans text-[13px] font-semibold whitespace-nowrap transition-colors ${filters[k] ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-primary"}`}>
              {label}
            </button>
          ))}
          {activeFilters > 0 && (
            <button type="button" onClick={() => setFilters(NO_FILTERS)}
              className="h-9 px-2 font-sans text-[13px] font-semibold text-primary underline-offset-2 hover:underline whitespace-nowrap">
              Clear {activeFilters === 1 ? "filter" : `all ${activeFilters}`}
            </button>
          )}
        </div>

        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap -mt-1">
            <div className="font-sans text-[13px] text-muted-foreground">
              {activeFilters > 0
                ? `Showing ${rows.length} of ${enriched.filter(({ lead, signal }) => tab === "all" ? signal.group !== "closed" : tab === "passed" ? signal.group === "progress" && isPassed(lead) : signal.group === tab).length} · filtered`
                : sortBy === "urgent" ? summary : SORTS.find((s) => s.id === sortBy)?.note}
            </div>
            <label className="inline-flex items-center gap-2 font-sans text-[13px] text-muted-foreground">
              Sort by
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="h-8 rounded-[6px] border-[1.5px] border-input bg-card px-2 font-sans text-[13px] font-semibold text-foreground">
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* Close the lot in one go: they can't be won any more. */}
        {tab === "passed" && rows.length > 0 && onCloseAsLost && !props.isStaff && (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-[6px] border border-border bg-card px-3.5 py-2.5">
            <p className="font-sans text-[13px] text-foreground">
              {rows.length === 1 ? "1 enquiry" : `${rows.length} enquiries`} can't go ahead on the date asked. Close {rows.length === 1 ? "it" : "them"} as Lost to keep the pipeline honest.
            </p>
            {confirmClose ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setConfirmClose(false)} className="h-9 px-3 rounded-[6px] font-sans text-[13px] font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
                <button disabled={closing} onClick={() => onCloseAsLost(rows.map((r) => r.lead.id))}
                  className="h-9 px-3 rounded-[6px] font-sans text-[13px] font-bold text-white bg-primary disabled:opacity-50">
                  {closing ? "Closing…" : `Yes, close ${rows.length}`}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmClose(true)}
                className="h-9 px-3 rounded-[6px] font-sans text-[13px] font-bold border-[1.5px] border-input bg-card text-foreground hover:border-primary">
                Close {rows.length === 1 ? "it" : `all ${rows.length}`} as Lost
              </button>
            )}
          </div>
        )}

        {/* Rows */}
        <div className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <div className="py-12 text-center font-sans text-sm text-muted-foreground">
              {activeFilters > 0 ? (
                <>Nothing matches these filters.{" "}
                  <button type="button" onClick={() => setFilters(NO_FILTERS)} className="font-semibold text-primary hover:underline">Clear filters</button>
                </>
              ) : emptyText}
            </div>
          ) : rows.map(({ lead, signal }, idx) => {
            const tone = TONE[signal.tone];
            // A section head where the tone changes, in the "Most urgent" order
            // only, and only when the tab holds more than one kind of row.
            const showHead = grouped && (idx === 0 || rows[idx - 1].signal.tone !== signal.tone);
            const groupCount = showHead ? rows.filter((r) => r.signal.tone === signal.tone).length : 0;
            const selected = selectedId === lead.id;
            const action = enquiryAction(signal.group);
            const si = statusInfo(lead.status);
            const replying = replyId === lead.id;
            const dateClash = (clashMap?.[lead.id]?.length ?? 0) > 0;
            const dateStr = lead.eventDate
              ? fmtListDate(new Date(lead.eventDate), nowMs)
              : (lead as any).dateFlexible ? "Date TBC" : "No date";
            const whenStr = [
              lead.eventDate ? new Date(lead.eventDate).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" }) : null,
              lead.eventDate ? untilLabel(new Date(lead.eventDate), nowMs) : null,
              lead.guestCount ? `${lead.guestCount} guests` : null,
              dateClash ? "date clash" : null,
            ].filter(Boolean).join(" · ");
            const sub = [lead.company, lead.eventType, eventFormatLabel((lead as any).eventFormat)].filter(Boolean).join(" · ");
            const onAction = (e: React.MouseEvent) => {
              e.stopPropagation();
              if (action.reply) { replying ? setReplyId(null) : startReply(lead); } else onOpen(lead);
            };

            const unread = lead.status === "new" && !lead.readAt;

            return (
              <React.Fragment key={lead.id}>
              {showHead && (
                <div className={`flex items-center gap-3 ${idx === 0 ? "" : "mt-4"}`}>
                  <h2 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] flex-shrink-0" style={{ color: tone.fg }}>{TONE_TITLE[signal.tone]}</h2>
                  <span className="h-[1.5px] flex-1" style={{ background: signal.tone === "red" ? tone.fg : "var(--border)" }} />
                  <span className="font-sans text-[12px] text-muted-foreground flex-shrink-0">{groupCount}</span>
                </div>
              )}
              {/* White rows: urgency is the dot + label in the first column and
                  the section head above, not a fill on every row. The open
                  enquiry (or one being replied to) is tinted blue. */}
              <div className="rounded-[8px] overflow-hidden border-[1.5px] transition-shadow hover:shadow-md"
                style={{ background: selected || replying ? "var(--accent)" : "var(--card)", borderColor: selected || replying ? "var(--primary)" : "var(--border)" }}>
                {/* Desktop: one dense signal-first row */}
                <div onClick={() => onOpen(lead)} role="button" tabIndex={0}
                  aria-current={selected ? "true" : undefined}
                  onKeyDown={(e) => { if (e.key === "Enter") onOpen(lead); }}
                  className="hidden md:grid gap-4 items-center px-4 py-3 cursor-pointer md:grid-cols-[150px_minmax(0,1.6fr)_minmax(0,1fr)_104px] lg:grid-cols-[150px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_104px]">
                  {/* Fixed-width signal and action columns, so the name and date
                      columns line up from row to row whatever the signal says. */}
                  <div className="min-w-0 flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1.5 font-sans text-[13px] font-bold whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: tone.fg }}>
                      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: tone.fg }} aria-hidden />{signal.text}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-sans text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: si.dot }} aria-hidden />{si.label}
                    </span>
                  </div>
                  <div className="min-w-0 flex items-center gap-3">
                    <span aria-hidden className="w-[34px] h-[34px] rounded-full flex-shrink-0 flex items-center justify-center font-sans text-[12px] font-bold"
                      style={{ background: selected ? "var(--card)" : "var(--accent)", color: "var(--primary)" }}>{initials(lead)}</span>
                    <div className="min-w-0">
                      <div className={`font-sans text-[15px] truncate text-foreground ${unread ? "font-bold" : "font-semibold"}`}>{lead.firstName} {lead.lastName}</div>
                      {sub && <div className="font-sans text-[13px] text-muted-foreground truncate mt-0.5">{sub}</div>}
                      <div className="font-sans text-[12px] text-muted-foreground mt-0.5 whitespace-nowrap">Came in {fmtCameIn(lead.createdAt)}</div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-sans text-[14px] font-semibold whitespace-nowrap" style={{ color: dateClash ? "#c0392b" : !lead.eventDate ? "#8a5f18" : "var(--foreground)" }}>{dateStr}</div>
                    {whenStr && <div className="font-sans text-[13px] text-muted-foreground truncate mt-0.5">{whenStr}</div>}
                  </div>
                  <div className="min-w-0 hidden lg:block">
                    <div className="font-sans text-[13px] text-muted-foreground whitespace-nowrap">{moneyRange(lead)}</div>
                  </div>
                  <button onClick={onAction}
                    className="inline-flex items-center justify-center gap-1.5 h-9 w-full px-3 rounded-[6px] font-sans text-[13px] font-bold whitespace-nowrap border-[1.5px] transition-colors hover:border-primary"
                    style={action.primary
                      ? { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff" }
                      : { background: "var(--card)", borderColor: "var(--input)", color: "var(--foreground)" }}>
                    <Icon name={action.icon} size={14} />{action.label}
                  </button>
                </div>

                {/* Mobile: a stacked card — signal + budget, then name, sub, then date + action */}
                <div className="md:hidden">
                  <div onClick={() => onOpen(lead)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") onOpen(lead); }}
                    className="px-3.5 pt-3 pb-2.5 cursor-pointer">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-sans text-[13px] font-bold whitespace-nowrap overflow-hidden text-ellipsis min-w-0" style={{ color: tone.fg }}>
                        <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: tone.fg }} aria-hidden />{signal.text}
                      </span>
                      <span className="font-sans text-[12px] text-muted-foreground whitespace-nowrap flex-shrink-0">{budgetRangeLabel(lead.budgetRange) ?? ""}</span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2 min-w-0">
                      <span className={`font-sans text-[18px] truncate text-foreground ${unread ? "font-bold" : "font-semibold"}`}>{lead.firstName} {lead.lastName}</span>
                      <span className="inline-flex items-center gap-1.5 font-sans text-[12px] font-semibold whitespace-nowrap flex-shrink-0 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: si.dot }} />{si.label}
                      </span>
                    </div>
                    {sub && <div className="font-sans text-[13.5px] text-muted-foreground truncate mt-0.5">{sub}</div>}
                    <div className="font-sans text-[12.5px] text-muted-foreground mt-0.5">Came in {fmtCameIn(lead.createdAt)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2.5 px-3.5 pb-2.5 pt-2 border-t border-border">
                    <div onClick={() => onOpen(lead)} className="min-w-0 cursor-pointer">
                      <div className="font-sans text-[15px] font-semibold whitespace-nowrap" style={{ color: dateClash ? "#c0392b" : !lead.eventDate ? "#8a5f18" : "var(--foreground)" }}>{dateStr}</div>
                      {whenStr && <div className="font-sans text-[12px] text-muted-foreground truncate">{whenStr}</div>}
                    </div>
                    <button onClick={onAction}
                      className="inline-flex items-center gap-1.5 h-11 px-4 rounded-[6px] font-sans text-[14px] font-bold whitespace-nowrap border-[1.5px] flex-shrink-0"
                      style={action.primary
                        ? { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff" }
                        : { background: "var(--card)", borderColor: "var(--input)", color: "var(--foreground)" }}>
                      <Icon name={action.icon} size={16} />{action.label}
                    </button>
                  </div>
                </div>

                {/* "Moved to … · Undo" — shown in place of the row vanishing
                    after its status was changed from the drawer. */}
                {movedRows?.[lead.id] && (
                  <div className="px-3.5 pb-2.5" onClick={(e) => e.stopPropagation()}>
                    <MovedNote toLabel={statusInfo(movedRows[lead.id].to).label}
                      onUndo={() => onUndoMove?.(lead.id)} busy={undoPendingId === lead.id} />
                  </div>
                )}

                {/* Inline quick reply */}
                {replying && (
                  <div className="border-t border-border px-3.5 pt-3 pb-3.5" style={{ background: "var(--card)" }}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground mr-1">Quick reply to {lead.firstName}</span>
                      {(QUICK_FOR[signal.group] ?? []).map((name) => {
                        const on = tplName === name;
                        const tpl = STARTER_TEMPLATES.find((t) => t.name === name);
                        if (!tpl) return null;
                        return (
                          <button key={name} onClick={() => { setTplName(name); setDraft(resolveTemplate(tpl.body, lead, venueName)); }}
                            className="h-[26px] px-2.5 rounded-[4px] font-sans text-[12px] font-semibold border-[1.5px] transition-colors"
                            style={on ? { background: "var(--accent)", borderColor: "var(--primary)", color: "var(--primary)" } : { background: "var(--card)", borderColor: "var(--input)", color: "var(--foreground)" }}>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6}
                      className="w-full resize-y rounded-[4px] border-[1.5px] px-3 py-2.5 font-sans text-[13px] leading-relaxed outline-none focus:border-primary"
                      style={{ borderColor: "var(--input)", background: "var(--card)", color: "var(--foreground)" }} />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button onClick={() => setReplyId(null)} className="h-[30px] px-3 rounded-[4px] font-sans text-[12px] font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
                      <button onClick={() => onOpen(lead)} className="h-[30px] px-3 rounded-[4px] font-sans text-[12px] font-semibold border-[1.5px]" style={{ borderColor: "var(--input)", background: "var(--card)", color: "var(--foreground)" }}>Open enquiry</button>
                      <button onClick={() => doSend(lead)} disabled={sending || !draft.trim()}
                        className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[4px] font-sans text-[12px] font-bold disabled:opacity-50"
                        style={{ background: "var(--primary)", color: "#fff" }}>
                        <Send style={{ width: 14, height: 14 }} />{sending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
