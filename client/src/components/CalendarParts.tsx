import React from "react";
import { AlertTriangle, CalendarDays, Plus } from "lucide-react";
import { holdState } from "@/components/DateHold";

/**
 * Calendar pieces for the redesigned Calendar tab: one signal colour per
 * meaning (red = clash / overdue, amber = on hold, blue = enquiry in progress,
 * green = confirmed), the legend that says so, and the selected-day panel.
 */

export type CalTone = "red" | "amber" | "blue" | "green" | "gray";

export const CAL_TONE: Record<CalTone, { fg: string; bg: string; border: string }> = {
  red: { fg: "#c0392b", bg: "#fbecea", border: "#f0c7c2" },
  amber: { fg: "#8a5f18", bg: "#f7efdd", border: "#e9d7b3" },
  blue: { fg: "#2f5488", bg: "#e8edf6", border: "#cdd8ea" },
  green: { fg: "#3f7350", bg: "#e8f0e6", border: "#c9dcc9" },
  gray: { fg: "#6b7078", bg: "#f4f4f5", border: "#e2e2e5" },
};

/** The one signal an event shows on the calendar, and what it means in words. */
export function calSignal(ev: any, opts: { isLead: boolean; overdue?: boolean; statusLabel: string }): { tone: CalTone; label: string } {
  const st = String(ev?.status ?? "");
  if (st === "cancelled" || st === "lost") return { tone: "gray", label: opts.statusLabel || "Cancelled" };
  if (!opts.isLead && ev?.clashFlaggedAt) return { tone: "red", label: "Double-booked" };
  if (opts.isLead && opts.overdue) return { tone: "red", label: "Follow-up overdue" };
  if (st === "tentative") return { tone: "amber", label: opts.isLead && holdState(ev) === "held" ? "On hold" : (opts.statusLabel || "On hold") };
  if (st === "booked" || st === "confirmed") return { tone: "green", label: opts.statusLabel || "Confirmed" };
  if (st === "finished") return { tone: "green", label: opts.statusLabel || "Finished" };
  return { tone: "blue", label: opts.statusLabel || "Enquiry" };
}

/** 7px dot + bold label in the signal colour. */
export function CalSig({ tone, children, className = "" }: { tone: CalTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-sans text-[13px] font-bold whitespace-nowrap ${className}`} style={{ color: CAL_TONE[tone].fg }}>
      <span aria-hidden className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: CAL_TONE[tone].fg }} />
      {children}
    </span>
  );
}

/** Inline style for a one-line event chip: white with a hairline, red-tinted when it clashes. */
export function calChipStyle(tone: CalTone): React.CSSProperties {
  return tone === "red"
    ? { background: CAL_TONE.red.bg, borderColor: CAL_TONE.red.border, color: "var(--foreground)" }
    : { background: "var(--card)", borderColor: "#e6e6e9", color: tone === "gray" ? "var(--muted-foreground)" : "var(--foreground)" };
}

export function CalDot({ tone, size = 6 }: { tone: CalTone; size?: number }) {
  return <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: size, height: size, background: CAL_TONE[tone].fg }} />;
}

/** The legend: four meanings (plus Cancelled when cancelled events are showing). */
export function CalendarLegend({ showCancelled }: { showCancelled: boolean }) {
  const items: { tone: CalTone; label: string }[] = [
    { tone: "green", label: "Confirmed" },
    { tone: "blue", label: "Enquiry / proposal" },
    { tone: "amber", label: "On hold" },
    { tone: "red", label: "Clash / overdue" },
  ];
  if (showCancelled) items.push({ tone: "gray", label: "Cancelled" });
  return (
    <div
      role="region"
      aria-label="Status colour legend"
      tabIndex={0}
      className="flex items-center gap-3.5 overflow-x-auto flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      {items.map(i => (
        <span key={i.tone} className="inline-flex items-center gap-1.5 font-sans text-[12px] font-bold whitespace-nowrap" style={{ color: CAL_TONE[i.tone].fg }}>
          <span aria-hidden className="w-[7px] h-[7px] rounded-full" style={{ background: CAL_TONE[i.tone].fg }} />{i.label}
        </span>
      ))}
    </div>
  );
}

/** Button looks used across the calendar toolbar. */
export const calBtn = "inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-[6px] border-[1.5px] border-input bg-card font-sans text-[13px] font-semibold text-foreground whitespace-nowrap hover:border-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";
export const calBtnPrimary = "inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-[6px] border-[1.5px] border-primary bg-primary font-sans text-[13px] font-semibold text-primary-foreground whitespace-nowrap hover:brightness-110 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";
export const calBtnSmall = "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-[6px] border-[1.5px] border-input bg-card font-sans text-[12.5px] font-semibold text-foreground whitespace-nowrap hover:border-primary transition-colors disabled:opacity-50";
/** A toggle pill: blue-tinted when on. */
export const calPill = (on: boolean) =>
  `inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[6px] border-[1.5px] font-sans text-[13px] font-semibold whitespace-nowrap transition-colors ${on ? "border-primary bg-accent text-primary" : "border-input bg-card text-foreground hover:border-primary"}`;

export interface CalDayEvent {
  ev: any;
  isLead: boolean;
  tone: CalTone;
  label: string;
  time: string | null;
}

export interface CalDayClash {
  key: string;
  spaceName: string | null;
  summary: string;
  aName: string;
  bName: string | null;
  bookingId: number | null;
}

/**
 * The selected day, beside the month grid: that day's bookings, a red callout
 * when two of them clash (from the existing double-booking check), and a way
 * into each one.
 */
export function CalendarDayPanel(p: {
  dayLabel: string;
  isToday: boolean;
  events: CalDayEvent[];
  clashes: CalDayClash[];
  /** Flagged-as-clashing bookings that day with no pair from the clash list (e.g. staff, who can't load it). */
  flaggedOnly: number;
  onOpen: (e: CalDayEvent) => void;
  onResolve?: (bookingId: number) => void;
  resolvingId?: number | null;
  onDayView: () => void;
  onAdd?: () => void;
}) {
  return (
    <aside aria-label={`Selected day: ${p.dayLabel}`} className="rounded-[8px] border-[1.5px] border-border bg-card px-4 py-4 flex flex-col gap-3 min-w-0">
      <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{p.isToday ? "Today" : "Selected day"}</span>
      <h2 className="font-sans text-[20px] font-semibold leading-tight text-foreground m-0">{p.dayLabel}</h2>

      {p.clashes.map(c => (
        <div key={c.key} role="note" className="flex gap-2.5 rounded-[8px] border-[1.5px] px-3 py-2.5"
          style={{ background: CAL_TONE.red.bg, borderColor: CAL_TONE.red.border, color: CAL_TONE.red.fg }}>
          <AlertTriangle className="w-[18px] h-[18px] flex-shrink-0 mt-px" strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <div className="font-sans text-[13.5px] font-bold">{c.bName ? `Double-booked${c.spaceName ? ` in ${c.spaceName}` : ""}` : "Flagged as double-booked"}</div>
            <div className="font-sans text-[12.5px] text-foreground mt-0.5">
              {c.bName ? `${c.aName} and ${c.bName} share this date and space. Move one, or mark it resolved once it's sorted.` : `${c.aName}: ${c.summary}`}
            </div>
            {p.onResolve && c.bookingId != null && (
              <button type="button" disabled={p.resolvingId === c.bookingId} onClick={() => p.onResolve!(c.bookingId!)}
                className={`${calBtnSmall} mt-2`}>
                {p.resolvingId === c.bookingId ? "Saving…" : "Mark resolved"}
              </button>
            )}
          </div>
        </div>
      ))}
      {p.clashes.length === 0 && p.flaggedOnly > 0 && (
        <div role="note" className="flex gap-2.5 rounded-[8px] border-[1.5px] px-3 py-2.5"
          style={{ background: CAL_TONE.red.bg, borderColor: CAL_TONE.red.border, color: CAL_TONE.red.fg }}>
          <AlertTriangle className="w-[18px] h-[18px] flex-shrink-0 mt-px" strokeWidth={2} aria-hidden />
          <div className="min-w-0">
            <div className="font-sans text-[13.5px] font-bold">Double-booked</div>
            <div className="font-sans text-[12.5px] text-foreground mt-0.5">Another event has this date and space. Resolve it from the Overview.</div>
          </div>
        </div>
      )}

      {p.events.length === 0 ? (
        <p className="font-sans text-[13px] text-muted-foreground py-2 m-0">Nothing booked.</p>
      ) : (
        <ul className="flex flex-col m-0 p-0 list-none">
          {p.events.map(e => {
            const name = [e.ev.firstName, e.ev.lastName].filter(Boolean).join(" ") || (e.isLead ? "Enquiry" : "Event");
            const sub = [e.time, e.ev.spaceName, e.ev.eventType].filter(Boolean).join(" · ");
            return (
              <li key={`${e.isLead ? "l" : "b"}-${e.ev.id}`} className="border-b-[1.5px] border-[#ececed] last:border-b-0">
                <button type="button" onClick={() => p.onOpen(e)} aria-label={`Open ${name}`}
                  className="w-full text-left flex flex-col gap-[3px] py-2.5 hover:bg-accent/50 -mx-1 px-1 rounded-[4px]">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-sans text-[14px] font-semibold text-foreground truncate">{name}</span>
                    {e.ev.guestCount ? <span className="font-sans text-[13px] font-semibold tabular-nums text-foreground flex-shrink-0">{e.ev.guestCount}</span> : null}
                  </span>
                  {sub && <span className="font-sans text-[12px] text-muted-foreground truncate">{sub}</span>}
                  <CalSig tone={e.tone}>{e.label}</CalSig>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        <button type="button" onClick={p.onDayView} className={calBtnSmall}><CalendarDays className="w-3.5 h-3.5" aria-hidden />Open day view</button>
        {p.onAdd && <button type="button" onClick={p.onAdd} className={calBtnSmall}><Plus className="w-3.5 h-3.5" aria-hidden />Add enquiry</button>}
      </div>
    </aside>
  );
}
