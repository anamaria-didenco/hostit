import './_group.css';
import { ArrowRight, CheckCircle, Star, Users, Calendar, FileText, ClipboardList } from 'lucide-react';

/**
 * Variant 1 — Information Hierarchy
 * Tradeoff: Ruthlessly strip everything that isn't the primary decision.
 * The hero is the whole page on first scroll. Secondary content is progressively revealed.
 * Bold typographic scale makes the h1 unmissable; everything else steps down visually.
 * Sacrificed: feature completeness above the fold, testimonials de-emphasised.
 */

const steps = [
  { n: "1", title: "Capture an enquiry", desc: "Your branded form goes on your website. Every lead lands in your dashboard." },
  { n: "2", title: "Send the proposal", desc: "Build a polished quote in minutes — menus, spaces, pricing, all linked." },
  { n: "3", title: "Run the event", desc: "A full runsheet for FOH and Kitchen, auto-generated and shareable." },
];

const proofPoints = [
  "Enquiry-to-event pipeline",
  "Branded proposal builder",
  "Runsheet generator",
  "Floor plan editor",
  "Menu management",
  "Automated tasks",
];

export function HierarchyClarity() {
  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Nav — visually quiet, out of the way */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-sage-green flex items-center justify-center">
              <span className="text-white font-bold text-xs">V</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">VenueFlowHQ</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="#" className="text-xs font-medium text-gray-500 px-3 py-1.5 hover:text-gray-900 transition-colors">Sign in</a>
            <a href="#" className="bg-sage-green text-white text-xs font-semibold px-4 py-2 rounded-md hover:bg-sage-dark transition-colors">Start free trial</a>
          </div>
        </div>
      </header>

      {/* ── HERO: one dominant message ─────────────────────────────────── */}
      <section className="bg-white pt-24 pb-32 px-6">
        <div className="max-w-4xl mx-auto">

          {/* Eyebrow — tiny, factual */}
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sage-green mb-6">
            New Zealand's venue CRM
          </p>

          {/* H1 at maximum weight — THE dominant element */}
          <h1 className="text-[clamp(3rem,8vw,6.5rem)] font-black leading-[0.92] text-gray-950 mb-8" style={{ letterSpacing: '-0.05em' }}>
            Run your<br />
            <span className="text-sage-green">venue.</span><br />
            <span className="text-gray-300">Not spreadsheets.</span>
          </h1>

          {/* Single clear sentence, visually subordinate */}
          <p className="text-xl text-gray-500 max-w-lg mb-10 leading-relaxed">
            Everything your functions team needs — enquiries, proposals, runsheets — in one platform.
          </p>

          {/* ONE primary CTA, clearly dominant */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <a href="#"
              className="bg-sage-green text-white font-bold text-lg px-10 py-4 rounded-xl hover:bg-sage-dark transition-colors flex items-center gap-3 shadow-md">
              Start free trial
              <ArrowRight className="w-5 h-5" />
            </a>
            <p className="text-sm text-gray-400 self-center">No credit card · Set up in minutes</p>
          </div>

          {/* Proof bar — tertiary visual weight */}
          <div className="mt-14 pt-10 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">What's included</p>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {proofPoints.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-sage-green flex-shrink-0" />
                  {p}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — numbered hierarchy ──────────────────────────── */}
      <section className="bg-gray-50 py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-black text-gray-900 mb-16" style={{ letterSpacing: '-0.04em' }}>
            From enquiry<br />to event.
          </h2>
          <div className="space-y-12">
            {steps.map((s, i) => (
              <div key={i} className="flex gap-8 items-start">
                <div className="text-8xl font-black text-gray-100 leading-none select-none w-24 flex-shrink-0 -mt-2" style={{ letterSpacing: '-0.06em' }}>
                  {s.n}
                </div>
                <div className="pt-2">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-gray-500 leading-relaxed text-base max-w-lg">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL — singular, high weight ────────────────────────── */}
      <section className="bg-white py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex justify-center gap-1 mb-6">
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="w-5 h-5 fill-sage-green text-sage-green" />)}
          </div>
          <blockquote className="text-2xl font-semibold text-gray-900 leading-snug mb-6" style={{ letterSpacing: '-0.02em' }}>
            "VenueFlowHQ has completely transformed how we manage events. The runsheet builder alone saves us hours every week."
          </blockquote>
          <p className="text-sm font-semibold text-gray-900">Sarah M.</p>
          <p className="text-sm text-gray-400 mt-0.5">Events Manager, Auckland</p>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section className="bg-gray-950 py-20 px-6 text-center">
        <h2 className="text-4xl font-black text-white mb-4" style={{ letterSpacing: '-0.04em' }}>Ready to start?</h2>
        <p className="text-gray-400 mb-8 text-lg">Join NZ venues already using VenueFlowHQ.</p>
        <a href="#" className="inline-flex items-center gap-2 bg-sage-green text-white font-bold px-10 py-4 rounded-xl hover:bg-sage-dark transition-colors text-base">
          Get started free <ArrowRight className="w-4 h-4" />
        </a>
      </section>
    </div>
  );
}
