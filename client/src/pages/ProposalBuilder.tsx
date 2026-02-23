import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Plus, Trash2, Send, FileText, Copy, CheckCircle } from "lucide-react";
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
    createProposal.mutate({
      leadId,
      title,
      introMessage: introMessage || undefined,
      eventDate: eventDate || undefined,
      guestCount: guestCount ? parseInt(guestCount) : undefined,
      spaceName: spaceName || undefined,
      lineItems,
      subtotalNzd: subtotal,
      taxPercent,
      taxNzd: taxAmount,
      totalNzd: total,
      depositPercent,
      depositNzd: deposit,
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
    <div className="min-h-screen bg-[#FAF7F2] font-dm">
      {/* Header */}
      <div className="bg-brown text-cream h-14 flex items-center px-6 sticky top-0 z-40 border-b-4 border-tomato">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="text-cream/60 hover:text-cream font-bebas tracking-widest text-xs gap-1 mr-4">
            <ChevronLeft className="w-4 h-4" /> DASHBOARD
          </Button>
        </Link>
        <div className="flex items-center gap-0.5 mr-4">
          <span className="font-alfa text-xl text-tomato">HOST</span>
          <span className="font-pacifico text-lg text-amber">it</span>
        </div>
        <div className="font-bebas text-amber tracking-widest text-sm">PROPOSAL BUILDER</div>
        <div className="ml-auto flex items-center gap-3">
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
              <div className="font-alfa text-lg text-brown">{lead.firstName} {lead.lastName}</div>
              <div className="font-dm text-sm text-muted-foreground">{lead.email} · {lead.eventType || "Event"}</div>
            </div>
          )}

          {/* Proposal Title & Intro */}
          <div className="bg-white border-2 border-border p-5 shadow-sm">
            <h2 className="font-alfa text-sm text-brown mb-4">PROPOSAL DETAILS</h2>
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
          <div className="bg-white border-2 border-border p-5 shadow-sm">
            <h2 className="font-alfa text-sm text-brown mb-4">EVENT DETAILS</h2>
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

          {/* Line Items */}
          <div className="bg-white border-2 border-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-alfa text-sm text-brown">PRICING</h2>
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
                  <div className="col-span-2 text-right font-dm text-sm font-semibold text-brown">
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
              <div className="flex justify-between font-alfa text-lg text-brown border-t-2 border-border pt-2">
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
                <span className="font-alfa text-lg text-brown">${deposit.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="bg-white border-2 border-border p-5 shadow-sm">
            <h2 className="font-alfa text-sm text-brown mb-3">TERMS & CONDITIONS</h2>
            <Textarea value={termsAndConditions} onChange={e => setTermsAndConditions(e.target.value)}
              rows={5} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm font-dm" />
          </div>

          {/* Internal Notes */}
          <div className="bg-white border-2 border-dashed border-border p-5">
            <h2 className="font-alfa text-sm text-brown mb-2">INTERNAL NOTES <span className="font-dm text-xs text-muted-foreground normal-case">(not shown to client)</span></h2>
            <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
              placeholder="Notes for your team only..." rows={2}
              className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato resize-none text-sm font-dm" />
          </div>
        </div>

        {/* Right: Summary & Actions */}
        <div className="space-y-4">
          {/* Expiry */}
          <div className="bg-white border-2 border-border p-4 shadow-sm">
            <h3 className="font-alfa text-sm text-brown mb-3">PROPOSAL EXPIRY</h3>
            <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-tomato text-sm" />
            <p className="font-dm text-xs text-muted-foreground mt-2">Client must respond before this date</p>
          </div>

          {/* Summary */}
          <div className="bg-brown text-cream p-5 shadow-sm">
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
                  <div className="font-dm text-xs text-muted-foreground break-all mb-2 bg-muted p-2">{proposalUrl}</div>
                  <Button size="sm" onClick={() => { navigator.clipboard.writeText(proposalUrl); toast.success("Link copied!"); }}
                    className="w-full bg-brown text-cream font-bebas tracking-widest rounded-none text-xs gap-1">
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
        </div>
      </div>
    </div>
  );
}
