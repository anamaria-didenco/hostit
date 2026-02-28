import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Plus, Trash2, Send, FileText, Copy, CheckCircle, UtensilsCrossed, Wine, ChefHat, ChevronDown, ChevronUp, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export default function ProposalBuilder() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Parse leadId from query string
  const leadId = parseInt(new URLSearchParams(window.location.search).get("leadId") ?? "0");

  const { data: lead } = trpc.leads.get.useQuery({ id: leadId }, { enabled: !!leadId && !!user });
  const { data: venueSettings } = trpc.venue.get.useQuery({ ownerId: user?.id }, { enabled: !!user });
  const { data: spaces } = trpc.spaces.list.useQuery(undefined, { enabled: !!user });

  const [title, setTitle] = useState("Event Proposal");
  const [introMessage, setIntroMessage] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [spaceName, setSpaceName] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Venue Hire", qty: 1, unitPrice: 0, total: 0 },
    { description: "Food & Beverage Package (per head)", qty: 0, unitPrice: 0, total: 0 },
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
    return d.toISOString().split("T")[0];
  });

  const [savedProposal, setSavedProposal] = useState<any>(null);
  const [sent, setSent] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

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
  const [selectedMenuPackageIds, setSelectedMenuPackageIds] = useState<number[]>([]);
  const [menuSectionOpen, setMenuSectionOpen] = useState(true);

  // ── Drinks selection state ─────────────────────────────────────────────────
  const [drinksSectionOpen, setDrinksSectionOpen] = useState(false);
  const [barOption, setBarOption] = useState<"bar_tab" | "cash_bar" | "bar_tab_then_cash" | "unlimited">("cash_bar");
  const [tabAmount, setTabAmount] = useState("");
  const [selectedDrinks, setSelectedDrinks] = useState<string[]>([]);
  const [customDrinks, setCustomDrinks] = useState<{ name: string; description?: string; price?: number }[]>([]);
  const [newCustomDrink, setNewCustomDrink] = useState({ name: "", description: "", price: "" });

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

  const saveDrinks = trpc.proposals.saveDrinks.useMutation({
    onSuccess: () => toast.success("Drinks selection saved!"),
    onError: () => toast.error("Failed to save drinks selection"),
  });
  const handleSaveDrinks = () => {
    if (!savedProposal) return toast.error("Save the proposal first, then save drinks.");
    saveDrinks.mutate({
      proposalId: savedProposal.id,
      barOption,
      tabAmount: tabAmount ? parseFloat(tabAmount) : undefined,
      selectedDrinks: [...selectedDrinks],
      customDrinks,
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

  const saveQuote = trpc.quote.save.useMutation({
    onSuccess: () => toast.success("Quote saved!"),
    onError: () => toast.error("Failed to save quote"),
  });
  const handleSaveQuote = () => {
    if (!savedProposal) return toast.error("Save the proposal first, then save the quote.");
    saveQuote.mutate({
      proposalId: savedProposal.id,
      minimumSpend: minimumSpend ? parseFloat(minimumSpend) : undefined,
      foodTotal: foodTotalOverride ? parseFloat(foodTotalOverride) : undefined,
      autoBarTab,
      notes: quoteNotes,
      items: hireItems.map((item, i) => ({ type: 'hire', name: item.name, description: item.description, qty: item.qty, unitPrice: item.unitPrice, sortOrder: i })),
    });
  };

  // Derived: auto bar tab amount (computed after subtotal is declared below)
  const _lineSubtotal = () => lineItems.reduce((sum, item) => sum + item.total, 0);
  const _foodBase = () => foodTotalOverride ? parseFloat(foodTotalOverride) : _lineSubtotal();
  const _minSpendNum = () => minimumSpend ? parseFloat(minimumSpend) : 0;
  const autoBarTabAmount = autoBarTab && _minSpendNum() > _foodBase() ? _minSpendNum() - _foodBase() : 0;

  const toggleMenuPackage = (id: number) => {
    setSelectedMenuPackageIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectedPackages = (menuPackages ?? []).filter(p => selectedMenuPackageIds.includes(p.id));

  useEffect(() => {
    if (lead) {
      setTitle(`${lead.eventType || "Event"} Proposal — ${lead.firstName} ${lead.lastName ?? ""}`);
      if (lead.eventDate) setEventDate(new Date(lead.eventDate).toISOString().split("T")[0]);
      if (lead.guestCount) setGuestCount(String(lead.guestCount));
      if (lead.budget) {
        setLineItems(prev => prev.map((item, i) =>
          i === 0 ? { ...item, unitPrice: Number(lead.budget), total: Number(lead.budget) } : item
        ));
      }
    }
  }, [lead]);

  useEffect(() => {
    if (venueSettings?.depositPercent) setDepositPercent(Number(venueSettings.depositPercent));
  }, [venueSettings]);

  useEffect(() => {
    if (spaces && spaces.length > 0 && !spaceName) setSpaceName(spaces[0].name);
  }, [spaces]);

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = (subtotal * taxPercent) / 100;
  const total = subtotal + taxAmount;
  const deposit = (total * depositPercent) / 100;

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

  const createProposal = trpc.proposals.create.useMutation({
    onSuccess: (data) => { setSavedProposal(data); toast.success("Proposal saved as draft!"); },
    onError: () => toast.error("Failed to save proposal"),
  });

  const sendProposal = trpc.proposals.send.useMutation({
    onSuccess: (data) => {
      setSent(true);
      toast.success("Proposal sent! Share the link with your client.");
    },
    onError: () => toast.error("Failed to send proposal"),
  });

  const handleSave = () => {
    if (!leadId) return toast.error("No lead selected");
    // Build enriched line items: include selected menu packages as line items
    const menuLineItems = selectedPackages.map(pkg => ({
      description: `${pkg.type === 'food' ? '🍽 Food Package' : pkg.type === 'beverages' ? '🍷 Beverages Package' : '🍽🍷 Food & Beverages Package'}: ${pkg.name}`,
      qty: guestCount ? parseInt(guestCount) : 1,
      unitPrice: pkg.pricePerHead ? Number(pkg.pricePerHead) : 0,
      total: pkg.pricePerHead ? Number(pkg.pricePerHead) * (guestCount ? parseInt(guestCount) : 1) : 0,
    }));
    const allLineItems = [...lineItems, ...menuLineItems];
    const allSubtotal = allLineItems.reduce((s, i) => s + i.total, 0);
    const allTax = (allSubtotal * taxPercent) / 100;
    const allTotal = allSubtotal + allTax;
    const allDeposit = (allTotal * depositPercent) / 100;
    createProposal.mutate({
      leadId,
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
      expiresAt: expiresAt || undefined,
    });
  };

  const handleSend = () => {
    if (!savedProposal) return toast.error("Save the proposal first");
    sendProposal.mutate({ id: savedProposal.id });
  };

  const proposalUrl = savedProposal?.publicToken
    ? `${window.location.origin}/proposal/${savedProposal.publicToken}`
    : null;

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="font-alfa text-3xl text-tomato/20 animate-pulse">LOADING...</div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="font-dm text-muted-foreground mb-4">Please sign in to create proposals.</p>
        <a href={getLoginUrl()}><Button className="bg-tomato text-white font-bebas tracking-widest rounded-none">SIGN IN</Button></a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-parchment font-dm">
      {/* Header */}
      <div className="bg-ink text-cream h-14 flex items-center px-6 sticky top-0 z-40 border-b-4 border-tomato">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="text-cream/60 hover:text-cream font-bebas tracking-widest text-xs gap-1 mr-4">
            <ChevronLeft className="w-4 h-4" /> DASHBOARD
          </Button>
        </Link>
        <div className="flex items-center mr-4">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
            alt="HOSTit"
            className="h-7 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>
          <div className="font-playfair italic text-amber/90 text-sm">Proposal Builder</div>
        <div className="ml-auto flex items-center gap-2">
          {savedProposal?.publicToken && (
            <Button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              variant="ghost"
              size="sm"
              className="text-cream/70 hover:text-cream hover:bg-cream/10 font-bebas tracking-widest text-xs gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              {pdfLoading ? "PDF..." : "PDF"}
            </Button>
          )}
          {!savedProposal ? (
            <Button onClick={handleSave} disabled={createProposal.isPending}
              variant="outline" className="border-amber/40 text-amber hover:bg-amber/10 font-bebas tracking-widest rounded-none text-xs bg-transparent">
              {createProposal.isPending ? "SAVING..." : "SAVE DRAFT"}
            </Button>
          ) : !sent ? (
            <Button onClick={handleSend} disabled={sendProposal.isPending}
              className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-xs gap-1">
              <Send className="w-3 h-3" /> {sendProposal.isPending ? "SENDING..." : "SEND TO CLIENT"}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-green-400 font-bebas text-xs tracking-widest">
              <CheckCircle className="w-4 h-4" /> SENT
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 grid lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Lead Info Banner */}
          {lead && (
            <div className="bg-amber/10 border-2 border-amber/40 p-4">
              <div className="font-bebas text-xs tracking-widest text-amber mb-1">CREATING PROPOSAL FOR</div>
              <div className="font-alfa text-lg text-ink">{lead.firstName} {lead.lastName}</div>
              <div className="font-dm text-sm text-muted-foreground">{lead.email} · {lead.eventType || "Event"}</div>
            </div>
          )}

          {/* Proposal Title & Intro */}
          <div className="bg-cream-card border border-border p-5 shadow-sm">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-4">PROPOSAL DETAILS</h2>
            <div className="space-y-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">PROPOSAL TITLE</label>
                <Input value={title} onChange={e => setTitle(e.target.value)}
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato font-dm" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">INTRO MESSAGE TO CLIENT</label>
                <Textarea value={introMessage} onChange={e => setIntroMessage(e.target.value)}
                  placeholder="Thank you for your enquiry! We'd love to host your event at our venue. Please find our proposal below..."
                  rows={3} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm" />
              </div>
            </div>
          </div>

          {/* Event Details */}
          <div className="bg-cream-card border border-border p-5 shadow-sm">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-4">EVENT DETAILS</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EVENT DATE</label>
                <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div>
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">GUEST COUNT</label>
                <Input type="number" value={guestCount} onChange={e => setGuestCount(e.target.value)}
                  placeholder="50" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
              <div className="col-span-2">
                <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">EVENT SPACE</label>
                <Input value={spaceName} onChange={e => setSpaceName(e.target.value)}
                  placeholder="The Main Dining Room"
                  className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato" />
              </div>
            </div>
          </div>

          {/* Menu Packages */}
          <div className="bg-cream-card border border-border shadow-sm">
            <button
              onClick={() => setMenuSectionOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 hover:bg-amber/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-amber" />
                <h2 className="font-bebas text-xs tracking-widest text-muted-foreground">MENU OPTIONS</h2>
                {selectedMenuPackageIds.length > 0 && (
                  <span className="bg-tomato text-white font-bebas text-xs px-2 py-0.5 rounded-full">{selectedMenuPackageIds.length} SELECTED</span>
                )}
              </div>
              {menuSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {menuSectionOpen && (
              <div className="px-5 pb-5">
                {!menuPackages || menuPackages.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-border">
                    <ChefHat className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="font-dm text-sm text-muted-foreground">No menu packages yet.</p>
                    <p className="font-dm text-xs text-muted-foreground/60 mt-1">Add Food or Beverage packages in Dashboard → Menu.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Food Packages */}
                    {menuPackages.filter(p => p.type === 'food').length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <UtensilsCrossed className="w-3.5 h-3.5 text-tomato" />
                          <span className="font-bebas text-xs tracking-widest text-tomato">FOOD PACKAGES</span>
                        </div>
                        <div className="grid gap-2">
                          {menuPackages.filter(p => p.type === 'food').map(pkg => (
                            <button
                              key={pkg.id}
                              onClick={() => toggleMenuPackage(pkg.id)}
                              className={`w-full text-left p-3 border-2 transition-all ${
                                selectedMenuPackageIds.includes(pkg.id)
                                  ? 'border-tomato bg-tomato/5'
                                  : 'border-border hover:border-tomato/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bebas text-sm tracking-wide text-ink">{pkg.name}</div>
                                  {pkg.description && <div className="font-dm text-xs text-muted-foreground mt-0.5">{pkg.description}</div>}
                                </div>
                                <div className="text-right shrink-0">
                                  {pkg.pricePerHead && (
                                    <div className="font-alfa text-sm text-tomato">${Number(pkg.pricePerHead).toFixed(2)}<span className="font-dm text-xs text-muted-foreground">/head</span></div>
                                  )}
                                  {selectedMenuPackageIds.includes(pkg.id) && (
                                    <div className="font-bebas text-xs text-tomato tracking-widest mt-0.5">✓ SELECTED</div>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Beverages Packages */}
                    {menuPackages.filter(p => p.type === 'beverages').length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Wine className="w-3.5 h-3.5 text-amber" />
                          <span className="font-bebas text-xs tracking-widest text-amber">BEVERAGES PACKAGES</span>
                        </div>
                        <div className="grid gap-2">
                          {menuPackages.filter(p => p.type === 'beverages').map(pkg => (
                            <button
                              key={pkg.id}
                              onClick={() => toggleMenuPackage(pkg.id)}
                              className={`w-full text-left p-3 border-2 transition-all ${
                                selectedMenuPackageIds.includes(pkg.id)
                                  ? 'border-amber bg-amber/5'
                                  : 'border-border hover:border-amber/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bebas text-sm tracking-wide text-ink">{pkg.name}</div>
                                  {pkg.description && <div className="font-dm text-xs text-muted-foreground mt-0.5">{pkg.description}</div>}
                                </div>
                                <div className="text-right shrink-0">
                                  {pkg.pricePerHead && (
                                    <div className="font-alfa text-sm text-amber">${Number(pkg.pricePerHead).toFixed(2)}<span className="font-dm text-xs text-muted-foreground">/head</span></div>
                                  )}
                                  {selectedMenuPackageIds.includes(pkg.id) && (
                                    <div className="font-bebas text-xs text-amber tracking-widest mt-0.5">✓ SELECTED</div>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Food & Beverages Packages */}
                    {menuPackages.filter(p => p.type === 'food_and_beverages').length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <ChefHat className="w-3.5 h-3.5 text-green-700" />
                          <span className="font-bebas text-xs tracking-widest text-green-700">FOOD & BEVERAGES PACKAGES</span>
                        </div>
                        <div className="grid gap-2">
                          {menuPackages.filter(p => p.type === 'food_and_beverages').map(pkg => (
                            <button
                              key={pkg.id}
                              onClick={() => toggleMenuPackage(pkg.id)}
                              className={`w-full text-left p-3 border-2 transition-all ${
                                selectedMenuPackageIds.includes(pkg.id)
                                  ? 'border-green-600 bg-green-50'
                                  : 'border-border hover:border-green-600/40'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bebas text-sm tracking-wide text-ink">{pkg.name}</div>
                                  {pkg.description && <div className="font-dm text-xs text-muted-foreground mt-0.5">{pkg.description}</div>}
                                </div>
                                <div className="text-right shrink-0">
                                  {pkg.pricePerHead && (
                                    <div className="font-alfa text-sm text-green-700">${Number(pkg.pricePerHead).toFixed(2)}<span className="font-dm text-xs text-muted-foreground">/head</span></div>
                                  )}
                                  {selectedMenuPackageIds.includes(pkg.id) && (
                                    <div className="font-bebas text-xs text-green-700 tracking-widest mt-0.5">✓ SELECTED</div>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
                className="font-bebas tracking-widest text-xs text-tomato gap-1">
                <Plus className="w-3 h-3" /> ADD ITEM
              </Button>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 mb-2">
              <div className="col-span-5 font-bebas text-xs tracking-widest text-muted-foreground">DESCRIPTION</div>
              <div className="col-span-2 font-bebas text-xs tracking-widest text-muted-foreground text-center">QTY</div>
              <div className="col-span-2 font-bebas text-xs tracking-widest text-muted-foreground text-right">UNIT PRICE</div>
              <div className="col-span-2 font-bebas text-xs tracking-widest text-muted-foreground text-right">TOTAL</div>
              <div className="col-span-1" />
            </div>

            <div className="space-y-2 mb-4">
              {lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input value={item.description} onChange={e => updateLineItem(i, "description", e.target.value)}
                      placeholder="Item description" className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm h-9" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" value={item.qty} onChange={e => updateLineItem(i, "qty", parseFloat(e.target.value) || 0)}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm h-9 text-center" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" value={item.unitPrice} onChange={e => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm h-9 text-right" />
                  </div>
                  <div className="col-span-2 text-right font-dm text-sm font-semibold text-ink">
                    ${item.total.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {lineItems.length > 1 && (
                      <button onClick={() => setLineItems(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground/40 hover:text-tomato transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
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
                <span>${subtotal.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center font-dm text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">GST</span>
                  <Input type="number" value={taxPercent} onChange={e => setTaxPercent(parseFloat(e.target.value) || 0)}
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm h-7 w-16 text-center" />
                  <span className="text-muted-foreground">%</span>
                </div>
                <span>${taxAmount.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-alfa text-lg text-ink border-t-2 border-border pt-2">
                <span>TOTAL (NZD)</span>
                <span className="text-tomato">${total.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center font-dm text-sm bg-amber/10 border border-amber/30 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-bebas text-xs tracking-widest text-amber">DEPOSIT REQUIRED</span>
                  <Input type="number" value={depositPercent} onChange={e => setDepositPercent(parseFloat(e.target.value) || 0)}
                    className="rounded-none border-2 border-amber/40 focus-visible:ring-0 focus-visible:border-amber text-sm h-7 w-16 text-center bg-transparent" />
                  <span className="text-amber text-xs">%</span>
                </div>
                <span className="font-alfa text-lg text-ink">${deposit.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Drinks Selection */}
          <div className="bg-cream-card border border-border shadow-sm">
            <button
              onClick={() => setDrinksSectionOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 hover:bg-black/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wine className="w-4 h-4 text-tomato" />
                <h2 className="font-bebas text-xs tracking-widest text-muted-foreground">DRINKS SELECTION</h2>
                {selectedDrinks.length > 0 && (
                  <span className="bg-tomato text-white font-bebas text-xs px-2 py-0.5 tracking-widest">
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
                            ? 'border-tomato bg-tomato/5'
                            : 'border-border hover:border-tomato/40'
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
                        value={tabAmount}
                        onChange={e => setTabAmount(e.target.value)}
                        placeholder="e.g. 1500"
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm w-36"
                      />
                    </div>
                  )}
                </div>

                {/* Drinks Menu */}
                {DRINKS_MENU.map(cat => (
                  <div key={cat.category}>
                    <div className="font-playfair italic text-sm text-tomato mb-2 border-b border-tomato/20 pb-1">{cat.category}</div>
                    <div className="space-y-1.5">
                      {cat.items.map((item: any) => (
                        <label
                          key={item.key}
                          className={`flex items-start gap-3 p-2 cursor-pointer rounded-sm transition-colors ${
                            selectedDrinks.includes(item.key) ? 'bg-tomato/5 border border-tomato/20' : 'hover:bg-black/5 border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDrinks.includes(item.key)}
                            onChange={() => toggleDrink(item.key)}
                            className="mt-0.5 accent-[oklch(0.45_0.18_25)]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-dm text-sm text-ink">{item.name}</div>
                            {item.description && <div className="font-dm text-xs text-muted-foreground">{item.description}</div>}
                          </div>
                          <div className="font-dm text-xs text-muted-foreground shrink-0 text-right">
                            {item.price ? `$${item.price}` : ''}
                            {item.priceGlass ? `$${item.priceGlass}/glass` : ''}
                            {item.priceBottle ? ` · $${item.priceBottle}/btl` : ''}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Custom Drinks */}
                <div>
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">CUSTOM DRINKS</div>
                  {customDrinks.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 mb-2 p-2 bg-amber/5 border border-amber/20">
                      <div className="flex-1 min-w-0">
                        <span className="font-dm text-sm text-ink">{d.name}</span>
                        {d.description && <span className="font-dm text-xs text-muted-foreground ml-2">{d.description}</span>}
                        {d.price && <span className="font-dm text-xs text-amber ml-2">${d.price}</span>}
                      </div>
                      <button onClick={() => removeCustomDrink(i)} className="text-muted-foreground/40 hover:text-tomato transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Input
                      value={newCustomDrink.name}
                      onChange={e => setNewCustomDrink(p => ({ ...p, name: e.target.value }))}
                      placeholder="Drink name"
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm"
                    />
                    <Input
                      value={newCustomDrink.description}
                      onChange={e => setNewCustomDrink(p => ({ ...p, description: e.target.value }))}
                      placeholder="Description (optional)"
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={newCustomDrink.price}
                        onChange={e => setNewCustomDrink(p => ({ ...p, price: e.target.value }))}
                        placeholder="Price"
                        className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm"
                      />
                      <Button size="sm" onClick={addCustomDrink} className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none px-3">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Save Drinks Button */}
                <Button
                  onClick={handleSaveDrinks}
                  disabled={saveDrinks.isPending}
                  className="w-full bg-ink hover:bg-ink/90 text-cream font-bebas tracking-widest rounded-none h-10 gap-2"
                >
                  <Wine className="w-4 h-4" />
                  {saveDrinks.isPending ? "SAVING DRINKS..." : "SAVE DRINKS SELECTION"}
                </Button>
              </div>
            )}
          </div>

          {/* Quote / Min-Spend Calculator */}
          <div className="bg-cream-card border border-border shadow-sm">
            <button
              type="button"
              className="w-full flex items-center justify-between p-5 text-left"
              onClick={() => setQuoteSectionOpen(o => !o)}
            >
              <div className="flex items-center gap-3">
                <span className="font-bebas text-xs tracking-widest text-muted-foreground">QUOTE &amp; MINIMUM SPEND</span>
                {minimumSpend && (
                  <span className="font-bebas text-xs tracking-widest bg-burgundy text-cream px-2 py-0.5">
                    MIN ${parseFloat(minimumSpend).toLocaleString("en-NZ")}
                  </span>
                )}
              </div>
              {quoteSectionOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {quoteSectionOpen && (
              <div className="px-5 pb-5 space-y-5">
                {/* Min Spend + Food Total */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MINIMUM SPEND (NZD)</label>
                    <Input
                      type="number" min="0" placeholder="e.g. 5000"
                      value={minimumSpend} onChange={e => setMinimumSpend(e.target.value)}
                      className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm"
                    />
                  </div>
                  <div>
                    <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">FOOD TOTAL OVERRIDE (NZD)</label>
                    <Input
                      type="number" min="0" placeholder={`Auto: $${_lineSubtotal().toLocaleString("en-NZ")}`}
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
                {minimumSpend && (
                  <div className="bg-ink text-cream p-4 space-y-2">
                    <div className="font-bebas text-xs tracking-widest text-amber mb-2">MINIMUM SPEND BREAKDOWN</div>
                    <div className="flex justify-between font-dm text-sm">
                      <span className="text-cream/60">Food &amp; Beverage</span>
                      <span>${_foodBase().toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                    </div>
                    {hireItems.map((item, i) => (
                      <div key={i} className="flex justify-between font-dm text-sm">
                        <span className="text-cream/60">{item.name || `Hire Item ${i + 1}`}</span>
                        <span>${(item.qty * item.unitPrice).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    {autoBarTab && autoBarTabAmount > 0 && (
                      <div className="flex justify-between font-dm text-sm text-amber">
                        <span>Bar Tab (auto remainder)</span>
                        <span>${autoBarTabAmount.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="border-t border-cream/20 pt-2 flex justify-between font-bebas text-sm">
                      <span>TOTAL vs MINIMUM SPEND</span>
                      <span className={(_foodBase() + hireItems.reduce((s, i) => s + i.qty * i.unitPrice, 0) + autoBarTabAmount) >= parseFloat(minimumSpend) ? "text-green-400" : "text-red-400"}>
                        ${(_foodBase() + hireItems.reduce((s, i) => s + i.qty * i.unitPrice, 0) + autoBarTabAmount).toLocaleString("en-NZ", { minimumFractionDigits: 2 })} / ${parseFloat(minimumSpend).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
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
                        <Input placeholder="Item name" value={item.name} onChange={e => updateHireItem(i, 'name', e.target.value)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-3">
                        <Input placeholder="Description" value={item.description} onChange={e => updateHireItem(i, 'description', e.target.value)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min="1" placeholder="Qty" value={item.qty} onChange={e => updateHireItem(i, 'qty', parseInt(e.target.value) || 1)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min="0" placeholder="Price" value={item.unitPrice} onChange={e => updateHireItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy text-sm h-8" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button type="button" onClick={() => removeHireItem(i)}
                          className="text-muted-foreground hover:text-destructive h-8 flex items-center">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quote Notes */}
                <div>
                  <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">QUOTE NOTES (shown to client)</label>
                  <Textarea value={quoteNotes} onChange={e => setQuoteNotes(e.target.value)}
                    placeholder="Any additional notes about this quote..." rows={2}
                    className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-burgundy resize-none text-sm font-dm" />
                </div>

                <Button onClick={handleSaveQuote} disabled={saveQuote.isPending}
                  className="w-full bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest rounded-none h-10">
                  {saveQuote.isPending ? "SAVING QUOTE..." : "SAVE QUOTE"}
                </Button>
              </div>
            )}
          </div>

          {/* Terms */}
          <div className="bg-cream-card border border-border p-5 shadow-sm">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">TERMS & CONDITIONS</h2>
            <Textarea value={termsAndConditions} onChange={e => setTermsAndConditions(e.target.value)}
              rows={5} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm font-dm" />
          </div>

          {/* Internal Notes */}
          <div className="bg-cream-card border border-dashed border-border p-5">
            <h2 className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">INTERNAL NOTES <span className="font-dm text-xs text-muted-foreground normal-case">(not shown to client)</span></h2>
            <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
              placeholder="Notes for your team only..." rows={2}
              className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm font-dm" />
          </div>
        </div>

        {/* Right: Summary & Actions */}
        <div className="space-y-4">
          {/* Expiry */}
          <div className="bg-cream-card border border-border p-4 shadow-sm">
            <h3 className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">PROPOSAL EXPIRY</h3>
            <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm" />
            <p className="font-dm text-xs text-muted-foreground mt-2">Client must respond before this date</p>
          </div>

          {/* Summary */}
          <div className="bg-ink text-cream p-5 shadow-sm">
            <div className="font-bebas text-xs tracking-widest text-amber mb-3">PROPOSAL SUMMARY</div>
            <div className="space-y-2 font-dm text-sm">
              <div className="flex justify-between">
                <span className="text-cream/60">For</span>
                <span>{lead ? `${lead.firstName} ${lead.lastName ?? ""}` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/60">Event</span>
                <span>{lead?.eventType || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/60">Date</span>
                <span>{eventDate ? new Date(eventDate).toLocaleDateString("en-NZ") : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cream/60">Guests</span>
                <span>{guestCount || "—"}</span>
              </div>
              <div className="border-t border-cream/20 pt-2 mt-2">
                <div className="flex justify-between font-alfa text-xl">
                  <span className="text-cream/60 text-sm">TOTAL</span>
                  <span className="text-amber">${total.toLocaleString("en-NZ", { minimumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between text-xs text-cream/50 mt-1">
                  <span>Deposit ({depositPercent}%)</span>
                  <span>${deposit.toLocaleString("en-NZ", { minimumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {!savedProposal ? (
            <Button onClick={handleSave} disabled={createProposal.isPending} className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-11">
              {createProposal.isPending ? "SAVING..." : "SAVE DRAFT"}
            </Button>
          ) : !sent ? (
            <div className="space-y-2">
              <div className="bg-green-50 border-2 border-green-200 p-3 text-center">
                <div className="font-bebas text-xs tracking-widest text-green-700">DRAFT SAVED</div>
                <div className="font-dm text-xs text-green-600 mt-0.5">Ready to send to client</div>
              </div>
              <Button onClick={handleSend} disabled={sendProposal.isPending}
                className="w-full bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-11 gap-2">
                <Send className="w-4 h-4" />
                {sendProposal.isPending ? "SENDING..." : "SEND TO CLIENT"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-green-50 border-2 border-green-400 p-4 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <div className="font-alfa text-lg text-green-700">PROPOSAL SENT!</div>
                <p className="font-dm text-xs text-green-600 mt-1">Share this link with your client</p>
              </div>
              {proposalUrl && (
                <div className="bg-white border-2 border-border p-3">
                  <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">CLIENT LINK</div>
                  <div className="font-dm text-xs text-muted-foreground break-all mb-2 bg-linen p-2 border border-border">{proposalUrl}</div>
                  <Button size="sm" onClick={() => { navigator.clipboard.writeText(proposalUrl); toast.success("Link copied!"); }}
                    className="w-full bg-ink text-cream font-bebas tracking-widest rounded-none text-xs gap-1">
                    <Copy className="w-3 h-3" /> COPY LINK
                  </Button>
                </div>
              )}
              <Link href="/dashboard">
                <Button variant="outline" className="w-full border-2 border-border font-bebas tracking-widest rounded-none text-xs">
                  BACK TO DASHBOARD
                </Button>
              </Link>
            </div>
          )}

          {/* Preview hint */}
          {savedProposal?.publicToken && !sent && (
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
      </div>
    </div>
  );
}
