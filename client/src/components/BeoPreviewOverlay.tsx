import React from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { beoUrl } from "@/lib/beoUrl";

/**
 * In-app BEO preview: the same HTML the Runsheet Builder shows, opened over the
 * side panel so the run sheet, menu and dietaries are one tap away instead of
 * Open event → Runsheet → Print. Esc closes just this layer, not the panel.
 */
export default function BeoPreviewOverlay({ bookingId, name, onClose }: { bookingId: number; name: string; onClose: () => void }) {
  const [nonce] = React.useState(() => Date.now());
  const [loaded, setLoaded] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  // Jump chips: the BEO tags its main sections with ids; show a chip for each
  // one that's actually on this event's sheet (hidden sections, or events with
  // no menu or dietaries, simply get no chip). Same-origin iframe, so we can
  // read and scroll it directly.
  const [anchors, setAnchors] = React.useState<{ id: string; label: string }[]>([]);
  const BEO_SECTIONS: Array<[string, string]> = [
    ['beo-run', 'Run of day'], ['beo-food', 'Food'], ['beo-dietary', 'Dietary'], ['beo-bev', 'Drinks'], ['beo-billing', 'Billing'],
  ];
  const onFrameLoad = () => {
    setLoaded(true);
    try {
      const d = frameRef.current?.contentDocument;
      setAnchors(BEO_SECTIONS.filter(([id]) => d?.getElementById(id)).map(([id, label]) => ({ id, label })));
    } catch { /* cross-origin or blocked: just no chips */ }
  };
  const jumpTo = (id: string | null) => {
    try {
      const d = frameRef.current?.contentDocument;
      if (!d) return;
      if (id === null) d.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
      else d.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* ignore */ }
  };
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onClose(); }
    };
    // Capture phase so we win over the side panel's own Escape handler.
    window.addEventListener('keydown', onKey, true);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-cream/40 text-cream hover:bg-cream/10 transition-colors font-bebas tracking-widest text-xs";
  return (
    <div className="fixed inset-0 z-[10001] flex items-stretch md:items-center justify-center bg-black/60 md:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`BEO preview for ${name}`}
        className="bg-cream w-full md:max-w-5xl h-full md:h-[92vh] flex flex-col shadow-2xl overflow-hidden md:rounded-md"
        onClick={e => e.stopPropagation()}>
        <div className="bg-forest-dark px-4 py-3 flex items-center gap-2 flex-wrap">
          <div className="min-w-0 mr-auto">
            <div className="font-bebas tracking-widest text-[10px] text-cream">BEO PREVIEW</div>
            <div className="font-cormorant text-cream font-semibold text-lg leading-tight truncate">{name}</div>
          </div>
          <a className={btn} href={beoUrl(bookingId)} download>
            <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PDF</span><span className="sr-only sm:hidden">Download PDF</span>
          </a>
          <a className={btn} href={beoUrl(bookingId, { format: 'html' })} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">NEW TAB</span><span className="sr-only sm:hidden">Open in new tab</span>
          </a>
          <button ref={closeRef} onClick={onClose} className={btn} aria-label="Close BEO preview">
            <X className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CLOSE</span>
          </button>
        </div>
        {anchors.length > 0 && (
          <nav aria-label="Jump to a section of the BEO" className="flex items-center gap-1.5 px-3 py-2 bg-cream border-b border-gold/25 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="font-bebas tracking-widest text-[10px] text-ink/70 flex-shrink-0 mr-1">JUMP TO</span>
            {anchors.map(a => (
              <button key={a.id} onClick={() => jumpTo(a.id)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full border border-forest/30 text-forest hover:bg-forest hover:text-cream transition-colors font-bebas tracking-widest text-xs">
                {a.label.toUpperCase()}
              </button>
            ))}
            <button onClick={() => jumpTo(null)} className="flex-shrink-0 ml-auto px-2 py-1.5 font-bebas tracking-widest text-xs text-ink/70 hover:text-ink">TOP ↑</button>
          </nav>
        )}
        <div className="relative flex-1 min-h-0 bg-white">
          {!loaded && <div className="absolute inset-0 flex items-center justify-center font-dm text-sm text-ink/70">Loading BEO…</div>}
          <iframe ref={frameRef} title={`BEO for ${name}`} src={beoUrl(bookingId, { format: 'html', nonce })}
            onLoad={onFrameLoad} className="absolute inset-0 w-full h-full border-0" />
        </div>
      </div>
    </div>
  );
}
