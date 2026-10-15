import { Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SectionHead } from "@/components/ui/section-head";
import { dayLabel, hhmmLabel } from "@/lib/overviewDates";
import { UPCOMING_DAYS } from "@shared/needsToday";
import { rowOf, type UpcomingEventRow } from "@/components/TodayPanel";

const SHOWN = 8;
const chip = "inline-flex items-center rounded-full px-1.5 py-0.5 font-sans text-[10px] font-bold leading-none whitespace-nowrap";

/**
 * Overview "Upcoming Events": the next 14 days from today, independent of the
 * month the calendar is showing (today's events are in the Today panel). Each
 * row says where it is and whether it's ready: run sheet and deposit.
 */
export default function UpcomingEventsCard(p: {
  onOpenEvent: (e: UpcomingEventRow) => void;
  onSeeAll: () => void;
  statusInfo: (status: string) => { swatch: string; label: string };
}) {
  const { data } = trpc.dashboard.upcoming.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true });
  const list = (data?.events ?? []).filter(e => e.daysAway >= 1);
  const shown = list.slice(0, SHOWN);
  return (
    <div className="dante-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <SectionHead title="Upcoming Events" className="flex-1" />
        <button onClick={p.onSeeAll} aria-label="View all upcoming events in the calendar list" className="shrink-0 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary hover:text-primary/80 transition-colors">View all</button>
      </div>
      {!data ? (
        <p className="px-4 py-3 font-dm text-sm text-sage">Loading…</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <Calendar className="w-8 h-8 text-sage/20 mx-auto mb-2" aria-hidden />
          <p className="font-dm text-xs text-sage/70">Nothing else in the next {UPCOMING_DAYS} days</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {shown.map(e => {
            const r = rowOf(e);
            const info = p.statusInfo(r.status ?? "confirmed");
            const confirmed = r.status === "confirmed" || r.status === "booked";
            return (
              <button key={`${e._type}-${e.id}`} onClick={() => p.onOpenEvent(e)}
                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-linen transition-colors text-left">
                <div className="w-1 min-h-[32px] self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: info.swatch }} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-sm font-semibold text-foreground truncate tracking-[-0.01em]">{e.name}</div>
                  <div className="font-sans text-xs text-muted-foreground truncate [font-variant-numeric:tabular-nums_lining-nums]">
                    {dayLabel(e.dayKey)}{e.startTime ? ` · ${hhmmLabel(e.startTime)}` : ""}{r.spaceName ? ` · ${r.spaceName}` : ""}
                  </div>
                  {confirmed && e._type === "booking" && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={`${chip} ${e.hasRunSheet ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{e.hasRunSheet ? "Run sheet ✓" : "No run sheet"}</span>
                      {e.deposit === "paid" && <span className={`${chip} bg-emerald-100 text-emerald-900`}>Deposit paid</span>}
                      {e.deposit === "due" && <span className={`${chip} bg-amber-100 text-amber-900`}>Deposit due</span>}
                    </div>
                  )}
                  {!confirmed && <div className="mt-1"><span className={`${chip} bg-muted text-muted-foreground`}>{info.label}</span></div>}
                </div>
              </button>
            );
          })}
          {list.length > shown.length && (
            <button onClick={p.onSeeAll} className="w-full text-left px-4 py-2 min-h-[44px] font-dm text-xs font-semibold text-forest hover:bg-linen">
              +{list.length - shown.length} more in the next {UPCOMING_DAYS} days {"→"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
