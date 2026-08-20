import { describe, it, expect } from "vitest";
import { staffMayCall } from "./_core/trpc";

/**
 * A staff login must never reach money, settings or destructive actions —
 * including by calling the API directly. These cases encode that contract.
 */
describe("staff login permissions", () => {
  it("allows the reads a staff member needs to work a shift", () => {
    for (const path of [
      "bookings.list", "bookings.byMonth", "bookings.getById",
      "runsheets.list", "runsheets.get", "fnb.list",
      "checklists.getForBooking", "venue.get", "auth.me", "tasks.list",
    ]) {
      expect(staffMayCall(path, "query"), path).toBe(true);
    }
  });

  it("blocks sensitive reads", () => {
    for (const path of [
      "payments.overview", "payments.received", "payments.summary",
      "xero.status", "xero.invoicesForBooking",
      "reports.revenue", "dashboard.stats",
      "accountLogins.list", "proposals.list", "contacts.list", "leads.list",
    ]) {
      expect(staffMayCall(path, "query"), path).toBe(false);
    }
  });

  it("blocks every mutation by default", () => {
    for (const path of [
      "bookings.update", "bookings.delete", "runsheets.update",
      "payments.add", "xero.pushInvoice", "venue.update",
      "accountLogins.create", "leads.delete",
    ]) {
      expect(staffMayCall(path, "mutation"), path).toBe(false);
    }
  });

  it("blocks a newly added procedure until it is deliberately allowed", () => {
    // Deny-by-default is the point: a future mutation is safe on arrival.
    expect(staffMayCall("somethingNew.doThing", "mutation")).toBe(false);
  });
});
