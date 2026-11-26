import React, { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowRight, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { daysAwayLabel, UPCOMING_DAYS, NEEDS_GROUP_CAP, type EnquiryNeeds } from "@shared/needsToday";
import { LANE_INK, LANE_MARK, type Lane } from "@shared/enquiryLane";
import { statusPalette } from "@shared/statusPalette";
import { dayLabel, hhmmLabel } from "@/lib/overviewDates";
import { rowOf, type UpcomingEventRow } from "@/components/TodayPanel";

/**
 * The redesigned Overview: a summary strip, one "Needs you today" list of
 * signal rows (most urgent first, one action each), the next seven days, and a
 * Today card. Every number and row comes from the queries the Overview already
 * used (dashboard.stats, dashboard.needsAttention, dashboard.upcoming,
 * bookings.clashes, runsheets.startTimeMismatches), and the enquiries in it
 * are the Enquiries list's own rows (shared/enquiryFilters.ts), so they are
 * the same people, counted the same way, as the badge and the list's tabs.
 *
 * The signal colours are the Enquiries list's lane colours
 * (shared/enquiryLane.ts): red is late or wrong, amber is waiting on you,
 * blue is new. An event's colour is the venue's own status colour
 * (shared/statusPalette.ts), as on the Calendar and the status pills.
 */

type Tone = "red" | "amber" | "blue" | "green" | "muted";
/** Dot colour (3:1 or more) and text colour (4.5:1 or more) for each tone. */
const MARK: Record<Tone, string> = { red: LANE_MARK.red, amber: LANE_MARK.amber, blue: LANE_MARK.blue, green: LANE_MARK.green, muted: "#6b7078" };
const FG: Record<Tone, string> = { red: LANE_INK.red, amber: LANE_INK.amber, blue: LANE_INK.blue, green: LANE_INK.green, muted: "#6b7078" };

/** The Overview tone for an Enquiries lane. */
const LANE_TONE: Record<Lane, Tone> = { red: "red", amber: "amber", blue: "blue", green: "green", grey: "muted", calm: "muted" };

/** An event's colours: red when it is double-booked, else its status colour. */
type EventColour = { mark: string; ink: string; clash: boolean };
function eventColour(e: UpcomingEventRow, statusColour?: (status: string) => string | null | undefined): EventColour {
  if (e._type === "booking" && (e.row as any).clashFlaggedAt) return { mark: MARK.red, ink: FG.red, clash: true };
  const pal = statusPalette(statusColour?.(rowOf(e).status ?? "confirmed"));
  return { mark: pal.outline, ink: pal.ink, clash: false };
}

// 32px buttons for a mouse, 44px on a touch screen.
const btn = "inline-flex items-center justify-center gap-1.5 h-8 pointer-coarse:h-11 px-2.5 rounded-[6px] border-[1.5px] font-sans text-[12.5px] font-semibold whitespace-nowrap transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const btnOutline = `${btn} border-input bg-card text-foreground hover:border-primary`;
const btnPrimary = `${btn} border-primary bg-primary text-primary-foreground hover:brightness-110`;
const linkBtn = "inline-flex items-center gap-1 font-sans text-[13px] font-semibold text-primary hover:underline min-h-[32px] pointer-coarse:min-h-[44px]";

/** Section head: tracked caps title, a 1.5px hairline that fills the row, meta at right. */
export function OvHead({ title, meta, action, as: H = "h2" }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; as?: "h2" | "h3" }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
      <H className="m-0 font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary whitespace-nowrap">{title}</H>
      <span aria-hidden className="h-[1.5px] flex-1 bg-input min-w-4" />
      {meta != null && <span className="font-sans text-[12px] text-muted-foreground whitespace-nowrap tabular-nums">{meta}</span>}
      {action}
    </div>
  );
}

/** 7px dot + bold label in the signal colour (or the given colours). */
export function Sig({ tone, colour, children }: { tone?: Tone; colour?: { mark: string; ink: string }; children: React.ReactNode }) {
  const c = colour ?? { mark: MARK[tone ?? "muted"], ink: FG[tone ?? "muted"] };
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-[13px] font-bold whitespace-nowrap min-w-0" style={{ color: c.ink }}>
      <span aria-hidden className="vf-swatch w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c.mark }} />
      <span className="truncate">{children}</span>
    </span>
  );
}

function initialsOf(name: string): string {
  const parts = name.replace(/&/g, " ").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

// ── Summary strip ────────────────────────────────────────────────────────────

export interface SummaryTile {
  id: string;
  label: string;
  value: React.ReactNode;
  note: string;
  noteTone?: Tone;
}

// Literal class names (Tailwind can't see computed ones): the last tile spans
// whatever is left of its row so no empty cell shows.
const SPAN2 = ["col-span-2", "col-span-1"];
const SPAN3 = ["md:col-span-3", "md:col-span-2", "md:col-span-1"];

/** One bordered row of tiles; the last is inverted (primary). Each opens what it counted. */
export function OverviewSummaryStrip({ tiles, onTile, label = "Summary" }: { tiles: SummaryTile[]; onTile: (id: string) => void; label?: string }) {
  if (tiles.length === 0) return null;
  const n = tiles.length;
  return (
    <section aria-label={label}
      className="grid grid-cols-2 md:grid-cols-3 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none gap-[1.5px] rounded-[8px] border-[1.5px] border-input bg-[#ececed] overflow-hidden">
      {tiles.map((t, i) => {
        const inv = i === n - 1;
        const span = inv ? `${SPAN2[(n - 1) % 2]} ${SPAN3[(n - 1) % 3]} xl:col-span-1` : "";
        return (
          // Named by what it shows (label, number, note), so the name is the visible words.
          <button key={t.id} type="button" onClick={() => onTile(t.id)}
            className={`text-left px-4 md:px-[18px] py-3.5 flex flex-col gap-1 min-w-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary ${span} ${inv ? "bg-primary text-primary-foreground hover:brightness-110 focus-visible:outline-white" : "bg-card text-foreground hover:bg-accent/60"}`}>
            <span className={`font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] ${inv ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{t.label}<span className="sr-only">:</span></span>
            <span className="font-sans text-[26px] leading-tight font-semibold tabular-nums">{t.value}<span className="sr-only">,</span></span>
            <span className={`font-sans text-[12px] font-semibold ${inv ? "text-primary-foreground/80" : ""}`}
              style={inv ? undefined : { color: t.noteTone ? FG[t.noteTone] : "var(--muted-foreground)" }}>{t.note}</span>
          </button>
        );
      })}
    </section>
  );
}

// ── Needs you today ──────────────────────────────────────────────────────────

type Clash = {
  key: string; eventDate: string; spaceName: string | null; summary: string;
  a: { bookingId: number | null; name: string; kind: string };
  b: { bookingId: number | null; name: string; kind: string } | null;
};
type Mismatch = { runsheetId: number; firstName?: string | null; lastName?: string | null; title?: string | null; eventDate: any; bookingTime: string; runsheetTime: string | null };

export interface OverviewNeedsTodayProps {
  onOpenBooking: (bookingId: number) => void;
  onOpenLead: (leadId: number) => void;
  onOpenLink: (link: string) => void;
  onGoCalendarList: () => void;
  onGoTasksOverdue: () => void;
  onGoEnquiries: (view: "reply" | "followup") => void;
  onGoDeposits: () => void;
  /**
   * Enquiries waiting on you: the Enquiries list's own Needs reply and
   * Follow-up due rows (the sidebar badge and the "Needs follow-up" tile count
   * these), not the server's older rule. Undefined until the enquiries load.
   */
  enquiries?: EnquiryNeeds;
  /** Double-bookings kept over the clash warning (bookings.clashes). */
  clashes?: Clash[];
  onResolveClash: (bookingId: number) => void;
  resolvingClashId: number | null;
  /** Event vs run sheet start times that disagree (runsheets.startTimeMismatches). */
  mismatches?: Mismatch[];
  onAlignStartTime: (runsheetId: number, keep: "event" | "runsheet") => void;
  aligningRunsheetId: number | null;
  /** "Sat 28 Nov" for an event date. */
  fmtDay: (d: any) => string;
  /** "6:30 pm" for "18:30". */
  fmtTime: (hhmm: string | null) => string;
}

interface Row {
  key: string;
  tone: Tone;
  signal: string;
  signalSub?: string;
  name: React.ReactNode;
  initials: string;
  sub?: React.ReactNode;
  when?: string;
  action: React.ReactNode;
  /** Where it sorts, when not by its tone (TONE_RANK). */
  rank?: number;
}

const TONE_RANK: Record<Tone, number> = { red: 0, amber: 1, blue: 2, green: 3, muted: 4 };

/**
 * "Needs you today": every thing waiting on the venue in one list, most urgent
 * first (red, then amber), each row with the one action that moves it on.
 */
export function OverviewNeedsToday(p: OverviewNeedsTodayProps) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data } = trpc.dashboard.needsAttention.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true });
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());
  const complete = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      void utils.dashboard.needsAttention.invalidate();
      void utils.dashboard.stats.invalidate();
      void utils.tasks.list.invalidate();
    },
    onError: (e, vars) => {
      setDoneIds(prev => { const n = new Set(prev); n.delete(vars.id); return n; });
      toast.error(e.message || "Couldn't complete that task");
    },
  });
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => { void utils.notifications.unreadCount.invalidate(); void utils.notifications.list.invalidate(); void utils.dashboard.needsAttention.invalidate(); },
  });

  const rows: Row[] = [];
  const nameBtn = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="max-w-full truncate text-left font-sans text-[14.5px] font-semibold text-foreground hover:underline focus-visible:underline min-h-6">{label}</button>
  );

  // Double-bookings — red.
  for (const pair of p.clashes ?? []) {
    const busy = p.resolvingClashId != null && p.resolvingClashId === pair.a.bookingId;
    const side = (x: NonNullable<Clash["b"]>) => x.bookingId
      ? <button type="button" onClick={() => setLocation(`/event/${x.bookingId}`)} className="font-sans text-[14.5px] font-semibold text-foreground hover:underline text-left min-h-6">{x.name}</button>
      : <span className="font-sans text-[14.5px] font-semibold text-foreground">{x.name} <span className="font-normal text-muted-foreground">({x.kind === "hold" ? "date on hold" : "enquiry"})</span></span>;
    rows.push({
      key: `clash-${pair.key}`, tone: "red", signal: pair.b ? "Double-booked" : "Clash flagged",
      signalSub: pair.spaceName ?? undefined,
      initials: initialsOf(pair.a.name),
      name: <span className="flex flex-wrap items-baseline gap-x-1.5 min-w-0">{side(pair.a)}{pair.b && <><span className="font-sans text-[12px] text-muted-foreground">and</span>{side(pair.b)}</>}</span>,
      sub: pair.b ? "Same date and space. Move one, or mark it resolved once it's sorted." : pair.summary,
      when: p.fmtDay(pair.eventDate),
      action: (
        <button type="button" disabled={busy} onClick={() => pair.a.bookingId && p.onResolveClash(pair.a.bookingId)} className={btnPrimary}>
          {busy ? "Saving…" : "Mark resolved"}
        </button>
      ),
    });
  }

  if (data) {
    const { tasks } = data;
    // Overdue tasks — red.
    for (const t of tasks.items.filter(t => !doneIds.has(t.id))) {
      rows.push({
        key: `task-${t.id}`, tone: "red", signal: "Task overdue", signalSub: `${t.daysOverdue} day${t.daysOverdue !== 1 ? "s" : ""}`,
        initials: initialsOf(t.linkedName ?? t.title),
        name: <span className="block truncate font-sans text-[14.5px] font-semibold text-foreground">{t.title}</span>,
        sub: t.linkedName ? <>For <button type="button"
          onClick={() => (t.bookingId ? p.onOpenBooking(t.bookingId) : t.leadId ? p.onOpenLead(t.leadId) : undefined)}
          className="underline hover:text-foreground">{t.linkedName}</button></> : undefined,
        when: new Date(t.dueDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" }),
        action: (
          <button type="button" aria-label={`Mark done: ${t.title}`} disabled={complete.isPending}
            onClick={() => { setDoneIds(prev => new Set(prev).add(t.id)); complete.mutate({ id: t.id, completed: true }); }}
            className={btnPrimary}>
            <Check className="w-3.5 h-3.5" aria-hidden />Mark done
          </button>
        ),
      });
    }
  }

  // Enquiries waiting on you, as the Enquiries list shows them: Needs reply
  // (a first reply, or the client wrote back), then Follow-up due. Each keeps
  // its lane colour and the words on its row.
  const shownReply = (p.enquiries?.reply ?? []).slice(0, NEEDS_GROUP_CAP);
  const shownFollowup = (p.enquiries?.followup ?? []).slice(0, NEEDS_GROUP_CAP);
  for (const [group, list] of [["reply", shownReply], ["followup", shownFollowup]] as const) {
    for (const l of list) {
      const tone = LANE_TONE[l.lane];
      const reply = group === "reply";
      rows.push({
        key: `lead-${l.leadId}`, tone, signal: l.text, signalSub: l.sub,
        // Someone waiting on a reply comes straight after the red rows, whatever
        // their colour: a first reply is blue ("new") on the list however long
        // it has waited, but it is still the venue's to answer today.
        rank: reply && tone !== "red" ? 0.5 : undefined,
        initials: initialsOf(l.name),
        name: nameBtn(l.name, () => p.onOpenLead(l.leadId)),
        sub: l.eventType ?? undefined,
        action: (
          <button type="button" onClick={() => p.onOpenLead(l.leadId)} aria-label={`${reply ? "Reply to" : "Follow up with"} ${l.name}`}
            className={tone === "red" ? btnPrimary : btnOutline}>{reply ? "Reply" : "Follow up"}</button>
        ),
      });
    }
  }

  if (data) {
    const { tonight, deposits, runsheets, alerts } = data;
    // Alerts still worth a look: a double-booking is red, the rest amber.
    // A double-booking already listed from the clash check isn't listed twice.
    const clashBookingIds = new Set((p.clashes ?? []).flatMap(c => [c.a.bookingId, c.b?.bookingId]).filter((v): v is number => v != null));
    for (const a of alerts.items) {
      if (a.kind === "double_booking" && a.bookingId != null && clashBookingIds.has(a.bookingId)) continue;
      rows.push({
        key: `alert-${a.id}`, tone: a.kind === "double_booking" ? "red" : "amber",
        signal: a.kind === "double_booking" ? "Double-booked" : a.kind === "hold_expiring" ? "Hold expiring" : "Check proposal",
        initials: initialsOf(a.title),
        name: <span className="block truncate font-sans text-[14.5px] font-semibold text-foreground">{a.title}</span>,
        action: a.link ? (
          <button type="button" onClick={() => { markRead.mutate({ id: a.id }); p.onOpenLink(a.link!); }}
            className={a.kind === "double_booking" ? btnPrimary : btnOutline}>Open</button>
        ) : <span />,
      });
    }
    // Events today with no run sheet — amber.
    for (const e of tonight.items.filter(e => !e.hasRunSheet)) {
      rows.push({
        key: `tonight-${e.bookingId}`, tone: "amber", signal: "No run sheet", signalSub: "today",
        initials: initialsOf(e.name),
        name: nameBtn(e.name, () => p.onOpenBooking(e.bookingId)),
        sub: [e.eventType, e.spaceName, e.guestCount ? `${e.guestCount} guests` : null, e.startTime ? hhmmLabel(e.startTime) : null].filter(Boolean).join(" · ") || undefined,
        when: "Today",
        action: <button type="button" onClick={() => setLocation(`/runsheet?bookingId=${e.bookingId}`)} className={btnOutline}>Create run sheet</button>,
      });
    }
    // Deposits due in the next 21 days — amber.
    for (const d of deposits.items) {
      rows.push({
        key: `dep-${d.bookingId}`, tone: "amber", signal: "Deposit due",
        signalSub: d.amount > 0 ? `$${d.amount.toLocaleString("en-NZ")}${d.requested ? " · asked for" : ""}` : "amount not set",
        initials: initialsOf(d.name),
        name: nameBtn(d.name, () => setLocation(`/payments?bookingId=${d.bookingId}&from=overview`)),
        sub: `Event ${daysAwayLabel(d.daysAway)}`,
        when: dayLabel(d.dayKey),
        action: <button type="button" onClick={() => setLocation(`/payments?bookingId=${d.bookingId}&from=overview`)} className={btnOutline}>Payments</button>,
      });
    }
    // Confirmed events in the next 7 days with no run sheet — amber.
    for (const r of runsheets.items) {
      rows.push({
        key: `rs-${r.bookingId}`, tone: "amber", signal: "No run sheet", signalSub: daysAwayLabel(r.daysAway),
        initials: initialsOf(r.name),
        name: nameBtn(r.name, () => p.onOpenBooking(r.bookingId)),
        sub: [r.spaceName, r.startTime ? hhmmLabel(r.startTime) : null].filter(Boolean).join(" · ") || undefined,
        when: dayLabel(r.dayKey),
        action: <button type="button" onClick={() => setLocation(`/runsheet?bookingId=${r.bookingId}`)} className={btnOutline}>Create run sheet</button>,
      });
    }
  }

  // Start times that disagree — amber; the choice is which time to keep.
  for (const m of p.mismatches ?? []) {
    const who = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.title || "Event";
    const busy = p.aligningRunsheetId === m.runsheetId;
    rows.push({
      key: `time-${m.runsheetId}`, tone: "amber", signal: "Start times differ",
      initials: initialsOf(who),
      name: nameBtn(who, () => setLocation(`/runsheet?id=${m.runsheetId}`)),
      sub: `Event ${p.fmtTime(m.bookingTime)}, run sheet ${p.fmtTime(m.runsheetTime)}. Pick one and both will match.`,
      when: p.fmtDay(m.eventDate),
      action: (
        <span className="flex gap-1.5">
          <button type="button" disabled={busy} onClick={() => p.onAlignStartTime(m.runsheetId, "event")}
            aria-label={`Use ${p.fmtTime(m.bookingTime)} (the event's time) for ${who}`} className={btnOutline}>Use {p.fmtTime(m.bookingTime)}</button>
          <button type="button" disabled={busy} onClick={() => p.onAlignStartTime(m.runsheetId, "runsheet")}
            aria-label={`Use ${p.fmtTime(m.runsheetTime)} (the run sheet's time) for ${who}`} className={btnOutline}>Use {p.fmtTime(m.runsheetTime)}</button>
        </span>
      ),
    });
  }

  // Stable sort: red, then replies, then amber; within a group the most-urgent order holds.
  const rankOf = (r: Row) => r.rank ?? TONE_RANK[r.tone];
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => rankOf(a.r) - rankOf(b.r) || a.i - b.i).map(x => x.r);
  const urgent = sorted.filter(r => r.tone === "red").length;

  // What's past the five-per-group cap, and where it lives.
  const more: { n: number; label: string; go?: () => void }[] = [];
  if (p.enquiries) {
    // The same counts as the list's Needs reply and Follow-up due tabs.
    more.push(
      { n: p.enquiries.reply.length - shownReply.length, label: "waiting on a reply", go: () => p.onGoEnquiries("reply") },
      { n: p.enquiries.followup.length - shownFollowup.length, label: "follow-ups due", go: () => p.onGoEnquiries("followup") },
    );
  }
  if (data) {
    const { tonight, tasks, deposits, runsheets, alerts } = data;
    more.push(
      // Events today past the cap aren't checked for a run sheet here.
      { n: tonight.total - tonight.items.length, label: "events today", go: p.onGoCalendarList },
      { n: tasks.total - tasks.items.length, label: "overdue tasks", go: p.onGoTasksOverdue },
      { n: deposits.total - deposits.items.length, label: "deposits due", go: p.onGoDeposits },
      { n: runsheets.total - runsheets.items.length, label: "events without a run sheet", go: p.onGoCalendarList },
      { n: alerts.total - alerts.items.length, label: "in the alerts bell" },
    );
  }
  const moreShown = more.filter(m => m.n > 0);

  return (
    <section aria-label="Needs you today" className="flex flex-col gap-2.5 min-w-0">
      <OvHead title="Needs you today" meta={sorted.length ? (urgent ? `${urgent} urgent · most urgent first` : "Most urgent first") : undefined} />
      {(!data || !p.enquiries) && sorted.length === 0 ? (
        <p className="font-sans text-[13px] text-muted-foreground m-0 py-2">Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-[8px] border-[1.5px] border-border bg-card px-4 py-3.5">
          <Sig tone="green">All clear</Sig>
          <p className="font-sans text-[13px] text-muted-foreground m-0 mt-1">Nothing is waiting on you right now.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 m-0 p-0 list-none">
          {sorted.map(r => (
            <li key={r.key}
              className="rounded-[8px] border-[1.5px] border-border bg-card px-4 py-[11px] flex flex-col gap-2 md:grid md:items-center md:gap-3.5 md:grid-cols-[150px_minmax(0,1fr)_96px_auto]">
              <div className="flex md:flex-col gap-x-2 gap-y-[3px] min-w-0 items-baseline md:items-start">
                <Sig tone={r.tone}>{r.signal}</Sig>
                {r.signalSub && <span className="font-sans text-[12px] text-muted-foreground truncate tabular-nums">{r.signalSub}</span>}
              </div>
              <div className="flex items-center gap-2.5 min-w-0">
                <span aria-hidden className="hidden sm:flex w-8 h-8 rounded-full bg-accent text-primary font-sans text-[12px] font-bold items-center justify-center flex-shrink-0">{r.initials}</span>
                <div className="min-w-0 flex-1">
                  {r.name}
                  {r.sub && <div className="font-sans text-[12px] text-muted-foreground break-words md:truncate">{r.sub}</div>}
                </div>
              </div>
              <span className="font-sans text-[13.5px] font-semibold text-foreground whitespace-nowrap tabular-nums">{r.when ?? ""}</span>
              <div className="flex md:justify-end">{r.action}</div>
            </li>
          ))}
        </ul>
      )}
      {moreShown.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {moreShown.map(m => m.go
            ? <button key={m.label} type="button" onClick={m.go} className={linkBtn}>+{m.n} more {m.label}<ArrowRight className="w-3.5 h-3.5" aria-hidden /></button>
            : <span key={m.label} className="font-sans text-[13px] text-muted-foreground min-h-[32px] inline-flex items-center">+{m.n} more {m.label}</span>)}
        </div>
      )}
    </section>
  );
}

// ── Next seven days ──────────────────────────────────────────────────────────

function eventTone(e: UpcomingEventRow): Tone {
  const st = rowOf(e).status ?? "";
  if (e._type === "booking" && (e.row as any).clashFlaggedAt) return "red";
  if (st === "tentative") return "amber";
  if (st === "confirmed" || st === "booked" || st === "finished") return "green";
  return "blue";
}

function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Today and the six days after it, one column each (venue time). */
export function OverviewWeekStrip({ onOpenEvent, onSeeAll }: { onOpenEvent: (e: UpcomingEventRow) => void; onSeeAll: () => void }) {
  const { data } = trpc.dashboard.upcoming.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true });
  const todayKey = data?.todayKey;
  const keys = todayKey ? Array.from({ length: 7 }, (_, i) => addDaysKey(todayKey, i)) : [];
  const events = (data?.events ?? []).filter(e => keys.includes(e.dayKey));
  const range = keys.length ? `${dayLabel(keys[0]).replace(/^\w+\s/, "")} – ${dayLabel(keys[6]).replace(/^\w+\s/, "")}` : "";
  return (
    <section aria-label="Next 7 days" className="flex flex-col gap-2.5 min-w-0">
      <OvHead title="Next 7 days" meta={data ? `${range} · ${events.length} event${events.length !== 1 ? "s" : ""}` : undefined}
        action={<button type="button" onClick={onSeeAll} aria-label="View all upcoming events in the calendar list" className={`${linkBtn} whitespace-nowrap`}>View all</button>} />
      {!data ? (
        <p className="font-sans text-[13px] text-muted-foreground m-0 py-2">Loading…</p>
      ) : (
        <div className="rounded-[8px] border-[1.5px] border-border bg-card overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[760px]">
            {keys.map((k, i) => {
              const dayEvents = events.filter(e => e.dayKey === k);
              const isToday = i === 0;
              const [wd, dd] = dayLabel(k).split(" ");
              return (
                <div key={k} className="flex flex-col gap-1.5 p-2.5 min-h-[150px] border-r-[1.5px] border-[#ececed] last:border-r-0 min-w-0"
                  style={isToday ? { background: "var(--accent)" } : undefined}>
                  <h3 className={`m-0 font-sans text-[12px] tracking-[0.06em] uppercase ${isToday ? "font-extrabold text-primary" : "font-bold text-muted-foreground"}`}>
                    {wd} {dd}{isToday ? " · Today" : ""}
                  </h3>
                  {dayEvents.length === 0 ? (
                    <span className="font-sans text-[11.5px] text-muted-foreground">Nothing booked</span>
                  ) : dayEvents.map(e => {
                    const r = rowOf(e);
                    const tone = eventTone(e);
                    return (
                      <button key={`${e._type}-${e.id}`} type="button" onClick={() => onOpenEvent(e)}
                        className="text-left bg-card rounded-[4px] border-[1.5px] border-border px-[7px] py-[5px] hover:border-primary transition-colors min-w-0"
                        style={{ borderLeft: `3px solid ${FG[tone]}` }}>
                        <span className="block font-sans text-[12px] font-semibold leading-tight text-foreground break-words">{e.name || r.eventType || "Event"}</span>
                        <span className="block font-sans text-[11px] text-muted-foreground tabular-nums truncate">
                          {[e.startTime ? hhmmLabel(e.startTime) : null, r.guestCount ? `${r.guestCount} guests` : null].filter(Boolean).join(" · ") || r.status || ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data && (data.events ?? []).some(e => !keys.includes(e.dayKey)) && (
        <button type="button" onClick={onSeeAll} className={`${linkBtn} self-start`}>
          More in the next {UPCOMING_DAYS} days<ArrowRight className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
    </section>
  );
}

// ── Today card ───────────────────────────────────────────────────────────────

/** Today's events (venue time), each with its status and whether it's ready. */
export function OverviewToday(p: {
  onOpenEvent: (e: UpcomingEventRow) => void;
  onCalendar: () => void;
  newEnquiries: number;
  onNewEnquiries: () => void;
  statusLabel: (status: string) => string;
  /** The venue's colour for a status (Settings > Statuses). */
  statusColour?: (status: string) => string | null | undefined;
}) {
  const { data } = trpc.dashboard.upcoming.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true });
  const todays = (data?.events ?? []).filter(e => e.dayKey === data?.todayKey);
  return (
    <section aria-label="Today" className="rounded-[8px] border-[1.5px] border-border bg-card px-4 md:px-[18px] py-4">
      <OvHead title="Today" meta={todays.length ? `${todays.length} event${todays.length !== 1 ? "s" : ""}` : undefined} />
      {!data ? (
        <p className="font-sans text-[13px] text-muted-foreground m-0 pt-3">Loading…</p>
      ) : todays.length === 0 ? (
        <p className="font-sans text-[13px] text-muted-foreground m-0 pt-3">No events today.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {todays.map(e => {
            const r = rowOf(e);
            const colour = eventColour(e, p.statusColour);
            const ready = e._type === "booking" && (r.status === "confirmed" || r.status === "booked")
              ? [e.hasRunSheet ? "Run sheet ready" : "No run sheet", e.deposit === "paid" ? "deposit paid" : e.deposit === "due" ? "deposit due" : null].filter(Boolean).join(" · ")
              : "";
            return (
              <li key={`${e._type}-${e.id}`} className="border-b-[1.5px] border-[#ececed] last:border-b-0">
                <button type="button" onClick={() => p.onOpenEvent(e)}
                  className="w-full text-left grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 py-3 hover:bg-accent/40 rounded-[4px]">
                  <span className="font-sans text-[13px] font-bold tabular-nums text-foreground">{hhmmLabel(e.startTime) || "—"}</span>
                  <span className="min-w-0">
                    <span className="block font-sans text-[14px] font-semibold text-foreground truncate">{e.name}</span>
                    <span className="block font-sans text-[12px] text-muted-foreground truncate">
                      {[r.guestCount ? `${r.guestCount} guests` : null, r.spaceName, r.eventType].filter(Boolean).join(" · ")}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                      <Sig colour={colour}>{colour.clash ? "Double-booked" : p.statusLabel(r.status ?? "confirmed")}</Sig>
                      {ready && <span className="font-sans text-[12px] text-muted-foreground">{ready}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col items-start mt-2">
        <button type="button" onClick={p.onCalendar} className={linkBtn}>Open the calendar<ArrowRight className="w-3.5 h-3.5" aria-hidden /></button>
        {p.newEnquiries > 0 && (
          <button type="button" onClick={p.onNewEnquiries} className={linkBtn}>
            {p.newEnquiries} enquir{p.newEnquiries === 1 ? "y" : "ies"} waiting on a reply<ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

// ── Setup progress ───────────────────────────────────────────────────────────

/** Setup steps for a new venue: a progress bar and the steps still to do. */
export function OverviewSetup({ total, todo }: { total: number; todo: { key: string; label: string; sub: string; go: () => void }[] }) {
  if (todo.length === 0) return null;
  const done = total - todo.length;
  return (
    <section aria-label="Set up your venue" className="rounded-[8px] border-[1.5px] border-border bg-card px-4 md:px-[18px] py-4 flex flex-col gap-2.5">
      <OvHead title="Set up your venue" meta={`${done} of ${total} done`} />
      <div className="h-1.5 rounded-[3px] bg-[#ececed] overflow-hidden" role="progressbar" aria-label="Setup progress"
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full bg-primary" style={{ width: `${Math.round((done / Math.max(1, total)) * 100)}%` }} />
      </div>
      <ul className="m-0 p-0 list-none flex flex-col">
        {todo.map(st => (
          <li key={st.key} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block font-sans text-[13.5px] font-semibold text-foreground">{st.label}</span>
              <span className="block font-sans text-[12px] text-muted-foreground">{st.sub}</span>
            </span>
            <button type="button" onClick={st.go} aria-label={`Set up: ${st.label}`} className={btnOutline}>Set up</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
