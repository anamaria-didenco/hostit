import React from "react";
import { Send, CalendarClock, Check, ArrowDown, ArrowUp } from "lucide-react";
import {
  SORT_DEFAULT_DIR, SORT_OPTIONS, VIEWS, activeCount, clearFilters, datePassedCount, describeFilters, isChipOn, isSearching,
  effectiveView, listRows, quickChips, reviewPassedFilters, sortToParam, sortFromParam, todayKey, toggleChip, viewCounts, viewInfo, EMPTY_FILTERS,
  type ChipLabels, type EnquiryFilters, type EnquiryView, type ListCtx, type ListRow, type ListSort, type ListState, type QuickChip, type SortKey,
} from "@shared/enquiryFilters";
import { STARTER_TEMPLATES } from "@shared/starterTemplates";
import { allShownSelected } from "@shared/bulkSelection";
import MovedNote from "@/components/MovedNote";
import EnquiryRow, { ROW_GRID, ROW_GRID_SELECT, FROM_L, FROM_XL, TABLE_ONLY, CARDS_ONLY, fullName } from "@/components/EnquiryRow";
import { useFocusKeeper } from "@/hooks/useFocusKeeper";

/**
 * The Enquiries list: six views (Needs reply, Follow-up due, Open, Confirmed,
 * Closed, All), each row leading with what the enquiry needs from you, sorted
 * so the most urgent rises to the top, with Reply / Nudge and an inline quick
 * reply. The rows, counts, filters and sort all come from
 * shared/enquiryFilters.ts; the state lives in useEnquiryListState.
 *
 * Layout follows the width of the Enquiries column (the @container around
 * the toolbar and this list), not the window's: a table from 768px (fewer
 * columns below 992px, Came in from 1148px), two-line cards below 768px. So
 * at 400% zoom the table turns into cards by itself.
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
  /** Owner initials on the rows. */
  teamById?: Map<number, { name: string }>;
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
  /** Names for the empty state ("No confirmed enquiries match Space: Courtyard"). */
  labels?: ChipLabels;
  /** "Select multiple": a box on each row, and a select-all box in the header. */
  selectMode?: boolean;
  selectedIds?: ReadonlySet<number>;
  onSelectedChange?: (ids: Set<number>) => void;
  /** The header's select-all box (where focus goes on "Select multiple" on a table). */
  selectAllRef?: React.Ref<HTMLInputElement>;
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

/** A value that settles: the live count is announced once typing stops. */
function useSettled<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// The column header's sort buttons. Each says which way it sorts when on.
const HEAD: { key: SortKey; label: string; cls?: string; right?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "urgent", label: "Needs" },
  { key: "status", label: "Status" },
  { key: "event", label: "Event date" },
  { key: "guests", label: "Guests", cls: FROM_L, right: true },
  { key: "space", label: "Space", cls: FROM_L },
  { key: "came", label: "Came in", cls: FROM_XL },
];
function headPhrase(key: SortKey, dir: "asc" | "desc"): string {
  const def = dir === SORT_DEFAULT_DIR[key];
  switch (key) {
    case "urgent": return "most urgent first";
    case "name": case "space": return def ? "A to Z" : "Z to A";
    case "status": return def ? "in pipeline order" : "in reverse pipeline order";
    case "event": return dir === "asc" ? "soonest first" : "latest first";
    case "guests": return dir === "desc" ? "most first" : "fewest first";
    case "came": return dir === "desc" ? "newest first" : "oldest first";
  }
}

export default function EnquiryListC(props: EnquiryListCProps) {
  const { rows: allRows, ctx, state, venueName, statusInfo, onOpen, onSend, sending, onCloseAsLost, closing, movedRows, onUndoMove, undoPendingId } = props;
  const selectMode = !!props.selectMode;
  const selectedIds = props.selectedIds ?? NO_IDS;
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
  const today = todayKey(ctx);
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
  const ids = React.useMemo(() => rows.map((r) => r.lead.id), [rows]);
  const orderKey = ids.join(",");
  React.useEffect(() => {
    onRowsChange?.(ids);
  }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Send / Cancel on a quick reply, or a row leaving the list: keep keyboard
  // focus on that row (or the next one) instead of dropping it to the page.
  // When the last one goes, the view it was on ("Needs reply 0").
  const rowsRef = React.useRef<HTMLDivElement>(null);
  const deskTabRef = React.useRef<HTMLButtonElement | null>(null);
  const gridTabRef = React.useRef<HTMLButtonElement | null>(null);
  // The active view button, whichever layout shows (the focus keeper's fallback).
  const tabRef = React.useMemo(() => ({
    get current() { return [deskTabRef.current, gridTabRef.current].find(el => !!el && el.getClientRects().length > 0) ?? null; },
  }), []);
  useFocusKeeper(rowsRef, tabRef);

  const sortValue = sortToParam(state.sort);
  const baseCounts = React.useMemo(() => viewCounts(allRows, EMPTY_FILTERS, "", ctx), [allRows, ctx]);
  const nFilters = activeCount(state.filters);
  const shownCount = counts[view] ?? 0;
  const totalCount = baseCounts[view] ?? 0;
  const summary = summaryText(view, state, shownCount, totalCount);
  // What a screen reader hears when the table's count changes (once typing stops).
  const liveText = useSettled(props.loaded === false ? "" : liveCountText(view, state, shownCount, totalCount), 500);
  const chips = quickChips(view);
  // Open enquiries left past their date, and forms nobody finished: each gets
  // a one-line way in, so neither needs a tab of its own. The date-passed
  // count is of the rows your filters and search show: what "Review them" lists.
  const passedCount = React.useMemo(() => datePassedCount(allRows, { filters: state.filters, q: state.q }, ctx), [allRows, state.filters, state.q, ctx]);
  const partialCount = React.useMemo(() => allRows.filter(r => r.signal.kind === "partial").length, [allRows]);
  const pinnedOutside = React.useMemo(() => new Set(result.pinnedOutside), [result.pinnedOutside]);
  const clearAllFilters = () => props.onFiltersChange(() => clearFilters());

  // ── Select multiple ───────────────────────────────────────────────────────
  const { onSelectedChange } = props;
  const anchorRef = React.useRef<number | null>(null);
  React.useEffect(() => { if (!selectMode) anchorRef.current = null; }, [selectMode]);
  const idsRef = React.useRef(ids);
  idsRef.current = ids;
  const selectedRef = React.useRef(selectedIds);
  selectedRef.current = selectedIds;
  const onSelect = React.useCallback((id: number, checked: boolean, shift: boolean) => {
    const next = new Set(selectedRef.current);
    const order = idsRef.current;
    const a = anchorRef.current != null ? order.indexOf(anchorRef.current) : -1;
    const b = order.indexOf(id);
    // Shift: every row shown between the last box clicked and this one.
    if (shift && a >= 0 && b >= 0) {
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) { if (checked) next.add(order[i]); else next.delete(order[i]); }
    } else if (checked) next.add(id); else next.delete(id);
    anchorRef.current = id;
    onSelectedChange?.(next);
  }, [onSelectedChange]);
  const allSelected = allShownSelected(selectedIds, ids);
  const someSelected = !allSelected && ids.some(id => selectedIds.has(id));
  const headBoxRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => { if (headBoxRef.current) headBoxRef.current.indeterminate = someSelected; });
  const { selectAllRef } = props;
  const setHeadBox = React.useCallback((el: HTMLInputElement | null) => {
    headBoxRef.current = el;
    if (typeof selectAllRef === "function") selectAllRef(el);
    else if (selectAllRef) (selectAllRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
  }, [selectAllRef]);

  // ── Quick reply ───────────────────────────────────────────────────────────
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

  // Reply / Nudge: open (or close) the quick reply under the row.
  const onAction = (e: React.MouseEvent, row: ListRow) => {
    // detail 0 = Enter/Space (a click or tap has 1 or more).
    focusReplyBox.current = e.detail === 0;
    if (replyId === row.lead.id) setReplyId(null); else startReply(row);
  };

  // A view change closes an untouched quick reply; one with text stays open
  // (its row is kept, "Not in this view · kept while you reply").
  const pickView = (v: EnquiryView) => { props.onViewChange(v); if (keepReply == null) setReplyId(null); };

  const sortSelect = (cls: string) => (
    <select value={sortValue} onChange={(e) => { const s = sortFromParam(e.target.value); if (s) props.onSortChange(s); }}
      aria-label="Sort"
      className={`${cls} rounded-[6px] border-[1.5px] border-input bg-card font-sans text-[13px] font-semibold text-foreground`}>
      {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  // A header button: sort by it, or turn it round when it's already on.
  const sortBy = (key: SortKey) => {
    const on = state.sort.key === key;
    if (on && key === "urgent") return;
    const dir = on ? (state.sort.dir === "asc" ? "desc" : "asc") : SORT_DEFAULT_DIR[key];
    props.onSortChange({ key, dir });
  };

  return (
    <div className="vf-pane-scroll flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="px-3 md:px-6 pt-2 @min-[768px]:pt-0.5 pb-10 flex flex-col gap-2">
        {/* View row (wide): "Matching:" while filtering or searching (each
            count is then what that view would show), the six views, the
            view's one-click shortcuts, and Sort. The filter bar's popovers
            open below it (data-view-row), so a shortcut stays clickable. */}
        <div data-view-row className="hidden @min-[768px]:flex items-end gap-x-2 gap-y-1 flex-wrap border-b border-border/60">
          {filtered && <span className="pb-2.5 pr-1 font-sans text-[12.5px] font-bold text-muted-foreground">Matching:</span>}
          <div role="group" aria-label="Enquiry views" className="flex items-end flex-wrap -mb-px">
            {VIEWS.map((t) => {
              const on = view === t.id;
              return (
                <button key={t.id} ref={on ? deskTabRef : undefined} onClick={() => pickView(t.id)}
                  aria-pressed={on}
                  className={`relative px-2 @min-[1148px]:px-2.5 py-2 font-sans text-sm font-semibold whitespace-nowrap shrink-0 transition-colors border-b-2 ${on ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
                  {t.label}
                  {/* Full-strength muted ink: the /70 count was 2.9:1, under AA. A 0 stays full strength too. */}
                  <span className={`ml-1.5 text-xs font-bold ${on ? "text-primary" : "text-muted-foreground"}`}>{counts[t.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
          {chips.length > 0 && <span aria-hidden="true" className="self-center w-px h-5 bg-border mx-1" />}
          {chips.length > 0 && (
            <div role="group" aria-label="Shortcuts" className="self-center flex items-center gap-1.5 flex-wrap py-1">
              {chips.map(c => <QuickChipButton key={c.id} chip={c} on={isChipOn(state.filters, c)} onClick={() => props.onFiltersChange(f => toggleChip(f, c))} />)}
            </div>
          )}
          <label className="ml-auto self-center inline-flex items-center gap-2 py-1 font-sans text-[13px] text-muted-foreground">
            <span className="@max-[1147px]:sr-only">Sort</span>
            {sortSelect("h-8 max-w-[11.5rem] px-1.5")}
          </label>
        </div>

        {/* Narrow: all six views in a 2×3 grid (nothing off-screen), the
            shortcuts, then a summary line with Sort. "Matching:" over the
            grid while filtering or searching, as on the wide row. */}
        <div className={`${CARDS_ONLY} flex flex-col gap-2`}>
          {filtered && <p className="-mt-1 -mb-1 font-sans text-[12.5px] leading-4 font-bold text-muted-foreground">Matching:</p>}
          <div role="group" aria-label="Enquiry views" className="grid grid-cols-3 @max-[359px]:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-1.5">
            {VIEWS.map((t) => {
              const on = view === t.id;
              return (
                <button key={t.id} ref={on ? gridTabRef : undefined} onClick={() => pickView(t.id)}
                  aria-pressed={on}
                  className={`h-9 px-1 rounded-[7px] border-[1.5px] font-sans text-[13px] font-semibold whitespace-nowrap transition-colors ${on ? "bg-primary border-primary text-primary-foreground forced-colors:[forced-color-adjust:none] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]" : "bg-card border-border text-foreground"}`}>
                  {t.short}<span className={`ml-1.5 text-xs font-extrabold ${on ? "text-primary-foreground" : "text-muted-foreground"}`}>{counts[t.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
          {chips.length > 0 && (
            <div className="relative">
              <div role="group" aria-label="Shortcuts" className="flex items-center gap-1.5 overflow-x-auto pr-6 [scrollbar-width:none]">
                {chips.map(c => <QuickChipButton key={c.id} chip={c} big on={isChipOn(state.filters, c)} onClick={() => props.onFiltersChange(f => toggleChip(f, c))} />)}
              </div>
              <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent" />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 min-h-9">
            <div className="font-sans text-[13px] text-muted-foreground min-w-0" aria-live="polite" aria-atomic="true">{props.loaded === false ? "" : summary}</div>
            <label className="inline-flex items-center gap-2 font-sans text-[13px] text-muted-foreground shrink-0">
              <span className="sr-only">Sort</span>
              {sortSelect("h-9 max-w-[11rem] px-2")}
            </label>
          </div>
        </div>

        {/* Open view: enquiries still open after their date. */}
        {view === "open" && !passedOnly && passedCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap min-h-7 @min-[768px]:min-h-8 px-3 py-0.5 rounded-[6px] border border-border bg-card font-sans text-[13px] text-foreground">
            <CalendarClock className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            {/* One line on a phone too: the short wording there. */}
            <span className="@max-[767px]:hidden">{passedCount} {filtered ? "matching" : "open"} {passedCount === 1 ? "enquiry is" : "enquiries are"} past their event date.</span>
            <span className={CARDS_ONLY}>{`${passedCount}${filtered ? " matching" : ""} ${passedCount === 1 ? "is past its" : "are past their"} event date.`}</span>
            <button type="button" onClick={() => props.onFiltersChange(reviewPassedFilters)}
              className="font-bold text-primary underline underline-offset-[3px]">Review them</button>
          </div>
        )}

        {/* Only the date-passed ones showing: close the lot in one go, they
            can't be won any more (Lost, reason "other" with a note, so
            Reports' lost-reason split stays true). */}
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

        {/* A heading for the list itself (screen readers jump by headings);
            the month and pile dividers inside it are level 3. */}
        <h2 className="sr-only">{searching ? "Search results" : viewInfo(view).label}</h2>
        {rows.length > 0 ? (
          // One bordered block with hairlines between rows. overflow:clip (not
          // hidden) rounds the corners without breaking the sticky header.
          <div className="rounded-[7px] border border-border bg-card [overflow:clip]">
            {/* Column header (table layouts): select-all in select mode, the
                sort buttons, and the count, which is also the live region. */}
            <div className={`${TABLE_ONLY} ${selectMode ? ROW_GRID_SELECT : ROW_GRID} sticky top-0 z-[2] h-8 pl-[15px] pr-3 border-b border-border bg-muted`}>
              {selectMode && (
                <label className="flex items-center justify-center h-8 cursor-pointer">
                  <input type="checkbox" ref={setHeadBox} checked={allSelected}
                    aria-label={`Select all ${ids.length} shown`}
                    onChange={(e) => onSelectedChange?.(e.target.checked ? new Set(ids) : new Set())}
                    className="w-4 h-4 accent-[var(--primary)] cursor-pointer" />
                </label>
              )}
              <div role="group" aria-label="Sort enquiries" className="contents">
                {HEAD.map(h => {
                  const on = state.sort.key === h.key;
                  const Arrow = h.key === "urgent" || state.sort.dir === "desc" ? ArrowDown : ArrowUp;
                  return (
                    <div key={h.key} className={`${h.cls ?? ""} min-w-0 ${h.right ? "text-right" : ""}`}>
                      <button type="button" onClick={() => sortBy(h.key)}
                        aria-label={on ? `${h.label}, sorted ${headPhrase(h.key, state.sort.dir)}` : `Sort by ${h.label.toLowerCase()}`}
                        className={`inline-flex items-center gap-1 h-8 max-w-full font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] whitespace-nowrap hover:text-foreground ${on ? "text-primary" : "text-muted-foreground"}`}>
                        {h.label}
                        {on && <Arrow className="w-3 h-3 shrink-0" strokeWidth={2.6} aria-hidden="true" />}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-end font-sans text-[12px] font-bold tabular-nums text-muted-foreground whitespace-nowrap">
                <span aria-hidden="true">{props.loaded === false ? "" : shownCount === totalCount && !searching ? totalCount : `${shownCount} of ${totalCount}`}</span>
                <span className="sr-only" aria-live="polite" aria-atomic="true">{liveText}</span>
              </div>
            </div>

            {/* Rows: each child is one enquiry (the focus keeper counts on it). */}
            <div ref={rowsRef}>
              {rows.map((row, i) => {
                const { lead } = row;
                const replying = replyId === lead.id;
                return (
                  <EnquiryRow key={lead.id}
                    row={row} ctx={ctx} today={today} statusInfo={statusInfo} teamById={props.teamById}
                    divider={dividerAt.get(i) ?? null}
                    onOpen={onOpen} onAction={onAction}
                    replying={replying} keptForReply={pinnedOutside.has(lead.id)}
                    selectMode={selectMode} selected={selectMode && selectedIds.has(lead.id)} onSelect={onSelect}>
                    {/* "Moved to … · Undo" — shown in place of the row vanishing
                        after its status was changed from the drawer. */}
                    {movedRows?.[lead.id] && (
                      <div className="pl-[15px] pr-3 pb-2" onClick={(e) => e.stopPropagation()}>
                        <MovedNote toLabel={statusInfo(movedRows[lead.id].to).label}
                          onUndo={() => onUndoMove?.(lead.id)} busy={undoPendingId === lead.id} />
                      </div>
                    )}
                    {replying && (
                      <QuickReply panelRef={replyPanelRef} boxRef={replyBoxRef} lead={lead} group={row.signal.group}
                        tplName={tplName} draft={draft} setDraft={setDraft} sending={sending}
                        onPick={(tpl) => pickTemplate(lead, tpl)} onCancel={() => setReplyId(null)}
                        onOpen={() => onOpen(lead)} onSend={() => doSend(lead)} />
                    )}
                  </EnquiryRow>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Nothing in the list: still the rows' element (empty), so the
                focus keeper falls back to the view's tab. */}
            <div ref={rowsRef} />
            <div className="py-12 px-4 text-center font-sans text-sm text-muted-foreground">
              {props.loaded === false ? "Loading…" : searching ? (
                <p>No enquiry matches ‘{state.q.trim()}’{nFilters > 0 && result.hiddenByFilters > 0 ? " with your filters" : ""}. Search looks at names, email, phone, company, event type and space.</p>
              ) : nFilters > 0 ? (
                <>
                  <p>{EMPTY_MATCH[view]} {describeFilters(state.filters, props.labels ?? {})}.</p>
                  <button type="button" onClick={clearAllFilters} className="mt-3 h-9 px-3 rounded-[6px] border-[1.5px] border-input bg-card font-sans text-[13px] font-bold text-foreground hover:border-primary">Clear filters</button>
                </>
              ) : viewInfo(view).empty}
            </div>
          </>
        )}

        {/* While searching: matches the filters hide, one click away. */}
        {searching && nFilters > 0 && result.hiddenByFilters > 0 && (
          <p className="font-sans text-[13px] text-muted-foreground">
            {result.hiddenByFilters} more match{result.hiddenByFilters === 1 ? "es" : ""} but {result.hiddenByFilters === 1 ? "is" : "are"} hidden by your filters.{" "}
            <button type="button" onClick={clearAllFilters} className="font-bold text-primary underline underline-offset-[3px]">Show them</button>
          </p>
        )}
        {/* Needs reply: forms people started but never sent. */}
        {view === "reply" && !searching && partialCount > 0 && (
          <p className="font-sans text-[13px] text-muted-foreground">
            {partialCount === 1 ? "1 person" : `${partialCount} people`} started the form but didn't finish.{" "}
            <button type="button" onClick={() => { props.onViewChange("open"); props.onFiltersChange(() => ({ ...clearFilters(), needs: ["partial"] })); }}
              className="font-bold text-primary underline underline-offset-[3px]">Show them</button>
          </p>
        )}
      </div>
    </div>
  );
}

const NO_IDS: ReadonlySet<number> = new Set();

/** The inline quick reply under a row: template chips, the text, Send. */
function QuickReply({ panelRef, boxRef, lead, group, tplName, draft, setDraft, sending, onPick, onCancel, onOpen, onSend }: {
  panelRef: React.Ref<HTMLDivElement>; boxRef: React.Ref<HTMLTextAreaElement>; lead: any; group: string;
  tplName: string; draft: string; setDraft: (s: string) => void; sending?: boolean;
  onPick: (tpl: (typeof STARTER_TEMPLATES)[number]) => void; onCancel: () => void; onOpen: () => void; onSend: () => void;
}) {
  return (
    <div ref={panelRef} className="border-t border-border pl-[15px] pr-3 pt-3 pb-3.5 bg-card" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground mr-1">Quick reply to {lead.firstName}</span>
        {(QUICK_FOR[group] ?? []).map((name) => {
          const on = tplName === name;
          const tpl = STARTER_TEMPLATES.find((t) => t.name === name);
          if (!tpl) return null;
          return (
            <button key={name} aria-pressed={on} onClick={() => onPick(tpl)}
              className="h-[26px] px-2.5 rounded-[4px] font-sans text-[12px] font-semibold border-[1.5px] transition-colors"
              style={on ? { background: "var(--accent)", borderColor: "var(--primary)", color: "var(--primary)" } : { background: "var(--card)", borderColor: "var(--input)", color: "var(--foreground)" }}>
              {name}
            </button>
          );
        })}
      </div>
      <textarea ref={boxRef} aria-label={`Reply to ${fullName(lead)}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={6}
        className="w-full resize-y rounded-[4px] border-[1.5px] px-3 py-2.5 font-sans text-[13px] leading-relaxed outline-none focus:border-primary"
        style={{ borderColor: "var(--input)", background: "var(--card)", color: "var(--foreground)" }} />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="h-[30px] px-3 rounded-[4px] font-sans text-[12px] font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={onOpen} className="h-[30px] px-3 rounded-[4px] font-sans text-[12px] font-semibold border-[1.5px]" style={{ borderColor: "var(--input)", background: "var(--card)", color: "var(--foreground)" }}>Open enquiry</button>
        <button onClick={onSend} disabled={sending || !draft.trim()}
          className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[4px] font-sans text-[12px] font-bold disabled:opacity-50"
          style={{ background: "var(--primary)", color: "#fff" }}>
          <Send style={{ width: 14, height: 14 }} />{sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/** A one-click shortcut ("This month", "Lost this year"): navy with a tick when on. */
function QuickChipButton({ chip, on, onClick, big }: { chip: QuickChip; on: boolean; onClick: () => void; big?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`inline-flex items-center gap-1.5 ${big ? "h-9 px-3.5" : "h-8 px-3"} rounded-full border-[1.5px] font-sans text-[13px] font-semibold whitespace-nowrap shrink-0 transition-colors ${on ? "bg-primary border-primary text-primary-foreground forced-colors:border-[CanvasText]" : "bg-card border-input text-foreground hover:border-primary"}`}>
      {on && <Check className="w-3.5 h-3.5" strokeWidth={2.6} aria-hidden="true" />}
      {chip.label}
    </button>
  );
}

const EMPTY_MATCH: Record<EnquiryView, string> = {
  reply: "No enquiries waiting on a reply match",
  followup: "No follow-ups due match",
  open: "No open enquiries match",
  confirmed: "No confirmed enquiries match",
  closed: "No closed enquiries match",
  all: "No enquiries match",
};
const NOUN: Record<EnquiryView, string> = {
  reply: "waiting on you", followup: "follow-ups due", open: "open", confirmed: "confirmed", closed: "closed", all: "enquiries",
};
const NOUN_LONG: Record<EnquiryView, string> = {
  reply: "enquiries waiting on a reply", followup: "follow-ups due", open: "open enquiries",
  confirmed: "confirmed enquiries", closed: "closed enquiries", all: "enquiries",
};
function sortPhrase(view: EnquiryView, s: ListSort): string {
  switch (s.key) {
    case "urgent": return view === "reply" ? "longest first" : view === "followup" ? "most overdue first" : "most urgent first";
    case "event": return s.dir === "asc" ? "soonest event first" : "latest event first";
    case "came": return s.dir === "desc" ? "newest first" : "oldest first";
    case "status": return "by status";
    case "guests": return "most guests first";
    case "name": return "A–Z by name";
    case "space": return "by space";
  }
}
/** "24 waiting on you · longest first", "Showing 27 of 98 open", "4 matches for ‘ellingham’". */
export function summaryText(view: EnquiryView, state: ListState, shown: number, total: number): string {
  if (isSearching(state)) return `${shown} match${shown === 1 ? "" : "es"} for ‘${state.q.trim()}’ · ${sortPhrase(view, state.sort)}`;
  if (activeCount(state.filters) > 0) return `Showing ${shown} of ${total} ${NOUN[view]}`;
  return `${shown} ${NOUN[view]} · ${sortPhrase(view, state.sort)}`;
}
/** "92 of 98 open enquiries shown. Sorted soonest event first." */
function liveCountText(view: EnquiryView, state: ListState, shown: number, total: number): string {
  const sorted = `Sorted ${sortPhrase(view, state.sort)}.`;
  if (isSearching(state)) return `${shown} match${shown === 1 ? "" : "es"} for ‘${state.q.trim()}’. ${sorted}`;
  return `${shown === total ? shown : `${shown} of ${total}`} ${NOUN_LONG[view]} shown. ${sorted}`;
}
