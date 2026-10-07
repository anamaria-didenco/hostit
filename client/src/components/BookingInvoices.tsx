import { FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { currency } from "@/lib/money";
import { invoiceState, STREAM_LABEL } from "@/lib/xeroInvoice";

/** The invoices already sent through to Xero for one booking, with their state. */
export default function BookingInvoices({ bookingId }: { bookingId: number }) {
  const { data } = trpc.xero.invoicesForBooking.useQuery({ bookingId });
  const list = (data ?? []).filter((i: any) => i.status !== "DELETED");
  if (list.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="font-bebas tracking-widest text-xs text-ink/65 mb-2">INVOICES SENT TO XERO</div>
      <div className="space-y-1.5">
        {list.map((inv: any) => {
          const st = invoiceState(inv.status);
          return (
            <div key={inv.id} className="flex items-center gap-3 border border-gold/20 bg-white px-3 py-2" title={st.hint}>
              <FileText className="w-4 h-4 text-ink/50 flex-shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 font-dm text-sm text-ink truncate" style={{ textDecoration: st.strike ? "line-through" : undefined }}>
                <span className="font-semibold">{inv.invoiceNumber ?? "Invoice"}</span>
                <span className="text-ink/60"> · {STREAM_LABEL[inv.stream] ?? inv.stream}</span>
              </div>
              <span className="font-bebas tracking-widest text-[11px] px-2 py-0.5 rounded whitespace-nowrap" style={{ background: st.bg, color: st.text }}>{st.label.toUpperCase()}</span>
              <span className="font-cormorant text-base font-semibold text-ink tabular-nums w-20 text-right">{currency(Number(inv.total ?? 0))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
