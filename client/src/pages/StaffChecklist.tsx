import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { CheckSquare, Square, Loader2, CheckCircle2 } from "lucide-react";

const CATEGORY_STYLES: Record<string, string> = {
  admin:   "bg-blue-100 text-blue-700",
  staff:   "bg-purple-100 text-purple-700",
  setup:   "bg-amber-100 text-amber-700",
  bar:     "bg-green-100 text-green-700",
  kitchen: "bg-red-100 text-red-700",
  guest:   "bg-pink-100 text-pink-700",
  other:   "bg-gray-100 text-gray-600",
};

export default function StaffChecklist() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data: instance, isLoading, refetch } = trpc.checklists.getByShareToken.useQuery(
    { token },
    { enabled: !!token, refetchInterval: 10000 }
  );

  const toggleMutation = trpc.checklists.toggleItemByToken.useMutation({
    onSuccess: () => refetch(),
  });

  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOptimistic({});
  }, [instance]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-forest animate-spin" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-bebas tracking-widest text-2xl text-ink/40">CHECKLIST NOT FOUND</p>
          <p className="font-dm text-sm text-ink/30 mt-2">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const items = (instance.items ?? []) as Array<{
    id: string; text: string; category?: string; checked: boolean; checkedAt?: string;
  }>;

  const effectiveItems = items.map(item => ({
    ...item,
    checked: optimistic[item.id] !== undefined ? optimistic[item.id] : item.checked,
  }));

  const checkedCount = effectiveItems.filter(i => i.checked).length;
  const total = effectiveItems.length;
  const allDone = total > 0 && checkedCount === total;

  function toggle(itemId: string, currentChecked: boolean) {
    setOptimistic(prev => ({ ...prev, [itemId]: !currentChecked }));
    toggleMutation.mutate({ token, itemId, checked: !currentChecked });
  }

  return (
    <div className="min-h-screen bg-linen">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-forest flex items-center justify-center">
              <span className="text-white font-bold text-xs">V</span>
            </div>
            <span className="font-bebas tracking-widest text-forest text-lg">VenueFlow</span>
          </div>
          <h1 className="font-bebas tracking-widest text-3xl text-ink mt-2">{instance.name}</h1>
          <p className="font-dm text-sm text-ink/50 mt-1">{checkedCount} of {total} complete</p>
        </div>

        <div className="h-1.5 bg-gold/20 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-forest transition-all duration-500 rounded-full"
            style={{ width: total > 0 ? `${(checkedCount / total) * 100}%` : "0%" }}
          />
        </div>

        {allDone && (
          <div className="mb-4 flex items-center gap-2 justify-center bg-forest/10 border border-forest/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-forest" />
            <span className="font-bebas tracking-widest text-forest text-sm">ALL TASKS COMPLETE</span>
          </div>
        )}

        <div className="bg-white border border-gold/30 shadow-sm rounded-xl overflow-hidden divide-y divide-gold/20">
          {effectiveItems.map(item => (
            <button
              key={item.id}
              onClick={() => toggle(item.id, item.checked)}
              disabled={toggleMutation.isPending}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-linen/60 transition-colors"
            >
              <span className={`flex-shrink-0 transition-colors ${item.checked ? "text-forest" : "text-ink/25"}`}>
                {item.checked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              </span>
              <span className={`flex-1 font-dm text-sm transition-colors ${item.checked ? "line-through text-ink/35" : "text-ink"}`}>
                {item.text}
              </span>
              {item.category && (
                <span className={`font-bebas tracking-widest text-[10px] px-2 py-0.5 flex-shrink-0 ${CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.other}`}>
                  {item.category}
                </span>
              )}
            </button>
          ))}
          {effectiveItems.length === 0 && (
            <div className="px-4 py-8 text-center font-dm text-sm text-ink/30">
              No checklist items yet.
            </div>
          )}
        </div>

        <p className="text-center font-dm text-xs text-ink/25 mt-6">
          Tap any item to mark it complete. Progress saves automatically.
        </p>
      </div>
    </div>
  );
}
