/**
 * Lost reasons for the Reports page, read DEFENSIVELY.
 *
 * `leads.lostReason` is being added on another branch. Until it exists in a
 * given database this returns null and Reports hides the section. Kept in its
 * own file so that, once the column is in schema.ts everywhere, this can be
 * replaced by a plain drizzle select of `leads.lostReason`.
 */
import { sql } from "drizzle-orm";
import { getDb } from "./db";

let columnKnown: boolean | null = null;

async function hasLostReasonColumn(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<boolean> {
  if (columnKnown) return true; // once it exists it doesn't go away; re-check while it's missing
  const res: any = await db.execute(sql`
    select 1 from information_schema.columns
    where table_schema = current_schema() and table_name = 'leads' and column_name = 'lostReason'
    limit 1`);
  columnKnown = (res?.rows ?? res ?? []).length > 0;
  return columnKnown;
}

/** lostReason per lead id for this owner, or null when the column isn't there. */
export async function lostReasonsByLead(ownerId: number): Promise<Map<number, string | null> | null> {
  try {
    const db = await getDb();
    if (!db || !(await hasLostReasonColumn(db))) return null;
    const res: any = await db.execute(sql`select "id", "lostReason" from "leads" where "ownerId" = ${ownerId}`);
    const rows: Array<{ id: number; lostReason: string | null }> = res?.rows ?? res ?? [];
    return new Map(rows.map(r => [Number(r.id), r.lostReason == null ? null : String(r.lostReason)]));
  } catch (err: any) {
    columnKnown = null;
    console.warn("[lostReasons] unavailable:", err?.message ?? err);
    return null;
  }
}
