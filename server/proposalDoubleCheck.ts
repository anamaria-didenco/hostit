/**
 * Finds proposals saved with a menu package charged twice (a builder bug, now
 * fixed) and tells the venue, once, which ones to check. Nothing is changed
 * automatically: some may already be accepted, so the venue decides. The
 * builder shows the same warning with a one-tap fix when the proposal is opened.
 * Idempotent through notifyVenue dedupe keys.
 */
import { isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import { proposals } from "../drizzle/schema";
import { registerJob } from "./jobs";
import { notifyVenue } from "./notify";
import { duplicatePackageLines, packageNameFromLine, type PricingLine } from "@shared/proposalPackages";

export type DoubledProposal = { id: number; ownerId: number; title: string; status: string; packages: string[]; excessInclTax: number };

/** Pure: the doubled packages on one proposal row, or null when it's clean. */
export function doubledProposal(row: { id: number; ownerId: number; title: string; status: string; lineItems: string | null; taxPercent: unknown }): DoubledProposal | null {
  let lines: PricingLine[] = [];
  try { const parsed = JSON.parse(row.lineItems ?? "[]"); if (Array.isArray(parsed)) lines = parsed; } catch { return null; }
  const dups = duplicatePackageLines(lines);
  if (dups.length === 0) return null;
  const extraExTax = dups.reduce((sum, d) => {
    const one = lines.find(l => l.description === d.description);
    return sum + d.extra * Number(one?.total ?? 0);
  }, 0);
  const tax = Number(row.taxPercent ?? 0) || 0;
  return {
    id: row.id, ownerId: row.ownerId, title: row.title, status: row.status,
    packages: dups.map(d => packageNameFromLine(d.description)),
    excessInclTax: Math.round(extraExTax * (1 + tax / 100) * 100) / 100,
  };
}

const money = (v: number) => `$${v.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function reportDoubledProposals(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({
    id: proposals.id, ownerId: proposals.ownerId, title: proposals.title, status: proposals.status,
    lineItems: proposals.lineItems, taxPercent: proposals.taxPercent,
  }).from(proposals).where(isNotNull(proposals.lineItems));
  const found = rows.map(doubledProposal).filter((d): d is DoubledProposal => d !== null);
  const byOwner = new Map<number, DoubledProposal[]>();
  for (const d of found) (byOwner.get(d.ownerId) ?? byOwner.set(d.ownerId, []).get(d.ownerId)!).push(d);
  for (const [ownerId, list] of Array.from(byOwner.entries())) {
    for (const d of list) {
      await notifyVenue(ownerId, {
        kind: "proposal_doubled",
        title: `Check proposal: ${d.title}`,
        body: `${d.packages.join(" and ")} is on this proposal twice, so it's about ${money(d.excessInclTax)} too high (incl. tax). Status: ${d.status}. Open it to remove the extra line.`,
        link: `/proposals/new?proposalId=${d.id}`,
        dedupeKey: `proposal-doubled:${d.id}`,
        email: false,
      });
    }
    await notifyVenue(ownerId, {
      kind: "proposal_doubled",
      title: `${list.length} proposal${list.length === 1 ? " has" : "s have"} a menu package charged twice`,
      body: [
        "A bug (now fixed) could add a menu package to a proposal a second time when it was saved again. These proposals are affected:",
        ...list.map(d => `• ${d.title}: ${d.packages.join(" and ")} twice, about ${money(d.excessInclTax)} too high (${d.status})`),
        "Open each one in VenueFlow: a red box lets you remove the extra line. Check with the client first if they've already accepted.",
      ].join("\n"),
      link: list.length === 1 ? `/proposals/new?proposalId=${list[0].id}` : null,
      // One summary per venue, ever: no new doubles can appear now, and fixing
      // one shouldn't re-send the list.
      dedupeKey: "proposal-doubled-summary:v1",
    });
  }
  if (found.length) console.log(`[proposalDoubleCheck] flagged ${found.length} proposal(s)`);
  return found.length;
}

export function registerProposalDoubleCheckJob() {
  registerJob("proposal-double-check", 24 * 60 * 60_000, async () => { await reportDoubledProposals(); }, 90_000);
}
