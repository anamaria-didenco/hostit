import { describe, it, expect } from "vitest";
import { getRequestIp } from "./_core/rateLimit";

/**
 * The bug these guard: production sits behind Cloudflare AND Render, but
 * Express trusts one proxy hop, so req.ip was Cloudflare's egress address —
 * shared by every visitor on that edge. The enquiry form's 5-per-10-minutes
 * anti-spam bucket was therefore shared across most real traffic, and in
 * Christmas enquiry season two real clients (57 and 80 pax) were refused.
 */
describe("client IP resolution behind Cloudflare", () => {
  it("prefers CF-Connecting-IP — the real client, not the edge", () => {
    expect(getRequestIp({ ip: "104.16.1.1", headers: { "cf-connecting-ip": "203.118.4.7" } }))
      .toBe("203.118.4.7");
  });

  it("falls back to req.ip when not behind Cloudflare", () => {
    expect(getRequestIp({ ip: "203.118.4.7", headers: {} })).toBe("203.118.4.7");
  });

  it("falls back to the first X-Forwarded-For entry, then unknown", () => {
    expect(getRequestIp({ headers: { "x-forwarded-for": "203.118.4.7, 104.16.1.1" } })).toBe("203.118.4.7");
    expect(getRequestIp({ headers: {} })).toBe("unknown");
    expect(getRequestIp(undefined)).toBe("unknown");
  });

  it("ignores an empty Cloudflare header", () => {
    expect(getRequestIp({ ip: "203.118.4.7", headers: { "cf-connecting-ip": "  " } })).toBe("203.118.4.7");
  });
});

describe("leads.submit accepts real-world input", () => {
  it("a pasted email with stray whitespace validates", async () => {
    const { appRouter } = await import("./routers");
    const { z } = await import("zod");
    // Reach the input schema through a parse round-trip: build the same shape
    // the form sends, with the trailing space every copy-paste carries.
    const schema = (appRouter._def.procedures as any)["leads.submit"]._def.inputs[0] as z.ZodTypeAny;
    const parsed = schema.safeParse({
      ownerId: 1,
      firstName: "Pat",
      email: "  pat.example@nz.ey.com  ",
      guestCount: 80,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("pat.example@nz.ey.com");
  });
});

describe("public forms reject an unparseable event date cleanly", () => {
  // Used to reach `new Date(...)`, become Invalid Date and surface as a 500
  // "Invalid time value" — the visitor's enquiry was lost with no message.
  const schemaFor = async (path: string) => {
    const { appRouter } = await import("./routers");
    return (appRouter._def.procedures as any)[path]._def.inputs[0] as import("zod").ZodTypeAny;
  };
  const base = { ownerId: 1, firstName: "Ana", email: "ana@example.com" };

  it("leads.submit refuses garbage and impossible dates, accepts blank and real ones", async () => {
    const schema = await schemaFor("leads.submit");
    expect(schema.safeParse({ ...base, eventDate: "not-a-date" }).success).toBe(false);
    expect(schema.safeParse({ ...base, eventDate: "2026-13-45" }).success).toBe(false);
    expect(schema.safeParse({ ...base, eventDate: "" }).success).toBe(true);
    expect(schema.safeParse({ ...base }).success).toBe(true);
    expect(schema.safeParse({ ...base, eventDate: "2026-12-25" }).success).toBe(true);
  });

  it("expressBook.submit requires a real date", async () => {
    const schema = await schemaFor("expressBook.submit");
    const ok = { ...base, eventType: "Birthday", guestCount: 10 };
    expect(schema.safeParse({ ...ok, eventDate: "nope" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, eventDate: "" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, eventDate: "2026-12-25" }).success).toBe(true);
  });
});
