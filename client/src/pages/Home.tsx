import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

const LOGO_DARK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-dark-Jx4CYxeVqHBqATBq6HevAv.png";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white text-gray-900 font-inter" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200/80">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <img src={LOGO_DARK} alt="HOSTit" className="h-7 w-auto object-contain" style={{ filter: 'brightness(0)' }} />
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors hidden md:block font-medium">Features</a>
            <a href="#how" className="text-sm text-gray-500 hover:text-gray-900 transition-colors hidden md:block font-medium">How it works</a>
            {user ? (
              <Link href="/dashboard">
                <button className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                  Dashboard
                </button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <button className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                  Sign in
                </button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-28 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
            <span className="text-xs font-semibold text-blue-600 tracking-wide">New Zealand Venue Management</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight" style={{ letterSpacing: '-0.04em' }}>
            Every event,<br />
            <span className="text-blue-600">perfectly hosted.</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed mb-10" style={{ letterSpacing: '-0.01em' }}>
            HOSTit streamlines enquiries, proposals, and bookings for NZ restaurants, bars, and function venues — so you spend less time on admin and more time on hospitality.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href={getLoginUrl()}>
              <button className="px-8 py-3.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-all hover:shadow-lg hover:shadow-blue-600/25 active:scale-95">
                Get started free
              </button>
            </a>
            <a href="#features">
              <button className="px-8 py-3.5 text-sm font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                See how it works
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ letterSpacing: '-0.03em' }}>
              Built for the way venues work
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Enquiry Management",
                desc: "A branded public form captures every enquiry. Leads flow straight into your inbox, sorted by event date and status.",
                color: "bg-blue-50 text-blue-600",
              },
              {
                n: "02",
                title: "Proposals & Contracts",
                desc: "Generate polished proposals in seconds. Clients accept online — no printing, no scanning, no chasing.",
                color: "bg-indigo-50 text-indigo-600",
              },
              {
                n: "03",
                title: "Bookings & Calendar",
                desc: "Confirmed events land on your calendar automatically. See everything at a glance — bookings, follow-ups, enquiries.",
                color: "bg-green-50 text-green-600",
              },
              {
                n: "04",
                title: "Email Templates",
                desc: "One-click replies with personalised variable substitution. Never write the same email twice.",
                color: "bg-purple-50 text-purple-600",
              },
              {
                n: "05",
                title: "Runsheets",
                desc: "Auto-generate editable event runsheets from booking details. Share a live link or download as PDF.",
                color: "bg-orange-50 text-orange-600",
              },
              {
                n: "06",
                title: "Follow-Up Reminders",
                desc: "Set follow-up dates on any lead. Overdue items surface on your Overview so nothing slips through.",
                color: "bg-red-50 text-red-600",
              },
            ].map((f) => (
              <div key={f.n} className="bg-white rounded-2xl p-6 border border-gray-200 hover:shadow-md transition-shadow">
                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-bold mb-4 ${f.color}`}>{f.n}</div>
                <h3 className="text-base font-semibold text-gray-900 mb-2" style={{ letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how" className="py-24 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ letterSpacing: '-0.03em' }}>
              From enquiry to event in four steps
            </h2>
          </div>
          <div className="space-y-8">
            {[
              { n: "1", t: "Capture the enquiry", d: "Share your branded enquiry form link. Clients fill in their details — event type, date, guest count, budget." },
              { n: "2", t: "Send a proposal", d: "Review the lead, build a proposal with your packages and drinks menu, and send it with one click." },
              { n: "3", t: "Client accepts online", d: "Clients view and accept the proposal on a clean, branded page. The booking is confirmed automatically." },
              { n: "4", t: "Host the event", d: "Your runsheet is ready. Your calendar is updated. Your team knows exactly what's happening." },
            ].map((s) => (
              <div key={s.n} className="flex gap-6 items-start">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold shadow-md shadow-blue-600/25">
                  {s.n}
                </div>
                <div className="pt-1.5">
                  <h3 className="text-base font-semibold text-gray-900 mb-1" style={{ letterSpacing: '-0.01em' }}>{s.t}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-gray-900">
        <div className="max-w-2xl mx-auto text-center">
          <img src={LOGO_DARK} alt="HOSTit" className="h-10 w-auto object-contain mx-auto mb-8 brightness-0 invert opacity-90" />
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ letterSpacing: '-0.03em' }}>
            Ready to host better events?
          </h2>
          <p className="text-sm text-gray-400 mb-10">
            Free to start. No credit card required.
          </p>
          <a href={getLoginUrl()}>
            <button className="px-10 py-4 bg-white text-gray-900 text-sm font-semibold rounded-xl hover:bg-gray-100 transition-colors active:scale-95">
              Start for free
            </button>
          </a>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="py-8 px-6 border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={LOGO_DARK} alt="HOSTit" className="h-6 w-auto object-contain" style={{ filter: 'brightness(0)' }} />
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} HOSTit. Built for New Zealand venues.
          </p>
          <div className="flex gap-6">
            <a href="/privacy" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Privacy</a>
            <a href="/terms" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
