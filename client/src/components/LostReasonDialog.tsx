import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LOST_REASONS, type LostReasonKey } from "@shared/lostReasons";

/**
 * Asked whenever an enquiry is moved to Lost: one tap on a reason, an optional
 * note, or Skip. Escape / the close button cancels the status change entirely.
 * Sits above the event drawer (z 9999) and its popovers.
 */
export default function LostReasonDialog({
  count, name, onConfirm, onCancel, pending,
}: {
  /** How many enquiries are being marked lost (bulk), default 1. */
  count?: number;
  /** Client name for a single enquiry. */
  name?: string;
  onConfirm: (reason: LostReasonKey | null, note: string | null) => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const [reason, setReason] = React.useState<LostReasonKey | null>(null);
  const [note, setNote] = React.useState("");
  const firstRef = React.useRef<HTMLButtonElement>(null);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => { firstRef.current?.focus(); }, []);
  React.useEffect(() => { if (reason === "other") noteRef.current?.focus(); }, [reason]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onCancel(); }
    };
    // Capture phase, so the drawer underneath doesn't also close on Escape.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const many = (count ?? 1) > 1;
  const title = many ? `Why were these ${count} lost?` : "Why was this enquiry lost?";

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="lost-reason-title"
        className="bg-cream border-2 border-forest w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-forest-dark px-5 py-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bebas tracking-widest text-xs text-cream opacity-80">MARK AS LOST</div>
            <h2 id="lost-reason-title" className="font-cormorant text-cream font-semibold text-lg leading-tight">{title}</h2>
            {!many && name && <p className="font-dm text-xs text-cream opacity-85 mt-0.5 truncate">{name}</p>}
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel — keep the current status"
            className="text-cream opacity-85 hover:opacity-100 p-1 -mr-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="font-dm text-sm text-stone-700">Pick a reason so you can see where bookings slip away. You can skip it.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Lost reason">
            {LOST_REASONS.map((r, i) => {
              const on = reason === r.key;
              return (
                <button key={r.key} ref={i === 0 ? firstRef : undefined} type="button" aria-pressed={on}
                  onClick={() => setReason(on ? null : r.key)}
                  className={`text-left px-3 py-2.5 border font-dm text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest ${on ? "bg-forest-dark text-cream border-forest" : "bg-white text-ink border-stone-300 hover:border-forest"}`}>
                  {r.label}
                </button>
              );
            })}
          </div>
          {reason && (
            <div>
              <label htmlFor="lost-reason-note" className="font-bebas text-xs tracking-widest text-stone-600 block mb-1">
                {reason === "other" ? "WHAT HAPPENED?" : "NOTE (OPTIONAL)"}
              </label>
              <textarea id="lost-reason-note" ref={noteRef} value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500}
                placeholder={reason === "other" ? "A few words for next time" : "Anything worth remembering"}
                className="w-full border border-stone-300 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest resize-none" />
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-end pt-1">
            <button type="button" onClick={() => onConfirm(null, null)} disabled={pending}
              className="border border-stone-300 font-bebas tracking-widest text-xs px-4 py-2 text-stone-700 hover:text-ink hover:border-stone-500 disabled:opacity-50">
              SKIP
            </button>
            <button type="button" onClick={() => onConfirm(reason, note.trim() || null)} disabled={pending || !reason}
              className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream disabled:opacity-50">
              {pending ? "SAVING…" : many ? `MARK ${count} LOST` : "MARK LOST"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
