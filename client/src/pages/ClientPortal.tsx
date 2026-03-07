import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-yellow-100 text-yellow-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
};

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, error } = trpc.portal.getByToken.useQuery({ token: token ?? "" }, { enabled: !!token });
  const [signerName, setSignerName] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const signContract = trpc.contracts.sign.useMutation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f6f1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#2d5a27] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading your event details…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f8f6f1] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Link Not Found</h1>
          <p className="text-gray-500">This portal link may have expired or been removed. Please contact your venue coordinator.</p>
        </div>
      </div>
    );
  }

  const { token: portalToken, permissions, booking, lead, proposal } = data;
  const eventName = booking ? `${booking.firstName}${booking.lastName ? ' ' + booking.lastName : ''}'s ${booking.eventType ?? 'Event'}` : lead ? `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}'s ${lead.eventType ?? 'Event'}` : "Your Event";
  const eventDate = booking?.eventDate ?? lead?.eventDate;
  const guestCount = booking?.guestCount ?? lead?.guestCount;
  const venueName = "HOSTit Venue";

  const lineItems = proposal?.lineItems ? (() => { try { return JSON.parse(proposal.lineItems); } catch { return []; } })() : [];

  return (
    <div className="min-h-screen bg-[#f8f6f1]">
      {/* Header */}
      <header className="bg-[#1a2e1a] text-white py-6 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-xs font-bold tracking-[0.2em] text-[#c9a84c] uppercase mb-1">Client Portal</div>
            <h1 className="text-2xl font-bold">{venueName}</h1>
          </div>
          <div className="text-right text-sm text-white/60">
            <div>Prepared for</div>
            <div className="text-white font-medium">{portalToken.clientName ?? "Valued Client"}</div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Event Summary Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-[#2d5a27] text-white px-6 py-4">
            <h2 className="text-xl font-bold">{eventName}</h2>
            <div className="flex gap-4 mt-2 text-sm text-white/80">
              {eventDate && <span>📅 {new Date(eventDate).toLocaleDateString("en-NZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>}
              {guestCount && <span>👥 {guestCount} guests</span>}
            </div>
          </div>
          <div className="px-6 py-4 grid grid-cols-2 gap-4 text-sm">
            {(booking?.spaceName ?? lead?.spaceId) && (
              <div>
                <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Venue Space</div>
                <div className="font-medium text-gray-800">{booking?.spaceName ?? "Main Hall"}</div>
              </div>
            )}
            {(booking?.eventType ?? lead?.eventType) && (
              <div>
                <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Event Type</div>
                <div className="font-medium text-gray-800">{booking?.eventType ?? lead?.eventType}</div>
              </div>
            )}
          </div>
        </div>

        {/* Proposal Section */}
        {permissions.viewProposal && proposal && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-lg">Event Proposal</h3>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wide ${STATUS_COLORS[proposal.status ?? "draft"]}`}>
                {proposal.status}
              </span>
            </div>
            {proposal.introMessage && (
              <div className="px-6 py-4 text-gray-600 text-sm leading-relaxed border-b border-gray-50">
                {proposal.introMessage}
              </div>
            )}
            {lineItems.length > 0 && (
              <div className="px-6 py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">Item</th>
                      <th className="text-center py-2 text-gray-500 font-medium">Qty</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Unit Price</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 text-gray-800">{item.description}</td>
                        <td className="py-2 text-center text-gray-600">{item.qty}</td>
                        <td className="py-2 text-right text-gray-600">${Number(item.unitPrice ?? 0).toFixed(2)}</td>
                        <td className="py-2 text-right font-medium text-gray-800">${Number(item.total ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>${Number(proposal.subtotalNzd ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>GST ({proposal.taxPercent ?? 15}%)</span>
                    <span>${Number(proposal.taxNzd ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
                    <span>Total</span>
                    <span>${Number(proposal.totalNzd ?? 0).toFixed(2)} NZD</span>
                  </div>
                  {proposal.depositNzd && (
                    <div className="flex justify-between text-[#2d5a27] font-medium">
                      <span>Deposit Required ({proposal.depositPercent ?? 25}%)</span>
                      <span>${Number(proposal.depositNzd).toFixed(2)} NZD</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {proposal.termsAndConditions && (
              <div className="px-6 py-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Terms &amp; Conditions</div>
                <div className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">{proposal.termsAndConditions}</div>
              </div>
            )}
          </div>
        )}

        {/* Contract Signing Section */}
        {permissions.signContract && !signed && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-lg">Sign Contract</h3>
              <p className="text-sm text-gray-500 mt-1">Please review and sign below to confirm your booking.</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Full Name *</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  placeholder="Your full legal name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2d5a27]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Signature *</label>
                <input
                  type="text"
                  value={signatureData}
                  onChange={e => setSignatureData(e.target.value)}
                  placeholder="Type your name as your electronic signature"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2d5a27] font-serif italic text-lg"
                />
                <p className="text-xs text-gray-400 mt-1">By typing your name above, you agree this constitutes your legal electronic signature.</p>
              </div>
              <button
                disabled={!signerName || !signatureData || signing}
                onClick={async () => {
                  setSigning(true);
                  try {
                    // Find the contract token from the portal token's booking/lead
                    await signContract.mutateAsync({ token: token ?? "", signerName, signatureData });
                    setSigned(true);
                  } catch (e) {
                    alert("Could not sign contract. Please try again or contact your coordinator.");
                  } finally {
                    setSigning(false);
                  }
                }}
                className="w-full bg-[#2d5a27] text-white py-3 rounded-lg font-semibold text-sm hover:bg-[#1a3a16] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {signing ? "Signing…" : "Sign & Confirm Booking"}
              </button>
            </div>
          </div>
        )}

        {signed && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-6 text-center">
            <div className="text-4xl mb-2">✅</div>
            <h3 className="font-bold text-green-800 text-lg">Contract Signed!</h3>
            <p className="text-green-700 text-sm mt-1">Thank you. Your booking is confirmed. Your coordinator will be in touch shortly.</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 py-4">
          Powered by <span className="font-semibold text-[#2d5a27]">HOSTit</span> · New Zealand Venue Management
        </div>
      </div>
    </div>
  );
}
