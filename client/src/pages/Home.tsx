import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, CheckCircle, FileText, Calendar, Users, Zap } from "lucide-react";

/* ── Inline SVG illustrations ─────────────────────────────────────────────── */

/** Eden-Roc style: loose ink sketch of a waiter balancing trays */
function WaiterSketch() {
  return (
    <svg viewBox="0 0 160 240" className="w-36 h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Tray left */}
      <ellipse cx="30" cy="95" rx="18" ry="4" stroke="#C8421A" strokeWidth="2" fill="none"/>
      <rect x="27" y="80" width="5" height="16" rx="1.5" fill="#C8421A" opacity="0.7"/>
      {/* Tray right (flaming dish) */}
      <ellipse cx="128" cy="88" rx="16" ry="4" stroke="#C8421A" strokeWidth="2" fill="none"/>
      <path d="M128 75 Q131 68 128 62 Q125 68 128 75Z" fill="#E8852A" opacity="0.8"/>
      <path d="M124 78 Q127 72 124 67 Q121 72 124 78Z" fill="#C8421A" opacity="0.6"/>
      {/* Body — striped shirt like Eden-Roc */}
      <path d="M72 115 Q65 140 62 175" stroke="#8BA8C8" strokeWidth="8" strokeLinecap="round"/>
      <path d="M88 115 Q95 140 98 175" stroke="#8BA8C8" strokeWidth="8" strokeLinecap="round"/>
      <path d="M62 120 Q80 130 98 120" stroke="#8BA8C8" strokeWidth="2.5" fill="none"/>
      <path d="M63 128 Q80 138 97 128" stroke="#8BA8C8" strokeWidth="2" fill="none" opacity="0.6"/>
      <path d="M64 136 Q80 145 96 136" stroke="#8BA8C8" strokeWidth="2" fill="none" opacity="0.4"/>
      {/* Neck + head */}
      <rect x="76" y="100" width="8" height="14" rx="4" fill="#D4A882"/>
      <ellipse cx="80" cy="92" rx="14" ry="15" fill="#D4A882"/>
      {/* Hair — loose sketch */}
      <path d="M66 88 Q70 76 80 74 Q90 76 94 88" stroke="#5C3D2E" strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Face — simple profile nose */}
      <path d="M88 90 Q93 93 89 97" stroke="#A07050" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      {/* Left arm reaching out with tray */}
      <path d="M66 118 Q50 108 30 97" stroke="#D4A882" strokeWidth="6" strokeLinecap="round"/>
      {/* Right arm reaching out with tray */}
      <path d="M94 115 Q112 100 128 90" stroke="#D4A882" strokeWidth="6" strokeLinecap="round"/>
      {/* Legs — dynamic stride */}
      <path d="M72 175 Q68 200 62 225" stroke="#8BA8C8" strokeWidth="7" strokeLinecap="round"/>
      <path d="M88 175 Q95 200 105 220" stroke="#8BA8C8" strokeWidth="7" strokeLinecap="round"/>
      {/* Shoes */}
      <ellipse cx="60" cy="226" rx="10" ry="4" fill="#3A2A1E"/>
      <ellipse cx="107" cy="221" rx="10" ry="4" fill="#3A2A1E"/>
    </svg>
  );
}

/** Fabiola's style: diner character drinking at a table */
function DinerCharacter() {
  return (
    <svg viewBox="0 0 120 140" className="w-24 h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Table */}
      <rect x="20" y="90" width="80" height="6" rx="2" fill="#C8421A" opacity="0.8"/>
      <rect x="35" y="96" width="6" height="30" rx="2" fill="#C8421A" opacity="0.6"/>
      <rect x="79" y="96" width="6" height="30" rx="2" fill="#C8421A" opacity="0.6"/>
      {/* Wine glass on table */}
      <path d="M68 90 Q72 80 70 70 Q68 80 72 80" stroke="#6D1A36" strokeWidth="2" fill="none"/>
      <ellipse cx="70" cy="70" rx="7" ry="3" stroke="#6D1A36" strokeWidth="1.5" fill="none"/>
      <rect x="69" y="82" width="2" height="8" fill="#6D1A36"/>
      <rect x="65" y="88" width="10" height="2" rx="1" fill="#6D1A36"/>
      {/* Body */}
      <rect x="40" y="55" width="30" height="35" rx="8" fill="#C8421A" opacity="0.85"/>
      {/* Apron */}
      <rect x="48" y="60" width="14" height="28" rx="3" fill="#FAF0E0" opacity="0.9"/>
      {/* Head */}
      <ellipse cx="55" cy="42" rx="14" ry="16" fill="#D4A882"/>
      {/* Chef hat */}
      <rect x="42" y="26" width="26" height="10" rx="3" fill="#FAF0E0"/>
      <ellipse cx="55" cy="26" rx="13" ry="5" fill="#FAF0E0"/>
      {/* Face — looking right, drinking */}
      <path d="M62 42 Q67 44 64 48" stroke="#A07050" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Arm holding glass up */}
      <path d="M70 65 Q80 55 85 45" stroke="#D4A882" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="85" cy="43" r="4" fill="#D4A882"/>
      {/* Glass in hand */}
      <path d="M85 43 Q89 38 87 32" stroke="#6D1A36" strokeWidth="1.5" fill="none"/>
      <ellipse cx="87" cy="32" rx="4" ry="2" stroke="#6D1A36" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

/** Fabiola's style: hourglass badge shape with curved text */
function HourglassBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-flex flex-col items-center justify-center bg-amber text-ink px-8 py-4 badge-hourglass min-w-[160px]">
      {children}
    </div>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-parchment font-dm overflow-x-hidden">

      {/* ── Top Nav ──────────────────────────────────────────────────────── */}
      <nav className="bg-parchment border-b-2 border-tomato h-16 flex items-center px-6 justify-between sticky top-0 z-50">
        {/* Logo */}
        <div className="flex items-center gap-1">
          <span className="font-alfa text-3xl text-tomato leading-none">HOST</span>
          <span className="font-pacifico text-2xl text-amber leading-none -ml-0.5">it</span>
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-6">
          <span className="font-bebas tracking-widest text-sm text-muted-ink hover:text-tomato transition-colors cursor-pointer">FEATURES</span>
          <span className="font-bebas tracking-widest text-sm text-muted-ink hover:text-tomato transition-colors cursor-pointer">PRICING</span>
          <Link href="/enquire">
            <span className="font-bebas tracking-widest text-sm text-muted-ink hover:text-tomato transition-colors">SUBMIT ENQUIRY</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-sm px-5">
                DASHBOARD
              </Button>
            </Link>
          ) : (
            <a href={getLoginUrl()}>
              <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-sm px-5">
                SIGN IN
              </Button>
            </a>
          )}
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-parchment border-b-2 border-border">
        {/* Decorative large background text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
          <span className="font-alfa text-[22vw] text-tomato/5 leading-none whitespace-nowrap">HOSTit</span>
        </div>

        <div className="container relative py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div>
              {/* Fabiola-style badge label */}
              <div className="inline-flex items-center gap-2 mb-6">
                <div className="h-px w-8 bg-tomato"/>
                <span className="font-bebas tracking-[0.2em] text-xs text-tomato">EVENT CRM FOR NZ RESTAURANTS & VENUES</span>
                <div className="h-px w-8 bg-tomato"/>
              </div>

              <h1 className="font-alfa text-5xl md:text-7xl text-ink leading-[0.95] mb-2">
                MANAGE<br/>
                YOUR<br/>
                <span className="text-tomato">EVENTS</span><br/>
                BEAUTIFULLY.
              </h1>

              {/* Amber underline accent */}
              <div className="h-1.5 w-24 bg-amber mt-4 mb-6"/>

              <p className="font-dm text-muted-ink text-base md:text-lg leading-relaxed max-w-md mb-8">
                HOSTit is the event enquiry and proposal platform built for New Zealand restaurants, bars, and function venues. Capture leads, build stunning proposals, and confirm bookings — all in one place.
              </p>

              <div className="flex flex-wrap gap-3">
                <a href={getLoginUrl()}>
                  <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-base px-7 py-5 h-auto">
                    GET STARTED FREE <ArrowRight className="ml-2 w-4 h-4"/>
                  </Button>
                </a>
                <Link href="/enquire">
                  <Button variant="outline" className="border-2 border-ink text-ink hover:bg-ink hover:text-cream font-bebas tracking-widest rounded-none text-base px-7 py-5 h-auto bg-transparent">
                    VIEW LEAD FORM
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right: illustration + floating cards */}
            <div className="relative flex justify-center items-end h-72 md:h-96">
              {/* Floating enquiry card */}
              <div className="absolute top-4 right-4 md:right-8 bg-cream-card border border-border shadow-sm rounded-sm px-4 py-3 text-xs font-dm z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-amber"/>
                  <span className="font-bebas tracking-widest text-tomato text-xs">NEW ENQUIRY!</span>
                </div>
                <div className="text-ink font-medium">Wedding · 80 guests</div>
                <div className="text-muted-ink">15 March · The Grand Hall</div>
              </div>

              {/* Central illustration */}
              <div className="relative z-0">
                <WaiterSketch />
              </div>

              {/* Floating proposal accepted card */}
              <div className="absolute bottom-4 left-4 md:left-8 bg-cream-card border border-border shadow-sm rounded-sm px-4 py-3 text-xs font-dm z-10">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-3 h-3 text-tomato"/>
                  <span className="font-bebas tracking-widest text-tomato text-xs">PROPOSAL ACCEPTED</span>
                </div>
                <div className="text-ink font-medium text-sm">$4,800 NZD</div>
                <div className="text-muted-ink">Deposit received</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="bg-linen border-b border-border py-16 md:py-20">
        <div className="container">
          <div className="text-center mb-12">
            <div className="retro-divider mb-4">HOW IT WORKS</div>
            <h2 className="font-alfa text-4xl md:text-5xl text-ink">
              FROM ENQUIRY TO <span className="text-tomato">BOOKING</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                num: "01",
                icon: <FileText className="w-6 h-6"/>,
                title: "CAPTURE LEADS",
                desc: "Share your custom lead form link or embed it on your website. Clients fill in their event details and it lands straight in your inbox.",
              },
              {
                num: "02",
                icon: <Zap className="w-6 h-6"/>,
                title: "SEND PROPOSALS",
                desc: "Build a beautiful, itemised proposal in minutes. Add packages, line items, deposit requirements, and T&Cs — then send with one click.",
              },
              {
                num: "03",
                icon: <Calendar className="w-6 h-6"/>,
                title: "CONFIRM BOOKINGS",
                desc: "Clients accept online and the booking is confirmed. Syncs automatically to your calendar and Nowbook It — zero double entry.",
              },
            ].map((step) => (
              <div key={step.num} className="bg-cream-card border border-border p-6 relative">
                {/* Number watermark */}
                <div className="absolute top-4 right-4 font-alfa text-5xl text-tomato/10 leading-none select-none">{step.num}</div>
                <div className="w-10 h-10 bg-tomato text-white flex items-center justify-center mb-4 rounded-none">
                  {step.icon}
                </div>
                <h3 className="font-alfa text-xl text-ink mb-2">{step.title}</h3>
                <p className="font-dm text-muted-ink text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="bg-parchment border-b border-border py-16 md:py-20">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Illustration side */}
            <div className="flex justify-center">
              <div className="relative">
                {/* Fabiola-style badge */}
                <HourglassBadge>
                  <span className="font-bebas tracking-[0.15em] text-xs text-center leading-tight">FINE EVENT<br/>MANAGEMENT</span>
                  <span className="font-pacifico text-2xl text-ink mt-1">HOSTit</span>
                  <span className="font-bebas tracking-[0.12em] text-xs text-center leading-tight">FOR NZ VENUES</span>
                </HourglassBadge>
                <div className="absolute -right-16 -bottom-4">
                  <DinerCharacter />
                </div>
              </div>
            </div>

            {/* Features list */}
            <div>
              <div className="retro-divider mb-4">EVERYTHING YOU NEED</div>
              <h2 className="font-alfa text-4xl text-ink mb-6">
                YOUR VENUE'S<br/><span className="text-tomato">COMMAND CENTRE</span>
              </h2>
              <div className="space-y-4">
                {[
                  { icon: <Users className="w-4 h-4"/>, title: "Leads Inbox & Pipeline", desc: "Track every enquiry from new lead to confirmed booking with a visual pipeline." },
                  { icon: <FileText className="w-4 h-4"/>, title: "Proposal Builder", desc: "Create itemised proposals with packages, pricing, deposit terms, and your branding." },
                  { icon: <Calendar className="w-4 h-4"/>, title: "Bookings Calendar", desc: "Monthly calendar view of all confirmed events. Syncs with Nowbook It automatically." },
                  { icon: <Zap className="w-4 h-4"/>, title: "Nowbook It Integration", desc: "When a proposal is accepted, a booking is created in Nowbook It and the date is blocked." },
                ].map((f) => (
                  <div key={f.title} className="flex gap-4 items-start">
                    <div className="w-8 h-8 bg-linen border border-border flex items-center justify-center text-tomato shrink-0 mt-0.5">
                      {f.icon}
                    </div>
                    <div>
                      <div className="font-bebas tracking-wider text-ink text-sm">{f.title}</div>
                      <div className="font-dm text-muted-ink text-xs leading-relaxed">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="bg-tomato py-14">
        <div className="container text-center">
          <div className="retro-divider text-white/60 mb-4">GET STARTED TODAY</div>
          <h2 className="font-alfa text-4xl md:text-5xl text-white mb-4">
            READY TO HOST<br/>BETTER EVENTS?
          </h2>
          <p className="font-dm text-white/80 text-base mb-8 max-w-md mx-auto">
            Join New Zealand restaurants and venues using HOSTit to manage their events effortlessly.
          </p>
          <a href={getLoginUrl()}>
            <Button className="bg-white text-tomato hover:bg-linen font-bebas tracking-widest rounded-none text-base px-8 py-5 h-auto">
              START FOR FREE <ArrowRight className="ml-2 w-4 h-4"/>
            </Button>
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-ink text-cream/60 py-8">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <span className="font-alfa text-xl text-tomato">HOST</span>
            <span className="font-pacifico text-lg text-amber">it</span>
          </div>
          <p className="font-dm text-xs text-center">
            © {new Date().getFullYear()} HOSTit · Built for New Zealand hospitality · All rights reserved
          </p>
          <div className="flex gap-4 text-xs font-bebas tracking-widest">
            <span className="hover:text-cream cursor-pointer">PRIVACY</span>
            <span className="hover:text-cream cursor-pointer">TERMS</span>
            <Link href="/enquire"><span className="hover:text-cream">ENQUIRY FORM</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
