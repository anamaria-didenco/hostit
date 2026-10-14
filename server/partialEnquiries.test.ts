import { describe, expect, it } from "vitest";
import { partialEnquiryAlert } from "./partialEnquiries";

describe("unfinished enquiry alert", () => {
  const lead = {
    id: 42, firstName: "Sam", lastName: "Hart", email: "sam@example.com", phone: "021 555 0101",
    company: null, createdAt: new Date("2026-10-14T01:05:00Z"),
  };

  it("names the person and gives their contact details and when they started", () => {
    const a = partialEnquiryAlert(lead);
    expect(a.kind).toBe("partial_enquiry");
    expect(a.title).toBe("Unfinished enquiry: Sam Hart");
    expect(a.body).toContain("Email: sam@example.com");
    expect(a.body).toContain("Phone: 021 555 0101");
    expect(a.body).not.toContain("Company:");
    expect(a.body).toMatch(/Started: Wed,? 14 Oct,? 2:05\s?pm/i);
    expect(a.leadId).toBe(42);
  });

  it("is sent once per enquiry", () => {
    expect(partialEnquiryAlert(lead).dedupeKey).toBe("partial-enquiry:42");
  });

  it("copes with a missing name", () => {
    expect(partialEnquiryAlert({ ...lead, firstName: null, lastName: null }).title).toBe("Unfinished enquiry: Someone");
  });
});
