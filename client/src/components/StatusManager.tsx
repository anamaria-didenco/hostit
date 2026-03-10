import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X } from "lucide-react";

export type StatusDef = {
  key: string;
  label: string;
  colorId: string;
};

export const COLOR_PRESETS = [
  { id: "amber",   label: "Gold",    classes: "border-amber-400 bg-amber-50 text-amber-800",     swatch: "#f59e0b" },
  { id: "sky",     label: "Sky",     classes: "border-sky-400 bg-sky-50 text-sky-700",           swatch: "#38bdf8" },
  { id: "forest",  label: "Forest",  classes: "border-emerald-700 bg-emerald-50 text-emerald-800", swatch: "#047857" },
  { id: "orange",  label: "Orange",  classes: "border-orange-400 bg-orange-50 text-orange-700",  swatch: "#fb923c" },
  { id: "emerald", label: "Emerald", classes: "border-emerald-500 bg-emerald-50 text-emerald-700", swatch: "#10b981" },
  { id: "stone",   label: "Stone",   classes: "border-stone-400 bg-stone-100 text-stone-500",    swatch: "#a8a29e" },
  { id: "purple",  label: "Purple",  classes: "border-purple-400 bg-purple-50 text-purple-700",  swatch: "#c084fc" },
  { id: "pink",    label: "Pink",    classes: "border-pink-400 bg-pink-50 text-pink-700",        swatch: "#f472b6" },
  { id: "indigo",  label: "Indigo",  classes: "border-indigo-400 bg-indigo-50 text-indigo-700",  swatch: "#818cf8" },
  { id: "teal",    label: "Teal",    classes: "border-teal-400 bg-teal-50 text-teal-700",        swatch: "#2dd4bf" },
  { id: "red",     label: "Red",     classes: "border-red-400 bg-red-50 text-red-700",           swatch: "#f87171" },
  { id: "gray",    label: "Gray",    classes: "border-gray-400 bg-gray-50 text-gray-600",        swatch: "#9ca3af" },
];

export const DEFAULT_STATUSES: StatusDef[] = [
  { key: "new",           label: "New Enquiry",   colorId: "amber"   },
  { key: "contacted",     label: "Contacted",     colorId: "sky"     },
  { key: "proposal_sent", label: "Proposal Sent", colorId: "forest"  },
  { key: "negotiating",   label: "Negotiating",   colorId: "orange"  },
  { key: "booked",        label: "Confirmed",     colorId: "emerald" },
  { key: "lost",          label: "Lost",          colorId: "stone"   },
];

export function getStatusClasses(colorId: string): string {
  return COLOR_PRESETS.find(c => c.id === colorId)?.classes ?? COLOR_PRESETS[0].classes;
}

export function parseCustomStatuses(raw: string | null | undefined): StatusDef[] {
  if (!raw) return DEFAULT_STATUSES;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return DEFAULT_STATUSES;
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

interface Props {
  initialStatuses: StatusDef[];
  onSaved: (statuses: StatusDef[]) => void;
}

export default function StatusManager({ initialStatuses, onSaved }: Props) {
  const [statuses, setStatuses] = useState<StatusDef[]>(initialStatuses);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColorId, setEditColorId] = useState("amber");
  const [addLabel, setAddLabel] = useState("");
  const [addColorId, setAddColorId] = useState("sky");
  const [showAdd, setShowAdd] = useState(false);
  const [dirty, setDirty] = useState(false);

  const updateVenue = trpc.venue.update.useMutation({
    onSuccess: () => {
      toast.success("Statuses saved");
      setDirty(false);
      onSaved(statuses);
    },
    onError: (e) => toast.error(e.message || "Failed to save"),
  });

  function save(updated: StatusDef[]) {
    updateVenue.mutate({ customStatuses: JSON.stringify(updated) });
  }

  function startEdit(s: StatusDef) {
    setEditingKey(s.key);
    setEditLabel(s.label);
    setEditColorId(s.colorId);
  }

  function commitEdit() {
    if (!editLabel.trim()) return;
    const updated = statuses.map(s =>
      s.key === editingKey ? { ...s, label: editLabel.trim(), colorId: editColorId } : s
    );
    setStatuses(updated);
    setEditingKey(null);
    setDirty(true);
    save(updated);
  }

  function deleteStatus(key: string) {
    if (statuses.length <= 1) { toast.error("You need at least one status."); return; }
    const updated = statuses.filter(s => s.key !== key);
    setStatuses(updated);
    setDirty(true);
    save(updated);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const updated = [...statuses];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    setStatuses(updated);
    setDirty(true);
    save(updated);
  }

  function moveDown(idx: number) {
    if (idx === statuses.length - 1) return;
    const updated = [...statuses];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setStatuses(updated);
    setDirty(true);
    save(updated);
  }

  function addStatus() {
    if (!addLabel.trim()) return;
    let key = slugify(addLabel);
    if (statuses.some(s => s.key === key)) key = key + "_" + Date.now();
    const newStatus: StatusDef = { key, label: addLabel.trim(), colorId: addColorId };
    const updated = [...statuses, newStatus];
    setStatuses(updated);
    setAddLabel("");
    setShowAdd(false);
    setDirty(true);
    save(updated);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-dm text-base font-semibold text-ink mb-1">Enquiry Statuses</h3>
        <p className="text-sm text-gray-500 mb-4">
          Customise the stages an enquiry moves through. Changes take effect immediately across your dashboard.
        </p>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {statuses.map((s, idx) => {
            const colorClasses = getStatusClasses(s.colorId);
            const swatchColor = COLOR_PRESETS.find(c => c.id === s.colorId)?.swatch ?? "#9ca3af";
            const isEditing = editingKey === s.key;
            return (
              <div key={s.key} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 group">
                {/* Order arrows */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => moveDown(idx)} disabled={idx === statuses.length - 1}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed transition">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Badge preview */}
                <span className={`text-xs font-bebas tracking-widest px-2 py-0.5 border shrink-0 ${colorClasses}`}>
                  {s.label}
                </span>

                {/* Edit form inline */}
                {isEditing ? (
                  <div className="flex flex-1 items-center gap-2 flex-wrap">
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingKey(null); }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[#8D957E]/40"
                    />
                    <div className="flex gap-1 flex-wrap">
                      {COLOR_PRESETS.map(cp => (
                        <button
                          key={cp.id}
                          title={cp.label}
                          onClick={() => setEditColorId(cp.id)}
                          className={`w-5 h-5 rounded-full border-2 transition ${editColorId === cp.id ? "border-gray-800 scale-110" : "border-transparent hover:scale-105"}`}
                          style={{ backgroundColor: cp.swatch }}
                        />
                      ))}
                    </div>
                    <button onClick={commitEdit} className="p-1.5 rounded-lg bg-[#8D957E] text-white hover:bg-[#7a8269]"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingKey(null)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-600 font-mono text-xs">{s.key}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteStatus(s.key)}
                        disabled={statuses.length <= 1}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Add new status */}
        {showAdd ? (
          <div className="mt-3 border border-dashed border-[#8D957E]/40 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <input
                autoFocus
                value={addLabel}
                onChange={e => setAddLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStatus(); if (e.key === "Escape") setShowAdd(false); }}
                placeholder="Status name (e.g. Site Visit)"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[#8D957E]/40"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-dm">Colour:</span>
              {COLOR_PRESETS.map(cp => (
                <button
                  key={cp.id}
                  title={cp.label}
                  onClick={() => setAddColorId(cp.id)}
                  className={`w-6 h-6 rounded-full border-2 transition ${addColorId === cp.id ? "border-gray-800 scale-110" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: cp.swatch }}
                />
              ))}
              <span className={`ml-2 text-xs font-bebas tracking-widest px-2 py-0.5 border ${getStatusClasses(addColorId)}`}>
                {addLabel || "Preview"}
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={addStatus} disabled={!addLabel.trim() || updateVenue.isPending}
                className="bg-[#8D957E] text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-[#7a8269] disabled:opacity-40 transition">
                Add Status
              </button>
              <button onClick={() => { setShowAdd(false); setAddLabel(""); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-dashed border-gray-200 rounded-xl py-2.5 hover:border-gray-300 hover:bg-gray-50 transition">
            <Plus className="w-4 h-4" /> Add a status
          </button>
        )}
      </div>

      {updateVenue.isPending && (
        <p className="text-xs text-gray-400">Saving…</p>
      )}
    </div>
  );
}
