import { describe, it, expect } from "vitest";
import {
  emailListError,
  percentError,
  smtpHostError,
  smtpPortError,
  smtpSettingsErrors,
  venueDetailsErrors,
  websiteError,
} from "@shared/settingsValidation";

describe("Settings > Venue: caught before saving", () => {
  it("rejects the values the audit saved with 'Settings saved!'", () => {
    const errors = venueDetailsErrors({ name: "", website: "just some words", notificationEmail: "not-an-email, also bad" });
    expect(Object.keys(errors).sort()).toEqual(["vs-notification-email", "vs-venue-name", "vs-website"]);
    expect(errors["vs-notification-email"]).toContain('"not-an-email"');
  });

  it("accepts a normal venue, with blank optional fields", () => {
    expect(venueDetailsErrors({ name: "The Harbour Room", website: "", notificationEmail: "" })).toEqual({});
    expect(venueDetailsErrors({ name: "The Harbour Room", website: "https://harbourroom.example.nz/events", notificationEmail: "events@harbourroom.example.nz, manager@harbourroom.example.nz" })).toEqual({});
  });

  it("treats a name of only spaces as empty", () => {
    expect(venueDetailsErrors({ name: "   " })["vs-venue-name"]).toBeTruthy();
  });

  it("takes a website with or without https://, but not other schemes", () => {
    expect(websiteError("harbourroom.example.nz")).toBeNull();
    expect(websiteError("http://harbourroom.example.nz")).toBeNull();
    expect(websiteError("localhost")).toBeTruthy();
    expect(websiteError("javascript:alert(1)")).toBeTruthy();
    expect(websiteError("ftp://harbourroom.example.nz")).toBeTruthy();
  });

  it("splits notification emails on commas or semicolons, as sending does", () => {
    expect(emailListError("a@example.nz; b@example.nz,")).toBeNull();
    expect(emailListError("a@example.nz b@example.nz")).toBeTruthy();
  });
});

describe("Settings > Email (SMTP): caught before saving", () => {
  it("rejects 'not a host!!', port 99999 and 'bad address'", () => {
    expect(smtpSettingsErrors({ smtpHost: "not a host!!", smtpPort: "99999", smtpFromEmail: "bad address" })).toEqual({
      smtpHost: expect.any(String),
      smtpPort: expect.any(String),
      smtpFromEmail: expect.any(String),
    });
  });

  it("accepts the Gmail settings shown on the page, and blanks", () => {
    expect(smtpSettingsErrors({ smtpHost: "smtp.gmail.com", smtpPort: "587", smtpFromEmail: "events@harbourroom.example.nz" })).toEqual({});
    expect(smtpSettingsErrors({ smtpHost: "", smtpPort: "", smtpFromEmail: "" })).toEqual({});
    expect(smtpHostError("10.0.0.5")).toBeNull();
    expect(smtpPortError(465)).toBeNull();
    expect(smtpPortError("0")).toBeTruthy();
    expect(smtpPortError("58.7")).toBeTruthy();
  });
});

describe("percentError (proposal GST and deposit)", () => {
  it("allows 0 to 100 and rejects the rest", () => {
    expect(percentError(15, "GST")).toBeNull();
    expect(percentError(0, "GST")).toBeNull();
    expect(percentError(100, "Deposit")).toBeNull();
    expect(percentError(250, "GST")).toBe("GST must be between 0 and 100%.");
    expect(percentError(-5, "Deposit")).toBeTruthy();
    expect(percentError(Number.NaN, "GST")).toBeTruthy();
  });
});
