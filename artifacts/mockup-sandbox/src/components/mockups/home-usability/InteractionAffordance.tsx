import './_group.css';
import { ArrowRight, Play, CheckCircle, Star, ChevronDown, Zap } from 'lucide-react';
import { useState } from 'react';

/**
 * Variant 2 — Interaction Affordance
 * Tradeoff: Every interactive element is visually obvious and scannable.
 * Buttons have strong shadows, hover states, and size differentiation.
 * Accordion FAQ shows that interactivity is possible. Nav links are clearly clickable.
 * Sacrificed: minimalism — more visual "weight" on interactive surfaces.
 */

const faqs = [
  { q: "How long does setup take?", a: "Most venues are up and running within 30 minutes. We walk you through every step." },
  { q: "Can my whole team use it?", a: "Yes — unlimited team members on all plans. Assign roles so staff only see what they need." },
  { q: "Do I need a credit card to start?", a: "No credit card required for the free trial. Upgrade whenever you're ready." },
  { q: "Can I import my existing data?", a: "Yes. We support CSV import for contacts, and our team can help with data migration." },
];

const features = [
  { icon: "📋", title: "Enquiry Pipeline", action: "Manage leads →", desc: "Kanban-style view of every lead from first contact to confirmed booking." },
  { icon: "📄", title: "Proposal Builder", action: "Build a quote →", desc: "Drag-and-drop builder with your menus, spaces, pricing, and branding." },
  { icon: "🗓️", title: "Event Calendar", action: "View calendar →", desc: "Single calendar showing enquiries and confirmed events. Click to create." },
  { icon: "📋", title: "Runsheet Generator", action: "Generate runsheet →", desc: "Full FOH and Kitchen runsheet, auto-populated from event details." },
];

export function InteractionAffordance() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Nav — links look like links */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-sage-green flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <span className="font-bold text-gray-900 text-lg tracking-tight">VenueFlowHQ</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {["Features", "Pricing", "About"].map(item => (
              <a key={item} href="#"
                className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors border border-transparent hover:border-gray-200">
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="#"
              className="text-sm font-semibold text-gray-700 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all">
              Sign in
            </a>
            <a href="#"
              className="bg-sage-green text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-md hover:bg-sage-dark hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5">
              Get started <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-white to-gray-50 pt-20 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-sage-tint text-sage-dark text-xs font-bold px-4 py-2 rounded-full mb-8 tracking-wide uppercase border border-sage-green/20">
            <span className="w-2 h-2 rounded-full bg-sage-green inline-block animate-pulse" />
            New Zealand's Venue Management Platform
          </div>

          <h1 className="text-5xl md:text-6xl font-black text-gray-950 mb-6 leading-[1.05]" style={{ letterSpacing: '-0.04em' }}>
            Run your venue.<br />
            <span className="text-sage-green">Not spreadsheets.</span>
          </h1>

          <p className="text-lg text-gray-500 mb-10 max-w-lg mx-auto leading-relaxed">
            Everything your functions team needs in one place — enquiries, proposals, runsheets, and more.
          </p>

          {/* Clearly differentiated CTAs with strong affordance signals */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#"
              className="w-full sm:w-auto bg-sage-green text-white font-bold text-lg px-8 py-4 rounded-xl shadow-lg hover:bg-sage-dark hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
              Start free trial
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="#"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-gray-700 font-semibold text-base px-6 py-4 rounded-xl border-2 border-gray-200 hover:border-sage-green hover:text-sage-green transition-all">
              <Play className="w-4 h-4" />
              Watch a 2-min demo
            </a>
          </div>

          <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-400">
            <CheckCircle className="w-4 h-4 text-sage-green" />
            No credit card required &nbsp;·&nbsp; Cancel any time
          </div>
        </div>
      </section>

      {/* ── Feature cards with explicit action labels ───────────────────── */}
      <section className="bg-white py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-sage-green mb-2">Core features</p>
            <h2 className="text-3xl font-black text-gray-900" style={{ letterSpacing: '-0.03em' }}>Everything you need to run events</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <div key={i}
                className="bg-white rounded-2xl p-7 border-2 border-gray-100 hover:border-sage-green hover:shadow-lg transition-all duration-200 group cursor-pointer">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm mb-4 leading-relaxed">{f.desc}</p>
                <span className="text-sage-green font-semibold text-sm group-hover:underline flex items-center gap-1">
                  {f.action} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof ────────────────────────────────────────────────── */}
      <section className="bg-sage-tint py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 text-center md:text-left">
              <div className="flex justify-center md:justify-start gap-1 mb-3">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-5 h-5 fill-sage-green text-sage-green" />)}
              </div>
              <p className="text-lg font-semibold text-gray-900 leading-snug mb-4">
                "Finally a platform built for NZ venues. The enquiry-to-event flow is seamless and our team loves it."
              </p>
              <p className="text-sm font-semibold text-gray-900">James T.</p>
              <p className="text-xs text-gray-500 mt-0.5">Venue Director, Wellington</p>
            </div>
            <div className="flex-shrink-0 flex flex-col items-center gap-2">
              <div className="bg-sage-green text-white rounded-2xl px-8 py-5 text-center shadow-md">
                <Zap className="w-7 h-7 mx-auto mb-2" />
                <p className="font-black text-2xl">30 min</p>
                <p className="text-sm text-white/80">average setup time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Interactive FAQ ─────────────────────────────────────────────── */}
      <section className="bg-white py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-black text-gray-900 mb-10 text-center" style={{ letterSpacing: '-0.03em' }}>Common questions</h2>
          <div className="space-y-2">
            {faqs.map((f, i) => (
              <div key={i} className="border-2 border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 transition-colors">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                  {f.q}
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────── */}
      <section className="bg-sage-green py-20 px-6 text-center">
        <h2 className="text-4xl font-black text-white mb-4" style={{ letterSpacing: '-0.03em' }}>Ready to simplify your venue?</h2>
        <p className="text-white/80 mb-8 text-lg">Join venues across New Zealand using VenueFlowHQ.</p>
        <a href="#"
          className="inline-flex items-center gap-2 bg-white text-sage-dark font-bold px-10 py-5 rounded-xl hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 text-lg shadow-md">
          Get started free <ArrowRight className="w-5 h-5" />
        </a>
        <p className="text-white/60 text-sm mt-4">No credit card required · Cancel any time</p>
      </section>
    </div>
  );
}
