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
  // GST treatment for THIS invoice. Real-world practice is mixed (per-head
  // menus quoted excl., grazing tables and bar tabs quoted gross), and Xero
  // applies LineAmountTypes per invoice, so this is the finest granularity
  // Xero can express. Defaults to the venue setting.
  const [inclusive, setInclusive] = useState(false);
  // When set, the modal is EDITING that already-sent draft rather than creating
  // a new one (Xero upserts by InvoiceID, so it's the same send path).
  const [editingId, setEditingId] = useState<number | null>(null);

  useEscapeKey(open, onClose);

  const { data: existing } = trpc.xero.invoicesForBooking.useQuery(
    { bookingId: booking?.bookingId ?? 0 },
    { enabled: open && !!booking }
  );
  const { data: xeroStatus } = trpc.xero.status.useQuery(undefined, { enabled: open });
  useEffect(() => {
    if (open && xeroStatus?.connected) setInclusive(Boolean(xeroStatus.lineAmountsInclusive));
  }, [open, xeroStatus?.connected, xeroStatus?.lineAmountsInclusive]);

  // Seed the editable lines whenever the modal opens or the stream flips.
  useEffect(() => {
    if (!open || !booking) return;
    const ev = booking.eventDate
      ? new Date(booking.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })
      : "";
    const label = `${stream === "food" ? "Food" : "Drinks"} — ${booking.name}${ev ? ` · ${ev}` : ""}`;
    const seeded: Line[] = [{ description: label, quantity: "1", unitAmount: "" }];
    if (stream === "drinks" && booking.depositPaid) {
      // The deposit shown everywhere in the app ($575) is a GROSS figure. On an
      // exclusive invoice it must be entered net ($500) or Xero adds 15% on top
      // and the client is over-credited/charged. Convert, don't hand over a raw
      // number and hope the treatment matches.
      const grossDeposit = booking.depositNzd > 0 ? booking.depositNzd : 575;
      const amt = inclusive ? grossDeposit : Math.round((grossDeposit / 1.15) * 100) / 100;
      seeded.push({
        description: `Less deposit received (${fmtNZD(grossDeposit)} incl. GST)`,
        quantity: "1",
        unitAmount: String(-amt),
      });
    }
    setLines(seeded);
  }, [open, stream, booking?.bookingId, inclusive]);

  useEffect(() => { if (!open) setEditingId(null); }, [open]);

  const push = trpc.xero.pushInvoice.useMutation({
    onSuccess: (r) => {
      toast.success(
        `Draft ${r.invoiceNumber ?? ""} for ${fmtNZD(r.total)} ${r.updated ? "updated" : "created"} in ${r.tenantName} — approve it in Xero.`.replace("  ", " "),
        { duration: 8000 }
      );
      utils.xero.invoicesForBooking.invalidate({ bookingId: booking!.bookingId });
      onClose();
    },
    onError: (e) => toast.error(e.message || "Failed to send to Xero"),
  });
  const del = trpc.xero.deleteInvoice.useMutation({
    onSuccess: () => {
      toast.success("Draft deleted in Xero");
      setEditingId(null);
      utils.xero.invoicesForBooking.invalidate({ bookingId: booking!.bookingId });
    },
    onError: (e) => toast.error(e.message || "Could not delete that invoice"),
  });
  const sync = trpc.xero.syncStatuses.useMutation({
    onSuccess: (r) => {
      toast.success(r.updated > 0 ? `Updated ${r.updated} invoice status${r.updated === 1 ? "" : "es"} from Xero` : "Statuses already up to date");
      utils.xero.invoicesForBooking.invalidate({ bookingId: booking!.bookingId });
      utils.payments.overview.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to check Xero"),
  });

  // Show BOTH figures so a wrong GST treatment is visible before sending
  // rather than discovered on the client's invoice.
  const { subtotal, gst, total } = useMemo(() => {
    const sum = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitAmount) || 0), 0);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    if (inclusive) {
      const sub = r2(sum / 1.15);
      return { subtotal: sub, gst: r2(sum - sub), total: r2(sum) };
    }
    const g = r2(sum * 0.15);
    return { subtotal: r2(sum), gst: g, total: r2(sum + g) };
  }, [lines, inclusive]);

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
      inclusive,
      updateInvoiceId: editingId ?? undefined,
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
              {xeroStatus?.needsOrgChoice
                ? "More than one Xero organisation is authorised — pick which one to invoice in Settings → Integrations."
                : "Xero isn't connected yet — connect it in Settings → Integrations first."}
            </div>
          )}
          {xeroStatus?.connected && (
            <div className="border border-gold/30 bg-linen/50 font-dm text-xs p-2.5 flex items-center gap-2">
              <span className="text-ink/70">Invoicing into</span>
              <b className="text-ink">{xeroStatus.tenantName}</b>
              {xeroStatus.tenantMissing && (
                <span className="text-red-700 font-semibold">· no longer authorised — reconnect</span>
              )}
            </div>
          )}

          {editingId !== null && (
            <div className="border border-blue-300 bg-blue-50 text-blue-900 font-dm text-xs p-2.5 flex items-center justify-between gap-2">
              <span>Editing an existing draft — sending will <b>replace</b> its contents in Xero.</span>
              <button onClick={() => setEditingId(null)}
                className="font-bebas tracking-widest text-[10px] text-blue-900 hover:underline flex-shrink-0">
                CREATE NEW INSTEAD
              </button>
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
                  {/* Only drafts can be changed from here — an approved or paid
                      invoice affects the GST return and must be handled in Xero. */}
                  {(!inv.status || inv.status === "DRAFT" || inv.status === "SUBMITTED") ? (
                    <>
                      <button onClick={() => { setStream(inv.stream); setEditingId(inv.id); }}
                        className="font-bebas tracking-widest text-[10px] text-forest hover:underline"
                        title="Load this draft's details below and update it in Xero">EDIT</button>
                      <button
                        onClick={() => { if (confirm(`Delete draft ${inv.invoiceNumber ?? ""} in Xero? This cannot be undone.`)) del.mutate({ id: inv.id }); }}
                        disabled={del.isPending}
                        className="font-bebas tracking-widest text-[10px] text-red-700 hover:underline disabled:opacity-50"
                        title="Delete this draft in Xero">DELETE</button>
                    </>
                  ) : (
                    <span className="font-dm text-[10px] text-ink/50" title="Approved in Xero — void or credit it there">locked</span>
                  )}
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

          {/* Due date + GST treatment */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <label htmlFor="xero-due" className="font-bebas tracking-widest text-[10px] text-ink/70 block mb-1">DUE DATE (OPTIONAL)</label>
              <input id="xero-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="border border-gold/30 px-3 py-2 font-dm text-sm bg-white focus:outline-none focus:border-forest" />
            </div>
            <div>
              <span className="font-bebas tracking-widest text-[10px] text-ink/70 block mb-1">AMOUNTS ENTERED ABOVE ARE</span>
              <div className="flex gap-1.5" role="radiogroup" aria-label="GST treatment">
                {([[false, "EXCL. GST"], [true, "INCL. GST"]] as const).map(([v, lbl]) => (
                  <button key={lbl} role="radio" aria-checked={inclusive === v} onClick={() => setInclusive(v)}
                    className={`font-bebas tracking-widest text-[11px] px-3 py-2 border transition-colors ${
                      inclusive === v ? "bg-forest text-cream border-forest" : "border-gold/30 text-ink/70 hover:bg-gold/10"}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Breakdown — both figures, so a wrong treatment is caught here */}
          <div className="border border-gold/25 bg-linen/40 px-3 py-2.5 font-dm text-sm">
            <div className="flex justify-between text-ink/70"><span>Subtotal (excl. GST)</span><span>{fmtNZD(subtotal)}</span></div>
            <div className="flex justify-between text-ink/70 mt-0.5"><span>GST (15%)</span><span>{fmtNZD(gst)}</span></div>
            <div className="flex justify-between items-baseline mt-1.5 pt-1.5 border-t border-gold/25">
              <span className="font-bebas tracking-widest text-xs text-ink">TOTAL THE CLIENT PAYS</span>
              <span className="font-cormorant text-2xl font-semibold text-ink">{fmtNZD(total)}</span>
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
            <button onClick={send} disabled={push.isPending || !xeroStatus?.connected || xeroStatus?.tenantMissing}
              className="font-bebas tracking-widest text-xs px-5 py-2 bg-forest text-cream hover:opacity-90 disabled:opacity-50">
              {push.isPending ? "SENDING…" : editingId !== null ? "UPDATE DRAFT IN XERO" : "SEND DRAFT TO XERO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
