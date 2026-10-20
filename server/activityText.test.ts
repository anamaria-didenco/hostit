import { describe, it, expect } from "vitest";
import { humanizeActivity, statusNameFor } from "../shared/activityText";

const STATUSES = [
  { key: "new", label: "New Enquiry" },
  { key: "contacted", label: "Responded" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "booked", label: "Confirmed" },
  { key: "lost", label: "Lost" },
];

describe("humanizeActivity", () => {
  it("swaps a raw status key for the venue's label", () => {
    expect(humanizeActivity("Status changed to proposal_sent", STATUSES)).toBe("Status changed to Proposal Sent");
  });
  it("uses the venue's custom name", () => {
    expect(humanizeActivity("Status changed to contacted", STATUSES)).toBe("Status changed to Responded");
  });
  it("maps the retired 'confirmed'/'booked' keys to the same label", () => {
    expect(humanizeActivity("Status changed to booked", STATUSES)).toBe("Status changed to Confirmed");
    expect(humanizeActivity("Status changed to confirmed", STATUSES)).toBe("Status changed to Confirmed");
  });
  it("keeps the reason and note after the key", () => {
    expect(humanizeActivity("Status changed to lost — Went elsewhere: called back", STATUSES))
      .toBe("Status changed to Lost — Went elsewhere: called back");
  });
  it("handles bulk status updates too", () => {
    expect(humanizeActivity("Bulk status update: changed to lost (Other)", STATUSES)).toBe("Bulk status update: changed to Lost (Other)");
  });
  it("leaves other activity untouched", () => {
    expect(humanizeActivity("Rang back, wants a quote by Friday", STATUSES)).toBe("Rang back, wants a quote by Friday");
  });
  it("title-cases an unknown key rather than showing underscores", () => {
    expect(statusNameFor("site_visit", STATUSES)).toBe("Site Visit");
  });
});
