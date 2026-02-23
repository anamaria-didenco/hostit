import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, FileText, MessageSquare, Star, ArrowRight, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber/20 text-amber border-amber/30",
  viewed: "bg-blue-100 text-blue-700 border-blue-200",
  responded: "bg-purple-100 text-purple-700 border-purple-200",
  proposal_sent: "bg-orange-100 text-orange-700 border-orange-200",
  booked: "bg-green-100 text-green-700 border-green-200",
  declined: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  accepted: "bg-green-100 text-green-700 border-green-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function PlannerPortal() {
  const { user, isAuthenticated, loading } = useAuth();

  const { data: myInquiries } = trpc.inquiries.byPlanner.useQuery(
    undefined,
    { enabled: !!user?.id }
  );
  const { data: myProposals } = trpc.proposals.byPlanner.useQuery(
    undefined,
    { enabled: !!user?.id }
  );

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="font-alfa text-3xl text-tomato/20 animate-pulse">LOADING...</div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-background font-dm">
      <nav className="bg-brown text-cream sticky top-0 z-50 shadow-lg border-b-4 border-tomato">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center gap-0.5 cursor-pointer">
              <span className="font-alfa text-3xl text-tomato tracking-tight leading-none">HOST</span>
              <span className="font-pacifico text-2xl text-amber leading-none mt-1">it</span>
            </div>
          </Link>
        </div>
      </nav>
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center max-w-sm px-4">
          <div className="w-24 h-24 bg-amber flex items-center justify-center mx-auto mb-6">
            <Calendar className="w-12 h-12 text-brown" />
          </div>
          <h1 className="font-alfa text-3xl text-brown mb-3">EVENT PLANNER PORTAL</h1>
          <p className="font-dm text-muted-foreground mb-6">Sign in to track your venue enquiries, view proposals, and manage your events.</p>
          <a href={getLoginUrl()}>
            <Button className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none px-8 h-11 w-full mb-3">
              SIGN IN TO CONTINUE
            </Button>
          </a>
          <Link href="/venues">
            <Button variant="outline" className="border-2 border-border hover:border-tomato hover:text-tomato font-bebas tracking-widest rounded-none w-full">
              BROWSE VENUES FIRST
            </Button>
          </Link>
          <div className="mt-4">
            <Link href="/"><Button variant="ghost" className="font-dm text-muted-foreground text-sm">← Back to HOSTit</Button></Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background font-dm">
      {/* Nav */}
      <nav className="bg-brown text-cream sticky top-0 z-50 shadow-lg border-b-4 border-tomato">
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link href="/">
            <div className="flex items-center gap-0.5 cursor-pointer">
              <span className="font-alfa text-3xl text-tomato tracking-tight leading-none">HOST</span>
              <span className="font-pacifico text-2xl text-amber leading-none mt-1">it</span>
            </div>
          </Link>
          <div className="font-bebas text-amber tracking-widest text-sm hidden md:block">MY EVENTS PORTAL</div>
          <div className="flex items-center gap-3">
            <span className="font-dm text-cream/60 text-xs hidden md:block">{user?.name}</span>
            <Link href="/venues">
              <Button size="sm" className="bg-tomato hover:bg-tomato/90 text-white font-bebas tracking-widest rounded-none text-xs">
                FIND VENUES
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-1">WELCOME BACK</div>
          <h1 className="font-alfa text-4xl text-brown">{user?.name?.split(" ")[0]?.toUpperCase() ?? "PLANNER"}'S PORTAL</h1>
          <div className="retro-divider text-tomato/30 font-bebas mt-3 max-w-xs" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "ENQUIRIES SENT", value: myInquiries?.length ?? 0, color: "bg-tomato" },
            { label: "PROPOSALS RECEIVED", value: myProposals?.length ?? 0, color: "bg-amber" },
            { label: "ACCEPTED", value: myProposals?.filter((p: any) => p.status === "accepted").length ?? 0, color: "bg-green-600" },
            { label: "PENDING RESPONSE", value: myInquiries?.filter((i: any) => ["new","viewed"].includes(i.status)).length ?? 0, color: "bg-brown" },
          ].map(s => (
            <div key={s.label} className="bg-card border-2 border-border p-4">
              <div className={`w-8 h-1 ${s.color} mb-3`} />
              <div className="font-alfa text-4xl text-brown">{s.value}</div>
              <div className="font-bebas text-xs tracking-widest text-muted-foreground leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* My Inquiries */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-alfa text-2xl text-brown">MY ENQUIRIES</h2>
              <Link href="/venues">
                <Button size="sm" variant="ghost" className="font-bebas tracking-widest text-xs text-tomato gap-1">
                  NEW ENQUIRY <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            {(myInquiries ?? []).length === 0 ? (
              <div className="border-2 border-dashed border-border p-8 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <div className="font-alfa text-xl text-muted-foreground/30 mb-2">NO ENQUIRIES YET</div>
                <p className="font-dm text-muted-foreground text-sm mb-4">Browse venues and send your first enquiry.</p>
                <Link href="/venues">
                  <Button className="bg-tomato text-white font-bebas tracking-widest rounded-none text-sm">FIND A VENUE</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {(myInquiries ?? []).map((inq: any) => (
                  <div key={inq.id} className="bg-card border-2 border-border p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-dm font-semibold text-sm text-brown">Venue #{inq.venueId}</div>
                        <div className="font-dm text-xs text-muted-foreground">
                          {inq.eventType || "Event"} · {inq.eventDate ? new Date(inq.eventDate).toLocaleDateString("en-NZ") : "Date TBC"}
                          {inq.guestCount ? ` · ${inq.guestCount} guests` : ""}
                        </div>
                      </div>
                      <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${STATUS_COLORS[inq.status] ?? "bg-muted"}`}>
                        {inq.status.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                    {inq.message && (
                      <p className="font-dm text-xs text-muted-foreground italic line-clamp-2">"{inq.message}"</p>
                    )}
                    <div className="mt-2 pt-2 border-t border-dashed border-border">
                      <span className="font-dm text-xs text-muted-foreground">
                        Sent {new Date(inq.createdAt).toLocaleDateString("en-NZ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My Proposals */}
          <div>
            <h2 className="font-alfa text-2xl text-brown mb-4">PROPOSALS RECEIVED</h2>
            {(myProposals ?? []).length === 0 ? (
              <div className="border-2 border-dashed border-border p-8 text-center">
                <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <div className="font-alfa text-xl text-muted-foreground/30 mb-2">NO PROPOSALS YET</div>
                <p className="font-dm text-muted-foreground text-sm">Venue owners will send proposals in response to your enquiries.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(myProposals ?? []).map((prop: any) => (
                  <div key={prop.id} className={`bg-card border-2 p-4 ${prop.status === "accepted" ? "border-green-400" : "border-border"}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-playfair text-base text-brown font-semibold">{prop.title}</div>
                        {prop.packageName && <div className="font-bebas text-xs tracking-widest text-amber">{prop.packageName}</div>}
                      </div>
                      <span className={`font-bebas text-xs tracking-widest px-2 py-0.5 border ${STATUS_COLORS[prop.status] ?? "bg-muted"}`}>
                        {prop.status.toUpperCase()}
                      </span>
                    </div>
                    {prop.totalNzd && (
                      <div className="font-alfa text-2xl text-tomato mb-2">
                        ${Number(prop.totalNzd).toLocaleString()} <span className="font-dm text-xs text-muted-foreground font-normal">NZD</span>
                      </div>
                    )}
                    {prop.message && <p className="font-dm text-xs text-muted-foreground italic mb-3 line-clamp-3">"{prop.message}"</p>}
                    {prop.notes && (
                      <div className="bg-muted p-2 mb-3">
                        <div className="font-bebas text-xs tracking-widest text-muted-foreground mb-1">INCLUSIONS</div>
                        <p className="font-dm text-xs">{prop.notes}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t border-dashed border-border">
                      {prop.depositRequired && (
                        <span className="font-dm text-xs text-muted-foreground">
                          Deposit: ${Number(prop.depositRequired).toLocaleString()} NZD
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CTA: Browse more venues */}
        <div className="mt-12 bg-tomato relative overflow-hidden p-8 text-center">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 12px)', backgroundSize: '17px 17px' }} />
          <div className="relative z-10">
            <h2 className="font-alfa text-3xl text-white mb-3">FIND MORE VENUES</h2>
            <p className="font-dm text-white/70 mb-6">Discover extraordinary spaces across New Zealand for your next event.</p>
            <Link href="/venues">
              <Button className="bg-white text-tomato hover:bg-amber hover:text-brown font-bebas tracking-widest rounded-none px-8 h-11">
                BROWSE ALL VENUES <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <footer className="bg-brown text-cream border-t-4 border-tomato py-8 mt-8">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-0.5 mb-2">
            <span className="font-alfa text-3xl text-tomato">HOST</span>
            <span className="font-pacifico text-2xl text-amber">it</span>
          </div>
          <p className="font-dm text-cream/30 text-xs">© 2025 HOSTit. New Zealand's Premier Venue Platform.</p>
        </div>
      </footer>
    </div>
  );
}
