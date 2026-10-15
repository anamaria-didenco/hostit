import { useEffect } from "react";
import { useLocation } from "wouter";
import { CalendarCheck, FileText, Users, Wallet, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// One-screen "welcome to VenueFlowHQ" intro, shown once to a brand-new account
// right after sign-up, then it stays dismissed (stored per account on
// venue_settings.welcomeSeenAt). Plain-English, no jargon — the whole point is
// that a first-time user understands what the app is before the dashboard.
const THINGS = [
  { icon: Users, title: "Enquiries", body: "Every event enquiry lands in one inbox — reply, quote and track it without the back-and-forth of email threads." },
  { icon: FileText, title: "Proposals & BEOs", body: "Send a polished proposal, then turn the booking into a BEO — the event's run sheet / kitchen sheet your team actually reads on the day." },
  { icon: CalendarCheck, title: "Runsheets", body: "Lay out the timeline for the night so front-of-house and the kitchen are working from the same plan." },
  { icon: Wallet, title: "Payments", body: "See who owes a deposit, what's been invoiced and who's paid — across every booking, at a glance." },
];

export default function Welcome() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { data: venue, isLoading: venueLoading } = trpc.venue.getOwn.useQuery(undefined, { enabled: !!user });
  const dismiss = trpc.venue.dismissWelcome.useMutation();

  // Send unauthenticated visitors to login, and anyone who has already seen the
  // welcome straight to the dashboard — so it only ever appears once.
  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);
  useEffect(() => {
    if (venue && (venue as any).welcomeSeenAt) navigate("/dashboard");
  }, [venue, navigate]);

  const getStarted = async () => {
    try { await dismiss.mutateAsync(); } catch { /* dismissal is best-effort */ }
    navigate("/dashboard");
  };

  if (authLoading || !user || venueLoading) return null;

  return (
    <div role="main" className="min-h-screen bg-cream flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="font-sans text-[10px] font-extrabold uppercase tracking-[0.32em] text-forest mb-2">Welcome to VenueFlowHQ</div>
          <h1 className="font-cormorant text-4xl font-semibold text-ink">Everything your venue needs, in one place</h1>
          <p className="font-dm text-sage text-sm mt-2 max-w-lg mx-auto">
            VenueFlowHQ runs your functions side of the business — from the first enquiry to the final payment. Here's the quick tour.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {THINGS.map(t => (
            <div key={t.title} className="bg-white border border-gold/20 rounded-lg p-4 flex gap-3">
              <div className="flex-shrink-0 mt-0.5 text-forest">
                <t.icon className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-bebas tracking-widest text-sm text-ink">{t.title}</h2>
                <p className="font-dm text-xs text-sage mt-0.5 leading-relaxed">{t.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={getStarted}
            disabled={dismiss.isPending}
            className="inline-flex items-center gap-2 bg-forest text-cream font-bebas tracking-widest text-sm px-6 py-3 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {dismiss.isPending ? "SETTING UP…" : "GET STARTED"}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
          <p className="font-dm text-xs text-sage text-center max-w-md">
            Next you'll see a short checklist to set up your venue — your spaces, deposit terms and branding. You can do it now or come back to it anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
