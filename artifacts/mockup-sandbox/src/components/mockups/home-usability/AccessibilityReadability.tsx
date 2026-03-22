import './_group.css';
import { ArrowRight, CheckCircle, Star } from 'lucide-react';

/**
 * Variant 3 — Accessibility & Readability
 * Tradeoff: Optimise for reading comfort, cognitive clarity, and colour contrast.
 * Larger body text (18px base), generous line-height, high-contrast text pairs.
 * Sections are visually distinct and well-labelled. No decorative gradients that
 * interfere with reading. Buttons meet WCAG AA contrast minimums.
 * Sacrificed: typographic drama — visual interest comes from spacing and structure, not scale.
 */

const features = [
  { title: "Enquiry Management", desc: "All event enquiries come in through your branded contact form and land in a single dashboard. Nothing slips through." },
  { title: "Proposal Builder", desc: "Build and send a professional quote in minutes. Includes your menus, spaces, and pricing — all linked together." },
  { title: "Runsheet Generator", desc: "A clear, detailed runsheet for Front-of-House and Kitchen, automatically generated from the event details." },
  { title: "Event Calendar", desc: "See every enquiry and confirmed booking on one calendar. Click any date to create a new event." },
  { title: "Floor Plan Editor", desc: "Lay out your event spaces with furniture and capacity tools. Save templates for repeat setups." },
  { title: "Menu Management", desc: "Keep your menus, sections, and items up to date and link them directly to proposals." },
];

const testimonials = [
  { quote: "The runsheet builder alone saves us hours every week.", name: "Sarah M.", role: "Events Manager, Auckland" },
  { quote: "The enquiry-to-event flow is seamless and our team loves it.", name: "James T.", role: "Venue Director, Wellington" },
  { quote: "Our clients always comment on how professional our quotes look.", name: "Priya K.", role: "Functions Coordinator, Christchurch" },
];

export function AccessibilityReadability() {
  return (
    <div className="min-h-screen text-gray-900" style={{ background: '#FAFAF9', fontSize: '18px', lineHeight: '1.7' }}>

      {/* Nav — high contrast, clear labels */}
      <header className="sticky top-0 z-50 bg-white border-b-2 border-gray-200">
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sage-green flex items-center justify-center" aria-label="VenueFlowHQ">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <span className="font-bold text-gray-900 text-base">VenueFlowHQ</span>
          </div>
          <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            {["Features", "Pricing", "About"].map(item => (
              <a key={item} href="#"
                className="text-sm font-semibold text-gray-700 underline-offset-4 hover:underline hover:text-gray-900 transition-colors">
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a href="#" className="text-sm font-semibold text-gray-700 hover:text-gray-900 underline underline-offset-4 transition-colors">Sign in</a>
            <a href="#"
              className="text-sm font-bold px-5 py-2.5 rounded-lg transition-colors"
              style={{ backgroundColor: '#2D4A3E', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e3229')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2D4A3E')}>
              Get started
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero — clear and calm ──────────────────────────────────────── */}
      <section className="bg-white py-20 px-8 border-b border-gray-200">
        <div className="max-w-3xl mx-auto">
          {/* Region label */}
          <p className="text-sm font-bold uppercase tracking-[0.15em] mb-6" style={{ color: '#2D4A3E' }}>
            New Zealand's Venue Management Platform
          </p>

          {/* Headline at a readable size, not excessively large */}
          <h1 className="font-black text-gray-950 mb-6" style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Run your venue.<br />
            <span style={{ color: '#4A5E42' }}>Not spreadsheets.</span>
          </h1>

          {/* Body copy at comfortable reading size */}
          <p className="text-gray-700 mb-8 max-w-xl" style={{ fontSize: '1.125rem', lineHeight: 1.75 }}>
            VenueFlowHQ brings enquiries, proposals, calendars, runsheets, and menus into one platform — so your team can focus on delivering great events.
          </p>

          {/* High-contrast CTA pair */}
          <div className="flex flex-wrap gap-4">
            <a href="#"
              className="inline-flex items-center gap-2 text-white font-bold px-8 py-4 rounded-lg transition-colors"
              style={{ backgroundColor: '#2D4A3E', fontSize: '1rem' }}>
              Start free trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </a>
            <a href="#"
              className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-lg border-2 transition-colors hover:bg-gray-50"
              style={{ borderColor: '#2D4A3E', color: '#2D4A3E', fontSize: '1rem' }}>
              See all features
            </a>
          </div>

          {/* Proof below the fold fold */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {["No credit card required", "Set up in 30 minutes", "Cancel any time"].map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#4A5E42' }} aria-hidden="true" />
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features — clear list, generous spacing ─────────────────────── */}
      <section className="py-20 px-8" style={{ background: '#F4F2EE' }}>
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: '#4A5E42' }}>What you get</p>
            <h2 className="font-black text-gray-950" style={{ fontSize: '2rem', letterSpacing: '-0.03em' }}>Built for functions teams</h2>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {features.map((f, i) => (
              <div key={i} className="bg-white rounded-xl p-7 border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-3" style={{ fontSize: '1.05rem' }}>{f.title}</h3>
                <p className="text-gray-600 leading-relaxed" style={{ fontSize: '0.9rem', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works — numbered, plain prose ────────────────────────── */}
      <section className="bg-white py-20 px-8 border-y border-gray-200">
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: '#4A5E42' }}>How it works</p>
            <h2 className="font-black text-gray-950" style={{ fontSize: '2rem', letterSpacing: '-0.03em' }}>From enquiry to event</h2>
          </header>
          <ol className="space-y-10">
            {[
              { title: "Capture the enquiry", desc: "Embed your branded contact form on your website. Every submission lands instantly in your dashboard — no manual entry." },
              { title: "Build and send the proposal", desc: "Add your menu, spaces, and pricing to a professional quote. One click sends it to the client." },
              { title: "Run the event", desc: "Generate a full runsheet for your FOH and Kitchen teams. Everything they need, in one shareable document." },
            ].map((s, i) => (
              <li key={i} className="flex gap-6 items-start">
                <span className="font-black text-2xl w-10 flex-shrink-0 pt-1" style={{ color: '#8D957E' }} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1" style={{ fontSize: '1.1rem' }}>{s.title}</h3>
                  <p className="text-gray-600 leading-relaxed" style={{ fontSize: '0.95rem' }}>{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Testimonials — legible, no decoration ───────────────────────── */}
      <section className="py-20 px-8" style={{ background: '#F4F2EE' }}>
        <div className="max-w-3xl mx-auto">
          <header className="mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: '#4A5E42' }}>Testimonials</p>
            <h2 className="font-black text-gray-950" style={{ fontSize: '2rem', letterSpacing: '-0.03em' }}>Loved by venue teams</h2>
          </header>
          <div className="space-y-6">
            {testimonials.map((t, i) => (
              <blockquote key={i} className="bg-white rounded-xl p-7 border border-gray-200">
                <div className="flex gap-1 mb-4" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, j) => <Star key={j} className="w-4 h-4 fill-sage-green text-sage-green" aria-hidden="true" />)}
                </div>
                <p className="text-gray-800 leading-relaxed mb-4" style={{ fontSize: '1rem' }}>"{t.quote}"</p>
                <footer>
                  <strong className="text-gray-900 text-sm">{t.name}</strong>
                  <span className="text-gray-500 text-sm"> — {t.role}</span>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA — clean, high contrast ───────────────────────────── */}
      <section className="py-20 px-8 text-center" style={{ backgroundColor: '#2D4A3E' }}>
        <div className="max-w-2xl mx-auto">
          <h2 className="font-black text-white mb-4" style={{ fontSize: '2.25rem', letterSpacing: '-0.03em' }}>
            Ready to simplify your venue?
          </h2>
          <p className="mb-8" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem' }}>
            Join venues across New Zealand using VenueFlowHQ to manage events with confidence.
          </p>
          <a href="#"
            className="inline-flex items-center gap-2 font-bold px-10 py-4 rounded-lg transition-colors"
            style={{ backgroundColor: '#fff', color: '#2D4A3E', fontSize: '1rem' }}>
            Get started free <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </a>
          <p className="mt-5" style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem' }}>
            No credit card required · Set up in minutes
          </p>
        </div>
      </section>
    </div>
  );
}
