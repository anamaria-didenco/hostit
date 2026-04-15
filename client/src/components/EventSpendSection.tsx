import { useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const CATEGORIES = ["food", "drinks", "staffing", "av", "décor", "other"];

const CAT_COLOURS: Record<string, string> = {
  food: "bg-amber-100 text-amber-700",
  drinks: "bg-blue-100 text-blue-700",
  staffing: "bg-purple-100 text-purple-700",
  av: "bg-slate-100 text-slate-600",
  "décor": "bg-pink-100 text-pink-700",
  other: "bg-stone-100 text-stone-600",
};

interface Props {
  bookingId: number;
}

export default function EventSpendSection({ bookingId }: Props) {
  const utils = trpc.useUtils();

  const { data: items = [] } = trpc.budgets.list.useQuery(
    { bookingId },
    { enabled: !!bookingId }
  );

  const createItem = trpc.budgets.create.useMutation({
    onSuccess: () => {
      utils.budgets.list.invalidate({ bookingId });
      toast.success("Spend item added");
      setNewName("");
      setNewCat("other");
      setNewType("expense");
      setNewEst("");
      setNewActual("");
      setShowAdd(false);
    },
    onError: (err) => toast.error(err.message || "Failed to add spend item"),
  });
  const updateItem = trpc.budgets.update.useMutation({
    onSuccess: () => utils.budgets.list.invalidate({ bookingId }),
    onError: (err) => toast.error(err.message || "Failed to update item"),
  });
  const deleteItem = trpc.budgets.delete.useMutation({
    onSuccess: () => {
      utils.budgets.list.invalidate({ bookingId });
      toast.success("Item removed");
    },
    onError: (err) => toast.error(err.message || "Failed to delete item"),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("other");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [newEst, setNewEst] = useState("");
  const [newActual, setNewActual] = useState("");

  const [editingActual, setEditingActual] = useState<Record<number, string>>({});

  const totalEst = items.reduce((s, i) => {
    const v = i.estimatedAmount ?? 0;
    return i.type === "income" ? s + v : s - v;
  }, 0);

  const totalActual = items.reduce((s, i) => {
    const v = i.actualAmount ?? 0;
    return i.type === "income" ? s + v : s - v;
  }, 0);

  const variance = totalActual - totalEst;

  function handleAdd() {
    if (!newName.trim()) return;
    createItem.mutate({
      bookingId,
      name: newName.trim(),
      category: newCat,
      type: newType,
      estimatedAmount: Math.round(parseFloat(newEst) || 0),
      actualAmount: Math.round(parseFloat(newActual) || 0),
    });
  }

  function commitActual(id: number) {
    const raw = editingActual[id];
    if (raw === undefined) return;
    updateItem.mutate({ id, actualAmount: Math.round(parseFloat(raw) || 0) });
    setEditingActual((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bebas text-xs tracking-widest text-ink/40">EVENT SPEND</div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 font-bebas text-xs tracking-widest text-forest hover:text-forest-dark transition-colors"
        >
          <Plus className="w-3 h-3" /> ADD ITEM
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="border border-gold/30 bg-cream p-3 mb-3 space-y-2">
          <input
            className="w-full border border-gold/30 bg-white px-2 py-1.5 font-dm text-sm text-ink focus:outline-none focus:border-forest/50 placeholder:text-ink/30"
            placeholder="Item name (e.g. Bar tab, DJ, Canapés)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border border-gold/30 bg-white px-2 py-1.5 font-dm text-xs text-ink focus:outline-none focus:border-forest/50"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <select
              className="border border-gold/30 bg-white px-2 py-1.5 font-dm text-xs text-ink focus:outline-none focus:border-forest/50"
              value={newType}
              onChange={(e) => setNewType(e.target.value as "income" | "expense")}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">ESTIMATED ($)</div>
              <input
                type="number"
                min="0"
                className="w-full border border-gold/30 bg-white px-2 py-1.5 font-dm text-sm text-ink focus:outline-none focus:border-forest/50"
                placeholder="0.00"
                value={newEst}
                onChange={(e) => setNewEst(e.target.value)}
              />
            </div>
            <div>
              <div className="font-bebas text-xs tracking-widest text-ink/40 mb-0.5">ACTUAL ($)</div>
              <input
                type="number"
                min="0"
                className="w-full border border-gold/30 bg-white px-2 py-1.5 font-dm text-sm text-ink focus:outline-none focus:border-forest/50"
                placeholder="0.00"
                value={newActual}
                onChange={(e) => setNewActual(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || createItem.isPending}
              className="flex-1 bg-forest text-cream font-bebas tracking-widest text-xs py-1.5 hover:bg-forest-dark transition-colors disabled:opacity-50"
            >
              {createItem.isPending ? "SAVING…" : "SAVE ITEM"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 border border-gold/30 text-ink/50 font-bebas tracking-widest text-xs hover:bg-stone-50 transition-colors"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      {items.length === 0 && !showAdd && (
        <div className="border border-dashed border-gold/20 p-4 text-center">
          <div className="font-dm text-xs text-ink/40">No spend items yet. Add income and expenses to track event profitability.</div>
        </div>
      )}

      {items.length > 0 && (
        <div className="border border-gold/20 divide-y divide-gold/10">
          {items.map((item) => {
            const isEditing = editingActual[item.id] !== undefined;
            const actualDisplay = isEditing
              ? editingActual[item.id]
              : String(item.actualAmount ?? 0);

            return (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-cream/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-dm text-xs text-ink truncate">{item.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`font-bebas text-[10px] tracking-widest px-1.5 py-0.5 rounded-sm ${CAT_COLOURS[item.category] ?? CAT_COLOURS.other}`}>
                      {item.category}
                    </span>
                    <span className={`font-bebas text-[10px] tracking-widest ${item.type === "income" ? "text-forest" : "text-rose-500"}`}>
                      {item.type === "income" ? "INCOME" : "EXPENSE"}
                    </span>
                  </div>
                </div>
                <div className="text-right min-w-[56px]">
                  <div className="font-bebas text-[10px] tracking-widest text-ink/40">EST</div>
                  <div className="font-dm text-xs text-ink/60">${(item.estimatedAmount ?? 0).toLocaleString("en-NZ")}</div>
                </div>
                <div className="text-right min-w-[64px]">
                  <div className="font-bebas text-[10px] tracking-widest text-ink/40">ACTUAL</div>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      className="w-full border border-forest/40 bg-white px-1 py-0.5 font-dm text-xs text-ink focus:outline-none text-right"
                      value={actualDisplay}
                      onChange={(e) => setEditingActual((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      onBlur={() => commitActual(item.id)}
                      onKeyDown={(e) => e.key === "Enter" && commitActual(item.id)}
                      autoFocus
                    />
                  ) : (
                    <button
                      className="font-dm text-xs text-ink hover:text-forest transition-colors w-full text-right"
                      title="Click to edit actual amount"
                      onClick={() => setEditingActual((prev) => ({ ...prev, [item.id]: String(item.actualAmount ?? 0) }))}
                    >
                      ${(item.actualAmount ?? 0).toLocaleString("en-NZ")}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => deleteItem.mutate({ id: item.id })}
                  className="text-ink/20 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Totals summary */}
      {items.length > 0 && (
        <div className="bg-forest-dark/5 border border-gold/20 border-t-0 px-3 py-2 grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="font-bebas text-[10px] tracking-widest text-ink/40">EST NET</div>
            <div className={`font-cormorant text-base font-semibold ${totalEst >= 0 ? "text-forest" : "text-rose-500"}`}>
              {totalEst < 0 ? "-" : ""}${Math.abs(totalEst).toLocaleString("en-NZ")}
            </div>
          </div>
          <div className="text-center">
            <div className="font-bebas text-[10px] tracking-widest text-ink/40">ACTUAL NET</div>
            <div className={`font-cormorant text-base font-semibold ${totalActual >= 0 ? "text-forest" : "text-rose-500"}`}>
              {totalActual < 0 ? "-" : ""}${Math.abs(totalActual).toLocaleString("en-NZ")}
            </div>
          </div>
          <div className="text-center">
            <div className="font-bebas text-[10px] tracking-widest text-ink/40">VARIANCE</div>
            <div className={`font-cormorant text-base font-semibold flex items-center justify-center gap-0.5 ${
              variance > 0 ? "text-forest" : variance < 0 ? "text-rose-500" : "text-ink/50"
            }`}>
              {variance > 0 ? <TrendingUp className="w-3 h-3" /> : variance < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {variance < 0 ? "-" : "+"}${Math.abs(variance).toLocaleString("en-NZ")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
