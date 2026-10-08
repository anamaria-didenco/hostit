import { describe, expect, it } from "vitest";
import {
  clientFlagLabels, computeClientFlags, normaliseEmail, normalisePhone, sameClient,
} from "../shared/clientMatch";

describe("normalisePhone", () => {
  it("keeps only digits", () => {
    expect(normalisePhone("021-123 4567")).toBe("0211234567");
    expect(normalisePhone("(09) 123 4567")).toBe("091234567");
  });

  it("writes NZ's +64 as the local 0", () => {
    expect(normalisePhone("+64 21 123 4567")).toBe("0211234567");
    expect(normalisePhone("0064 21 123 4567")).toBe("0211234567");
    expect(normalisePhone("+64 (0)21 123 4567")).toBe("0211234567");
    expect(normalisePhone("+64 9 123 4567")).toBe("091234567");
  });

  it("leaves other countries' numbers alone", () => {
    expect(normalisePhone("+61 412 345 678")).toBe("61412345678");
  });

  it("rejects blanks and numbers too short to trust", () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("ext 123")).toBeNull();
    expect(normalisePhone("123456")).toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("trims and lower-cases", () => {
    expect(normaliseEmail("  Jane.Smith@Example.COM ")).toBe("jane.smith@example.com");
  });
  it("treats blanks and non-addresses as no email", () => {
    expect(normaliseEmail("")).toBeNull();
    expect(normaliseEmail("n/a")).toBeNull();
  });
});

describe("sameClient", () => {
  it("matches on email regardless of case", () => {
    expect(sameClient({ email: "JANE@x.co.nz" }, { email: "jane@x.co.nz " })).toBe(true);
  });
  it("matches on phone in different formats", () => {
    expect(sameClient({ email: "a@x.nz", phone: "+64 21 555 0101" }, { email: "b@y.nz", phone: "021 555 0101" })).toBe(true);
  });
  it("does not match on blank email or phone", () => {
    expect(sameClient({ email: "", phone: null }, { email: "", phone: null })).toBe(false);
    expect(sameClient({ email: "a@x.nz" }, { email: "b@x.nz" })).toBe(false);
  });
});

describe("computeClientFlags", () => {
  const now = new Date("2026-10-08T00:00:00Z").getTime();
  const day = 86_400_000;

  it("flags a returning client with their past events", () => {
    const flags = computeClientFlags([
      { id: 1, email: "jane@x.nz", status: "finished", eventDate: new Date(now - 300 * day), createdAt: new Date(now - 400 * day) },
      { id: 2, email: "Jane@X.nz", status: "booked", eventDate: new Date(now - 30 * day), createdAt: new Date(now - 100 * day) },
      { id: 3, email: "jane@x.nz", status: "new", createdAt: new Date(now - day) },
    ], [], now);
    const f = flags.get(3)!;
    expect(f.bookedEvents).toBe(2);
    expect(f.pastEvents).toBe(2);
    expect(f.duplicateIds).toEqual([]);
    expect(clientFlagLabels(f).returning).toBe("Returning client (2 past events)");
  });

  it("counts a booking row with no linked lead, matched by email", () => {
    const flags = computeClientFlags(
      [{ id: 5, email: "sam@x.nz", status: "new", createdAt: new Date(now) }],
      [
        { id: 90, leadId: null, email: "SAM@x.nz", status: "confirmed", eventDate: new Date(now - 200 * day) },
        { id: 91, leadId: null, email: "sam@x.nz", status: "cancelled", eventDate: new Date(now - 100 * day) },
      ],
      now,
    );
    expect(flags.get(5)).toEqual({ bookedEvents: 1, pastEvents: 1, duplicateIds: [] });
  });

  it("calls an upcoming-only booking a booking, not a past event", () => {
    const flags = computeClientFlags([
      { id: 1, email: "a@x.nz", status: "booked", eventDate: new Date(now + 30 * day), createdAt: new Date(now - 10 * day) },
      { id: 2, email: "a@x.nz", status: "new", createdAt: new Date(now) },
    ], [], now);
    expect(clientFlagLabels(flags.get(2)).returning).toBe("Returning client (1 booking)");
  });

  it("flags two open enquiries from one client within 60 days as possible duplicates", () => {
    const flags = computeClientFlags([
      { id: 10, email: "a@x.nz", phone: "021 111 2222", status: "new", createdAt: new Date(now - 20 * day) },
      { id: 11, email: "other@y.nz", phone: "+64 21 111 2222", status: "contacted", createdAt: new Date(now) },
    ], [], now);
    expect(flags.get(10)?.duplicateIds).toEqual([11]);
    expect(flags.get(11)?.duplicateIds).toEqual([10]);
    expect(clientFlagLabels(flags.get(11)).duplicate).toBe("Possible duplicate");
  });

  it("does not call enquiries more than 60 days apart, or closed ones, duplicates", () => {
    const flags = computeClientFlags([
      { id: 1, email: "a@x.nz", status: "new", createdAt: new Date(now - 90 * day) },
      { id: 2, email: "a@x.nz", status: "new", createdAt: new Date(now) },
      { id: 3, email: "a@x.nz", status: "lost", createdAt: new Date(now - 5 * day) },
    ], [], now);
    expect(flags.get(2)).toBeUndefined();
    expect(flags.get(3)).toBeUndefined();
  });

  it("leaves leads with no email or phone unflagged", () => {
    const flags = computeClientFlags([
      { id: 1, email: "", status: "new", createdAt: new Date(now) },
      { id: 2, email: "", status: "new", createdAt: new Date(now) },
    ], [], now);
    expect(flags.size).toBe(0);
  });
});
