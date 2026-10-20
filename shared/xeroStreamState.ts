// What the Payments board shows for a food/drinks stream, given the stored chip
// and the booking's invoices in Xero. Xero is the source of truth for what
// actually went out and what was paid:
//  - only drafts       → nothing has reached the client yet ("draft in Xero")
//  - something sent    → invoiced
//  - every invoice PAID → paid ("paid in Xero")
// It only decides what is shown; nothing is written back.

export type XeroInvoiceLite = { stream: string; status: string | null | undefined };

export type StreamView = { status: string; draft: boolean; xeroPaid: boolean };

const isGone = (s: string | null | undefined) => s === "VOIDED" || s === "DELETED";
/** DRAFT, and SUBMITTED (awaiting approval in Xero), haven't reached the client. */
export const isUnsent = (s: string | null | undefined) => !s || s === "DRAFT" || s === "SUBMITTED";

export function liveInvoicesFor(invoices: readonly XeroInvoiceLite[], stream: string): XeroInvoiceLite[] {
  return invoices.filter(i => i.stream === stream && !isGone(i.status));
}

export function streamStateFromXero(invoices: readonly XeroInvoiceLite[], stream: string, current: string): StreamView {
  const live = liveInvoicesFor(invoices, stream);
  if (live.length === 0) return { status: current, draft: false, xeroPaid: false };
  const allDraft = live.every(i => isUnsent(i.status));
  const allPaid = live.every(i => i.status === "PAID");
  if (allPaid && current !== "paid") return { status: "paid", draft: false, xeroPaid: true };
  if (allDraft && current !== "paid") return { status: "to_invoice", draft: true, xeroPaid: false };
  if (current === "to_invoice" || current === "on_night") return { status: "invoiced", draft: false, xeroPaid: false };
  return { status: current, draft: false, xeroPaid: false };
}

export function depositStateFromXero(invoices: readonly XeroInvoiceLite[]): { paid: boolean; draft: boolean } {
  const live = liveInvoicesFor(invoices, "deposit");
  return {
    paid: live.some(i => i.status === "PAID"),
    draft: live.length > 0 && live.every(i => isUnsent(i.status)),
  };
}
