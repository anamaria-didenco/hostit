/**
 * Photos on a proposal. The owner adds, captions and removes them in the
 * builder; the client sees them on the proposal page and in the PDF. Served
 * only with the proposal's public token, so a photo can't be fetched without
 * the proposal link.
 */
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { proposalPhotos, proposals } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import { isProposalLocked, proposalLockedMessage } from "@shared/proposalTotals";

export const MAX_PROPOSAL_PHOTOS = 12;
/** ~2.2 MB of image once decoded — the browser resizes well under this. */
const MAX_DATA_URL_CHARS = 3_000_000;
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

async function ownedProposal(id: number, ownerId: number) {
  const db = await requireDb();
  const [p] = await db.select({ id: proposals.id, status: proposals.status }).from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.ownerId, ownerId))).limit(1);
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
  return p;
}

/** Photo list (no image data) for a proposal, in display order. */
export async function listProposalPhotos(proposalId: number) {
  const db = await requireDb();
  return db.select({ id: proposalPhotos.id, caption: proposalPhotos.caption, sortOrder: proposalPhotos.sortOrder })
    .from(proposalPhotos).where(eq(proposalPhotos.proposalId, proposalId))
    .orderBy(asc(proposalPhotos.sortOrder), asc(proposalPhotos.id));
}

/** Photos with their data, for the PDF. */
export async function proposalPhotosWithData(proposalId: number) {
  const db = await requireDb();
  return db.select({ id: proposalPhotos.id, caption: proposalPhotos.caption, contentType: proposalPhotos.contentType, data: proposalPhotos.data })
    .from(proposalPhotos).where(eq(proposalPhotos.proposalId, proposalId))
    .orderBy(asc(proposalPhotos.sortOrder), asc(proposalPhotos.id));
}

export const proposalPhotosRouter = router({
  list: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .query(async ({ input, ctx }) => {
      await ownedProposal(input.proposalId, ctx.user.id);
      return listProposalPhotos(input.proposalId);
    }),

  add: protectedProcedure
    .input(z.object({ proposalId: z.number(), dataUrl: z.string().max(MAX_DATA_URL_CHARS, "That photo is too large — try a smaller one."), caption: z.string().max(255).optional() }))
    .mutation(async ({ input, ctx }) => {
      const p = await ownedProposal(input.proposalId, ctx.user.id);
      if (isProposalLocked(p.status)) throw new TRPCError({ code: "BAD_REQUEST", message: proposalLockedMessage(p.status) });
      const m = DATA_URL_RE.exec(input.dataUrl);
      if (!m) throw new TRPCError({ code: "BAD_REQUEST", message: "Only JPEG, PNG or WebP photos can be added." });
      const db = await requireDb();
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(proposalPhotos).where(eq(proposalPhotos.proposalId, p.id));
      if (n >= MAX_PROPOSAL_PHOTOS) throw new TRPCError({ code: "BAD_REQUEST", message: `A proposal can have up to ${MAX_PROPOSAL_PHOTOS} photos.` });
      const [row] = await db.insert(proposalPhotos).values({
        ownerId: ctx.user.id, proposalId: p.id, contentType: m[1], data: m[2],
        caption: input.caption?.trim() || null, sortOrder: n,
      }).returning({ id: proposalPhotos.id });
      return row;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), caption: z.string().max(255).nullable().optional(), move: z.enum(["earlier", "later"]).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [photo] = await db.select({ id: proposalPhotos.id, proposalId: proposalPhotos.proposalId }).from(proposalPhotos)
        .where(and(eq(proposalPhotos.id, input.id), eq(proposalPhotos.ownerId, ctx.user.id))).limit(1);
      if (!photo) throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found" });
      const p = await ownedProposal(photo.proposalId, ctx.user.id);
      if (isProposalLocked(p.status)) throw new TRPCError({ code: "BAD_REQUEST", message: proposalLockedMessage(p.status) });
      if (input.caption !== undefined) {
        await db.update(proposalPhotos).set({ caption: input.caption?.trim() || null }).where(eq(proposalPhotos.id, photo.id));
      }
      if (input.move) {
        const order = (await listProposalPhotos(photo.proposalId)).map(r => r.id);
        const i = order.indexOf(photo.id);
        const j = input.move === "earlier" ? i - 1 : i + 1;
        if (j >= 0 && j < order.length) {
          [order[i], order[j]] = [order[j], order[i]];
          for (let k = 0; k < order.length; k++) await db.update(proposalPhotos).set({ sortOrder: k }).where(eq(proposalPhotos.id, order[k]));
        }
      }
      return { success: true };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [photo] = await db.select({ proposalId: proposalPhotos.proposalId }).from(proposalPhotos)
        .where(and(eq(proposalPhotos.id, input.id), eq(proposalPhotos.ownerId, ctx.user.id))).limit(1);
      if (!photo) return { success: true };
      const p = await ownedProposal(photo.proposalId, ctx.user.id);
      if (isProposalLocked(p.status)) throw new TRPCError({ code: "BAD_REQUEST", message: proposalLockedMessage(p.status) });
      await db.delete(proposalPhotos).where(and(eq(proposalPhotos.id, input.id), eq(proposalPhotos.ownerId, ctx.user.id)));
      return { success: true };
    }),
});

/** GET /api/proposal-photo/:token/:id — the image, for anyone with the proposal link. */
export async function handleProposalPhoto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const token = String(req.params.token ?? "");
    if (!Number.isInteger(id) || !token) { res.status(404).end(); return; }
    const db = await requireDb();
    const [row] = await db.select({ contentType: proposalPhotos.contentType, data: proposalPhotos.data })
      .from(proposalPhotos).innerJoin(proposals, eq(proposals.id, proposalPhotos.proposalId))
      .where(and(eq(proposalPhotos.id, id), eq(proposals.publicToken, token))).limit(1);
    if (!row) { res.status(404).end(); return; }
    res.setHeader("Content-Type", row.contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(Buffer.from(row.data, "base64"));
  } catch {
    res.status(500).end();
  }
}
