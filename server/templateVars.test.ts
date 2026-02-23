/**
 * Unit tests for the substituteTemplateVars utility.
 *
 * NOTE: The utility lives in client/src/lib/templateVars.ts and is pure
 * TypeScript with no DOM/browser dependencies, so we can import it directly
 * from the server-side Vitest runner.
 */
import { describe, expect, it } from "vitest";
// Use a relative path since this test file lives in server/
import { substituteTemplateVars, TEMPLATE_VARIABLES } from "../client/src/lib/templateVars";

const mockLead = {
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  phone: "+64 21 123 456",
  company: "Acme Ltd",
  eventType: "Birthday Party",
  eventDate: new Date("2025-06-14T00:00:00.000Z"),
  eventEndDate: new Date("2025-06-14T23:59:00.000Z"),
  guestCount: 80,
  budget: "5000",
  message: "Please note dietary requirements.",
};

const mockVenue = {
  name: "The Grand Hall",
  phone: "+64 9 123 4567",
  email: "events@grandhall.co.nz",
  address: "12 Queen St",
  city: "Auckland",
};

describe("substituteTemplateVars", () => {
  it("replaces {{contactName}} with full name", () => {
    const result = substituteTemplateVars("Hello {{contactName}}", mockLead, mockVenue);
    expect(result).toBe("Hello Jane Smith");
  });

  it("replaces {{firstName}} and {{lastName}} separately", () => {
    const result = substituteTemplateVars("Dear {{firstName}} {{lastName}}", mockLead, mockVenue);
    expect(result).toBe("Dear Jane Smith");
  });

  it("replaces {{email}} and {{phone}}", () => {
    const result = substituteTemplateVars("{{email}} / {{phone}}", mockLead, mockVenue);
    expect(result).toBe("jane@example.com / +64 21 123 456");
  });

  it("replaces {{company}}", () => {
    const result = substituteTemplateVars("Company: {{company}}", mockLead, mockVenue);
    expect(result).toBe("Company: Acme Ltd");
  });

  it("replaces {{eventType}}", () => {
    const result = substituteTemplateVars("Event: {{eventType}}", mockLead, mockVenue);
    expect(result).toBe("Event: Birthday Party");
  });

  it("replaces {{eventDate}} with NZ-formatted date", () => {
    const result = substituteTemplateVars("Date: {{eventDate}}", mockLead, mockVenue);
    // Should contain the year and month at minimum
    expect(result).toContain("2025");
    expect(result).toContain("June");
  });

  it("replaces {{guestCount}}", () => {
    const result = substituteTemplateVars("Guests: {{guestCount}}", mockLead, mockVenue);
    expect(result).toBe("Guests: 80");
  });

  it("replaces {{budget}} with NZD formatting", () => {
    const result = substituteTemplateVars("Budget: {{budget}}", mockLead, mockVenue);
    expect(result).toContain("5,000");
    expect(result).toContain("NZD");
  });

  it("replaces {{notes}} with message field", () => {
    const result = substituteTemplateVars("Notes: {{notes}}", mockLead, mockVenue);
    expect(result).toBe("Notes: Please note dietary requirements.");
  });

  it("replaces {{venueName}}", () => {
    const result = substituteTemplateVars("Venue: {{venueName}}", mockLead, mockVenue);
    expect(result).toBe("Venue: The Grand Hall");
  });

  it("replaces {{venuePhone}}", () => {
    const result = substituteTemplateVars("Call us: {{venuePhone}}", mockLead, mockVenue);
    expect(result).toBe("Call us: +64 9 123 4567");
  });

  it("replaces {{venueEmail}}", () => {
    const result = substituteTemplateVars("Email us: {{venueEmail}}", mockLead, mockVenue);
    expect(result).toBe("Email us: events@grandhall.co.nz");
  });

  it("replaces {{venueAddress}} by combining address and city", () => {
    const result = substituteTemplateVars("Address: {{venueAddress}}", mockLead, mockVenue);
    expect(result).toBe("Address: 12 Queen St, Auckland");
  });

  it("leaves unknown variables unchanged", () => {
    const result = substituteTemplateVars("Hello {{unknownVar}}", mockLead, mockVenue);
    expect(result).toBe("Hello {{unknownVar}}");
  });

  it("replaces multiple variables in a realistic template body", () => {
    const template = `Hi {{firstName}},\n\nThank you for your enquiry about a {{eventType}} at {{venueName}}.\nWe have your event noted for {{eventDate}} for {{guestCount}} guests.\n\nKind regards,\n{{venueName}} Events Team`;
    const result = substituteTemplateVars(template, mockLead, mockVenue);
    expect(result).toContain("Hi Jane,");
    expect(result).toContain("Birthday Party");
    expect(result).toContain("The Grand Hall");
    expect(result).toContain("80 guests");
    expect(result).toContain("2025");
  });

  it("handles null/undefined lead fields gracefully", () => {
    const sparseLead = { firstName: "Sam", email: "sam@test.com" };
    const result = substituteTemplateVars("{{firstName}} {{lastName}} {{phone}}", sparseLead, mockVenue);
    expect(result).toBe("Sam  ");
  });

  it("works without venue data (undefined)", () => {
    const result = substituteTemplateVars("{{venueName}} {{venuePhone}}", mockLead, undefined);
    expect(result).toBe(" ");
  });
});

describe("TEMPLATE_VARIABLES", () => {
  it("exports a non-empty array of variable definitions", () => {
    expect(Array.isArray(TEMPLATE_VARIABLES)).toBe(true);
    expect(TEMPLATE_VARIABLES.length).toBeGreaterThan(0);
  });

  it("every variable has token, label, and example fields", () => {
    for (const v of TEMPLATE_VARIABLES) {
      expect(v.token).toMatch(/^\{\{\w+\}\}$/);
      expect(typeof v.label).toBe("string");
      expect(typeof v.example).toBe("string");
    }
  });

  it("includes the most important variables", () => {
    const tokens = TEMPLATE_VARIABLES.map(v => v.token);
    expect(tokens).toContain("{{contactName}}");
    expect(tokens).toContain("{{eventDate}}");
    expect(tokens).toContain("{{venueName}}");
    expect(tokens).toContain("{{guestCount}}");
  });
});
