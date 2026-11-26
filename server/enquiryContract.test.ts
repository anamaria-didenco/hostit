import { describe, it, expect } from "vitest";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invalidField } from "./_core/trpc";
import { PARTIAL_ALERT_AFTER_MS as SHARED_ALERT_AFTER_MS } from "@shared/enquiryTiming";
import { partialAlertDedupeKey } from "@shared/leadConstants";
import { ENQUIRY_LIMITS } from "@shared/enquiryRules";
import { PARTIAL_ALERT_AFTER_MS, partialEnquiryAlert } from "./partialEnquiries";

/**
 * The parts of the public enquiry API the form, the server and the alert job
 * share. Behaviour lives in each side's own tests; this pins the shapes.
 */
const schemaFor = async (path: string) => {
  const { appRouter } = await import("./routers");
  return (appRouter._def.procedures as any)[path]._def.inputs[0] as z.ZodTypeAny;
};
const base = { ownerId: 1, firstName: "Ana", email: "ana@example.test" };

describe("public enquiry inputs", () => {
  it("leads.startCapture takes the page's step-1 lead and its token", async () => {
    const schema = await schemaFor("leads.startCapture");
    const parsed = schema.safeParse({ ...base, leadId: 12, leadToken: "tok" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ leadId: 12, leadToken: "tok" });
    expect(schema.safeParse({ ...base, leadId: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...base }).success).toBe(true);
  });

  it("leads.submit takes a venue wall-clock time beside a bare date", async () => {
    const schema = await schemaFor("leads.submit");
    const parsed = schema.safeParse({ ...base, eventDate: "2026-12-12", eventTime: "19:00" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ eventDate: "2026-12-12", eventTime: "19:00" });
    expect(schema.safeParse({ ...base, eventDate: "2026-12-12", eventTime: "" }).success).toBe(true);
    expect(schema.safeParse({ ...base, eventDate: "2026-12-12", eventTime: "7pm" }).success).toBe(false);
    expect(schema.safeParse({ ...base, eventDate: "2026-12-12", eventTime: "24:00" }).success).toBe(false);
    // A form loaded before wall times still sends the instant.
    expect(schema.safeParse({ ...base, eventDate: "2026-12-12T06:00:00.000Z" }).success).toBe(true);
  });

  it("leads.touchPartial needs the lead and its token", async () => {
    const schema = await schemaFor("leads.touchPartial");
    expect(schema.safeParse({ ownerId: 1, leadId: 2, leadToken: "tok" }).success).toBe(true);
    expect(schema.safeParse({ ownerId: 1, leadId: 2 }).success).toBe(false);
    expect(schema.safeParse({ ownerId: 1, leadToken: "tok" }).success).toBe(false);
  });

  it("keeps the field limits the form uses for maxLength", async () => {
    const schema = await schemaFor("leads.submit");
    const at = (field: string, n: number) => schema.safeParse({ ...base, [field]: "x".repeat(n) }).success;
    for (const field of ["lastName", "company", "eventDetail", "invoicingNote"] as const) {
      expect(at(field, ENQUIRY_LIMITS[field]), field).toBe(true);
      expect(at(field, ENQUIRY_LIMITS[field] + 1), field).toBe(false);
    }
    expect(at("message", ENQUIRY_LIMITS.message)).toBe(true);
  });
});

describe("validation errors name their field", () => {
  const zodFailure = (schema: z.ZodTypeAny, value: unknown) => {
    const r = schema.safeParse(value);
    if (r.success) throw new Error("expected a failure");
    return new TRPCError({ code: "BAD_REQUEST", cause: r.error });
  };

  it("gives the top-level input key of the first issue", () => {
    const schema = z.object({ firstName: z.string().min(1), email: z.string().trim().email() });
    expect(invalidField(zodFailure(schema, { firstName: "Ana", email: "x@example.test." }))).toBe("email");
    expect(invalidField(zodFailure(schema, { firstName: "", email: "x@example.test" }))).toBe("firstName");
    const nested = z.object({ fields: z.object({ guests: z.number() }) });
    expect(invalidField(zodFailure(nested, { fields: { guests: "x" } }))).toBe("fields");
  });

  it("gives nothing for other errors", () => {
    expect(invalidField(new TRPCError({ code: "BAD_REQUEST", message: "Enquiry not found." }))).toBeUndefined();
    expect(invalidField(new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "x" }))).toBeUndefined();
    expect(invalidField(new TRPCError({ code: "TOO_MANY_REQUESTS", message: "x" }))).toBeUndefined();
  });
});

describe("the Unfinished alert and the shared timings", () => {
  it("uses the shared alert delay", () => {
    expect(PARTIAL_ALERT_AFTER_MS).toBe(SHARED_ALERT_AFTER_MS);
  });

  it("uses the shared dedupe key, which leads.submit looks up", () => {
    const alert = partialEnquiryAlert({ id: 433, firstName: "Mere", lastName: "Testwell", email: "mere@example.test", phone: null, company: null, createdAt: new Date("2026-12-01T07:00:00Z") });
    expect(alert.dedupeKey).toBe(partialAlertDedupeKey(433));
  });
});
