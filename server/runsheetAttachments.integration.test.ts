/**
 * PDFs attached in the Runsheet Builder reach the live staff link, and a row
 * whose file is no longer on the server is flagged in the builder and kept off
 * the staff link (it would only open an error page on a phone).
 * The DB part is skipped without DATABASE_URL and cleans up after itself.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { bookings, checklistInstances, runsheets, staffPortalLinks } from "../drizzle/schema";
import { staffLinkAttachments, uploadExists, uploadsDir, withFileStatus } from "./uploadFiles";

const HAS_DB = !!process.env.DATABASE_URL;

function ctxFor(id: number): TrpcContext {
  return {
    user: {
      id, openId: `attach-test-${id}`, email: `owner${id}@attach.test`, name: `Owner ${id}`,
      loginMethod: "password", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    isTeamMember: false,
    req: { protocol: "https", headers: {}, socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("upload file checks", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-uploads-"));
    fs.writeFileSync(path.join(dir, "menu.pdf"), "%PDF-1.4");
    fs.mkdirSync(path.join(dir, "folder.pdf"));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("finds a file that is there and nothing else", () => {
    expect(uploadExists("/uploads/menu.pdf", dir)).toBe(true);
    expect(uploadExists("/uploads/gone.pdf", dir)).toBe(false);
    expect(uploadExists("/uploads/folder.pdf", dir)).toBe(false); // a folder isn't a file
    expect(uploadExists("/uploads/..", dir)).toBe(false);
    expect(uploadExists("/uploads/.", dir)).toBe(false);
    expect(uploadExists("/uploads/../menu.pdf", dir)).toBe(false);
    expect(uploadExists("https://example.com/menu.pdf", dir)).toBe(false);
    expect(uploadExists(null, dir)).toBe(false);
  });

  it("marks lost files for the builder, keeping every row", () => {
    const rows = [
      { id: "a", name: "Menu.pdf", url: "/uploads/menu.pdf", size: 2048, contentType: "application/pdf", uploadedAt: 1 },
      { id: "b", name: "Map.pdf", url: "/uploads/gone.pdf", size: 4096, contentType: "application/pdf", uploadedAt: 2 },
    ];
    expect(withFileStatus(rows, dir).map(r => [r.id, r.missing])).toEqual([["a", false], ["b", true]]);
    expect(withFileStatus(null, dir)).toEqual([]);
  });

  it("gives the staff link only PDFs the server still has, and only what it shows", () => {
    const rows = [
      { id: "a", name: "Menu.pdf", url: "/uploads/menu.pdf", size: 2048, contentType: "application/pdf", uploadedAt: 1 },
      { id: "b", name: "Map.pdf", url: "/uploads/gone.pdf", size: 4096, contentType: "application/pdf", uploadedAt: 2 },
      { id: "c", name: "Elsewhere", url: "https://example.com/x.pdf", size: 1, contentType: "application/pdf", uploadedAt: 3 },
    ];
    expect(staffLinkAttachments(rows, dir)).toEqual([{ id: "a", name: "Menu.pdf", url: "/uploads/menu.pdf", size: 2048 }]);
    expect(staffLinkAttachments("not a list", dir)).toEqual([]);
  });
});

describe.skipIf(!HAS_DB)("runsheet attachments on the live staff link (DB)", () => {
  // Owner id no real or seeded account uses.
  const OWNER = 990311;
  const owner = appRouter.createCaller(ctxFor(OWNER));
  const pub = appRouter.createCaller({ ...ctxFor(OWNER), user: null });
  const keepName = `vf-test-${Date.now()}-kept.pdf`;
  const lostName = `vf-test-${Date.now()}-lost.pdf`;

  let madeDir = false;
  beforeAll(() => {
    madeDir = !fs.existsSync(uploadsDir());
    fs.mkdirSync(uploadsDir(), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir(), keepName), "%PDF-1.4 test");
  });
  afterAll(async () => {
    fs.rmSync(path.join(uploadsDir(), keepName), { force: true });
    if (madeDir) try { fs.rmdirSync(uploadsDir()); } catch { /* not empty: leave it */ }
    const db = (await getDb())!;
    await db.delete(staffPortalLinks).where(inArray(staffPortalLinks.ownerId, [OWNER]));
    await db.delete(checklistInstances).where(inArray(checklistInstances.ownerId, [OWNER]));
    await db.delete(runsheets).where(inArray(runsheets.ownerId, [OWNER]));
    await db.delete(bookings).where(inArray(bookings.ownerId, [OWNER]));
  });

  it("shows a booking's attachments on the staff link and flags a lost file in the builder", async () => {
    const db = (await getDb())!;
    const [bk] = await db.insert(bookings).values({
      ownerId: OWNER, firstName: "Attach", lastName: "Test", email: "attach@example.com",
      eventDate: new Date("2027-04-10T06:00:00Z"), status: "confirmed",
    }).returning();
    const [rs] = await db.insert(runsheets).values({
      ownerId: OWNER, bookingId: bk.id, title: "Attachment test", eventDate: bk.eventDate,
    }).returning();

    // Attach through the real procedure, as the builder does.
    await owner.runsheets.addAttachment({
      runsheetId: rs.id, name: "Drinks menu.pdf", url: `/uploads/${keepName}`, size: 12_345, contentType: "application/pdf",
    });
    // A file that is no longer on the server can't be attached...
    await expect(owner.runsheets.addAttachment({
      runsheetId: rs.id, name: "Map.pdf", url: `/uploads/${lostName}`, size: 1, contentType: "application/pdf",
    })).rejects.toThrow(/not found/);
    // ...but a row saved before its file was lost can still be in the table.
    const [row] = await db.select().from(runsheets).where(inArray(runsheets.id, [rs.id]));
    await db.update(runsheets).set({
      attachments: [...(row.attachments ?? []), {
        id: "lost1", name: "Map.pdf", url: `/uploads/${lostName}`, size: 1, contentType: "application/pdf", uploadedAt: 1,
      }],
    }).where(inArray(runsheets.id, [rs.id]));

    const sheet = await owner.runsheets.get({ id: rs.id });
    expect(sheet!.attachments.map(a => [a.name, a.missing])).toEqual([["Drinks menu.pdf", false], ["Map.pdf", true]]);

    const link = await owner.staffPortal.createLink({ runsheetId: rs.id });
    const portal = await pub.staffPortal.getByToken({ token: link.token });
    expect(portal!.runsheet.bookingId).toBe(bk.id);
    expect(portal!.runsheet.attachments).toEqual([
      { id: expect.any(String), name: "Drinks menu.pdf", url: `/uploads/${keepName}`, size: 12_345 },
    ]);
  });
});
