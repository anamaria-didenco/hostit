import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Save, Trash2, RotateCcw, Download, Plus, Move } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// ─── Element types ──────────────────────────────────────────────────────────
type ElementType = "round_table" | "rect_table" | "chair" | "bar" | "stage" | "dance_floor" | "dj_booth" | "buffet" | "gift_table" | "entrance" | "label";

interface FloorElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  rotation?: number;
  color?: string;
  seats?: number;
}

const ELEMENT_DEFS: { type: ElementType; label: string; emoji: string; defaultW: number; defaultH: number; defaultColor: string; defaultSeats?: number }[] = [
  { type: "round_table", label: "Round Table", emoji: "⭕", defaultW: 80, defaultH: 80, defaultColor: "#d4a574", defaultSeats: 8 },
  { type: "rect_table", label: "Rect Table", emoji: "⬜", defaultW: 120, defaultH: 60, defaultColor: "#d4a574", defaultSeats: 6 },
  { type: "chair", label: "Chair", emoji: "🪑", defaultW: 30, defaultH: 30, defaultColor: "#8b7355" },
  { type: "bar", label: "Bar", emoji: "🍷", defaultW: 160, defaultH: 50, defaultColor: "#5c1a1a" },
  { type: "stage", label: "Stage", emoji: "🎤", defaultW: 200, defaultH: 80, defaultColor: "#2d4a3e" },
  { type: "dance_floor", label: "Dance Floor", emoji: "💃", defaultW: 200, defaultH: 200, defaultColor: "#1a1a2e" },
  { type: "dj_booth", label: "DJ Booth", emoji: "🎧", defaultW: 80, defaultH: 60, defaultColor: "#2d2d2d" },
  { type: "buffet", label: "Buffet", emoji: "🍽", defaultW: 160, defaultH: 50, defaultColor: "#8b4513" },
  { type: "gift_table", label: "Gift Table", emoji: "🎁", defaultW: 100, defaultH: 50, defaultColor: "#6b8e6b" },
  { type: "entrance", label: "Entrance", emoji: "🚪", defaultW: 60, defaultH: 20, defaultColor: "#4a4a4a" },
  { type: "label", label: "Text Label", emoji: "🏷", defaultW: 100, defaultH: 40, defaultColor: "transparent" },
];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function FloorPlanBuilder() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  const bookingId = parseInt(new URLSearchParams(window.location.search).get("bookingId") ?? "0") || undefined;
  const planId = parseInt(new URLSearchParams(window.location.search).get("planId") ?? "0") || undefined;

  const [planName, setPlanName] = useState("Floor Plan");
  const [elements, setElements] = useState<FloorElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);
  const [canvasSize] = useState({ w: 900, h: 600 });
  const [zoom, setZoom] = useState(1);
  const [savedPlanId, setSavedPlanId] = useState<number | undefined>(planId);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load existing plan
  const { data: existingPlan } = trpc.floorPlans.get.useQuery(
    { id: planId! },
    { enabled: !!planId && !!user }
  );

  useEffect(() => {
    if (existingPlan) {
      setPlanName(existingPlan.name);
      if (existingPlan.canvasData) {
        const data = existingPlan.canvasData as any;
        if (data.elements) setElements(data.elements);
      }
    }
  }, [existingPlan]);

  const savePlan = trpc.floorPlans.save.useMutation({
    onSuccess: (data) => {
      setSavedPlanId(data.id);
      toast.success("Floor plan saved!");
    },
    onError: () => toast.error("Failed to save floor plan"),
  });

  const handleSave = () => {
    savePlan.mutate({
      id: savedPlanId,
      bookingId,
      name: planName,
      canvasData: { elements, canvasSize },
    });
  };

  const addElement = (type: ElementType) => {
    const def = ELEMENT_DEFS.find(d => d.type === type)!;
    const el: FloorElement = {
      id: generateId(),
      type,
      x: 50 + Math.random() * 200,
      y: 50 + Math.random() * 200,
      w: def.defaultW,
      h: def.defaultH,
      color: def.defaultColor,
      label: def.label,
      seats: def.defaultSeats,
    };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setElements(prev => prev.filter(e => e.id !== selectedId));
    setSelectedId(null);
  };

  const clearAll = () => {
    if (!confirm("Clear all elements?")) return;
    setElements([]);
    setSelectedId(null);
  };

  const selectedEl = elements.find(e => e.id === selectedId);

  const updateSelected = (field: keyof FloorElement, value: any) => {
    setElements(prev => prev.map(e => e.id === selectedId ? { ...e, [field]: value } : e));
  };

  // Mouse drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const el = elements.find(el => el.id === id);
    if (!el) return;
    setSelectedId(id);
    const rect = canvasRef.current!.getBoundingClientRect();
    setDragging({
      id,
      offsetX: (e.clientX - rect.left) / zoom - el.x,
      offsetY: (e.clientY - rect.top) / zoom - el.y,
    });
  }, [elements, zoom]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, (e.clientX - rect.left) / zoom - dragging.offsetX);
    const y = Math.max(0, (e.clientY - rect.top) / zoom - dragging.offsetY);
    setElements(prev => prev.map(el => el.id === dragging.id ? { ...el, x, y } : el));
  }, [dragging, zoom]);

  const onMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  const onResizeStart = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const el = elements.find(el => el.id === id);
    if (!el) return;
    setResizing({ id, startX: e.clientX, startY: e.clientY, startW: el.w, startH: el.h });
  }, [elements]);

  const onResizeMove = useCallback((e: React.MouseEvent) => {
    if (!resizing) return;
    const dx = (e.clientX - resizing.startX) / zoom;
    const dy = (e.clientY - resizing.startY) / zoom;
    setElements(prev => prev.map(el => el.id === resizing.id
      ? { ...el, w: Math.max(20, resizing.startW + dx), h: Math.max(20, resizing.startH + dy) }
      : el
    ));
  }, [resizing, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) onMouseMove(e);
    if (resizing) onResizeMove(e);
  }, [dragging, resizing, onMouseMove, onResizeMove]);

  const handlePrint = () => window.print();

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><div className="font-bebas text-xl tracking-widest text-muted-foreground">LOADING...</div></div>;
  if (!isAuthenticated) { setLocation("/"); return null; }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Nav */}
      <nav className="bg-ink text-cream px-6 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <button className="flex items-center gap-2 font-bebas text-xs tracking-widest text-cream/60 hover:text-cream">
              <ChevronLeft className="w-4 h-4" /> BACK TO DASHBOARD
            </button>
          </Link>
          <div className="w-px h-4 bg-cream/20" />
          <Input
            value={planName}
            onChange={e => setPlanName(e.target.value)}
            className="bg-transparent border-0 border-b border-cream/30 rounded-none text-cream font-bebas tracking-widest text-sm focus-visible:ring-0 focus-visible:border-amber h-7 px-0 w-48"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-dm text-xs text-cream/40">Zoom</span>
          <input type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))}
            className="w-20 accent-amber" />
          <span className="font-dm text-xs text-cream/60">{Math.round(zoom * 100)}%</span>
          <Button onClick={handlePrint} variant="outline" size="sm" className="font-bebas tracking-widest text-xs border-cream/30 text-cream hover:bg-cream/10">
            <Download className="w-3.5 h-3.5 mr-1" /> PRINT
          </Button>
          <Button onClick={handleSave} disabled={savePlan.isPending} size="sm"
            className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest text-xs rounded-none">
            <Save className="w-3.5 h-3.5 mr-1" />
            {savePlan.isPending ? "SAVING..." : "SAVE"}
          </Button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden print:block">
        {/* Sidebar — element palette */}
        <aside className="w-52 bg-ink/95 text-cream p-3 overflow-y-auto flex-shrink-0 print:hidden">
          <div className="font-bebas text-xs tracking-widest text-cream/40 mb-3">ADD ELEMENTS</div>
          <div className="space-y-1">
            {ELEMENT_DEFS.map(def => (
              <button
                key={def.type}
                onClick={() => addElement(def.type)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream/10 rounded text-sm font-dm text-cream/80 hover:text-cream transition-colors"
              >
                <span className="text-base">{def.emoji}</span>
                <span>{def.label}</span>
              </button>
            ))}
          </div>

          {/* Selected element properties */}
          {selectedEl && (
            <div className="mt-4 border-t border-cream/20 pt-4 space-y-3">
              <div className="font-bebas text-xs tracking-widest text-cream/40">PROPERTIES</div>
              <div>
                <label className="font-dm text-xs text-cream/50 block mb-1">Label</label>
                <Input value={selectedEl.label ?? ""} onChange={e => updateSelected("label", e.target.value)}
                  className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
              </div>
              {selectedEl.seats !== undefined && (
                <div>
                  <label className="font-dm text-xs text-cream/50 block mb-1">Seats</label>
                  <Input type="number" min="1" value={selectedEl.seats} onChange={e => updateSelected("seats", parseInt(e.target.value) || 1)}
                    className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-dm text-xs text-cream/50 block mb-1">W (px)</label>
                  <Input type="number" min="20" value={Math.round(selectedEl.w)} onChange={e => updateSelected("w", parseInt(e.target.value) || 20)}
                    className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                </div>
                <div>
                  <label className="font-dm text-xs text-cream/50 block mb-1">H (px)</label>
                  <Input type="number" min="20" value={Math.round(selectedEl.h)} onChange={e => updateSelected("h", parseInt(e.target.value) || 20)}
                    className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                </div>
              </div>
              <div>
                <label className="font-dm text-xs text-cream/50 block mb-1">Colour</label>
                <input type="color" value={selectedEl.color ?? "#d4a574"} onChange={e => updateSelected("color", e.target.value)}
                  className="w-full h-7 rounded border border-cream/20 bg-transparent cursor-pointer" />
              </div>
              <div>
                <label className="font-dm text-xs text-cream/50 block mb-1">Rotation (°)</label>
                <Input type="number" min="0" max="360" value={selectedEl.rotation ?? 0} onChange={e => updateSelected("rotation", parseInt(e.target.value) || 0)}
                  className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
              </div>
              <Button onClick={deleteSelected} variant="outline" size="sm"
                className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 font-bebas tracking-widest text-xs rounded-none">
                <Trash2 className="w-3 h-3 mr-1" /> DELETE
              </Button>
            </div>
          )}

          <div className="mt-4 border-t border-cream/20 pt-3">
            <Button onClick={clearAll} variant="outline" size="sm"
              className="w-full border-cream/20 text-cream/50 hover:bg-cream/10 font-bebas tracking-widest text-xs rounded-none">
              <RotateCcw className="w-3 h-3 mr-1" /> CLEAR ALL
            </Button>
          </div>
        </aside>

        {/* Canvas area */}
        <main className="flex-1 overflow-auto bg-stone-100 p-6 print:p-0 print:overflow-visible">
          <div
            style={{ width: canvasSize.w * zoom, height: canvasSize.h * zoom, position: "relative" }}
            className="mx-auto print:mx-0"
          >
            <div
              ref={canvasRef}
              style={{
                width: canvasSize.w,
                height: canvasSize.h,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                position: "relative",
                background: "white",
                backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
                backgroundSize: "20px 20px",
                border: "2px solid #d1d5db",
                cursor: dragging ? "grabbing" : "default",
                userSelect: "none",
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onClick={() => setSelectedId(null)}
            >
              {elements.map(el => {
                const isSelected = el.id === selectedId;
                const def = ELEMENT_DEFS.find(d => d.type === el.type)!;
                const isRound = el.type === "round_table";
                return (
                  <div
                    key={el.id}
                    style={{
                      position: "absolute",
                      left: el.x,
                      top: el.y,
                      width: el.w,
                      height: el.h,
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      background: el.color === "transparent" ? "transparent" : el.color,
                      border: isSelected ? "2px solid #7c1c1c" : "1.5px solid rgba(0,0,0,0.25)",
                      borderRadius: isRound ? "50%" : el.type === "dj_booth" ? "4px" : "2px",
                      cursor: "grab",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: isSelected ? "0 0 0 2px rgba(124,28,28,0.3)" : "0 1px 3px rgba(0,0,0,0.15)",
                      zIndex: isSelected ? 10 : 1,
                    }}
                    onMouseDown={e => onMouseDown(e, el.id)}
                  >
                    <span style={{ fontSize: el.w < 50 ? "12px" : "16px", lineHeight: 1 }}>{def.emoji}</span>
                    {el.label && el.w >= 50 && (
                      <span style={{ fontSize: "9px", color: el.color === "transparent" ? "#333" : "white", fontFamily: "sans-serif", textAlign: "center", padding: "0 2px", lineHeight: 1.2, marginTop: 2 }}>
                        {el.label}{el.seats ? ` (${el.seats})` : ""}
                      </span>
                    )}
                    {/* Resize handle */}
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute", bottom: -4, right: -4,
                          width: 10, height: 10, background: "#7c1c1c",
                          cursor: "se-resize", borderRadius: 2,
                        }}
                        onMouseDown={e => onResizeStart(e, el.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 mx-auto flex flex-wrap gap-3 print:mt-2" style={{ maxWidth: canvasSize.w * zoom }}>
            {Array.from(new Set(elements.map(e => e.type))).map(type => {
              const def = ELEMENT_DEFS.find(d => d.type === type)!;
              const count = elements.filter(e => e.type === type).length;
              const seats = elements.filter(e => e.type === type && e.seats).reduce((s, e) => s + (e.seats ?? 0), 0);
              return (
                <div key={type} className="flex items-center gap-1.5 bg-white border border-stone-200 px-2 py-1 rounded text-xs font-dm text-stone-600">
                  <span>{def.emoji}</span>
                  <span>{def.label} ×{count}{seats > 0 ? ` (${seats} seats)` : ""}</span>
                </div>
              );
            })}
            {elements.length > 0 && (
              <div className="flex items-center gap-1.5 bg-burgundy/10 border border-burgundy/20 px-2 py-1 rounded text-xs font-dm text-burgundy font-semibold">
                Total seats: {elements.reduce((s, e) => s + (e.seats ?? 0), 0)}
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        @media print {
          body { background: white; }
          nav, aside, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
