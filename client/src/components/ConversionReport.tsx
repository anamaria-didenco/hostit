// Conversion sections for the Reports page. Every figure comes from
// reports.conversion, which applies the one shared definition in
// shared/conversion.ts (real enquiries only, cohort by when they arrived).
import React, { useEffect, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Download } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { currencyWhole } from "@/lib/money";
import { statusSwatch, type StatusDef } from "@/components/StatusManager";

export type ConversionData = inferRouterOutputs<AppRouter>["reports"]["conversion"];
export type PeriodChoice = { preset: "month" | "3m" | "12m" | "custom"; from: string; to: string };

const NAVY = "#2f5488";
const NAVY_LIGHT = "#a9c1ea";
const GREY = "#c9c2b6";

export const fmtSource = (s: string) => (s || "—").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/** "1 Aug – 8 Oct 2026" from two YYYY-MM-DD strings (calendar dates, no tz shift). */
export function fmtRange(from: string, to: string): string {
  const d = (ymd: string, withYear: boolean) => {
    const [y, m, day] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-NZ", {
      day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
    });
  };
  return `${d(from, from.slice(0, 4) !== to.slice(0, 4))} – ${d(to, true)}`;
}

const pctText = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

function fmtHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} hours`;
  return `${Math.round((h / 24) * 10) / 10} days`;
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="font-bebas text-xs tracking-widest text-sage">{children}</div>
);

// ─── Period picker ───────────────────────────────────────────────────────────
const PRESETS: Array<{ key: PeriodChoice["preset"]; label: string }> = [
  { key: "month", label: "This month" },
  { key: "3m", label: "Last 3 months" },
  { key: "12m", label: "Last 12 months" },
  { key: "custom", label: "Custom" },
];

export function PeriodPicker({ value, onChange, resolved }: {
  value: PeriodChoice;
  onChange: (v: PeriodChoice) => void;
  resolved?: { from: string; to: string };
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div role="group" aria-label="Report period" className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => {
          const on = value.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(p.key === "custom"
                ? { preset: "custom", from: value.from || resolved?.from || "", to: value.to || resolved?.to || "" }
                : { ...value, preset: p.key })}
              className={`font-bebas tracking-widest text-xs px-3 py-2 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                on ? "bg-forest text-cream border-forest" : "border-border text-sage hover:text-ink bg-white"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {value.preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 font-dm text-xs text-sage">
              From
              <input
                type="date" value={value.from} max={value.to || undefined}
                onChange={e => e.target.value && onChange({ ...value, from: e.target.value })}
                className="border border-border bg-white px-2 py-1.5 font-dm text-xs text-ink"
              />
            </label>
            <label className="flex items-center gap-1.5 font-dm text-xs text-sage">
              To
              <input
                type="date" value={value.to} min={value.from || undefined}
                onChange={e => e.target.value && onChange({ ...value, to: e.target.value })}
                className="border border-border bg-white px-2 py-1.5 font-dm text-xs text-ink"
              />
            </label>
          </div>
        )}
      </div>
      {resolved && (
        <p className="font-dm text-xs text-sage" aria-live="polite">
          Enquiries received {fmtRange(resolved.from, resolved.to)} · NZ time
        </p>
      )}
    </div>
  );
}

// ─── Headline ────────────────────────────────────────────────────────────────
export function ConversionSummaryCard({ data }: { data: ConversionData }) {
  const s = data.summary;
  const parts = [
    { key: "won", label: "Booked", value: s.won, color: NAVY },
    { key: "open", label: "Still open", value: s.open, color: NAVY_LIGHT },
    { key: "lost", label: "Lost or cancelled", value: s.lost, color: GREY },
  ];
  return (
    <div className="dante-card p-5">
      <h2 className="font-cormorant text-xl font-semibold text-ink">Conversion</h2>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">
        Of the enquiries received in this period, how many are booked now. Recent enquiries are often still open, so they're shown on their own.
      </p>
      {s.enquiries === 0 ? (
        <p className="font-dm text-sm text-sage py-6 text-center">No enquiries in this period.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
            <span className="font-cormorant text-5xl font-semibold text-ink">{pctText(s.rate)}</span>
            <span className="font-dm text-sm text-ink">
              {s.won} of {s.enquiries} enquir{s.enquiries === 1 ? "y" : "ies"} booked
              {s.wonValue > 0 && <> · {currencyWhole(s.wonValue)} in bookings</>}
            </span>
          </div>
          <div
            className="flex h-4 w-full overflow-hidden rounded-sm gap-[2px] bg-white"
            role="img"
            aria-label={parts.map(p => `${p.label}: ${p.value}`).join(", ")}
          >
            {parts.filter(p => p.value > 0).map(p => (
              <div key={p.key} style={{ width: `${(p.value / s.enquiries) * 100}%`, backgroundColor: p.color }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {parts.map(p => (
              <li key={p.key} className="flex items-center gap-1.5 font-dm text-xs text-ink">
                <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
                {p.label} <span className="font-semibold">{p.value}</span>
              </li>
            ))}
          </ul>
          {s.open > 0 && s.won + s.lost > 0 && (
            <p className="font-dm text-xs text-sage mt-4 pt-3 border-t border-border">
              Counting only the {s.won + s.lost} that have been decided, {Math.round((s.won / (s.won + s.lost)) * 100)}% were booked.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Funnel ──────────────────────────────────────────────────────────────────
export function FunnelCard({ data }: { data: ConversionData }) {
  const f = data.funnel;
  const total = f[0]?.count ?? 0;
  const accepted = f.find(s => s.key === "accepted")?.count ?? 0;
  const booked = f.find(s => s.key === "booked")?.count ?? 0;
  return (
    <div className="dante-card p-5">
      <h2 className="font-cormorant text-xl font-semibold text-ink">Funnel</h2>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">How far this period's enquiries have got. Percentages are of all enquiries.</p>
      {total === 0 ? (
        <p className="font-dm text-sm text-sage py-6 text-center">No enquiries in this period.</p>
      ) : (
        <ol className="space-y-2.5">
          {f.map(s => (
            <li key={s.key} className="grid grid-cols-[1fr_auto] sm:grid-cols-[10.5rem_1fr_5.5rem] items-center gap-x-3 gap-y-1">
              <span className="font-bebas text-xs tracking-widest text-sage">{s.label}</span>
              <div className="h-5 bg-linen overflow-hidden rounded-sm col-span-2 sm:col-span-1 order-last sm:order-none">
                <div className="h-5 rounded-sm" style={{ width: `${total ? (s.count / total) * 100 : 0}%`, backgroundColor: NAVY, minWidth: s.count > 0 ? 3 : 0 }} />
              </div>
              <span className="font-dm text-xs text-ink text-right tabular-nums">
                <span className="font-semibold">{s.count}</span> <span className="text-sage">· {pctText(s.pct)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {booked > accepted && (
        <p className="font-dm text-xs text-sage mt-4">
          Booked is higher than accepted because some events were confirmed without an online proposal.
        </p>
      )}
    </div>
  );
}

// ─── Over time ───────────────────────────────────────────────────────────────
export function TrendCard({ data }: { data: ConversionData }) {
  const { unit, buckets } = data.series;
  const any = buckets.some(b => b.enquiries > 0);
  // Recharts spreads a capped pair across the whole slot; sizing bars from the
  // real width keeps each enquiries/booked pair side by side.
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [any]);
  const barSize = Math.max(4, Math.min(32, Math.floor(((width - 40) / Math.max(1, buckets.length)) * 0.32)));
  return (
    <div className="dante-card p-5">
      <h2 className="font-cormorant text-xl font-semibold text-ink">Enquiries over time</h2>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">
        By the {unit} each enquiry arrived (NZ time). Booked shows how many of that {unit}'s enquiries are booked now.
      </p>
      {any ? (
        <div ref={boxRef} role="img" aria-label={`Enquiries and bookings by ${unit}: ${buckets.map(b => `${b.label}, ${b.enquiries} enquiries, ${b.won} booked`).join("; ")}`}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5ddd4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a6256" }} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tick={{ fontSize: 11, fill: "#6a6256" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(47,84,136,0.06)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" formatter={(v: string) => <span style={{ color: "#211d18" }}>{v}</span>} />
              <Bar dataKey="enquiries" name="Enquiries" fill={NAVY_LIGHT} radius={[3, 3, 0, 0]} barSize={barSize} />
              <Bar dataKey="won" name="Booked" fill={NAVY} radius={[3, 3, 0, 0]} barSize={barSize} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-48 flex items-center justify-center text-sage font-dm text-sm">No enquiries in this period</div>
      )}
    </div>
  );
}

// ─── Speed tiles ─────────────────────────────────────────────────────────────
export function SpeedTiles({ data }: { data: ConversionData }) {
  const t = data.timeToBook;
  const r = data.responseTime;
  const tiles = [
    {
      label: "Time to book",
      value: t.medianDays == null ? "—" : `${t.medianDays} day${t.medianDays === 1 ? "" : "s"}`,
      sub: t.count ? `Middle value, from enquiry to booked · ${t.count} booking${t.count === 1 ? "" : "s"}` : "No bookings from this period yet",
    },
    {
      label: "First reply",
      value: fmtHours(r.medianHours),
      sub: r.count
        ? `Middle value · ${r.within24h} of ${r.count} answered within a day`
        : "No replies logged for this period yet",
      extra: r.awaitingReply > 0 ? `${r.awaitingReply} open enquir${r.awaitingReply === 1 ? "y is" : "ies are"} still waiting for a first reply` : null,
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {tiles.map(s => (
        <div key={s.label} className="dante-card p-5">
          <Eyebrow>{s.label}</Eyebrow>
          <div className="font-cormorant text-4xl font-semibold text-ink mt-1 mb-1">{s.value}</div>
          <div className="font-dm text-xs text-sage">{s.sub}</div>
          {"extra" in s && s.extra && <div className="font-dm text-xs text-gold-deep mt-1">{s.extra}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── Conversion by source ────────────────────────────────────────────────────
const DIMENSIONS = [
  { key: "source", label: "Source", head: "Source" },
  { key: "utmSource", label: "UTM source", head: "UTM source" },
  { key: "utmCampaign", label: "Campaign", head: "UTM campaign" },
  { key: "eventType", label: "Event type", head: "Event type" },
] as const;
type DimKey = typeof DIMENSIONS[number]["key"];

/** Quote a CSV cell; a leading = + - @ is neutralised so a spreadsheet can't run it. */
const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function BySourceCard({ data }: { data: ConversionData }) {
  const [dim, setDim] = useState<DimKey>("source");
  const rows = data.breakdowns[dim];
  const meta = DIMENSIONS.find(d => d.key === dim)!;
  const label = (k: string) => (dim === "source" ? fmtSource(k) : k);

  const exportCsv = () => {
    const header = [meta.head, "Enquiries", "Booked", "Still open", "Lost", "Conversion %", "Booked value (NZD)"];
    const lines = [header, ...rows.map(r => [label(r.key), r.enquiries, r.won, r.open, r.lost, r.rate ?? "", Math.round(r.wonValue)])];
    const csv = lines.map(l => l.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `VenueFlow-conversion-by-${meta.label.toLowerCase().replace(/\s+/g, "-")}-${data.period.from}-to-${data.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dante-card overflow-hidden">
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-cormorant text-xl font-semibold text-ink">Where bookings come from</h2>
            <p className="font-dm text-xs text-sage mt-0.5">Conversion for this period's enquiries, split by where they came from.</p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 text-xs font-dm text-sage-green border border-border bg-white px-3 py-1.5 rounded-lg hover:bg-sage-tint transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" aria-hidden /> Export CSV
          </button>
        </div>
        <div role="group" aria-label="Split by" className="flex flex-wrap gap-2 mt-3">
          {DIMENSIONS.map(d => (
            <button
              key={d.key}
              type="button"
              aria-pressed={dim === d.key}
              onClick={() => setDim(d.key)}
              className={`font-bebas tracking-widest text-xs px-3 py-1.5 border transition-colors ${
                dim === d.key ? "bg-forest text-cream border-forest" : "border-border text-sage hover:text-ink bg-white"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="font-dm text-sm text-sage text-center py-8">No enquiries in this period.</p>
      ) : (
        <>
        {/* Phones: one line per group instead of a table that has to scroll. */}
        <ul className="sm:hidden divide-y divide-border">
          {rows.map(r => (
            <li key={r.key} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-dm text-sm text-ink font-medium truncate">{label(r.key)}</span>
                <span className="font-dm text-sm font-semibold text-ink tabular-nums">{pctText(r.rate)}</span>
              </div>
              <div className="font-dm text-xs text-sage mt-0.5">
                {r.enquiries} enquir{r.enquiries === 1 ? "y" : "ies"} · {r.won} booked · {r.open} open{r.wonValue > 0 && <> · {currencyWhole(r.wonValue)}</>}
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-x-auto" tabIndex={0} role="region" aria-label={`Conversion by ${meta.head.toLowerCase()}`}>
          <table className="w-full min-w-[560px]">
            <caption className="sr-only">Conversion by {meta.head.toLowerCase()}</caption>
            <thead>
              <tr className="border-b border-border bg-linen">
                {[meta.head, "Enquiries", "Booked", "Conversion", "Booked value", "Still open"].map((h, i) => (
                  <th key={h} scope="col" className={`font-bebas text-xs tracking-widest text-sage px-4 py-3 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(r => (
                <tr key={r.key}>
                  <th scope="row" className="px-4 py-2.5 font-dm text-sm text-ink font-medium text-left max-w-[16rem] truncate" title={label(r.key)}>{label(r.key)}</th>
                  <td className="px-4 py-2.5 font-dm text-sm text-ink text-right tabular-nums">{r.enquiries}</td>
                  <td className="px-4 py-2.5 font-dm text-sm text-ink text-right tabular-nums">{r.won}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-2 justify-end">
                      <span aria-hidden className="hidden sm:block w-16 h-1.5 bg-linen rounded-full overflow-hidden">
                        <span className="block h-1.5 rounded-full" style={{ width: `${r.rate ?? 0}%`, backgroundColor: NAVY }} />
                      </span>
                      <span className="font-dm text-sm font-semibold text-ink tabular-nums w-10">{pctText(r.rate)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-dm text-sm text-ink text-right tabular-nums">{r.wonValue > 0 ? currencyWhole(r.wonValue) : "—"}</td>
                  <td className="px-4 py-2.5 font-dm text-sm text-sage text-right tabular-nums">{r.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

// ─── Pipeline value ──────────────────────────────────────────────────────────
export function PipelineCard({ data, statuses }: { data: ConversionData; statuses: StatusDef[] }) {
  const p = data.pipeline;
  const statusLabel = (k: string) => statuses.find(s => s.key === k)?.label ?? fmtSource(k);
  const order = new Map(statuses.map((s, i) => [s.key, i]));
  const stages = [...p.stages].sort((a, b) => (order.get(a.status) ?? 99) - (order.get(b.status) ?? 99));
  const max = Math.max(...stages.map(s => s.value), 1);
  return (
    <div className="dante-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-cormorant text-xl font-semibold text-ink">Open pipeline</h2>
        <span className="font-bebas text-xs tracking-widest px-2 py-0.5 border border-border text-gold-deep bg-gold-soft">Estimate</span>
      </div>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">All open enquiries right now, whatever the period above. Enquiries whose event date has passed are left out.</p>
      {p.count === 0 ? (
        <p className="font-dm text-sm text-sage py-6 text-center">No open enquiries.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 mb-4">
            <span className="font-cormorant text-4xl font-semibold text-ink">about {currencyWhole(p.total)}</span>
            <span className="font-dm text-sm text-ink">across {p.count} open enquir{p.count === 1 ? "y" : "ies"}</span>
          </div>
          <ul className="space-y-2.5">
            {stages.map(s => (
              <li key={s.status} className="grid grid-cols-[1fr_auto] sm:grid-cols-[9rem_1fr_8rem] items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: statusSwatch(s.status, statuses) }} />
                  <span className="font-bebas text-xs tracking-widest text-sage truncate">{statusLabel(s.status)}</span>
                </span>
                <div className="h-4 bg-linen rounded-sm overflow-hidden col-span-2 sm:col-span-1 order-last sm:order-none">
                  <div className="h-4 rounded-sm" style={{ width: `${(s.value / max) * 100}%`, backgroundColor: NAVY, minWidth: s.value > 0 ? 3 : 0 }} />
                </div>
                <span className="font-dm text-xs text-ink text-right tabular-nums">
                  <span className="font-semibold">{currencyWhole(s.value)}</span> <span className="text-sage">· {s.count}</span>
                </span>
              </li>
            ))}
          </ul>
          <ul className="font-dm text-xs text-sage mt-4 space-y-0.5 list-disc pl-4">
            {p.byBasis.proposal > 0 && <li>{p.byBasis.proposal} valued at their latest proposal total.</li>}
            {p.byBasis.budget_range + p.byBasis.budget > 0 && <li>{p.byBasis.budget_range + p.byBasis.budget} valued at the middle of the budget range they picked ("$20k+" counts as $20k).</li>}
            {p.unvalued > 0 && <li>{p.unvalued} with no budget or proposal, so not in the total.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Lost reasons (only once leads.lostReason exists) ────────────────────────
export function LostReasonsCard({ data }: { data: ConversionData }) {
  const rows = data.lostReasons;
  if (!rows) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="dante-card p-5">
      <h2 className="font-cormorant text-xl font-semibold text-ink">Why enquiries were lost</h2>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">This period's enquiries marked lost or cancelled, by the reason recorded.</p>
      {total === 0 ? (
        <p className="font-dm text-sm text-sage py-4 text-center">None lost in this period.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map(r => (
            <li key={r.reason ?? "__none"} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3">
              <span className="font-dm text-sm text-ink truncate" title={r.reason ?? "No reason recorded"}>{r.reason ? fmtSource(r.reason) : "No reason recorded"}</span>
              <div className="h-4 bg-linen rounded-sm overflow-hidden">
                <div className="h-4 rounded-sm" style={{ width: `${(r.count / total) * 100}%`, backgroundColor: r.reason ? NAVY : GREY }} />
              </div>
              <span className="font-dm text-xs font-semibold text-ink text-right tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
