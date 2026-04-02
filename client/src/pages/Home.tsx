import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight, CheckCircle, Star,
  ChevronDown, Zap, X, Loader2
} from "lucide-react";

const features = [
  { icon: "📋", title: "Enquiry Pipeline", action: "Manage leads →", desc: "Kanban-style view of every lead from first contact to confirmed booking." },
  { icon: "📄", title: "Proposal Builder", action: "Build a quote →", desc: "Drag-and-drop builder with your menus, spaces, pricing, and branding." },
  { icon: "🗓️", title: "Event Calendar", action: "View calendar →", desc: "Single calendar showing enquiries and confirmed events. Click to create." },
  { icon: "📋", title: "Runsheet Generator", action: "Generate runsheet →", desc: "Full FOH and Kitchen runsheet, auto-populated from event details." },
];

const faqs = [
  { q: "When will I get access?", a: "We're onboarding NZ venues in small batches to ensure a great experience. Join the waitlist and we'll be in touch as soon as your spot is ready." },
  { q: "Can my whole team use it?", a: "Yes — unlimited team members on all plans. Assign roles so staff only see what they need." },
  { q: "How long does setup take?", a: "Most venues are up and running within 30 minutes. We walk you through every step." },
  { q: "Can I import my existing data?", a: "Yes. We support CSV import for contacts, and our team can help with data migration." },
];

function WaitlistModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [venueName, setVenueName] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const joinMutation = trpc.waitlist.join.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    joinMutation.mutate({ name: name.trim(), email: email.trim(), venueName: venueName.trim() || undefined, message: message.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-sage-tint rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-sage-green" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2" style={{ letterSpacing: '-0.03em' }}>You're on the list!</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Thanks for your interest in VenueFlow. We'll be in touch as soon as your spot is ready — keep an eye on your inbox.
            </p>
            <button onClick={onClose} className="mt-6 bg-sage-green text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-sage-dark transition-colors text-sm">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h3 className="text-2xl font-black text-gray-900 mb-1" style={{ letterSpacing: '-0.03em' }}>Join the waitlist</h3>
              <p className="text-gray-500 text-sm">We're onboarding NZ venues in small batches. Drop your details and we'll reach out when your spot is ready.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Your name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-inter text-gray-900 focus:outline-none focus:border-sage-green transition-colors placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Email <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@yourvenue.co.nz"
                  required
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-inter text-gray-900 focus:outline-none focus:border-sage-green transition-colors placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Venue name</label>
                <input
                  type="text"
                  value={venueName}
                  onChange={e => setVenueName(e.target.value)}
                  placeholder="The Grand Room, Auckland"
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-inter text-gray-900 focus:outline-none focus:border-sage-green transition-colors placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Anything else? <span className="text-gray-300 font-normal normal-case">(optional)</span></label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us a bit about your venue or what you're looking for..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-inter text-gray-900 focus:outline-none focus:border-sage-green transition-colors placeholder:text-gray-300 resize-none"
                />
              </div>

              {joinMutation.error && (
                <p className="text-red-500 text-xs">{joinMutation.error.message}</p>
              )}

              <button
                type="submit"
                disabled={joinMutation.isPending || !name.trim() || !email.trim()}
                className="w-full bg-sage-green text-white font-bold py-3.5 rounded-lg hover:bg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {joinMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <>Join the waitlist <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading: isLoading } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);

  return (
    <div className="min-h-screen bg-white font-inter text-gray-900">

      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/logo-full.png" alt="VenueFlow" className="h-8 w-auto" />
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
            {isLoading ? null : user ? (
              <Link href="/dashboard">
                <button className="bg-sage-green text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-md hover:bg-sage-dark hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5">
                  Go to Dashboard <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            ) : (
              <>
                <a href={getLoginUrl()}
                  className="text-sm font-semibold text-gray-700 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all">
                  Sign in
                </a>
                <button
                  onClick={() => setShowWaitlist(true)}
                  className="bg-sage-green text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-md hover:bg-sage-dark hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5">
                  Join waitlist <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-white to-gray-50 pt-20 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-sage-tint text-sage-dark text-xs font-bold px-4 py-2 rounded-full mb-8 tracking-wide uppercase border border-sage-green/20">
            <span className="w-2 h-2 rounded-full bg-sage-green inline-block animate-pulse" />
            New Zealand's Venue Management Platform
          </div>

          <h1 className="text-5xl md:text-6xl font-black text-gray-950 mb-6 leading-[1.05]"
            style={{ letterSpacing: '-0.04em' }}>
            Run your venue.<br />
            <span className="text-sage-green">Not spreadsheets.</span>
          </h1>

          <p className="text-lg text-gray-500 mb-10 max-w-lg mx-auto leading-relaxed">
            Everything your functions team needs in one place — enquiries, proposals, runsheets, and more.
          </p>

          {isLoading ? null : user ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/dashboard">
                <button className="w-full sm:w-auto bg-sage-green text-white font-bold text-lg px-8 py-4 rounded-xl shadow-lg hover:bg-sage-dark hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
                  Go to Dashboard <ArrowRight className="w-5 h-5" />
                </button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => setShowWaitlist(true)}
                  className="w-full sm:w-auto bg-sage-green text-white font-bold text-lg px-8 py-4 rounded-xl shadow-lg hover:bg-sage-dark hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
                  Join the waitlist
                  <ArrowRight className="w-5 h-5" />
                </button>
                <a href={getLoginUrl()}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-gray-700 font-semibold text-base px-6 py-4 rounded-xl border-2 border-gray-200 hover:border-sage-green hover:text-sage-green transition-all">
                  Sign in
                </a>
              </div>
              <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-400">
                <CheckCircle className="w-4 h-4 text-sage-green" />
                Limited spots available &nbsp;·&nbsp; NZ venues only
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Feature cards ────────────────────────────────────────────────── */}
      <section id="features" className="bg-white py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-sage-green mb-2">Core features</p>
            <h2 className="text-3xl font-black text-gray-900" style={{ letterSpacing: '-0.03em' }}>
              Everything you need to run events
            </h2>
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

      {/* ── Social proof ─────────────────────────────────────────────────── */}
      <section className="bg-sage-tint py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 text-center md:text-left">
              <div className="flex justify-center md:justify-start gap-1 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-sage-green text-sage-green" />
                ))}
              </div>
              <p className="text-lg font-semibold text-gray-900 leading-snug mb-4">
                "Finally a platform built for NZ venues. The enquiry-to-event flow is seamless and our team loves it."
              </p>
              <p className="text-sm font-semibold text-gray-900">James T.</p>
              <p className="text-xs text-gray-500 mt-0.5">Venue Director, Wellington</p>
            </div>
            <div className="flex-shrink-0">
              <div className="bg-sage-green text-white rounded-2xl px-8 py-5 text-center shadow-md">
                <Zap className="w-7 h-7 mx-auto mb-2" />
                <p className="font-black text-2xl">30 min</p>
                <p className="text-sm text-white/80">average setup time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="bg-white py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-black text-gray-900 mb-10 text-center" style={{ letterSpacing: '-0.03em' }}>
            Common questions
          </h2>
          <div className="space-y-2">
            {faqs.map((f, i) => (
              <div key={i} className="border-2 border-gray-100 rounded-xl overflow-hidden hover:border-gray-200 transition-colors">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                  {f.q}
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pt-4 pb-5 text-gray-600 text-sm leading-relaxed border-t border-gray-100">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="bg-sage-green py-20 px-6 text-center">
        <h2 className="text-4xl font-black text-white mb-4" style={{ letterSpacing: '-0.03em' }}>
          Ready to simplify your venue?
        </h2>
        <p className="text-white/80 mb-8 text-lg">
          Join the waitlist and be first in line when your spot opens up.
        </p>
        <button
          onClick={() => setShowWaitlist(true)}
          className="inline-flex items-center gap-2 bg-white text-sage-dark font-bold px-10 py-5 rounded-xl hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 text-lg shadow-md">
          Join the waitlist <ArrowRight className="w-5 h-5" />
        </button>
        <p className="text-white/60 text-sm mt-4">Limited spots · NZ venues only</p>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-100 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center">
            <img src="/logo-full.png" alt="VenueFlow" className="h-7 w-auto" />
          </div>
          <p className="text-sm text-gray-400">© {new Date().getFullYear()} VenueFlowHQ. New Zealand's Venue Management Platform.</p>
          <div className="flex gap-6">
            {["Privacy", "Terms", "Contact"].map(item => (
              <a key={item} href="#" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">{item}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
