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
}

const TONE: Record<SignalTone, { fg: string; bg: string }> = {
  red: { fg: "#c0392b", bg: "#fbecea" },
  amber: { fg: "#8a5f18", bg: "#f7efdd" },
  blue: { fg: "#2f5488", bg: "#e8edf6" },
  green: { fg: "#3f7350", bg: "#e8f0e6" },
  gray: { fg: "#6a6256", bg: "#f4efe6" },
};

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
  const { leads, nowMs, venueName, replyStatus, clashMap, isPartial, statusInfo, onOpen, onSend, sending, onCloseAsLost, closing } = props;
  // null = not chosen yet: open on the first tab that has something in it,
  // rather than an empty "Needs reply 0" while follow-ups are due.
  const [pickedTab, setTab] = React.useState<ListTab | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [replyId, setReplyId] = React.useState<number | null>(null);
  const [tplName, setTplName] = React.useState<string>("");
  const [draft, setDraft] = React.useState("");

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

  const isPassed = React.useCallback((lead: any) => leadDatePassed(lead, nowMs), [nowMs]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { reply: 0, followup: 0, confirmed: 0, all: 0, passed: 0 };
    for (const { lead, signal } of enriched) {
      if (signal.group !== "closed") c.all++;
      if (signal.group in c) c[signal.group]++;
      // Not the ones a client has just written to: those need a reply first.
      if (signal.group === "progress" && isPassed(lead)) c.passed++;
    }
    return c;
  }, [enriched, isPassed]);

  const defaultTab: ListTab = counts.reply ? "reply" : counts.followup ? "followup" : "all";
  const tab: ListTab = pickedTab ?? defaultTab;
  // Settle the opening tab once the list has loaded, so a refetch (a reply
  // sent, a new enquiry in) doesn't flip the view under you.
  React.useEffect(() => {
    if (pickedTab === null && enriched.length > 0) setTab(defaultTab);
  }, [pickedTab, enriched.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = React.useMemo(() => {
    const picked = enriched.filter(({ lead, signal }) =>
      tab === "passed" ? signal.group === "progress" && isPassed(lead)
      : tab === "all" ? signal.group !== "closed" : signal.group === tab);
    return picked.sort((a, b) => b.signal.sortKey - a.signal.sortKey);
  }, [enriched, tab, isPassed]);

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
        {/* View tabs */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 border-b border-border/60 -mb-px">
            {TABS.filter((t) => t.id !== "passed" || counts.passed > 0 || tab === "passed").map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} onClick={() => { setTab(t.id); setReplyId(null); }}
                  aria-pressed={on}
                  className={`relative px-3 py-2 font-sans text-sm font-semibold transition-colors border-b-2 ${on ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
                  {t.label}
                  {/* Full-strength muted ink: the /70 count was 2.9:1, under AA. */}
                  <span className={`ml-1.5 text-xs font-bold ${on ? "text-primary" : "text-muted-foreground"}`}>{counts[t.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        {rows.length > 0 && <div className="font-sans text-[13px] text-muted-foreground -mt-1">{summary}</div>}

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
            <div className="py-12 text-center font-sans text-sm text-muted-foreground">{emptyText}</div>
          ) : rows.map(({ lead, signal }) => {
            const tone = TONE[signal.tone];
            const action = enquiryAction(signal.group);
            const si = statusInfo(lead.status);
            const replying = replyId === lead.id;
            const dateClash = (clashMap?.[lead.id]?.length ?? 0) > 0;
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
              if (action.reply) { replying ? setReplyId(null) : startReply(lead); } else onOpen(lead);
            };

            return (
              <div key={lead.id} className="rounded-[6px] overflow-hidden border-[1.5px] transition-colors"
                style={{ background: "var(--card)", borderColor: replying ? "var(--primary)" : "var(--input)" }}>
                {/* Desktop: one dense signal-first row */}
                <div onClick={() => onOpen(lead)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") onOpen(lead); }}
                  className="hidden md:grid gap-4 items-center px-3.5 py-3 cursor-pointer hover:bg-white md:grid-cols-[176px_minmax(0,1.6fr)_minmax(0,1fr)_104px] lg:grid-cols-[176px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_104px]">
                  {/* Fixed-width signal and action columns, so the name and date
                      columns line up from row to row whatever the chip says. */}
                  <span className="inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-sans text-xs font-bold whitespace-nowrap justify-self-start max-w-full overflow-hidden text-ellipsis"
                    style={{ background: tone.bg, color: tone.fg }}>
                    <Icon name={signal.icon} />{signal.text}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-serif text-[16.5px] font-semibold truncate" style={{ color: "#211d18" }}>{lead.firstName} {lead.lastName}</span>
                      {/* Status in plain ink: the dot carries the status colour; the
                          chip on the left already carries the urgency colour. */}
                      <span className="inline-flex items-center gap-1.5 font-sans text-xs font-semibold whitespace-nowrap flex-shrink-0 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: si.dot }} />{si.label}
                      </span>
                    </div>
                    {sub && <div className="font-sans text-[13px] text-muted-foreground truncate mt-0.5">{sub}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif text-[15px] font-semibold whitespace-nowrap" style={{ color: dateClash ? "#c0392b" : !lead.eventDate ? "#8a5f18" : "var(--foreground)" }}>{dateStr}</div>
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
                  </div>
                  <div className="flex items-center justify-between gap-2.5 px-3.5 pb-2.5 pt-2 border-t" style={{ borderColor: "var(--vf-hair, #eee6d8)" }}>
                    <div onClick={() => onOpen(lead)} className="min-w-0 cursor-pointer">
                      <div className="font-serif text-[15.5px] font-semibold whitespace-nowrap" style={{ color: dateClash ? "#c0392b" : !lead.eventDate ? "#8a5f18" : "var(--foreground)" }}>{dateStr}</div>
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

                {/* Inline quick reply */}
                {replying && (
                  <div className="border-t px-3.5 pt-3 pb-3.5" style={{ borderColor: "var(--vf-hair, #eee6d8)", background: "#fff" }}>
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
