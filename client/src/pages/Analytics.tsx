import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, Target, DollarSign, Users, Calendar, BarChart2, Radio } from "lucide-react";
import { getLoginUrl } from "@/const";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Colour palette for source breakdown
const SOURCE_COLORS = [
  "bg-burgundy", "bg-amber-500", "bg-blue-500", "bg-emerald-500",
  "bg-purple-500", "bg-rose-500", "bg-teal-500", "bg-orange-500",
];
const SOURCE_COLORS_HEX = [
  "#6b2737", "#f59e0b", "#3b82f6", "#10b981",
  "#8b5cf6", "#f43f5e", "#14b8a6", "#f97316",
];

function StatCard({ icon, label, value, sub, color = "text-burgundy" }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white border border-border p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={color}>{icon}</div>
        <span className="font-bebas tracking-widest text-xs text-ink/50">{label}</span>
      </div>
      <div className={`font-cormorant text-3xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-xs font-dm text-ink/40 mt-1">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);

  const { data: revenueData } = trpc.analytics.revenueByMonth.useQuery({ year: selectedYear });
  const { data: pipelineData } = trpc.analytics.pipeline.useQuery();
  const { data: goalsData, refetch: refetchGoal } = trpc.analytics.getGoals.useQuery({ year: selectedYear });
  const { data: topEventTypesData } = trpc.analytics.topEventTypes.useQuery();
  const { data: sourceData } = trpc.analytics.sourceBreakdown.useQuery();

  const analyticsData = {
    totalRevenue: revenueData?.reduce((s, r) => s + r.revenue, 0) ?? 0,
    totalBookings: revenueData?.reduce((s, r) => s + r.count, 0) ?? 0,
    totalLeads: pipelineData?.enquiries ?? 0,
    proposalsSent: pipelineData?.proposals ?? 0,
    conversionRate: pipelineData?.enquiries
      ? Math.round(((pipelineData.confirmed ?? 0) / pipelineData.enquiries) * 100)
      : 0,
    monthlyRevenue: revenueData?.map(r => r.revenue) ?? [],
    byEventType: topEventTypesData ?? [],
  };
  const currentGoal = goalsData?.find((g: any) => g.month === new Date().getMonth() + 1);

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

  const prevYearRevenue = useMemo(() => {
    return MONTHS.map((label) => ({ label, value: 0 }));
  }, []);

  const maxRevenue = Math.max(
    ...monthlyRevenue.map(d => d.value),
    ...prevYearRevenue.map(d => d.value),
    1
  );

  const currentMonth = new Date().getMonth();
  const currentMonthRevenue = monthlyRevenue[currentMonth]?.value ?? 0;
  const goalAmount = currentGoal ? Number(currentGoal.targetRevenue) : 0;
  const goalProgress = goalAmount > 0 ? Math.min(100, (currentMonthRevenue / goalAmount) * 100) : 0;

  // Source breakdown totals
  const totalSourceLeads = (sourceData ?? []).reduce((s: number, r: any) => s + r.count, 0);

  if (authLoading) return null;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="bg-ink border-b border-amber/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-cream/60 hover:text-cream transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bebas tracking-widest text-amber text-sm">ANALYTICS</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedYear(y => y - 1)}
            className="text-cream/60 hover:text-cream font-bebas tracking-widest text-sm px-2"
          >
            ‹
          </button>
          <span className="font-bebas tracking-widest text-cream text-sm">{selectedYear}</span>
          <button
            onClick={() => setSelectedYear(y => y + 1)}
            className="text-cream/60 hover:text-cream font-bebas tracking-widest text-sm px-2"
          >
            ›
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<DollarSign className="w-5 h-5" />}
            label="TOTAL REVENUE"
            value={`$${((analyticsData?.totalRevenue ?? 0) / 1000).toFixed(1)}k`}
            sub={`${selectedYear}`}
            color="text-burgundy"
          />
          <StatCard
            icon={<Calendar className="w-5 h-5" />}
            label="TOTAL BOOKINGS"
            value={String(analyticsData?.totalBookings ?? 0)}
            sub="confirmed"
            color="text-blue-700"
          />
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="NEW ENQUIRIES"
            value={String(analyticsData?.totalLeads ?? 0)}
            sub={`${selectedYear}`}
            color="text-amber-700"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="CONVERSION RATE"
            value={`${analyticsData?.conversionRate ?? 0}%`}
            sub="leads → bookings"
            color="text-green-700"
          />
        </div>

        {/* Monthly goal */}
        <div className="bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-burgundy" />
              <span className="font-bebas tracking-widest text-sm text-ink">
                {MONTHS[currentMonth].toUpperCase()} REVENUE GOAL
              </span>
            </div>
            {!editingGoal ? (
              <button
                onClick={() => { setGoalInput(String(goalAmount)); setEditingGoal(true); }}
                className="font-bebas tracking-widest text-xs text-burgundy hover:underline"
              >
                {goalAmount > 0 ? "EDIT GOAL" : "SET GOAL"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={goalInput}
                  onChange={e => setGoalInput(e.target.value)}
                  placeholder="e.g. 20000"
                  className="w-32 rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8"
                />
                <Button
                  onClick={() => setGoalMutation.mutate({ year: selectedYear, month: currentMonth + 1, targetRevenue: Number(goalInput) })}
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
                  ${currentMonthRevenue.toLocaleString("en-NZ")} of ${goalAmount.toLocaleString("en-NZ")}
                </span>
                <span className={`font-semibold ${goalProgress >= 100 ? "text-green-700" : "text-ink"}`}>
                  {Math.round(goalProgress)}%
                </span>
              </div>
              <div className="h-3 bg-cream border border-border overflow-hidden">
                <div
                  className={`h-full transition-all ${goalProgress >= 100 ? "bg-green-500" : "bg-burgundy"}`}
                  style={{ width: `${goalProgress}%` }}
                />
              </div>
              {goalProgress >= 100 && (
                <div className="text-xs font-dm text-green-700 font-semibold">Goal achieved!</div>
              )}
            </div>
          ) : (
            <div className="text-sm font-dm text-ink/40">No goal set for this month.</div>
          )}
        </div>

        {/* Revenue chart */}
        <div className="bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-burgundy" />
              <span className="font-bebas tracking-widest text-sm text-ink">MONTHLY REVENUE</span>
            </div>
            <div className="flex items-center gap-4 text-xs font-dm">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-burgundy" />
                <span className="text-ink/60">{selectedYear}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-ink/20" />
                <span className="text-ink/60">{selectedYear - 1}</span>
              </div>
            </div>
          </div>
          {/* Side-by-side bars */}
          <div className="flex items-end gap-1 h-40">
            {MONTHS.map((month, i) => {
              const curr = monthlyRevenue[i]?.value ?? 0;
              const prev = prevYearRevenue[i]?.value ?? 0;
              const barH = (v: number) => maxRevenue > 0 ? Math.max(2, (v / maxRevenue) * 100) : 2;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-0.5" style={{ height: "100px" }}>
                    <div className="flex-1 bg-burgundy/20 transition-all" style={{ height: `${barH(prev)}px` }} />
                    <div className="flex-1 bg-burgundy transition-all" style={{ height: `${barH(curr)}px` }} />
                  </div>
                  <div className="text-xs font-bebas tracking-widest text-ink/40">{month}</div>
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
              <Users className="w-4 h-4 text-amber-700" />
              <span className="font-bebas tracking-widest text-sm text-ink">LEAD CONVERSION FUNNEL</span>
            </div>
            <div className="space-y-2">
              {[
                { label: "Enquiries Received", value: analyticsData?.totalLeads ?? 0, color: "bg-amber-400", pct: 100 },
                { label: "Proposals Sent", value: analyticsData?.proposalsSent ?? 0, color: "bg-amber-500",
                  pct: analyticsData?.totalLeads ? Math.round((analyticsData.proposalsSent / analyticsData.totalLeads) * 100) : 0 },
                { label: "Bookings Confirmed", value: analyticsData?.totalBookings ?? 0, color: "bg-burgundy",
                  pct: analyticsData?.totalLeads ? Math.round((analyticsData.totalBookings / analyticsData.totalLeads) * 100) : 0 },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 font-dm text-sm text-ink/70 shrink-0">{row.label}</div>
                  <div className="flex-1 h-7 bg-cream border border-border overflow-hidden">
                    <div className={`h-full ${row.color} transition-all`} style={{ width: `${row.pct}%` }} />
                  </div>
                  <div className="w-10 text-right font-dm text-sm font-semibold text-ink">{row.value}</div>
                  <div className="w-8 text-right font-dm text-xs text-ink/50">{row.pct}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Enquiry Source Breakdown */}
          <div className="bg-white border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <Radio className="w-4 h-4 text-purple-700" />
              <span className="font-bebas tracking-widest text-sm text-ink">ENQUIRY SOURCE BREAKDOWN</span>
            </div>
            {(!sourceData || sourceData.length === 0) ? (
              <div className="text-sm font-dm text-ink/40 py-4 text-center">No source data yet. Sources are tracked when enquiries are submitted.</div>
            ) : (
              <div className="space-y-2">
                {/* Visual donut-style horizontal bars */}
                {(sourceData as Array<{ source: string; count: number }>).map((row, i) => {
                  const pct = totalSourceLeads > 0 ? Math.round((row.count / totalSourceLeads) * 100) : 0;
                  const colorClass = SOURCE_COLORS[i % SOURCE_COLORS.length];
                  const colorHex = SOURCE_COLORS_HEX[i % SOURCE_COLORS_HEX.length];
                  const label = row.source
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorHex }} />
                      <div className="w-28 font-dm text-sm text-ink/70 shrink-0 truncate">{label}</div>
                      <div className="flex-1 h-6 bg-cream border border-border overflow-hidden">
                        <div
                          className={`h-full ${colorClass} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-8 text-right font-dm text-sm font-semibold text-ink">{row.count}</div>
                      <div className="w-8 text-right font-dm text-xs text-ink/50">{pct}%</div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-border/40 flex justify-between font-dm text-xs text-ink/50">
                  <span>Total enquiries tracked</span>
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
              <Calendar className="w-4 h-4 text-blue-700" />
              <span className="font-bebas tracking-widest text-sm text-ink">REVENUE BY EVENT TYPE</span>
            </div>
            <div className="space-y-2">
              {analyticsData.byEventType.map((row: any, i: number) => {
                const maxEv = Math.max(...analyticsData.byEventType.map((r: any) => r.revenue), 1);
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-36 font-dm text-sm text-ink/70 capitalize shrink-0">{row.type}</div>
                    <div className="flex-1 h-6 bg-cream border border-border overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${(row.revenue / maxEv) * 100}%` }}
                      />
                    </div>
                    <div className="w-24 text-right font-dm text-sm font-semibold text-ink">
                      ${Number(row.revenue).toLocaleString("en-NZ")}
                    </div>
                    <div className="w-10 text-right font-dm text-xs text-ink/50">{row.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
