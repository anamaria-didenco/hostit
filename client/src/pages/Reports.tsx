import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import { FileText, TrendingUp, DollarSign, Users, Calendar, ArrowUpRight, Settings, Download } from "lucide-react";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "events", label: "Events" },
  { key: "enquiries", label: "Enquiries" },
  { key: "revenue", label: "Revenue" },
  { key: "proposals", label: "Proposals" },
];

const BRAND_COLORS = ["#6b98e7", "#4a7dd4", "#8ab2ee", "#2d5fa8", "#b8ccf4"];

export default function Reports() {
  const [tab, setTab] = useState("overview");
  const [showCustomize, setShowCustomize] = useState(false);
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('vfhq_hidden_report_cards') ?? '[]')); }
    catch { return new Set(); }
  });
  const currentYear = new Date().getFullYear();
  const { data: revenueData } = trpc.analytics.revenueByMonth.useQuery({ year: currentYear });
  const { data: sourceData } = trpc.analytics.sourceBreakdown.useQuery();
  const { data: allLeads } = trpc.leads.list.useQuery({});
  const { data: allBookings } = trpc.bookings.list.useQuery();

  const confirmedBookings = (allBookings ?? []).filter((b: any) => b.status === "confirmed" || b.status === "tentative" || b.status === "finished");
  const totalRevenue = (allBookings ?? []).reduce((sum: number, b: any) => sum + (Number(b.totalValue) || 0), 0);
  const avgBookingValue = confirmedBookings.length > 0 ? totalRevenue / confirmedBookings.length : 0;

  // Lead conversion stats
  const totalLeads = (allLeads ?? []).length;
  const proposalsSent = (allLeads ?? []).filter((l: any) => ["proposal_sent", "negotiating", "booked"].includes(l.status)).length;
  const booked = (allLeads ?? []).filter((l: any) => l.status === "booked").length;
  const conversionRate = totalLeads > 0 ? Math.round((booked / totalLeads) * 100) : 0;

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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-cormorant text-3xl font-semibold text-ink">Reports</h1>
          <p className="font-dm text-sm text-sage mt-0.5">Analytics and performance insights for your venue</p>
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
                <div className="font-bebas text-xs tracking-widest text-ink/50 mb-2">SHOW / HIDE CARDS</div>
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
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "Bebas Neue" }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
                    <Bar dataKey="revenue" fill="#6b98e7" radius={[2, 2, 0, 0]} />
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
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={sourceData} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={75} label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {sourceData.map((_: any, i: number) => (
                        <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
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
          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap">
            {[
              { label: "New", bg: "bg-sky-50", border: "border-sky-300", text: "text-sky-700" },
              { label: "Contacted", bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700" },
              { label: "Proposal Sent", bg: "bg-violet-50", border: "border-violet-300", text: "text-violet-700" },
              { label: "Negotiating", bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700" },
              { label: "Booked", bg: "bg-blue-50", border: "border-blue-400", text: "text-forest" },
              { label: "Lost", bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-500" },
              { label: "Cancelled", bg: "bg-red-50", border: "border-red-300", text: "text-red-600" },
            ].map(s => (
              <span key={s.label} className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${s.bg} ${s.border} ${s.text}`}>{s.label}</span>
            ))}
            <span className="font-dm text-xs text-sage ml-auto">{(allLeads ?? []).length} enquiries · {(allBookings ?? []).length} bookings</span>
          </div>

          {/* All Leads table */}
          <div className="dante-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-linen flex items-center justify-between">
              <h2 className="font-cormorant text-lg font-semibold text-ink">All Enquiries & Events</h2>
            </div>
            <table className="w-full">
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
                    const rowBg =
                      l.status === "booked" ? "bg-blue-50/60 hover:bg-blue-50" :
                      l.status === "negotiating" ? "bg-amber-50/60 hover:bg-amber-50" :
                      l.status === "proposal_sent" ? "bg-violet-50/60 hover:bg-violet-50" :
                      l.status === "contacted" ? "bg-blue-50/60 hover:bg-blue-50" :
                      l.status === "new" ? "bg-sky-50/60 hover:bg-sky-50" :
                      l.status === "lost" ? "bg-gray-50/60 hover:bg-gray-50" :
                      "bg-red-50/60 hover:bg-red-50";
                    const badgeClass =
                      l.status === "booked" ? "border-blue-400 bg-blue-100 text-forest" :
                      l.status === "negotiating" ? "border-amber-400 bg-amber-100 text-amber-700" :
                      l.status === "proposal_sent" ? "border-violet-400 bg-violet-100 text-violet-700" :
                      l.status === "contacted" ? "border-blue-400 bg-blue-100 text-blue-700" :
                      l.status === "new" ? "border-sky-400 bg-sky-100 text-sky-700" :
                      l.status === "lost" ? "border-gray-300 bg-gray-100 text-gray-500" :
                      "border-red-400 bg-red-100 text-red-600";
                    return (
                      <tr key={l.id} className={`transition-colors cursor-pointer ${rowBg}`}>
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
                        <td className="px-4 py-3 font-dm text-xs text-sage">{l.source || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
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
                    const rowBg =
                      b.status === "confirmed" ? "bg-blue-50/60 hover:bg-blue-50" :
                      b.status === "tentative" ? "bg-amber-50/60 hover:bg-amber-50" :
                      b.status === "cancelled" ? "bg-gray-50/60 hover:bg-gray-50" :
                      "bg-blue-50/60 hover:bg-blue-50";
                    const badgeClass =
                      b.status === "confirmed" ? "border-blue-400 bg-blue-100 text-forest" :
                      b.status === "tentative" ? "border-amber-400 bg-amber-100 text-amber-700" :
                      b.status === "cancelled" ? "border-gray-300 bg-gray-100 text-gray-500" :
                      "border-blue-300 bg-blue-100 text-blue-700";
                    return (
                      <tr key={b.id} className={`transition-colors ${rowBg}`}>
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
                  <Line type="monotone" dataKey="enquiries" stroke="#6b98e7" strokeWidth={2} dot={{ fill: "#6b98e7", r: 3 }} />
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
                  <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "Bebas Neue" }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="#6b98e7" radius={[2, 2, 0, 0]} />
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
                  const rows = (allBookings ?? []).filter((b: any) => b.totalValue).sort((a: any, b: any) => (b.totalValue || 0) - (a.totalValue || 0));
                  const header = ['Event','Date','Guests','Value','Status'];
                  const csvRows = [header, ...rows.map((b: any) => [
                    b.eventName ?? '',
                    b.eventDate ? new Date(b.eventDate).toLocaleDateString('en-NZ') : '',
                    b.guestCount ?? '',
                    b.totalValue ?? '',
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
                {(allBookings ?? []).filter((b: any) => b.totalValue).sort((a: any, b: any) => (b.totalValue || 0) - (a.totalValue || 0)).map((b: any) => (
                  <tr key={b.id} className="hover:bg-linen/50 transition-colors">
                    <td className="px-4 py-3 font-dm text-sm text-ink">{b.eventName || "—"}</td>
                    <td className="px-4 py-3 font-dm text-xs text-sage">{b.eventDate ? new Date(b.eventDate).toLocaleDateString("en-NZ") : "—"}</td>
                    <td className="px-4 py-3 font-dm text-xs text-sage">{b.guestCount || "—"}</td>
                    <td className="px-4 py-3 font-dm text-sm font-semibold text-ink">${Number(b.totalValue).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${
                        b.status === "confirmed" ? "border-blue-400 bg-blue-50 text-forest" : "border-amber-400 bg-amber-50 text-amber-700"
                      }`}>{b.status?.toUpperCase()}</span>
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
        // Pipeline funnel data
        const funnelData = [
          { stage: "New Enquiry", count: (allLeads ?? []).filter((l: any) => l.status === "new").length, color: "#94a3b8" },
          { stage: "Contacted", count: (allLeads ?? []).filter((l: any) => l.status === "contacted").length, color: "#6b98e7" },
          { stage: "Proposal Sent", count: (allLeads ?? []).filter((l: any) => l.status === "proposal_sent").length, color: "#8b5cf6" },
          { stage: "Negotiating", count: inNegotiation, color: "#f59e0b" },
          { stage: "Booked", count: booked, color: "#10b981" },
          { stage: "Lost", count: lost, color: "#ef4444" },
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
                        <span className={`font-bebas text-[10px] tracking-widest px-2 py-0.5 border ${
                          l.status === "booked" ? "border-emerald-400 bg-emerald-50 text-emerald-700" :
                          l.status === "proposal_sent" ? "border-violet-400 bg-violet-50 text-violet-700" :
                          l.status === "negotiating" ? "border-amber-400 bg-amber-50 text-amber-700" :
                          "border-stone-300 bg-stone-50 text-stone-500"
                        }`}>
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
