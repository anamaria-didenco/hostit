import React from "react";
import { createPortal } from "react-dom";
import { DollarSign, X, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { currency } from "@/lib/money";
import { noonInTzMs, ymdInTz } from "@shared/automatedTasks";

/**
 * "Record payment" without leaving where you are: a small dialog for the
 * booked-event drawer and the Event page. Opens on the payment you most likely
 * mean (the deposit while it is unpaid, otherwise the balance as the final
 * payment), and afterwards shows what is paid and what is still owing.
 * Sits above the event drawer (z 9999) and its popovers.
 */

const TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "partial", label: "Partial payment" },
  { value: "final", label: "Final payment" },
  { value: "refund", label: "Refund" },
] as const;
const METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "eftpos", label: "EFTPOS" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit card" },
  { value: "other", label: "Other" },
] as const;

const FIELD = "w-full border border-stone-300 bg-white px-3 min-h-[44px] font-dm text-sm text-ink focus:outline-none focus:border-forest";
const LABEL = "font-bebas text-xs tracking-widest text-stone-600 block mb-1";

type Result = { fullyPaid: boolean; totalPaid: number; outstanding: number; hasTotal: boolean };

export function RecordPaymentDialog({ bookingId, onClose, onRecorded }: {
  bookingId: number;
  onClose: () => void;
  onRecorded?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: booking } = trpc.bookings.getById.useQuery({ id: bookingId });
  const { data: summary } = trpc.payments.summary.useQuery({ bookingId });
  const [amount, setAmount] = React.useState("");
  const [type, setType] = React.useState<string>("deposit");
  const [method, setMethod] = React.useState<string>("bank_transfer");
  // Today in the venue's (NZ) time, not the browser's or the server's.
  const [paidOn, setPaidOn] = React.useState(() => ymdInTz(Date.now()));
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const prefilled = React.useRef(false);
  const amountRef = React.useRef<HTMLInputElement>(null);

  // Deposit while it is due; otherwise the outstanding balance as the final payment.
  React.useEffect(() => {
    if (prefilled.current || !booking || !summary) return;
    prefilled.current = true;
    const b: any = booking;
    const dep = Number(b.depositNzd ?? 0);
    const depositDue = b.depositRequired !== false && !b.depositPaid;
    const outstanding = Number(summary.outstanding ?? 0);
    const hasTotal = Number((summary as any).total ?? 0) > 0;
    if (depositDue) {
      setType("deposit");
      setAmount(dep > 0 ? String(dep) : "");
    } else {
      setType("final");
      setAmount(hasTotal && outstanding > 0 ? String(outstanding) : "");
    }
  }, [booking, summary]);

  React.useEffect(() => { amountRef.current?.focus(); }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); }
    };
    // Capture phase, so the drawer underneath doesn't also close on Escape.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const add = trpc.payments.add.useMutation({
    onSuccess: async (r: any) => {
      // Fresh figures for the result card (and for everything else on screen).
      const fresh = await utils.payments.summary.fetch({ bookingId });
      utils.payments.invalidate();
      utils.bookings.invalidate();
      utils.dashboard.invalidate();
      toast.success(r?.fullyPaid ? "Payment recorded. This event is now paid in full." : "Payment recorded");
      setResult({
        fullyPaid: !!r?.fullyPaid,
        totalPaid: Number(fresh.totalPaid ?? 0),
        outstanding: Number(fresh.outstanding ?? 0),
        hasTotal: Number((fresh as any).total ?? 0) > 0,
      });
      onRecorded?.();
    },
    onError: (e) => toast.error(e.message || "Couldn't record the payment. Please try again."),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amount || !Number.isFinite(amt) || amt <= 0) {
      setError("Enter the amount, e.g. 575");
      amountRef.current?.focus();
      return;
    }
    if (Math.round(amt * 100) / 100 !== amt) { setError("Use dollars and cents, e.g. 575.50"); amountRef.current?.focus(); return; }
    if (!paidOn) { setError("Pick the date the money came in"); return; }
    setError(null);
    add.mutate({
      bookingId,
      amount: amt,
      type: type as any,
      method: method as any,
      // Noon on the chosen NZ day, so no timezone can nudge it onto the next date.
      paidAt: new Date(noonInTzMs(paidOn)).toISOString(),
      notes: notes.trim() || undefined,
    });
  };

  const name = booking ? `${(booking as any).firstName ?? ""} ${(booking as any).lastName ?? ""}`.trim() : "";

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="record-payment-title"
        className="bg-cream border-2 border-forest w-full sm:max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="bg-forest-dark px-5 py-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bebas tracking-widest text-xs text-cream opacity-80">PAYMENTS</div>
            <h2 id="record-payment-title" className="font-cormorant text-cream font-semibold text-lg leading-tight">Record payment</h2>
            {name && <p className="font-dm text-xs text-cream opacity-85 mt-0.5 truncate">{name}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="text-cream opacity-85 hover:opacity-100 p-1 -mr-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <X className="w-5 h-5" />
          </button>
        </div>
        {result ? (
          <div className="p-5 space-y-4" role="status">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-700 flex-shrink-0 mt-0.5" />
              <p className="font-dm text-sm text-ink">
                {result.fullyPaid ? "Recorded. This event is paid in full." : "Payment recorded."}
              </p>
            </div>
            <div className="grid grid-cols-2 border border-gold/30 divide-x divide-gold/20 text-center">
              <div className="p-3 bg-green-50/60">
                <div className="font-bebas tracking-widest text-[11px] text-green-700">PAID SO FAR</div>
                <div className="font-cormorant text-xl font-semibold text-green-700 [font-variant-numeric:tabular-nums_lining-nums]">{currency(result.totalPaid)}</div>
              </div>
              <div className={`p-3 ${result.hasTotal && result.outstanding > 0 ? "bg-red-50/60" : "bg-green-50/60"}`}>
                <div className={`font-bebas tracking-widest text-[11px] ${result.hasTotal && result.outstanding > 0 ? "text-red-600" : "text-green-700"}`}>OUTSTANDING</div>
                {result.hasTotal
                  ? <div className={`font-cormorant text-xl font-semibold [font-variant-numeric:tabular-nums_lining-nums] ${result.outstanding > 0 ? "text-red-600" : "text-green-700"}`}>{currency(result.outstanding)}</div>
                  : <div className="font-dm text-xs italic text-ink/65 py-1.5">No total set yet</div>}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose}
                className="min-h-[44px] px-5 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">DONE</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-3" noValidate>
            {summary && Number((summary as any).total ?? 0) > 0 && (
              <p className="font-dm text-xs text-ink/70">
                Paid so far {currency(Number(summary.totalPaid))} · Outstanding {currency(Number(summary.outstanding))}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rp-amount" className={LABEL}>AMOUNT (NZD)</label>
                <input id="rp-amount" ref={amountRef} type="number" inputMode="decimal" step="0.01" min="0" value={amount}
                  onChange={e => { setAmount(e.target.value); setError(null); }}
                  aria-invalid={!!error && /amount|dollars/i.test(error)} aria-describedby={error ? "rp-error" : undefined}
                  className={FIELD} />
              </div>
              <div>
                <label htmlFor="rp-date" className={LABEL}>DATE RECEIVED</label>
                <input id="rp-date" type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className={FIELD} />
              </div>
              <div>
                <label htmlFor="rp-type" className={LABEL}>TYPE</label>
                <select id="rp-type" value={type} onChange={e => setType(e.target.value)} className={FIELD}>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="rp-method" className={LABEL}>METHOD</label>
                <select id="rp-method" value={method} onChange={e => setMethod(e.target.value)} className={FIELD}>
                  {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="rp-note" className={LABEL}>NOTE (OPTIONAL)</label>
              <input id="rp-note" value={notes} maxLength={300} onChange={e => setNotes(e.target.value)} className={FIELD} placeholder="e.g. Ref: Smith wedding" />
            </div>
            {error && <p id="rp-error" role="alert" className="font-dm text-xs text-red-700">{error}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={onClose}
                className="min-h-[44px] px-5 border border-stone-300 text-ink/70 hover:text-ink font-bebas tracking-widest text-xs">CANCEL</button>
              <button type="submit" disabled={add.isPending}
                className="min-h-[44px] px-5 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs disabled:opacity-50">
                {add.isPending ? "SAVING…" : "RECORD PAYMENT"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

/** The button that opens the dialog; drop it into any header. */
export default function RecordPaymentButton({ bookingId, className, onRecorded }: {
  bookingId: number;
  className?: string;
  onRecorded?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Record a deposit or payment that has come in"
        className={className ?? "flex items-center justify-center gap-1.5 px-3 py-2 rounded-sm border border-forest text-forest hover:bg-blue-50 transition-colors font-bebas tracking-widest text-xs"}>
        <DollarSign className="w-3.5 h-3.5" /> RECORD PAYMENT
      </button>
      {open && <RecordPaymentDialog bookingId={bookingId} onClose={() => setOpen(false)} onRecorded={onRecorded} />}
    </>
  );
}
