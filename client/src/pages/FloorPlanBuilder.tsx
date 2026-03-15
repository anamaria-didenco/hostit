import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Save, Trash2, RotateCcw, Download, Plus, Package, LayoutGrid, Pencil, X, Check } from "lucide-react";
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

interface InventoryForm {
  name: string;
  type: ElementType;
  color: string;
  width: number;
  height: number;
  seats: string;
  quantity: string;
  notes: string;
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

const TYPE_LABELS: Record<string, string> = {
  round_table: "Round Table", rect_table: "Rect Table", chair: "Chair", bar: "Bar",
  stage: "Stage", dance_floor: "Dance Floor", dj_booth: "DJ Booth", buffet: "Buffet",
  gift_table: "Gift Table", entrance: "Entrance", label: "Text Label",
};

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function ShapePreview({ type, color, w = 36, h = 36 }: { type: string; color: string; w?: number; h?: number }) {
  const isRound = type === "round_table";
  const bg = color === "transparent" ? "transparent" : color;
  return (
    <div
      style={{
        width: w, height: h,
        backgroundColor: bg,
        borderRadius: isRound ? "50%" : 2,
        border: `1.5px solid rgba(0,0,0,0.3)`,
        flexShrink: 0,
      }}
    />
  );
}

const BLANK_FORM: InventoryForm = {
  name: "", type: "rect_table", color: "#d4a574",
  width: 120, height: 60, seats: "", quantity: "", notes: "",
};

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
  const [sidebarTab, setSidebarTab] = useState<"elements" | "inventory">("elements");
  const canvasRef = useRef<HTMLDivElement>(null);

  // Inventory state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [invForm, setInvForm] = useState<InventoryForm>(BLANK_FORM);

  // Load existing plan
  const { data: existingPlan } = trpc.floorPlans.get.useQuery(
    { id: planId! },
    { enabled: !!planId && !!user }
  );

  // Inventory queries/mutations
  const { data: inventory, refetch: refetchInventory } = trpc.furnitureInventory.list.useQuery(
    undefined, { enabled: !!user }
  );
  const createInventoryItem = trpc.furnitureInventory.create.useMutation({
    onSuccess: () => { refetchInventory(); setShowAddForm(false); setInvForm(BLANK_FORM); toast.success("Item added to inventory"); },
    onError: () => toast.error("Failed to add item"),
  });
  const updateInventoryItem = trpc.furnitureInventory.update.useMutation({
    onSuccess: () => { refetchInventory(); setEditingId(null); setInvForm(BLANK_FORM); toast.success("Item updated"); },
    onError: () => toast.error("Failed to update item"),
  });
  const deleteInventoryItem = trpc.furnitureInventory.delete.useMutation({
    onSuccess: () => { refetchInventory(); toast.success("Item removed"); },
    onError: () => toast.error("Failed to remove item"),
  });

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
    onSuccess: (data) => { setSavedPlanId(data.id); toast.success("Floor plan saved!"); },
    onError: () => toast.error("Failed to save floor plan"),
  });

  const handleSave = () => {
    savePlan.mutate({ id: savedPlanId, bookingId, name: planName, canvasData: { elements, canvasSize } });
  };

  const addElement = (type: ElementType, overrides?: Partial<FloorElement>) => {
    const def = ELEMENT_DEFS.find(d => d.type === type)!;
    const el: FloorElement = {
      id: generateId(),
      type,
      x: 50 + Math.random() * 200,
      y: 50 + Math.random() * 200,
      w: overrides?.w ?? def.defaultW,
      h: overrides?.h ?? def.defaultH,
      color: overrides?.color ?? def.defaultColor,
      label: overrides?.label ?? def.label,
      seats: overrides?.seats ?? def.defaultSeats,
    };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  };

  const addFromInventory = (item: any) => {
    const el: FloorElement = {
      id: generateId(),
      type: item.type as ElementType,
      x: 50 + Math.random() * 200,
      y: 50 + Math.random() * 200,
      w: item.width,
      h: item.height,
      color: item.color,
      label: item.name,
      seats: item.seats ?? undefined,
    };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
    toast.success(`Added "${item.name}" to floor plan`);
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

  const onMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const el = elements.find(el => el.id === id);
    if (!el) return;
    setSelectedId(id);
    const rect = canvasRef.current!.getBoundingClientRect();
    setDragging({ id, offsetX: (e.clientX - rect.left) / zoom - el.x, offsetY: (e.clientY - rect.top) / zoom - el.y });
  }, [elements, zoom]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, (e.clientX - rect.left) / zoom - dragging.offsetX);
    const y = Math.max(0, (e.clientY - rect.top) / zoom - dragging.offsetY);
    setElements(prev => prev.map(el => el.id === dragging.id ? { ...el, x, y } : el));
  }, [dragging, zoom]);

  const onMouseUp = useCallback(() => { setDragging(null); setResizing(null); }, []);

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

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setShowAddForm(false);
    setInvForm({
      name: item.name, type: item.type, color: item.color,
      width: item.width, height: item.height,
      seats: item.seats?.toString() ?? "", quantity: item.quantity?.toString() ?? "",
      notes: item.notes ?? "",
    });
  };

  const handleSaveInventoryItem = () => {
    if (!invForm.name.trim()) { toast.error("Name is required"); return; }
    const payload = {
      name: invForm.name.trim(),
      type: invForm.type,
      color: invForm.color,
      width: invForm.width,
      height: invForm.height,
      seats: invForm.seats ? parseInt(invForm.seats) : undefined,
      quantity: invForm.quantity ? parseInt(invForm.quantity) : undefined,
      notes: invForm.notes || undefined,
    };
    if (editingId) {
      updateInventoryItem.mutate({ id: editingId, ...payload });
    } else {
      createInventoryItem.mutate(payload);
    }
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setInvForm(BLANK_FORM);
  };

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><div className="font-bebas text-xl tracking-widest text-muted-foreground">LOADING...</div></div>;
  if (!isAuthenticated) { setLocation("/"); return null; }

  const isFormOpen = showAddForm || editingId !== null;

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
        {/* Sidebar */}
        <aside className="w-60 bg-ink/95 text-cream flex flex-col flex-shrink-0 print:hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-cream/10">
            <button
              onClick={() => setSidebarTab("elements")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-bebas text-xs tracking-widest transition-colors ${sidebarTab === "elements" ? "bg-cream/10 text-cream" : "text-cream/40 hover:text-cream/70"}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> ELEMENTS
            </button>
            <button
              onClick={() => setSidebarTab("inventory")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 font-bebas text-xs tracking-widest transition-colors ${sidebarTab === "inventory" ? "bg-cream/10 text-cream" : "text-cream/40 hover:text-cream/70"}`}
            >
              <Package className="w-3.5 h-3.5" /> INVENTORY
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ── ELEMENTS TAB ── */}
            {sidebarTab === "elements" && (
              <div className="p-3">
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
              </div>
            )}

            {/* ── INVENTORY TAB ── */}
            {sidebarTab === "inventory" && (
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bebas text-xs tracking-widest text-cream/40">MY FURNITURE</div>
                  {!isFormOpen && (
                    <button
                      onClick={() => { setShowAddForm(true); setEditingId(null); setInvForm(BLANK_FORM); }}
                      className="flex items-center gap-1 font-bebas text-xs tracking-widest text-amber hover:text-amber/80 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> ADD
                    </button>
                  )}
                </div>

                {/* Add / Edit Form */}
                {isFormOpen && (
                  <div className="bg-cream/5 border border-cream/10 rounded p-3 space-y-2">
                    <div className="font-bebas text-xs tracking-widest text-cream/60 mb-1">
                      {editingId ? "EDIT ITEM" : "NEW ITEM"}
                    </div>

                    <div>
                      <label className="font-dm text-[10px] text-cream/40 block mb-0.5">NAME *</label>
                      <Input
                        value={invForm.name}
                        onChange={e => setInvForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Round Table White"
                        className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber"
                      />
                    </div>

                    <div>
                      <label className="font-dm text-[10px] text-cream/40 block mb-0.5">SHAPE</label>
                      <select
                        value={invForm.type}
                        onChange={e => {
                          const t = e.target.value as ElementType;
                          const def = ELEMENT_DEFS.find(d => d.type === t)!;
                          setInvForm(f => ({ ...f, type: t, width: def.defaultW, height: def.defaultH }));
                        }}
                        className="w-full bg-cream/10 border border-cream/20 text-cream text-xs h-7 px-2 focus:outline-none focus:border-amber"
                      >
                        {ELEMENT_DEFS.filter(d => d.type !== "label").map(d => (
                          <option key={d.type} value={d.type} className="bg-ink">{d.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-dm text-[10px] text-cream/40 block mb-0.5">COLOUR</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={invForm.color}
                          onChange={e => setInvForm(f => ({ ...f, color: e.target.value }))}
                          className="w-8 h-7 rounded border border-cream/20 bg-transparent cursor-pointer flex-shrink-0"
                        />
                        <ShapePreview type={invForm.type} color={invForm.color} w={invForm.width > invForm.height ? 40 : 28} h={28} />
                        <span className="font-dm text-[10px] text-cream/40">{invForm.color}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-dm text-[10px] text-cream/40 block mb-0.5">WIDTH (px)</label>
                        <Input type="number" min="20" value={invForm.width}
                          onChange={e => setInvForm(f => ({ ...f, width: parseInt(e.target.value) || 20 }))}
                          className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                      </div>
                      <div>
                        <label className="font-dm text-[10px] text-cream/40 block mb-0.5">HEIGHT (px)</label>
                        <Input type="number" min="20" value={invForm.height}
                          onChange={e => setInvForm(f => ({ ...f, height: parseInt(e.target.value) || 20 }))}
                          className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-dm text-[10px] text-cream/40 block mb-0.5">SEATS</label>
                        <Input type="number" min="1" value={invForm.seats} placeholder="–"
                          onChange={e => setInvForm(f => ({ ...f, seats: e.target.value }))}
                          className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                      </div>
                      <div>
                        <label className="font-dm text-[10px] text-cream/40 block mb-0.5">QTY OWNED</label>
                        <Input type="number" min="1" value={invForm.quantity} placeholder="–"
                          onChange={e => setInvForm(f => ({ ...f, quantity: e.target.value }))}
                          className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                      </div>
                    </div>

                    <div>
                      <label className="font-dm text-[10px] text-cream/40 block mb-0.5">NOTES</label>
                      <Input value={invForm.notes} placeholder="e.g. Stored in back room"
                        onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))}
                        className="bg-cream/10 border-cream/20 text-cream text-xs rounded-none h-7 focus-visible:ring-0 focus-visible:border-amber" />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={cancelForm}
                        className="flex items-center gap-1 font-bebas text-xs tracking-widest text-cream/40 hover:text-cream/70 px-2 py-1.5 border border-cream/20 transition-colors"
                      >
                        <X className="w-3 h-3" /> CANCEL
                      </button>
                      <button
                        onClick={handleSaveInventoryItem}
                        disabled={createInventoryItem.isPending || updateInventoryItem.isPending}
                        className="flex-1 flex items-center justify-center gap-1 font-bebas text-xs tracking-widest bg-amber text-ink hover:bg-amber/80 px-2 py-1.5 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> SAVE ITEM
                      </button>
                    </div>
                  </div>
                )}

                {/* Inventory list */}
                {!inventory || inventory.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="w-8 h-8 text-cream/20 mx-auto mb-2" />
                    <p className="font-dm text-xs text-cream/30">No furniture added yet</p>
                    <p className="font-dm text-[10px] text-cream/20 mt-1">Add your tables and chairs above</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(inventory as any[]).map((item) => (
                      <div
                        key={item.id}
                        className={`group rounded border transition-colors ${editingId === item.id ? "border-amber/40 bg-cream/5" : "border-cream/10 hover:border-cream/20 bg-cream/5"}`}
                      >
                        {editingId === item.id ? (
                          <div className="p-2 flex items-center gap-2">
                            <ShapePreview type={item.type} color={item.color} />
                            <span className="font-dm text-xs text-amber flex-1 truncate">{item.name} (editing…)</span>
                          </div>
                        ) : (
                          <div className="p-2 flex items-start gap-2">
                            {/* Shape preview */}
                            <button
                              onClick={() => addFromInventory(item)}
                              title={`Add "${item.name}" to floor plan`}
                              className="flex-shrink-0 mt-0.5 hover:scale-110 transition-transform"
                            >
                              <ShapePreview type={item.type} color={item.color} />
                            </button>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-dm text-xs text-cream/90 truncate font-medium">{item.name}</div>
                              <div className="font-dm text-[10px] text-cream/40 mt-0.5">
                                {TYPE_LABELS[item.type] ?? item.type}
                                {item.seats ? ` · ${item.seats} seats` : ""}
                                {item.quantity ? ` · ×${item.quantity}` : ""}
                              </div>
                              {item.notes && (
                                <div className="font-dm text-[10px] text-cream/30 truncate mt-0.5 italic">{item.notes}</div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEdit(item)}
                                className="p-1 text-cream/40 hover:text-cream/80 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => { if (confirm(`Remove "${item.name}" from inventory?`)) deleteInventoryItem.mutate({ id: item.id }); }}
                                className="p-1 text-red-400/60 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Add to plan button */}
                        {editingId !== item.id && (
                          <button
                            onClick={() => addFromInventory(item)}
                            className="w-full text-left px-2 pb-1.5 font-bebas text-[10px] tracking-widest text-cream/30 hover:text-amber transition-colors"
                          >
                            + ADD TO FLOOR PLAN
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                width: canvasSize.w, height: canvasSize.h,
                transform: `scale(${zoom})`, transformOrigin: "top left",
                position: "relative", background: "white",
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
                      position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      background: el.color === "transparent" ? "transparent" : el.color,
                      border: isSelected ? "2px solid #7c1c1c" : "1.5px solid rgba(0,0,0,0.25)",
                      borderRadius: isRound ? "50%" : el.type === "dj_booth" ? "4px" : "2px",
                      cursor: "grab", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center",
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
                    {isSelected && (
                      <div
                        style={{ position: "absolute", bottom: -4, right: -4, width: 10, height: 10, background: "#7c1c1c", cursor: "se-resize", borderRadius: 2 }}
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
