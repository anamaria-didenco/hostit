import { useState, useRef, useCallback, useEffect } from "react";
import { Trash2, RotateCw, ZoomIn, ZoomOut, Move, MousePointer, Download, Save, Plus } from "lucide-react";

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

const ELEMENT_COLORS: Record<string, string> = {
  "round-table-6": "#d4b896",
  "round-table-8": "#d4b896",
  "rect-table-6": "#c8a97e",
  "rect-table-8": "#c8a97e",
  "rect-table-10": "#c8a97e",
  "cocktail-table": "#b8956a",
  "bar": "#8B4513",
  "stage": "#4a4a4a",
  "dance-floor": "#6b6b6b",
  "dj-booth": "#333",
  "chair": "#a0856c",
  "sofa": "#8B7355",
  "entrance": "#2d6a4f",
  "plant": "#40916c",
  "buffet": "#9c6644",
  "photo-booth": "#7b2d8b",
  "text": "#1a1a1a",
  "wall": "#555",
  "pillar": "#888",
};

function isRound(type: string) {
  return type === "round-table-6" || type === "round-table-8" || type === "cocktail-table" || type === "chair" || type === "plant" || type === "pillar";
}

function getLabel(type: string) {
  return PALETTE.find(p => p.type === type)?.label ?? type;
}

// ─── Render a single element on the canvas ───────────────────────────────────
function ElementShape({ el, selected, onSelect, onDragStart }: {
  el: FPElement;
  selected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
}) {
  const color = el.color ?? ELEMENT_COLORS[el.type] ?? "#888";
  const round = isRound(el.type);
  const borderRadius = round ? "50%" : el.type === "stage" || el.type === "dance-floor" ? "4px" : "3px";
  const isText = el.type === "text";

  return (
    <div
      onMouseDown={(e) => { onSelect(el.id); onDragStart(e, el.id); }}
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        transform: `rotate(${el.rotation}deg)`,
        transformOrigin: "center center",
        cursor: "grab",
        userSelect: "none",
        zIndex: selected ? 10 : 1,
      }}
    >
      {isText ? (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          fontWeight: 600,
          color: color,
          border: selected ? "2px dashed #C8102E" : "1px dashed #ccc",
          borderRadius: "2px",
          padding: "2px 4px",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}>
          {el.label ?? "Label"}
        </div>
      ) : (
        <div style={{
          width: "100%",
          height: "100%",
          backgroundColor: color,
          borderRadius,
          border: selected ? "2px solid #C8102E" : "1.5px solid rgba(0,0,0,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "1px",
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
  onSave?: (data: CanvasData, name: string) => void;
  isSaving?: boolean;
  readOnly?: boolean;
}

export default function FloorPlanEditor({ initialData, name: initialName = "Floor Plan", onSave, isSaving, readOnly }: FloorPlanEditorProps) {
  const [canvasData, setCanvasData] = useState<CanvasData>(initialData ?? { width: 900, height: 600, elements: [] });
  const [planName, setPlanName] = useState(initialName);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const GRID = 20;

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origScrollX: number; origScrollY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const snap = useCallback((v: number) => snapToGrid ? Math.round(v / GRID) * GRID : v, [snapToGrid]);

  // ── Drag element ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    if (readOnly || tool !== "select") return;
    e.preventDefault();
    const el = canvasData.elements.find(x => x.id === id);
    if (!el) return;
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
  }, [canvasData.elements, tool, readOnly]);

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
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("fp-type");
    if (!type) return;
    const palette = PALETTE.find(p => p.type === type);
    if (!palette) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = snap((e.clientX - rect.left) / zoom - palette.w / 2);
    const y = snap((e.clientY - rect.top) / zoom - palette.h / 2);
    const newEl: FPElement = {
      id: `${type}-${Date.now()}`,
      type,
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: palette.w,
      height: palette.h,
      rotation: 0,
      label: palette.label,
      color: palette.color,
      seats: palette.seats,
    };
    setCanvasData(prev => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelected(newEl.id);
  }, [zoom, snap]);

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
    if (onSave) onSave(canvasData, planName);
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

  const totalSeats = canvasData.elements.reduce((sum, el) => sum + (el.seats ?? 0), 0);
  const tableCount = canvasData.elements.filter(el => el.type.includes("table")).length;

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>
      {/* ── Left palette ──────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="w-44 bg-ivory border-r border-border flex flex-col flex-shrink-0 overflow-y-auto">
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
                <span style={{ color: item.color, fontSize: "14px", flexShrink: 0 }}>{item.icon}</span>
                <span className="font-dm text-xs text-ink/70 group-hover:text-ink truncate">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main canvas area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        {!readOnly && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-white flex-shrink-0 flex-wrap">
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
            {/* Tools */}
            <button onClick={() => setTool("select")} title="Select (S)" className={`p-1.5 rounded ${tool === "select" ? "bg-burgundy/10 text-burgundy" : "text-ink/40 hover:text-ink"}`}>
              <MousePointer className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowGrid(g => !g)} title="Toggle grid" className={`p-1.5 rounded text-xs font-bebas tracking-wider ${showGrid ? "bg-burgundy/10 text-burgundy" : "text-ink/40 hover:text-ink"}`}>
              GRID
            </button>
            <button onClick={() => setSnapToGrid(s => !s)} title="Snap to grid" className={`p-1.5 rounded text-xs font-bebas tracking-wider ${snapToGrid ? "bg-burgundy/10 text-burgundy" : "text-ink/40 hover:text-ink"}`}>
              SNAP
            </button>
            <div className="h-4 w-px bg-border" />
            {/* Zoom */}
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="p-1.5 rounded text-ink/40 hover:text-ink"><ZoomOut className="w-3.5 h-3.5" /></button>
            <span className="text-xs font-dm text-ink/50 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1.5 rounded text-ink/40 hover:text-ink"><ZoomIn className="w-3.5 h-3.5" /></button>
            <div className="h-4 w-px bg-border" />
            {/* Save */}
            <button onClick={handleSave} disabled={isSaving} className="btn-forest text-cream font-bebas tracking-widest text-xs px-4 py-1.5 flex items-center gap-1 disabled:opacity-50">
              <Save className="w-3 h-3" />
              {isSaving ? "SAVING..." : "SAVE"}
            </button>
          </div>
        )}

        {/* Canvas scroll container */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-100"
          style={{ minHeight: 0 }}
        >
          <div style={{ padding: "24px", minWidth: canvasData.width * zoom + 48, minHeight: canvasData.height * zoom + 48 }}>
            <div
              ref={canvasRef}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
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
                cursor: tool === "pan" ? "grab" : "default",
              }}
            >
              {canvasData.elements.map(el => (
                <ElementShape
                  key={el.id}
                  el={el}
                  selected={selected === el.id}
                  onSelect={setSelected}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right properties panel ────────────────────────────────────────── */}
      {!readOnly && (
        <div className="w-52 bg-white border-l border-border flex-shrink-0 flex flex-col overflow-y-auto">
          {selectedEl ? (
            <>
              <div className="px-3 py-2 border-b border-border bg-ivory">
                <p className="font-bebas tracking-widest text-xs text-sage">PROPERTIES</p>
                <p className="font-cormorant text-sm font-semibold text-ink mt-0.5 truncate">{getLabel(selectedEl.type)}</p>
              </div>
              <div className="p-3 space-y-3 flex-1">
                {/* Label */}
                <div>
                  <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">LABEL</label>
                  <input
                    value={selectedEl.label ?? ""}
                    onChange={e => updateSelected({ label: e.target.value })}
                    className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                  />
                </div>
                {/* Color */}
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
                {/* Seats */}
                {(selectedEl.seats !== undefined) && (
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">SEATS</label>
                    <input
                      type="number"
                      min={0}
                      value={selectedEl.seats ?? 0}
                      onChange={e => updateSelected({ seats: parseInt(e.target.value) || 0 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                )}
                {/* Size */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">WIDTH</label>
                    <input
                      type="number"
                      value={selectedEl.width}
                      onChange={e => updateSelected({ width: parseInt(e.target.value) || 40 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">HEIGHT</label>
                    <input
                      type="number"
                      value={selectedEl.height}
                      onChange={e => updateSelected({ height: parseInt(e.target.value) || 40 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                </div>
                {/* Position */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedEl.x)}
                      onChange={e => updateSelected({ x: parseInt(e.target.value) || 0 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedEl.y)}
                      onChange={e => updateSelected({ y: parseInt(e.target.value) || 0 })}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                </div>
                {/* Rotation */}
                <div>
                  <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">ROTATION ({selectedEl.rotation}°)</label>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={selectedEl.rotation}
                    onChange={e => updateSelected({ rotation: parseInt(e.target.value) })}
                    className="w-full accent-burgundy"
                  />
                </div>
                {/* Actions */}
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
                    <input
                      type="number"
                      value={canvasData.width}
                      onChange={e => setCanvasData(prev => ({ ...prev, width: parseInt(e.target.value) || 900 }))}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                  <div>
                    <label className="font-bebas text-[10px] tracking-widest text-sage block mb-1">HEIGHT</label>
                    <input
                      type="number"
                      value={canvasData.height}
                      onChange={e => setCanvasData(prev => ({ ...prev, height: parseInt(e.target.value) || 600 }))}
                      className="w-full border border-border rounded px-2 py-1 text-xs font-dm text-ink focus:outline-none focus:border-gold"
                    />
                  </div>
                </div>
                <p className="font-dm text-[10px] text-ink/30 mt-2">Keyboard: Del=delete, R=rotate, Esc=deselect</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
