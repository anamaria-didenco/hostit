import React from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import {
  BUDGET_OPTIONS, CAME_PRESETS, CLIENT_OPTIONS, DATE_PRESETS, FACET_LABELS, FACET_TOTAL, GUEST_OPTIONS, LOST_OPTIONS, NEEDS_OPTIONS,
  activeChips, activeCount, clearFacet, clearFilters, eventTypeOptions, facetCounts, formatMonthShort, isFacetActive,
  sourceLabel, sourceOptions, statusKey, todayKey,
  type ChipLabels, type DateFilter, type EnquiryFilters, type ListCtx, type ListRow, type ListState,
} from "@shared/enquiryFilters";

/**
 * The Enquiries filter row: one search box, then a button per filter. A
 * filter you pick turns its button into a chip ("Status: Confirmed ×"), so
 * what is filtering the list is always on screen. Below 720px of list width
 * the buttons give way to one "Filters" button that opens a sheet, and the
 * chips get a row of their own.
 *
 * Every choice applies at once. Each option shows how many enquiries it would
 * give with the other filters as they are (facetCounts).
 */

export type FacetStatus = { key: string; label: string; swatch?: string };
type Facet = keyof EnquiryFilters;
type Option = { key: string; label: string; count: number; on: boolean };

export interface EnquiryFilterBarProps {
  /** "board": no Status filter (the columns are the statuses). */
  mode: "list" | "board";
  rows: ListRow[];
  ctx: ListCtx;
  state: ListState;
  onFiltersChange: (f: EnquiryFilters) => void;
  onQChange: (q: string) => void;
  /** The venue's statuses, in pipeline order. */
  statuses: FacetStatus[];
  spaces: { id: number; name: string }[];
  /** Team members; the Owner filter shows only when there are some. */
  team: { id: number; name: string }[];
  /** How many enquiries the list shows now (the sheet's "Show N enquiries"). */
  shownCount: number;
}

const MORE_FACETS: Facet[] = ["needs", "type", "guests", "budget", "came", "lostReason", "client"];
const CONFIRMED = ["booked"];
const CLOSED = ["finished", "lost", "cancelled"];

const BTN = "inline-flex items-center gap-1.5 h-9 px-2.5 rounded-[7px] border-[1.5px] border-input bg-card font-sans text-[13px] font-semibold text-foreground whitespace-nowrap hover:border-primary transition-colors";
const CHIP = "inline-flex items-stretch h-9 rounded-[7px] border-[1.5px] border-primary bg-accent text-primary overflow-hidden";
const CHIP_TEXT = "inline-flex items-center gap-1 pl-2.5 pr-1 font-sans text-[13px] font-semibold whitespace-nowrap max-w-[16rem] overflow-hidden text-ellipsis";
const CHIP_X = "relative inline-grid place-items-center w-9 text-primary hover:bg-primary/10 before:absolute before:-inset-y-[1.5px] before:inset-x-0 before:content-['']";
const LEGEND = "font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground";
const COUNT = "ml-auto pl-3 font-sans text-[12px] font-bold text-muted-foreground tabular-nums";

const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;

/**
 * How far below its button a filter opens: past the rest of this bar and,
 * when it sits right underneath, the list's row of views and shortcuts
 * (EnquiryListC's [data-view-row]). Dropping over that row hid "This month"
 * and "Next month", which are meant to be clickable with a filter open.
 */
function dropOffset(trigger: Element | null | undefined, bar: HTMLElement | null): number {
  if (!trigger || !bar) return 6;
  const t = trigger.getBoundingClientRect();
  // The bar's last line of buttons (its bottom padding is 12px).
  let bottom = bar.getBoundingClientRect().bottom - 12;
  const row = Array.from(document.querySelectorAll("[data-view-row]")).find(visible);
  if (row) {
    const r = row.getBoundingClientRect();
    if (r.top >= t.bottom - 1 && r.top - bottom < 48 && r.bottom > bottom) bottom = r.bottom;
  }
  return Math.max(6, Math.round(bottom - t.bottom) + 6);
}

export default function EnquiryFilterBar(props: EnquiryFilterBarProps) {
  const { mode, rows, ctx, state, onFiltersChange, onQChange, statuses, spaces, team } = props;
  const f = state.filters;
  const searchRef = React.useRef<HTMLInputElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const [openFacet, setOpenFacet] = React.useState<Facet | "more" | null>(null);
  const [popOffset, setPopOffset] = React.useState(6);
  const measureDrop = (key: Facet | "more") => dropOffset(barRef.current?.querySelector(`[data-facet-trigger="${key}"]`), barRef.current);
  const openPopover = (key: Facet | "more", open: boolean) => {
    if (open) setPopOffset(measureDrop(key));
    setOpenFacet(open ? key : null);
  };
  // A pick can add a chip and push the views down: keep the popover clear of them.
  React.useLayoutEffect(() => {
    if (!openFacet) return;
    const v = measureDrop(openFacet);
    if (v !== popOffset) setPopOffset(v);
  });
  const [sheetOpen, setSheetOpen] = React.useState(false);
  // "Custom range" picked but no day typed yet: a choice on screen, not yet a filter.
  const [rangeMode, setRangeMode] = React.useState<{ date?: boolean; came?: boolean }>({});
  // The board has no views: its counts are over every enquiry.
  const countState: ListState = mode === "board" ? { ...state, view: "all", searchIn: false } : state;

  const labels: ChipLabels = React.useMemo(() => ({
    status: (k: string) => statuses.find(s => statusKey(s.key) === k)?.label ?? k.replace(/_/g, " "),
    space: (id: number) => spaces.find(s => s.id === id)?.name,
    owner: (id: number) => team.find(m => m.id === id)?.name,
  }), [statuses, spaces, team]);
  const chips = activeChips(mode === "board" ? { ...f, status: [] } : f, labels);
  const nActive = activeCount(mode === "board" ? { ...f, status: [] } : f);
  const showLostReason = state.view === "closed" || f.status.includes("lost") || f.lostReason.length > 0;

  // After a chip's × the chip has gone: focus the next chip, else the one
  // before, else the search box (never <body>).
  const refocus = React.useRef<{ order: Facet[]; removed: Facet } | null>(null);
  React.useLayoutEffect(() => {
    const r = refocus.current;
    if (!r) return;
    refocus.current = null;
    const i = r.order.indexOf(r.removed);
    const candidates = [...r.order.slice(i + 1), ...r.order.slice(0, i).reverse()];
    for (const facet of candidates) {
      const el = Array.from(barRef.current?.querySelectorAll<HTMLElement>(`[data-chip-x="${facet}"]`) ?? []).find(visible);
      if (el) { el.focus(); return; }
    }
    searchRef.current?.focus();
  });
  const removeFacet = (facet: Facet) => {
    refocus.current = { order: chips.map(c => c.facet), removed: facet };
    onFiltersChange(clearFacet(f, facet));
  };
  const clearAll = () => {
    onFiltersChange(mode === "board" ? { ...clearFilters(), status: f.status } : clearFilters());
    searchRef.current?.focus();
  };

  // ── Options per facet, with counts ──────────────────────────────────────
  const counts = (facet: Facet) => facetCounts(rows, countState, facet, ctx);
  const options = (facet: Facet, c: Map<string, number>): Option[] => {
    const n = (k: string) => c.get(k) ?? 0;
    switch (facet) {
      case "status": return statuses.map(s => { const k = statusKey(s.key); return { key: k, label: s.label, count: n(k), on: f.status.includes(k) }; });
      case "space": return [
        ...spaces.map(s => ({ key: String(s.id), label: s.name, count: n(String(s.id)), on: f.space.includes(s.id) })),
        { key: "none", label: "No space yet", count: n("none"), on: f.space.includes("none") },
      ];
      case "source": return sourceOptions(rows).map(k => ({ key: k, label: sourceLabel(k), count: n(k), on: f.source.includes(k) }));
      case "needs": return NEEDS_OPTIONS.map(o => ({ key: o.id, label: o.label, count: n(o.id), on: f.needs.includes(o.id) }));
      case "type": return eventTypeOptions(rows).map(o => ({ key: o.key, label: o.label, count: n(o.key), on: f.type.some(t => t.trim().toLowerCase() === o.key) }));
      case "guests": return GUEST_OPTIONS.map(o => ({ key: o.id, label: o.label, count: n(o.id), on: f.guests.includes(o.id) }));
      case "budget": return BUDGET_OPTIONS.map(o => ({ key: o.id, label: o.label, count: n(o.id), on: f.budget.includes(o.id) }));
      case "lostReason": return LOST_OPTIONS.map(o => ({ key: o.id, label: o.label, count: n(o.id), on: f.lostReason.includes(o.id) }));
      case "client": return CLIENT_OPTIONS.map(o => ({ key: o.id, label: o.label, count: n(o.id), on: f.client.includes(o.id) }));
    }
    return [];
  };
  const toggle = (facet: Facet, opt: Option) => {
    const next = { ...f };
    const flip = <T,>(list: T[], v: T, same: (a: T) => boolean) => (list.some(same) ? list.filter(x => !same(x)) : [...list, v]);
    switch (facet) {
      case "status": next.status = flip(f.status, opt.key, x => x === opt.key); break;
      case "space": { const v = opt.key === "none" ? "none" as const : Number(opt.key); next.space = flip(f.space, v, x => x === v); break; }
      case "source": next.source = flip(f.source, opt.key, x => x === opt.key); break;
      case "needs": next.needs = flip(f.needs, opt.key as any, x => x === opt.key); break;
      case "type": next.type = flip(f.type, opt.label, x => x.trim().toLowerCase() === opt.key); break;
      case "guests": next.guests = flip(f.guests, opt.key as any, x => x === opt.key); break;
      case "budget": next.budget = flip(f.budget, opt.key, x => x === opt.key); break;
      case "lostReason": next.lostReason = flip(f.lostReason, opt.key, x => x === opt.key); break;
      case "client": next.client = flip(f.client, opt.key as any, x => x === opt.key); break;
    }
    onFiltersChange(next);
  };
  const setDate = (facet: "date" | "came", v: DateFilter<any>, range = false) => {
    setRangeMode(m => ({ ...m, [facet]: range }));
    onFiltersChange({ ...f, [facet]: v });
  };

  // ── Pieces ──────────────────────────────────────────────────────────────
  const checkList = (facet: Facet, c: Map<string, number>, opts?: Option[]) => (
    <div className="flex flex-col">
      {(opts ?? options(facet, c)).map(o => (
        <label key={o.key} className="flex items-center gap-2.5 min-h-[34px] px-1 rounded cursor-pointer hover:bg-accent font-sans text-[13.5px] text-foreground">
          <input type="checkbox" checked={o.on} onChange={() => toggle(facet, o)} className="w-4 h-4 accent-[var(--primary)] shrink-0" />
          <span className="min-w-0">{o.label}</span>
          <span className={COUNT}>{o.count}</span>
        </label>
      ))}
    </div>
  );

  const statusList = (c: Map<string, number>) => {
    const opts = options("status", c);
    const groups = [
      { label: "In progress", items: opts.filter(o => !CONFIRMED.includes(o.key) && !CLOSED.includes(o.key)) },
      { label: "Confirmed", items: opts.filter(o => CONFIRMED.includes(o.key)) },
      { label: "Closed", items: opts.filter(o => CLOSED.includes(o.key)) },
    ].filter(g => g.items.length);
    return groups.map(g => (
      <div key={g.label} className="mt-1 first:mt-0">
        <div className={`${LEGEND} px-1 pt-1.5 pb-0.5`} aria-hidden="true">{g.label}</div>
        {checkList("status", c, g.items)}
      </div>
    ));
  };

  const monthOptions = (c: Map<string, number>) => Array.from(c.keys()).filter(k => k.startsWith("m:")).sort().map(k => k.slice(2));

  /** Event date or Came in: single choice (radios), a month, or a range. */
  const dateChoice = (facet: "date" | "came", c: Map<string, number>, opts: { columns?: boolean; idPrefix: string }) => {
    const val = f[facet] as DateFilter<string>;
    const presets: readonly { id: string; label: string }[] = facet === "date" ? DATE_PRESETS : CAME_PRESETS;
    const kind = !val ? (rangeMode[facet] ? "range" : "any") : "preset" in val ? val.preset : "month" in val ? "month" : "range";
    const months = facet === "date" ? monthOptions(c) : [];
    const name = `${opts.idPrefix}-${facet}`;
    const radio = (id: string, label: string, onPick: () => void, count?: number) => (
      <label key={id} className="flex items-center gap-2.5 min-h-[34px] px-1 rounded cursor-pointer hover:bg-accent font-sans text-[13.5px] text-foreground">
        <input type="radio" name={name} checked={kind === id} onChange={onPick} className="w-4 h-4 accent-[var(--primary)] shrink-0" />
        <span className="min-w-0">{label}</span>
        {count != null && <span className={COUNT}>{count}</span>}
      </label>
    );
    const range = val && !("preset" in val) && !("month" in val) ? val : null;
    return (
      <>
        <div className={opts.columns ? "grid grid-cols-2 gap-x-3" : "flex flex-col"}>
          {radio("any", facet === "date" ? "Any date" : "Any time", () => setDate(facet, null), c.get(FACET_TOTAL) ?? 0)}
          {presets.map(p => radio(p.id, p.label, () => setDate(facet, { preset: p.id }), c.get(p.id) ?? 0))}
          {months.length > 0 && radio("month", "Pick a month", () => setDate(facet, { month: months.find(m => m >= todayKey(ctx).slice(0, 7)) ?? months[months.length - 1] }))}
          {radio("range", "Custom range", () => setDate(facet, null, true))}
        </div>
        {kind === "month" && months.length > 0 && (
          <label className="flex items-center gap-2 mt-1.5 px-1 font-sans text-[13px] text-muted-foreground">
            Month
            <select value={(val as { month: string }).month} onChange={e => setDate(facet, { month: e.target.value })}
              className="h-9 flex-1 rounded-[6px] border-[1.5px] border-input bg-card px-2 font-sans text-[13px] font-semibold text-foreground">
              {months.map(m => <option key={m} value={m}>{formatMonthShort(m)} ({c.get(`m:${m}`) ?? 0})</option>)}
            </select>
          </label>
        )}
        {kind === "range" && (
          <div className="grid grid-cols-2 gap-2 mt-1.5 px-1">
            {(["from", "to"] as const).map(side => (
              <label key={side} className="flex flex-col gap-1 font-sans text-[12px] font-semibold text-muted-foreground">
                {side === "from" ? "From" : "To"}
                <input type="date" value={range?.[side] ?? ""}
                  onChange={e => {
                    const next = { ...(range ?? {}), [side]: e.target.value || undefined };
                    setDate(facet, next.from || next.to ? next : null, true);
                  }}
                  className="h-9 rounded-[6px] border-[1.5px] border-input bg-card px-2 font-sans text-[13px] text-foreground" />
              </label>
            ))}
          </div>
        )}
      </>
    );
  };

  const ownerSelect = (cls: string) => team.length > 0 && (
    <select value={String(f.owner)} aria-label="Filter by owner" title="Filter by owner"
      onChange={e => { const v = e.target.value; onFiltersChange({ ...f, owner: v === "all" || v === "unassigned" ? v : Number(v) }); }}
      className={`${cls} rounded-[7px] border-[1.5px] px-2 font-sans text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${f.owner !== "all" ? "border-primary bg-accent text-primary" : "border-input bg-card text-foreground"}`}>
      <option value="all">All owners</option>
      <option value="unassigned">Unassigned</option>
      {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );

  /** A facet button that becomes its own chip once something is picked. */
  const facetButton = (facet: Facet) => {
    const open = openFacet === facet;
    const chip = chips.find(c => c.facet === facet);
    const c = open ? counts(facet) : new Map<string, number>();
    const trigger = (
      <PopoverTrigger asChild>
        <button type="button" data-facet-trigger={facet} className={chip ? `${CHIP_TEXT} hover:underline` : BTN} aria-haspopup="dialog">
          {chip ? (
            <span>{chip.text}</span>
          ) : (
            <>{FACET_LABELS[facet]}<ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" /></>
          )}
        </button>
      </PopoverTrigger>
    );
    return (
      <Popover key={facet} open={open} onOpenChange={o => openPopover(facet, o)} modal={false}>
        {chip ? (
          <span className={CHIP}>
            {trigger}
            <button type="button" data-chip-x={facet} aria-label={chip.aria} onClick={() => removeFacet(facet)} className={CHIP_X}>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : trigger}
        <PopoverContent align="start" sideOffset={popOffset} className="w-[300px] max-h-[min(70vh,520px)] overflow-y-auto p-0 bg-card border-border"
          aria-label={`Filter by ${FACET_LABELS[facet].toLowerCase()}`}
          // An outside click closes without taking focus back, so a quick chip
          // or a row can be clicked straight from an open filter.
          onCloseAutoFocus={e => { if (document.activeElement && document.activeElement !== document.body) e.preventDefault(); }}>
          <fieldset className="p-3 pb-2">
            <legend className={`${LEGEND} px-1 pb-1`}>{FACET_LABELS[facet]}</legend>
            {facet === "status" ? statusList(c)
              : facet === "date" ? dateChoice("date", c, { idPrefix: "pop" })
              : checkList(facet, c)}
          </fieldset>
          <div className="border-t border-border px-3 py-1.5 flex justify-end">
            <button type="button" onClick={() => onFiltersChange(clearFacet(f, facet))} disabled={!isFacetActive(f, facet)}
              className="h-8 px-2 font-sans text-[13px] font-bold text-primary underline underline-offset-[3px] disabled:no-underline disabled:text-muted-foreground disabled:cursor-default">
              Clear
            </button>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const moreFacets = MORE_FACETS.filter(k => k !== "lostReason" || showLostReason);
  const moreButton = () => {
    const open = openFacet === "more";
    return (
      <Popover open={open} onOpenChange={o => openPopover("more", o)} modal={false}>
        <PopoverTrigger asChild>
          <button type="button" data-facet-trigger="more" className={BTN} aria-haspopup="dialog">
            More<ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={popOffset} className="w-[320px] max-h-[min(70vh,560px)] overflow-y-auto p-0 bg-card border-border" aria-label="More filters"
          onCloseAutoFocus={e => { if (document.activeElement && document.activeElement !== document.body) e.preventDefault(); }}>
          {open && moreFacets.map(facet => {
            const c = counts(facet);
            const active = isFacetActive(f, facet);
            return (
              <details key={facet} open={active || undefined} className="border-b border-border last:border-b-0 group">
                <summary className="flex items-center gap-2 min-h-[40px] px-3 cursor-pointer font-sans text-[13.5px] font-semibold text-foreground list-none [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground -rotate-90 group-open:rotate-0 transition-transform" aria-hidden="true" />
                  {FACET_LABELS[facet]}
                  {active && <span className="ml-auto font-sans text-[12px] font-bold text-primary">On</span>}
                </summary>
                <fieldset className="px-3 pb-2">
                  <legend className="sr-only">{FACET_LABELS[facet]}</legend>
                  {facet === "came" ? dateChoice("came", c, { idPrefix: "pop" }) : checkList(facet, c)}
                </fieldset>
              </details>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  };

  const chipRow = (list: typeof chips, opts: { phone?: boolean } = {}) => list.map(c => (
    <span key={c.facet} className={CHIP}>
      {opts.phone ? (
        <button type="button" onClick={() => setSheetOpen(true)} className={`${CHIP_TEXT} text-[12.5px]`}>{c.text}</button>
      ) : (
        <span className={CHIP_TEXT}>{c.text}</span>
      )}
      <button type="button" data-chip-x={c.facet} aria-label={c.aria} onClick={() => removeFacet(c.facet)} className={CHIP_X}>
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </span>
  ));
  const clearAllButton = (
    <button type="button" onClick={clearAll}
      className="h-9 px-1.5 font-sans text-[13px] font-bold text-primary underline underline-offset-[3px] whitespace-nowrap">
      Clear all
    </button>
  );

  // Phone chips: two lines at most, then "+N more" (opens the sheet).
  const PHONE_CHIP_MAX = 3;
  const phoneChips = chips.slice(0, chips.length > PHONE_CHIP_MAX + 1 ? PHONE_CHIP_MAX : chips.length);
  const phoneHidden = chips.length - phoneChips.length;

  return (
    <div ref={barRef} className="px-3 md:px-4 pb-3">
      <div className="flex items-center gap-2 flex-wrap gap-y-2">
        {/* One search box for every layout (keyboard shortcuts find it by data-search-box). */}
        <div className="relative min-w-0 grow basis-[240px] @min-[720px]:grow-0 @min-[720px]:w-[300px] @min-[1100px]:w-[360px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
          <input ref={searchRef} type="search" value={state.q} onChange={e => onQChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape" && state.q) { e.preventDefault(); e.stopPropagation(); onQChange(""); } }}
            aria-label="Search enquiries" data-search-box autoComplete="off"
            placeholder="Search name, email, phone, company…"
            className="w-full h-10 @min-[720px]:h-9 pl-8 pr-9 rounded-[7px] border-[1.5px] border-input bg-card font-sans text-[16px] @min-[720px]:text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-search-cancel-button]:hidden" />
          {state.q && (
            <button type="button" aria-label="Clear search" onClick={() => { onQChange(""); searchRef.current?.focus(); }}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Narrow: one Filters button, the chips on their own row below. */}
        <button type="button" onClick={() => setSheetOpen(true)} aria-haspopup="dialog"
          aria-label={nActive ? `Filters, ${nActive} active` : "Filters"}
          className={`@min-[720px]:hidden inline-flex items-center gap-1.5 h-10 px-3 rounded-[7px] border-[1.5px] font-sans text-[14px] font-bold whitespace-nowrap ${nActive ? "border-primary bg-accent text-primary" : "border-input bg-card text-foreground"}`}>
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />Filters{nActive ? ` · ${nActive}` : ""}
        </button>

        {/* Wide: a button per filter; each turns into its chip. */}
        <div className="hidden @min-[720px]:contents">
          {mode === "list" && facetButton("status")}
          {facetButton("date")}
          {facetButton("space")}
          {facetButton("source")}
          {ownerSelect("h-9 w-36")}
          {moreButton()}
          {chipRow(chips.filter(c => MORE_FACETS.includes(c.facet)))}
          {nActive > 0 && clearAllButton}
        </div>
      </div>

      {nActive > 0 && (
        <div className="@min-[720px]:hidden flex flex-wrap items-center gap-1.5 mt-2">
          {chipRow(phoneChips, { phone: true })}
          {phoneHidden > 0 && (
            <button type="button" onClick={() => setSheetOpen(true)} className="h-9 px-2 font-sans text-[13px] font-bold text-primary">+{phoneHidden} more</button>
          )}
          {clearAllButton}
        </div>
      )}

      <FilterSheet open={sheetOpen} onOpenChange={setSheetOpen} shownCount={props.shownCount} onClearAll={() => onFiltersChange(mode === "board" ? { ...clearFilters(), status: f.status } : clearFilters())}
        anyActive={nActive > 0}>
        {sheetOpen && (
          <>
            {mode === "list" && (
              <SheetSection title="Status">
                <ToggleChips options={options("status", counts("status"))} onToggle={o => toggle("status", o)} />
              </SheetSection>
            )}
            <SheetSection title="Event date" fieldset>
              {dateChoice("date", counts("date"), { columns: true, idPrefix: "sheet" })}
            </SheetSection>
            <SheetSection title="Space"><ToggleChips options={options("space", counts("space"))} onToggle={o => toggle("space", o)} /></SheetSection>
            <SheetSection title="Source"><ToggleChips options={options("source", counts("source"))} onToggle={o => toggle("source", o)} /></SheetSection>
            {team.length > 0 && <SheetSection title="Owner">{ownerSelect("h-10 w-full")}</SheetSection>}
            <SheetSection title="Needs"><ToggleChips options={options("needs", counts("needs"))} onToggle={o => toggle("needs", o)} /></SheetSection>
            <SheetSection title="Event type"><ToggleChips options={options("type", counts("type"))} onToggle={o => toggle("type", o)} /></SheetSection>
            <SheetSection title="Guests"><ToggleChips options={options("guests", counts("guests"))} onToggle={o => toggle("guests", o)} /></SheetSection>
            <SheetSection title="Budget"><ToggleChips options={options("budget", counts("budget"))} onToggle={o => toggle("budget", o)} /></SheetSection>
            <SheetSection title="Came in" fieldset>{dateChoice("came", counts("came"), { columns: true, idPrefix: "sheet" })}</SheetSection>
            {showLostReason && (
              <SheetSection title="Lost reason"><ToggleChips options={options("lostReason", counts("lostReason"))} onToggle={o => toggle("lostReason", o)} /></SheetSection>
            )}
            <SheetSection title="Client"><ToggleChips options={options("client", counts("client"))} onToggle={o => toggle("client", o)} /></SheetSection>
          </>
        )}
      </FilterSheet>
    </div>
  );
}

function SheetSection({ title, fieldset, children }: { title: string; fieldset?: boolean; children: React.ReactNode }) {
  const id = React.useId();
  if (fieldset) {
    return (
      <fieldset className="py-3 border-b border-border last:border-b-0">
        <legend className={`${LEGEND} float-left w-full mb-2`}>{title}</legend>
        <div className="clear-both">{children}</div>
      </fieldset>
    );
  }
  return (
    <section aria-labelledby={id} className="py-3 border-b border-border last:border-b-0">
      <h3 id={id} className={`${LEGEND} mb-2`}>{title}</h3>
      {children}
    </section>
  );
}

function ToggleChips({ options, onToggle }: { options: Option[]; onToggle: (o: Option) => void }) {
  if (options.length === 0) return <p className="font-sans text-[13px] text-muted-foreground">None yet.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button key={o.key} type="button" aria-pressed={o.on} onClick={() => onToggle(o)}
          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-[1.5px] font-sans text-[13.5px] font-semibold transition-colors ${o.on ? "border-primary bg-primary text-primary-foreground forced-colors:border-[CanvasText]" : "border-input bg-card text-foreground"}`}>
          {o.label}
          <span className={`font-bold text-[12px] ${o.on ? "text-primary-foreground" : "text-muted-foreground"}`}>{o.count}</span>
        </button>
      ))}
    </div>
  );
}

/** The phone's filter sheet: a bottom sheet on the app's dialog (it takes focus and gives it back to Filters). */
function FilterSheet({ open, onOpenChange, shownCount, onClearAll, anyActive, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; shownCount: number; onClearAll: () => void; anyActive: boolean; children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} aria-describedby={undefined}
        className="top-auto bottom-0 left-0 translate-x-0 translate-y-0 w-full max-w-none sm:max-w-none max-h-[85vh] rounded-none rounded-t-xl p-0 gap-0 flex flex-col border-x-0 border-b-0 bg-card data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-bottom-8">
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5 border-b border-border">
          <DialogTitle className="font-serif text-[21px] font-semibold text-foreground">Filter enquiries</DialogTitle>
          <DialogClose aria-label="Close filters" className="w-10 h-10 grid place-items-center rounded-[7px] border-[1.5px] border-border bg-card text-foreground">
            <X className="w-4 h-4" aria-hidden="true" />
          </DialogClose>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4">{children}</div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-card">
          <button type="button" onClick={onClearAll} disabled={!anyActive}
            className="h-11 px-4 rounded-[7px] border-[1.5px] border-input bg-card font-sans text-[14px] font-bold text-foreground disabled:text-muted-foreground">
            Clear all
          </button>
          <DialogClose className="flex-1 h-11 rounded-[7px] bg-primary font-sans text-[14px] font-bold text-primary-foreground">
            Show {shownCount} {shownCount === 1 ? "enquiry" : "enquiries"}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
