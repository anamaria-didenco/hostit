import { useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * "Check a date": a compact panel (opened from the Calendar toolbar) that
 * answers "which spaces are free on this day?" — the calendar shows events,
 * not free rooms. Pick a date (optionally a range) and see every space marked
 * free or busy, with the bookings/holds that take it.
 *
 * Reads availability.forDate, which reuses the server's clash logic, so "busy"
 * means exactly what a date clash means everywhere else. Self-contained: mount
 * once as <SpaceAvailability /> wherever the trigger button belongs.
 */
const NZ_TZ = "Pacific/Auckland";
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: NZ_TZ });

const KIND_LABEL: Record<string, string> = { booked: "Booked", hold: "On hold", tentative: "Pencilled" };

function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NZ", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}

function eventLine(e: { name: string; eventType: string | null; start: string; end: string | null; allDay: boolean }): string {
  const time = (() => {
    if (e.allDay || !e.end) return "";
    const f = (iso: string) => new Date(iso).toLocaleTimeString("en-NZ", { timeZone: NZ_TZ, hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, "").toLowerCase();
    return `${f(e.start)}–${f(e.end)}`;
  })();
  return [e.name, e.eventType, time].filter(Boolean).join(" · ");
}

export function SpaceAvailability() {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayYmd);
  const [showRange, setShowRange] = useState(false);
  const [dateTo, setDateTo] = useState("");

  const effectiveTo = showRange && dateTo && dateTo >= date ? dateTo : undefined;
  const { data, isFetching } = trpc.availability.forDate.useQuery(
    { date, dateTo: effectiveTo },
    { enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(date), staleTime: 30_000, refetchOnWindowFocus: false },
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Check which spaces are free on a date"
          aria-label="Check availability by space"
          className="border border-forest/40 text-forest hover:bg-forest/10 font-bebas tracking-widest text-xs px-3 py-2 flex items-center gap-1 flex-shrink-0 transition-colors"
        >
          <CalendarCheck className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CHECK A DATE</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-label="Availability by space" className="w-[20rem] max-w-[92vw] bg-white border border-gold/30 shadow-xl p-0">
        <div className="px-4 py-3 border-b border-gold/15">
          <div className="font-bebas tracking-widest text-xs text-ink/70 mb-2">AVAILABILITY BY SPACE</div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              aria-label="Date to check"
              className="flex-1 font-dm text-sm px-2 py-1.5 border border-gold/30 text-ink focus:outline-none focus:border-forest"
            />
            {showRange && (
              <>
                <span className="font-dm text-xs text-ink/50">to</span>
                <input
                  type="date"
                  value={dateTo}
                  min={date}
                  onChange={e => setDateTo(e.target.value)}
                  aria-label="End date"
                  className="flex-1 font-dm text-sm px-2 py-1.5 border border-gold/30 text-ink focus:outline-none focus:border-forest"
                />
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowRange(v => !v); if (showRange) setDateTo(""); }}
            className="mt-2 font-dm text-[11px] text-forest hover:underline"
          >
            {showRange ? "Single day" : "+ Check a range"}
          </button>
        </div>

        <div className="max-h-[22rem] overflow-auto">
          {isFetching && !data ? (
            <div className="flex items-center justify-center gap-2 py-8 text-ink/50 font-dm text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking…
            </div>
          ) : !data || data.days.length === 0 ? (
            <div className="py-8 text-center font-dm text-sm text-ink/50">Pick a date to check.</div>
          ) : (
            data.days.map(day => {
              const spaces = day.spaces;
              return (
                <div key={day.date} className="border-b border-gold/10 last:border-b-0">
                  {data.days.length > 1 && (
                    <div className="px-4 pt-3 pb-1 font-bebas tracking-widest text-[11px] text-ink/60">{fmtDay(day.date)}</div>
                  )}
                  {spaces.length === 0 ? (
                    <div className="px-4 py-3 font-dm text-xs text-ink/50">No spaces set up yet — add them in Settings.</div>
                  ) : (
                    <div className="divide-y divide-gold/10">
                      {spaces.map(sp => (
                        <div key={sp.spaceId} className="px-4 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-serif text-sm text-ink truncate">{sp.spaceName}</span>
                            <span className={`font-bebas tracking-widest text-[10px] px-2 py-0.5 rounded-sm shrink-0 ${sp.busy ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                              {sp.busy ? "BUSY" : "FREE"}
                            </span>
                          </div>
                          {sp.events.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {sp.events.map(e => (
                                <li key={`${e.source}-${e.id}`} className="font-dm text-[11px] text-ink/70 flex items-start gap-1.5">
                                  <span className="text-ink/40 mt-0.5">·</span>
                                  <span className="flex-1">{eventLine(e)}</span>
                                  <span className="text-ink/45 shrink-0">{KIND_LABEL[e.kind] ?? e.kind}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {day.unknownSpace.length > 0 && (
                    <div className="px-4 py-2.5 bg-amber-50/50 border-t border-amber-200/40">
                      <div className="font-bebas tracking-widest text-[10px] text-amber-700 mb-1">SPACE NOT SET</div>
                      <ul className="space-y-0.5">
                        {day.unknownSpace.map(e => (
                          <li key={`${e.source}-${e.id}`} className="font-dm text-[11px] text-ink/70">{eventLine(e)} — {KIND_LABEL[e.kind] ?? e.kind}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
