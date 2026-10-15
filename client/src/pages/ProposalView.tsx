import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Calendar, Users, MapPin, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { currency } from "@/lib/money";
import { DRINKS_BY_KEY, drinkPriceLabel } from "@shared/drinksMenu";
import { selectedSharedMenuSections } from "@shared/proposalSharedMenu";
import { proposalMoney, clientLineText, isEmptyLine } from "@shared/proposalTotals";
import { isPackageLine } from "@shared/proposalPackages";
import { venueBrand } from "@shared/brand";

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
  // `accent` (used for the total + highlights, and as a filled button bg),
  // `stone` (muted body text) and `headerMuted` (subtitle on the coloured
  // header) are tuned to meet WCAG AA: accent darkened so it reads on white
  // AND carries white text; stone darkened where it was too light on white;
  // headerMuted lightened so it reads on its header. Hues are preserved.
  const map: Record<string, ThemeTokens> = {
    sage: {
      header: '#5a6b52', headerText: '#f5f2eb', headerMuted: '#e3e8df',
      bg: '#f5f2eb', card: '#ffffff', cardBorder: '#ddd8ce',
      accent: '#7d682f', accentText: '#ffffff',
      ink: '#2d3520', stone: '#64715d', border: '#ddd8ce',
    },
    forest: {
      header: '#4f72e0', headerText: '#FBF7E8', headerMuted: '#ffffff',
      bg: '#FBF7E8', card: '#ffffff', cardBorder: '#d0cbb8',
      accent: '#816c31', accentText: '#ffffff',
      ink: '#2d4ec2', stone: '#4a6645', border: '#d0cbb8',
    },
    'dusty-merlot': {
      header: '#62202F', headerText: '#FBF7E8', headerMuted: '#c89797',
      bg: '#FBF7E8', card: '#ffffff', cardBorder: '#d8cec8',
      accent: '#7a6f09', accentText: '#ffffff',
      ink: '#2d0d14', stone: '#7a5060', border: '#d8cec8',
    },
    brique: {
      header: '#741D28', headerText: '#FFF0F3', headerMuted: '#cca0a0',
      bg: '#FFF0F3', card: '#ffffff', cardBorder: '#e0d0d5',
      accent: '#766e24', accentText: '#ffffff',
      ink: '#3d0d14', stone: '#7a5060', border: '#e0d0d5',
    },
    charcoal: {
      header: '#1a1a2e', headerText: '#f0ede8', headerMuted: '#9090a8',
      bg: '#f0ede8', card: '#ffffff', cardBorder: '#d8d5d0',
      accent: '#7f6528', accentText: '#ffffff',
      ink: '#1a1a2e', stone: '#4a4a5a', border: '#d8d5d0',
    },
    olivie: {
      header: '#1a5c5c', headerText: '#edf5f5', headerMuted: '#b0cece',
      bg: '#edf5f5', card: '#ffffff', cardBorder: '#c8dede',
      accent: '#ac5537', accentText: '#ffffff',
      ink: '#0d2e2e', stone: '#3a6060', border: '#c8dede',
    },
    seafoam: {
      header: '#4a6b3a', headerText: '#FBF7E8', headerMuted: '#d7e5d0',
      bg: '#FBF7E8', card: '#ffffff', cardBorder: '#d5e0cc',
      accent: '#62202F', accentText: '#ffffff',
      ink: '#2d3a20', stone: '#66735c', border: '#d5e0cc',
    },
    'retro-warm': {
      header: '#3d3d1a', headerText: '#ede8c0', headerMuted: '#aaaa87',
      bg: '#faf5e8', card: '#ffffff', cardBorder: '#e0d8b8',
      accent: '#c73e14', accentText: '#ffffff',
      ink: '#3d3d1a', stone: '#6a6a3a', border: '#e0d8b8',
    },
    claret: {
      header: '#6b2338', headerText: '#f0e8d8', headerMuted: '#c89dab',
      bg: '#f0e8d8', card: '#ffffff', cardBorder: '#d8c8c0',
      accent: '#2d6a9a', accentText: '#ffffff',
      ink: '#2d0d18', stone: '#6a4050', border: '#d8c8c0',
    },
    'midnight-rose': {
      header: '#1a1a3e', headerText: '#f5f0ea', headerMuted: '#a0a0c8',
      bg: '#f5f0ea', card: '#ffffff', cardBorder: '#d8d0e0',
      accent: '#82656c', accentText: '#ffffff',
      ink: '#1a1a3e', stone: '#4a4a6a', border: '#d8d0e0',
    },
    matcha: {
      header: '#5a7a4a', headerText: '#f5f0e8', headerMuted: '#f8fbf7',
      bg: '#f5f0e8', card: '#ffffff', cardBorder: '#d0d8c0',
      accent: '#985c31', accentText: '#ffffff',
      ink: '#2d3d20', stone: '#627058', border: '#d0d8c0',
    },
    champagne: {
      header: '#3d1a3d', headerText: '#f0d8a8', headerMuted: '#aa83aa',
      bg: '#faf5e8', card: '#ffffff', cardBorder: '#e0d5b8',
      accent: '#816c31', accentText: '#ffffff',
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
  // The menu picked, when the proposal offers a choice of menus.
  const [chosenMenu, setChosenMenu] = useState<string | null>(null);
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);
  // Only true when the server actually emailed the client a confirmation.
  const [confirmationEmailed, setConfirmationEmailed] = useState(false);

  const { data, isLoading } = trpc.proposals.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );
  const { data: drinksData } = trpc.proposals.getDrinksByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  const BAR_OPTION_LABELS: Record<string, string> = {
    bar_tab: "Bar Tab",
    cash_bar: "Cash Bar",
    bar_tab_then_cash: "Bar Tab followed by Cash Bar",
    unlimited: "Unlimited Bar Tab",
  };

  const respond = trpc.proposals.respond.useMutation({
    onSuccess: (result) => {
      setResponded(result.status);
      setConfirmationEmailed(result.confirmationEmailed);
      setShowAccept(false);
      setShowDecline(false);
      setClientMessage("");
      // The answer banner sits at the top of the page; bring it into view.
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success(result.status === "accepted" ? "Booking confirmed." : "Thanks — your reply has been sent.");
    },
    // The server's messages are written for the client (expired, already
    // answered, not ready yet), so show them as they are.
    onError: (e) => toast.error(e.message || "Something went wrong. Please try again."),
  });

  const venue = data?.venue;
  // The venue's Brand Pack (accent colour, fonts, logo) leads; the theme only
  // supplies the page's neutral background and text colours.
  const brand = venueBrand(venue as any);
  const T: ThemeTokens = {
    ...getThemeTokens(venue?.themeKey),
    header: brand.accent, headerText: brand.onAccent,
    headerMuted: brand.onAccent === "#fff" ? "rgba(255,255,255,0.82)" : "rgba(26,26,26,0.72)",
    accent: brand.accent, accentText: brand.onAccent,
  };
  useEffect(() => {
    if (!venue) return;
    const id = "vf-brand-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet"; link.href = brand.fontLink;
    document.head.appendChild(link);
  }, [venue, brand.fontLink]);

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

  // A choice of menus: each priced on its own, the client picks one.
  const menuOptions = proposalMoney(lineItems, Number(proposal.taxPercent ?? 15), Number(proposal.depositPercent ?? 25), (proposal as any).menuChoice).options;
  const menus: Array<{ line: string; name: string; description: string | null; menu: string | null }> = (data as any).menus ?? [];
  const photos: Array<{ id: number; caption: string | null }> = (data as any).photos ?? [];
  const menuFor = (line: string) => menus.find(m => m.line === line);
  const shownLines = lineItems.filter(l => !isEmptyLine(l) && !(menuOptions.length && isPackageLine(l.description)));
  const chosenOption = menuOptions.find(o => o.line === chosenMenu) ?? null;

  const isExpired = proposal.expiresAt && new Date(proposal.expiresAt) < new Date();
  const canRespond = ["sent", "viewed"].includes(proposal.status) && !isExpired && !responded;
  const alreadyResponded = responded ?? (["accepted", "declined"].includes(proposal.status) ? proposal.status as any : null);

  const venuePhoto = venue?.coverImageUrl || venue?.bannerImageUrl;
  const venueLogo = venue?.logoUrl;

  return (
    <div className="vf-proposal min-h-screen font-inter" style={{ backgroundColor: T.bg }}>
      <style>{`.vf-proposal .font-playfair{font-family:${brand.serif}} .vf-proposal, .vf-proposal .font-inter{font-family:${brand.sans}}`}</style>

      {/* ── Hero: venue photo (or the venue's colour), logo, and the title ── */}
      <header className="relative overflow-hidden" style={{ backgroundColor: T.header, color: T.headerText }}>
        {venuePhoto && (
          <>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venuePhoto})` }} aria-hidden />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 35%, rgba(0,0,0,0.78) 100%)' }} aria-hidden />
          </>
        )}
        <div className={`relative max-w-3xl mx-auto px-6 flex flex-col ${venuePhoto ? 'min-h-[340px] md:min-h-[420px] pt-8 pb-24 md:pb-28' : 'pt-10 pb-24 md:pb-28'}`}
          style={{ color: venuePhoto ? '#fff' : T.headerText }}>
          <div className="flex items-center justify-between gap-4">
            {venueLogo ? (
              <img src={venueLogo} alt={venue?.name ?? "Venue"} className="h-12 md:h-14 w-auto max-w-[60%] object-contain"
                style={{ filter: (venuePhoto || brand.onAccent === "#fff") ? 'brightness(0) invert(1)' : 'none' }} />
            ) : (
              <span className="font-playfair text-xl md:text-2xl font-bold">{venue?.name ?? ""}</span>
            )}
            {venue?.city && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs opacity-85"><MapPin className="w-3 h-3" aria-hidden />{venue.city}</span>
            )}
          </div>
          <div className={venuePhoto ? 'mt-auto pt-16' : 'pt-10'}>
            <div className="font-bebas text-xs tracking-[0.25em] mb-3" style={{ color: 'inherit', opacity: 0.85 }}>EVENT PROPOSAL</div>
            <h1 className="font-playfair font-bold leading-[1.08] text-[2rem] md:text-5xl m-0" style={{ color: 'inherit', textWrap: 'balance' }}>{proposal.title}</h1>
            {venue?.tagline && !venuePhoto && <div className="font-inter text-sm italic mt-3 opacity-85">{venue.tagline}</div>}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-0 pb-10">
        {/* Key facts */}
        {(() => {
          const facts = [
            { icon: <Calendar className="w-4 h-4" />, label: "Date", value: proposal.eventDate ? new Date(proposal.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "long", year: "numeric" }) : null },
            { icon: <Users className="w-4 h-4" />, label: "Guests", value: proposal.guestCount ? String(proposal.guestCount) : null },
            { icon: <MapPin className="w-4 h-4" />, label: "Space", value: proposal.spaceName },
            { icon: <Clock className="w-4 h-4" />, label: isExpired ? "Expired" : "Valid until", value: proposal.expiresAt ? new Date(proposal.expiresAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : null },
          ].filter(f => f.value);
          if (facts.length === 0) return null;
          return (
            <dl className="-mt-14 md:-mt-16 relative mb-8 flex flex-wrap overflow-hidden rounded-sm shadow-sm m-0"
              style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}` }}>
              {facts.map((f, i) => (
                <div key={f.label} className="px-5 py-4 min-w-0 basis-1/2 md:basis-0 md:flex-1 grow"
                  style={{ borderLeft: i === 0 ? 'none' : `1px solid ${T.cardBorder}`, borderTop: i >= 2 ? `1px solid ${T.cardBorder}` : 'none' }}>
                  <dt className="flex items-center gap-1.5 font-bebas text-xs tracking-widest" style={{ color: T.stone }}>
                    <span style={{ color: T.accent }}>{f.icon}</span>{f.label}
                  </dt>
                  <dd className="m-0 mt-1 font-playfair font-semibold text-base break-words" style={{ color: T.ink }}>{f.value}</dd>
                </div>
              ))}
            </dl>
          );
        })()}



        {/* Status banners */}
        {alreadyResponded === "accepted" && (
          <div className="p-5 mb-6 flex items-center gap-4 rounded-sm" style={{ backgroundColor: '#f0fdf4', border: `2px solid #86efac` }}>
            <CheckCircle className="w-8 h-8 flex-shrink-0" style={{ color: '#16a34a' }} />
            <div>
              <div className="font-playfair text-xl font-bold" style={{ color: '#15803d' }}>You're booked in</div>
              <p className="font-inter text-sm mt-0.5" style={{ color: '#166534' }}>
                {responded
                  ? `Thank you for accepting. We've let the venue team know${confirmationEmailed ? " and emailed you a confirmation" : ""} — they'll be in touch about the next steps.`
                  : "You've accepted this proposal and your booking is confirmed. The venue team will be in touch about the next steps."}
              </p>
            </div>
          </div>
        )}
        {alreadyResponded === "declined" && (
          <div className="p-5 mb-6 flex items-center gap-4 rounded-sm" style={{ backgroundColor: '#fef2f2', border: `2px solid #fca5a5` }}>
            <XCircle className="w-8 h-8 flex-shrink-0" style={{ color: '#dc2626' }} />
            <div>
              <div className="font-playfair text-xl font-bold" style={{ color: '#b91c1c' }}>Proposal Declined</div>
              <p className="font-inter text-sm mt-0.5" style={{ color: '#991b1b' }}>You've declined this proposal and the venue team has been told. Thanks for letting us know.</p>
            </div>
          </div>
        )}
        {isExpired && !alreadyResponded && (
          <div className="p-4 mb-6 rounded-sm" style={{ backgroundColor: '#fffbeb', border: `2px solid #fcd34d` }}>
            <div className="font-bebas text-sm tracking-widest" style={{ color: '#92400e' }}>PROPOSAL EXPIRED</div>
            <p className="font-inter text-xs mt-0.5" style={{ color: T.stone }}>This proposal has expired. Please contact the venue for an updated proposal.</p>
          </div>
        )}

        {/* Intro message */}
        {proposal.introMessage && (
          <div className="p-6 mb-6 rounded-sm" style={{ backgroundColor: T.card, border: `1px solid ${T.cardBorder}` }}>
            <p className="font-playfair italic leading-relaxed text-base" style={{ color: T.stone }}>"{proposal.introMessage}"</p>
            {venue?.email && <div className="mt-3 font-inter text-xs" style={{ color: T.accent }}>{venue.email}</div>}
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="mb-6 flex gap-2 overflow-x-auto snap-x" role="list" aria-label="Photos">
            {photos.map((ph, i) => (
              <figure key={ph.id} role="listitem" className="m-0 snap-start" style={{ flex: photos.length <= 4 ? '1 1 0' : '0 0 220px', minWidth: photos.length <= 4 ? '140px' : undefined }}>
                <img src={`/api/proposal-photo/${token}/${ph.id}`} alt={ph.caption || `Photo ${i + 1}`} loading="lazy"
                  className="w-full aspect-[4/3] object-cover rounded-sm" style={{ border: `1px solid ${T.cardBorder}` }} />
                {ph.caption && <figcaption className="font-inter text-xs mt-1" style={{ color: T.stone }}>{ph.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}

        {/* Pricing */}
        {lineItems.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-sm" style={{ border: `1px solid ${T.cardBorder}` }}>
            <div className="px-6 py-3" style={{ backgroundColor: T.header }}>
              <h2 className="font-bebas text-sm tracking-widest m-0" style={{ color: T.headerText }}>PRICING BREAKDOWN</h2>
            </div>
            <div className="p-6" style={{ backgroundColor: T.card }}>
              <div className="space-y-3 mb-4">
                {shownLines.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-dashed last:border-0" style={{ borderColor: T.border }}>
                    <div>
                      <div className="font-playfair font-medium text-sm" style={{ color: T.ink }}>{clientLineText(item.description)}</div>
                      {item.qty > 1 && (
                        <div className="font-inter text-xs" style={{ color: T.stone }}>{item.qty} × {currency(Number(item.unitPrice))}</div>
                      )}
                    </div>
                    <div className="font-inter text-sm font-semibold" style={{ color: T.ink }}>
                      {Number(item.total) === 0 ? "Included" : currency(Number(item.total))}
                    </div>
                  </div>
                ))}
              </div>
              {menuOptions.length > 0 ? (
                <div className="pt-4 space-y-3" style={{ borderTop: `2px solid ${T.border}` }}>
                  <div>
                    <div className="font-bebas text-sm tracking-widest" style={{ color: T.header }}>CHOOSE YOUR MENU</div>
                    <div className="font-inter text-xs" style={{ color: T.stone }}>Each price includes everything above and GST.{canRespond ? " Pick one, then confirm below." : ""}</div>
                  </div>
                  {menuOptions.map(o => {
                    const m = menuFor(o.line);
                    const picked = chosenMenu === o.line;
                    return (
                      <div key={o.line} className="rounded-sm" style={{ border: `2px solid ${picked ? T.accent : T.border}`, backgroundColor: picked ? T.header + '0d' : T.card }}>
                        <label className={`flex items-start gap-3 p-4 ${canRespond ? 'cursor-pointer' : ''}`}>
                          {canRespond && (
                            <input type="radio" name="menu-choice" checked={picked} onChange={() => setChosenMenu(o.line)} className="mt-1.5 w-4 h-4" style={{ accentColor: T.accent }} />
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="flex justify-between items-baseline gap-3">
                              <span className="font-playfair text-lg font-bold" style={{ color: T.ink }}>{o.name}</span>
                              <span className="font-playfair text-xl font-bold whitespace-nowrap" style={{ color: T.accent }}>{currency(o.total)}</span>
                            </span>
                            {m?.description && <span className="block font-inter text-sm mt-0.5" style={{ color: T.stone }}>{m.description}</span>}
                            <span className="block font-inter text-xs mt-1" style={{ color: T.stone }}>Deposit to secure: {currency(o.deposit)} ({Number(proposal.depositPercent ?? 25)}%)</span>
                          </span>
                        </label>
                        {m?.menu && (
                          <details className="px-4 pb-4">
                            <summary className="cursor-pointer font-bebas text-xs tracking-widest" style={{ color: T.header }}>SEE THE MENU</summary>
                            <pre className="mt-2 font-inter text-sm whitespace-pre-wrap break-words" style={{ color: T.ink }}>{m.menu}</pre>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="pt-4 space-y-2" style={{ borderTop: `2px solid ${T.border}` }}>
                {proposal.subtotalNzd && (
                  <div className="flex justify-between font-inter text-sm" style={{ color: T.stone }}>
                    <span>Subtotal</span>
                    <span>{currency(Number(proposal.subtotalNzd))}</span>
                  </div>
                )}
                {proposal.taxNzd && (
                  <div className="flex justify-between font-inter text-sm" style={{ color: T.stone }}>
                    <span>GST ({Number(proposal.taxPercent ?? 15)}%)</span>
                    <span>{currency(Number(proposal.taxNzd))}</span>
                  </div>
                )}
                <div className="flex justify-between font-playfair text-2xl font-bold pt-3" style={{ color: T.ink, borderTop: `2px solid ${T.border}` }}>
                  <span>Total (NZD)</span>
                  <span style={{ color: T.accent }}>{currency(Number(proposal.totalNzd ?? 0))}</span>
                </div>
                {proposal.depositNzd && (
                  <div className="p-3 flex justify-between items-center mt-2 rounded-sm" style={{ backgroundColor: T.header + '14', border: `1px solid ${T.header}30` }}>
                    <div>
                      <div className="font-bebas text-xs tracking-widest" style={{ color: T.header }}>DEPOSIT TO SECURE BOOKING</div>
                      <div className="font-inter text-xs" style={{ color: T.stone }}>{Number(proposal.depositPercent ?? 25)}% of total</div>
                    </div>
                    <div className="font-playfair text-xl font-bold" style={{ color: T.ink }}>{currency(Number(proposal.depositNzd))}</div>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        )}

        {/* The menu itself, for a proposal without a choice of menus */}
        {menuOptions.length === 0 && menus.some(m => m.menu) && (
          <div className="mb-6 overflow-hidden rounded-sm" style={{ border: `1px solid ${T.cardBorder}` }}>
            <div className="px-6 py-3" style={{ backgroundColor: T.header }}>
              <h2 className="font-bebas text-sm tracking-widest m-0" style={{ color: T.headerText }}>YOUR MENU</h2>
            </div>
            <div className="p-6 space-y-5" style={{ backgroundColor: T.card }}>
              {menus.filter(m => m.menu).map(m => (
                <div key={m.line}>
                  <div className="font-playfair text-lg font-bold" style={{ color: T.ink }}>{m.name}</div>
                  {m.description && <div className="font-inter text-sm mt-0.5" style={{ color: T.stone }}>{m.description}</div>}
                  <pre className="mt-2 font-inter text-sm whitespace-pre-wrap break-words" style={{ color: T.ink }}>{m.menu}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drinks Selection */}
        {drinksData && (
          <div className="mb-6 overflow-hidden rounded-sm" style={{ border: `1px solid ${T.cardBorder}` }}>
            <div className="px-6 py-3" style={{ backgroundColor: T.header }}>
              <h2 className="font-bebas text-sm tracking-widest m-0" style={{ color: T.headerText }}>DRINKS & BAR ARRANGEMENT</h2>
            </div>
            <div className="p-6" style={{ backgroundColor: T.card }}>
              <div className="mb-4 p-3 rounded-sm" style={{ backgroundColor: T.bg, border: `1px solid ${T.border}` }}>
                <div className="font-bebas text-xs tracking-widest mb-0.5" style={{ color: T.stone }}>BAR ARRANGEMENT</div>
                <div className="font-playfair font-semibold text-base" style={{ color: T.ink }}>
                  {BAR_OPTION_LABELS[drinksData.barOption] ?? drinksData.barOption}
                </div>
                {drinksData.tabAmount && (
                  <div className="font-inter text-sm mt-0.5" style={{ color: T.accent }}>
                    Bar Tab Amount: {currency(Number(drinksData.tabAmount))} NZD
                  </div>
                )}
              </div>

              {drinksData.selectedDrinks && drinksData.selectedDrinks.length > 0 && (
                <div className="mb-4">
                  <div className="font-bebas text-xs tracking-widest mb-2" style={{ color: T.stone }}>SELECTED DRINKS</div>
                  <div className="space-y-1.5">
                    {(drinksData.selectedDrinks as string[]).map((key: string) => {
                      const drink = DRINKS_BY_KEY[key];
                      if (!drink) return null;
                      return (
                        <div key={key} className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0" style={{ borderColor: T.border }}>
                          <div>
                            <div className="font-playfair text-sm font-medium" style={{ color: T.ink }}>{drink.name}</div>
                            {drink.description && <div className="font-inter text-xs" style={{ color: T.stone }}>{drink.description}</div>}
                          </div>
                          <div className="font-inter text-xs shrink-0 ml-4" style={{ color: T.stone }}>
                            {drinkPriceLabel(drink)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(drinksData.selectedDrinks as string[]).some(k => DRINKS_BY_KEY[k]?.exGst) && (
                    <div className="font-inter text-xs mt-2" style={{ color: T.stone }}>Drink prices exclude GST.</div>
                  )}
                </div>
              )}

              {(drinksData as any).selectedSampleItems && ((drinksData as any).selectedSampleItems as string[]).length > 0 && (() => {
                const sectionsWithItems = selectedSharedMenuSections((drinksData as any).selectedSampleItems as string[]);
                if (sectionsWithItems.length === 0) return null;
                return (
                  <div>
                    <div className="font-bebas text-xs tracking-widest mb-3" style={{ color: T.stone }}>SHARED MENU</div>
                    {sectionsWithItems.map(sec => (
                      <div key={sec.category} className="mb-4">
                        <div className="font-playfair italic text-sm mb-2 pb-1 border-b" style={{ color: T.accent ?? T.ink, borderColor: T.border }}>
                          {sec.category}
                          {sec.note && <span className="font-inter not-italic text-xs ml-2" style={{ color: T.stone }}>({sec.note})</span>}
                        </div>
                        <div className="space-y-1.5">
                          {sec.items.map(item => (
                            <div key={item.key} className="py-1.5 border-b border-dashed last:border-0" style={{ borderColor: T.border }}>
                              <div className="font-playfair text-sm font-medium" style={{ color: T.ink }}>{item.name}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

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
              Accept this proposal to confirm your booking.
              {menuOptions.length > 0
                ? (chosenOption ? <> With the {chosenOption.name} menu, a deposit of {currency(chosenOption.deposit)} NZD secures your date.</> : <> Choose your menu above first.</>)
                : Number(proposal.depositNzd ?? 0) > 0 && <> A deposit of {currency(Number(proposal.depositNzd))} NZD secures your date.</>}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => setShowAccept(true)}
                className="flex-1 min-w-0 font-bebas tracking-widest rounded-none h-12 text-base gap-2"
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
        <footer className="text-center py-8 border-t-2 border-dashed" style={{ borderColor: T.border }}>
          <div className="flex items-center justify-center mb-1">
            {venueLogo ? (
              <img src={venueLogo} alt={venue?.name ?? "Venue"} className="h-8 w-auto object-contain" />
            ) : (
              <span className="font-bold text-sm tracking-tight" style={{ color: T.stone }}>VenueFlowHQ</span>
            )}
          </div>
          <div className="font-bebas text-xs tracking-widest" style={{ color: T.stone }}>POWERED BY VenueFlowHQ · EVENT CRM FOR NEW ZEALAND VENUES</div>
          {venue?.phone && <div className="font-inter text-xs mt-1" style={{ color: T.stone }}>{venue.phone}</div>}
          {venue?.email && <div className="font-inter text-xs" style={{ color: T.stone }}>{venue.email}</div>}
        </footer>
      </main>

      {/* Accept Dialog */}
      <Dialog open={showAccept} onOpenChange={(o) => { setShowAccept(o); if (!o) setClientMessage(""); }}>
        <DialogContent className="max-w-md rounded-none border-2" style={{ borderColor: T.cardBorder }}>
          <DialogHeader>
            <div className="-mx-6 -mt-6 p-5 mb-4" style={{ backgroundColor: T.header }}>
              <DialogTitle className="font-bebas text-xl tracking-widest" style={{ color: T.headerText }}>CONFIRM YOUR BOOKING</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-inter text-sm" style={{ color: T.stone }}>
              By confirming, you're booking this event as set out in the proposal{chosenOption ? <>, with the <b>{chosenOption.name}</b> menu ({currency(chosenOption.total)} incl. GST)</> : ""}.
              {chosenOption
                ? <> A deposit of {currency(chosenOption.deposit)} NZD secures your date.</>
                : menuOptions.length === 0 && Number(proposal.depositNzd ?? 0) > 0 && <> A deposit of {currency(Number(proposal.depositNzd))} NZD secures your date.</>}
              {" "}The venue team is told straight away and will be in touch about the next steps.
            </p>
            <div>
              <label htmlFor="accept-message" className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>MESSAGE TO VENUE (OPTIONAL)</label>
              <Textarea id="accept-message" value={clientMessage} onChange={e => setClientMessage(e.target.value)}
                placeholder="Any questions or notes for the venue team..."
                rows={3} className="rounded-none border-2 focus-visible:ring-0 resize-none text-sm font-inter" />
            </div>
            {menuOptions.length > 0 && !chosenOption && (
              <p role="alert" className="font-inter text-sm font-semibold" style={{ color: T.accent }}>Please choose a menu first — close this and pick one under Pricing.</p>
            )}
            <Button onClick={() => respond.mutate({ token: token!, action: "accepted", clientMessage: clientMessage || undefined, chosenMenu: chosenOption?.line })}
              disabled={respond.isPending || (menuOptions.length > 0 && !chosenOption)}
              className="w-full font-bebas tracking-widest rounded-none h-11 gap-2"
              style={{ backgroundColor: T.header, color: T.headerText }}>
              <CheckCircle className="w-4 h-4" />
              {respond.isPending ? "CONFIRMING..." : "CONFIRM BOOKING"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Decline Dialog */}
      <Dialog open={showDecline} onOpenChange={(o) => { setShowDecline(o); if (!o) setClientMessage(""); }}>
        <DialogContent className="max-w-md rounded-none border-2" style={{ borderColor: T.cardBorder }}>
          <DialogHeader>
            <div className="-mx-6 -mt-6 p-5 mb-4" style={{ backgroundColor: T.accent }}>
              <DialogTitle className="font-bebas text-xl tracking-widest" style={{ color: T.accentText }}>DECLINE PROPOSAL</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-inter text-sm" style={{ color: T.stone }}>
              The venue team will be told. If you're happy to, let them know why — it's optional.
            </p>
            <div>
              <label htmlFor="decline-reason" className="font-bebas text-xs tracking-widest block mb-1" style={{ color: T.stone }}>REASON (OPTIONAL)</label>
              <Textarea id="decline-reason" value={clientMessage} onChange={e => setClientMessage(e.target.value)}
                placeholder="e.g. Budget doesn't fit, found another venue, dates changed..."
                rows={3} className="rounded-none border-2 focus-visible:ring-0 resize-none text-sm font-inter" />
            </div>
            <Button onClick={() => respond.mutate({ token: token!, action: "declined", declineReason: clientMessage.trim() || undefined })}
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
