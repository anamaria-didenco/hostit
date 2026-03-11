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
  MoveUp, MoveDown, Copy, AlertCircle, Settings2, X,
  Sparkles, LayoutGrid, Users, Share2, ExternalLink, Key, Clipboard, RefreshCw,
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
  const [activeMainTab, setActiveMainTab] = useState<'timeline' | 'fnb' | 'checklist' | 'tableplan'>('timeline');
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

  // Floor plan link
  const [linkedFloorPlanId, setLinkedFloorPlanId] = useState<number | undefined>(undefined);
  const [floorPlanSectionOpen, setFloorPlanSectionOpen] = useState(false);

  // Staff portal links
  const [staffLinksSectionOpen, setStaffLinksSectionOpen] = useState(false);
  const [creatingStaffLink, setCreatingStaffLink] = useState(false);
  const [newStaffLinkLabel, setNewStaffLinkLabel] = useState('Staff Link');

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
    const toAdd: FnbItem[] = catalogItems
      .filter((ci: any) => catalogSelectedItems.has(ci.id))
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
        _tempId: `cat-${Date.now()}-${i}`,
      }));
    setFnbItems(prev => [...prev, ...toAdd]);
    setCatalogSelectedItems(new Map());
    setShowCatalogSelector(false);
    toast.success(`Added ${toAdd.length} item${toAdd.length > 1 ? 's' : ''} to F&B sheet`);
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
      const newFnb: FnbItem[] = parsedData.fnbItems.map((fi, i) => ({
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
      applied.push(`${parsedData.fnbItems.length} F&B item${parsedData.fnbItems.length !== 1 ? 's' : ''}`);
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

  // Venue settings for customisable dietaries and setup templates
  const { data: venueSettings, refetch: refetchVenueSettings } = trpc.venue.getOwn.useQuery();
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

  // State for managing dietary options
  const [showDietaryManager, setShowDietaryManager] = useState(false);
  const [editingDietaries, setEditingDietaries] = useState<string[]>([]);
  const [newDietaryOption, setNewDietaryOption] = useState('');

  function openDietaryManager() {
    setEditingDietaries([...activeDietaryOptions]);
    setShowDietaryManager(true);
  }
  function saveDietaryOptions() {
    updateVenueMutation.mutate({ customDietaryOptions: JSON.stringify(editingDietaries) });
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
    updateVenueMutation.mutate({ customSetupTemplates: JSON.stringify(editingSetups) });
    setShowSetupManager(false);
  }

  // Custom item mode for F&B add form
  const [fnbCustomMode, setFnbCustomMode] = useState(false);
  const [fnbCustomName, setFnbCustomName] = useState('');
  const [fnbCustomCourse, setFnbCustomCourse] = useState('Other');

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
    const name = fnbCustomMode ? fnbCustomName.trim() : newFnbItem.dishName?.trim();
    if (!name) { toast.error('Enter a dish name'); return; }
    const item: FnbItem = {
      section: 'foh',
      course: fnbCustomMode ? fnbCustomCourse : newFnbItem.course,
      dishName: name,
      qty: newFnbItem.qty ?? 1,
      dietary: newFnbItem.dietary,
      serviceTime: newFnbItem.serviceTime,
      staffAssigned: newFnbItem.staffAssigned,
      sortOrder: fnbItems.length,
      _tempId: String(Date.now()),
    };
    setFnbItems(prev => [...prev, item]);
    setNewFnbItem({ section: 'foh', course: 'Canapes', dishName: '', qty: 1, serviceTime: '', dietary: '', staffAssigned: '' });
    setFnbCustomName('');
    if (fnbCustomMode) setFnbCustomMode(false);
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
  const { data: booking } = trpc.bookings.getById.useQuery(
    { id: bookingId! },
    { enabled: !!bookingId && !sheetId }
  );
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
    { enabled: !!sheetId && staffLinksSectionOpen }
  );
  const createStaffLinkMutation = trpc.staffPortal.createLink.useMutation({
    onSuccess: () => { toast.success('Staff link created'); refetchStaffLinks(); setCreatingStaffLink(false); setNewStaffLinkLabel('Staff Link'); },
    onError: () => toast.error('Failed to create staff link'),
  });
  const deleteStaffLinkMutation = trpc.staffPortal.deleteLink.useMutation({
    onSuccess: () => { toast.success('Link deleted'); refetchStaffLinks(); },
    onError: () => toast.error('Failed to delete link'),
  });
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
      setLinkedProposalId((existing as any).proposalId ?? undefined);
      setLinkedFloorPlanId((existing as any).floorPlanId ?? undefined);
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
      seedDefaultItems(booking.eventType ?? "");
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
          floorPlanId: linkedFloorPlanId ?? null,
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
            { id: 'tableplan', label: 'TABLE PLAN', icon: <LayoutGrid className="w-4 h-4" /> },
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
            {/* F&B unified header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/30 no-print">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-gold" />
                <span className="font-bebas tracking-widest text-sm text-ink">F&B SHEET</span>
                <span className="text-xs text-ink/40 font-dm">({fnbItems.length} items)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowFnbPaste(true); setFnbPasteText(''); setFnbParsedItems([]); }}
                  className="font-bebas tracking-widest text-xs text-ink/50 hover:text-forest flex items-center gap-1 transition-colors border border-ink/20 px-3 py-1.5 hover:bg-forest/5 hover:border-forest/40"
                >
                  <Sparkles className="w-3.5 h-3.5" /> AI PASTE
                </button>
                <Button
                  onClick={saveFnb}
                  disabled={fnbSaving}
                  className="bg-gold hover:bg-gold/90 text-ink font-bebas tracking-widest text-xs rounded-none px-4 py-2 flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {fnbSaving ? 'SAVING...' : 'SAVE F&B'}
                </Button>
              </div>
            </div>

            {/* Print F&B header */}
            <div className="hidden print:flex items-center gap-2 px-5 py-2 border-b border-gold/30 bg-forest">
              <UtensilsCrossed className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">F&B SHEET</span>
            </div>

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
                            liRows.push({ section: 'foh', course: 'Menu', dishName: item.description, qty: Number(item.qty) || 1, dietary: '', serviceTime: '', staffAssigned: '', sortOrder: fnbItems.length + foodRows.length + drinkRows.length + i, _tempId: `pull-li-${Date.now()}-${i}` });
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
              <div className="flex items-center justify-between mb-3">
                <div className="font-bebas tracking-widest text-[10px] text-ink/40">ADD ITEM</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setFnbCustomMode(true); setFnbCustomName(''); }}
                    className={`font-bebas tracking-widest text-[10px] flex items-center gap-1 border px-2.5 py-1 transition-colors ${
                      fnbCustomMode ? 'bg-gold/20 border-gold text-ink' : 'border-gold/30 text-ink/50 hover:bg-linen'
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
                        onChange={e => setFnbCustomCourse(e.target.value)}
                        className="w-full border border-gold/30 rounded-none px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white h-9"
                      >
                        {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">DISH NAME *</label>
                      <Input
                        value={fnbCustomName}
                        onChange={e => setFnbCustomName(e.target.value)}
                        placeholder="e.g. Beef Wellington"
                        className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm h-9"
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
                    <Button
                      onClick={() => setFnbCustomMode(false)}
                      variant="outline"
                      className="rounded-none border-gold/30 font-bebas tracking-widest text-xs h-9 px-3"
                    >
                      CANCEL
                    </Button>
                    <Button
                      onClick={addFnbItem}
                      className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-none px-4 py-2 flex items-center gap-1.5 h-9"
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
                <div className="grid gap-2 px-5 py-2.5 text-xs font-bebas tracking-widest text-white bg-gold grid-cols-[90px_1fr_60px_80px_90px_1fr_1fr_32px]">
                  <div>COURSE</div>
                  <div>DISH</div>
                  <div>QTY</div>
                  <div>TIME</div>
                  <div>DIETARY</div>
                  <div>STAFF</div>
                  <div>PREP / PLATING</div>
                  <div className="no-print"></div>
                </div>
                {/* Group by course */}
                {COURSES.filter(course =>
                  fnbItems.some(i => (i.course ?? 'Other') === course)
                ).map(course => (
                  <div key={course}>
                    <div className="px-5 py-1.5 font-bebas tracking-widest text-xs border-b border-gold/30 bg-gold/10 text-[#a07820]">
                      {course}
                    </div>
                    {fnbItems
                      .map((item, originalIdx) => ({ item, originalIdx }))
                      .filter(({ item }) => (item.course ?? 'Other') === course)
                      .map(({ item, originalIdx }) => (
                        <div
                          key={item._tempId ?? originalIdx}
                          className="grid gap-2 px-5 py-2.5 items-center border-b border-gold/30 text-sm font-dm hover:bg-linen/50 group grid-cols-[90px_1fr_60px_80px_90px_1fr_1fr_32px]"
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
                          <div className="space-y-0.5">
                            <input
                              value={item.prepNotes ?? ''}
                              onChange={e => updateFnbItem(originalIdx, 'prepNotes', e.target.value)}
                              placeholder="Prep..."
                              className="w-full font-dm text-xs text-ink/70 bg-transparent border-0 focus:outline-none"
                            />
                            <input
                              value={item.platingNotes ?? ''}
                              onChange={e => updateFnbItem(originalIdx, 'platingNotes', e.target.value)}
                              placeholder="Plating..."
                              className="w-full font-dm text-xs text-ink/50 bg-transparent border-0 focus:outline-none"
                            />
                          </div>
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

            {/* Dietary summary */}
            {dietaries.length > 0 && (
              <div className="px-5 py-4 border-t border-gold/30 bg-green-50/50">
                <div className="font-bebas tracking-widest text-xs text-forest mb-2">DIETARY SUMMARY</div>
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

        {/* ── TABLE PLAN TAB ──────────────────────────────────────────────── */}
        {activeMainTab === 'tableplan' && (
          <div className="bg-white border border-gold/30 border-t-0 shadow-sm print:shadow-none">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gold/30">
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
            <div className="px-5 py-4 border-b border-gold/30">
              <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-2">LINK A FLOOR PLAN</label>
              <select
                value={linkedFloorPlanId ?? ""}
                onChange={e => setLinkedFloorPlanId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full border border-gold/30 rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
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
                  <div className="flex items-center justify-between px-4 py-2 bg-linen border-b border-gold/30 shrink-0">
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

        {/* ── Floor Plan Link section ──────────────────────────────────── */}
        <div className="bg-white border border-gold/30 shadow-sm mt-4 no-print">
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
                  className="w-full border border-gold/30 rounded-none px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
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
          <div className="bg-white border border-gold/30 shadow-sm mt-4 no-print">
            <button
              onClick={() => setStaffLinksSectionOpen(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-linen transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-forest" />
                <span className="font-bebas tracking-widest text-sm text-forest">STAFF PORTAL LINKS</span>
                {staffLinks && staffLinks.length > 0 && (
                  <span className="text-xs text-forest/50 font-dm">({staffLinks.length} link{staffLinks.length !== 1 ? 's' : ''})</span>
                )}
              </div>
              {staffLinksSectionOpen ? <ChevronUp className="w-4 h-4 text-ink/30" /> : <ChevronDown className="w-4 h-4 text-ink/30" />}
            </button>
            {staffLinksSectionOpen && (
              <div className="px-5 pb-5 pt-2 space-y-4">
                <p className="text-xs font-dm text-ink/50">Generate a read-only link for staff to view the runsheet without logging in.</p>
                {/* Existing links */}
                {(staffLinks ?? []).length > 0 && (
                  <div className="space-y-2">
                    {(staffLinks ?? []).map((link: any) => {
                      const url = `${window.location.origin}/staff/${link.token}`;
                      return (
                        <div key={link.id} className="flex items-center gap-2 bg-linen border border-gold/30 px-3 py-2">
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
                      className="border-gold/30 rounded-none font-dm text-sm h-9"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => createStaffLinkMutation.mutate({ runsheetId: sheetId!, label: newStaffLinkLabel })}
                        disabled={createStaffLinkMutation.isPending}
                        className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-xs rounded-none px-4 h-8 flex items-center gap-1.5"
                      >
                        <Share2 className="w-3 h-3" /> {createStaffLinkMutation.isPending ? 'CREATING...' : 'CREATE LINK'}
                      </Button>
                      <Button
                        onClick={() => setCreatingStaffLink(false)}
                        variant="outline"
                        className="font-bebas tracking-widest text-xs rounded-none px-4 h-8"
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

        {/* Print footer */}
        <div className="hidden print:block mt-8 pt-4 border-t border-ink/20 text-xs text-ink/40 font-dm text-center">
          Prepared by HOSTit — {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

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
                    <Textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      placeholder={`Paste anything — an email, booking notes, a client brief, a Word doc...\n\nExamples of what gets extracted:\n• Event details (date, guests, contact info, space name)\n• Dietary requirements (e.g. "5 vegetarian, 2 gluten free")\n• Menu / F&B items (courses, dishes, quantities)\n• Event timeline (6pm – Guests arrive, 7pm – Dinner service...)`}
                      rows={12}
                      className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest font-dm text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => parseRunsheetMutation.mutate({ text: pasteText, eventType: eventType || undefined })}
                      disabled={!pasteText.trim() || parseRunsheetMutation.isPending}
                      className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-sm rounded-none px-6 py-2.5 flex items-center gap-2"
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
                          <div key={i} className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-dm">
                            <span className="font-semibold text-emerald-800">{d.name}</span>
                            <span className="text-emerald-600 ml-1">×{d.count}</span>
                            {d.notes && <span className="text-emerald-500 ml-1">({d.notes})</span>}
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
                              <input type="number" value={item.duration ?? 30} onChange={e => setEditedParsedTimeline(prev => prev.map((p, j) => j === i ? { ...p, duration: parseInt(e.target.value) || 30 } : p))}
                                className="w-full text-xs text-ink/60 bg-transparent border border-transparent hover:border-gold/40 focus:border-forest focus:outline-none px-1 py-0.5" min={1} />
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
                  <Button onClick={applyParsedData} className="bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-sm rounded-none px-6 py-2 flex items-center gap-2">
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
                  className="flex-1 rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newDietaryOption.trim()) {
                      setEditingDietaries(prev => [...prev, newDietaryOption.trim()]);
                      setNewDietaryOption('');
                    }
                  }}
                />
                <Button
                  onClick={() => { if (newDietaryOption.trim()) { setEditingDietaries(prev => [...prev, newDietaryOption.trim()]); setNewDietaryOption(''); } }}
                  className="bg-forest hover:bg-forest/90 text-white rounded-none font-bebas tracking-widest text-xs px-3 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD
                </Button>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gold/30">
              <Button variant="outline" onClick={() => setShowDietaryManager(false)} className="flex-1 rounded-none border-gold/30 font-bebas tracking-widest text-xs">CANCEL</Button>
              <Button onClick={saveDietaryOptions} disabled={updateVenueMutation.isPending} className="flex-1 bg-forest hover:bg-forest/90 text-white rounded-none font-bebas tracking-widest text-xs">
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
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm"
                />
                <Textarea
                  value={newSetupValue}
                  onChange={e => setNewSetupValue(e.target.value)}
                  placeholder="Setup description..."
                  rows={2}
                  className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-forest text-sm"
                />
                <Button
                  onClick={() => {
                    if (newSetupLabel.trim() && newSetupValue.trim()) {
                      setEditingSetups(prev => [...prev, { label: newSetupLabel.trim(), value: newSetupValue.trim() }]);
                      setNewSetupLabel('');
                      setNewSetupValue('');
                    }
                  }}
                  className="w-full bg-gold hover:bg-gold/90 text-ink rounded-none font-bebas tracking-widest text-xs gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> ADD TEMPLATE
                </Button>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gold/30">
              <Button variant="outline" onClick={() => setShowSetupManager(false)} className="flex-1 rounded-none border-gold/30 font-bebas tracking-widest text-xs">CANCEL</Button>
              <Button onClick={saveSetupTemplates} disabled={updateVenueMutation.isPending} className="flex-1 bg-forest hover:bg-forest/90 text-white rounded-none font-bebas tracking-widest text-xs">
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
                                className="w-10 text-center text-xs font-dm border border-gold/30 focus:border-forest focus:outline-none py-0.5"
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
                  className="bg-forest hover:bg-forest/90 disabled:opacity-40 text-white font-bebas tracking-widest text-sm rounded-none px-6 py-2 flex items-center gap-2"
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
                    <Textarea
                      value={fnbPasteText}
                      onChange={e => setFnbPasteText(e.target.value)}
                      placeholder={`Paste menu details, catering brief, or email here...\n\nExamples:\n• “Canapés on arrival: smoked salmon blini, bruschetta (V), arancini (V, GF) — 80 guests”\n• “Sit-down dinner: entree — prawn cocktail; main — beef tenderloin or mushroom risotto (V); dessert — crème brûlée”\n• Paste a full catering proposal or email`}
                      className="min-h-[220px] border-gold/30 rounded-none font-dm text-sm resize-none focus:border-forest"
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
                            {item.dietary && <span className="font-dm text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5">{item.dietary}</span>}
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
                  className="bg-forest hover:bg-forest/90 disabled:opacity-40 text-white font-bebas tracking-widest text-sm rounded-none px-6 py-2 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {fnbParsedLoading ? 'PARSING...' : 'PARSE WITH AI'}
                </Button>
              ) : (
                <Button
                  onClick={applyFnbParsed}
                  disabled={fnbParsedItems.filter((it: any) => it._selected).length === 0}
                  className="bg-gold hover:bg-gold/90 disabled:opacity-40 text-ink font-bebas tracking-widest text-sm rounded-none px-6 py-2 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> ADD {fnbParsedItems.filter((it: any) => it._selected).length} ITEMS TO F&B SHEET
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
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
