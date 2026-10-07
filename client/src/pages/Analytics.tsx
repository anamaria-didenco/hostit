import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, Target, DollarSign, Users, Calendar, BarChart2, Radio } from "lucide-react";
import { getLoginUrl } from "@/const";
import { currencyWhole } from "@/lib/money";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// One restrained palette for the whole page: navy (the brand), amber, and a few
// muted supporting hues. Used for the source breakdown, where categories must
// be told apart; every other chart is a single navy hue.
const SOURCE_COLORS_HEX = [
  "#2f5488", "#d4952b", "#3f8f8f", "#8a94a6", "#b5626a", "#6d5aa0", "#a9b4c8",
];

function StatCard({ icon, label, value, sub, color = "text-burgundy" }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white border border-border p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={color}>{icon}</div>
        <span className="font-bebas tracking-widest text-xs text-ink/70 min-w-0 break-words">{label}</span>
      </div>
      <div className={`font-cormorant text-3xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs font-dm text-ink/65 mt-1">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  // Which month the goal card is showing. Defaults to this month for the
  // current year and December for past years, and follows the year picker.
  const thisYear = new Date().getFullYear();
  const [goalMonthPick, setGoalMonthPick] = useState<number | null>(null);
  const goalMonth = goalMonthPick ?? (selectedYear === thisYear ? new Date().getMonth() : 11);

  const { data: revenueData } = trpc.analytics.revenueByMonth.useQuery({ year: selectedYear });
  const { data: pipelineData } = trpc.analytics.pipeline.useQuery({ year: selectedYear });
  const { data: goalsData, refetch: refetchGoal } = trpc.analytics.getGoals.useQuery({ year: selectedYear });
  const { data: topEventTypesData } = trpc.analytics.topEventTypes.useQuery({ year: selectedYear });
  const { data: sourceData } = trpc.analytics.sourceBreakdown.useQuery({ year: selectedYear });

  const analyticsData = {
    totalRevenue: revenueData?.reduce((s, r) => s + r.revenue, 0) ?? 0,
    totalBookings: revenueData?.reduce((s, r) => s + r.count, 0) ?? 0,
    totalLeads: pipelineData?.enquiries ?? 0,
    proposalsSent: pipelineData?.proposals ?? 0,
    // Of this year's enquiries, how many became an event (server counts them
    // as a cohort, so this is always 0–100%).
    confirmedFromLeads: pipelineData?.confirmed ?? 0,
    conversionRate: pipelineData?.enquiries
      ? Math.round(((pipelineData.confirmed ?? 0) / pipelineData.enquiries) * 100)
      : 0,
    monthlyRevenue: revenueData?.map(r => r.revenue) ?? [],
    byEventType: topEventTypesData ?? [],
  };
  const currentGoal = goalsData?.find((g: any) => g.month === goalMonth + 1);

  const setGoalMutation = trpc.analytics.setGoal.useMutation({
    onSuccess: async () => {
      toast.success("Goal updated");
      void refetchGoal();
      setEditingGoal(false);
    },
    onError: () => toast.error("Failed to update goal"),
  });

  const monthlyRevenue = useMemo(() => {
    return MONTHS.map((label, i) => ({
      label,
      value: analyticsData.monthlyRevenue[i] ?? 0,
    }));
  }, [analyticsData]);

  const maxRevenue = Math.max(
    ...monthlyRevenue.map(d => d.value),
    1
  );

  const currentMonth = goalMonth;
  const currentMonthRevenue = monthlyRevenue[currentMonth]?.value ?? 0;
  const goalAmount = currentGoal ? Number(currentGoal.targetRevenue) : 0;
  const goalProgress = goalAmount > 0 ? (currentMonthRevenue / goalAmount) * 100 : 0;

  // Source breakdown totals
  const totalSourceLeads = (sourceData ?? []).reduce((s: number, r: any) => s + r.count, 0);

  if (authLoading) return null;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="bg-[#2f5488] px-6 py-3 flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            aria-label="Back to dashboard"
            title="Back to dashboard"
            className="w-11 h-11 -ml-2 inline-flex items-center justify-center rounded-sm text-cream/60 hover:text-cream hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
          <h1 className="font-bebas tracking-widest text-white text-sm m-0">ANALYTICS</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedYear(y => y - 1)}
            aria-label="Previous year"
            className="text-cream/60 hover:text-cream font-bebas tracking-widest text-sm px-2"
          >
            <span aria-hidden>‹</span>
          </button>
          <span className="font-bebas tracking-widest text-cream text-sm">{selectedYear}</span>
          <button
            onClick={() => setSelectedYear(y => Math.min(y + 1, new Date().getFullYear()))}
            disabled={selectedYear >= new Date().getFullYear()}
            aria-label="Next year"
            className="text-cream/60 hover:text-cream font-bebas tracking-widest text-sm px-2 disabled:opacity-30"
          >
            <span aria-hidden>›</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-8 space-y-4 md:space-y-6">
        {/* KPI cards — every figure is for the selected year */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="REVENUE"
            value={currencyWhole(analyticsData.totalRevenue)}
            sub={`events held or booked for ${selectedYear}`}
          />
          <StatCard
            icon={<Calendar className="w-5 h-5" />}
            label="EVENTS"
            value={String(analyticsData.totalBookings)}
            sub={`in ${selectedYear}, not cancelled`}
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="ENQUIRIES"
            value={String(analyticsData.totalLeads)}
            sub={`received in ${selectedYear}`}
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="CONVERSION"
            value={`${analyticsData.conversionRate}%`}
            sub={`of ${selectedYear} enquiries became events`}
          />
        </div>

        {/* Monthly goal */}
        <div className="bg-white border border-border p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-burgundy" />
              <h2 className="font-bebas tracking-widest text-sm text-ink m-0">
                REVENUE GOAL
              </h2>
              <div className="flex items-center ml-1">
                <button type="button" aria-label="Previous month" onClick={() => { setGoalMonthPick((goalMonth + 11) % 12); setEditingGoal(false); }}
                  className="w-7 h-7 inline-flex items-center justify-center text-ink/60 hover:text-ink"><span aria-hidden>‹</span></button>
                <span className="font-bebas tracking-widest text-sm text-burgundy w-28 text-center whitespace-nowrap">{MONTHS[currentMonth].toUpperCase()} {selectedYear}</span>
                <button type="button" aria-label="Next month" onClick={() => { setGoalMonthPick((goalMonth + 1) % 12); setEditingGoal(false); }}
                  className="w-7 h-7 inline-flex items-center justify-center text-ink/60 hover:text-ink"><span aria-hidden>›</span></button>
              </div>
            </div>
            {!editingGoal ? (
              <button
                onClick={() => { setGoalInput(String(goalAmount)); setEditingGoal(true); }}
                className="font-bebas tracking-widest text-xs text-burgundy border border-[#2f5488]/40 hover:bg-[#2f5488]/5 px-3 min-h-[28px]"
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
                  className="w-32 rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8"
                />
                <Button
                  onClick={() => setGoalMutation.mutate({ year: selectedYear, month: goalMonth + 1, targetRevenue: Number(goalInput) })}
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
                <span className="text-ink/60">
                  {currencyWhole(currentMonthRevenue)} of {currencyWhole(goalAmount)}
                </span>
                <span className={`font-semibold ${goalProgress >= 100 ? "text-green-700" : "text-ink"}`}>
                  {Math.round(goalProgress)}%
                </span>
              </div>
              <div className="h-3 bg-cream border border-border overflow-hidden">
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
            <div className="text-sm font-dm text-ink/65">
              No goal set for {MONTHS[currentMonth]}. {currentMonthRevenue > 0 ? `${currencyWhole(currentMonthRevenue)} so far — ` : ""}set a target to see progress here.
            </div>
          )}
        </div>

        {/* Revenue chart */}
        <div className="bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-burgundy" />
              <h2 className="font-bebas tracking-widest text-sm text-ink m-0">MONTHLY REVENUE</h2>
            </div>
          </div>
          {/* Bars — each month's revenue for the selected year */}
          <div
            className="flex items-end gap-1 h-40"
            role="img"
            aria-label={`Monthly revenue for ${selectedYear}: ${MONTHS.map((m, i) => `${m} ${currencyWhole(monthlyRevenue[i]?.value ?? 0)}`).join(", ")}`}
          >
            {MONTHS.map((month, i) => {
              const curr = monthlyRevenue[i]?.value ?? 0;
              const barH = (v: number) => maxRevenue > 0 ? Math.max(2, (v / maxRevenue) * 100) : 2;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end" style={{ height: "100px" }}>
                    <div className="flex-1 bg-burgundy transition-all" style={{ height: `${barH(curr)}px` }} title={`${month}: ${currencyWhole(curr)}`} />
                  </div>
                  <div className="text-xs font-bebas tracking-widest text-ink/65">{month}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Two-column: Funnel + Source Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Lead funnel */}
          <div className="bg-white border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-burgundy" />
              <h2 className="font-bebas tracking-widest text-sm text-ink m-0">ENQUIRY FUNNEL</h2>
            </div>
            <div className="space-y-2">
              {[
                { label: "Enquiries received", value: analyticsData.totalLeads, color: "#9fb2d0", pct: analyticsData.totalLeads ? 100 : 0 },
                { label: "Proposals sent", value: analyticsData.proposalsSent, color: "#6584b3",
                  pct: analyticsData.totalLeads ? Math.round((analyticsData.proposalsSent / analyticsData.totalLeads) * 100) : 0 },
                { label: "Became events", value: analyticsData.confirmedFromLeads, color: "#2f5488",
                  pct: analyticsData.totalLeads ? Math.round((analyticsData.confirmedFromLeads / analyticsData.totalLeads) * 100) : 0 },
              ].map((row, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                  <div className="w-full sm:w-36 font-dm text-xs sm:text-sm text-ink/70 shrink-0 flex items-center justify-between sm:block">
                    <span>{row.label}</span>
                    <span className="sm:hidden font-dm text-xs text-ink/70">{row.value} · {row.pct}%</span>
                  </div>
                  <div className="flex-1 h-6 sm:h-7 bg-cream border border-border overflow-hidden">
                    <div className="h-full transition-all" style={{ width: `${row.pct}%`, background: row.color }} />
                  </div>
                  <div className="hidden sm:block w-10 text-right font-dm text-sm font-semibold text-ink">{row.value}</div>
                  <div className="hidden sm:block w-8 text-right font-dm text-xs text-ink/70">{row.pct}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Enquiry Source Breakdown */}
          <div className="bg-white border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Radio className="w-4 h-4 text-burgundy" />
              <h2 className="font-bebas tracking-widest text-sm text-ink m-0">WHERE ENQUIRIES CAME FROM</h2>
            </div>
            {(!sourceData || sourceData.length === 0) ? (
              <div className="text-sm font-dm text-ink/65 py-4 text-center">No enquiries received in {selectedYear}.</div>
            ) : (
              <div className="space-y-2">
                {/* Visual donut-style horizontal bars */}
                {(sourceData as Array<{ source: string; count: number }>).map((row, i) => {
                  const pct = totalSourceLeads > 0 ? Math.round((row.count / totalSourceLeads) * 100) : 0;
                  const colorHex = SOURCE_COLORS_HEX[i % SOURCE_COLORS_HEX.length];
                  const label = row.source
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" aria-hidden style={{ background: colorHex }} />
                      <div className="w-28 font-dm text-sm text-ink/70 shrink-0 truncate">{label}</div>
                      <div className="flex-1 h-6 bg-cream border border-border overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{ width: `${pct}%`, background: colorHex }}
                        />
                      </div>
                      <div className="w-8 text-right font-dm text-sm font-semibold text-ink">{row.count}</div>
                      <div className="w-8 text-right font-dm text-xs text-ink/70">{pct}%</div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-border/40 flex justify-between font-dm text-xs text-ink/70">
                  <span>Enquiries in {selectedYear}</span>
                  <span className="font-semibold text-ink">{totalSourceLeads}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Event type breakdown */}
        {analyticsData?.byEventType && analyticsData.byEventType.length > 0 && (
          <div className="bg-white border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4 text-burgundy" />
              <h2 className="font-bebas tracking-widest text-sm text-ink m-0">REVENUE BY EVENT TYPE · {selectedYear}</h2>
            </div>
            <div className="space-y-2">
              {analyticsData.byEventType.map((row: any, i: number) => {
                const maxEv = Math.max(...analyticsData.byEventType.map((r: any) => r.revenue), 1);
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-36 font-dm text-sm text-ink/70 capitalize shrink-0">{row.type}</div>
                    <div className="flex-1 h-6 bg-cream border border-border overflow-hidden">
                      <div
                        className="h-full bg-burgundy transition-all"
                        style={{ width: `${(row.revenue / maxEv) * 100}%` }}
                      />
                    </div>
                    <div className="w-24 text-right font-dm text-sm font-semibold text-ink">
                      {currencyWhole(Number(row.revenue))}
                    </div>
                    <div className="w-10 text-right font-dm text-xs text-ink/70">{row.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
