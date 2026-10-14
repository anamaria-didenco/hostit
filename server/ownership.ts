/**
 * "Does this record belong to the caller?" — checked before any write that
 * links a new or updated row to a parent by an id the browser sent.
 *
 * Child rows are stamped with the caller's ownerId, but several readers load
 * children by parent id alone (runsheet items, F&B items, the public staff
 * portal). Without this check, one account could attach rows to another
 * account's runsheet and they would show on that venue's sheet and staff
 * links. A missing or foreign parent reads as NOT_FOUND so ids can't be probed.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  leads, bookings, runsheets, proposals, floorPlans, menuPackages,
  menuSections, menuCategories, equipment, dailyChecklists,
} from "../drizzle/schema";

const PARENTS = {
  lead: leads,
  booking: bookings,
  runsheet: runsheets,
  proposal: proposals,
  floorPlan: floorPlans,
  menuPackage: menuPackages,
  menuSection: menuSections,
  menuCategory: menuCategories,
  equipment,
  dailyChecklist: dailyChecklists,
} as const;

export type ParentKind = keyof typeof PARENTS;

const LABEL: Record<ParentKind, string> = {
  lead: "Enquiry", booking: "Event", runsheet: "Runsheet", proposal: "Proposal",
  floorPlan: "Floor plan", menuPackage: "Menu package", menuSection: "Menu section",
  menuCategory: "Menu category", equipment: "Equipment item", dailyChecklist: "Checklist",
};

/** Throws NOT_FOUND unless `id` is a `kind` row owned by `ownerId`.
 *  null/undefined ids pass — they link to nothing. */
export async function assertOwned(kind: ParentKind, id: number | null | undefined, ownerId: number): Promise<void> {
  if (id === null || id === undefined) return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const table = PARENTS[kind] as any;
  const [row] = await db.select({ id: table.id }).from(table)
    .where(and(eq(table.id, id), eq(table.ownerId, ownerId))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `${LABEL[kind]} not found` });
}

/** Several checks at once, e.g. `{ lead: input.leadId, booking: input.bookingId }`. */
export async function assertAllOwned(ids: Partial<Record<ParentKind, number | null | undefined>>, ownerId: number): Promise<void> {
  for (const [kind, id] of Object.entries(ids) as [ParentKind, number | null | undefined][]) {
    await assertOwned(kind, id, ownerId);
  }
}
