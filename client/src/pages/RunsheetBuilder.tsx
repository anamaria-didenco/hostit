import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, ArrowLeft, Printer, Clock, ChevronDown, ChevronUp, GripVertical, Save
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

export default function RunsheetBuilder() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  // Parse query params
  const params = new URLSearchParams(window.location.search);
  const runsheetId = params.get("id") ? Number(params.get("id")) : null;
  const leadId = params.get("leadId") ? Number(params.get("leadId")) : undefined;
  const bookingId = params.get("bookingId") ? Number(params.get("bookingId")) : undefined;

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

  // Load existing runsheet
  const { data: existing } = trpc.runsheets.get.useQuery(
    { id: sheetId! },
    { enabled: !!sheetId }
  );

  // Load lead data to pre-fill
  const { data: lead } = trpc.leads.get.useQuery(
    { id: leadId! },
    { enabled: !!leadId && !sheetId }
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
      setItems((existing.items ?? []).map((item: any, i: number) => ({ ...item, _tempId: String(i) })));
    }
  }, [existing]);

  useEffect(() => {
    if (lead && !sheetId) {
      setTitle(`${lead.firstName} ${lead.lastName ?? ""} — ${lead.eventType ?? "Event"}`);
      setEventDate(lead.eventDate ? new Date(lead.eventDate).toLocaleDateString("en-CA") : "");
      setGuestCount(lead.guestCount ? String(lead.guestCount) : "");
      setEventType(lead.eventType ?? "");
      // Seed with default items based on event type
      seedDefaultItems(lead.eventType ?? "");
    }
  }, [lead]);

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
          eventDate: eventDate || undefined,
          venueName: venueName || undefined,
          spaceName: spaceName || undefined,
          guestCount: guestCount ? Number(guestCount) : undefined,
          eventType: eventType || undefined,
          notes: notes || undefined,
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
        });
        // Save each unsaved item
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
    if (item.id && sheetId) {
      deleteItemMutation.mutate({ id: item.id });
    }
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItemField(idx: number, field: keyof Item, value: any) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function getItemKey(item: Item) {
    return item._tempId ?? String(item.id);
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
      <div className="no-print bg-forest-dark border-b border-gold/20 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-cream/60 hover:text-cream transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bebas tracking-widest text-gold text-sm">RUNSHEET BUILDER</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="font-bebas tracking-widest text-xs text-cream/70 hover:text-gold flex items-center gap-1.5 transition-colors"
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

      <div className="max-w-4xl mx-auto px-6 py-8 print:px-0 print:py-4">
        {/* Event Header */}
        <div className="mb-8 print:mb-6">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="text-2xl font-cormorant font-semibold text-ink border-0 border-b-2 border-ink/20 focus-visible:border-burgundy rounded-none px-0 bg-transparent print:border-0 print:text-3xl"
            placeholder="Event Runsheet Title"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 print:grid-cols-4">
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

        {/* Timeline */}
        <div className="space-y-2 mb-6">
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
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="no-print text-ink/30 cursor-grab">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  {/* Time */}
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
                  {/* Category badge */}
                  <span className={`font-bebas tracking-widest text-xs px-2 py-0.5 rounded-sm ${catStyle(item.category)} min-w-[80px] text-center`}>
                    {CATEGORIES.find(c => c.value === item.category)?.label ?? item.category}
                  </span>
                  {/* Title */}
                  <input
                    value={item.title}
                    onChange={e => updateItemField(idx, "title", e.target.value)}
                    placeholder="Item title..."
                    className="flex-1 font-dm text-sm text-ink bg-transparent border-0 focus:outline-none"
                  />
                  {/* Assigned to */}
                  {item.assignedTo && (
                    <span className="text-xs text-ink/50 font-dm hidden md:block">{item.assignedTo}</span>
                  )}
                  {/* Duration */}
                  <span className="text-xs text-ink/40 font-dm min-w-[40px] text-right">{item.duration}m</span>
                  {/* Expand / delete */}
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

                {/* Expanded detail */}
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
        <div className="mb-8">
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
