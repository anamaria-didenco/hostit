import { useParams } from "wouter";
import { safeHtml } from "@/lib/safeHtml";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { venueBrand } from "@shared/brand";

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  unpaid: { label: "Awaiting Payment", cls: "bg-red-100 text-red-700" },
  partial: { label: "Partially Paid", cls: "bg-amber-100 text-amber-700" },
  deposit_paid: { label: "Deposit Received", cls: "bg-blue-100 text-blue-700" },
  paid_in_full: { label: "Paid in Full", cls: "bg-green-100 text-green-700" },
};
const PAYMENT_TYPE_LABELS: Record<string, string> = { deposit: "Deposit", partial: "Partial payment", final: "Final payment", refund: "Refund", other: "Payment" };
const PAYMENT_METHOD_LABELS: Record<string, string> = { bank_transfer: "Bank transfer", eftpos: "EFTPOS", cash: "Cash", credit_card: "Credit card", other: "Other" };
const PROPOSAL_STATUS_LABELS: Record<string, string> = { sent: "Awaiting your reply", viewed: "Awaiting your reply", accepted: "Accepted", declined: "Declined", expired: "Expired" };

const nzd = (n: number) => `$${Number(n ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDay = (d: Date | string | number) => new Date(d).toLocaleDateString("en-NZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.portal.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false },
  );

  // Load the venue's brand fonts once we know them.
  const brand = venueBrand((data?.venue ?? null) as any);
  useEffect(() => {
    if (!data?.venue) return;
    const id = "vf-portal-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet"; link.href = brand.fontLink;
    document.head.appendChild(link);
  }, [data?.venue, brand.fontLink]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f6f3ee] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading your event details…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f6f3ee] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Link Not Found</h1>
          <p className="text-gray-600">This portal link may have expired or been removed. Please contact your venue coordinator.</p>
        </div>
      </div>
    );
  }

  const { token: portalToken, permissions, booking, lead, proposal, paymentSummary, payments, paymentInstructions, venue, contracts, details, eventPackUrl, uploads } = data as any;
  const T = {
    accent: brand.accent, onAccent: brand.onAccent, serif: brand.serif, sans: brand.sans,
    bg: "#f6f3ee", card: "#ffffff", ink: "#1f2430", stone: "#6b7280", border: "#e7e2d8",
    soft: brand.onAccent === "#fff" ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.03)",
  };
  const eventName = booking ? `${booking.firstName}${booking.lastName ? ' ' + booking.lastName : ''}'s ${booking.eventType ?? 'Event'}` : lead ? `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}'s ${lead.eventType ?? 'Event'}` : "Your Event";
  const eventDate = booking?.eventDate ?? lead?.eventDate;
  const guestCount = booking?.guestCount ?? lead?.guestCount;
  const venueName = venue?.name ?? "Your event";
  const venueLogo = venue?.logoUrl;

  const hasTotal = Number(paymentSummary?.total ?? 0) > 0;
  const statusInfo = paymentSummary && !hasTotal && paymentSummary.status === "partial"
    ? { label: "Payment Received", cls: "bg-blue-100 text-blue-700" }
    : (PAYMENT_STATUS[paymentSummary?.status ?? "unpaid"] ?? PAYMENT_STATUS.unpaid);
  const lineItems = proposal?.lineItems ? (() => { try { return JSON.parse(proposal.lineItems); } catch { return []; } })() : [];

  const canSubmitDetails = !!booking && permissions.submitDetails !== false;
  const canUpload = permissions.uploadFiles !== false;
  const hasDocs = (permissions.viewProposal && proposal?.publicToken) || eventPackUrl;

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div className="px-6 py-4 border-b" style={{ borderColor: T.border }}>
      <h3 className="font-bold text-lg" style={{ fontFamily: T.serif, color: T.ink }}>{children}</h3>
    </div>
  );
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>{children}</div>
  );

  return (
    <div className="min-h-screen" style={{ background: T.bg, fontFamily: T.sans, color: T.ink }}>
      {/* Header */}
      <header className="py-7 px-6" style={{ background: T.accent, color: T.onAccent }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            {venueLogo
              ? <img src={venueLogo} alt={venueName} className="h-10 md:h-12 w-auto max-w-[220px] object-contain mb-2" style={{ filter: T.onAccent === "#fff" ? "brightness(0) invert(1)" : "none" }} />
              : <div className="text-xs font-bold tracking-[0.2em] uppercase mb-1" style={{ opacity: 0.85 }}>Client Portal</div>}
            <h1 className="text-2xl font-bold" style={{ fontFamily: T.serif, color: T.onAccent }}>{venueName}</h1>
            {venue?.tagline && <div className="text-sm mt-0.5" style={{ opacity: 0.85 }}>{venue.tagline}</div>}
          </div>
          <div className="text-right text-sm" style={{ opacity: 0.85 }}>
            <div>Prepared for</div>
            <div className="font-medium" style={{ opacity: 1 }}>{portalToken.clientName ?? "Valued Client"}</div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Event Summary */}
        <Card>
          <div className="px-6 py-4" style={{ background: T.accent, color: T.onAccent }}>
            <h2 className="text-xl font-bold" style={{ fontFamily: T.serif, color: T.onAccent }}>{eventName}</h2>
            <div className="flex flex-wrap gap-4 mt-2 text-sm" style={{ opacity: 0.9 }}>
              {eventDate && <span>📅 {fmtDay(eventDate)}</span>}
              {guestCount && <span>👥 {guestCount} guests</span>}
            </div>
          </div>
          <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
            {(booking?.spaceName ?? lead?.spaceName) && (
              <div><div className="text-xs uppercase tracking-wide mb-1" style={{ color: T.stone }}>Venue Space</div><div className="font-medium">{booking?.spaceName ?? lead?.spaceName}</div></div>
            )}
            {(booking?.eventType ?? lead?.eventType) && (
              <div><div className="text-xs uppercase tracking-wide mb-1" style={{ color: T.stone }}>Event Type</div><div className="font-medium">{booking?.eventType ?? lead?.eventType}</div></div>
            )}
          </div>
        </Card>

        {/* What's next — a simple timeline derived from the event's state */}
        <TimelineSection T={T} data={data} eventDate={eventDate} hasTotal={hasTotal} canSubmitDetails={canSubmitDetails} />

        {/* Proposal */}
        {permissions.viewProposal && proposal && (
          <Card>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: T.border }}>
              <h3 className="font-bold text-lg" style={{ fontFamily: T.serif, color: T.ink }}>Event Proposal</h3>
              <span className="text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide" style={{ background: T.soft, color: T.accent }}>
                {PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}
              </span>
            </div>
            {proposal.publicToken && (
              <div className="px-6 py-3 border-b flex flex-wrap items-center justify-between gap-2 text-sm" style={{ borderColor: T.border }}>
                <span style={{ color: T.stone }}>
                  {["sent", "viewed"].includes(proposal.status) && permissions.approveProposal ? "Have a look and let us know if you'd like to go ahead." : "The full proposal, with menus and terms."}
                </span>
                <a href={`/proposal/${proposal.publicToken}`} className="font-semibold underline underline-offset-2" style={{ color: T.accent }}>
                  {["sent", "viewed"].includes(proposal.status) && permissions.approveProposal ? "Review and respond" : "View full proposal"}
                </a>
              </div>
            )}
            {proposal.introMessage && <div className="px-6 py-4 text-sm leading-relaxed border-b" style={{ color: T.stone, borderColor: T.border }}>{proposal.introMessage}</div>}
            {lineItems.length > 0 && (
              <div className="px-6 py-4">
                <table className="w-full text-sm">
                  <thead><tr className="border-b" style={{ borderColor: T.border }}>
                    <th className="text-left py-2 font-medium" style={{ color: T.stone }}>Item</th>
                    <th className="text-center py-2 font-medium" style={{ color: T.stone }}>Qty</th>
                    <th className="text-right py-2 font-medium" style={{ color: T.stone }}>Unit</th>
                    <th className="text-right py-2 font-medium" style={{ color: T.stone }}>Total</th>
                  </tr></thead>
                  <tbody>{lineItems.map((item: any, i: number) => (
                    <tr key={i} className="border-b" style={{ borderColor: T.border }}>
                      <td className="py-2">{item.description}</td>
                      <td className="py-2 text-center" style={{ color: T.stone }}>{item.qty}</td>
                      <td className="py-2 text-right" style={{ color: T.stone }}>${Number(item.unitPrice ?? 0).toFixed(2)}</td>
                      <td className="py-2 text-right font-medium">${Number(item.total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="mt-4 pt-4 border-t space-y-1 text-sm" style={{ borderColor: T.border }}>
                  <div className="flex justify-between" style={{ color: T.stone }}><span>Subtotal</span><span>${Number(proposal.subtotalNzd ?? 0).toFixed(2)}</span></div>
                  <div className="flex justify-between" style={{ color: T.stone }}><span>GST ({proposal.taxPercent ?? 15}%)</span><span>${Number(proposal.taxNzd ?? 0).toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span>${Number(proposal.totalNzd ?? 0).toFixed(2)} NZD</span></div>
                  {proposal.depositNzd && <div className="flex justify-between font-medium" style={{ color: T.accent }}><span>Deposit ({proposal.depositPercent ?? 25}%)</span><span>${Number(proposal.depositNzd).toFixed(2)} NZD</span></div>}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Confirm your details — final numbers + dietaries */}
        {canSubmitDetails && <DetailsSection T={T} token={token ?? ""} details={details} eventName={eventName} onSaved={() => utils.portal.getByToken.invalidate({ token: token ?? "" })} />}

        {/* Payments & Balance */}
        {booking && paymentSummary && (
          <Card>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: T.border }}>
              <h3 className="font-bold text-lg" style={{ fontFamily: T.serif, color: T.ink }}>Payments &amp; Balance</h3>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide ${statusInfo.cls}`}>{statusInfo.label}</span>
            </div>
            <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg px-4 py-3 text-center" style={{ background: T.soft }}>
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: T.stone }}>Event Total</div>
                {hasTotal ? <div className="font-bold text-lg">{nzd(paymentSummary.total)}</div> : <div className="text-sm italic py-1" style={{ color: T.stone }}>To be confirmed</div>}
                {hasTotal && paymentSummary.totalSource === "proposal" && <div className="text-xs mt-0.5" style={{ color: T.stone }}>From your accepted proposal</div>}
              </div>
              <div className="rounded-lg bg-green-50 px-4 py-3 text-center">
                <div className="text-green-700 text-xs uppercase tracking-wide mb-1">Paid to Date</div>
                <div className="font-bold text-green-700 text-lg">{nzd(paymentSummary.totalPaid)}</div>
              </div>
              {hasTotal ? (
                <div className={`rounded-lg px-4 py-3 text-center ${paymentSummary.outstanding > 0 ? "bg-red-50" : "bg-green-50"}`}>
                  <div className={`text-xs uppercase tracking-wide mb-1 ${paymentSummary.outstanding > 0 ? "text-red-700" : "text-green-700"}`}>Outstanding</div>
                  <div className={`font-bold text-lg ${paymentSummary.outstanding > 0 ? "text-red-700" : "text-green-700"}`}>{nzd(paymentSummary.outstanding)}</div>
                </div>
              ) : (
                <div className="rounded-lg px-4 py-3 text-center" style={{ background: T.soft }}>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: T.stone }}>Outstanding</div>
                  <div className="text-sm italic py-1" style={{ color: T.stone }}>To be confirmed</div>
                </div>
              )}
            </div>
            {paymentSummary.total > 0 && (
              <div className="px-6 pb-4">
                <div role="progressbar" aria-valuenow={Math.round(Math.min(100, (paymentSummary.totalPaid / paymentSummary.total) * 100))} aria-valuemin={0} aria-valuemax={100}
                  className="h-2 rounded-full overflow-hidden" style={{ background: T.soft }}>
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(100, (paymentSummary.totalPaid / paymentSummary.total) * 100)}%` }} />
                </div>
              </div>
            )}
            {paymentSummary.depositRequired && !paymentSummary.depositPaid && paymentSummary.depositNzd > 0 && (
              <div className="mx-6 mb-4 rounded-lg px-4 py-3 text-sm" style={{ border: `1px solid ${T.accent}40`, background: `${T.accent}0d`, color: T.accent }}>
                A deposit of <span className="font-bold">{nzd(paymentSummary.depositNzd)}</span> secures your booking. Once your venue receives it, it will appear below — please allow a day or two for bank transfers to clear.
              </div>
            )}
            {paymentInstructions && (
              <div className="mx-6 mb-4 rounded-lg px-4 py-3" style={{ border: `1px solid ${T.border}`, background: T.soft }}>
                <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: T.stone }}>How to pay</div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{paymentInstructions}</div>
              </div>
            )}
            {paymentSummary.credit > 0 && (
              <div className="mx-6 mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                You've paid <span className="font-bold">{nzd(paymentSummary.credit)}</span> more than the total — your venue will be in touch about the credit.
              </div>
            )}
            <div className="px-6 pb-5">
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: T.stone }}>Payments Received</div>
              {payments.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm" style={{ borderColor: T.border, color: T.stone }}>
                  No payments recorded yet. Once your venue records a payment from you, it will show here.
                </div>
              ) : (
                <ul className="divide-y rounded-lg border" style={{ borderColor: T.border }}>
                  {payments.map((p: any) => (
                    <li key={p.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.type === "refund" ? "bg-red-400" : "bg-green-500"}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{PAYMENT_TYPE_LABELS[p.type] ?? "Payment"} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}</div>
                          <div className="text-xs" style={{ color: T.stone }}>{new Date(p.paidAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</div>
                        </div>
                      </div>
                      <div className={`text-sm font-semibold flex-shrink-0 ${p.type === "refund" ? "text-red-600" : ""}`}>{p.type === "refund" ? "−" : ""}{nzd(p.amount)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

        {/* Documents */}
        {hasDocs && (
          <Card>
            <SectionTitle>Your documents</SectionTitle>
            <div className="p-4 space-y-2">
              {permissions.viewProposal && proposal?.publicToken && (
                <DocRow T={T} icon="📄" title="Event proposal" subtitle="Menus, pricing and terms" href={`/proposal/${proposal.publicToken}`} />
              )}
              {eventPackUrl && (
                <DocRow T={T} icon="📋" title="Event pack" subtitle="Your menu and run-of-day" href={eventPackUrl} />
              )}
            </div>
          </Card>
        )}

        {/* Files you've shared */}
        {canUpload && <UploadsSection T={T} token={token ?? ""} uploads={uploads ?? []} onChanged={() => utils.portal.getByToken.invalidate({ token: token ?? "" })} />}

        {/* Contracts */}
        {permissions.signContract && (
          contracts.length === 0 ? (
            <Card><div className="px-6 py-5"><h3 className="font-bold text-lg" style={{ fontFamily: T.serif }}>Contract</h3><p className="text-sm mt-1" style={{ color: T.stone }}>Your contract will appear here once the venue sends it.</p></div></Card>
          ) : contracts.map((c: any) => <ContractCard key={c.id} contract={c} portalToken={token ?? ""} T={T} />)
        )}

        {/* Footer */}
        <div className="text-center text-xs py-4" style={{ color: T.stone }}>
          {venue?.phone || venue?.email ? (
            <div className="mb-1">Questions? {[venue?.phone, venue?.email].filter(Boolean).join(" · ")}</div>
          ) : null}
          Powered by <span className="font-semibold" style={{ color: T.accent }}>VenueFlowHQ</span>
        </div>
      </div>
    </div>
  );
}

type Theme = { accent: string; onAccent: string; serif: string; sans: string; bg: string; card: string; ink: string; stone: string; border: string; soft: string };

function DocRow({ T, icon, title, subtitle, href }: { T: Theme; icon: string; title: string; subtitle: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-4 py-3 hover:opacity-90 transition-opacity" style={{ border: `1px solid ${T.border}` }}>
      <span className="text-xl" aria-hidden>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-sm">{title}</span>
        <span className="block text-xs" style={{ color: T.stone }}>{subtitle}</span>
      </span>
      <span className="text-sm font-semibold" style={{ color: T.accent }}>Open ↗</span>
    </a>
  );
}

function TimelineSection({ T, data, eventDate, hasTotal, canSubmitDetails }: { T: Theme; data: any; eventDate: any; hasTotal: boolean; canSubmitDetails: boolean }) {
  const ps = data.paymentSummary;
  const now = Date.now();
  const steps: Array<{ label: string; sub?: string; state: "done" | "current" | "upcoming" }> = [];
  // Proposal
  if (data.proposal) {
    if (data.proposal.status === "accepted") steps.push({ label: "Proposal accepted", state: "done" });
    else if (["sent", "viewed"].includes(data.proposal.status)) steps.push({ label: "Review your proposal", sub: "Let us know if you'd like to go ahead", state: "current" });
  }
  // Deposit
  if (ps?.depositRequired && ps.depositNzd > 0) {
    steps.push(ps.depositPaid ? { label: "Deposit received", state: "done" } : { label: "Deposit due", sub: "Secures your booking", state: "current" });
  }
  // Final details
  if (canSubmitDetails) {
    steps.push(data.details?.submittedAt ? { label: "Details confirmed", state: "done" } : { label: "Confirm your final numbers", sub: "Guest count and any dietaries", state: "current" });
  }
  // Balance
  if (hasTotal) {
    steps.push(ps?.outstanding === 0 ? { label: "Paid in full", state: "done" } : { label: "Balance due before the event", state: "upcoming" });
  }
  // Event day
  if (eventDate) {
    const past = new Date(eventDate).getTime() < now;
    steps.push({ label: past ? "Event day" : "Event day", sub: new Date(eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" }), state: past ? "done" : "upcoming" });
  }
  if (steps.length === 0) return null;
  return (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: T.border }}>
        <h3 className="font-bold text-lg" style={{ fontFamily: T.serif, color: T.ink }}>What's next</h3>
      </div>
      <ol className="px-6 py-4 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-1 w-3.5 h-3.5 rounded-full flex-shrink-0" style={{
              background: s.state === "done" ? T.accent : s.state === "current" ? "#fff" : T.soft,
              border: s.state === "current" ? `3px solid ${T.accent}` : s.state === "done" ? `3px solid ${T.accent}` : `2px solid ${T.border}`,
            }} />
            <span className="min-w-0">
              <span className="block text-sm font-medium" style={{ color: s.state === "upcoming" ? T.stone : T.ink }}>
                {s.label}{s.state === "current" && <span className="ml-2 text-xs font-semibold" style={{ color: T.accent }}>• now</span>}
              </span>
              {s.sub && <span className="block text-xs" style={{ color: T.stone }}>{s.sub}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type Dietary = { name: string; count: number; notes?: string };

function DetailsSection({ T, token, details, eventName, onSaved }: { T: Theme; token: string; details: any; eventName: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(!details?.submittedAt);
  const [guests, setGuests] = useState(details?.finalGuestCount != null ? String(details.finalGuestCount) : "");
  const [diet, setDiet] = useState<Dietary[]>(details?.dietaries?.length ? details.dietaries : []);
  const [notes, setNotes] = useState(details?.notes ?? "");

  const submit = trpc.portal.submitDetails.useMutation({
    onSuccess: () => { toast.success("Thanks — your venue has your details."); setEditing(false); onSaved(); },
    onError: (e) => toast.error(e.message || "We couldn't save that. Please try again."),
  });
  const addDiet = () => setDiet(d => [...d, { name: "", count: 1, notes: "" }]);
  const setD = (i: number, patch: Partial<Dietary>) => setDiet(d => d.map((x, j) => j === i ? { ...x, ...patch } : x));
  const rmDiet = (i: number) => setDiet(d => d.filter((_, j) => j !== i));
  const save = () => submit.mutate({
    token,
    finalGuestCount: guests.trim() === "" ? null : Math.max(0, Math.round(Number(guests) || 0)),
    dietaries: diet.filter(x => x.name.trim()).map(x => ({ name: x.name.trim(), count: Math.max(0, Math.round(Number(x.count) || 0)), notes: x.notes?.trim() || undefined })),
    notes: notes.trim() || undefined,
  });
  const FIELD = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none";

  return (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: T.border }}>
        <h3 className="font-bold text-lg" style={{ fontFamily: T.serif, color: T.ink }}>Confirm your details</h3>
        {details?.submittedAt && !editing && (
          <button onClick={() => setEditing(true)} className="text-sm font-semibold" style={{ color: T.accent }}>Update</button>
        )}
      </div>

      {details?.submittedAt && !editing ? (
        <div className="px-6 py-4 text-sm space-y-2">
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-green-800 text-sm">
            Sent to your venue on {new Date(details.submittedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}. You can update it any time before the event.
          </div>
          {details.finalGuestCount != null && <div><span style={{ color: T.stone }}>Final guest count: </span><span className="font-semibold">{details.finalGuestCount}</span></div>}
          {details.dietaries?.length > 0 && (
            <div>
              <div style={{ color: T.stone }}>Dietaries:</div>
              <ul className="list-disc pl-5">{details.dietaries.map((d: Dietary, i: number) => <li key={i}>{d.count}× {d.name}{d.notes ? ` — ${d.notes}` : ""}</li>)}</ul>
            </div>
          )}
          {details.notes && <div><span style={{ color: T.stone }}>Notes: </span>{details.notes}</div>}
        </div>
      ) : (
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm" style={{ color: T.stone }}>Let us know your final numbers and any dietary requirements for {eventName}. You can update this any time before the event.</p>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: T.stone }}>Final guest count</label>
            <input type="number" inputMode="numeric" min={0} value={guests} onChange={e => setGuests(e.target.value)} placeholder="e.g. 80" className={FIELD} style={{ borderColor: T.border, maxWidth: 160 }} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: T.stone }}>Dietary requirements</label>
              <button type="button" onClick={addDiet} className="text-xs font-semibold" style={{ color: T.accent }}>+ Add</button>
            </div>
            {diet.length === 0 && <p className="text-xs" style={{ color: T.stone }}>Add any allergies or dietary needs (e.g. 2× vegetarian, 1× gluten-free).</p>}
            <div className="space-y-2">
              {diet.map((d, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input value={d.name} onChange={e => setD(i, { name: e.target.value })} placeholder="e.g. Vegetarian" className={FIELD} style={{ borderColor: T.border, flex: 1 }} />
                  <input type="number" min={0} value={d.count} onChange={e => setD(i, { count: Number(e.target.value) })} aria-label="How many" className={`${FIELD} text-center`} style={{ borderColor: T.border, width: 64 }} />
                  <input value={d.notes ?? ""} onChange={e => setD(i, { notes: e.target.value })} placeholder="Notes" className={FIELD} style={{ borderColor: T.border, flex: 1 }} />
                  <button type="button" onClick={() => rmDiet(i)} aria-label="Remove" className="px-2 py-2 text-lg leading-none" style={{ color: T.stone }}>×</button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: T.stone }}>Anything else?</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Timings, accessibility, special requests…" className={FIELD} style={{ borderColor: T.border }} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={submit.isPending} className="px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50" style={{ background: T.accent, color: T.onAccent }}>
              {submit.isPending ? "Sending…" : "Send to venue"}
            </button>
            {details?.submittedAt && <button onClick={() => setEditing(false)} className="text-sm" style={{ color: T.stone }}>Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadsSection({ T, token, uploads, onChanged }: { T: Theme; token: string; uploads: any[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const up = trpc.portal.uploadFile.useMutation({
    onSuccess: () => { toast.success("Uploaded — thanks!"); onChanged(); },
    onError: (e) => toast.error(e.message || "Upload failed."),
    onSettled: () => setBusy(false),
  });
  const rm = trpc.portal.removeUpload.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message || "Couldn't remove that.") });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { toast.error("That file is too large — keep it under 5 MB."); return; }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = () => up.mutate({ token, dataUrl: String(reader.result), filename: file.name });
    reader.onerror = () => { setBusy(false); toast.error("Couldn't read that file."); };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: T.border }}>
        <div>
          <h3 className="font-bold text-lg" style={{ fontFamily: T.serif, color: T.ink }}>Share files</h3>
          <p className="text-xs" style={{ color: T.stone }}>Inspiration, floor-plan notes, documents — anything that helps us plan.</p>
        </div>
        <label className="px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer whitespace-nowrap" style={{ background: T.accent, color: T.onAccent, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Uploading…" : "Upload"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} disabled={busy} />
        </label>
      </div>
      <div className="p-4">
        {uploads.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm" style={{ borderColor: T.border, color: T.stone }}>
            No files yet. Use Upload to share images or PDFs with your venue.
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {uploads.map((u: any) => {
              const isImg = (u.contentType ?? "").startsWith("image/");
              return (
                <li key={u.id} className="relative rounded-lg overflow-hidden border group" style={{ borderColor: T.border }}>
                  <a href={u.url} target="_blank" rel="noopener noreferrer" className="block">
                    {isImg ? (
                      <img src={u.url} alt={u.filename} className="w-full h-28 object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-28 flex flex-col items-center justify-center" style={{ background: T.soft }}>
                        <span className="text-3xl" aria-hidden>📄</span>
                      </div>
                    )}
                    <div className="px-2 py-1.5 text-xs truncate" style={{ color: T.ink }}>{u.filename}</div>
                  </a>
                  <button onClick={() => rm.mutate({ token, uploadId: u.id })} aria-label={`Remove ${u.filename}`}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-sm leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">×</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

type PortalContract = { id: number; title: string; bodyHtml: string | null; bodyText: string; status: string; signedAt: number | null; signerName: string | null; expiresAt: number | null };

function ContractCard({ contract, portalToken, T }: { contract: PortalContract; portalToken: string; T: Theme }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const sign = trpc.portal.signContract.useMutation({
    onSuccess: () => utils.portal.getByToken.invalidate({ token: portalToken }),
    onError: (e) => toast.error(e.message || "We couldn't record your signature. Please try again."),
  });
  const fmtDate = (ms: number) => new Date(ms).toLocaleString("en-NZ", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const canSign = contract.status === "sent";

  return (
    <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <div className="px-6 py-4 border-b flex items-center justify-between gap-3" style={{ borderColor: T.border }}>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: T.stone }}>Contract</div>
          <h3 className="font-bold text-lg" style={{ fontFamily: T.serif, color: T.ink }}>{contract.title}</h3>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide flex-shrink-0 ${
          contract.status === "signed" ? "bg-green-100 text-green-800" : contract.status === "expired" ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-800"
        }`}>{contract.status === "signed" ? "Signed" : contract.status === "expired" ? "Expired" : "Ready to sign"}</span>
      </div>
      <div tabIndex={0} role="region" aria-label={`${contract.title} — contract text`}
        className="mx-6 my-4 max-h-96 overflow-y-auto rounded-lg px-4 py-3 text-sm leading-relaxed focus:outline-none" style={{ border: `1px solid ${T.border}`, background: T.soft, color: T.ink }}>
        {contract.bodyHtml
          ? <div className="contract-body space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold" dangerouslySetInnerHTML={{ __html: safeHtml(contract.bodyHtml) }} />
          : <div className="whitespace-pre-wrap">{contract.bodyText}</div>}
      </div>
      {contract.status === "signed" && (
        <div className="mx-6 mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Signed by <span className="font-semibold">{contract.signerName}</span>{contract.signedAt ? <> on {fmtDate(contract.signedAt)}</> : null}. Thank you — the venue has been told.
        </div>
      )}
      {contract.status === "expired" && (
        <div className="mx-6 mb-5 rounded-lg px-4 py-3 text-sm" style={{ border: `1px solid ${T.border}`, background: T.soft, color: T.stone }}>
          This contract has expired, so it can't be signed. Please contact the venue for an updated one.
        </div>
      )}
      {canSign && (
        <form className="px-6 pb-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (!name.trim() || !agreed) return; sign.mutate({ token: portalToken, contractId: contract.id, signerName: name.trim(), agreed: true }); }}>
          {contract.expiresAt && <p className="text-xs" style={{ color: T.stone }}>Please sign by {new Date(contract.expiresAt).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}.</p>}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: T.stone }}>Your full name</label>
            <input type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Type your full name"
              className="w-full rounded-lg px-3 py-2 italic text-lg focus:outline-none" style={{ border: `1px solid ${T.border}`, fontFamily: T.serif }} />
          </div>
          <label className="flex items-start gap-3 cursor-pointer text-sm" style={{ color: T.ink }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4" style={{ accentColor: T.accent }} />
            <span>I've read this contract and agree to it. Typing my name above is my electronic signature.</span>
          </label>
          <button type="submit" disabled={!name.trim() || !agreed || sign.isPending}
            className="w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: T.accent, color: T.onAccent }}>
            {sign.isPending ? "Signing…" : "Sign contract"}
          </button>
          <p className="text-xs" style={{ color: T.stone }}>We record your name, the time and your internet address with your signature.</p>
        </form>
      )}
    </div>
  );
}
