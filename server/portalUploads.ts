/**
 * Client portal uploads: files a client attaches from their portal link
 * (inspiration images, floor-plan notes, documents). Stored as base64 in the
 * DB like proposal photos, and served only through the portal token — so a file
 * can't be fetched without the link. Staff see the list on the event page.
 */
import type { Request, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { portalUploads, clientPortalTokens, bookings } from "../drizzle/schema";
import { getDb } from "./db";

export const MAX_UPLOADS_PER_EVENT = 20;
/** ~5 MB once decoded — covers a photo or a PDF. */
export const MAX_UPLOAD_CHARS = 7_000_000;
export const UPLOAD_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif|heic)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/;

/** The event a portal token points at: its booking and/or its lead. */
export function tokenEventScope(row: { ownerId: number; bookingId: number | null; leadId: number | null }, bookingLeadId: number | null) {
  return { ownerId: row.ownerId, bookingId: row.bookingId, leadId: row.leadId ?? (row.bookingId ? bookingLeadId : null) };
}

/** Uploads for an event (no file data), newest first. */
export async function listPortalUploads(scope: { ownerId: number; bookingId: number | null; leadId: number | null }) {
  const db = await getDb();
  if (!db) return [];
  const where = scope.bookingId
    ? and(eq(portalUploads.ownerId, scope.ownerId), eq(portalUploads.bookingId, scope.bookingId))
    : scope.leadId
      ? and(eq(portalUploads.ownerId, scope.ownerId), eq(portalUploads.leadId, scope.leadId))
      : null;
  if (!where) return [];
  const rows = await db.select({
    id: portalUploads.id, filename: portalUploads.filename, contentType: portalUploads.contentType,
    size: portalUploads.size, caption: portalUploads.caption, createdAt: portalUploads.createdAt,
  }).from(portalUploads).where(where).orderBy(asc(portalUploads.id));
  return rows;
}

/** GET /api/portal-upload/:token/:id — the file, for anyone with the portal link. */
export async function handlePortalUpload(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const token = String(req.params.token ?? "");
    if (!Number.isInteger(id) || !token) { res.status(404).end(); return; }
    const db = await getDb();
    if (!db) { res.status(503).end(); return; }
    const [tok] = await db.select({ ownerId: clientPortalTokens.ownerId, bookingId: clientPortalTokens.bookingId, leadId: clientPortalTokens.leadId })
      .from(clientPortalTokens).where(eq(clientPortalTokens.token, token)).limit(1);
    if (!tok) { res.status(404).end(); return; }
    let leadId = tok.leadId;
    if (!leadId && tok.bookingId) {
      const [b] = await db.select({ leadId: bookings.leadId }).from(bookings).where(eq(bookings.id, tok.bookingId)).limit(1);
      leadId = b?.leadId ?? null;
    }
    const scope = tokenEventScope(tok, leadId);
    const match = scope.bookingId
      ? and(eq(portalUploads.id, id), eq(portalUploads.ownerId, scope.ownerId), eq(portalUploads.bookingId, scope.bookingId))
      : scope.leadId
        ? and(eq(portalUploads.id, id), eq(portalUploads.ownerId, scope.ownerId), eq(portalUploads.leadId, scope.leadId))
        : null;
    if (!match) { res.status(404).end(); return; }
    const [row] = await db.select({ contentType: portalUploads.contentType, data: portalUploads.data, filename: portalUploads.filename })
      .from(portalUploads).where(match).limit(1);
    if (!row) { res.status(404).end(); return; }
    res.setHeader("Content-Type", row.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${row.filename.replace(/[^\w.\- ]/g, "_")}"`);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(Buffer.from(row.data, "base64"));
  } catch {
    res.status(500).end();
  }
}
