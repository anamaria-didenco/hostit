import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { X, Plus, Trash2, RefreshCw, FileText } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  booking: {
    bookingId: number;
    name: string;
    eventDate: string | null;
    depositPaid: boolean;
    depositNzd: number;
  } | null;
  /** Which stream the user tapped from (preselects the toggle). */
  initialStream?: "food" | "drinks";
}

interface Line { description: string; quantity: string; unitAmount: string; }

const fmtNZD = (n: number) =>
  n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 2 });

/**
 * Review-and-send modal for pushing an event's Food or Drinks invoice to Xero
 * as a DRAFT. The operator confirms every line before anything is created —
 * deliberate friction, because this is money. The drinks stream auto-adds the
 * "less deposit received" deduction line per Bar Franco's standard terms.
 */
export default function XeroPushModal({ open, onClose, booking, initialStream }: Props) {
  const utils = trpc.useUtils();
  const [stream, setStream] = useState<"food" | "drinks">(initialStream ?? "food");
  const [lines, setLines] = useState<Line[]>([]);
  const [dueDate, setDueDate] = useState("");

  useEscapeKey(open, onClose);

  const { data: existing } = trpc.xero.invoicesForBooking.useQuery(
    { bookingId: booking?.bookingId ?? 0 },
    { enabled: open && !!booking }
  );
  const { data: xeroStatus } = trpc.xero.status.useQuery(undefined, { enabled: open });

  // Seed the editable lines whenever the modal opens or the stream flips.
  useEffect(() => {
    if (!open || !booking) return;
    const ev = booking.eventDate
      ? new Date(booking.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
      : "";
    const label = `${stream === "food" ? "Food" : "Drinks"} — ${booking.name}${ev ? ` · ${ev}` : ""}`;
    const seeded: Line[] = [{ description: label, quantity: "1", unitAmount: "" }];
    if (stream === "drinks" && booking.depositPaid) {
      const dep = booking.depositNzd > 0 ? booking.depositNzd : 575;
      seeded.push({ description: "Less deposit received", quantity: "1", unitAmount: String(-dep) });
    }
    setLines(seeded);
  }, [open, stream, booking?.bookingId]);

  const push = trpc.xero.pushInvoice.useMutation({
    onSuccess: (r) => {
      toast.success(`Draft sent to Xero${r.invoiceNumber ? ` — ${r.invoiceNumber}` : ""} (${fmtNZD(r.total)})`, {
        action: r.xeroUrl ? { label: "Open in Xero", onClick: () => window.open(r.xeroUrl, "_blank", "noopener") } : undefined,
        duration: 8000,
      });
      utils.xero.invoicesForBooking.invalidate({ bookingId: booking!.bookingId });
      onClose();
    },
    onError: (e) => toast.error(e.message || "Failed to send to Xero"),
  });
  const sync = trpc.xero.syncStatuses.useMutation({
    onSuccess: (r) => {
      toast.success(r.updated > 0 ? `Updated ${r.updated} invoice status${r.updated === 1 ? "" : "es"} from Xero` : "Statuses already up to date");
      utils.xero.invoicesForBooking.invalidate({ bookingId: booking!.bookingId });
      utils.payments.overview.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to check Xero"),
  });

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitAmount) || 0), 0),
    [lines]
  );

  if (!open || !booking) return null;

  const send = () => {
    const parsed = lines
      .map(l => ({ description: l.description.trim(), quantity: Number(l.quantity), unitAmount: Number(l.unitAmount) }))
      .filter(l => l.description && !isNaN(l.quantity) && l.quantity > 0 && !isNaN(l.unitAmount) && l.unitAmount !== 0);
    if (parsed.length === 0) { toast.error("Add at least one line with an amount"); return; }
    push.mutate({
      bookingId: booking.bookingId,
      stream,
      lines: parsed,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Send ${stream} invoice to Xero`}
        className="bg-cream w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-gold/20"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-forest-dark px-5 py-3.5 flex items-center justify-between">
          <div>
            <div className="font-bebas tracking-widest text-xs text-gold">SEND TO XERO · DRAFT</div>
            <div className="font-cormorant text-cream font-semibold text-lg leading-tight">{booking.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-cream/80 hover:text-cream p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!xeroStatus?.connected && (
            <div className="border border-amber-300 bg-amber-50 text-amber-800 font-dm text-xs p-3">
              Xero isn't connected yet — connect it in Settings → Integrations first.
            </div>
          )}

          {/* Stream toggle */}
          <div className="flex gap-1.5" role="radiogroup" aria-label="Invoice type">
            {(["food", "drinks"] as const).map(s => (
              <button key={s} role="radio" aria-checked={stream === s} onClick={() => setStream(s)}
                className={`font-bebas tracking-widest text-xs px-4 py-2 border transition-colors ${
                  stream === s ? "bg-forest text-cream border-forest" : "border-gold/30 text-ink/70 hover:bg-gold/10"}`}>
                {s === "food" ? "FOOD (PRE-EVENT)" : "DRINKS (AFTER)"}
              </button>
            ))}
          </div>

          {/* Already-sent invoices for this event */}
          {existing && existing.length > 0 && (
            <div className="border border-gold/20 bg-linen/50 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bebas tracking-widest text-[10px] text-ink/70">ALREADY SENT FOR THIS EVENT</span>
                <button onClick={() => sync.mutate({ bookingId: booking.bookingId })} disabled={sync.isPending}
                  className="font-bebas tracking-widest text-[10px] text-forest inline-flex items-center gap-1 hover:underline disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${sync.isPending ? "animate-spin" : ""}`} /> CHECK STATUS
                </button>
              </div>
              {existing.map((inv: any) => (
                <div key={inv.id} className="font-dm text-xs text-ink/80 flex items-center gap-2 py-0.5">
                  <FileText className="w-3 h-3 text-ink/50" aria-hidden="true" />
                  <span className="uppercase font-semibold">{inv.stream}</span>
                  <span>{inv.invoiceNumber ?? "(no number yet)"}</span>
                  <span className="ml-auto">{inv.total != null ? fmtNZD(Number(inv.total)) : ""}</span>
                  <span className={`font-bebas tracking-widest text-[10px] px-1.5 py-0.5 rounded ${
                    inv.status === "PAID" ? "bg-green-100 text-green-700" : inv.status === "AUTHORISED" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                    {inv.status ?? "DRAFT"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Line editor */}
          <div>
            <div className="font-bebas tracking-widest text-[10px] text-ink/70 mb-1.5">INVOICE LINES (NZD)</div>
            <div className="space-y-1.5">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input value={l.description} aria-label={`Line ${i + 1} description`}
                    onChange={e => setLines(p => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    className="flex-1 min-w-0 border border-gold/30 px-2.5 py-2 font-dm text-sm bg-white focus:outline-none focus:border-forest" />
                  <input value={l.quantity} aria-label={`Line ${i + 1} quantity`} type="number" min="1"
                    onChange={e => setLines(p => p.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                    className="w-14 border border-gold/30 px-2 py-2 font-dm text-sm bg-white text-right focus:outline-none focus:border-forest" />
                  <input value={l.unitAmount} aria-label={`Line ${i + 1} amount`} type="number" step="0.01" placeholder="0.00"
                    onChange={e => setLines(p => p.map((x, j) => j === i ? { ...x, unitAmount: e.target.value } : x))}
                    className="w-24 border border-gold/30 px-2 py-2 font-dm text-sm bg-white text-right focus:outline-none focus:border-forest" />
                  <button onClick={() => setLines(p => p.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}
                    className="text-ink/40 hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setLines(p => [...p, { description: "", quantity: "1", unitAmount: "" }])}
              className="mt-2 font-bebas tracking-widest text-[11px] text-forest inline-flex items-center gap-1 hover:underline">
              <Plus className="w-3 h-3" /> ADD LINE
            </button>
          </div>

          {/* Due date + total */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <label htmlFor="xero-due" className="font-bebas tracking-widest text-[10px] text-ink/70 block mb-1">DUE DATE (OPTIONAL)</label>
              <input id="xero-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="border border-gold/30 px-3 py-2 font-dm text-sm bg-white focus:outline-none focus:border-forest" />
            </div>
            <div className="text-right">
              <div className="font-bebas tracking-widest text-[10px] text-ink/70">TOTAL{xeroStatus?.connected ? (xeroStatus.lineAmountsInclusive ? " · INCL. GST" : " · EXCL. GST") : ""}</div>
              <div className="font-cormorant text-2xl font-semibold text-ink">{fmtNZD(total)}</div>
            </div>
          </div>

          <p className="font-dm text-[11px] text-ink/60">
            Creates a <b>draft</b> in Xero — nothing is emailed to the client until you approve it there.
          </p>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose}
              className="font-bebas tracking-widest text-xs px-4 py-2 border border-gold/30 text-ink/70 hover:bg-gold/10">
              CANCEL
            </button>
            <button onClick={send} disabled={push.isPending || !xeroStatus?.connected}
              className="font-bebas tracking-widest text-xs px-5 py-2 bg-forest text-cream hover:opacity-90 disabled:opacity-50">
              {push.isPending ? "SENDING…" : "SEND DRAFT TO XERO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
