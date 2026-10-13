import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { downloadBeoBatch } from "@/lib/beoUrl";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/** YYYY-MM-DD from LOCAL date parts (toISOString is UTC, a day behind in NZ mornings). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = m.getDay();
  m.setDate(m.getDate() - (day === 0 ? 6 : day - 1));
  return m;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const dayFmt = new Intl.DateTimeFormat("en-NZ", { weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true });

/**
 * Print a week of run sheets: pick the week, untick anything you don't need,
 * and get ONE PDF with every event's team copy in date order.
 */
export function PrintWeekModal({ open, onClose, initialDate }: { open: boolean; onClose: () => void; initialDate?: Date }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(initialDate ?? new Date()));
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  useEscapeKey(open && !busy, onClose);

  useEffect(() => {
    if (open) setWeekStart(mondayOf(initialDate ?? new Date()));
    // Only when it opens: re-centring while the calendar moves would fight the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => setSkipped(new Set()), [weekStart]);

  const from = ymd(weekStart);
  const to = ymd(addDays(weekStart, 6));
  const { data: events, isLoading, isError } = trpc.bookings.forPrint.useQuery({ from, to }, { enabled: open });
  const list = useMemo(() => (events ?? []) as any[], [events]);
  const chosen = list.filter(e => !skipped.has(e.id));
  const weekLabel = `${dayFmt.format(weekStart)} – ${dayFmt.format(addDays(weekStart, 6))}`;

  if (!open) return null;

  const toggle = (id: number) => setSkipped(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const download = async () => {
    if (!chosen.length) return;
    setBusy(true);
    const ok = await downloadBeoBatch(chosen.map(e => e.id), `Run sheets - week of ${weekStart.getDate()} ${weekStart.toLocaleString("en-NZ", { month: "short" })}`);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="print-week-title" className="bg-white w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: "92vh" }}>
        <div className="bg-forest px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <div id="print-week-title" className="font-bebas tracking-widest text-cream text-base">PRINT THE WEEK</div>
            <p className="font-dm text-cream/70 text-xs mt-0.5">Every event's run sheet in one PDF, in date order</p>
          </div>
          <button aria-label="Close" onClick={onClose} disabled={busy}
            className="text-cream/70 hover:text-cream transition-colors ml-4 flex-shrink-0 w-11 h-11 inline-flex items-center justify-center disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Previous week" disabled={busy}
              className="w-11 h-11 inline-flex items-center justify-center border border-gold/30 text-forest hover:bg-linen disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <label className="flex-1 min-w-0">
              <span className="sr-only">Week starting</span>
              <input type="date" value={from} disabled={busy}
                onChange={e => { if (e.target.value) { const [y, m, d] = e.target.value.split("-").map(Number); setWeekStart(mondayOf(new Date(y, m - 1, d))); } }}
                className="w-full border border-gold/30 px-3 min-h-[44px] font-dm text-sm focus:outline-none focus:border-forest" />
            </label>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Next week" disabled={busy}
              className="w-11 h-11 inline-flex items-center justify-center border border-gold/30 text-forest hover:bg-linen disabled:opacity-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="font-bebas tracking-widest text-[11px] text-ink/70">{weekLabel.toUpperCase()}</div>

          {isLoading ? (
            <p className="font-dm text-sm text-ink/60">Loading the week's events…</p>
          ) : isError ? (
            <p className="font-dm text-sm text-[#b3261e]">Couldn't load the events. Try again.</p>
          ) : list.length === 0 ? (
            <p className="font-dm text-sm text-ink/60">No events this week.</p>
          ) : (
            <ul className="border border-gold/20 divide-y divide-gold/15">
              {list.map(e => {
                const d = e.eventDate ? new Date(e.eventDate) : null;
                const meta = [
                  d ? `${dayFmt.format(d)} · ${timeFmt.format(d)}` : "No date",
                  e.spaceName, e.guestCount ? `${e.guestCount} guests` : null,
                  e.status === "tentative" ? "Tentative" : null,
                ].filter(Boolean).join(" · ");
                return (
                  <li key={e.id}>
                    <label className="flex items-start gap-3 px-3 py-2.5 min-h-[44px] cursor-pointer hover:bg-linen/50">
                      <input type="checkbox" checked={!skipped.has(e.id)} onChange={() => toggle(e.id)} disabled={busy}
                        className="mt-1 w-4 h-4 accent-forest flex-none" />
                      <span className="min-w-0">
                        <span className="block font-dm text-sm text-ink font-semibold break-words">{e.name}{e.eventType ? ` — ${e.eventType}` : ""}</span>
                        <span className="block font-dm text-xs text-ink/60">{meta}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gold/20 flex items-center justify-between gap-3 flex-shrink-0">
          <span className="font-dm text-xs text-ink/60">{list.length ? `${chosen.length} of ${list.length} selected` : ""}</span>
          <button onClick={download} disabled={busy || chosen.length === 0}
            className="font-bebas tracking-widest text-sm px-4 min-h-[44px] bg-forest text-cream hover:bg-forest/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
            <Printer className="w-4 h-4" /> {busy ? "PREPARING…" : `DOWNLOAD ${chosen.length || ""} RUN SHEET${chosen.length === 1 ? "" : "S"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
