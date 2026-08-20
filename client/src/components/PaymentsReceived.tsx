import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, AlertCircle, Banknote } from "lucide-react";
import { currency } from "@/lib/money";

/**
 * Cross-event log of money actually received, for month-end reconciliation.
 * Reads the payments ledger (manual entries plus anything imported when an
 * invoice was reconciled in Xero) so this total is what should agree with the
 * bank — as distinct from the Payments board, which tracks workflow state.
 */

const fmtNZD = (n: number) => currency(n);
const fmtDay = (iso: string | Date | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—";
const iso = (d: Date) => d.toISOString().slice(0, 10);

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer", cash: "Cash", eftpos: "EFTPOS",
  credit_card: "Credit card", other: "Other",
};
const TYPE_LABEL: Record<string, string> = {
  deposit: "Deposit", partial: "Partial", final: "Final", refund: "Refund", other: "Other",
};

/** Date-range presets, anchored to local (NZ) dates. */
function presetRange(key: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (key === "this_month") return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (key === "last_month") return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (key === "last_90") { const d = new Date(now); d.setDate(d.getDate() - 90); return { from: iso(d), to: iso(now) }; }
  return { from: "", to: "" }; // all time
}

export default function PaymentsReceived() {
  const [, navigate] = useLocation();
  const [preset, setPreset] = useState("this_month");
  const [range, setRange] = useState(() => presetRange("this_month"));

  const { data, isLoading, isError, refetch } = trpc.payments.received.useQuery({
    from: range.from || undefined,
    to: range.to || undefined,
  });
  const rows = data ?? [];

  const totals = useMemo(() => {
    const net = rows.reduce((s, r) => s + r.amount, 0);
    const refunds = rows.filter(r => r.isRefund).reduce((s, r) => s + Math.abs(r.amount), 0);
    const byMethod = new Map<string, number>();
    for (const r of rows) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amount);
    return { net, refunds, count: rows.length, byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]) };
  }, [rows]);

  const applyPreset = (key: string) => { setPreset(key); setRange(presetRange(key)); };

  function exportCsv() {
    if (rows.length === 0) { toast.error("Nothing to export for this period"); return; }
    // Quote every field and double internal quotes so notes containing commas
    // or quotes can't break the columns in Excel.
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Date received", "Client", "Event date", "Event type", "Amount NZD", "Type", "Method", "Source", "Notes"];
    const body = rows.map(r => [
      fmtDay(r.paidAt), r.client, fmtDay(r.eventDate), r.eventType ?? "",
      r.amount.toFixed(2), TYPE_LABEL[r.type] ?? r.type, METHOD_LABEL[r.method] ?? r.method,
      r.source === "xero" ? "Xero" : "Manual", r.notes ?? "",
    ].map(esc).join(","));
    const csv = [header.map(esc).join(","), ...body].join("\r\n");
    // BOM so Excel opens UTF-8 (macrons in NZ names) correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-received-${range.from || "all"}-to-${range.to || "today"}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} payment${rows.length === 1 ? "" : "s"}`);
  }

  return (
    <div>
      {/* Range controls */}
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Date range preset">
          {[["this_month", "This month"], ["last_month", "Last month"], ["last_90", "Last 90 days"], ["all", "All time"]].map(([k, lbl]) => (
            <button key={k} onClick={() => applyPreset(k)}
              className={`font-bebas tracking-widest text-xs px-3 py-2 rounded-md transition-colors ${
                preset === k ? "bg-forest text-cream" : "bg-cream text-sage hover:text-ink border border-gold/20"}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="pr-from" className="font-bebas tracking-widest text-[10px] text-ink/70 block mb-1">FROM</label>
            <input id="pr-from" type="date" value={range.from}
              onChange={e => { setPreset("custom"); setRange(r => ({ ...r, from: e.target.value })); }}
              className="border border-gold/30 px-2.5 py-2 font-dm text-sm bg-white focus:outline-none focus:border-forest" />
          </div>
          <div>
            <label htmlFor="pr-to" className="font-bebas tracking-widest text-[10px] text-ink/70 block mb-1">TO</label>
            <input id="pr-to" type="date" value={range.to}
              onChange={e => { setPreset("custom"); setRange(r => ({ ...r, to: e.target.value })); }}
              className="border border-gold/30 px-2.5 py-2 font-dm text-sm bg-white focus:outline-none focus:border-forest" />
          </div>
        </div>
        <button onClick={exportCsv} disabled={rows.length === 0}
          className="font-bebas tracking-widest text-xs px-4 py-2 bg-forest text-cream hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 ml-auto">
          <Download className="w-3.5 h-3.5" /> EXPORT CSV
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gold/20 rounded-lg p-3.5">
          <div className="font-bebas tracking-widest text-[11px] text-sage mb-1 flex items-center gap-1.5">
            <Banknote className="w-4 h-4 text-green-700" /> Received (net)
          </div>
          <div className="font-cormorant text-3xl font-semibold text-green-700 leading-none">{fmtNZD(totals.net)}</div>
          <div className="font-dm text-[11px] text-sage mt-1">
            {totals.count} payment{totals.count === 1 ? "" : "s"}
            {totals.refunds > 0 && ` · ${fmtNZD(totals.refunds)} refunded`}
          </div>
        </div>
        {totals.byMethod.slice(0, 3).map(([method, amt]) => (
          <div key={method} className="bg-white border border-gold/20 rounded-lg p-3.5">
            <div className="font-bebas tracking-widest text-[11px] text-sage mb-1">{METHOD_LABEL[method] ?? method}</div>
            <div className="font-cormorant text-2xl font-semibold text-ink leading-none">{fmtNZD(amt)}</div>
          </div>
        ))}
      </div>

      {/* Log */}
      {isError ? (
        <div className="text-center py-14">
          <AlertCircle className="w-8 h-8 text-red-500/70 mx-auto mb-2" />
          <p className="font-dm text-ink text-sm mb-3">Couldn't load payments.</p>
          <button onClick={() => refetch()} className="font-bebas tracking-widest text-xs px-4 py-2 rounded-md bg-forest text-cream">RETRY</button>
        </div>
      ) : isLoading ? (
        <div className="text-center py-14 text-sage font-dm text-sm">Loading payments…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-14">
          <p className="font-dm text-sage text-sm">No payments recorded in this period.</p>
          <p className="font-dm text-xs text-sage/70 mt-1">Record one against an event, or sync from Xero.</p>
        </div>
      ) : (
        <div className="bg-white border border-gold/20 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-gold/20">
                {["Date received", "Client", "Event", "Amount", "Type", "Method", "Source"].map((h, i) => (
                  <th key={h} className={`font-bebas tracking-widest text-[10px] text-ink/70 px-3 py-2.5 ${i === 3 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gold/10 last:border-0 hover:bg-cream/60">
                  <td className="px-3 py-2.5 font-dm text-sm text-ink whitespace-nowrap">{fmtDay(r.paidAt)}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => navigate(`/event/${r.bookingId}`)}
                      className="font-dm text-sm text-ink hover:underline text-left">{r.client}</button>
                    {r.notes && <div className="font-dm text-[11px] text-sage truncate max-w-[240px]" title={r.notes}>{r.notes}</div>}
                  </td>
                  <td className="px-3 py-2.5 font-dm text-[12px] text-sage whitespace-nowrap">
                    {fmtDay(r.eventDate)}{r.eventType ? ` · ${r.eventType}` : ""}
                  </td>
                  <td className={`px-3 py-2.5 font-dm text-sm text-right whitespace-nowrap font-semibold ${r.isRefund ? "text-red-700" : "text-ink"}`}>
                    {fmtNZD(r.amount)}
                  </td>
                  <td className="px-3 py-2.5 font-dm text-[12px] text-sage whitespace-nowrap">{TYPE_LABEL[r.type] ?? r.type}</td>
                  <td className="px-3 py-2.5 font-dm text-[12px] text-sage whitespace-nowrap">{METHOD_LABEL[r.method] ?? r.method}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={`font-bebas tracking-widest text-[10px] px-1.5 py-0.5 rounded ${
                      r.source === "xero" ? "bg-blue-100 text-blue-800" : "bg-stone-100 text-stone-700"}`}>
                      {r.source === "xero" ? "XERO" : "MANUAL"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
