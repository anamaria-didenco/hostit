import { describe, it, expect } from "vitest";
import { DEFAULT_FORM_FIELDS, mergeFormFields } from "@shared/formFields";

/**
 * The bug these guard: a venue's saved form config REPLACED the defaults, so
 * any field added later (Company, Preferred Time) never appeared on the live
 * form and couldn't even be enabled in the editor. And guest count is venue
 * policy: an enquiry without numbers can't be quoted, so it is always asked
 * and always required, whatever an old config says.
 */

// A config saved before Company/eventTime existed, guest count optional.
const STALE = [
  { id: "firstName", label: "First Name", type: "text", required: true, visible: true, isDefault: true },
  { id: "email", label: "Email", type: "email", required: true, visible: true, isDefault: true },
  { id: "guestCount", label: "Guest Count", type: "number", required: false, visible: true, isDefault: true },
  { id: "message", label: "Message", type: "textarea", required: false, visible: true, isDefault: true },
] as any;

describe("enquiry form field merging", () => {
  it("appends default fields a saved config predates", () => {
    const merged = mergeFormFields(STALE);
    const ids = merged.map(f => f.id);
    expect(ids).toContain("company");
    expect(ids).toContain("eventTime");
    expect(merged.find(f => f.id === "company")!.visible).toBe(true);
  });

  it("keeps the venue's own settings and ordering for fields it has", () => {
    const merged = mergeFormFields(STALE);
    expect(merged.slice(0, 4).map(f => f.id)).toEqual(["firstName", "email", "guestCount", "message"]);
    expect(merged.find(f => f.id === "email")!.required).toBe(true);
  });

  it("respects a deliberate hide — present with visible:false stays hidden", () => {
    const hidden = [...STALE, { id: "company", label: "Company", type: "text", required: false, visible: false, isDefault: true }];
    const merged = mergeFormFields(hidden as any);
    expect(merged.filter(f => f.id === "company")).toHaveLength(1);
    expect(merged.find(f => f.id === "company")!.visible).toBe(false);
  });

  it("guest count is always on the form and always required", () => {
    expect(mergeFormFields(STALE).find(f => f.id === "guestCount")).toMatchObject({ required: true, visible: true });
    const hiddenGuests = STALE.map((f: any) => f.id === "guestCount" ? { ...f, visible: false } : f);
    expect(mergeFormFields(hiddenGuests).find(f => f.id === "guestCount")).toMatchObject({ required: true, visible: true });
    expect(mergeFormFields(null).find(f => f.id === "guestCount")).toMatchObject({ required: true, visible: true });
  });

  it("falls back to the defaults for an empty or invalid config", () => {
    expect(mergeFormFields(null).map(f => f.id)).toEqual(DEFAULT_FORM_FIELDS.map(f => f.id));
    expect(mergeFormFields([]).map(f => f.id)).toEqual(DEFAULT_FORM_FIELDS.map(f => f.id));
    expect(mergeFormFields("garbage").map(f => f.id)).toEqual(DEFAULT_FORM_FIELDS.map(f => f.id));
  });

  it("keeps the venue's custom (non-default) fields", () => {
    const withCustom = [...STALE, { id: "custom-1", label: "Dietary theme?", type: "text", required: false, visible: true, isDefault: false }];
    const merged = mergeFormFields(withCustom as any);
    expect(merged.find(f => f.id === "custom-1")).toBeTruthy();
  });

  it("never mutates the stored config it was given", () => {
    const copy = JSON.parse(JSON.stringify(STALE));
    mergeFormFields(STALE);
    expect(STALE).toEqual(copy);
  });
});
