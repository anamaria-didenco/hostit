import React from "react";
import {
  Clock, Bell, Hourglass, CornerUpLeft, Send, ArrowRight, CalendarClock,
  CircleDashed, AlertTriangle, CheckCircle2, MinusCircle,
} from "lucide-react";
import { enquiryAction, type SignalTone } from "@shared/enquirySignal";
import {
  daysBetweenKeys, formatDayKey, isOpenStatus, rowDatePassed, rowNeeds, sourceLabel,
  type ListCtx, type ListRow,
} from "@shared/enquiryFilters";
import { eventFormatLabel, budgetRangeLabel } from "@shared/formFields";
import { formatEventTime } from "@shared/eventDate";
import { clientFlagLabels } from "@shared/clientMatch";
import { LeadRowBadges } from "@/components/LeadClientPanel";

/**
 * One enquiry in the list. A single element (the list's focus keeper counts
 * its rows by the list's direct children), holding both layouts, one of them
 * display:none by the width of the list's column:
 *
 *  - a table row from 768px of column width: Name · Needs · Status · Event
 *    date · Guests · Space · Came in · Reply/Nudge (fewer columns when
 *    narrower: Guests and Space fold into the other cells below 992px, Came in
 *    only shows from 1148px);
 *  - a two-line card below that.
 *
 * Plus, inside the same element: a group heading when this row starts one
 * ("November 2026 · 9"), the "kept while you reply" note, and whatever the
 * list puts under the row (the quick reply, "Moved to … · Undo").
 */

// Column templates. Widths follow the spec; the name column's minimum is
// smaller with the select column so nothing runs off the row at the narrow
// end of each range. Every layout ends with the 84px action column.
// (No "grid" here: TABLE_ONLY switches the display, by width.)
export const ROW_GRID = [
  "items-center gap-x-2.5",
  "grid-cols-[minmax(150px,1fr)_140px_116px_132px_84px]",
  "@min-[992px]:grid-cols-[minmax(200px,1fr)_150px_120px_116px_52px_120px_84px]",
  "@min-[1148px]:gap-x-3 @min-[1148px]:grid-cols-[minmax(220px,1fr)_156px_124px_120px_56px_128px_92px_84px]",
].join(" ");
export const ROW_GRID_SELECT = [
  "items-center gap-x-2.5",
  "grid-cols-[32px_minmax(120px,1fr)_140px_116px_132px_84px]",
  "@min-[992px]:grid-cols-[36px_minmax(150px,1fr)_150px_120px_116px_52px_120px_84px]",
  "@min-[1148px]:gap-x-3 @min-[1148px]:grid-cols-[36px_minmax(170px,1fr)_156px_124px_120px_56px_128px_92px_84px]",
].join(" ");
/** Cells shown from the L layout (992px) up: Guests and Space. */
export const FROM_L = "hidden @min-[992px]:block";
/** Shown only below L (folded into another cell). */
export const BELOW_L = "@min-[992px]:hidden";
/** Came in: XL only. */
export const FROM_XL = "hidden @min-[1148px]:block";
/** Table from 768px of column width, cards below. */
export const TABLE_ONLY = "hidden @min-[768px]:grid";
export const CARDS_ONLY = "@min-[768px]:hidden";

/**
 * Text colours for the Needs line and the clash date (rows and Board cards).
 * They are a shade darker than the old signal chips' colours (#c0392b red,
 * #8a5f18 amber, #3f7350 green): the chips had their own light fill, these
 * sit straight on the row, and a New Enquiry row's blue tint took those under
 * 4.5:1 (4.1-4.3). Each passes 4.5:1 on the card, the New Enquiry tint and a
 * selected row. Gray is the theme's own muted ink.
 */
export const ROW_INK: Record<SignalTone, string> = {
  red: "#a93226",
  amber: "#7a5414",
  blue: "#2f5488",
  green: "#36643f",
  gray: "var(--muted-foreground)",
};
const NO_DATE = "#6b4710";

const ICON: Record<string, React.ComponentType<any>> = {
  "circle-check": CheckCircle2, "circle-minus": MinusCircle, "circle-dashed": CircleDashed,
  "corner-up-left": CornerUpLeft, clock: Clock, bell: Bell, hourglass: Hourglass,
  "calendar-clock": CalendarClock, "triangle-alert": AlertTriangle, "arrow-right": ArrowRight,
  send: Send,
};
export function Icon({ name, size = 13, className }: { name: string; size?: number; className?: string }) {
  const C = ICON[name] ?? ArrowRight;
  return <C style={{ width: size, height: size }} className={className} strokeWidth={2.2} aria-hidden="true" />;
}

export const fullName = (lead: any) => [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
const displayName = (lead: any) => fullName(lead) || lead.email || "No name";

/** "$6,200" when a figure was given, else the form's bracket ("$5–10k"), else "". */
function budgetText(lead: any): string {
  const n = Number(lead.budget);
  if (Number.isFinite(n) && n > 0) return `$${Math.round(n).toLocaleString("en-NZ")}`;
  return budgetRangeLabel(lead.budgetRange) ?? "";
}

/** "Today", "Yesterday", "20 days ago", "3 months ago". */
function agoText(fromKey: string, today: string): string {
  if (!fromKey) return "";
  const d = daysBetweenKeys(fromKey, today);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 60) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  const y = Math.floor(d / 365);
  return y === 1 ? "Over a year ago" : `${y} years ago`;
}

function hasBadges(lead: any, teamById?: Map<number, { name: string }>): boolean {
  const l = clientFlagLabels(lead.clientFlag);
  return !!(l.returning || l.duplicate) || (lead.assignedTo != null && !!teamById?.get(lead.assignedTo));
}

export interface EnquiryRowProps {
  row: ListRow;
  ctx: ListCtx;
  /** Today's venue day ("2026-11-17"). */
  today: string;
  statusInfo: (status: string | null | undefined) => { label: string; dot: string };
  teamById?: Map<number, { name: string }>;
  /** This row starts a group: its heading. */
  divider?: { label: string; count: number } | null;
  onOpen: (lead: any) => void;
  /** Reply / Nudge. */
  onAction: (e: React.MouseEvent, row: ListRow) => void;
  replying: boolean;
  /** Shown only because a reply to it is being written. */
  keptForReply: boolean;
  selectMode: boolean;
  selected: boolean;
  /** A row's box was ticked or unticked; shift = Shift was held (a range). */
  onSelect: (id: number, checked: boolean, shift: boolean) => void;
  /** The quick reply and the "Moved to … · Undo" note. */
  children?: React.ReactNode;
}

function EnquiryRowImpl(props: EnquiryRowProps) {
  const { row, ctx, today, statusInfo, teamById, divider, onOpen, onAction, replying, keptForReply, selectMode, selected, onSelect } = props;
  const { lead, signal } = row;
  const name = displayName(lead);
  const needs = rowNeeds(row, ctx);
  const needsInk = ROW_INK[needs.tone];
  const action = enquiryAction(signal.group);
  const hasAction = action.reply;
  const si = statusInfo(lead.status);
  const isNew = String(lead.status ?? "").toLowerCase() === "new";
  const clash = !!row.clash || signal.kind === "clash";
  const passed = isOpenStatus(lead.status) && rowDatePassed(row, ctx);
  const dated = !!row.eventDay;
  const dateText = dated ? formatDayKey(row.eventDay, today) : lead.dateFlexible ? "Date TBC" : "No date";
  // On a card the year is the extra word, so the weekday goes instead.
  const cardDateText = dated && row.eventDay.slice(0, 4) !== today.slice(0, 4) ? formatDayKey(row.eventDay, today, { weekday: false }) : dateText;
  const dateInk = clash ? ROW_INK.red : !dated ? NO_DATE : "var(--foreground)";
  const time = formatEventTime(lead.eventDate as any, ctx.tz);
  const guests = Number(lead.guestCount) > 0 ? Number(lead.guestCount) : null;
  const space = String(lead.spaceName ?? "").trim() || (lead.spaceId != null ? ctx.spaceNames?.get(Number(lead.spaceId)) ?? "" : "");
  const source = String(lead.source ?? "").trim().toLowerCase();
  const sub = [lead.company, lead.eventType, eventFormatLabel((lead as any).eventFormat)].filter(Boolean).join(" · ");
  const budget = budgetText(lead);
  const cbId = `enq-select-${lead.id}`;
  const actionLabel = `${action.label}${action.label === "Reply" ? " to" : ""} ${name}`;

  // Colour is the second cue only: a 3px bar in the status colour. Only a New
  // Enquiry keeps a fill (the tint server/themeContrast.test.ts checks). A
  // selected row takes a light wash of the primary colour (close to the accent
  // blue on the default theme; the gold accents of other themes would take
  // muted text under 4.5:1) and its bar turns primary.
  const bg = selected ? "bg-primary/[0.13]" : isNew ? "bg-[#2f54882b]" : "bg-card hover:bg-accent/50";
  const bar = selected ? "var(--primary)" : si.dot;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // Shift held on the box's cell, for a range (a label's click on the box
  // doesn't always carry the modifier through).
  const shiftDown = React.useRef(false);
  const checkbox = (cls: string) => (
    <input id={cbId} type="checkbox" checked={selected} aria-label={`Select ${name}`}
      onChange={() => { /* handled on click, which knows about Shift */ }}
      onClick={(e) => { onSelect(lead.id, e.currentTarget.checked, e.shiftKey || shiftDown.current); shiftDown.current = false; }}
      className={`${cls} accent-[var(--primary)] cursor-pointer`} />
  );

  const actionButton = (cls: string, size: number) => hasAction && (
    <button type="button" onClick={(e) => { e.stopPropagation(); onAction(e, row); }}
      aria-label={actionLabel} aria-expanded={replying}
      className={`${cls} inline-flex items-center justify-center gap-1.5 rounded-[6px] font-sans font-bold whitespace-nowrap border-[1.5px] transition-colors ${action.primary ? "bg-primary border-primary text-primary-foreground hover:opacity-90" : "bg-card border-input text-foreground hover:border-primary"}`}>
      <Icon name={action.icon} size={size} />{action.label}
    </button>
  );

  const clashMark = (
    <span className="whitespace-nowrap font-semibold" style={{ color: ROW_INK.red }}>
      <AlertTriangle className="inline-block w-3 h-3 -mt-0.5 mr-0.5" strokeWidth={2.4} aria-hidden="true" />Date clash
    </span>
  );

  // Under the event date: the time, a date warning, and (on M, where there
  // is no Guests column) the guest count. Each part keeps its separator, so
  // the guests' one goes with them.
  const dateLine2: { key: string; node: React.ReactNode; cls?: string }[] = [];
  if (time) dateLine2.push({ key: "t", node: time, cls: "whitespace-nowrap" });
  if (clash) dateLine2.push({ key: "c", node: clashMark });
  else if (passed) dateLine2.push({ key: "p", node: "Date passed", cls: "whitespace-nowrap" });
  if (guests != null) dateLine2.push({ key: "g", node: `${guests} guests`, cls: `${BELOW_L} whitespace-nowrap` });


  return (
    <div className={`relative border-b border-border last:border-b-0 ${replying ? "z-[1]" : ""}`}
      style={replying ? { outline: "1.5px solid var(--primary)", outlineOffset: "-1.5px" } : undefined}>
      {divider && (
        <div role="heading" aria-level={3}
          className="flex items-center h-7 pl-[15px] pr-3 border-b border-border bg-muted font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          {divider.label} · {divider.count}
        </div>
      )}

      <div className={`relative ${bg} transition-colors`}>
        <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: bar }} />

        {/* ── Table row. A click anywhere opens it; for the keyboard the name
            is the button, so Reply isn't nested inside another button. ── */}
        <div onClick={() => onOpen(lead)}
          className={`${TABLE_ONLY} ${selectMode ? ROW_GRID_SELECT : ROW_GRID} min-h-[47px] py-1.5 pl-[15px] pr-3 cursor-pointer`}>
          {selectMode && (
            <label onClick={stop} onMouseDown={(e) => { shiftDown.current = e.shiftKey; }}
              className="-my-1.5 self-stretch flex items-center justify-center cursor-pointer">
              {checkbox("w-4 h-4")}
            </label>
          )}

          {/* Name, then badges and company · type · format (· space on M). */}
          <div className="min-w-0">
            <button type="button" data-cell="name" onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
              className="block max-w-full text-left font-serif text-[15.5px] leading-[19px] font-semibold [overflow-wrap:anywhere] hover:underline"
              style={{ color: "#211d18" }}>
              {name}
            </button>
            {(sub || space || hasBadges(lead, teamById)) && (
              <div className="flex items-center gap-1.5 min-w-0 font-sans text-[12.5px] leading-4 text-muted-foreground"
                title={[sub, space].filter(Boolean).join(" · ") || undefined}>
                <span className="shrink-0 empty:hidden [&_span]:!py-0 [&_span]:!h-4 [&_span]:!leading-[14px]"><LeadRowBadges lead={lead} teamById={teamById} /></span>
                <span className="min-w-0 truncate">
                  {sub}
                  {space && <span className={BELOW_L}>{sub ? " · " : ""}{space}</span>}
                </span>
              </div>
            )}
          </div>

          {/* Needs: what it needs from you. Wraps, never cut off. */}
          <div className="min-w-0 flex items-start gap-[5px] font-sans text-[12.5px] leading-4 font-bold" style={{ color: needsInk }}>
            <Icon name={needs.icon} className="shrink-0 mt-[1.5px]" />
            <span data-cell="needs" className="min-w-0 [overflow-wrap:anywhere]">{needs.text}</span>
          </div>

          {/* Status in full ink, its colour as a dot; budget under it. */}
          <div className="min-w-0">
            <div className="flex items-center gap-[7px] font-sans text-[13px] leading-[17px] font-semibold text-foreground">
              <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: si.dot }} />
              <span data-cell="status" className="min-w-0 [overflow-wrap:anywhere]">{si.label}</span>
            </div>
            {budget && <div className="mt-px pl-[15px] font-sans text-[12px] leading-4 text-muted-foreground whitespace-nowrap">{budget}</div>}
          </div>

          {/* Event date; time and any date warning under it (· guests on M). */}
          <div className="min-w-0">
            <div data-cell="date" className="font-sans text-[13.5px] leading-[18px] font-bold whitespace-nowrap" style={{ color: dateInk }}>{dateText}</div>
            {dateLine2.length > 0 && (
              <div className="font-sans text-[12px] leading-4 text-muted-foreground whitespace-normal @min-[992px]:whitespace-nowrap">
                {dateLine2.map((p, i) => (
                  <span key={p.key} className={p.cls}>{i > 0 && <span aria-hidden="true"> · </span>}{p.node}</span>
                ))}
              </div>
            )}
          </div>

          {/* Guests (L and XL). */}
          <div className={`${FROM_L} text-right font-sans text-[13.5px] font-semibold tabular-nums text-foreground`}>
            {guests != null ? <>{guests}<span className="sr-only"> guests</span></> : <><span aria-hidden="true" className="text-muted-foreground">—</span><span className="sr-only">No guest count</span></>}
          </div>

          {/* Space, and where the enquiry came from (L and XL). */}
          <div className={`${FROM_L} min-w-0`}>
            <div className="font-sans text-[13px] leading-[17px] text-foreground truncate" title={space || undefined}>
              {space || <><span aria-hidden="true" className="text-muted-foreground">—</span><span className="sr-only">No space yet</span></>}
            </div>
            {source && source !== "none" && <div className="font-sans text-[12px] leading-4 text-muted-foreground truncate">via {sourceLabel(source)}</div>}
          </div>

          {/* Came in (XL). */}
          <div className={`${FROM_XL} min-w-0`}>
            <div className="font-sans text-[13px] leading-[17px] text-foreground whitespace-nowrap">
              <span className="sr-only">Came in </span>{row.cameDay ? formatDayKey(row.cameDay, today, { weekday: false }) : "—"}
            </div>
            {row.cameDay && <div className="font-sans text-[12px] leading-4 text-muted-foreground whitespace-nowrap">{agoText(row.cameDay, today)}</div>}
          </div>

          {/* Reply / Nudge, only where there is something to send. */}
          <div className="flex justify-end" onClick={hasAction ? stop : undefined}>
            {actionButton("h-8 px-3 text-[13px]", 14)}
          </div>
        </div>

        {/* ── Card (narrow). The text block is the card's button (Enter or
            Space only when it has focus itself); Reply is its sibling. In
            select mode the text block is the box's label instead. ── */}
        <div onClick={selectMode ? undefined : () => onOpen(lead)}
          className={`${CARDS_ONLY} flex items-center gap-2.5 min-h-[59px] py-[9px] pl-[15px] pr-2.5 ${selectMode ? "" : "cursor-pointer"}`}>
          {selectMode && (
            <span className="-ml-2 -my-1 w-11 h-11 shrink-0 grid place-items-center">
              {checkbox("w-5 h-5")}
            </span>
          )}
          {(() => {
            const inner = (
              <>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-serif text-[16.5px] leading-5 font-semibold [overflow-wrap:anywhere]" style={{ color: "#211d18" }}>{name}</span>
                  <span className="shrink-0 font-sans text-[13.5px] font-bold whitespace-nowrap" style={{ color: dateInk }}>{cardDateText}</span>
                </span>
                <span className="block mt-0.5 font-sans text-[12px] leading-[17px] text-muted-foreground">
                  <span className="whitespace-nowrap font-bold" style={{ color: needsInk }}>
                    <Icon name={needs.icon} size={12} className="inline-block -mt-0.5 mr-[3px]" />{needs.text}
                  </span>{" "}
                  <span className="whitespace-nowrap"><span aria-hidden="true">· </span><span className="font-semibold text-foreground">{si.label}</span></span>
                  {guests != null && <>{" "}<span className="whitespace-nowrap"><span aria-hidden="true">· </span>{guests} guests</span></>}
                  {clash ? <>{" "}<span className="whitespace-nowrap"><span aria-hidden="true">· </span>{clashMark}</span></>
                    : passed ? <>{" "}<span className="whitespace-nowrap"><span aria-hidden="true">· </span>Date passed</span></> : null}
                </span>
              </>
            );
            return selectMode ? (
              <label htmlFor={cbId} className="block flex-1 min-w-0 cursor-pointer">{inner}</label>
            ) : (
              <div role="button" tabIndex={0}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onOpen(lead); } }}
                className="block flex-1 min-w-0 rounded-[4px]">
                {inner}
              </div>
            );
          })()}
          {actionButton("h-11 min-w-[84px] px-3 text-[14px] shrink-0", 16)}
        </div>
      </div>

      {keptForReply && (
        <p className="pl-[15px] pr-3 pb-1.5 -mt-0.5 font-sans text-[12px] text-muted-foreground">Not in this view · kept while you reply</p>
      )}
      {props.children}
    </div>
  );
}

const EnquiryRow = React.memo(EnquiryRowImpl);
export default EnquiryRow;
