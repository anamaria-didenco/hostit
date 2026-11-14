import React from "react";
import { createPortal } from "react-dom";
import { Link2, X, Search, Unlink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { invalidateMoney } from "@/lib/invalidateMoney";
import { currency } from "@/lib/money";

/**
 * Link an invoice that was raised straight in Xero to an event.
 *
 * VenueFlow only follows invoices it pushed itself (or whose Xero reference says
 * "(VenueFlow #…)"). Anything else in Xero never showed in Payments, never had
 * its payments imported, and could not be linked — so an event could be paid in
 * Xero and still read "deposit due" here. Linking records the invoice against an
 * event and a bill (deposit / food / drinks) and brings its payments in.
 */

const FIELD = "border border-stone-300 bg-white px-2 min-h-[40px] font-dm text-sm text-ink focus:outline-none focus:border-forest rounded-md";
const LABEL = "font-bebas text-[11px] tracking-widest text-stone-600 block mb-1";

type Stream = "food" | "drinks" | "deposit";
const STREAMS: Array<{ key: Stream; label: string }> = [
  { key: "deposit", label: "Deposit" },
  { key: "food", label: "Food / event" },
  { key: "drinks", label: "Drinks / tab" },
];

type Unlinked = {
  invoiceId: string; number: string | null; reference: string | null; contactName: string; date: string | null;
  status: string; total: number; amountPaid: number; amountDue: number;
  suggestedBookingIds: number[]; suggestedStream: Stream;
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "Awaiting approval", AUTHORISED: "Awaiting payment", PAID: "Paid" };

const fmtDay = (ymd: string | null) => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }).replace("Sept", "Sep");
};

/** How many Xero invoices aren't linked to an event — for the "N to link" prompts. */
export function useUnlinkedXeroCount(enabled: boolean): number {
  const q = trpc.xero.unlinkedInvoices.useQuery(undefined, { enabled, staleTime: 60_000 });
  return (q.data?.rows?.length ?? 0) as number;
}

export function LinkXeroInvoiceDialog({ onClose, lockedBookingId }: { onClose: () => void; lockedBookingId?: number }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = React.useState<"link" | "linked">("link");
  const [search, setSearch] = React.useState("");
  // Per-invoice choices the user has made; anything untouched uses the suggestion.
  const [picks, setPicks] = React.useState<Record<string, { bookingId?: number; stream?: Stream }>>({});

  const unlinked = trpc.xero.unlinkedInvoices.useQuery(undefined, { staleTime: 0, refetchOnWindowFocus: false });
  const linked = trpc.xero.linkedInvoices.useQuery(undefined, { enabled: tab === "linked", staleTime: 0 });
  const bookingsQ = trpc.bookings.list.useQuery(undefined, { staleTime: 30_000 });

  const events = React.useMemo(() => {
    const now = Date.now();
    return ((bookingsQ.data ?? []) as any[])
      .filter(b => b.status !== "cancelled")
      .map(b => ({
        id: b.id as number,
        name: [b.firstName, b.lastName].filter(Boolean).join(" ") || b.email || `Event #${b.id}`,
        at: b.eventDate ? new Date(b.eventDate).getTime() : 0,
      }))
      // Upcoming first (soonest), then past (most recent first).
      .sort((a, b) => {
        const af = a.at >= now, bf = b.at >= now;
        if (af !== bf) return af ? -1 : 1;
        return af ? a.at - b.at : b.at - a.at;
      });
  }, [bookingsQ.data]);
  const eventLabel = (e: { name: string; at: number }) =>
    `${e.name}${e.at ? ` — ${new Date(e.at).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }).replace("Sept", "Sep")}` : ""}`;

  const link = trpc.xero.linkInvoice.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.paymentsImported > 0
          ? `Linked ${r.invoiceNumber ?? "invoice"} — brought in ${currency(r.amountImported)} of payments`
          : `Linked ${r.invoiceNumber ?? "invoice"}${r.status === "PAID" ? "" : " — its payments will arrive when Xero reconciles them"}`,
      );
      invalidateMoney(utils);
      utils.xero.unlinkedInvoices.invalidate();
      utils.xero.linkedInvoices.invalidate();
    },
    onError: (e) => toast.error(e.message || "Couldn't link that invoice"),
  });
  const unlink = trpc.xero.unlinkInvoice.useMutation({
    onSuccess: (r) => {
      toast.success(r.removedPayments > 0 ? `Unlinked — took back ${r.removedPayments} payment${r.removedPayments === 1 ? "" : "s"}` : "Unlinked");
      invalidateMoney(utils);
      utils.xero.unlinkedInvoices.invalidate();
      utils.xero.linkedInvoices.invalidate();
    },
    onError: (e) => toast.error(e.message || "Couldn't unlink that invoice"),
  });

  const rows = React.useMemo(() => {
    const all = (unlinked.data?.rows ?? []) as Unlinked[];
    const needle = search.trim().toLowerCase();
    const list = all.filter(r => !needle || [r.number, r.reference, r.contactName].some(v => (v ?? "").toLowerCase().includes(needle)));
    // When opened from one event, invoices that look like theirs come first.
    if (lockedBookingId) list.sort((a, b) => Number(b.suggestedBookingIds.includes(lockedBookingId)) - Number(a.suggestedBookingIds.includes(lockedBookingId)));
    return list;
  }, [unlinked.data, search, lockedBookingId]);

  const chosenBooking = (r: Unlinked) => lockedBookingId ?? picks[r.invoiceId]?.bookingId ?? r.suggestedBookingIds[0];
  const chosenStream = (r: Unlinked) => picks[r.invoiceId]?.stream ?? r.suggestedStream;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8" onClick={onClose}>
      <div className="w-full max-w-3xl bg-cream rounded-lg shadow-xl" onClick={e => e.stopPropagation()} role="dialog" aria-label="Link Xero invoices">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gold/30">
          <h2 className="font-cormorant text-2xl font-semibold text-ink flex items-center gap-2">
            <Link2 className="w-5 h-5 text-forest" aria-hidden /> Link Xero invoices
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-stone-500 hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pt-3 flex gap-1 border-b border-gold/20">
          {([["link", "To link"], ["linked", "Linked by hand"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-2 font-bebas tracking-widest text-xs border-b-2 ${tab === k ? "border-forest text-forest" : "border-transparent text-stone-500 hover:text-ink"}`}>
              {label}{k === "link" && unlinked.data?.rows ? ` (${unlinked.data.rows.length})` : ""}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {tab === "link" && (
            <>
              <p className="font-dm text-sm text-ink/70 mb-3">
                These sales invoices are in Xero but VenueFlow isn't following them, so their payments never came in and no event shows them.
                Pick the event and the bill, then link — the payments are brought in straight away.
              </p>
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                <input className={`${FIELD} w-full pl-9`} placeholder="Search by name, number or reference" aria-label="Search invoices"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>

              {unlinked.isLoading && <div className="py-8 text-center font-dm text-sm text-stone-500 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Asking Xero…</div>}
              {unlinked.data?.error && <div className="py-3 font-dm text-sm text-red-700">Xero didn't answer: {unlinked.data.error}</div>}
              {unlinked.data && !unlinked.data.connected && <div className="py-6 text-center font-dm text-sm text-stone-500">Connect Xero in Settings → Integrations first.</div>}
              {unlinked.data?.connected && !unlinked.data.error && rows.length === 0 && (
                <div className="py-8 text-center font-dm text-sm text-stone-500">{search ? "No invoices match." : "Every sales invoice in Xero is already linked. Nothing to do."}</div>
              )}

              <ul className="space-y-2">
                {rows.map(r => {
                  const bookingId = chosenBooking(r);
                  const suggested = !lockedBookingId && picks[r.invoiceId]?.bookingId == null && r.suggestedBookingIds.length > 0;
                  const busy = link.isPending && link.variables?.xeroInvoiceId === r.invoiceId;
                  return (
                    <li key={r.invoiceId} className="border border-gold/30 bg-white rounded-md p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <span className="font-dm text-sm font-semibold text-ink">{r.contactName || "(no contact)"}</span>
                          <span className="font-dm text-xs text-stone-500 ml-2">{r.number} · {fmtDay(r.date)}</span>
                        </div>
                        <div className="font-dm text-sm text-ink tabular-nums">
                          {currency(r.total)}
                          <span className="text-xs text-stone-500 ml-2">
                            {STATUS_LABEL[r.status] ?? r.status}{r.status !== "PAID" && r.amountPaid > 0 ? ` · ${currency(r.amountPaid)} paid` : ""}
                          </span>
                        </div>
                      </div>
                      {r.reference && <div className="font-dm text-xs text-stone-500 truncate mt-0.5">{r.reference}</div>}
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        {!lockedBookingId && (
                          <div className="flex-1 min-w-[12rem]">
                            <label className={LABEL} htmlFor={`ev-${r.invoiceId}`}>EVENT{suggested ? " (SUGGESTED)" : ""}</label>
                            <select id={`ev-${r.invoiceId}`} className={`${FIELD} w-full`} value={bookingId ?? ""}
                              onChange={e => setPicks(p => ({ ...p, [r.invoiceId]: { ...p[r.invoiceId], bookingId: Number(e.target.value) || undefined } }))}>
                              <option value="">Choose an event…</option>
                              {events.map(e => <option key={e.id} value={e.id}>{eventLabel(e)}</option>)}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className={LABEL} htmlFor={`st-${r.invoiceId}`}>BILL</label>
                          <select id={`st-${r.invoiceId}`} className={FIELD} value={chosenStream(r)}
                            onChange={e => setPicks(p => ({ ...p, [r.invoiceId]: { ...p[r.invoiceId], stream: e.target.value as Stream } }))}>
                            {STREAMS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </div>
                        <button
                          disabled={!bookingId || link.isPending}
                          onClick={() => bookingId && link.mutate({ xeroInvoiceId: r.invoiceId, bookingId, stream: chosenStream(r) })}
                          className="vf-btn vf-btn-primary min-h-[40px] disabled:opacity-50">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Link2 className="w-3.5 h-3.5" aria-hidden />} LINK
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === "linked" && (
            <>
              <p className="font-dm text-sm text-ink/70 mb-3">Invoices someone linked by hand. Unlinking stops VenueFlow following the invoice and takes back the payments it brought in.</p>
              {linked.isLoading && <div className="py-6 text-center font-dm text-sm text-stone-500">Loading…</div>}
              {linked.data && linked.data.length === 0 && <div className="py-6 text-center font-dm text-sm text-stone-500">Nothing has been linked by hand yet.</div>}
              <ul className="space-y-2">
                {(linked.data ?? []).map(l => (
                  <li key={l.id} className="border border-gold/30 bg-white rounded-md p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="font-dm text-sm text-ink">
                      <span className="font-semibold">{l.invoiceNumber ?? "Invoice"}</span> → {l.bookingName || `Event #${l.bookingId}`}
                      <span className="text-xs text-stone-500 ml-2">{l.stream} · {currency(l.total)} · {l.linkedBy}</span>
                    </div>
                    <button
                      disabled={unlink.isPending}
                      onClick={() => { if (window.confirm(`Unlink ${l.invoiceNumber ?? "this invoice"} from ${l.bookingName || "the event"}? Payments it brought in will be taken back.`)) unlink.mutate({ id: l.id }); }}
                      className="vf-btn vf-btn-secondary min-h-[36px]">
                      <Unlink className="w-3.5 h-3.5" aria-hidden /> UNLINK
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
