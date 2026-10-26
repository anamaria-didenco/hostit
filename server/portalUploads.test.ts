import { describe, it, expect } from "vitest";
import { UPLOAD_DATA_URL_RE, tokenEventScope } from "./portalUploads";

describe("portal uploads", () => {
  it("accepts images and PDFs, rejects anything else", () => {
    expect(UPLOAD_DATA_URL_RE.test("data:image/png;base64,AAAA")).toBe(true);
    expect(UPLOAD_DATA_URL_RE.test("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(UPLOAD_DATA_URL_RE.test("data:application/pdf;base64,JVBER")).toBe(true);
    expect(UPLOAD_DATA_URL_RE.test("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(UPLOAD_DATA_URL_RE.test("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(UPLOAD_DATA_URL_RE.test("javascript:alert(1)")).toBe(false);
  });

  it("resolves the event scope: a booking token carries the booking's lead", () => {
    expect(tokenEventScope({ ownerId: 2, bookingId: 112, leadId: null }, 55))
      .toEqual({ ownerId: 2, bookingId: 112, leadId: 55 });
  });

  it("a lead-only token keeps its own lead and no booking", () => {
    expect(tokenEventScope({ ownerId: 2, bookingId: null, leadId: 9 }, null))
      .toEqual({ ownerId: 2, bookingId: null, leadId: 9 });
  });
});
