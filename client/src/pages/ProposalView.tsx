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

// Paradiso colour tokens
const T = {
  teal:    'oklch(0.280 0.065 178)',
  tealMid: 'oklch(0.400 0.075 178)',
  terra:   'oklch(0.450 0.155 25)',
  cream:   'oklch(0.958 0.020 88)',
  ink:     'oklch(0.220 0.018 45)',
  stone:   'oklch(0.500 0.025 60)',
  border:  'oklch(0.875 0.022 80)',
};

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
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: T.cream }}>
      <div className="font-playfair text-2xl italic animate-pulse" style={{ color: T.terra }}>Loading proposal…</div>
    </div>
  );

  if (!data?.proposal) return (
    <div className="min-h-screen flex items-center justify-center text-center px-4" style={{ backgroundColor: T.cream }}>
      <div>
        <div className="font-playfair text-4xl font-bold mb-4" style={{ color: T.ink }}>Proposal Not Found</div>
        <p className="font-inter" style={{ color: T.stone }}>This proposal link may have expired or is invalid.</p>
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
    <div className="min-h-screen font-inter" style={{ backgroundColor: T.cream }}>

      {/* ── Paradiso Header ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: T.teal, color: T.cream }}>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center mb-1">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-wordmark-YTN7taJQKQTWDCMLsn9YaS.webp"
              alt="HOSTit"
              className="h-12 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>
          <div className="font-bebas text-xs tracking-widest mb-4" style={{ color: 'oklch(0.650 0.040 178)' }}>EVENT PROPOSAL</div>
          {venue && (
            <div className="pt-4" style={{ borderTop: `1px solid ${T.cream}18` }}>
              <div className="font-playfair text-2xl font-bold" style={{ color: T.cream }}>{venue.name}</div>
              {venue.tagline && <div className="font-inter text-sm italic mt-0.5" style={{ color: 'oklch(0.750 0.025 88)' }}>{venue.tagline}</div>}
              {venue.city && (
                <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'oklch(0.650 0.025 88)' }}>
                  <MapPin className="w-3 h-3" />
                  {venue.address ? `${venue.address}, ${venue.city}` : venue.city}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stripe accent band */}
      <div className="h-3 stripe-pattern" />

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Status banners */}
        {alreadyResponded === "accepted" && (
          <div className="p-5 mb-6 flex items-center gap-4 rounded-sm" style={{ backgroundColor: 'oklch(0.960 0.040 155)', border: `2px solid oklch(0.550 0.120 155)` }}>
            <CheckCircle className="w-8 h-8 flex-shrink-0" style={{ color: 'oklch(0.450 0.130 155)' }} />
            <div>
              <div className="font-playfair text-xl font-bold" style={{ color: 'oklch(0.320 0.100 155)' }}>Booking Confirmed!</div>
              <p className="font-inter text-sm mt-0.5" style={{ color: 'oklch(0.420 0.100 155)' }}>You've accepted this proposal. The venue team will be in touch shortly to confirm details.</p>
            </div>
          </div>
        )}
        {alreadyResponded === "declined" && (
          <div className="p-5 mb-6 flex items-center gap-4 rounded-sm" style={{ backgroundColor: 'oklch(0.970 0.030 25)', border: `2px solid oklch(0.650 0.120 25)` }}>
            <XCircle className="w-8 h-8 flex-shrink-0" style={{ color: 'oklch(0.550 0.140 25)' }} />
            <div>
              <div className="font-playfair text-xl font-bold" style={{ color: 'oklch(0.380 0.130 25)' }}>Proposal Declined</div>
              <p className="font-inter text-sm mt-0.5" style={{ color: 'oklch(0.480 0.110 25)' }}>You've declined this proposal. The venue team has been notified.</p>
            </div>
          </div>
        )}
        {isExpired && !alreadyResponded && (
          <div className="p-4 mb-6 rounded-sm" style={{ backgroundColor: 'oklch(0.970 0.025 80)', border: `2px solid oklch(0.700 0.080 75)` }}>
            <div className="font-bebas text-sm tracking-widest" style={{ color: 'oklch(0.500 0.100 75)' }}>PROPOSAL EXPIRED</div>
            <p className="font-inter text-xs mt-0.5" style={{ color: T.stone }}>This proposal has expired. Please contact the venue for an updated proposal.</p>
          </div>
        )}

        {/* Proposal title */}
        <div className="mb-8">
          <div className="font-bebas text-xs tracking-widest mb-1" style={{ color: T.stone }}>PROPOSAL</div>
          <h1 className="font-playfair text-3xl font-bold leading-tight" style={{ color: T.ink }}>{proposal.title}</h1>
          <div className="font-inter text-xs mt-2" style={{ color: T.stone }}>
            Prepared on {new Date(proposal.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}
            {proposal.expiresAt && !isExpired && (
              <span className="ml-3" style={{ color: T.terra }}>· Expires {new Date(proposal.expiresAt).toLocaleDateString("en-NZ")}</span>
            )}
          </div>
        </div>

        {/* Intro message */}
        {proposal.introMessage && (
          <div className="paradiso-card p-6 mb-6">
            <p className="font-playfair italic leading-relaxed text-base" style={{ color: T.stone }}>"{proposal.introMessage}"</p>
            {venue?.email && <div className="mt-3 font-inter text-xs" style={{ color: T.terra }}>{venue.email}</div>}
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
            <div key={detail.label} className="paradiso-card p-4">
              <div className="flex items-center gap-1.5 mb-1.5" style={{ color: T.tealMid }}>{detail.icon}</div>
              <div className="font-bebas text-xs tracking-widest" style={{ color: T.stone }}>{detail.label}</div>
              <div className="font-playfair font-semibold text-sm mt-0.5" style={{ color: T.ink }}>{detail.value}</div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        {lineItems.length > 0 && (
          <div className="paradiso-card mb-6 overflow-hidden">
            <div className="px-6 py-3" style={{ backgroundColor: T.teal }}>
              <div className="font-bebas text-sm tracking-widest" style={{ color: T.cream }}>PRICING BREAKDOWN</div>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-4">
                {lineItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-dashed last:border-0" style={{ borderColor: T.border }}>
                    <div>
                      <div className="font-playfair font-medium text-sm" style={{ color: T.ink }}>{item.description}</div>
                      {item.qty > 1 && (
                        <div className="font-inter text-xs" style={{ color: T.stone }}>{item.qty} × ${Number(item.unitPrice).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                      )}
                    </div>
                    <div className="font-inter text-sm font-semibold" style={{ color: T.ink }}>
                      ${Number(item.total).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-4 space-y-2" style={{ borderTop: `2px solid ${T.border}` }}>
                {proposal.subtotalNzd && (
                  <div className="flex justify-between font-inter text-sm" style={{ color: T.stone }}>
                    <span>Subtotal</span>
                    <span>${Number(proposal.subtotalNzd).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {proposal.taxNzd && (
                  <div className="flex justify-between font-inter text-sm" style={{ color: T.stone }}>
                    <span>GST ({Number(proposal.taxPercent ?? 15)}%)</span>
                    <span>${Number(proposal.taxNzd).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between font-playfair text-2xl font-bold pt-3" style={{ color: T.ink, borderTop: `2px solid ${T.border}` }}>
                  <span>Total (NZD)</span>
                  <span style={{ color: T.terra }}>${Number(proposal.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                </div>
                {proposal.depositNzd && (
                  <div className="p-3 flex justify-between items-center mt-2 rounded-sm" style={{ backgroundColor: 'oklch(0.970 0.025 80)', border: `1px solid oklch(0.700 0.080 75)` }}>
                    <div>
                      <div className="font-bebas text-xs tracking-widest" style={{ color: 'oklch(0.500 0.100 75)' }}>DEPOSIT TO SECURE BOOKING</div>
                      <div className="font-inter text-xs" style={{ color: T.stone }}>{Number(proposal.depositPercent ?? 25)}% of total</div>
                    </div>
                    <div className="font-playfair text-xl font-bold" style={{ color: T.ink }}>${Number(proposal.depositNzd).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Terms */}
        {proposal.termsAndConditions && (
          <div className="paradiso-card p-6 mb-6">
            <h3 className="font-bebas text-xs tracking-widest mb-3" style={{ color: T.stone }}>TERMS & CONDITIONS</h3>
            <div className="font-inter text-xs whitespace-pre-line leading-relaxed" style={{ color: T.stone }}>
              {proposal.termsAndConditions}
            </div>
          </div>
        )}

        {/* CTA */}
        {canRespond && (
          <div className="paradiso-card p-6 mb-8">
            <h3 className="font-playfair text-xl font-bold mb-2" style={{ color: T.ink }}>Ready to Book?</h3>
            <p className="font-inter text-sm mb-5" style={{ color: T.stone }}>
              Accept this proposal to confirm your booking. A deposit of ${Number(proposal.depositNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })} NZD will be required to secure your date.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setShowAccept(true)}
                className="flex-1 font-bebas tracking-widest rounded-none h-12 text-base gap-2"
                style={{ backgroundColor: T.tealMid, color: T.cream }}>
                <CheckCircle className="w-5 h-5" /> ACCEPT & BOOK
              </Button>
              <Button onClick={() => setShowDecline(true)} variant="outline"
                className="font-bebas tracking-widest rounded-none h-12 text-xs border-2 bg-transparent"
                style={{ borderColor: T.border, color: T.stone }}>
                DECLINE
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-8 border-t-2 border-dashed" style={{ borderColor: T.border }}>
          <div className="flex items-center justify-center mb-1">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-wordmark-YTN7taJQKQTWDCMLsn9YaS.webp"
              alt="HOSTit"
              className="h-8 w-auto object-contain"
            />
          </div>
          <div className="font-bebas text-xs tracking-widest" style={{ color: T.stone }}>POWERED BY HOSTit · EVENT CRM FOR NEW ZEALAND VENUES</div>
          {venue?.phone && <div className="font-inter text-xs mt-1" style={{ color: T.stone }}>{venue.phone}</div>}
          {venue?.email && <div className="font-inter text-xs" style={{ color: T.stone }}>{venue.email}</div>}
        </div>
      </div>

      {/* Accept Dialog */}
      <Dialog open={showAccept} onOpenChange={setShowAccept}>
        <DialogContent className="max-w-md rounded-none border-2" style={{ borderColor: T.border }}>
          <DialogHeader>
            <div className="-mx-6 -mt-6 p-5 mb-4" style={{ backgroundColor: T.tealMid }}>
              <DialogTitle className="font-bebas text-xl tracking-widest" style={{ color: T.cream }}>CONFIRM YOUR BOOKING</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-inter text-sm" style={{ color: T.stone }}>
              By accepting, you confirm you'd like to proceed with this booking. The venue team will contact you regarding the deposit payment.
            </p>
            <div>
              <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>MESSAGE TO VENUE (OPTIONAL)</label>
              <Textarea value={clientMessage} onChange={e => setClientMessage(e.target.value)}
                placeholder="Any questions or notes for the venue team..."
                rows={3} className="rounded-none border-2 focus-visible:ring-0 resize-none text-sm font-inter" />
            </div>
            <Button onClick={() => respond.mutate({ token: token!, action: "accepted", clientMessage: clientMessage || undefined })}
              disabled={respond.isPending}
              className="w-full font-bebas tracking-widest rounded-none h-11 gap-2"
              style={{ backgroundColor: T.tealMid, color: T.cream }}>
              <CheckCircle className="w-4 h-4" />
              {respond.isPending ? "CONFIRMING..." : "CONFIRM BOOKING"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={showDecline} onOpenChange={setShowDecline}>
        <DialogContent className="max-w-md rounded-none border-2" style={{ borderColor: T.border }}>
          <DialogHeader>
            <div className="-mx-6 -mt-6 p-5 mb-4" style={{ backgroundColor: T.terra }}>
              <DialogTitle className="font-bebas text-xl tracking-widest" style={{ color: T.cream }}>DECLINE PROPOSAL</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-inter text-sm" style={{ color: T.stone }}>
              Please let us know why you're declining so we can improve our proposals.
            </p>
            <div>
              <label className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>REASON (OPTIONAL)</label>
              <Textarea value={clientMessage} onChange={e => setClientMessage(e.target.value)}
                placeholder="e.g. Budget doesn't fit, found another venue, dates changed..."
                rows={3} className="rounded-none border-2 focus-visible:ring-0 resize-none text-sm font-inter" />
            </div>
            <Button onClick={() => respond.mutate({ token: token!, action: "declined", clientMessage: clientMessage || undefined })}
              disabled={respond.isPending}
              className="w-full font-bebas tracking-widest rounded-none h-11"
              style={{ backgroundColor: T.terra, color: T.cream }}>
              {respond.isPending ? "SENDING..." : "DECLINE PROPOSAL"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
