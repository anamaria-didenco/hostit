import { toast } from "sonner";

/** Labels bookings.update / leads.update report for the other records an edit
 *  also touched — e.g. "run sheet", "enquiry", "proposals still show the old
 *  guests" (server/routers.ts). */
export type CascadeResult = { cascaded?: string[] } | null | undefined;

/**
 * After the usual "saved" toast, add a short line saying what else the edit
 * changed, so a cascade (guests, space, date, contact) isn't a surprise.
 * No-op when nothing cascaded. Additive: call it in an existing onSuccess.
 */
export function showCascadedToast(result: CascadeResult) {
  const labels = result?.cascaded;
  if (!labels?.length) return;
  toast.message("Also updated", { description: labels.join(" · "), duration: 6000 });
}
