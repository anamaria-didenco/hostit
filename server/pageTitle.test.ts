import { describe, expect, it } from "vitest";
import { pageTitle, routeTitle } from "../shared/pageTitle";

describe("pageTitle", () => {
  it("joins the parts and ends with the app name", () => {
    expect(pageTitle(["Run sheet", "Grace Holloway"])).toBe("Run sheet · Grace Holloway · VenueFlow");
  });
  it("drops empty and missing parts, and tidies whitespace", () => {
    expect(pageTitle(["Event", null, undefined, false, "  ", " Grace   Holloway "])).toBe("Event · Grace Holloway · VenueFlow");
  });
  it("drops a part that repeats an earlier one", () => {
    expect(pageTitle(["Proposal", "The Harbour Room", "the harbour room"], null)).toBe("Proposal · The Harbour Room");
  });
  it("can leave the app name off (client-facing screens)", () => {
    expect(pageTitle(["Your event", "The Harbour Room"], null)).toBe("Your event · The Harbour Room");
  });
});

describe("routeTitle", () => {
  it("gives every staff route its own name", () => {
    expect(routeTitle("/login")).toBe("Sign in · VenueFlow");
    expect(routeTitle("/signup")).toBe("Create your account · VenueFlow");
    expect(routeTitle("/event/12")).toBe("Event · VenueFlow");
    expect(routeTitle("/runsheet")).toBe("Run sheet · VenueFlow");
    expect(routeTitle("/proposals/new")).toBe("Proposal builder · VenueFlow");
    expect(routeTitle("/floor-plan")).toBe("Floor plan · VenueFlow");
    expect(routeTitle("/payments")).toBe("Payments · VenueFlow");
    expect(routeTitle("/staff-links")).toBe("Staff links · VenueFlow");
    expect(routeTitle("/daily-checklists")).toBe("Daily checklists · VenueFlow");
    expect(routeTitle("/checklist")).toBe("Event checklist · VenueFlow");
  });
  it("leaves the app name off client and staff-on-the-day links", () => {
    expect(routeTitle("/proposal/abc123")).toBe("Proposal");
    expect(routeTitle("/portal/abc123")).toBe("Your event");
    expect(routeTitle("/staff/abc123")).toBe("Staff portal");
    expect(routeTitle("/daily/abc123")).toBe("Daily checklist");
    expect(routeTitle("/floor-plan/share/abc123")).toBe("Floor plan");
    expect(routeTitle("/enquire/the-harbour-room")).toBe("Enquire");
  });
  it("tells the two floor-plan routes apart", () => {
    expect(routeTitle("/floor-plan/share/x")).not.toBe(routeTitle("/floor-plan"));
  });
  it("ignores a query string or trailing slash", () => {
    expect(routeTitle("/runsheet?bookingId=1")).toBe("Run sheet · VenueFlow");
    expect(routeTitle("/login/")).toBe("Sign in · VenueFlow");
  });
  it("keeps the marketing title on the landing page", () => {
    expect(routeTitle("/")).toBeNull();
  });
  it("names unknown paths as the 404 page", () => {
    expect(routeTitle("/no-such-page")).toBe("Page not found · VenueFlow");
    expect(routeTitle("/404")).toBe("Page not found · VenueFlow");
    expect(routeTitle("/event")).toBe("Page not found · VenueFlow");
  });
});
