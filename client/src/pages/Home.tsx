import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, CalendarDays, FileText, Users, Star } from "lucide-react";

export default function Home() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="min-h-screen font-inter" style={{ backgroundColor: 'oklch(0.958 0.020 88)' }}>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav style={{ backgroundColor: 'oklch(0.280 0.065 178)', borderBottom: '1px solid oklch(0.450 0.155 25 / 0.25)' }} className="sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <span className="font-bebas text-2xl tracking-widest" style={{ color: 'oklch(0.958 0.020 88)' }}>HOST</span>
            <span className="logo-script text-3xl leading-none mt-0.5" style={{ color: 'oklch(0.450 0.155 25)', fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic' }}>it</span>
          </div>
          {/* Nav links */}
          <div className="hidden md:flex items-center gap-8">
            {['FEATURES', 'HOW IT WORKS', 'PRICING'].map(link => (
              <a key={link} href={`#${link.toLowerCase().replace(/ /g, '-')}`}
                className="font-bebas tracking-widest text-xs transition-colors"
                style={{ color: 'oklch(0.900 0.018 88)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'oklch(0.450 0.155 25)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'oklch(0.900 0.018 88)')}
              >{link}</a>
            ))}
          </div>
          {/* CTA */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <button className="font-bebas tracking-widest text-xs px-5 py-2.5 transition-colors"
                  style={{ backgroundColor: 'oklch(0.450 0.155 25)', color: 'oklch(0.958 0.020 88)', borderRadius: '0.25rem' }}>
                  DASHBOARD
                </button>
              </Link>
            ) : (
              <>
                <a href={getLoginUrl()} className="font-bebas tracking-widest text-xs transition-colors"
                  style={{ color: 'oklch(0.900 0.018 88)' }}>
                  SIGN IN
                </a>
                <a href={getLoginUrl()}>
                  <button className="font-bebas tracking-widest text-xs px-5 py-2.5 transition-colors"
                    style={{ backgroundColor: 'oklch(0.450 0.155 25)', color: 'oklch(0.958 0.020 88)', borderRadius: '0.25rem' }}>
                    GET STARTED
                  </button>
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: 'oklch(0.280 0.065 178)' }}>
        {/* Stripe motif band at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 stripe-pattern opacity-40" />
        {/* Terracotta accent line */}
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'linear-gradient(to right, transparent, oklch(0.450 0.155 25 / 0.6), transparent)' }} />

        <div className="max-w-6xl mx-auto px-6 pt-24 pb-40 relative z-10">
          <div className="max-w-3xl">
            {/* Eyebrow rule */}
            <div className="terra-rule mb-8 max-w-xs">
              <span>EST. NEW ZEALAND</span>
            </div>
            {/* Main headline */}
            <h1 className="font-playfair mb-1" style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.95, fontWeight: 700, color: 'oklch(0.958 0.020 88)' }}>
              Events,
            </h1>
            <h1 className="font-playfair mb-1" style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.95, fontWeight: 400, fontStyle: 'italic', color: 'oklch(0.958 0.020 88)' }}>
              Beautifully
            </h1>
            <h1 className="font-playfair mb-8" style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.95, fontWeight: 700, color: 'oklch(0.450 0.155 25)' }}>
              Managed.
            </h1>
            <p className="font-inter text-lg leading-relaxed mb-10 max-w-xl" style={{ color: 'oklch(0.900 0.018 88)' }}>
              HOSTit is the event enquiry and proposal platform built for New Zealand restaurants, bars, and function venues. Capture leads, build stunning proposals, and confirm bookings — all in one place.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href={getLoginUrl()}>
                <button className="font-bebas tracking-widest text-sm px-8 py-3.5 flex items-center gap-2 transition-colors"
                  style={{ backgroundColor: 'oklch(0.450 0.155 25)', color: 'oklch(0.958 0.020 88)', borderRadius: '0.25rem' }}>
                  START FREE <ArrowRight className="w-4 h-4" />
                </button>
              </a>
              <a href="#features">
                <button className="font-bebas tracking-widest text-sm px-8 py-3.5 transition-colors"
                  style={{ border: '1px solid oklch(0.958 0.020 88 / 0.35)', color: 'oklch(0.958 0.020 88)', borderRadius: '0.25rem', background: 'transparent' }}>
                  SEE FEATURES
                </button>
              </a>
            </div>
            {/* Social proof */}
            <div className="flex items-center gap-3 mt-10">
              <div className="flex -space-x-1.5">
                {['T', 'A', 'K'].map((l, i) => (
                  <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center font-bebas text-xs"
                    style={{ backgroundColor: i === 0 ? 'oklch(0.450 0.155 25)' : i === 1 ? 'oklch(0.400 0.075 178)' : 'oklch(0.350 0.070 178)', color: 'oklch(0.958 0.020 88)', border: '2px solid oklch(0.280 0.065 178)' }}>
                    {l}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-current" style={{ color: 'oklch(0.450 0.155 25)' }} />)}
              </div>
              <span className="font-inter text-xs" style={{ color: 'oklch(0.800 0.020 88)' }}>Trusted by NZ venues</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stripe divider ────────────────────────────────────────────── */}
      <div className="h-3 stripe-pattern" />

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" className="py-24" style={{ backgroundColor: 'oklch(0.958 0.020 88)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="terra-rule max-w-xs mx-auto mb-4"><span>WHAT YOU GET</span></div>
            <h2 className="font-playfair" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, color: 'oklch(0.220 0.018 45)' }}>
              Everything a venue needs
            </h2>
            <p className="font-inter mt-4 max-w-xl mx-auto" style={{ color: 'oklch(0.500 0.025 60)', fontSize: '1rem' }}>
              From the first enquiry to the final invoice — HOSTit handles the full event lifecycle.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <Users className="w-6 h-6" />, title: "Lead Inbox", desc: "Every enquiry captured in one place. Track status, reply by email, and never let a lead go cold." },
              { icon: <FileText className="w-6 h-6" />, title: "Proposal Builder", desc: "Create beautiful, branded proposals with menu packages, pricing, and a one-click accept button for clients." },
              { icon: <CalendarDays className="w-6 h-6" />, title: "Unified Calendar", desc: "See all bookings, enquiries, and follow-up dates on one calendar. Know what's coming at a glance." },
              { icon: <CheckCircle2 className="w-6 h-6" />, title: "Pipeline View", desc: "Drag leads through your sales funnel — New → Contacted → Proposal Sent → Booked." },
              { icon: <Star className="w-6 h-6" />, title: "Email Templates", desc: "Save your best follow-up emails as templates with smart variables that auto-fill client details." },
              { icon: <ArrowRight className="w-6 h-6" />, title: "Runsheets", desc: "Auto-generate event runsheets from bookings, edit them, and share a PDF link with your team." },
            ].map((f, i) => (
              <div key={i} className="paradiso-card p-6 group hover:shadow-md transition-shadow">
                <div className="w-10 h-10 flex items-center justify-center mb-4 rounded-sm"
                  style={{ backgroundColor: 'oklch(0.400 0.075 178 / 0.12)', color: 'oklch(0.400 0.075 178)' }}>
                  {f.icon}
                </div>
                <h3 className="font-playfair text-lg font-semibold mb-2" style={{ color: 'oklch(0.220 0.018 45)' }}>{f.title}</h3>
                <p className="font-inter text-sm leading-relaxed" style={{ color: 'oklch(0.500 0.025 60)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stripe divider ────────────────────────────────────────────── */}
      <div className="h-3 stripe-pattern" />

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24" style={{ backgroundColor: 'oklch(0.280 0.065 178)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="terra-rule max-w-xs mx-auto mb-4"><span>THE PROCESS</span></div>
            <h2 className="font-playfair" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, color: 'oklch(0.958 0.020 88)' }}>
              Simple by design
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { num: "01", title: "Capture the enquiry", desc: "Share your venue's unique link. Clients fill in a beautiful form — you get the lead instantly in your inbox." },
              { num: "02", title: "Send a proposal", desc: "Build a tailored proposal with your menu packages, pricing, and venue details. Clients accept online." },
              { num: "03", title: "Confirm the booking", desc: "Once accepted, the event moves to your calendar. Generate a runsheet and you're ready to host." },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="font-bebas text-6xl mb-4 leading-none" style={{ color: 'oklch(0.450 0.155 25)' }}>{s.num}</div>
                <h3 className="font-playfair text-xl font-semibold mb-3" style={{ color: 'oklch(0.958 0.020 88)' }}>{s.title}</h3>
                <p className="font-inter text-sm leading-relaxed" style={{ color: 'oklch(0.800 0.020 88)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stripe divider ────────────────────────────────────────────── */}
      <div className="h-3 stripe-pattern" />

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24" style={{ backgroundColor: 'oklch(0.958 0.020 88)' }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="terra-rule max-w-xs mx-auto mb-4"><span>PRICING</span></div>
          <h2 className="font-playfair mb-4" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, color: 'oklch(0.220 0.018 45)' }}>
            One venue, one plan
          </h2>
          <p className="font-inter mb-12" style={{ color: 'oklch(0.500 0.025 60)' }}>
            Everything included. No per-user fees. No hidden charges.
          </p>
          <div className="paradiso-card p-10 max-w-md mx-auto">
            <div className="font-bebas tracking-widest text-sm mb-2" style={{ color: 'oklch(0.450 0.155 25)' }}>VENUE PLAN</div>
            <div className="font-playfair mb-1" style={{ fontSize: '3.5rem', fontWeight: 700, color: 'oklch(0.220 0.018 45)', lineHeight: 1 }}>Free</div>
            <div className="font-inter text-sm mb-8" style={{ color: 'oklch(0.500 0.025 60)' }}>during early access</div>
            <div className="space-y-3 mb-8 text-left">
              {['Unlimited leads & enquiries', 'Proposal builder with menu packages', 'Booking calendar & runsheets', 'Email templates with smart variables', 'Follow-up reminders & pipeline view', 'Public enquiry form for your venue'].map(f => (
                <div key={f} className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'oklch(0.400 0.075 178)' }} />
                  <span className="font-inter text-sm" style={{ color: 'oklch(0.220 0.018 45)' }}>{f}</span>
                </div>
              ))}
            </div>
            <a href={getLoginUrl()}>
              <button className="w-full font-bebas tracking-widest text-sm py-3.5 transition-colors"
                style={{ backgroundColor: 'oklch(0.450 0.155 25)', color: 'oklch(0.958 0.020 88)', borderRadius: '0.25rem' }}>
                GET STARTED FREE
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: 'oklch(0.220 0.018 45)', borderTop: '2px solid oklch(0.450 0.155 25 / 0.4)' }} className="py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-1.5">
            <span className="font-bebas text-xl tracking-widest" style={{ color: 'oklch(0.958 0.020 88)' }}>HOST</span>
            <span className="font-playfair text-2xl italic leading-none mt-0.5" style={{ color: 'oklch(0.450 0.155 25)' }}>it</span>
          </div>
          <p className="font-inter text-xs text-center" style={{ color: 'oklch(0.600 0.020 60)' }}>
            Built for New Zealand venues · © {new Date().getFullYear()} HOSTit
          </p>
          <div className="flex items-center gap-6">
            <a href="/enquire" className="font-bebas tracking-widest text-xs transition-colors" style={{ color: 'oklch(0.700 0.020 80)' }}>ENQUIRE</a>
            <a href={getLoginUrl()} className="font-bebas tracking-widest text-xs transition-colors" style={{ color: 'oklch(0.700 0.020 80)' }}>SIGN IN</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
