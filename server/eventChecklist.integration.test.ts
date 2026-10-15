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
import { bookings, checklistInstances, checklistTemplates, leads, runsheets } from "../drizzle/schema";
import { mergeChecklistItems } from "./eventChecklist";

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

describe.skipIf(!HAS_DB)("one checklist per event (DB)", () => {
  const a = appRouter.createCaller(ctxFor(OWNER_A));
  const b = appRouter.createCaller(ctxFor(OWNER_B));
  const pub = appRouter.createCaller({ ...ctxFor(OWNER_A), user: null });

  afterAll(async () => {
    const db = (await getDb())!;
    const owners = [OWNER_A, OWNER_B];
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
