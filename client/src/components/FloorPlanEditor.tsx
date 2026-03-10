import { useState, useRef, useCallback, useEffect } from "react";
import {
  Trash2, RotateCw, ZoomIn, ZoomOut, MousePointer,
  Save, Plus, Share2, Copy, Check, Download, Upload, X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
export type FPElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string;
  color?: string;
  seats?: number;
};

export type CanvasData = {
  width: number;
  height: number;
  elements: FPElement[];
};

type CustomPaletteItem = {
  type: string;
  label: string;
  w: number;
  h: number;
  color: string;
  seats: number;
  round: boolean;
};

// ─── Palette items ────────────────────────────────────────────────────────────
const PALETTE = [
  { type: "round-table-6", label: "Round Table (6)", w: 80, h: 80, seats: 6, color: "#d4b896", icon: "⬤" },
  { type: "round-table-8", label: "Round Table (8)", w: 96, h: 96, seats: 8, color: "#d4b896", icon: "⬤" },
  { type: "rect-table-6", label: "Rect Table (6)", w: 120, h: 60, seats: 6, color: "#c8a97e", icon: "▬" },
  { type: "rect-table-8", label: "Rect Table (8)", w: 160, h: 60, seats: 8, color: "#c8a97e", icon: "▬" },
  { type: "rect-table-10", label: "Rect Table (10)", w: 200, h: 60, seats: 10, color: "#c8a97e", icon: "▬" },
  { type: "cocktail-table", label: "Cocktail Table", w: 40, h: 40, seats: 0, color: "#b8956a", icon: "●" },
  { type: "bar", label: "Bar", w: 200, h: 50, seats: 0, color: "#8B4513", icon: "▬" },
  { type: "stage", label: "Stage", w: 200, h: 100, seats: 0, color: "#4a4a4a", icon: "▬" },
  { type: "dance-floor", label: "Dance Floor", w: 160, h: 160, seats: 0, color: "#6b6b6b", icon: "▪" },
  { type: "dj-booth", label: "DJ Booth", w: 80, h: 60, seats: 0, color: "#333", icon: "▬" },
  { type: "chair", label: "Chair", w: 24, h: 24, seats: 1, color: "#a0856c", icon: "●" },
  { type: "sofa", label: "Sofa", w: 100, h: 40, seats: 4, color: "#8B7355", icon: "▬" },
  { type: "entrance", label: "Entrance", w: 60, h: 20, seats: 0, color: "#2d6a4f", icon: "▬" },
  { type: "plant", label: "Plant/Decor", w: 30, h: 30, seats: 0, color: "#40916c", icon: "●" },
  { type: "buffet", label: "Buffet Table", w: 180, h: 50, seats: 0, color: "#9c6644", icon: "▬" },
  { type: "photo-booth", label: "Photo Booth", w: 80, h: 80, seats: 0, color: "#7b2d8b", icon: "▪" },
  { type: "text", label: "Text Label", w: 100, h: 30, seats: 0, color: "#1a1a1a", icon: "T" },
  { type: "wall", label: "Wall", w: 200, h: 16, seats: 0, color: "#555", icon: "▬" },
  { type: "pillar", label: "Pillar", w: 24, h: 24, seats: 0, color: "#888", icon: "●" },
];

const ELEMENT_COLORS: Record<string, string> = Object.fromEntries(PALETTE.map(p => [p.type, p.color]));

function isRound(type: string) {
  return ["round-table-6","round-table-8","cocktail-table","chair","plant","pillar"].includes(type)
    || type.startsWith("custom-round");
}

function getLabel(type: string, customPalette: CustomPaletteItem[]) {
  return PALETTE.find(p => p.type === type)?.label
    ?? customPalette.find(p => p.type === type)?.label
    ?? type;
}

// ─── Render a single element on the canvas ───────────────────────────────────
function ElementShape({ el, selected, onSelect, onDragStart, customPalette }: {
  el: FPElement;
  selected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  customPalette: CustomPaletteItem[];
}) {
  const color = el.color
    ?? ELEMENT_COLORS[el.type]
    ?? customPalette.find(p => p.type === el.type)?.color
    ?? "#888";
  const round = isRound(el.type);
  const borderRadius = round ? "50%" : el.type === "stage" || el.type === "dance-floor" ? "4px" : "3px";
  const isText = el.type === "text";

  return (
    <div
      onMouseDown={(e) => { onSelect(el.id); onDragStart(e, el.id); }}
      style={{
        position: "absolute",
        left: el.x, top: el.y, width: el.width, height: el.height,
        transform: `rotate(${el.rotation}deg)`,
        transformOrigin: "center center",
        cursor: "grab", userSelect: "none", zIndex: selected ? 10 : 1,
      }}
    >
      {isText ? (
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 600, color,
          border: selected ? "2px dashed #C8102E" : "1px dashed #ccc",
          borderRadius: "2px", padding: "2px 4px", whiteSpace: "nowrap", overflow: "hidden",
        }}>
          {el.label ?? "Label"}
        </div>
      ) : (
        <div style={{
          width: "100%", height: "100%", backgroundColor: color,
          borderRadius,
          border: selected ? "2px solid #C8102E" : "1.5px solid rgba(0,0,0,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: "1px",
          boxShadow: selected ? "0 0 0 2px rgba(200,16,46,0.3)" : "0 1px 3px rgba(0,0,0,0.15)",
        }}>
          {el.label && (
            <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.9)", fontWeight: 600, textAlign: "center", lineHeight: 1.1, maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {el.label}
            </span>
          )}
          {(el.seats ?? 0) > 0 && (
            <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.7)" }}>{el.seats} seats</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
interface FloorPlanEditorProps {
  initialData?: CanvasData;
  name?: string;
  bgImageUrl?: string;
  onSave?: (data: CanvasData, name: string, bgImageUrl?: string) => void;
  isSaving?: boolean;
  readOnly?: boolean;
  planId?: number;
  shareToken?: string;
  onShareTokenGenerated?: (token: string) => void;
}

export default function FloorPlanEditor({
  initialData,
  name: initialName = "Floor Plan",
  bgImageUrl: initialBgImageUrl,
  onSave,
  isSaving,
  readOnly,
  planId,
  shareToken: initialShareToken,
  onShareTokenGenerated,
}: FloorPlanEditorProps) {
  const [canvasData, setCanvasData] = useState<CanvasData>(initialData ?? { width: 900, height: 600, elements: [] });
  const [planName, setPlanName] = useState(initialName);
  const [bgImageUrl, setBgImageUrl] = useState(initialBgImageUrl ?? "");
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tool] = useState<"select">("select");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const GRID = 20;

  // Share state
  const [shareToken, setShareToken] = useState(initialShareToken ?? "");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Custom palette items
  const [customPalette, setCustomPalette] = useState<CustomPaletteItem[]>([]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({ label: "", w: 80, h: 80, color: "#5b7c6c", seats: 0, round: false });

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const snap = useCallback((v: number) => snapToGrid ? Math.round(v / GRID) * GRID : v, [snapToGrid]);

  // ── Drag element ────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    if (readOnly) return;
    e.preventDefault();
    const el = canvasData.elements.find(x => x.id === id);
    if (!el) return;
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
  }, [canvasData.elements, readOnly]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = (e.clientX - dragRef.current.startX) / zoom;
      const dy = (e.clientY - dragRef.current.startY) / zoom;
      setCanvasData(prev => ({
        ...prev,
        elements: prev.elements.map(el =>
          el.id === dragRef.current!.id
            ? { ...el, x: snap(dragRef.current!.origX + dx), y: snap(dragRef.current!.origY + dy) }
            : el
        ),
      }));
    };
    const onMouseUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [zoom, snap]);

  // ── Drop from palette ────────────────────────────────────────────────────
  const addItem = useCallback((type: string, palette: typeof PALETTE[0] | CustomPaletteItem, atCenter = false) => {
    const w = palette.w; const h = palette.h;
    const x = atCenter ? snap(canvasData.width / 2 - w / 2) : snap(40);
    const y = atCenter ? snap(canvasData.height / 2 - h / 2) : snap(40);
    const newEl: FPElement = {
      id: `${type}-${Date.now()}`,
      type,
      x: Math.max(0, x), y: Math.max(0, y),
      width: w, height: h,
      rotation: 0,
      label: palette.label,
      color: palette.color,
      seats: palette.seats,
    };
    setCanvasData(prev => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelected(newEl.id);
  }, [canvasData.width, canvasData.height, snap]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("fp-type");
    if (!type) return;
    const palette = PALETTE.find(p => p.type === type) ?? customPalette.find(p => p.type === type);
    if (!palette) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = snap((e.clientX - rect.left) / zoom - palette.w / 2);
    const y = snap((e.clientY - rect.top) / zoom - palette.h / 2);
    const newEl: FPElement = {
      id: `${type}-${Date.now()}`,
      type,
      x: Math.max(0, x), y: Math.max(0, y),
      width: palette.w, height: palette.h,
      rotation: 0,
      label: palette.label,
      color: palette.color,
      seats: palette.seats,
    };
    setCanvasData(prev => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelected(newEl.id);
  }, [zoom, snap, customPalette]);

  // ── Selected element ─────────────────────────────────────────────────────
  const selectedEl = canvasData.elements.find(el => el.id === selected);

  const deleteSelected = () => {
    if (!selected) return;
    setCanvasData(prev => ({ ...prev, elements: prev.elements.filter(el => el.id !== selected) }));
    setSelected(null);
  };

  const rotateSelected = () => {
    if (!selected) return;
    setCanvasData(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.id === selected ? { ...el, rotation: (el.rotation + 45) % 360 } : el),
    }));
  };

  const updateSelected = (patch: Partial<FPElement>) => {
    if (!selected) return;
    setCanvasData(prev => ({
      ...prev,
      elements: prev.elements.map(el => el.id === selected ? { ...el, ...patch } : el),
    }));
  };

  const handleSave = () => {
    if (onSave) onSave(canvasData, planName, bgImageUrl || undefined);
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
      if (e.key === "r" || e.key === "R") rotateSelected();
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // ── Share & PDF ──────────────────────────────────────────────────────────
  const generateLink = trpc.floorPlans.generateShareLink.useMutation({
    onSuccess: (data) => {
      setShareToken(data.token);
      onShareTokenGenerated?.(data.token);
      setShowShareDialog(true);
    },
    onError: () => toast.error("Failed to generate share link"),
  });

  const handleShare = () => {
    if (shareToken) { setShowShareDialog(true); return; }
    if (!planId) { toast.error("Save the floor plan first, then share it."); return; }
    generateLink.mutate({ id: planId });
  };

  const shareUrl = shareToken ? `${window.location.origin}/floor-plan/share/${shareToken}` : "";

  const handleDownloadPdf = async () => {
    let token = shareToken;
    if (!token) {
      if (!planId) { toast.error("Save the floor plan first, then export to PDF."); return; }
      setPdfLoading(true);
      try {
        const result = await new Promise<{ token: string }>((resolve, reject) => {
          generateLink.mutate({ id: planId }, {
            onSuccess: resolve,
            onError: reject,
          });
        });
        token = result.token;
        setShareToken(token);
        onShareTokenGenerated?.(token);
      } catch {
        toast.error("Could not generate share link for PDF");
        setPdfLoading(false);
        return;
      }
    }
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/floor-plan-pdf/${token}`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${planName.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Custom item creator ──────────────────────────────────────────────────
  const handleAddCustomItem = () => {
    if (!customForm.label.trim()) { toast.error("Enter a label for the item"); return; }
    const newItem: CustomPaletteItem = {
      type: `custom-${customForm.round ? "round" : "rect"}-${Date.now()}`,
      label: customForm.label.trim(),
      w: Math.max(10, customForm.w),
      h: Math.max(10, customForm.h),
      color: customForm.color,
      seats: customForm.seats,
      round: customForm.round,
    };
    setCustomPalette(prev => [...prev, newItem]);
    addItem(newItem.type, newItem, true);
    setCustomForm({ label: "", w: 80, h: 80, color: "#5b7c6c", seats: 0, round: false });
    setShowCustomForm(false);
    toast.success(`"${newItem.label}" added`);
  };

  const totalSeats = canvasData.elements.reduce((sum, el) => sum + (el.seats ?? 0), 0);
  const tableCount = canvasData.elements.filter(el => el.type.includes("table")).length;

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>

      {/* ── Left palette ────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="w-48 bg-ivory border-r border-border flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-border">
            <p className="font-bebas tracking-widest text-xs text-sage">ELEMENTS</p>
            <p className="text-[10px] text-ink/40 mt-0.5">Drag onto canvas</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {PALETTE.map(item => (
              <div
                key={item.type}
                draggable
                onDragStart={e => e.dataTransfer.setData("fp-type", item.type)}
                className="flex items-center gap-2 px-3 py-1.5 cursor-grab hover:bg-burgundy/5 transition-colors group"
              >
                <span style={{ color: item.color, fontSize: "13px", flexShrink: 0 }}>{item.icon}</span>
                <span className="font-dm text-xs text-ink/70 group-hover:text-ink truncate">{item.label}</span>
              </div>
            ))}

            {/* Custom items */}
            {customPalette.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1">
                  <p className="font-bebas tracking-widest text-[10px] text-sage/60">CUSTOM</p>
                </div>
                {customPalette.map(item => (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={e => e.dataTransfer.setData("fp-type", item.type)}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-grab hover:bg-burgundy/5 transition-colors group"
                  >
                    <span style={{ color: item.color, fontSize: "13px", flexShrink: 0 }}>{item.round ? "●" : "▬"}</span>
                    <span className="font-dm text-xs text-ink/70 group-hover:text-ink truncate flex-1">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => setCustomPalette(prev => prev.filter(p => p.type !== item.type))}
                      className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-red-400 transition-all flex-shrink-0"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Custom item creator */}
          <div className="border-t border-border">
            {!showCustomForm ? (
              <button
                type="button"
                onClick={() => setShowCustomForm(true)}
                className="w-full flex items-center gap-1.5 px-3 py-2.5 text-xs font-bebas tracking-widest text-ink/50 hover:text-ink hover:bg-gold/5 transition-colors"
              >
                <Plus className="w-3 h-3" /> ADD CUSTOM ITEM
              </button>
            ) : (
              <div className="p-3 space-y-2 bg-linen/60">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bebas text-[10px] tracking-widest text-sage">NEW ITEM</p>
                  <button type="button" onClick={() => setShowCustomForm(false)} className="text-ink/30 hover:text-ink">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="text"
                  value={customForm.label}
                  onChange={e => setCustomForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Label (e.g. VIP Table)"
                  className="w-full border border-border rounded px-2 py-1 text-xs font-dm focus:outline-none focus:border-gold"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="font-bebas text-[9px] tracking-widest text-ink/40 block">W</label>
                    <input type="number" value={customForm.w} onChange={e => setCustomForm(f => ({ ...f, w: parseInt(e.target.value) || 80 }))}
                      className="w-full border border-border rounded px-1.5 py-1 text-xs font-dm focus:outline-none focus:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-[9px] tracking-widest text-ink/40 block">H</label>
                    <input type="number" value={customForm.h} onChange={e => setCustomForm(f => ({ ...f, h: parseInt(e.target.value) || 80 }))}
                      className="w-full border border-border rounded px-1.5 py-1 text-xs font-dm focus:outline-none focus:border-gold" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 items-end">
                  <div>
                    <label className="font-bebas text-[9px] tracking-widest text-ink/40 block">COLOUR</label>
                    <input type="color" value={customForm.color} onChange={e => setCustomForm(f => ({ ...f, color: e.target.value }))}
                      className="w-full h-7 border border-border rounded cursor-pointer" />
                  </div>
                  <div>
                    <label className="font-bebas text-[9px] tracking-widest text-ink/40 block">SEATS</label>
                    <input type="number" value={customForm.seats} min={0}
                      onChange={e => setCustomForm(f => ({ ...f, seats: parseInt(e.target.value) || 0 }))}
                      className="w-full border border-border rounded px-1.5 py-1 text-xs font-dm focus:outline-none focus:border-gold" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={customForm.round} onChange={e => setCustomForm(f => ({ ...f, round: e.target.checked }))}
                      className="accent-forest w-3 h-3" />
                    <span className="font-dm text-xs text-ink/60">Round shape</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleAddCustomItem}
                  className="w-full bg-forest text-white font-bebas tracking-widest text-xs py-1.5 rounded-sm hover:bg-forest/90 transition-colors"
                >
                  ADD TO CANVAS
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main canvas area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        {!readOnly && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-white flex-shrink-0 flex-wrap gap-y-1">
            {/* Plan name */}
            <input
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              className="font-cormorant text-base font-semibold text-ink border-b border-transparent hover:border-gold focus:border-gold outline-none bg-transparent w-40"
            />
            <div className="flex-1" />
            {/* Stats */}
            <span className="text-xs text-ink/50 font-dm">{tableCount} tables · {totalSeats} seats</span>
            <div className="h-4 w-px bg-border" />
            {/* Grid / Snap */}
            <button onClick={() => setShowGrid(g => !g)} className={`p-1.5 rounded text-xs font-bebas tracking-wider ${showGrid ? "bg-burgundy/10 text-burgundy" : "text-ink/40 hover:text-ink"}`}>
              GRID
            </button>
            <button onClick={() => setSnapToGrid(s => !s)} className={`p-1.5 rounded text-xs font-bebas tracking-wider ${snapToGrid ? "bg-burgundy/10 text-burgundy" : "text-ink/40 hover:text-ink"}`}>
              SNAP
            </button>
            <div className="h-4 w-px bg-border" />
            {/* Zoom */}
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="p-1.5 rounded text-ink/40 hover:text-ink"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="text-xs font-dm text-ink/50 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 rounded text-ink/40 hover:text-ink"><ZoomIn className="w-3.5 h-3.5" /></button>
            <div className="h-4 w-px bg-border" />
            {/* Background upload */}
            <label className="cursor-pointer flex items-center gap-1 px-2 py-1.5 rounded border border-dashed border-gold/40 hover:border-gold hover:bg-gold/5 transition-colors" title="Upload background photo (blueprint, venue photo to trace over)">
              <Upload className="w-3 h-3 text-ink/40" />
              <span className="text-xs font-bebas tracking-wider text-ink/50">BG PHOTO</span>
              <input type="file" accept="image/*" className="hidden" onChange={async e => {
                const file = e.target.files?.[0]; if (!file) return;
                const fd = new FormData(); fd.append("file", file);
                const res = await fetch("/api/upload-image", { method: "POST", body: fd });
                const data = await res.json();
                if (data.url) { setBgImageUrl(data.url); toast.success("Background photo set!"); }
                else toast.error("Upload failed");
              }} />
            </label>
            {bgImageUrl && (
              <>
                <input type="range" min={0.1} max={1} step={0.05} value={bgOpacity}
                  onChange={e => setBgOpacity(Number(e.target.value))}
                  className="w-16 accent-forest" title="Background opacity" />
                <button onClick={() => setBgImageUrl("")} className="p-1 text-ink/30 hover:text-red-500 transition-colors" title="Remove background">
                  <X className="w-3 h-3" />
                </button>
              </>
            )}
            <div className="h-4 w-px bg-border" />
            {/* Share */}
            <button
              onClick={handleShare}
              disabled={generateLink.isPending}
              title="Share floor plan via link"
              className="flex items-center gap-1 px-2 py-1.5 border border-gold/30 text-ink/60 hover:text-ink hover:border-gold text-xs font-bebas tracking-wider transition-colors disabled:opacity-40"
            >
              <Share2 className="w-3 h-3" /> SHARE
            </button>
            {/* PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              title="Export floor plan as PDF"
              className="flex items-center gap-1 px-2 py-1.5 border border-gold/30 text-ink/60 hover:text-ink hover:border-gold text-xs font-bebas tracking-wider transition-colors disabled:opacity-40"
            >
              <Download className="w-3 h-3" /> {pdfLoading ? "EXPORTING..." : "PDF"}
            </button>
            <div className="h-4 w-px bg-border" />
            {/* Save */}
            <button onClick={handleSave} disabled={isSaving} className="btn-forest text-cream font-bebas tracking-widest text-xs px-4 py-1.5 flex items-center gap-1 disabled:opacity-50">
              <Save className="w-3 h-3" />
              {isSaving ? "SAVING..." : "SAVE"}
            </button>
          </div>
        )}

        {/* Canvas scroll container */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100" style={{ minHeight: 0 }}>
          <div style={{ padding: "24px", minWidth: canvasData.width * zoom + 48, minHeight: canvasData.height * zoom + 48 }}>
            <div
              ref={canvasRef}
              onDragOver={e => e.preventDefault()}
              onDrop={readOnly ? undefined : handleDrop}
              onClick={e => { if (e.target === canvasRef.current) setSelected(null); }}
              style={{
                width: canvasData.width,
                height: canvasData.height,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                position: "relative",
                backgroundColor: "#faf9f7",
                backgroundImage: showGrid
                  ? `linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)`
                  : undefined,
                backgroundSize: showGrid ? `${GRID}px ${GRID}px` : undefined,
                border: "1px solid #d1c9bc",
                boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
                cursor: "default",
              }}
            >
              {bgImageUrl && (
                <img
                  src={bgImageUrl} alt="Background"
                  style={{
                    position: "absolute", top: 0, left: 0,
                    width: "100%", height: "100%",
                    objectFit: "cover", opacity: bgOpacity,
                    pointerEvents: "none", userSelect: "none", zIndex: 0,
                  }}
                />
              )}
              {canvasData.elements.map(el => (
                <ElementShape
                  key={el.id}
                  el={el}
                  selected={selected === el.id}
                  onSelect={readOnly ? () => {} : setSelected}
                  onDragStart={readOnly ? () => {} : handleDragStart}
                  customPalette={customPalette}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right properties panel ─────────────────────────────────────── */}
      {!readOnly && (
        <div className="w-52 bg-white border-l border-border flex-shrink-0 flex flex-col overflow-y-auto">
          {selectedEl ? (
            <>
              <div className="px-3 py-2 border-b border-border bg-ivory">
                <p className="font-bebas tracking-widest text-xs text-sage">PROPERTIES</p>
                <p className="font-cormorant text-sm font-semibold text-ink mt-0.5 truncate">{getLabel(selectedEl.type, customPalette)}</p>
              </div>
              <div className="p-3 space-y-3 flex-1">
                <div>
                  <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">LABEL</label>
                  <input
                    value={selectedEl.label ?? ""}
                    onChange={e => updateSelected({ label: e.target.value })}
                    className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">COLOR</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedEl.color ?? "#888"}
                      onChange={e => updateSelected({ color: e.target.value })}
                      className="w-8 h-8 border border-border rounded cursor-pointer"
                    />
                    <span className="text-xs font-mono text-ink/50">{selectedEl.color}</span>
                  </div>
                </div>
                {(selectedEl.seats !== undefined) && (
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">SEATS</label>
                    <input
                      type="number" min={0}
                      value={selectedEl.seats ?? 0}
                      onChange={e => updateSelected({ seats: parseInt(e.target.value) || 0 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">WIDTH</label>
                    <input type="number" value={selectedEl.width}
                      onChange={e => updateSelected({ width: parseInt(e.target.value) || 40 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">HEIGHT</label>
                    <input type="number" value={selectedEl.height}
                      onChange={e => updateSelected({ height: parseInt(e.target.value) || 40 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">X</label>
                    <input type="number" value={Math.round(selectedEl.x)}
                      onChange={e => updateSelected({ x: parseInt(e.target.value) || 0 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">Y</label>
                    <input type="number" value={Math.round(selectedEl.y)}
                      onChange={e => updateSelected({ y: parseInt(e.target.value) || 0 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold" />
                  </div>
                </div>
                <div>
                  <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">ROTATION ({selectedEl.rotation}°)</label>
                  <input type="range" min={0} max={359} value={selectedEl.rotation}
                    onChange={e => updateSelected({ rotation: parseInt(e.target.value) })}
                    className="w-full accent-burgundy" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={rotateSelected} className="flex-1 flex items-center justify-center gap-1 border border-border rounded py-1.5 text-xs font-bebas tracking-wider text-ink/60 hover:text-ink hover:border-gold transition-colors">
                    <RotateCw className="w-3 h-3" /> ROTATE
                  </button>
                  <button onClick={deleteSelected} className="flex-1 flex items-center justify-center gap-1 border border-red-200 rounded py-1.5 text-xs font-bebas tracking-wider text-red-400 hover:text-red-600 hover:border-red-400 transition-colors">
                    <Trash2 className="w-3 h-3" /> DELETE
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 text-center flex flex-col items-center justify-center h-full">
              <MousePointer className="w-8 h-8 text-ink/20 mb-2" />
              <p className="font-dm text-xs text-ink/40">Select an element to edit its properties</p>
              <p className="font-dm text-[10px] text-ink/30 mt-2">Or drag elements from the left panel onto the canvas</p>
              <div className="mt-4 border-t border-border w-full pt-3">
                <p className="font-bebas tracking-widest text-[10px] text-sage mb-2">CANVAS SIZE</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">WIDTH</label>
                    <input type="number" value={canvasData.width}
                      onChange={e => setCanvasData(prev => ({ ...prev, width: parseInt(e.target.value) || 900 }))}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold" />
                  </div>
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">HEIGHT</label>
                    <input type="number" value={canvasData.height}
                      onChange={e => setCanvasData(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold" />
                  </div>
                </div>
                <p className="font-dm text-[10px] text-ink/30 mt-2">Del=delete, R=rotate, Esc=deselect</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Share dialog overlay ────────────────────────────────────────── */}
      {showShareDialog && shareUrl && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowShareDialog(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-cormorant text-xl font-semibold text-ink">Share Floor Plan</h3>
              <button onClick={() => setShowShareDialog(false)} className="text-ink/30 hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="font-dm text-sm text-ink/60 mb-4">
              Anyone with this link can view a read-only version of this floor plan.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-4">
              <span className="font-mono text-xs text-ink/60 flex-1 break-all">{shareUrl}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyLink}
                className="flex-1 flex items-center justify-center gap-2 bg-forest text-white font-bebas tracking-widest text-sm py-2.5 rounded-sm hover:bg-forest/90 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "COPIED!" : "COPY LINK"}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="flex items-center justify-center gap-2 border border-gold/30 text-ink px-4 font-bebas tracking-widest text-sm py-2.5 rounded-sm hover:bg-gold/5 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {pdfLoading ? "..." : "PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
