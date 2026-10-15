import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/** What bookings.update / leads.update report after a guest change when the
 *  run sheet still has food lines at the old count (server/runsheetGuests.ts). */
export type FoodRescale = { from: number; to: number; lines: number };

/**
 * After a guest-count change: the run sheet already follows the new number,
 * but food quantities are never changed without asking. When the save
 * reports lines still at the old count, offer to update them.
 *
 * Returns `offer(result, event)`: true when it showed the offer (so the
 * caller can skip its usual "saved" toast), false otherwise.
 */
export function useFoodRescaleOffer() {
  const utils = trpc.useUtils();
  const rescale = trpc.fnb.rescaleGuests.useMutation({
    onSuccess: (_res, vars) => {
      utils.fnb.list.invalidate();
      utils.runsheets.invalidate();
      toast.success(`Food updated to ${vars.to}`);
    },
    onError: (e) => toast.error(e.message || "Couldn't update the food quantities"),
  });
  return (result: unknown, event: { bookingId?: number; leadId?: number }): boolean => {
    const fr = (result as { foodRescale?: FoodRescale } | null | undefined)?.foodRescale;
    // Whatever happens below, the run sheet's guest count has changed.
    utils.runsheets.invalidate();
    if (!fr || fr.lines <= 0) return false;
    const lines = `${fr.lines} ${fr.lines === 1 ? "line" : "lines"}`;
    toast.success(`Guests updated to ${fr.to}`, {
      description: `The run sheet has ${fr.to} too. ${lines} of food still say ${fr.from}.`,
      duration: 15000,
      // The button's label is long: put it on its own line under the text
      // rather than squeezing the message into a narrow column.
      classNames: { toast: "!flex-wrap", content: "basis-[calc(100%-30px)]", actionButton: "!ml-[22px] !mt-1" },
      action: {
        label: `Update food quantities ${fr.from} → ${fr.to} (${lines})`,
        onClick: () => rescale.mutate({ ...event, from: fr.from, to: fr.to }),
      },
    });
    return true;
  };
}
