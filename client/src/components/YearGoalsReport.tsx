// The Goals tab of Reports: monthly revenue goals and the calendar year at a
// glance (enquiry funnel, sources, revenue by event type). This used to be the
// standalone /analytics page; /analytics now redirects here. Every figure is
// for the picked NZ calendar year, from the analytics.* procedures.
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TrendingUp, Target, DollarSign, Users, Calendar } from "lucide-react";
import { currencyWhole } from "@/lib/money";
import { fmtSource } from "@/components/ConversionReport";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same restrained source palette as the rest of Reports: navy, amber, teal,
// then muted supporting hues, so neighbouring sources stay distinguishable.
const SOURCE_COLORS_HEX = [
  "#2f5488", "#d4952b", "#3f8f8f", "#8a94a6", "#b5626a", "#6d5aa0", "#a9b4c8",
];

export default function YearGoalsReport() {
  const thisYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(thisYear);

  const { data: revenueData } = trpc.analytics.revenueByMonth.useQuery({ year: selectedYear });
  const { data: pipelineData } = trpc.analytics.pipeline.useQuery({ year: selectedYear });
  const { data: topEventTypesData } = trpc.analytics.topEventTypes.useQuery({ year: selectedYear });
  const { data: sourceData } = trpc.analytics.sourceBreakdown.useQuery({ year: selectedYear });

  const totalRevenue = revenueData?.reduce((s, r) => s + r.revenue, 0) ?? 0;
  const totalEvents = revenueData?.reduce((s, r) => s + r.count, 0) ?? 0;
  const enquiries = pipelineData?.enquiries ?? 0;
  // Of this year's enquiries, how many became an event (server counts them
  // as a cohort, so this is always 0–100%).
  const conversionRate = enquiries ? Math.round(((pipelineData?.confirmed ?? 0) / enquiries) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div role="group" aria-label="Report year" className="flex items-center border border-border bg-white">
          <button
            type="button"
            onClick={() => setSelectedYear(y => y - 1)}
            aria-label="Previous year"
            className="w-10 h-9 inline-flex items-center justify-center text-sage hover:text-ink"
          >
            <span aria-hidden>‹</span>
          </button>
          <span className="font-bebas tracking-widest text-sm text-ink px-2" aria-live="polite">{selectedYear}</span>
          <button
            type="button"
            onClick={() => setSelectedYear(y => Math.min(y + 1, thisYear))}
            disabled={selectedYear >= thisYear}
            aria-label="Next year"
            className="w-10 h-9 inline-flex items-center justify-center text-sage hover:text-ink disabled:opacity-30"
          >
            <span aria-hidden>›</span>
          </button>
        </div>
        <p className="font-dm text-xs text-sage">Calendar year {selectedYear} · NZ time</p>
      </div>

      {/* KPI cards — every figure is for the selected year */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Revenue", value: currencyWhole(totalRevenue), icon: <DollarSign className="w-5 h-5 text-gold-deep" />, sub: `events held or booked for ${selectedYear}` },
          { label: "Events", value: String(totalEvents), icon: <Calendar className="w-5 h-5 text-forest" />, sub: `in ${selectedYear}, not cancelled` },
          { label: "Enquiries", value: String(enquiries), icon: <Users className="w-5 h-5 text-burgundy" />, sub: `received in ${selectedYear}` },
          { label: "Conversion", value: `${conversionRate}%`, icon: <TrendingUp className="w-5 h-5 text-forest" />, sub: `of ${selectedYear} enquiries became events` },
        ].map(s => (
          <div key={s.label} className="dante-card p-5 min-w-0">
            <div className="mb-3">{s.icon}</div>
            <div className="font-cormorant text-3xl sm:text-4xl font-semibold text-ink mb-1 break-words">{s.value}</div>
            <div className="font-bebas text-xs tracking-widest text-sage">{s.label}</div>
            <div className="font-dm text-xs text-sage mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <RevenueGoalCard year={selectedYear} monthlyRevenue={revenueData?.map(r => r.revenue) ?? []} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <YearFunnelCard
          year={selectedYear}
          enquiries={enquiries}
          proposals={pipelineData?.proposals ?? 0}
          confirmed={pipelineData?.confirmed ?? 0}
        />
        <YearSourcesCard year={selectedYear} rows={(sourceData ?? []) as Array<{ source: string; count: number }>} />
      </div>

      <EventTypeRevenueCard year={selectedYear} rows={topEventTypesData ?? []} />
    </div>
  );
}

/** One month's revenue against its goal, with the goal editable in place. */
function RevenueGoalCard({ year, monthlyRevenue }: { year: number; monthlyRevenue: number[] }) {
  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  // Which month the goal card is showing. Defaults to this month for the
  // current year and December for past years, and follows the year picker.
  const [goalMonthPick, setGoalMonthPick] = useState<number | null>(null);
  const goalMonth = goalMonthPick ?? (year === new Date().getFullYear() ? new Date().getMonth() : 11);

  const { data: goalsData, refetch: refetchGoal } = trpc.analytics.getGoals.useQuery({ year });
  const currentGoal = goalsData?.find((g: any) => g.month === goalMonth + 1);
  const setGoalMutation = trpc.analytics.setGoal.useMutation({
    onSuccess: async () => {
      toast.success("Goal updated");
      void refetchGoal();
      setEditingGoal(false);
    },
    onError: () => toast.error("Failed to update goal"),
  });

  const monthRevenue = monthlyRevenue[goalMonth] ?? 0;
  const goalAmount = currentGoal ? Number(currentGoal.targetRevenue) : 0;
  const goalProgress = goalAmount > 0 ? (monthRevenue / goalAmount) * 100 : 0;

  return (
    <div className="dante-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Target className="w-4 h-4 text-burgundy" aria-hidden />
          <h2 className="font-cormorant text-xl font-semibold text-ink m-0">Revenue goal</h2>
          <div className="flex items-center">
            <button type="button" aria-label="Previous month" onClick={() => { setGoalMonthPick((goalMonth + 11) % 12); setEditingGoal(false); }}
              className="w-8 h-8 inline-flex items-center justify-center text-sage hover:text-ink"><span aria-hidden>‹</span></button>
            <span className="font-bebas tracking-widest text-sm text-burgundy w-24 text-center whitespace-nowrap">{MONTHS[goalMonth].toUpperCase()} {year}</span>
            <button type="button" aria-label="Next month" onClick={() => { setGoalMonthPick((goalMonth + 1) % 12); setEditingGoal(false); }}
              className="w-8 h-8 inline-flex items-center justify-center text-sage hover:text-ink"><span aria-hidden>›</span></button>
          </div>
        </div>
        {!editingGoal ? (
          <button
            onClick={() => { setGoalInput(String(goalAmount)); setEditingGoal(true); }}
            className="font-bebas tracking-widest text-xs text-burgundy border border-[#2f5488]/40 hover:bg-[#2f5488]/5 px-3 min-h-[32px]"
          >
            {goalAmount > 0 ? "EDIT GOAL" : "+ SET GOAL"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              aria-label="Monthly revenue goal (NZD)"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              placeholder="e.g. 20000"
              className="w-28 sm:w-32 rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8"
            />
            <Button
              onClick={() => setGoalMutation.mutate({ year, month: goalMonth + 1, targetRevenue: Number(goalInput) })}
              className="bg-burgundy text-cream rounded-none font-bebas tracking-widest text-xs h-8 px-3"
            >
              SAVE
            </Button>
            <Button
              onClick={() => setEditingGoal(false)}
              variant="outline"
              className="rounded-none font-bebas tracking-widest text-xs h-8 px-3 border-2"
            >
              CANCEL
            </Button>
          </div>
        )}
      </div>
      {goalAmount > 0 ? (
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-dm">
            <span className="text-sage">
              {currencyWhole(monthRevenue)} of {currencyWhole(goalAmount)}
            </span>
            <span className={`font-semibold ${goalProgress >= 100 ? "text-green-700" : "text-ink"}`}>
              {Math.round(goalProgress)}%
            </span>
          </div>
          <div className="h-3 bg-linen border border-border overflow-hidden">
            <div
              className={`h-full transition-all ${goalProgress >= 100 ? "bg-green-600" : "bg-burgundy"}`}
              style={{ width: `${Math.min(100, goalProgress)}%` }}
            />
          </div>
          {goalProgress >= 100 && (
            <div className="text-xs font-dm text-green-700 font-semibold">Goal achieved!</div>
          )}
        </div>
      ) : (
        <div className="text-sm font-dm text-sage">
          No goal set for {MONTHS[goalMonth]}. {monthRevenue > 0 ? `${currencyWhole(monthRevenue)} so far — ` : ""}set a target to see progress here.
        </div>
      )}
    </div>
  );
}

/** The year's enquiries as a cohort: received → proposal sent → became an event. */
function YearFunnelCard({ year, enquiries, proposals, confirmed }: {
  year: number; enquiries: number; proposals: number; confirmed: number;
}) {
  const pct = (n: number) => (enquiries ? Math.round((n / enquiries) * 100) : 0);
  return (
    <div className="dante-card p-5 min-w-0">
      <h2 className="font-cormorant text-xl font-semibold text-ink">Enquiry funnel</h2>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">What became of the enquiries received in {year}.</p>
      <div className="space-y-2">
        {[
          { label: "Enquiries received", value: enquiries, color: "#9fb2d0", pct: enquiries ? 100 : 0 },
          { label: "Proposals sent", value: proposals, color: "#6584b3", pct: pct(proposals) },
          { label: "Became events", value: confirmed, color: "#2f5488", pct: pct(confirmed) },
        ].map((row, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <div className="w-full sm:w-36 font-dm text-xs sm:text-sm text-sage shrink-0 flex items-center justify-between sm:block">
              <span>{row.label}</span>
              <span className="sm:hidden font-dm text-xs text-sage">{row.value} · {row.pct}%</span>
            </div>
            <div className="w-full sm:w-auto sm:flex-1 h-6 sm:h-7 bg-linen border border-border overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${row.pct}%`, background: row.color }} />
            </div>
            <div className="hidden sm:block w-10 text-right font-dm text-sm font-semibold text-ink">{row.value}</div>
            <div className="hidden sm:block w-8 text-right font-dm text-xs text-sage">{row.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function YearSourcesCard({ year, rows }: { year: number; rows: Array<{ source: string; count: number }> }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="dante-card p-5 min-w-0">
      <h2 className="font-cormorant text-xl font-semibold text-ink">Where enquiries came from</h2>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">Enquiries received in {year}, by source.</p>
      {rows.length === 0 ? (
        <div className="text-sm font-dm text-sage py-4 text-center">No enquiries received in {year}.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
            const colorHex = SOURCE_COLORS_HEX[i % SOURCE_COLORS_HEX.length];
            return (
              <div key={i} className="flex items-center gap-2 sm:gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" aria-hidden style={{ background: colorHex }} />
                <div className="w-24 sm:w-28 font-dm text-sm text-sage shrink-0 truncate">{fmtSource(row.source)}</div>
                <div className="flex-1 min-w-0 h-6 bg-linen border border-border overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, background: colorHex }} />
                </div>
                <div className="w-8 text-right font-dm text-sm font-semibold text-ink">{row.count}</div>
                <div className="w-8 text-right font-dm text-xs text-sage">{pct}%</div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-border/40 flex justify-between font-dm text-xs text-sage">
            <span>Enquiries in {year}</span>
            <span className="font-semibold text-ink">{total}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function EventTypeRevenueCard({ year, rows }: { year: number; rows: Array<{ type: string; count: number; revenue: number }> }) {
  if (rows.length === 0) return null;
  const maxRevenue = Math.max(...rows.map(r => r.revenue), 1);
  return (
    <div className="dante-card p-5">
      <h2 className="font-cormorant text-xl font-semibold text-ink">Revenue by event type</h2>
      <p className="font-dm text-xs text-sage mt-0.5 mb-4">Events in {year}, not cancelled: revenue, then how many.</p>
      <div className="space-y-2">
        {/* On a phone the label and figures sit above the bar so nothing is squeezed. */}
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
            <div className="w-full sm:w-36 font-dm text-xs sm:text-sm text-sage capitalize shrink-0 flex items-center justify-between sm:block">
              <span className="truncate">{row.type}</span>
              <span className="sm:hidden font-dm text-xs text-ink">{currencyWhole(Number(row.revenue))} · {row.count}</span>
            </div>
            <div className="w-full sm:w-auto sm:flex-1 h-6 bg-linen border border-border overflow-hidden">
              <div className="h-full bg-burgundy transition-all" style={{ width: `${(row.revenue / maxRevenue) * 100}%` }} />
            </div>
            <div className="hidden sm:block w-24 text-right font-dm text-sm font-semibold text-ink">{currencyWhole(Number(row.revenue))}</div>
            <div className="hidden sm:block w-10 text-right font-dm text-xs text-sage">{row.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
