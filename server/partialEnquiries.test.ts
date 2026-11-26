import { describe, expect, it } from "vitest";
import { alertedContact, finishedMatchesAlert, partialEnquiryAlert } from "./partialEnquiries";

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

  it("says when they were last on the form, if step 2 was open a while", () => {
    const pinged = partialEnquiryAlert({ ...lead, partialSeenAt: new Date("2026-10-14T01:47:00Z") });
    expect(pinged.body).toMatch(/Started: Wed,? 14 Oct,? 2:05\s?pm/i);
    expect(pinged.body).toMatch(/Last on the form: Wed,? 14 Oct,? 2:47\s?pm/i);
    // No ping, or one in the same minute: just when they started.
    expect(partialEnquiryAlert(lead).body).not.toContain("Last on the form");
    expect(partialEnquiryAlert({ ...lead, partialSeenAt: new Date("2026-10-14T01:05:30Z") }).body).not.toContain("Last on the form");
    // Pings stop counting 2 hours after step 1.
    expect(partialEnquiryAlert({ ...lead, partialSeenAt: new Date("2026-10-14T09:00:00Z") }).body).toMatch(/Last on the form: Wed,? 14 Oct,? 4:05\s?pm/i);
  });

  it("reads back who it was about, so finishing marks it read only for that person", () => {
    const body = partialEnquiryAlert(lead).body;
    expect(alertedContact(body)).toEqual({ name: "Sam Hart", email: "sam@example.com" });
    // The same person finishing, also with a corrected email (the name stays).
    expect(finishedMatchesAlert(body, { firstName: "Sam", lastName: "Hart", email: " SAM@example.com" })).toBe(true);
    expect(finishedMatchesAlert(body, { firstName: "sam", lastName: "hart ", email: "sam@gmail.example.test" })).toBe(true);
    // Someone else on a shared device: another name and another email.
    expect(finishedMatchesAlert(body, { firstName: "Ben", lastName: "Other", email: "ben@example.test" })).toBe(false);
    expect(finishedMatchesAlert(null, { firstName: "Sam", lastName: "Hart", email: "sam@example.com" })).toBe(false);
  });
});
