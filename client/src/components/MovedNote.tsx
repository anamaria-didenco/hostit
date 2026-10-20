/**
 * Shown on an enquiry row right after its status was changed inline, in place
 * of the row vanishing from the tab or search it no longer matches. Stays until
 * the next tab/filter/search change (or refresh).
 */
export default function MovedNote({ toLabel, onUndo, busy }: { toLabel: string; onUndo: () => void; busy?: boolean }) {
  return (
    <div role="status" className="flex items-center gap-1.5 mt-1 font-dm text-[12px] text-ink/80" onClick={e => e.stopPropagation()}>
      <span>Moved to <strong className="font-semibold">{toLabel}</strong></span>
      <span aria-hidden="true">·</span>
      <button type="button" disabled={busy}
        onClick={e => { e.stopPropagation(); onUndo(); }}
        className="font-semibold text-forest underline underline-offset-2 hover:text-forest-dark disabled:opacity-50 disabled:no-underline">
        {busy ? "Undoing…" : "Undo"}
      </button>
    </div>
  );
}
