import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, proposals, proposalPhotos, venueSettings } from "../drizzle/schema";
import { handleProposalPhoto } from "./proposalPhotos";
import { venueBrand } from "@shared/brand";

/** Proposal photos: owner adds/captions/reorders/removes; served only with the proposal's token. */
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 980000 + Math.floor(Math.random() * 9999);
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function ctx(id = OWNER): TrpcContext {
  return {
    user: { id, openId: `photo-test-${id}`, email: "o@example.com", name: "Photo Test", loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as any,
    isTeamMember: false, isStaff: false, actorName: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function fakeRes() {
  const r: any = { statusCode: 200, headers: {}, body: null as any };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b?: any) => { r.body = b ?? null; return r; };
  return r;
}

d("proposal photos (DB)", () => {
  const owner = appRouter.createCaller(ctx());
  const stranger = appRouter.createCaller(ctx(OWNER + 1));
  let proposalId = 0;
  let token = "";

  beforeAll(async () => {
    const db = (await getDb())!;
    await db.insert(venueSettings).values({ id: OWNER as any, ownerId: OWNER, name: "Photo Venue", slug: `photo-${OWNER}` });
    const [lead] = await db.insert(leads).values({ ownerId: OWNER, firstName: "Pic", email: "p@example.com", status: "new", source: "manual" }).returning();
    const p = await owner.proposals.create({ leadId: lead.id, title: "With photos" } as any);
    proposalId = p.id;
    token = p.publicToken;
  });

  afterAll(async () => {
    const db = (await getDb())!;
    await db.delete(proposalPhotos).where(eq(proposalPhotos.ownerId, OWNER));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  it("adds, captions, reorders and removes photos; others can't touch them", async () => {
    const a = await owner.proposals.photos.add({ proposalId, dataUrl: PNG_1PX, caption: "Back Bar" });
    const b = await owner.proposals.photos.add({ proposalId, dataUrl: PNG_1PX });
    await expect(owner.proposals.photos.add({ proposalId, dataUrl: "data:text/html;base64,PGI+" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(stranger.proposals.photos.add({ proposalId, dataUrl: PNG_1PX })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await owner.proposals.photos.update({ id: b.id, caption: "Antipasto", move: "earlier" });
    let list = await owner.proposals.photos.list({ proposalId });
    expect(list.map(p => p.caption)).toEqual(["Antipasto", "Back Bar"]);
    const view = await owner.proposals.getByToken({ token });
    expect((view as any).photos.map((p: any) => p.id)).toEqual([b.id, a.id]);
    await owner.proposals.photos.remove({ id: a.id });
    list = await owner.proposals.photos.list({ proposalId });
    expect(list.map(p => p.id)).toEqual([b.id]);
  });

  it("serves a photo only with its proposal's token", async () => {
    const [ph] = await owner.proposals.photos.list({ proposalId });
    const ok = fakeRes();
    await handleProposalPhoto({ params: { token, id: String(ph.id) } } as any, ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/png");
    const bad = fakeRes();
    await handleProposalPhoto({ params: { token: "not-the-token", id: String(ph.id) } } as any, bad);
    expect(bad.statusCode).toBe(404);
  });

  it("uses the Brand Pack accent, then the venue colour, with readable text", () => {
    expect(venueBrand({ brandAccentColor: "#f5e6a8", primaryColor: "#C8102E" })).toMatchObject({ accent: "#f5e6a8", onAccent: "#1a1a1a" });
    expect(venueBrand({ primaryColor: "#C8102E" })).toMatchObject({ accent: "#C8102E", onAccent: "#fff" });
    expect(venueBrand(null).accent).toBe("#2f5488");
  });
});
