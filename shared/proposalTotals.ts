/**
 * Proposal money, worked out the way the proposal builder shows it: each line
 * is qty × unit price, GST goes on top of the subtotal, and the deposit is a
 * percentage of the GST-inclusive total. The server uses this on save so the
 * stored totals always match the lines (it used to store whatever the browser
 * sent).
 *
 * Once the client has accepted or declined a proposal it's their answer, so
 * it can no longer be edited.
 */
export function proposalTotals<T extends { qty: number; unitPrice: number }>(lines: T[], taxPercent: number, depositPercent: number) {
  const lineItems = lines.map(l => ({ ...l, total: Number(l.qty) * Number(l.unitPrice) }));
  const subtotal = lineItems.reduce((sum, l) => sum + l.total, 0);
  const tax = (subtotal * taxPercent) / 100;
  const total = subtotal + tax;
  const deposit = (total * depositPercent) / 100;
  return { lineItems, subtotal, tax, total, deposit };
}

/** Accepted / declined proposals are the client's answer and can't be changed. */
export function isProposalLocked(status: string | null | undefined): status is "accepted" | "declined" {
  return status === "accepted" || status === "declined";
}

export function proposalLockedMessage(status: "accepted" | "declined"): string {
  return `This proposal was ${status} by the client, so it can't be changed. Start a new proposal instead.`;
}
