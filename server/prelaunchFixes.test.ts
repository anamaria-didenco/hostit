import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eventBalance } from "@shared/eventBilling";
import { paidTowardEventBill } from "@shared/paymentMath";
import { fitFnbItem, fitFnbItems, toServiceTime } from "@shared/fnbFit";
import { isDatabaseError, userFacingMessage } from "./_core/trpc";

describe("paidTowardEventBill", () => {
  it("counts final/partial payments, not deposits", () => {
    expect(paidTowardEventBill([
      { amount: "500", type: "deposit" },
      { amount: "1000", type: "final" },
      { amount: "250.50", type: "partial" },
    ])).toBe(1250.5);
  });
  it("subtracts refunds and never goes below zero", () => {
    expect(paidTowardEventBill([{ amount: "300", type: "final" }, { amount: "100", type: "refund" }])).toBe(200);
    expect(paidTowardEventBill([{ amount: "100", type: "refund" }])).toBe(0);
  });
  it("leaves out payments of a drinks invoice", () => {
    expect(paidTowardEventBill(
      [{ amount: "400", type: "final", xeroInvoiceId: "drk" }, { amount: "600", type: "final", xeroInvoiceId: "fd" }],
      new Set(["drk"]),
    )).toBe(600);
  });
});

describe("eventBalance with recorded payments", () => {
  it("takes payments off the balance to collect (audit F-07: $5,320 − $1,000)", () => {
    const b = eventBalance({ fnb: [], costItems: [], bookingTotal: 5320, paidToDate: 1000 });
    expect(b.contractTotal).toBe(5320);
    expect(b.paidToDate).toBe(1000);
    expect(b.balance).toBe(4320);
  });
  it("still takes the deposit off when it's applied to the total", () => {
    const b = eventBalance({ fnb: [], costItems: [], bookingTotal: 5000, depositAmount: 500, depositPaid: true, depositApplied: "total", paidToDate: 1000 });
    expect(b.balance).toBe(3500);
  });
  it("never goes negative, and contra stays at zero", () => {
    expect(eventBalance({ fnb: [], costItems: [], bookingTotal: 100, paidToDate: 500 }).balance).toBe(0);
    expect(eventBalance({ fnb: [], costItems: [], bookingTotal: 100, paidToDate: 50, billingFood: "contra" })).toMatchObject({ balance: 0, paidToDate: 0 });
  });
});

describe("fitFnbItems (AI-parsed rows fit the columns)", () => {
  it("normalises service times to HH:MM", () => {
    expect(toServiceTime("18:30")).toBe("18:30");
    expect(toServiceTime("6:30pm onwards")).toBe("18:30");
    expect(toServiceTime("6.30 pm")).toBe("18:30");
    expect(toServiceTime("6pm")).toBe("18:00");
    expect(toServiceTime("12am")).toBe("00:00");
    expect(toServiceTime("on arrival")).toBe("");
    expect(toServiceTime("6")).toBe("");
    expect(toServiceTime("25:00")).toBe("");
    expect(toServiceTime(undefined)).toBe("");
  });
  it("clips long text to the column length and keeps other fields", () => {
    const row = fitFnbItem({ dishName: "x".repeat(300), course: "c".repeat(120), qty: 4, serviceTime: "7pm" });
    expect(row.dishName).toHaveLength(255);
    expect(row.course).toHaveLength(100);
    expect(row.qty).toBe(4);
    expect(row.serviceTime).toBe("19:00");
  });
  it("drops non-objects", () => {
    expect(fitFnbItems([null, 3, { dishName: "Arancini" }])).toEqual([{ dishName: "Arancini" }]);
    expect(fitFnbItems("nope")).toEqual([]);
  });
});

describe("userFacingMessage (no database text reaches the browser)", () => {
  it("hides a failed query", () => {
    const err = new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: 'Failed query: insert into "leads" ("firstName") values ($1)\nparams: Jane' });
    expect(isDatabaseError(err)).toBe(true);
    expect(userFacingMessage(err)).not.toMatch(/insert|leads|Jane/i);
  });
  it("keeps a message the procedure chose", () => {
    const err = new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Lead not found" });
    expect(userFacingMessage(err)).toBe("Lead not found");
  });
  it("turns a validation error into one readable sentence", () => {
    const parsed = z.object({ firstName: z.string().max(100) }).safeParse({ firstName: "A".repeat(101) });
    const err = new TRPCError({ code: "BAD_REQUEST", cause: parsed.error, message: parsed.error!.message });
    expect(userFacingMessage(err)).toBe("First name is too long (100 characters at most).");
  });
});

import { startTimeOf, withStartTime, eventDayKey } from "@shared/eventDate";

describe("start time kept in step (F-08)", () => {
  it("reads a timed value's NZ start time, and none for date-only", () => {
    // 6:30 pm NZDT on Sat 24 Oct 2026 = 05:30 UTC
    expect(startTimeOf(new Date("2026-10-24T05:30:00Z"))).toBe("18:30");
    expect(startTimeOf(new Date("2026-10-24T00:00:00Z"))).toBe("");
    expect(startTimeOf(null)).toBe("");
  });
  it("puts a start time on the event's NZ day, across daylight saving", () => {
    const winter = withStartTime(new Date("2026-06-20T00:00:00Z"), "18:30")!; // NZST, UTC+12
    expect(winter.toISOString()).toBe("2026-06-20T06:30:00.000Z");
    const summer = withStartTime(new Date("2026-12-05T00:00:00Z"), "18:30")!; // NZDT, UTC+13
    expect(summer.toISOString()).toBe("2026-12-05T05:30:00.000Z");
    expect(eventDayKey(summer, "Pacific/Auckland")).toBe("2026-12-05");
    expect(startTimeOf(summer)).toBe("18:30");
  });
  it("leaves the value alone for a blank or invalid time", () => {
    const d = new Date("2026-12-05T05:30:00Z");
    expect(withStartTime(d, "")!.getTime()).toBe(d.getTime());
    expect(withStartTime(d, "25:00")!.getTime()).toBe(d.getTime());
  });
});
