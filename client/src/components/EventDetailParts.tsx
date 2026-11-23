import React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { currency } from "@/lib/money";

/**
 * Building blocks for the event detail page (pages/EventDetail.tsx), in the
 * same visual language as EnquiryListC / EnquiryDrawerExtras: section heads
 * with a hairline, one signal dot per item, a facts band with an inverted
 * guests tile, callouts that say why something needs you.
 */

export const SIG = {
  red: "#c0392b",
  amber: "#8a5f18",
  blue: "var(--primary)",
  green: "#3f7350",
  gray: "var(--muted-foreground)",
} as const;
export type SigTone = keyof typeof SIG;

/** Shared button looks: 38px primary / outline, 32px small. */
export const BTN = "inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-[6px] border-[1.5px] font-sans text-[13px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
export const BTN_OUTLINE = `${BTN} bg-card border-input text-foreground hover:bg-accent`;
export const BTN_PRIMARY = `${BTN} bg-primary border-primary text-primary-foreground hover:brightness-110`;
export const BTN_SM = "inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-[6px] border-[1.5px] bg-card border-input text-foreground hover:bg-accent font-sans text-[12.5px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Field labels in the edit forms (was font-bebas). */
export const FIELD_LABEL = "font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground block mb-1";

export function Card({ className = "", children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-card border-[1.5px] border-border rounded-[8px] ${className}`} {...rest}>{children}</div>;
}

export function SectionHead({ title, meta, level = 2, action }: { title: string; meta?: React.ReactNode; level?: 2 | 3; action?: React.ReactNode }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="flex items-center gap-2.5 mb-2">
      <H className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary flex-shrink-0 m-0">{title}</H>
      <span className="h-[1.5px] flex-1 bg-border" aria-hidden />
      {meta != null && <span className="font-sans text-[12px] text-muted-foreground flex-shrink-0 tabular-nums">{meta}</span>}
      {action}
    </div>
  );
}

export function Signal({ tone, children, className = "" }: { tone: SigTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-sans text-[13px] font-bold whitespace-nowrap ${className}`} style={{ color: SIG[tone] }}>
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: "currentColor" }} aria-hidden />
      {children}
    </span>
  );
}

export interface CalloutData {
  tone: "red" | "amber";
  title: string;
  body: string;
  action?: React.ReactNode;
}

export function Callout({ c }: { c: CalloutData }) {
  const red = c.tone === "red";
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-[8px] border-[1.5px] px-3.5 py-3"
      style={red
        ? { background: "#fbecea", borderColor: "#f0c7c2", color: SIG.red }
        : { background: "#f7efdd", borderColor: "#e9d7b3", color: SIG.amber }}>
      <AlertTriangle className="w-[17px] h-[17px] flex-shrink-0 mt-px" strokeWidth={2} aria-hidden />
      <div className="flex-1 min-w-0 font-sans">
        <span className="text-[14px] font-bold">{c.title}</span>{" "}
        <span className="text-[13.5px] text-foreground">{c.body}</span>
      </div>
      {c.action && <div className="flex-shrink-0">{c.action}</div>}
    </div>
  );
}

export interface Fact { label: string; value: React.ReactNode; inv?: boolean }

/** One bordered row of facts; the guests tile is inverted. */
export function FactsBand({ facts }: { facts: Fact[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-none lg:grid-flow-col lg:auto-cols-fr rounded-[8px] overflow-hidden border-[1.5px] border-primary bg-card">
      {facts.map((f, i) => (
        <div key={i} className="px-3.5 py-3 min-w-0 border-r-[1.5px] border-b-[1.5px] lg:border-b-0 last:border-r-0"
          style={{ borderColor: "#ececed", background: f.inv ? "var(--primary)" : undefined, color: f.inv ? "#fff" : undefined }}>
          <div className="font-sans text-[10.5px] font-extrabold uppercase tracking-[0.16em]" style={{ color: f.inv ? "rgba(255,255,255,.78)" : "var(--muted-foreground)" }}>{f.label}</div>
          <div className="font-sans text-[17px] font-semibold mt-0.5 truncate tabular-nums">{f.value}</div>
        </div>
      ))}
    </div>
  );
}

export type PrepState = "done" | "attention" | "overdue" | "idle";
export interface PrepItem {
  key: string;
  label: string;
  note: React.ReactNode;
  state: PrepState;
  action?: React.ReactNode;
}

function PrepMark({ state }: { state: PrepState }) {
  if (state === "done") {
    return (
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center" style={{ background: SIG.green }} aria-hidden>
        <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />
      </span>
    );
  }
  const c = state === "overdue" ? SIG.red : state === "attention" ? SIG.amber : SIG.gray;
  return <span className="w-[18px] h-[18px] rounded-full border-[1.5px]" style={{ borderColor: c }} aria-hidden />;
}

const PREP_SR: Record<PrepState, string> = { done: "Done", attention: "Needs attention", overdue: "Overdue", idle: "Not started" };

export function PrepList({ items }: { items: PrepItem[] }) {
  const done = items.filter((i) => i.state === "done").length;
  return (
    <Card className="px-5 py-4">
      <SectionHead title="Event prep" meta={`${done} of ${items.length} done`} />
      <ul className="m-0 p-0 list-none">
        {items.map((it) => {
          const noteColor = it.state === "overdue" ? SIG.red : it.state === "attention" ? SIG.amber : undefined;
          return (
            <li key={it.key} className="grid items-center gap-2.5 py-2.5 border-b-[1.5px] last:border-b-0 grid-cols-[24px_minmax(0,1fr)_auto] sm:grid-cols-[24px_150px_minmax(0,1fr)_auto]" style={{ borderColor: "#ececed" }}>
              <PrepMark state={it.state} />
              <span className="min-w-0 flex flex-col sm:contents">
                <span className="font-sans text-[14px] font-semibold">
                  {it.label}<span className="sr-only">: {PREP_SR[it.state]}</span>
                </span>
                <span className="font-sans text-[13px] text-muted-foreground min-w-0"
                  style={noteColor ? { color: noteColor, fontWeight: 600 } : undefined}>{it.note}</span>
              </span>
              <span>{it.action}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Paid-vs-due bar. Only drawn when the event has a total. */
export function PaidBar({ total, paid, outstanding, overdue }: { total: number; paid: number; outstanding: number; overdue?: boolean }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (paid / total) * 100)) : 0;
  return (
    <div>
      <div className="h-2 rounded-[4px] overflow-hidden flex" style={{ background: "#ececed" }}
        role="img" aria-label={`${currency(paid)} paid of ${currency(total)}`}>
        <div style={{ width: `${pct}%`, background: SIG.green }} />
      </div>
      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
        <Signal tone="green"><span className="tabular-nums">{currency(paid)}</span> paid</Signal>
        {outstanding > 0
          ? <Signal tone={overdue ? "red" : "amber"}><span className="tabular-nums">{currency(outstanding)}</span> {overdue ? "overdue" : "due"}</Signal>
          : <span className="font-sans text-[13px] font-bold" style={{ color: SIG.green }}>Paid in full</span>}
      </div>
    </div>
  );
}

export function initialsOf(first?: string | null, last?: string | null): string {
  const a = (first ?? "").trim()[0] ?? "";
  const b = (last ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

/** "in 10 days" / "today" / "tomorrow" / "3 days ago" — NZ calendar days. */
export function relDays(date: Date | string | null | undefined, nowMs = Date.now()): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
  const diff = Math.round((Date.parse(day(d.getTime())) - Date.parse(day(nowMs))) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}
