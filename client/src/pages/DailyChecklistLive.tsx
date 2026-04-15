import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { CheckSquare, Square, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  opening:   { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400" },
  closing:   { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-400" },
  kitchen:   { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400" },
  bar:       { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-400" },
  setup:     { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-400" },
  general:   { bg: "bg-stone-50",  text: "text-stone-600",  dot: "bg-stone-400" },
  safety:    { bg: "bg-rose-50",   text: "text-rose-700",   dot: "bg-rose-400" },
  cleaning:  { bg: "bg-sky-50",    text: "text-sky-700",    dot: "bg-sky-400" },
};

function categoryStyle(cat?: string | null) {
  return CATEGORY_COLORS[cat ?? "general"] ?? CATEGORY_COLORS["general"];
}

export default function DailyChecklistLive() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data: checklist, isLoading, refetch } = trpc.dailyChecklists.getByToken.useQuery(
    { token },
    { enabled: !!token, refetchInterval: 15000 }
  );

  const toggleMutation = trpc.dailyChecklists.toggleItemByToken.useMutation({
    onSuccess: () => refetch(),
  });

  const resetMutation = trpc.dailyChecklists.resetByToken.useMutation({
    onSuccess: () => refetch(),
  });

  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});
  const [nameInput, setNameInput] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<number | null>(null);
  const [pendingChecked, setPendingChecked] = useState<boolean>(false);

  useEffect(() => {
    setOptimistic({});
  }, [checklist]);

  function handleToggle(itemId: number, currentChecked: boolean) {
    const newChecked = !currentChecked;
    if (newChecked) {
      setPendingItemId(itemId);
      setPendingChecked(true);
      setShowNamePrompt(true);
    } else {
      setOptimistic(prev => ({ ...prev, [itemId]: false }));
      toggleMutation.mutate({ token, itemId, checked: false });
    }
  }

  function confirmToggle() {
    if (pendingItemId === null) return;
    const name = nameInput.trim() || undefined;
    setOptimistic(prev => ({ ...prev, [pendingItemId]: true }));
    toggleMutation.mutate({ token, itemId: pendingItemId, checked: true, checkedBy: name });
    setShowNamePrompt(false);
    setNameInput("");
    setPendingItemId(null);
  }

  function handleReset() {
    if (!confirm("Reset all items to unchecked?")) return;
    setOptimistic({});
    resetMutation.mutate({ token });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-forest animate-spin" />
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-bebas tracking-widest text-2xl text-ink/40">CHECKLIST NOT FOUND</p>
          <p className="font-dm text-sm text-ink/30 mt-2">This link may be invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const items = checklist.items ?? [];
  const checkedCount = items.filter(it => {
    const opt = optimistic[it.id];
    return opt !== undefined ? opt : (it.checked === 1);
  }).length;
  const total = items.length;
  const allDone = checkedCount === total && total > 0;
  const style = categoryStyle(checklist.category);
  const today = new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-linen">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
              <span className={`font-bebas tracking-widest text-[10px] ${style.text} uppercase`}>
                {checklist.category?.toUpperCase() ?? "GENERAL"}
              </span>
            </div>
            <h1 className="font-bebas tracking-widest text-xl text-ink leading-none">{checklist.name}</h1>
            {checklist.description && (
              <p className="font-dm text-xs text-ink/50 mt-1 leading-tight">{checklist.description}</p>
            )}
            <p className="font-dm text-[10px] text-ink/30 mt-1">{today}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="font-bebas tracking-widest text-lg text-forest leading-none">
              {checkedCount} / {total}
            </div>
            <button
              onClick={handleReset}
              className="font-bebas tracking-widest text-[10px] text-ink/40 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> RESET
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-stone-100">
          <div
            className="h-1 bg-forest transition-all duration-500"
            style={{ width: total > 0 ? `${(checkedCount / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* All done banner */}
      {allDone && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-forest/10 border border-forest/20 px-4 py-3 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-forest flex-shrink-0" />
            <p className="font-bebas tracking-widest text-sm text-forest">ALL ITEMS COMPLETE — GREAT WORK!</p>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
        {total === 0 && (
          <p className="font-dm text-sm text-ink/40 text-center py-12">No items on this checklist yet.</p>
        )}
        {items.map(item => {
          const isChecked = optimistic[item.id] !== undefined ? optimistic[item.id] : (item.checked === 1);
          return (
            <button
              key={item.id}
              onClick={() => handleToggle(item.id, isChecked)}
              disabled={toggleMutation.isPending}
              className={`w-full text-left flex items-start gap-3 p-4 border transition-all duration-150 ${
                isChecked
                  ? "bg-forest/5 border-forest/20"
                  : "bg-white border-stone-200 hover:border-stone-300 active:bg-stone-50"
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {isChecked
                  ? <CheckSquare className="w-5 h-5 text-forest" />
                  : <Square className="w-5 h-5 text-stone-300" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-dm text-sm leading-snug ${isChecked ? "line-through text-ink/40" : "text-ink"}`}>
                  {item.text}
                </p>
                {item.note && (
                  <p className="font-dm text-xs text-ink/40 mt-1 leading-snug">{item.note}</p>
                )}
                {item.photoUrl && (
                  <img
                    src={item.photoUrl}
                    alt=""
                    className="mt-2 max-h-32 rounded border border-stone-200 object-cover"
                  />
                )}
                {isChecked && item.checkedBy && (
                  <p className="font-dm text-[10px] text-forest/60 mt-1">
                    ✓ {item.checkedBy}
                    {item.checkedAt ? ` · ${new Date(item.checkedAt).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Name prompt modal */}
      {showNamePrompt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center sm:items-center">
          <div className="bg-white w-full max-w-md p-6 shadow-xl">
            <h3 className="font-bebas tracking-widest text-lg text-ink mb-1">YOUR NAME (OPTIONAL)</h3>
            <p className="font-dm text-xs text-ink/50 mb-4">Add your name to record who checked this item.</p>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmToggle()}
              placeholder="e.g. Sarah"
              autoFocus
              className="w-full border border-stone-300 px-3 py-2 font-dm text-sm focus:outline-none focus:border-forest mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={confirmToggle}
                className="flex-1 bg-forest text-white font-bebas tracking-widest text-sm py-2.5 hover:bg-forest/90 transition-colors"
              >
                MARK COMPLETE
              </button>
              <button
                onClick={() => { setShowNamePrompt(false); setNameInput(""); setPendingItemId(null); }}
                className="px-4 border border-stone-200 font-bebas tracking-widest text-sm text-ink/60 hover:bg-stone-50 transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
