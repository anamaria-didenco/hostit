import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, DollarSign, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { getLoginUrl } from "@/const";

const PAYMENT_TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "partial", label: "Partial Payment" },
  { value: "final", label: "Final Payment" },
  { value: "refund", label: "Refund" },
  { value: "other", label: "Other" },
];

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "eftpos", label: "EFTPOS" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "other", label: "Other" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    unpaid: { label: "Unpaid", cls: "bg-red-100 text-red-700", icon: <AlertCircle className="w-3.5 h-3.5" /> },
    partial: { label: "Partial", cls: "bg-amber-100 text-amber-700", icon: <Clock className="w-3.5 h-3.5" /> },
    deposit_paid: { label: "Deposit Paid", cls: "bg-blue-100 text-blue-700", icon: <Clock className="w-3.5 h-3.5" /> },
    paid_in_full: { label: "Paid in Full", cls: "bg-green-100 text-green-700", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  };
  const s = map[status] ?? map.unpaid;
  return (
    <span className={`inline-flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-1 ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

export default function PaymentTracker() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get("bookingId") ? Number(params.get("bookingId")) : null;

  const [newPayment, setNewPayment] = useState({
    amount: "",
    type: "deposit",
    method: "bank_transfer",
    paidAt: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [adding, setAdding] = useState(false);

  const { data: payments, refetch } = trpc.payments.list.useQuery(
    { bookingId: bookingId! },
    { enabled: !!bookingId }
  );
  const { data: summary, refetch: refetchSummary } = trpc.payments.summary.useQuery(
    { bookingId: bookingId! },
    { enabled: !!bookingId }
  );

  const addMutation = trpc.payments.add.useMutation({
    onSuccess: async () => {
      toast.success("Payment recorded");
      await refetch();
      await refetchSummary();
      setNewPayment({ amount: "", type: "deposit", method: "bank_transfer", paidAt: new Date().toISOString().split("T")[0], notes: "" });
      setAdding(false);
    },
    onError: () => toast.error("Failed to record payment"),
  });

  const deleteMutation = trpc.payments.delete.useMutation({
    onSuccess: async () => {
      toast.success("Payment removed");
      await refetch();
      await refetchSummary();
    },
    onError: () => toast.error("Failed to remove payment"),
  });

  if (authLoading) return null;
  if (!user) { window.location.href = getLoginUrl(); return null; }
  if (!bookingId) return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="text-center">
        <p className="font-dm text-ink/60 mb-4">No booking selected.</p>
        <Button onClick={() => navigate("/")} className="bg-burgundy text-cream rounded-none font-bebas tracking-widest">
          Back to Dashboard
        </Button>
      </div>
    </div>
  );

  async function handleAdd() {
    if (!newPayment.amount || isNaN(Number(newPayment.amount))) {
      toast.error("Enter a valid amount");
      return;
    }
    await addMutation.mutateAsync({
      bookingId: bookingId!,
      amount: Number(newPayment.amount),
      type: newPayment.type as any,
      method: newPayment.method as any,
      paidAt: new Date(newPayment.paidAt).toISOString(),
      notes: newPayment.notes || undefined,
    });
  }

  const fmtNZD = (n: number) =>
    n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="bg-ink border-b border-amber/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-cream/60 hover:text-cream transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bebas tracking-widest text-amber text-sm">PAYMENT TRACKER</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Summary */}
        {summary && (
          <div className="bg-white border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bebas tracking-widest text-ink text-lg">PAYMENT SUMMARY</h2>
              <StatusBadge status={summary.status} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-cream">
                <div className="font-bebas tracking-widest text-xs text-ink/50 mb-1">TOTAL BOOKING VALUE</div>
                <div className="font-cormorant text-2xl font-semibold text-ink">{fmtNZD(summary.total ?? 0)}</div>
              </div>
              <div className="text-center p-4 bg-green-50">
                <div className="font-bebas tracking-widest text-xs text-green-700 mb-1">TOTAL PAID</div>
                <div className="font-cormorant text-2xl font-semibold text-green-700">{fmtNZD(summary.totalPaid)}</div>
              </div>
              <div className={`text-center p-4 ${summary.outstanding > 0 ? "bg-red-50" : "bg-green-50"}`}>
                <div className={`font-bebas tracking-widest text-xs mb-1 ${summary.outstanding > 0 ? "text-red-700" : "text-green-700"}`}>
                  OUTSTANDING
                </div>
                <div className={`font-cormorant text-2xl font-semibold ${summary.outstanding > 0 ? "text-red-700" : "text-green-700"}`}>
                  {fmtNZD(summary.outstanding)}
                </div>
              </div>
            </div>
{((summary.total ?? 0) > 0) && (
              <div className="mt-4">
                <div className="h-2 bg-cream border border-border rounded-none overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{ width: `${Math.min(100, (summary.totalPaid / (summary.total ?? 1)) * 100)}%` }}
                  />
                </div>
                <div className="text-xs font-dm text-ink/50 mt-1 text-right">
                  {Math.round((summary.totalPaid / (summary.total ?? 1)) * 100)}% paid
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add payment */}
        <div className="bg-white border border-border">
          <button
            onClick={() => setAdding(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-cream/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-burgundy" />
              <span className="font-bebas tracking-widest text-sm text-burgundy">RECORD PAYMENT</span>
            </div>
          </button>
          {adding && (
            <div className="border-t border-border p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">AMOUNT (NZD) *</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={newPayment.amount}
                    onChange={e => setNewPayment(p => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                </div>
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">DATE PAID *</label>
                  <Input
                    type="date"
                    value={newPayment.paidAt}
                    onChange={e => setNewPayment(p => ({ ...p, paidAt: e.target.value }))}
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                </div>
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">TYPE</label>
                  <select
                    value={newPayment.type}
                    onChange={e => setNewPayment(p => ({ ...p, type: e.target.value }))}
                    className="w-full border-2 border-border rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-burgundy bg-white"
                  >
                    {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">METHOD</label>
                  <select
                    value={newPayment.method}
                    onChange={e => setNewPayment(p => ({ ...p, method: e.target.value }))}
                    className="w-full border-2 border-border rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-burgundy bg-white"
                  >
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">NOTES</label>
                <Input
                  value={newPayment.notes}
                  onChange={e => setNewPayment(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Reference number, notes..."
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleAdd}
                  disabled={addMutation.isPending}
                  className="bg-burgundy hover:bg-burgundy/90 text-cream rounded-none font-bebas tracking-widest text-xs px-5 flex items-center gap-1.5"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  {addMutation.isPending ? "SAVING..." : "RECORD PAYMENT"}
                </Button>
                <Button
                  onClick={() => setAdding(false)}
                  variant="outline"
                  className="rounded-none font-bebas tracking-widest text-xs border-2"
                >
                  CANCEL
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Payment history */}
        <div className="bg-white border border-border">
          <div className="px-5 py-3 border-b border-border">
            <h3 className="font-bebas tracking-widest text-sm text-ink/70">PAYMENT HISTORY</h3>
          </div>
          {!payments || payments.length === 0 ? (
            <div className="text-center py-10 text-ink/30 font-dm text-sm">
              No payments recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${p.type === "refund" ? "bg-red-500" : "bg-green-500"}`} />
                    <div>
                      <div className="font-dm text-sm font-medium text-ink">
                        {p.type === "refund" ? "−" : "+"}{fmtNZD(Number(p.amount))}
                      </div>
                      <div className="text-xs text-ink/50 font-dm">
                        {PAYMENT_TYPES.find(t => t.value === p.type)?.label} ·{" "}
                        {PAYMENT_METHODS.find(m => m.value === p.method)?.label} ·{" "}
                        {new Date(p.paidAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                      {p.notes && <div className="text-xs text-ink/40 font-dm mt-0.5">{p.notes}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate({ id: p.id })}
                    className="text-ink/30 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
