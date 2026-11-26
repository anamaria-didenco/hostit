import React from "react";
import { CornerUpLeft, Send, ArrowRight, AlertTriangle } from "lucide-react";
import { enquiryAction } from "@shared/enquirySignal";
import {
  daysBetweenKeys, formatDayKey, isOpenStatus, rowDatePassed, sourceLabel,
  type ListCtx, type ListRow,
} from "@shared/enquiryFilters";
import { LANE_INK, LANE_MARK, LANE_TINT, rowLane, type Lane } from "@shared/enquiryLane";
import { statusPalette } from "@shared/statusPalette";
import { eventFormatLabel, budgetRangeLabel } from "@shared/formFields";
import { formatEventTime } from "@shared/eventDate";
import { clientFlagLabels } from "@shared/clientMatch";
import { LeadRowBadges } from "@/components/LeadClientPanel";

/**
 * One enquiry in the list. A single element (the list's focus keeper counts
 * its rows by the list's direct children), holding both layouts, one of them
 * display:none by the width of the list's column:
 *
 *  - a table row from 768px of column width: Needs · Name · Status · Event
 *    date · Guests · Space · Came in · Reply/Nudge (fewer columns when
 *    narrower: Guests and Space fold into the other cells below 992px, Came in
 *    only shows from 1148px);
 *  - a two-line card below that.
 *
 * Plus, inside the same element: a group heading when this row starts one
 * ("November 2026 · 9"), the "kept while you reply" note, and whatever the
 * list puts under the row (the quick reply, "Moved to … · Undo").
 *
 * Colour (shared/enquiryLane.ts, shared/statusPalette.ts): the row has no
 * fill. Its lane (what to do next) is the loud colour: a band down the left
 * edge and a dot + words in the first column. Its status keeps the venue's
 * own colour as a quieter pill. Every mark is a border, so forced colours
 * (Windows High Contrast) still draw it, and the words always carry the
 * meaning.
 */

// Column templates. Widths follow the spec; the name column's minimum is
// smaller with the select column so nothing runs off the row at the narrow
// end of each range. Every layout ends with the 84px action column.
// (No "grid" here: TABLE_ONLY switches the display, by width.)
export const ROW_GRID = [
  "items-center gap-x-2.5",
  "grid-cols-[140px_minmax(150px,1fr)_116px_132px_84px]",
  "@min-[992px]:grid-cols-[150px_minmax(200px,1fr)_120px_116px_52px_120px_84px]",
  "@min-[1148px]:gap-x-3 @min-[1148px]:grid-cols-[156px_minmax(220px,1fr)_124px_120px_56px_128px_92px_84px]",
].join(" ");
export const ROW_GRID_SELECT = [
  "items-center gap-x-2.5",
  "grid-cols-[32px_140px_minmax(120px,1fr)_116px_132px_84px]",
  "@min-[992px]:grid-cols-[36px_150px_minmax(150px,1fr)_120px_116px_52px_120px_84px]",
  "@min-[1148px]:gap-x-3 @min-[1148px]:grid-cols-[36px_156px_minmax(170px,1fr)_124px_120px_56px_128px_92px_84px]",
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

/** "No date": a dark amber chosen for 4.5:1 on every row surface. */
const NO_DATE = "#6b4710";

// The Reply / Nudge / Open buttons' icons.
const ICON: Record<string, React.ComponentType<any>> = { "corner-up-left": CornerUpLeft, send: Send, "arrow-right": ArrowRight };
function Icon({ name, size = 13, className }: { name: string; size?: number; className?: string }) {
  const C = ICON[name] ?? ArrowRight;
  return <C style={{ width: size, height: size }} className={className} strokeWidth={2.2} aria-hidden="true" />;
}

/**
 * The lane's dot. Drawn as a border, not a fill, so forced colours still show
 * it; the words beside it carry the meaning. A calm lane (nothing due) is a
 * hollow ring in the text colour.
 */
export function LaneDot({ lane, size = 9, className = "" }: { lane: Lane; size?: number; className?: string }) {
  const style: React.CSSProperties = lane === "calm"
    ? { width: size, height: size, border: "1.5px solid currentColor" }
    : { width: size, height: size, border: `${size / 2}px solid ${LANE_MARK[lane]}` };
  return <span aria-hidden="true" data-lane-dot className={`inline-block shrink-0 rounded-full ${className}`} style={style} />;
}

/**
 * A status in the venue's own colour (Settings > Statuses) as a quiet pill:
 * light tint, dark ink of the same hue, and an outline that shows on any row
 * (shared/statusPalette.ts clamps all three). No dot: a row has one, the lane's.
 */
export function StatusPill({ label, colour, className = "" }: { label: string; colour: string; className?: string }) {
  const p = statusPalette(colour);
  return (
    <span data-cell="status" className={`inline-flex items-center max-w-full min-h-[18px] px-[7px] rounded-full border font-sans text-[12.5px] leading-[14px] font-semibold [overflow-wrap:anywhere] ${className}`}
      style={{ background: p.tint, borderColor: p.outline, color: p.ink }}>
      {label}
    </span>
  );
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
  /** The heading's colour: its section's lane, or calm (neutral) when its rows mix lanes. */
  dividerLane?: Lane;
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
  const lane = rowLane(row, ctx);
  const laneInk = LANE_INK[lane.lane];
  const action = enquiryAction(signal.group);
  const hasAction = action.reply;
  const si = statusInfo(lead.status);
  const pal = statusPalette(si.dot);
  const clash = !!row.clash || signal.kind === "clash";
  const passed = isOpenStatus(lead.status) && rowDatePassed(row, ctx);
  const dated = !!row.eventDay;
  const dateText = dated ? formatDayKey(row.eventDay, today) : lead.dateFlexible ? "Date TBC" : "No date";
  // On a card the year is the extra word, so the weekday goes instead.
  const cardDateText = dated && row.eventDay.slice(0, 4) !== today.slice(0, 4) ? formatDayKey(row.eventDay, today, { weekday: false }) : dateText;
  // The date turns red when it is what's wrong: a clash (a booking's too,
  // though its lane stays green) or a passed date on a red row.
  const dateInk = clash || (passed && lane.lane === "red") ? LANE_INK.red : !dated ? NO_DATE : "var(--foreground)";
  const time = formatEventTime(lead.eventDate as any, ctx.tz);
  const guests = Number(lead.guestCount) > 0 ? Number(lead.guestCount) : null;
  const space = String(lead.spaceName ?? "").trim() || (lead.spaceId != null ? ctx.spaceNames?.get(Number(lead.spaceId)) ?? "" : "");
  const source = String(lead.source ?? "").trim().toLowerCase();
  const sub = [lead.company, lead.eventType, eventFormatLabel((lead as any).eventFormat)].filter(Boolean).join(" · ");
  const budget = budgetText(lead);
  const cbId = `enq-select-${lead.id}`;
  const actionLabel = `${action.label}${action.label === "Reply" ? " to" : ""} ${name}`;

  // No fill on any row. The lane shows as a 5px band down the left edge,
  // stopping 3px short of the top and bottom so a run of rows in one lane
  // reads as separate marks; calm rows have none. A selected row takes a
  // light wash of the primary colour and a primary outline (blue tint + blue
  // border); its band keeps the lane. Hover is a muted wash (the gold
  // accents of some themes took text under 4.5:1).
  const bg = selected ? "bg-primary/[0.13]" : "bg-card hover:bg-muted/70";
  const band = lane.lane === "calm" ? null : LANE_MARK[lane.lane];
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
    <span className="whitespace-nowrap font-semibold" style={{ color: LANE_INK.red }}>
      <AlertTriangle className="inline-block w-3 h-3 -mt-0.5 mr-0.5" strokeWidth={2.4} aria-hidden="true" />Date clash
    </span>
  );

  // Under the event date: the time, a date warning, and (on M, where there
  // is no Guests column) the guest count. Each part keeps its separator, so
  // the guests' one goes with them.
  const dateLine2: { key: string; node: React.ReactNode; cls?: string }[] = [];
  if (time) dateLine2.push({ key: "t", node: time, cls: "whitespace-nowrap" });
  // When the lane already says "Date clash" / "Date passed" (first column,
  // in red), the words aren't repeated here; the date itself is red.
  if (clash) { if (lane.text !== "Date clash") dateLine2.push({ key: "c", node: clashMark }); }
  else if (passed && lane.text !== "Date passed") dateLine2.push({ key: "p", node: "Date passed", cls: "whitespace-nowrap" });
  if (guests != null) dateLine2.push({ key: "g", node: `${guests} guests`, cls: `${BELOW_L} whitespace-nowrap` });


  return (
    <div className={`relative border-b border-border last:border-b-0 ${replying ? "z-[1]" : ""}`}
      style={replying ? { outline: "1.5px solid var(--primary)", outlineOffset: "-1.5px" } : undefined}>
      {divider && (!props.dividerLane || props.dividerLane === "calm" ? (
        <div role="heading" aria-level={3}
          className="flex items-center h-7 pl-[15px] pr-3 border-b border-border bg-muted font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
          {divider.label} · {divider.count}
        </div>
      ) : (
        // A section's colour: the lane's wash over the card (a background
        // image, which forced colours drop) and a full-height 5px rule (a
        // border, which they keep). Full height, so it never looks like a row.
        <div role="heading" aria-level={3}
          className="flex items-center gap-2 h-7 pl-[10px] pr-3 border-b border-border font-sans text-[11px] font-extrabold uppercase tracking-[0.14em]"
          style={{
            color: LANE_INK[props.dividerLane], borderLeft: `5px solid ${LANE_MARK[props.dividerLane]}`,
            backgroundColor: "var(--card)", backgroundImage: `linear-gradient(${LANE_TINT[props.dividerLane]}, ${LANE_TINT[props.dividerLane]})`,
          }}>
          <LaneDot lane={props.dividerLane} size={8} />
          <span>{divider.label} · {divider.count}</span>
        </div>
      ))}

      <div className={`relative ${bg} transition-colors`}
        style={selected ? { outline: "1.5px solid var(--primary)", outlineOffset: "-1.5px" } : undefined}>
        {band && <span aria-hidden="true" data-lane-band className="absolute left-0 top-[3px] bottom-[3px] w-0 rounded-r-[2px] z-[1]" style={{ borderLeft: `5px solid ${band}` }} />}

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

          {/* What to do next: the lane's dot and words, first, so the eye
              runs down one column of colour. A red clash or passed date puts
              the Needs line under it. Wraps, never cut off. */}
          <div className="min-w-0 font-sans text-[12.5px] leading-4">
            <div className="flex items-start gap-[6px] font-bold" style={{ color: laneInk }}>
              <LaneDot lane={lane.lane} className="mt-[3.5px]" />
              <span data-cell="needs" className="min-w-0 [overflow-wrap:anywhere]">{lane.text}</span>
            </div>
            {lane.sub && <div className="pl-[15px] text-[12px] font-semibold text-muted-foreground [overflow-wrap:anywhere]">{lane.sub}</div>}
          </div>

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

          {/* Status in the venue's colour, as a quiet pill; budget under it. */}
          <div className="min-w-0 flex flex-col items-start">
            <StatusPill label={si.label} colour={si.dot} />
            {budget && <div className="pl-2 font-sans text-[12px] leading-4 text-muted-foreground whitespace-nowrap">{budget}</div>}
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
          className={`${CARDS_ONLY} flex items-center gap-2 min-h-[59px] py-1.5 pl-[15px] pr-2.5 ${selectMode ? "" : "cursor-pointer"}`}>
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
                {/* The lane's dot and words; the status as an inline pill (in
                    place of the "·" before it, so the line is no wider);
                    guests; and on a red clash or passed date, the Needs line. */}
                <span className="block mt-0.5 font-sans text-[12px] leading-4 text-muted-foreground">
                  <span className="whitespace-nowrap font-bold" style={{ color: laneInk }}>
                    <LaneDot lane={lane.lane} size={8} className="mr-[5px] -mt-px align-middle" />{lane.text}
                  </span>{" "}
                  <span className="font-semibold rounded-[4px] px-[3px] border [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
                    style={{ background: pal.tint, borderColor: pal.outline, color: pal.ink }}>{si.label}</span>
                  {guests != null && <>{" "}<span className="whitespace-nowrap"><span aria-hidden="true">· </span>{guests} guests</span></>}
                  {lane.sub ? <>{" "}<span className="whitespace-nowrap"><span aria-hidden="true">· </span>{lane.sub}</span></>
                    : clash && lane.text !== "Date clash" ? <>{" "}<span className="whitespace-nowrap"><span aria-hidden="true">· </span>{clashMark}</span></>
                    : passed && lane.text !== "Date passed" ? <>{" "}<span className="whitespace-nowrap"><span aria-hidden="true">· </span>Date passed</span></> : null}
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
