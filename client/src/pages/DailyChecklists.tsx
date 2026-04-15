/**
 * DailyChecklists — standalone venue checklists (bar setup, restaurant setup, etc.)
 * Not linked to events. Staff access via a shareable live link.
 * Route: /daily-checklists
 */
import { useState, useRef } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, Copy, ChevronDown, ChevronRight, Camera, X, GripVertical, Edit2, Check, RotateCcw, CopyPlus } from "lucide-react";

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

export default function DailyChecklists() {
  const { data: checklists, refetch } = trpc.dailyChecklists.list.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", category: "general" });
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
    onSuccess: () => { refetch(); setShowCreate(false); setCreateForm({ name: "", description: "", category: "general" }); toast.success("Checklist created!"); },
  });
  const deleteMut = trpc.dailyChecklists.delete.useMutation({
    onSuccess: () => { refetch(); if (expandedId !== null) setExpandedId(null); toast.success("Checklist deleted"); },
  });
  const addItemMut = trpc.dailyChecklists.addItem.useMutation({
    onSuccess: () => { refetchExpanded(); },
  });
  const updateItemMut = trpc.dailyChecklists.updateItem.useMutation({
    onSuccess: () => { refetchExpanded(); setEditingItem(null); },
  });
  const deleteItemMut = trpc.dailyChecklists.deleteItem.useMutation({
    onSuccess: () => refetchExpanded(),
  });
  const duplicateMut = trpc.dailyChecklists.duplicate.useMutation({
    onSuccess: () => { refetch(); toast.success("Checklist duplicated!"); },
    onError: () => toast.error("Failed to duplicate checklist"),
  });

  function getLiveLink(token: string) {
    return `${window.location.origin}/daily/${token}`;
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(getLiveLink(token));
    toast.success("Link copied to clipboard!");
  }

  function handleAddItem(checklistId: number) {
    const text = (newItemText[checklistId] ?? "").trim();
    if (!text) return;
    addItemMut.mutate({
      checklistId,
      text,
      note: newItemNote[checklistId]?.trim() || undefined,
      sortOrder: (expandedChecklist?.items?.length ?? 0),
    });
    setNewItemText(p => ({ ...p, [checklistId]: "" }));
    setNewItemNote(p => ({ ...p, [checklistId]: "" }));
  }

  function handlePhotoUpload(itemId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFor(itemId);
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      updateItemMut.mutate({ id: itemId, photoUrl: dataUrl });
      setUploadingFor(null);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen bg-[#f9f5ef]">
      {/* Header */}
      <div className="bg-[#6b98e7] text-white px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <a href="/dashboard" className="text-white/60 text-xs font-dm hover:text-white transition-colors mb-1 block">← Back to Dashboard</a>
            <h1 className="font-bebas text-3xl tracking-wider">Daily Checklists</h1>
            <p className="font-dm text-sm text-white/70 mt-1">Setup checklists for bar, restaurant, kitchen and more. Share a live link with staff so they can tick off tasks in real time.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors text-white font-bebas tracking-wider text-sm px-5 py-2.5 rounded"
          >
            <Plus className="w-4 h-4" /> NEW CHECKLIST
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Create form */}
        {showCreate && (
          <div className="bg-white border border-[#c9a84c]/30 rounded mb-6 p-5 shadow-sm">
            <h2 className="font-bebas text-lg tracking-wider text-[#1a1209] mb-4">Create New Checklist</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="col-span-2">
                <label className="font-bebas text-xs tracking-widest text-[#8a7a60] block mb-1">CHECKLIST NAME</label>
                <input
                  autoFocus
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && createMut.mutate(createForm)}
                  placeholder="e.g. Bar Opening Checklist"
                  className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]"
                />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-[#8a7a60] block mb-1">CATEGORY</label>
                <select
                  value={createForm.category}
                  onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] bg-white"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-[#8a7a60] block mb-1">DESCRIPTION (optional)</label>
                <input
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description..."
                  className="w-full border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => createMut.mutate(createForm)} disabled={!createForm.name || createMut.isPending}
                className="font-bebas tracking-widest text-sm px-6 py-2 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6] disabled:opacity-50">
                CREATE
              </button>
              <button onClick={() => setShowCreate(false)} className="font-bebas tracking-widest text-sm px-6 py-2 border border-[#c9a84c]/30 text-[#8a7a60] rounded hover:bg-[#f9f5ef]">
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {(checklists ?? []).length === 0 && !showCreate && (
          <div className="bg-white border border-[#c9a84c]/30 rounded p-12 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="font-bebas text-2xl tracking-wider text-[#1a1209] mb-2">No Checklists Yet</h2>
            <p className="font-dm text-sm text-[#8a7a60] mb-6">Create your first checklist — bar setup, opening procedures, cleaning rounds, anything your team needs to tick off daily.</p>
            <button onClick={() => setShowCreate(true)}
              className="font-bebas tracking-widest text-sm px-8 py-3 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6]">
              CREATE FIRST CHECKLIST
            </button>
          </div>
        )}

        {/* Checklist cards */}
        <div className="space-y-3">
          {(checklists ?? []).map(cl => {
            const isExpanded = expandedId === cl.id;
            const cat = catInfo(cl.category ?? "general");
            const pct = cl.itemCount > 0 ? Math.round((cl.checkedCount / cl.itemCount) * 100) : 0;
            return (
              <div key={cl.id} className="bg-white border border-[#c9a84c]/30 rounded overflow-hidden shadow-sm">
                {/* Card header */}
                <div
                  className="p-4 cursor-pointer hover:bg-[#f9f5ef]/50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : cl.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 rounded flex-shrink-0 ${cat.color}`}>{cat.label}</span>
                      <div className="min-w-0">
                        <div className="font-bebas text-lg tracking-wider text-[#1a1209] truncate">{cl.name}</div>
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
                      {/* Live link button */}
                      <button
                        onClick={e => { e.stopPropagation(); copyLink(cl.token); }}
                        className="p-1.5 text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded transition-colors"
                        title="Copy live staff link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={getLiveLink(cl.token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 text-[#6b98e7] hover:bg-[#6b98e7]/10 rounded transition-colors"
                        title="Open live staff view"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={e => { e.stopPropagation(); duplicateMut.mutate({ id: cl.id }); }}
                        disabled={duplicateMut.isPending}
                        className="p-1.5 text-[#8a7a60] hover:bg-[#8a7a60]/10 rounded transition-colors disabled:opacity-50"
                        title="Duplicate checklist"
                      >
                        <CopyPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm(`Delete "${cl.name}"?`)) deleteMut.mutate({ id: cl.id }); }}
                        className="p-1.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                        title="Delete checklist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-[#8a7a60]" /> : <ChevronRight className="w-4 h-4 text-[#8a7a60]" />}
                    </div>
                  </div>
                </div>

                {/* Expanded: items list */}
                {isExpanded && (
                  <div className="border-t border-[#c9a84c]/20">
                    {/* Live link banner */}
                    <div className="bg-[#6b98e7]/8 border-b border-[#6b98e7]/20 px-4 py-2 flex items-center justify-between gap-2">
                      <span className="font-dm text-xs text-[#6b98e7]">Live staff link:</span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-dm text-xs text-[#6b98e7] truncate">{getLiveLink(cl.token)}</span>
                        <button onClick={() => copyLink(cl.token)} className="flex-shrink-0 text-[#6b98e7] hover:text-[#5a87d6]"><Copy className="w-3 h-3" /></button>
                        <a href={getLiveLink(cl.token)} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-[#6b98e7] hover:text-[#5a87d6]"><ExternalLink className="w-3 h-3" /></a>
                      </div>
                    </div>

                    {/* Items */}
                    {(expandedChecklist?.items ?? []).length === 0 && (
                      <div className="px-5 py-4 text-center font-dm text-sm text-[#8a7a60]">No items yet — add your first task below.</div>
                    )}
                    {(expandedChecklist?.items ?? []).map(item => (
                      <div key={item.id} className="border-b border-[#c9a84c]/10 last:border-0">
                        {editingItem === item.id ? (
                          <div className="px-5 py-3 bg-[#f9f5ef]/60 space-y-2">
                            <input
                              autoFocus
                              value={editItemText}
                              onChange={e => setEditItemText(e.target.value)}
                              className="w-full border border-[#c9a84c]/30 rounded px-3 py-1.5 font-dm text-sm focus:outline-none focus:border-[#6b98e7]"
                            />
                            <input
                              value={editItemNote}
                              onChange={e => setEditItemNote(e.target.value)}
                              placeholder="Note / instruction (optional)"
                              className="w-full border border-[#c9a84c]/30 rounded px-3 py-1.5 font-dm text-xs text-[#8a7a60] focus:outline-none focus:border-[#6b98e7]"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => updateItemMut.mutate({ id: item.id, text: editItemText, note: editItemNote || undefined })}
                                className="font-bebas tracking-widest text-xs px-4 py-1.5 bg-[#6b98e7] text-white rounded">SAVE</button>
                              <button onClick={() => setEditingItem(null)}
                                className="font-bebas tracking-widest text-xs px-4 py-1.5 border border-[#c9a84c]/30 text-[#8a7a60] rounded">CANCEL</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3 px-5 py-3 group hover:bg-[#f9f5ef]/50 transition-colors">
                            <div className={`w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center ${item.checked ? 'bg-[#6b98e7] border-[#6b98e7]' : 'border-[#c9a84c]/40'}`}>
                              {item.checked ? <Check className="w-3 h-3 text-white" /> : null}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-dm text-sm ${item.checked ? 'line-through text-[#8a7a60]' : 'text-[#1a1209]'}`}>{item.text}</div>
                              {item.note && <div className="font-dm text-xs text-[#8a7a60] mt-0.5">{item.note}</div>}
                              {item.photoUrl && (
                                <div className="mt-2">
                                  <img src={item.photoUrl} alt="step" className="w-24 h-16 object-cover rounded border border-[#c9a84c]/20" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              {/* Photo upload */}
                              <button
                                onClick={() => { setPendingPhotoItemId(item.id); fileInputRef.current?.click(); }}
                                className="p-1 text-[#8a7a60] hover:text-[#6b98e7] rounded"
                                title={item.photoUrl ? "Replace photo" : "Add photo"}
                              >
                                <Camera className="w-3.5 h-3.5" />
                              </button>
                              {item.photoUrl && (
                                <button onClick={() => updateItemMut.mutate({ id: item.id, photoUrl: "" })}
                                  className="p-1 text-[#8a7a60] hover:text-red-400 rounded" title="Remove photo">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => { setEditingItem(item.id); setEditItemText(item.text); setEditItemNote(item.note ?? ""); }}
                                className="p-1 text-[#8a7a60] hover:text-[#6b98e7] rounded" title="Edit">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm('Delete this item?')) deleteItemMut.mutate({ id: item.id }); }}
                                className="p-1 text-[#8a7a60] hover:text-red-400 rounded" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Hidden file input for photo upload */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        if (pendingPhotoItemId !== null) handlePhotoUpload(pendingPhotoItemId, e);
                      }}
                    />

                    {/* Add item form */}
                    <div className="px-5 py-3 bg-[#f9f5ef]/40 border-t border-[#c9a84c]/10">
                      <div className="flex gap-2 mb-2">
                        <input
                          value={newItemText[cl.id] ?? ""}
                          onChange={e => setNewItemText(p => ({ ...p, [cl.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddItem(cl.id)}
                          placeholder="Add a task..."
                          className="flex-1 border border-[#c9a84c]/30 rounded px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]"
                        />
                        <button
                          onClick={() => handleAddItem(cl.id)}
                          disabled={!newItemText[cl.id]?.trim() || addItemMut.isPending}
                          className="font-bebas tracking-widest text-xs px-4 py-2 bg-[#6b98e7] text-white rounded hover:bg-[#5a87d6] disabled:opacity-50"
                        >
                          ADD
                        </button>
                      </div>
                      <input
                        value={newItemNote[cl.id] ?? ""}
                        onChange={e => setNewItemNote(p => ({ ...p, [cl.id]: e.target.value }))}
                        placeholder="Optional note / instruction for this task..."
                        className="w-full border border-[#c9a84c]/20 rounded px-3 py-1.5 font-dm text-xs text-[#8a7a60] focus:outline-none focus:border-[#6b98e7]"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
