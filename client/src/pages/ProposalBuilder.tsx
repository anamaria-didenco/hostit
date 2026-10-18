import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, ChevronLeft, Plus, Trash2, Send, FileText, Copy, CheckCircle, UtensilsCrossed, Wine, ChefHat, ChevronDown, ChevronUp, Download, Palette, Image, Eye, EyeOff, ArrowLeft, ArrowRight, Camera } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { COLOUR_THEMES } from "@/contexts/ThemeContext";
import { currency, currencyWhole } from "@/lib/money";
import { DRINKS_MENU, DRINKS_BY_KEY, drinkPriceLabel } from "@shared/drinksMenu";
import { SHARED_MENU_SECTIONS, selectedSharedMenuSections } from "@shared/proposalSharedMenu";
import { catalogueDefaultQty, catalogueLineDescription, cataloguePriceLabel } from "@shared/menuCatalogue";
import { toLocalDateInput } from "@/lib/dateTime";
import { duplicatePackageLines, isPackageLine, packageLineDescription, packageNameFromLine, withoutDuplicatePackageLines } from "@shared/proposalPackages";
import { isProposalLocked, proposalMoney } from "@shared/proposalTotals";

// Unsaved work is kept on this device until it's saved, so a reload, a closed
// tab or a Back press doesn't lose a long proposal. Storage can be blocked
// (private mode), so every access is guarded.
const draftKey = (proposalId: number, leadId: number) =>
  proposalId ? `venueflow:proposal-draft:p${proposalId}` : `venueflow:proposal-draft:lead${leadId}`;
function readLocalDraft(key: string): { savedAt: number; data: string } | null {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.data === "string" ? parsed : null;
  } catch { return null; }
}
function writeLocalDraft(key: string, data: string) {
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* storage unavailable */ }
}
function clearLocalDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export default function ProposalBuilder() {
  const { user, isAuthenticated, loading, isStaff } = useAuth();
  const [, setLocation] = useLocation();

  // ?leadId=N starts a new proposal for that enquiry; ?proposalId=N opens an
  // existing proposal for editing (its enquiry comes from the proposal).
  const query = new URLSearchParams(window.location.search);
  const editId = parseInt(query.get("proposalId") ?? "0") || 0;
  const { data: existingProposal, isLoading: existingLoading, error: existingError } = trpc.proposals.get.useQuery(
    { id: editId }, { enabled: !!editId && !!user });
  const { data: existingDrinks } = trpc.proposals.getDrinks.useQuery({ proposalId: editId }, { enabled: !!editId && !!user });
  const { data: existingQuote } = trpc.quote.get.useQuery({ proposalId: editId }, { enabled: !!editId && !!user });
  const leadId = (parseInt(query.get("leadId") ?? "0") || 0) || existingProposal?.leadId || 0;

  // A new proposal is always for an enquiry, and every "Create proposal"
  // button passes one. Opened without one (an old bookmark or a typed URL) the
  // page showed "For —" with nobody to send it to, so send them to Enquiries.
  const noEnquiry = !editId && !leadId;
  useEffect(() => {
    if (!noEnquiry || !user) return;
    toast("Open an enquiry and choose Create Proposal to start one.");
    setLocation("/dashboard?tab=enquiries", { replace: true });
  }, [noEnquiry, user]);

  const { data: lead } = trpc.leads.get.useQuery({ id: leadId }, { enabled: !!leadId && !!user });
  const { data: venueSettings } = trpc.venue.get.useQuery({ ownerId: user?.id }, { enabled: !!user });
  const { data: spaces } = trpc.spaces.list.useQuery(undefined, { enabled: !!user });

  const [title, setTitle] = useState("Event Proposal");
  const [introMessage, setIntroMessage] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [spaceName, setSpaceName] = useState("");
  // Menu packages offered as a choice (the client picks one) rather than
  // added together.
  const [menuChoice, setMenuChoice] = useState(false);
  // Live preview of the client's page beside the form; reloads after each save.
  const [showPreview, setShowPreview] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Venue Hire", qty: 1, unitPrice: 0, total: 0 },
  ]);
  const [taxPercent, setTaxPercent] = useState(15);
  const [depositPercent, setDepositPercent] = useState(25);
  const [termsAndConditions, setTermsAndConditions] = useState(
    "1. A deposit of the agreed percentage is required to secure the booking.\n2. Cancellations made less than 14 days prior to the event will forfeit the deposit.\n3. Final guest numbers must be confirmed 7 days before the event.\n4. The venue reserves the right to adjust pricing if guest numbers change significantly."
  );
  const [internalNotes, setInternalNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toLocalDateInput(d);
  });

  const [savedProposal, setSavedProposal] = useState<any>(null);
  // What the last "Send to client" actually did — the email only goes out
  // when SMTP is set up, so the UI must say which happened.
  const [sendResult, setSendResult] = useState<{ emailSent: boolean; emailedTo: string | null; emailStatus?: 'emailed' | 'not_configured' | 'no_client_email' | 'failed'; emailError?: string | null } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Appearance state ────────────────────────────────────────────────────────
  const [appearanceSectionOpen, setAppearanceSectionOpen] = useState(false);
  const [appearanceLogoUrl, setAppearanceLogoUrl] = useState("");
  const [appearanceVenuePhotoUrl, setAppearanceVenuePhotoUrl] = useState("");
  const [appearanceThemeKey, setAppearanceThemeKey] = useState("sage");

  const updateVenue = trpc.venue.update.useMutation({
    onSuccess: () => toast.success("Appearance settings saved!"),
    onError: () => toast.error("Failed to save appearance settings"),
  });

  const handleSaveAppearance = () => {
    updateVenue.mutate({
      themeKey: appearanceThemeKey,
      logoUrl: appearanceLogoUrl || undefined,
      coverImageUrl: appearanceVenuePhotoUrl || undefined,
    });
  };

  const handleDownloadPdf = async () => {
    if (!savedProposal?.publicToken) return toast.error("Save the proposal first, then download the PDF.");
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/proposal-pdf/${savedProposal.publicToken}`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(savedProposal.title ?? "proposal").replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded!");
    } catch {
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  // Menu packages
  const { data: menuPackages } = trpc.menu.listPackages.useQuery(undefined, { enabled: !!user });
  const [menuSectionOpen, setMenuSectionOpen] = useState(true);

  // ── Live food + drink catalogue (kept in sync as menus are updated) ───────
  const { data: catalogueCategories } = trpc.menuCatalog.listCategories.useQuery({ type: 'all' }, { enabled: !!user });
  const { data: catalogueFoodItems } = trpc.menuCatalog.listItems.useQuery({ type: 'food' }, { enabled: !!user });
  const { data: catalogueDrinkItems } = trpc.menuCatalog.listItems.useQuery({ type: 'drink' }, { enabled: !!user });
  const groupItemsByCategory = (items: any[] | undefined, type: 'food' | 'drink') => {
    const cats = (catalogueCategories ?? []).filter((c: any) => c.type === type);
    const byId: Record<number, any[]> = {};
    (items ?? []).forEach((it: any) => {
      if (!it.available) return;
      (byId[it.categoryId] ||= []).push(it);
    });
    return cats
      .map((c: any) => ({ category: c, items: (byId[c.id] ?? []).sort((a, b) => a.sortOrder - b.sortOrder) }))
      .filter(g => g.items.length > 0);
  };
  const groupedFoodCatalogue = groupItemsByCategory(catalogueFoodItems, 'food');
  const groupedDrinkCatalogue = groupItemsByCategory(catalogueDrinkItems, 'drink');

  // ── Food items ─────────────────────────────────────────────────────────────
  // Picked food goes straight onto the Pricing lines, so it's saved with the
  // proposal and totalled, with GST added on top (catalogue prices exclude
  // GST). It used to sit in a list here that was never saved.
  const [foodSectionOpen, setFoodSectionOpen] = useState(false);
  const [newFoodItem, setNewFoodItem] = useState({ name: "", description: "", pricePerHead: "" });
  const covers = parseInt(guestCount) || 0;
  const lineDescriptions = new Set(lineItems.map(li => li.description));
  const addPricingLine = (description: string, qty: number, unitPrice: number) =>
    setLineItems(prev => [...prev, { description, qty, unitPrice, total: qty * unitPrice }]);
  const addFoodItem = () => {
    if (!newFoodItem.name.trim()) return;
    const description = [newFoodItem.name.trim(), newFoodItem.description.trim()].filter(Boolean).join(", ");
    addPricingLine(description, covers || 1, newFoodItem.pricePerHead ? parseFloat(newFoodItem.pricePerHead) || 0 : 0);
    setNewFoodItem({ name: "", description: "", pricePerHead: "" });
  };
  const foodLinesAdded = groupedFoodCatalogue
    .flatMap(g => g.items)
    .filter((it: any) => lineDescriptions.has(catalogueLineDescription(it))).length;

  // ── Drinks selection state ─────────────────────────────────────────────────
  const [drinksSectionOpen, setDrinksSectionOpen] = useState(false);
  const [barOption, setBarOption] = useState<"bar_tab" | "cash_bar" | "bar_tab_then_cash" | "unlimited">("cash_bar");
  const [tabAmount, setTabAmount] = useState("");
  const [selectedDrinks, setSelectedDrinks] = useState<string[]>([]);
  const [customDrinks, setCustomDrinks] = useState<{ name: string; description?: string; price?: number }[]>([]);
  const [newCustomDrink, setNewCustomDrink] = useState({ name: "", description: "", price: "" });
  const [selectedSampleItems, setSelectedSampleItems] = useState<string[]>([]);

  // Ticked on the proposal from the previous menu (kept so they can be unticked).
  const previousSampleSections = selectedSharedMenuSections(selectedSampleItems).filter(sec => sec.retired);
  const previousDrinks = selectedDrinks.map(k => DRINKS_BY_KEY[k]).filter(d => d?.retired);

  const toggleSampleItem = (key: string) => {
    setSelectedSampleItems(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const BAR_OPTIONS = [
    { key: "bar_tab" as const, label: "Bar Tab", description: "Set a fixed dollar amount" },
    { key: "cash_bar" as const, label: "Cash Bar", description: "Guests pay for their own drinks" },
    { key: "bar_tab_then_cash" as const, label: "Bar Tab then Cash Bar", description: "Tab runs until set amount, then guests pay" },
    { key: "unlimited" as const, label: "Unlimited Bar Tab", description: "Unlimited drinks for the event" },
  ];

  const toggleDrink = (key: string) => {
    setSelectedDrinks(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };
  const addCustomDrink = () => {
    if (!newCustomDrink.name.trim()) return;
    setCustomDrinks(prev => [...prev, {
      name: newCustomDrink.name.trim(),
      description: newCustomDrink.description.trim() || undefined,
      price: newCustomDrink.price ? parseFloat(newCustomDrink.price) : undefined,
    }]);
    setNewCustomDrink({ name: "", description: "", price: "" });
  };
  const removeCustomDrink = (i: number) => setCustomDrinks(prev => prev.filter((_, idx) => idx !== i));

  const saveDrinks = trpc.proposals.saveDrinks.useMutation();
  const drinksPayload = () => ({
    barOption,
    tabAmount: tabAmount ? parseFloat(tabAmount) : undefined,
    selectedDrinks: [...selectedDrinks],
    customDrinks,
    selectedSampleItems: [...selectedSampleItems],
  });
  const handleSaveDrinks = () => {
    if (!savedProposal) return toast.error("Save the proposal first, then save drinks.");
    const drinksAtSave = drinksSnapshot;
    saveDrinks.mutate({ proposalId: savedProposal.id, ...drinksPayload() }, {
      onSuccess: () => { setDrinksBaseline(drinksAtSave); toast.success("Drinks selection saved!"); },
      onError: (e) => toast.error(e.message || "Failed to save drinks selection"),
    });
  };

  // ── Quote / Min-Spend state ───────────────────────────────────────────────
  const [quoteSectionOpen, setQuoteSectionOpen] = useState(false);
  const [minimumSpend, setMinimumSpend] = useState("");
  const [foodTotalOverride, setFoodTotalOverride] = useState("");
  const [autoBarTab, setAutoBarTab] = useState(true);
  const [quoteNotes, setQuoteNotes] = useState("");
  const [hireItems, setHireItems] = useState<{ name: string; description: string; qty: number; unitPrice: number }[]>([]);

  const addHireItem = () => setHireItems(prev => [...prev, { name: "", description: "", qty: 1, unitPrice: 0 }]);
  const updateHireItem = (i: number, field: string, value: string | number) =>
    setHireItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  const removeHireItem = (i: number) => setHireItems(prev => prev.filter((_, idx) => idx !== i));

  // Quote (pricing / min-spend) now saves together with the proposal — see handleSave.
  const saveQuote = trpc.quote.save.useMutation();

  // Derived: auto bar tab amount (computed after subtotal is declared below)
  const _lineSubtotal = () => lineItems.reduce((sum, item) => sum + item.total, 0);
  const _foodBase = () => foodTotalOverride ? parseFloat(foodTotalOverride) : _lineSubtotal();
  const _minSpendNum = () => minimumSpend ? parseFloat(minimumSpend) : 0;
  const autoBarTabAmount = autoBarTab && _minSpendNum() > _foodBase() ? _minSpendNum() - _foodBase() : 0;

  // A package is picked when its pricing line is on the proposal. Picking adds
  // the line straight away (so the total updates as you pick) and unpicking
  // removes it. Saving used to append picked packages to lines that already
  // held them, so a package could be charged twice.
  const selectedMenuPackageIds = (menuPackages ?? [])
    .filter(p => lineDescriptions.has(packageLineDescription(p)))
    .map(p => p.id);
  const toggleMenuPackage = (id: number) => {
    const pkg = (menuPackages ?? []).find(p => p.id === id);
    if (!pkg) return;
    const description = packageLineDescription(pkg);
    if (lineDescriptions.has(description)) {
      setLineItems(prev => prev.filter(li => li.description !== description));
    } else {
      // A second menu of the same kind is almost always an alternative
      // ("Shared Franco or Tutto Franco"), so offer them as a choice.
      const sameKind = (menuPackages ?? []).some(p => p.id !== pkg.id && p.type === pkg.type && lineDescriptions.has(packageLineDescription(p)));
      if (sameKind && !menuChoice) {
        setMenuChoice(true);
        toast.info("Menus offered as options — each gets its own price, and the client picks one.");
      }
      addPricingLine(description, covers || 1, pkg.pricePerHead ? Number(pkg.pricePerHead) : 0);
    }
  };
  // Retired packages stay on file for past events but aren't offered.
  const offeredPackages = (menuPackages ?? []).filter(p => p.isActive || selectedMenuPackageIds.includes(p.id));
  // Proposals saved before the fix can hold a package twice.
  const doubledPackages = duplicatePackageLines(lineItems);
  // Packages are priced per head: keep their quantity on the guest count, as
  // the old save step did.
  useEffect(() => {
    if (!covers) return;
    setLineItems(prev => prev.some(li => isPackageLine(li.description) && li.qty !== covers)
      ? prev.map(li => isPackageLine(li.description) ? { ...li, qty: covers, total: covers * Number(li.unitPrice) } : li)
      : prev);
  }, [covers]);
  const PACKAGE_GROUPS = [
    { type: 'food', label: 'FOOD PACKAGES', icon: UtensilsCrossed, text: 'text-primary', on: 'border-primary bg-primary/5', hover: 'hover:border-primary/40' },
    { type: 'beverages', label: 'BEVERAGES PACKAGES', icon: Wine, text: 'text-sage-green', on: 'border-sage-green bg-sage-tint/50', hover: 'hover:border-sage-green/40' },
    { type: 'food_and_beverages', label: 'FOOD & BEVERAGES PACKAGES', icon: ChefHat, text: 'text-forest', on: 'border-forest bg-blue-50', hover: 'hover:border-forest/40' },
  ] as const;

  // New proposal: start from the enquiry. (The client's budget is NOT a
  // price — it used to be dropped straight into Venue Hire.)
  useEffect(() => {
    if (lead && !editId) {
      setTitle(`${lead.eventType || "Event"} Proposal — ${lead.firstName} ${lead.lastName ?? ""}`);
      if (lead.eventDate) setEventDate(toLocalDateInput(lead.eventDate));
      if (lead.guestCount) setGuestCount(String(lead.guestCount));
      markSynced();
    }
  }, [lead]);

  // Editing: load the saved proposal (and its drinks + quote) once.
  const loadedExisting = useRef(false);
  useEffect(() => {
    if (!existingProposal || loadedExisting.current) return;
    loadedExisting.current = true;
    const p = existingProposal;
    setSavedProposal(p);
    setTitle(p.title);
    setIntroMessage(p.introMessage ?? "");
    setEventDate(p.eventDate ? toLocalDateInput(p.eventDate) : "");
    setGuestCount(p.guestCount ? String(p.guestCount) : "");
    setSpaceName(p.spaceName ?? "");
    try {
      const items = JSON.parse(p.lineItems ?? "[]");
      if (Array.isArray(items)) setLineItems(items);
    } catch { /* keep the defaults */ }
    if (p.taxPercent != null) setTaxPercent(Number(p.taxPercent));
    if (p.depositPercent != null) setDepositPercent(Number(p.depositPercent));
    setTermsAndConditions(p.termsAndConditions ?? "");
    setInternalNotes(p.internalNotes ?? "");
    setExpiresAt(p.expiresAt ? toLocalDateInput(p.expiresAt) : "");
    setMenuChoice(!!p.menuChoice);
    // Read-only: open the drinks so what the client saw can still be read.
    if (isProposalLocked(p.status)) setDrinksSectionOpen(true);
    markSynced();
  }, [existingProposal]);
  const loadedDrinks = useRef(false);
  useEffect(() => {
    if (!existingDrinks || loadedDrinks.current) return;
    loadedDrinks.current = true;
    setBarOption(existingDrinks.barOption);
    setTabAmount(existingDrinks.tabAmount ? String(Number(existingDrinks.tabAmount)) : "");
    setSelectedDrinks((existingDrinks.selectedDrinks as string[] | null) ?? []);
    setCustomDrinks((existingDrinks.customDrinks as any[] | null) ?? []);
    setSelectedSampleItems((existingDrinks.selectedSampleItems as string[] | null) ?? []);
    markSynced();
  }, [existingDrinks]);
  const loadedQuote = useRef(false);
  useEffect(() => {
    if (!existingQuote || loadedQuote.current) return;
    loadedQuote.current = true;
    const qs = existingQuote.settings;
    if (qs) {
      setMinimumSpend(qs.minimumSpend ? String(Number(qs.minimumSpend)) : "");
      setFoodTotalOverride(qs.foodTotal ? String(Number(qs.foodTotal)) : "");
      setAutoBarTab(qs.autoBarTab ?? true);
      setQuoteNotes(qs.notes ?? "");
    }
    setHireItems(existingQuote.items.map((it: any) => ({ name: it.name ?? "", description: it.description ?? "", qty: Number(it.qty ?? 1), unitPrice: Number(it.unitPrice ?? 0) })));
    markSynced();
  }, [existingQuote]);

  useEffect(() => {
    if (venueSettings?.depositPercent && !editId) { setDepositPercent(Number(venueSettings.depositPercent)); markSynced(); }
    if (venueSettings?.themeKey) setAppearanceThemeKey(venueSettings.themeKey);
    if (venueSettings?.logoUrl) setAppearanceLogoUrl(venueSettings.logoUrl);
    if (venueSettings?.coverImageUrl) setAppearanceVenuePhotoUrl(venueSettings.coverImageUrl);
  }, [venueSettings]);

  // Default the space to the one on the enquiry (or the venue's only space) —
  // never just the first in the list, which quietly booked the wrong room.
  useEffect(() => {
    if (editId || spaceName || !spaces || spaces.length === 0) return;
    if (leadId && !lead) return; // wait for the enquiry
    const fromLead = lead?.spaceId ? spaces.find(s => s.id === lead.spaceId)
      : lead?.spaceName ? spaces.find(s => s.name === lead.spaceName) : undefined;
    if (fromLead) setSpaceName(fromLead.name);
    else if (spaces.length === 1) setSpaceName(spaces[0].name);
    markSynced();
  }, [spaces, lead]);

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = (subtotal * taxPercent) / 100;
  const total = subtotal + taxAmount;
  const deposit = (total * depositPercent) / 100;
  // With a choice of menus, each is priced on its own (see proposalMoney).
  const menuOptions = proposalMoney(lineItems, taxPercent, depositPercent, menuChoice).options;

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === "qty" || field === "unitPrice") {
        item.total = Number(item.qty) * Number(item.unitPrice);
      }
      updated[index] = item;
      return updated;
    });
  };

  const utils = trpc.useUtils();
  const createProposal = trpc.proposals.create.useMutation({
    onSuccess: (data) => { setSavedProposal(data); },
  });
  const updateProposal = trpc.proposals.update.useMutation();
  const saving = createProposal.isPending || updateProposal.isPending || saveQuote.isPending || saveDrinks.isPending;
  const status: string | undefined = savedProposal?.status;
  // Accepted / declined proposals are the client's answer — they can't be
  // re-sent or changed (the server refuses too), so the page is read-only.
  const locked = isProposalLocked(status);
  const canSend = !!savedProposal && !locked;

  // ── Unsaved changes ─────────────────────────────────────────────────────────
  // "Saved" = what was last loaded or saved. Loading and filling in from the
  // enquiry call markSynced(), which takes the next render's values as saved.
  const formState = { title, introMessage, eventDate, guestCount, spaceName, lineItems, taxPercent, depositPercent, termsAndConditions, internalNotes, expiresAt, minimumSpend, foodTotalOverride, autoBarTab, quoteNotes, hireItems, menuChoice };
  const drinksState = { barOption, tabAmount, selectedDrinks, customDrinks, selectedSampleItems };
  const formSnapshot = JSON.stringify(formState);
  const drinksSnapshot = JSON.stringify(drinksState);
  const [formBaseline, setFormBaseline] = useState<string | null>(null);
  const [drinksBaseline, setDrinksBaseline] = useState<string | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const markSynced = () => setSyncTick(t => t + 1);
  useEffect(() => { markSynced(); }, []);
  useEffect(() => {
    if (!syncTick) return;
    setFormBaseline(formSnapshot);
    setDrinksBaseline(drinksSnapshot);
  }, [syncTick]);
  const dirty = !locked && formBaseline !== null && (formSnapshot !== formBaseline || drinksSnapshot !== drinksBaseline);
  // The values an autosave failed on — not retried until something changes.
  const [autosaveFailedOn, setAutosaveFailedOn] = useState<string | null>(null);

  // Drafts save themselves. Sent proposals don't: the client's page shows
  // saved changes straight away, so half-done edits wait for "Save Changes".
  const canAutosave = !!savedProposal && status === "draft";

  // A copy on this device until saved — keyed by the proposal, or by the
  // enquiry before the proposal's first save.
  const localKey = savedProposal ? draftKey(savedProposal.id, 0) : (!editId && leadId ? draftKey(0, leadId) : null);
  const localDraftData = JSON.stringify({ form: formState, drinks: drinksState });
  const [pendingDraft, setPendingDraft] = useState<{ savedAt: number; data: string } | null>(null);
  const draftCheckedFor = useRef<string | null>(null);
  useEffect(() => {
    // (A new proposal waits for the enquiry, which fills in the title etc.)
    if (!localKey || locked || formBaseline === null || (!savedProposal && !lead) || draftCheckedFor.current === localKey) return;
    draftCheckedFor.current = localKey;
    const found = readLocalDraft(localKey);
    if (!found) return;
    if (found.data === localDraftData) clearLocalDraft(localKey);
    else setPendingDraft(found);
  }, [localKey, locked, formBaseline, lead]);
  useEffect(() => {
    if (!localKey || !dirty || pendingDraft) return;
    const t = setTimeout(() => writeLocalDraft(localKey, localDraftData), 500);
    return () => clearTimeout(t);
  }, [localKey, localDraftData, dirty, pendingDraft]);
  // Leaving inside the app (Back, Dashboard) doesn't fire beforeunload, so
  // keep the latest unsaved copy when the page closes.
  const latestDraft = useRef({ key: localKey, data: localDraftData, keep: false });
  latestDraft.current = { key: localKey, data: localDraftData, keep: dirty && !pendingDraft };
  useEffect(() => () => {
    const d = latestDraft.current;
    if (d.key && d.keep) writeLocalDraft(d.key, d.data);
  }, []);
  // Reloading or closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const d = latestDraft.current;
      if (d.key && d.keep) writeLocalDraft(d.key, d.data);
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    try {
      const { form: f, drinks: d } = JSON.parse(pendingDraft.data);
      setTitle(f.title ?? ""); setIntroMessage(f.introMessage ?? ""); setEventDate(f.eventDate ?? "");
      setGuestCount(f.guestCount ?? ""); setSpaceName(f.spaceName ?? "");
      if (Array.isArray(f.lineItems)) setLineItems(f.lineItems);
      setTaxPercent(Number(f.taxPercent ?? 15)); setDepositPercent(Number(f.depositPercent ?? 25));
      setTermsAndConditions(f.termsAndConditions ?? ""); setInternalNotes(f.internalNotes ?? ""); setExpiresAt(f.expiresAt ?? ""); setMenuChoice(!!f.menuChoice);
      setMinimumSpend(f.minimumSpend ?? ""); setFoodTotalOverride(f.foodTotalOverride ?? ""); setAutoBarTab(f.autoBarTab ?? true);
      setQuoteNotes(f.quoteNotes ?? ""); if (Array.isArray(f.hireItems)) setHireItems(f.hireItems);
      if (d) {
        setBarOption(d.barOption ?? "cash_bar"); setTabAmount(d.tabAmount ?? "");
        setSelectedDrinks(Array.isArray(d.selectedDrinks) ? d.selectedDrinks : []);
        setCustomDrinks(Array.isArray(d.customDrinks) ? d.customDrinks : []);
        setSelectedSampleItems(Array.isArray(d.selectedSampleItems) ? d.selectedSampleItems : []);
      }
      toast.success(canAutosave ? "Unsaved changes restored" : "Unsaved changes restored — save to keep them");
    } catch {
      toast.error("Couldn't restore those changes");
    }
    setPendingDraft(null);
  };
  const discardDraft = () => {
    if (localKey) clearLocalDraft(localKey);
    setPendingDraft(null);
  };

  const sendProposal = trpc.proposals.send.useMutation({
    onSuccess: (data) => {
      setSendResult({ emailSent: data.emailSent, emailedTo: data.emailedTo ?? null, emailStatus: (data as any).emailStatus, emailError: (data as any).emailError ?? null });
      setSavedProposal((p: any) => p ? { ...p, status: "sent", sentAt: new Date(), emailedAt: data.emailSent ? new Date() : p?.emailedAt ?? null } : p);
      if (leadId) utils.proposals.byLead.invalidate({ leadId });
      // Be honest about delivery: only a real email gets the success toast; the
      // other outcomes are warnings telling the owner to share the link.
      if (data.emailSent && data.emailedTo) {
        toast.success(`Proposal emailed to ${data.emailedTo}`);
      } else if ((data as any).emailStatus === 'no_client_email') {
        toast.warning("Proposal saved, but this enquiry has no email address — copy the link to send it.");
      } else if ((data as any).emailStatus === 'failed') {
        toast.warning("Proposal saved, but the email couldn't be sent — copy the link to send it.");
      } else {
        toast.warning("Proposal saved, but email isn't set up — copy the link to send it.");
      }
    },
    onError: (e) => toast.error(e.message || "Couldn't send the proposal"),
  });

  /** Save the proposal (create the first time, update after). Returns the saved row, or null. */
  const handleSave = async (opts: { quiet?: boolean; auto?: boolean } = {}): Promise<any | null> => {
    if (!leadId) { toast.error("No enquiry selected"); return null; }
    if (locked) return null;
    const formAtSave = formSnapshot;
    const drinksAtSave = drinksSnapshot;
    const keyAtSave = localKey;
    // Picked packages are already pricing lines (see toggleMenuPackage).
    const allLineItems = lineItems;
    const allSubtotal = allLineItems.reduce((s, i) => s + i.total, 0);
    const allTax = (allSubtotal * taxPercent) / 100;
    const allTotal = allSubtotal + allTax;
    const allDeposit = (allTotal * depositPercent) / 100;
    try {
      // One save = proposal + its quote (pricing / min-spend), now a single document.
      const fields = {
        title,
        introMessage: introMessage || undefined,
        eventDate: eventDate || undefined,
        guestCount: guestCount ? parseInt(guestCount) : undefined,
        spaceName: spaceName || undefined,
        lineItems: allLineItems,
        subtotalNzd: allSubtotal,
        taxPercent,
        taxNzd: allTax,
        totalNzd: allTotal,
        depositPercent,
        depositNzd: allDeposit,
        termsAndConditions,
        internalNotes: internalNotes || undefined,
        menuChoice,
      };
      let proposal: any;
      if (savedProposal) {
        await updateProposal.mutateAsync({ id: savedProposal.id, ...fields, internalNotes, expiresAt });
        proposal = await utils.proposals.get.fetch({ id: savedProposal.id });
      } else {
        proposal = await createProposal.mutateAsync({ leadId, ...fields, expiresAt: expiresAt || undefined });
        // A reload should reopen this proposal, not start another one.
        if (proposal) window.history.replaceState(null, "", `/proposals/new?proposalId=${proposal.id}`);
      }
      if (!proposal) {
        toast.error("Failed to save proposal");
        return null;
      }
      setSavedProposal(proposal);
      setPreviewNonce(n => n + 1);
      if (leadId) utils.proposals.byLead.invalidate({ leadId });
      await saveQuote.mutateAsync({
        proposalId: proposal.id,
        minimumSpend: minimumSpend ? parseFloat(minimumSpend) : undefined,
        foodTotal: foodTotalOverride ? parseFloat(foodTotalOverride) : undefined,
        autoBarTab,
        notes: quoteNotes,
        items: hireItems.map((item, i) => ({ type: 'hire', name: item.name, description: item.description, qty: item.qty, unitPrice: item.unitPrice, sortOrder: i })),
      });
      // Drinks save with everything else once they've been changed.
      if (drinksAtSave !== drinksBaseline) await saveDrinks.mutateAsync({ proposalId: proposal.id, ...drinksPayload() });
      setFormBaseline(formAtSave);
      setDrinksBaseline(drinksAtSave);
      setAutosaveFailedOn(null);
      if (keyAtSave) clearLocalDraft(keyAtSave);
      if (!opts.quiet) toast.success(savedProposal ? "Changes saved" : "Proposal saved");
      return proposal;
    } catch (e: any) {
      if (opts.auto) setAutosaveFailedOn(formAtSave + drinksAtSave);
      else toast.error(e?.message || "Failed to save proposal");
      return null;
    }
  };

  // Autosave a draft ~1.5s after the last change.
  useEffect(() => {
    if (!dirty || !canAutosave || saving || autosaveFailedOn === formSnapshot + drinksSnapshot) return;
    const t = setTimeout(() => { void handleSave({ quiet: true, auto: true }); }, 1500);
    return () => clearTimeout(t);
  }, [formSnapshot, drinksSnapshot, dirty, canAutosave, saving, autosaveFailedOn]);

  // Short enough for the phone header; the hint says what to do.
  const saveState: { label: string; hint: string; cls: string } | null =
    locked ? { label: "Read-only", hint: "The client has answered this proposal, so it can't be changed.", cls: "text-gray-500" }
    : saving ? { label: "Saving…", hint: "Saving your changes.", cls: "text-gray-500" }
    : dirty && autosaveFailedOn === formSnapshot + drinksSnapshot ? { label: "Couldn't save", hint: "Check your connection, then press Save Changes. Your changes are kept on this device.", cls: "text-red-700" }
    : dirty ? { label: savedProposal ? "Unsaved changes" : "Not saved yet", hint: canAutosave ? "Saving shortly." : savedProposal ? "Press Save Changes to update the client's page." : "Press Save Draft to save this proposal.", cls: "text-amber-700" }
    : savedProposal ? { label: "All saved", hint: "Every change is saved.", cls: "text-sage-dark" }
    : null;

  // Sending always saves first, so the client never gets a stale version.
  const handleSend = async () => {
    if (!savedProposal) return toast.error("Save the proposal first");
    if (!spaceName) return toast.error("Choose an event space first — the client can't accept a proposal without one.");
    if (expiresAt && expiresAt < toLocalDateInput(new Date())) return toast.error("The expiry date has passed. Pick a new one before sending.");
    const saved = await handleSave({ quiet: true });
    if (saved) sendProposal.mutate({ id: saved.id });
  };

  const proposalUrl = savedProposal?.publicToken
    ? `${window.location.origin}/proposal/${savedProposal.publicToken}`
    : null;

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="font-alfa text-3xl text-primary/20 animate-pulse">LOADING...</div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="font-dm text-muted-foreground mb-4">Please sign in to create proposals.</p>
        <a href={getLoginUrl()}><Button className="bg-primary text-white font-bebas tracking-widest rounded-none">SIGN IN</Button></a>
      </div>
    </div>
  );

  if (noEnquiry) return null; // on the way to Enquiries (see above)

  return (
    <div className="min-h-screen bg-parchment font-dm">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 min-h-14 flex items-center gap-y-1 px-4 sm:px-6 sticky top-0 z-40 shadow-sm overflow-x-auto">
        <Button asChild variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 font-inter text-xs gap-1 mr-4 min-h-[44px]">
          <Link href="/dashboard">
            <ChevronLeft className="w-4 h-4" aria-hidden /> Dashboard
          </Link>
        </Button>
        {/* At phone widths the brand + page title wrapped into each other
            and pushed "Save Draft" off-screen; keep them on one line and drop
            the brand mark where there's no room for both. */}
        <div className="hidden sm:flex items-center mr-3">
          <span className="font-bold text-gray-900 text-base tracking-tight">VenueFlowHQ</span>
        </div>
        <h1 className="font-inter text-sm font-medium text-gray-700 whitespace-nowrap m-0 sr-only sm:not-sr-only">{locked ? "View Proposal" : savedProposal ? "Edit Proposal" : "Proposal Builder"}</h1>
        <div className="ml-auto flex items-center gap-2">
          {saveState && (
            <span role="status" title={saveState.hint} className={`font-inter text-[11px] whitespace-nowrap ${saveState.cls}`}>
              {saveState.label}<span className="sr-only">. {saveState.hint}</span>
            </span>
          )}
          {savedProposal?.publicToken && (
            <Button onClick={() => setShowPreview(v => !v)} variant="ghost" size="sm" aria-pressed={showPreview}
              className="hidden lg:inline-flex text-gray-500 hover:text-gray-800 font-inter text-xs gap-1">
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showPreview ? "Hide preview" : "Live preview"}
            </Button>
          )}
          {savedProposal?.publicToken && (
            <Button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-800 font-inter text-xs gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              {pdfLoading ? "PDF..." : "PDF"}
            </Button>
          )}
          {!locked && (
            <Button onClick={() => handleSave()} disabled={saving || (!!editId && !savedProposal)}
              variant="outline" className="border-sage-green text-sage-dark hover:bg-sage-green/10 font-inter rounded-lg text-xs bg-transparent">
              {saving ? "Saving..." : savedProposal ? "Save Changes" : "Save Draft"}
            </Button>
          )}
          {canSend && (
            <Button onClick={handleSend} disabled={sendProposal.isPending || saving}
              className="hidden sm:inline-flex bg-sage-green hover:bg-sage-dark text-white font-inter rounded-lg text-xs gap-1">
              <Send className="w-3 h-3" /> {sendProposal.isPending ? "Sending..." : status === "draft" ? "Send to Client" : "Resend"}
            </Button>
          )}
        </div>
      </header>

      <main className={showPreview && savedProposal?.publicToken
        ? "max-w-[1600px] mx-auto p-6 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6"
        : "max-w-5xl mx-auto p-6 grid lg:grid-cols-3 gap-6"}>
        {/* Left: Form (read-only once the client has answered) */}
        <fieldset disabled={locked} className={`${showPreview && savedProposal?.publicToken ? "" : "lg:col-span-2"} space-y-5 min-w-0`}>
          {pendingDraft && (
            <div role="alert" className="bg-amber-50 border-2 border-amber-200 p-4 font-dm text-sm text-amber-900">
              <p className="m-0">
                You have changes from {new Date(pendingDraft.savedAt).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })} that weren't saved. Restore them?
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={restoreDraft} className="bg-sage-green hover:bg-sage-dark text-white font-inter rounded-lg text-xs">Restore changes</Button>
                <Button size="sm" variant="outline" onClick={discardDraft} className="font-inter rounded-lg text-xs bg-transparent">Discard</Button>
              </div>
            </div>
          )}
          {/* Editing an existing proposal */}
          {!!editId && existingLoading && (
            <div className="bg-cream-card border border-border p-4 font-dm text-sm text-muted-foreground">Loading proposal…</div>
          )}
          {!!editId && !existingLoading && !existingProposal && (
            <div role="alert" className="bg-red-50 border-2 border-red-200 p-4 font-dm text-sm text-red-800">
              {existingError?.message || "We couldn't find that proposal."} <Link href="/dashboard" className="underline underline-offset-2">Back to the dashboard</Link>
            </div>
          )}
          {savedProposal && <ProposalStatusPanel proposal={savedProposal} />}

          {/* Lead Info Banner */}
          {lead && (
            <ClientContactCard lead={lead as any} leadId={leadId}
              heading={locked ? "PROPOSAL FOR" : savedProposal ? "EDITING PROPOSAL FOR" : "CREATING PROPOSAL FOR"}
              canEdit={!isStaff && !locked} onSaved={() => setPreviewNonce(n => n + 1)} />
          )}

          {/* Proposal Title & Intro */}
          <div className="bg-cream-card border border-border p-5 shadow-sm">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-4">PROPOSAL DETAILS</h2>
            <div className="space-y-3">
              <div>
                <label htmlFor="pb-title" className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PROPOSAL TITLE</label>
                <Input id="pb-title" value={title} onChange={e => setTitle(e.target.value)}
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary font-dm" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">INTRO MESSAGE TO CLIENT</label>
                <Textarea aria-label="Intro message shown to the client" value={introMessage} onChange={e => setIntroMessage(e.target.value)}
                  placeholder="Thank you for your enquiry! We'd love to host your event at our venue. Please find our proposal below..."
                  rows={3} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary resize-none text-sm" />
              </div>
            </div>
          </div>

          {/* Photos */}
          {savedProposal?.id ? (
            <ProposalPhotosCard proposalId={savedProposal.id} token={savedProposal.publicToken} locked={locked} onChanged={() => setPreviewNonce(n => n + 1)} />
          ) : (
            <div className="bg-cream-card border border-dashed border-border p-4 font-dm text-xs text-muted-foreground flex items-center gap-2">
              <Camera className="w-4 h-4" aria-hidden /> Save the draft to add photos of the space, table settings or food.
            </div>
          )}

          {/* Event Details */}
          <div className="bg-cream-card border border-border p-4 md:p-5 shadow-sm">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-4">EVENT DETAILS</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pb-event-date" className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EVENT DATE</label>
                <Input id="pb-event-date" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">GUEST COUNT</label>
                <Input type="number" aria-label="Guest count" value={guestCount} onChange={e => setGuestCount(e.target.value)}
                  placeholder="50" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary" />
              </div>
              <div className="sm:col-span-2">
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EVENT SPACE</label>
                {spaces && spaces.length > 0 ? (
                  <Select value={spaceName} onValueChange={setSpaceName} disabled={locked}>
                    <SelectTrigger aria-label="Event space" className="rounded-none border-2 focus:ring-0 focus:border-primary h-10">
                      <SelectValue placeholder="Select a space…" />
                    </SelectTrigger>
                    <SelectContent>
                      {spaces.map(s => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="border border-dashed border-border bg-muted/30 px-3 py-2 text-xs font-dm text-muted-foreground">
                    No spaces saved yet — add them in <a href="/dashboard?tab=settings&sub=venue" className="text-primary underline underline-offset-2">Settings → Venue → Spaces</a>.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Menu Packages */}
          <div className="bg-cream-card border border-border shadow-sm">
            <button
              type="button"
              aria-expanded={menuSectionOpen}
              onClick={() => setMenuSectionOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 hover:bg-sage-tint/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-sage-green" />
                <h2 className="font-bebas text-xs tracking-widest text-muted-foreground">MENU OPTIONS</h2>
                {selectedMenuPackageIds.length > 0 && (
                  <span className="bg-primary text-white font-bebas text-xs px-2 py-0.5 rounded-full">{selectedMenuPackageIds.length} SELECTED</span>
                )}
              </div>
              {menuSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {menuSectionOpen && (
              <div className="px-5 pb-5">
                {selectedMenuPackageIds.length >= 2 && (
                  <label className="flex items-start gap-3 mb-4 p-3 border-2 border-primary/40 bg-primary/5 cursor-pointer">
                    <input type="checkbox" checked={menuChoice} onChange={e => setMenuChoice(e.target.checked)} className="mt-1 w-4 h-4 accent-primary" />
                    <span className="font-dm text-sm text-ink">
                      <b>Let the client choose one menu</b>
                      <span className="block text-xs text-muted-foreground mt-0.5">Each menu is shown with its own total and deposit, and the client picks one when they accept. Untick to add the menus together.</span>
                    </span>
                  </label>
                )}
                {offeredPackages.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-border">
                    <ChefHat className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="font-dm text-sm text-muted-foreground">No menu packages yet.</p>
                    <p className="font-dm text-xs text-muted-foreground mt-1">This venue has no menu packages set up. Add what you're offering as line items under Pricing below.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {PACKAGE_GROUPS.map(g => {
                      const pkgs = offeredPackages.filter(p => p.type === g.type);
                      if (pkgs.length === 0) return null;
                      const Icon = g.icon;
                      return (
                        <div key={g.type}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`w-3.5 h-3.5 ${g.text}`} />
                            <span className={`font-bebas text-xs tracking-widest ${g.text}`}>{g.label}</span>
                          </div>
                          <div className="grid gap-2">
                            {pkgs.map(pkg => {
                              const selected = selectedMenuPackageIds.includes(pkg.id);
                              return (
                                <div key={pkg.id} className={`border-2 transition-all ${selected ? g.on : `border-border ${g.hover}`}`}>
                                  <button type="button" aria-pressed={selected} onClick={() => toggleMenuPackage(pkg.id)} className="w-full text-left p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <div className="font-bebas text-sm tracking-wide text-ink">{pkg.name}</div>
                                        {pkg.description && <div className="font-dm text-xs text-muted-foreground mt-0.5">{pkg.description}</div>}
                                      </div>
                                      <div className="text-right shrink-0">
                                        {pkg.pricePerHead && (
                                          <div className={`font-alfa text-sm ${g.text}`}>${Number(pkg.pricePerHead).toFixed(2)}<span className="font-dm text-xs text-muted-foreground">/head + GST</span></div>
                                        )}
                                        {selected && (
                                          <div className={`font-bebas text-xs tracking-widest mt-0.5 ${g.text}`}>✓ SELECTED</div>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                  {pkg.chefNotes && (
                                    <details className="px-3 pb-3">
                                      <summary className="cursor-pointer font-bebas text-xs tracking-widest text-muted-foreground hover:text-ink">WHAT&rsquo;S ON IT</summary>
                                      <pre className="mt-1 font-dm text-xs text-ink whitespace-pre-wrap break-words">{pkg.chefNotes}</pre>
                                    </details>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="bg-cream-card border border-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bebas text-xs tracking-widest text-muted-foreground">PRICING</h2>
              <Button size="sm" variant="ghost" onClick={() => setLineItems(prev => [...prev, { description: "", qty: 1, unitPrice: 0, total: 0 }])}
                className="font-bebas tracking-widest text-xs text-primary gap-1">
                <Plus className="w-3 h-3" /> ADD ITEM
              </Button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[minmax(0,1fr)_56px_80px_84px_44px] gap-2 mb-2">
              <div className="font-bebas text-xs tracking-widest text-muted-foreground">DESCRIPTION</div>
              <div className="font-bebas text-xs tracking-widest text-muted-foreground text-center">QTY</div>
              <div className="font-bebas text-xs tracking-widest text-muted-foreground text-right">UNIT PRICE</div>
              <div className="font-bebas text-xs tracking-widest text-muted-foreground text-right">TOTAL</div>
              <div />
            </div>

            {doubledPackages.length > 0 && (
              <div role="alert" className="mb-4 border-2 border-red-700 bg-red-50 p-3 space-y-2">
                <p className="font-dm text-sm text-red-900">
                  <b>{doubledPackages.map(d => packageNameFromLine(d.description)).join(" and ")}</b>{" "}
                  {doubledPackages.length === 1 ? "is" : "are"} on this proposal twice, so the total is too high. An earlier bug caused this; it's fixed now.
                  {locked && ` The client has already ${status} this total, so talk to them and start a new proposal if it needs fixing.`}
                </p>
                {!locked && (<>
                  <button type="button" onClick={() => setLineItems(prev => withoutDuplicatePackageLines(prev))}
                    className="bg-red-800 text-white font-dm text-sm font-semibold px-3 py-2 hover:bg-red-900">
                    Remove the extra {doubledPackages.reduce((n, d) => n + d.extra, 0) === 1 ? "line" : "lines"}
                  </button>
                  <span className="font-dm text-xs text-red-900 ml-2">Then save.</span>
                </>)}
              </div>
            )}
            <div className="space-y-2 mb-4">
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_56px_80px_84px_44px] gap-2 items-center">
                  <div className="min-w-0">
                    <Input value={item.description} onChange={e => updateLineItem(i, "description", e.target.value)}
                      placeholder="Item description" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm h-9" />
                  </div>
                  <div>
                    <Input aria-label={`Quantity for ${item.description || `line item ${i + 1}`}`} type="number" value={item.qty} onChange={e => updateLineItem(i, "qty", parseFloat(e.target.value) || 0)}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm h-9 text-center" />
                  </div>
                  <div>
                    <Input aria-label={`Unit price for ${item.description || `line item ${i + 1}`}`} type="number" value={item.unitPrice} onChange={e => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm h-9 text-right" />
                  </div>
                  <div className="text-right font-dm text-sm font-semibold text-ink whitespace-nowrap">
                    {currency(item.total)}
                  </div>
                  <div className="flex justify-center">
                    {lineItems.length > 1 && (
                      <button
                        onClick={() => setLineItems(prev => prev.filter((_, idx) => idx !== i))}
                        aria-label={`Remove line item${item.description ? `: ${item.description}` : ` ${i + 1}`}`}
                        title="Remove line item"
                        className="w-11 h-11 inline-flex items-center justify-center rounded-sm text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t-2 border-dashed border-border pt-4 space-y-2">
              <div className="flex justify-between font-dm text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{menuOptions.length ? "Priced per menu" : currency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center font-dm text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">GST</span>
                  <Input aria-label="GST percentage" type="number" value={taxPercent} onChange={e => setTaxPercent(parseFloat(e.target.value) || 0)}
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm h-7 w-16 text-center" />
                  <span className="text-muted-foreground">%</span>
                </div>
                <span>{menuOptions.length ? "" : currency(taxAmount)}</span>
              </div>
              {menuOptions.length ? (
                <div className="border-t-2 border-border pt-2 space-y-2">
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground">CLIENT CHOOSES ONE MENU</div>
                  {menuOptions.map(o => (
                    <div key={o.line} className="flex justify-between items-baseline gap-3 font-dm text-sm border border-border bg-white px-3 py-2">
                      <span className="font-semibold text-ink min-w-0">{o.name}</span>
                      <span className="text-right whitespace-nowrap">
                        <span className="font-alfa text-base text-primary">{currency(o.total)}</span>
                        <span className="block text-xs text-muted-foreground">incl. GST · deposit {currency(o.deposit)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="flex justify-between font-alfa text-lg text-ink border-t-2 border-border pt-2">
                <span>TOTAL (NZD)</span>
                <span className="text-primary">{currency(total)}</span>
              </div>
              )}
              <div className="flex justify-between items-center font-dm text-sm bg-sage-tint border border-sage-green/30 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-bebas text-xs tracking-widest text-sage-green">DEPOSIT REQUIRED</span>
                  <Input aria-label="Deposit percentage" type="number" value={depositPercent} onChange={e => setDepositPercent(parseFloat(e.target.value) || 0)}
                    className="rounded-none border-2 border-sage-green/40 focus-visible:ring-0 focus-visible:border-sage-green text-sm h-7 w-16 text-center bg-transparent" />
                  <span className="text-sage-green text-xs">%</span>
                </div>
                <span className="font-alfa text-lg text-ink">{menuOptions.length ? <span className="font-dm text-xs text-muted-foreground">per menu, above</span> : currency(deposit)}</span>
              </div>
            </div>
          </div>

          {/* Food Items */}
          <div className="bg-cream-card border border-border shadow-sm">
            <button
              type="button"
              aria-expanded={foodSectionOpen}
              onClick={() => setFoodSectionOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 hover:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-primary" />
                <h2 className="font-bebas text-xs tracking-widest text-muted-foreground">FOOD ITEMS</h2>
                {foodLinesAdded > 0 && (
                  <span className="bg-primary text-white font-bebas text-xs px-2 py-0.5 tracking-widest">
                    {foodLinesAdded} ADDED
                  </span>
                )}
              </div>
              {foodSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {foodSectionOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-border">
                {/* Live food catalogue — always reflects current menu */}
                {groupedFoodCatalogue.length > 0 && (
                  <div className="pt-4">
                    <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">PICK FROM YOUR MENU CATALOGUE</div>
                    <p className="font-dm text-xs text-muted-foreground mb-3">Adds a line to Pricing above — set the quantity there. Prices exclude GST; GST is added to the total. This list follows Settings → Menu &amp; Catalogue.</p>
                    <div className="space-y-3 max-h-72 overflow-y-auto border border-border p-3 bg-white/40">
                      {groupedFoodCatalogue.map(g => (
                        <div key={g.category.id}>
                          <div className="font-playfair italic text-sm text-primary mb-1 border-b border-primary/20 pb-1">{g.category.name}</div>
                          <div className="space-y-1">
                            {g.items.map((it: any) => {
                              const line = catalogueLineDescription(it);
                              const already = lineDescriptions.has(line);
                              return (
                                <div key={it.id} className="flex items-center gap-2 py-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-dm text-sm text-ink truncate">
                                      {it.name}
                                      {it.allergens && <span className="font-dm text-xs text-muted-foreground ml-2">{it.allergens}</span>}
                                    </div>
                                    {it.description && <div className="font-dm text-xs text-muted-foreground truncate">{it.description.split('\n').join(' · ')}</div>}
                                  </div>
                                  <div className="font-dm text-xs text-muted-foreground shrink-0">{cataloguePriceLabel(it)}</div>
                                  <Button
                                    size="sm"
                                    variant={already ? 'outline' : 'default'}
                                    disabled={already}
                                    aria-label={already ? `${it.name} added` : `Add ${it.name}`}
                                    onClick={() => addPricingLine(line, catalogueDefaultQty(it, covers), it.price / 100)}
                                    className="font-bebas tracking-widest rounded-none px-3 text-xs"
                                  >
                                    {already ? 'ADDED' : 'ADD'}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className={groupedFoodCatalogue.length > 0 ? '' : 'pt-4'}>
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground">ADD SOMETHING ELSE</div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Input
                      value={newFoodItem.name}
                      onChange={e => setNewFoodItem(p => ({ ...p, name: e.target.value }))}
                      placeholder="Dish name"
                      aria-label="Dish name"
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm"
                    />
                    <Input
                      value={newFoodItem.description}
                      onChange={e => setNewFoodItem(p => ({ ...p, description: e.target.value }))}
                      placeholder="Description (optional)"
                      aria-label="Dish description"
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        aria-label="Price per head, excluding GST"
                        value={newFoodItem.pricePerHead}
                        onChange={e => setNewFoodItem(p => ({ ...p, pricePerHead: e.target.value }))}
                        placeholder="$/head"
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm"
                      />
                      <Button size="sm" onClick={addFoodItem} aria-label="Add food item" className="bg-primary hover:bg-primary/90 text-white font-bebas tracking-widest rounded-none px-3">
                        <Plus className="w-3.5 h-3.5" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Drinks Selection */}
          <div className="bg-cream-card border border-border shadow-sm">
            <button
              type="button"
              aria-expanded={drinksSectionOpen}
              onClick={() => setDrinksSectionOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 hover:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wine className="w-4 h-4 text-primary" />
                <h2 className="font-bebas text-xs tracking-widest text-muted-foreground">DRINKS SELECTION</h2>
                {selectedDrinks.length > 0 && (
                  <span className="bg-primary text-white font-bebas text-xs px-2 py-0.5 tracking-widest">
                    {selectedDrinks.length + customDrinks.length} SELECTED
                  </span>
                )}
              </div>
              {drinksSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {drinksSectionOpen && (
              <div className="px-5 pb-5 space-y-5 border-t border-border">
                {/* Bar Option */}
                <div className="pt-4">
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">BAR ARRANGEMENT</div>
                  <div className="grid grid-cols-2 gap-2">
                    {BAR_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setBarOption(opt.key)}
                        className={`p-3 border-2 text-left transition-colors ${
                          barOption === opt.key
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="font-bebas text-xs tracking-widest text-ink">{opt.label}</div>
                        <div className="font-dm text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                      </button>
                    ))}
                  </div>
                  {(barOption === 'bar_tab' || barOption === 'bar_tab_then_cash') && (
                    <div className="mt-3 flex items-center gap-3">
                      <label className="font-bebas text-xs tracking-widest text-muted-foreground">TAB AMOUNT (NZD)</label>
                      <Input
                        type="number"
                        aria-label="Tab amount (NZD)"
                        value={tabAmount}
                        onChange={e => setTabAmount(e.target.value)}
                        placeholder="e.g. 1500"
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm w-36"
                      />
                    </div>
                  )}
                </div>

                {/* Drinks Menu */}
                <p className="font-dm text-xs text-muted-foreground">Event menus 2026. Prices exclude GST; wines are per bottle.</p>
                {DRINKS_MENU.map(cat => (
                  <div key={cat.category}>
                    <div className="font-playfair italic text-sm text-primary mb-2 border-b border-primary/20 pb-1">{cat.category}</div>
                    <div className="space-y-1.5">
                      {cat.items.map((item: any) => (
                        <label
                          key={item.key}
                          className={`flex items-start gap-3 p-2 cursor-pointer rounded-sm transition-colors ${
                            selectedDrinks.includes(item.key) ? 'bg-primary/5 border border-primary/20' : 'hover:bg-black/5 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDrinks.includes(item.key)}
                            onChange={() => toggleDrink(item.key)}
                            className="mt-0.5 accent-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-dm text-sm text-ink">{item.name}</div>
                            {item.description && <div className="font-dm text-xs text-muted-foreground">{item.description}</div>}
                          </div>
                          <div className="font-dm text-xs text-muted-foreground shrink-0 text-right">
                            {drinkPriceLabel(item)}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {previousDrinks.length > 0 && (
                  <div className="border border-border p-3">
                    <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-1">FROM THE PREVIOUS MENU</div>
                    <p className="font-dm text-xs text-muted-foreground mb-2">Still on this proposal at the old prices. Untick to remove.</p>
                    {previousDrinks.map(d => (
                      <label key={d!.key} className="flex items-start gap-3 p-2 cursor-pointer">
                        <input type="checkbox" checked onChange={() => toggleDrink(d!.key)} className="mt-0.5 accent-primary" />
                        <div className="flex-1 min-w-0 font-dm text-sm text-ink">{d!.name}</div>
                        <div className="font-dm text-xs text-muted-foreground shrink-0">{drinkPriceLabel(d!)}</div>
                      </label>
                    ))}
                  </div>
                )}

                {/* Sample Shared Menu (Food) */}
                <div className="pt-4 mt-2 border-t-2 border-primary/20">
                  <div className="font-bebas text-sm tracking-widest text-ink mb-1">SHARED FRANCO MENU</div>
                  <div className="font-dm text-xs text-muted-foreground mb-3">Tick the dishes to show on the proposal. Price it with the Shared Franco or Tutto Franco package above.</div>
                  {[...SHARED_MENU_SECTIONS, ...previousSampleSections].map(cat => (
                    <div key={cat.category} className="mb-4">
                      <div className="font-playfair italic text-sm text-primary mb-2 border-b border-primary/20 pb-1">
                        {cat.category}
                        {cat.note && <span className="font-dm not-italic text-xs text-muted-foreground ml-2">({cat.note})</span>}
                        {cat.retired && <span className="font-dm not-italic text-xs text-muted-foreground ml-2">· previous menu, untick to remove</span>}
                      </div>
                      <div className="space-y-1.5">
                        {cat.items.map(item => (
                          <label
                            key={item.key}
                            className={`flex items-start gap-3 p-2 cursor-pointer rounded-sm transition-colors ${
                              selectedSampleItems.includes(item.key) ? 'bg-primary/5 border border-primary/20' : 'hover:bg-black/5 border border-transparent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSampleItems.includes(item.key)}
                              onChange={() => toggleSampleItem(item.key)}
                              className="mt-0.5 accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-dm text-sm text-ink">{item.name}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live drink catalogue — always reflects current menu */}
                {groupedDrinkCatalogue.length > 0 && (
                  <div className="pt-4 mt-2 border-t-2 border-primary/20">
                    <div className="font-bebas text-sm tracking-widest text-ink mb-1">PICK FROM YOUR DRINK CATALOGUE</div>
                    <p className="font-dm text-xs text-muted-foreground mb-3">This list updates automatically when you edit drinks in Dashboard → Menu Catalogue.</p>
                    <div className="space-y-3 max-h-72 overflow-y-auto border border-border p-3 bg-white/40">
                      {groupedDrinkCatalogue.map(g => (
                        <div key={g.category.id}>
                          <div className="font-playfair italic text-sm text-primary mb-1 border-b border-primary/20 pb-1">{g.category.name}</div>
                          <div className="space-y-1">
                            {g.items.map((it: any) => {
                              const already = customDrinks.some(cd => cd.name === it.name);
                              return (
                                <div key={it.id} className="flex items-center gap-2 py-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-dm text-sm text-ink truncate">{it.name}</div>
                                    {it.description && <div className="font-dm text-xs text-muted-foreground truncate">{it.description}</div>}
                                  </div>
                                  <div className="font-dm text-xs text-muted-foreground shrink-0">{cataloguePriceLabel(it)}</div>
                                  <Button
                                    size="sm"
                                    variant={already ? 'outline' : 'default'}
                                    disabled={already}
                                    onClick={() => setCustomDrinks(prev => [...prev, {
                                      name: it.name,
                                      description: it.description ?? undefined,
                                      price: it.price / 100,
                                    }])}
                                    className="font-bebas tracking-widest rounded-none px-3 text-xs"
                                  >
                                    {already ? 'ADDED' : 'ADD'}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Drinks */}
                <div>
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">CUSTOM DRINKS</div>
                  {customDrinks.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2 p-2 bg-sage-tint/50 border border-sage-green/20">
                      <div className="flex-1 min-w-0">
                        <span className="font-dm text-sm text-ink">{d.name}</span>
                        {d.description && <span className="font-dm text-xs text-muted-foreground ml-2">{d.description}</span>}
                        {d.price && <span className="font-dm text-xs text-sage-green ml-2">${d.price}</span>}
                      </div>
                      <button onClick={() => removeCustomDrink(i)} aria-label={`Remove drink ${d.name || i + 1}`} className="text-muted-foreground/40 hover:text-primary transition-colors">
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Input
                      value={newCustomDrink.name}
                      onChange={e => setNewCustomDrink(p => ({ ...p, name: e.target.value }))}
                      placeholder="Drink name"
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm"
                    />
                    <Input
                      value={newCustomDrink.description}
                      onChange={e => setNewCustomDrink(p => ({ ...p, description: e.target.value }))}
                      placeholder="Description (optional)"
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={newCustomDrink.price}
                        onChange={e => setNewCustomDrink(p => ({ ...p, price: e.target.value }))}
                        placeholder="Price"
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm"
                      />
                      <Button size="sm" onClick={addCustomDrink} aria-label="Add drink" className="bg-primary hover:bg-primary/90 text-white font-bebas tracking-widest rounded-none px-3">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Save Drinks Button */}
                {!locked && (
                  <Button
                    onClick={handleSaveDrinks}
                    disabled={saveDrinks.isPending}
                    className="w-full bg-ink hover:bg-ink/90 text-cream font-bebas tracking-widest rounded-none h-10 gap-2"
                  >
                    <Wine className="w-4 h-4" />
                    {saveDrinks.isPending ? "SAVING DRINKS..." : "SAVE DRINKS SELECTION"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Quote / Min-Spend Calculator */}
          <div className="bg-cream-card border border-border shadow-sm">
            <div className="w-full flex items-center gap-3 p-5">
              <h2 className="font-bebas text-xs tracking-widest text-muted-foreground m-0">PRICING &amp; MINIMUM SPEND</h2>
              {Number(minimumSpend) > 0 && (
                <span className="font-bebas text-xs tracking-widest bg-burgundy text-cream px-2 py-0.5">
                  MIN {currencyWhole(parseFloat(minimumSpend))}
                </span>
              )}
            </div>
            {(
              <div className="px-5 pb-5 space-y-5">
                {/* Min Spend + Food Total */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MINIMUM SPEND (NZD)</label>
                    <Input
                      type="number" min="0" placeholder="e.g. 5000" aria-label="Minimum spend (NZD)"
                      value={minimumSpend} onChange={e => setMinimumSpend(e.target.value)}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                    />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">FOOD TOTAL OVERRIDE (NZD)</label>
                    <Input
                      type="number" min="0" placeholder={`Auto: ${currency(_lineSubtotal())}`} aria-label="Food total override (NZD)"
                      value={foodTotalOverride} onChange={e => setFoodTotalOverride(e.target.value)}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                    />
                    <p className="font-dm text-xs text-muted-foreground mt-1">Leave blank to use line items total</p>
                  </div>
                </div>

                {/* Auto Bar Tab Toggle */}
                <div className="flex items-center gap-3 p-3 bg-powder/30 border border-border">
                  <input
                    type="checkbox" id="autoBarTab"
                    checked={autoBarTab} onChange={e => setAutoBarTab(e.target.checked)}
                    className="w-4 h-4 accent-burgundy"
                  />
                  <label htmlFor="autoBarTab" className="font-dm text-sm cursor-pointer">
                    Auto-calculate bar tab as remainder of minimum spend
                  </label>
                </div>

                {/* Min Spend Breakdown */}
                {Number(minimumSpend) > 0 && (
                  <div className="bg-ink text-cream p-4 space-y-2">
                    <div className="font-bebas text-xs tracking-widest text-[#c9a84c] mb-2">MINIMUM SPEND BREAKDOWN</div>
                    <div className="flex justify-between font-dm text-sm">
                      <span className="text-cream/60">Food &amp; Beverage</span>
                      <span>{currency(_foodBase())}</span>
                    </div>
                    {hireItems.map((item, i) => (
                      <div key={i} className="flex justify-between font-dm text-sm">
                        <span className="text-cream/60">{item.name || `Hire Item ${i + 1}`}</span>
                        <span>{currency((item.qty * item.unitPrice))}</span>
                      </div>
                    ))}
                    {autoBarTab && autoBarTabAmount > 0 && (
                      <div className="flex justify-between font-dm text-sm text-sage-green">
                        <span>Bar Tab (auto remainder)</span>
                        <span>{currency(autoBarTabAmount)}</span>
                      </div>
                    )}
                    <div className="border-t border-cream/20 pt-2 flex justify-between font-bebas text-sm">
                      <span>TOTAL vs MINIMUM SPEND</span>
                      <span className={(_foodBase() + hireItems.reduce((s, i) => s + i.qty * i.unitPrice, 0) + autoBarTabAmount) >= parseFloat(minimumSpend) ? "text-forest" : "text-red-400"}>
                        {currency((_foodBase() + hireItems.reduce((s, i) => s + i.qty * i.unitPrice, 0) + autoBarTabAmount))} / {currency(parseFloat(minimumSpend))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Hire & Styling Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bebas text-xs tracking-widest text-muted-foreground">HIRE &amp; STYLING ITEMS</span>
                    <button type="button" onClick={addHireItem}
                      className="flex items-center gap-1 font-bebas text-xs tracking-widest text-burgundy hover:text-burgundy/70">
                      <Plus className="w-3 h-3" /> ADD ITEM
                    </button>
                  </div>
                  {hireItems.length === 0 && (
                    <p className="font-dm text-xs text-muted-foreground italic">No hire items yet. Add styling, AV, linen, centrepieces, etc.</p>
                  )}
                  {hireItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-start">
                      <div className="col-span-4">
                        <Input aria-label={`Hire item ${i + 1} name`} placeholder="Item name" value={item.name} onChange={e => updateHireItem(i, 'name', e.target.value)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-3">
                        <Input aria-label={`Hire item ${i + 1} description`} placeholder="Description" value={item.description} onChange={e => updateHireItem(i, 'description', e.target.value)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min="1" aria-label={`Hire item ${i + 1} quantity`} placeholder="Qty" value={item.qty} onChange={e => updateHireItem(i, 'qty', parseInt(e.target.value) || 1)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min="0" aria-label={`Hire item ${i + 1} price`} placeholder="Price" value={item.unitPrice} onChange={e => updateHireItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeHireItem(i)} aria-label={`Remove hire item ${item.name || i + 1}`}
                          className="text-muted-foreground hover:text-destructive h-8 flex items-center">
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quote Notes */}
                <div>
                  <label htmlFor="pb-quote-notes" className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">QUOTE NOTES (shown to client)</label>
                  <Textarea id="pb-quote-notes" value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)}
                    placeholder="Any additional notes about this quote..." rows={2}
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy resize-none text-sm font-dm" />
                </div>

                <p className="font-dm text-xs text-muted-foreground italic">Pricing &amp; minimum spend save together with the proposal — just hit Save.</p>
              </div>
            )}
          </div>

          {/* Terms */}
          <div className="bg-cream-card border border-border p-5 shadow-sm">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">TERMS & CONDITIONS</h2>
            <Textarea aria-label="Terms and conditions" value={termsAndConditions} onChange={e => setTermsAndConditions(e.target.value)}
              rows={5} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary resize-none text-sm font-dm" />
          </div>

          {/* Internal Notes */}
          <div className="bg-cream-card border border-dashed border-border p-5">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">INTERNAL NOTES <span className="font-dm text-xs text-muted-foreground normal-case">(not shown to client)</span></h2>
            <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
              aria-label="Internal notes (not shown to the client)"
              placeholder="Notes for your team only..." rows={2}
              className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary resize-none text-sm font-dm" />
          </div>
        </fieldset>

        {/* Right: live preview of the client's page */}
        {showPreview && savedProposal?.publicToken && (
          <div className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bebas text-xs tracking-widest text-muted-foreground">WHAT THE CLIENT SEES</span>
              <span className="font-dm text-[11px] text-muted-foreground">{canAutosave ? "Updates as you edit" : "Updates when you save"}</span>
            </div>
            <iframe key={previewNonce} title="Client view preview" src={`/proposal/${savedProposal.publicToken}?preview=${previewNonce}`}
              className="w-full h-[calc(100vh-8rem)] border-2 border-border bg-white" />
          </div>
        )}

        {/* Right: Summary & Actions */}
        <div className={`space-y-4 lg:sticky lg:top-20 lg:self-start ${showPreview && savedProposal?.publicToken ? "lg:hidden" : ""}`}>

          {/* Appearance — hidden; managed via Venue Settings */}
          {false && <div className="bg-cream-card border border-border shadow-sm">
            <button
              type="button"
              className="w-full flex items-center justify-between p-4 text-left hover:bg-sage-tint/50 transition-colors"
              onClick={() => setAppearanceSectionOpen(o => !o)}
            >
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-sage-green" />
                <span className="font-bebas text-xs tracking-widest text-muted-foreground">PROPOSAL APPEARANCE</span>
              </div>
              {appearanceSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {appearanceSectionOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-border">
                <p className="font-dm text-xs text-muted-foreground pt-3 m-0">The header colour, fonts and logo on the client's page and PDF come from your Brand Pack (Settings → Brand Pack).</p>
                {/* Theme Selector */}
                <div className="pt-1">
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">COLOUR THEME</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {COLOUR_THEMES.map(theme => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setAppearanceThemeKey(theme.id)}
                        className={`p-2 border-2 text-left transition-all rounded-sm ${
                          appearanceThemeKey === theme.id ? 'border-primary' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="flex gap-0.5 mb-1">
                          {theme.swatches.slice(0, 3).map((s, i) => (
                            <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: s }} />
                          ))}
                        </div>
                        <div className="font-bebas text-xs tracking-wide text-ink leading-tight">{theme.label}</div>
                        {appearanceThemeKey === theme.id && (
                          <div className="font-bebas text-xs text-primary tracking-widest">✓</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Logo URL */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Image className="w-3.5 h-3.5 text-muted-foreground" />
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground">VENUE LOGO URL</label>
                  </div>
                  <Input
                    value={appearanceLogoUrl}
                    onChange={e => setAppearanceLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-xs h-8"
                  />
                  {appearanceLogoUrl && (
                    <div className="mt-1.5 p-2 bg-ink rounded-sm flex items-center justify-center h-12">
                      <img src={appearanceLogoUrl} alt="Logo preview" className="max-h-8 w-auto object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
                    </div>
                  )}
                </div>

                {/* Venue Photo URL */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Image className="w-3.5 h-3.5 text-muted-foreground" />
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground">VENUE PHOTO URL</label>
                  </div>
                  <Input
                    value={appearanceVenuePhotoUrl}
                    onChange={e => setAppearanceVenuePhotoUrl(e.target.value)}
                    placeholder="https://example.com/venue.jpg"
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-xs h-8"
                  />
                  {appearanceVenuePhotoUrl && (
                    <div className="mt-1.5 h-16 bg-cover bg-center rounded-sm border border-border" style={{ backgroundImage: `url(${appearanceVenuePhotoUrl})` }} />
                  )}
                  <p className="font-dm text-xs text-muted-foreground mt-1">This photo appears as a banner at the top of the proposal</p>
                </div>

                <Button
                  type="button"
                  onClick={handleSaveAppearance}
                  disabled={updateVenue.isPending}
                  className="w-full bg-sage-green hover:bg-sage-green/90 text-white font-bebas tracking-widest rounded-none h-9 text-xs gap-1"
                >
                  <Palette className="w-3.5 h-3.5" />
                  {updateVenue.isPending ? "SAVING..." : "SAVE APPEARANCE"}
                </Button>
              </div>
            )}
          </div>}

          {/* Expiry */}
          <div className="bg-cream-card border border-border p-4 shadow-sm">
            <h3 className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">PROPOSAL EXPIRY</h3>
            <Input aria-label="Proposal expiry date" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} disabled={locked}
              className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-sm" />
            <p className="font-dm text-xs text-muted-foreground mt-2">Client must respond before this date</p>
          </div>

          {/* Summary */}
          <div className="bg-cream-card border border-border border-t-2 border-t-primary p-5 shadow-sm">
            <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">PROPOSAL SUMMARY</div>
            <div className="space-y-2 font-dm text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">For</span>
                <span className="text-ink">{lead ? `${lead.firstName} ${lead.lastName ?? ""}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event</span>
                <span>{lead?.eventType || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{eventDate ? new Date(eventDate).toLocaleDateString("en-NZ") : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guests</span>
                <span>{guestCount || "—"}</span>
              </div>
              <div className="border-t border-border pt-2 mt-2">
                {menuOptions.length ? menuOptions.map(o => (
                  <div key={o.line} className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground min-w-0">{o.name}</span>
                    <span className="font-alfa text-primary whitespace-nowrap">{currencyWhole(o.total)}</span>
                  </div>
                )) : (<>
                <div className="flex justify-between font-alfa text-xl">
                  <span className="text-muted-foreground text-sm">TOTAL</span>
                  <span className="text-primary">{currencyWhole(total)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Deposit ({depositPercent}%)</span>
                  <span>{currencyWhole(deposit)}</span>
                </div>
                </>)}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {!locked && (
              <Button onClick={() => handleSave()} disabled={saving || (!!editId && !savedProposal)}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bebas tracking-widest rounded-none h-11">
                {saving ? "SAVING..." : savedProposal ? "SAVE CHANGES" : "SAVE DRAFT"}
              </Button>
            )}
            {canSend && (
              <Button onClick={handleSend} disabled={sendProposal.isPending || saving}
                className="w-full bg-ink text-cream hover:opacity-90 font-bebas tracking-widest rounded-none h-11 gap-2">
                <Send className="w-4 h-4" />
                {sendProposal.isPending ? "SENDING..." : status === "draft" ? "SAVE & SEND TO CLIENT" : "SAVE & RESEND TO CLIENT"}
              </Button>
            )}
            {sendResult && (
              <div role="status" className={`border-2 p-3 font-dm text-xs ${sendResult.emailSent ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                {sendResult.emailSent && sendResult.emailedTo ? (
                  <div className="flex items-start gap-2"><CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden /> <span>Proposal emailed to <strong>{sendResult.emailedTo}</strong>.</span></div>
                ) : sendResult.emailStatus === 'no_client_email' ? (
                  <span><strong>Not emailed.</strong> This enquiry has no email address on file — copy the link below and send it yourself, or add an email and resend.</span>
                ) : sendResult.emailStatus === 'failed' ? (
                  <span><strong>Not emailed — the send failed.</strong>{sendResult.emailError ? ` (${sendResult.emailError})` : ""} The proposal link is live — copy it below and send it yourself, then <a href="/dashboard?tab=settings&sub=email" className="underline underline-offset-2">check your email settings</a>.</span>
                ) : (
                  <span><strong>Not emailed.</strong> Email isn't set up, so copy the link below and send it yourself. <a href="/dashboard?tab=settings&sub=email" className="underline underline-offset-2">Set up email</a></span>
                )}
              </div>
            )}
            {proposalUrl && status && status !== "draft" && (
              <div className="bg-white border-2 border-border p-3">
                <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">CLIENT LINK</div>
                <div className="font-dm text-xs text-muted-foreground break-all mb-2 bg-linen p-2 border border-border">{proposalUrl}</div>
                <Button size="sm" onClick={() => { navigator.clipboard.writeText(proposalUrl); toast.success("Link copied"); }}
                  className="w-full bg-ink text-cream font-bebas tracking-widest rounded-none text-xs gap-1">
                  <Copy className="w-3 h-3" /> COPY LINK
                </Button>
              </div>
            )}
          </div>

          {/* Preview hint */}
          {savedProposal?.publicToken && (
            <a href={`/proposal/${savedProposal.publicToken}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="w-full border-2 border-border font-bebas tracking-widest rounded-none text-xs gap-1">
                <FileText className="w-3 h-3" /> PREVIEW CLIENT VIEW
              </Button>
            </a>
          )}

          {/* Download PDF */}
          {savedProposal?.publicToken && (
            <Button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              variant="outline"
              size="sm"
              className="w-full border-2 border-ink/30 text-ink hover:bg-ink hover:text-cream font-bebas tracking-widest rounded-none text-xs gap-1.5 transition-all"
            >
              <Download className="w-3 h-3" />
              {pdfLoading ? "GENERATING PDF..." : "DOWNLOAD PDF"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

const PROPOSAL_STATUS_TEXT: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-stone-100 text-stone-700" },
  sent: { label: "Sent", cls: "bg-blue-100 text-blue-800" },
  viewed: { label: "Opened by client", cls: "bg-amber-100 text-amber-900" },
  accepted: { label: "Accepted", cls: "bg-emerald-100 text-emerald-800" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-800" },
  expired: { label: "Expired", cls: "bg-stone-100 text-stone-700" },
};

const fmtWhen = (d: string | Date) => new Date(d).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

/** Shown when editing a saved proposal: where it's at, and what editing it means. */
function ProposalStatusPanel({ proposal }: { proposal: any }) {
  const st = PROPOSAL_STATUS_TEXT[proposal.status] ?? PROPOSAL_STATUS_TEXT.draft;
  const locked = isProposalLocked(proposal.status);
  const note =
    proposal.status === "accepted" ? "The client accepted this proposal and the booking was created from it. It can't be changed, so it always matches what they agreed to."
    : proposal.status === "declined" ? "The client declined this proposal, so it can't be changed."
    : proposal.status === "expired" ? "This proposal has expired. Set a new expiry date, save, and resend it to re-open it."
    : proposal.status === "sent" || proposal.status === "viewed" ? "The client already has the link — saved changes show on their page straight away."
    : "Not sent yet — only your team can see it.";
  return (
    <div className="bg-white border-2 border-border p-4">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-bebas text-xs tracking-widest text-muted-foreground">{locked ? "READ-ONLY PROPOSAL" : "EDITING SAVED PROPOSAL"}</span>
        <span className={`font-dm text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
      </div>
      <div className="font-dm text-xs text-ink">
        {[
          proposal.sentAt ? `Sent ${fmtWhen(proposal.sentAt)}` : null,
          proposal.viewedAt ? `Viewed ${fmtWhen(proposal.viewedAt)}` : null,
          proposal.respondedAt && (proposal.status === "accepted" || proposal.status === "declined")
            ? `${proposal.status === "declined" ? "Declined" : "Accepted"} ${fmtWhen(proposal.respondedAt)}` : null,
        ].filter(Boolean).join(" · ")}
      </div>
      {proposal.status === "declined" && proposal.declineReason && (
        <p className="font-dm text-xs text-ink mt-1">Their reason: “{proposal.declineReason}”</p>
      )}
      <p className="font-dm text-xs text-muted-foreground mt-1">{note}</p>
      {locked && proposal.leadId && (
        // A full page load, so the new proposal starts from a clean form.
        <a href={`/proposals/new?leadId=${proposal.leadId}`} className="inline-block mt-2 font-dm text-xs font-semibold text-primary underline underline-offset-2">
          Start a new proposal for this enquiry
        </a>
      )}
    </div>
  );
}

/** Shrink a photo in the browser before upload (longest side 1600px, JPEG). */
async function resizePhoto(file: File, max = 1600, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Photos on the proposal: add (several at once), caption, reorder, remove. */
function ProposalPhotosCard({ proposalId, token, locked, onChanged }: { proposalId: number; token: string; locked: boolean; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const { data: photos = [] } = trpc.proposals.photos.list.useQuery({ proposalId });
  const add = trpc.proposals.photos.add.useMutation();
  const update = trpc.proposals.photos.update.useMutation();
  const remove = trpc.proposals.photos.remove.useMutation();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = async () => { await utils.proposals.photos.list.invalidate({ proposalId }); onChanged(); };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) { toast.error(`${f.name} isn't a photo.`); continue; }
        await add.mutateAsync({ proposalId, dataUrl: await resizePhoto(f) });
        added++;
      }
      if (added) toast.success(added === 1 ? "Photo added" : `${added} photos added`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't add that photo — try another.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    }
  };
  const act = async (p: Promise<unknown>) => { try { await p; await refresh(); } catch (e: any) { toast.error(e?.message || "Couldn't save that change"); } };
  return (
    <div className="bg-cream-card border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-bebas text-xs tracking-widest text-muted-foreground m-0">PHOTOS</h2>
        {!locked && (
          <>
            <input ref={fileRef} id="pb-photos" type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple className="sr-only"
              onChange={e => void onFiles(e.target.files)} />
            <Button type="button" size="sm" variant="ghost" disabled={busy || photos.length >= 12} onClick={() => fileRef.current?.click()}
              className="font-bebas tracking-widest text-xs text-primary gap-1">
              <Plus className="w-3 h-3" /> {busy ? "ADDING..." : "ADD PHOTOS"}
            </Button>
          </>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="font-dm text-xs text-muted-foreground m-0">Show the space, a set table or the food. They appear in one row, in this order. Up to 12.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {photos.map((ph, i) => (
            <div key={ph.id} className="w-44 shrink-0">
              <img src={`/api/proposal-photo/${token}/${ph.id}`} alt={ph.caption || `Photo ${i + 1}`} className="w-full aspect-[4/3] object-cover border border-border" />
              {!locked && (
                <>
                  <Input aria-label={`Caption for photo ${i + 1}`} defaultValue={ph.caption ?? ""} placeholder="Caption (optional)"
                    onBlur={e => { if ((e.target.value || "") !== (ph.caption ?? "")) void act(update.mutateAsync({ id: ph.id, caption: e.target.value })); }}
                    className="mt-1 rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary text-xs h-8" />
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex">
                      <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => void act(update.mutateAsync({ id: ph.id, move: "earlier" }))}
                        className="w-9 h-9 inline-flex items-center justify-center text-muted-foreground hover:text-ink disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
                      <button type="button" aria-label="Move later" disabled={i === photos.length - 1} onClick={() => void act(update.mutateAsync({ id: ph.id, move: "later" }))}
                        className="w-9 h-9 inline-flex items-center justify-center text-muted-foreground hover:text-ink disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
                    </div>
                    <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => void act(remove.mutateAsync({ id: ph.id }))}
                      className="w-9 h-9 inline-flex items-center justify-center text-muted-foreground/60 hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </>
              )}
              {locked && ph.caption && <div className="font-dm text-xs text-muted-foreground mt-1">{ph.caption}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The client the proposal is for, with their contact details editable in place. */
function ClientContactCard({ lead, leadId, heading, canEdit, onSaved }: {
  lead: { id: number; firstName: string; lastName: string | null; email: string | null; phone: string | null; company: string | null; eventType: string | null };
  leadId: number | null; heading: string; canEdit: boolean; onSaved: () => void;
}) {
  const utils = trpc.useUtils();
  const update = trpc.leads.update.useMutation();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "" });
  const [err, setErr] = useState<string | null>(null);
  const start = () => {
    setF({ firstName: lead.firstName ?? "", lastName: lead.lastName ?? "", email: lead.email ?? "", phone: lead.phone ?? "", company: lead.company ?? "" });
    setErr(null); setEditing(true);
  };
  const save = async () => {
    if (!f.firstName.trim()) return setErr("Enter a first name.");
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("That email address doesn't look right.");
    setErr(null);
    try {
      await update.mutateAsync({ id: lead.id, firstName: f.firstName.trim(), lastName: f.lastName.trim() || null, email: f.email.trim(), phone: f.phone.trim() || null, company: f.company.trim() || null } as any);
      if (leadId) await utils.leads.get.invalidate({ id: leadId });
      toast.success("Saved");
      setEditing(false);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Couldn't save those details.");
    }
  };
  const field = (key: keyof typeof f, label: string, type = "text", autoComplete?: string) => (
    <div className="min-w-0">
      <label htmlFor={`pb-c-${key}`} className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">{label}</label>
      <Input id={`pb-c-${key}`} type={type} autoComplete={autoComplete} value={f[key]} onChange={e => setF(p => ({ ...p, [key]: e.target.value }))}
        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-primary font-dm text-sm h-9 bg-white" />
    </div>
  );
  return (
    <div className="bg-sage-tint border-2 border-sage-green/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bebas text-xs tracking-widest text-sage-green mb-1">{heading}</div>
        {canEdit && !editing && (
          <button type="button" onClick={start} className="inline-flex items-center gap-1 font-bebas text-xs tracking-widest text-primary hover:underline min-h-[32px]">
            <Pencil className="w-3 h-3" aria-hidden /> EDIT CONTACT
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3 mt-1">
          <div className="grid sm:grid-cols-2 gap-3">
            {field("firstName", "FIRST NAME", "text", "given-name")}
            {field("lastName", "LAST NAME", "text", "family-name")}
            {field("email", "EMAIL", "email", "email")}
            {field("phone", "PHONE", "tel", "tel")}
            {field("company", "COMPANY")}
          </div>
          {err && <p role="alert" className="font-dm text-sm text-red-700 m-0">{err}</p>}
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={update.isPending} className="bg-primary text-white font-bebas tracking-widest rounded-none text-xs h-9">{update.isPending ? "SAVING..." : "SAVE"}</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)} className="font-bebas tracking-widest rounded-none text-xs h-9 bg-transparent">CANCEL</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="font-alfa text-lg text-ink">{[lead.firstName, lead.lastName].filter(Boolean).join(" ")}{lead.company ? <span className="font-dm text-sm text-muted-foreground"> · {lead.company}</span> : null}</div>
          <div className="font-dm text-sm text-muted-foreground">
            {[lead.email || (canEdit ? "No email yet" : null), lead.phone, lead.eventType || "Event"].filter(Boolean).join(" · ")}
          </div>
        </>
      )}
    </div>
  );
}
