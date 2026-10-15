import React from "react";
import { createPortal } from "react-dom";
import { X, MapPin } from "lucide-react";

/**
 * Asked when an enquiry with no space is moved to Confirmed / Booked / Tentative.
 * Instead of an error that sends you off to find the Space field, pick the
 * space(s) here and the status change carries on. Escape / close cancels the
 * change. Spaces are stored as a comma-joined list, like the Space field.
 * Sits above the event drawer (z 9999) and its popovers.
 */
export default function ConfirmSpaceDialog({ name, statusLabel, spaces, onConfirm, onCancel, pending }: {
  /** Client name, for context. */
  name?: string;
  /** What the enquiry is being moved to, e.g. "Booked". */
  statusLabel: string;
  spaces: Array<{ id: number | string; name: string }> | undefined;
  onConfirm: (spaceName: string) => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const [picked, setPicked] = React.useState<string[]>([]);
  const firstRef = React.useRef<HTMLInputElement>(null);
  const list = spaces ?? [];
  const names = list.map(s => s.name);

  React.useEffect(() => { firstRef.current?.focus(); }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onCancel(); }
    };
    // Capture phase, so the drawer underneath doesn't also close on Escape.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const toggle = (n: string) => setPicked(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n]);
  // Keep the venue's own space order, whatever order they were ticked in.
  const value = names.filter(n => picked.includes(n)).join(", ");
  const allPicked = names.length > 0 && names.every(n => picked.includes(n));

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-space-title"
        className="bg-cream border-2 border-forest w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-forest-dark px-5 py-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bebas tracking-widest text-xs text-cream opacity-80">MOVE TO {statusLabel.toUpperCase()}</div>
            <h2 id="confirm-space-title" className="font-cormorant text-cream font-semibold text-lg leading-tight">Which space is this for?</h2>
            {name && <p className="font-dm text-xs text-cream opacity-85 mt-0.5 truncate">{name}</p>}
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel and keep the current status"
            className="text-cream opacity-85 hover:opacity-100 p-1 -mr-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="font-dm text-sm text-stone-700">
            Every event needs a space before it can be {statusLabel.toLowerCase()}. Pick it here and the change carries on.
          </p>
          {list.length === 0 ? (
            <p className="font-dm text-sm text-ink border border-amber-400 bg-amber-50 px-3 py-2">
              No spaces are set up yet. Add one in Settings, then try again.
            </p>
          ) : (
            <fieldset className="border border-gold/30 bg-white p-3">
              <legend className="sr-only">Space</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {list.map((s, i) => (
                  <label key={s.id} className="flex items-center gap-2.5 min-h-[44px] px-2 cursor-pointer font-dm text-sm text-ink hover:bg-linen">
                    <input ref={i === 0 ? firstRef : undefined} type="checkbox" checked={picked.includes(s.name)} onChange={() => toggle(s.name)}
                      className="accent-forest w-4 h-4" />
                    <MapPin className="w-3.5 h-3.5 text-gold flex-shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{s.name}</span>
                  </label>
                ))}
              </div>
              {list.length > 1 && (
                <button type="button" onClick={() => setPicked(allPicked ? [] : names)}
                  className="mt-1.5 px-2 min-h-[36px] font-bebas tracking-widest text-[11px] text-forest hover:underline">
                  {allPicked ? "CLEAR ALL" : "FULL VENUE (ALL SPACES)"}
                </button>
              )}
            </fieldset>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel}
              className="min-h-[44px] px-5 border border-stone-300 text-ink/70 hover:text-ink font-bebas tracking-widest text-xs">CANCEL</button>
            <button type="button" disabled={!value || pending} onClick={() => onConfirm(value)}
              className="min-h-[44px] px-5 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs disabled:opacity-40">
              {pending ? "SAVING…" : `SET SPACE AND ${statusLabel.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
