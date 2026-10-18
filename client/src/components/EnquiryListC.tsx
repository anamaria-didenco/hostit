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

const TABS: { id: EnquiryGroup | "all"; label: string }[] = [
  { id: "reply", label: "Needs reply" },
  { id: "followup", label: "Follow-up due" },
  { id: "confirmed", label: "Confirmed" },
  { id: "all", label: "All" },
];

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

function moneyRange(lead: any): string {
  const b = budgetRangeLabel(lead.budgetRange);
  return b ? `Budget ${b}` : "No budget given";
}

export default function EnquiryListC(props: EnquiryListCProps) {
  const { leads, nowMs, venueName, replyStatus, clashMap, isPartial, statusInfo, onOpen, onSend, sending } = props;
  const [tab, setTab] = React.useState<EnquiryGroup | "all">("reply");
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

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { reply: 0, followup: 0, confirmed: 0, all: 0 };
    for (const { signal } of enriched) {
      if (signal.group !== "closed") c.all++;
      if (signal.group in c) c[signal.group]++;
    }
    return c;
  }, [enriched]);

  const rows = React.useMemo(() => {
    const picked = enriched.filter(({ signal }) =>
      tab === "all" ? signal.group !== "closed" : signal.group === tab);
    return picked.sort((a, b) => b.signal.sortKey - a.signal.sortKey);
  }, [enriched, tab]);

  const summary = tab === "reply" ? (counts.reply ? `${counts.reply} waiting on you · longest first` : "Nobody is waiting on a reply")
    : tab === "followup" ? "Quoted or gone quiet · most overdue first"
    : tab === "confirmed" ? "Booked in · soonest event first"
    : `${counts.all} enquiries`;

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
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ background: "var(--secondary)" }}>
      <div className="px-4 md:px-6 pt-4 pb-10 flex flex-col gap-3.5">
        {/* View tabs */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 border-b border-border/60 -mb-px">
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} onClick={() => { setTab(t.id); setReplyId(null); }}
                  className={`relative px-3 py-2 font-sans text-[13px] font-semibold transition-colors border-b-2 ${on ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}>
                  {t.label}
                  <span className={`ml-1.5 text-[11px] font-bold ${on ? "text-primary" : "text-muted-foreground/70"}`}>{counts[t.id] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="font-sans text-[12.5px] text-muted-foreground -mt-1">{summary}</div>

        {/* Rows */}
        <div className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <div className="py-12 text-center font-sans text-[13.5px] text-muted-foreground">Nothing here. Everyone's been looked after.</div>
          ) : rows.map(({ lead, signal }) => {
            const tone = TONE[signal.tone];
            const action = enquiryAction(signal.group);
            const si = statusInfo(lead.status);
            const replying = replyId === lead.id;
            const dateClash = (clashMap?.[lead.id]?.length ?? 0) > 0;
            const dateStr = lead.eventDate
              ? new Date(lead.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })
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
                  className="hidden md:grid gap-4 items-center px-3.5 py-3 cursor-pointer hover:bg-white md:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]">
                  <span className="inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 font-sans text-[11.5px] font-bold whitespace-nowrap max-w-[180px] overflow-hidden text-ellipsis"
                    style={{ background: tone.bg, color: tone.fg }}>
                    <Icon name={signal.icon} />{signal.text}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="font-serif text-[16.5px] font-semibold truncate" style={{ color: "#211d18" }}>{lead.firstName} {lead.lastName}</span>
                      <span className="inline-flex items-center gap-1.5 font-sans text-[11px] font-semibold whitespace-nowrap flex-shrink-0" style={{ color: tone.fg }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: si.dot }} />{si.label}
                      </span>
                    </div>
                    {sub && <div className="font-sans text-[12.5px] text-muted-foreground truncate mt-0.5">{sub}</div>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-serif text-[15px] font-semibold whitespace-nowrap" style={{ color: dateClash ? "#c0392b" : !lead.eventDate ? "#8a5f18" : "var(--foreground)" }}>{dateStr}</div>
                    {whenStr && <div className="font-sans text-[12px] text-muted-foreground truncate mt-0.5">{whenStr}</div>}
                  </div>
                  <div className="min-w-0 hidden lg:block">
                    <div className="font-sans text-[12.5px] text-muted-foreground whitespace-nowrap">{moneyRange(lead)}</div>
                  </div>
                  <button onClick={onAction}
                    className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[6px] font-sans text-[12px] font-bold whitespace-nowrap border-[1.5px] transition-colors"
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
                      <span className="inline-flex items-center gap-1.5 font-sans text-[12px] font-semibold whitespace-nowrap flex-shrink-0" style={{ color: tone.fg }}>
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
                      <span className="font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground mr-1">Quick reply to {lead.firstName}</span>
                      {(QUICK_FOR[signal.group] ?? []).map((name) => {
                        const on = tplName === name;
                        const tpl = STARTER_TEMPLATES.find((t) => t.name === name);
                        if (!tpl) return null;
                        return (
                          <button key={name} onClick={() => { setTplName(name); setDraft(resolveTemplate(tpl.body, lead, venueName)); }}
                            className="h-[26px] px-2.5 rounded-[4px] font-sans text-[11.5px] font-semibold border-[1.5px] transition-colors"
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
