import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RichTextarea } from "@/components/ui/RichTextarea";
import {
  Plus, Trash2, ArrowLeft, Printer, Clock, ChevronDown, ChevronUp, ChevronRight,
  GripVertical, Save, FileText, Leaf, Building2, Link as LinkIcon,
  UtensilsCrossed, ChefHat, User, Phone, Mail, CheckSquare, Square,
  MoveUp, MoveDown, Copy, AlertCircle, Settings2, X,
  Sparkles, LayoutGrid, Users, Share2, ExternalLink, Key, Clipboard, RefreshCw, Wine, Package,
  Eye, EyeOff, DollarSign, Download, ClipboardList, Calendar, Pencil, Camera,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getLoginUrl } from "@/const";
import EventSpendSection from "@/components/EventSpendSection";

function SortableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 20 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style} className="group/sortable">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 h-[46px] w-5 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 no-print opacity-0 group-hover/sortable:opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <GripVertical className="w-3.5 h-3.5 text-ink/30" />
      </div>
      {children}
    </div>
  );
}

const CATEGORIES = [
  { value: "setup", label: "Setup", color: "bg-blue-100 text-blue-700" },
  { value: "guest", label: "Guest", color: "bg-purple-100 text-purple-700" },
  { value: "food", label: "Food", color: "bg-amber-100 text-amber-700" },
  { value: "beverage", label: "Beverage", color: "bg-blue-100 text-blue-700" },
  { value: "speech", label: "Speech", color: "bg-pink-100 text-pink-700" },
  { value: "entertainment", label: "Entertainment", color: "bg-indigo-100 text-indigo-700" },
  { value: "packdown", label: "Packdown", color: "bg-gray-100 text-gray-700" },
  { value: "other", label: "Other", color: "bg-cream text-ink/70" },
];

const COMMON_DIETARIES = [
  "Vegetarian", "Vegan", "Gluten Free", "Dairy Free", "Nut Allergy",
  "Shellfish Allergy", "Halal", "Kosher", "Diabetic", "Low FODMAP",
];

const VENUE_SETUP_TEMPLATES = [
  { label: "Banquet", value: "Round tables of 8–10 guests. Head table at front. Dance floor centre-rear. Bar along right wall. Stage/AV at front-left." },
  { label: "Cocktail", value: "High cocktail tables scattered throughout. Bar along back wall. Small lounge area with low seating. Clear space for mingling." },
  { label: "Theatre", value: "Rows of chairs facing stage/screen. Lectern at front. AV screen centred. Registration table at entrance. No tables." },
  { label: "Boardroom", value: "Single large table, chairs around perimeter. Projector/screen at head. Water/notepads at each seat. Catering station at rear." },
  { label: "Cabaret", value: "Half-round tables facing stage. Chairs on one side only. Dance floor at front. Bar at rear. Stage with AV at front." },
];

const DRINKS_MENU = [
  { category: "Aperitivo", items: [
    { key: "aperol_spritz", name: "Aperol Spritz", description: "Aperol, Prosecco, Soda", price: 20 },
    { key: "campari_spritz", name: "Campari Spritz", description: "Campari, Prosecco, Soda", price: 20 },
    { key: "limoncello_spritz", name: "Limoncello Spritz", description: "Limoncello, Prosecco, Soda", price: 20 },
    { key: "hugo_spritz", name: "Hugo Spritz", description: "Elderflower, Prosecco, Soda", price: 20 },
    { key: "classic_negroni", name: "Classic Negroni", description: "Campari, Rosso Vermouth, Gin", price: 24 },
    { key: "negroni_sbagliato", name: "Negroni Sbagliato", description: "Campari, Rosso Vermouth, Prosecco", price: 23 },
    { key: "cherry_negroni", name: "Cherry Negroni", description: "Campari, Amaro, Rosso Vermouth, Gin", price: 25 },
    { key: "americano", name: "Americano", description: "Campari, Rosso Vermouth, Soda", price: 23 },
  ]},
  { category: "Vino Spumante", items: [
    { key: "tallero_prosecco", name: "Tallero Prosecco Extra Dry", description: "Veneto", priceGlass: 17, priceBottle: 85 },
    { key: "lambrusco", name: "Paltrinieri Lambrusco Di Soraba Radice", description: "Emiglia Romagna", priceBottle: 105 },
  ]},
  { category: "Vino Bianco", items: [
    { key: "sauvignon_blanc", name: "Mezzacorona Castel Firmian Sauvignon Blanc", description: "Trentino", priceGlass: 17, priceBottle: 85 },
    { key: "malvasia_chardonnay", name: "Fantini Primo Malvasia Chardonnay", description: "Abruzzo", priceGlass: 16, priceBottle: 80 },
    { key: "pinot_grigio", name: "Vigneti Romio Pinot Grigio Rubione IGT", description: "Friuli", priceGlass: 16, priceBottle: 80 },
    { key: "grillo", name: "Parthenium Grillo", description: "Sicilia", priceBottle: 85 },
    { key: "pipoli_bianco", name: "Pipoli Bianco Basilicata IGT", description: "Basilicata", priceBottle: 90 },
  ]},
  { category: "Vino Rosato", items: [
    { key: "rosato", name: "Fattoria Di Basciano Rosato", description: "Toscana", priceGlass: 17, priceBottle: 85 },
  ]},
  { category: "Vino Rosso", items: [
    { key: "sangiovese_merlot", name: "Primo Sangiovese Merlot", description: "Puglia", priceGlass: 16, priceBottle: 80 },
    { key: "chianti", name: "Renzo Masi Chianti Cornioletta", description: "Toscana", priceGlass: 17, priceBottle: 85 },
    { key: "montepulciano", name: "Fantini Montepulciano", description: "Abruzzo", priceGlass: 17, priceBottle: 85 },
    { key: "nebbiolo", name: "Ascheri Langhe Nebbiolo San Giacomo", description: "Piemonte", priceBottle: 110 },
    { key: "barbaresco", name: "Fontanabianca Barbaresco DOCG", description: "Piemonte", priceBottle: 165 },
  ]},
  { category: "Birra", items: [
    { key: "peroni_tap", name: "Peroni Tap", description: "Italia", price: 14 },
    { key: "peroni_330", name: "Peroni 330ml", description: "Italia", price: 12 },
    { key: "peroni_0", name: "Peroni 0%", description: "Italia", price: 12 },
  ]},
  { category: "Non Alcolico", items: [
    { key: "ginger_ale", name: "Fever Tree Ginger Ale", price: 8 },
    { key: "cola", name: "Fever Tree Cola", price: 8 },
    { key: "blood_orange", name: "Fever Tree Italian Blood Orange", price: 8 },
    { key: "lemonade", name: "Fever Tree Italian Lemonade", price: 8 },
  ]},
] as const;

const BAR_OPTIONS = [
  { key: "bar_tab" as const, label: "Bar Tab", description: "Set a fixed dollar amount" },
  { key: "cash_bar" as const, label: "Cash Bar", description: "Guests pay for their own drinks" },
  { key: "bar_tab_then_cash" as const, label: "Bar Tab then Cash Bar", description: "Tab runs until set amount, then guests pay" },
  { key: "unlimited" as const, label: "Unlimited Bar Tab", description: "Unlimited drinks for the event" },
];

function SpacePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [, navigate] = useLocation();
  const { data: spaces, isLoading } = trpc.spaces.list.useQuery();
  const matchesSaved = !!value && !!spaces && spaces.some((s: any) => s.name === value);
  const noSpacesYet = !isLoading && (!spaces || spaces.length === 0);
  if (noSpacesYet) {
    return (
      <div className="border border-dashed border-gold/40 bg-linen/40 px-2.5 py-2 flex items-center justify-between gap-2 no-print">
        <span className="font-dm text-xs text-ink/50">No spaces saved yet — add them in Settings → Venue → Spaces.</span>
        <button type="button" onClick={() => navigate("/dashboard?tab=settings&sub=venue")} className="font-bebas tracking-widest text-[10px] text-forest hover:underline whitespace-nowrap bg-transparent border-0 cursor-pointer">+ ADD SPACES</button>
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-sm border border-gold/20 focus:outline-none focus:border-forest text-sm h-9 px-2 bg-white font-dm no-print"
    >
      <option value="">— select a space —</option>
      {spaces?.map((s: any) => (
        <option key={s.id} value={s.name}>{s.name}{s.capacitySeated ? ` (${s.capacitySeated} seated)` : ''}</option>
      ))}
      {value && !matchesSaved && (
        <option value={value}>{value} (legacy — pick a saved space)</option>
      )}
    </select>
  );
}

// Snap a "HH:MM" time string to the nearest 15 minutes (e.g. "14:23" → "14:30").
// Returns "" for empty input so the field can still be cleared.
function roundTimeToQuarter(value: string): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  let h = Number(hStr);
  const m = Number(mStr ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  let rounded = Math.round(m / 15) * 15;
  if (rounded === 60) { rounded = 0; h += 1; }
  if (h >= 24) h = 0;
  return `${String(h).padStart(2, "0")}:${String(rounded).padStart(2, "0")}`;
}

function catStyle(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.color ?? "bg-cream text-ink/70";
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatTime12(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

type Item = {
  id?: number;
  time: string;
  duration: number;
  title: string;
  description?: string;
  assignedTo?: string;
  category: string;
  sortOrder: number;
  _tempId?: string;
  checked?: boolean;
  bold?: boolean;
  italic?: boolean;
  highlight?: string;
};

type Dietary = { name: string; count: number; notes?: string };
const DRINK_CATEGORIES = ['Cocktails', 'Wine', 'Beer & Cider', 'Spirits', 'Bubbles / Champagne', 'Soft Drinks & Mocktails', 'Other'];

type FnbItem = {
  id?: number;
  section: 'foh' | 'kitchen';
  course?: string;
  drinkCategory?: string;
  dishName: string;
  previousDishName?: string | null;
  description?: string;
  qty: number;
  dietary?: string;
  serviceTime?: string;
  prepNotes?: string;
  platingNotes?: string;
  staffAssigned?: string;
  sortOrder: number;
  // Per-unit price (food = per-head, drink = per-drink). Optional so existing
  // items without pricing aren't penalised, but when set it feeds the
  // RUNNING TOTAL block + BEO + live link.
  unitPrice?: number | string | null;
  _tempId?: string;
};
const DEFAULT_COURSES = ['Canapes', 'Entree', 'Main', 'Dessert', 'Cheese', 'Late Night Snack', 'Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Other'];

type ParsedRunsheetData = {
  eventDetails?: {
    eventDate?: string;
    guestCount?: number;
    eventType?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    spaceName?: string;
    venueSetup?: string;
  } | null;
  dietaries?: { name: string; count: number; notes?: string }[];
  fnbItems?: { course?: string; dishName: string; qty: number; serviceTime?: string; dietary?: string }[];
  timelineItems?: any[];
};

export default function RunsheetBuilder() {
  const [location, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const runsheetId = params.get("id") ? Number(params.get("id")) : null;
  const leadId = params.get("leadId") ? Number(params.get("leadId")) : undefined;
  const bookingId = params.get("bookingId") ? Number(params.get("bookingId")) : undefined;
  const proposalIdParam = params.get("proposalId") ? Number(params.get("proposalId")) : undefined;
  const isNewMode = params.get("new") === "1";

  // Core state
  const [title, setTitle] = useState("Event Runsheet");
  const [eventDate, setEventDate] = useState("");
  const [venueName, setVenueName] = useState("");
  const [spaceName, setSpaceName] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [eventType, setEventType] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheetId, setSheetId] = useState<number | null>(runsheetId);

  // ── Unsaved-changes tracking ──────────────────────────────────────────────
  // Set to true when user edits anything; reset to false after save.
  const [isDirty, setIsDirty] = useState(false);
  const isInitialLoadRef = useRef(true);

  // ── "NOW" indicator for live service ──────────────────────────────────────
  // Updates every 30s. Lets the timeline highlight the currently-active item
  // so staff can see at a glance "where are we right now?"
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    };
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, []);
  // Helper: convert "HH:MM" to minutes-since-midnight
  const timeToMinutes = (t: string): number => {
    if (!t || typeof t !== 'string') return -1;
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return -1;
    return h * 60 + m;
  };
  // Whether the runsheet is for "today" (so the NOW indicator is meaningful)
  const isToday = (() => {
    if (!eventDate) return false;
    const today = new Date();
    const evt = new Date(eventDate);
    return evt.getFullYear() === today.getFullYear()
      && evt.getMonth() === today.getMonth()
      && evt.getDate() === today.getDate();
  })();

  // Keep sheetId in sync with the URL — navigate() changes the URL but doesn't
  // remount the component, so useState initial value becomes stale after redirect.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("id") ? Number(p.get("id")) : null;
    setSheetId(id);
  }, [location]);

  // Venue area & event times
  const [venueArea, setVenueArea] = useState<"" | "bar" | "restaurant" | "full_venue">("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");

  // Contact info
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Dietaries
  const [dietaries, setDietaries] = useState<Dietary[]>([]);
  const [newDietary, setNewDietary] = useState({ name: "", count: "1", notes: "" });
  const [dietarySectionOpen, setDietarySectionOpen] = useState(true);

  // Costs
  type CostItem = { _id: string; label: string; qty: number; unitPrice: number; category: string };
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [gstInclusive, setGstInclusive] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState("");

  // Drinks (runsheet-level selection)
  const [rsBarOption, setRsBarOption] = useState<"bar_tab" | "cash_bar" | "bar_tab_then_cash" | "unlimited">("cash_bar");
  const [rsTabAmount, setRsTabAmount] = useState("");
  const [rsBarNotes, setRsBarNotes] = useState("");
  // Legacy: prior versions let users tick drinks from a hard-coded menu and add
  // "custom drinks". The user has asked us to replace this with a single notes
  // field. We keep the state so existing rows aren't dropped on save, and we
  // surface them as read-only chips at the bottom of the notes panel until the
  // user clears them.
  const [rsSelectedDrinks, setRsSelectedDrinks] = useState<string[]>([]);
  const [rsCustomDrinks, setRsCustomDrinks] = useState<{ name: string; description?: string; price?: number }[]>([]);
  // Beverage type per selected drink, keyed by drink name → 'spark' | 'white' | 'red' | 'beer' | 'other'
  const [rsDrinkTypes, setRsDrinkTypes] = useState<Record<string, string>>({});
  const [newRsCustomDrink, setNewRsCustomDrink] = useState({ name: "", description: "" });
  const [drinksSaving, setDrinksSaving] = useState(false);

  function clearLegacyDrinkSelections() {
    setRsSelectedDrinks([]);
    setRsCustomDrinks([]);
  }

  // F&B
  const [activeMainTab, setActiveMainTab] = useState<'timeline' | 'fnb' | 'drinks' | 'checklist' | 'tableplan' | 'equipment' | 'costs'>('timeline');
  const [fnbItems, setFnbItems] = useState<FnbItem[]>([]);
  const [fnbSaving, setFnbSaving] = useState(false);
  const [expandedFnbIdx, setExpandedFnbIdx] = useState<number | null>(null);
  const [newFnbItem, setNewFnbItem] = useState<Partial<FnbItem>>({
    section: 'foh', course: 'Canapes', dishName: '', qty: 1, serviceTime: '', dietary: '', staffAssigned: '',
  });

  // Venue setup
  const [venueSetup, setVenueSetup] = useState("");
  const [setupSummary, setSetupSummary] = useState("");
  const [footerText, setFooterText] = useState("");
  const [setupSectionOpen, setSetupSectionOpen] = useState(true);

  // Proposal link
  const [linkedProposalId, setLinkedProposalId] = useState<number | undefined>(proposalIdParam);
  const [proposalSectionOpen, setProposalSectionOpen] = useState(false);

  // Floor plan link
  const [linkedFloorPlanId, setLinkedFloorPlanId] = useState<number | undefined>(undefined);
  const [floorPlanSectionOpen, setFloorPlanSectionOpen] = useState(false);

  // Section ordering and visibility (persisted to localStorage)
  // Note: 'dietary' was removed — it now lives as a sub-tab inside the F&B tab.
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('vfhq_rs_section_order') || '["setup"]');
      // Strip legacy 'dietary' entry so DnD model matches what's actually rendered.
      return Array.isArray(raw) ? raw.filter((s: string) => s !== 'dietary') : ['setup'];
    }
    catch { return ['setup']; }
  });
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('vfhq_rs_hidden_sections');
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });
  function toggleSectionHidden(id: string) {
    setHiddenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('vfhq_rs_hidden_sections', JSON.stringify([...next]));
      return next;
    });
  }
  const sectionSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSectionOrder(prev => {
        const next = arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)));
        localStorage.setItem('vfhq_rs_section_order', JSON.stringify(next));
        return next;
      });
    }
  }

  // Staff portal links
  const [creatingStaffLink, setCreatingStaffLink] = useState(false);
  const [newStaffLinkLabel, setNewStaffLinkLabel] = useState('Staff Link');

  // Print layout
  const [printColumns, setPrintColumns] = useState<1 | 2>(1);
  // ── PRINT VIEW EDITOR ──────────────────────────────────────────────
  // Lets the user toggle which sections appear in the print view +
  // BEO PDF. Stored as a set of HIDDEN keys (so the default — empty
  // set — means "show everything"). Persisted in localStorage per
  // owner so the same operator gets the same view across runsheets.
  const PRINT_SECTIONS: { key: string; label: string; beoOnly?: boolean }[] = [
    { key: 'setup',    label: 'Venue setup' },
    { key: 'dietary',  label: 'Dietary requirements' },
    { key: 'timeline', label: 'Event timeline' },
    { key: 'notes',    label: 'Event notes' },
    { key: 'food',     label: 'F&B — food' },
    { key: 'kitchen',  label: 'Kitchen — prep & production', beoOnly: true },
    { key: 'drinks',   label: 'Drinks / bar' },
    { key: 'totals',   label: 'Running totals' },
    { key: 'payment',  label: 'Payment instructions' },
    { key: 'financials', label: 'Financials (quote / min spend)', beoOnly: true },
    { key: 'footer',   label: 'Footer note / message' },
    { key: 'menus',    label: 'Linked menu PDFs (chef appendix)', beoOnly: true },
  ];
  const PRINT_PREFS_KEY = 'vf:printHide:v1';
  const [printHide, setPrintHide] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(PRINT_PREFS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });
  const [printEditorOpen, setPrintEditorOpen] = useState(false);
  // ── BEO PREVIEW & PRINT MODAL ──────────────────────────────────────
  // Live, in-app preview of the EXACT BEO that prints, with the same
  // section toggles + an inline footer-note editor. previewNonce forces
  // the iframe to reload after a save so edits show up immediately.
  const [beoPreviewOpen, setBeoPreviewOpen] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  useEffect(() => {
    try { localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify(Array.from(printHide))); } catch {}
  }, [printHide]);
  const togglePrintSection = (key: string) => setPrintHide(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Drive the in-app print view: when the user fires window.print(),
  // inject a <style> tag that hides every section marked
  // [data-print-section="..."] for keys in `printHide`. Cleaned up
  // afterprint so screen view is unaffected.
  const runPrint = () => {
    // Belt-and-braces cleanup: a previous print that was cancelled or
    // had `afterprint` swallowed can leave a stale override style in
    // the DOM, which would silently affect the next print. Remove any
    // orphan before we add a fresh one, keep a direct ref to *our*
    // node, and listen on multiple events so we don't depend on any
    // single browser firing `afterprint`.
    document.querySelectorAll('#vf-print-overrides').forEach(n => n.remove());
    const style = document.createElement('style');
    style.id = 'vf-print-overrides';
    const rules = Array.from(printHide)
      .map(k => `[data-print-section="${k}"]`)
      .join(', ');
    style.textContent = rules ? `@media print { ${rules} { display: none !important; } }` : '';
    document.head.appendChild(style);
    const styleRef = style;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      styleRef.remove();
      window.removeEventListener('afterprint', cleanup);
      mql?.removeEventListener?.('change', mqlListener);
      document.removeEventListener('visibilitychange', visListener);
    };
    const mql = window.matchMedia?.('print');
    const mqlListener = (e: MediaQueryListEvent) => { if (!e.matches) cleanup(); };
    const visListener = () => { if (document.visibilityState === 'visible') cleanup(); };
    window.addEventListener('afterprint', cleanup);
    mql?.addEventListener?.('change', mqlListener);
    document.addEventListener('visibilitychange', visListener);
    // Final fail-safe: even if every event source is blocked, drop
    // the override after 30s so it can't poison future prints.
    setTimeout(cleanup, 30000);
    setTimeout(() => window.print(), 0);
  };
  const beoHideQuery = printHide.size > 0 ? `?hide=${encodeURIComponent(Array.from(printHide).join(','))}` : '';

  // AI F&B paste modal
  const [showFnbPaste, setShowFnbPaste] = useState(false);
  const [fnbPasteText, setFnbPasteText] = useState('');
  const [fnbParsedItems, setFnbParsedItems] = useState<any[]>([]);
  const [fnbParsedLoading, setFnbParsedLoading] = useState(false);

  // Checklist items (pre-event tasks)
  // Templates panel
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const { data: templates, refetch: refetchTemplates } = trpc.runsheetTemplates.list.useQuery();
  const createTemplateMutation = trpc.runsheetTemplates.create.useMutation({
    onSuccess: () => { toast.success('Template saved!'); refetchTemplates(); setSaveTemplateName(''); },
    onError: () => toast.error('Failed to save template'),
  });
  const deleteTemplateMutation = trpc.runsheetTemplates.delete.useMutation({
    onSuccess: () => { toast.success('Template deleted'); refetchTemplates(); },
    onError: () => toast.error('Failed to delete template'),
  });

  async function saveAsTemplate() {
    if (!saveTemplateName.trim()) { toast.error('Enter a template name'); return; }
    setSavingTemplate(true);
    try {
      await createTemplateMutation.mutateAsync({
        name: saveTemplateName.trim(),
        eventType: eventType || undefined,
        items: items.map((item, i) => ({
          time: item.time,
          duration: item.duration,
          title: item.title,
          description: item.description,
          assignedTo: item.assignedTo,
          category: item.category,
          sortOrder: i,
        })),
      });
    } finally {
      setSavingTemplate(false);
    }
  }

  function loadTemplate(template: any) {
    const templateItems = (template.items as any[]).map((item: any, i: number) => ({
      ...item,
      _tempId: `tpl-${Date.now()}-${i}`,
    }));
    setItems(templateItems);
    if (template.eventType) setEventType(template.eventType);
    toast.success(`Loaded template: ${template.name}`);
    setShowTemplates(false);
  }

  // Menu Catalogue selector state
  const [showCatalogSelector, setShowCatalogSelector] = useState(false);
  const [catalogSelectorType, setCatalogSelectorType] = useState<'food'|'drink'>('food');
  const [catalogSelectorCategoryId, setCatalogSelectorCategoryId] = useState<number|null>(null);
  // Map<itemId, qty> for catalogue selector
  const [catalogSelectedItems, setCatalogSelectedItems] = useState<Map<number, number>>(new Map());
  const { data: catalogCategories } = trpc.menuCatalog.listCategories.useQuery(
    { type: catalogSelectorType },
    { enabled: showCatalogSelector }
  );
  const { data: catalogItems } = trpc.menuCatalog.listItems.useQuery(
    { categoryId: catalogSelectorCategoryId ?? undefined },
    { enabled: showCatalogSelector && catalogSelectorCategoryId !== null }
  );

  // Smart paste-import state
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [smartPasteOpen, setSmartPasteOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRunsheetData|null>(null);
  const [includeEventDetails, setIncludeEventDetails] = useState(true);
  const [includeDietaries, setIncludeDietaries] = useState(true);
  const [includeFnb, setIncludeFnb] = useState(true);
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [editedParsedTimeline, setEditedParsedTimeline] = useState<any[]>([]);
  const parseRunsheetMutation = trpc.menuCatalog.parseRunsheetText.useMutation({
    onSuccess: (data: any) => {
      setParsedData({
        eventDetails: data.eventDetails ?? null,
        dietaries: data.dietaries ?? [],
        fnbItems: data.fnbItems ?? [],
        timelineItems: data.timelineItems ?? [],
      });
      setEditedParsedTimeline((data.timelineItems ?? []).map((it: any, i: number) => ({ ...it, _editId: String(i) })));
    },
    onError: () => toast.error('Failed to parse text — try again'),
  });

  function addCatalogItemsToFnb() {
    if (!catalogItems || catalogSelectedItems.size === 0) return;
    const existingNames = new Set(fnbItems.map(i => i.dishName.toLowerCase().trim()));
    const eligible = catalogItems.filter((ci: any) => catalogSelectedItems.has(ci.id));
    const toAdd: FnbItem[] = eligible
      .filter((ci: any) => !existingNames.has(ci.name.toLowerCase().trim()))
      .map((ci: any, i: number) => ({
        section: 'foh' as const,
        course: catalogSelectorType === 'food' ? (catalogCategories?.find((c: any) => c.id === catalogSelectorCategoryId)?.name ?? 'Other') : 'Drinks',
        dishName: ci.name,
        description: ci.description ?? '',
        qty: catalogSelectedItems.get(ci.id) ?? 1,
        dietary: '',
        serviceTime: '',
        staffAssigned: '',
        sortOrder: fnbItems.length + i,
        // Carry catalogue pricing through so it shows up in the running total.
        unitPrice: ci.priceCents != null ? Number(ci.priceCents) / 100 : (ci.price != null ? Number(ci.price) / 100 : null),
        _tempId: `cat-${Date.now()}-${i}`,
      }));
    const skipped = eligible.length - toAdd.length;
    // For drinks, also mirror the selected names into the runsheet-level
    // "drinks selection" so they appear as chips in the Drinks tab and on
    // the BEO/live runsheet drink panel.
    if (catalogSelectorType === 'drink') {
      const drinkNames = eligible.map((ci: any) => ci.name);
      setRsSelectedDrinks(prev => Array.from(new Set([...prev, ...drinkNames])));
    }
    setCatalogSelectedItems(new Map());
    setShowCatalogSelector(false);
    if (toAdd.length > 0) {
      const newItems = [...fnbItems, ...toAdd];
      setFnbItems(newItems);
      saveFnb(undefined, newItems);
      toast.success(`Added ${toAdd.length} ${catalogSelectorType === 'drink' ? 'drink' : 'item'}${toAdd.length > 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} already present, skipped)` : ''}`);
    } else if (catalogSelectorType === 'drink' && eligible.length > 0) {
      toast.success(`Added ${eligible.length} drink${eligible.length > 1 ? 's' : ''} to selection`);
    } else {
      toast.warning(`All selected items already in the F&B sheet — nothing added.`);
    }
  }

  function applyParsedData() {
    if (!parsedData) return;
    let applied: string[] = [];

    if (includeEventDetails && parsedData.eventDetails) {
      const ed = parsedData.eventDetails;
      if (ed.eventDate) setEventDate(ed.eventDate);
      if (ed.guestCount) setGuestCount(String(ed.guestCount));
      if (ed.eventType) setEventType(ed.eventType);
      if (ed.contactName) setContactName(ed.contactName);
      if (ed.contactEmail) setContactEmail(ed.contactEmail);
      if (ed.contactPhone) setContactPhone(ed.contactPhone);
      if (ed.spaceName) setSpaceName(ed.spaceName);
      if (ed.venueSetup) setVenueSetup(ed.venueSetup);
      applied.push('event details');
    }

    if (includeDietaries && parsedData.dietaries && parsedData.dietaries.length > 0) {
      const newDiets: Dietary[] = parsedData.dietaries.map(d => ({
        name: d.name,
        count: d.count ?? 1,
        notes: d.notes ?? '',
      }));
      setDietaries(prev => {
        const existing = new Set(prev.map(d => d.name.toLowerCase()));
        const toAdd = newDiets.filter(d => !existing.has(d.name.toLowerCase()));
        return [...prev, ...toAdd];
      });
      applied.push(`${parsedData.dietaries.length} dietary req${parsedData.dietaries.length !== 1 ? 's' : ''}`);
    }

    if (includeFnb && parsedData.fnbItems && parsedData.fnbItems.length > 0) {
      const existingNames = new Set(fnbItems.map(i => i.dishName.toLowerCase().trim()));
      const deduped = parsedData.fnbItems.filter(fi => !existingNames.has(fi.dishName.toLowerCase().trim()));
      const newFnb: FnbItem[] = deduped.map((fi, i) => ({
        section: 'foh' as const,
        course: fi.course ?? 'Other',
        dishName: fi.dishName,
        qty: fi.qty ?? 1,
        dietary: fi.dietary ?? '',
        serviceTime: fi.serviceTime ?? '',
        staffAssigned: '',
        sortOrder: fnbItems.length + i,
        _tempId: `paste-fnb-${Date.now()}-${i}`,
      }));
      setFnbItems(prev => [...prev, ...newFnb]);
      const skippedCount = parsedData.fnbItems.length - deduped.length;
      applied.push(`${newFnb.length} F&B item${newFnb.length !== 1 ? 's' : ''}${skippedCount > 0 ? ` (${skippedCount} duplicate${skippedCount > 1 ? 's' : ''} skipped)` : ''}`);
    }

    if (includeTimeline && editedParsedTimeline.length > 0) {
      const newItems: Item[] = editedParsedTimeline.map((pi: any, i: number) => ({
        time: pi.time ?? '09:00',
        duration: pi.duration ?? 30,
        title: pi.title ?? 'Untitled',
        description: pi.description ?? '',
        assignedTo: pi.assignedTo ?? '',
        category: (pi.category ?? 'other').toLowerCase(),
        sortOrder: items.length + i,
        _tempId: `paste-${Date.now()}-${i}`,
      }));
      setItems(prev => [...prev, ...newItems]);
      applied.push(`${editedParsedTimeline.length} timeline item${editedParsedTimeline.length !== 1 ? 's' : ''}`);
    }

    setParsedData(null);
    setEditedParsedTimeline([]);
    setPasteText('');
    setShowPasteImport(false);
    if (applied.length > 0) toast.success(`Applied: ${applied.join(', ')}`);
  }

  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; checked: boolean; category: string; imageUrl?: string }[]>([]);
  const [checklistInstance, setChecklistInstance] = useState<any>(null);
  const [newChecklistText, setNewChecklistText] = useState("");
  // Per-item reference photo (uploaded to /api/upload-image, stored as a URL
  // in the checklist item JSON). Shown to staff in the shared checklist view.
  const checklistPhotoInputRef = useRef<HTMLInputElement>(null);
  const [pendingChecklistPhotoId, setPendingChecklistPhotoId] = useState<string | null>(null);
  const [checklistPhotoUploading, setChecklistPhotoUploading] = useState<string | null>(null);

  // ── Dirty-state tracking ──────────────────────────────────────────────
  // Watches the main editable state. On the first render after data loads
  // (which we detect via isInitialLoadRef), we skip setting dirty. After
  // that, any change to any watched field flips isDirty → true.
  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    setIsDirty(true);
  // We intentionally watch these specific user-editable fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, title, eventDate, venueName, spaceName, venueArea, eventStartTime, eventEndTime,
      guestCount, eventType, notes, dietaries, venueSetup, footerText, gstInclusive, paymentNotes]);

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const getOrCreateChecklist = trpc.checklists.getOrCreateForRunsheet.useMutation({
    onSuccess: (instance) => {
      if (!instance) return;
      setChecklistInstance(instance);
      const dbItems = (instance.items ?? []) as any[];
      if (dbItems.length > 0) setChecklistItems(dbItems);
    },
  });

  const saveChecklistItems = trpc.checklists.saveItemsForRunsheet.useMutation();

  // ─── AI Smart Paste for Event Checklist ──────────────────────────────────
  const [showChecklistPaste, setShowChecklistPaste] = useState(false);
  const [checklistPasteText, setChecklistPasteText] = useState("");
  const [checklistParsed, setChecklistParsed] = useState<{ items: { text: string; category: string; _selected: boolean }[] } | null>(null);
  const parseChecklistTextMut = trpc.menuCatalog.parseChecklistText.useMutation({
    onSuccess: (data: any) => {
      if (!data.success || !data.items?.length) { toast.error("Couldn't extract any tasks. Try clearer text."); return; }
      const map: Record<string, string> = { general: 'other', bar: 'bar', restaurant: 'staff', kitchen: 'kitchen', opening: 'setup', closing: 'setup', cleaning: 'setup' };
      const cat = map[data.category] || 'other';
      setChecklistParsed({ items: data.items.map((it: any) => ({ text: it.note ? `${it.text} — ${it.note}` : it.text, category: cat, _selected: true })) });
    },
    onError: () => toast.error("AI parse failed"),
  });
  function applyChecklistParsed() {
    if (!checklistParsed) return;
    const selected = checklistParsed.items.filter(i => i._selected && i.text.trim());
    if (selected.length === 0) { toast.error("Select at least one item"); return; }
    const additions = selected.map((it, i) => ({
      id: `c-${Date.now()}-${i}`,
      text: it.text.trim(),
      checked: false,
      category: it.category || 'other',
    }));
    const updated = [...checklistItems, ...additions];
    setChecklistItems(updated);
    if (sheetId) saveChecklistItems.mutate({ runsheetId: sheetId, items: updated as any });
    setShowChecklistPaste(false);
    setChecklistPasteText("");
    setChecklistParsed(null);
    toast.success(`Added ${additions.length} item${additions.length !== 1 ? 's' : ''} to the checklist`);
  }
  const toggleByToken = trpc.checklists.toggleItemByToken.useMutation({
    onSuccess: (data) => {
      if (data?.items) setChecklistItems(data.items as any);
    },
  });

  useEffect(() => {
    if (sheetId && !checklistInstance) {
      getOrCreateChecklist.mutate({
        runsheetId: sheetId,
        name: title ? `${title} — Staff Checklist` : 'Staff Checklist',
        defaultItems: [],
      });
    }
  }, [sheetId]);

  // Venue settings for customisable dietaries and setup templates
  const { data: venueSettings, refetch: refetchVenueSettings } = trpc.venue.getOwn.useQuery();
  const venuePrimaryColor = (venueSettings as any)?.primaryColor ?? "#1a3a2a";
  const updateVenueMutation = trpc.venue.update.useMutation({
    onSuccess: () => { toast.success('Options saved'); refetchVenueSettings(); },
    onError: () => toast.error('Failed to save options'),
  });

  // Parsed dietary options from venue settings (with fallback)
  const activeDietaryOptions: string[] = (() => {
    if (venueSettings?.customDietaryOptions) {
      try {
        const parsed = JSON.parse(venueSettings.customDietaryOptions);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return COMMON_DIETARIES;
  })();

  // Parsed setup templates from venue settings (with fallback)
  const activeSetupTemplates: { label: string; value: string }[] = (() => {
    if (venueSettings?.customSetupTemplates) {
      try {
        const parsed = JSON.parse(venueSettings.customSetupTemplates);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return VENUE_SETUP_TEMPLATES;
  })();

  // Parsed F&B courses from venue settings (with fallback)
  const venueCourses: string[] = (() => {
    if ((venueSettings as any)?.customCourses) {
      try {
        const parsed = JSON.parse((venueSettings as any).customCourses);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return DEFAULT_COURSES;
  })();
  // Per-runsheet ad-hoc courses the user adds via "+ NEW COURSE". These let
  // them spin up a brand-new course (e.g. "Pre-dinner Bites") for one event
  // without polluting the venue-wide course list.
  //
  // Persistence: empty courses (no items yet) are saved to localStorage keyed
  // by booking ID so they survive page reloads. Once the user adds an item to
  // a custom course, that course also appears naturally in the courses-derived-
  // from-items list, so the localStorage entry becomes redundant but harmless.
  const [extraCourses, setExtraCourses] = useState<string[]>([]);
  const courses: string[] = [...venueCourses, ...extraCourses.filter(c => !venueCourses.includes(c))];

  // Load extraCourses from localStorage on mount / when booking changes
  useEffect(() => {
    if (!bookingId) return;
    try {
      const raw = localStorage.getItem(`runsheet:${bookingId}:extraCourses`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setExtraCourses(parsed.filter(c => typeof c === 'string'));
      }
    } catch {}
  }, [bookingId]);

  // Persist extraCourses whenever they change so empty courses survive reloads
  useEffect(() => {
    if (!bookingId) return;
    try {
      if (extraCourses.length > 0) {
        localStorage.setItem(`runsheet:${bookingId}:extraCourses`, JSON.stringify(extraCourses));
      } else {
        localStorage.removeItem(`runsheet:${bookingId}:extraCourses`);
      }
    } catch {}
  }, [bookingId, extraCourses]);

  function addNewCourse() {
    const name = prompt('New course name (e.g. "Pre-dinner Bites", "Late Night")\n\nTip: add at least one item to keep this course saved with the runsheet.');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (courses.includes(trimmed)) {
      toast.error(`"${trimmed}" already exists`);
      return;
    }
    setExtraCourses(prev => [...prev, trimmed]);
  }

  // State for managing dietary options
  const [showDietaryManager, setShowDietaryManager] = useState(false);
  const [editingDietaries, setEditingDietaries] = useState<string[]>([]);
  const [newDietaryOption, setNewDietaryOption] = useState('');

  function openDietaryManager() {
    setEditingDietaries([...activeDietaryOptions]);
    setShowDietaryManager(true);
  }
  function saveDietaryOptions() {
    // Same "pending entry" rescue as setup templates — commit a typed-in
    // option if the user didn't press ADD first.
    let toSave = editingDietaries;
    const pending = newDietaryOption.trim();
    if (pending && !toSave.includes(pending)) {
      toSave = [...editingDietaries, pending];
      setEditingDietaries(toSave);
      setNewDietaryOption('');
    }
    updateVenueMutation.mutate({ customDietaryOptions: JSON.stringify(toSave) });
    setShowDietaryManager(false);
  }

  // State for managing setup templates
  const [showSetupManager, setShowSetupManager] = useState(false);
  const [editingSetups, setEditingSetups] = useState<{ label: string; value: string }[]>([]);
  const [newSetupLabel, setNewSetupLabel] = useState('');
  const [newSetupValue, setNewSetupValue] = useState('');

  function openSetupManager() {
    setEditingSetups([...activeSetupTemplates]);
    setShowSetupManager(true);
  }
  function saveSetupTemplates() {
    // Pick up any half-entered template still sitting in the ADD NEW
    // TEMPLATE fields so the user doesn't lose it by clicking SAVE without
    // first clicking ADD TEMPLATE. This was the silent failure people kept
    // hitting: type → SAVE → "saved" toast → nothing actually persists.
    let toSave = editingSetups;
    const pendingLabel = newSetupLabel.trim();
    const pendingValue = newSetupValue.trim();
    if (pendingLabel && pendingValue) {
      toSave = [...editingSetups, { label: pendingLabel, value: pendingValue }];
      setEditingSetups(toSave);
      setNewSetupLabel('');
      setNewSetupValue('');
    }
    updateVenueMutation.mutate({ customSetupTemplates: JSON.stringify(toSave) });
    setShowSetupManager(false);
  }

  // F&B sub-tab navigation (Items vs Dietaries)
  const [fnbSubTab, setFnbSubTab] = useState<'items' | 'dietaries'>('items');

  // F&B column visibility toggles
  const [showDietaryCol, setShowDietaryCol] = useState(true);
  const [showTimeCol, setShowTimeCol] = useState(true);
  const [showStaffCol, setShowStaffCol] = useState(true);
  const [showPrepPlatingCol, setShowPrepPlatingCol] = useState(true);
  const [showQtyCol, setShowQtyCol] = useState(true);

  // Derived: dynamic grid template for F&B table (header + rows)
  const fnbGridCols = ['90px', '1fr', showQtyCol ? '50px' : null, showDietaryCol ? '80px' : null, showTimeCol ? '80px' : null, showStaffCol ? '90px' : null, showPrepPlatingCol ? '1fr' : null, '64px'].filter(Boolean).join(' ');

  // Custom item mode for F&B add form
  const [fnbCustomMode, setFnbCustomMode] = useState(false);
  const [fnbCustomName, setFnbCustomName] = useState('');
  const [fnbCustomCourse, setFnbCustomCourse] = useState('Other');
  const [fnbCustomDrinkCat, setFnbCustomDrinkCat] = useState('');

  // F&B mutations
  const saveFnbMutation = trpc.fnb.save.useMutation({
    onSuccess: () => toast.success('F&B sheet saved'),
    onError: () => toast.error('Failed to save F&B sheet'),
  });
  const { data: existingFnb, refetch: refetchFnb } = trpc.fnb.list.useQuery(
    { runsheetId: sheetId! },
    { enabled: !!sheetId }
  );
  useEffect(() => {
    if (existingFnb) {
      setFnbItems(existingFnb.map((item: any, i: number) => ({ ...item, _tempId: String(i) })));
    }
  }, [existingFnb]);

  async function saveFnb(overrideId?: number, itemsOverride?: FnbItem[]) {
    const id = overrideId ?? sheetId;
    if (!id) return;
    setFnbSaving(true);
    const itemsToSave = itemsOverride ?? fnbItems;
    try {
      await saveFnbMutation.mutateAsync({
        runsheetId: id,
        items: itemsToSave.map((item, i) => ({
          section: item.section,
          course: item.course,
          dishName: item.dishName,
          previousDishName: item.previousDishName ?? null,
          description: item.description,
          qty: item.qty ?? 1,
          dietary: item.dietary,
          serviceTime: item.serviceTime,
          prepNotes: item.prepNotes,
          platingNotes: item.platingNotes,
          staffAssigned: item.staffAssigned,
          sortOrder: i,
          unitPrice: item.unitPrice != null && item.unitPrice !== '' ? Number(item.unitPrice) : null,
        })),
      });
      await refetchFnb();
    } finally {
      setFnbSaving(false);
    }
  }

  function addFnbItem() {
    const name = fnbCustomMode ? fnbCustomName.trim() : newFnbItem.dishName?.trim();
    if (!name) { toast.error('Enter a dish name'); return; }
    const course = fnbCustomMode ? fnbCustomCourse : newFnbItem.course;
    const item: FnbItem = {
      section: 'foh',
      course,
      dishName: name,
      qty: newFnbItem.qty ?? 1,
      dietary: newFnbItem.dietary,
      serviceTime: newFnbItem.serviceTime,
      staffAssigned: newFnbItem.staffAssigned,
      sortOrder: fnbItems.length,
      _tempId: String(Date.now()),
      ...(course === 'Drinks' && fnbCustomDrinkCat ? { drinkCategory: fnbCustomDrinkCat } : {}),
    };
    setFnbItems(prev => [...prev, item]);
    setNewFnbItem({ section: 'foh', course: 'Canapes', dishName: '', qty: 1, serviceTime: '', dietary: '', staffAssigned: '' });
    setFnbCustomName('');
    setFnbCustomDrinkCat('');
    if (fnbCustomMode) setFnbCustomMode(false);
  }

  function updateFnbItem(idx: number, field: keyof FnbItem, value: any) {
    setFnbItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function removeFnbItem(idx: number) {
    setFnbItems(prev => prev.filter((_, i) => i !== idx));
    setExpandedFnbIdx(null);
  }

  function renameCourse(oldCourse: string, newCourse: string) {
    if (!newCourse.trim()) return;
    setFnbItems(prev => prev.map(item =>
      (item.course ?? 'Other') === oldCourse ? { ...item, course: newCourse } : item
    ));
  }

  function deleteCourse(course: string) {
    if (!confirm(`Remove all items in "${course}"? This cannot be undone.`)) return;
    setFnbItems(prev => prev.filter(item => (item.course ?? 'Other') !== course));
  }

  // Queries
  const { data: existing } = trpc.runsheets.get.useQuery({ id: sheetId! }, { enabled: !!sheetId });
  const { data: lead } = trpc.leads.get.useQuery({ id: leadId! }, { enabled: !!leadId });
  const { data: leadProposals } = trpc.proposals.byLead.useQuery(
    { leadId: leadId! },
    { enabled: !!leadId }
  );
  const { data: allProposals } = trpc.proposals.list.useQuery(undefined, { enabled: !leadId });
  const { data: linkedProposal } = trpc.proposals.get.useQuery(
    { id: linkedProposalId! },
    { enabled: !!linkedProposalId }
  );
  const { data: proposalDrinks } = trpc.proposals.getDrinks.useQuery(
    { proposalId: linkedProposalId! },
    { enabled: !!linkedProposalId }
  );
  const { data: proposalQuote } = trpc.quote.get.useQuery(
    { proposalId: linkedProposalId! },
    { enabled: !!linkedProposalId }
  );
  const { data: booking } = trpc.bookings.getById.useQuery(
    { id: bookingId! },
    { enabled: !!bookingId && !sheetId }
  );
  // If this booking already has a runsheet, redirect to edit it instead of creating a new one
  const { data: bookingRunsheets } = trpc.runsheets.list.useQuery(
    { bookingId: bookingId! },
    { enabled: !!bookingId && !sheetId }
  );
  useEffect(() => {
    if (!sheetId && bookingRunsheets && bookingRunsheets.length > 0) {
      const existingId = bookingRunsheets[0].id;
      // Set state directly so the existing-runsheet query fires immediately —
      // wouter's useLocation only tracks pathname, so navigate() alone won't
      // re-trigger our URL-sync effect when only search params change.
      setSheetId(existingId);
      navigate(`/runsheet?id=${existingId}&bookingId=${bookingId}`, { replace: true });
    }
  }, [bookingRunsheets, sheetId]);
  // If this lead already has a runsheet, redirect to edit it instead of creating a new one
  const { data: leadRunsheets } = trpc.runsheets.list.useQuery(
    { leadId: leadId! },
    { enabled: !!leadId && !sheetId }
  );
  useEffect(() => {
    if (!sheetId && leadRunsheets && leadRunsheets.length > 0) {
      const existingId = leadRunsheets[0].id;
      const qs = [`id=${existingId}`, `leadId=${leadId}`].join('&');
      setSheetId(existingId);
      navigate(`/runsheet?${qs}`, { replace: true });
    }
  }, [leadRunsheets, sheetId]);

  // All runsheets (for home screen when no specific runsheet is selected)
  const { data: allRunsheets } = trpc.runsheets.list.useQuery(
    {},
    { enabled: !sheetId && !leadId && !bookingId && !isNewMode }
  );

  // Effective booking ID — from URL param, or from the loaded runsheet record
  const effectiveBookingId: number | undefined = bookingId ?? (existing as any)?.bookingId ?? undefined;
  // Floor plans
  const { data: floorPlansList } = trpc.floorPlans.list.useQuery(
    {},
    { enabled: floorPlanSectionOpen || activeMainTab === 'tableplan' }
  );
  const { data: linkedFloorPlan } = trpc.floorPlans.get.useQuery(
    { id: linkedFloorPlanId! },
    { enabled: !!linkedFloorPlanId }
  );
  // Staff portal links
  const { data: staffLinks, refetch: refetchStaffLinks } = trpc.staffPortal.listLinks.useQuery(
    { runsheetId: sheetId! },
    { enabled: !!sheetId }
  );
  const pushRunsheetToNbi = trpc.bookings.pushToNbi.useMutation({
    onSuccess: (data) => {
      if (data.alreadyPushed) {
        toast.success(`Already in NowBookIt (#${data.nbiBookingId})`);
      } else {
        toast.success(`Pushed to NowBookIt${data.nbiBookingId ? ` (#${data.nbiBookingId})` : ''}!`);
      }
    },
    onError: (err) => toast.error(err.message || 'Failed to push to NowBookIt'),
  });
  const createStaffLinkMutation = trpc.staffPortal.createLink.useMutation({
    onSuccess: () => { toast.success('Staff link created'); refetchStaffLinks(); setCreatingStaffLink(false); setNewStaffLinkLabel('Staff Link'); },
    onError: () => toast.error('Failed to create staff link'),
  });
  const deleteStaffLinkMutation = trpc.staffPortal.deleteLink.useMutation({
    onSuccess: () => { toast.success('Link deleted'); refetchStaffLinks(); },
    onError: () => toast.error('Failed to delete link'),
  });
  // Used by the per-link "Email staff briefing" button — sends the runsheet
  // share link plus the freshly rendered staff PDF via the operator's SMTP.
  const emailSendMutation = trpc.email.send.useMutation();
  // ── Staff email distribution list (saved on venueSettings.staffEmails) ──
  const staffEmailsQuery = trpc.staffEmails.list.useQuery();
  const [bulkStaffPaste, setBulkStaffPaste] = useState("");
  const [showBulkStaffPaste, setShowBulkStaffPaste] = useState(false);
  const addBulkStaffMutation = trpc.staffEmails.addBulk.useMutation({
    onSuccess: (res) => {
      const added = res.added.length;
      const parts: string[] = [];
      if (added > 0) parts.push(`Added ${added} staff`);
      if (res.skippedDuplicates > 0) parts.push(`${res.skippedDuplicates} duplicate${res.skippedDuplicates !== 1 ? 's' : ''} skipped`);
      if (added === 0 && res.skippedDuplicates === 0) parts.push('No valid emails found');
      (added > 0 ? toast.success : toast.warning)(parts.join(' · '));
      setBulkStaffPaste("");
      setShowBulkStaffPaste(false);
      staffEmailsQuery.refetch();
    },
    onError: () => toast.error('Failed to add emails'),
  });
  const addStaffEmailMutation = trpc.staffEmails.add.useMutation({
    onSuccess: () => { staffEmailsQuery.refetch(); setNewStaffName(""); setNewStaffEmail(""); },
    onError: (e) => toast.error(e.message ?? 'Failed to add staff email'),
  });
  const removeStaffEmailMutation = trpc.staffEmails.remove.useMutation({
    onSuccess: () => staffEmailsQuery.refetch(),
  });
  // Which staff link the user is currently emailing (drives the modal).
  const [emailingLink, setEmailingLink] = useState<{ id: number; token: string; label: string } | null>(null);
  // Which saved emails are ticked, plus a free-text field for ad-hoc adds.
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [extraEmails, setExtraEmails] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [sendingStaffEmail, setSendingStaffEmail] = useState(false);
  // ── Runsheet attachments (PDFs shown on the live staff link) ──
  const addAttachmentMutation = trpc.runsheets.addAttachment.useMutation({
    onSuccess: () => utils.runsheets.get.invalidate({ id: sheetId! }),
    onError: (e) => toast.error(e.message ?? 'Upload failed'),
  });
  const removeAttachmentMutation = trpc.runsheets.removeAttachment.useMutation({
    onSuccess: () => utils.runsheets.get.invalidate({ id: sheetId! }),
  });
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const handleAttachmentUpload = async (file: File) => {
    if (!sheetId) { toast.error('Save the runsheet first'); return; }
    if (file.type !== 'application/pdf') { toast.error('PDFs only'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10MB'); return; }
    setUploadingAttachment(true);
    const tId = toast.loading(`Uploading ${file.name}...`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-pdf', { method: 'POST', body: fd, credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }
      const { url, name, size, contentType } = await res.json();
      await addAttachmentMutation.mutateAsync({ runsheetId: sheetId, url, name, size, contentType });
      toast.success(`${name} attached`, { id: tId });
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed', { id: tId });
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };
  // AI F&B parse mutation
  const parseFnbMutation = trpc.menuCatalog.parseFnbText.useMutation({
    onSuccess: (data: any) => {
      setFnbParsedItems((data.fnbItems ?? []).map((it: any, i: number) => ({ ...it, _editId: String(i), _selected: true })));
      setFnbParsedLoading(false);
      if (!data.success) toast.error('AI could not parse all items — review carefully');
    },
    onError: () => { toast.error('Failed to parse F&B text'); setFnbParsedLoading(false); },
  });
  function runFnbParse() {
    if (!fnbPasteText.trim()) { toast.error('Paste some text first'); return; }
    setFnbParsedLoading(true);
    setFnbParsedItems([]);
    parseFnbMutation.mutate({ text: fnbPasteText, eventType: eventType || undefined, guestCount: guestCount ? Number(guestCount) : undefined });
  }
  function applyFnbParsed() {
    const toAdd: FnbItem[] = fnbParsedItems
      .filter((it: any) => it._selected)
      .map((it: any, i: number) => ({
        section: 'foh' as const,
        course: it.course ?? 'Other',
        dishName: it.dishName ?? it.name ?? '',
        description: it.description ?? '',
        qty: Number(it.qty) || 1,
        dietary: it.dietary ?? '',
        serviceTime: it.serviceTime ?? '',
        prepNotes: it.prepNotes ?? '',
        staffAssigned: '',
        // Carry the AI-parsed price through so a pasted menu (food OR drinks)
        // lands WITH prices that feed the running total — previously the parser
        // read the price but applyFnbParsed dropped it, so every item came in
        // unpriced. Drinks parse as course "Drinks"; the bar/beverage package
        // (a separate section) is untouched.
        unitPrice: it.price != null && it.price !== '' && Number(it.price) > 0 ? Number(it.price) : null,
        sortOrder: fnbItems.length + i,
        _tempId: `ai-fnb-${Date.now()}-${i}`,
      }));
    if (toAdd.length === 0) { toast.error('No items selected'); return; }
    setFnbItems(prev => [...prev, ...toAdd]);
    toast.success(`${toAdd.length} item${toAdd.length !== 1 ? 's' : ''} added to F&B sheet`);
    setShowFnbPaste(false);
    setFnbPasteText('');
    setFnbParsedItems([]);
  }
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setEventDate(existing.eventDate ? new Date(existing.eventDate).toLocaleDateString("en-CA") : "");
      setVenueName(existing.venueName ?? "");
      setSpaceName(existing.spaceName ?? "");
      setGuestCount(existing.guestCount ? String(existing.guestCount) : "");
      setEventType(existing.eventType ?? "");
      setNotes(existing.notes ?? "");
      setDietaries((existing.dietaries as Dietary[]) ?? []);
      setVenueSetup(existing.venueSetup ?? "");
      setSetupSummary((existing as any).setupSummary ?? "");
      setFooterText(existing.footerText ?? "");
      setLinkedProposalId((existing as any).proposalId ?? undefined);
      setLinkedFloorPlanId((existing as any).floorPlanId ?? undefined);
      setItems((existing.items ?? []).map((item: any, i: number) => ({ ...item, _tempId: String(i) })));
      if ((existing as any).costItems) setCostItems((existing as any).costItems as CostItem[]);
      setGstInclusive((existing as any).gstInclusive ?? false);
      setPaymentNotes((existing as any).paymentNotes ?? "");
      const cols = (existing as any).fnbColumns;
      if (cols) {
        if (cols.dietary !== undefined) setShowDietaryCol(cols.dietary);
        if (cols.serviceTime !== undefined) setShowTimeCol(cols.serviceTime);
        if (cols.staff !== undefined) setShowStaffCol(cols.staff);
        if (cols.notes !== undefined) setShowPrepPlatingCol(cols.notes);
        if (cols.qty !== undefined) setShowQtyCol(cols.qty);
      }
      setVenueArea((existing as any).venueArea ?? "");
      setEventStartTime((existing as any).eventStartTime ?? "");
      setEventEndTime((existing as any).eventEndTime ?? "");
      const dd = (existing as any).drinksData;
      if (dd) {
        if (dd.barOption) setRsBarOption(dd.barOption);
        if (dd.tabAmount) setRsTabAmount(String(dd.tabAmount));
        if (dd.selectedDrinks) setRsSelectedDrinks(dd.selectedDrinks);
        if (dd.customDrinks) setRsCustomDrinks(dd.customDrinks);
        if (dd.barNotes) setRsBarNotes(dd.barNotes);
        if (dd.drinkTypes) setRsDrinkTypes(dd.drinkTypes);
      }
    }
  }, [existing]);

  // Pre-fill from lead
  const { data: spacesForPrefill } = trpc.spaces.list.useQuery(undefined, { enabled: !!leadId });
  useEffect(() => {
    if (!lead) return;
    // Always restore contact info from lead (contact fields are not persisted in DB)
    setContactName(`${lead.firstName} ${lead.lastName ?? ""}`.trim());
    setContactEmail(lead.email ?? "");
    setContactPhone(lead.phone ?? "");
    // Only seed main fields if we're creating fresh (no existing runsheet)
    if (!sheetId) {
      setTitle(`${lead.firstName} ${lead.lastName ?? ""} — ${lead.eventType ?? "Event"}`);
      setEventDate(lead.eventDate ? new Date(lead.eventDate).toLocaleDateString("en-CA") : "");
      setGuestCount(lead.guestCount ? String(lead.guestCount) : "");
      setEventType(lead.eventType ?? "");
      // Map spaceId → space name so the venue/space dropdown is pre-selected
      if ((lead as any).spaceId && spacesForPrefill) {
        const sp = spacesForPrefill.find((s: any) => s.id === (lead as any).spaceId);
        if (sp?.name) setSpaceName(sp.name);
      }
      // Seed notes from the enquiry message + internal notes
      const msgParts = [lead.message, (lead as any).internalNotes].filter(Boolean);
      if (msgParts.length) setNotes(msgParts.join("\n\n"));
    }
  }, [lead, sheetId, spacesForPrefill]);

  // Auto-populate from linked proposal
  useEffect(() => {
    if (linkedProposal && !sheetId) {
      if (linkedProposal.eventDate) setEventDate(new Date(linkedProposal.eventDate).toLocaleDateString("en-CA"));
      if (linkedProposal.guestCount) setGuestCount(String(linkedProposal.guestCount));
      if (linkedProposal.spaceName) setSpaceName(linkedProposal.spaceName);
    }
  }, [linkedProposal, sheetId]);

  // Auto-populate from booking
  useEffect(() => {
    if (booking && !sheetId) {
      setTitle(`${booking.firstName} ${booking.lastName ?? ''} — ${booking.eventType ?? 'Event'}`.trim());
      setEventDate(booking.eventDate ? new Date(booking.eventDate).toLocaleDateString("en-CA") : "");
      setGuestCount(booking.guestCount ? String(booking.guestCount) : "");
      setEventType(booking.eventType ?? "");
      setContactName(`${booking.firstName} ${booking.lastName ?? ""}`.trim());
      setContactEmail(booking.email ?? "");
      if (booking.spaceName) setSpaceName(booking.spaceName);
    }
  }, [booking, sheetId]);

  // Auto-populate F&B from proposal quote items
  const proposalFnbSeeded = React.useRef(false);
  useEffect(() => {
    if (proposalFnbSeeded.current || sheetId) return;
    const qItems: any[] = (proposalQuote as any)?.items ?? [];
    const drinks: any = proposalDrinks;
    if (qItems.length === 0 && !drinks) return;
    proposalFnbSeeded.current = true;
    const foodRows: FnbItem[] = qItems.map((qi: any, i: number) => ({
      section: 'foh' as const,
      course: 'Menu',
      dishName: qi.name ?? qi.description ?? 'Menu Item',
      description: qi.description ?? '',
      qty: Number(qi.qty) || 1,
      dietary: '',
      serviceTime: '',
      staffAssigned: '',
      sortOrder: i,
      _tempId: `prop-qi-${i}`,
    }));
    const drinkRows: FnbItem[] = [];
    if (drinks?.selectedDrinks) {
      try {
        const arr: string[] = typeof drinks.selectedDrinks === 'string' ? JSON.parse(drinks.selectedDrinks) : drinks.selectedDrinks;
        arr.forEach((name: string, i: number) => {
          drinkRows.push({ section: 'foh', course: 'Drinks', dishName: name, qty: 1, dietary: '', serviceTime: '', staffAssigned: '', sortOrder: foodRows.length + i, _tempId: `prop-dr-${i}` });
        });
      } catch {}
    }
    const all = [...foodRows, ...drinkRows];
    if (all.length > 0) {
      setFnbItems(all);
      toast.success(`${all.length} item${all.length !== 1 ? 's' : ''} auto-populated from proposal`);
    }
  }, [proposalQuote, proposalDrinks, sheetId]);

  function seedDefaultItems(type: string) {
    const t = type.toLowerCase();
    const base: Item[] = [];
    if (t.includes("wedding") || t.includes("reception")) {
      base.push(
        { time: "14:00", duration: 60, title: "Venue setup & decoration", category: "setup", sortOrder: 0, _tempId: "s0" },
        { time: "15:00", duration: 30, title: "Staff briefing", category: "setup", sortOrder: 1, _tempId: "s1" },
        { time: "16:00", duration: 30, title: "Guest arrival & welcome drinks", category: "beverage", sortOrder: 2, _tempId: "s2" },
        { time: "16:30", duration: 60, title: "Ceremony", category: "entertainment", sortOrder: 3, _tempId: "s3" },
        { time: "17:30", duration: 60, title: "Cocktail hour", category: "beverage", sortOrder: 4, _tempId: "s4" },
        { time: "18:30", duration: 15, title: "Guests seated for dinner", category: "guest", sortOrder: 5, _tempId: "s5" },
        { time: "18:45", duration: 60, title: "Entrée service", category: "food", sortOrder: 6, _tempId: "s6" },
        { time: "19:45", duration: 30, title: "Speeches", category: "speech", sortOrder: 7, _tempId: "s7" },
        { time: "20:15", duration: 60, title: "Main course service", category: "food", sortOrder: 8, _tempId: "s8" },
        { time: "21:15", duration: 30, title: "Cake cutting", category: "entertainment", sortOrder: 9, _tempId: "s9" },
        { time: "21:45", duration: 90, title: "Dancing & bar service", category: "entertainment", sortOrder: 10, _tempId: "s10" },
        { time: "23:00", duration: 30, title: "Last drinks & farewell", category: "guest", sortOrder: 11, _tempId: "s11" },
        { time: "23:30", duration: 60, title: "Packdown & cleanup", category: "packdown", sortOrder: 12, _tempId: "s12" },
      );
    } else if (t.includes("birthday") || t.includes("party")) {
      base.push(
        { time: "17:00", duration: 60, title: "Venue setup", category: "setup", sortOrder: 0, _tempId: "s0" },
        { time: "18:00", duration: 30, title: "Guest arrival & welcome drinks", category: "beverage", sortOrder: 1, _tempId: "s1" },
        { time: "18:30", duration: 90, title: "Cocktail hour & canapes", category: "food", sortOrder: 2, _tempId: "s2" },
        { time: "20:00", duration: 60, title: "Dinner service", category: "food", sortOrder: 3, _tempId: "s3" },
        { time: "21:00", duration: 15, title: "Cake & birthday speech", category: "speech", sortOrder: 4, _tempId: "s4" },
        { time: "21:15", duration: 105, title: "Dancing & bar service", category: "entertainment", sortOrder: 5, _tempId: "s5" },
        { time: "23:00", duration: 30, title: "Last drinks & farewell", category: "guest", sortOrder: 6, _tempId: "s6" },
        { time: "23:30", duration: 60, title: "Packdown", category: "packdown", sortOrder: 7, _tempId: "s7" },
      );
    } else if (t.includes("corporate") || t.includes("conference") || t.includes("meeting")) {
      base.push(
        { time: "07:30", duration: 60, title: "Venue setup & AV check", category: "setup", sortOrder: 0, _tempId: "s0" },
        { time: "08:30", duration: 30, title: "Guest registration & coffee", category: "guest", sortOrder: 1, _tempId: "s1" },
        { time: "09:00", duration: 120, title: "Morning session", category: "entertainment", sortOrder: 2, _tempId: "s2" },
        { time: "11:00", duration: 30, title: "Morning tea", category: "food", sortOrder: 3, _tempId: "s3" },
        { time: "11:30", duration: 90, title: "Afternoon session", category: "entertainment", sortOrder: 4, _tempId: "s4" },
        { time: "13:00", duration: 60, title: "Lunch service", category: "food", sortOrder: 5, _tempId: "s5" },
        { time: "14:00", duration: 120, title: "Post-lunch session", category: "entertainment", sortOrder: 6, _tempId: "s6" },
        { time: "16:00", duration: 30, title: "Afternoon tea", category: "food", sortOrder: 7, _tempId: "s7" },
        { time: "16:30", duration: 60, title: "Networking drinks", category: "beverage", sortOrder: 8, _tempId: "s8" },
        { time: "17:30", duration: 30, title: "Packdown", category: "packdown", sortOrder: 9, _tempId: "s9" },
      );
    } else {
      base.push(
        { time: "16:00", duration: 60, title: "Venue setup", category: "setup", sortOrder: 0, _tempId: "s0" },
        { time: "17:00", duration: 30, title: "Guest arrival", category: "guest", sortOrder: 1, _tempId: "s1" },
        { time: "17:30", duration: 90, title: "Main event", category: "entertainment", sortOrder: 2, _tempId: "s2" },
        { time: "19:00", duration: 60, title: "Dinner service", category: "food", sortOrder: 3, _tempId: "s3" },
        { time: "20:00", duration: 60, title: "Bar service", category: "beverage", sortOrder: 4, _tempId: "s4" },
        { time: "21:00", duration: 30, title: "Farewell & packdown", category: "packdown", sortOrder: 5, _tempId: "s5" },
      );
    }
    setItems(base);
  }

  const utils = trpc.useUtils();
  const createMutation = trpc.runsheets.create.useMutation({
    onSuccess: (data) => {
      setSheetId(data.id);
      utils.runsheets.list.invalidate();
      toast.success("Runsheet created!");
      const qs = [`id=${data.id}`, bookingId ? `bookingId=${bookingId}` : ''].filter(Boolean).join('&');
      navigate(`/runsheet?${qs}`, { replace: true });
    },
    onError: () => toast.error("Failed to save runsheet"),
  });
  const updateMutation = trpc.runsheets.update.useMutation({
    onSuccess: () => { utils.runsheets.get.invalidate({ id: sheetId! }); toast.success("Saved!"); },
    onError: () => toast.error("Failed to save"),
  });
  const silentUpdateMutation = trpc.runsheets.update.useMutation();
  const addItemMutation = trpc.runsheets.addItem.useMutation({
    onSuccess: () => utils.runsheets.get.invalidate({ id: sheetId! }),
    onError: () => toast.error("Failed to add item"),
  });
  const updateItemMutation = trpc.runsheets.updateItem.useMutation({
    onError: () => toast.error("Failed to update item"),
  });
  const deleteItemMutation = trpc.runsheets.deleteItem.useMutation({
    onSuccess: () => utils.runsheets.get.invalidate({ id: sheetId! }),
    onError: () => toast.error("Failed to delete item"),
  });

  // Auto-save F&B column visibility whenever it changes (only after initial load)
  const fnbColsInitialized = React.useRef(false);
  useEffect(() => {
    if (!fnbColsInitialized.current) { fnbColsInitialized.current = true; return; }
    if (!sheetId) return;
    silentUpdateMutation.mutate({
      id: sheetId,
      fnbColumns: { dietary: showDietaryCol, serviceTime: showTimeCol, staff: showStaffCol, notes: showPrepPlatingCol, qty: showQtyCol },
    } as any);
  }, [showDietaryCol, showTimeCol, showStaffCol, showPrepPlatingCol, showQtyCol]);

  // Auto-save dietaries (debounced) so they persist without requiring an explicit Save click.
  // Without this, dietaries added in the builder never make it to the live/staff link.
  const dietariesInitialized = React.useRef(false);
  useEffect(() => {
    if (!dietariesInitialized.current) { dietariesInitialized.current = true; return; }
    if (!sheetId) return;
    const t = setTimeout(() => {
      silentUpdateMutation.mutate({
        id: sheetId,
        dietaries: dietaries,
      } as any);
    }, 600);
    return () => clearTimeout(t);
  }, [dietaries, sheetId]);

  // Auto-save notes / drinks / payment notes / event header fields (debounced).
  // Means the user no longer has to remember to click Save after every tweak —
  // changes hit the server within ~1s and are reflected on the staff/live link.
  const autosaveInitialized = React.useRef(false);
  useEffect(() => {
    if (!autosaveInitialized.current) { autosaveInitialized.current = true; return; }
    if (!sheetId) return;
    const t = setTimeout(() => {
      silentUpdateMutation.mutate({
        id: sheetId,
        notes: notes || undefined,
        footerText: footerText || undefined,
        paymentNotes: paymentNotes || undefined,
        spaceName: spaceName || undefined,
        venueArea: venueArea || undefined,
        eventStartTime: eventStartTime || null,
        eventEndTime: eventEndTime || null,
        guestCount: guestCount ? Number(guestCount) : undefined,
        eventType: eventType || undefined,
        venueSetup: venueSetup || undefined,
        setupSummary: setupSummary || undefined,
        gstInclusive,
        drinksData: { barOption: rsBarOption, tabAmount: rsTabAmount ? parseFloat(rsTabAmount) : undefined, selectedDrinks: rsSelectedDrinks, customDrinks: rsCustomDrinks, barNotes: rsBarNotes || undefined, drinkTypes: rsDrinkTypes },
      } as any);
    }, 1000);
    return () => clearTimeout(t);
  }, [sheetId, notes, footerText, paymentNotes, spaceName, venueArea, eventStartTime, eventEndTime, guestCount, eventType, venueSetup, setupSummary, gstInclusive, rsBarOption, rsBarNotes, rsTabAmount, rsSelectedDrinks, rsCustomDrinks, rsDrinkTypes]);

  // Auto-create a staff portal link when the runsheet loads and none exist yet
  const staffLinkAutoCreated = React.useRef(false);
  useEffect(() => {
    if (!sheetId || staffLinkAutoCreated.current) return;
    if (staffLinks === undefined) return;
    if (staffLinks.length === 0) {
      staffLinkAutoCreated.current = true;
      createStaffLinkMutation.mutate({ runsheetId: sheetId, label: 'Staff Portal' });
    } else {
      staffLinkAutoCreated.current = true;
    }
  }, [sheetId, staffLinks]);

  async function handleSave() {
    setSaving(true);
    try {
      if (!sheetId) {
        const created = await createMutation.mutateAsync({
          title,
          leadId,
          bookingId,
          proposalId: linkedProposalId,
          eventDate: eventDate || undefined,
          venueName: venueName || undefined,
          spaceName: spaceName || undefined,
          venueArea: venueArea || undefined,
          eventStartTime: eventStartTime || undefined,
          eventEndTime: eventEndTime || undefined,
          guestCount: guestCount ? Number(guestCount) : undefined,
          eventType: eventType || undefined,
          notes: notes || undefined,
          dietaries: dietaries.length ? dietaries : undefined,
          venueSetup: venueSetup || undefined,
          setupSummary: setupSummary || undefined,
          footerText: footerText || undefined,
          gstInclusive,
          paymentNotes: paymentNotes || undefined,
          drinksData: (rsBarOption || rsBarNotes || rsSelectedDrinks.length || rsCustomDrinks.length)
            ? { barOption: rsBarOption, tabAmount: rsTabAmount ? parseFloat(rsTabAmount) : undefined, selectedDrinks: rsSelectedDrinks, customDrinks: rsCustomDrinks, barNotes: rsBarNotes || undefined, drinkTypes: rsDrinkTypes }
            : undefined,
          items: items.map((item, i) => ({
            time: item.time,
            duration: item.duration,
            title: item.title,
            description: item.description,
            assignedTo: item.assignedTo,
            category: item.category,
            sortOrder: i,
            bold: item.bold,
            italic: item.italic,
            highlight: item.highlight,
          })),
        } as any);
        if (fnbItems.length > 0 && created?.id) await saveFnb(created.id);
      } else {
        await updateMutation.mutateAsync({
          id: sheetId,
          title,
          eventDate: eventDate || null,
          venueName: venueName || undefined,
          spaceName: spaceName || undefined,
          venueArea: venueArea || undefined,
          eventStartTime: eventStartTime || null,
          eventEndTime: eventEndTime || null,
          guestCount: guestCount ? Number(guestCount) : undefined,
          eventType: eventType || undefined,
          notes: notes || undefined,
          dietaries: dietaries.length ? dietaries : undefined,
          venueSetup: venueSetup || undefined,
          setupSummary: setupSummary || undefined,
          footerText: footerText || undefined,
          proposalId: linkedProposalId,
          floorPlanId: linkedFloorPlanId ?? null,
          costItems: costItems.length ? costItems : null,
          drinksData: { barOption: rsBarOption, tabAmount: rsTabAmount ? parseFloat(rsTabAmount) : undefined, selectedDrinks: rsSelectedDrinks, customDrinks: rsCustomDrinks, barNotes: rsBarNotes || undefined, drinkTypes: rsDrinkTypes },
          gstInclusive,
          paymentNotes: paymentNotes || undefined,
        } as any);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.id) {
            await addItemMutation.mutateAsync({
              runsheetId: sheetId,
              time: item.time,
              duration: item.duration,
              title: item.title,
              description: item.description,
              assignedTo: item.assignedTo,
              category: item.category,
              sortOrder: i,
              bold: item.bold,
              italic: item.italic,
              highlight: item.highlight,
            });
          } else {
            await updateItemMutation.mutateAsync({
              id: item.id,
              time: item.time,
              duration: item.duration,
              title: item.title,
              description: item.description,
              assignedTo: item.assignedTo,
              category: item.category,
              sortOrder: i,
              bold: item.bold,
              italic: item.italic,
              highlight: item.highlight,
            });
          }
        }
        if (fnbItems.length > 0) await saveFnb();
      }
      // Mark clean after successful save
      setIsDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function addItem() {
    const lastItem = items[items.length - 1];
    const newTime = lastItem ? addMinutes(lastItem.time, lastItem.duration) : "09:00";
    const newItem: Item = {
      time: newTime,
      duration: 30,
      title: "",
      category: "other",
      sortOrder: items.length,
      _tempId: `new-${Date.now()}`,
    };
    setItems(prev => [...prev, newItem]);
    setExpandedItem(newItem._tempId!);
  }

  function removeItem(idx: number) {
    const item = items[idx];
    if (item.id && sheetId) deleteItemMutation.mutate({ id: item.id });
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function moveItem(idx: number, dir: 'up' | 'down') {
    const newItems = [...items];
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    [newItems[idx], newItems[targetIdx]] = [newItems[targetIdx], newItems[idx]];
    setItems(newItems.map((item, i) => ({ ...item, sortOrder: i })));
  }

  function duplicateItem(idx: number) {
    const item = items[idx];
    const newItem: Item = {
      ...item,
      id: undefined,
      _tempId: `dup-${Date.now()}`,
      sortOrder: idx + 1,
    };
    const newItems = [...items];
    newItems.splice(idx + 1, 0, newItem);
    setItems(newItems.map((it, i) => ({ ...it, sortOrder: i })));
  }

  function updateItemField(idx: number, field: keyof Item, value: any) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function getItemKey(item: Item) {
    return item._tempId ?? String(item.id);
  }

  function addDietary() {
    if (!newDietary.name.trim()) return;
    setDietaries(prev => [...prev, {
      name: newDietary.name.trim(),
      count: Number(newDietary.count) || 1,
      notes: newDietary.notes.trim() || undefined,
    }]);
    setNewDietary({ name: "", count: "1", notes: "" });
  }

  function removeDietary(idx: number) {
    setDietaries(prev => prev.filter((_, i) => i !== idx));
  }

  function updateDietary(idx: number, field: keyof Dietary, value: any) {
    setDietaries(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  }

  function toggleChecklistItem(id: string) {
    const updated = checklistItems.map(item => item.id === id ? { ...item, checked: !item.checked, checkedAt: !item.checked ? new Date().toISOString() : undefined } : item);
    setChecklistItems(updated);
    if (checklistInstance?.shareToken) {
      const item = checklistItems.find(i => i.id === id);
      toggleByToken.mutate({ token: checklistInstance.shareToken, itemId: id, checked: item ? !item.checked : true });
    } else if (sheetId) {
      saveChecklistItems.mutate({ runsheetId: sheetId, items: updated as any });
    }
  }

  function addChecklistItem() {
    if (!newChecklistText.trim()) return;
    const updated = [...checklistItems, { id: `c-${Date.now()}`, text: newChecklistText.trim(), checked: false, category: "other" }];
    setChecklistItems(updated);
    setNewChecklistText("");
    if (sheetId) saveChecklistItems.mutate({ runsheetId: sheetId, items: updated as any });
  }

  function removeChecklistItem(id: string) {
    const updated = checklistItems.filter(item => item.id !== id);
    setChecklistItems(updated);
    if (sheetId) saveChecklistItems.mutate({ runsheetId: sheetId, items: updated as any });
  }

  function setChecklistItemImage(id: string, imageUrl: string) {
    const updated = checklistItems.map(item => item.id === id ? { ...item, imageUrl: imageUrl || undefined } : item);
    setChecklistItems(updated);
    if (sheetId) saveChecklistItems.mutate({ runsheetId: sheetId, items: updated as any });
  }

  async function handleChecklistPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = pendingChecklistPhotoId;
    e.target.value = ""; // allow re-picking the same file later
    setPendingChecklistPhotoId(null);
    if (!file || !id) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file (JPG, PNG…)"); return; }
    setChecklistPhotoUploading(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Upload failed");
      const { url } = await res.json();
      setChecklistItemImage(id, url);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't upload that photo — please try again");
    } finally {
      setChecklistPhotoUploading(null);
    }
  }

  function pullDrinksFromFnb() {
    const drinkItems = fnbItems.filter(i => i.course === 'Drinks' && i.dishName?.trim());
    if (drinkItems.length === 0) {
      toast.info('No drinks listed in the F&B sheet yet — add them there first.');
      return;
    }
    const toAdd: typeof checklistItems = [];
    for (const drink of drinkItems) {
      const text = `Stock bar: ${drink.dishName.trim()}`;
      if (checklistItems.some(ci => ci.text === text)) continue;
      toAdd.push({ id: `c-bar-${Date.now()}-${Math.random().toString(36).slice(2)}`, text, checked: false, category: 'bar' });
    }
    if (toAdd.length === 0) {
      toast.info('All drinks are already in the checklist.');
      return;
    }
    const updated = [...checklistItems, ...toAdd];
    setChecklistItems(updated);
    if (sheetId) saveChecklistItems.mutate({ runsheetId: sheetId, items: updated as any });
    toast.success(`Added ${toAdd.length} bar stock item${toAdd.length !== 1 ? 's' : ''} to the checklist`);
  }

  // Format event date for display
  const formattedEventDate = eventDate
    ? new Date(eventDate + "T12:00:00").toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  // ── Home screen: no runsheet selected ────────────────────────────────────────
  if (!sheetId && !leadId && !bookingId && !isNewMode) {
    return (
      <div className="min-h-screen bg-cream">
        <div className="bg-forest border-b border-white/10 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/dashboard")} className="text-white/50 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="font-bebas tracking-widest text-gold text-sm">RUNSHEET BUILDER</span>
          </div>
          <button
            onClick={() => navigate("/runsheet?new=1")}
            className="font-bebas tracking-widest text-xs bg-gold text-ink px-4 py-2 flex items-center gap-1.5 hover:bg-gold/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> NEW RUNSHEET
          </button>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-bebas tracking-widest text-2xl text-ink">MY RUNSHEETS</h1>
            <span className="font-dm text-sm text-ink/40">{(allRunsheets ?? []).length} total</span>
          </div>

          {!allRunsheets ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-forest border-t-transparent rounded-full animate-spin" />
            </div>
          ) : allRunsheets.length === 0 ? (
            <div className="text-center py-20 bg-white border border-gold/20">
              <ClipboardList className="w-12 h-12 text-ink/20 mx-auto mb-4" />
              <div className="font-bebas tracking-widest text-xl text-ink/30 mb-2">NO RUNSHEETS YET</div>
              <p className="font-dm text-sm text-ink/40 mb-6">Create your first runsheet to get started.</p>
              <button
                onClick={() => navigate("/runsheet?new=1")}
                className="font-bebas tracking-widest text-sm bg-forest text-cream px-6 py-2.5 hover:bg-forest/90 transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> CREATE RUNSHEET
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {[...allRunsheets].sort((a, b) => {
                // Sort by eventDate desc, then createdAt desc
                const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
                const db_ = b.eventDate ? new Date(b.eventDate).getTime() : 0;
                return db_ - da || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              }).map(rs => (
                <button
                  key={rs.id}
                  onClick={() => navigate(`/runsheet?id=${rs.id}`)}
                  className="w-full text-left bg-white border border-gold/20 hover:border-forest/40 hover:shadow-sm transition-all px-5 py-4 flex items-center gap-4 group"
                >
                  <div className="w-1 self-stretch bg-forest/20 group-hover:bg-forest transition-colors flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-cormorant font-semibold text-lg text-ink leading-tight truncate">
                      {rs.title || "Untitled Runsheet"}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {rs.eventDate && (
                        <span className="font-dm text-xs text-ink/55 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(rs.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                      {rs.eventType && (
                        <span className="font-bebas text-[10px] tracking-widest text-ink/40 border border-ink/15 px-1.5 py-0.5">
                          {rs.eventType}
                        </span>
                      )}
                      {rs.guestCount && (
                        <span className="font-dm text-xs text-ink/40">
                          {rs.guestCount} guests
                        </span>
                      )}
                      {rs.spaceName && (
                        <span className="font-dm text-xs text-ink/40">{rs.spaceName}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-bebas text-[10px] tracking-widest text-ink/30 mb-1">#{rs.id}</div>
                    <div className="font-dm text-[10px] text-ink/30">
                      {new Date(rs.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink/20 group-hover:text-forest flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const checkedCount = checklistItems.filter(i => i.checked).length;

  return (
    <div className="min-h-screen bg-cream print:bg-white" style={{ ['--brand' as any]: venuePrimaryColor }}>
      {/* ── Header (matches EventDetail style) ──────────────────────────── */}
      <nav className="no-print bg-forest-dark sticky top-0 z-50 border-b border-gold/20 h-14 flex items-center px-4 gap-3">
        <button
          onClick={() => {
            if (bookingId) navigate(`/event/${bookingId}`);
            else if (leadId) navigate("/dashboard");
            else navigate("/runsheet");
          }}
          className="text-cream/70 hover:text-cream flex items-center gap-1.5 font-bebas tracking-widest text-xs"
        >
          <ArrowLeft className="w-4 h-4" /> {bookingId ? 'EVENT' : 'BACK'}
        </button>
        <div className="h-4 w-px bg-gold/20" />
        <span className="font-cormorant text-cream font-semibold text-base flex-1 truncate">
          {title || 'Runsheet Builder'}
          {sheetId && <span className="ml-2 text-cream/40 text-xs font-dm">#{sheetId}</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates(v => !v)}
            className={`font-bebas tracking-widest text-xs hidden md:flex items-center gap-1.5 transition-colors px-3 py-1.5 border ${
              showTemplates ? 'border-gold text-gold bg-gold/10' : 'border-cream/20 text-cream/70 hover:text-gold hover:border-gold/40'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> TEMPLATES
          </button>
          <div className="hidden md:flex items-center border border-cream/20 overflow-hidden" title="Print column layout">
            <button
              onClick={() => setPrintColumns(1)}
              className={`font-bebas tracking-widest text-xs px-2.5 py-1.5 transition-colors flex items-center gap-1 ${printColumns === 1 ? 'bg-gold text-ink' : 'text-cream/50 hover:text-gold'}`}
            >
              <LayoutGrid className="w-3 h-3" /> 1 COL
            </button>
            <div className="w-px h-4 bg-cream/20" />
            <button
              onClick={() => setPrintColumns(2)}
              className={`font-bebas tracking-widest text-xs px-2.5 py-1.5 transition-colors flex items-center gap-1 ${printColumns === 2 ? 'bg-gold text-ink' : 'text-cream/50 hover:text-gold'}`}
            >
              <LayoutGrid className="w-3 h-3" /> 2 COL
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => setPrintEditorOpen(v => !v)}
              className={`font-bebas tracking-widest text-xs items-center gap-1.5 transition-colors px-3 py-1.5 border flex ${printHide.size > 0 ? 'border-gold text-gold bg-gold/10' : 'border-cream/20 text-cream/70 hover:text-gold hover:border-gold/40'}`}
              title="Choose which sections appear in the print view and the BEO PDF"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PRINT VIEW</span>
              {printHide.size > 0 && (
                <span className="bg-gold text-ink text-[9px] font-bebas px-1.5 rounded-sm">{printHide.size}</span>
              )}
            </button>
            {printEditorOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPrintEditorOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gold/30 shadow-2xl rounded-sm w-72 no-print">
                  <div className="px-4 py-3 border-b border-gold/20 flex items-center justify-between">
                    <span className="font-bebas tracking-widest text-xs text-forest">PRINT VIEW EDITOR</span>
                    <button
                      onClick={() => setPrintHide(new Set())}
                      className="font-bebas tracking-widest text-[10px] text-ink/40 hover:text-forest"
                      title="Show all sections"
                    >RESET</button>
                  </div>
                  <p className="px-4 pt-2 pb-1 font-dm text-[11px] text-ink/50 leading-snug">
                    Tick sections to include them. Applies to the in-app print and the BEO PDF.
                  </p>
                  <div className="px-2 pb-2 max-h-80 overflow-y-auto">
                    {PRINT_SECTIONS.map(s => {
                      const checked = !printHide.has(s.key);
                      return (
                        <label key={s.key} className="flex items-start gap-2 px-2 py-1.5 hover:bg-linen/50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePrintSection(s.key)}
                            className="mt-0.5 accent-forest"
                          />
                          <div className="flex-1">
                            <div className="font-dm text-sm text-ink leading-tight">{s.label}</div>
                            {s.beoOnly && <div className="font-dm text-[10px] text-ink/40">BEO PDF only</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={runPrint}
            className="font-bebas tracking-widest text-xs text-cream/70 hover:text-gold hidden md:flex items-center gap-1.5 transition-colors px-2 py-1.5"
            title="Print runsheet (respects Print View)"
          >
            <Printer className="w-4 h-4" /> <span>PRINT</span>
          </button>
          {effectiveBookingId && (
            <button
              onClick={() => setBeoPreviewOpen(true)}
              className="flex font-bebas tracking-widest text-xs bg-gold text-ink hover:bg-gold/90 px-3 py-1.5 items-center gap-1.5 transition-colors"
              title="See exactly how the BEO will look, adjust which sections show, then print or download"
            >
              <Eye className="w-3.5 h-3.5" /> PREVIEW &amp; PRINT BEO
            </button>
          )}
          {effectiveBookingId ? (
            <a
              href={`/api/beo/${effectiveBookingId}${beoHideQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex font-bebas tracking-widest text-xs border border-cream/20 text-cream/70 hover:border-gold/40 hover:text-gold px-3 py-1.5 items-center gap-1.5 transition-colors"
              title="Download the BEO PDF directly (respects Print View)"
            >
              <FileText className="w-3.5 h-3.5" /> BEO PDF
            </a>
          ) : null}
          {effectiveBookingId && (
            <button
              onClick={() => {
                if (!effectiveBookingId) return;
                pushRunsheetToNbi.mutate({ id: effectiveBookingId });
              }}
              disabled={pushRunsheetToNbi.isPending}
              title="Push this booking to NowBookIt"
              className="hidden lg:flex font-bebas tracking-widest text-xs bg-[#6b98e7] hover:bg-[#5a85d4] text-white px-3 py-1.5 items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <span className="font-bebas text-[10px] tracking-wider">NBI</span>
              {pushRunsheetToNbi.isPending ? 'PUSHING…' : 'PUSH TO NOWBOOKIT'}
            </button>
          )}
          {isDirty && !saving && (
            <div className="no-print flex items-center gap-1.5 text-xs font-dm text-amber-700 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes
            </div>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`font-bebas tracking-widest text-xs rounded-sm px-5 py-2 flex items-center gap-1.5 transition-all ${
              isDirty
                ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/40 animate-pulse'
                : 'bg-gold hover:bg-gold/90 text-ink shadow-sm shadow-gold/30'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "SAVING..." : isDirty ? "SAVE CHANGES" : "SAVED"}
          </Button>
        </div>
      </nav>

      {/* ── Templates Panel ─────────────────────────────────────────────── */}
      {showTemplates && (
        <div className="bg-forest border-b border-white/10 no-print">
          <div className="max-w-6xl mx-auto px-6 py-5">
            <div className="flex items-start gap-6">
              {/* Save current as template */}
              <div className="flex-1">
                <div className="font-bebas tracking-widest text-gold text-sm mb-3">SAVE CURRENT TIMELINE AS TEMPLATE</div>
                <div className="flex gap-2">
                  <input
                    value={saveTemplateName}
                    onChange={e => setSaveTemplateName(e.target.value)}
                    placeholder="Template name (e.g. Wedding Dinner)..."
                    className="flex-1 bg-[#2a2a2a] border border-[#444] text-white placeholder-white/30 px-3 py-2 text-sm font-dm focus:outline-none focus:border-gold"
                    onKeyDown={e => e.key === 'Enter' && saveAsTemplate()}
                  />
                  <button
                    onClick={saveAsTemplate}
                    disabled={savingTemplate || !saveTemplateName.trim()}
                    className="bg-gold hover:bg-gold/90 disabled:opacity-40 text-ink font-bebas tracking-widest text-xs px-4 py-2 flex items-center gap-1.5 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" /> {savingTemplate ? 'SAVING...' : 'SAVE'}
                  </button>
                </div>
                {items.length === 0 && (
                  <p className="text-white/30 text-xs font-dm mt-2">Add timeline items first before saving as a template.</p>
                )}
              </div>
              {/* Divider */}
              <div className="w-px bg-white/10 self-stretch" />
              {/* Saved templates */}
              <div className="flex-1">
                <div className="font-bebas tracking-widest text-gold text-sm mb-3">LOAD A SAVED TEMPLATE</div>
                {!templates || templates.length === 0 ? (
                  <p className="text-white/30 text-sm font-dm">No templates saved yet. Save your first timeline above.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {templates.map((tpl: any) => (
                      <div key={tpl.id} className="flex items-center gap-2 bg-[#2a2a2a] border border-white/10 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-dm text-sm text-white truncate">{tpl.name}</div>
                          <div className="font-dm text-xs text-white/40">
                            {(tpl.items as any[]).length} items{tpl.eventType ? ` · ${tpl.eventType}` : ''}
                          </div>
                        </div>
                        <button
                          onClick={() => loadTemplate(tpl)}
                          className="font-bebas tracking-widest text-xs bg-[#8D957E] hover:bg-[#8D957E]/90 text-white px-3 py-1.5 transition-colors flex-shrink-0"
                        >
                          LOAD
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete template "${tpl.name}"?`)) deleteTemplateMutation.mutate({ id: tpl.id }); }}
                          className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Smart Paste Import Banner (collapsible) ─────────────────────────── */}
      <div className="no-print border-b border-gold/20">
        <button
          onClick={() => setSmartPasteOpen(v => !v)}
          className="w-full flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-forest/5 via-gold/5 to-forest/5 hover:from-forest/8 hover:via-gold/8 hover:to-forest/8 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-gold" />
          <span className="font-bebas tracking-widest text-xs text-forest">SMART PASTE IMPORT</span>
          <span className="font-dm text-xs text-ink/40 hidden sm:inline">— paste a brief, email or doc and AI fills everything in</span>
          <ChevronDown className={`w-3.5 h-3.5 text-ink/30 ml-auto transition-transform ${smartPasteOpen ? 'rotate-180' : ''}`} />
        </button>
        {smartPasteOpen && (
          <div className="bg-gradient-to-r from-forest/5 via-gold/5 to-forest/5 px-6 pb-4">
            <div className="max-w-6xl mx-auto">
              <div className="flex gap-2 items-end">
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  onPaste={e => {
                    const text = e.clipboardData.getData('text');
                    if (text) {
                      e.preventDefault();
                      const t = e.target as HTMLTextAreaElement;
                      const start = t.selectionStart ?? pasteText.length;
                      const end = t.selectionEnd ?? pasteText.length;
                      setPasteText(pasteText.slice(0, start) + text + pasteText.slice(end));
                    }
                  }}
                  placeholder={"Paste anything here — client email, booking brief, Word doc, or catering notes.\nAI will extract: event details, dietaries, F&B items, and timeline."}
                  rows={3}
                  className="flex-1 rounded-sm border border-gold/20 focus:outline-none focus:border-forest font-dm text-sm resize-none bg-white/80 placeholder:text-ink/30 p-3"
                />
                <button
                  onClick={() => { if (pasteText.trim()) { setShowPasteImport(true); setParsedData(null); setEditedParsedTimeline([]); } }}
                  disabled={!pasteText.trim()}
                  className="font-bebas tracking-widest text-sm bg-forest text-cream px-5 flex flex-col items-center justify-center gap-1.5 rounded-sm hover:bg-forest/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 self-stretch"
                >
                  <Sparkles className="w-4 h-4" />
                  IMPORT
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`max-w-6xl mx-auto px-6 py-8 print:px-0 print:py-4 space-y-0 ${printColumns === 2 ? 'print-cols-2' : ''}`}>

        {/* ── Print Header ────────────────────────────────────────────────── */}
        <div className="hidden print:block mb-6 pb-4 border-b-2 border-ink">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bebas text-2xl tracking-widest text-[var(--brand)] mb-1">FUNCTION RUNSHEET</div>
              <div className="font-cormorant text-3xl font-semibold text-ink">{title}</div>
            </div>
            <div className="text-right">
              <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">PREPARED BY</div>
              <div className="font-dm text-sm font-semibold">{venueName || "VenueFlowHQ"}</div>
              <div className="font-dm text-xs text-ink/50">{new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
          </div>
        </div>

        {/* ── Event Details Card ──────────────────────────────────────────── */}
        <div className="dante-card p-6 mb-6 print:shadow-none print:border-0 print:mb-2 print:p-0">
          {/* Section header */}
          <div className="flex items-center justify-between mb-4 no-print">
            <div className="gold-rule max-w-xs"><span>EVENT DETAILS</span></div>
          </div>
          {/* Editable title */}
          <div className="pb-4 no-print">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-2xl font-cormorant font-semibold text-ink border-0 border-b-2 border-ink/15 focus-visible:border-forest rounded-none px-0 bg-transparent"
              placeholder="Event Runsheet Title"
            />
          </div>

          <div>
            {/* Event details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DATE</label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{formattedEventDate || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">EVENT TYPE</label>
                <Input
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  placeholder="Wedding, Birthday..."
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{eventType || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">VENUE / SPACE</label>
                <SpacePicker value={spaceName} onChange={setSpaceName} />
                <div className="hidden print:block font-dm text-sm font-semibold">{spaceName || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">GUESTS</label>
                <Input
                  type="number"
                  value={guestCount}
                  onChange={e => setGuestCount(e.target.value)}
                  placeholder="0"
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{guestCount || "—"}</div>
              </div>
            </div>
            {/* Event time row — venue/space lives in the grid above; this is times only */}
            <div className="grid grid-cols-2 gap-4 mb-4 pt-3 border-t border-gold/20">
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">START TIME</label>
                <Input
                  type="time"
                  step={900}
                  value={eventStartTime}
                  onChange={e => setEventStartTime(roundTimeToQuarter(e.target.value))}
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{eventStartTime || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">END TIME</label>
                <Input
                  type="time"
                  step={900}
                  value={eventEndTime}
                  onChange={e => setEventEndTime(roundTimeToQuarter(e.target.value))}
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{eventEndTime || "—"}</div>
              </div>
            </div>

            {/* Contact info row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gold/20">
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1 flex items-center gap-1"><User className="w-3 h-3" /> CLIENT NAME</label>
                <Input
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Client name..."
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm">{contactName || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> PHONE</label>
                <Input
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="Phone number..."
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm">{contactPhone || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> EMAIL</label>
                <Input
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="Email address..."
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm">{contactEmail || "—"}</div>
              </div>
            </div>

            {/* Deposit & balance — so staff can see what's already been paid and
                only collect the remaining balance (don't re-charge the deposit). */}
            {booking && (() => {
              const dep = Number((booking as any).depositNzd ?? 0);
              const paid = !!(booking as any).depositPaid;
              if (!(dep > 0 || paid)) return null;
              // Balance is based on the ACTUAL event total — F&B sheet + Costs-tab
              // food/beverage items + bar tab — not just the minimum spend, so it
              // reflects what's really been quoted. Falls back to the booking total
              // or minimum spend when nothing's itemised yet.
              const fnbFood = fnbItems
                .filter(it => (it.course ?? '') !== 'Drinks')
                .reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice ?? 0), 0);
              const costFb = costItems
                .filter(ci => (ci.category || '').toLowerCase().includes('food') || (ci.category || '').toLowerCase().includes('beverage'))
                .reduce((s, ci) => s + Number(ci.qty) * Number(ci.unitPrice), 0);
              const tab = rsTabAmount ? Number(rsTabAmount) : 0;
              const actualTotal = fnbFood + costFb + tab;
              const totalRef = Math.max(
                Number((booking as any).totalNzd ?? 0),
                Number((booking as any).minimumSpend ?? 0),
                actualTotal,
              );
              const balance = totalRef > 0 ? Math.max(0, totalRef - (paid ? dep : 0)) : null;
              const money = (n: number) => `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return (
                <div className={`mt-4 px-4 py-3 rounded border ${paid ? 'bg-forest/5 border-forest/40' : 'bg-amber-50 border-amber-300'}`}>
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                    <div>
                      <div className="font-bebas tracking-widest text-[10px] text-ink/40">DEPOSIT {paid ? '✓ PAID' : '— OUTSTANDING'}</div>
                      <div className="font-cormorant text-xl font-semibold text-ink leading-tight">{dep > 0 ? money(dep) : '—'}</div>
                    </div>
                    {balance != null && (
                      <div>
                        <div className="font-bebas tracking-widest text-[10px] text-ink/40">BALANCE TO COLLECT</div>
                        <div className="font-cormorant text-xl font-semibold text-ink leading-tight">{money(balance)}</div>
                      </div>
                    )}
                    <div className={`font-dm text-xs ${paid ? 'text-forest/80' : 'text-amber-700'}`}>
                      {paid ? 'Deposit already received — only collect the balance, don’t re-charge it.' : 'Deposit not yet received.'}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Sortable Sections ────────────────────────────────────────────── */}
        <DndContext sensors={sectionSensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
          <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
            {sectionOrder.map(sectionId => {
              const isHidden = hiddenSections.has(sectionId);

              if (sectionId === 'setup') return (
                <SortableSection key="setup" id="setup">
                  <div data-print-section="setup" className={`dante-card mb-4 print:shadow-none ${isHidden ? 'no-print' : ''}`}>
                    {/* Header */}
                    <div className="flex items-center no-print">
                      <button
                        onClick={() => !isHidden && setSetupSectionOpen(v => !v)}
                        className="flex-1 flex items-center gap-2 pl-6 pr-3 py-3 hover:bg-linen transition-colors text-left"
                      >
                        <Building2 className="w-4 h-4 text-forest flex-shrink-0" />
                        <span className="font-bebas tracking-widest text-sm text-forest">VENUE SETUP</span>
                        {venueSetup && !isHidden && <span className="text-xs text-forest/50 font-dm truncate max-w-[160px]">{venueSetup.substring(0, 35)}{venueSetup.length > 35 ? "…" : ""}</span>}
                        {isHidden && <span className="text-xs text-ink/30 font-dm italic">hidden from print</span>}
                      </button>
                      <div className="flex items-center gap-1 pr-3">
                        <button
                          onClick={() => toggleSectionHidden('setup')}
                          className="p-1.5 text-ink/25 hover:text-ink/60 transition-colors"
                          title={isHidden ? "Show section" : "Hide from runsheet"}
                        >
                          {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        {!isHidden && (
                          <button onClick={() => setSetupSectionOpen(v => !v)} className="p-1 text-ink/30">
                            {setupSectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Print header */}
                    <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30 bg-[var(--brand)]">
                      <Building2 className="w-4 h-4 text-white" />
                      <span className="font-bebas tracking-widest text-sm text-white">VENUE SETUP</span>
                    </div>
                    {/* Body */}
                    {!isHidden && setupSectionOpen && (
                      <div className="px-5 pb-4 pt-2 space-y-3 no-print">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bebas tracking-widest text-[10px] text-ink/40">QUICK FILL TEMPLATES</span>
                          <button
                            onClick={openSetupManager}
                            className="flex items-center gap-1 text-[10px] font-bebas tracking-widest text-forest/60 hover:text-forest transition-colors"
                          >
                            <Settings2 className="w-3 h-3" /> CUSTOMISE
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {activeSetupTemplates.map(t => (
                            <button
                              key={t.label}
                              onClick={() => setVenueSetup(t.value)}
                              className="text-xs font-bebas tracking-widest px-3 py-1.5 border border-forest/30 text-forest hover:bg-forest/5 transition-colors"
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <div>
                          <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">SETUP SUMMARY (ONE LINE)</label>
                          <input
                            value={setupSummary}
                            onChange={e => setSetupSummary(e.target.value)}
                            placeholder="One line — e.g. 'Seated · 2 × tables of 8'"
                            className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                          />
                        </div>
                        <RichTextarea
                          value={venueSetup}
                          onChange={setVenueSetup}
                          placeholder="Describe the room layout, table arrangement, AV setup, decorations, bar position, dance floor, stage..."
                          minHeight="72px"
                          className="no-print"
                        />
                      </div>
                    )}
                    {!isHidden && venueSetup && (
                      <div className="hidden print:block px-5 py-3 font-dm text-sm vf-rich-content" dangerouslySetInnerHTML={{ __html: venueSetup }} />
                    )}
                  </div>
                </SortableSection>
              );

              // Dietaries now live inside the F&B tab as a sub-tab — skip top-level rendering.
              if (sectionId === 'dietary') return null;
              // (legacy block kept below but unreachable; renderable if needed in future)
              if (false && sectionId === 'dietary') return (
                <SortableSection key="dietary" id="dietary">
                  <div className={`dante-card mb-4 print:shadow-none ${isHidden ? 'no-print' : ''}`}>
                    {/* Header */}
                    <div className="flex items-center no-print">
                      <button
                        onClick={() => !isHidden && setDietarySectionOpen(v => !v)}
                        className="flex-1 flex items-center gap-2 pl-6 pr-3 py-3 hover:bg-linen transition-colors text-left"
                      >
                        <Leaf className="w-4 h-4 text-forest flex-shrink-0" />
                        <span className="font-bebas tracking-widest text-sm text-forest">DIETARY REQUIREMENTS</span>
                        {dietaries.length > 0 && !isHidden && (
                          <span className="bg-forest text-cream text-xs font-bebas px-2 py-0.5">{dietaries.length}</span>
                        )}
                        {isHidden && <span className="text-xs text-ink/30 font-dm italic">hidden from print</span>}
                      </button>
                      <div className="flex items-center gap-1 pr-3">
                        <button
                          onClick={() => toggleSectionHidden('dietary')}
                          className="p-1.5 text-ink/25 hover:text-ink/60 transition-colors"
                          title={isHidden ? "Show section" : "Hide from runsheet"}
                        >
                          {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        {!isHidden && (
                          <button onClick={() => setDietarySectionOpen(v => !v)} className="p-1 text-ink/30">
                            {dietarySectionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Print header */}
                    <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30 bg-[var(--brand)]">
                      <Leaf className="w-4 h-4 text-white" />
                      <span className="font-bebas tracking-widest text-sm text-white">DIETARY REQUIREMENTS</span>
                    </div>
                    {/* Body */}
                    {!isHidden && dietarySectionOpen && (
                      <div className="px-5 pb-4 pt-2 space-y-4 no-print">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bebas tracking-widest text-[10px] text-ink/40">QUICK ADD</span>
                          <button
                            onClick={openDietaryManager}
                            className="flex items-center gap-1 text-[10px] font-bebas tracking-widest text-forest/60 hover:text-forest transition-colors"
                          >
                            <Settings2 className="w-3 h-3" /> CUSTOMISE OPTIONS
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {activeDietaryOptions.map(d => (
                            <button
                              key={d}
                              onClick={() => {
                                if (!dietaries.find(x => x.name === d)) {
                                  setDietaries(prev => [...prev, { name: d, count: 1 }]);
                                }
                              }}
                              className={`text-xs font-bebas tracking-widest px-3 py-1.5 border transition-colors ${
                                dietaries.find(x => x.name === d)
                                  ? "bg-forest text-cream border-forest"
                                  : "border-forest/30 text-forest hover:bg-forest/5"
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                        {dietaries.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {dietaries.map((d, idx) => (
                              <div key={idx} className="border border-gold/20 bg-linen/40 p-3 group relative">
                                <button
                                  onClick={() => removeDietary(idx)}
                                  className="absolute top-2 right-2 text-ink/20 hover:text-red-500 transition-colors no-print opacity-0 group-hover:opacity-100"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                <div className="flex items-end gap-2 mb-2">
                                  <input
                                    type="number" min={1}
                                    value={d.count}
                                    onChange={e => updateDietary(idx, "count", Number(e.target.value))}
                                    className="font-cormorant text-3xl font-semibold text-forest bg-transparent border-0 focus:outline-none w-16 no-print leading-none"
                                  />
                                  <div className="hidden print:block font-cormorant text-3xl font-semibold text-forest leading-none">{d.count}</div>
                                  <span className="font-bebas tracking-widest text-xs text-ink/40 mb-1">GUESTS</span>
                                </div>
                                <input
                                  value={d.name}
                                  onChange={e => updateDietary(idx, "name", e.target.value)}
                                  className="font-dm text-sm font-semibold text-ink bg-transparent border-0 focus:outline-none w-full no-print"
                                />
                                <div className="hidden print:block font-dm text-sm font-semibold text-ink">{d.name}</div>
                                <input
                                  value={d.notes ?? ""}
                                  onChange={e => updateDietary(idx, "notes", e.target.value)}
                                  placeholder="Notes..."
                                  className="w-full font-dm text-xs text-ink/40 bg-transparent border-0 focus:outline-none mt-0.5 placeholder:text-ink/20 no-print"
                                />
                                {d.notes && <div className="hidden print:block font-dm text-xs text-ink/40 mt-0.5">{d.notes}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            value={newDietary.name}
                            onChange={e => setNewDietary(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Add requirement..."
                            className="flex-1 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                            onKeyDown={e => e.key === "Enter" && addDietary()}
                          />
                          <Input
                            type="number" min={1}
                            value={newDietary.count}
                            onChange={e => setNewDietary(prev => ({ ...prev, count: e.target.value }))}
                            placeholder="Count"
                            className="w-20 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                          />
                          <Input
                            value={newDietary.notes}
                            onChange={e => setNewDietary(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Notes (optional)"
                            className="flex-1 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                          />
                          <Button
                            onClick={addDietary}
                            className="bg-forest hover:bg-forest/90 text-cream rounded-sm font-bebas tracking-widest text-xs gap-1"
                          >
                            <Plus className="w-3 h-3" /> ADD
                          </Button>
                        </div>
                        {dietaries.length === 0 && (
                          <div className="text-center py-3 text-ink/30 font-dm text-sm">No dietary requirements recorded</div>
                        )}
                      </div>
                    )}
                    {/* Print view */}
                    {!isHidden && dietaries.length > 0 && (
                      <div className="hidden print:block px-5 py-3">
                        <div className="flex flex-wrap gap-2">
                          {dietaries.map((d, i) => (
                            <div key={i} className="border border-gold/30 px-3 py-1.5 text-sm font-dm">
                              <span className="font-semibold">{d.count}×</span> {d.name}
                              {d.notes && <span className="text-ink/50 ml-1">— {d.notes}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SortableSection>
              );

              return null;
            })}
          </SortableContext>
        </DndContext>

        {/* ── Main Tab Navigation ─────────────────────────────────────────── */}
        <div className="no-print flex border-b border-gold/20 overflow-x-auto">
          {[
            { id: 'timeline', label: 'TIMELINE', icon: <Clock className="w-4 h-4" />, count: items.length },
            { id: 'fnb', label: 'FOOD', icon: <UtensilsCrossed className="w-4 h-4" />, count: fnbItems.length },
            { id: 'drinks', label: 'DRINKS', icon: <Wine className="w-4 h-4" />, count: rsBarNotes ? ('✓' as any) : ((rsSelectedDrinks.length + rsCustomDrinks.length) || undefined) },
            { id: 'checklist', label: 'CHECKLIST', icon: <CheckSquare className="w-4 h-4" />, count: `${checkedCount}/${checklistItems.length}` },
            { id: 'tableplan', label: 'TABLE PLAN', icon: <LayoutGrid className="w-4 h-4" /> },
            { id: 'costs', label: 'COSTS', icon: <DollarSign className="w-4 h-4" />, count: costItems.length || undefined },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveMainTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-5 py-3 font-bebas tracking-widest text-xs whitespace-nowrap border-b-2 transition-colors ${
                activeMainTab === tab.id
                  ? 'border-gold text-amber-700'
                  : 'border-transparent text-ink/40 hover:text-ink/70'
              }`}
            >
              {tab.icon} {tab.label}
              {tab.count !== undefined && tab.count !== 0 && (
                <span className={`text-[10px] font-bebas px-1.5 py-0.5 rounded-sm ${activeMainTab === tab.id ? 'bg-gold/15 text-amber-700' : 'bg-ink/5 text-ink/40'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TIMELINE TAB ────────────────────────────────────────────────── */}
        {activeMainTab === 'timeline' && (
          <div data-print-section="timeline" className="dante-card border-t-0 print:shadow-none">
            {/* Timeline header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20 no-print">
              <div className="flex items-center gap-3">
                <h2 className="font-bebas tracking-widest text-ink/60 text-sm">EVENT TIMELINE</h2>
                {items.length > 0 && (() => {
                  const sorted = [...items].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
                  const first = sorted[0]; const last = sorted[sorted.length - 1];
                  return (
                    <span className="font-dm text-xs text-ink/40">
                      {formatTime12(first.time)} – {formatTime12(addMinutes(last.time, last.duration))}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowPasteImport(true); setParsedData(null); setPasteText(''); }}
                  className="font-bebas tracking-widest text-xs text-ink/50 hover:text-forest flex items-center gap-1 transition-colors border border-ink/20 px-3 py-1.5 hover:bg-forest/5 hover:border-forest/40"
                >
                  <FileText className="w-3.5 h-3.5" /> IMPORT FROM TEXT
                </button>
                <button
                  onClick={addItem}
                  className="font-bebas tracking-widest text-xs text-forest hover:text-forest/80 flex items-center gap-1 transition-colors border border-forest/30 px-3 py-1.5 hover:bg-forest/5"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD ITEM
                </button>
              </div>
            </div>

            {/* Print timeline header */}
            <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30 bg-[var(--brand)]">
              <Clock className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">EVENT TIMELINE</span>
            </div>

            {/* Event notes — at top */}
            <div data-print-section="notes" className="px-5 py-3 border-b border-gold/20 bg-linen/30">
              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1.5">EVENT NOTES</label>
              <RichTextarea
                value={notes}
                onChange={setNotes}
                placeholder="Any additional notes for the event..."
                minHeight="56px"
                className="no-print"
              />
              {notes && <div className="hidden print:block font-dm text-sm vf-rich-content" dangerouslySetInnerHTML={{ __html: notes }} />}
            </div>

            {items.length === 0 ? (
              <div className="text-center py-20 text-ink/30 font-dm text-sm">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-15" />
                <p className="mb-1">No items yet.</p>
                <p className="text-ink/20 text-xs">Click "Add Item" above to build your runsheet timeline.</p>
              </div>
            ) : (
              <div className="divide-y divide-gold/20">
                {items
                  .map((it, i) => ({ it, i }))
                  // Sort chronologically by time for display. We keep the
                  // original index `i` so updateItemField / moveItem /
                  // removeItem keep targeting the right row in state.
                  .sort((a, b) => (a.it.time ?? '').localeCompare(b.it.time ?? ''))
                  .map(({ it: item, i: idx }) => {
                  const key = getItemKey(item);
                  const isExpanded = expandedItem === key;
                  const endTime = addMinutes(item.time, item.duration);
                  const catInfo = CATEGORIES.find(c => c.value === item.category);
                  const hlBg = item.highlight ? item.highlight : undefined;
                  // Live "NOW" detection — highlight the item currently in progress
                  const itemStart = timeToMinutes(item.time);
                  const itemEnd = itemStart >= 0 ? itemStart + (item.duration || 0) : -1;
                  const isNow = isToday && itemStart >= 0 && currentTimeMinutes >= itemStart && currentTimeMinutes < itemEnd;
                  const isPast = isToday && itemEnd >= 0 && currentTimeMinutes >= itemEnd;
                  return (
                    <div
                      key={key}
                      className={`group transition-colors print:hover:bg-transparent ${
                        isNow ? 'bg-emerald-50 ring-2 ring-emerald-500 ring-inset relative z-10' :
                        isPast ? 'opacity-50 hover:opacity-100' :
                        'hover:bg-linen/50'
                      }`}
                      style={hlBg ? { backgroundColor: hlBg } : undefined}
                    >
                      {/* Main row */}
                      <div className="flex items-center gap-0 print:gap-3">
                        {/* Time column — wider + bolder for service-time scannability */}
                        <div className={`w-[110px] flex-shrink-0 px-4 py-3 border-r border-gold/15 print:border-0 relative ${isNow ? 'bg-emerald-100' : ''}`}>
                          {isNow && (
                            <span className="no-print absolute -top-1 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-bebas tracking-widest px-1.5 py-0.5 rounded-sm shadow-sm">NOW</span>
                          )}
                          <input
                            type="time"
                            value={item.time}
                            onChange={e => updateItemField(idx, "time", e.target.value)}
                            className={`font-dm text-base font-bold bg-transparent border-0 focus:outline-none w-full no-print ${isNow ? 'text-emerald-700' : 'text-ink'}`}
                          />
                          <div className="hidden print:block font-dm text-base font-bold">{formatTime12(item.time)}</div>
                          {item.duration > 0 && (
                            <div className={`text-[11px] font-dm no-print ${isNow ? 'text-emerald-700/70 font-semibold' : 'text-ink/30'}`}>{item.duration}m</div>
                          )}
                        </div>

                        {/* Title & description */}
                        <div className="flex-1 px-3 py-2 min-w-0">
                          <input
                            value={item.title}
                            onChange={e => updateItemField(idx, "title", e.target.value)}
                            placeholder="Item title..."
                            className={`w-full font-dm text-sm text-ink bg-transparent border-0 focus:outline-none no-print ${item.bold ? 'font-bold' : 'font-semibold'} ${item.italic ? 'italic' : ''}`}
                          />
                          <div className={`hidden print:block font-dm text-sm ${item.bold ? 'font-bold' : 'font-semibold'} ${item.italic ? 'italic' : ''}`}>{item.title || "—"}</div>
                          <input
                            value={item.description ?? ""}
                            onChange={e => updateItemField(idx, "description", e.target.value)}
                            placeholder="Notes / details..."
                            className="w-full font-dm text-xs text-ink/50 bg-transparent border-0 focus:outline-none placeholder:text-ink/25 mt-0.5 no-print"
                          />
                          {item.description && <div className="hidden print:block font-dm text-xs text-ink/50 mt-0.5 whitespace-normal">{item.description}</div>}
                        </div>

                        {/* Assigned to */}
                        {item.assignedTo && (
                          <div className="px-3 py-3 hidden md:block">
                            <span className="font-dm text-xs text-ink/50 bg-linen px-2 py-0.5">{item.assignedTo}</span>
                          </div>
                        )}


                        {/* Actions */}
                        <div className="flex items-center gap-0.5 px-2 py-3 no-print opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => moveItem(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-ink/30 hover:text-ink/60 disabled:opacity-20 transition-colors"
                            title="Move up"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveItem(idx, 'down')}
                            disabled={idx === items.length - 1}
                            className="p-1 text-ink/30 hover:text-ink/60 disabled:opacity-20 transition-colors"
                            title="Move down"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => duplicateItem(idx)}
                            className="p-1 text-ink/30 hover:text-ink/60 transition-colors"
                            title="Duplicate"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setExpandedItem(isExpanded ? null : key)}
                            className="p-1 text-ink/30 hover:text-ink/60 transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => removeItem(idx)}
                            className="p-1 text-ink/30 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <div className="border-t border-gold/15 px-5 py-4 space-y-4 bg-linen/30 no-print">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DURATION (MINS)</label>
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={item.duration > 0 ? String(item.duration) : ''}
                                placeholder="—"
                                onChange={e => {
                                  const raw = e.target.value.replace(/[^\d]/g, '');
                                  updateItemField(idx, "duration", raw === '' ? 0 : Number(raw));
                                }}
                                className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                              />
                            </div>
                            <div>
                              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">CATEGORY</label>
                              <select
                                value={item.category}
                                onChange={e => updateItemField(idx, "category", e.target.value)}
                                className="w-full border border-gold/20 rounded-sm px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                              >
                                {CATEGORIES.map(c => (
                                  <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">ASSIGNED TO</label>
                              <Input
                                value={item.assignedTo ?? ""}
                                onChange={e => updateItemField(idx, "assignedTo", e.target.value)}
                                placeholder="Staff member..."
                                className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                              />
                            </div>
                            <div>
                              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">NOTES</label>
                              <Input
                                value={item.description ?? ""}
                                onChange={e => updateItemField(idx, "description", e.target.value)}
                                placeholder="Additional notes..."
                                className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                              />
                            </div>
                          </div>
                          {/* Style controls */}
                          <div className="flex items-center gap-3">
                            <span className="font-bebas tracking-widest text-[10px] text-ink/40">STYLE</span>
                            <button
                              onClick={() => updateItemField(idx, "bold", !item.bold)}
                              className={`font-bold text-xs px-2 py-1 border rounded-sm transition-colors font-dm ${item.bold ? 'bg-ink text-white border-ink' : 'bg-white text-ink/50 border-gold/20 hover:border-ink/30'}`}
                              title="Bold"
                            >B</button>
                            <button
                              onClick={() => updateItemField(idx, "italic", !item.italic)}
                              className={`italic text-xs px-2 py-1 border rounded-sm transition-colors font-dm ${item.italic ? 'bg-ink text-white border-ink' : 'bg-white text-ink/50 border-gold/20 hover:border-ink/30'}`}
                              title="Italic"
                            >I</button>
                            <span className="font-bebas tracking-widest text-[10px] text-ink/40 ml-2">HIGHLIGHT</span>
                            {[
                              { label: 'None', value: '' },
                              { label: 'Yellow', value: '#fef9c3' },
                              { label: 'Blue', value: '#dbeafe' },
                              { label: 'Green', value: '#d1fae5' },
                              { label: 'Pink', value: '#fce7f3' },
                              { label: 'Purple', value: '#ede9fe' },
                              { label: 'Peach', value: '#ffedd5' },
                            ].map(({ label, value }) => (
                              <button
                                key={label}
                                onClick={() => updateItemField(idx, "highlight", value || undefined)}
                                title={label}
                                className={`w-5 h-5 border-2 rounded-full transition-all ${(item.highlight ?? '') === value ? 'border-ink scale-110' : 'border-gold/20 hover:border-ink/40'}`}
                                style={{ backgroundColor: value || '#ffffff' }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer / payment notes */}
            <div className="px-5 py-4 border-t border-gold/20">
              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">FOOTER NOTE</label>
              <p className="font-dm text-[10px] text-ink/35 mb-2">Shown at the bottom of the runsheet — use for payment info, terms, or any closing note.</p>
              <RichTextarea
                value={footerText}
                onChange={setFooterText}
                placeholder="e.g. Final payment of $2,400 due on the day. Thank you for choosing us!"
                minHeight="72px"
                className="no-print"
              />
              {footerText && <div className="hidden print:block font-dm text-sm text-ink/60" dangerouslySetInnerHTML={{ __html: footerText }} />}
            </div>
          </div>
        )}

        {/* ── F&B SHEET TAB ────────────────────────────────────────────────── */}
        <div data-print-section="food" className={activeMainTab !== 'fnb' ? 'hidden print:block' : ''}>
          <div className="dante-card border-t-0 print:shadow-none">
            {/* F&B unified header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20 no-print">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-gold" />
                <span className="font-bebas tracking-widest text-sm text-ink">FOOD</span>
                <span className="text-xs text-ink/40 font-dm">({fnbItems.length} items)</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Column visibility toggles */}
                <button
                  onClick={() => setShowQtyCol(v => !v)}
                  className={`font-bebas tracking-widest text-[10px] px-2 py-1 border transition-colors ${showQtyCol ? 'border-forest/40 text-forest bg-forest/5' : 'border-ink/20 text-ink/30 line-through'}`}
                  title="Toggle Quantity column"
                >QTY</button>
                <button
                  onClick={() => setShowDietaryCol(v => !v)}
                  className={`font-bebas tracking-widest text-[10px] px-2 py-1 border transition-colors ${showDietaryCol ? 'border-forest/40 text-forest bg-forest/5' : 'border-ink/20 text-ink/30 line-through'}`}
                  title="Toggle Dietary column"
                >DIETARY</button>
                <button
                  onClick={() => setShowTimeCol(v => !v)}
                  className={`font-bebas tracking-widest text-[10px] px-2 py-1 border transition-colors ${showTimeCol ? 'border-forest/40 text-forest bg-forest/5' : 'border-ink/20 text-ink/30 line-through'}`}
                  title="Toggle Time column"
                >SERVICE TIME</button>
                <button
                  onClick={() => setShowStaffCol(v => !v)}
                  className={`font-bebas tracking-widest text-[10px] px-2 py-1 border transition-colors ${showStaffCol ? 'border-forest/40 text-forest bg-forest/5' : 'border-ink/20 text-ink/30 line-through'}`}
                  title="Toggle Staff column"
                >STAFF</button>
                <button
                  onClick={() => setShowPrepPlatingCol(v => !v)}
                  className={`font-bebas tracking-widest text-[10px] px-2 py-1 border transition-colors ${showPrepPlatingCol ? 'border-forest/40 text-forest bg-forest/5' : 'border-ink/20 text-ink/30 line-through'}`}
                  title="Toggle Notes column"
                >NOTES</button>
                <div className="w-px h-4 bg-ink/10 mx-1" />
                <button
                  onClick={() => {
                    const name = prompt('New course name (e.g. "Petit Fours", "Coffee & Tea"):')?.trim();
                    if (!name) return;
                    setFnbItems(prev => [...prev, { section: 'foh', course: name, dishName: '', qty: 1, dietary: '', serviceTime: '', staffAssigned: '', prepNotes: '', platingNotes: '', drinkCategory: '' } as any]);
                  }}
                  className="font-bebas tracking-widest text-xs text-ink/50 hover:text-forest flex items-center gap-1 transition-colors border border-ink/20 px-3 py-1.5 hover:bg-forest/5 hover:border-forest/40"
                  title="Add a new course (e.g. Petit Fours, Coffee)"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD COURSE
                </button>
                <button
                  onClick={() => { setShowFnbPaste(true); setFnbPasteText(''); setFnbParsedItems([]); }}
                  className="font-bebas tracking-widest text-xs text-ink/50 hover:text-forest flex items-center gap-1 transition-colors border border-ink/20 px-3 py-1.5 hover:bg-forest/5 hover:border-forest/40"
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI PASTE
                </button>
                <Button
                  onClick={() => saveFnb()}
                  disabled={fnbSaving}
                  className="bg-gold hover:bg-gold/90 text-ink font-bebas tracking-widest text-xs rounded-sm px-4 py-2 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {fnbSaving ? 'SAVING...' : 'SAVE FOOD'}
                </Button>
              </div>
            </div>

            {/* Sub-tab nav: F&B Items vs Dietaries */}
            <div className="flex border-b border-gold/20 no-print bg-linen/40">
              <button
                onClick={() => setFnbSubTab('items')}
                className={`px-5 py-2.5 font-bebas tracking-widest text-xs transition-colors flex items-center gap-2 ${
                  fnbSubTab === 'items'
                    ? 'bg-white text-amber-700 border-b-2 border-gold -mb-px'
                    : 'text-ink/40 hover:text-ink/70 hover:bg-white/50'
                }`}
              >
                <UtensilsCrossed className="w-3.5 h-3.5" />
                MENU & SERVICE
                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${fnbSubTab === 'items' ? 'bg-gold/15 text-amber-700' : 'bg-ink/5 text-ink/40'}`}>{fnbItems.length}</span>
              </button>
              <button
                onClick={() => setFnbSubTab('dietaries')}
                className={`px-5 py-2.5 font-bebas tracking-widest text-xs transition-colors flex items-center gap-2 ${
                  fnbSubTab === 'dietaries'
                    ? 'bg-white text-amber-700 border-b-2 border-gold -mb-px'
                    : 'text-ink/40 hover:text-ink/70 hover:bg-white/50'
                }`}
              >
                <Leaf className="w-3.5 h-3.5" />
                DIETARY REQS
                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm ${fnbSubTab === 'dietaries' ? 'bg-gold/15 text-amber-700' : 'bg-ink/5 text-ink/40'}`}>{dietaries.length}</span>
              </button>
            </div>

            {/* Dietaries sub-tab content */}
            {fnbSubTab === 'dietaries' && (
              <div className="px-5 pt-4 pb-5 space-y-4 no-print">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="font-bebas tracking-widest text-sm text-forest">DIETARY REQUIREMENTS</span>
                    <p className="font-dm text-xs text-ink/40 mt-0.5">Tag each guest's dietary needs — surfaces in BEO and on the F&B print sheet.</p>
                  </div>
                  <button
                    onClick={openDietaryManager}
                    className="flex items-center gap-1 text-[10px] font-bebas tracking-widest text-forest/60 hover:text-forest transition-colors"
                  >
                    <Settings2 className="w-3 h-3" /> CUSTOMISE OPTIONS
                  </button>
                </div>
                <div>
                  <span className="font-bebas tracking-widest text-[10px] text-ink/40 mb-2 block">QUICK ADD</span>
                  <div className="flex flex-wrap gap-2">
                    {activeDietaryOptions.map(d => (
                      <button
                        key={d}
                        onClick={() => {
                          if (!dietaries.find(x => x.name === d)) {
                            setDietaries(prev => [...prev, { name: d, count: 1 }]);
                          }
                        }}
                        className={`text-xs font-bebas tracking-widest px-3 py-1.5 border transition-colors ${
                          dietaries.find(x => x.name === d)
                            ? "bg-forest text-cream border-forest"
                            : "border-forest/30 text-forest hover:bg-forest/5"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                {dietaries.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {dietaries.map((d, idx) => (
                      <div key={idx} className="border border-gold/20 bg-linen/40 p-3 group relative">
                        <button
                          onClick={() => removeDietary(idx)}
                          className="absolute top-2 right-2 text-ink/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex items-end gap-2 mb-2">
                          <input
                            type="number" min={1}
                            value={d.count}
                            onChange={e => updateDietary(idx, "count", Number(e.target.value))}
                            className="font-cormorant text-3xl font-semibold text-forest bg-transparent border-0 focus:outline-none w-16 leading-none"
                          />
                          <span className="font-bebas tracking-widest text-xs text-ink/40 mb-1">GUESTS</span>
                        </div>
                        <input
                          value={d.name}
                          onChange={e => updateDietary(idx, "name", e.target.value)}
                          className="font-dm text-sm font-semibold text-ink bg-transparent border-0 focus:outline-none w-full"
                        />
                        <input
                          value={d.notes ?? ""}
                          onChange={e => updateDietary(idx, "notes", e.target.value)}
                          placeholder="Notes..."
                          className="w-full font-dm text-xs text-ink/40 bg-transparent border-0 focus:outline-none mt-0.5 placeholder:text-ink/20"
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newDietary.name}
                    onChange={e => setNewDietary(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Add requirement..."
                    className="flex-1 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                    onKeyDown={e => e.key === "Enter" && addDietary()}
                  />
                  <Input
                    type="number" min={1}
                    value={newDietary.count}
                    onChange={e => setNewDietary(prev => ({ ...prev, count: e.target.value }))}
                    placeholder="Count"
                    className="w-20 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                  />
                  <Input
                    value={newDietary.notes}
                    onChange={e => setNewDietary(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Notes (optional)"
                    className="flex-1 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                  />
                  <Button
                    onClick={addDietary}
                    className="bg-forest hover:bg-forest/90 text-cream rounded-sm font-bebas tracking-widest text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" /> ADD
                  </Button>
                </div>
                {dietaries.length === 0 && (
                  <div className="text-center py-3 text-ink/30 font-dm text-sm">No dietary requirements recorded</div>
                )}
              </div>
            )}

            {/* Print F&B header */}
            <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30 bg-[var(--brand)]">
              <UtensilsCrossed className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">FOOD</span>
            </div>

            {/* Print: Dietary requirements summary at top of F&B sheet */}
            {dietaries.length > 0 && (
              <div className="hidden print:block px-5 py-3 border-b border-gold/30">
                <div className="font-bebas tracking-widest text-xs text-[var(--brand)] mb-2">DIETARY REQUIREMENTS</div>
                <div className="flex flex-wrap gap-2">
                  {dietaries.map((d, i) => (
                    <div key={i} className="border border-gold/30 px-3 py-1.5 text-sm font-dm">
                      <span className="font-semibold">{d.count}×</span> {d.name}
                      {d.notes && <span className="text-ink/50 ml-1">— {d.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items sub-tab wrapper */}
            <div className={fnbSubTab === 'items' ? '' : 'hidden print:block'}>

            {/* ── PROPOSAL F&B SUMMARY ─────────────────────────────────── */}
            {linkedProposalId && (proposalDrinks || (proposalQuote?.items && proposalQuote.items.length > 0) || (linkedProposal?.lineItems)) && (
              <div className="mx-5 my-4 border border-gold/40 bg-[#fffbf0] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-gold" />
                    <span className="font-bebas tracking-widest text-xs text-[#8b6914]">FOOD & BEVERAGE FROM PROPOSAL</span>
                  </div>
                  <button
                    onClick={() => {
                      const qItems: any[] = (proposalQuote as any)?.items ?? [];
                      const drinks: any = proposalDrinks;
                      const foodRows: FnbItem[] = qItems.map((qi: any, i: number) => ({
                        section: 'foh' as const,
                        course: 'Menu',
                        dishName: qi.name ?? qi.description ?? 'Menu Item',
                        description: qi.description ?? '',
                        qty: Number(qi.qty) || 1,
                        dietary: '',
                        serviceTime: '',
                        staffAssigned: '',
                        sortOrder: fnbItems.length + i,
                        // Pull pricing through from the proposal quote so running totals stay accurate.
                        unitPrice: qi.unitPrice != null ? Number(qi.unitPrice) : (qi.priceCents != null ? Number(qi.priceCents) / 100 : null),
                        _tempId: `pull-qi-${Date.now()}-${i}`,
                      }));
                      const drinkRows: FnbItem[] = [];
                      if (drinks?.selectedDrinks) {
                        try {
                          const arr: string[] = typeof drinks.selectedDrinks === 'string' ? JSON.parse(drinks.selectedDrinks) : drinks.selectedDrinks;
                          arr.forEach((name: string, i: number) => {
                            drinkRows.push({ section: 'foh', course: 'Drinks', dishName: name, qty: 1, dietary: '', serviceTime: '', staffAssigned: '', sortOrder: fnbItems.length + foodRows.length + i, _tempId: `pull-dr-${Date.now()}-${i}` });
                          });
                        } catch {}
                      }
                      if (drinks?.customDrinks) {
                        try {
                          const arr: any[] = typeof drinks.customDrinks === 'string' ? JSON.parse(drinks.customDrinks) : drinks.customDrinks;
                          arr.forEach((d: any, i: number) => {
                            drinkRows.push({ section: 'foh', course: 'Drinks', dishName: d.name, description: d.description ?? '', qty: 1, dietary: '', serviceTime: '', staffAssigned: '', sortOrder: fnbItems.length + foodRows.length + drinkRows.length + i, _tempId: `pull-cd-${Date.now()}-${i}` });
                          });
                        } catch {}
                      }
                      const liRows: FnbItem[] = [];
                      if ((linkedProposal as any)?.lineItems) {
                        try {
                          const li = JSON.parse((linkedProposal as any).lineItems as string ?? '[]') as any[];
                          li.filter((item: any) => item.description).forEach((item: any, i: number) => {
                            liRows.push({ section: 'foh', course: 'Menu', dishName: item.description, qty: Number(item.qty) || 1, dietary: '', serviceTime: '', staffAssigned: '', sortOrder: fnbItems.length + foodRows.length + drinkRows.length + i, unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null, _tempId: `pull-li-${Date.now()}-${i}` });
                          });
                        } catch {}
                      }
                      const all = [...foodRows, ...drinkRows, ...liRows];
                      if (all.length === 0) { toast.error('No F&B items found in proposal'); return; }
                      setFnbItems(prev => [...prev, ...all]);
                      toast.success(`${all.length} item${all.length !== 1 ? 's' : ''} pulled from proposal`);
                    }}
                    className="font-bebas tracking-widest text-[10px] text-[#8b6914] hover:text-forest flex items-center gap-1 border border-gold/40 px-2 py-1 hover:bg-forest/5 hover:border-forest/30 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> PULL INTO F&B SHEET
                  </button>
                </div>

                {/* Food items from line items */}
                {linkedProposal?.lineItems && (() => {
                  try {
                    const li = JSON.parse(linkedProposal.lineItems as string ?? '[]') as any[];
                    const foodItems = li.filter((item: any) => item.description);
                    if (!foodItems.length) return null;
                    return (
                      <div>
                        <div className="font-bebas tracking-widest text-[10px] text-ink/40 mb-1.5">FOOD & PRICING</div>
                        <div className="space-y-1">
                          {foodItems.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between items-start text-xs font-dm">
                              <span className="text-ink/80 flex-1">
                                {item.description}
                                {item.qty > 1 ? <span className="text-ink/40 ml-1">× {item.qty}</span> : null}
                              </span>
                              <span className="font-semibold text-ink ml-3">${Number(item.total ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}

                {/* Quote items (hire, styling, etc.) */}
                {proposalQuote?.items && proposalQuote.items.length > 0 && (
                  <div>
                    <div className="font-bebas tracking-widest text-[10px] text-ink/40 mb-1.5">ADDITIONAL ITEMS</div>
                    <div className="space-y-1">
                      {proposalQuote.items.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-start text-xs font-dm">
                          <div className="flex-1">
                            <span className="text-ink/80">{item.name}</span>
                            {item.description && <span className="text-ink/40 ml-1">— {item.description}</span>}
                            {Number(item.qty) > 1 && <span className="text-ink/40 ml-1">× {item.qty}</span>}
                          </div>
                          <span className="font-semibold text-ink ml-3">${(Number(item.qty) * Number(item.unitPrice)).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bar / Beverages */}
                {proposalDrinks && (
                  <div>
                    <div className="font-bebas tracking-widest text-[10px] text-ink/40 mb-1.5">BAR & BEVERAGES</div>
                    <div className="text-xs font-dm text-ink/80 capitalize mb-1">
                      <span className="font-semibold">{proposalDrinks.barOption?.replace(/_/g, ' ')}</span>
                      {proposalDrinks.tabAmount ? ` — Bar tab: $${Number(proposalDrinks.tabAmount).toLocaleString('en-NZ')}` : ''}
                    </div>
                    {(proposalDrinks.selectedDrinks as string[])?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {(proposalDrinks.selectedDrinks as string[]).map(k => (
                          <span key={k} className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 font-dm border border-blue-200">
                            {k.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                    {(proposalDrinks.customDrinks as any[])?.length > 0 && (
                      <div className="space-y-0.5">
                        {(proposalDrinks.customDrinks as any[]).map((d: any, i: number) => (
                          <div key={i} className="text-xs font-dm text-ink/70 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-gold inline-block flex-shrink-0" />
                            {d.name}{d.description ? ` — ${d.description}` : ''}{d.price ? ` ($${d.price})` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Guest count + dietary summary */}
                {(linkedProposal?.guestCount || linkedProposal?.spaceName) && (
                  <div className="flex gap-4 pt-1 border-t border-gold/20 text-xs font-dm text-ink/60">
                    {linkedProposal.guestCount && <span><span className="font-semibold text-ink/80">{linkedProposal.guestCount}</span> guests</span>}
                    {linkedProposal.spaceName && <span>Space: <span className="font-semibold text-ink/80">{linkedProposal.spaceName}</span></span>}
                  </div>
                )}
              </div>
            )}

            {/* No proposal linked notice */}
            {!linkedProposalId && (
              <div className="mx-5 my-3 p-3 bg-linen border border-gold/20 text-xs font-dm text-ink/50 flex items-center gap-2">
                <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
                Use the <strong className="text-forest/70">LINKED PROPOSAL</strong> section below to connect a proposal and auto-import F&amp;B selections.
              </div>
            )}

            {/* Add new item form */}
            <div className="px-5 py-4 border-b border-gold/20 bg-linen/30 no-print">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bebas tracking-widest text-[10px] text-ink/40">ADD ITEM</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setFnbCustomMode(true); setFnbCustomName(''); }}
                    className={`font-bebas tracking-widest text-[10px] flex items-center gap-1 border px-2.5 py-1 transition-colors ${
                      fnbCustomMode ? 'bg-gold/20 border-gold text-ink' : 'border-gold/20 text-ink/50 hover:bg-linen'
                    }`}
                  >
                    <Plus className="w-3 h-3" /> CUSTOM ITEM
                  </button>
                  <button
                    onClick={() => { setShowCatalogSelector(true); setCatalogSelectorCategoryId(null); setCatalogSelectedItems(new Map()); setFnbCustomMode(false); }}
                    className="font-bebas tracking-widest text-[10px] text-forest hover:text-forest/80 flex items-center gap-1 border border-forest/30 px-2.5 py-1 hover:bg-forest/5 transition-colors"
                  >
                    <UtensilsCrossed className="w-3 h-3" /> ADD FROM CATALOGUE
                  </button>
                  <button
                    onClick={addNewCourse}
                    className="font-bebas tracking-widest text-[10px] text-ink/60 hover:text-forest flex items-center gap-1 border border-gold/20 px-2.5 py-1 hover:bg-linen transition-colors"
                    title="Create a new course header for this runsheet"
                  >
                    <Plus className="w-3 h-3" /> NEW COURSE
                  </button>
                </div>
              </div>

              {fnbCustomMode ? (
                /* Custom item entry */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">COURSE</label>
                      <select
                        value={fnbCustomCourse}
                        onChange={e => { setFnbCustomCourse(e.target.value); setFnbCustomDrinkCat(''); }}
                        className="w-full border border-gold/20 rounded-sm px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                      >
                        {courses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {fnbCustomCourse === 'Drinks' && (
                      <div>
                        <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DRINK CATEGORY</label>
                        <select
                          value={fnbCustomDrinkCat}
                          onChange={e => setFnbCustomDrinkCat(e.target.value)}
                          className="w-full border border-gold/20 rounded-sm px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                        >
                          <option value="">— select —</option>
                          {DRINK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DISH NAME *</label>
                      <Input
                        value={fnbCustomName}
                        onChange={e => setFnbCustomName(e.target.value)}
                        placeholder="e.g. Beef Wellington"
                        className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                        onKeyDown={e => e.key === 'Enter' && addFnbItem()}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">SERVICE TIME</label>
                      <Input
                        type="time"
                        value={newFnbItem.serviceTime ?? ''}
                        onChange={e => setNewFnbItem(p => ({ ...p, serviceTime: e.target.value }))}
                        className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                      />
                    </div>
                    <div>
                      <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">QTY / COVERS</label>
                      <Input
                        type="number" min={1}
                        value={newFnbItem.qty ?? 1}
                        onChange={e => setNewFnbItem(p => ({ ...p, qty: Number(e.target.value) }))}
                        className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DIETARY FLAGS</label>
                      <Input
                        value={newFnbItem.dietary ?? ''}
                        onChange={e => setNewFnbItem(p => ({ ...p, dietary: e.target.value }))}
                        placeholder="GF, VG, DF, NF..."
                        className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                      />
                    </div>
                    <Button
                      onClick={() => setFnbCustomMode(false)}
                      variant="outline"
                      className="rounded-sm border-gold/20 font-bebas tracking-widest text-xs h-9 px-3"
                    >
                      CANCEL
                    </Button>
                    <Button
                      onClick={addFnbItem}
                      className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-sm px-4 py-2 flex items-center gap-1.5 h-9"
                    >
                      <Plus className="w-3.5 h-3.5" /> ADD
                    </Button>
                  </div>
                </div>
              ) : (
                /* Shared time/qty fields always shown for post-catalogue add */
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">SERVICE TIME</label>
                    <Input
                      type="time"
                      value={newFnbItem.serviceTime ?? ''}
                      onChange={e => setNewFnbItem(p => ({ ...p, serviceTime: e.target.value }))}
                      className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                    />
                  </div>
                  {newFnbItem.course !== 'Drinks' && (
                  <div>
                    <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">QTY / COVERS</label>
                    <Input
                      type="number" min={1}
                      value={newFnbItem.qty ?? 1}
                      onChange={e => setNewFnbItem(p => ({ ...p, qty: Number(e.target.value) }))}
                      className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                    />
                  </div>
                  )}
                  <div className="flex items-end">
                    <p className="font-dm text-xs text-ink/40 pb-2">Use ADD FROM CATALOGUE to add dishes, or CUSTOM ITEM for one-off items.</p>
                  </div>
                </div>
              )}
            </div>

            {/* F&B items table */}
            {fnbItems.length === 0 ? (
              <div className="text-center py-16 text-ink/30 font-dm text-sm">
                <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-20" />
                No items yet. Add from catalogue or use Custom Item above.
              </div>
            ) : (
              <div>
                {/* Table header */}
                <div className="grid gap-2 px-5 py-2.5 text-xs font-bebas tracking-widest text-white bg-gold" style={{ gridTemplateColumns: fnbGridCols }}>
                  <div>COURSE</div>
                  <div>DISH</div>
                  {showQtyCol && <div>QTY</div>}
                  {showDietaryCol && <div>DIETARY</div>}
                  {showTimeCol && <div>SERVICE TIME</div>}
                  {showStaffCol && <div>STAFF</div>}
                  {showPrepPlatingCol && <div>NOTES</div>}
                  <div className="no-print"></div>
                </div>
                {/* Group by course — derived from actual items + any extra empty courses
                    the user added via "+ NEW COURSE" so empty headers still render */}
                {/* Drinks live in the dedicated BAR & DRINKS tab now — hide the
                    legacy "Drinks" course from the F&B sheet so the two
                    surfaces don't double up. Existing data is preserved on
                    disk but no longer rendered/edited here. */}
                {[...new Set([...fnbItems.map(i => i.course ?? 'Other'), ...extraCourses])]
                  .filter(course => course !== 'Drinks')
                  .sort((a, b) => {
                    const ai = courses.indexOf(a); const bi = courses.indexOf(b);
                    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                  })
                  .map(course => {
                    const isDrinks = course === 'Drinks';
                    const courseItems = fnbItems
                      .map((item, originalIdx) => ({ item, originalIdx }))
                      .filter(({ item }) => (item.course ?? 'Other') === course);
                    const drinkSubGroups = isDrinks
                      ? [...new Set(courseItems.map(({ item }) => item.drinkCategory || 'Uncategorised'))]
                      : null;
                    const renderRows = (items: typeof courseItems) => items.map(({ item, originalIdx }) => {
                      const isExpanded = expandedFnbIdx === originalIdx;
                      return (
                        <div key={item._tempId ?? originalIdx}>
                          <div
                            className={`grid gap-2 px-5 py-2.5 items-center border-b border-gold/20 text-sm font-dm group transition-colors ${isDrinks ? 'border-l-4 border-l-blue-300 hover:bg-blue-50/50' : 'border-l-4 border-l-amber-300 hover:bg-amber-50/40'} ${isExpanded ? (isDrinks ? 'bg-blue-50/50' : 'bg-amber-50/40') : ''}`}
                            style={{ gridTemplateColumns: fnbGridCols }}
                          >
                            <div className={`text-xs font-bebas tracking-widest ${isDrinks ? 'text-blue-500' : 'text-amber-600'}`}>{isDrinks ? (item.drinkCategory || 'Drink') : item.course}</div>
                            <div>
                              <input value={item.dishName} onChange={e => updateFnbItem(originalIdx, 'dishName', e.target.value)} className="w-full font-dm text-sm text-ink bg-transparent border-0 focus:outline-none font-semibold" />
                              {item.description && <div className="text-xs text-ink/40">{item.description}</div>}
                            </div>
                            {showQtyCol && (
                              <div className={item.course === 'Drinks' ? 'print:hidden' : ''}>
                                {item.course !== 'Drinks' && item.qty > 1 && (
                                  <input type="number" min={1} value={item.qty || ''} placeholder="1" onChange={e => updateFnbItem(originalIdx, 'qty', e.target.value === '' ? 0 : Number(e.target.value))} className="w-12 font-dm text-sm text-ink bg-transparent border-0 focus:outline-none text-center" />
                                )}
                                {item.course !== 'Drinks' && item.qty <= 1 && (
                                  <input type="number" min={1} value={item.qty || ''} placeholder="1" onChange={e => updateFnbItem(originalIdx, 'qty', e.target.value === '' ? 0 : Number(e.target.value))} className="w-12 font-dm text-sm text-ink/20 bg-transparent border-0 focus:outline-none text-center opacity-0 group-hover:opacity-100 transition-opacity" title="Qty (default 1)" />
                                )}
                              </div>
                            )}
                            {showDietaryCol && (
                              <div>{item.dietary && <span className="bg-amber-100 text-amber-800 border border-amber-400 text-xs px-1.5 py-0.5 font-bebas tracking-widest font-bold rounded-sm">{item.dietary}</span>}</div>
                            )}
                            {showTimeCol && (
                              <div>
                                <input type="time" value={item.serviceTime ?? ''} onChange={e => updateFnbItem(originalIdx, 'serviceTime', e.target.value)} className="font-dm text-xs text-ink/70 bg-transparent border-0 focus:outline-none w-full no-print" />
                                {item.serviceTime && <div className="hidden print:block text-xs text-ink/50 font-dm">{formatTime12(item.serviceTime)}</div>}
                              </div>
                            )}
                            {showStaffCol && (
                              <div><input value={item.staffAssigned ?? ''} onChange={e => updateFnbItem(originalIdx, 'staffAssigned', e.target.value)} placeholder="Staff..." className="w-full font-dm text-xs text-ink/70 bg-transparent border-0 focus:outline-none" /></div>
                            )}
                            {showPrepPlatingCol && (
                              <div className="space-y-0.5">
                                <input value={item.prepNotes ?? ''} onChange={e => updateFnbItem(originalIdx, 'prepNotes', e.target.value)} placeholder="Prep..." className="w-full font-dm text-xs text-ink/70 bg-transparent border-0 focus:outline-none" />
                                <input value={item.platingNotes ?? ''} onChange={e => updateFnbItem(originalIdx, 'platingNotes', e.target.value)} placeholder="Plating..." className="w-full font-dm text-xs text-ink/50 bg-transparent border-0 focus:outline-none" />
                              </div>
                            )}
                            <div className="no-print opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              <button onClick={() => setExpandedFnbIdx(isExpanded ? null : originalIdx)} className="text-ink/30 hover:text-forest transition-colors" title="Expand details">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button onClick={() => removeFnbItem(originalIdx)} className="text-ink/30 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className={`px-5 py-4 border-b border-gold/20 grid grid-cols-2 md:grid-cols-4 gap-3 no-print ${isDrinks ? 'bg-blue-50/40' : 'bg-amber-50/30'}`}>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">COURSE</label>
                                <select value={item.course ?? 'Other'} onChange={e => updateFnbItem(originalIdx, 'course', e.target.value)} className="w-full border border-gold/20 rounded-sm px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9">
                                  {courses.map(c => <option key={c} value={c}>{c}</option>)}
                                  {!courses.includes(item.course ?? 'Other') && <option value={item.course ?? 'Other'}>{item.course ?? 'Other'}</option>}
                                </select>
                              </div>
                              {isDrinks && (
                                <div>
                                  <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DRINK CATEGORY</label>
                                  <select value={item.drinkCategory || ''} onChange={e => updateFnbItem(originalIdx, 'drinkCategory', e.target.value)} className="w-full border border-gold/20 rounded-sm px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9">
                                    <option value="">— No category —</option>
                                    {DRINK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                              )}
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">SERVICE TIME</label>
                                <input type="time" value={item.serviceTime ?? ''} onChange={e => updateFnbItem(originalIdx, 'serviceTime', e.target.value)} className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">QTY / COVERS</label>
                                <input type="number" min={1} value={item.qty || ''} placeholder="1" onChange={e => updateFnbItem(originalIdx, 'qty', e.target.value === '' ? 0 : Number(e.target.value))} className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DIETARY / ALLERGEN</label>
                                <input value={item.dietary ?? ''} onChange={e => updateFnbItem(originalIdx, 'dietary', e.target.value)} placeholder="e.g. GF, VG, Nut-free..." className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">STAFF ASSIGNED</label>
                                <input value={item.staffAssigned ?? ''} onChange={e => updateFnbItem(originalIdx, 'staffAssigned', e.target.value)} placeholder="Staff member..." className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">PREP NOTES</label>
                                <input value={item.prepNotes ?? ''} onChange={e => updateFnbItem(originalIdx, 'prepNotes', e.target.value)} placeholder="Preparation notes..." className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">PLATING NOTES</label>
                                <input value={item.platingNotes ?? ''} onChange={e => updateFnbItem(originalIdx, 'platingNotes', e.target.value)} placeholder="Plating / presentation..." className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">UNIT PRICE (NZD)</label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={item.unitPrice == null || item.unitPrice === '' ? '' : String(item.unitPrice)}
                                  onChange={e => updateFnbItem(originalIdx, 'unitPrice', e.target.value === '' ? null : Number(e.target.value))}
                                  placeholder="e.g. 70 per head"
                                  className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                                  title="Per head for food, per drink for drinks — feeds the running total"
                                />
                                {item.unitPrice != null && item.unitPrice !== '' && Number(item.qty) > 0 && (
                                  <div className="text-[10px] text-ink/40 font-dm mt-0.5">
                                    {item.qty} × ${Number(item.unitPrice).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = <span className="text-forest font-semibold">${(Number(item.qty) * Number(item.unitPrice)).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DESCRIPTION</label>
                                <input value={item.description ?? ''} onChange={e => updateFnbItem(originalIdx, 'description', e.target.value)} placeholder="Dish description..." className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                              <div>
                                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">CHANGED FROM (OPTIONAL)</label>
                                <input value={item.previousDishName ?? ''} onChange={e => updateFnbItem(originalIdx, 'previousDishName', e.target.value)} placeholder="Previous dish name..." className="w-full border border-gold/20 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    });
                    return (
                      <div key={course}>
                        {/* Editable course header with rename + delete */}
                        <div className={`px-5 py-1.5 flex items-center gap-2 border-b ${isDrinks ? 'bg-blue-50 border-blue-200/60' : 'bg-amber-50 border-amber-200/60'}`}>
                          <Pencil className={`w-3 h-3 flex-shrink-0 no-print ${isDrinks ? 'text-blue-400' : 'text-amber-400'}`} />
                          <input
                            value={course}
                            onChange={e => renameCourse(course, e.target.value)}
                            className={`bg-transparent border-0 border-b border-dashed focus:outline-none focus:border-solid font-bebas tracking-widest text-xs w-full min-w-0 ${isDrinks ? 'text-blue-700 border-blue-200 focus:border-blue-500' : 'text-amber-700 border-amber-200 focus:border-amber-500'} print:border-none`}
                            title="Click to rename this course"
                            placeholder="Course name..."
                          />
                          <span className="text-[10px] text-ink/30 flex-shrink-0 font-dm italic no-print">click to rename</span>
                          <button onClick={() => deleteCourse(course)} className="no-print flex-shrink-0 text-ink/30 hover:text-red-500 transition-colors p-0.5" title={`Delete all ${course} items`}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        {/* Drinks: render by sub-group; food: render directly */}
                        {isDrinks && drinkSubGroups && drinkSubGroups.length > 1 ? (
                          drinkSubGroups.map(subGroup => {
                            const subItems = courseItems.filter(({ item }) => (item.drinkCategory || 'Uncategorised') === subGroup);
                            return (
                              <div key={subGroup}>
                                <div className="px-5 py-0.5 bg-blue-50/60 border-b border-blue-100/80 flex items-center gap-2">
                                  <span className="font-bebas text-[10px] tracking-widest text-blue-500/80">{subGroup}</span>
                                </div>
                                {renderRows(subItems)}
                              </div>
                            );
                          })
                        ) : (
                          renderRows(courseItems)
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Dietary summary — amber-themed so chefs can scan instantly */}
            {dietaries.length > 0 && (
              <div data-print-section="dietary" className="px-5 py-4 border-t-2 border-amber-500 bg-amber-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-amber-600 text-base">⚠</span>
                  <span className="font-bebas tracking-widest text-xs text-amber-800 font-bold">DIETARY REQUIREMENTS</span>
                  <span className="text-amber-700 text-xs font-dm bg-amber-100 px-2 py-0.5 rounded-sm">{dietaries.reduce((s, d) => s + d.count, 0)} guests</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {dietaries.map((d, i) => (
                    <div key={i} className="bg-white border border-amber-400 border-l-4 border-l-amber-600 px-3 py-1.5 text-sm font-dm shadow-sm">
                      <span className="font-bold text-amber-900">{d.count}×</span>
                      <span className="ml-1.5 font-semibold text-amber-900">{d.name}</span>
                      {d.notes && <span className="text-amber-700 italic ml-1.5">— {d.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* ── RUNNING TOTALS (bottom of runsheet) ────────────────────────── */}
            {(() => {
              // Pull F&B totals out of the selected dishes/drinks themselves
              // (qty × unit price) so the running total reflects what the team
              // actually chose, not just whatever cost line items were added
              // separately. Food and drinks are split so the bar runs its own
              // sub-total.
              const fnbFoodTotal = fnbItems
                .filter(it => (it.course ?? '') !== 'Drinks')
                .reduce((sum, it) => sum + (Number(it.qty || 0) * Number(it.unitPrice ?? 0)), 0);
              const fnbDrinkTotal = fnbItems
                .filter(it => (it.course ?? '') === 'Drinks')
                .reduce((sum, it) => sum + (Number(it.qty || 0) * Number(it.unitPrice ?? 0)), 0);
              // Legacy cost-item food/bev (entered on the Costs tab) — kept so
              // existing runsheets aren't visibly downgraded after the switch.
              const costFood = costItems
                .filter(ci => (ci.category || '').toLowerCase().includes('food') || (ci.category || '').toLowerCase().includes('beverage'))
                .reduce((s, ci) => s + Number(ci.qty) * Number(ci.unitPrice), 0);
              // Beverages are billed on consumption / bar tab, so the drinks
              // selection is deliberately NOT totalled or rolled into the total.
              const grandTotal = fnbFoodTotal + costFood + (rsTabAmount ? Number(rsTabAmount) : 0);
              const paymentInstructions = (venueSettings as any)?.paymentInstructions as string | null;
              const showBlock = booking?.minimumSpend || rsTabAmount || costItems.length > 0 || booking?.depositNzd
                || fnbFoodTotal > 0 || fnbDrinkTotal > 0 || (paymentInstructions && paymentInstructions.trim().length > 0);
              if (!showBlock) return null;
              const fmt = (n: number) => `$${n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              return (
                <div data-print-section="totals" className="px-5 py-4 border-t-2 border-forest/20 bg-linen/30 print:avoid-break">
                  <div className="font-bebas tracking-widest text-xs text-forest mb-3">RUNNING TOTALS</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {booking?.minimumSpend != null && Number(booking.minimumSpend) > 0 && (
                      <div className="bg-white border border-gold/20 px-3 py-2">
                        <div className="font-bebas tracking-widest text-[10px] text-ink/40">MINIMUM SPEND</div>
                        <div className="font-cormorant text-lg font-semibold text-ink">{fmt(Number(booking.minimumSpend))}</div>
                      </div>
                    )}
                    {fnbFoodTotal > 0 && (
                      <div className="bg-white border border-gold/20 px-3 py-2">
                        <div className="font-bebas tracking-widest text-[10px] text-ink/40">FOOD ({fnbItems.filter(it => (it.course ?? '') !== 'Drinks' && Number(it.unitPrice ?? 0) > 0).length} items)</div>
                        <div className="font-cormorant text-lg font-semibold text-ink">{fmt(fnbFoodTotal)}</div>
                      </div>
                    )}
                    {/* Drinks subtotal intentionally removed — beverages are not
                        totalled here (billed on consumption / bar tab). */}
                    {costFood > 0 && (
                      <div className="bg-white border border-gold/20 px-3 py-2">
                        <div className="font-bebas tracking-widest text-[10px] text-ink/40">EXTRA F&amp;B (COSTS TAB)</div>
                        <div className="font-cormorant text-lg font-semibold text-ink">{fmt(costFood)}</div>
                      </div>
                    )}
                    {rsTabAmount && Number(rsTabAmount) > 0 && (
                      <div className="bg-white border border-gold/20 px-3 py-2">
                        <div className="font-bebas tracking-widest text-[10px] text-ink/40">BAR TAB</div>
                        <div className="font-cormorant text-lg font-semibold text-ink">{fmt(Number(rsTabAmount))}</div>
                      </div>
                    )}
                    {grandTotal > 0 && (
                      <div className="bg-forest text-cream border border-forest px-3 py-2">
                        <div className="font-bebas tracking-widest text-[10px] text-cream/70">RUNNING TOTAL</div>
                        <div className="font-cormorant text-lg font-semibold">{fmt(grandTotal)}</div>
                      </div>
                    )}
                    {booking?.depositNzd != null && Number(booking.depositNzd) > 0 && (
                      <div className={`border px-3 py-2 ${booking?.depositPaid ? 'bg-forest/5 border-forest/40' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="font-bebas tracking-widest text-[10px] text-ink/40">DEPOSIT {booking?.depositPaid ? '— PAID' : '— UNPAID'}</div>
                        <div className="font-cormorant text-lg font-semibold text-ink">{fmt(Number(booking.depositNzd))}</div>
                      </div>
                    )}
                  </div>
                  {paymentInstructions && paymentInstructions.trim().length > 0 && (
                    <div data-print-section="payment" className="mt-3 bg-white border border-gold/30 px-4 py-3">
                      <div className="font-bebas tracking-widest text-[10px] text-ink/40 mb-1">PAYMENT INSTRUCTIONS</div>
                      <div className="font-dm text-sm text-ink/80 whitespace-pre-wrap">{paymentInstructions}</div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* ── EVENT SPEND / BUDGET ───────────────────────────────────────── */}
            {effectiveBookingId && (
              <div className="px-5 py-5 border-t border-gold/20 no-print">
                <EventSpendSection bookingId={effectiveBookingId} />
              </div>
            )}

            </div>{/* /Items sub-tab wrapper */}
          </div>
        </div>

        {/* ── DRINKS TAB ───────────────────────────────────────────────────── */}
        {activeMainTab === 'drinks' && (
          <div data-print-section="drinks" className="dante-card border-t-0">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
              <div className="flex items-center gap-2">
                <Wine className="w-4 h-4 text-gold" />
                <span className="font-bebas tracking-widest text-sm text-ink">DRINKS SELECTION</span>
                {rsSelectedDrinks.length + rsCustomDrinks.length > 0 && (
                  <span className="bg-forest text-white font-bebas text-xs px-2 py-0.5 tracking-widest">
                    {rsSelectedDrinks.length + rsCustomDrinks.length} SELECTED
                  </span>
                )}
              </div>
              <button
                onClick={async () => {
                  if (!sheetId) { toast.error("Save the runsheet first"); return; }
                  setDrinksSaving(true);
                  try {
                    await silentUpdateMutation.mutateAsync({
                      id: sheetId,
                      drinksData: { barOption: rsBarOption, tabAmount: rsTabAmount ? parseFloat(rsTabAmount) : undefined, selectedDrinks: rsSelectedDrinks, customDrinks: rsCustomDrinks, barNotes: rsBarNotes || undefined, drinkTypes: rsDrinkTypes },
                    } as any);
                    toast.success("Drinks selection saved!");
                  } catch { toast.error("Failed to save drinks"); }
                  setDrinksSaving(false);
                }}
                disabled={drinksSaving}
                className="bg-gold hover:bg-gold/90 text-ink font-bebas tracking-widest text-xs px-4 py-2 flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {drinksSaving ? 'SAVING...' : 'SAVE DRINKS'}
              </button>
            </div>

            <div className="px-5 py-5 space-y-6">
              {/* Bar Arrangement */}
              <div>
                <div className="font-bebas tracking-widest text-xs text-ink/40 mb-3">BAR ARRANGEMENT</div>
                <div className="grid grid-cols-2 gap-2">
                  {BAR_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setRsBarOption(opt.key)}
                      className={`p-3 border-2 text-left transition-colors ${
                        rsBarOption === opt.key ? 'border-forest bg-forest/5' : 'border-gold/20 hover:border-forest/40'
                      }`}
                    >
                      <div className="font-bebas text-xs tracking-widest text-ink">{opt.label}</div>
                      <div className="font-dm text-xs text-ink/50 mt-0.5">{opt.description}</div>
                    </button>
                  ))}
                </div>
                {(rsBarOption === 'bar_tab' || rsBarOption === 'bar_tab_then_cash') && (
                  <div className="mt-3 flex items-center gap-3">
                    <label className="font-bebas text-xs tracking-widest text-ink/40">TAB AMOUNT (NZD)</label>
                    <Input
                      type="number"
                      value={rsTabAmount}
                      onChange={e => setRsTabAmount(e.target.value)}
                      placeholder="e.g. 1500"
                      className="rounded-sm border-2 border-gold/20 focus-visible:border-forest focus-visible:ring-0 text-sm w-36"
                    />
                  </div>
                )}
              </div>

              {/* Pick from saved drinks menu */}
              <div className="border-t border-gold/20 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bebas tracking-widest text-xs text-ink/40">DRINKS SELECTION (FROM MENU)</div>
                  <button
                    type="button"
                    onClick={() => { setCatalogSelectorType('drink'); setCatalogSelectorCategoryId(null); setCatalogSelectedItems(new Map()); setShowCatalogSelector(true); }}
                    className="font-bebas tracking-widest text-[10px] bg-forest text-cream px-3 py-1.5 hover:bg-forest/90"
                  >
                    + PICK DRINKS
                  </button>
                </div>
                {rsSelectedDrinks.length === 0 && rsCustomDrinks.length === 0 ? (
                  <div className="border border-dashed border-gold/30 px-3 py-4 text-center font-dm text-xs text-ink/50">
                    No drinks selected yet. Click <span className="font-bebas tracking-widest text-forest">+ PICK DRINKS</span> to choose from your saved drinks menu.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {rsSelectedDrinks.map(k => (
                      <span key={k} className="inline-flex items-center gap-1.5 bg-cream text-ink text-xs px-2 py-1 font-dm border border-gold/30">
                        {k}
                        <select
                          value={rsDrinkTypes[k] ?? ''}
                          onChange={e => setRsDrinkTypes(prev => ({ ...prev, [k]: e.target.value }))}
                          className="border border-gold/20 rounded-sm px-1 py-0.5 text-[10px] font-dm focus:outline-none focus:border-forest bg-white"
                          title="Beverage type"
                        >
                          <option value="">—</option>
                          <option value="spark">Sparkling</option>
                          <option value="white">White</option>
                          <option value="red">Red</option>
                          <option value="beer">Beer</option>
                          <option value="other">Other</option>
                        </select>
                        <button type="button" onClick={() => setRsSelectedDrinks(prev => prev.filter(x => x !== k))} className="text-ink/40 hover:text-red-600">×</button>
                      </span>
                    ))}
                    {rsCustomDrinks.map((d, i) => (
                      <span key={`c${i}`} className="inline-flex items-center gap-1.5 bg-cream text-ink text-xs px-2 py-1 font-dm border border-gold/30">
                        {d.name}
                        <select
                          value={rsDrinkTypes[d.name] ?? ''}
                          onChange={e => setRsDrinkTypes(prev => ({ ...prev, [d.name]: e.target.value }))}
                          className="border border-gold/20 rounded-sm px-1 py-0.5 text-[10px] font-dm focus:outline-none focus:border-forest bg-white"
                          title="Beverage type"
                        >
                          <option value="">—</option>
                          <option value="spark">Sparkling</option>
                          <option value="white">White</option>
                          <option value="red">Red</option>
                          <option value="beer">Beer</option>
                          <option value="other">Other</option>
                        </select>
                        <button type="button" onClick={() => setRsCustomDrinks(prev => prev.filter((_, j) => j !== i))} className="text-ink/40 hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Add a custom drink (selected by us) */}
              <div className="border-t border-gold/20 pt-5">
                <div className="font-bebas tracking-widest text-xs text-ink/40 mb-2">ADD A CUSTOM DRINK</div>
                <div className="font-dm text-[11px] text-ink/40 mb-3">Anything not in your saved menu — bespoke cocktails, client-requested wines, signature drinks, etc.</div>
                <div className="grid grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={newRsCustomDrink.name}
                    onChange={e => setNewRsCustomDrink((p: any) => ({ ...p, name: e.target.value }))}
                    placeholder="Drink name (e.g. Signature Espresso Martini)"
                    className="col-span-5 border border-gold/30 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                  />
                  <input
                    type="text"
                    value={newRsCustomDrink.description}
                    onChange={e => setNewRsCustomDrink((p: any) => ({ ...p, description: e.target.value }))}
                    placeholder="Description (optional)"
                    className="col-span-5 border border-gold/30 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newRsCustomDrink.name.trim()) return;
                      setRsCustomDrinks(prev => [...prev, {
                        name: newRsCustomDrink.name.trim(),
                        description: newRsCustomDrink.description.trim() || undefined,
                      }]);
                      setNewRsCustomDrink({ name: "", description: "" });
                    }}
                    className="col-span-2 bg-forest text-cream font-bebas tracking-widest text-xs hover:bg-forest/90 h-9"
                  >
                    + ADD
                  </button>
                </div>
                {rsCustomDrinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {rsCustomDrinks.map((d, i) => (
                      <span key={`cd${i}`} className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 text-xs px-2 py-1 font-dm border border-amber-200">
                        {d.name}{d.description ? ` — ${d.description}` : ''}
                        <button type="button" onClick={() => setRsCustomDrinks(prev => prev.filter((_, j) => j !== i))} className="text-ink/40 hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Drinks / Bar Notes */}
              <div className="border-t border-gold/20 pt-5">
                <div className="font-bebas tracking-widest text-xs text-ink/40 mb-3">DRINKS / BAR NOTES</div>
                <Textarea
                  value={rsBarNotes}
                  onChange={e => setRsBarNotes(e.target.value)}
                  placeholder={`e.g. "Client will choose closer to the date"\n• Standard wine & beer package\n• Bartender to recommend cocktails on the night\n• Set up: 1× espresso martini station, 2× cocktail bartenders`}
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm font-dm min-h-[160px]"
                />
                <div className="font-dm text-[11px] text-ink/40 mt-1.5">Notes appear on the BEO and the live runsheet (Drinks panel).</div>

                {/* Legacy data — only shown if a previous save left selections behind */}
                {(rsSelectedDrinks.length > 0 || rsCustomDrinks.length > 0) && (
                  <div className="mt-4 border border-amber-300 bg-amber-50/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bebas tracking-widest text-xs text-amber-700">SAVED FROM OLD DRINK PICKER</div>
                      <button
                        onClick={() => { if (confirm('Clear these saved drink selections? They will be removed on next save.')) clearLegacyDrinkSelections(); }}
                        className="font-bebas tracking-widest text-[10px] text-amber-700 hover:text-red-600 underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {rsSelectedDrinks.map(k => (
                        <span key={k} className="bg-white text-amber-900 text-[10px] px-2 py-0.5 font-dm border border-amber-300">
                          {k.replace(/_/g, ' ')}
                        </span>
                      ))}
                      {rsCustomDrinks.map((d, i) => (
                        <span key={`c${i}`} className="bg-white text-amber-900 text-[10px] px-2 py-0.5 font-dm border border-amber-300">{d.name}</span>
                      ))}
                    </div>
                    <div className="font-dm text-[10px] text-amber-700/70 mt-2">Tip: copy anything you want to keep into the notes above, then clear.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CHECKLIST TAB ────────────────────────────────────────────────── */}
        {activeMainTab === 'checklist' && (
          <div className="dante-card border-t-0 print:shadow-none">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
              <div className="flex items-center gap-3">
                <h2 className="font-bebas tracking-widest text-ink/60 text-sm">EVENT CHECKLIST</h2>
                <span className="font-dm text-xs text-ink/40">{checkedCount} of {checklistItems.length} complete</span>
              </div>
              <div className="flex items-center gap-2">
                {checkedCount === checklistItems.length && checklistItems.length > 0 && (
                  <span className="font-bebas tracking-widest text-xs text-forest flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5" /> ALL DONE
                  </span>
                )}
                <button
                  onClick={() => { setShowChecklistPaste(true); setChecklistParsed(null); setChecklistPasteText(""); }}
                  className="font-bebas tracking-widest text-xs text-gold hover:text-forest flex items-center gap-1.5 transition-colors border border-gold/40 px-3 py-1.5 hover:bg-gold/5"
                  title="Paste a to-do list and AI will turn it into checklist items"
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI PASTE
                </button>
                {fnbItems.some(i => i.course === 'Drinks' && i.dishName?.trim()) && (
                  <button
                    onClick={pullDrinksFromFnb}
                    className="font-bebas tracking-widest text-xs text-ink/50 hover:text-forest flex items-center gap-1.5 transition-colors border border-ink/20 px-3 py-1.5 hover:bg-forest/5 hover:border-forest/40"
                    title="Add each drink from the F&B sheet as a bar stock item to tick off"
                  >
                    <Wine className="w-3.5 h-3.5" /> PULL BAR DRINKS
                  </button>
                )}
                {checklistInstance?.shareToken ? (
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/staff-checklist/${checklistInstance.shareToken}`;
                      navigator.clipboard.writeText(url);
                      toast.success('Staff checklist link copied!');
                    }}
                    className="flex items-center gap-1.5 font-bebas tracking-widest text-xs text-forest border border-forest/30 hover:bg-forest/5 px-3 py-1 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" /> SHARE LINK
                  </button>
                ) : sheetId && getOrCreateChecklist.isPending ? (
                  <span className="font-dm text-xs text-ink/30">Generating link…</span>
                ) : null}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-gold/20">
              <div
                className="h-1 bg-forest transition-all duration-300"
                style={{ width: checklistItems.length > 0 ? `${(checkedCount / checklistItems.length) * 100}%` : '0%' }}
              />
            </div>

            <div className="divide-y divide-gold/20">
              {checklistItems.map(item => (
                <div key={item.id} className="px-5 py-3 group hover:bg-linen/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleChecklistItem(item.id)}
                      className={`flex-shrink-0 transition-colors ${item.checked ? 'text-forest' : 'text-ink/30 hover:text-ink/60'}`}
                    >
                      {item.checked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                    <span className={`flex-1 font-dm text-sm transition-colors ${item.checked ? 'line-through text-ink/40' : 'text-ink'}`}>
                      {item.text}
                    </span>
                    <span className={`font-bebas tracking-widest text-[10px] px-2 py-0.5 ${
                      item.category === 'admin' ? 'bg-blue-100 text-blue-700' :
                      item.category === 'staff' ? 'bg-purple-100 text-purple-700' :
                      item.category === 'setup' ? 'bg-amber-100 text-amber-700' :
                      item.category === 'bar' ? 'bg-blue-100 text-blue-700' :
                      item.category === 'kitchen' ? 'bg-red-100 text-red-700' :
                      item.category === 'guest' ? 'bg-pink-100 text-pink-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {item.category}
                    </span>
                    <button
                      onClick={() => { setPendingChecklistPhotoId(item.id); checklistPhotoInputRef.current?.click(); }}
                      disabled={checklistPhotoUploading === item.id}
                      className={`flex-shrink-0 transition-all ${item.imageUrl ? 'text-forest hover:text-forest/70' : 'opacity-0 group-hover:opacity-100 text-ink/30 hover:text-forest'}`}
                      title={item.imageUrl ? 'Replace reference photo' : 'Add a reference photo for staff'}
                    >
                      {checklistPhotoUploading === item.id
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <Camera className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => removeChecklistItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-red-500 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {item.imageUrl && (
                    <div className="mt-2 ml-8 flex items-start gap-2">
                      <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" title="View full size">
                        <img src={item.imageUrl} alt="Reference" className="max-h-36 w-auto rounded border border-gold/30 object-contain" />
                      </a>
                      <button
                        onClick={() => setChecklistItemImage(item.id, '')}
                        className="text-ink/30 hover:text-red-500 transition-colors"
                        title="Remove photo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Hidden file input shared by all checklist item photo buttons */}
            <input
              ref={checklistPhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleChecklistPhotoUpload}
            />

            {/* Add checklist item */}
            <div className="px-5 py-4 border-t border-gold/20 flex gap-2">
              <Input
                value={newChecklistText}
                onChange={e => setNewChecklistText(e.target.value)}
                placeholder="Add a checklist item..."
                className="flex-1 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
              />
              <Button
                onClick={addChecklistItem}
                className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-sm px-4 h-9 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> ADD
              </Button>
            </div>
          </div>
        )}

        {/* ── TABLE PLAN TAB ──────────────────────────────────────────────── */}
        {activeMainTab === 'tableplan' && (
          <div className="dante-card border-t-0 print:shadow-none">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-gold" />
                <span className="font-bebas tracking-widest text-sm text-ink">TABLE PLAN</span>
              </div>
              {linkedFloorPlanId && (
                <a
                  href={`/floor-plan?id=${linkedFloorPlanId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bebas tracking-widest text-xs text-forest hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> OPEN EDITOR
                </a>
              )}
            </div>
            {/* Floor plan selector */}
            <div className="px-5 py-4 border-b border-gold/20">
              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-2">LINK A FLOOR PLAN</label>
              <select
                value={linkedFloorPlanId ?? ""}
                onChange={e => setLinkedFloorPlanId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full border border-gold/20 rounded-sm px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
              >
                <option value="">— No floor plan linked —</option>
                {(floorPlansList ?? []).map((fp: any) => (
                  <option key={fp.id} value={fp.id}>{fp.name}</option>
                ))}
              </select>
              {!floorPlansList?.length && (
                <p className="text-xs text-ink/40 font-dm mt-2">
                  No floor plans yet.{' '}
                  <a href="/floor-plan" className="text-forest underline">Create one in Floor Plan Builder</a>.
                </p>
              )}
            </div>
            {/* Embedded floor plan viewer */}
            {linkedFloorPlan ? (
              <div className="relative" style={{ height: '520px' }}>
                <div className="absolute inset-0 flex flex-col">
                  {/* Mini toolbar */}
                  <div className="flex items-center justify-between px-4 py-2 bg-linen border-b border-gold/20 shrink-0">
                    <span className="font-bebas tracking-widest text-xs text-ink/60">{linkedFloorPlan.name}</span>
                    <div className="flex items-center gap-3">
                      {linkedFloorPlan.shareToken && (
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/floor-plan/share/${linkedFloorPlan.shareToken}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Share link copied!');
                          }}
                          className="font-bebas tracking-widest text-[10px] text-ink/50 hover:text-forest flex items-center gap-1 transition-colors"
                        >
                          <Share2 className="w-3 h-3" /> COPY SHARE LINK
                        </button>
                      )}
                      <span className="text-[10px] font-dm text-ink/30">READ ONLY VIEW</span>
                    </div>
                  </div>
                  {/* Canvas area - render elements */}
                  <div className="flex-1 overflow-auto bg-gray-50 p-4">
                    {linkedFloorPlan.canvasData ? (
                      <div className="relative bg-white border border-gold/20 shadow-sm mx-auto" style={{ width: (linkedFloorPlan.canvasData as any).width ?? 900, height: (linkedFloorPlan.canvasData as any).height ?? 600, maxWidth: '100%' }}>
                        {linkedFloorPlan.bgImageUrl && (
                          <img src={linkedFloorPlan.bgImageUrl} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ opacity: 0.3 }} />
                        )}
                        {((linkedFloorPlan.canvasData as any).elements ?? []).map((el: any) => (
                          <div
                            key={el.id}
                            className="absolute border border-gold/40 flex items-center justify-center text-center"
                            style={{
                              left: el.x, top: el.y,
                              width: el.width, height: el.height,
                              transform: `rotate(${el.rotation ?? 0}deg)`,
                              backgroundColor: el.color ? `${el.color}33` : '#f5f0e833',
                              borderColor: el.color ?? '#c9a84c',
                              fontSize: 10,
                              fontFamily: 'DM Sans, sans-serif',
                            }}
                          >
                            <span className="text-ink/70 px-1 leading-tight">{el.label ?? el.type}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-ink/30 font-dm text-sm">
                        No canvas data — open the editor to design your floor plan.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-ink/30">
                <LayoutGrid className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-dm text-sm">Link a floor plan above to view it here.</p>
                <a href="/floor-plan" className="mt-3 font-bebas tracking-widest text-xs text-forest hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> CREATE FLOOR PLAN
                </a>
              </div>
            )}
          </div>
        )}
        {/* ── Linked Proposal (collapsible, at bottom — always shown) ───── */}
        {(() => {
          const proposalList = (leadProposals ?? allProposals ?? []) as any[];
          return (
          <div className="dante-card mt-4 no-print">
            <button
              onClick={() => setProposalSectionOpen(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-linen transition-colors"
            >
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-forest" />
                <span className="font-bebas tracking-widest text-sm text-forest">LINKED PROPOSAL</span>
                {linkedProposalId && <span className="text-xs text-forest/50 font-dm">(data auto-populated)</span>}
              </div>
              {proposalSectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
            </button>
            {proposalSectionOpen && (
              <div className="px-5 pb-5 pt-2 space-y-4">
                <div>
                  <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-2">SELECT PROPOSAL</label>
                  <select
                    value={linkedProposalId ?? ""}
                    onChange={e => setLinkedProposalId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full border border-gold/20 rounded-sm px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
                  >
                    <option value="">— No linked proposal —</option>
                    {proposalList.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                    ))}
                  </select>
                </div>
                {linkedProposal && (
                  <div className="bg-linen border border-gold/20 p-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="font-bebas text-[10px] text-ink/40 tracking-widest">TOTAL</div>
                        <div className="font-dm font-semibold">${Number(linkedProposal.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <div className="font-bebas text-[10px] text-ink/40 tracking-widest">GUESTS</div>
                        <div className="font-dm font-semibold">{(linkedProposal.guestCount ?? guestCount) || "—"}</div>
                      </div>
                      <div>
                        <div className="font-bebas text-[10px] text-ink/40 tracking-widest">SPACE</div>
                        <div className="font-dm font-semibold">{linkedProposal.spaceName ?? "—"}</div>
                      </div>
                      <div>
                        <div className="font-bebas text-[10px] text-ink/40 tracking-widest">STATUS</div>
                        <div className="font-dm font-semibold capitalize">{linkedProposal.status}</div>
                      </div>
                    </div>
                    {linkedProposal.lineItems && (() => {
                      try {
                        const li = JSON.parse(linkedProposal.lineItems as string ?? "[]") as any[];
                        return li.length > 0 ? (
                          <div>
                            <div className="font-bebas text-[10px] text-ink/40 tracking-widest mb-1">PRICING ITEMS</div>
                            <div className="space-y-0.5">
                              {li.map((item: any, i: number) => (
                                <div key={i} className="flex justify-between text-xs font-dm">
                                  <span className="text-ink/70">{item.description}{item.qty > 1 ? ` × ${item.qty}` : ""}</span>
                                  <span className="font-medium">${Number(item.total).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null;
                      } catch { return null; }
                    })()}
                    {proposalDrinks && (
                      <div>
                        <div className="font-bebas text-[10px] text-ink/40 tracking-widest mb-1">BAR</div>
                        <div className="text-xs font-dm capitalize text-ink/70">
                          {proposalDrinks.barOption?.replace(/_/g, " ")}
                          {proposalDrinks.tabAmount ? ` — Tab: $${Number(proposalDrinks.tabAmount).toLocaleString("en-NZ")}` : ""}
                        </div>
                        {(proposalDrinks.selectedDrinks as string[])?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(proposalDrinks.selectedDrinks as string[]).map(k => (
                              <span key={k} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 font-dm">{k.replace(/_/g, " ")}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <a
                      href={`/proposal/${linkedProposal.publicToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bebas tracking-widest text-forest hover:underline"
                    >
                      <FileText className="w-3 h-3" /> VIEW FULL PROPOSAL
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })()}

        {/* ── Floor Plan Link section ──────────────────────────────────── */}
        <div className="dante-card mt-4 no-print">
          <button
            onClick={() => setFloorPlanSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-linen transition-colors"
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-forest" />
              <span className="font-bebas tracking-widest text-sm text-forest">FLOOR PLAN</span>
              {linkedFloorPlanId && <span className="text-xs text-forest/50 font-dm">(linked)</span>}
            </div>
            {floorPlanSectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
          </button>
          {floorPlanSectionOpen && (
            <div className="px-5 pb-5 pt-2 space-y-3">
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-2">SELECT FLOOR PLAN</label>
                <select
                  value={linkedFloorPlanId ?? ""}
                  onChange={e => setLinkedFloorPlanId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full border border-gold/20 rounded-sm px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
                >
                  <option value="">— No floor plan —</option>
                  {(floorPlansList ?? []).map((fp: any) => (
                    <option key={fp.id} value={fp.id}>{fp.name}</option>
                  ))}
                </select>
              </div>
              {linkedFloorPlanId && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveMainTab('tableplan')}
                    className="font-bebas tracking-widest text-[10px] text-forest hover:underline flex items-center gap-1"
                  >
                    <LayoutGrid className="w-3 h-3" /> VIEW IN TABLE PLAN TAB
                  </button>
                  <span className="text-ink/20">•</span>
                  <a
                    href={`/floor-plan?id=${linkedFloorPlanId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bebas tracking-widest text-[10px] text-forest hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> OPEN EDITOR
                  </a>
                </div>
              )}
              {!floorPlansList?.length && (
                <p className="text-xs text-ink/40 font-dm">
                  No floor plans yet.{' '}
                  <a href="/floor-plan" className="text-forest underline">Create one</a>.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Staff Portal Links section ───────────────────────────────── */}
        {sheetId && (
          <div className="dante-card mt-4 no-print">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-forest" />
                <span className="font-bebas tracking-widest text-sm text-forest">STAFF PORTAL LINKS</span>
                {staffLinks && staffLinks.length > 0 && (
                  <span className="text-xs text-forest/50 font-dm">({staffLinks.length} link{staffLinks.length !== 1 ? 's' : ''})</span>
                )}
              </div>
            </div>
            {true && (
              <div className="px-5 pb-5 pt-2 space-y-4">
                <p className="text-xs font-dm text-ink/50">Generate a read-only link for staff to view the runsheet without logging in.</p>
                {/* Existing links */}
                {(staffLinks ?? []).length > 0 && (
                  <div className="space-y-2">
                    {(staffLinks ?? []).map((link: any) => {
                      const url = `${window.location.origin}/staff/${link.token}`;
                      return (
                        <div key={link.id} className="flex items-center gap-2 bg-linen border border-gold/20 px-3 py-2">
                          <Key className="w-3.5 h-3.5 text-gold shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-dm text-xs font-semibold text-ink truncate">{link.label}</div>
                            <div className="font-dm text-[10px] text-ink/40 truncate">{url}</div>
                            {link.expiresAt && (
                              <div className="font-dm text-[10px] text-ink/30">
                                Expires: {new Date(link.expiresAt).toLocaleDateString('en-NZ')}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied!'); }}
                            className="p-1 hover:text-forest transition-colors text-ink/40"
                            title="Copy link"
                          >
                            <Clipboard className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:text-forest transition-colors text-ink/40"
                            title="Open link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => {
                              // Open the staff briefing modal pre-ticking
                              // every saved staff email by default.
                              setEmailingLink({ id: link.id, token: link.token, label: link.label });
                              const all = (staffEmailsQuery.data ?? []).map(s => s.id);
                              setSelectedStaffIds(new Set(all));
                              setExtraEmails("");
                            }}
                            className="p-1 hover:text-forest transition-colors text-ink/40"
                            title="Email staff briefing (runsheet link + PDF)"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteStaffLinkMutation.mutate({ id: link.id })}
                            className="p-1 hover:text-red-500 transition-colors text-ink/30"
                            title="Delete link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Create new link */}
                {creatingStaffLink ? (
                  <div className="space-y-2">
                    <Input
                      value={newStaffLinkLabel}
                      onChange={e => setNewStaffLinkLabel(e.target.value)}
                      placeholder="Link label (e.g. FOH Team)"
                      className="border-gold/20 rounded-sm font-dm text-sm h-9"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => createStaffLinkMutation.mutate({ runsheetId: sheetId!, label: newStaffLinkLabel })}
                        disabled={createStaffLinkMutation.isPending}
                        className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-sm px-4 h-8 flex items-center gap-1.5"
                      >
                        <Share2 className="w-3 h-3" /> {createStaffLinkMutation.isPending ? 'CREATING...' : 'CREATE LINK'}
                      </Button>
                      <Button
                        onClick={() => setCreatingStaffLink(false)}
                        variant="outline"
                        className="font-bebas tracking-widest text-xs rounded-sm px-4 h-8"
                      >
                        CANCEL
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreatingStaffLink(true)}
                    className="font-bebas tracking-widest text-xs text-forest hover:text-forest/80 flex items-center gap-1 border border-forest/30 px-3 py-1.5 hover:bg-forest/5 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> NEW STAFF LINK
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ATTACHMENTS (PDFs shown on the live staff link) ───────────── */}
        {sheetId && (
          <div className="dante-card border-t-0 no-print">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-forest" />
                <span className="font-bebas tracking-widest text-sm text-forest">ATTACHMENTS</span>
                {Array.isArray(existing?.attachments) && existing.attachments.length > 0 && (
                  <span className="font-dm text-xs text-ink/40">({existing.attachments.length})</span>
                )}
              </div>
              <span className="font-dm text-[11px] text-ink/40">Shown on the live staff link · PDFs only · max 10MB</span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {(existing?.attachments ?? []).map((att: any) => (
                <div key={att.id} className="flex items-center gap-3 px-3 py-2 border border-gold/20 hover:bg-linen/40 transition-colors group">
                  <FileText className="w-4 h-4 text-forest/70 flex-shrink-0" />
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 font-dm text-sm text-ink hover:text-forest truncate" title={att.name}>
                    {att.name}
                  </a>
                  <span className="font-dm text-[11px] text-ink/40 flex-shrink-0">{(att.size / 1024).toFixed(0)} KB</span>
                  <button
                    onClick={() => { if (confirm(`Remove ${att.name}?`)) removeAttachmentMutation.mutate({ runsheetId: sheetId, attachmentId: att.id }); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink/30 hover:text-red-500"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <input
                ref={attachmentInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAttachmentUpload(f); }}
              />
              <button
                onClick={() => attachmentInputRef.current?.click()}
                disabled={uploadingAttachment}
                className="font-bebas tracking-widest text-xs text-forest hover:text-forest/80 flex items-center gap-1 border border-forest/30 px-3 py-1.5 hover:bg-forest/5 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> {uploadingAttachment ? 'UPLOADING...' : 'ATTACH PDF'}
              </button>
              {(existing?.attachments ?? []).length === 0 && !uploadingAttachment && (
                <p className="font-dm text-xs text-ink/40 italic pt-1">Attach menus, maps, or any PDF — staff can download them from the live link.</p>
              )}
            </div>
          </div>
        )}

        {/* ── COSTS TAB ────────────────────────────────────────────────────── */}
        {activeMainTab === 'costs' && (
          <div className="dante-card border-t-0 no-print">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gold" />
                <span className="font-bebas tracking-widest text-sm text-ink">EVENT COSTS</span>
                {costItems.length > 0 && (
                  <span className="text-xs font-bebas px-1.5 py-0.5 bg-forest/10 text-ink/60">{costItems.length} item{costItems.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              {linkedProposalId && (
                <button
                  onClick={() => {
                    const imported: CostItem[] = [];
                    // Food line items from proposal
                    if ((linkedProposal as any)?.lineItems) {
                      try {
                        const li = JSON.parse((linkedProposal as any).lineItems as string ?? '[]') as any[];
                        li.filter((i: any) => i.description).forEach((i: any, idx: number) => {
                          imported.push({ _id: `li-${Date.now()}-${idx}`, label: i.description, qty: Number(i.qty) || 1, unitPrice: Number(i.price ?? (Number(i.total) / (Number(i.qty) || 1))) || 0, category: 'Food & Beverage' });
                        });
                      } catch {}
                    }
                    // Quote items (hire, styling, etc.)
                    if ((proposalQuote as any)?.items?.length) {
                      (proposalQuote as any).items.forEach((i: any, idx: number) => {
                        imported.push({ _id: `q-${Date.now()}-${idx}`, label: i.name + (i.description ? ` — ${i.description}` : ''), qty: Number(i.qty) || 1, unitPrice: Number(i.unitPrice) || 0, category: 'Additional' });
                      });
                    }
                    // Bar tab
                    if ((proposalDrinks as any)?.tabAmount) {
                      imported.push({ _id: `bar-${Date.now()}`, label: 'Bar Tab', qty: 1, unitPrice: Number((proposalDrinks as any).tabAmount) || 0, category: 'Bar & Beverages' });
                    }
                    if (imported.length === 0) { toast.error('No cost items found in linked proposal'); return; }
                    setCostItems(prev => {
                      const existingIds = new Set(prev.map(x => x._id));
                      const newItems = imported.filter(x => !existingIds.has(x._id));
                      return [...prev, ...newItems];
                    });
                    toast.success(`${imported.length} item${imported.length !== 1 ? 's' : ''} imported from proposal`);
                  }}
                  className="font-bebas tracking-widest text-[10px] text-[#8b6914] hover:text-forest flex items-center gap-1 border border-gold/40 px-2 py-1 hover:bg-forest/5 hover:border-forest/30 transition-colors"
                >
                  <Download className="w-3 h-3" /> IMPORT FROM PROPOSAL
                </button>
              )}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-dm">
                <thead>
                  <tr className="border-b border-gold/20 bg-linen/30">
                    <th className="text-left px-4 py-2.5 font-bebas tracking-widest text-[10px] text-ink/40">DESCRIPTION</th>
                    <th className="text-left px-4 py-2.5 font-bebas tracking-widest text-[10px] text-ink/40 w-36">CATEGORY</th>
                    <th className="text-center px-3 py-2.5 font-bebas tracking-widest text-[10px] text-ink/40 w-16">QTY</th>
                    <th className="text-right px-4 py-2.5 font-bebas tracking-widest text-[10px] text-ink/40 w-28">UNIT PRICE</th>
                    <th className="text-right px-4 py-2.5 font-bebas tracking-widest text-[10px] text-ink/40 w-28">TOTAL</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {costItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-ink/30 font-dm text-sm">
                        No cost items yet — add one below{linkedProposalId ? ' or import from the linked proposal' : ''}
                      </td>
                    </tr>
                  )}
                  {costItems.map((ci, idx) => (
                    <tr key={ci._id} className="group border-b border-gold/20 hover:bg-linen/40 transition-colors">
                      <td className="px-4 py-2">
                        <input
                          value={ci.label}
                          onChange={e => setCostItems(prev => prev.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
                          placeholder="Item description..."
                          className="w-full bg-transparent border-0 focus:outline-none text-ink font-dm text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={ci.category}
                          onChange={e => setCostItems(prev => prev.map((x, i) => i === idx ? { ...x, category: e.target.value } : x))}
                          className="w-full bg-transparent border-0 focus:outline-none text-ink/70 font-dm text-xs cursor-pointer"
                        >
                          {['Food & Beverage', 'Bar & Beverages', 'Venue Hire', 'AV & Tech', 'Styling & Decor', 'Staffing', 'Additional', 'Other'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min={1}
                          value={ci.qty}
                          onChange={e => setCostItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) || 1 } : x))}
                          className="w-full bg-transparent border-0 focus:outline-none text-ink text-center font-dm text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-ink/40 text-xs">$</span>
                          <input
                            type="number" min={0} step={0.01}
                            value={ci.unitPrice}
                            onChange={e => setCostItems(prev => prev.map((x, i) => i === idx ? { ...x, unitPrice: Number(e.target.value) || 0 } : x))}
                            className="w-20 bg-transparent border-0 focus:outline-none text-ink text-right font-dm text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-ink">
                        ${(ci.qty * ci.unitPrice).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => setCostItems(prev => prev.filter((_, i) => i !== idx))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink/30 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add row */}
            <div className="px-4 py-3 border-t border-gold/20">
              <button
                onClick={() => setCostItems(prev => [...prev, { _id: `new-${Date.now()}`, label: '', qty: 1, unitPrice: 0, category: 'Other' }])}
                className="font-bebas tracking-widest text-xs text-forest hover:text-forest/80 flex items-center gap-1 border border-forest/30 px-3 py-1.5 hover:bg-forest/5 transition-colors"
              >
                <Plus className="w-3 h-3" /> ADD ITEM
              </button>
            </div>

            {/* GST toggle + payment notes */}
            <div className="px-5 py-3 border-t border-gold/20 bg-linen/20 flex flex-col gap-3">
              {/* GST toggle */}
              <div className="flex items-center gap-3">
                <span className="font-bebas tracking-widest text-[10px] text-ink/40">PRICES ARE</span>
                <div className="flex rounded-sm overflow-hidden border border-gold/20">
                  <button
                    onClick={() => setGstInclusive(false)}
                    className={`font-bebas tracking-widest text-[10px] px-3 py-1.5 transition-colors ${!gstInclusive ? 'bg-forest-dark text-cream' : 'text-ink/50 hover:bg-linen'}`}
                  >GST EXCLUSIVE</button>
                  <button
                    onClick={() => setGstInclusive(true)}
                    className={`font-bebas tracking-widest text-[10px] px-3 py-1.5 transition-colors ${gstInclusive ? 'bg-forest-dark text-cream' : 'text-ink/50 hover:bg-linen'}`}
                  >GST INCLUSIVE</button>
                </div>
                <span className="font-dm text-[10px] text-ink/35">{gstInclusive ? 'Prices already include 15% GST' : 'GST (15%) will be added on top'}</span>
              </div>
              {/* Payment notes */}
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">PAYMENT NOTES</label>
                <textarea
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Final payment of $2,400 due on the day. Deposit of $800 received 12 Apr. Balance outstanding. Payment by bank transfer to 12-3456-7890123-00."
                  className="w-full border border-gold/20 rounded-sm px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white resize-none"
                  rows={3}
                />
              </div>
            </div>

            {/* Totals */}
            {costItems.length > 0 && (() => {
              const entered = costItems.reduce((sum, ci) => sum + ci.qty * ci.unitPrice, 0);
              const subtotal = gstInclusive ? entered / 1.15 : entered;
              const gstAmt = gstInclusive ? entered - subtotal : entered * 0.15;
              const total = gstInclusive ? entered : entered + gstAmt;
              const byCategory = costItems.reduce((acc, ci) => {
                acc[ci.category] = (acc[ci.category] ?? 0) + ci.qty * ci.unitPrice;
                return acc;
              }, {} as Record<string, number>);
              return (
                <div className="border-t border-gold/20 px-5 py-4 flex flex-col md:flex-row gap-6 items-start justify-between bg-linen/30">
                  {/* Category breakdown */}
                  <div className="space-y-1">
                    <div className="font-bebas tracking-widest text-[10px] text-ink/40 mb-2">BY CATEGORY</div>
                    {Object.entries(byCategory).map(([cat, amt]) => (
                      <div key={cat} className="flex items-center gap-6 text-xs font-dm">
                        <span className="text-ink/60 w-36">{cat}</span>
                        <span className="text-ink font-semibold">${(gstInclusive ? amt / 1.15 : amt).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}<span className="font-normal text-ink/40 text-[10px] ml-1">ex GST</span></span>
                      </div>
                    ))}
                  </div>
                  {/* Summary */}
                  <div className="min-w-[240px] space-y-1">
                    <div className="flex justify-between text-xs font-dm text-ink/70">
                      <span>Subtotal (excl. GST)</span>
                      <span className="font-semibold">${subtotal.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs font-dm text-ink/50">
                      <span>GST (15%)</span>
                      <span>${gstAmt.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm font-dm font-bold text-ink border-t border-gold/40 pt-1.5 mt-1.5">
                      <span>Total (incl. GST)</span>
                      <span>${total.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {paymentNotes && (
                      <div className="mt-3 pt-3 border-t border-gold/20">
                        <div className="font-bebas text-[9px] tracking-widest text-ink/35 mb-1">PAYMENT NOTES</div>
                        <div className="font-dm text-xs text-ink/60 whitespace-pre-wrap">{paymentNotes}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Print footer */}
        <div className="hidden print:block mt-8 border-t-2 border-gold/40 pt-4 space-y-2">
          {footerText && (
            <div data-print-section="footer" className="font-dm text-sm text-ink/80 bg-linen/60 border border-gold/20 px-4 py-3" dangerouslySetInnerHTML={{ __html: footerText }} />
          )}
          <div className="text-xs text-ink/40 font-dm text-center">
            Prepared by VenueFlowHQ — {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* ── BEO PREVIEW & PRINT MODAL ────────────────────────────────────── */}
      {beoPreviewOpen && effectiveBookingId && (
        <div className="fixed inset-0 z-[70] bg-ink/70 backdrop-blur-sm flex flex-col no-print">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 bg-forest text-cream shadow-lg shrink-0">
            <div className="flex items-center gap-2.5">
              <Eye className="w-5 h-5 text-gold shrink-0" />
              <div>
                <div className="font-bebas tracking-widest text-sm leading-none">PREVIEW &amp; PRINT BEO</div>
                <div className="font-dm text-[11px] text-cream/60 mt-0.5">This is exactly what will print. Choose what to include on the left.</div>
              </div>
            </div>
            <button onClick={() => setBeoPreviewOpen(false)} className="text-cream/70 hover:text-gold p-1.5 transition-colors" title="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body: controls rail + live preview */}
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* Controls */}
            <div className="w-full md:w-80 shrink-0 bg-white border-r border-gold/20 overflow-y-auto">
              <div className="px-4 py-3 border-b border-gold/15">
                <div className="font-bebas tracking-widest text-xs text-forest mb-1">WHAT TO INCLUDE</div>
                <p className="font-dm text-[11px] text-ink/45 mb-2">Untick anything you don't want on this BEO — the preview updates instantly.</p>
                {PRINT_SECTIONS.map(s => {
                  const checked = !printHide.has(s.key);
                  return (
                    <label key={s.key} className="flex items-start gap-2 px-1 py-1.5 hover:bg-linen/50 cursor-pointer rounded-sm">
                      <input type="checkbox" checked={checked} onChange={() => togglePrintSection(s.key)} className="mt-0.5 accent-forest" />
                      <span className="font-dm text-sm text-ink leading-tight">{s.label}</span>
                    </label>
                  );
                })}
                <button onClick={() => setPrintHide(new Set())} className="mt-2 font-bebas tracking-widest text-[10px] text-ink/40 hover:text-forest transition-colors">RESET — SHOW EVERYTHING</button>
              </div>
              {/* Footer note editor */}
              <div className="px-4 py-3">
                <div className="font-bebas tracking-widest text-xs text-forest mb-1">FOOTER NOTE / MESSAGE</div>
                <p className="font-dm text-[11px] text-ink/45 mb-2">The closing note at the very bottom — payment terms, a thank-you, anything. Keep “Footer note” ticked above to show it.</p>
                <RichTextarea value={footerText} onChange={setFooterText} placeholder="e.g. Final payment of $2,400 due on the day. Grazie!" minHeight="80px" />
                <button
                  onClick={async () => { try { await handleSave(); } catch {} setPreviewNonce(n => n + 1); }}
                  disabled={saving}
                  className="mt-2 w-full font-bebas tracking-widest text-xs bg-forest text-cream hover:bg-forest/90 disabled:opacity-50 px-3 py-2 flex items-center justify-center gap-1.5 transition-colors"
                  title="Save your changes and refresh the preview"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} /> {saving ? 'SAVING…' : 'SAVE & UPDATE PREVIEW'}
                </button>
              </div>
            </div>

            {/* Live preview */}
            <div className="flex-1 min-h-0 bg-ink/20 overflow-auto p-3 md:p-6 flex justify-center">
              <iframe
                id="vf-beo-frame"
                key={previewNonce}
                title="BEO preview"
                src={`/api/beo/${effectiveBookingId}?format=html${printHide.size ? `&hide=${encodeURIComponent(Array.from(printHide).join(','))}` : ''}&_=${previewNonce}`}
                className="bg-white shadow-2xl w-full max-w-[820px] h-full border-0 rounded-sm"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 bg-white border-t border-gold/20 shrink-0">
            <button onClick={() => setBeoPreviewOpen(false)} className="font-bebas tracking-widest text-xs text-ink/50 hover:text-ink px-3 py-2 transition-colors">CLOSE</button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(`/api/beo/${effectiveBookingId}${beoHideQuery}`, '_blank')}
                className="font-bebas tracking-widest text-xs border border-forest/30 text-forest hover:bg-forest/5 px-4 py-2 flex items-center gap-1.5 transition-colors"
                title="Download the BEO as a PDF file"
              >
                <Download className="w-3.5 h-3.5" /> DOWNLOAD PDF
              </button>
              <button
                onClick={() => { const f = document.getElementById('vf-beo-frame') as HTMLIFrameElement | null; try { f?.contentWindow?.focus(); f?.contentWindow?.print(); } catch {} }}
                className="font-bebas tracking-widest text-xs bg-gold text-ink hover:bg-gold/90 px-5 py-2 flex items-center gap-1.5 transition-colors"
                title="Print this BEO"
              >
                <Printer className="w-3.5 h-3.5" /> PRINT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SMART PASTE IMPORT MODAL ─────────────────────────────────────── */}
      {showPasteImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
          <div className="bg-white w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gold/30 bg-forest shrink-0">
              <div>
                <div className="font-bebas tracking-widest text-gold text-lg">SMART PASTE — IMPORT FROM TEXT</div>
                <div className="font-dm text-white/60 text-xs mt-0.5">Paste an email, booking notes, or Word doc — AI extracts everything relevant</div>
              </div>
              <button onClick={() => { setShowPasteImport(false); setParsedData(null); setEditedParsedTimeline([]); setPasteText(''); }} className="text-white/50 hover:text-white transition-colors">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {!parsedData ? (
                <>
                  <div>
                    <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-2">PASTE YOUR TEXT BELOW</label>
                    <textarea
                      autoFocus
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        if (text) {
                          e.preventDefault();
                          const t = e.target as HTMLTextAreaElement;
                          const start = t.selectionStart ?? pasteText.length;
                          const end = t.selectionEnd ?? pasteText.length;
                          setPasteText(pasteText.slice(0, start) + text + pasteText.slice(end));
                        }
                      }}
                      placeholder={`Paste anything — an email, booking notes, a client brief, a Word doc...\n\nExamples of what gets extracted:\n• Event details (date, guests, contact info, space name)\n• Dietary requirements (e.g. "5 vegetarian, 2 gluten free")\n• Menu / F&B items (courses, dishes, quantities)\n• Event timeline (6pm – Guests arrive, 7pm – Dinner service...)`}
                      rows={12}
                      className="w-full rounded-sm border border-gold/20 focus:outline-none focus:border-forest font-dm text-sm p-3 resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => parseRunsheetMutation.mutate({ text: pasteText, eventType: eventType || undefined })}
                      disabled={!pasteText.trim() || parseRunsheetMutation.isPending}
                      className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-sm rounded-sm px-6 py-2.5 flex items-center gap-2"
                    >
                      {parseRunsheetMutation.isPending ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> ANALYSING...</>
                      ) : (
                        <><FileText className="w-4 h-4" /> EXTRACT WITH AI</>
                      )}
                    </Button>
                    <span className="font-dm text-xs text-ink/40">AI will extract event details, dietaries, F&B items and timeline</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="font-bebas tracking-widest text-sm text-forest">REVIEW EXTRACTED DATA — CHOOSE WHAT TO APPLY</div>
                    <button onClick={() => { setParsedData(null); setEditedParsedTimeline([]); }} className="font-dm text-xs text-ink/40 hover:text-ink underline">← Back to paste</button>
                  </div>

                  {/* ── EVENT DETAILS ── */}
                  {parsedData.eventDetails && Object.values(parsedData.eventDetails).some(v => v) && (
                    <div className="border border-gold/30">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-linen border-b border-gold/20">
                        <input type="checkbox" checked={includeEventDetails} onChange={e => setIncludeEventDetails(e.target.checked)} className="accent-forest" />
                        <span className="font-bebas tracking-widest text-xs text-forest">EVENT DETAILS</span>
                        <span className="font-dm text-xs text-ink/40 ml-auto">Will overwrite existing fields</span>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2">
                        {parsedData.eventDetails.eventDate && <div className="font-dm text-xs"><span className="text-ink/40">Date:</span> <span className="text-ink font-medium">{parsedData.eventDetails.eventDate}</span></div>}
                        {parsedData.eventDetails.guestCount && <div className="font-dm text-xs"><span className="text-ink/40">Guests:</span> <span className="text-ink font-medium">{parsedData.eventDetails.guestCount}</span></div>}
                        {parsedData.eventDetails.eventType && <div className="font-dm text-xs"><span className="text-ink/40">Event type:</span> <span className="text-ink font-medium">{parsedData.eventDetails.eventType}</span></div>}
                        {parsedData.eventDetails.spaceName && <div className="font-dm text-xs"><span className="text-ink/40">Space:</span> <span className="text-ink font-medium">{parsedData.eventDetails.spaceName}</span></div>}
                        {parsedData.eventDetails.contactName && <div className="font-dm text-xs"><span className="text-ink/40">Contact:</span> <span className="text-ink font-medium">{parsedData.eventDetails.contactName}</span></div>}
                        {parsedData.eventDetails.contactEmail && <div className="font-dm text-xs"><span className="text-ink/40">Email:</span> <span className="text-ink font-medium">{parsedData.eventDetails.contactEmail}</span></div>}
                        {parsedData.eventDetails.contactPhone && <div className="font-dm text-xs"><span className="text-ink/40">Phone:</span> <span className="text-ink font-medium">{parsedData.eventDetails.contactPhone}</span></div>}
                        {parsedData.eventDetails.venueSetup && <div className="font-dm text-xs col-span-2"><span className="text-ink/40">Setup:</span> <span className="text-ink font-medium">{parsedData.eventDetails.venueSetup}</span></div>}
                      </div>
                    </div>
                  )}

                  {/* ── DIETARY REQUIREMENTS ── */}
                  {parsedData.dietaries && parsedData.dietaries.length > 0 && (
                    <div className="border border-gold/30">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-linen border-b border-gold/20">
                        <input type="checkbox" checked={includeDietaries} onChange={e => setIncludeDietaries(e.target.checked)} className="accent-forest" />
                        <span className="font-bebas tracking-widest text-xs text-forest">DIETARY REQUIREMENTS</span>
                        <span className="font-dm text-xs text-ink/40 ml-1">({parsedData.dietaries.length})</span>
                        <span className="font-dm text-xs text-ink/40 ml-auto">Added to existing requirements</span>
                      </div>
                      <div className="p-3 flex flex-wrap gap-2">
                        {parsedData.dietaries.map((d, i) => (
                          <div key={i} className="bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-dm">
                            <span className="font-semibold text-blue-800">{d.name}</span>
                            <span className="text-forest ml-1">×{d.count}</span>
                            {d.notes && <span className="text-forest ml-1">({d.notes})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── F&B ITEMS ── */}
                  {parsedData.fnbItems && parsedData.fnbItems.length > 0 && (
                    <div className="border border-gold/30">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-linen border-b border-gold/20">
                        <input type="checkbox" checked={includeFnb} onChange={e => setIncludeFnb(e.target.checked)} className="accent-forest" />
                        <span className="font-bebas tracking-widest text-xs text-forest">F&B ITEMS</span>
                        <span className="font-dm text-xs text-ink/40 ml-1">({parsedData.fnbItems.length})</span>
                        <span className="font-dm text-xs text-ink/40 ml-auto">Appended to F&B sheet</span>
                      </div>
                      <div className="divide-y divide-gold/10">
                        <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-linen/60">
                          <div className="col-span-3 font-bebas text-[9px] tracking-widest text-ink/40">COURSE</div>
                          <div className="col-span-5 font-bebas text-[9px] tracking-widest text-ink/40">DISH</div>
                          <div className="col-span-2 font-bebas text-[9px] tracking-widest text-ink/40">QTY</div>
                          <div className="col-span-2 font-bebas text-[9px] tracking-widest text-ink/40">TIME</div>
                        </div>
                        {parsedData.fnbItems.map((fi, i) => (
                          <div key={i} className="grid grid-cols-12 gap-1 px-3 py-1.5 font-dm text-xs text-ink items-center">
                            <div className="col-span-3 text-ink/50">{fi.course ?? '—'}</div>
                            <div className="col-span-5 font-medium">{fi.dishName}</div>
                            <div className="col-span-2">{fi.qty}</div>
                            <div className="col-span-2 text-ink/50">{fi.serviceTime ?? '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── TIMELINE ITEMS ── */}
                  {editedParsedTimeline.length > 0 && (
                    <div className="border border-gold/30">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-linen border-b border-gold/20">
                        <input type="checkbox" checked={includeTimeline} onChange={e => setIncludeTimeline(e.target.checked)} className="accent-forest" />
                        <span className="font-bebas tracking-widest text-xs text-forest">TIMELINE ITEMS</span>
                        <span className="font-dm text-xs text-ink/40 ml-1">({editedParsedTimeline.length})</span>
                        <span className="font-dm text-xs text-ink/40 ml-auto">Appended to timeline — click to edit</span>
                      </div>
                      <div className="divide-y divide-gold/10">
                        <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-linen/60">
                          <div className="col-span-2 font-bebas text-[9px] tracking-widest text-ink/40">TIME</div>
                          <div className="col-span-1 font-bebas text-[9px] tracking-widest text-ink/40">MINS</div>
                          <div className="col-span-4 font-bebas text-[9px] tracking-widest text-ink/40">TITLE</div>
                          <div className="col-span-2 font-bebas text-[9px] tracking-widest text-ink/40">CATEGORY</div>
                          <div className="col-span-2 font-bebas text-[9px] tracking-widest text-ink/40">NOTES</div>
                          <div className="col-span-1"></div>
                        </div>
                        {editedParsedTimeline.map((item: any, i: number) => (
                          <div key={item._editId ?? i} className="grid grid-cols-12 gap-1 px-3 py-1.5 items-center text-sm font-dm hover:bg-linen/30 group">
                            <div className="col-span-2">
                              <input type="text" value={item.time ?? ''} onChange={e => setEditedParsedTimeline(prev => prev.map((p, j) => j === i ? { ...p, time: e.target.value } : p))}
                                className="w-full font-mono text-xs text-forest font-semibold bg-transparent border border-transparent hover:border-gold/40 focus:border-forest focus:outline-none px-1 py-0.5" placeholder="HH:MM" />
                            </div>
                            <div className="col-span-1">
                              <input type="text" inputMode="numeric" value={item.duration > 0 ? String(item.duration) : ''} onChange={e => { const raw = e.target.value.replace(/[^\d]/g, ''); setEditedParsedTimeline(prev => prev.map((p, j) => j === i ? { ...p, duration: raw === '' ? 0 : Number(raw) } : p)); }}
                                className="w-full text-xs text-ink/60 bg-transparent border border-transparent hover:border-gold/40 focus:border-forest focus:outline-none px-1 py-0.5" placeholder="—" />
                            </div>
                            <div className="col-span-4">
                              <input type="text" value={item.title ?? ''} onChange={e => setEditedParsedTimeline(prev => prev.map((p, j) => j === i ? { ...p, title: e.target.value } : p))}
                                className="w-full font-medium text-ink text-sm bg-transparent border border-transparent hover:border-gold/40 focus:border-forest focus:outline-none px-1 py-0.5" placeholder="Title" />
                            </div>
                            <div className="col-span-2">
                              <select value={item.category ?? 'other'} onChange={e => setEditedParsedTimeline(prev => prev.map((p, j) => j === i ? { ...p, category: e.target.value } : p))}
                                className={`w-full text-[10px] font-bebas px-1 py-0.5 border border-transparent hover:border-gold/40 focus:border-forest focus:outline-none ${catStyle(String(item.category ?? 'other').toLowerCase())}`}>
                                {CATEGORIES.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                          {/* DESCRIPTION */}
                          <div className="col-span-2">
                            <input type="text" value={item.description ?? ''} onChange={e => setEditedParsedTimeline(prev => prev.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
                              className="w-full text-xs text-ink/50 bg-transparent border border-transparent hover:border-gold/40 focus:border-forest focus:outline-none px-1 py-0.5" placeholder="Notes…" />
                          </div>
                          {/* DELETE */}
                          <div className="col-span-1 flex justify-end">
                            <button onClick={() => setEditedParsedTimeline(prev => prev.filter((_, j) => j !== i))}
                              className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-red-500 transition-all p-0.5" title="Remove">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}

                  {/* No data found */}
                  {!parsedData.eventDetails && (!parsedData.dietaries || parsedData.dietaries.length === 0) && (!parsedData.fnbItems || parsedData.fnbItems.length === 0) && editedParsedTimeline.length === 0 && (
                    <div className="text-center py-10 text-ink/40 font-dm text-sm">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Nothing recognisable was found. Try pasting more detailed text with dates, times, guest counts, or a menu.
                    </div>
                  )}
                </>
              )}
            </div>

            {parsedData && (
              <div className="px-6 py-4 border-t border-gold/30 flex items-center justify-between bg-linen/50 shrink-0">
                <span className="font-dm text-xs text-ink/50">Selected sections will be applied to the runsheet</span>
                <div className="flex gap-3">
                  <button onClick={() => { setShowPasteImport(false); setParsedData(null); setEditedParsedTimeline([]); setPasteText(''); }} className="font-bebas tracking-widest text-xs text-ink/50 hover:text-ink border border-ink/20 px-4 py-2">CANCEL</button>
                  <Button onClick={applyParsedData} className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-sm rounded-sm px-6 py-2 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> APPLY TO RUNSHEET
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DIETARY OPTIONS MANAGER MODAL ────────────────────────────────── */}
      {showDietaryManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gold/30 bg-forest">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-cream" />
                <span className="font-bebas tracking-widest text-cream">MANAGE DIETARY OPTIONS</span>
              </div>
              <button onClick={() => setShowDietaryManager(false)} className="text-cream/60 hover:text-cream transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              <p className="font-dm text-xs text-ink/50">These options appear as quick-add buttons in the Dietary Requirements section.</p>
              <div className="space-y-2">
                {editingDietaries.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 font-dm text-sm text-ink bg-linen px-3 py-1.5 border border-gold/30">{d}</span>
                    <button onClick={() => setEditingDietaries(prev => prev.filter((_, idx) => idx !== i))} className="text-ink/30 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  value={newDietaryOption}
                  onChange={e => setNewDietaryOption(e.target.value)}
                  placeholder="Add new option..."
                  className="flex-1 rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newDietaryOption.trim()) {
                      setEditingDietaries(prev => [...prev, newDietaryOption.trim()]);
                      setNewDietaryOption('');
                    }
                  }}
                />
                <Button
                  onClick={() => { if (newDietaryOption.trim()) { setEditingDietaries(prev => [...prev, newDietaryOption.trim()]); setNewDietaryOption(''); } }}
                  className="bg-forest hover:bg-forest/90 text-white rounded-sm font-bebas tracking-widest text-xs px-3 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD
                </Button>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gold/20">
              <Button variant="outline" onClick={() => setShowDietaryManager(false)} className="flex-1 rounded-sm border-gold/20 font-bebas tracking-widest text-xs">CANCEL</Button>
              <Button onClick={saveDietaryOptions} disabled={updateVenueMutation.isPending} className="flex-1 bg-forest hover:bg-forest/90 text-white rounded-sm font-bebas tracking-widest text-xs">
                {updateVenueMutation.isPending ? 'SAVING...' : 'SAVE OPTIONS'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── SETUP TEMPLATES MANAGER MODAL ─────────────────────────────────── */}
      {showSetupManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gold/30 bg-forest">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cream" />
                <span className="font-bebas tracking-widest text-cream">MANAGE SETUP TEMPLATES</span>
              </div>
              <button onClick={() => setShowSetupManager(false)} className="text-cream/60 hover:text-cream transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[50vh] overflow-y-auto">
              <p className="font-dm text-xs text-ink/50">These templates appear as quick-fill buttons in the Venue Setup section.</p>
              <div className="space-y-2">
                {editingSetups.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 border border-gold/30 bg-linen/50">
                    <div className="flex-1 min-w-0">
                      <div className="font-bebas tracking-widest text-xs text-ink mb-1">{t.label}</div>
                      <div className="font-dm text-xs text-ink/50 truncate">{t.value}</div>
                    </div>
                    <button onClick={() => setEditingSetups(prev => prev.filter((_, idx) => idx !== i))} className="text-ink/30 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-1 border-t border-gold/20">
                <div className="font-bebas tracking-widest text-[10px] text-ink/40">ADD NEW TEMPLATE</div>
                <Input
                  value={newSetupLabel}
                  onChange={e => setNewSetupLabel(e.target.value)}
                  placeholder="Template name (e.g. Cocktail)"
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                />
                <Textarea
                  value={newSetupValue}
                  onChange={e => setNewSetupValue(e.target.value)}
                  placeholder="Setup description..."
                  rows={2}
                  className="rounded-sm border border-gold/20 focus-visible:ring-0 focus-visible:border-forest text-sm"
                />
                <Button
                  onClick={() => {
                    if (newSetupLabel.trim() && newSetupValue.trim()) {
                      setEditingSetups(prev => [...prev, { label: newSetupLabel.trim(), value: newSetupValue.trim() }]);
                      setNewSetupLabel('');
                      setNewSetupValue('');
                    }
                  }}
                  className="w-full bg-gold hover:bg-gold/90 text-ink rounded-sm font-bebas tracking-widest text-xs gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD TEMPLATE
                </Button>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gold/20">
              <Button variant="outline" onClick={() => setShowSetupManager(false)} className="flex-1 rounded-sm border-gold/20 font-bebas tracking-widest text-xs">CANCEL</Button>
              <Button onClick={saveSetupTemplates} disabled={updateVenueMutation.isPending} className="flex-1 bg-forest hover:bg-forest/90 text-white rounded-sm font-bebas tracking-widest text-xs">
                {updateVenueMutation.isPending ? 'SAVING...' : 'SAVE TEMPLATES'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── MENU CATALOGUE SELECTOR MODAL ────────────────────────────────── */}
      {showCatalogSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gold/30 bg-forest">
              <div>
                <div className="font-bebas tracking-widest text-gold text-lg">ADD FROM MENU CATALOGUE</div>
                <div className="font-dm text-white/60 text-xs mt-0.5">Select items to add to the F&B sheet</div>
              </div>
              <button onClick={() => setShowCatalogSelector(false)} className="text-white/50 hover:text-white transition-colors">
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>

            {/* Type selector */}
            <div className="flex border-b border-gold/30">
              {(['food', 'drink'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setCatalogSelectorType(t); setCatalogSelectorCategoryId(null); setCatalogSelectedItems(new Map()); }}
                  className={`flex-1 py-3 font-bebas tracking-widest text-sm transition-colors ${
                    catalogSelectorType === t ? 'bg-forest text-white' : 'text-ink/50 hover:bg-linen'
                  }`}
                >
                  {t === 'food' ? '🍽 FOOD' : '🍷 DRINKS'}
                </button>
              ))}
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Category list */}
              <div className="w-44 border-r border-gold/30 overflow-y-auto bg-linen/50">
                <div className="font-bebas tracking-widest text-[10px] text-ink/40 px-3 pt-3 pb-1">CATEGORIES</div>
                {!catalogCategories || catalogCategories.length === 0 ? (
                  <div className="px-3 py-4 text-xs font-dm text-ink/40">No categories yet. Add them in Settings → Menu Catalogue.</div>
                ) : (
                  catalogCategories.map((cat: any) => (
                    <button
                      key={cat.id}
                      onClick={() => { setCatalogSelectorCategoryId(cat.id); setCatalogSelectedItems(new Map()); }}
                      className={`w-full text-left px-3 py-2.5 font-dm text-sm transition-colors border-b border-gold/20 ${
                        catalogSelectorCategoryId === cat.id ? 'bg-forest text-white' : 'hover:bg-linen text-ink'
                      }`}
                    >
                      {cat.name}
                      {cat.description && <div className={`text-[10px] mt-0.5 truncate ${catalogSelectorCategoryId === cat.id ? 'text-white/60' : 'text-ink/40'}`}>{cat.description}</div>}
                    </button>
                  ))
                )}
              </div>

              {/* Items list */}
              <div className="flex-1 overflow-y-auto">
                {!catalogSelectorCategoryId ? (
                  <div className="flex flex-col items-center justify-center h-full text-ink/30 font-dm text-sm">
                    <UtensilsCrossed className="w-8 h-8 mb-2 opacity-20" />
                    Select a category to browse items
                  </div>
                ) : !catalogItems || catalogItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-ink/30 font-dm text-sm">
                    <UtensilsCrossed className="w-8 h-8 mb-2 opacity-20" />
                    No items in this category yet
                  </div>
                ) : (
                  <div className="divide-y divide-gold/20">
                    {catalogItems.map((item: any) => {
                      const isSelected = catalogSelectedItems.has(item.id);
                      const qty = catalogSelectedItems.get(item.id) ?? 1;
                      return (
                        <div
                          key={item.id}
                          className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                            isSelected ? 'bg-forest/10 border-l-2 border-forest' : 'border-l-2 border-transparent hover:bg-linen'
                          }`}
                        >
                          {/* Checkbox toggle */}
                          <button
                            onClick={() => {
                              setCatalogSelectedItems(prev => {
                                const next = new Map(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.set(item.id, 1);
                                return next;
                              });
                            }}
                            className={`mt-0.5 w-4 h-4 border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-forest border-forest' : 'border-ink/30'
                            }`}
                          >
                            {isSelected && <span className="text-white text-[10px] leading-none">✓</span>}
                          </button>
                          {/* Item info */}
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                            setCatalogSelectedItems(prev => {
                              const next = new Map(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.set(item.id, 1);
                              return next;
                            });
                          }}>
                            <div className="font-dm text-sm font-medium text-ink">{item.name}</div>
                            {item.description && <div className="font-dm text-xs text-ink/50 mt-0.5 truncate">{item.description}</div>}
                            {item.allergens && <div className="font-dm text-[10px] text-amber-700 mt-0.5">⚠ {item.allergens}</div>}
                          </div>
                          {/* Qty input (only when selected) */}
                          {isSelected && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={e => { e.stopPropagation(); setCatalogSelectedItems(prev => { const next = new Map(prev); const cur = next.get(item.id) ?? 1; if (cur <= 1) next.delete(item.id); else next.set(item.id, cur - 1); return next; }); }}
                                className="w-5 h-5 border border-forest/40 text-forest hover:bg-forest/10 flex items-center justify-center text-xs font-bold"
                              >-</button>
                              <input
                                type="number"
                                min={1}
                                value={qty}
                                onClick={e => e.stopPropagation()}
                                onChange={e => { const v = Math.max(1, parseInt(e.target.value) || 1); setCatalogSelectedItems(prev => { const next = new Map(prev); next.set(item.id, v); return next; }); }}
                                className="w-10 text-center text-xs font-dm border border-gold/20 focus:border-forest focus:outline-none py-0.5"
                              />
                              <button
                                onClick={e => { e.stopPropagation(); setCatalogSelectedItems(prev => { const next = new Map(prev); next.set(item.id, (next.get(item.id) ?? 1) + 1); return next; }); }}
                                className="w-5 h-5 border border-forest/40 text-forest hover:bg-forest/10 flex items-center justify-center text-xs font-bold"
                              >+</button>
                            </div>
                          )}
                          {/* Price */}
                          {item.price > 0 && (
                            <div className="text-right flex-shrink-0">
                              <div className="font-dm text-sm font-semibold text-ink">${(item.price / 100).toFixed(2)}</div>
                              <div className="font-bebas text-[9px] text-ink/40 tracking-widest">{item.pricingType === 'per_person' ? 'PP' : 'EACH'}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gold/30 flex items-center justify-between bg-linen/50">
              <span className="font-dm text-sm text-ink/60">
                {catalogSelectedItems.size > 0
                  ? (() => { const totalQty = Array.from(catalogSelectedItems.values()).reduce((a, b) => a + b, 0); return `${catalogSelectedItems.size} item${catalogSelectedItems.size > 1 ? 's' : ''} selected · ${totalQty} total qty`; })()
                  : 'Select items to add'}
              </span>
              <div className="flex gap-3">
                <button onClick={() => setShowCatalogSelector(false)} className="font-bebas tracking-widest text-xs text-ink/50 hover:text-ink border border-ink/20 px-4 py-2">CANCEL</button>
                <Button
                  onClick={addCatalogItemsToFnb}
                  disabled={catalogSelectedItems.size === 0}
                  className="bg-forest hover:bg-forest/90 disabled:opacity-40 text-white font-bebas tracking-widest text-sm rounded-sm px-6 py-2 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> ADD {catalogSelectedItems.size > 0 ? catalogSelectedItems.size : ''} ITEMS
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI F&B PASTE MODAL ──────────────────────────────────────────── */}
      {showFnbPaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gold/30 bg-forest">
              <div>
                <div className="font-bebas tracking-widest text-gold text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5" /> AI F&B PASTE
                </div>
                <div className="font-dm text-white/60 text-xs mt-0.5">Paste a catering brief, menu notes, or email — AI will extract the F&B items</div>
              </div>
              <button onClick={() => setShowFnbPaste(false)} className="text-white/50 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {fnbParsedItems.length === 0 ? (
                <div className="p-6 space-y-4">
                  <div>
                    <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-2">PASTE CATERING TEXT</label>
                    <textarea
                      autoFocus
                      value={fnbPasteText}
                      onChange={e => setFnbPasteText(e.target.value)}
                      onPaste={e => {
                        const text = e.clipboardData.getData("text");
                        if (text) {
                          e.preventDefault();
                          const t = e.target as HTMLTextAreaElement;
                          const start = t.selectionStart ?? fnbPasteText.length;
                          const end = t.selectionEnd ?? fnbPasteText.length;
                          setFnbPasteText(fnbPasteText.slice(0, start) + text + fnbPasteText.slice(end));
                        }
                      }}
                      placeholder="Paste menu details, catering brief, or email here..."
                      rows={10}
                      className="w-full min-h-[220px] border border-gold/20 rounded-sm font-dm text-sm resize-none focus:outline-none focus:border-forest p-3"
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs font-dm text-ink/40">
                    <span>Guest count: <strong className="text-ink/60">{guestCount || 'not set'}</strong></span>
                    <span>•</span>
                    <span>Event type: <strong className="text-ink/60">{eventType || 'not set'}</strong></span>
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-bebas tracking-widest text-sm text-ink">
                      {fnbParsedItems.filter((it: any) => it._selected).length} of {fnbParsedItems.length} items selected
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFnbParsedItems(prev => prev.map(it => ({ ...it, _selected: true })))}
                        className="font-bebas tracking-widest text-[10px] text-forest hover:underline"
                      >
                        SELECT ALL
                      </button>
                      <span className="text-ink/20">•</span>
                      <button
                        onClick={() => setFnbParsedItems(prev => prev.map(it => ({ ...it, _selected: false })))}
                        className="font-bebas tracking-widest text-[10px] text-ink/40 hover:underline"
                      >
                        DESELECT ALL
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {fnbParsedItems.map((item: any, idx: number) => (
                      <div
                        key={item._editId}
                        onClick={() => setFnbParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, _selected: !it._selected } : it))}
                        className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer border-l-2 transition-colors ${
                          item._selected ? 'bg-forest/5 border-forest' : 'bg-white border-transparent hover:bg-linen'
                        }`}
                      >
                        <div className={`mt-0.5 w-4 h-4 border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          item._selected ? 'bg-forest border-forest' : 'border-ink/30'
                        }`}>
                          {item._selected && <span className="text-white text-[10px] leading-none">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-dm text-sm font-semibold text-ink">{item.dishName}</span>
                            <span className="font-bebas text-[10px] tracking-widest text-gold bg-gold/10 px-1.5 py-0.5">{item.course}</span>
                            {item.dietary && <span className="font-dm text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5">{item.dietary}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] font-dm text-ink/50">
                            {item.qty > 1 && <span>Qty: {item.qty}</span>}
                            {item.serviceTime && <span>⏰ {item.serviceTime}</span>}
                            {item.description && <span className="truncate">{item.description}</span>}
                            {item.prepNotes && <span className="italic">{item.prepNotes}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setFnbParsedItems([]); }}
                    className="font-bebas tracking-widest text-[10px] text-ink/40 hover:text-ink flex items-center gap-1"
                  >
                    ← PASTE DIFFERENT TEXT
                  </button>
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gold/30 bg-linen">
              <button
                onClick={() => setShowFnbPaste(false)}
                className="font-bebas tracking-widest text-sm text-ink/50 hover:text-ink transition-colors"
              >
                CANCEL
              </button>
              {fnbParsedItems.length === 0 ? (
                <Button
                  onClick={runFnbParse}
                  disabled={fnbParsedLoading || !fnbPasteText.trim()}
                  className="bg-forest hover:bg-forest/90 disabled:opacity-40 text-white font-bebas tracking-widest text-sm rounded-sm px-6 py-2 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {fnbParsedLoading ? 'PARSING...' : 'PARSE WITH AI'}
                </Button>
              ) : (
                <Button
                  onClick={applyFnbParsed}
                  disabled={fnbParsedItems.filter((it: any) => it._selected).length === 0}
                  className="bg-gold hover:bg-gold/90 disabled:opacity-40 text-ink font-bebas tracking-widest text-sm rounded-sm px-6 py-2 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> ADD {fnbParsedItems.filter((it: any) => it._selected).length} ITEMS TO F&B SHEET
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {showChecklistPaste && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 no-print" onClick={() => setShowChecklistPaste(false)}>
          <div className="bg-linen w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/20">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold" />
                <h3 className="font-bebas tracking-widest text-sm">AI SMART PASTE — EVENT CHECKLIST</h3>
              </div>
              <button onClick={() => setShowChecklistPaste(false)} className="text-ink/40 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            {!checklistParsed ? (
              <>
                <div className="p-5 flex-1 overflow-auto">
                  <p className="font-dm text-sm text-ink/60 mb-3">Paste any to-do list, brief, or notes. AI will turn each task into a checklist item.</p>
                  <Textarea
                    value={checklistPasteText}
                    onChange={e => setChecklistPasteText(e.target.value)}
                    placeholder={"e.g.\n- Confirm final headcount with client\n- Brief floor staff at 4pm\n- Set up bar with house pours\n- Polish glassware"}
                    className="min-h-[260px] font-dm text-sm rounded-sm border border-gold/30 focus-visible:ring-0 focus-visible:border-forest"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gold/20">
                  <Button variant="outline" onClick={() => setShowChecklistPaste(false)} className="font-bebas tracking-widest text-xs rounded-sm">CANCEL</Button>
                  <Button
                    disabled={!checklistPasteText.trim() || parseChecklistTextMut.isPending}
                    onClick={() => parseChecklistTextMut.mutate({ text: checklistPasteText })}
                    className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-sm flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {parseChecklistTextMut.isPending ? 'PARSING…' : 'PARSE WITH AI'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="p-5 flex-1 overflow-auto space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-dm text-xs text-ink/60">{checklistParsed.items.filter(i => i._selected).length} of {checklistParsed.items.length} selected</span>
                    <div className="flex gap-2">
                      <button onClick={() => setChecklistParsed(p => p && ({ ...p, items: p.items.map(i => ({ ...i, _selected: true })) }))} className="font-bebas tracking-widest text-[10px] text-ink/60 hover:text-forest">ALL</button>
                      <button onClick={() => setChecklistParsed(p => p && ({ ...p, items: p.items.map(i => ({ ...i, _selected: false })) }))} className="font-bebas tracking-widest text-[10px] text-ink/60 hover:text-forest">NONE</button>
                    </div>
                  </div>
                  <div className="divide-y divide-gold/20 border border-gold/20">
                    {checklistParsed.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <input type="checkbox" checked={it._selected} onChange={e => setChecklistParsed(p => p && ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, _selected: e.target.checked } : x) }))} />
                        <Input value={it.text} onChange={e => setChecklistParsed(p => p && ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, text: e.target.value } : x) }))} className="flex-1 h-8 text-sm rounded-sm border-gold/20" />
                        <select value={it.category} onChange={e => setChecklistParsed(p => p && ({ ...p, items: p.items.map((x, j) => j === i ? { ...x, category: e.target.value } : x) }))} className="font-bebas text-[11px] tracking-widest border border-gold/20 px-1 py-1 bg-white">
                          {['admin','staff','setup','bar','kitchen','guest','other'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={() => setChecklistParsed(p => p && ({ ...p, items: p.items.filter((_, j) => j !== i) }))} className="text-ink/30 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gold/20">
                  <Button variant="outline" onClick={() => setChecklistParsed(null)} className="font-bebas tracking-widest text-xs rounded-sm">BACK</Button>
                  <Button onClick={applyChecklistParsed} className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-sm">ADD TO CHECKLIST</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* ── Staff email briefing modal ─────────────────────────────────── */}
      {emailingLink && (() => {
        const saved = staffEmailsQuery.data ?? [];
        const url = `${window.location.origin}/staff/${emailingLink.token}`;
        // Build the final recipient list from ticked saved emails + the
        // ad-hoc comma/semicolon/newline-separated extras field.
        const adHoc = extraEmails.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        const picked = saved.filter(s => selectedStaffIds.has(s.id)).map(s => s.email);
        const allRecipients = Array.from(new Set([...picked, ...adHoc.map(e => e.toLowerCase())]));
        const invalidAdHoc = adHoc.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        const canSend = allRecipients.length > 0 && invalidAdHoc.length === 0 && !sendingStaffEmail;

        const sendBriefing = async () => {
          if (!canSend) return;
          setSendingStaffEmail(true);
          const tId = toast.loading(`Preparing staff briefing for ${allRecipients.length} recipient${allRecipients.length !== 1 ? 's' : ''}...`);
          try {
            // The BEO is the one canonical staff-facing document. The old
            // standalone staff-sheet PDF has been removed entirely (route
            // and file). Everything that used to point at it now points
            // here — do not reintroduce a second staff PDF.
            if (!effectiveBookingId) throw new Error('Save the runsheet against a booking first so we can generate the BEO');
            const pdfRes = await fetch(`/api/beo/${effectiveBookingId}`, { credentials: 'include' });
            if (!pdfRes.ok) throw new Error('Could not generate the BEO PDF');
            const blob = await pdfRes.blob();
            if (!blob.type.includes('pdf') || blob.size < 1000) {
              // Server returned an HTML error page or empty body. Fail loud
              // so we never silently attach a broken file again.
              throw new Error('BEO PDF came back empty — try again or check the booking');
            }
            const base64: string = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onloadend = () => resolve(String(r.result || ''));
              r.onerror = reject;
              r.readAsDataURL(blob);
            });
            const safeTitle = (title || 'Event').replace(/[^a-z0-9_\- ]/gi, '').trim() || 'Event';
            const filename = `${safeTitle} — BEO.pdf`;
            // Pull the operator's saved template (Venue Setup → Staff
            // Briefing Email). Falls back to the built-in defaults so
            // nothing breaks for venues that never customised it.
            const eventTitleStr = title || 'the event';
            const eventDateStr = eventDate
              ? new Date(eventDate as any).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
              : '';
            const venueNameStr = (venueSettings as any)?.name || '';
            const fill = (s: string) => s
              .replace(/\{eventTitle\}/g, eventTitleStr)
              .replace(/\{eventDate\}/g, eventDateStr)
              .replace(/\{runsheetUrl\}/g, url)
              .replace(/\{venueName\}/g, venueNameStr);
            const defaultSubject = `Staff Briefing — ${eventTitleStr}`;
            const defaultBody = [
              `Hi team,`,
              ``,
              `Here's the briefing for ${eventTitleStr}${eventDateStr ? ` on ${eventDateStr}` : ''}.`,
              ``,
              `Live runsheet (updates as we edit): ${url}`,
              ``,
              `Full BEO is attached for printing or offline reference.`,
              ``,
              `Thanks!`,
            ].join('\n');
            const subjectTpl = ((venueSettings as any)?.staffBriefingSubject || '').trim();
            const bodyTpl = ((venueSettings as any)?.staffBriefingBody || '').trim();
            const subject = subjectTpl ? fill(subjectTpl) : defaultSubject;
            const body = bodyTpl ? fill(bodyTpl) : defaultBody;
            await emailSendMutation.mutateAsync({
              to: allRecipients,
              subject,
              body,
              attachments: [{ filename, content: base64, contentType: 'application/pdf' }],
            });
            toast.success(`Staff briefing sent to ${allRecipients.length} recipient${allRecipients.length !== 1 ? 's' : ''}`, { id: tId });
            setEmailingLink(null);
          } catch (err: any) {
            toast.error(err?.message || 'Could not email staff', { id: tId });
          } finally {
            setSendingStaffEmail(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 no-print" onClick={() => !sendingStaffEmail && setEmailingLink(null)}>
            <div className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-sm shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gold/20 flex items-center justify-between">
                <div>
                  <h2 className="font-bebas tracking-widest text-base text-forest">EMAIL STAFF BRIEFING</h2>
                  <p className="font-dm text-xs text-ink/50 mt-0.5">Sends the live runsheet link + BEO PDF.</p>
                </div>
                <button onClick={() => setEmailingLink(null)} disabled={sendingStaffEmail} className="text-ink/40 hover:text-ink p-1 disabled:opacity-30" title="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Saved staff list */}
              <div className="px-5 py-4 border-b border-gold/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bebas tracking-widest text-[11px] text-ink/50">SAVED STAFF ({saved.length})</span>
                  {saved.length > 0 && (
                    <div className="flex items-center gap-2 text-[11px] font-dm">
                      <button
                        onClick={() => setSelectedStaffIds(new Set(saved.map(s => s.id)))}
                        className="text-forest hover:underline"
                      >Select all</button>
                      <span className="text-ink/20">|</span>
                      <button
                        onClick={() => setSelectedStaffIds(new Set())}
                        className="text-ink/50 hover:underline"
                      >None</button>
                    </div>
                  )}
                </div>
                {saved.length === 0 ? (
                  <p className="font-dm text-xs text-ink/40 italic">No saved staff yet — add some below or type ad-hoc emails.</p>
                ) : (
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {saved.map(s => {
                      const isOn = selectedStaffIds.has(s.id);
                      return (
                        <div key={s.id} className="flex items-center gap-2 group">
                          <label className="flex-1 flex items-center gap-2 cursor-pointer px-2 py-1.5 hover:bg-linen/60 rounded-sm">
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => {
                                const next = new Set(selectedStaffIds);
                                if (isOn) next.delete(s.id); else next.add(s.id);
                                setSelectedStaffIds(next);
                              }}
                              className="accent-forest"
                            />
                            <span className="font-dm text-sm text-ink truncate">{s.name}</span>
                            <span className="font-dm text-xs text-ink/40 truncate">{s.email}</span>
                          </label>
                          <button
                            onClick={() => { if (confirm(`Remove ${s.email} from the staff list?`)) removeStaffEmailMutation.mutate({ id: s.id }); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink/30 hover:text-red-500"
                            title="Remove from list"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add to saved list */}
                <div className="mt-3 pt-3 border-t border-gold/10">
                  <div className="font-bebas tracking-widest text-[10px] text-ink/40 mb-1.5">ADD TO LIST</div>
                  <div className="flex gap-2">
                    <input
                      value={newStaffName}
                      onChange={e => setNewStaffName(e.target.value)}
                      placeholder="Name"
                      className="flex-1 border border-gold/30 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest"
                    />
                    <input
                      value={newStaffEmail}
                      onChange={e => setNewStaffEmail(e.target.value)}
                      placeholder="email@venue.co.nz"
                      type="email"
                      className="flex-1 border border-gold/30 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest"
                    />
                    <button
                      onClick={() => addStaffEmailMutation.mutate({ name: newStaffName.trim(), email: newStaffEmail.trim() })}
                      disabled={!newStaffName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStaffEmail.trim()) || addStaffEmailMutation.isPending}
                      className="bg-forest text-white font-bebas tracking-widest text-[11px] px-3 disabled:opacity-40"
                    >
                      {addStaffEmailMutation.isPending ? '...' : 'ADD'}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      onClick={() => setShowBulkStaffPaste(v => !v)}
                      className="font-bebas tracking-widest text-[10px] text-forest hover:underline"
                    >
                      {showBulkStaffPaste ? '— HIDE BULK PASTE' : '+ PASTE A WHOLE LIST'}
                    </button>
                    {showBulkStaffPaste && (
                      <span className="font-dm text-[10px] text-ink/40">Paste comma/line-separated emails or "Name &lt;email&gt;" pairs.</span>
                    )}
                  </div>
                  {showBulkStaffPaste && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={bulkStaffPaste}
                        onChange={e => setBulkStaffPaste(e.target.value)}
                        placeholder={"Joe Bloggs <joe@venue.co.nz>, Sam Smith sam@venue.co.nz\nor just\njoe@venue.co.nz; sam@venue.co.nz; alex@venue.co.nz"}
                        rows={4}
                        className="w-full border border-gold/30 px-2 py-1.5 text-xs font-dm focus:outline-none focus:border-forest"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => addBulkStaffMutation.mutate({ text: bulkStaffPaste })}
                          disabled={!bulkStaffPaste.trim() || addBulkStaffMutation.isPending}
                          className="bg-forest text-white font-bebas tracking-widest text-[11px] px-4 py-1.5 disabled:opacity-40"
                        >
                          {addBulkStaffMutation.isPending ? 'ADDING…' : 'ADD ALL'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ad-hoc one-off addresses */}
              <div className="px-5 py-4 border-b border-gold/20">
                <label className="font-bebas tracking-widest text-[11px] text-ink/50 block mb-1.5">EXTRA EMAILS (THIS SEND ONLY)</label>
                <textarea
                  value={extraEmails}
                  onChange={e => setExtraEmails(e.target.value)}
                  placeholder="extra1@example.com, extra2@example.com"
                  rows={2}
                  className="w-full border border-gold/30 px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest"
                />
                {invalidAdHoc.length > 0 && (
                  <p className="font-dm text-[11px] text-red-600 mt-1">Invalid: {invalidAdHoc.join(', ')}</p>
                )}
              </div>

              {/* Footer / send */}
              <div className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="font-dm text-xs text-ink/60">
                  {allRecipients.length === 0
                    ? <span className="text-ink/40">Pick at least one recipient</span>
                    : <span><b>{allRecipients.length}</b> recipient{allRecipients.length !== 1 ? 's' : ''}</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEmailingLink(null)}
                    disabled={sendingStaffEmail}
                    className="font-bebas tracking-widest text-xs px-4 py-2 border border-gold/30 text-ink/60 hover:bg-linen disabled:opacity-40"
                  >CANCEL</button>
                  <button
                    onClick={sendBriefing}
                    disabled={!canSend}
                    className="bg-forest text-white font-bebas tracking-widest text-xs px-5 py-2 disabled:opacity-40"
                  >{sendingStaffEmail ? 'SENDING…' : 'SEND BRIEFING'}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      <style>{`
        .print-cols-2 { columns: 2; column-gap: 1.5rem; column-fill: auto; }
        .print-cols-2 .group\/sortable { break-inside: avoid; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 1cm 1.5cm; size: A4; }
          .vf-rich-content b, .vf-rich-content strong { font-weight: bold; }
          .vf-rich-content i, .vf-rich-content em { font-style: italic; }
          .vf-rich-content u { text-decoration: underline; }
        }
      `}</style>
    </div>
  );
}
