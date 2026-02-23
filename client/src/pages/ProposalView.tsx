import { useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Calendar, Users, MapPin, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export default function ProposalView() {
  const { token } = useParams<{ token: string }>();
  const [showAccept, setShowAccept] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [clientMessage, setClientMessage] = useState("");
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);

  const { data, isLoading } = trpc.proposals.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const respond = trpc.proposals.respond.useMutation({
    onSuccess: (result) => {
      setResponded(result.status as any);
      setShowAccept(false);
      setShowDecline(false);
      toast.success(result.status === "accepted" ? "Booking confirmed! We'll be in touch soon." : "Response sent. Thank you.");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  if (isLoading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <div className="font-alfa text-3xl text-tomato/20 animate-pulse">LOADING PROPOSAL...</div>
    </div>
  );

  if (!data?.proposal) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center text-center px-4">
      <div>
        <div className="font-alfa text-4xl text-ink mb-4">PROPOSAL NOT FOUND</div>
        <p className="font-dm text-muted-foreground">This proposal link may have expired or is invalid.</p>
      </div>
    </div>
  );

  const { proposal, venue } = data;
  const lineItems: LineItem[] = (() => {
    try { return JSON.parse(proposal.lineItems ?? "[]"); } catch { return []; }
  })();

  const isExpired = proposal.expiresAt && new Date(proposal.expiresAt) < new Date();
  const canRespond = ["sent", "viewed"].includes(proposal.status) && !isExpired && !responded;
  const alreadyResponded = responded ?? (["accepted", "declined"].includes(proposal.status) ? proposal.status as any : null);

  return (
    <div className="min-h-screen bg-parchment font-dm">
      {/* Vintage header */}
      <div className="bg-ink text-cream">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-1 mb-1">
            <span className="font-alfa text-3xl text-tomato">HOST</span>
            <span className="font-pacifico text-2xl text-amber">it</span>
          </div>
          <div className="font-bebas text-xs tracking-widest text-cream/40">EVENT PROPOSAL</div>
          {venue && (
            <div className="mt-4 pt-4 border-t border-cream/10">
              <div className="font-alfa text-2xl text-cream">{venue.name}</div>
              {venue.tagline && <div className="font-dm text-sm text-cream/60 italic mt-0.5">{venue.tagline}</div>}
              {venue.city && (
                <div className="flex items-center gap-1.5 mt-2 text-cream/50 text-xs font-dm">
                  <MapPin className="w-3 h-3" />
                  {venue.address ? `${venue.address}, ${venue.city}` : venue.city}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Diagonal accent */}
      <div className="h-3 bg-tomato" />

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Status banner */}
        {alreadyResponded === "accepted" && (
          <div className="bg-green-50 border-2 border-green-400 p-5 mb-6 flex items-center gap-4">
            <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
            <div>
              <div className="font-alfa text-xl text-green-700">BOOKING CONFIRMED!</div>
              <p className="font-dm text-sm text-green-600 mt-0.5">You've accepted this proposal. The venue team will be in touch shortly to confirm details.</p>
            </div>
          </div>
        )}
        {alreadyResponded === "declined" && (
          <div className="bg-red-50 border-2 border-red-300 p-5 mb-6 flex items-center gap-4">
            <XCircle className="w-8 h-8 text-red-400 flex-shrink-0" />
            <div>
              <div className="font-alfa text-xl text-red-600">PROPOSAL DECLINED</div>
              <p className="font-dm text-sm text-red-500 mt-0.5">You've declined this proposal. The venue team has been notified.</p>
            </div>
          </div>
        )}
        {isExpired && !alreadyResponded && (
          <div className="bg-amber/10 border-2 border-amber/40 p-4 mb-6">
            <div className="font-bebas text-sm tracking-widest text-amber">PROPOSAL EXPIRED</div>
            <p className="font-dm text-xs text-muted-foreground mt-0.5">This proposal has expired. Please contact the venue for an updated proposal.</p>
          </div>
        )}

        {/* Proposal title */}
        <div className="mb-8">
          <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-1">PROPOSAL</div>
          <h1 className="font-alfa text-3xl text-ink leading-tight">{proposal.title}</h1>
          <div className="font-dm text-xs text-muted-foreground mt-2">
            Prepared on {new Date(proposal.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
            {proposal.expiresAt && !isExpired && (
              <span className="ml-3 text-amber">· Expires {new Date(proposal.expiresAt).toLocaleDateString("en-NZ")}</span>
            )}
          </div>
        </div>

        {/* Intro message */}
        {proposal.introMessage && (
          <div className="bg-cream-card border border-border p-6 mb-6 shadow-sm">
            <p className="font-playfair italic text-muted-foreground leading-relaxed text-base">"{proposal.introMessage}"</p>
            {venue?.email && <div className="mt-3 font-dm text-xs text-tomato">{venue.email}</div>}
          </div>
        )}

        {/* Event Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: <Calendar className="w-4 h-4" />, label: "EVENT DATE", value: proposal.eventDate ? new Date(proposal.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : null },
            { icon: <Users className="w-4 h-4" />, label: "GUESTS", value: proposal.guestCount ? `${proposal.guestCount} guests` : null },
            { icon: <MapPin className="w-4 h-4" />, label: "SPACE", value: proposal.spaceName },
            { icon: <Clock className="w-4 h-4" />, label: "EXPIRES", value: proposal.expiresAt ? new Date(proposal.expiresAt).toLocaleDateString("en-NZ") : null },
          ].filter(d => d.value).map(detail => (
            <div key={detail.label} className="bg-cream-card border border-border p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-tomato mb-1.5">{detail.icon}</div>
              <div className="font-bebas text-xs tracking-widest text-muted-foreground">{detail.label}</div>
              <div className="font-playfair font-semibold text-sm text-ink mt-0.5">{detail.value}</div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        {lineItems.length > 0 && (
          <div className="bg-cream-card border border-border shadow-sm mb-6">
            <div className="bg-ink px-6 py-3">
              <div className="font-alfa text-sm text-cream">PRICING BREAKDOWN</div>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-4">
                {lineItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-dashed border-border last:border-0">
                    <div>
                      <div className="font-playfair font-medium text-sm text-ink">{item.description}</div>
                      {item.qty > 1 && (
                        <div className="font-dm text-xs text-muted-foreground">{item.qty} × ${Number(item.unitPrice).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      )}
                    </div>
                    <div className="font-dm text-sm font-semibold text-ink">
                      ${Number(item.total).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-border pt-4 space-y-2">
                {proposal.subtotalNzd && (
                  <div className="flex justify-between font-dm text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span>${Number(proposal.subtotalNzd).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {proposal.taxNzd && (
                  <div className="flex justify-between font-dm text-sm text-muted-foreground">
                    <span>GST ({Number(proposal.taxPercent ?? 15)}%)</span>
                    <span>${Number(proposal.taxNzd).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between font-alfa text-2xl text-ink border-t-2 border-border pt-3">
                  <span>TOTAL (NZD)</span>
                  <span className="text-tomato">${Number(proposal.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                </div>
                {proposal.depositNzd && (
                  <div className="bg-amber/10 border border-amber/30 p-3 flex justify-between items-center">
                    <div>
                      <div className="font-bebas text-xs tracking-widest text-amber">DEPOSIT TO SECURE BOOKING</div>
                      <div className="font-dm text-xs text-muted-foreground">{Number(proposal.depositPercent ?? 25)}% of total</div>
                    </div>
                    <div className="font-alfa text-xl text-ink">${Number(proposal.depositNzd).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Terms */}
        {proposal.termsAndConditions && (
          <div className="bg-cream-card border border-border p-6 mb-6 shadow-sm">
            <h3 className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">TERMS & CONDITIONS</h3>
            <div className="font-dm text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
              {proposal.termsAndConditions}
            </div>
          </div>
        )}

        {/* CTA Buttons */}
        {canRespond && (
          <div className="bg-cream-card border border-border p-6 shadow-sm mb-8">
            <h3 className="font-alfa text-xl text-ink mb-2">READY TO BOOK?</h3>
            <p className="font-dm text-sm text-muted-foreground mb-5">
              Accept this proposal to confirm your booking. A deposit of ${Number(proposal.depositNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })} NZD will be required to secure your date.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setShowAccept(true)}
                className="flex-1 bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-12 text-base gap-2">
                <CheckCircle className="w-5 h-5" /> ACCEPT & BOOK
              </Button>
              <Button onClick={() => setShowDecline(true)} variant="outline"
                className="border-2 border-border hover:border-red-300 hover:text-red-500 font-bebas tracking-widest rounded-none h-12 text-xs">
                DECLINE
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-8 border-t-2 border-dashed border-border">
          <div className="flex items-center justify-center gap-0.5 mb-1">
            <span className="font-alfa text-lg text-ink">HOST</span>
            <span className="font-pacifico text-base text-tomato">it</span>
          </div>
          <div className="font-bebas text-xs tracking-widest text-muted-foreground">POWERED BY HOSTit · EVENT CRM FOR NEW ZEALAND VENUES</div>
          {venue?.phone && <div className="font-dm text-xs text-muted-foreground mt-1">{venue.phone}</div>}
          {venue?.email && <div className="font-dm text-xs text-muted-foreground">{venue.email}</div>}
        </div>
      </div>

      {/* Accept Dialog */}
      <Dialog open={showAccept} onOpenChange={setShowAccept}>
        <DialogContent className="max-w-md rounded-none border-2 border-brown/20">
          <DialogHeader>
            <div className="bg-green-600 -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-alfa text-xl text-white">CONFIRM YOUR BOOKING</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-dm text-sm text-muted-foreground">
              By accepting, you confirm you'd like to proceed with this booking. The venue team will contact you regarding the deposit payment.
            </p>
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">MESSAGE TO VENUE (OPTIONAL)</label>
              <Textarea value={clientMessage} onChange={e => setClientMessage(e.target.value)}
                placeholder="Any questions or notes for the venue team..."
                rows={3} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-green-500 resize-none text-sm" />
            </div>
            <Button onClick={() => respond.mutate({ token: token!, action: "accepted", clientMessage: clientMessage || undefined })}
              disabled={respond.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bebas tracking-widest rounded-none h-11 gap-2">
              <CheckCircle className="w-4 h-4" />
              {respond.isPending ? "CONFIRMING..." : "CONFIRM BOOKING"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={showDecline} onOpenChange={setShowDecline}>
        <DialogContent className="max-w-md rounded-none border-2 border-brown/20">
          <DialogHeader>
            <div className="bg-red-500 -mx-6 -mt-6 p-5 mb-4">
              <DialogTitle className="font-alfa text-xl text-white">DECLINE PROPOSAL</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-dm text-sm text-muted-foreground">
              Please let us know why you're declining so we can improve our proposals.
            </p>
            <div>
              <label className="font-bebas text-xs tracking-widest text-muted-foreground block mb-1">REASON (OPTIONAL)</label>
              <Textarea value={clientMessage} onChange={e => setClientMessage(e.target.value)}
                placeholder="e.g. Budget doesn't fit, found another venue, dates changed..."
                rows={3} className="rounded-none border-2 focus-visible:ring-0 focus-visible:border-red-400 resize-none text-sm" />
            </div>
            <Button onClick={() => respond.mutate({ token: token!, action: "declined", clientMessage: clientMessage || undefined })}
              disabled={respond.isPending}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bebas tracking-widest rounded-none h-11">
              {respond.isPending ? "SENDING..." : "DECLINE PROPOSAL"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
