/**
 * Edit-conflict protection for run sheets.
 *
 * Every save from the run sheet builder sends the version it last loaded and
 * the random id of that open builder (its "editor id"). The save goes through
 * only when the sheet is still at that version, or the last save was this
 * same builder's own (its autosaves overlap, and must never conflict with
 * each other). Otherwise someone else — another person, or the sheet open in
 * another tab — saved in between, and the save is refused with CONFLICT so it
 * can't overwrite their work. The builder then asks which version to keep.
 *
 * Anything else that changes a sheet's content (the event's date moving it,
 * the assistant editing it) bumps the version with no editor, so a builder
 * that's open on the old copy is warned too rather than saving it back over.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { runsheets } from "../drizzle/schema";

export const RUNSHEET_CONFLICT_MESSAGE =
  "This run sheet was changed somewhere else while you were editing it — by someone else, or in another tab.";

/** Spread into a runsheets update made outside the builder. */
export function changedElsewhere() {
  return { version: sql`${runsheets.version} + 1`, lastEditorId: null } as const;
}

/** The set + extra where-clause for a builder save. With no version sent
 *  (older clients, or "keep my version") the save is unconditional. */
export function builderSave(expectedVersion: number | undefined, editorId: string | undefined): { set: Record<string, unknown>; guard: SQL | undefined } {
  const set = { version: sql`${runsheets.version} + 1`, lastEditorId: editorId ?? null };
  const guard = expectedVersion != null && editorId
    ? or(eq(runsheets.version, expectedVersion), eq(runsheets.lastEditorId, editorId))
    : undefined;
  return { set, guard };
}

/** After a guarded save matched nothing: CONFLICT if the sheet is still
 *  there, NOT_FOUND if it's gone. */
export async function throwSaveRefused(db: any, id: number, ownerId: number): Promise<never> {
  const [row] = await db.select({ id: runsheets.id }).from(runsheets)
    .where(and(eq(runsheets.id, id), eq(runsheets.ownerId, ownerId))).limit(1);
  if (row) throw new TRPCError({ code: "CONFLICT", message: RUNSHEET_CONFLICT_MESSAGE });
  throw new TRPCError({ code: "NOT_FOUND", message: "This runsheet no longer exists — it may have been deleted." });
}
