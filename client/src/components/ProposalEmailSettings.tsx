import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Settings → Email: the client-facing emails sent when a client answers a
 * proposal online. Saves as soon as it's switched.
 */
export default function ProposalEmailSettings() {
  const utils = trpc.useUtils();
  const { data: vs } = trpc.venue.getOwn.useQuery();
  // Shown immediately; put back if the save fails.
  const [on, setOn] = useState(true);
  useEffect(() => { if (vs) setOn((vs.proposalAcceptEmailEnabled ?? 1) !== 0); }, [vs]);
  const update = trpc.venue.update.useMutation({
    onSuccess: () => { utils.venue.getOwn.invalidate(); utils.venue.get.invalidate(); toast.success("Saved"); },
    onError: () => { setOn(v => !v); toast.error("Couldn't save that setting"); },
  });
  if (!vs) return null;
  return (
    <div className="mt-8">
      <h2 className="font-cormorant text-xl font-semibold text-ink mb-1">When a client accepts a proposal</h2>
      <div className="border border-gold bg-white p-4 flex items-start justify-between gap-4">
        <div>
          <label htmlFor="proposal-accept-email" className="font-dm text-sm font-semibold text-ink block">Email the client a booking confirmation</label>
          <p className="font-dm text-xs text-stone-600 mt-1 max-w-prose">
            A short, warm “you're booked in” email with the event summary and next steps (the deposit, if there is one,
            with your payment instructions). Sent through your email settings above. You're always alerted either way.
          </p>
        </div>
        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <input
            id="proposal-accept-email"
            type="checkbox"
            checked={on}
            onChange={e => { setOn(e.target.checked); update.mutate({ proposalAcceptEmailEnabled: e.target.checked ? 1 : 0 }); }}
            className="w-4 h-4 accent-forest"
          />
          <span className="font-bebas text-xs tracking-widest text-ink" aria-hidden>{on ? "ON" : "OFF"}</span>
        </label>
      </div>
    </div>
  );
}
