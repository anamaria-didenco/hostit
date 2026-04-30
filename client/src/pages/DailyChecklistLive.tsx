import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { CheckSquare, Square, Loader2, RefreshCw, CheckCircle2, Pencil, Plus, Trash2, X, Check, Wifi, WifiOff } from "lucide-react";

const LS_KEY = "vf_staff_name";

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
    { enabled: !!token, refetchInterval: 20000 }
  );

  const toggleMutation = trpc.dailyChecklists.toggleItemByToken.useMutation({
    onSuccess: () => refetch(),
  });

  const resetMutation = trpc.dailyChecklists.resetByToken.useMutation({
    onSuccess: () => refetch(),
  });

  const addItemMutation = trpc.dailyChecklists.addItemByToken.useMutation({
    onSuccess: () => { refetch(); setNewText(""); setNewNote(""); setShowAddForm(false); },
  });

  const deleteItemMutation = trpc.dailyChecklists.deleteItemByToken.useMutation({
    onSuccess: () => refetch(),
  });

  const editItemMutation = trpc.dailyChecklists.editItemByToken.useMutation({
    onSuccess: () => { refetch(); setEditingId(null); setEditText(""); setEditNote(""); },
  });

  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
    } catch {}
  }, []);

  useEffect(() => {
    acquireWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") acquireWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      wakeLockRef.current?.release?.().catch(() => {});
    };
  }, [acquireWakeLock]);

  const [staffName, setStaffName] = useState<string>(() => {
    try { return localStorage.getItem(LS_KEY) ?? ""; } catch { return ""; }
  });
  const [editingName, setEditingName] = useState(!staffName);
  const [nameInput, setNameInput] = useState(staffName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newNote, setNewNote] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => { setOptimistic({}); }, [checklist]);

  useEffect(() => {
    if (editingName && nameInputRef.current) nameInputRef.current.focus();
  }, [editingName]);

  useEffect(() => {
    if (showAddForm && addInputRef.current) {
      setTimeout(() => addInputRef.current?.focus(), 50);
    }
  }, [showAddForm]);

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      setTimeout(() => editInputRef.current?.focus(), 50);
    }
  }, [editingId]);

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    try { localStorage.setItem(LS_KEY, trimmed); } catch {}
    setStaffName(trimmed);
    setEditingName(false);
  }

  function handleToggle(itemId: number, currentChecked: boolean) {
    const newChecked = !currentChecked;
    setOptimistic(prev => ({ ...prev, [itemId]: newChecked }));
    toggleMutation.mutate({ token, itemId, checked: newChecked, checkedBy: newChecked ? (staffName || undefined) : undefined });
  }

  function handleReset() {
    if (!confirm("Reset all items to unchecked?")) return;
    setOptimistic({});
    resetMutation.mutate({ token });
  }

  function startEdit(item: { id: number; text: string; note?: string | null }) {
    setEditingId(item.id);
    setEditText(item.text);
    setEditNote(item.note ?? "");
    setConfirmDeleteId(null);
  }

  function saveEdit() {
    if (!editText.trim() || editingId === null) return;
    editItemMutation.mutate({ token, itemId: editingId, text: editText.trim(), note: editNote.trim() || undefined });
  }

  function handleAddItem() {
    if (!newText.trim()) return;
    addItemMutation.mutate({ token, text: newText.trim(), note: newNote.trim() || undefined });
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

  const assignedDateDisplay = checklist.assignedDate
    ? new Date(checklist.assignedDate + 'T00:00:00').toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const venueLogoUrl = (checklist as any).venueLogoUrl as string | null | undefined;
  const venueName = (checklist as any).venueName as string | null | undefined;

  return (
    <div className="min-h-screen bg-linen pb-32">
      {venueLogoUrl && (
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center justify-center">
          <img src={venueLogoUrl} alt={venueName ?? "Venue logo"} className="h-10 w-auto max-w-[160px] object-contain" />
        </div>
      )}

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
            <p className="font-dm text-[10px] text-ink/30 mt-1">{assignedDateDisplay}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              {isOnline
                ? <Wifi className="w-3.5 h-3.5 text-forest/50" />
                : <WifiOff className="w-3.5 h-3.5 text-red-400 animate-pulse" />
              }
              <div className="font-bebas tracking-widest text-lg text-forest leading-none">
                {checkedCount} / {total}
              </div>
            </div>
            <button
              onClick={handleReset}
              className="font-bebas tracking-widest text-[10px] text-ink/40 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> RESET
            </button>
          </div>
        </div>
        <div className="h-1 bg-stone-100">
          <div
            className="h-1 bg-forest transition-all duration-500"
            style={{ width: total > 0 ? `${(checkedCount / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

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
        {total === 0 && !showAddForm && (
          <p className="font-dm text-sm text-ink/40 text-center py-8">No items yet — tap + Add Item below to get started.</p>
        )}

        {items.map(item => {
          const isChecked = optimistic[item.id] !== undefined ? optimistic[item.id] : (item.checked === 1);
          const isEditing = editingId === item.id;
          const isConfirmDelete = confirmDeleteId === item.id;

          if (isEditing) {
            return (
              <div key={item.id} className="bg-white border-2 border-forest/30 rounded p-3 space-y-2">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                  className="w-full border border-stone-200 px-3 py-2 font-dm text-sm focus:outline-none focus:border-forest rounded"
                  placeholder="Item text"
                />
                <input
                  type="text"
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                  className="w-full border border-stone-200 px-3 py-2 font-dm text-xs text-ink/60 focus:outline-none focus:border-forest rounded"
                  placeholder="Note (optional)"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={!editText.trim() || editItemMutation.isPending}
                    className="flex items-center gap-1.5 bg-forest text-white font-bebas tracking-widest text-xs px-4 py-2 rounded disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> SAVE
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex items-center gap-1.5 border border-stone-200 text-stone-500 font-bebas tracking-widest text-xs px-4 py-2 rounded"
                  >
                    <X className="w-3.5 h-3.5" /> CANCEL
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              className={`group bg-white border rounded transition-all duration-150 ${
                isChecked ? "border-forest/20 bg-forest/5" : "border-stone-200"
              }`}
            >
              <div className="flex items-start gap-0">
                {/* Checkbox area */}
                <button
                  onClick={() => handleToggle(item.id, isChecked)}
                  disabled={toggleMutation.isPending}
                  className={`flex-1 text-left flex items-start gap-3 px-4 py-3.5 transition-colors ${
                    isChecked ? "active:bg-forest/10" : "hover:bg-stone-50 active:bg-stone-100"
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
                      <p className="font-dm text-xs text-ink/40 mt-0.5 leading-snug">{item.note}</p>
                    )}
                    {isChecked && item.checkedBy && (
                      <p className="font-dm text-[10px] text-forest/60 mt-1">
                        ✓ {item.checkedBy}
                        {item.checkedAt ? ` · ${new Date(item.checkedAt).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </p>
                    )}
                  </div>
                </button>

                {/* Action buttons */}
                <div className="flex flex-col border-l border-stone-100 flex-shrink-0">
                  <button
                    onClick={() => { setConfirmDeleteId(null); startEdit(item); }}
                    className="px-3 py-3 text-stone-300 hover:text-forest hover:bg-forest/5 active:bg-forest/10 transition-colors border-b border-stone-100"
                    title="Edit item"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {isConfirmDelete ? (
                    <button
                      onClick={() => { deleteItemMutation.mutate({ token, itemId: item.id }); setConfirmDeleteId(null); }}
                      disabled={deleteItemMutation.isPending}
                      className="px-3 py-3 text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-colors"
                      title="Confirm delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(item.id)}
                      className="px-3 py-3 text-stone-300 hover:text-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"
                      title="Delete item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Add item form */}
        {showAddForm ? (
          <div className="bg-white border-2 border-forest/30 rounded p-3 space-y-2">
            <input
              ref={addInputRef}
              type="text"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddItem(); if (e.key === "Escape") { setShowAddForm(false); setNewText(""); setNewNote(""); } }}
              className="w-full border border-stone-200 px-3 py-2 font-dm text-sm focus:outline-none focus:border-forest rounded"
              placeholder="Item text e.g. Wipe down bar tops"
            />
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddItem(); if (e.key === "Escape") { setShowAddForm(false); setNewText(""); setNewNote(""); } }}
              className="w-full border border-stone-200 px-3 py-2 font-dm text-xs text-ink/60 focus:outline-none focus:border-forest rounded"
              placeholder="Note (optional)"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddItem}
                disabled={!newText.trim() || addItemMutation.isPending}
                className="flex items-center gap-1.5 bg-forest text-white font-bebas tracking-widest text-xs px-4 py-2 rounded disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> {addItemMutation.isPending ? "ADDING..." : "ADD"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewText(""); setNewNote(""); }}
                className="flex items-center gap-1.5 border border-stone-200 text-stone-500 font-bebas tracking-widest text-xs px-4 py-2 rounded"
              >
                <X className="w-3.5 h-3.5" /> CANCEL
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setShowAddForm(true); setConfirmDeleteId(null); setEditingId(null); }}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-stone-200 py-3 rounded text-stone-400 hover:border-forest/30 hover:text-forest hover:bg-forest/5 active:bg-forest/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bebas tracking-widest text-sm">ADD ITEM</span>
          </button>
        )}
      </div>

      {/* Staff name footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-1">YOUR NAME (so we know who ticked what)</p>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); }}
                  placeholder="e.g. Sarah"
                  className="w-full border border-stone-300 px-3 py-2 font-dm text-sm focus:outline-none focus:border-forest"
                />
              </div>
              <button
                onClick={saveName}
                disabled={!nameInput.trim()}
                className="bg-forest text-white font-bebas tracking-widest text-sm px-5 py-2 hover:bg-forest/90 disabled:opacity-40 transition-colors self-end"
              >
                SAVE
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bebas tracking-widest text-[10px] text-ink/40">CHECKING IN AS</p>
                <p className="font-dm text-sm text-ink font-medium">{staffName || "Anonymous"}</p>
              </div>
              <button
                onClick={() => { setNameInput(staffName); setEditingName(true); }}
                className="flex items-center gap-1.5 font-bebas tracking-widest text-xs text-ink/40 hover:text-forest transition-colors"
              >
                <Pencil className="w-3 h-3" /> CHANGE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
