import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toLocalDateInput } from "@/lib/dateTime";

/**
 * Payments → Invoices: the venue's EVENT invoices laid out the way Xero's
 * Sales → Invoices screen shows them (same status tabs, columns and wording),
 * read live from Xero. Only invoices VenueFlow raised, or whose reference says
 * "(VenueFlow #…)", are returned by the server — the rest of the Xero org
 * (supplier rebates, sponsorship…) never reaches this screen.
 */

type Inv = {
  invoiceId: string;
  number: string | null;
  reference: string | null;
  contactName: string;
  date: string | null;
  dueDate: string | null;
  status: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  sentToContact: boolean;
  bookingId: number | null;
  currency: string;
};

type Tab = "all" | "draft" | "approval" | "awaiting" | "paid";
const TABS: Array<{ key: Tab; label: string; count: boolean }> = [
  { key: "all", label: "All", count: false },
  { key: "draft", label: "Draft", count: true },
  { key: "approval", label: "Awaiting Approval", count: true },
  { key: "awaiting", label: "Awaiting Payment", count: true },
  { key: "paid", label: "Paid", count: false },
];
const inTab = (i: Inv, t: Tab) =>
  t === "all" ? true
  : t === "draft" ? i.status === "DRAFT"
  : t === "approval" ? i.status === "SUBMITTED"
  : t === "awaiting" ? i.status === "AUTHORISED"
  : i.status === "PAID";

type SortKey = "number" | "to" | "date" | "due" | "paid" | "amountDue";

// Xero's own palette for this screen.
const XERO_BLUE = "#0078c8";
const XERO_RED = "#d1342f";
const XERO_GREEN = "#14783a";

const money = (n: number) => n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (ymd: string | null) => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }).replace("Sept", "Sep");
};
const daysBetween = (fromYmd: string, toYmd: string) => {
  const [a, b] = [fromYmd, toYmd].map(s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86_400_000);
};
const xeroUrl = (i: Inv) =>
  `https://go.xero.com/AccountsReceivable/${i.status === "DRAFT" || i.status === "SUBMITTED" ? "Edit" : "View"}.aspx?InvoiceID=${encodeURIComponent(i.invoiceId)}`;

export default function XeroEventInvoices({ q }: { q: string }) {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("awaiting");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const [fresh, setFresh] = useState(false);
  const { data, isLoading, isFetching, refetch } = trpc.xero.eventInvoices.useQuery(
    fresh ? { fresh: true } : undefined,
    { refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const today = toLocalDateInput(new Date());
  const rows: Inv[] = (data?.rows ?? []) as Inv[];

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: 0, draft: 0, approval: 0, awaiting: 0, paid: 0 };
    for (const i of rows) for (const t of TABS) if (t.key !== "all" && inTab(i, t.key)) c[t.key]++;
    c.all = rows.filter(i => i.status !== "VOIDED").length;
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter(i => inTab(i, tab) && (tab !== "all" || i.status !== "VOIDED" || !!needle)
      && (!needle || [i.number, i.reference, i.contactName].some(v => (v ?? "").toLowerCase().includes(needle))));
    const val = (i: Inv): string | number => {
      switch (sort.key) {
        case "number": return i.number ?? "";
        case "to": return i.contactName.toLowerCase();
        case "date": return i.date ?? "";
        case "due": return i.dueDate ?? "";
        case "paid": return i.amountPaid;
        case "amountDue": return i.amountDue;
      }
    };
    return filtered.sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -c : c;
    });
  }, [rows, tab, q, sort]);

  const totalDue = list.reduce((s, i) => s + (tab === "paid" ? i.total : i.amountDue), 0);
  const currency = rows[0]?.currency ?? "NZD";

  const sortBy = (key: SortKey) => setSort(s => ({ key, desc: s.key === key ? !s.desc : key === "date" || key === "due" }));
  const Th = ({ k, children, right }: { k?: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th scope="col" aria-sort={k && sort.key === k ? (sort.desc ? "descending" : "ascending") : undefined}
      className={`px-3 py-2.5 font-semibold text-[13px] whitespace-nowrap ${right ? "text-right" : "text-left"}`} style={{ color: XERO_BLUE }}>
      {k ? (
        <button type="button" onClick={() => sortBy(k)} className="hover:underline">
          {children}{sort.key === k ? (sort.desc ? " ▾" : " ▴") : ""}
        </button>
      ) : children}
    </th>
  );

  if (isLoading) return <div className="text-center py-16 text-stone-600 font-dm text-sm">Loading invoices from Xero…</div>;
  if (data && !data.connected) {
    return (
      <div className="text-center py-16">
        <p className="font-dm text-ink text-sm">Xero isn't connected.</p>
        <p className="font-dm text-stone-600 text-xs mt-1">Connect it in Settings → Integrations to see your event invoices here exactly as they are in Xero.</p>
      </div>
    );
  }

  return (
    <div className="font-[system-ui,-apple-system,'Segoe_UI',Roboto,sans-serif] text-[#000a1e]">
      {/* Status tabs — Xero's wording and counts. */}
      <div className="flex items-end justify-between gap-3 flex-wrap mb-0">
        <div role="tablist" aria-label="Invoice status" className="flex overflow-x-auto -mb-px">
          {TABS.map(t => {
            const on = tab === t.key;
            return (
              <button key={t.key} role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-[14px] whitespace-nowrap border border-b-0 rounded-t-sm transition-colors ${
                  on ? "bg-white border-stone-300 text-[#000a1e]" : "bg-transparent border-transparent hover:underline"}`}
                style={on ? undefined : { color: XERO_BLUE }}>
                {t.label}{t.count ? <span className="text-[11px]"> ({counts[t.key]})</span> : null}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => { setFresh(true); refetch(); }} disabled={isFetching}
          className="mb-1.5 inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-60"
          style={{ color: XERO_BLUE }}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden /> {isFetching ? "Refreshing…" : "Refresh from Xero"}
        </button>
      </div>

      <div className="bg-white border border-stone-300 rounded-b-sm rounded-tr-sm">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-stone-200 text-[12px] text-stone-600 flex-wrap">
          <span>Only invoices for events are shown. Click an invoice to open it in Xero.</span>
          <span aria-live="polite">{list.length} item{list.length === 1 ? "" : "s"} | {money(totalDue)} {currency}</span>
        </div>

        {data?.error && (
          <div role="alert" className="m-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
            <span>Couldn't read invoices from Xero just now ({data.error}). Try "Refresh from Xero" in a minute.</span>
          </div>
        )}

        {list.length === 0 && !data?.error ? (
          <p className="text-center py-12 text-[13px] text-stone-600">{q ? "No invoices match your search." : "There are no items to display."}</p>
        ) : (
          <>
            {/* Desktop: Xero's table. */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="border-b border-stone-200">
                  <tr>
                    <Th k="number">Number</Th>
                    <Th>Ref</Th>
                    <Th k="to">To</Th>
                    <Th k="date">Date</Th>
                    <Th k="due">Due Date</Th>
                    <Th>Overdue by</Th>
                    <Th k="paid" right>Paid</Th>
                    <Th k="amountDue" right>Due</Th>
                    <Th>{tab === "paid" ? "Status" : "Sent"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(i => {
                    const overdue = i.status === "AUTHORISED" && i.amountDue > 0 && i.dueDate && i.dueDate < today ? daysBetween(i.dueDate, today) : 0;
                    return (
                      <tr key={i.invoiceId} className="border-b border-stone-200 last:border-b-0 hover:bg-[#f5f8fa] align-top">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <a href={xeroUrl(i)} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: "#000a1e" }}
                            aria-label={`Open ${i.number ?? "draft invoice"} in Xero`}>
                            {i.number ?? <span className="text-stone-500">Draft</span>}
                          </a>
                          {i.status === "VOIDED" && <span className="ml-1 text-[11px] text-stone-500">(voided)</span>}
                        </td>
                        <td className="px-3 py-3 max-w-[260px]">
                          <div className="leading-snug">{i.reference}</div>
                          {i.bookingId != null && (
                            <button type="button" onClick={() => navigate(`/event/${i.bookingId}`)}
                              className="mt-0.5 text-[12px] hover:underline" style={{ color: XERO_BLUE }}>
                              View event
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 max-w-[240px]">
                          <a href={xeroUrl(i)} target="_blank" rel="noreferrer" className="hover:underline leading-snug" style={{ color: XERO_BLUE }}>{i.contactName}</a>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{fmtDay(i.date)}</td>
                        <td className="px-3 py-3 whitespace-nowrap" style={overdue ? { color: XERO_RED } : undefined}>{fmtDay(i.dueDate)}</td>
                        <td className="px-3 py-3 whitespace-nowrap" style={{ color: XERO_RED }}>{overdue ? `${overdue} day${overdue === 1 ? "" : "s"}` : ""}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(i.amountPaid)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(i.amountDue)}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-[12px]">
                          {tab === "paid" || i.status === "PAID"
                            ? <span style={{ color: XERO_GREEN }}>Paid</span>
                            : i.status === "DRAFT" ? <span className="text-stone-500">Draft</span>
                            : i.status === "SUBMITTED" ? <span className="text-stone-500">Awaiting approval</span>
                            : i.sentToContact ? <span style={{ color: XERO_GREEN }}>Sent</span> : <span className="text-stone-500">Not sent</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phone: the same facts as cards. */}
            <ul className="md:hidden divide-y divide-stone-200" aria-label="Event invoices">
              {list.map(i => {
                const overdue = i.status === "AUTHORISED" && i.amountDue > 0 && i.dueDate && i.dueDate < today ? daysBetween(i.dueDate, today) : 0;
                return (
                  <li key={i.invoiceId} className="px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <a href={xeroUrl(i)} target="_blank" rel="noreferrer" className="min-w-0">
                        <div className="text-[14px] font-medium truncate" style={{ color: XERO_BLUE }}>{i.contactName}</div>
                        <div className="text-[12px] text-stone-600">{i.number ?? "Draft"} · {fmtDay(i.date)}</div>
                      </a>
                      <div className="text-right">
                        <div className="text-[14px] tabular-nums">{money(tab === "paid" ? i.total : i.amountDue)}</div>
                        <div className="text-[12px] whitespace-nowrap" style={{ color: overdue ? XERO_RED : i.status === "PAID" ? XERO_GREEN : undefined }}>
                          {i.status === "PAID" ? "Paid" : overdue ? `${overdue} day${overdue === 1 ? "" : "s"} overdue` : i.dueDate ? `Due ${fmtDay(i.dueDate)}` : ""}
                        </div>
                      </div>
                    </div>
                    {i.reference && <div className="text-[12px] text-stone-600 mt-1 leading-snug">{i.reference}</div>}
                    <div className="mt-1.5 flex items-center gap-4 text-[12px]">
                      <span className={i.sentToContact || i.status === "PAID" ? "" : "text-stone-500"} style={i.sentToContact && i.status !== "PAID" ? { color: XERO_GREEN } : undefined}>
                        {i.status === "DRAFT" ? "Draft" : i.status === "SUBMITTED" ? "Awaiting approval" : i.status === "PAID" ? "" : i.sentToContact ? "Sent" : "Not sent"}
                      </span>
                      {i.bookingId != null && (
                        <button type="button" onClick={() => navigate(`/event/${i.bookingId}`)} className="hover:underline" style={{ color: XERO_BLUE }}>View event</button>
                      )}
                      <a href={xeroUrl(i)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 hover:underline" style={{ color: XERO_BLUE }}>
                        Open in Xero <ExternalLink className="w-3 h-3" aria-hidden />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
