import { isPackageLine, packageNameFromLine } from "./proposalPackages";

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

/** One menu the client can pick when a proposal offers a choice of menus. */
export type MenuOption = { line: string; name: string; subtotal: number; tax: number; total: number; deposit: number };

/**
 * The proposal's money, allowing for a choice of menus. When the venue offers
 * two or more menu packages as options ("Shared Franco or Tutto Franco"),
 * they're alternatives, not extras: each option is priced as everything else
 * plus that one package, and the headline figures are the cheapest option's
 * (shown as "from"). Without a choice it's the plain sum, as before.
 */
export function proposalMoney<T extends { description: string; qty: number; unitPrice: number }>(
  lines: T[], taxPercent: number, depositPercent: number, menuChoice: boolean | null | undefined,
) {
  const all = proposalTotals(lines, taxPercent, depositPercent);
  const seen = new Set<string>();
  const packageLines = all.lineItems.filter(l => {
    if (!isPackageLine(l.description) || seen.has(l.description)) return false;
    seen.add(l.description);
    return true;
  });
  if (!menuChoice || packageLines.length < 2) return { ...all, options: [] as MenuOption[] };
  const common = all.lineItems.filter(l => !isPackageLine(l.description));
  const options: MenuOption[] = packageLines.map(pl => {
    const t = proposalTotals([...common, pl], taxPercent, depositPercent);
    return { line: pl.description, name: packageNameFromLine(pl.description), subtotal: t.subtotal, tax: t.tax, total: t.total, deposit: t.deposit };
  });
  const cheapest = options.reduce((a, b) => (b.total < a.total ? b : a));
  return { lineItems: all.lineItems, subtotal: cheapest.subtotal, tax: cheapest.tax, total: cheapest.total, deposit: cheapest.deposit, options };
}

/** The lines for the menu the client chose: everything that isn't a menu
 *  package, plus the chosen package. */
export function linesForChosenMenu<T extends { description: string }>(lines: T[], chosenLine: string): T[] {
  return lines.filter(l => !isPackageLine(l.description) || l.description === chosenLine)
    .filter((l, i, arr) => !isPackageLine(l.description) || arr.findIndex(x => x.description === l.description) === i);
}

/** Line text for a client: the package marker emoji dropped, since PDFs and
 *  some email clients show it as a broken box. */
export function clientLineText(description: string): string {
  return description.replace(/^(\p{Extended_Pictographic}|\uFE0F|\s)+/u, "").trim();
}

/** Lines left blank — no text, or a quantity of 0 (the starter
 *  "Food & beverage package (per head) 0 × $0") — aren't shown to the client.
 *  A $0 line with a quantity is shown, as "Included". */
export function isEmptyLine(l: { description?: string | null; qty: number }): boolean {
  return !String(l.description ?? "").trim() || Number(l.qty) === 0;
}
