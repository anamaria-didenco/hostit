/**
 * DailyChecklists — two tabs: Checklists + Shift Runsheets
 * Route: /daily-checklists
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, Copy, ChevronDown, ChevronRight, Camera, X, Edit2, Check, RotateCcw, CopyPlus, Save, Pencil, Settings, ArrowUp, ArrowDown, Image, Sparkles } from "lucide-react";

const CATEGORIES = [
  { value: "general", label: "General", color: "bg-gray-100 text-gray-700" },
  { value: "bar", label: "Bar Setup", color: "bg-blue-100 text-blue-700" },
  { value: "restaurant", label: "Restaurant Setup", color: "bg-amber-100 text-amber-700" },
  { value: "kitchen", label: "Kitchen", color: "bg-orange-100 text-orange-700" },
  { value: "opening", label: "Opening", color: "bg-green-100 text-green-700" },
  { value: "closing", label: "Closing", color: "bg-purple-100 text-purple-700" },
  { value: "cleaning", label: "Cleaning", color: "bg-cyan-100 text-cyan-700" },
];

function catInfo(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[0];
}

const DEFAULT_SECTIONS: { key: string; label: string }[] = [
  { key: "bar", label: "Bar" },
  { key: "barFloor", label: "Bar Floor" },
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "bigTable", label: "Big Table" },
];

function parseSections(raw: string | null | undefined): { key: string; label: string }[] {
  if (!raw) return DEFAULT_SECTIONS;
  try { const p = JSON.parse(raw); return Array.isArray(p) && p.length > 0 ? p : DEFAULT_SECTIONS; } catch { return DEFAULT_SECTIONS; }
}

function makeEmptyShift(sections: { key: string }[]): ShiftFormState {
  const sectionMap: Record<string, string> = {};
  sections.forEach(s => { sectionMap[s.key] = ""; });
  return {
    date: "", dutyManager: "", sections: sectionMap,
    specials: "", budget: "", specialNotes: "", marketFish: "", thingsToPush: "",
    linkedChecklistIds: [],
  };
}

type ShiftFormState = {
  date: string; dutyManager: string; sections: Record<string, string>;
  specials: string; budget: string; specialNotes: string; marketFish: string; thingsToPush: string;
  linkedChecklistIds: number[];
};

const EMPTY_SHIFT: ShiftFormState = makeEmptyShift(DEFAULT_SECTIONS);

export default function DailyChecklists() {
  const [activeTab, setActiveTab] = useState<"checklists" | "shifts">("checklists");

  // ─── Venue settings (logo + sections) ────────────────────────────────────
  const { data: venueSettings, refetch: refetchVenue } = trpc.venue.get.useQuery({});
  const updateVenueMut = trpc.venue.update.useMutation({ onSuccess: () => { refetchVenue(); toast.success("Settings saved!"); } });

  const effectiveSections = parseSections(venueSettings?.shiftSections);
  const [showSettings, setShowSettings] = useState(false);

  // ─── Checklists state ─────────────────────────────────────────────────────
  const { data: checklists, refetch } = trpc.dailyChecklists.list.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", category: "general", assignedDate: "" });
  const [newItemText, setNewItemText] = useState<Record<number, string>>({});
  const [newItemNote, setNewItemNote] = useState<Record<number, string>>({});
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [editItemText, setEditItemText] = useState("");
  const [editItemNote, setEditItemNote] = useState("");
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoItemId, setPendingPhotoItemId] = useState<number | null>(null);

  const { data: expandedChecklist, refetch: refetchExpanded } = trpc.dailyChecklists.get.useQuery(
    { id: expandedId! },
    { enabled: expandedId !== null }
  );
  const createMut = trpc.dailyChecklists.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); setCreateForm({ name: "", description: "", category: "general", assignedDate: "" }); toast.success("Checklist created!"); },
  });
  const deleteMut = trpc.dailyChecklists.delete.useMutation({
    onSuccess: () => { refetch(); if (expandedId !== null) setExpandedId(null); toast.success("Checklist deleted"); },
  });
  const addItemMut = trpc.dailyChecklists.addItem.useMutation({ onSuccess: () => refetchExpanded() });
  const updateItemMut = trpc.dailyChecklists.updateItem.useMutation({ onSuccess: () => { refetchExpanded(); setEditingItem(null); } });
  const deleteItemMut = trpc.dailyChecklists.deleteItem.useMutation({ onSuccess: () => refetchExpanded() });
  const duplicateMut = trpc.dailyChecklists.duplicate.useMutation({
    onSuccess: () => { refetch(); toast.success("Checklist duplicated!"); },
    onError: () => toast.error("Failed to duplicate checklist"),
  });

  // ─── AI Smart Paste (paste a to-do list, AI turns it into a new checklist) ──
  const [showAiPaste, setShowAiPaste] = useState(false);
  const [aiPasteText, setAiPasteText] = useState("");
  const [aiParsed, setAiParsed] = useState<{ name: string; category: string; items: { text: string; note?: string; _selected?: boolean }[] } | null>(null);
  const parseChecklistMut = trpc.menuCatalog.parseChecklistText.useMutation({
    onSuccess: (data) => {
      if (!data.success || data.items.length === 0) { toast.error("Couldn't extract any tasks. Try clearer text."); return; }
      setAiParsed({ name: data.name, category: data.category, items: data.items.map((it: { text: string; note?: string }) => ({ ...it, _selected: true })) });
    },
    onError: () => toast.error("AI parse failed"),
  });
  const createWithItemsMut = trpc.dailyChecklists.createWithItems.useMutation({
    onSuccess: () => { refetch(); setShowAiPaste(false); setAiPasteText(""); setAiParsed(null); toast.success("Checklist created from paste!"); },
    onError: () => toast.error("Failed to create checklist"),
  });
  function applyAiParsed() {
    if (!aiParsed) return;
    const selected = aiParsed.items.filter(it => it._selected !== false && it.text.trim());
    if (selected.length === 0) { toast.error("Select at least one item"); return; }
    createWithItemsMut.mutate({
      name: aiParsed.name.trim() || "Pasted Checklist",
      category: aiParsed.category,
      items: selected.map(it => ({ text: it.text.trim(), note: it.note?.trim() || undefined })),
    });
  }

  function getLiveLink(token: string) { return `${window.location.origin}/daily/${token}`; }
  function copyLink(token: string) { navigator.clipboard.writeText(getLiveLink(token)); toast.success("Link copied!"); }
  function handleAddItem(checklistId: number) {
    const text = (newItemText[checklistId] ?? "").trim();
    if (!text) return;
    addItemMut.mutate({ checklistId, text, note: newItemNote[checklistId]?.trim() || undefined, sortOrder: (expandedChecklist?.items?.length ?? 0) });
    setNewItemText(p => ({ ...p, [checklistId]: "" }));
    setNewItemNote(p => ({ ...p, [checklistId]: "" }));
  }
  function handlePhotoUpload(itemId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFor(itemId);
    const reader = new FileReader();
    reader.onload = ev => { updateItemMut.mutate({ id: itemId, photoUrl: ev.target?.result as string }); setUploadingFor(null); };
    reader.readAsDataURL(file);
  }

  // ─── Shift Runsheets state ────────────────────────────────────────────────
  const { data: shifts, refetch: refetchShifts } = trpc.shiftRunsheets.list.useQuery();
  const [showShiftCreate, setShowShiftCreate] = useState(false);
  const [shiftForm, setShiftForm] = useState<ShiftFormState>(EMPTY_SHIFT);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editShiftForm, setEditShiftForm] = useState<ShiftFormState>(EMPTY_SHIFT);

  const createShiftMut = trpc.shiftRunsheets.create.useMutation({
    onSuccess: () => { refetchShifts(); setShowShiftCreate(false); setShiftForm(makeEmptyShift(effectiveSections)); toast.success("Shift runsheet created!"); },
    onError: () => toast.error("Failed to create shift runsheet"),
  });
  const updateShiftMut = trpc.shiftRunsheets.update.useMutation({
    onSuccess: () => { refetchShifts(); setEditingShiftId(null); toast.success("Saved!"); },
    onError: () => toast.error("Failed to save"),
  });
  const deleteShiftMut = trpc.shiftRunsheets.delete.useMutation({
    onSuccess: () => { refetchShifts(); toast.success("Deleted"); },
    onError: () => toast.error("Failed to delete"),
  });

  function getShiftLink(token: string) { return `${window.location.origin}/shift/${token}`; }
  function copyShiftLink(token: string) { navigator.clipboard.writeText(getShiftLink(token)); toast.success("Link copied!"); }

  function shiftFormToInput(f: ShiftFormState) {
    const sections: Record<string, string> = {};
    Object.entries(f.sections).forEach(([k, v]) => { if (v) sections[k] = v; });
    return {
      date: f.date || undefined,
      dutyManager: f.dutyManager || undefined,
      sections: Object.keys(sections).length > 0 ? sections : undefined,
      specials: f.specials || undefined,
      budget: f.budget || undefined,
      specialNotes: f.specialNotes || undefined,
      marketFish: f.marketFish || undefined,
      thingsToPush: f.thingsToPush || undefined,
      linkedChecklistIds: f.linkedChecklistIds.length > 0 ? f.linkedChecklistIds : undefined,
    };
  }

  function startEditShift(sr: any) {
    const sec = (sr.sections ?? {}) as Record<string, string>;
    const sectionMap: Record<string, string> = {};
    effectiveSections.forEach(s => { sectionMap[s.key] = sec[s.key] ?? ""; });
    setEditShiftForm({
      date: sr.date ?? "",
      dutyManager: sr.dutyManager ?? "",
      sections: sectionMap,
      specials: sr.specials ?? "",
      budget: sr.budget ?? "",
      specialNotes: sr.specialNotes ?? "",
      marketFish: sr.marketFish ?? "",
      thingsToPush: sr.thingsToPush ?? "",
      linkedChecklistIds: (sr.linkedChecklistIds as number[] | null) ?? [],
    });
    setEditingShiftId(sr.id);
  }

  function shiftDateDisplay(date?: string | null) {
    if (!date) return "No date set";
    return new Date(date + 'T00:00:00').toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-[#f9f5ef]">
      {/* Header */}
      <div className="bg-[#6b98e7] text-white px-4 md:px-6 py-4 md:py-5">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <a href="/dashboard" className="text-white/60 text-xs font-dm hover:text-white transition-colors mb-1 block">← Back to Dashboard</a>
            <h1 className="font-bebas text-2xl md:text-3xl tracking-wider">Daily Operations</h1>
            <p className="font-dm text-xs md:text-sm text-white/70 mt-1">Checklists and shift runsheets for your team.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors text-white font-bebas tracking-wider text-sm px-3 py-2.5 rounded min-h-[44px]"
              title="Customise sections & logo"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            {activeTab === "checklists" && (
              <button
                onClick={() => { setShowAiPaste(true); setAiParsed(null); setAiPasteText(""); }}
                className="flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 active:bg-white/40 transition-colors text-white font-bebas tracking-wider text-sm px-3 md:px-4 py-2.5 rounded min-h-[44px]"
                title="Paste a to-do list and AI builds a checklist"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden md:inline">AI PASTE</span>
              </button>
            )}
            <button
              onClick={() => activeTab === "checklists" ? setShowCreate(true) : setShowShiftCreate(true)}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 active:bg-white/40 transition-colors text-white font-bebas tracking-wider text-sm px-4 md:px-5 py-2.5 rounded min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span className="md:hidden">{activeTab === "checklists" ? "NEW" : "NEW SHIFT"}</span>
              <span className="hidden md:inline">{activeTab === "checklists" ? "NEW CHECKLIST" : "NEW SHIFT RUNSHEET"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Settings panel ─────────────────────────────────────────────────── */}
      {showSettings && (
        <SettingsPanel
          venueSettings={venueSettings}
          onSave={(shiftSections) => updateVenueMut.mutate({ shiftSections })}
          saving={updateVenueMut.isPending}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-[#c9a84c]/20">
        <div className="max-w-4xl mx-auto px-4 md:px-6 flex gap-0">
          {[
            { key: "checklists", label: "CHECKLISTS" },
            { key: "shifts", label: "SHIFT RUNSHEETS" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`font-bebas tracking-widest text-xs md:text-sm px-3 md:px-5 py-3 border-b-2 transition-colors min-h-[44px] ${activeTab === t.key ? 'border-[#6b98e7] text-[#6b98e7]' : 'border-transparent text-[#8a7a60] hover:text-[#1a1209]'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">

        {/* ── CHECKLISTS TAB ─────────────────────────────────────────────── */}
        {activeTab === "checklists" && (
          <>
            {showCreate && (
              <div className="bg-white border border-[#c9a84c]/30 rounded mb-6 p-5 shadow-sm">
                <h2 className="font-bebas text-lg tracking-wider text-[#1a1209] mb-4">Create New Checklist</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="col-span-2">
                    <label className="font-bebas text-xs tracking-widest text-[#8a7a60] block mb-1">CHECKLIST NAME</label>
                    <input autoFocus value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && createMut.mutate(createForm)}
                      placeholder="e.g. Bar Opening Checklist"
                      className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]" />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-[#8a7a60] block mb-1">CATEGORY</label>
                    <select value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] bg-white">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-[#8a7a60] block mb-1">DATE (optional)</label>
                    <input type="date" value={createForm.assignedDate} onChange={e => setCreateForm(f => ({ ...f, assignedDate: e.target.value }))}
                      className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] bg-white" />
                  </div>
                  <div className="col-span-2">
                    <label className="font-bebas text-xs tracking-widest text-[#8a7a60] block mb-1">DESCRIPTION (optional)</label>
                    <input value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Brief description..."
                      className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => createMut.mutate(createForm)} disabled={!createForm.name || createMut.isPending}
                    className="font-bebas tracking-widest text-sm px-6 py-2 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6] disabled:opacity-50">CREATE</button>
                  <button onClick={() => setShowCreate(false)} className="font-bebas tracking-widest text-sm px-6 py-2 border border-[#c9a84c]/30 text-[#8a7a60] rounded hover:bg-[#f9f5ef]">CANCEL</button>
                </div>
              </div>
            )}
            {(checklists ?? []).length === 0 && !showCreate && (
              <div className="bg-white border border-[#c9a84c]/30 rounded p-12 text-center">
                <div className="text-4xl mb-3">✅</div>
                <h2 className="font-bebas text-2xl tracking-wider text-[#1a1209] mb-2">No Checklists Yet</h2>
                <p className="font-dm text-sm text-[#8a7a60] mb-6">Create your first checklist — bar setup, opening procedures, cleaning rounds.</p>
                <button onClick={() => setShowCreate(true)} className="font-bebas tracking-widest text-sm px-8 py-3 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6]">CREATE FIRST CHECKLIST</button>
              </div>
            )}
            <div className="space-y-3">
              {(checklists ?? []).map(cl => {
                const isExpanded = expandedId === cl.id;
                const cat = catInfo(cl.category ?? "general");
                const pct = cl.itemCount > 0 ? Math.round((cl.checkedCount / cl.itemCount) * 100) : 0;
                return (
                  <div key={cl.id} className="bg-white border border-[#c9a84c]/30 rounded overflow-hidden shadow-sm">
                    <div className="p-4 cursor-pointer hover:bg-[#f9f5ef]/50 transition-colors" onClick={() => setExpandedId(isExpanded ? null : cl.id)}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 rounded flex-shrink-0 ${cat.color}`}>{cat.label}</span>
                          <div className="min-w-0">
                            <div className="font-bebas text-lg tracking-wider text-[#1a1209] truncate">{cl.name}</div>
                            {cl.assignedDate && <div className="font-dm text-xs text-[#6b98e7] font-medium truncate">{new Date(cl.assignedDate + 'T00:00:00').toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>}
                            {cl.description && <div className="font-dm text-xs text-[#8a7a60] truncate">{cl.description}</div>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {cl.itemCount > 0 && (
                            <div className="text-right">
                              <div className="font-dm text-xs text-[#8a7a60]">{cl.checkedCount}/{cl.itemCount}</div>
                              <div className="w-16 h-1.5 bg-[#f9f5ef] rounded-full mt-1 overflow-hidden">
                                <div className="h-full bg-[#6b98e7] rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}
                          <button onClick={e => { e.stopPropagation(); copyLink(cl.token); }} className="p-1.5 text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded" title="Copy live link"><Copy className="w-3.5 h-3.5" /></button>
                          <a href={getLiveLink(cl.token)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded" title="Open live view"><ExternalLink className="w-3.5 h-3.5" /></a>
                          <button onClick={e => { e.stopPropagation(); duplicateMut.mutate({ id: cl.id }); }} disabled={duplicateMut.isPending} className="p-1.5 text-[#8a7a60] hover:bg-[#8a7a60]/10 rounded disabled:opacity-50" title="Duplicate"><CopyPlus className="w-3.5 h-3.5" /></button>
                          <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${cl.name}"?`)) deleteMut.mutate({ id: cl.id }); }} className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-[#8a7a60]" /> : <ChevronRight className="w-4 h-4 text-[#8a7a60]" />}
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-[#c9a84c]/20">
                        <div className="bg-[#6b98e7]/8 border-b border-[#6b98e7]/20 px-4 py-2 flex items-center justify-between gap-2">
                          <span className="font-dm text-xs text-[#6b98e7]">Live staff link:</span>
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-dm text-xs text-[#6b98e7] truncate">{getLiveLink(cl.token)}</span>
                            <button onClick={() => copyLink(cl.token)} className="flex-shrink-0 text-[#6b98e7] hover:text-[#5a87d6]"><Copy className="w-3 h-3" /></button>
                            <a href={getLiveLink(cl.token)} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-[#6b98e7] hover:text-[#5a87d6]"><ExternalLink className="w-3 h-3" /></a>
                          </div>
                        </div>
                        {(expandedChecklist?.items ?? []).length === 0 && <div className="px-5 py-4 text-center font-dm text-sm text-[#8a7a60]">No items yet — add your first task below.</div>}
                        {(expandedChecklist?.items ?? []).map(item => (
                          <div key={item.id} className="border-b border-[#c9a84c]/10 last:border-0">
                            {editingItem === item.id ? (
                              <div className="px-5 py-3 bg-[#f9f5ef]/60 space-y-2">
                                <input autoFocus value={editItemText} onChange={e => setEditItemText(e.target.value)} className="w-full border border-[#c9a84c]/30 rounded px-3 py-1.5 font-dm text-sm focus:outline-none focus:border-[#6b98e7]" />
                                <input value={editItemNote} onChange={e => setEditItemNote(e.target.value)} placeholder="Note (optional)" className="w-full border border-[#c9a84c]/30 rounded px-3 py-1.5 font-dm text-xs text-[#8a7a60] focus:outline-none focus:border-[#6b98e7]" />
                                <div className="flex gap-2">
                                  <button onClick={() => updateItemMut.mutate({ id: item.id, text: editItemText, note: editItemNote || undefined })} className="font-bebas tracking-widest text-xs px-4 py-1.5 bg-[#6b98e7] text-white rounded">SAVE</button>
                                  <button onClick={() => setEditingItem(null)} className="font-bebas tracking-widest text-xs px-4 py-1.5 border border-[#c9a84c]/30 text-[#8a7a60] rounded">CANCEL</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-3 px-5 py-3 group hover:bg-[#f9f5ef]/50 transition-colors">
                                <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${item.checked ? 'bg-[#6b98e7] border-[#6b98e7]' : 'border-[#c9a84c]/40'}`}>{item.checked ? <Check className="w-3 h-3 text-white" /> : null}</div>
                                <div className="flex-1 min-w-0">
                                  <div className={`font-dm text-sm ${item.checked ? 'line-through text-[#8a7a60]' : 'text-[#1a1209]'}`}>{item.text}</div>
                                  {item.note && <div className="font-dm text-xs text-[#8a7a60] mt-0.5">{item.note}</div>}
                                  {item.photoUrl && <div className="mt-2"><img src={item.photoUrl} alt="step" className="w-24 h-16 object-cover rounded border border-[#c9a84c]/20" /></div>}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                  <button onClick={() => { setPendingPhotoItemId(item.id); fileInputRef.current?.click(); }} className="p-1 text-[#8a7a60] hover:text-[#6b98e7] rounded" title={item.photoUrl ? "Replace photo" : "Add photo"}><Camera className="w-3.5 h-3.5" /></button>
                                  {item.photoUrl && <button onClick={() => updateItemMut.mutate({ id: item.id, photoUrl: "" })} className="p-1 text-[#8a7a60] hover:text-red-400 rounded" title="Remove photo"><X className="w-3 h-3" /></button>}
                                  <button onClick={() => { setEditingItem(item.id); setEditItemText(item.text); setEditItemNote(item.note ?? ""); }} className="p-1 text-[#8a7a60] hover:text-[#6b98e7] rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => { if (confirm('Delete this item?')) deleteItemMut.mutate({ id: item.id }); }} className="p-1 text-[#8a7a60] hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (pendingPhotoItemId !== null) handlePhotoUpload(pendingPhotoItemId, e); }} />
                        <div className="px-5 py-3 bg-[#f9f5ef]/40 border-t border-[#c9a84c]/10">
                          <div className="flex gap-2 mb-2">
                            <input value={newItemText[cl.id] ?? ""} onChange={e => setNewItemText(p => ({ ...p, [cl.id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAddItem(cl.id)} placeholder="Add a task..." className="flex-1 border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]" />
                            <button onClick={() => handleAddItem(cl.id)} disabled={!newItemText[cl.id]?.trim() || addItemMut.isPending} className="font-bebas tracking-widest text-xs px-4 py-2 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6] disabled:opacity-50">ADD</button>
                          </div>
                          <input value={newItemNote[cl.id] ?? ""} onChange={e => setNewItemNote(p => ({ ...p, [cl.id]: e.target.value }))} placeholder="Optional note for this task..." className="w-full border border-[#c9a84c]/20 rounded px-3 py-1.5 font-dm text-xs text-[#8a7a60] focus:outline-none focus:border-[#6b98e7]" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── SHIFT RUNSHEETS TAB ───────────────────────────────────────── */}
        {activeTab === "shifts" && (
          <>
            {/* Create form */}
            {showShiftCreate && (
              <ShiftForm
                form={shiftForm}
                setForm={setShiftForm}
                onSave={() => createShiftMut.mutate(shiftFormToInput(shiftForm))}
                onCancel={() => { setShowShiftCreate(false); setShiftForm(makeEmptyShift(effectiveSections)); }}
                saving={createShiftMut.isPending}
                title="New Shift Runsheet"
                availableChecklists={checklists ?? []}
                sections={effectiveSections}
              />
            )}

            {(shifts ?? []).length === 0 && !showShiftCreate && (
              <div className="bg-white border border-[#c9a84c]/30 rounded p-12 text-center">
                <div className="text-4xl mb-3">📋</div>
                <h2 className="font-bebas text-2xl tracking-wider text-[#1a1209] mb-2">No Shift Runsheets Yet</h2>
                <p className="font-dm text-sm text-[#8a7a60] mb-6">Create a daily briefing for your team — who's on where, specials, budget, VIP notes and more.</p>
                <button onClick={() => setShowShiftCreate(true)} className="font-bebas tracking-widest text-sm px-8 py-3 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6]">CREATE FIRST SHIFT RUNSHEET</button>
              </div>
            )}

            <div className="space-y-3">
              {(shifts ?? []).map(sr => {
                const isEditing = editingShiftId === sr.id;
                return (
                  <div key={sr.id} className="bg-white border border-[#c9a84c]/30 rounded overflow-hidden shadow-sm">
                    {isEditing ? (
                      <ShiftForm
                        form={editShiftForm}
                        setForm={setEditShiftForm}
                        onSave={() => updateShiftMut.mutate({ id: sr.id, ...shiftFormToInput(editShiftForm) })}
                        onCancel={() => setEditingShiftId(null)}
                        saving={updateShiftMut.isPending}
                        title="Edit Shift Runsheet"
                        inline
                        availableChecklists={checklists ?? []}
                        sections={effectiveSections}
                      />
                    ) : (
                      <ShiftCard
                        sr={sr}
                        shiftLink={getShiftLink(sr.token)}
                        onCopyLink={() => copyShiftLink(sr.token)}
                        onEdit={() => startEditShift(sr)}
                        onDelete={() => { if (confirm('Delete this shift runsheet?')) deleteShiftMut.mutate({ id: sr.id }); }}
                        availableChecklists={checklists ?? []}
                        sections={effectiveSections}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── AI SMART PASTE MODAL ─────────────────────────────────────────── */}
      {showAiPaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl rounded">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#c9a84c]/30 bg-[#6b98e7]">
              <div>
                <div className="font-bebas tracking-widest text-white text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5" /> AI SMART PASTE
                </div>
                <div className="font-dm text-white/70 text-xs mt-0.5">Paste a to-do list and AI turns it into a new checklist</div>
              </div>
              <button onClick={() => setShowAiPaste(false)} className="text-white/70 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!aiParsed ? (
                <div className="p-5 space-y-3">
                  <label className="font-bebas tracking-widest text-[10px] text-[#8a7a60] block">PASTE YOUR LIST</label>
                  <textarea
                    autoFocus
                    value={aiPasteText}
                    onChange={e => setAiPasteText(e.target.value)}
                    placeholder={"e.g.\n- Wipe down bar tops\n- Restock garnish trays\n- Polish wine glasses\n- Check ice machine\n- Set float to $200"}
                    rows={12}
                    className="w-full border border-[#c9a84c]/30 rounded font-dm text-sm focus:outline-none focus:border-[#6b98e7] p-3 resize-none"
                  />
                  <p className="font-dm text-xs text-[#8a7a60]">Bullet points, numbered lists, or just plain lines all work.</p>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">CHECKLIST NAME</label>
                      <input
                        value={aiParsed.name}
                        onChange={e => setAiParsed(p => p ? { ...p, name: e.target.value } : p)}
                        className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]"
                      />
                    </div>
                    <div>
                      <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">CATEGORY</label>
                      <select
                        value={aiParsed.category}
                        onChange={e => setAiParsed(p => p ? { ...p, category: e.target.value } : p)}
                        className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] bg-white"
                      >
                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="font-bebas tracking-widest text-xs text-[#1a1209]">
                      {aiParsed.items.filter(i => i._selected !== false).length} of {aiParsed.items.length} TASKS SELECTED
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAiParsed(p => p ? { ...p, items: p.items.map(i => ({ ...i, _selected: true })) } : p)}
                        className="font-bebas tracking-widest text-[10px] text-[#6b98e7] hover:underline">SELECT ALL</button>
                      <button
                        onClick={() => setAiParsed(p => p ? { ...p, items: p.items.map(i => ({ ...i, _selected: false })) } : p)}
                        className="font-bebas tracking-widest text-[10px] text-[#8a7a60] hover:underline">NONE</button>
                    </div>
                  </div>

                  <div className="border border-[#c9a84c]/30 rounded divide-y divide-[#c9a84c]/15 max-h-[40vh] overflow-y-auto">
                    {aiParsed.items.map((it, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 hover:bg-[#f9f5ef]/50">
                        <input
                          type="checkbox"
                          checked={it._selected !== false}
                          onChange={e => setAiParsed(p => p ? { ...p, items: p.items.map((x, i) => i === idx ? { ...x, _selected: e.target.checked } : x) } : p)}
                          className="mt-1.5 w-4 h-4 accent-[#6b98e7] flex-shrink-0"
                        />
                        <div className="flex-1 space-y-1">
                          <input
                            value={it.text}
                            onChange={e => setAiParsed(p => p ? { ...p, items: p.items.map((x, i) => i === idx ? { ...x, text: e.target.value } : x) } : p)}
                            className="w-full font-dm text-sm border-0 border-b border-transparent hover:border-[#c9a84c]/30 focus:border-[#6b98e7] focus:outline-none bg-transparent py-0.5"
                          />
                          <input
                            value={it.note ?? ""}
                            onChange={e => setAiParsed(p => p ? { ...p, items: p.items.map((x, i) => i === idx ? { ...x, note: e.target.value } : x) } : p)}
                            placeholder="Note (optional)"
                            className="w-full font-dm text-xs text-[#8a7a60] border-0 border-b border-transparent hover:border-[#c9a84c]/30 focus:border-[#6b98e7] focus:outline-none bg-transparent py-0.5"
                          />
                        </div>
                        <button
                          onClick={() => setAiParsed(p => p ? { ...p, items: p.items.filter((_, i) => i !== idx) } : p)}
                          className="text-[#8a7a60] hover:text-red-500 flex-shrink-0"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => { setAiParsed(null); }}
                    className="font-bebas tracking-widest text-[10px] text-[#8a7a60] hover:text-[#1a1209]"
                  >
                    ← PASTE DIFFERENT TEXT
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-[#c9a84c]/30 bg-[#f9f5ef]">
              <button
                onClick={() => setShowAiPaste(false)}
                className="font-bebas tracking-widest text-sm text-[#8a7a60] hover:text-[#1a1209]"
              >CANCEL</button>
              {!aiParsed ? (
                <button
                  onClick={() => parseChecklistMut.mutate({ text: aiPasteText.trim() })}
                  disabled={!aiPasteText.trim() || parseChecklistMut.isPending}
                  className="font-bebas tracking-widest text-sm bg-[#6b98e7] hover:bg-[#5a87d6] disabled:opacity-40 text-white rounded px-6 py-2 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {parseChecklistMut.isPending ? "PARSING..." : "PARSE WITH AI"}
                </button>
              ) : (
                <button
                  onClick={applyAiParsed}
                  disabled={createWithItemsMut.isPending || aiParsed.items.filter(i => i._selected !== false).length === 0}
                  className="font-bebas tracking-widest text-sm bg-[#c9a84c] hover:bg-[#b8973b] disabled:opacity-40 text-white rounded px-6 py-2 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  {createWithItemsMut.isPending ? "CREATING..." : `CREATE CHECKLIST`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shift Form ─────────────────────────────────────────────────────────── */
function ShiftForm({
  form, setForm, onSave, onCancel, saving, title, inline, availableChecklists, sections,
}: {
  form: ShiftFormState;
  setForm: React.Dispatch<React.SetStateAction<ShiftFormState>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
  inline?: boolean;
  availableChecklists?: { id: number; name: string; category?: string | null }[];
  sections?: { key: string; label: string }[];
}) {
  const effectiveSections = sections ?? DEFAULT_SECTIONS;
  const base = inline ? "p-5" : "bg-white border border-[#c9a84c]/30 rounded mb-6 p-5 shadow-sm";
  return (
    <div className={base}>
      <h2 className="font-bebas text-lg tracking-wider text-[#1a1209] mb-4">{title}</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">DATE</label>
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] bg-white" />
        </div>
        <div>
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">DUTY MANAGER / MANAGER HOST</label>
          <input value={form.dutyManager} onChange={e => setForm(f => ({ ...f, dutyManager: e.target.value }))}
            placeholder="e.g. James"
            className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]" />
        </div>
      </div>

      {/* Sections */}
      {effectiveSections.length > 0 && (
        <div className="mb-4">
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-2">SECTIONS — WHO IS ON WHERE</label>
          <div className="border border-[#c9a84c]/30 rounded overflow-hidden">
            {effectiveSections.map((s, i) => (
              <div key={s.key} className={`flex items-center gap-0 ${i < effectiveSections.length - 1 ? 'border-b border-[#c9a84c]/20' : ''}`}>
                <span className="font-bebas tracking-widest text-xs text-[#8a7a60] w-28 flex-shrink-0 px-3 py-2 bg-[#f9f5ef]">{s.label}</span>
                <input
                  value={form.sections[s.key] ?? ""}
                  onChange={e => setForm(f => ({ ...f, sections: { ...f.sections, [s.key]: e.target.value } }))}
                  placeholder={`Staff on ${s.label.toLowerCase()}...`}
                  className="flex-1 px-3 py-2 font-dm text-sm focus:outline-none focus:bg-[#f9f5ef]/50 border-l border-[#c9a84c]/20 bg-white"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">SPECIALS</label>
          <textarea value={form.specials} onChange={e => setForm(f => ({ ...f, specials: e.target.value }))}
            placeholder="Today's food specials..."
            className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] resize-none" rows={3} />
        </div>
        <div>
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">BUDGET</label>
          <textarea value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
            placeholder="e.g. Tonight's target $8,500. Bar spend average $45pp."
            className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] resize-none" rows={3} />
        </div>
        <div>
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">SPECIAL NOTES / VIP</label>
          <textarea value={form.specialNotes} onChange={e => setForm(f => ({ ...f, specialNotes: e.target.value }))}
            placeholder="e.g. Table 4 is the Henderson party — VIP. Allergies: nut allergy on table 7."
            className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] resize-none" rows={3} />
        </div>
        <div>
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">MARKET FISH</label>
          <textarea value={form.marketFish} onChange={e => setForm(f => ({ ...f, marketFish: e.target.value }))}
            placeholder="e.g. Tonight: Groper, Snapper, Kingfish. Cooking method: pan-fried. Price: $38."
            className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] resize-none" rows={3} />
        </div>
        <div className="col-span-2">
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-1">THINGS TO PUSH / OUT OF STOCK / LIMITED QUANTITIES</label>
          <textarea value={form.thingsToPush} onChange={e => setForm(f => ({ ...f, thingsToPush: e.target.value }))}
            placeholder="e.g. Push the Pinot Gris — 3 bottles left. Ribeye limited to 8 covers. Oysters sold out."
            className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] resize-none" rows={3} />
        </div>
      </div>

      {/* Attach checklists */}
      {availableChecklists && availableChecklists.length > 0 && (
        <div className="mb-4">
          <label className="font-bebas text-[10px] tracking-widest text-[#8a7a60] block mb-2">ATTACH CHECKLISTS</label>
          <div className="flex flex-wrap gap-2">
            {availableChecklists.map(cl => {
              const selected = form.linkedChecklistIds.includes(cl.id);
              return (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    linkedChecklistIds: selected
                      ? f.linkedChecklistIds.filter(id => id !== cl.id)
                      : [...f.linkedChecklistIds, cl.id],
                  }))}
                  className={`flex items-center gap-1.5 font-dm text-xs px-3 py-1.5 rounded border transition-colors ${
                    selected
                      ? 'bg-[#6b98e7] border-[#6b98e7] text-white'
                      : 'bg-white border-[#c9a84c]/30 text-[#8a7a60] hover:border-[#6b98e7] hover:text-[#6b98e7]'
                  }`}
                >
                  {selected && <Check className="w-3 h-3" />}
                  {cl.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving}
          className="font-bebas tracking-widest text-sm px-6 py-2 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6] disabled:opacity-50 flex items-center gap-2">
          <Save className="w-3.5 h-3.5" /> {saving ? "SAVING..." : "SAVE"}
        </button>
        <button onClick={onCancel} className="font-bebas tracking-widest text-sm px-6 py-2 border border-[#c9a84c]/30 text-[#8a7a60] rounded hover:bg-[#f9f5ef]">CANCEL</button>
      </div>
    </div>
  );
}

/* ── Shift Card ─────────────────────────────────────────────────────────── */
function ShiftCard({ sr, shiftLink, onCopyLink, onEdit, onDelete, availableChecklists, sections: sectionDefs }: {
  sr: any;
  shiftLink: string;
  onCopyLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
  availableChecklists?: { id: number; name: string }[];
  sections?: { key: string; label: string }[];
}) {
  const effectiveSections = sectionDefs ?? DEFAULT_SECTIONS;
  const sections = (sr.sections ?? {}) as Record<string, string>;
  const hasSections = effectiveSections.some(s => sections[s.key]);

  return (
    <div>
      {/* Card header */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bebas text-lg tracking-wider text-[#1a1209]">
            {sr.date ? new Date(sr.date + 'T00:00:00').toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "No date set"}
          </div>
          {sr.dutyManager && <div className="font-dm text-xs text-[#8a7a60] mt-0.5">Manager: <span className="text-[#1a1209]">{sr.dutyManager}</span></div>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onCopyLink} className="p-1.5 text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded" title="Copy staff link"><Copy className="w-3.5 h-3.5" /></button>
          <a href={shiftLink} target="_blank" rel="noopener noreferrer" className="p-1.5 text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded" title="Open staff view"><ExternalLink className="w-3.5 h-3.5" /></a>
          <button onClick={onEdit} className="p-1.5 text-[#8a7a60] hover:bg-[#8a7a60]/10 rounded" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Preview of content */}
      <div className="border-t border-[#c9a84c]/10 px-4 pb-4 pt-3 grid grid-cols-2 gap-x-6 gap-y-2">
        {hasSections && (
          <div className="col-span-2 mb-1">
            <div className="font-bebas text-[10px] tracking-widest text-[#8a7a60] mb-1.5">SECTIONS</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {effectiveSections.filter(s => sections[s.key]).map(s => (
                <div key={s.key} className="font-dm text-xs text-[#1a1209]">
                  <span className="text-[#6b98e7] font-medium">{s.label}:</span> {sections[s.key]}
                </div>
              ))}
            </div>
          </div>
        )}
        {sr.specials && <PreviewField label="SPECIALS" value={sr.specials} />}
        {sr.budget && <PreviewField label="BUDGET" value={sr.budget} />}
        {sr.specialNotes && <PreviewField label="SPECIAL NOTES / VIP" value={sr.specialNotes} />}
        {sr.marketFish && <PreviewField label="MARKET FISH" value={sr.marketFish} />}
        {sr.thingsToPush && <div className="col-span-2"><PreviewField label="THINGS TO PUSH / OUT OF STOCK" value={sr.thingsToPush} /></div>}
        {(() => {
          const ids = (sr.linkedChecklistIds as number[] | null) ?? [];
          if (!ids.length || !availableChecklists?.length) return null;
          const names = ids.map(id => availableChecklists?.find(c => c.id === id)?.name).filter(Boolean);
          if (!names.length) return null;
          return (
            <div className="col-span-2 pt-1">
              <div className="font-bebas text-[10px] tracking-widest text-[#8a7a60] mb-1.5">ATTACHED CHECKLISTS</div>
              <div className="flex flex-wrap gap-1.5">
                {names.map((name, i) => (
                  <span key={i} className="font-dm text-[11px] bg-[#6b98e7]/10 text-[#6b98e7] border border-[#6b98e7]/20 px-2 py-0.5 rounded">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Staff link banner */}
      <div className="border-t border-[#c9a84c]/10 bg-[#6b98e7]/5 px-4 py-2 flex items-center justify-between gap-2">
        <span className="font-dm text-xs text-[#6b98e7]">Staff link:</span>
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-dm text-xs text-[#6b98e7] truncate">{shiftLink}</span>
          <button onClick={onCopyLink} className="flex-shrink-0 text-[#6b98e7] hover:text-[#5a87d6]"><Copy className="w-3 h-3" /></button>
          <a href={shiftLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-[#6b98e7] hover:text-[#5a87d6]"><ExternalLink className="w-3 h-3" /></a>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-bebas text-[10px] tracking-widest text-[#8a7a60] mb-0.5">{label}</div>
      <div className="font-dm text-xs text-[#1a1209] line-clamp-2 leading-relaxed">{value}</div>
    </div>
  );
}

/* ── Settings Panel ──────────────────────────────────────────────────────── */
function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `section_${Date.now()}`;
}

function SettingsPanel({
  venueSettings, onSave, saving, onClose,
}: {
  venueSettings: any;
  onSave: (shiftSections: string) => void;
  saving: boolean;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<{ key: string; label: string }[]>(() =>
    parseSections(venueSettings?.shiftSections)
  );
  const [newLabel, setNewLabel] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  useEffect(() => { setSections(parseSections(venueSettings?.shiftSections)); }, [venueSettings?.shiftSections]);

  function moveUp(i: number) { if (i === 0) return; setSections(s => { const a = [...s]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; }); }
  function moveDown(i: number) { if (i === sections.length - 1) return; setSections(s => { const a = [...s]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; }); }
  function deleteSection(i: number) { setSections(s => s.filter((_, j) => j !== i)); }
  function addSection() {
    const label = newLabel.trim();
    if (!label) return;
    const key = slugify(label);
    setSections(s => [...s, { key: sections.some(x => x.key === key) ? `${key}_${Date.now()}` : key, label }]);
    setNewLabel("");
  }
  function saveEdit(i: number) {
    const label = editLabel.trim();
    if (!label) return;
    setSections(s => s.map((sec, j) => j === i ? { ...sec, label } : sec));
    setEditingIdx(null);
  }

  const logo = venueSettings?.logoUrl;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#6b98e7] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="font-bebas text-xl tracking-wider text-white">Daily Operations Settings</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 p-5 space-y-6">
          {/* Logo section */}
          <div>
            <div className="font-bebas tracking-widest text-sm text-[#1a1209] mb-1">COMPANY LOGO</div>
            <p className="font-dm text-xs text-[#8a7a60] mb-3">Your logo appears at the top of staff runsheets and checklists.</p>
            {logo ? (
              <div className="flex items-center gap-3 p-3 border border-[#c9a84c]/30 rounded bg-[#f9f5ef]">
                <img src={logo} alt="Logo" className="h-12 w-auto max-w-[140px] object-contain rounded" />
                <div>
                  <p className="font-dm text-xs text-[#1a1209] font-medium">Logo set</p>
                  <a href="/dashboard#settings" className="font-dm text-xs text-[#6b98e7] hover:underline">Change in Venue Settings →</a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 border border-dashed border-[#c9a84c]/40 rounded bg-[#f9f5ef]">
                <Image className="w-8 h-8 text-[#c9a84c]/50" />
                <div>
                  <p className="font-dm text-xs text-[#8a7a60]">No logo uploaded yet.</p>
                  <a href="/dashboard#settings" className="font-dm text-xs text-[#6b98e7] hover:underline">Upload logo in Venue Settings →</a>
                </div>
              </div>
            )}
          </div>

          {/* Sections editor */}
          <div>
            <div className="font-bebas tracking-widest text-sm text-[#1a1209] mb-1">RUNSHEET SECTIONS</div>
            <p className="font-dm text-xs text-[#8a7a60] mb-3">These are the staffing sections on your shift runsheets (e.g. Bar, Front, Kitchen). Rename, reorder or add your own.</p>

            <div className="space-y-1.5 mb-3">
              {sections.map((sec, i) => (
                <div key={sec.key} className="flex items-center gap-2 p-2 border border-[#c9a84c]/30 rounded bg-white group">
                  {/* Reorder */}
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveUp(i)} disabled={i === 0} className="text-[#8a7a60] hover:text-[#1a1209] disabled:opacity-20 transition-colors">
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => moveDown(i)} disabled={i === sections.length - 1} className="text-[#8a7a60] hover:text-[#1a1209] disabled:opacity-20 transition-colors">
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Label */}
                  {editingIdx === i ? (
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(i); if (e.key === 'Escape') setEditingIdx(null); }}
                      className="flex-1 font-dm text-sm border-b border-[#6b98e7] px-1 py-0.5 focus:outline-none"
                    />
                  ) : (
                    <span className="flex-1 font-dm text-sm text-[#1a1209]">{sec.label}</span>
                  )}
                  {/* Actions */}
                  {editingIdx === i ? (
                    <button onClick={() => saveEdit(i)} className="text-[#6b98e7] hover:text-[#5a87d6]"><Check className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button onClick={() => { setEditingIdx(i); setEditLabel(sec.label); }} className="opacity-0 group-hover:opacity-100 text-[#8a7a60] hover:text-[#1a1209] transition-opacity">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => deleteSection(i)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new section */}
            <div className="flex items-center gap-2">
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addSection(); }}
                placeholder="New section name..."
                className="flex-1 border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]"
              />
              <button onClick={addSection} disabled={!newLabel.trim()} className="font-bebas tracking-widest text-xs px-4 py-2 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6] disabled:opacity-40 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> ADD
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#c9a84c]/20 px-5 py-4 flex items-center justify-between gap-3">
          <button onClick={onClose} className="font-bebas tracking-widest text-sm px-5 py-2 border border-[#c9a84c]/30 text-[#8a7a60] rounded hover:bg-[#f9f5ef]">CANCEL</button>
          <button
            onClick={() => { onSave(JSON.stringify(sections)); }}
            disabled={saving}
            className="font-bebas tracking-widest text-sm px-6 py-2 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6] disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? "SAVING..." : "SAVE CHANGES"}
          </button>
        </div>
      </div>
    </div>
  );
}
