import React from "react";
import { createPortal } from "react-dom";
import { FileText, X, Search, CalendarDays, Plus, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { currency } from "@/lib/money";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * One tap to an invoice, from anywhere. Instead of hunting down the event on
 * the Payments board (or drilling into its drawer) to find the Xero button,
 * open this, type the client's name, and go straight to the send modal — or
 * raise a one-off invoice for someone with no event.
 *
 * It owns no invoice UI itself: picking an event hands the booking (and the
 * stream most likely meant) back to the parent, which opens the same
 * XeroPushModal every other entry point uses; "one-off" opens NewInvoiceDialog.
 */

export type LaunchStream = "deposit" | "food" | "drinks";
export interface InvoiceTarget {
  bookingId: number;
  name: string;
  eventDate: string | null;
  depositPaid: boolean;
  depositNzd: number;
  initialStream: LaunchStream;
}

type OverviewRow = {
  bookingId: number;
  name: string;
  eventDate: string | null;
  eventType: string | null;
  depositPaid: boolean;
  depositNzd: number;
  depositRequired: boolean;
  hasPrice: boolean;
  outstanding: number | null;
  foodStatus: string;
  drinksStatus: string;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "No date";

/** The stream the operator most likely wants for this event: an unpaid deposit
 *  first, then food until it's billed, then drinks. Matches the Payments board. */
function likelyStream(r: OverviewRow): LaunchStream {
  if (r.depositRequired && !r.depositPaid) return "deposit";
  if (r.foodStatus !== "paid" && r.foodStatus !== "invoiced") return "food";
  return "drinks";
}

/** A short hint of what sending will most likely cover, so the list is scannable. */
function hint(r: OverviewRow): string {
  if (r.depositRequired && !r.depositPaid) return "Deposit due";
  if (r.outstanding != null && r.outstanding > 0) return `${currency(r.outstanding)} owing`;
  if (!r.hasPrice) return "No total set";
  return "Paid up";
}

export default function InvoiceLauncher({
  onClose,
  onPickEvent,
  onOneOff,
}: {
  onClose: () => void;
  onPickEvent: (target: InvoiceTarget) => void;
  onOneOff: () => void;
}) {
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  useEscapeKey(true, onClose);
  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const { data, isLoading } = trpc.payments.overview.useQuery();
  const rows: OverviewRow[] = (data as any) ?? [];

  const matches = React.useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = n
      ? rows.filter(r => `${r.name} ${r.eventType ?? ""}`.toLowerCase().includes(n))
      // No query yet: the events most likely to need invoicing — soonest first,
      // and only those with something still to bill.
      : rows
          .filter(r => (r.depositRequired && !r.depositPaid) || (r.outstanding != null && r.outstanding > 0) || !r.hasPrice)
          .sort((a, b) => (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999"));
    return base.slice(0, 8);
  }, [rows, q]);

  const pick = (r: OverviewRow) =>
    onPickEvent({
      bookingId: r.bookingId,
      name: r.name,
      eventDate: r.eventDate,
      depositPaid: r.depositPaid,
      depositNzd: r.depositNzd,
      initialStream: likelyStream(r),
    });

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-start justify-center p-4 pt-[10vh] bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Send an invoice"
        className="bg-cream w-full max-w-md shadow-2xl border border-gold/20 flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-forest-dark px-5 py-3.5 flex items-center justify-between">
          <div>
            <div className="font-bebas tracking-widest text-xs text-gold-bright">INVOICE</div>
            <div className="font-cormorant text-cream font-semibold text-lg leading-tight">Who are you invoicing?</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-cream opacity-85 hover:opacity-100 hover:bg-forest rounded-sm p-1.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 border border-gold/30 bg-white px-3 min-h-[44px] rounded-md focus-within:border-forest">
            <Search className="w-4 h-4 text-ink/40 flex-shrink-0" aria-hidden="true" />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && matches[0]) pick(matches[0]); }}
              placeholder="Search an event by client name…"
              aria-label="Search an event by client name"
              className="flex-1 min-w-0 bg-transparent font-dm text-sm text-ink focus:outline-none" />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {isLoading ? (
            <p className="font-dm text-sm text-ink/55 py-6 text-center" role="status">Loading your events…</p>
          ) : matches.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label="Events">
              {matches.map(r => (
                <li key={r.bookingId}>
                  <button onClick={() => pick(r)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md border border-gold/20 bg-linen/40 hover:bg-gold/10 hover:border-forest/40 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <div className="font-cormorant text-base font-semibold text-ink truncate leading-tight">{r.name}</div>
                      <div className="flex items-center gap-1.5 font-dm text-xs text-sage mt-0.5">
                        <CalendarDays className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                        <span>{fmtDate(r.eventDate)}</span>
                        {r.eventType && <><span aria-hidden="true">·</span><span className="truncate">{r.eventType}</span></>}
                      </div>
                    </div>
                    <span className="font-bebas tracking-widest text-[11px] text-ink/60 flex-shrink-0">{hint(r)}</span>
                    <ArrowRight className="w-4 h-4 text-forest opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-dm text-sm text-ink/55 py-6 text-center">
              {q.trim() ? "No events match that name." : "No events waiting to be invoiced."}
            </p>
          )}
        </div>

        {/* One-off */}
        <div className="border-t border-gold/20 p-3">
          <button onClick={onOneOff}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-forest/30 text-forest hover:bg-forest/10 transition-colors">
            <span className="grid place-items-center w-7 h-7 rounded-full bg-forest/10 flex-shrink-0"><Plus className="w-4 h-4" aria-hidden="true" /></span>
            <span className="text-left min-w-0">
              <span className="block font-bebas tracking-widest text-xs text-forest">ONE-OFF INVOICE</span>
              <span className="block font-dm text-xs text-ink/60">No event — bill a contact directly</span>
            </span>
            <FileText className="w-4 h-4 text-forest/50 ml-auto flex-shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
