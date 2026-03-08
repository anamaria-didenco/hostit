import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  Calendar, ClipboardList, Users, FileText,
  ChevronRight, CheckCircle, Star, ArrowRight,
  LayoutGrid, Mail, Utensils
} from "lucide-react";

export default function Home() {
  const { user, loading: isLoading } = useAuth();

  const features = [
    {
      icon: <Users className="w-6 h-6" />,
      title: "Enquiry Management",
      desc: "Capture, track, and respond to event enquiries in one place. Never miss a lead.",
    },
    {
      icon: <Calendar className="w-6 h-6" />,
      title: "Event Calendar",
      desc: "See all confirmed events and enquiries on a single calendar. Click any date to create.",
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Proposals & Quotes",
      desc: "Build polished proposals with your menu, spaces, and pricing — sent in minutes.",
    },
    {
      icon: <ClipboardList className="w-6 h-6" />,
      title: "Runsheet Builder",
      desc: "Create detailed FOH and Kitchen runsheets for every event, fully editable.",
    },
    {
      icon: <LayoutGrid className="w-6 h-6" />,
      title: "Floor Plans",
      desc: "Design and save interactive floor plan templates for your event spaces.",
    },
    {
      icon: <Utensils className="w-6 h-6" />,
      title: "Menu Management",
      desc: "Manage menu sections, sales categories, and items — linked to proposals.",
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: "Email Templates",
      desc: "Send branded emails with custom templates directly from your dashboard.",
    },
    {
      icon: <CheckCircle className="w-6 h-6" />,
      title: "Task Automation",
      desc: "Set automated task reminders triggered by event milestones.",
    },
  ];

  const testimonials = [
    {
      quote: "HOSTit has completely transformed how we manage events. The runsheet builder alone saves us hours every week.",
      name: "Sarah M.",
      role: "Events Manager, Auckland",
      rating: 5,
    },
    {
      quote: "Finally a platform built for NZ venues. The enquiry-to-event flow is seamless and our team loves it.",
      name: "James T.",
      role: "Venue Director, Wellington",
      rating: 5,
    },
    {
      quote: "The proposal builder is beautiful. Our clients always comment on how professional our quotes look.",
      name: "Priya K.",
      role: "Functions Coordinator, Christchurch",
      rating: 5,
    },
  ];

  return (
    <div className="min-h-screen bg-white font-inter text-gray-900">

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sage-green flex items-center justify-center">
              <span className="text-white font-bold text-sm tracking-tight">H</span>
            </div>
            <span className="font-bold text-gray-900 tracking-tight text-lg">HOSTit</span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-8">
            {["Features", "Pricing", "About"].map(item => (
              <a key={item} href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium">
                {item}
              </a>
            ))}
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3">
            {isLoading ? null : user ? (
              <Link href="/dashboard">
                <button className="bg-sage-green text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-sage-dark transition-colors flex items-center gap-1.5">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            ) : (
              <>
                <a href={getLoginUrl()} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                  Sign in
                </a>
                <a href={getLoginUrl()} className="bg-sage-green text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-sage-dark transition-colors">
                  Get started
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white pt-20 pb-28">
        {/* Subtle background texture */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-[0.07]"
            style={{ background: 'radial-gradient(circle, #8D957E 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-[0.05]"
            style={{ background: 'radial-gradient(circle, #8D957E 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-sage-tint text-sage-dark text-xs font-semibold px-3 py-1.5 rounded-full mb-8 tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-sage-green inline-block" />
            New Zealand's Venue Management Platform
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 max-w-4xl mx-auto leading-[1.05]"
            style={{ letterSpacing: '-0.04em' }}>
            Run your venue.<br />
            <span style={{ color: '#8D957E' }}>Not spreadsheets.</span>
          </h1>

          {/* Sub */}
          <p className="text-xl text-gray-500 mb-10 max-w-xl mx-auto leading-relaxed font-normal">
            HOSTit brings enquiries, proposals, calendars, runsheets, and menus together — so your team can focus on the experience.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a href={getLoginUrl()}
              className="bg-sage-green text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-sage-dark transition-colors text-base flex items-center gap-2 shadow-sm">
              Start free trial <ArrowRight className="w-4 h-4" />
            </a>
            <a href="#features"
              className="text-gray-600 font-medium px-7 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-base">
              See all features
            </a>
          </div>

          {/* Social proof */}
          <p className="mt-8 text-sm text-gray-400">
            Trusted by venues across New Zealand &nbsp;·&nbsp; No credit card required
          </p>
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section id="features" className="bg-gray-50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-sage-green mb-3">Everything you need</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4" style={{ letterSpacing: '-0.03em' }}>
              Built for functions teams
            </h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">
              Every tool your venue needs, designed to work together seamlessly.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f, i) => (
              <div key={i}
                className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-sage-green/30 hover:shadow-md transition-all duration-200 group">
                <div className="w-11 h-11 rounded-xl bg-sage-tint text-sage-dark flex items-center justify-center mb-4 group-hover:bg-sage-green group-hover:text-white transition-colors">
                  {f.icon}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2 text-base">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="bg-white py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-sage-green mb-3">Simple workflow</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4" style={{ letterSpacing: '-0.03em' }}>
              From enquiry to event in minutes
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Capture enquiries", desc: "Embed your contact form on your website. All enquiries land in your dashboard instantly." },
              { step: "02", title: "Send a proposal", desc: "Build a branded proposal with spaces, menus, and pricing. Send it with one click." },
              { step: "03", title: "Run the event", desc: "Generate a detailed runsheet for FOH and Kitchen. Everything your team needs, on one page." },
            ].map((s, i) => (
              <div key={i} className="relative">
                <div className="text-6xl font-bold text-gray-100 mb-4 select-none" style={{ letterSpacing: '-0.04em' }}>{s.step}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-500 leading-relaxed">{s.desc}</p>
                {i < 2 && (
                  <div className="hidden md:block absolute top-8 -right-4 text-gray-200">
                    <ChevronRight className="w-8 h-8" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-sage-green mb-3">Testimonials</p>
            <h2 className="text-4xl font-bold text-gray-900" style={{ letterSpacing: '-0.03em' }}>
              Loved by venue teams
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl p-7 border border-gray-100">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-sage-green text-sage-green" />
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed mb-5 text-sm">"{t.quote}"</p>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="bg-sage-green py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-5" style={{ letterSpacing: '-0.03em' }}>
            Ready to simplify your venue?
          </h2>
          <p className="text-white/80 text-lg mb-10 leading-relaxed">
            Join venues across New Zealand using HOSTit to manage events with confidence.
          </p>
          <a href={getLoginUrl()}
            className="inline-flex items-center gap-2 bg-white text-sage-dark font-semibold px-8 py-4 rounded-xl hover:bg-gray-50 transition-colors text-base shadow-sm">
            Get started free <ArrowRight className="w-4 h-4" />
          </a>
          <p className="text-white/60 text-sm mt-5">No credit card required · Set up in minutes</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-100 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sage-green flex items-center justify-center">
              <span className="text-white font-bold text-xs">H</span>
            </div>
            <span className="font-bold text-gray-900 tracking-tight">HOSTit</span>
          </div>
          <p className="text-sm text-gray-400">© {new Date().getFullYear()} HOSTit. New Zealand's Venue Management Platform.</p>
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
