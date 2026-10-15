import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SectionHead } from "@/components/ui/section-head";
import { Calendar, CheckSquare, Mail, DollarSign, ClipboardList, Bell, ChevronRight, Check } from "lucide-react";
import { formatWait, daysAwayLabel } from "@shared/needsToday";
import { dayLabel, hhmmLabel } from "@/lib/overviewDates";

/**
 * Overview, top of the page: the things a venue manager has to do today, one
 * line each, in priority order. Hidden entirely when there is nothing.
 *
 * Groups: events today · overdue tasks · enquiries waiting · deposits due ·
 * events with no run sheet · alerts. Each shows up to 5 rows; the rest are
 * "+N more" and link to the place that lists them.
 */
export interface NeedsYouTodayProps {
  /** Open an event in the dashboard's event drawer. */
  onOpenBooking: (bookingId: number) => void;
  /** Open an enquiry in the drawer. */
  onOpenLead: (leadId: number) => void;
  /** Follow an alert's link (enquiry links open the drawer, others navigate). */
  onOpenLink: (link: string) => void;
  onGoCalendarList: () => void;
  onGoTasksOverdue: () => void;
  onGoEnquiries: (view: "new" | "followup") => void;
  onGoDeposits: () => void;
}

const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-bold leading-none whitespace-nowrap";
const OK = `${chip} bg-emerald-100 text-emerald-900`;
const WARN = `${chip} bg-amber-100 text-amber-900`;
const MUTED = `${chip} bg-muted text-muted-foreground`;
const actionBtn = "shrink-0 font-bebas tracking-widest text-[11px] px-2.5 min-h-[44px] sm:min-h-[32px] border border-forest text-forest hover:bg-linen whitespace-nowrap";

function GroupHead({ icon, title, count }: { icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-y border-border first:border-t-0">
      <span className="text-muted-foreground" aria-hidden>{icon}</span>
      <h3 className="font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-foreground m-0">{title}</h3>
      <span className="font-sans text-[11px] font-bold text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}

function More({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  if (n <= 0) return null;
  if (!onClick) return <p className="px-4 py-2 font-dm text-xs text-ink/70">+{n} more {label}</p>;
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-2 min-h-[44px] font-dm text-xs font-semibold text-forest hover:bg-linen flex items-center justify-between gap-2">
      <span>+{n} more {label}</span><ChevronRight className="w-4 h-4" aria-hidden />
    </button>
  );
}

/** One line: the client or thing in bold, the detail after it (wraps on a phone, truncates on desktop). */
function Line({ name, sub }: { name: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span className="block font-dm text-sm text-ink break-words sm:truncate">
      <span className="font-semibold">{name}</span>{sub ? <span className="text-ink/70"> {"\u00b7"} {sub}</span> : null}
    </span>
  );
}

const rowBase = "px-4 py-1 flex items-center gap-3 min-h-[44px] sm:min-h-[40px]";
const mainBtn = "min-w-0 flex-1 text-left hover:underline focus-visible:underline outline-none";

export default function NeedsYouToday(p: NeedsYouTodayProps) {
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

  if (!data || data.total === 0) return null;
  const { tonight, tasks, enquiries, deposits, runsheets, alerts } = data;
  const taskItems = tasks.items.filter(t => !doneIds.has(t.id));
  const shownAwaiting = enquiries.items.filter(i => i.reason === "awaiting_reply").length;
  const moreAwaiting = enquiries.awaitingTotal - shownAwaiting > 0;

  return (
    <section aria-label="Needs you today" className="dante-card overflow-hidden flex-1 min-w-0">
      <div className="px-4 py-3 border-b border-border">
        <SectionHead title="Needs you today" tone="red" meta={`${data.total} thing${data.total !== 1 ? "s" : ""}`} />
      </div>

      {tonight.total > 0 && (<>
        <GroupHead icon={<Calendar className="w-3.5 h-3.5" />} title="Events today" count={tonight.total} />
        <div className="divide-y divide-border">
          {tonight.items.map(e => (
            <div key={e.bookingId} className={`${rowBase} flex-wrap sm:flex-nowrap py-1.5`}>
              <button onClick={() => p.onOpenBooking(e.bookingId)} className={mainBtn}>
                <Line
                  name={<>{e.startTime ? <span className="tabular-nums">{hhmmLabel(e.startTime)} {"\u00b7"} </span> : null}{e.name}</>}
                  sub={[e.eventType, e.spaceName, e.guestCount ? `${e.guestCount} guests` : null].filter(Boolean).join(" \u00b7 ") || undefined} />
              </button>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className={e.hasRunSheet ? OK : WARN}>{e.hasRunSheet ? "Run sheet ✓" : "No run sheet"}</span>
                {e.deposit === "paid" && <span className={OK}>Deposit paid</span>}
                {e.deposit === "due" && <span className={WARN}>Deposit due</span>}
                {e.deposit === "none" && <span className={MUTED}>No deposit</span>}
              </span>
              <button
                onClick={() => setLocation(e.runsheetId ? `/runsheet?id=${e.runsheetId}&bookingId=${e.bookingId}` : `/runsheet?bookingId=${e.bookingId}`)}
                className={actionBtn}>
                {e.hasRunSheet ? "RUN SHEET" : "CREATE RUN SHEET"}
              </button>
            </div>
          ))}
        </div>
        <More n={tonight.total - tonight.items.length} label="events today" onClick={p.onGoCalendarList} />
      </>)}

      {tasks.total > 0 && (<>
        <GroupHead icon={<CheckSquare className="w-3.5 h-3.5" />} title="Overdue tasks" count={tasks.total} />
        <div className="divide-y divide-border">
          {taskItems.map(t => (
            <div key={t.id} className={rowBase}>
              <button
                role="checkbox" aria-checked={false} aria-label={`Mark done: ${t.title}`}
                disabled={complete.isPending}
                onClick={() => { setDoneIds(prev => new Set(prev).add(t.id)); complete.mutate({ id: t.id, completed: true }); }}
                className="shrink-0 w-11 h-11 -ml-2 grid place-items-center group">
                <span className="w-5 h-5 border-2 border-ink/50 rounded-sm grid place-items-center group-hover:border-forest group-hover:bg-forest/10">
                  <Check className="w-3.5 h-3.5 text-forest opacity-0 group-hover:opacity-60" aria-hidden />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <Line name={t.title} sub={<>{t.daysOverdue} day{t.daysOverdue !== 1 ? "s" : ""} overdue{t.linkedName ? <> {"\u00b7"} <button
                    onClick={() => (t.bookingId ? p.onOpenBooking(t.bookingId) : t.leadId ? p.onOpenLead(t.leadId) : undefined)}
                    className="underline hover:text-ink">{t.linkedName}</button></> : null}</>} />
              </div>
            </div>
          ))}
        </div>
        <More n={tasks.total - tasks.items.length} label="overdue tasks" onClick={p.onGoTasksOverdue} />
      </>)}

      {enquiries.total > 0 && (<>
        <GroupHead icon={<Mail className="w-3.5 h-3.5" />} title="Enquiries waiting on you" count={enquiries.total} />
        <div className="divide-y divide-border">
          {enquiries.items.map(l => (
            <div key={l.leadId} className={rowBase}>
              <button onClick={() => p.onOpenLead(l.leadId)} className={mainBtn}>
                <Line name={l.name} sub={
                  (l.reason === "awaiting_reply"
                    ? `waiting ${formatWait(l.waitingHours ?? 0)} for a first reply`
                    : (l.followUpDaysOverdue ?? 0) <= 0 ? "follow-up due today" : `follow-up ${l.followUpDaysOverdue} day${l.followUpDaysOverdue !== 1 ? "s" : ""} overdue`)
                  + (l.eventType ? ` \u00b7 ${l.eventType}` : "")} />
              </button>
              <button onClick={() => p.onOpenLead(l.leadId)} className={actionBtn}>{l.reason === "awaiting_reply" ? "REPLY" : "OPEN"}</button>
            </div>
          ))}
        </div>
        <More n={enquiries.total - enquiries.items.length} label="enquiries" onClick={() => p.onGoEnquiries(moreAwaiting ? "new" : "followup")} />
      </>)}

      {deposits.total > 0 && (<>
        <GroupHead icon={<DollarSign className="w-3.5 h-3.5" />} title="Deposits due (next 21 days)" count={deposits.total} />
        <div className="divide-y divide-border">
          {deposits.items.map(d => (
            <div key={d.bookingId} className={rowBase}>
              <button onClick={() => setLocation(`/payments?bookingId=${d.bookingId}&from=overview`)} className={mainBtn}>
                <Line name={d.name} sub={`${d.amount > 0 ? `$${d.amount.toLocaleString("en-NZ")} deposit` : "deposit amount not set"}${d.requested ? " (asked for)" : ""} \u00b7 event ${daysAwayLabel(d.daysAway)}`} />
              </button>
              <button onClick={() => setLocation(`/payments?bookingId=${d.bookingId}&from=overview`)} className={actionBtn}>PAYMENTS</button>
            </div>
          ))}
        </div>
        <More n={deposits.total - deposits.items.length} label="deposits due" onClick={p.onGoDeposits} />
      </>)}

      {runsheets.total > 0 && (<>
        <GroupHead icon={<ClipboardList className="w-3.5 h-3.5" />} title="No run sheet (next 7 days)" count={runsheets.total} />
        <div className="divide-y divide-border">
          {runsheets.items.map(r => (
            <div key={r.bookingId} className={rowBase}>
              <button onClick={() => p.onOpenBooking(r.bookingId)} className={mainBtn}>
                <Line name={r.name} sub={`${dayLabel(r.dayKey)}${r.startTime ? ` ${hhmmLabel(r.startTime)}` : ""} \u00b7 ${daysAwayLabel(r.daysAway)}${r.spaceName ? ` \u00b7 ${r.spaceName}` : ""}`} />
              </button>
              <button onClick={() => setLocation(`/runsheet?bookingId=${r.bookingId}`)} className={actionBtn}>CREATE RUN SHEET</button>
            </div>
          ))}
        </div>
        <More n={runsheets.total - runsheets.items.length} label="events without a run sheet" onClick={p.onGoCalendarList} />
      </>)}

      {alerts.total > 0 && (<>
        <GroupHead icon={<Bell className="w-3.5 h-3.5" />} title="Alerts to look at" count={alerts.total} />
        <div className="divide-y divide-border">
          {alerts.items.map(a => (
            <div key={a.id} className={rowBase}>
              <button
                onClick={() => { markRead.mutate({ id: a.id }); if (a.link) p.onOpenLink(a.link); }}
                className={mainBtn}>
                <Line name={a.title} />
              </button>
              {a.link && <button onClick={() => { markRead.mutate({ id: a.id }); p.onOpenLink(a.link!); }} className={actionBtn}>OPEN</button>}
            </div>
          ))}
        </div>
        <More n={alerts.total - alerts.items.length} label="in the alerts bell" />
      </>)}
    </section>
  );
}
