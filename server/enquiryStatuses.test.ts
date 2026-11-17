import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATUSES,
  holdColourClash,
  holdColourNote,
  keepHoldDistinct,
  parseCustomStatuses,
  statusEditorSeed,
  type StatusDef,
} from "@shared/enquiryStatuses";

const saved: StatusDef[] = [
  { key: "new", label: "New Enquiry", colorId: "blue" },
  { key: "contacted", label: "Contacted", colorId: "forest" },
  { key: "proposal_sent", label: "Proposal Sent", colorId: "amber" },
  { key: "tentative", label: "On Hold", colorId: "purple" },
  { key: "booked", label: "Confirmed", colorId: "forest" },
];

describe("statusEditorSeed (Settings > Enquiry Statuses opened from a link)", () => {
  it("gives the editor nothing to start from while the venue's settings are still loading", () => {
    // The old editor was seeded with parseCustomStatuses(undefined) = the defaults, and its
    // first save wrote them over the venue's real list (deleted statuses came back,
    // Contacted went back to Sky).
    expect(statusEditorSeed(undefined)).toBeNull();
  });

  it("starts from the venue's saved list once it has loaded", () => {
    expect(statusEditorSeed({ customStatuses: JSON.stringify(saved) })).toEqual(saved);
  });

  it("starts from the defaults for a venue with no saved list or no settings row yet", () => {
    expect(statusEditorSeed({ customStatuses: null })).toEqual(DEFAULT_STATUSES);
    expect(statusEditorSeed(null)).toEqual(DEFAULT_STATUSES);
  });
});

describe("On Hold kept distinct from Proposal Sent", () => {
  const goldHold = saved.map(s => (s.key === "tentative" ? { ...s, colorId: "amber" } : s));

  it("detects Gold/Yellow on both and recolours only On Hold", () => {
    expect(holdColourClash(saved)).toBe(false);
    expect(holdColourClash(goldHold)).toBe(true);
    const fixed = keepHoldDistinct(goldHold);
    expect(fixed.find(s => s.key === "tentative")?.colorId).toBe("purple");
    expect(fixed.find(s => s.key === "proposal_sent")?.colorId).toBe("amber");
    expect(parseCustomStatuses(JSON.stringify(goldHold))).toEqual(fixed);
  });

  it("explains the override in the venue's own words, and says nothing when there is none", () => {
    expect(holdColourNote(saved)).toBeNull();
    const renamed = goldHold.map(s => (s.key === "tentative" ? { ...s, label: "Pencilled In" } : s));
    expect(holdColourNote(renamed)).toBe(
      "Pencilled In will show in Purple so it can't be mistaken for Proposal Sent (Gold and Yellow look too alike).",
    );
  });

  it("leaves the list alone when either status is missing", () => {
    const noProposal = goldHold.filter(s => s.key !== "proposal_sent");
    expect(holdColourClash(noProposal)).toBe(false);
    expect(keepHoldDistinct(noProposal)).toBe(noProposal);
  });
});
