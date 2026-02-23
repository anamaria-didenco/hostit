import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, CheckCircle, FileText, Calendar, Users } from "lucide-react";

// Inline SVG waiter character (Campari-style)
function WaiterIllustration() {
  return (
    <svg viewBox="0 0 120 200" className="w-28 h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Tray */}
      <ellipse cx="85" cy="55" rx="22" ry="5" fill="#C8102E" opacity="0.9"/>
      {/* Bottle on tray */}
      <rect x="83" y="38" width="6" height="18" rx="2" fill="#6D1A36"/>
      <rect x="84" y="35" width="4" height="5" rx="1" fill="#6D1A36"/>
      {/* Arm holding tray */}
      <path d="M70 80 Q80 65 85 55" stroke="#2C1810" strokeWidth="5" strokeLinecap="round"/>
      {/* Body */}
      <rect x="52" y="90" width="28" height="50" rx="4" fill="#1a1a1a"/>
      {/* White shirt front */}
      <rect x="60" y="90" width="12" height="40" rx="2" fill="#FAF7F2"/>
      {/* Bow tie */}
      <path d="M62 95 L66 98 L70 95 L66 92 Z" fill="#C8102E"/>
      {/* Head */}
      <ellipse cx="66" cy="75" rx="12" ry="13" fill="#C8A882"/>
      {/* Hair */}
      <path d="M54 72 Q66 60 78 72" fill="#2C1810"/>
      {/* Face - nose */}
      <path d="M70 76 Q73 78 70 80" stroke="#8B6B4A" strokeWidth="1.5" fill="none"/>
      {/* Left leg */}
      <path d="M56 140 L52 185" stroke="#1a1a1a" strokeWidth="7" strokeLinecap="round"/>
      {/* Right leg (forward stride) */}
      <path d="M72 140 L80 180" stroke="#1a1a1a" strokeWidth="7" strokeLinecap="round"/>
      {/* Left shoe */}
      <ellipse cx="50" cy="186" rx="8" ry="4" fill="#1a1a1a"/>
      {/* Right shoe */}
      <ellipse cx="82" cy="181" rx="8" ry="4" fill="#1a1a1a"/>
      {/* Left arm down */}
      <path d="M52 100 Q40 115 38 130" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round"/>
      {/* White glove */}
      <circle cx="37" cy="132" r="5" fill="#FAF7F2"/>
    </svg>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-[#FAF7F2] font-dm overflow-x-hidden">
      {/* Top Nav */}
      <nav className="bg-brown text-cream h-14 flex items-center px-6 justify-between sticky top-0 z-50 border-b-4 border-tomato">
        <div className="flex items-center gap-0.5">
          <span className="font-alfa text-2xl text-tomato">HOST</span>
          <span className="font-pacifico text-xl text-amber">it</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/enquire">
            <Button variant="ghost" size="sm" className="text-cream/60 hover:text-cream font-bebas tracking-widest text-xs">
              SUBMIT ENQUIRY
            </Button>
          </Link>
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button size="sm" className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-xs">
                DASHBOARD
              </Button>
            </Link>
          ) : (
            <a href={getLoginUrl()}>
              <Button size="sm" className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-xs">
                SIGN IN
              </Button>
            </a>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-brown text-cream relative overflow-hidden">
        {/* Decorative background text */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none overflow-hidden">
          <span className="font-alfa text-[20vw] text-cream whitespace-nowrap">HOSTit</span>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-16 md:py-24 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 border border-amber/40 px-3 py-1 mb-6">
                <div className="w-1.5 h-1.5 bg-amber rounded-full" />
                <span className="font-bebas text-xs tracking-widest text-amber">EVENT CRM FOR NZ RESTAURANTS & VENUES</span>
              </div>

              <h1 className="font-alfa text-5xl md:text-6xl text-cream leading-none mb-4">
                MANAGE YOUR<br />
                <span className="text-tomato">EVENTS</span><br />
                BEAUTIFULLY.
              </h1>

              {/* Decorative rule */}
              <div className="flex items-center gap-3 my-5">
                <div className="w-12 h-0.5 bg-amber" />
                <div className="w-1.5 h-1.5 bg-amber rotate-45" />
                <div className="w-12 h-0.5 bg-amber" />
              </div>

              <p className="font-dm text-cream/60 text-base leading-relaxed mb-8 max-w-md">
                HOSTit is the event enquiry and proposal platform built for New Zealand restaurants, bars, and function venues. Capture leads, build stunning proposals, and confirm bookings — all in one place.
              </p>

              <div className="flex flex-wrap gap-3">
                <a href={getLoginUrl()}>
                  <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-12 px-8 text-base gap-2">
                    GET STARTED FREE <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
                <Link href="/enquire">
                  <Button variant="outline" className="border-2 border-cream/20 text-cream hover:bg-cream/10 font-bebas tracking-widest rounded-none h-12 px-8 text-base bg-transparent">
                    VIEW LEAD FORM
                  </Button>
                </Link>
              </div>
            </div>

            {/* Illustration */}
            <div className="flex justify-center items-end">
              <div className="relative">
                {/* Background circle */}
                <div className="w-56 h-56 bg-tomato/20 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                <WaiterIllustration />
                {/* Floating badge */}
                <div className="absolute -top-4 -right-8 bg-amber text-brown px-3 py-1.5 shadow-lg rotate-3">
                  <div className="font-bebas text-xs tracking-widest">NEW ENQUIRY!</div>
                  <div className="font-dm text-xs font-semibold">Wedding · 80 guests</div>
                </div>
                <div className="absolute -bottom-2 -left-8 bg-white border-2 border-border px-3 py-1.5 shadow-lg -rotate-2">
                  <div className="font-bebas text-xs tracking-widest text-green-600">PROPOSAL ACCEPTED</div>
                  <div className="font-alfa text-sm text-brown">$4,800 NZD</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Red stripe */}
      <div className="h-3 bg-tomato" />

      {/* How It Works */}
      <section className="py-16 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-2">THE WORKFLOW</div>
          <h2 className="font-alfa text-4xl text-brown">HOW HOSTit WORKS</h2>
          <div className="flex items-center gap-3 justify-center mt-3">
            <div className="w-8 h-0.5 bg-tomato" />
            <div className="w-1.5 h-1.5 bg-tomato rotate-45" />
            <div className="w-8 h-0.5 bg-tomato" />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {[
            {
              num: "01",
              icon: <Users className="w-6 h-6" />,
              title: "CAPTURE LEADS",
              desc: "Share your branded enquiry form link. Clients fill it out with their event details — it lands straight in your inbox.",
            },
            {
              num: "02",
              icon: <FileText className="w-6 h-6" />,
              title: "BUILD PROPOSALS",
              desc: "Create itemised proposals with your pricing, GST, deposit requirements, and T&Cs. Looks professional every time.",
            },
            {
              num: "03",
              icon: <ArrowRight className="w-6 h-6" />,
              title: "SEND TO CLIENT",
              desc: "Send a unique proposal link. Clients can view, accept, or decline online — no printing, no PDFs, no back-and-forth.",
            },
            {
              num: "04",
              icon: <Calendar className="w-6 h-6" />,
              title: "CONFIRM BOOKING",
              desc: "When accepted, the booking is automatically added to your calendar. Track deposits and manage your event pipeline.",
            },
          ].map((step) => (
            <div key={step.num} className="relative">
              <div className="bg-white border-2 border-border p-6 shadow-sm h-full">
                <div className="font-alfa text-5xl text-tomato/10 mb-2">{step.num}</div>
                <div className="text-tomato mb-3">{step.icon}</div>
                <h3 className="font-alfa text-sm text-brown mb-2">{step.title}</h3>
                <p className="font-dm text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-brown text-cream py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="font-bebas text-xs tracking-widest text-amber mb-2">EVERYTHING YOU NEED</div>
            <h2 className="font-alfa text-4xl text-cream">BUILT FOR VENUE TEAMS</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { title: "LEADS INBOX", desc: "All enquiries in one place. See new leads instantly, with full event details and client contact info." },
              { title: "PIPELINE VIEW", desc: "Drag leads through your sales pipeline — from New to Contacted to Proposal Sent to Booked." },
              { title: "PROPOSAL BUILDER", desc: "Build itemised proposals with line items, GST, deposit amounts, and custom T&Cs." },
              { title: "CLIENT PORTAL", desc: "Clients get a beautiful proposal page they can accept or decline with one click." },
              { title: "BOOKINGS CALENDAR", desc: "See all confirmed bookings on a monthly calendar. Never double-book again." },
              { title: "ACTIVITY LOG", desc: "Full history of every note, status change, and proposal sent for each lead." },
            ].map(f => (
              <div key={f.title} className="border border-cream/10 p-5 hover:bg-cream/5 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 bg-tomato rounded-full" />
                  <h3 className="font-alfa text-sm text-amber">{f.title}</h3>
                </div>
                <p className="font-dm text-xs text-cream/50 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 text-center bg-[#FAF7F2]">
        <div className="max-w-lg mx-auto">
          <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-3">GET STARTED TODAY</div>
          <h2 className="font-alfa text-4xl text-brown mb-4">READY TO HOST BETTER EVENTS?</h2>
          <p className="font-dm text-muted-foreground text-sm mb-8">
            Join New Zealand restaurants and venues using HOSTit to streamline their private events business.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href={getLoginUrl()}>
              <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none h-12 px-10 text-base gap-2">
                START FREE <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <Link href="/enquire">
              <Button variant="outline" className="border-2 border-border hover:border-tomato hover:text-tomato font-bebas tracking-widest rounded-none h-12 px-10 text-base">
                SEE LEAD FORM
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brown text-cream py-8 px-6 text-center border-t-4 border-tomato">
        <div className="flex items-center justify-center gap-0.5 mb-2">
          <span className="font-alfa text-2xl text-tomato">HOST</span>
          <span className="font-pacifico text-xl text-amber">it</span>
        </div>
        <div className="font-bebas text-xs tracking-widest text-cream/30 mb-4">EVENT CRM FOR NEW ZEALAND RESTAURANTS & VENUES</div>
        <div className="flex items-center justify-center gap-6 text-xs font-dm text-cream/30">
          <Link href="/dashboard"><span className="hover:text-cream/60 cursor-pointer transition-colors">Dashboard</span></Link>
          <Link href="/enquire"><span className="hover:text-cream/60 cursor-pointer transition-colors">Submit Enquiry</span></Link>
        </div>
        <div className="mt-6 font-dm text-xs text-cream/20">© {new Date().getFullYear()} HOSTit. Made in New Zealand.</div>
      </footer>
    </div>
  );
}
