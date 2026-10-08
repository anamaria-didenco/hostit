import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertCircle } from "lucide-react";

/**
 * "This date is already taken" — the one dialog every booking path shows when
 * the server answers CONFLICT with a clash list (server/availability.ts).
 *
 * Usage, in any mutation's onError:
 *   if (promptClashOverride(err, () => m.mutate({ ...vars, allowClash: true }))) return;
 * and mount <ClashDialogHost /> once on the page.
 *
 * It's a tiny module-level store rather than context so call sites deep in
 * Dashboard.tsx can use it without prop threading. It portals to <body> at a
 * z-index above the event drawer, which marks #root inert while open.
 */

export type ClientClash = {
  kind: "booked" | "hold" | "tentative";
  certainty: "clash" | "possible";
  name: string;
  summary: string;
  leadId: number | null;
  bookingId: number | null;
};

type Pending = { clashes: ClientClash[]; confirmLabel: string; onConfirm: () => void };

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const prompted = new WeakSet<object>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** The clash list carried by a tRPC CONFLICT error, or null. */
export function getClashes(err: unknown): ClientClash[] | null {
  const e = err as any;
  const list = e?.data?.clashes ?? e?.shape?.data?.clashes;
  return Array.isArray(list) && list.length > 0 ? list : null;
}

/**
 * If `err` is a date clash, open the dialog and return true (the caller should
 * stop — no error toast). "Book anyway" runs `onConfirm`, which should resend
 * the same request with `allowClash: true`.
 */
export function promptClashOverride(err: unknown, onConfirm: () => void, opts: { confirmLabel?: string } = {}): boolean {
  const clashes = getClashes(err);
  if (!clashes) return false;
  // Both a hook-level and a call-level onError can see the same error.
  if (err && typeof err === "object") {
    if (prompted.has(err)) return true;
    prompted.add(err);
  }
  pending = { clashes, confirmLabel: opts.confirmLabel ?? "Book anyway", onConfirm };
  emit();
  return true;
}

function close() { pending = null; emit(); }

const KIND_LABEL: Record<ClientClash["kind"], string> = { booked: "Booked", hold: "On hold", tentative: "Pencilled in" };

export function ClashKindTag({ kind }: { kind: ClientClash["kind"] }) {
  return kind === "hold"
    ? <span className="vf-hold-chip font-bebas text-[10px] tracking-widest px-1.5 py-0.5 rounded-sm flex-shrink-0">HOLD</span>
    : <span className={`font-bebas text-[10px] tracking-widest px-1.5 py-0.5 rounded-sm flex-shrink-0 ${kind === "booked" ? "bg-red-50 text-red-800 border border-red-200" : "bg-amber-50 text-amber-900 border border-amber-200"}`}>{KIND_LABEL[kind].toUpperCase()}</span>;
}

export function ClashDialogHost() {
  const current = useSyncExternalStore(subscribe, () => pending, () => null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!current) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => cancelRef.current?.focus(), 0);
    // Capture phase so this runs before the event drawer's own Escape/Tab
    // handling — Escape closes only this dialog, never the drawer under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== "Tab") return;
      const nodes = Array.from(boxRef.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!boxRef.current?.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); e.stopPropagation(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); e.stopPropagation(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [current]);

  if (!current) return null;
  const real = current.clashes.filter(c => c.certainty === "clash");
  const possible = current.clashes.filter(c => c.certainty === "possible");

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />
      <div
        ref={boxRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clash-dialog-title"
        aria-describedby="clash-dialog-list"
        className="relative w-full max-w-md bg-cream border border-gold shadow-2xl rounded-sm"
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <AlertCircle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="clash-dialog-title" className="font-cormorant text-ink text-xl font-semibold leading-tight">This date is already taken</h2>
            <p className="font-dm text-sm text-stone-600 mt-1">Check before you double-book.</p>
          </div>
        </div>
        <div id="clash-dialog-list" className="px-5 py-4 space-y-2">
          {real.map((c, i) => (
            <div key={`c${i}`} className="flex items-start gap-2 bg-white border border-red-200 rounded-sm px-3 py-2">
              <ClashKindTag kind={c.kind} />
              <p className="font-dm text-sm text-ink leading-snug">{c.summary}</p>
            </div>
          ))}
          {possible.length > 0 && (
            <div className="pt-1">
              <p className="font-bebas text-[11px] tracking-widest text-stone-600 mb-1">ALSO THAT DAY</p>
              {possible.map((c, i) => (
                <p key={`p${i}`} className="font-dm text-xs text-stone-700 leading-snug mb-1">{c.summary}</p>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 pb-5">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            className="font-bebas tracking-widest text-xs px-4 py-2.5 border border-forest text-forest hover:bg-linen rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5488]"
          >
            GO BACK
          </button>
          <button
            type="button"
            onClick={() => { const fn = current.onConfirm; close(); fn(); }}
            className="font-bebas tracking-widest text-xs px-4 py-2.5 bg-red-700 text-white hover:bg-red-800 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            {current.confirmLabel.toUpperCase()}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
