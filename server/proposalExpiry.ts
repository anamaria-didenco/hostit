/**
 * Proposal expiry: a sent (or opened) proposal whose expiry date has passed is
 * set to "expired", so the staff UI and the client's page agree it can no
 * longer be accepted. `proposals.respond` refuses expired proposals as well,
 * so this job only keeps the stored status honest — it sends no email.
 * Idempotent: the status itself is the "already done" marker.
 */
import { and, inArray, isNotNull, lt } from "drizzle-orm";
import { getDb } from "./db";
import { proposals } from "../drizzle/schema";
import { registerJob } from "./jobs";

export async function expireOverdueProposals(now = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.update(proposals)
    .set({ status: "expired" })
    .where(and(
      inArray(proposals.status, ["sent", "viewed"]),
      isNotNull(proposals.expiresAt),
      lt(proposals.expiresAt, now),
    ))
    .returning({ id: proposals.id });
  if (rows.length > 0) console.log(`[proposalExpiry] expired ${rows.length} proposal(s)`);
  return rows.length;
}

export function registerProposalExpiryJob() {
  registerJob("proposal-expiry", 60 * 60_000, async () => { await expireOverdueProposals(); });
}
