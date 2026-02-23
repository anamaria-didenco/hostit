import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, CalendarDays, FileText, Users, Star } from "lucide-react";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-cream font-dm">

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="bg-forest-dark border-b border-gold/20 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <span className="font-bebas text-2xl tracking-widest text-cream">HOST</span>
            <span className="logo-script text-3xl text-gold leading-none mt-0.5">it</span>
          </div>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="font-bebas tracking-widest text-xs text-cream/60 hover:text-gold transition-colors">FEATURES</a>
            <a href="#how-it-works" className="font-bebas tracking-widest text-xs text-cream/60 hover:text-gold transition-colors">HOW IT WORKS</a>
            <a href="#pricing" className="font-bebas tracking-widest text-xs text-cream/60 hover:text-gold transition-colors">PRICING</a>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <button className="btn-forest font-bebas tracking-widest text-xs px-5 py-2.5 text-cream">
                  DASHBOARD
                </button>
              </Link>
            ) : (
              <>
                <a href={getLoginUrl()} className="font-bebas tracking-widest text-xs text-cream/60 hover:text-gold transition-colors">
                  SIGN IN
                </a>
                <a href={getLoginUrl()}>
                  <button className="btn-forest font-bebas tracking-widest text-xs px-5 py-2.5 text-cream">
                    GET STARTED
                  </button>
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="bg-forest-dark relative overflow-hidden">
        {/* Checkerboard floor motif at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-24 checkerboard opacity-30" />

        {/* Gold decorative lines */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        <div className="absolute bottom-24 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

        <div className="max-w-6xl mx-auto px-6 pt-24 pb-36 relative z-10">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <div className="gold-rule mb-8 max-w-xs">
              <span>EST. NEW ZEALAND</span>
            </div>

            {/* Main headline */}
            <h1 className="font-cormorant text-cream mb-2" style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.95, fontWeight: 600 }}>
              Events,
            </h1>
            <h1 className="font-cormorant text-cream mb-2" style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.95, fontWeight: 300, fontStyle: 'italic' }}>
              Beautifully
            </h1>
            <h1 className="font-cormorant mb-8" style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.95, fontWeight: 600, color: 'oklch(0.720 0.105 75)' }}>
              Managed.
            </h1>

            <p className="font-dm text-cream/65 text-lg leading-relaxed mb-10 max-w-xl">
              HOSTit is the event enquiry and proposal platform built for New Zealand restaurants, bars, and function venues. Capture leads, build stunning proposals, and confirm bookings — all in one place.
            </p>

            <div className="flex flex-wrap gap-4">
              <a href={getLoginUrl()}>
                <button className="btn-forest font-bebas tracking-widest text-sm px-8 py-3.5 text-cream flex items-center gap-2">
                  START FOR FREE <ArrowRight className="w-4 h-4" />
                </button>
              </a>
              <Link href="/enquire/demo">
                <button className="btn-gold-outline font-bebas tracking-widest text-sm px-8 py-3.5 flex items-center gap-2">
                  VIEW SAMPLE LEAD FORM <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          </div>

          {/* Floating notification cards */}
          <div className="absolute right-6 top-20 hidden lg:block space-y-3">
            <div className="bg-warm-white border border-gold/30 border-l-2 border-l-gold p-4 shadow-lg w-64">
              <div className="font-bebas text-xs tracking-widest text-sage mb-1">NEW ENQUIRY</div>
              <div className="font-cormorant text-ink text-lg font-semibold">Wedding Reception</div>
              <div className="font-dm text-xs text-sage mt-0.5">120 guests · 14 June · The Grand Room</div>
            </div>
            <div className="bg-warm-white border border-gold/30 border-l-2 border-l-forest p-4 shadow-lg w-64">
              <div className="font-bebas text-xs tracking-widest text-sage mb-1">PROPOSAL ACCEPTED</div>
              <div className="font-cormorant text-ink text-lg font-semibold">Corporate Dinner</div>
              <div className="font-dm text-xs text-forest font-medium mt-0.5">$6,400 NZD · Deposit received ✓</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof Strip ──────────────────────────────────────────── */}
      <section className="bg-linen border-y border-gold/20 py-5">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-center gap-8 md:gap-16">
          {[
            { label: "NZ Venues", value: "200+" },
            { label: "Enquiries Managed", value: "12,000+" },
            { label: "Proposals Sent", value: "8,500+" },
            { label: "Avg. Response Time", value: "< 2hrs" },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="font-cormorant text-3xl font-semibold text-forest">{value}</div>
              <div className="font-bebas text-xs tracking-widest text-sage mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-cream">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="gold-rule mb-6 max-w-xs mx-auto"><span>PLATFORM FEATURES</span></div>
            <h2 className="font-cormorant text-ink mb-4" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', fontWeight: 600 }}>
              Everything your venue needs
            </h2>
            <p className="font-dm text-sage text-lg max-w-xl mx-auto">
              From the first enquiry to the final invoice — HOSTit handles the full event lifecycle.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-gold/15">
            {[
              {
                icon: <Users className="w-5 h-5" />,
                title: "Lead Capture Form",
                desc: "A beautiful, branded enquiry form you can share as a link or embed on your website. Every submission lands directly in your inbox.",
              },
              {
                icon: <FileText className="w-5 h-5" />,
                title: "Proposals & Quotes",
                desc: "Build polished, itemised proposals with NZD pricing, GST, deposit requirements, and custom terms. Clients accept or decline online.",
              },
              {
                icon: <CalendarDays className="w-5 h-5" />,
                title: "Bookings Calendar",
                desc: "A live calendar view of all confirmed events. See your upcoming bookings at a glance and never double-book a date.",
              },
              {
                icon: <Star className="w-5 h-5" />,
                title: "CRM Pipeline",
                desc: "Track every lead through New → Contacted → Proposal Sent → Booked. Know exactly where each enquiry stands.",
              },
              {
                icon: <CheckCircle2 className="w-5 h-5" />,
                title: "Contacts Database",
                desc: "Every client who enquires is saved as a contact. Build your database of event planners, corporates, and repeat customers.",
              },
              {
                icon: <ArrowRight className="w-5 h-5" />,
                title: "Activity Log",
                desc: "A full audit trail on every lead — notes, status changes, proposal history. Never lose track of a conversation.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="dante-card p-8 bg-warm-white">
                <div className="w-10 h-10 bg-forest/10 flex items-center justify-center text-forest mb-5">
                  {icon}
                </div>
                <h3 className="font-cormorant text-ink text-xl font-semibold mb-2">{title}</h3>
                <p className="font-dm text-sage text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-forest-dark relative overflow-hidden">
        <div className="absolute inset-0 checkerboard opacity-10" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <div className="gold-rule mb-6 max-w-xs mx-auto"><span>THE WORKFLOW</span></div>
            <h2 className="font-cormorant text-cream mb-4" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', fontWeight: 600 }}>
              Simple. Elegant. Effective.
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Share Your Form", desc: "Send clients your unique HOSTit enquiry link or embed it on your website." },
              { step: "02", title: "Receive Enquiries", desc: "New leads land in your dashboard instantly, with all event details captured." },
              { step: "03", title: "Send a Proposal", desc: "Build a professional, itemised proposal and send it to your client in minutes." },
              { step: "04", title: "Confirm the Booking", desc: "Client accepts online, deposit is noted, and the event is locked in your calendar." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="font-pinyon text-gold text-6xl leading-none mb-4">{step}</div>
                <h3 className="font-cormorant text-cream text-xl font-semibold mb-2">{title}</h3>
                <p className="font-dm text-cream/55 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-cream">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="gold-rule mb-6 max-w-xs mx-auto"><span>PRICING</span></div>
            <h2 className="font-cormorant text-ink mb-4" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.5rem)', fontWeight: 600 }}>
              One plan. Everything included.
            </h2>
            <p className="font-dm text-sage text-lg max-w-md mx-auto">
              No per-booking fees. No hidden charges. Just a flat monthly rate for your whole team.
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="dante-card p-10 text-center bg-warm-white">
              <div className="font-bebas tracking-widest text-xs text-sage mb-4">VENUE PLAN</div>
              <div className="font-cormorant text-ink mb-1" style={{ fontSize: '4rem', fontWeight: 600, lineHeight: 1 }}>
                $99
              </div>
              <div className="font-dm text-sage text-sm mb-8">NZD per month + GST</div>
              <div className="space-y-3 mb-8 text-left">
                {[
                  "Unlimited enquiries & leads",
                  "Unlimited proposals",
                  "Bookings calendar",
                  "CRM contacts database",
                  "Public lead capture form",
                  "Activity log & notes",
                  "NZD pricing & GST",
                  "Email support",
                ].map(item => (
                  <div key={item} className="flex items-center gap-3 font-dm text-sm text-ink">
                    <CheckCircle2 className="w-4 h-4 text-forest flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
              <a href={getLoginUrl()}>
                <button className="btn-forest w-full font-bebas tracking-widest text-sm py-3.5 text-cream">
                  START FREE TRIAL
                </button>
              </a>
              <p className="font-dm text-xs text-sage mt-3">14-day free trial · No credit card required</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-forest-dark border-t border-gold/20 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-1.5">
              <span className="font-bebas text-xl tracking-widest text-cream">HOST</span>
              <span className="logo-script text-2xl text-gold leading-none">it</span>
            </div>
            <div className="font-fell italic text-cream/40 text-sm text-center">
              Built for New Zealand restaurants, bars &amp; function venues
            </div>
            <div className="font-dm text-xs text-cream/30">
              © {new Date().getFullYear()} HOSTit NZ
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
