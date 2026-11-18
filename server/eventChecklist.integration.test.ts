/**
 * One event, one checklist (audit F-29): /checklist?bookingId=X, the run sheet
 * and the staff link all use the run sheet's checklist; old bookingId-only
 * lists are carried over with their ticks; templates add to the same list.
 * Skipped without DATABASE_URL; cleans up after itself.
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { bookings, checklistInstances, checklistTemplates, leads, runsheets, staffPortalLinks } from "../drizzle/schema";
import { correctedChecklistName, mergeChecklistItems, PLACEHOLDER_CHECKLIST_NAME } from "./eventChecklist";

const HAS_DB = !!process.env.DATABASE_URL;

function ctxFor(id: number): TrpcContext {
  return {
    user: {
      id, openId: `checklist-test-${id}`, email: `owner${id}@checklist.test`, name: `Owner ${id}`,
      loginMethod: "password", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// Owner ids no real or seeded account uses.
const OWNER_A = 990291;
const OWNER_B = 990292;

describe("mergeChecklistItems", () => {
  it("keeps ticks, skips repeats and renames clashing ids", () => {
    const merged = mergeChecklistItems(
      [{ id: "1", text: "Set tables", checked: false }],
      [
        { id: "1", text: "set tables ", checked: true, checkedAt: "2026-10-01T00:00:00Z" },
        { id: "1", text: "Light candles", checked: false },
      ],
    );
    expect(merged).toEqual([
      { id: "1", text: "Set tables", checked: true, checkedAt: "2026-10-01T00:00:00Z" },
      { id: "1-2", text: "Light candles", checked: false },
    ]);
  });
});

describe("correctedChecklistName", () => {
  it("renames only the placeholder name, after a real sheet title", () => {
    expect(correctedChecklistName(PLACEHOLDER_CHECKLIST_NAME, "Grace Holloway — Birthday")).toBe("Grace Holloway — Birthday — Staff Checklist");
    expect(correctedChecklistName(PLACEHOLDER_CHECKLIST_NAME, "Event Runsheet")).toBeNull();
    expect(correctedChecklistName(PLACEHOLDER_CHECKLIST_NAME, "  ")).toBeNull();
    expect(correctedChecklistName("Bar crew list", "Grace Holloway — Birthday")).toBeNull();
    expect(correctedChecklistName(null, "Grace Holloway — Birthday")).toBeNull();
  });
});

describe.skipIf(!HAS_DB)("one checklist per event (DB)", () => {
  const a = appRouter.createCaller(ctxFor(OWNER_A));
  const b = appRouter.createCaller(ctxFor(OWNER_B));
  const pub = appRouter.createCaller({ ...ctxFor(OWNER_A), user: null });

  afterAll(async () => {
    const db = (await getDb())!;
    const owners = [OWNER_A, OWNER_B];
    await db.delete(staffPortalLinks).where(inArray(staffPortalLinks.ownerId, owners));
    await db.delete(checklistInstances).where(inArray(checklistInstances.ownerId, owners));
    await db.delete(checklistTemplates).where(inArray(checklistTemplates.ownerId, owners));
    await db.delete(runsheets).where(inArray(runsheets.ownerId, owners));
    await db.delete(bookings).where(inArray(bookings.ownerId, owners));
    await db.delete(leads).where(inArray(leads.ownerId, owners));
  });

  async function newBooking(leadId?: number) {
    const db = (await getDb())!;
    const [bk] = await db.insert(bookings).values({
      ownerId: OWNER_A, leadId, firstName: "Checklist", lastName: "Test", email: "c@example.com",
      eventDate: new Date("2027-03-06T06:00:00Z"), status: "confirmed",
    }).returning();
    return bk;
  }

  async function newTemplate(items: { id: string; text: string }[]) {
    return a.checklists.createTemplate({ name: "Bar open", items });
  }

  it("carries an old list's ticks into the run sheet's checklist, once", async () => {
    const db = (await getDb())!;
    const bk = await newBooking();
    const tpl = await newTemplate([{ id: "1", text: "Ice in wells" }, { id: "2", text: "Cut garnish" }]);

    // Before the run sheet exists: /checklist has nothing to show yet, and the
    // template waits in a bookingId-only list (the old behaviour).
    await a.checklists.assignToBooking({ templateId: tpl.id, bookingId: bk.id });
    let view = await a.checklists.getForBooking({ bookingId: bk.id });
    expect(view.runsheet).toBeNull();
    expect(view.oldListCount).toBe(1);
    const [old] = await db.select().from(checklistInstances).where(eq(checklistInstances.bookingId, bk.id));
    await db.update(checklistInstances)
      .set({ items: (old.items as any[]).map(i => i.id === "1" ? { ...i, checked: true, checkedAt: "2027-03-01T00:00:00Z" } : i) })
      .where(eq(checklistInstances.id, old.id));

    // The run sheet opens its checklist (what RunsheetBuilder does on load).
    const rs = await a.runsheets.create({ title: "Engagement", bookingId: bk.id } as any);
    const inst = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, name: "Engagement — Staff Checklist", defaultItems: [] });
    expect(inst.bookingId).toBe(bk.id);
    expect(inst.shareToken).toBeTruthy();
    expect((inst.items as any[]).map(i => [i.text, i.checked])).toEqual([["Ice in wells", true], ["Cut garnish", false]]);
    const rows = await db.select().from(checklistInstances).where(eq(checklistInstances.ownerId, OWNER_A));
    expect(rows.filter(r => r.bookingId === bk.id || r.runsheetId === rs.id).map(r => r.id)).toEqual([inst.id]);

    // Opening again changes nothing.
    const again = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id });
    expect(again.id).toBe(inst.id);
    expect(again.items).toEqual(inst.items);

    // /checklist shows that same instance; a tick from the staff link shows there.
    await pub.checklists.toggleItemByToken({ token: inst.shareToken!, itemId: "2", checked: true });
    view = await a.checklists.getForBooking({ bookingId: bk.id });
    expect(view.runsheet?.id).toBe(rs.id);
    expect(view.instance?.id).toBe(inst.id);
    expect(view.needsSetup).toBe(false);
    expect((view.instance!.items as any[]).every(i => i.checked)).toBe(true);
  });

  it("applying a template adds to the event's one checklist, without repeats", async () => {
    const bk = await newBooking();
    const rs = await a.runsheets.create({ title: "Birthday", bookingId: bk.id } as any);
    const inst = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id });
    await a.checklists.saveItemsForRunsheet({ runsheetId: rs.id, items: [{ id: "c-1", text: "Ice in wells", checked: true }] });

    const tpl = await newTemplate([{ id: "1", text: "Ice in wells" }, { id: "2", text: "Candles out" }]);
    const res = await a.checklists.assignToBooking({ templateId: tpl.id, bookingId: bk.id });
    expect(res.id).toBe(inst.id);
    await a.checklists.assignToBooking({ templateId: tpl.id, bookingId: bk.id });

    const view = await a.checklists.getForBooking({ bookingId: bk.id });
    expect(view.instance?.id).toBe(inst.id);
    expect((view.instance!.items as any[]).map(i => [i.text, i.checked])).toEqual([["Ice in wells", true], ["Candles out", false]]);
  });

  it("finds a run sheet made from the enquiry and stamps the event on its checklist", async () => {
    const db = (await getDb())!;
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER_A, firstName: "Lead", lastName: "Only", email: "l@example.com", status: "booked", source: "manual",
    }).returning();
    const bk = await newBooking(lead.id);
    const rs = await a.runsheets.create({ title: "Lead sheet", leadId: lead.id } as any);

    const view = await a.checklists.getForBooking({ bookingId: bk.id });
    expect(view.runsheet?.id).toBe(rs.id);
    expect(view.needsSetup).toBe(true);
    const inst = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, bookingId: bk.id });
    expect(inst.bookingId).toBe(bk.id);
    expect((await a.checklists.getForBooking({ bookingId: bk.id })).instance?.id).toBe(inst.id);
  });

  it("names a new checklist after its sheet, and fixes one left with the placeholder name", async () => {
    const db = (await getDb())!;
    const bk = await newBooking();
    const rs = await a.runsheets.create({ title: "Ivy Example — Engagement", bookingId: bk.id } as any);
    // A list made before the title loaded (the old bug)…
    const inst = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, name: PLACEHOLDER_CHECKLIST_NAME });
    expect(inst.name).toBe("Ivy Example — Engagement — Staff Checklist");
    await db.update(checklistInstances).set({ name: PLACEHOLDER_CHECKLIST_NAME }).where(eq(checklistInstances.id, inst.id));
    await a.checklists.saveItemsForRunsheet({ runsheetId: rs.id, items: [{ id: "c-1", text: "Ice in wells", checked: false }] });
    await pub.checklists.toggleItemByToken({ token: inst.shareToken!, itemId: "c-1", checked: true });
    // …is renamed when the sheet next opens, and the staff tick stays.
    const again = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, name: "Ivy Example — Engagement — Staff Checklist" });
    expect(again.id).toBe(inst.id);
    expect(again.name).toBe("Ivy Example — Engagement — Staff Checklist");
    expect((again.items as any[]).map(i => i.checked)).toEqual([true]);
  });

  it("edits, reorders and renames on the server without wiping a staff tick made meanwhile", async () => {
    const bk = await newBooking();
    const rs = await a.runsheets.create({ title: "Noah Example — Dinner", bookingId: bk.id } as any);
    const inst = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, name: "Noah Example — Dinner — Staff Checklist" });
    await a.checklists.saveItemsForRunsheet({ runsheetId: rs.id, items: [
      { id: "c-1", text: "Set tables", category: "other", checked: false },
      { id: "c-2", text: "Ice in wells", category: "bar", checked: false },
      { id: "c-3", text: "Light candles", category: "other", checked: false },
    ] });
    // The run sheet has that copy open; a staff member ticks "Ice" from the link.
    await pub.checklists.toggleItemByToken({ token: inst.shareToken!, itemId: "c-2", checked: true });

    let res = await a.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "c-1", text: "Set the long table", category: "setup" });
    expect((res.items as any[]).map(i => [i.id, i.text, i.category, i.checked])).toEqual([
      ["c-1", "Set the long table", "setup", false],
      ["c-2", "Ice in wells", "bar", true],
      ["c-3", "Light candles", "other", false],
    ]);

    await pub.checklists.toggleItemByToken({ token: inst.shareToken!, itemId: "c-3", checked: true });
    res = await a.checklists.reorderItemsForRunsheet({ runsheetId: rs.id, ids: ["c-3", "c-1", "c-2"] });
    expect((res.items as any[]).map(i => [i.id, i.checked])).toEqual([["c-3", true], ["c-1", false], ["c-2", true]]);

    res = await a.checklists.renameForRunsheet({ runsheetId: rs.id, name: "  Bar crew — Noah's dinner  " });
    expect(res.name).toBe("Bar crew — Noah's dinner");
    const view = await a.checklists.getForBooking({ bookingId: bk.id });
    expect(view.instance?.name).toBe("Bar crew — Noah's dinner");
    expect((view.instance!.items as any[]).map(i => i.text)).toEqual(["Light candles", "Set the long table", "Ice in wells"]);
    // The staff link sees the same.
    const staff = await pub.checklists.getByShareToken({ token: inst.shareToken! });
    expect(staff?.name).toBe("Bar crew — Noah's dinner");

    // An item deleted meanwhile, a blank name or an unknown category is refused.
    await expect(a.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "gone", text: "X" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(a.checklists.renameForRunsheet({ runsheetId: rs.id, name: "   " })).rejects.toThrow();
    await expect(a.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "c-1", category: "nonsense" as any })).rejects.toThrow();
    // Another venue can't change it.
    await expect(b.checklists.renameForRunsheet({ runsheetId: rs.id, name: "Mine now" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "c-1", text: "Mine" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await a.checklists.getForBooking({ bookingId: bk.id })).instance?.name).toBe("Bar crew — Noah's dinner");
  });

  it("adds, removes and sets a photo on the server without wiping a staff tick made meanwhile", async () => {
    const bk = await newBooking();
    const rs = await a.runsheets.create({ title: "Mia Example — Drinks", bookingId: bk.id } as any);
    const inst = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, name: "Mia Example — Drinks — Staff Checklist" });
    let res = await a.checklists.addItemsForRunsheet({ runsheetId: rs.id, items: [
      { id: "c-1", text: "Chill the bubbles by 5pm", category: "bar" },
      { id: "c-2", text: "Light candles" },
    ] });
    expect((res.items as any[]).map(i => [i.id, i.category, i.checked])).toEqual([["c-1", "bar", false], ["c-2", "other", false]]);
    expect(res.added).toBe(2);

    // The run sheet has that copy open; a staff member ticks the bubbles.
    await pub.checklists.toggleItemByToken({ token: inst.shareToken!, itemId: "c-1", checked: true });
    res = await a.checklists.addItemsForRunsheet({ runsheetId: rs.id, items: [{ id: "c-3", text: "Set up the photo booth" }] });
    expect((res.items as any[]).map(i => [i.text, i.checked])).toEqual([
      ["Chill the bubbles by 5pm", true], ["Light candles", false], ["Set up the photo booth", false],
    ]);

    await pub.checklists.toggleItemByToken({ token: inst.shareToken!, itemId: "c-2", checked: true });
    const removed = await a.checklists.removeItemForRunsheet({ runsheetId: rs.id, itemId: "c-3" });
    expect((removed.items as any[]).map(i => [i.text, i.checked])).toEqual([["Chill the bubbles by 5pm", true], ["Light candles", true]]);
    // Removing it again (a second tab) changes nothing.
    expect((await a.checklists.removeItemForRunsheet({ runsheetId: rs.id, itemId: "c-3" })).items).toEqual(removed.items);

    await pub.checklists.toggleItemByToken({ token: inst.shareToken!, itemId: "c-2", checked: false });
    const photo = await a.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "c-1", imageUrl: "/uploads/bubbles.jpg" });
    expect((photo.items as any[]).map(i => [i.id, i.checked, i.imageUrl ?? null])).toEqual([["c-1", true, "/uploads/bubbles.jpg"], ["c-2", false, null]]);
    const off = await a.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "c-1", imageUrl: "" });
    expect((off.items as any[])[0]).not.toHaveProperty("imageUrl");
    await expect(a.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "c-1", imageUrl: "javascript:alert(1)" })).rejects.toThrow();
    await expect(a.checklists.editItemForRunsheet({ runsheetId: rs.id, itemId: "c-3", imageUrl: "/uploads/x.jpg" })).rejects.toMatchObject({ code: "CONFLICT" });

    // PULL BAR DRINKS twice: drinks already on the list (as stored now) are skipped.
    const drinks = [{ id: "d-1", text: "Stock bar: Prosecco", category: "bar" as const }, { id: "d-2", text: "Stock bar: Pinot Gris", category: "bar" as const }];
    expect((await a.checklists.addItemsForRunsheet({ runsheetId: rs.id, items: drinks, skipSameText: true })).added).toBe(2);
    const again = await a.checklists.addItemsForRunsheet({ runsheetId: rs.id, items: drinks.map(d => ({ ...d, id: d.id + "b" })), skipSameText: true });
    expect(again.added).toBe(0);
    expect((again.items as any[]).map(i => i.text)).toEqual(["Chill the bubbles by 5pm", "Light candles", "Stock bar: Prosecco", "Stock bar: Pinot Gris"]);

    // Blank words are refused; another venue can't add or remove.
    await expect(a.checklists.addItemsForRunsheet({ runsheetId: rs.id, items: [{ id: "c-9", text: "   " }] })).rejects.toThrow();
    await expect(b.checklists.addItemsForRunsheet({ runsheetId: rs.id, items: [{ id: "c-9", text: "Mine" }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.checklists.removeItemForRunsheet({ runsheetId: rs.id, itemId: "c-1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const staff = await pub.checklists.getByShareToken({ token: inst.shareToken! });
    expect((staff!.items as any[]).map(i => i.id)).toEqual(["c-1", "c-2", "d-1", "d-2"]);
  });

  it("opening the list from several places at once makes one list", async () => {
    const db = (await getDb())!;
    for (let round = 0; round < 3; round++) {
      const bk = await newBooking();
      const rs = await a.runsheets.create({ title: `Zoe Example — Party ${round}`, bookingId: bk.id } as any);
      const link = await a.staffPortal.createLink({ runsheetId: rs.id });
      // Staff open the link on several phones while the run sheet and
      // /checklist open it, all at the same moment.
      const opened = await Promise.all([
        ...[1, 2, 3, 4].map(() => pub.staffPortal.getByToken({ token: link.token }).then(p => p!.checklist!.id)),
        a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, name: "Zoe Example — Party — Staff Checklist" }).then(i => i.id),
        a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id, bookingId: bk.id }).then(i => i.id),
      ]);
      const rows = await db.select().from(checklistInstances).where(eq(checklistInstances.runsheetId, rs.id));
      expect(rows).toHaveLength(1);
      expect(opened.every(id => id === rows[0].id)).toBe(true);
      expect(rows[0].shareToken).toBeTruthy();
    }
  });

  it("a template applied while a staff tick is being saved keeps the tick", async () => {
    const db = (await getDb())!;
    const bk = await newBooking();
    const rs = await a.runsheets.create({ title: "Leo Example — Launch", bookingId: bk.id } as any);
    const inst = await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id });
    await a.checklists.addItemsForRunsheet({ runsheetId: rs.id, items: [
      { id: "c-1", text: "Set tables" }, { id: "c-2", text: "Ice in wells", category: "bar" },
    ] });
    const tpl = await newTemplate([{ id: "1", text: "Music on" }, { id: "2", text: "Set tables" }]);

    // A staff tick that has locked the row and changed it, but not yet
    // committed (what toggleItemByToken does)...
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    let locked!: () => void;
    const isLocked = new Promise<void>(r => { locked = r; });
    const tick = db.transaction(async (tx) => {
      const [row] = await tx.select().from(checklistInstances).where(eq(checklistInstances.id, inst.id)).for("update");
      const items = (row.items as any[]).map(i => i.id === "c-2" ? { ...i, checked: true, checkedAt: "2027-03-06T05:00:00Z" } : i);
      await tx.update(checklistInstances).set({ items }).where(eq(checklistInstances.id, inst.id));
      locked();
      await held;
    });
    await isLocked;
    // ...while "Assign template" runs on /checklist. It must wait for the tick
    // and add to the ticked list, not write back the list it read before.
    const assign = a.checklists.assignToBooking({ templateId: tpl.id, bookingId: bk.id });
    await new Promise(r => setTimeout(r, 400));
    release();
    await Promise.all([tick, assign]);

    const view = await a.checklists.getForBooking({ bookingId: bk.id });
    expect((view.instance!.items as any[]).map(i => [i.text, i.checked])).toEqual([
      ["Set tables", false], ["Ice in wells", true], ["Music on", false],
    ]);
  });

  it("another venue can't read, create or fill an event's checklist", async () => {
    const bk = await newBooking();
    const rs = await a.runsheets.create({ title: "Private", bookingId: bk.id } as any);
    await a.checklists.getOrCreateForRunsheet({ runsheetId: rs.id });

    const view = await b.checklists.getForBooking({ bookingId: bk.id });
    expect(view.runsheet).toBeNull();
    expect(view.instance).toBeNull();
    await expect(b.checklists.getOrCreateForRunsheet({ runsheetId: rs.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // B's own run sheet can't be pointed at A's booking to pull its old lists.
    const bRs = await b.runsheets.create({ title: "Mine" } as any);
    await expect(b.checklists.getOrCreateForRunsheet({ runsheetId: bRs.id, bookingId: bk.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const bTpl = await b.checklists.createTemplate({ name: "B", items: [{ id: "1", text: "Not yours" }] });
    await expect(b.checklists.assignToBooking({ templateId: bTpl.id, bookingId: bk.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(JSON.stringify(await a.checklists.getForBooking({ bookingId: bk.id }))).not.toContain("Not yours");
  });
});
