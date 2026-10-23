import { describe, it, expect } from "vitest";
import { renderProposalTemplate } from "./proposalTemplateRender";
import { venueBrand } from "../shared/brand";
import type { ProposalBlockData } from "./proposalBlocks";

function sampleData(overrides: Partial<ProposalBlockData> = {}): ProposalBlockData {
  const venue: any = { name: "Test Venue", timezone: "Pacific/Auckland", brandAccentColor: "#2f5488", brandFontKey: "editorial", email: "v@x.com" };
  return {
    proposal: {
      title: "Spring Gala",
      eventDate: null, expiresAt: null, guestCount: 80, spaceName: "The Main Room",
      subtotalNzd: "6000.00", taxNzd: "900.00", totalNzd: "6900.00",
      depositNzd: "1725.00", depositPercent: "25", taxPercent: "15", menuChoice: false,
      lineItems: JSON.stringify([{ description: "Venue hire", qty: 1, unitPrice: 2000, total: 2000 }]),
      introMessage: null, termsAndConditions: null,
    },
    lead: { firstName: "Jane & Co", lastName: "Smith", email: "jane@example.com" },
    venue,
    brand: venueBrand(venue),
    menus: [],
    drinks: null,
    photos: [],
    ...overrides,
  };
}

describe("renderProposalTemplate", () => {
  it("substitutes scalar tokens and HTML-escapes their values", () => {
    const out = renderProposalTemplate("<p>{{clientName}} — {{total}}</p>", sampleData(), "web");
    expect(out).toContain("Jane &amp; Co Smith");
    expect(out).toContain("$6,900.00");
    expect(out).not.toContain("{{clientName}}");
  });

  it("keeps brand tokens raw inside inline styles (substitute-before-sanitise)", () => {
    const out = renderProposalTemplate('<div style="color:{{accentColor}}">hi</div>', sampleData(), "web");
    expect(out).toContain("color:#2f5488");
  });

  it("renders the branded pricing block from the proposal's line items", () => {
    const out = renderProposalTemplate("<section>{{pricing}}</section>", sampleData(), "web");
    expect(out).toContain("Venue hire");
    expect(out).toContain("$6,900.00");
    expect(out).toMatch(/Pricing/i);
  });

  it("strips <script>, event handlers and bad URLs", () => {
    const tpl = '<p>ok</p><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">x</a>';
    const out = renderProposalTemplate(tpl, sampleData(), "web");
    expect(out).toContain("ok");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain("alert(1)");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("javascript:");
  });

  it("strips url() from inline CSS (SSRF/exfil vector)", () => {
    const out = renderProposalTemplate('<div style="background:url(http://evil/x)">x</div>', sampleData(), "web");
    expect(out).not.toContain("url(");
    expect(out).not.toContain("evil");
  });

  it("drops unknown tokens rather than leaking raw braces", () => {
    const out = renderProposalTemplate("<p>{{bogusToken}}done</p>", sampleData(), "web");
    expect(out).not.toContain("{{bogusToken}}");
    expect(out).toContain("done");
  });

  it("wraps a full HTML document in pdf mode", () => {
    const out = renderProposalTemplate("<p>{{venueName}}</p>", sampleData(), "pdf");
    expect(out).toMatch(/^<!DOCTYPE html>/);
    expect(out).toContain("Test Venue");
    expect(out).toContain("@import url(");
  });
});
