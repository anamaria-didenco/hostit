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

interface ThemeTokens {
  header: string;
  headerText: string;
  headerMuted: string;
  bg: string;
  card: string;
  cardBorder: string;
  accent: string;
  accentText: string;
  ink: string;
  stone: string;
  border: string;
}

function getThemeTokens(themeKey: string | null | undefined): ThemeTokens {
  const map: Record<string, ThemeTokens> = {
    sage: {
      header: '#5a6b52', headerText: '#f5f2eb', headerMuted: '#b0bfa6',
      bg: '#f5f2eb', card: '#ffffff', cardBorder: '#ddd8ce',
      accent: '#c9a84c', accentText: '#ffffff',
      ink: '#2d3520', stone: '#7a8a72', border: '#ddd8ce',
    },
    forest: {
      header: '#2d5a27', headerText: '#FBF7E8', headerMuted: '#9abf94',
      bg: '#FBF7E8', card: '#ffffff', cardBorder: '#d0cbb8',
      accent: '#c9a84c', accentText: '#ffffff',
      ink: '#1a3d15', stone: '#4a6645', border: '#d0cbb8',
    },
    'dusty-merlot': {
      header: '#62202F', headerText: '#FBF7E8', headerMuted: '#c49090',
      bg: '#FBF7E8', card: '#ffffff', cardBorder: '#d8cec8',
      accent: '#BFAD0E', accentText: '#ffffff',
      ink: '#2d0d14', stone: '#7a5060', border: '#d8cec8',
    },
    brique: {
      header: '#741D28', headerText: '#FFF0F3', headerMuted: '#c49090',
      bg: '#FFF0F3', card: '#ffffff', cardBorder: '#e0d0d5',
      accent: '#B9AC39', accentText: '#ffffff',
      ink: '#3d0d14', stone: '#7a5060', border: '#e0d0d5',
    },
    charcoal: {
      header: '#1a1a2e', headerText: '#f0ede8', headerMuted: '#9090a8',
      bg: '#f0ede8', card: '#ffffff', cardBorder: '#d8d5d0',
      accent: '#d4a843', accentText: '#ffffff',
      ink: '#1a1a2e', stone: '#4a4a5a', border: '#d8d5d0',
    },
    olivie: {
      header: '#1a5c5c', headerText: '#edf5f5', headerMuted: '#80b0b0',
      bg: '#edf5f5', card: '#ffffff', cardBorder: '#c8dede',
      accent: '#e8734a', accentText: '#ffffff',
      ink: '#0d2e2e', stone: '#3a6060', border: '#c8dede',
    },
    seafoam: {
      header: '#4a6b3a', headerText: '#FBF7E8', headerMuted: '#9abf8a',
      bg: '#FBF7E8', card: '#ffffff', cardBorder: '#d5e0cc',
      accent: '#62202F', accentText: '#ffffff',
      ink: '#2d3a20', stone: '#6a7860', border: '#d5e0cc',
    },
    'retro-warm': {
      header: '#3d3d1a', headerText: '#ede8c0', headerMuted: '#9a9a70',
      bg: '#faf5e8', card: '#ffffff', cardBorder: '#e0d8b8',
      accent: '#f94e19', accentText: '#ffffff',
      ink: '#3d3d1a', stone: '#6a6a3a', border: '#e0d8b8',
    },
    claret: {
      header: '#6b2338', headerText: '#f0e8d8', headerMuted: '#c090a0',
      bg: '#f0e8d8', card: '#ffffff', cardBorder: '#d8c8c0',
      accent: '#2d6a9a', accentText: '#ffffff',
      ink: '#2d0d18', stone: '#6a4050', border: '#d8c8c0',
    },
    'midnight-rose': {
      header: '#1a1a3e', headerText: '#f5f0ea', headerMuted: '#a0a0c8',
      bg: '#f5f0ea', card: '#ffffff', cardBorder: '#d8d0e0',
      accent: '#e8b4c0', accentText: '#1a1a3e',
      ink: '#1a1a3e', stone: '#4a4a6a', border: '#d8d0e0',
    },
    matcha: {
      header: '#5a7a4a', headerText: '#f5f0e8', headerMuted: '#90b880',
      bg: '#f5f0e8', card: '#ffffff', cardBorder: '#d0d8c0',
      accent: '#c87941', accentText: '#ffffff',
      ink: '#2d3d20', stone: '#6a7a60', border: '#d0d8c0',
    },
    champagne: {
      header: '#3d1a3d', headerText: '#f0d8a8', headerMuted: '#a880a8',
      bg: '#faf5e8', card: '#ffffff', cardBorder: '#e0d5b8',
      accent: '#c9a84c', accentText: '#ffffff',
      ink: '#3d1a3d', stone: '#7a6050', border: '#e0d5b8',
    },
  };
  return map[themeKey ?? 'sage'] ?? map['sage'];
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
  const { data: drinksData } = trpc.proposals.getDrinksByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const DRINKS_MENU_MAP: Record<string, { name: string; description?: string; price?: number; priceGlass?: number; priceBottle?: number }> = {
    aperol_spritz: { name: "Aperol Spritz", description: "Aperol, Prosecco, Soda", price: 20 },
    campari_spritz: { name: "Campari Spritz", description: "Campari, Prosecco, Soda", price: 20 },
    limoncello_spritz: { name: "Limoncello Spritz", description: "Limoncello, Prosecco, Soda", price: 20 },
    hugo_spritz: { name: "Hugo Spritz", description: "Elderflower, Prosecco, Soda", price: 20 },
    classic_negroni: { name: "Classic Negroni", description: "Campari, Rosso Vermouth, Gin", price: 24 },
    negroni_sbagliato: { name: "Negroni Sbagliato", description: "Campari, Rosso Vermouth, Prosecco", price: 23 },
    cherry_negroni: { name: "Cherry Negroni", description: "Campari, Amaro, Rosso Vermouth, Gin", price: 25 },
    americano: { name: "Americano", description: "Campari, Rosso Vermouth, Soda", price: 23 },
    tallero_prosecco: { name: "Tallero Prosecco Extra Dry", description: "Veneto", priceGlass: 17, priceBottle: 85 },
    lambrusco: { name: "Paltrinieri Lambrusco Di Soraba Radice", description: "Emiglia Romagna", priceBottle: 105 },
    sauvignon_blanc: { name: "Mezzacorona Castel Firmian Sauvignon Blanc", description: "Trentino", priceGlass: 17, priceBottle: 85 },
    malvasia_chardonnay: { name: "Fantini Primo Malvasia Chardonnay", description: "Abruzzo", priceGlass: 16, priceBottle: 80 },
    pinot_grigio: { name: "Vigneti Romio Pinot Grigio Rubione IGT", description: "Friuli", priceGlass: 16, priceBottle: 80 },
    grillo: { name: "Parthenium Grillo", description: "Sicilia", priceBottle: 85 },
    pipoli_bianco: { name: "Pipoli Bianco Basilicata IGT", description: "Basilicata", priceBottle: 90 },
    rosato: { name: "Fattoria Di Basciano Rosato", description: "Toscana", priceGlass: 17, priceBottle: 85 },
    sangiovese_merlot: { name: "Primo Sangiovese Merlot", description: "Puglia", priceGlass: 16, priceBottle: 80 },
    chianti: { name: "Renzo Masi Chianti Cornioletta", description: "Toscana", priceGlass: 17, priceBottle: 85 },
    montepulciano: { name: "Fantini Montepulciano", description: "Abruzzo", priceGlass: 17, priceBottle: 85 },
    nebbiolo: { name: "Ascheri Langhe Nebbiolo San Giacomo", description: "Piemonte", priceBottle: 110 },
    barbaresco: { name: "Fontanabianca Barbaresco DOCG", description: "Piemonte", priceBottle: 165 },
    peroni_tap: { name: "Peroni Tap", description: "Italia", price: 14 },
    peroni_330: { name: "Peroni 330ml", description: "Italia", price: 12 },
    peroni_0: { name: "Peroni 0%", description: "Italia", price: 12 },
    ginger_ale: { name: "Fever Tree Ginger Ale", price: 8 },
    cola: { name: "Fever Tree Cola", price: 8 },
    blood_orange: { name: "Fever Tree Italian Blood Orange", price: 8 },
    lemonade: { name: "Fever Tree Italian Lemonade", price: 8 },
  };

  const BAR_OPTION_LABELS: Record<string, string> = {
    bar_tab: "Bar Tab",
    cash_bar: "Cash Bar",
    bar_tab_then_cash: "Bar Tab followed by Cash Bar",
    unlimited: "Unlimited Bar Tab",
  };

  const respond = trpc.proposals.respond.useMutation({
    onSuccess: (result) => {
      setResponded(result.status as any);
      setShowAccept(false);
      setShowDecline(false);
      toast.success(result.status === "accepted" ? "Booking confirmed! We'll be in touch soon." : "Response sent. Thank you.");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const venue = data?.venue;
  const T = getThemeTokens(venue?.themeKey);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: T.bg }}>
      <div className="text-2xl italic animate-pulse" style={{ color: T.accent, fontFamily: 'serif' }}>Loading proposal…</div>
    </div>
  );

  if (!data?.proposal) return (
    <div className="min-h-screen flex items-center justify-center text-center px-4" style={{ backgroundColor: T.bg }}>
      <div>
        <div className="text-4xl font-bold mb-4" style={{ color: T.ink, fontFamily: 'serif' }}>Proposal Not Found</div>
        <p style={{ color: T.stone }}>This proposal link may have expired or is invalid.</p>
      </div>
    </div>
  );

  const { proposal } = data;
  const lineItems: LineItem[] = (() => {
    try { return JSON.parse(proposal.lineItems ?? "[]"); } catch { return []; }
  })();

  const isExpired = proposal.expiresAt && new Date(proposal.expiresAt) < new Date();
  const canRespond = ["sent", "viewed"].includes(proposal.status) && !isExpired && !responded;
  const alreadyResponded = responded ?? (["accepted", "declined"].includes(proposal.status) ? proposal.status as any : null);

  const venuePhoto = venue?.coverImageUrl || venue?.bannerImageUrl;
  const venueLogo = venue?.logoUrl;

  return (
    <div className="min-h-screen font-inter" style={{ backgroundColor: T.bg }}>

      {/* ── Venue Cover Photo Banner ─────────────────────────────────── */}
      {venuePhoto && (
        <div
          className="w-full h-56 md:h-72 bg-cover bg-center relative"
          style={{ backgroundImage: `url(${venuePhoto})` }}
        >
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, ${T.header}cc)` }} />
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: T.header, color: T.headerText }}>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-3">
            {venueLogo ? (
              <img
                src={venueLogo}
                alt={venue?.name ?? "Venue"}
                className="h-12 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            ) : (
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
                alt="HOSTit"
                className="h-10 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            )}
          </div>
          <div className="font-bebas text-xs tracking-widest mb-4" style={{ color: T.headerMuted }}>EVENT PROPOSAL</div>
          {venue && (
            <div className="pt-4" style={{ borderTop: `1px solid ${T.headerText}18` }}>
              <div className="font-playfair text-2xl font-bold" style={{ color: T.headerText }}>{venue.name}</div>
              {venue.tagline && <div className="font-inter text-sm italic mt-0.5" style={{ color: T.headerMuted }}>{venue.tagline}</div>}
              {venue.city && (
                <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: T.headerMuted }}>
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
          <div className="p-5 mb-6 flex items-center gap-4 rounded-sm" style={{ backgroundColor: '#f0fdf4', border: `2px solid #86efac` }}>
            <CheckCircle className="w-8 h-8 flex-shrink-0" style={{ color: '#16a34a' }} />
            <div>
              <div className="font-playfair text-xl font-bold" style={{ color: '#15803d' }}>Booking Confirmed!</div>
              <p className="font-inter text-sm mt-0.5" style={{ color: '#166534' }}>You've accepted this proposal. The venue team will be in touch shortly to confirm details.</p>
            </div>
          </div>
        )}
        {alreadyResponded === "declined" && (
          <div className="p-5 mb-6 flex items-center gap-4 rounded-sm" style={{ backgroundColor: '#fef2f2', border: `2px solid #fca5a5` }}>
            <XCircle className="w-8 h-8 flex-shrink-0" style={{ color: '#dc2626' }} />
            <div>
              <div className="font-playfair text-xl font-bold" style={{ color: '#b91c1c' }}>Proposal Declined</div>
              <p className="font-inter text-sm mt-0.5" style={{ color: '#991b1b' }}>You've declined this proposal. The venue team has been notified.</p>
            </div>
          </div>
        )}
        {isExpired && !alreadyResponded && (
          <div className="p-4 mb-6 rounded-sm" style={{ backgroundColor: '#fffbeb', border: `2px solid #fcd34d` }}>
            <div className="font-bebas text-sm tracking-widest" style={{ color: '#92400e' }}>PROPOSAL EXPIRED</div>
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
              <span className="ml-3" style={{ color: T.accent }}>· Expires {new Date(proposal.expiresAt).toLocaleDateString("en-NZ")}</span>
            )}
          </div>
        </div>

        {/* Intro message */}
        {proposal.introMessage && (
          <div className="p-6 mb-6 rounded-sm" style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}` }}>
            <p className="font-playfair italic leading-relaxed text-base" style={{ color: T.stone }}>"{proposal.introMessage}"</p>
            {venue?.email && <div className="mt-3 font-inter text-xs" style={{ color: T.accent }}>{venue.email}</div>}
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
            <div key={detail.label} className="p-4 rounded-sm" style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-1.5 mb-1.5" style={{ color: T.header }}>{detail.icon}</div>
              <div className="font-bebas text-xs tracking-widest" style={{ color: T.stone }}>{detail.label}</div>
              <div className="font-playfair font-semibold text-sm mt-0.5" style={{ color: T.ink }}>{detail.value}</div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        {lineItems.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-sm" style={{ border: `1px solid ${T.cardBorder}` }}>
            <div className="px-6 py-3" style={{ backgroundColor: T.header }}>
              <div className="font-bebas text-sm tracking-widest" style={{ color: T.headerText }}>PRICING BREAKDOWN</div>
            </div>
            <div className="p-6" style={{ backgroundColor: T.card }}>
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
                  <span style={{ color: T.accent }}>${Number(proposal.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</span>
                </div>
                {proposal.depositNzd && (
                  <div className="p-3 flex justify-between items-center mt-2 rounded-sm" style={{ backgroundColor: T.header + '14', border: `1px solid ${T.header}30` }}>
                    <div>
                      <div className="font-bebas text-xs tracking-widest" style={{ color: T.header }}>DEPOSIT TO SECURE BOOKING</div>
                      <div className="font-inter text-xs" style={{ color: T.stone }}>{Number(proposal.depositPercent ?? 25)}% of total</div>
                    </div>
                    <div className="font-playfair text-xl font-bold" style={{ color: T.ink }}>${Number(proposal.depositNzd).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Drinks Selection */}
        {drinksData && (
          <div className="mb-6 overflow-hidden rounded-sm" style={{ border: `1px solid ${T.cardBorder}` }}>
            <div className="px-6 py-3" style={{ backgroundColor: T.header }}>
              <div className="font-bebas text-sm tracking-widest" style={{ color: T.headerText }}>DRINKS & BAR ARRANGEMENT</div>
            </div>
            <div className="p-6" style={{ backgroundColor: T.card }}>
              <div className="mb-4 p-3 rounded-sm" style={{ backgroundColor: T.bg, border: `1px solid ${T.border}` }}>
                <div className="font-bebas text-xs tracking-widest mb-0.5" style={{ color: T.stone }}>BAR ARRANGEMENT</div>
                <div className="font-playfair font-semibold text-base" style={{ color: T.ink }}>
                  {BAR_OPTION_LABELS[drinksData.barOption] ?? drinksData.barOption}
                </div>
                {drinksData.tabAmount && (
                  <div className="font-inter text-sm mt-0.5" style={{ color: T.accent }}>
                    Bar Tab Amount: ${Number(drinksData.tabAmount).toLocaleString("en-NZ", { minimumFractionDigits: 2 })} NZD
                  </div>
                )}
              </div>

              {drinksData.selectedDrinks && drinksData.selectedDrinks.length > 0 && (
                <div className="mb-4">
                  <div className="font-bebas text-xs tracking-widest mb-2" style={{ color: T.stone }}>SELECTED DRINKS</div>
                  <div className="space-y-1.5">
                    {(drinksData.selectedDrinks as string[]).map((key: string) => {
                      const drink = DRINKS_MENU_MAP[key];
                      if (!drink) return null;
                      return (
                        <div key={key} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0" style={{ borderColor: T.border }}>
                          <div>
                            <div className="font-playfair text-sm font-medium" style={{ color: T.ink }}>{drink.name}</div>
                            {drink.description && <div className="font-inter text-xs" style={{ color: T.stone }}>{drink.description}</div>}
                          </div>
                          <div className="font-inter text-xs shrink-0 ml-4" style={{ color: T.stone }}>
                            {drink.price ? `$${drink.price}` : ''}
                            {drink.priceGlass ? `$${drink.priceGlass}/glass` : ''}
                            {drink.priceBottle ? ` · $${drink.priceBottle}/btl` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {drinksData.customDrinks && (drinksData.customDrinks as any[]).length > 0 && (
                <div>
                  <div className="font-bebas text-xs tracking-widest mb-2" style={{ color: T.stone }}>ADDITIONAL DRINKS</div>
                  <div className="space-y-1.5">
                    {(drinksData.customDrinks as any[]).map((d: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0" style={{ borderColor: T.border }}>
                        <div>
                          <div className="font-playfair text-sm font-medium" style={{ color: T.ink }}>{d.name}</div>
                          {d.description && <div className="font-inter text-xs" style={{ color: T.stone }}>{d.description}</div>}
                        </div>
                        {d.price && <div className="font-inter text-xs" style={{ color: T.stone }}>${d.price}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Terms */}
        {proposal.termsAndConditions && (
          <div className="p-6 mb-6 rounded-sm" style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}` }}>
            <h3 className="font-bebas text-xs tracking-widest mb-3" style={{ color: T.stone }}>TERMS & CONDITIONS</h3>
            <div className="font-inter text-xs whitespace-pre-line leading-relaxed" style={{ color: T.stone }}>
              {proposal.termsAndConditions}
            </div>
          </div>
        )}

        {/* CTA */}
        {canRespond && (
          <div className="p-6 mb-8 rounded-sm" style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}` }}>
            <h3 className="font-playfair text-xl font-bold mb-2" style={{ color: T.ink }}>Ready to Book?</h3>
            <p className="font-inter text-sm mb-5" style={{ color: T.stone }}>
              Accept this proposal to confirm your booking. A deposit of ${Number(proposal.depositNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })} NZD will be required to secure your date.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setShowAccept(true)}
                className="flex-1 font-bebas tracking-widest rounded-none h-12 text-base gap-2"
                style={{ backgroundColor: T.header, color: T.headerText }}>
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
            {venueLogo ? (
              <img src={venueLogo} alt={venue?.name ?? "Venue"} className="h-8 w-auto object-contain" />
            ) : (
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png"
                alt="HOSTit"
                className="h-8 w-auto object-contain"
              />
            )}
          </div>
          <div className="font-bebas text-xs tracking-widest" style={{ color: T.stone }}>POWERED BY HOSTit · EVENT CRM FOR NEW ZEALAND VENUES</div>
          {venue?.phone && <div className="font-inter text-xs mt-1" style={{ color: T.stone }}>{venue.phone}</div>}
          {venue?.email && <div className="font-inter text-xs" style={{ color: T.stone }}>{venue.email}</div>}
        </div>
      </div>

      {/* Accept Dialog */}
      <Dialog open={showAccept} onOpenChange={setShowAccept}>
        <DialogContent className="max-w-md rounded-none border-2" style={{ borderColor: T.cardBorder }}>
          <DialogHeader>
            <div className="-mx-6 -mt-6 p-5 mb-4" style={{ backgroundColor: T.header }}>
              <DialogTitle className="font-bebas text-xl tracking-widest" style={{ color: T.headerText }}>CONFIRM YOUR BOOKING</DialogTitle>
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
              style={{ backgroundColor: T.header, color: T.headerText }}>
              <CheckCircle className="w-4 h-4" />
              {respond.isPending ? "CONFIRMING..." : "CONFIRM BOOKING"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={showDecline} onOpenChange={setShowDecline}>
        <DialogContent className="max-w-md rounded-none border-2" style={{ borderColor: T.cardBorder }}>
          <DialogHeader>
            <div className="-mx-6 -mt-6 p-5 mb-4" style={{ backgroundColor: T.accent }}>
              <DialogTitle className="font-bebas text-xl tracking-widest" style={{ color: T.accentText }}>DECLINE PROPOSAL</DialogTitle>
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
              style={{ backgroundColor: T.accent, color: T.accentText }}>
              {respond.isPending ? "SENDING..." : "DECLINE PROPOSAL"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
