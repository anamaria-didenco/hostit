import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { RefreshCw, AlertCircle, Check, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toLocalDateInput } from "@/lib/dateTime";

/**
 * Payments → Received: money received for events, laid out the way Xero lists
 * payments and read live from Xero — only payments against EVENT invoices (the
 * same filter as Payments → Invoices). Money taken on the night that was only
 * recorded in VenueFlow (cash, EFTPOS) is listed underneath, so the period's
 * total is complete and it's obvious what still needs to go into Xero.
 */

type Pay = {
  paymentId: string;
  date: string | null;
  amount: number;
  reference: string | null;
  status: string;
  reconciled: boolean;
  invoiceId: string;
  invoiceNumber: string | null;
  contactName: string;
  accountName: string | null;
  accountCode: string | null;
  bookingId: number | null;
  currency: string;
};

const XERO_BLUE = "#0078c8";
const XERO_GREEN = "#14783a";

const money = (n: number) => n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (v: string | Date | null) => {
  if (!v) return "";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? (() => { const [y, m, dd] = v.split("-").map(Number); return new Date(y, m - 1, dd); })()
    : new Date(v);
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }).replace("Sept", "Sep");
};
const xeroInvoiceUrl = (invoiceId: string) => `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}`;

const PRESETS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_90", label: "Last 90 days" },
  { key: "this_year", label: "Last 12 months" },
  { key: "custom", label: "Custom" },
] as const;
type PresetKey = typeof PRESETS[number]["key"];

function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => toLocalDateInput(d);
  if (key === "last_month") return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (key === "last_90") { const d = new Date(now); d.setDate(d.getDate() - 90); return { from: iso(d), to: iso(now) }; }
  if (key === "this_year") { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: iso(d), to: iso(now) }; }
  return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
}

const METHOD_LABEL: Record<string, string> = {
  bank_transfer: "Bank transfer", cash: "Cash", eftpos: "EFTPOS", credit_card: "Credit card", other: "Other",
};

export default function XeroEventPayments({ q }: { q: string }) {
  const [, navigate] = useLocation();
  const [preset, setPreset] = useState<PresetKey>("this_month");
  const [range, setRange] = useState(() => presetRange("this_month"));
  const [fresh, setFresh] = useState(false);

  const { data, isLoading, isFetching, refetch } = trpc.xero.eventPayments.useQuery(
    { from: range.from || undefined, to: range.to || undefined, ...(fresh ? { fresh: true } : {}) },
    { refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  // Money recorded only in VenueFlow (not imported from Xero) — e.g. cash on the night.
  const { data: ledger } = trpc.payments.received.useQuery({ from: range.from || undefined, to: range.to || undefined });

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => ((data?.rows ?? []) as Pay[]).filter(p =>
    !needle || [p.contactName, p.invoiceNumber, p.reference, p.accountName].some(v => (v ?? "").toLowerCase().includes(needle))), [data, needle]);
  const vfOnly = useMemo(() => (ledger ?? []).filter(r => r.source !== "xero").filter(r =>
    !needle || [r.client, r.eventType, r.notes].some(v => (v ?? "").toLowerCase().includes(needle))), [ledger, needle]);

  const xeroTotal = rows.reduce((s, p) => s + p.amount, 0);
  const vfTotal = vfOnly.reduce((s, r) => s + r.amount, 0);
  const currency = rows[0]?.currency ?? "NZD";

  const choose = (key: PresetKey) => { setPreset(key); if (key !== "custom") setRange(presetRange(key)); };

  function exportCsv() {
    if (rows.length === 0 && vfOnly.length === 0) { toast.error("Nothing to export for this period"); return; }
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Date", "Invoice", "To", "Reference", "Bank account", "Reconciled", "Amount NZD", "Source"];
    const body = [
      ...rows.map(p => [fmtDay(p.date), p.invoiceNumber ?? "", p.contactName, p.reference ?? "", p.accountName ?? "", p.reconciled ? "Yes" : "No", p.amount.toFixed(2), "Xero"]),
      ...vfOnly.map(r => [fmtDay(r.paidAt as any), "", r.client, r.notes ?? "", METHOD_LABEL[r.method] ?? r.method, "", r.amount.toFixed(2), "VenueFlow only"]),
    ];
    const csv = [header, ...body].map(r => r.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `event-payments-${range.from || "all"}-to-${range.to || "today"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const dateInput = "h-8 px-2 rounded border border-stone-300 bg-white text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0078c8]";

  return (
    <div className="font-[system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif] text-[#000a1e]">
      {/* Period — Xero-style tabs, plus a custom range. */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div role="tablist" aria-label="Period" className="flex overflow-x-auto -mb-px">
          {PRESETS.map(p => {
            const on = preset === p.key;
            return (
              <button key={p.key} role="tab" aria-selected={on} onClick={() => choose(p.key)}
                className={`px-4 py-2.5 text-[14px] whitespace-nowrap border border-b-0 rounded-t-sm transition-colors ${
                  on ? "bg-white border-stone-300 text-[#000a1e]" : "bg-transparent border-transparent hover:underline"}`}
                style={on ? undefined : { color: XERO_BLUE }}>
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mb-1.5 flex items-center gap-2">
          <button type="button" onClick={exportCsv}
            className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50" style={{ color: XERO_BLUE }}>
            <Download className="w-3.5 h-3.5" aria-hidden /> Export
          </button>
          <button type="button" onClick={() => { setFresh(true); refetch(); }} disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-60" style={{ color: XERO_BLUE }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden /> {isFetching ? "Refreshing…" : "Refresh from Xero"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-stone-300 rounded-b-sm rounded-tr-sm">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-stone-200 text-[12px] text-stone-600 flex-wrap">
          {preset === "custom" ? (
            <span className="flex items-center gap-2 flex-wrap">
              <label htmlFor="xp-from">From</label>
              <input id="xp-from" type="date" value={range.from} max={range.to || undefined} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className={dateInput} />
              <label htmlFor="xp-to">to</label>
              <input id="xp-to" type="date" value={range.to} min={range.from || undefined} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className={dateInput} />
            </span>
          ) : (
            <span>Payments on event invoices, {fmtDay(range.from)} – {fmtDay(range.to)}. Click one to open its invoice in Xero.</span>
          )}
          <span aria-live="polite">{rows.length} item{rows.length === 1 ? "" : "s"} | {money(xeroTotal)} {currency}</span>
        </div>

        {data?.error && (
          <div role="alert" className="m-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
            <span>Couldn't read payments from Xero just now ({data.error}). Try "Refresh from Xero" in a minute.</span>
          </div>
        )}

        {isLoading ? (
          <p className="text-center py-12 text-[13px] text-stone-600">Loading payments from Xero…</p>
        ) : data && !data.connected ? (
          <p className="text-center py-12 text-[13px] text-stone-600">Xero isn't connected — connect it in Settings → Integrations.</p>
        ) : rows.length === 0 && !data?.error ? (
          <p className="text-center py-12 text-[13px] text-stone-600">{needle ? "No payments match your search." : "There are no items to display."}</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-stone-200">
                  <tr>
                    {["Date", "Invoice", "To", "Reference", "Bank account", "Reconciled"].map(h => (
                      <th key={h} scope="col" className="px-3 py-2.5 text-left font-semibold whitespace-nowrap" style={{ color: XERO_BLUE }}>{h}</th>
                    ))}
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: XERO_BLUE }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(p => (
                    <tr key={p.paymentId} className="border-b border-stone-200 last:border-b-0 hover:bg-[#f5f8fa] align-top">
                      <td className="px-3 py-3 whitespace-nowrap">{fmtDay(p.date)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <a href={xeroInvoiceUrl(p.invoiceId)} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: XERO_BLUE }}
                          aria-label={`Open ${p.invoiceNumber ?? "invoice"} in Xero`}>{p.invoiceNumber ?? "Invoice"}</a>
                      </td>
                      <td className="px-3 py-3 max-w-[260px]">
                        <div className="leading-snug">{p.contactName}</div>
                        {p.bookingId != null && (
                          <button type="button" onClick={() => navigate(`/event/${p.bookingId}`)} className="mt-0.5 text-[12px] hover:underline" style={{ color: XERO_BLUE }}>View event</button>
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-[220px] leading-snug">{p.reference}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{p.accountName ?? p.accountCode ?? ""}</td>
                      <td className="px-3 py-3">
                        {p.reconciled
                          ? <span className="inline-flex items-center gap-1" style={{ color: XERO_GREEN }}><Check className="w-3.5 h-3.5" aria-hidden /> Yes</span>
                          : <span className="text-stone-500">No</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-stone-200" aria-label="Event payments">
              {rows.map(p => (
                <li key={p.paymentId} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium truncate">{p.contactName}</div>
                      <div className="text-[12px] text-stone-600">{fmtDay(p.date)} · {p.accountName ?? "Bank"}</div>
                    </div>
                    <div className="text-[14px] tabular-nums">{money(p.amount)}</div>
                  </div>
                  {p.reference && <div className="text-[12px] text-stone-600 mt-1">{p.reference}</div>}
                  <div className="mt-1.5 flex items-center gap-4 text-[12px]">
                    <a href={xeroInvoiceUrl(p.invoiceId)} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: XERO_BLUE }}>{p.invoiceNumber ?? "Invoice"} in Xero</a>
                    {p.bookingId != null && <button type="button" onClick={() => navigate(`/event/${p.bookingId}`)} className="hover:underline" style={{ color: XERO_BLUE }}>View event</button>}
                    <span className="ml-auto" style={p.reconciled ? { color: XERO_GREEN } : undefined}>{p.reconciled ? "Reconciled" : "Not reconciled"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Recorded only in VenueFlow — e.g. cash or EFTPOS taken on the night. */}
      {vfOnly.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
            <h3 className="text-[14px] font-semibold">Recorded in VenueFlow only</h3>
            <span className="text-[12px] text-stone-600">{vfOnly.length} item{vfOnly.length === 1 ? "" : "s"} | {money(vfTotal)} NZD</span>
          </div>
          <p className="text-[12px] text-stone-600 mb-2">Recorded in VenueFlow but not matched to a payment in Xero — usually cash or EFTPOS taken on the night. Check each one is in Xero so the books match.</p>
          <ul className="bg-white border border-stone-300 rounded-sm divide-y divide-stone-200 text-[13px]">
            {vfOnly.map(r => (
              <li key={r.id} className="px-3 py-2.5 flex items-center gap-3 flex-wrap">
                <span className="w-28 whitespace-nowrap">{fmtDay(r.paidAt as any)}</span>
                <button type="button" onClick={() => navigate(`/event/${r.bookingId}`)} className="min-w-0 flex-1 text-left hover:underline truncate" style={{ color: XERO_BLUE }}>{r.client}</button>
                <span className="text-stone-600">{METHOD_LABEL[r.method] ?? r.method}</span>
                <span className="w-24 text-right tabular-nums">{money(r.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
