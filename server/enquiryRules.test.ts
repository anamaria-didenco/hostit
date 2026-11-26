import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  ENQUIRY_EMAIL_RE, ENQUIRY_FIELD_LABELS, ENQUIRY_LIMITS, GUEST_COUNT_MAX, STEP_ONE_FIELDS,
  eventFormatFromText, sameEnquiryName, guestCountAsTypedLine, isStepOneField, isValidEnquiryEmail, parseGuestCount, tidyEnquiryEmail,
} from "@shared/enquiryRules";
import { EVENT_FORMAT_OPTIONS } from "@shared/formFields";

/** The server's own check on leads.startCapture and leads.submit. */
const serverEmail = z.string().trim().email().max(254);
const serverAccepts = (s: string) => serverEmail.safeParse(s).success;

describe("enquiry email rule", () => {
  it("is zod's own pattern, so a zod upgrade that changes it fails here", () => {
    expect(ENQUIRY_EMAIL_RE.source).toBe(z.regexes.email.source);
    expect(ENQUIRY_EMAIL_RE.flags).toBe(z.regexes.email.flags);
  });

  // Addresses the server takes today: the form must keep taking them.
  const ACCEPT = [
    "aroha@example.test",
    "Aroha.Testwell@Example.Test",
    "AROHA@EXAMPLE.TEST",
    "aroha+enquiry@example.test",
    "o'brien@example.test",
    "o'brien+tag@mail.example.test",
    "first.last@sub.domain.example.test",
    "a_b@example.test",
    "a-b@example-x.test",
    "a@b.co",
    "1234@example.test",
    "x@123.example.test",
    "aroha@example.co.nz",
    "  aroha@example.test  ",
    "\taroha@example.test\n",
    " aroha@example.test ",
    "a+b+c@example.test",
    "-a@example.test",
    "a'b'c@example.test",
    `${"a".repeat(64)}@example.test`,
  ];
  // The six the hunt found the form letting through and the server refusing,
  // and more of the same kind.
  const REJECT = [
    "x@example.test.",
    "x@example.test,",
    "x..c@example.test",
    "x.@example.test",
    "x@example..test",
    "x@example.test.c",
    ".x@example.test",
    "māia@example.test",
    "x@exämple.test",
    "x@example_x.test",
    "x&y@example.test",
    "x/y@example.test",
    "x@-example.test",
    "x@example.123",
    "x@example.test​",
    "​x@example.test",
    "x @example.test",
    "x@ example.test",
    "x@example",
    "@example.test",
    "x@",
    "x",
    "",
    "   ",
    "x@@example.test",
    "x@example.test;",
    "<x@example.test>",
    "mailto:x@example.test",
    "x\"y@example.test",
    `${"a".repeat(250)}@example.test`,
  ];

  it("accepts every address the server accepts", () => {
    for (const e of ACCEPT) {
      expect(serverAccepts(e), `server should accept ${JSON.stringify(e)}`).toBe(true);
      expect(isValidEnquiryEmail(e), JSON.stringify(e)).toBe(true);
    }
  });

  it("refuses every address the server refuses", () => {
    for (const e of REJECT) {
      expect(serverAccepts(e), `server should refuse ${JSON.stringify(e)}`).toBe(false);
      expect(isValidEnquiryEmail(e), JSON.stringify(e)).toBe(false);
    }
  });

  it("refuses null and undefined", () => {
    expect(isValidEnquiryEmail(null)).toBe(false);
    expect(isValidEnquiryEmail(undefined)).toBe(false);
  });

  it("agrees with the server on the length limit, counted after trim", () => {
    const local = "a".repeat(64);
    const fill = (n: number) => `${local}@${"b".repeat(n)}.test`;
    const at254 = fill(254 - local.length - 1 - 5);
    expect(at254.length).toBe(254);
    expect(isValidEnquiryEmail(at254)).toBe(true);
    expect(serverAccepts(at254)).toBe(true);
    expect(isValidEnquiryEmail(`  ${at254}  `)).toBe(serverAccepts(`  ${at254}  `));
    const at255 = fill(254 - local.length - 1 - 5 + 1);
    expect(isValidEnquiryEmail(at255)).toBe(false);
    expect(serverAccepts(at255)).toBe(false);
  });

  it("matches the server on thousands of generated addresses", () => {
    // Deterministic, so a failure can be replayed.
    let seed = 19;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const parts = ["a", "Z", "0", "9", ".", "..", "-", "_", "+", "'", "@", "@@", " ", "\t", " ", "​", ",", ";", "ā", "&", "/", "co", "nz", "test", "example", "x1", "-x", "x-", ".com", ".c", ".1"];
    let checked = 0;
    for (let i = 0; i < 20000; i++) {
      const pieces: string[] = [];
      const len = 1 + rand(9);
      for (let j = 0; j < len; j++) pieces.push(parts[rand(parts.length)]);
      // Half of them shaped like an address, so both outcomes are well covered.
      const s = i % 2 ? pieces.join("") : `${pieces.slice(0, len / 2).join("")}@${pieces.slice(len / 2).join("")}.test`;
      expect(isValidEnquiryEmail(s), JSON.stringify(s)).toBe(serverAccepts(s));
      checked++;
    }
    expect(checked).toBe(20000);
  });

  it("offers a tidy version only when it fixes an address the server refuses", () => {
    expect(tidyEnquiryEmail("aroha@example.test.")).toBe("aroha@example.test");
    expect(tidyEnquiryEmail("aroha@example.test,")).toBe("aroha@example.test");
    expect(tidyEnquiryEmail("aroha@example.test​")).toBe("aroha@example.test");
    expect(tidyEnquiryEmail("aroha @example.test")).toBe("aroha@example.test");
    expect(tidyEnquiryEmail("<aroha@example.test>")).toBe("aroha@example.test");
    expect(tidyEnquiryEmail("mailto:aroha@example.test")).toBe("aroha@example.test");
    expect(tidyEnquiryEmail("aroha@example.test")).toBeNull();
    expect(tidyEnquiryEmail(" aroha@example.test ")).toBeNull();
    expect(tidyEnquiryEmail("x..c@example.test")).toBeNull();
    expect(tidyEnquiryEmail("")).toBeNull();
    for (const raw of ["aroha@example.test.", "a b@example.test", "x@example.test;"]) {
      const t = tidyEnquiryEmail(raw);
      if (t) expect(serverAccepts(t)).toBe(true);
    }
  });
});

describe("guest count as typed", () => {
  const ok = (raw: string | number, value: number, exact = false) =>
    expect(parseGuestCount(raw), String(raw)).toEqual({ kind: "ok", value, exact, needsConfirm: value > 2000 });

  it("reads one plain number exactly", () => {
    ok("40", 40, true);
    ok(" 40 ", 40, true);
    ok(40, 40, true);
    ok("1,200", 1200, true);
    ok("100000", 100000, true);
  });

  it("reads a range, an estimate or words around a number", () => {
    ok("30-40", 40);
    ok("30 - 40", 40);
    ok("30–40", 40);
    ok("30—40", 40);
    ok("30 to 40", 40);
    ok("120-150", 150);
    ok("100–150 people", 150);
    ok("50+", 50);
    ok("+50", 50);
    ok("approx 40", 40);
    ok("about 40", 40);
    ok("~40", 40);
    ok("40ish", 40);
    ok("40 people", 40);
    ok("around 40 pax", 40);
    ok("40 adults 10 kids", 40);
    ok("approx. 40.", 40);
    ok("1,200-1,500", 1500);
  });

  it("asks before sending a very large number (WebKit's number box joined 30-40 into 3040)", () => {
    expect(parseGuestCount("3040")).toEqual({ kind: "ok", value: 3040, exact: true, needsConfirm: true });
    expect(parseGuestCount("2000")).toMatchObject({ needsConfirm: false });
    expect(parseGuestCount("2001")).toMatchObject({ needsConfirm: true });
  });

  it("refuses empty, no number, zero, negative and too many", () => {
    expect(parseGuestCount("")).toEqual({ kind: "empty" });
    expect(parseGuestCount("   ")).toEqual({ kind: "empty" });
    expect(parseGuestCount(null)).toEqual({ kind: "empty" });
    expect(parseGuestCount(undefined)).toEqual({ kind: "empty" });
    expect(parseGuestCount("forty")).toEqual({ kind: "invalid", reason: "no_number" });
    expect(parseGuestCount("lots")).toEqual({ kind: "invalid", reason: "no_number" });
    expect(parseGuestCount("0")).toEqual({ kind: "invalid", reason: "zero" });
    expect(parseGuestCount("0-0")).toEqual({ kind: "invalid", reason: "zero" });
    expect(parseGuestCount("-5")).toEqual({ kind: "invalid", reason: "negative" });
    expect(parseGuestCount("−5")).toEqual({ kind: "invalid", reason: "negative" });
    expect(parseGuestCount("100001")).toEqual({ kind: "invalid", reason: "too_many" });
    expect(parseGuestCount("120150000")).toEqual({ kind: "invalid", reason: "too_many" });
  });

  it("always gives the server a whole number it accepts", () => {
    const serverGuests = z.number().int().min(0).max(100000);
    for (const raw of ["40", "30-40", "50+", "approx 40", "1.5", "99999.6", "40.4", "1,200"]) {
      const p = parseGuestCount(raw);
      if (p.kind === "ok") expect(serverGuests.safeParse(p.value).success, raw).toBe(true);
    }
    expect(GUEST_COUNT_MAX).toBe(100000);
  });

  it("keeps what was typed when it wasn't one plain number", () => {
    expect(guestCountAsTypedLine("30-40")).toBe("Guests (as typed): 30-40");
    expect(guestCountAsTypedLine(" 50+ ")).toBe("Guests (as typed): 50+");
    expect(guestCountAsTypedLine("40")).toBeNull();
    expect(guestCountAsTypedLine("1,200")).toBeNull();
    expect(guestCountAsTypedLine("forty")).toBeNull();
    expect(guestCountAsTypedLine("")).toBeNull();
  });
});

describe("field limits and labels", () => {
  it("are the server's limits", () => {
    expect(ENQUIRY_LIMITS).toMatchObject({
      firstName: 100, lastName: 100, email: 254, phone: 40, company: 200,
      eventType: 100, eventDetail: 255, invoicingNote: 255, message: 5000, messageTotal: 10000, source: 100,
    });
    expect(ENQUIRY_LIMITS.messageTotal).toBeGreaterThan(ENQUIRY_LIMITS.message);
  });

  it("name step-2 fields the way the screen does", () => {
    expect(ENQUIRY_FIELD_LABELS.eventDetail).toBe("What's the occasion?");
    expect(ENQUIRY_FIELD_LABELS.invoicingNote).toBe("Invoice to");
  });

  it("know which fields are on step 1", () => {
    expect([...STEP_ONE_FIELDS]).toEqual(["firstName", "lastName", "email", "phone", "company"]);
    expect(isStepOneField("email")).toBe(true);
    expect(isStepOneField("guestCount")).toBe(false);
    expect(isStepOneField(undefined)).toBe(false);
  });
});

describe("event format words", () => {
  it("understands the venue page's words", () => {
    expect(eventFormatFromText("standing")).toBe("cocktail");
    expect(eventFormatFromText("Standing")).toBe("cocktail");
    expect(eventFormatFromText("stand-up")).toBe("cocktail");
    expect(eventFormatFromText("Canapés")).toBe("cocktail");
    expect(eventFormatFromText("Standing & canapés")).toBe("cocktail");
    expect(eventFormatFromText("cocktail")).toBe("cocktail");
    expect(eventFormatFromText("Cocktail / standing")).toBe("cocktail");
    expect(eventFormatFromText("seated")).toBe("seated");
    expect(eventFormatFromText("seat")).toBe("seated");
    expect(eventFormatFromText("sit-down")).toBe("seated");
    expect(eventFormatFromText("Seated dinner")).toBe("seated");
    expect(eventFormatFromText("both")).toBe("both");
    expect(eventFormatFromText("mixed")).toBe("both");
    expect(eventFormatFromText("A bit of both")).toBe("both");
  });

  it("covers every option the form has, by value and by label", () => {
    for (const o of EVENT_FORMAT_OPTIONS) {
      expect(eventFormatFromText(o.value)).toBe(o.value);
      expect(eventFormatFromText(o.label)).toBe(o.value);
    }
  });

  it("never guesses", () => {
    expect(eventFormatFromText("banquet")).toBeUndefined();
    expect(eventFormatFromText("")).toBeUndefined();
    expect(eventFormatFromText(null)).toBeUndefined();
  });
});

describe("same name on step 1", () => {
  it("ignores case and extra spaces", () => {
    expect(sameEnquiryName({ firstName: " Aroha ", lastName: "Te  Wiata" }, { firstName: "aroha", lastName: "te wiata" })).toBe(true);
    expect(sameEnquiryName({ firstName: "Aroha", lastName: null }, { firstName: "Aroha", lastName: "" })).toBe(true);
  });

  it("tells a different first or last name apart", () => {
    expect(sameEnquiryName({ firstName: "Aroha", lastName: "Testwell" }, { firstName: "Ben", lastName: "Testwell" })).toBe(false);
    expect(sameEnquiryName({ firstName: "Aroha", lastName: "Testwell" }, { firstName: "Aroha", lastName: "Other" })).toBe(false);
    expect(sameEnquiryName({ firstName: "Aroha" }, { firstName: "Aroha", lastName: "Testwell" })).toBe(false);
  });
});
