import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight, Check, CheckCircle2, Plus,
  Inbox, FileText, Calendar, Clipboard, X, Loader2,
} from "lucide-react";

// ── Editorial marketing landing ──────────────────────────────────────────────
// Cream paper, VenueFlow deep blue, Spectral display + Hanken Grotesk UI.
// Mirrors references/marketing: serif hero with italic blue second line, numbered
// feature grid with icon chips, deep-blue proof band with serif stat, FAQ
// accordion (+ → ✕), CTA, footer. Monochrome lucide icons — no emoji, no gradients.

const features = [
  { icon: Inbox, n: "01", title: "Enquiry Pipeline", desc: "Every lead from first contact to confirmed booking on one board — nothing slips." },
  { icon: FileText, n: "02", title: "Proposals & BEOs", desc: "Beautifully typeset event orders from your menus, spaces, and pricing in minutes." },
  { icon: Calendar, n: "03", title: "Event Calendar", desc: "Enquiries, tastings, and confirmed events in one shared view. Click to create." },
  { icon: Clipboard, n: "04", title: "Runsheets", desc: "Run-of-day, staffing, and setup checklist auto-built from the event detail." },
];

const faqs = [
  { q: "When will I get access?", a: "We're onboarding NZ venues in small batches. Join the waitlist and we'll be in touch as soon as your spot is ready." },
  { q: "Can my whole team use it?", a: "Yes — unlimited team members on every plan. Assign roles so floor, kitchen, and management see what they need." },
  { q: "How long does setup take?", a: "Most venues are running within 30 minutes. We walk you through every step." },
  { q: "Can I import existing data?", a: "Yes. CSV import for contacts, and our team can help migrate your back catalogue." },
];

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div
      className="font-sans font-extrabold uppercase"
      style={{
        fontSize: 10,
        letterSpacing: "0.32em",
        color: light ? "#a9c8f2" : "#2f5488",
      }}
    >
      {children}
    </div>
  );
}

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

  const fieldLabel = "block font-sans text-[9px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,20,15,0.5)] p-4" onClick={onClose}>
      <div
        className="bg-card rounded-lg border-[1.5px] border-input w-full max-w-md p-8 relative"
        style={{ boxShadow: "0 8px 40px rgba(0,0,0,.16)" }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-serif text-2xl font-semibold text-foreground mb-2 tracking-[-0.01em]">You're on the list</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Thanks for your interest in VenueFlow. We'll be in touch as soon as your spot is ready — keep an eye on your inbox.
            </p>
            <Button onClick={onClose} className="mt-6">Done</Button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <Eyebrow>Limited spots · NZ venues only</Eyebrow>
              <h3 className="font-serif text-2xl font-semibold text-foreground mt-2 mb-1 tracking-[-0.01em]">Join the waitlist</h3>
              <p className="text-muted-foreground text-sm">We're onboarding NZ venues in small batches. Drop your details and we'll reach out when your spot is ready.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={fieldLabel}>Your name <span className="text-destructive">*</span></label>
                <Input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required />
              </div>
              <div>
                <label className={fieldLabel}>Email <span className="text-destructive">*</span></label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@yourvenue.co.nz" required />
              </div>
              <div>
                <label className={fieldLabel}>Venue name</label>
                <Input type="text" value={venueName} onChange={e => setVenueName(e.target.value)} placeholder="The Grand Room, Auckland" />
              </div>
              <div>
                <label className={fieldLabel}>Anything else? <span className="text-[#a39684] normal-case font-normal tracking-normal">(optional)</span></label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Tell us a bit about your venue or what you're looking for..."
                  rows={2}
                  className="w-full border-[1.5px] border-input rounded-[4px] bg-card px-3 py-2 text-sm font-sans text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-[3px] focus:ring-primary/20 placeholder:text-muted-foreground resize-none"
                />
              </div>

              {joinMutation.error && (
                <p className="text-destructive text-xs">{joinMutation.error.message}</p>
              )}

              <Button
                type="submit"
                disabled={joinMutation.isPending || !name.trim() || !email.trim()}
                className="w-full"
              >
                {joinMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <>Join the waitlist <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading: isLoading } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [showWaitlist, setShowWaitlist] = useState(false);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">

      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border" style={{ background: "rgba(255,253,249,0.9)", backdropFilter: "blur(8px)" }}>
        <div className="max-w-6xl mx-auto px-6 h-[66px] flex items-center justify-between">
          <img src="/logo-full.png" alt="VenueFlow" className="h-7 w-auto" />

          <nav className="hidden md:flex items-center gap-7">
            {["Features", "Pricing", "About"].map(item => (
              <a key={item} href="#"
                className="font-sans text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground transition-colors">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            {isLoading ? null : user ? (
              <Link href="/dashboard">
                <Button>Go to Dashboard <ArrowRight className="w-3.5 h-3.5" /></Button>
              </Link>
            ) : (
              <>
                <a href={getLoginUrl()}>
                  <Button variant="paper">Sign in</Button>
                </a>
                <Button onClick={() => setShowWaitlist(true)}>
                  Join waitlist <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bg-background border-b border-border px-6" style={{ padding: "88px 24px 96px" }}>
        <div className="max-w-[780px] mx-auto text-center">
          <Eyebrow>New Zealand's Venue Management Platform</Eyebrow>
          <h1 className="font-serif text-foreground mx-auto"
            style={{ fontSize: 60, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.04, margin: "24px 0 0" }}>
            Run your venue.<br />
            <span style={{ fontStyle: "italic", fontWeight: 500, color: "#2f5488" }}>Not spreadsheets.</span>
          </h1>

          <p className="text-muted-foreground mx-auto" style={{ fontSize: 17, maxWidth: 500, margin: "22px auto 34px", lineHeight: 1.6 }}>
            Everything your functions team needs in one place — enquiries, proposals, runsheets, and the event orders your kitchen actually wants to read.
          </p>

          {isLoading ? null : user ? (
            <div className="flex items-center justify-center">
              <Link href="/dashboard">
                <Button size="lg">Go to Dashboard <ArrowRight className="w-[18px] h-[18px]" /></Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button size="lg" onClick={() => setShowWaitlist(true)}>
                  Join the waitlist <ArrowRight className="w-[18px] h-[18px]" />
                </Button>
                <a href={getLoginUrl()}>
                  <Button size="lg" variant="outline">Watch a demo</Button>
                </a>
              </div>
              <div className="inline-flex items-center justify-center gap-2 mt-7 text-[12.5px] text-[#a39684]">
                <span className="text-primary inline-flex"><Check className="w-[15px] h-[15px]" /></span>
                Limited spots · NZ venues only
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section id="features" className="px-6" style={{ background: "#f4efe6", padding: "76px 24px" }}>
        <div className="max-w-[1000px] mx-auto">
          <div className="flex items-center gap-3 mb-9">
            <Eyebrow>Core features</Eyebrow>
            <span className="flex-1 rounded-full" style={{ height: 1.5, background: "#2f5488" }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i}
                  className="group bg-card rounded-md border-[1.5px] border-input transition-all duration-150 hover:shadow-[0_6px_18px_rgba(22,20,15,0.09)] hover:border-[#8a8073] flex gap-[18px]"
                  style={{ padding: 26 }}>
                  <div className="shrink-0 grid place-items-center rounded-md bg-accent text-primary" style={{ width: 46, height: 46 }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-[13px] text-[#a39684]">{f.n}</span>
                      <h3 className="font-serif text-foreground" style={{ fontSize: 21, fontWeight: 600 }}>{f.title}</h3>
                    </div>
                    <p className="text-muted-foreground mt-1.5" style={{ fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Proof band (deep blue) ───────────────────────────────────────── */}
      <section className="px-6" style={{ background: "#2f5488", padding: "68px 24px" }}>
        <div className="max-w-[880px] mx-auto flex flex-wrap items-center gap-11">
          <div className="flex-1 min-w-[300px]">
            <Eyebrow light>From the floor</Eyebrow>
            <p className="font-serif text-white" style={{ fontSize: 25, fontWeight: 500, fontStyle: "italic", lineHeight: 1.4, margin: "14px 0 18px" }}>
              "Finally a platform built for NZ venues. The enquiry-to-BEO flow is seamless and our chefs actually read the runsheets now."
            </p>
            <p className="text-white font-bold text-sm">James T.</p>
            <p className="text-[13px]" style={{ color: "#a9c8f2" }}>Venue Director · Wellington</p>
          </div>
          <div className="text-center px-7" style={{ borderLeft: "1px solid rgba(255,255,255,0.18)", padding: "4px 28px" }}>
            <p className="font-serif text-white" style={{ fontSize: 52, fontWeight: 600, lineHeight: 1 }}>30<span style={{ fontSize: 22 }}>min</span></p>
            <p className="mt-2 font-sans font-bold uppercase" style={{ fontSize: 12, color: "#a9c8f2", letterSpacing: "0.06em" }}>Average setup</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="bg-background px-6" style={{ padding: "76px 24px" }}>
        <div className="max-w-[660px] mx-auto">
          <div className="flex items-center gap-3 mb-7">
            <Eyebrow>Common questions</Eyebrow>
            <span className="flex-1 rounded-full" style={{ height: 1.5, background: "#2f5488" }} />
          </div>
          <div>
            {faqs.map((f, i) => (
              <div key={i} style={{ borderTop: "1px solid #e3ddd0", borderBottom: i === faqs.length - 1 ? "1px solid #e3ddd0" : "none" }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left flex items-center justify-between font-serif text-foreground"
                  style={{ padding: "17px 4px", fontSize: 16, fontWeight: 600 }}>
                  {f.q}
                  <span className="text-primary inline-flex transition-transform duration-150" style={{ transform: openFaq === i ? "rotate(45deg)" : "none" }}>
                    <Plus className="w-[17px] h-[17px]" />
                  </span>
                </button>
                {openFaq === i && (
                  <div className="text-muted-foreground" style={{ padding: "0 4px 18px", fontSize: 14, lineHeight: 1.6, maxWidth: "92%" }}>
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="px-6 text-center" style={{ background: "#f4efe6", padding: "78px 24px" }}>
        <Eyebrow>Limited spots · NZ venues only</Eyebrow>
        <h2 className="font-serif text-foreground" style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.02em", margin: "14px 0 26px" }}>
          Ready to simplify your venue?
        </h2>
        <Button size="lg" onClick={() => setShowWaitlist(true)}>
          Join the waitlist <ArrowRight className="w-[18px] h-[18px]" />
        </Button>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-background border-t border-border" style={{ padding: "34px 24px" }}>
        <div className="max-w-[1000px] mx-auto flex flex-wrap items-center justify-between gap-5">
          <img src="/logo-full.png" alt="VenueFlow" className="h-[22px] w-auto" />
          <p className="text-[12.5px] text-[#a39684]">© {new Date().getFullYear()} VenueFlowHQ · New Zealand's Venue Management Platform</p>
          <div className="flex gap-[22px]">
            {["Privacy", "Terms", "Contact"].map(item => (
              <a key={item} href="#" className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">{item}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
