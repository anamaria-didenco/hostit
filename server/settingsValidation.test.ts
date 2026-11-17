import { describe, it, expect } from "vitest";
import {
  emailListError,
  percentError,
  smtpHostError,
  smtpPortError,
  smtpSettingsErrors,
  venueDetailsErrors,
  venueUpdateErrors,
  websiteError,
} from "@shared/settingsValidation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { userFacingMessage } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

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

describe("venue.update refuses the same values (any save path)", () => {
  const owner = appRouter.createCaller({
    user: {
      id: 1, openId: "test-owner-001", email: "owner@venue.co.nz", name: "Owner", loginMethod: "manus",
      role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {}, ip: "203.0.113.9" } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  });

  it("checks only the fields that are sent", () => {
    expect(venueUpdateErrors({})).toEqual({});
    expect(venueUpdateErrors({ bannerImageUrl: "" } as any)).toEqual({});
    expect(Object.keys(venueUpdateErrors({ name: "", website: "just some words", notificationEmail: "not-an-email, also bad" })).sort())
      .toEqual(["name", "notificationEmail", "website"]);
    expect(Object.keys(venueUpdateErrors({ smtpHost: "not a host!!", smtpPort: 99999, smtpFromEmail: "bad address" })).sort())
      .toEqual(["smtpFromEmail", "smtpHost", "smtpPort"]);
    expect(venueUpdateErrors({ name: "The Harbour Room", website: "", notificationEmail: "events@harbourroom.example.nz; manager@harbourroom.example.nz", smtpHost: "smtp.gmail.com", smtpPort: 587 })).toEqual({});
  });

  it("the whole venue form sent with an empty name and a bad email is refused before anything is saved", async () => {
    const err = await owner.venue.update({ name: "", website: "just some words", notificationEmail: "not-an-email, also bad", tagline: "kept" }).catch(e => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe("BAD_REQUEST");
    expect(userFacingMessage(err)).toBe("Name: Enter your venue's name. It is the heading of your enquiry form.");
  });

  it("a message ending in an example address gets no full stop after it", async () => {
    const err = await owner.venue.update({ website: "not a site" }).catch(e => e);
    expect(userFacingMessage(err)).toBe("Website: Enter a web address like https://yourvenue.co.nz");
    const email = await owner.venue.update({ smtpFromEmail: "bad address" }).catch(e => e);
    expect(userFacingMessage(email)).toBe("Smtp From Email: Enter an email address like you@yourvenue.co.nz");
  });

  it("a bad mail server is refused too", async () => {
    const err = await owner.venue.update({ smtpHost: "not a host!!" }).catch(e => e);
    expect(err.code).toBe("BAD_REQUEST");
    expect(userFacingMessage(err)).toMatch(/^Smtp Host: Enter the mail server's name/);
  });
});

describe("validation messages for number limits", () => {
  it("says 'must be 100 or less' / '0 or more', not a length or 'required'", async () => {
    const { z } = await import("zod");
    const asError = (v: unknown) => {
      const parsed = z.object({ taxPercent: z.number().min(0).max(100) }).safeParse({ taxPercent: v });
      return new TRPCError({ code: "BAD_REQUEST", cause: parsed.error, message: parsed.error!.message });
    };
    expect(userFacingMessage(asError(250))).toBe("Tax Percent must be 100 or less.");
    expect(userFacingMessage(asError(-5))).toBe("Tax Percent must be 0 or more.");
  });

  it("keeps the string wording", async () => {
    const { z } = await import("zod");
    const parsed = z.object({ firstName: z.string().min(1) }).safeParse({ firstName: "" });
    expect(userFacingMessage(new TRPCError({ code: "BAD_REQUEST", cause: parsed.error, message: "x" }))).toBe("First name is required.");
  });
});
