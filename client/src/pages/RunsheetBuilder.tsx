import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, ArrowLeft, Printer, Clock, ChevronDown, ChevronUp,
  GripVertical, Save, FileText, Leaf, Building2, Link as LinkIcon,
} from "lucide-react";
import { getLoginUrl } from "@/const";

const CATEGORIES = [
  { value: "setup", label: "Setup", color: "bg-blue-100 text-blue-700" },
  { value: "guest", label: "Guest", color: "bg-purple-100 text-purple-700" },
  { value: "food", label: "Food", color: "bg-amber-100 text-amber-700" },
  { value: "beverage", label: "Beverage", color: "bg-green-100 text-green-700" },
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

function catStyle(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.color ?? "bg-cream text-ink/70";
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
};

type Dietary = { name: string; count: number; notes?: string };

export default function RunsheetBuilder() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  const params = new URLSearchParams(window.location.search);
  const runsheetId = params.get("id") ? Number(params.get("id")) : null;
  const leadId = params.get("leadId") ? Number(params.get("leadId")) : undefined;
  const bookingId = params.get("bookingId") ? Number(params.get("bookingId")) : undefined;
  const proposalIdParam = params.get("proposalId") ? Number(params.get("proposalId")) : undefined;

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

  // Dietaries
  const [dietaries, setDietaries] = useState<Dietary[]>([]);
  const [newDietary, setNewDietary] = useState({ name: "", count: "1", notes: "" });
  const [dietarySectionOpen, setDietarySectionOpen] = useState(true);

  // Venue setup
  const [venueSetup, setVenueSetup] = useState("");
  const [setupSectionOpen, setSetupSectionOpen] = useState(true);

  // Proposal link
  const [linkedProposalId, setLinkedProposalId] = useState<number | undefined>(proposalIdParam);
  const [proposalSectionOpen, setProposalSectionOpen] = useState(true);

  // Queries
  const { data: existing } = trpc.runsheets.get.useQuery({ id: sheetId! }, { enabled: !!sheetId });
  const { data: lead } = trpc.leads.get.useQuery({ id: leadId! }, { enabled: !!leadId && !sheetId });
  const { data: leadProposals } = trpc.proposals.byLead.useQuery(
    { leadId: leadId! },
    { enabled: !!leadId }
  );
  const { data: linkedProposal } = trpc.proposals.get.useQuery(
    { id: linkedProposalId! },
    { enabled: !!linkedProposalId }
  );
  const { data: proposalDrinks } = trpc.proposals.getDrinks.useQuery(
    { proposalId: linkedProposalId! },
    { enabled: !!linkedProposalId }
  );
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
      setLinkedProposalId((existing as any).proposalId ?? undefined);
      setItems((existing.items ?? []).map((item: any, i: number) => ({ ...item, _tempId: String(i) })));
    }
  }, [existing]);

  // Pre-fill from lead
  useEffect(() => {
    if (lead && !sheetId) {
      setTitle(`${lead.firstName} ${lead.lastName ?? ""} — ${lead.eventType ?? "Event"}`);
      setEventDate(lead.eventDate ? new Date(lead.eventDate).toLocaleDateString("en-CA") : "");
      setGuestCount(lead.guestCount ? String(lead.guestCount) : "");
      setEventType(lead.eventType ?? "");
      seedDefaultItems(lead.eventType ?? "");
    }
  }, [lead, sheetId]);

  // Auto-populate from linked proposal
  useEffect(() => {
    if (linkedProposal && !sheetId) {
      if (linkedProposal.eventDate) setEventDate(new Date(linkedProposal.eventDate).toLocaleDateString("en-CA"));
      if (linkedProposal.guestCount) setGuestCount(String(linkedProposal.guestCount));
      if (linkedProposal.spaceName) setSpaceName(linkedProposal.spaceName);
    }
  }, [linkedProposal, sheetId]);

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
      toast.success("Runsheet created!");
      navigate(`/runsheet?id=${data.id}`, { replace: true });
    },
    onError: () => toast.error("Failed to save runsheet"),
  });
  const updateMutation = trpc.runsheets.update.useMutation({
    onSuccess: () => { utils.runsheets.get.invalidate({ id: sheetId! }); toast.success("Saved!"); },
    onError: () => toast.error("Failed to save"),
  });
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

  async function handleSave() {
    setSaving(true);
    try {
      if (!sheetId) {
        await createMutation.mutateAsync({
          title,
          leadId,
          bookingId,
          proposalId: linkedProposalId,
          eventDate: eventDate || undefined,
          venueName: venueName || undefined,
          spaceName: spaceName || undefined,
          guestCount: guestCount ? Number(guestCount) : undefined,
          eventType: eventType || undefined,
          notes: notes || undefined,
          dietaries: dietaries.length ? dietaries : undefined,
          venueSetup: venueSetup || undefined,
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
      } else {
        await updateMutation.mutateAsync({
          id: sheetId,
          title,
          eventDate: eventDate || null,
          venueName: venueName || undefined,
          spaceName: spaceName || undefined,
          guestCount: guestCount ? Number(guestCount) : undefined,
          eventType: eventType || undefined,
          notes: notes || undefined,
          dietaries: dietaries.length ? dietaries : undefined,
          venueSetup: venueSetup || undefined,
          proposalId: linkedProposalId,
        });
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
            });
          }
        }
      }
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

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      {/* Header */}
      <div className="no-print bg-ink border-b border-amber/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-cream/60 hover:text-cream transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bebas tracking-widest text-amber text-sm">RUNSHEET BUILDER</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="font-bebas tracking-widest text-xs text-cream/70 hover:text-amber flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" /> PRINT
          </button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest text-xs rounded-none px-4 py-2 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "SAVING..." : "SAVE RUNSHEET"}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 print:px-0 print:py-4 space-y-6">

        {/* Event Details */}
        <div className="mb-2 print:mb-6">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="text-2xl font-cormorant font-semibold text-ink border-0 border-b-2 border-ink/20 focus-visible:border-burgundy rounded-none px-0 bg-transparent print:border-0 print:text-3xl mb-4"
            placeholder="Event Runsheet Title"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4">
            <div>
              <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">DATE</label>
              <Input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm print:border-0 print:p-0"
              />
            </div>
            <div>
              <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">EVENT TYPE</label>
              <Input
                value={eventType}
                onChange={e => setEventType(e.target.value)}
                placeholder="Wedding, Birthday..."
                className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm print:border-0 print:p-0"
              />
            </div>
            <div>
              <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">VENUE / SPACE</label>
              <Input
                value={spaceName}
                onChange={e => setSpaceName(e.target.value)}
                placeholder="Main Hall, Rooftop..."
                className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm print:border-0 print:p-0"
              />
            </div>
            <div>
              <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">GUESTS</label>
              <Input
                type="number"
                value={guestCount}
                onChange={e => setGuestCount(e.target.value)}
                placeholder="0"
                className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm print:border-0 print:p-0"
              />
            </div>
          </div>
        </div>

        {/* ── Linked Proposal ─────────────────────────────────────────────── */}
        {leadProposals && leadProposals.length > 0 && (
          <div className="bg-white border border-border no-print">
            <button
              onClick={() => setProposalSectionOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-burgundy/5 hover:bg-burgundy/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-burgundy" />
                <span className="font-bebas tracking-widest text-sm text-burgundy">LINKED PROPOSAL</span>
                {linkedProposalId && <span className="text-xs text-burgundy/60 font-dm">(data auto-populated)</span>}
              </div>
              {proposalSectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
            </button>
            {proposalSectionOpen && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">SELECT PROPOSAL</label>
                  <select
                    value={linkedProposalId ?? ""}
                    onChange={e => setLinkedProposalId(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full border-2 border-border rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-burgundy bg-white"
                  >
                    <option value="">— No linked proposal —</option>
                    {leadProposals.map(p => (
                      <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                    ))}
                  </select>
                </div>
                {linkedProposal && (
                  <div className="bg-cream border border-border p-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="font-bebas text-xs text-ink/40 tracking-widest">TOTAL</div>
                        <div className="font-dm font-semibold">${Number(linkedProposal.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div>
                        <div className="font-bebas text-xs text-ink/40 tracking-widest">GUESTS</div>
                        <div className="font-dm font-semibold">{(linkedProposal.guestCount ?? guestCount) || "—"}</div>
                      </div>
                      <div>
                        <div className="font-bebas text-xs text-ink/40 tracking-widest">SPACE</div>
                        <div className="font-dm font-semibold">{linkedProposal.spaceName ?? "—"}</div>
                      </div>
                      <div>
                        <div className="font-bebas text-xs text-ink/40 tracking-widest">STATUS</div>
                        <div className="font-dm font-semibold capitalize">{linkedProposal.status}</div>
                      </div>
                    </div>
                    {/* Line items */}
                    {linkedProposal.lineItems && (() => {
                      try {
                        const li = JSON.parse(linkedProposal.lineItems as string ?? "[]") as any[];
                        return li.length > 0 ? (
                          <div>
                            <div className="font-bebas text-xs text-ink/40 tracking-widest mb-1">PRICING ITEMS</div>
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
                    {/* Bar option */}
                    {proposalDrinks && (
                      <div>
                        <div className="font-bebas text-xs text-ink/40 tracking-widest mb-1">BAR</div>
                        <div className="text-xs font-dm capitalize text-ink/70">
                          {proposalDrinks.barOption?.replace(/_/g, " ")}
                          {proposalDrinks.tabAmount ? ` — Tab: $${Number(proposalDrinks.tabAmount).toLocaleString("en-NZ")}` : ""}
                        </div>
                        {(proposalDrinks.selectedDrinks as string[])?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(proposalDrinks.selectedDrinks as string[]).map(k => (
                              <span key={k} className="bg-green-100 text-green-700 text-xs px-2 py-0.5 font-dm">{k.replace(/_/g, " ")}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <a
                      href={`/proposal/${linkedProposal.publicToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bebas tracking-widest text-burgundy hover:underline"
                    >
                      <FileText className="w-3 h-3" /> VIEW FULL PROPOSAL
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Venue Setup ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-border">
          <button
            onClick={() => setSetupSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors no-print"
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-700" />
              <span className="font-bebas tracking-widest text-sm text-blue-700">VENUE SETUP</span>
            </div>
            {setupSectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
          </button>
          <div className="hidden print:flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-100">
            <Building2 className="w-4 h-4 text-blue-700" />
            <span className="font-bebas tracking-widest text-sm text-blue-700">VENUE SETUP</span>
          </div>
          {setupSectionOpen && (
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2 no-print">
                {VENUE_SETUP_TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    onClick={() => setVenueSetup(t.value)}
                    className="text-xs font-bebas tracking-widest px-3 py-1.5 border-2 border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={venueSetup}
                onChange={e => setVenueSetup(e.target.value)}
                placeholder="Describe the room layout, table arrangement, AV setup, decorations, bar position, dance floor, stage..."
                rows={4}
                className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy font-dm text-sm"
              />
            </div>
          )}
          {!setupSectionOpen && venueSetup && (
            <div className="hidden print:block px-4 py-3 font-dm text-sm text-ink/80 whitespace-pre-wrap">{venueSetup}</div>
          )}
          {setupSectionOpen && venueSetup && (
            <div className="hidden print:block px-4 py-3 font-dm text-sm text-ink/80 whitespace-pre-wrap">{venueSetup}</div>
          )}
        </div>

        {/* ── Dietary Requirements ─────────────────────────────────────────── */}
        <div className="bg-white border border-border">
          <button
            onClick={() => setDietarySectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-green-50 hover:bg-green-100 transition-colors no-print"
          >
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-green-700" />
              <span className="font-bebas tracking-widest text-sm text-green-700">DIETARY REQUIREMENTS</span>
              {dietaries.length > 0 && (
                <span className="bg-green-700 text-white text-xs font-bebas px-2 py-0.5">{dietaries.length}</span>
              )}
            </div>
            {dietarySectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
          </button>
          <div className="hidden print:flex items-center gap-2 px-4 py-2 bg-green-50 border-b border-green-100">
            <Leaf className="w-4 h-4 text-green-700" />
            <span className="font-bebas tracking-widest text-sm text-green-700">DIETARY REQUIREMENTS</span>
          </div>
          {dietarySectionOpen && (
            <div className="p-4 space-y-4">
              {/* Quick-add chips */}
              <div className="no-print">
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">QUICK ADD</label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_DIETARIES.map(d => (
                    <button
                      key={d}
                      onClick={() => {
                        if (!dietaries.find(x => x.name === d)) {
                          setDietaries(prev => [...prev, { name: d, count: 1 }]);
                        }
                      }}
                      className={`text-xs font-bebas tracking-widest px-3 py-1.5 border-2 transition-colors ${
                        dietaries.find(x => x.name === d)
                          ? "bg-green-700 text-white border-green-700"
                          : "border-green-200 text-green-700 hover:bg-green-50"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dietary table */}
              {dietaries.length > 0 && (
                <div className="border-2 border-border divide-y divide-border">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-cream">
                    <div className="col-span-4 font-bebas text-xs tracking-widest text-ink/50">REQUIREMENT</div>
                    <div className="col-span-2 font-bebas text-xs tracking-widest text-ink/50">COUNT</div>
                    <div className="col-span-5 font-bebas text-xs tracking-widest text-ink/50">NOTES</div>
                    <div className="col-span-1 no-print"></div>
                  </div>
                  {dietaries.map((d, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                      <div className="col-span-4 font-dm text-sm font-medium">{d.name}</div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min={1}
                          value={d.count}
                          onChange={e => updateDietary(idx, "count", Number(e.target.value))}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8 no-print"
                        />
                        <span className="hidden print:block font-dm text-sm">{d.count}</span>
                      </div>
                      <div className="col-span-5">
                        <Input
                          value={d.notes ?? ""}
                          onChange={e => updateDietary(idx, "notes", e.target.value)}
                          placeholder="Notes..."
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8 no-print"
                        />
                        <span className="hidden print:block font-dm text-sm text-ink/60">{d.notes}</span>
                      </div>
                      <div className="col-span-1 no-print">
                        <button onClick={() => removeDietary(idx)} className="text-ink/30 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Custom dietary add */}
              <div className="no-print">
                <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">ADD CUSTOM</label>
                <div className="flex gap-2">
                  <Input
                    value={newDietary.name}
                    onChange={e => setNewDietary(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Requirement..."
                    className="flex-1 rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                    onKeyDown={e => e.key === "Enter" && addDietary()}
                  />
                  <Input
                    type="number"
                    min={1}
                    value={newDietary.count}
                    onChange={e => setNewDietary(prev => ({ ...prev, count: e.target.value }))}
                    placeholder="Count"
                    className="w-20 rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                  <Input
                    value={newDietary.notes}
                    onChange={e => setNewDietary(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Notes (optional)"
                    className="flex-1 rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                  />
                  <Button
                    onClick={addDietary}
                    className="bg-green-700 hover:bg-green-800 text-white rounded-none font-bebas tracking-widest text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" /> ADD
                  </Button>
                </div>
              </div>

              {dietaries.length === 0 && (
                <div className="text-center py-4 text-ink/30 font-dm text-sm">No dietary requirements recorded</div>
              )}
            </div>
          )}
        </div>

        {/* ── Timeline ────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bebas tracking-widest text-ink/70 text-sm">TIMELINE</h2>
            <button
              onClick={addItem}
              className="no-print font-bebas tracking-widest text-xs text-burgundy hover:text-burgundy/80 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> ADD ITEM
            </button>
          </div>

          {items.length === 0 && (
            <div className="text-center py-12 text-ink/40 font-dm text-sm">
              No items yet. Click "Add Item" to build your runsheet.
            </div>
          )}

          {items.map((item, idx) => {
            const key = getItemKey(item);
            const isExpanded = expandedItem === key;
            const endTime = addMinutes(item.time, item.duration);
            return (
              <div key={key} className="bg-white border border-border shadow-sm print:shadow-none print:border-b print:border-t-0 print:border-x-0 print:rounded-none">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="no-print text-ink/30 cursor-grab">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-1 min-w-[100px]">
                    <Clock className="w-3.5 h-3.5 text-ink/40 no-print" />
                    <input
                      type="time"
                      value={item.time}
                      onChange={e => updateItemField(idx, "time", e.target.value)}
                      className="font-dm text-sm font-semibold text-ink bg-transparent border-0 focus:outline-none w-[70px]"
                    />
                    <span className="text-ink/40 text-xs">–{endTime}</span>
                  </div>
                  <span className={`font-bebas tracking-widest text-xs px-2 py-0.5 rounded-sm ${catStyle(item.category)} min-w-[80px] text-center`}>
                    {CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}
                  </span>
                  <input
                    value={item.title}
                    onChange={e => updateItemField(idx, "title", e.target.value)}
                    placeholder="Item title..."
                    className="flex-1 font-dm text-sm text-ink bg-transparent border-0 focus:outline-none"
                  />
                  {item.assignedTo && (
                    <span className="text-xs text-ink/50 font-dm hidden md:block">{item.assignedTo}</span>
                  )}
                  <span className="text-xs text-ink/40 font-dm min-w-[40px] text-right">{item.duration}m</span>
                  <div className="no-print flex items-center gap-1">
                    <button
                      onClick={() => setExpandedItem(isExpanded ? null : key)}
                      className="text-ink/30 hover:text-ink/60 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => removeItem(idx)}
                      className="text-ink/30 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 grid grid-cols-2 gap-3 bg-cream/50">
                    <div>
                      <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">DURATION (MINUTES)</label>
                      <Input
                        type="number"
                        value={item.duration}
                        onChange={e => updateItemField(idx, "duration", Number(e.target.value))}
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                      />
                    </div>
                    <div>
                      <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">CATEGORY</label>
                      <select
                        value={item.category}
                        onChange={e => updateItemField(idx, "category", e.target.value)}
                        className="w-full border-2 border-border rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-burgundy bg-white"
                      >
                        {CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">ASSIGNED TO</label>
                      <Input
                        value={item.assignedTo ?? ""}
                        onChange={e => updateItemField(idx, "assignedTo", e.target.value)}
                        placeholder="Staff member..."
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                      />
                    </div>
                    <div>
                      <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-1">NOTES</label>
                      <Input
                        value={item.description ?? ""}
                        onChange={e => updateItemField(idx, "description", e.target.value)}
                        placeholder="Additional notes..."
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Notes */}
        <div>
          <label className="font-bebas tracking-widest text-xs text-ink/50 block mb-2">GENERAL NOTES</label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional notes for the event..."
            rows={3}
            className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy font-dm text-sm"
          />
        </div>

        {/* Print footer */}
        <div className="hidden print:block mt-8 pt-4 border-t border-ink/20 text-xs text-ink/40 font-dm text-center">
          Prepared by HOSTit — {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
