import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { trpc } from "@/lib/trpc";
import { onArrowChoose, rovingTabIndex } from "@/lib/rovingKeys";
import { toast } from "sonner";
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, Check, X } from "lucide-react";
import { DEFAULT_STATUSES, holdColourNote, keepHoldDistinct, parseCustomStatuses, statusEditorSeed, type StatusDef } from "@shared/enquiryStatuses";

// The status list and its rules live in shared/ so the server tests can check them.
export { DEFAULT_STATUSES, parseCustomStatuses, type StatusDef };

export const COLOR_PRESETS = [
  { id: "blue",    label: "VenueFlow",classes: "border-[#2f5488] bg-[#e8edf6] text-[#2f5488]",          swatch: "#2f5488",  calClasses: "bg-[#2f5488] text-white",          barClasses: "bg-[#2f5488]",    dayClasses: "border-l-4 border-[#2f5488] bg-[#e8edf6]"   },
  { id: "amber",   label: "Gold",    classes: "border-amber-400 bg-amber-100 text-amber-900",          swatch: "#f59e0b",  calClasses: "bg-amber-400 text-amber-950",      barClasses: "bg-amber-400",    dayClasses: "border-l-4 border-amber-400 bg-amber-50"    },
  { id: "yellow",  label: "Yellow",  classes: "border-yellow-300 bg-yellow-50 text-yellow-800",        swatch: "#fef08a",  calClasses: "bg-yellow-200 text-yellow-900",    barClasses: "bg-yellow-200",   dayClasses: "border-l-4 border-yellow-300 bg-yellow-50"  },
  { id: "sky",     label: "Sky",     classes: "border-sky-400 bg-sky-100 text-sky-800",                swatch: "#38bdf8",  calClasses: "bg-sky-700 text-white",            barClasses: "bg-sky-400",      dayClasses: "border-l-4 border-sky-400 bg-sky-50"        },
  { id: "forest",  label: "Forest",  classes: "border-emerald-600 bg-emerald-100 text-emerald-900",    swatch: "#047857",  calClasses: "bg-emerald-700 text-white",        barClasses: "bg-emerald-700",  dayClasses: "border-l-4 border-emerald-700 bg-emerald-50" },
  { id: "orange",  label: "Orange",  classes: "border-orange-400 bg-orange-100 text-orange-800",       swatch: "#fb923c",  calClasses: "bg-orange-700 text-white",         barClasses: "bg-orange-400",   dayClasses: "border-l-4 border-orange-400 bg-orange-50"  },
  { id: "emerald", label: "Emerald", classes: "border-emerald-500 bg-emerald-100 text-emerald-800",    swatch: "#10b981",  calClasses: "bg-emerald-700 text-white",        barClasses: "bg-emerald-500",  dayClasses: "border-l-4 border-emerald-500 bg-emerald-50" },
  { id: "stone",   label: "Stone",   classes: "border-stone-400 bg-stone-200 text-stone-700",          swatch: "#a8a29e",  calClasses: "bg-stone-300 text-stone-900",      barClasses: "bg-stone-300",    dayClasses: "border-l-4 border-stone-400 bg-stone-50"    },
  { id: "purple",  label: "Purple",  classes: "border-purple-400 bg-purple-100 text-purple-800",       swatch: "#c084fc",  calClasses: "bg-purple-600 text-white",         barClasses: "bg-purple-400",   dayClasses: "border-l-4 border-purple-400 bg-purple-50"  },
  { id: "pink",    label: "Pink",    classes: "border-pink-400 bg-pink-100 text-pink-800",             swatch: "#f472b6",  calClasses: "bg-pink-700 text-white",           barClasses: "bg-pink-400",     dayClasses: "border-l-4 border-pink-400 bg-pink-50"      },
  { id: "indigo",  label: "Indigo",  classes: "border-indigo-400 bg-indigo-100 text-indigo-800",       swatch: "#818cf8",  calClasses: "bg-indigo-600 text-white",         barClasses: "bg-indigo-400",   dayClasses: "border-l-4 border-indigo-400 bg-indigo-50"  },
  { id: "teal",    label: "Teal",    classes: "border-teal-400 bg-teal-100 text-teal-800",             swatch: "#2dd4bf",  calClasses: "bg-teal-700 text-white",           barClasses: "bg-teal-400",     dayClasses: "border-l-4 border-teal-400 bg-teal-50"      },
  { id: "red",     label: "Red",     classes: "border-red-400 bg-red-100 text-red-800",                swatch: "#f87171",  calClasses: "bg-red-700 text-white",            barClasses: "bg-red-400",      dayClasses: "border-l-4 border-red-400 bg-red-50"        },
  { id: "gray",    label: "Gray",    classes: "border-gray-400 bg-gray-100 text-gray-700",             swatch: "#9ca3af",  calClasses: "bg-gray-300 text-gray-800",        barClasses: "bg-gray-300",     dayClasses: "border-l-4 border-gray-400 bg-gray-50"      },
];

export function getStatusClasses(colorId: string): string {
  return COLOR_PRESETS.find(c => c.id === colorId)?.classes ?? COLOR_PRESETS[0].classes;
}

export function getStatusCalClasses(colorId: string): string {
  return COLOR_PRESETS.find(c => c.id === colorId)?.calClasses ?? "bg-gray-300 text-gray-800";
}

export function getStatusBarClasses(colorId: string): string {
  return COLOR_PRESETS.find(c => c.id === colorId)?.barClasses ?? "bg-gray-300";
}

export function getStatusDayClasses(colorId: string): string {
  return COLOR_PRESETS.find(c => c.id === colorId)?.dayClasses ?? "border-l-4 border-gray-400 bg-gray-50";
}

// ── Canonical status → colour resolution ─────────────────────────────────
// One source of truth so the board, calendar and reports speak the same
// colour language. Resolves a status KEY (lead status, booking status, or an
// alias) to the venue's configured colour, falling back to DEFAULT_STATUSES.
//
// Aliases map statuses that aren't first-class pipeline stages onto one that
// is: a booking's `confirmed` reads as `booked` (the lead equivalent), and a
// `cancelled` booking takes the neutral grey of `finished` — distinct from a
// `lost` enquiry (red), since one is called off and the other never landed.
// `tentative` (a date hold) is a default stage of its own, so needs no alias.
const STATUS_ALIASES: Record<string, string> = {
  confirmed: "booked",
  cancelled: "finished",
};

export function resolveStatusColorId(statusKey: string | null | undefined, statuses: StatusDef[] = DEFAULT_STATUSES): string {
  const key = STATUS_ALIASES[statusKey ?? ""] ?? statusKey ?? "";
  const def = statuses.find(s => s.key === key) ?? DEFAULT_STATUSES.find(s => s.key === key);
  return def?.colorId ?? "gray";
}

/** Border + soft bg + text classes for a status badge/chip. */
export function statusChipClasses(statusKey: string | null | undefined, statuses?: StatusDef[]): string {
  return getStatusClasses(resolveStatusColorId(statusKey, statuses));
}

/** The status's swatch hex — for bars, dots, row tints and chart series. */
export function statusSwatch(statusKey: string | null | undefined, statuses?: StatusDef[]): string {
  const id = resolveStatusColorId(statusKey, statuses);
  return COLOR_PRESETS.find(c => c.id === id)?.swatch ?? "#9ca3af";
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * The 14 colours as a radio group: one Tab stop, arrow keys move and choose
 * (as with any set of radio buttons), and each swatch says its colour name and
 * whether it is chosen.
 */
function ColourPicker({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  const current = Math.max(0, COLOR_PRESETS.findIndex(c => c.id === value));
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onArrowChoose} className="flex gap-1.5 flex-wrap">
      {COLOR_PRESETS.map((cp, idx) => {
        const checked = idx === current;
        return (
          <button
            key={cp.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={cp.label}
            tabIndex={rovingTabIndex(checked, idx, true)}
            title={cp.label}
            onClick={() => onChange(cp.id)}
            className={`w-6 h-6 rounded-full border-2 transition ${checked ? "border-gray-800 scale-125 shadow" : "border-transparent hover:scale-110"}`}
            style={{ backgroundColor: cp.swatch }}
          />
        );
      })}
    </div>
  );
}

interface Props {
  /** The venue's settings row from venue.get: undefined while it loads, null when the venue has none yet. */
  venueSettings: { customStatuses?: string | null } | null | undefined;
  onSaved: (statuses: StatusDef[]) => void;
  /** venue.get failed (and isn't retrying): say so and offer to try again, instead of "Loading" for ever. */
  loadFailed?: boolean;
  onRetry?: () => void;
}

export default function StatusManager({ venueSettings, onSaved, loadFailed, onRetry }: Props) {
  // Never start the editor before the saved list has arrived: every change saves the
  // whole list, so an editor seeded with the defaults (opening this screen from a link
  // or a reload) wrote them over the venue's real statuses.
  const seed = statusEditorSeed(venueSettings);
  // "Try again" goes away while the statuses load: focus follows to "Loading", then to
  // the list, or back to "Try again" if they still can't load (it fell to the page).
  const retried = useRef(false);
  if (!seed && loadFailed) return <LoadFailed retried={retried} onRetry={onRetry} />;
  if (!seed) return <LoadingStatuses retried={retried} />;
  return <StatusEditor initialStatuses={seed} onSaved={onSaved} retried={retried} />;
}

/** Takes focus when it appears after "Try again"; `last` once the statuses have loaded or failed again. */
function useFocusAfterRetry<T extends HTMLElement>(retried: MutableRefObject<boolean>, last: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!retried.current) return;
    ref.current?.focus();
    if (last) retried.current = false;
  }, []);
  return ref;
}

function LoadFailed({ retried, onRetry }: { retried: MutableRefObject<boolean>; onRetry?: () => void }) {
  const button = useFocusAfterRetry<HTMLButtonElement>(retried, true);
  return (
    <div role="alert" className="text-sm text-ink">
      Your statuses couldn't be loaded, so they can't be changed right now.{" "}
      {onRetry && <button ref={button} type="button" onClick={() => { retried.current = true; onRetry(); }} className="font-semibold text-forest underline">Try again</button>}
    </div>
  );
}

function LoadingStatuses({ retried }: { retried: MutableRefObject<boolean> }) {
  const text = useFocusAfterRetry<HTMLParagraphElement>(retried, false);
  return <p ref={text} tabIndex={-1} className="text-sm text-gray-500" role="status">Loading statuses…</p>;
}

function StatusEditor({ initialStatuses, onSaved, retried }: { initialStatuses: StatusDef[]; onSaved: (statuses: StatusDef[]) => void; retried: MutableRefObject<boolean> }) {
  const [statuses, setStatuses] = useState<StatusDef[]>(initialStatuses);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColorId, setEditColorId] = useState("amber");
  const [addLabel, setAddLabel] = useState("");
  const [addColorId, setAddColorId] = useState("sky");
  const [showAdd, setShowAdd] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Read out after a reorder, which is otherwise silent for a screen-reader user.
  const [announcement, setAnnouncement] = useState("");
  // Row buttons by "<status key>:<edit|up|down>", so focus can be put back where the
  // user was after a row is saved, moved or deleted (otherwise it falls to the page).
  const rowButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusRowButton = (key: string, which: "edit" | "up" | "down") =>
    requestAnimationFrame(() => rowButtons.current[`${key}:${which}`]?.focus());
  const listRef = useFocusAfterRetry<HTMLUListElement>(retried, true);
  // Closing the add panel puts focus back on "Add a status" (it fell to the page).
  const addButton = useRef<HTMLButtonElement>(null);
  const closeAdd = (clear: boolean) => {
    setShowAdd(false);
    if (clear) setAddLabel("");
    requestAnimationFrame(() => addButton.current?.focus());
  };

  const updateVenue = trpc.venue.update.useMutation({
    onError: (e) => toast.error(e.message || "Failed to save"),
  });

  function save(updated: StatusDef[]) {
    // On Hold can't share Gold/Yellow with Proposal Sent (see keepHoldDistinct). Save the
    // colours that will really be shown, and say so, rather than "saved" and a quiet revert.
    const note = holdColourNote(updated);
    const toSave = keepHoldDistinct(updated);
    if (toSave !== updated) setStatuses(toSave);
    updateVenue.mutate({ customStatuses: JSON.stringify(toSave) }, {
      onSuccess: () => {
        toast.success("Statuses saved", note ? { description: note } : undefined);
        setDirty(false);
        onSaved(toSave);
      },
    });
  }

  function startEdit(s: StatusDef) {
    setEditingKey(s.key);
    setEditLabel(s.label);
    setEditColorId(s.colorId);
  }

  function cancelEdit() {
    const key = editingKey;
    setEditingKey(null);
    if (key) focusRowButton(key, "edit");
  }

  function commitEdit() {
    if (!editLabel.trim()) return;
    const key = editingKey;
    const updated = statuses.map(s =>
      s.key === editingKey ? { ...s, label: editLabel.trim(), colorId: editColorId } : s
    );
    setStatuses(updated);
    setEditingKey(null);
    setDirty(true);
    save(updated);
    if (key) focusRowButton(key, "edit");
  }

  function deleteStatus(key: string) {
    if (statuses.length <= 1) { toast.error("You need at least one status."); return; }
    const idx = statuses.findIndex(s => s.key === key);
    const label = statuses[idx]?.label ?? key;
    if (!window.confirm(`Delete the "${label}" status? This saves straight away.`)) return;
    const updated = statuses.filter(s => s.key !== key);
    setStatuses(updated);
    setDirty(true);
    save(updated);
    const neighbour = updated[Math.min(idx, updated.length - 1)];
    if (neighbour) focusRowButton(neighbour.key, "edit");
  }

  function moved(updated: StatusDef[], key: string, preferred: "up" | "down") {
    const idx = updated.findIndex(s => s.key === key);
    // Stay on the arrow that was pressed, unless the row reached the end and it is now disabled.
    const atEnd = preferred === "up" ? idx === 0 : idx === updated.length - 1;
    focusRowButton(key, atEnd ? (preferred === "up" ? "down" : "up") : preferred);
    setAnnouncement(`${updated[idx].label} moved to position ${idx + 1} of ${updated.length}.`);
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const updated = [...statuses];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    setStatuses(updated);
    setDirty(true);
    save(updated);
    moved(updated, updated[idx - 1].key, "up");
  }

  function moveDown(idx: number) {
    if (idx === statuses.length - 1) return;
    const updated = [...statuses];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setStatuses(updated);
    setDirty(true);
    save(updated);
    moved(updated, updated[idx + 1].key, "down");
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
    focusRowButton(key, "edit");
  }

  // While a row is being edited: would its colours make On Hold look like Proposal Sent?
  const editHoldNote = editingKey
    ? holdColourNote(statuses.map(s => (s.key === editingKey ? { ...s, label: editLabel.trim() || s.label, colorId: editColorId } : s)))
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-dm text-base font-semibold text-ink mb-1">Enquiry Statuses</p>
        <p className="text-sm text-gray-500 mb-4">
          Customise the name and colour of each status. Changes apply immediately across the calendar, pipeline, and reports.
        </p>

        <ul ref={listRef} tabIndex={-1} aria-label="Statuses, in pipeline order" className="border border-gray-200 rounded-xl overflow-hidden">
          {statuses.map((s, idx) => {
            const colorClasses = getStatusClasses(s.colorId);
            const calPreview = getStatusCalClasses(s.colorId);
            const isEditing = editingKey === s.key;
            return (
              <li key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 group">
                {/* Order arrows: 24px targets, dark enough to find (they were 18px at about 1.5:1). */}
                <div className="flex flex-col shrink-0">
                  <button type="button" aria-label={`Move ${s.label} up`} onClick={() => moveUp(idx)} disabled={idx === 0}
                    ref={el => { rowButtons.current[`${s.key}:up`] = el; }}
                    className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" aria-label={`Move ${s.label} down`} onClick={() => moveDown(idx)} disabled={idx === statuses.length - 1}
                    ref={el => { rowButtons.current[`${s.key}:down`] = el; }}
                    className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Badge preview (pipeline style) */}
                <span className={`text-xs font-bebas tracking-widest px-2 py-0.5 border shrink-0 ${colorClasses}`}>
                  {s.label}
                </span>

                {/* Calendar card preview */}
                <span className={`text-[11px] font-bebas tracking-widest px-2 py-0.5 rounded shrink-0 ${calPreview}`}>
                  CAL
                </span>

                {/* Edit form inline */}
                {isEditing ? (
                  <div className="flex flex-1 min-w-full sm:min-w-0 items-center gap-2 flex-wrap"
                    onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); cancelEdit(); } }}>
                    <input
                      autoFocus
                      aria-label={`Name for ${s.label}`}
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") commitEdit(); }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-[#8D957E]/40"
                    />
                    <ColourPicker value={editColorId} onChange={setEditColorId} label={`Colour for ${s.label}`} />
                    <button type="button" aria-label={`Save ${s.label}`} onClick={commitEdit} className="p-1.5 rounded-lg bg-[#8D957E] text-white hover:bg-[#7a8269]"><Check className="w-3.5 h-3.5" /></button>
                    <button type="button" aria-label="Cancel edit" onClick={cancelEdit} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700"><X className="w-3.5 h-3.5" /></button>
                    <p role="status" className="w-full text-xs text-amber-900 empty:hidden">{editHoldNote}</p>
                  </div>
                ) : (
                  <>
                    {/* The internal key means nothing to a venue and, on a phone, pushed the
                        edit / delete buttons off the end of the row. */}
                    <span className="hidden sm:block flex-1 text-xs text-gray-500 font-mono">{s.key}</span>
                    {/* Always shown: hidden until hover, they could not be found by keyboard
                        or on a tablet, where there is no hover. */}
                    <div className="ml-auto flex items-center gap-1">
                      <button type="button" aria-label={`Edit ${s.label}`} onClick={() => startEdit(s)}
                        ref={el => { rowButtons.current[`${s.key}:edit`] = el; }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" aria-label={`Delete ${s.label}`} onClick={() => deleteStatus(s.key)}
                        disabled={statuses.length <= 1}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p role="status" className="sr-only">{announcement}</p>

        {/* Add new status */}
        {showAdd ? (
          <div className="mt-3 border border-dashed border-[#8D957E]/40 rounded-xl p-4 space-y-3">
            <div className="flex gap-2">
              <input
                autoFocus
                aria-label="New status name"
                value={addLabel}
                onChange={e => setAddLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStatus(); if (e.key === "Escape") closeAdd(false); }}
                placeholder="Status name (e.g. Site Visit)"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-[#8D957E]/40"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-dm">Colour:</span>
              <ColourPicker value={addColorId} onChange={setAddColorId} label="Colour for the new status" />
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bebas tracking-widest px-2 py-0.5 border ${getStatusClasses(addColorId)}`}>
                {addLabel || "Preview"} — Pipeline
              </span>
              <span className={`text-[11px] font-bebas tracking-widest px-2 py-0.5 rounded ${getStatusCalClasses(addColorId)}`}>
                {addLabel || "Preview"} — Calendar
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={addStatus} disabled={!addLabel.trim() || updateVenue.isPending}
                className="bg-[#8D957E] text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-[#7a8269] disabled:opacity-40 transition">
                Add Status
              </button>
              <button onClick={() => closeAdd(true)}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button ref={addButton} onClick={() => setShowAdd(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-dashed border-gray-200 rounded-xl py-2.5 hover:border-gray-300 hover:bg-gray-50 transition">
            <Plus className="w-4 h-4" /> Add a status
          </button>
        )}
      </div>

      {updateVenue.isPending && (
        <p className="text-xs text-gray-500">Saving…</p>
      )}
    </div>
  );
}
