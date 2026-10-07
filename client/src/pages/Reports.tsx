import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import { FileText, TrendingUp, DollarSign, Users, Calendar, ArrowUpRight, Settings, Download, AlertCircle } from "lucide-react";
import { parseCustomStatuses, statusChipClasses, statusSwatch } from "@/components/StatusManager";

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
  { key: "enquiries", label: "Enquiries" },
  { key: "revenue", label: "Revenue" },
  { key: "proposals", label: "Proposals" },
];

const BRAND_COLORS = ["#2f5488", "#4a7dd4", "#8ab2ee", "#2d5fa8", "#b8ccf4"];

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
  const currentYear = new Date().getFullYear();
  const { data: revenueData } = trpc.analytics.revenueByMonth.useQuery({ year: currentYear });
  const { data: sourceData } = trpc.analytics.sourceBreakdown.useQuery();
  const { data: allLeads, isError: leadsError, refetch: refetchLeads } = trpc.leads.list.useQuery({});
  const { data: allBookings, isError: bookingsError, refetch: refetchBookings } = trpc.bookings.list.useQuery();
  const primaryError = leadsError || bookingsError;

  const confirmedBookings = (allBookings ?? []).filter((b: any) => b.status === "confirmed" || b.status === "tentative" || b.status === "finished");
  const totalRevenue = (allBookings ?? []).reduce((sum: number, b: any) => sum + (Number(b.totalNzd) || 0), 0);
  const avgBookingValue = confirmedBookings.length > 0 ? totalRevenue / confirmedBookings.length : 0;

  // Lead conversion stats
  const totalLeads = (allLeads ?? []).length;
  const proposalsSent = (allLeads ?? []).filter((l: any) => ["proposal_sent", "negotiating", "booked"].includes(l.status)).length;
  const booked = (allLeads ?? []).filter((l: any) => l.status === "booked").length;
  const conversionRate = totalLeads > 0 ? Math.round((booked / totalLeads) * 100) : 0;

  // Turn raw source keys ("lead_form") into human labels ("Lead Form").
  const fmtSource = (s: string) => (s || "—").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Event type breakdown
  const eventTypeCounts: Record<string, number> = {};
  (allLeads ?? []).forEach((l: any) => {
    if (l.eventType) eventTypeCounts[l.eventType] = (eventTypeCounts[l.eventType] || 0) + 1;
  });
  const eventTypeData = Object.entries(eventTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  // Monthly leads
  const monthlyLeads: Record<string, number> = {};
  (allLeads ?? []).forEach((l: any) => {
    if (l.createdAt) {
      const d = new Date(l.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyLeads[key] = (monthlyLeads[key] || 0) + 1;
    }
  });
  const monthlyLeadData = Object.entries(monthlyLeads)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([key, count]) => ({
      month: new Date(key + "-01").toLocaleDateString("en-NZ", { month: "short", year: "2-digit" }),
      leads: count,
    }));

  if (primaryError) return (
    <div className="p-6">
      <h1 className="font-cormorant text-3xl font-semibold text-ink">Reports</h1>
      <div className="mt-8 text-center py-16">
        <AlertCircle className="w-8 h-8 text-red-500/70 mx-auto mb-2" />
        <p className="font-dm text-ink text-sm mb-3">Couldn't load reports.</p>
        <button
          onClick={() => { refetchLeads(); refetchBookings(); }}
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
                <div className="font-bebas text-xs tracking-widest text-ink/70 mb-2">SHOW / HIDE CARDS</div>
                {[
                  { id: "total_enquiries", label: "Total Enquiries" },
                  { id: "confirmed_bookings", label: "Confirmed Bookings" },
                  { id: "conversion_rate", label: "Conversion Rate" },
                  { id: "total_revenue", label: "Total Revenue" },
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
      <div className="flex gap-0 mb-6 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`font-bebas tracking-widest text-xs px-5 py-3 transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-burgundy text-burgundy"
                : "border-transparent text-sage hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* KPI cards */}
          {(() => {
            const cards = [
              { id: "total_enquiries", label: "Total Enquiries", value: totalLeads, icon: <Users className="w-5 h-5 text-burgundy" />, sub: "all time" },
              { id: "confirmed_bookings", label: "Confirmed Bookings", value: confirmedBookings.length, icon: <Calendar className="w-5 h-5 text-blue-500" />, sub: "all time" },
              { id: "conversion_rate", label: "Conversion Rate", value: `${conversionRate}%`, icon: <TrendingUp className="w-5 h-5 text-forest" />, sub: "enquiry to booking" },
              { id: "total_revenue", label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: <DollarSign className="w-5 h-5 text-amber-600" />, sub: "NZD, all bookings" },
            ].filter(c => !hiddenCards.has(c.id));
            if (cards.length === 0) return null;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map(s => (
                  <div key={s.id} className="dante-card p-5">
                    <div className="mb-3">{s.icon}</div>
                    <div className="font-cormorant text-4xl font-semibold text-ink mb-1">{s.value}</div>
                    <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
                    <div className="font-dm text-xs text-sage/60 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Two charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue by month */}
            <div className="dante-card p-5">
              <h2 className="font-cormorant text-lg font-semibold text-ink mb-4">Revenue by Month</h2>
              {revenueData && revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={revenueData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd4" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "Bebas Neue" }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="#2f5488" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-sage/40 font-dm text-sm">No revenue data yet</div>
              )}
            </div>

            {/* Enquiry source */}
            <div className="dante-card p-5">
              <h2 className="font-cormorant text-lg font-semibold text-ink mb-4">Enquiry Sources</h2>
              {sourceData && sourceData.length > 0 ? (
                // Recharts marks every pie slice role="img" with no name of its
                // own. Name the chart once and hide the decorative geometry, so
                // a screen reader gets the figures rather than a run of
                // unlabelled images. The slices are not focusable.
                // role="img" makes the subtree a single leaf node to assistive
                // tech, so the label below is what gets announced rather than a
                // run of unnamed slice paths.
                <div role="img" aria-label={`Enquiry sources: ${sourceData.map((d: any) => `${fmtSource(d.source)}, ${d.count}`).join('; ')}`}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={sourceData} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={75} label={({ source, percent }) => `${fmtSource(source)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {sourceData.map((_: any, i: number) => (
                        <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} role="presentation" aria-hidden="true" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-sage/40 font-dm text-sm">No source data yet</div>
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
                <tr className="border-b border-border bg-linen/60">
                  {["Name", "Event", "Date", "Type", "Guests", "Budget", "Status", "Source"].map(h => (
                    <th key={h} className="font-bebas text-xs tracking-widest text-sage text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {(allLeads ?? []).length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 font-dm text-sm text-sage/60">No enquiries yet</td></tr>
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
                  <tr className="border-b border-border bg-linen/60">
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

      {/* ── ENQUIRIES ── */}
      {tab === "enquiries" && (
        <div className="space-y-6">
          {/* Conversion funnel */}
          <div className="dante-card p-5">
            <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Conversion Funnel</h2>
            <div className="space-y-3">
              {[
                { label: "Total Enquiries", value: totalLeads, pct: 100 },
                { label: "Proposals Sent", value: proposalsSent, pct: totalLeads > 0 ? Math.round((proposalsSent / totalLeads) * 100) : 0 },
                { label: "Confirmed Bookings", value: booked, pct: totalLeads > 0 ? Math.round((booked / totalLeads) * 100) : 0 },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-4">
                  <span className="font-bebas text-xs tracking-widest text-sage w-40 flex-shrink-0">{row.label}</span>
                  <div className="flex-1 bg-linen h-6 overflow-hidden">
                    <div className="h-6 bg-burgundy transition-all flex items-center px-2" style={{ width: `${row.pct}%` }}>
                      <span className="font-bebas text-xs text-cream">{row.value}</span>
                    </div>
                  </div>
                  <span className="font-dm text-xs text-sage w-10 text-right">{row.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly leads chart */}
          <div className="dante-card p-5">
            <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Enquiries Over Time</h2>
            {monthlyLeadData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyLeadData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd4" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "Bebas Neue" }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="enquiries" stroke="#2f5488" strokeWidth={2} dot={{ fill: "#2f5488", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-sage/40 font-dm text-sm">No data yet</div>
            )}
          </div>

          {/* Source breakdown */}
          <div className="dante-card p-5">
            <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Enquiry Sources</h2>
            {sourceData && sourceData.length > 0 ? (
              <div className="space-y-2">
                {sourceData.map((s: any, i: number) => (
                  <div key={s.source} className="flex items-center gap-3">
                    <span className="font-bebas text-xs tracking-widest text-sage w-28 flex-shrink-0">{s.source || "Unknown"}</span>
                    <div className="flex-1 bg-linen h-4 overflow-hidden">
                      <div className="h-4 transition-all" style={{
                        width: `${(s.count / (sourceData[0]?.count || 1)) * 100}%`,
                        backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length]
                      }} />
                    </div>
                    <span className="font-dm text-xs text-sage w-6 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 font-dm text-sm text-sage/60">No source data yet — add source to your enquiries</div>
            )}
          </div>

          {/* Event type breakdown */}
          {eventTypeData.length > 0 && (
            <div className="dante-card p-5">
              <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Top Event Types</h2>
              <div className="space-y-2">
                {eventTypeData.map((e, i) => (
                  <div key={e.name} className="flex items-center gap-3">
                    <span className="font-bebas text-xs tracking-widest text-sage w-32 flex-shrink-0 truncate">{e.name}</span>
                    <div className="flex-1 bg-linen h-4 overflow-hidden">
                      <div className="h-4 transition-all" style={{
                        width: `${(e.value / (eventTypeData[0]?.value || 1)) * 100}%`,
                        backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length]
                      }} />
                    </div>
                    <span className="font-dm text-xs text-sage w-6 text-right">{e.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REVENUE ── */}
      {tab === "revenue" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, sub: "all confirmed bookings" },
              { label: "Avg Booking Value", value: `$${Math.round(avgBookingValue).toLocaleString()}`, sub: "per confirmed booking" },
              { label: "Confirmed Bookings", value: confirmedBookings.length, sub: "events" },
            ].map(s => (
              <div key={s.label} className="dante-card p-5">
                <div className="font-cormorant text-4xl font-semibold text-ink mb-1">{s.value}</div>
                <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
                <div className="font-dm text-xs text-sage/60 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
          <div className="dante-card p-5">
            <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Monthly Revenue</h2>
            {revenueData && revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd4" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "Bebas Neue" }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#2f5488" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-sage/40 font-dm text-sm">No revenue data yet</div>
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
                    b.eventName ?? '',
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
                  <tr key={b.id} className="hover:bg-linen/50 transition-colors">
                    <td className="px-4 py-3 font-dm text-sm text-ink">{b.eventName || "—"}</td>
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
        const lost = (allLeads ?? []).filter((l: any) => l.status === "lost").length;
        const inNegotiation = (allLeads ?? []).filter((l: any) => l.status === "negotiating").length;
        const proposalLeads = (allLeads ?? []).filter((l: any) =>
          ["proposal_sent", "negotiating", "booked", "lost"].includes(l.status)
        ).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        // Pipeline funnel data — bar colours come from the venue's status palette.
        const funnelData = [
          { stage: "New Enquiry", count: (allLeads ?? []).filter((l: any) => l.status === "new").length, color: statusSwatch("new", statuses) },
          { stage: "Contacted", count: (allLeads ?? []).filter((l: any) => l.status === "contacted").length, color: statusSwatch("contacted", statuses) },
          { stage: "Proposal Sent", count: (allLeads ?? []).filter((l: any) => l.status === "proposal_sent").length, color: statusSwatch("proposal_sent", statuses) },
          { stage: "Negotiating", count: inNegotiation, color: statusSwatch("negotiating", statuses) },
          { stage: "Booked", count: booked, color: statusSwatch("booked", statuses) },
          { stage: "Lost", count: lost, color: statusSwatch("lost", statuses) },
        ];
        const maxCount = Math.max(...funnelData.map(f => f.count), 1);
        return (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Proposals Sent", value: proposalsSent, sub: "total" },
              { label: "In Negotiation", value: inNegotiation, sub: "active" },
              { label: "Accepted (Booked)", value: booked, sub: "converted" },
              { label: "Acceptance Rate", value: `${proposalsSent > 0 ? Math.round((booked / proposalsSent) * 100) : 0}%`, sub: "proposal to booking" },
            ].map(s => (
              <div key={s.label} className="dante-card p-5">
                <div className="font-cormorant text-4xl font-semibold text-ink mb-1">{s.value}</div>
                <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
                <div className="font-dm text-xs text-sage/60 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
          {/* Pipeline funnel */}
          <div className="dante-card p-5">
            <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Enquiry Pipeline Funnel</h2>
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
                    <tr key={l.id} className="hover:bg-linen/50 transition-colors">
                      <td className="px-4 py-3 font-dm text-sm text-ink">{l.firstName} {l.lastName}</td>
                      <td className="px-4 py-3 font-dm text-xs text-sage">{l.eventType || "—"}</td>
                      <td className="px-4 py-3 font-dm text-xs text-sage">{l.eventDate ? new Date(l.eventDate).toLocaleDateString("en-NZ") : "—"}</td>
                      <td className="px-4 py-3 font-dm text-xs text-sage">{l.guestCount || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bebas text-[10px] tracking-widest px-2 py-0.5 border ${statusChipClasses(l.status, statuses)}`}>
                          {l.status === "proposal_sent" ? "PROPOSAL SENT" :
                           l.status === "negotiating" ? "NEGOTIATING" :
                           l.status === "booked" ? "BOOKED" :
                           (l.status ?? "").replace(/_/g, " ").toUpperCase()}
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
