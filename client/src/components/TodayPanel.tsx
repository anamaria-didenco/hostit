import { trpc } from "@/lib/trpc";
import { SectionHead } from "@/components/ui/section-head";
import { hhmmLabel } from "@/lib/overviewDates";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type UpcomingEventRow = inferRouterOutputs<AppRouter>["dashboard"]["upcoming"]["events"][number];

/** The event's own booking/enquiry fields, for the one-line summary. */
export const rowOf = (e: UpcomingEventRow) => e.row as { eventType?: string | null; guestCount?: number | null; spaceName?: string | null; status?: string | null; eventDate: Date | string };

/**
 * Overview "Today": the events on today's date in the venue's time zone, whatever
 * month the calendar is showing. Phone: below "Needs you today"; desktop: the
 * compact panel at the top right.
 */
export default function TodayPanel(p: {
  onOpenEvent: (e: UpcomingEventRow) => void;
  onCalendar: () => void;
  newEnquiries: number;
  onNewEnquiries: () => void;
  className?: string;
}) {
  const { data } = trpc.dashboard.upcoming.useQuery(undefined, { staleTime: 15_000, refetchOnWindowFocus: true });
  const todays = (data?.events ?? []).filter(e => e.dayKey === data?.todayKey);
  return (
    <section aria-label="Today" className={`dante-card overflow-hidden ${p.className ?? ""}`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <SectionHead title="Today" meta={todays.length ? `${todays.length} event${todays.length !== 1 ? "s" : ""}` : undefined} className="flex-1" />
        <button onClick={p.onCalendar} className="shrink-0 font-sans text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary min-h-[44px]">Calendar</button>
      </div>
      {!data ? (
        <p className="px-4 py-3 font-dm text-sm text-sage">Loading…</p>
      ) : todays.length === 0 ? (
        <p className="px-4 py-3 font-dm text-sm text-sage">No events today.</p>
      ) : (
        <div className="divide-y divide-border">
          {todays.map(e => {
            const r = rowOf(e);
            return (
              <button key={`${e._type}-${e.id}`} onClick={() => p.onOpenEvent(e)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-left hover:bg-linen">
                <span className="font-dm text-sm tabular-nums text-ink/70 w-16 shrink-0">{hhmmLabel(e.startTime) || "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-sm font-semibold text-foreground truncate">{e.name}</span>
                  <span className="block font-sans text-xs text-muted-foreground truncate">
                    {[r.eventType, r.guestCount ? `${r.guestCount} guests` : null, r.spaceName].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {p.newEnquiries > 0 && (
        <button onClick={p.onNewEnquiries}
          className="w-full text-left px-4 py-3 min-h-[44px] border-t border-border font-dm text-sm font-semibold text-forest hover:bg-linen">
          {p.newEnquiries} new enquir{p.newEnquiries === 1 ? "y" : "ies"} waiting {"→"}
        </button>
      )}
    </section>
  );
}
