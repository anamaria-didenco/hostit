import React from "react";
import {
  Clock, Bell, Hourglass, CornerUpLeft, Send, ArrowRight, CalendarClock,
  CircleDashed, AlertTriangle, CheckCircle2, MinusCircle, SlidersHorizontal, X,
} from "lucide-react";
import { enquiryAction, type SignalTone } from "@shared/enquirySignal";
import {
  EMPTY_FILTERS, SORT_OPTIONS, VIEWS, activeCount, isSearching, effectiveView, listRows, sortToParam, sortFromParam, viewCounts, viewInfo,
  type EnquiryFilters, type EnquiryView, type ListCtx, type ListRow, type ListSort, type ListState,
} from "@shared/enquiryFilters";
import { STARTER_TEMPLATES } from "@shared/starterTemplates";
import { eventFormatLabel, budgetRangeLabel } from "@shared/formFields";
import { leadDatePassed } from "@shared/followUp";
import MovedNote from "@/components/MovedNote";
import { useFocusKeeper } from "@/hooks/useFocusKeeper";

/**
 * The Enquiries list: six views (Needs reply, Follow-up due, Open, Confirmed,
 * Closed, All), each row leading with what the enquiry needs from you, sorted
 * so the most urgent rises to the top, with Reply / Nudge and an inline quick
 * reply. The rows, counts, filters and sort all come from
 * shared/enquiryFilters.ts; the state lives in useEnquiryListState.
 */

export interface EnquiryListCProps {
  /** Every enquiry, already enriched (enrichRows). */
  rows: ListRow[];
  ctx: ListCtx;
  /** The enquiries have loaded (an empty list means "none", not "not yet"). */
  loaded?: boolean;
  state: ListState;
  onViewChange: (v: EnquiryView) => void;
  onFiltersChange: (f: EnquiryFilters | ((f: EnquiryFilters) => EnquiryFilters)) => void;
  onSortChange: (s: ListSort) => void;
  venueName: string;
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
      … · Undo" note instead of vanishing from the view they no longer match. */
  movedRows?: Record<number, { from: string; to: string; at: number }>;
  onUndoMove?: (id: number) => void;
  undoPendingId?: number | null;
}

const TONE: Record<SignalTone, { fg: string; bg: string }> = {
  red: { fg: "#c0392b", bg: "#fbecea" },
  amber: { fg: "#8a5f18", bg: "#f7efdd" },
  blue: { fg: "#2f5488", bg: "#e8edf6" },
  green: { fg: "#3f7350", bg: "#e8f0e6" },
  gray: { fg: "#6a6256", bg: "#f4efe6" },
};

const HEX = /^#[0-9a-f]{6}$/i;
/** A status colour (#rrggbb) at a given alpha, for a light fill. Falls back to
 *  transparent if the venue's swatch isn't a plain hex value. */
function tint(hex: string, alpha: string): string {
  return HEX.test(hex) ? `${hex}${alpha}` : "transparent";
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
  const { rows: allRows, ctx, state, venueName, statusInfo, onOpen, onSend, sending, onCloseAsLost, closing, movedRows, onUndoMove, undoPendingId } = props;
  const nowMs = ctx.nowMs;
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [replyId, setReplyId] = React.useState<number | null>(null);
  const [tplName, setTplName] = React.useState<string>("");
  const [draft, setDraft] = React.useState("");
  // Opening a quick reply brings it into view and, when it was opened from the
  // keyboard, puts the cursor in the reply box. A click or tap leaves focus on
  // Reply, as before.
  const replyPanelRef = React.useRef<HTMLDivElement>(null);
  const replyBoxRef = React.useRef<HTMLTextAreaElement>(null);
  const focusReplyBox = React.useRef(false);
  React.useEffect(() => {
    if (replyId == null) return;
    replyPanelRef.current?.scrollIntoView({ block: "nearest" });
    if (focusReplyBox.current) replyBoxRef.current?.focus({ preventScroll: true });
    focusReplyBox.current = false;
  }, [replyId]);

  const searching = isSearching(state);
  const view = effectiveView(state);
  const filtered = searching || activeCount(state.filters) > 0;
  // The list as shown right now: a key for "the same list".
  const listKey = `${view}|${JSON.stringify(state.filters)}|${state.q.trim()}`;
  // A just-moved row keeps its place in the list it was moved from, even though
  // its new status no longer matches it. The pin drops when the parent clears
  // the mark (undo, or any view / filter / search change).
  const [pinnedMoves, setPinnedMoves] = React.useState<Map<number, string>>(new Map());
  React.useEffect(() => {
    const moved = movedRows ?? {};
    setPinnedMoves((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const id of next.keys()) if (!(id in moved)) { next.delete(id); changed = true; }
      for (const key of Object.keys(moved)) {
        const id = Number(key);
        if (!next.has(id)) { next.set(id, listKey); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [movedRows, listKey]);

  const counts = React.useMemo(() => viewCounts(allRows, state.filters, state.q, ctx), [allRows, state.filters, state.q, ctx]);
  // An unsent quick reply is never hidden by a filter change: its row stays.
  const keepReply = replyId != null && draft.trim() ? replyId : null;
  const result = React.useMemo(() => {
    const keepAt = new Map<number, number>();
    for (const [id, key] of pinnedMoves) if (key === listKey && movedRows?.[id]) keepAt.set(id, movedRows[id].at);
    return listRows(allRows, state, ctx, { alwaysInclude: keepReply != null ? [keepReply] : [], keepAt });
  }, [allRows, state, ctx, keepReply, pinnedMoves, listKey, movedRows]);
  const rows = result.rows;
  const dividerAt = React.useMemo(() => new Map(result.dividers.map(d => [d.at, d])), [result.dividers]);
  const passedOnly = state.filters.needs.length === 1 && state.filters.needs[0] === "passed";

  // Leaving the Date passed list (or emptying it) cancels a pending confirm.
  React.useEffect(() => { setConfirmClose(false); }, [passedOnly, rows.length]);

  const { onRowsChange } = props;
  const orderKey = rows.map((r) => r.lead.id).join(",");
  React.useEffect(() => {
    onRowsChange?.(rows.map((r) => r.lead.id));
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Send / Cancel on a quick reply, or a row leaving the list: keep keyboard
  // focus on that row (or the next one) instead of dropping it to the page.
  // When the last one goes, the view it was on ("Needs reply 0").
  const rowsRef = React.useRef<HTMLDivElement>(null);
  const tabRef = React.useRef<HTMLButtonElement>(null);
  useFocusKeeper(rowsRef, tabRef);

  const sortValue = sortToParam(state.sort);
  const baseCounts = React.useMemo(() => viewCounts(allRows, EMPTY_FILTERS, "", ctx), [allRows, ctx]);
  const summary = filtered
    ? `Showing ${rows.length} of ${baseCounts[view]} ${view === "all" ? "enquiries" : viewInfo(view).label.toLowerCase()}`
    : view === "reply" ? `${counts.reply} waiting on you · longest first`
    : `${rows.length} ${view === "all" ? "enquiries" : viewInfo(view).label.toLowerCase()}`;
  const emptyText = viewInfo(view).empty;

  const startReply = (row: ListRow) => {
    const names = QUICK_FOR[row.signal.group] ?? [];
    const tpl = STARTER_TEMPLATES.find((t) => t.name === names[0]) ?? STARTER_TEMPLATES[0];
    setReplyId(row.lead.id);
    setTplName(tpl.name);
    setDraft(resolveTemplate(tpl.body, row.lead, venueName));
  };

  // A template chip replaces the reply. If the reply has been typed into (it is no
  // longer the current template's text), ask first: it used to vanish silently.
  const pickTemplate = (lead: any, tpl: (typeof STARTER_TEMPLATES)[number]) => {
    const current = STARTER_TEMPLATES.find((t) => t.name === tplName);
    const typed = !!draft.trim() && (!current || draft !== resolveTemplate(current.body, lead, venueName));
    if (typed && !window.confirm(`Replace what you've typed with "${tpl.name}"?`)) return;
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
    <div className="vf-pane-scroll flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="px-4 md:px-6 pt-4 pb-10 flex flex-col gap-3.5">
        {/* View tabs. While filtering or searching each count is what that
            view would show, so they start with "Matching:". */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 border-b border-border/60 -mb-px max-w-full flex-wrap">
            {filtered && <span className="px-1 py-2 font-sans text-sm font-semibold text-muted-foreground">Matching:</span>}
            {VIEWS.map((t) => {
              const on = view === t.id;
              return (
                <button key={t.id} ref={on ? tabRef : undefined} onClick={() => { props.onViewChange(t.id); setReplyId(null); }}
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
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap -mt-1">
            <div className="font-sans text-[13px] text-muted-foreground">{summary}</div>
            <label className="inline-flex items-center gap-2 font-sans text-[13px] text-muted-foreground">
              Sort
              <select value={sortValue} onChange={(e) => { const s = sortFromParam(e.target.value); if (s) props.onSortChange(s); }}
                className="h-8 rounded-[6px] border-[1.5px] border-input bg-card px-2 font-sans text-[13px] font-semibold text-foreground">
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* Close the lot in one go: they can't be won any more. */}
        {passedOnly && rows.length > 0 && onCloseAsLost && !props.isStaff && (
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
        <div ref={rowsRef} className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <div className="py-12 text-center font-sans text-sm text-muted-foreground">{props.loaded === false ? "Loading…" : emptyText}</div>
          ) : rows.map((row, i) => {
            const { lead, signal } = row;
            const divider = dividerAt.get(i);
            const tone = TONE[signal.tone];
            const action = enquiryAction(signal.group);
            const si = statusInfo(lead.status);
            const replying = replyId === lead.id;
            const dateClash = signal.kind === "clash";
            const dateStr = lead.eventDate
              ? fmtListDate(new Date(lead.eventDate), nowMs)
              : (lead as any).dateFlexible ? "Date TBC" : "No date";
            const whenStr = [
              lead.eventDate ? new Date(lead.eventDate).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" }) : null,
              lead.guestCount ? `${lead.guestCount} guests` : null,
              dateClash ? "date clash" : null,
            ].filter(Boolean).join(" · ");
            const sub = [lead.company, lead.eventType, eventFormatLabel((lead as any).eventFormat)].filter(Boolean).join(" · ");
            const onAction = (e: React.MouseEvent) => {
              e.stopPropagation();
              // detail 0 = Enter/Space (a click or tap has 1 or more).
              focusReplyBox.current = e.detail === 0;
              if (action.reply) { replying ? setReplyId(null) : startReply(row); } else onOpen(lead);
            };

            return (
              <div key={lead.id}>
              {divider && (
                <div role="heading" aria-level={3} className="pt-2 pb-1 font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                  {divider.label} · {divider.count}
                </div>
              )}
              <div className="rounded-[6px] overflow-hidden border-[1.5px] transition-colors"
                style={{ background: tint(si.dot, lead.status === "new" ? "2b" : "26"), borderColor: replying ? "var(--primary)" : si.dot }}>
                {/* The whole box is filled with the enquiry's status colour: a
                    light tint, with a solid border in the same colour. A brand-new
                    enquiry is the one that needs you, so its tint is the strongest. */}
                {/* Desktop: one dense signal-first row. A click anywhere opens
                    it; for the keyboard the name is the button, so Reply isn't
                    nested inside another button (Enter on Reply used to open
                    the drawer too). */}
                <div onClick={() => onOpen(lead)}
                  className="hidden md:grid gap-4 items-center px-3.5 py-3 cursor-pointer hover:brightness-[0.97] md:grid-cols-[176px_minmax(0,1.6fr)_minmax(0,1fr)_104px] lg:grid-cols-[176px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_104px]">
                  {/* Fixed-width signal and action columns, so the name and date
                      columns line up from row to row whatever the chip says. */}
                  <span className="inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-sans text-xs font-bold whitespace-nowrap justify-self-start max-w-full overflow-hidden text-ellipsis"
                    style={{ background: tone.bg, color: tone.fg }}>
                    <Icon name={signal.icon} />{signal.text}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
                        className="min-w-0 truncate text-left font-serif text-[16.5px] font-semibold">
                      <span className="font-serif text-[16.5px] font-semibold truncate" style={{ color: "#211d18" }}>{lead.firstName} {lead.lastName}</span>
                      </button>
                      {/* Status in plain ink: the dot carries the status colour; the
                          chip on the left already carries the urgency colour. */}
                      <span className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold whitespace-nowrap flex-shrink-0 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: si.dot }} />{si.label}
                      </span>
                    </div>
                    {sub && <div className="font-sans text-[13px] text-muted-foreground truncate mt-0.5">{sub}</div>}
                    <div className="font-sans text-[12.5px] font-semibold text-foreground/80 mt-0.5 whitespace-nowrap">Came in {fmtCameIn(lead.createdAt)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif text-[15px] font-semibold whitespace-nowrap" style={{ color: dateClash ? "#c0392b" : !lead.eventDate ? "#6b4710" : "var(--foreground)" }}>{dateStr}</div>
                    {whenStr && <div className="font-sans text-[13px] text-muted-foreground truncate mt-0.5">{whenStr}</div>}
                  </div>
                  <div className="min-w-0 hidden lg:block">
                    <div className="font-sans text-[13px] text-muted-foreground whitespace-nowrap">{moneyRange(lead)}</div>
                  </div>
                  <button onClick={onAction}
                    className="inline-flex items-center justify-center gap-1.5 h-9 w-full px-3 rounded-[6px] font-sans text-[13px] font-bold whitespace-nowrap border-[1.5px] transition-colors hover:border-primary"
                    aria-label={`${action.label}${action.label === "Reply" ? " to" : ""} ${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()}
                    style={action.primary
                      ? { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff" }
                      : { background: "var(--card)", borderColor: "var(--input)", color: "var(--foreground)" }}>
                    <Icon name={action.icon} size={14} />{action.label}
                  </button>
                </div>

                {/* Mobile: a stacked card — signal + budget, then name, sub, then date + action */}
                <div className="md:hidden">
                  <div onClick={() => onOpen(lead)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onOpen(lead); } }}
                    className="px-3.5 pt-3 pb-2.5 cursor-pointer">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-sans text-[12px] font-bold whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
                        style={{ background: tone.bg, color: tone.fg }}>
                        <Icon name={signal.icon} />{signal.text}
                      </span>
                      <span className="font-sans text-[12px] text-muted-foreground whitespace-nowrap flex-shrink-0">{budgetRangeLabel(lead.budgetRange) ?? ""}</span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2 min-w-0">
                      <span className="font-serif text-[19px] font-semibold truncate" style={{ color: "#211d18" }}>{lead.firstName} {lead.lastName}</span>
                      <span className="inline-flex items-center gap-1.5 font-sans text-[12px] font-semibold whitespace-nowrap flex-shrink-0 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: si.dot }} />{si.label}
                      </span>
                    </div>
                    {sub && <div className="font-sans text-[13.5px] text-muted-foreground truncate mt-0.5">{sub}</div>}
                    <div className="font-sans text-[12.5px] font-semibold text-foreground/80 mt-0.5">Came in {fmtCameIn(lead.createdAt)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2.5 px-3.5 pb-2.5 pt-2 border-t" style={{ borderColor: "var(--vf-hair, #eee6d8)" }}>
                    <div onClick={() => onOpen(lead)} className="min-w-0 cursor-pointer">
                      <div className="font-serif text-[15.5px] font-semibold whitespace-nowrap" style={{ color: dateClash ? "#c0392b" : !lead.eventDate ? "#6b4710" : "var(--foreground)" }}>{dateStr}</div>
                      {whenStr && <div className="font-sans text-[12px] text-muted-foreground truncate">{whenStr}</div>}
                    </div>
                    <button onClick={onAction}
                      className="inline-flex items-center gap-1.5 h-11 px-4 rounded-[6px] font-sans text-[14px] font-bold whitespace-nowrap border-[1.5px] flex-shrink-0"
                      aria-label={`${action.label}${action.label === "Reply" ? " to" : ""} ${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()}
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
                  <div ref={replyPanelRef} className="border-t px-3.5 pt-3 pb-3.5" style={{ borderColor: "var(--vf-hair, #eee6d8)", background: "#fff" }}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground mr-1">Quick reply to {lead.firstName}</span>
                      {(QUICK_FOR[signal.group] ?? []).map((name) => {
                        const on = tplName === name;
                        const tpl = STARTER_TEMPLATES.find((t) => t.name === name);
                        if (!tpl) return null;
                        return (
                          <button key={name} aria-pressed={on} onClick={() => pickTemplate(lead, tpl)}
                            className="h-[26px] px-2.5 rounded-[4px] font-sans text-[12px] font-semibold border-[1.5px] transition-colors"
                            style={on ? { background: "var(--accent)", borderColor: "var(--primary)", color: "var(--primary)" } : { background: "var(--card)", borderColor: "var(--input)", color: "var(--foreground)" }}>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                    <textarea ref={replyBoxRef} aria-label={`Reply to ${[lead.firstName, lead.lastName].filter(Boolean).join(" ")}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={6}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
