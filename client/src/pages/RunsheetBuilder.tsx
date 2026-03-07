import React, { useState, useEffect, useRef } from "react";
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
  UtensilsCrossed, ChefHat, User, Phone, Mail, CheckSquare, Square,
  MoveUp, MoveDown, Copy, AlertCircle,
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
};

type Dietary = { name: string; count: number; notes?: string };
type FnbItem = {
  id?: number;
  section: 'foh' | 'kitchen';
  course?: string;
  dishName: string;
  description?: string;
  qty: number;
  dietary?: string;
  serviceTime?: string;
  prepNotes?: string;
  platingNotes?: string;
  staffAssigned?: string;
  sortOrder: number;
  _tempId?: string;
};
const COURSES = ['Canapes', 'Entree', 'Main', 'Dessert', 'Cheese', 'Late Night Snack', 'Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Other'];

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

  // Contact info
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Dietaries
  const [dietaries, setDietaries] = useState<Dietary[]>([]);
  const [newDietary, setNewDietary] = useState({ name: "", count: "1", notes: "" });
  const [dietarySectionOpen, setDietarySectionOpen] = useState(true);

  // F&B
  const [activeMainTab, setActiveMainTab] = useState<'timeline' | 'fnb' | 'checklist'>('timeline');
  const [fnbSection, setFnbSection] = useState<'foh' | 'kitchen'>('foh');
  const [fnbItems, setFnbItems] = useState<FnbItem[]>([]);
  const [fnbSaving, setFnbSaving] = useState(false);
  const [newFnbItem, setNewFnbItem] = useState<Partial<FnbItem>>({
    section: 'foh', course: 'Canapes', dishName: '', qty: 1, serviceTime: '', dietary: '', staffAssigned: '',
  });

  // Venue setup
  const [venueSetup, setVenueSetup] = useState("");
  const [setupSectionOpen, setSetupSectionOpen] = useState(true);

  // Proposal link
  const [linkedProposalId, setLinkedProposalId] = useState<number | undefined>(proposalIdParam);
  const [proposalSectionOpen, setProposalSectionOpen] = useState(false);

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

  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; checked: boolean; category: string }[]>([
    { id: "c1", text: "Confirm final guest numbers with client", checked: false, category: "admin" },
    { id: "c2", text: "Send final invoice / confirm payment", checked: false, category: "admin" },
    { id: "c3", text: "Brief all FOH staff on event details", checked: false, category: "staff" },
    { id: "c4", text: "Brief kitchen on menu and dietary requirements", checked: false, category: "staff" },
    { id: "c5", text: "Set up floor plan and tables", checked: false, category: "setup" },
    { id: "c6", text: "Check AV / sound system", checked: false, category: "setup" },
    { id: "c7", text: "Prepare bar stock and ice", checked: false, category: "bar" },
    { id: "c8", text: "Print runsheets for all staff", checked: false, category: "admin" },
    { id: "c9", text: "Confirm dietary meals with kitchen", checked: false, category: "kitchen" },
    { id: "c10", text: "Welcome client on arrival", checked: false, category: "guest" },
  ]);
  const [newChecklistText, setNewChecklistText] = useState("");

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

  async function saveFnb() {
    if (!sheetId) { toast.error('Save the runsheet first'); return; }
    setFnbSaving(true);
    try {
      await saveFnbMutation.mutateAsync({
        runsheetId: sheetId,
        items: fnbItems.map((item, i) => ({
          section: item.section,
          course: item.course,
          dishName: item.dishName,
          description: item.description,
          qty: item.qty ?? 1,
          dietary: item.dietary,
          serviceTime: item.serviceTime,
          prepNotes: item.prepNotes,
          platingNotes: item.platingNotes,
          staffAssigned: item.staffAssigned,
          sortOrder: i,
        })),
      });
      await refetchFnb();
    } finally {
      setFnbSaving(false);
    }
  }

  function addFnbItem() {
    if (!newFnbItem.dishName?.trim()) { toast.error('Enter a dish name'); return; }
    const item: FnbItem = {
      section: (newFnbItem.section ?? 'foh') as 'foh' | 'kitchen',
      course: newFnbItem.course,
      dishName: newFnbItem.dishName.trim(),
      qty: newFnbItem.qty ?? 1,
      dietary: newFnbItem.dietary,
      serviceTime: newFnbItem.serviceTime,
      staffAssigned: newFnbItem.staffAssigned,
      sortOrder: fnbItems.length,
      _tempId: String(Date.now()),
    };
    setFnbItems(prev => [...prev, item]);
    setNewFnbItem({ section: fnbSection, course: 'Canapes', dishName: '', qty: 1, serviceTime: '', dietary: '', staffAssigned: '' });
  }

  function updateFnbItem(idx: number, field: keyof FnbItem, value: any) {
    setFnbItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function removeFnbItem(idx: number) {
    setFnbItems(prev => prev.filter((_, i) => i !== idx));
  }

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
  const { data: proposalQuote } = trpc.quote.get.useQuery(
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
      setContactName(`${lead.firstName} ${lead.lastName ?? ""}`.trim());
      setContactEmail(lead.email ?? "");
      setContactPhone(lead.phone ?? "");
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
    setChecklistItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  }

  function addChecklistItem() {
    if (!newChecklistText.trim()) return;
    setChecklistItems(prev => [...prev, {
      id: `c-${Date.now()}`,
      text: newChecklistText.trim(),
      checked: false,
      category: "other",
    }]);
    setNewChecklistText("");
  }

  function removeChecklistItem(id: string) {
    setChecklistItems(prev => prev.filter(item => item.id !== id));
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

  const checkedCount = checklistItems.filter(i => i.checked).length;

  return (
    <div className="min-h-screen bg-linen print:bg-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="no-print bg-forest border-b border-white/10 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="font-bebas tracking-widest text-gold text-sm">RUNSHEET BUILDER</span>
            {sheetId && <span className="ml-2 text-white/30 text-xs font-dm">#{sheetId}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTemplates(v => !v)}
            className={`font-bebas tracking-widest text-xs flex items-center gap-1.5 transition-colors px-3 py-1.5 border ${
              showTemplates ? 'border-gold text-gold bg-gold/10' : 'border-white/20 text-white/60 hover:text-gold hover:border-gold/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> TEMPLATES
          </button>
          <button
            onClick={() => window.print()}
            className="font-bebas tracking-widest text-xs text-white/60 hover:text-gold flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-4 h-4" /> PRINT
          </button>
          {sheetId ? (
            <a
              href={`/api/staff-sheet/${sheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bebas tracking-widest text-xs bg-[#2d5a27]/80 hover:bg-[#2d5a27] text-white px-3 py-1.5 flex items-center gap-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> STAFF SHEET PDF
            </a>
          ) : (
            <button
              onClick={() => toast.error('Save the runsheet first to generate a Staff Sheet PDF')}
              className="font-bebas tracking-widest text-xs text-white/30 flex items-center gap-1.5 cursor-not-allowed"
            >
              <FileText className="w-3.5 h-3.5" /> STAFF SHEET PDF
            </button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-none px-4 py-2 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "SAVING..." : "SAVE RUNSHEET"}
          </Button>
        </div>
      </div>

      {/* ── Templates Panel ─────────────────────────────────────────────── */}
      {showTemplates && (
        <div className="bg-forest border-b border-white/10 no-print">
          <div className="max-w-5xl mx-auto px-6 py-5">
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

      <div className="max-w-5xl mx-auto px-6 py-8 print:px-0 print:py-4 space-y-0">

        {/* ── Print Header ────────────────────────────────────────────────── */}
        <div className="hidden print:block mb-6 pb-4 border-b-2 border-ink">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bebas text-2xl tracking-widest text-forest mb-1">FUNCTION RUNSHEET</div>
              <div className="font-cormorant text-3xl font-semibold text-ink">{title}</div>
            </div>
            <div className="text-right">
              <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">PREPARED BY</div>
              <div className="font-dm text-sm font-semibold">{venueName || "HOSTit"}</div>
              <div className="font-dm text-xs text-ink/50">{new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
          </div>
        </div>

        {/* ── Event Details Card ──────────────────────────────────────────── */}
        <div className="bg-white border border-gold/30 shadow-sm mb-4 print:shadow-none print:border-0 print:mb-2">
          {/* Editable title */}
          <div className="px-6 pt-5 pb-3 no-print">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-2xl font-cormorant font-semibold text-ink border-0 border-b-2 border-ink/15 focus-visible:border-forest rounded-none px-0 bg-transparent"
              placeholder="Event Runsheet Title"
            />
          </div>

          <div className="px-6 pb-5">
            {/* Event details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DATE</label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{formattedEventDate || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">EVENT TYPE</label>
                <Input
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  placeholder="Wedding, Birthday..."
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{eventType || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">VENUE / SPACE</label>
                <Input
                  value={spaceName}
                  onChange={e => setSpaceName(e.target.value)}
                  placeholder="Main Hall, Rooftop..."
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{spaceName || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">GUESTS</label>
                <Input
                  type="number"
                  value={guestCount}
                  onChange={e => setGuestCount(e.target.value)}
                  placeholder="0"
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm font-semibold">{guestCount || "—"}</div>
              </div>
            </div>

            {/* Contact info row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gold/30">
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1 flex items-center gap-1"><User className="w-3 h-3" /> CLIENT NAME</label>
                <Input
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Client name..."
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm">{contactName || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> PHONE</label>
                <Input
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="Phone number..."
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm">{contactPhone || "—"}</div>
              </div>
              <div>
                <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> EMAIL</label>
                <Input
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="Email address..."
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9 no-print"
                />
                <div className="hidden print:block font-dm text-sm">{contactEmail || "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Venue Setup ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-gold/30 shadow-sm mb-4 print:shadow-none">
          <button
            onClick={() => setSetupSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-linen transition-colors no-print"
          >
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-forest" />
              <span className="font-bebas tracking-widest text-sm text-forest">VENUE SETUP</span>
              {venueSetup && <span className="text-xs text-forest/50 font-dm truncate max-w-[200px]">{venueSetup.substring(0, 40)}{venueSetup.length > 40 ? "..." : ""}</span>}
            </div>
            {setupSectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
          </button>
          <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30">
            <Building2 className="w-4 h-4 text-forest" />
            <span className="font-bebas tracking-widest text-sm text-forest">VENUE SETUP</span>
          </div>
          {setupSectionOpen && (
            <div className="px-5 pb-4 pt-2 space-y-3 no-print">
              <div className="flex flex-wrap gap-2">
                {VENUE_SETUP_TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    onClick={() => setVenueSetup(t.value)}
                    className="text-xs font-bebas tracking-widest px-3 py-1.5 border border-forest/30 text-forest hover:bg-forest/5 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={venueSetup}
                onChange={e => setVenueSetup(e.target.value)}
                placeholder="Describe the room layout, table arrangement, AV setup, decorations, bar position, dance floor, stage..."
                rows={3}
                className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest font-dm text-sm"
              />
            </div>
          )}
          {venueSetup && (
            <div className="hidden print:block px-5 py-3 font-dm text-sm text-ink/80 whitespace-pre-wrap">{venueSetup}</div>
          )}
        </div>

        {/* ── Dietary Requirements ─────────────────────────────────────────── */}
        <div className="bg-white border border-gold/30 shadow-sm mb-4 print:shadow-none">
          <button
            onClick={() => setDietarySectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-linen transition-colors no-print"
          >
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-forest" />
              <span className="font-bebas tracking-widest text-sm text-forest">DIETARY REQUIREMENTS</span>
              {dietaries.length > 0 && (
                <span className="bg-forest text-cream text-xs font-bebas px-2 py-0.5">{dietaries.length}</span>
              )}
            </div>
            {dietarySectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
          </button>
          <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30">
            <Leaf className="w-4 h-4 text-forest" />
            <span className="font-bebas tracking-widest text-sm text-forest">DIETARY REQUIREMENTS</span>
          </div>
          {dietarySectionOpen && (
            <div className="px-5 pb-4 pt-2 space-y-4 no-print">
              <div className="flex flex-wrap gap-2">
                {COMMON_DIETARIES.map(d => (
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
                <div className="border border-gold/30 divide-y divide-gold/20">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-linen">
                    <div className="col-span-4 font-bebas text-xs tracking-widest text-ink/50">REQUIREMENT</div>
                    <div className="col-span-2 font-bebas text-xs tracking-widest text-ink/50">COUNT</div>
                    <div className="col-span-5 font-bebas text-xs tracking-widest text-ink/50">NOTES</div>
                    <div className="col-span-1"></div>
                  </div>
                  {dietaries.map((d, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                      <div className="col-span-4 font-dm text-sm font-medium">{d.name}</div>
                      <div className="col-span-2">
                        <Input
                          type="number" min={1}
                          value={d.count}
                          onChange={e => updateDietary(idx, "count", Number(e.target.value))}
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-8"
                        />
                      </div>
                      <div className="col-span-5">
                        <Input
                          value={d.notes ?? ""}
                          onChange={e => updateDietary(idx, "notes", e.target.value)}
                          placeholder="Notes..."
                          className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-8"
                        />
                      </div>
                      <div className="col-span-1">
                        <button onClick={() => removeDietary(idx)} className="text-ink/30 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newDietary.name}
                  onChange={e => setNewDietary(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Add requirement..."
                  className="flex-1 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm"
                  onKeyDown={e => e.key === "Enter" && addDietary()}
                />
                <Input
                  type="number" min={1}
                  value={newDietary.count}
                  onChange={e => setNewDietary(prev => ({ ...prev, count: e.target.value }))}
                  placeholder="Count"
                  className="w-20 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm"
                />
                <Input
                  value={newDietary.notes}
                  onChange={e => setNewDietary(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notes (optional)"
                  className="flex-1 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm"
                />
                <Button
                  onClick={addDietary}
                  className="bg-forest hover:bg-forest/90 text-cream rounded-none font-bebas tracking-widest text-xs gap-1"
                >
                  <Plus className="w-3 h-3" /> ADD
                </Button>
              </div>
              {dietaries.length === 0 && (
                <div className="text-center py-3 text-ink/30 font-dm text-sm">No dietary requirements recorded</div>
              )}
            </div>
          )}
          {/* Print view of dietaries */}
          {dietaries.length > 0 && (
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

        {/* ── Main Tab Navigation ─────────────────────────────────────────── */}
        <div className="no-print flex border-b border-gold/30 bg-white">
          {[
            { id: 'timeline', label: 'TIMELINE', icon: <Clock className="w-4 h-4" />, count: items.length },
            { id: 'fnb', label: 'F&B SHEET', icon: <UtensilsCrossed className="w-4 h-4" />, count: fnbItems.length },
            { id: 'checklist', label: 'CHECKLIST', icon: <CheckSquare className="w-4 h-4" />, count: `${checkedCount}/${checklistItems.length}` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveMainTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 font-bebas tracking-widest text-sm border-b-2 transition-colors ${
                activeMainTab === tab.id
                  ? 'border-forest text-forest bg-white'
                  : 'border-transparent text-ink/50 hover:text-ink hover:bg-linen'
              }`}
            >
              {tab.icon} {tab.label}
              {tab.count !== undefined && tab.count !== 0 && (
                <span className={`text-xs font-bebas px-1.5 py-0.5 ${activeMainTab === tab.id ? 'bg-forest/10 text-forest' : 'bg-forest/10 text-ink/60'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TIMELINE TAB ────────────────────────────────────────────────── */}
        {activeMainTab === 'timeline' && (
          <div className="bg-white border border-gold/30 border-t-0 shadow-sm print:shadow-none">
            {/* Timeline header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/30 no-print">
              <div className="flex items-center gap-3">
                <h2 className="font-bebas tracking-widest text-ink/60 text-sm">EVENT TIMELINE</h2>
                {items.length > 0 && (
                  <span className="font-dm text-xs text-ink/40">
                    {formatTime12(items[0].time)} – {formatTime12(addMinutes(items[items.length-1].time, items[items.length-1].duration))}
                  </span>
                )}
              </div>
              <button
                onClick={addItem}
                className="font-bebas tracking-widest text-xs text-forest hover:text-forest/80 flex items-center gap-1 transition-colors border border-forest/30 px-3 py-1.5 hover:bg-forest/5"
              >
                <Plus className="w-3.5 h-3.5" /> ADD ITEM
              </button>
            </div>

            {/* Print timeline header */}
            <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30 bg-forest">
              <Clock className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">EVENT TIMELINE</span>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-16 text-ink/30 font-dm text-sm">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                No items yet. Click "Add Item" to build your runsheet.
              </div>
            ) : (
              <div className="divide-y divide-gold/20">
                {items.map((item, idx) => {
                  const key = getItemKey(item);
                  const isExpanded = expandedItem === key;
                  const endTime = addMinutes(item.time, item.duration);
                  const catInfo = CATEGORIES.find(c => c.value === item.category);
                  return (
                    <div key={key} className="group hover:bg-linen/50 transition-colors print:hover:bg-transparent">
                      {/* Main row */}
                      <div className="flex items-center gap-0 print:gap-3">
                        {/* Time column */}
                        <div className="w-[90px] flex-shrink-0 px-4 py-3 border-r border-gold/30 print:border-0">
                          <input
                            type="time"
                            value={item.time}
                            onChange={e => updateItemField(idx, "time", e.target.value)}
                            className="font-dm text-sm font-bold text-ink bg-transparent border-0 focus:outline-none w-full no-print"
                          />
                          <div className="hidden print:block font-dm text-sm font-bold">{formatTime12(item.time)}</div>
                          <div className="font-dm text-[10px] text-ink/40 no-print">–{endTime}</div>
                          <div className="hidden print:block font-dm text-[10px] text-ink/40">–{formatTime12(endTime)}</div>
                        </div>

                        {/* Category badge */}
                        <div className="w-[90px] flex-shrink-0 px-3 py-3 no-print">
                          <span className={`font-bebas tracking-widest text-[10px] px-2 py-0.5 ${catStyle(item.category)}`}>
                            {catInfo?.label ?? item.category}
                          </span>
                        </div>

                        {/* Title & description */}
                        <div className="flex-1 px-3 py-3 min-w-0">
                          <input
                            value={item.title}
                            onChange={e => updateItemField(idx, "title", e.target.value)}
                            placeholder="Item title..."
                            className="w-full font-dm text-sm font-semibold text-ink bg-transparent border-0 focus:outline-none no-print"
                          />
                          <div className="hidden print:block font-dm text-sm font-semibold">{item.title || "—"}</div>
                          {item.description && (
                            <div className="font-dm text-xs text-ink/50 mt-0.5 truncate print:whitespace-normal">{item.description}</div>
                          )}
                        </div>

                        {/* Assigned to */}
                        {item.assignedTo && (
                          <div className="px-3 py-3 hidden md:block">
                            <span className="font-dm text-xs text-ink/50 bg-linen px-2 py-0.5">{item.assignedTo}</span>
                          </div>
                        )}

                        {/* Duration */}
                        <div className="w-[50px] flex-shrink-0 px-2 py-3 text-right no-print">
                          <span className="font-dm text-xs text-ink/30">{item.duration}m</span>
                        </div>

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
                        <div className="border-t border-gold/30 px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-linen/50 no-print">
                          <div>
                            <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DURATION (MINS)</label>
                            <Input
                              type="number"
                              value={item.duration}
                              onChange={e => updateItemField(idx, "duration", Number(e.target.value))}
                              className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                            />
                          </div>
                          <div>
                            <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">CATEGORY</label>
                            <select
                              value={item.category}
                              onChange={e => updateItemField(idx, "category", e.target.value)}
                              className="w-full border border-gold/30 rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
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
                              className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                            />
                          </div>
                          <div>
                            <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">NOTES</label>
                            <Input
                              value={item.description ?? ""}
                              onChange={e => updateItemField(idx, "description", e.target.value)}
                              placeholder="Additional notes..."
                              className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* General notes */}
            <div className="px-5 py-4 border-t border-gold/30">
              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-2">GENERAL NOTES</label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional notes for the event..."
                rows={3}
                className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest font-dm text-sm no-print"
              />
              {notes && <div className="hidden print:block font-dm text-sm text-ink/70 whitespace-pre-wrap">{notes}</div>}
            </div>
          </div>
        )}

        {/* ── F&B SHEET TAB ────────────────────────────────────────────────── */}
        {activeMainTab === 'fnb' && (
          <div className="bg-white border border-gold/30 border-t-0 shadow-sm print:shadow-none">
            {/* FOH / Kitchen sub-tabs */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/30 no-print">
              <div className="flex gap-0">
                <button
                  onClick={() => { setFnbSection('foh'); setNewFnbItem(p => ({ ...p, section: 'foh' })); }}
                  className={`flex items-center gap-2 px-4 py-2 font-bebas tracking-widest text-xs transition-colors border ${
                    fnbSection === 'foh'
                      ? 'bg-gold text-ink border-gold'
                      : 'text-ink/50 border-gold/30 hover:bg-linen'
                  }`}
                >
                  <UtensilsCrossed className="w-3.5 h-3.5" /> FOH SHEET
                  <span className="ml-0.5 text-xs">({fnbItems.filter(i => i.section === 'foh').length})</span>
                </button>
                <button
                  onClick={() => { setFnbSection('kitchen'); setNewFnbItem(p => ({ ...p, section: 'kitchen' })); }}
                  className={`flex items-center gap-2 px-4 py-2 font-bebas tracking-widest text-xs transition-colors border border-l-0 ${
                    fnbSection === 'kitchen'
                      ? 'bg-forest text-white border-forest'
                      : 'text-ink/50 border-gold/30 hover:bg-linen'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5" /> KITCHEN SHEET
                  <span className="ml-0.5 text-xs">({fnbItems.filter(i => i.section === 'kitchen').length})</span>
                </button>
              </div>
              <Button
                onClick={saveFnb}
                disabled={fnbSaving}
                className="bg-gold hover:bg-gold/90 text-ink font-bebas tracking-widest text-xs rounded-none px-4 py-2 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {fnbSaving ? 'SAVING...' : 'SAVE F&B'}
              </Button>
            </div>

            {/* Print F&B header */}
            <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30 bg-forest">
              <UtensilsCrossed className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">F&B SHEET — {fnbSection === 'foh' ? 'FRONT OF HOUSE' : 'KITCHEN'}</span>
            </div>

            {/* ── PROPOSAL F&B SUMMARY ─────────────────────────────────── */}
            {linkedProposalId && (proposalDrinks || (proposalQuote?.items && proposalQuote.items.length > 0) || (linkedProposal?.lineItems)) && (
              <div className="mx-5 my-4 border border-gold/40 bg-[#fffbf0] p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-gold" />
                  <span className="font-bebas tracking-widest text-xs text-[#8b6914]">FOOD & BEVERAGE FROM PROPOSAL</span>
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
                          <span key={k} className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 font-dm border border-green-200">
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
              <div className="mx-5 my-3 p-3 bg-linen border border-gold/30 text-xs font-dm text-ink/50 flex items-center gap-2">
                <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
                Link a proposal in the sidebar to automatically pull in food & beverage selections.
              </div>
            )}

            {/* Add new item form */}
            <div className="px-5 py-4 border-b border-gold/30 bg-linen/50 no-print">
              <div className="font-bebas tracking-widest text-[10px] text-ink/40 mb-3">
                ADD {fnbSection === 'foh' ? 'FOH' : 'KITCHEN'} ITEM
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                <div>
                  <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">COURSE</label>
                  <select
                    value={newFnbItem.course ?? 'Canapes'}
                    onChange={e => setNewFnbItem(p => ({ ...p, course: e.target.value }))}
                    className="w-full border border-gold/30 rounded-none px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                  >
                    {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DISH NAME *</label>
                  <Input
                    value={newFnbItem.dishName ?? ''}
                    onChange={e => setNewFnbItem(p => ({ ...p, dishName: e.target.value }))}
                    placeholder="e.g. Beef Wellington"
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                    onKeyDown={e => e.key === 'Enter' && addFnbItem()}
                  />
                </div>
                <div>
                  <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">SERVICE TIME</label>
                  <Input
                    type="time"
                    value={newFnbItem.serviceTime ?? ''}
                    onChange={e => setNewFnbItem(p => ({ ...p, serviceTime: e.target.value }))}
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                  />
                </div>
                <div>
                  <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">QTY / COVERS</label>
                  <Input
                    type="number" min={1}
                    value={newFnbItem.qty ?? 1}
                    onChange={e => setNewFnbItem(p => ({ ...p, qty: Number(e.target.value) }))}
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
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
                    className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                  />
                </div>
                {fnbSection === 'foh' && (
                  <div className="flex-1">
                    <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">STAFF ASSIGNED</label>
                    <Input
                      value={newFnbItem.staffAssigned ?? ''}
                      onChange={e => setNewFnbItem(p => ({ ...p, staffAssigned: e.target.value }))}
                      placeholder="Name or section..."
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                    />
                  </div>
                )}
                <Button
                  onClick={addFnbItem}
                  className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-none px-4 py-2 flex items-center gap-1.5 h-9"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD
                </Button>
              </div>
            </div>

            {/* F&B items table */}
            {fnbItems.filter(i => i.section === fnbSection).length === 0 ? (
              <div className="text-center py-16 text-ink/30 font-dm text-sm">
                <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-20" />
                No {fnbSection === 'foh' ? 'FOH' : 'kitchen'} items yet. Add dishes above.
              </div>
            ) : (
              <div>
                {/* Table header */}
                <div className={`grid gap-2 px-5 py-2.5 text-xs font-bebas tracking-widest text-white ${
                  fnbSection === 'foh' ? 'bg-gold' : 'bg-forest'
                } ${
                  fnbSection === 'foh'
                    ? 'grid-cols-[90px_1fr_60px_80px_100px_90px_32px]'
                    : 'grid-cols-[90px_1fr_60px_80px_1fr_1fr_32px]'
                }`}>
                  <div>COURSE</div>
                  <div>DISH</div>
                  <div>QTY</div>
                  <div>TIME</div>
                  {fnbSection === 'foh' ? (
                    <><div>DIETARY</div><div>STAFF</div></>
                  ) : (
                    <><div>PREP NOTES</div><div>PLATING</div></>
                  )}
                  <div className="no-print"></div>
                </div>
                {/* Group by course */}
                {COURSES.filter(course =>
                  fnbItems.some(i => i.section === fnbSection && (i.course ?? 'Other') === course)
                ).map(course => (
                  <div key={course}>
                    <div className={`px-5 py-1.5 font-bebas tracking-widest text-xs border-b border-gold/30 ${
                      fnbSection === 'foh' ? 'bg-gold/10 text-[#a07820]' : 'bg-forest/10 text-forest'
                    }`}>
                      {course}
                    </div>
                    {fnbItems
                      .map((item, originalIdx) => ({ item, originalIdx }))
                      .filter(({ item }) => item.section === fnbSection && (item.course ?? 'Other') === course)
                      .map(({ item, originalIdx }) => (
                        <div
                          key={item._tempId ?? originalIdx}
                          className={`grid gap-2 px-5 py-2.5 items-center border-b border-gold/30 text-sm font-dm hover:bg-linen/50 group ${
                            fnbSection === 'foh'
                              ? 'grid-cols-[90px_1fr_60px_80px_100px_90px_32px]'
                              : 'grid-cols-[90px_1fr_60px_80px_1fr_1fr_32px]'
                          }`}
                        >
                          <div className="text-xs text-ink/40 font-bebas tracking-widest">{item.course}</div>
                          <div>
                            <input
                              value={item.dishName}
                              onChange={e => updateFnbItem(originalIdx, 'dishName', e.target.value)}
                              className="w-full font-dm text-sm text-ink bg-transparent border-0 focus:outline-none font-semibold"
                            />
                            {item.description && <div className="text-xs text-ink/40">{item.description}</div>}
                          </div>
                          <div>
                            <input
                              type="number" min={1}
                              value={item.qty}
                              onChange={e => updateFnbItem(originalIdx, 'qty', Number(e.target.value))}
                              className="w-12 font-dm text-sm text-ink bg-transparent border-0 focus:outline-none text-center"
                            />
                          </div>
                          <div className="text-xs text-ink/50 font-dm">
                            {item.serviceTime ? formatTime12(item.serviceTime) : '—'}
                          </div>
                          {fnbSection === 'foh' ? (
                            <>
                              <div>
                                {item.dietary && (
                                  <span className="bg-green-100 text-green-700 text-xs px-1.5 py-0.5 font-bebas tracking-widest">{item.dietary}</span>
                                )}
                              </div>
                              <div>
                                <input
                                  value={item.staffAssigned ?? ''}
                                  onChange={e => updateFnbItem(originalIdx, 'staffAssigned', e.target.value)}
                                  placeholder="Staff..."
                                  className="w-full font-dm text-xs text-ink/70 bg-transparent border-0 focus:outline-none"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <input
                                  value={item.prepNotes ?? ''}
                                  onChange={e => updateFnbItem(originalIdx, 'prepNotes', e.target.value)}
                                  placeholder="Prep notes..."
                                  className="w-full font-dm text-xs text-ink/70 bg-transparent border-0 focus:outline-none"
                                />
                              </div>
                              <div>
                                <input
                                  value={item.platingNotes ?? ''}
                                  onChange={e => updateFnbItem(originalIdx, 'platingNotes', e.target.value)}
                                  placeholder="Plating notes..."
                                  className="w-full font-dm text-xs text-ink/70 bg-transparent border-0 focus:outline-none"
                                />
                              </div>
                            </>
                          )}
                          <div className="no-print opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => removeFnbItem(originalIdx)}
                              className="text-ink/30 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}

            {/* Dietary summary for kitchen */}
            {fnbSection === 'kitchen' && dietaries.length > 0 && (
              <div className="px-5 py-4 border-t border-gold/30 bg-green-50/50">
                <div className="font-bebas tracking-widest text-xs text-forest mb-2">DIETARY SUMMARY FOR KITCHEN</div>
                <div className="flex flex-wrap gap-2">
                  {dietaries.map((d, i) => (
                    <div key={i} className="bg-white border border-green-200 px-3 py-1.5 text-sm font-dm">
                      <span className="font-bold">{d.count}×</span> {d.name}
                      {d.notes && <span className="text-ink/50 ml-1">— {d.notes}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CHECKLIST TAB ────────────────────────────────────────────────── */}
        {activeMainTab === 'checklist' && (
          <div className="bg-white border border-gold/30 border-t-0 shadow-sm print:shadow-none">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/30">
              <div className="flex items-center gap-3">
                <h2 className="font-bebas tracking-widest text-ink/60 text-sm">EVENT CHECKLIST</h2>
                <span className="font-dm text-xs text-ink/40">{checkedCount} of {checklistItems.length} complete</span>
              </div>
              {checkedCount === checklistItems.length && checklistItems.length > 0 && (
                <span className="font-bebas tracking-widest text-xs text-forest flex items-center gap-1">
                  <CheckSquare className="w-3.5 h-3.5" /> ALL DONE
                </span>
              )}
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
                <div key={item.id} className="flex items-center gap-3 px-5 py-3 group hover:bg-linen/50 transition-colors">
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
                    item.category === 'bar' ? 'bg-green-100 text-green-700' :
                    item.category === 'kitchen' ? 'bg-red-100 text-red-700' :
                    item.category === 'guest' ? 'bg-pink-100 text-pink-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {item.category}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-ink/30 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add checklist item */}
            <div className="px-5 py-4 border-t border-gold/30 flex gap-2">
              <Input
                value={newChecklistText}
                onChange={e => setNewChecklistText(e.target.value)}
                placeholder="Add a checklist item..."
                className="flex-1 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
                onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
              />
              <Button
                onClick={addChecklistItem}
                className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-none px-4 h-9 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> ADD
              </Button>
            </div>
          </div>
        )}

        {/* ── Linked Proposal (collapsible, at bottom) ──────────────────── */}
        {leadProposals && leadProposals.length > 0 && (
          <div className="bg-white border border-gold/30 shadow-sm mt-4 no-print">
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
                    className="w-full border border-gold/30 rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
                  >
                    <option value="">— No linked proposal —</option>
                    {leadProposals.map(p => (
                      <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                    ))}
                  </select>
                </div>
                {linkedProposal && (
                  <div className="bg-linen border border-gold/30 p-4 space-y-3">
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
                      className="inline-flex items-center gap-1.5 text-xs font-bebas tracking-widest text-forest hover:underline"
                    >
                      <FileText className="w-3 h-3" /> VIEW FULL PROPOSAL
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Print footer */}
        <div className="hidden print:block mt-8 pt-4 border-t border-ink/20 text-xs text-ink/40 font-dm text-center">
          Prepared by HOSTit — {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}
