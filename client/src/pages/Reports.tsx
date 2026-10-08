import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { TrendingUp, DollarSign, Users, Calendar, ArrowUpRight, Settings, Download, AlertCircle } from "lucide-react";
import { parseCustomStatuses, statusChipClasses, statusSwatch } from "@/components/StatusManager";
import { currencyWhole } from "@/lib/money";
import { isRealEnquiry, isImportedBooking, WON_LEAD_STATUSES } from "@shared/conversion";
import {
  PeriodPicker, ConversionSummaryCard, FunnelCard, TrendCard, SpeedTiles, BySourceCard,
  PipelineCard, LostReasonsCard, fmtSource, type PeriodChoice,
} from "@/components/ConversionReport";

// Soft row/background wash from a status swatch, so a table row's tint matches
// its badge exactly. Low alpha keeps text comfortably above AA on the wash.
const tint = (hex: string, a: number) => {
  const h = (hex || "#9ca3af").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "events", label: "Events" },
  { key: "enquiries", label: "Conversion" },
  { key: "revenue", label: "Revenue" },
  { key: "proposals", label: "Proposals" },
];

// Same restrained source palette as the Analytics page: navy, amber, teal, then
// muted supporting hues, so neighbouring slices stay distinguishable.
const BRAND_COLORS = ["#2f5488", "#d4952b", "#3f8f8f", "#8a94a6", "#b5626a", "#6d5aa0", "#a9b4c8"];

export default function Reports() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  // The venue's own status palette (same source the board and calendar use),
  // so every status reads in one colour language across the whole app.
  const { data: venueSettings } = trpc.venue.get.useQuery(
    { ownerId: user?.id },
    { enabled: !!user?.id }
  );
  const statuses = React.useMemo(() => parseCustomStatuses((venueSettings as any)?.customStatuses), [venueSettings]);
  const [showCustomize, setShowCustomize] = useState(false);
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('vfhq_hidden_report_cards') ?? '[]')); }
    catch { return new Set(); }
  });
  // The period every conversion figure is for: NZ calendar days, resolved on
  // the server so a UTC server and an overseas browser agree on "this month".
  const [period, setPeriod] = useState<PeriodChoice>(() => {
    let preset: PeriodChoice["preset"] = "3m";
    try { const v = localStorage.getItem("vfhq_reports_period"); if (v === "month" || v === "3m" || v === "12m") preset = v; } catch {}
    return { preset, from: "", to: "" };
  });
  const changePeriod = (v: PeriodChoice) => {
    setPeriod(v);
    if (v.preset !== "custom") { try { localStorage.setItem("vfhq_reports_period", v.preset); } catch {} }
  };
  const periodInput = period.preset === "custom"
    ? (period.from && period.to ? { from: period.from, to: period.to } : undefined)
    : { preset: period.preset };
  const { data: conv, isError: convError, refetch: refetchConv } = trpc.reports.conversion.useQuery(periodInput, {
    placeholderData: (prev) => prev,
  });

  const { data: allLeadsRaw, isError: leadsError, refetch: refetchLeads } = trpc.leads.list.useQuery({});
  const { data: allBookingsRaw, isError: bookingsError, refetch: refetchBookings } = trpc.bookings.list.useQuery();
  const primaryError = leadsError || bookingsError || convError;
  // Same rules as every conversion figure: no half-finished form autosaves
  // and no NowBookIt diary imports in these lists either.
  const allLeads = React.useMemo(() => (allLeadsRaw ?? []).filter((l: any) => isRealEnquiry(l)), [allLeadsRaw]);
  const allBookings = React.useMemo(() => (allBookingsRaw ?? []).filter((b: any) => !isImportedBooking(b)), [allBookingsRaw]);

  const currentYear = Number(conv?.period.today.slice(0, 4)) || new Date().getFullYear();
  const { data: revenueData } = trpc.analytics.revenueByMonth.useQuery({ year: currentYear });

  const confirmedBookings = allBookings.filter((b: any) => b.status === "confirmed" || b.status === "tentative" || b.status === "finished");
  // Cancelled bookings carry a total too — they aren't revenue.
  const totalRevenue = confirmedBookings.reduce((sum: number, b: any) => sum + (Number(b.totalNzd) || 0), 0);
  const valuedBookings = confirmedBookings.filter((b: any) => Number(b.totalNzd) > 0).length;
  const avgBookingValue = valuedBookings > 0 ? totalRevenue / valuedBookings : 0;
  const statusLabel = (k: string) => statuses.find(s => s.key === k)?.label ?? fmtSource(k);
  const sourceData = conv?.breakdowns.source ?? [];
  // Seven hues at most; anything past the sixth source folds into "Other".
  const sourcePie = sourceData.length <= 7
    ? sourceData.map(d => ({ name: fmtSource(d.key), value: d.enquiries }))
    : [...sourceData.slice(0, 6).map(d => ({ name: fmtSource(d.key), value: d.enquiries })),
       { name: "Other", value: sourceData.slice(6).reduce((n, d) => n + d.enquiries, 0) }];

  if (primaryError) return (
    <div className="p-6">
      <h1 className="font-cormorant text-3xl font-semibold text-ink">Reports</h1>
      <div className="mt-8 text-center py-16">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="font-dm text-ink text-sm mb-3">Couldn't load reports.</p>
        <button
          onClick={() => { refetchLeads(); refetchBookings(); refetchConv(); }}
          className="font-bebas tracking-widest text-xs px-4 py-2 rounded-md bg-forest text-cream hover:opacity-90"
        >
          RETRY
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-cormorant text-3xl font-semibold text-ink">Reports</h1>
          <p className="font-dm text-sm text-sage mt-0.5">Analytics and performance insights for your venue</p>
          <Link href="/analytics" className="inline-flex items-center gap-1 mt-2 font-bebas tracking-widest text-xs text-primary hover:underline min-h-[24px]">
            REVENUE GOALS &amp; YEARLY FUNNEL <ArrowUpRight className="w-3 h-3" aria-hidden />
          </Link>
        </div>
        {tab === "overview" && (
          <div className="relative">
            <button
              onClick={() => setShowCustomize(v => !v)}
              className="flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-2 border border-border text-sage hover:text-ink hover:border-ink/30 transition-colors"
            >
              <Settings className="w-3 h-3" /> CUSTOMISE
            </button>
            {showCustomize && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border shadow-lg p-3 z-30 w-52">
                <div className="font-bebas text-xs tracking-widest text-sage mb-2">SHOW / HIDE CARDS</div>
                {[
                  { id: "total_enquiries", label: "Enquiries" },
                  { id: "confirmed_bookings", label: "Booked" },
                  { id: "conversion_rate", label: "Conversion" },
                  { id: "total_revenue", label: "Booked value" },
                ].map(c => (
                  <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-linen px-1">
                    <input type="checkbox" checked={!hiddenCards.has(c.id)} onChange={() => {
                      setHiddenCards(prev => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                        localStorage.setItem('vfhq_hidden_report_cards', JSON.stringify([...next]));
                        return next;
                      });
                    }} className="w-3.5 h-3.5 accent-forest" />
                    <span className="font-dm text-xs text-ink">{c.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0 mb-6 border-b border-border overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`font-bebas tracking-widest text-xs px-4 sm:px-5 py-3 transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key
                ? "border-burgundy text-burgundy"
                : "border-transparent text-sage hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "overview" || tab === "enquiries" || tab === "proposals") && (
        <PeriodPicker value={period} onChange={changePeriod} resolved={conv?.period} />
      )}

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* KPI cards */}
          {(() => {
            const sm = conv?.summary;
            const cards = [
              { id: "total_enquiries", label: "Enquiries", value: sm ? sm.enquiries : "…", icon: <Users className="w-5 h-5 text-burgundy" />, sub: "received in this period" },
              { id: "confirmed_bookings", label: "Booked", value: sm ? sm.won : "…", icon: <Calendar className="w-5 h-5 text-forest" />, sub: "of those enquiries" },
              { id: "conversion_rate", label: "Conversion", value: sm ? (sm.rate == null ? "—" : `${sm.rate}%`) : "…", icon: <TrendingUp className="w-5 h-5 text-forest" />, sub: sm ? `${sm.open} still open` : "" },
              { id: "total_revenue", label: "Booked value", value: sm ? currencyWhole(sm.wonValue) : "…", icon: <DollarSign className="w-5 h-5 text-gold-deep" />, sub: "booking totals, NZD" },
            ].filter(c => !hiddenCards.has(c.id));
            if (cards.length === 0) return null;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map(s => (
                  <div key={s.id} className="dante-card p-5">
                    <div className="mb-3">{s.icon}</div>
                    <div className="font-cormorant text-4xl font-semibold text-ink mb-1">{s.value}</div>
                    <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
                    <div className="font-dm text-xs text-sage mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Two charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue by month */}
            <div className="dante-card p-5">
              <h2 className="font-cormorant text-lg font-semibold text-ink">Revenue by Month</h2>
              <p className="font-dm text-xs text-sage mt-0.5 mb-4">{currentYear}, by event date. Cancelled events left out.</p>
              {revenueData && revenueData.some((r: any) => r.revenue > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenueData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd4" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a6256" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6a6256" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="#2f5488" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-sage font-dm text-sm">No booking totals for {currentYear} yet</div>
              )}
            </div>

            {/* Enquiry source */}
            <div className="dante-card p-5">
              <h2 className="font-cormorant text-lg font-semibold text-ink">Enquiry Sources</h2>
              <p className="font-dm text-xs text-sage mt-0.5 mb-4">Where this period's enquiries came from.</p>
              {sourceData.length > 0 ? (
                // Recharts marks every pie slice role="img" with no name of its
                // own. Name the chart once and hide the decorative geometry, so
                // a screen reader gets the figures rather than a run of
                // unlabelled images. The slices are not focusable.
                // role="img" makes the subtree a single leaf node to assistive
                // tech, so the label below is what gets announced rather than a
                // run of unnamed slice paths.
                <div role="img" aria-label={`Enquiry sources: ${sourcePie.map(d => `${d.name}, ${d.value}`).join('; ')}`}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={sourcePie} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={70} stroke="#fffdf9" strokeWidth={2}>
                      {sourcePie.map((_, i) => (
                        <Cell key={i} fill={BRAND_COLORS[i]} role="presentation" aria-hidden="true" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} enquir${Number(v) === 1 ? "y" : "ies"}`, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" formatter={(v: string) => <span style={{ color: "#211d18" }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-sage font-dm text-sm">No enquiries in this period</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── EVENTS ── */}
      {tab === "events" && (
        <div className="space-y-4">
          {/* Legend — driven off the venue's own status palette so it matches
              the board and calendar exactly. */}
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { key: "new", label: "New" },
              { key: "contacted", label: "Contacted" },
              { key: "proposal_sent", label: "Proposal Sent" },
              { key: "negotiating", label: "Negotiating" },
              { key: "booked", label: "Booked" },
              { key: "lost", label: "Lost" },
              { key: "cancelled", label: "Cancelled" },
            ].map(s => (
              <span key={s.key} className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${statusChipClasses(s.key, statuses)}`}>{s.label}</span>
            ))}
            <span className="font-dm text-xs text-sage ml-auto">{(allLeads ?? []).length} enquiries · {(allBookings ?? []).length} bookings</span>
          </div>

          {/* All Leads table */}
          <div className="dante-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-linen flex items-center justify-between">
              <h2 className="font-cormorant text-lg font-semibold text-ink">All Enquiries & Events</h2>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-border bg-linen">
                  {["Name", "Event", "Date", "Type", "Guests", "Budget", "Status", "Source"].map(h => (
                    <th key={h} className="font-bebas text-xs tracking-widest text-sage text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {(allLeads ?? []).length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 font-dm text-sm text-sage">No enquiries yet</td></tr>
                ) : (
                  (allLeads ?? []).slice().sort((a: any, b: any) => {
                    const order: Record<string, number> = { booked: 0, negotiating: 1, proposal_sent: 2, contacted: 3, new: 4, lost: 5, cancelled: 6 };
                    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
                  }).map((l: any) => {
                    const badgeClass = statusChipClasses(l.status, statuses);
                    return (
                      <tr key={l.id} className="transition-colors" style={{ backgroundColor: tint(statusSwatch(l.status, statuses), 0.06) }}>
                        <td className="px-4 py-3 font-dm text-sm text-ink font-medium">{l.firstName} {l.lastName || ""}</td>
                        <td className="px-4 py-3 font-dm text-sm text-ink">{l.eventName || "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage whitespace-nowrap">{l.eventDate ? new Date(l.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage">{l.eventType || "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage">{l.guestCount || "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage">{l.budget ? `$${Number(l.budget).toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${badgeClass}`}>
                            {l.status?.replace("_", " ").toUpperCase() || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-dm text-xs text-sage">{l.source ? fmtSource(l.source) : "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>

          {/* Bookings table */}
          {(allBookings ?? []).length > 0 && (
            <div className="dante-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-linen flex items-center justify-between">
                <h2 className="font-cormorant text-lg font-semibold text-ink">Confirmed Bookings</h2>
                <span className="font-dm text-xs text-sage">{(allBookings ?? []).length} events</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-linen">
                    {["Event Name", "Date", "Type", "Guests", "Space", "Value", "Status"].map(h => (
                      <th key={h} className="font-bebas text-xs tracking-widest text-sage text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(allBookings ?? []).map((b: any) => {
                    const badgeClass = statusChipClasses(b.status, statuses);
                    return (
                      <tr key={b.id} className="transition-colors" style={{ backgroundColor: tint(statusSwatch(b.status, statuses), 0.06) }}>
                        <td className="px-4 py-3 font-dm text-sm text-ink font-medium">{b.eventName || `${b.firstName} ${b.lastName || ""}`.trim() || "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage whitespace-nowrap">{b.eventDate ? new Date(b.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage">{b.eventType || "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage">{b.guestCount || "—"}</td>
                        <td className="px-4 py-3 font-dm text-xs text-sage">{b.spaceName || "—"}</td>
                        <td className="px-4 py-3 font-dm text-sm text-ink">{b.totalNzd ? `$${Number(b.totalNzd).toLocaleString()}` : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${badgeClass}`}>{b.status?.toUpperCase() || "—"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CONVERSION ── */}
      {tab === "enquiries" && (
        !conv ? (
          <div className="dante-card p-8 text-center font-dm text-sm text-sage">Loading…</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConversionSummaryCard data={conv} />
              <FunnelCard data={conv} />
            </div>
            <TrendCard data={conv} />
            <SpeedTiles data={conv} />
            <BySourceCard data={conv} />
            <div className={`grid grid-cols-1 gap-6 ${conv.lostReasons ? "lg:grid-cols-2" : ""}`}>
              <PipelineCard data={conv} statuses={statuses} />
              <LostReasonsCard data={conv} />
            </div>
          </div>
        )
      )}

      {/* ── REVENUE ── */}
      {tab === "revenue" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { label: "Total Revenue", value: currencyWhole(totalRevenue), sub: "all confirmed bookings, all time" },
              { label: "Avg Booking Value", value: currencyWhole(avgBookingValue), sub: "per booking with a total" },
              { label: "Confirmed Bookings", value: confirmedBookings.length, sub: "events" },
            ].map(s => (
              <div key={s.label} className="dante-card p-5">
                <div className="font-cormorant text-4xl font-semibold text-ink mb-1">{s.value}</div>
                <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
                <div className="font-dm text-xs text-sage mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
          <div className="dante-card p-5">
            <h2 className="font-cormorant text-xl font-semibold text-ink">Monthly Revenue</h2>
            <p className="font-dm text-xs text-sage mt-0.5 mb-4">{currentYear}, by event date. Cancelled events left out.</p>
            {revenueData && revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd4" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a6256" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#6a6256" }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#2f5488" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-sage font-dm text-sm">No revenue data yet</div>
            )}
          </div>
          <div className="dante-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-cormorant text-lg font-semibold text-ink">Revenue by Booking</h2>
              <button
                onClick={() => {
                  const rows = (allBookings ?? []).filter((b: any) => b.totalNzd).sort((a: any, b: any) => (Number(b.totalNzd) || 0) - (Number(a.totalNzd) || 0));
                  const header = ['Event','Date','Guests','Value','Status'];
                  const csvRows = [header, ...rows.map((b: any) => [
                    b.eventName || `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim(),
                    b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-NZ') : '',
                    b.guestCount ?? '',
                    b.totalNzd ?? '',
                    b.status ?? '',
                  ])];
                  const csv = csvRows.map(r => r.map((c: any) => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'VenueFlow-Revenue.csv'; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 text-xs font-inter text-sage-green border border-sage-green/30 px-3 py-1.5 rounded-lg hover:bg-sage-tint transition-colors"
                title="Export to CSV"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-linen">
                  {["Event", "Date", "Guests", "Value", "Status"].map(h => (
                    <th key={h} className="font-bebas text-xs tracking-widest text-sage text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {(allBookings ?? []).filter((b: any) => b.totalNzd).sort((a: any, b: any) => (Number(b.totalNzd) || 0) - (Number(a.totalNzd) || 0)).map((b: any) => (
                  <tr key={b.id} className="hover:bg-linen transition-colors">
                    <td className="px-4 py-3 font-dm text-sm text-ink">{b.eventName || `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || "—"}</td>
                    <td className="px-4 py-3 font-dm text-xs text-sage">{b.eventDate ? new Date(b.eventDate).toLocaleDateString("en-NZ") : "—"}</td>
                    <td className="px-4 py-3 font-dm text-xs text-sage">{b.guestCount || "—"}</td>
                    <td className="px-4 py-3 font-dm text-sm font-semibold text-ink">${Number(b.totalNzd).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${statusChipClasses(b.status, statuses)}`}>{b.status?.toUpperCase()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PROPOSALS ── */}
      {tab === "proposals" && (() => {
        const lost = allLeads.filter((l: any) => l.status === "lost").length;
        const proposalLeads = allLeads.filter((l: any) =>
          ["proposal_sent", "negotiating", ...WON_LEAD_STATUSES, "lost"].includes(l.status)
        ).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        // Where every enquiry sits right now — bar colours come from the venue's status palette.
        const countOf = (keys: readonly string[]) => allLeads.filter((l: any) => keys.includes(l.status)).length;
        const funnelData = [
          { stage: statusLabel("new"), count: countOf(["new"]), color: statusSwatch("new", statuses) },
          { stage: statusLabel("contacted"), count: countOf(["contacted"]), color: statusSwatch("contacted", statuses) },
          { stage: statusLabel("proposal_sent"), count: countOf(["proposal_sent"]), color: statusSwatch("proposal_sent", statuses) },
          { stage: statusLabel("negotiating"), count: countOf(["negotiating"]), color: statusSwatch("negotiating", statuses) },
          { stage: statusLabel("booked"), count: countOf(WON_LEAD_STATUSES), color: statusSwatch("booked", statuses) },
          { stage: statusLabel("lost"), count: lost, color: statusSwatch("lost", statuses) },
        ];
        const maxCount = Math.max(...funnelData.map(f => f.count), 1);
        const stage = (k: string) => conv?.funnel.find(f => f.key === k)?.count ?? 0;
        const sent = stage("proposal_sent"), viewed = stage("proposal_viewed"), accepted = stage("accepted");
        return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Proposals Sent", value: conv ? sent : "…", sub: "to this period's enquiries" },
              { label: "Viewed", value: conv ? viewed : "…", sub: "opened by the client" },
              { label: "Accepted", value: conv ? accepted : "…", sub: "accepted online" },
              { label: "Acceptance Rate", value: conv ? (sent > 0 ? `${Math.round((accepted / sent) * 100)}%` : "—") : "…", sub: "accepted ÷ sent" },
            ].map(s => (
              <div key={s.label} className="dante-card p-5">
                <div className="font-cormorant text-4xl font-semibold text-ink mb-1">{s.value}</div>
                <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
                <div className="font-dm text-xs text-sage mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
          {/* Pipeline funnel */}
          <div className="dante-card p-5">
            <h2 className="font-cormorant text-xl font-semibold text-ink">Enquiries by Stage</h2>
            <p className="font-dm text-xs text-sage mt-0.5 mb-4">Where every enquiry sits right now, all time.</p>
            <div className="space-y-2">
              {funnelData.map(f => (
                <div key={f.stage} className="flex items-center gap-3">
                  <span className="font-bebas text-xs tracking-widest text-sage w-32 flex-shrink-0">{f.stage}</span>
                  <div className="flex-1 h-5 bg-linen overflow-hidden">
                    <div className="h-5 transition-all" style={{ width: `${(f.count / maxCount) * 100}%`, backgroundColor: f.color }} />
                  </div>
                  <span className="font-dm text-xs font-semibold text-ink w-6 text-right">{f.count}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Recent proposals table */}
          {proposalLeads.length > 0 && (
            <div className="dante-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-cormorant text-lg font-semibold text-ink">Recent Proposals</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-linen">
                    {["Client", "Event Type", "Event Date", "Guests", "Stage"].map(h => (
                      <th key={h} className="font-bebas text-xs tracking-widest text-sage text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {proposalLeads.slice(0, 20).map((l: any) => (
                    <tr key={l.id} className="hover:bg-linen transition-colors">
                      <td className="px-4 py-3 font-dm text-sm text-ink">{l.firstName} {l.lastName}</td>
                      <td className="px-4 py-3 font-dm text-xs text-sage">{l.eventType || "—"}</td>
                      <td className="px-4 py-3 font-dm text-xs text-sage">{l.eventDate ? new Date(l.eventDate).toLocaleDateString("en-NZ") : "—"}</td>
                      <td className="px-4 py-3 font-dm text-xs text-sage">{l.guestCount || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${statusChipClasses(l.status, statuses)}`}>
                          {statusLabel(l.status ?? "").toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {proposalLeads.length === 0 && (
            <div className="dante-card p-5">
              <p className="font-dm text-sm text-sage text-center py-8">No proposals sent yet. Start by converting an enquiry to a proposal in the{" "}
                <Link href="/dashboard">
                  <span className="text-burgundy hover:underline cursor-pointer">Inbox</span>
                </Link>.
              </p>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
