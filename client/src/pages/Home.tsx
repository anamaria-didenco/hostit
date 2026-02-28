import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

const LOGO_LIGHT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-light-auSwScdt4inoXk2LSecYHY.png";
const LOGO_DARK  = "https://d2xsxph8kpxj0f.cloudfront.net/310519663244480581/Ptxx6THeEZbSP594bz6QrZ/hostit-logo-minimal-dark-Jx4CYxeVqHBqATBq6HevAv.png";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground font-inter">

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <img src={LOGO_LIGHT} alt="HOSTit" className="h-8 w-auto object-contain" style={{ filter: "invert(0)" }} />
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">Features</a>
            <a href="#how" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden md:block">How it works</a>
            {user ? (
              <Link href="/dashboard">
                <button className="px-5 py-2 bg-burgundy text-cream text-sm font-medium rounded-sm hover:bg-burg-dark transition-colors" style={{ backgroundColor: "oklch(0.310 0.095 10)", color: "oklch(0.960 0.012 68)" }}>
                  Dashboard
                </button>
              </Link>
            ) : (
              <a href={getLoginUrl()}>
                <button className="px-5 py-2 text-sm font-medium rounded-sm border transition-colors" style={{ borderColor: "oklch(0.310 0.095 10)", color: "oklch(0.310 0.095 10)" }}>
                  Sign in
                </button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="font-bebas tracking-[0.25em] text-xs mb-8" style={{ color: "oklch(0.720 0.045 220)" }}>
            NEW ZEALAND VENUE MANAGEMENT
          </p>
          <h1 className="font-cormorant text-6xl md:text-8xl font-light mb-6 leading-none" style={{ color: "oklch(0.220 0.075 10)" }}>
            Every event,<br />
            <em className="italic">perfectly hosted.</em>
          </h1>
          <div className="w-16 h-px mx-auto my-8" style={{ backgroundColor: "oklch(0.310 0.095 10 / 0.35)" }} />
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed mb-12">
            HOSTit streamlines enquiries, proposals, and bookings for NZ restaurants, bars, and function venues — so you spend less time on admin and more time on hospitality.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href={getLoginUrl()}>
              <button className="px-8 py-3.5 text-sm font-medium tracking-wide rounded-sm transition-colors" style={{ backgroundColor: "oklch(0.310 0.095 10)", color: "oklch(0.960 0.012 68)" }}>
                Get started free
              </button>
            </a>
            <a href="#features">
              <button className="px-8 py-3.5 text-sm font-medium tracking-wide rounded-sm border transition-colors" style={{ borderColor: "oklch(0.880 0.012 65)", color: "oklch(0.500 0.020 50)" }}>
                See how it works
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Stripe divider ─────────────────────────────────────────────── */}
      <div className="h-2 stripe-pattern opacity-60" />

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6" style={{ backgroundColor: "oklch(0.978 0.008 68)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-bebas tracking-[0.25em] text-xs mb-4" style={{ color: "oklch(0.720 0.045 220)" }}>FEATURES</p>
            <h2 className="font-cormorant text-4xl md:text-5xl font-light" style={{ color: "oklch(0.220 0.075 10)" }}>
              Built for the way venues work
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                label: "01",
                title: "Enquiry Management",
                desc: "A branded public form captures every enquiry. Leads flow straight into your inbox, sorted by event date and status.",
              },
              {
                label: "02",
                title: "Proposals & Contracts",
                desc: "Generate polished proposals in seconds. Clients accept online — no printing, no scanning, no chasing.",
              },
              {
                label: "03",
                title: "Bookings & Calendar",
                desc: "Confirmed events land on your calendar automatically. See everything at a glance — bookings, follow-ups, enquiries.",
              },
              {
                label: "04",
                title: "Email Templates",
                desc: "One-click replies with personalised variable substitution. Never write the same email twice.",
              },
              {
                label: "05",
                title: "Runsheets",
                desc: "Auto-generate editable event runsheets from booking details. Share a live link or download as PDF.",
              },
              {
                label: "06",
                title: "Follow-Up Reminders",
                desc: "Set follow-up dates on any lead. Overdue items surface on your Overview so nothing slips through.",
              },
            ].map((f) => (
              <div key={f.label} className="paradiso-card p-6">
                <p className="font-bebas tracking-[0.20em] text-xs mb-3" style={{ color: "oklch(0.720 0.045 220)" }}>{f.label}</p>
                <h3 className="font-cormorant text-xl font-medium mb-2" style={{ color: "oklch(0.220 0.075 10)" }}>{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-bebas tracking-[0.25em] text-xs mb-4" style={{ color: "oklch(0.720 0.045 220)" }}>HOW IT WORKS</p>
            <h2 className="font-cormorant text-4xl md:text-5xl font-light" style={{ color: "oklch(0.220 0.075 10)" }}>
              From enquiry to event in four steps
            </h2>
          </div>
          <div className="space-y-10">
            {[
              { n: "1", t: "Capture the enquiry", d: "Share your branded enquiry form link. Clients fill in their details — event type, date, guest count, budget." },
              { n: "2", t: "Send a proposal", d: "Review the lead, build a proposal with your packages and drinks menu, and send it with one click." },
              { n: "3", t: "Client accepts online", d: "Clients view and accept the proposal on a clean, branded page. The booking is confirmed automatically." },
              { n: "4", t: "Host the event", d: "Your runsheet is ready. Your calendar is updated. Your team knows exactly what's happening." },
            ].map((s) => (
              <div key={s.n} className="flex gap-8 items-start">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-cormorant text-lg font-semibold" style={{ backgroundColor: "oklch(0.310 0.095 10)", color: "oklch(0.960 0.012 68)" }}>
                  {s.n}
                </div>
                <div>
                  <h3 className="font-cormorant text-xl font-medium mb-1" style={{ color: "oklch(0.220 0.075 10)" }}>{s.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stripe divider ─────────────────────────────────────────────── */}
      <div className="h-2 stripe-pattern opacity-60" />

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6" style={{ backgroundColor: "oklch(0.220 0.075 10)" }}>
        <div className="max-w-2xl mx-auto text-center">
          <img src={LOGO_DARK} alt="HOSTit" className="h-16 w-auto object-contain mx-auto mb-8 opacity-90" />
          <h2 className="font-cormorant text-4xl md:text-5xl font-light mb-6" style={{ color: "oklch(0.960 0.012 68)" }}>
            Ready to host better events?
          </h2>
          <p className="text-sm mb-10" style={{ color: "oklch(0.720 0.045 220)" }}>
            Free to start. No credit card required.
          </p>
          <a href={getLoginUrl()}>
            <button className="px-10 py-4 text-sm font-medium tracking-wide rounded-sm transition-colors" style={{ backgroundColor: "oklch(0.960 0.012 68)", color: "oklch(0.220 0.075 10)" }}>
              Start for free
            </button>
          </a>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="py-10 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={LOGO_LIGHT} alt="HOSTit" className="h-6 w-auto object-contain" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} HOSTit. Built for New Zealand venues.
          </p>
          <div className="flex gap-6">
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
            <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
