import { describe, it, expect } from "vitest";
import { streamStateFromXero, depositStateFromXero } from "../shared/xeroStreamState";

describe("streamStateFromXero", () => {
  it("leaves the chip alone when there's no invoice", () => {
    expect(streamStateFromXero([], "food", "to_invoice")).toEqual({ status: "to_invoice", draft: false, xeroPaid: false });
  });
  it("a draft only is not 'invoiced' — even if the chip was set on push", () => {
    expect(streamStateFromXero([{ stream: "food", status: "DRAFT" }], "food", "invoiced"))
      .toEqual({ status: "to_invoice", draft: true, xeroPaid: false });
  });
  it("awaiting approval in Xero (SUBMITTED) counts as not sent yet", () => {
    expect(streamStateFromXero([{ stream: "food", status: "SUBMITTED" }], "food", "to_invoice").draft).toBe(true);
  });
  it("a sent invoice upgrades to invoiced", () => {
    expect(streamStateFromXero([{ stream: "food", status: "AUTHORISED" }], "food", "to_invoice").status).toBe("invoiced");
  });
  it("paid in Xero shows as paid", () => {
    expect(streamStateFromXero([{ stream: "drinks", status: "PAID" }], "drinks", "invoiced"))
      .toEqual({ status: "paid", draft: false, xeroPaid: true });
  });
  it("ignores voided invoices and other streams", () => {
    expect(streamStateFromXero([{ stream: "food", status: "VOIDED" }, { stream: "drinks", status: "PAID" }], "food", "to_invoice").status).toBe("to_invoice");
  });
  it("never downgrades a chip the team marked paid", () => {
    expect(streamStateFromXero([{ stream: "food", status: "DRAFT" }], "food", "paid").status).toBe("paid");
  });
});

describe("depositStateFromXero", () => {
  it("a PAID deposit invoice is a paid deposit", () => {
    expect(depositStateFromXero([{ stream: "deposit", status: "PAID" }])).toEqual({ paid: true, draft: false });
  });
  it("a draft deposit invoice hasn't been sent", () => {
    expect(depositStateFromXero([{ stream: "deposit", status: "DRAFT" }])).toEqual({ paid: false, draft: true });
  });
});

import { xeroErrorHelp, xeroNeedsReconnect } from "../client/src/lib/xeroError";

describe("xeroErrorHelp", () => {
  it("treats a 401 AuthorizationUnsuccessful as 'reconnect', not 'wait'", () => {
    const h = xeroErrorHelp("Xero API 401: AuthorizationUnsuccessful");
    expect(h.reconnect).toBe(true);
    expect(h.detail).toMatch(/Reconnect Xero/);
  });
  it("treats a timeout as temporary", () => {
    expect(xeroNeedsReconnect("ETIMEDOUT")).toBe(false);
    expect(xeroErrorHelp("ETIMEDOUT").reconnect).toBe(false);
  });
});
