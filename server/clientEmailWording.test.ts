/**
 * The wording of every client email VenueFlow sends automatically, or from a
 * built-in default: each builder is rendered with invented sample data and
 * checked for its key lines, for the house rules (no "!", no em dash in the
 * copy, HTML and text saying the same thing), and for escaping, by feeding
 * markup through every field a client or venue can type.
 */
import { describe, expect, it } from "vitest";
import { escapeHtml } from "./sanitizeHtml";
import {
  buildEnquiryAutoReplyEmail, buildProposalSentEmail, buildDepositRequestEmail,
  buildPaymentReceiptEmail, buildOneTapFollowUpEmail, type AutoReplyInput,
} from "./clientEmails";
import { buildWalkthroughEmail, walkthroughIcsDescription } from "./enquiryForm";
import { buildHoldEmail, holdUntilFromYmd } from "./holds";
import { buildAcceptConfirmationEmail } from "./proposalResponses";
import { buildPortalLinkEmail } from "./clientPortal";
import { renderFollowUpEmail } from "./followUpSequences";
import { copyEventType, ENQUIRY_RESPONSE_PROMISE, DEFAULT_AUTO_REPLY_INTRO } from "@shared/enquiryCopy";
import {
  SEQUENCES, SEQUENCE_BY_KEY, LEGACY_SEQUENCE_DEFAULTS, readSequenceSettings, applySequenceUpdate,
} from "@shared/followUpSequences";

type Mail = { subject: string; html: string; text: string };

/** Markup a person could type into a field that ends up in an email. */
const HOSTILE = "<img src=x onerror=alert(1)>";

/** House rules every client email keeps. */
function expectHouseStyle(m: Mail) {
  for (const part of [m.subject, m.html, m.text]) expect(part).not.toContain("!");
  // The " — {venue}" subject separator stays; the copy itself has no em dashes.
  expect(m.text).not.toContain("—");
  expect(m.text).not.toMatch(/Warm regards|Please find|don't hesitate|Thanks so much|a member of the team/);
}
/** No raw markup from user data reached the HTML. */
function expectNoInjectedMarkup(m: Mail) {
  expect(m.html).not.toContain("<img");
  expect(m.html).not.toContain("<script");
  expect(m.html).not.toContain("<b>");
}
/** Every line of the plain text appears in the HTML (once its markup and escaping are removed). */
function expectTextMatchesHtml(m: Mail) {
  // Links count as shown: their address is in the href.
  const visible = m.html.replace(/<a href="([^"]*)"[^>]*>/g, " $1 ").replace(/<\/?(strong|a)\b[^>]*>/g, "")
    .replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  for (const line of m.text.split("\n").map(l => l.replace(/^- /, "").trim()).filter(Boolean)) {
    // A label like "Date: Saturday..." is a two-cell row in the HTML.
    const parts = line.split(/:\s(?=\S)/);
    for (const part of parts.length > 1 && line.length < 120 ? parts : [line]) {
      // "How to pay:" in the text is a bold "How to pay" heading in the HTML.
      expect(visible, `HTML is missing "${part}"`).toContain(part.replace(/\s+/g, " ").trim().replace(/:$/, ""));
    }
  }
}

describe("copyEventType", () => {
  it("drops blank and the catch-all Other, keeps the rest as stored", () => {
    expect(copyEventType(null)).toBeNull();
    expect(copyEventType("  ")).toBeNull();
    expect(copyEventType("Other")).toBeNull();
    expect(copyEventType(" other ")).toBeNull();
    expect(copyEventType(" Christmas Party ")).toBe("Christmas Party");
  });
});

describe("enquiry auto-reply", () => {
  const base: AutoReplyInput = {
    venueName: "The Larder Room", brand: { accent: "#6b2d2a", onAccent: "#fff", sans: "Arial, sans-serif", serif: "Georgia, serif" },
    logoHtml: "", firstName: "Ava", introOverride: null, eventType: "Engagement Party",
    dateLabel: "Saturday, 13 March 2027", dateFlexible: true, guestCount: 60,
    phone: "03 555 0142", fromEmail: "events@larder.example.test",
  };

  it("welcomes them, keeps the response-time promise, and repeats what they sent", () => {
    const m = buildEnquiryAutoReplyEmail(base);
    expect(m.subject).toBe("Your enquiry is with us — The Larder Room");
    expect(DEFAULT_AUTO_REPLY_INTRO).toBe(`Thank you for thinking of us. We'll be in touch ${ENQUIRY_RESPONSE_PROMISE}.`);
    expect(m.text).toContain("Thank you for thinking of us. We'll be in touch within one business day.");
    expect(m.html).toContain("Good to hear from you");
    expect(m.text).toContain("Event: Engagement Party\nDate: Saturday, 13 March 2027 (flexible)\nGuests: 60");
    expect(m.html).toContain("Saturday, 13 March 2027 (flexible)");
    expect(m.text).toContain("If anything changes in the meantime, just reply to this email or reach us on 03 555 0142 · events@larder.example.test.");
    expect(m.text.endsWith("Speak soon,\nThe Larder Room")).toBe(true);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("leaves out what they didn't give, without a gap, and the phone when there is none", () => {
    const m = buildEnquiryAutoReplyEmail({ ...base, eventType: undefined, dateLabel: null, guestCount: undefined, phone: null });
    expect(m.text).toBe(
      "Hi Ava,\n\nThank you for thinking of us. We'll be in touch within one business day.\n\n"
      + "If anything changes in the meantime, just reply to this email or reach us on events@larder.example.test.\n\n"
      + "Speak soon,\nThe Larder Room");
    expect(m.html).not.toContain("<table");
    expect(m.text).not.toContain("(flexible)");
  });

  it("uses the venue's own opening line instead, and escapes it and everything typed", () => {
    const m = buildEnquiryAutoReplyEmail({
      ...base, firstName: `Ava ${HOSTILE}`, introOverride: "  Lovely to hear from you <b>today</b>.  ",
      eventType: `<b>Party</b>`, venueName: "Larder & <b>Co</b>", phone: "<b>03</b>",
    });
    expect(m.text).toContain("\n\nLovely to hear from you <b>today</b>.\n\n");
    expect(m.text).not.toContain("Thank you for thinking of us");
    expect(m.html).toContain("Lovely to hear from you &lt;b&gt;today&lt;/b&gt;.");
    expect(m.html).toContain("Larder &amp; &lt;b&gt;Co&lt;/b&gt;");
    expectNoInjectedMarkup(m);
  });
});

describe("walkthrough emails", () => {
  const venue = { venueName: "The Larder Room", accent: "#6b2d2a", firstName: "Ava", phone: "03 555 0142", fromEmail: "events@larder.example.test" };

  it("request: a request, not a booking, with what they suggested", () => {
    const m = buildWalkthroughEmail(venue, { kind: "requested", summary: "Fri 27 Nov or Sat 28 Nov · Morning" }, escapeHtml);
    expect(m.subject).toBe("We'd be glad to show you around — The Larder Room");
    expect(m.html).toContain("Let's find a time");
    expect(m.text).toContain("Thank you for asking to come and see us. We'll check when the team is on site, then confirm a time with you.");
    expect(m.text).toContain("You suggested: Fri 27 Nov or Sat 28 Nov · Morning");
    expect(m.text).toContain("Anything else we should know? Just reply to this email or reach us on 03 555 0142 · events@larder.example.test.");
    expect(m.text.endsWith("Speak soon,\nThe Larder Room")).toBe(true);
    expect(m.text).not.toMatch(/confirmed/i);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("confirmed: the exact slot and length, where, the invite, and how to change it", () => {
    const m = buildWalkthroughEmail(venue, { kind: "confirmed", label: "Thu 3 Dec, 1:30pm", minutes: 30, location: "14 Example Lane, Harbourside" }, escapeHtml);
    expect(m.subject).toBe("See you on Thu 3 Dec, 1:30pm — The Larder Room");
    expect(m.html).toContain("Your walkthrough is confirmed");
    expect(m.text).toContain("We look forward to showing you around. Your walkthrough is confirmed, and a calendar invite is attached.");
    expect(m.text).toContain("When: Thu 3 Dec, 1:30pm (30 min)\nWhere: 14 Example Lane, Harbourside");
    expect(m.text).toContain("Need a different time? Just reply to this email or reach us on 03 555 0142 · events@larder.example.test.");
    expect(m.text.endsWith("See you soon,\nThe Larder Room")).toBe(true);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
    const noWhere = buildWalkthroughEmail({ ...venue, phone: null }, { kind: "confirmed", label: "Thu 3 Dec, 1:30pm", minutes: 45, location: "" }, escapeHtml);
    expect(noWhere.text).not.toContain("Where:");
    expect(noWhere.text).toContain("(45 min)");
    expect(noWhere.text).toContain("Just reply to this email or reach us on events@larder.example.test.");
  });

  it("escapes the name, the summary and the venue's details", () => {
    const m = buildWalkthroughEmail(
      { ...venue, firstName: HOSTILE, venueName: "<b>Larder</b>", phone: "<b>1</b>" },
      { kind: "requested", summary: `Any day — "${HOSTILE}"` }, escapeHtml);
    expectNoInjectedMarkup(m);
  });

  it("calendar invite text keeps the length, the venue and how to change it", () => {
    expect(walkthroughIcsDescription(30, "The Larder Room", "03 555 0142")).toBe(
      "Your 30-minute walkthrough at The Larder Room. We look forward to showing you around. Need a different time? Call 03 555 0142 or reply to the confirmation email.");
    expect(walkthroughIcsDescription(45, "The Larder Room", null)).toBe(
      "Your 45-minute walkthrough at The Larder Room. We look forward to showing you around. Need a different time? Reply to the confirmation email.");
  });
});

describe("hold emails", () => {
  const input = {
    firstName: "Ava", venueName: "The Larder Room", accent: "#6b2d2a", eventDate: new Date("2027-03-13T06:00:00Z"),
    spaceName: "Garden Room, Terrace", eventType: "Engagement Party", holdUntil: holdUntilFromYmd("2027-02-20"),
  };

  it("placed: the held date, the exact last day, and how to go ahead", () => {
    const m = buildHoldEmail("placed", input, escapeHtml);
    expect(m.subject).toBe("We're holding Saturday 13 March for you — The Larder Room");
    expect(m.text).toContain("We've put a hold on Saturday 13 March in the Garden Room and Terrace for your engagement party. We'll keep the date for you until Saturday 20 February.");
    expect(m.text).toContain("If you'd like to go ahead, just reply to this email by then and we'll lock it in.");
    expect(m.text.endsWith("Speak soon,\nThe Larder Room")).toBe(true);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("reminder: today or tomorrow plus the date, unmistakably, and no pressure", () => {
    const m = buildHoldEmail("reminder", input, escapeHtml);
    expect(m.text).toContain("We're still holding Saturday 13 March in the Garden Room and Terrace for you until tomorrow, Saturday 20 February.");
    expect(m.text).toContain("If your plans have changed, that's completely fine. Just let us know and we'll free up the date.");
    const today = buildHoldEmail("reminder", { ...input, ends: "today" }, escapeHtml);
    expect(today.subject).toBe("Your hold on Saturday 13 March ends today — The Larder Room");
    expect(today.text).toContain("until the end of today, Saturday 20 February.");
    expect(today.text).not.toMatch(/automatic|release/i);
    expectHouseStyle(m);
    expectHouseStyle(today);
  });

  it("reads naturally without an event type, or with just Other", () => {
    expect(buildHoldEmail("placed", { ...input, eventType: "Other" }, escapeHtml).text)
      .toContain("We've put a hold on Saturday 13 March in the Garden Room and Terrace. We'll keep");
    expect(buildHoldEmail("placed", { ...input, eventType: null, firstName: null }, escapeHtml).text).toMatch(/^Hi there,/);
  });

  it("escapes what was typed", () => {
    expectNoInjectedMarkup(buildHoldEmail("placed", { ...input, firstName: HOSTILE, eventType: "<b>x</b>", spaceName: HOSTILE, venueName: "<b>V</b>" }, escapeHtml));
  });
});

describe("proposal email", () => {
  const base = { firstName: "Ava", fromName: "The Larder Room", proposalUrl: "https://app.example.test/proposal/tok-1", proposalTitle: "Ava's engagement party" };

  it("says what it holds, links it twice, and invites questions", () => {
    const m = buildProposalSentEmail(base);
    expect(m.subject).toBe("Your proposal is ready — Ava's engagement party");
    expect(m.text).toBe(
      "Hi Ava,\n\nHere's what we've put together for you. It sets out the details, pricing and terms for your event.\n\n"
      + "View your proposal: https://app.example.test/proposal/tok-1\n\n"
      + "If you'd like to change anything or have a question, just reply to this email and we'll talk it through.\n\n"
      + "Speak soon,\nThe Larder Room");
    expect(m.html).toContain(`<a href="https://app.example.test/proposal/tok-1"`);
    expect(m.html).toContain(">View your proposal</a>");
    expect(m.html).toContain("Or copy this link: <a href=\"https://app.example.test/proposal/tok-1\">https://app.example.test/proposal/tok-1</a>");
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("escapes the client's name, the sender name and the link", () => {
    const m = buildProposalSentEmail({ ...base, firstName: HOSTILE, fromName: "<b>Larder</b>", proposalUrl: `https://app.example.test/p/"><script>x</script>` });
    expectNoInjectedMarkup(m);
    expect(m.html).toContain("&lt;img src=x");
    expect(m.html).not.toContain(`"><`);
  });
});

describe("proposal accepted confirmation", () => {
  const base = {
    venueName: "The Larder Room", fromName: "The Larder Room Events", clientFirstName: "Ava",
    proposalTitle: "Ava's engagement party", eventDate: new Date("2027-03-13T00:00:00Z"), guestCount: 60,
    spaceName: "Garden Room", totalNzd: 5750, depositNzd: 0, paymentInstructions: null, hasContract: false,
    proposalUrl: "https://app.example.test/proposal/tok-1", portalUrl: null,
  };

  it("opens warmly, keeps the facts, and signs off for the visit", () => {
    const m = buildAcceptConfirmationEmail(base);
    expect(m.subject).toBe("You're booked in — Ava's engagement party");
    expect(m.text).toContain("We're delighted to be hosting you at The Larder Room. You're booked in.");
    expect(m.text).toContain("Total (incl. GST): $5,750.00");
    expect(m.text).toContain("If anything changes or you have a question, just reply to this email.");
    expect(m.text.endsWith("See you soon,\nThe Larder Room Events")).toBe(true);
    expect(m.text).not.toMatch(/deposit|contract/i);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("with a deposit, instructions and a contract", () => {
    const m = buildAcceptConfirmationEmail({ ...base, depositNzd: 1437.5, paymentInstructions: "Bank transfer to 12-3456-7890123-00", hasContract: true, portalUrl: "https://app.example.test/portal/p" });
    expect(m.text).toContain("A deposit of $1,437.50 secures your date. How to pay:\nBank transfer to 12-3456-7890123-00");
    expect(m.text).toContain("We'll send you your contract to read and sign online.");
    expectHouseStyle(m);
    expectNoInjectedMarkup(buildAcceptConfirmationEmail({ ...base, clientFirstName: HOSTILE, venueName: "<b>V</b>", paymentInstructions: HOSTILE, depositNzd: 10 }));
  });
});

describe("deposit request", () => {
  const base = {
    firstName: "Ava", eventType: "Engagement Party", depositNzd: 1437.5,
    paymentInstructions: "Bank transfer to 12-3456-7890123-00\nReference: your surname",
    portalUrl: "https://app.example.test/portal/p", fromName: "The Larder Room",
  };

  it("frames it warmly but keeps the amount, how to pay and the link exact", () => {
    const m = buildDepositRequestEmail(base);
    expect(m.subject).toBe("Deposit details for your booking — The Larder Room");
    expect(m.text).toBe(
      "Hi Ava,\n\nWe're looking forward to hosting your Engagement Party.\n\n"
      + "To secure your booking, we ask for a deposit of $1,437.50.\n\n"
      + "How to pay:\nBank transfer to 12-3456-7890123-00\nReference: your surname\n\n"
      + "You can see your balance and confirm your payment any time on your event page:\nhttps://app.example.test/portal/p\n\n"
      + "Any questions, just reply to this email.\n\nSpeak soon,\nThe Larder Room");
    expect(m.html).toContain("we ask for a deposit of <strong>$1,437.50</strong>.");
    expect(m.html).toContain("Bank transfer to 12-3456-7890123-00<br>Reference: your surname");
    // No due date is invented.
    expect(m.text).not.toMatch(/\bdue\b|\bby \w+day\b/i);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("without an event type (or Other), instructions or a portal link", () => {
    for (const eventType of [null, "Other"]) {
      const m = buildDepositRequestEmail({ ...base, eventType, paymentInstructions: "  ", portalUrl: null, firstName: null });
      expect(m.text).toBe("Hi there,\n\nWe're looking forward to hosting you.\n\nTo secure your booking, we ask for a deposit of $1,437.50.\n\nAny questions, just reply to this email.\n\nSpeak soon,\nThe Larder Room");
      expect(m.html).not.toContain("How to pay");
    }
  });

  it("escapes what was typed", () => {
    expectNoInjectedMarkup(buildDepositRequestEmail({ ...base, firstName: HOSTILE, eventType: "<b>x</b>", paymentInstructions: "<script>x</script>", fromName: "<b>V</b>" }));
  });
});

describe("payment receipts", () => {
  const base = { firstName: "Ava", amount: 1437.5, paidAt: new Date("2026-11-20T01:00:00Z"), total: 5750, outstanding: 4312.5, portalUrl: "https://app.example.test/portal/p", fromName: "The Larder Room" };

  it("payment: thanks them, with the exact amount, type, date and balance", () => {
    const m = buildPaymentReceiptEmail({ ...base, type: "deposit" });
    expect(m.subject).toBe("We've received your deposit — The Larder Room");
    expect(m.text).toContain("Thank you for your deposit of $1,437.50, received on 20 November 2026.");
    expect(m.text).toContain("Your remaining balance is $4,312.50.");
    expect(m.text).toContain("Full details are on your event page:\nhttps://app.example.test/portal/p");
    expect(m.text.endsWith("Speak soon,\nThe Larder Room")).toBe(true);
    expect(m.html).toContain("Thank you for your deposit of <strong>$1,437.50</strong>, received on 20 November 2026.");
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
    expect(buildPaymentReceiptEmail({ ...base, type: "partial" }).subject).toBe("We've received your payment — The Larder Room");
  });

  it("paid up: says so in the HTML and the text", () => {
    const m = buildPaymentReceiptEmail({ ...base, type: "final", amount: 4312.5, outstanding: 0 });
    expect(m.subject).toBe("We've received your final payment — The Larder Room");
    expect(m.text).toContain("Your remaining balance is $0.00, so you're all paid up.");
    expect(m.html).toContain("Your remaining balance is <strong>$0.00</strong>, so you're all paid up.");
    expectHouseStyle(m);
  });

  it("refund: worded as a refund, with its own sign-off", () => {
    const m = buildPaymentReceiptEmail({ ...base, type: "refund", amount: 200, outstanding: 200 });
    expect(m.subject).toBe("Confirming your refund — The Larder Room");
    expect(m.text).toContain("We've refunded $200.00 to you on 20 November 2026.");
    expect(m.text).not.toMatch(/thank you for your/i);
    expect(m.text.endsWith("All the best,\nThe Larder Room")).toBe(true);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("no total set: no balance line; no portal: no link", () => {
    const m = buildPaymentReceiptEmail({ ...base, type: "deposit", total: 0, outstanding: 0, portalUrl: null, firstName: null });
    expect(m.text).not.toContain("balance");
    expect(m.text).not.toContain("event page");
    expect(m.text).toMatch(/^Hi there,/);
    expectNoInjectedMarkup(buildPaymentReceiptEmail({ ...base, type: "deposit", firstName: HOSTILE, fromName: "<b>V</b>" }));
  });
});

describe("portal and contract emails", () => {
  const base = { clientName: "Ava Lindqvist", url: "https://app.example.test/portal/p", venueName: "The Larder Room", fromName: "The Larder Room" };

  it("event page: what's there, the link twice, and an invitation to reply", () => {
    const m = buildPortalLinkEmail(base);
    expect(m.subject).toBe("Your event, all in one place — The Larder Room");
    expect(m.text).toBe("Hi Ava,\n\nHere's your event page. Your event details, proposal and payments are all there.\n\nhttps://app.example.test/portal/p\n\nAny questions, just reply to this email.\n\nSpeak soon,\nThe Larder Room");
    expect(m.html).toContain(">Open your event page</a>");
    expect(m.html).toContain("Or copy this link:");
    expectHouseStyle(m);
  });

  it("contract: the title, signing online, and its own closing line", () => {
    const m = buildPortalLinkEmail({ ...base, contractTitle: "Venue hire agreement" });
    expect(m.subject).toBe("Your contract is ready to sign — Venue hire agreement");
    expect(m.text).toContain(`Here's your contract, "Venue hire agreement". You can read and sign it online. It only takes a few minutes.`);
    expect(m.text).toContain("If you'd like to talk anything through before you sign, just reply to this email.");
    expect(m.html).toContain(">Read and sign</a>");
    expect(m.text).not.toMatch(/expir/i);
    expectHouseStyle(m);
  });

  it("falls back to Hi there, and escapes the name and title", () => {
    expect(buildPortalLinkEmail({ ...base, clientName: null }).text).toMatch(/^Hi there,/);
    const m = buildPortalLinkEmail({ ...base, clientName: HOSTILE, contractTitle: HOSTILE, fromName: "<b>V</b>" });
    expectNoInjectedMarkup(m);
  });
});

describe("one-tap follow-up", () => {
  const base = { firstName: "Ava", venueName: "The Larder Room", accent: "#6b2d2a", status: "contacted", eventType: "Engagement Party" };

  it("enquiry: one voice, the event type read naturally, HTML and text the same", () => {
    const m = buildOneTapFollowUpEmail(base);
    expect(m.subject).toBe("Following up on your enquiry — The Larder Room");
    expect(m.text).toBe("Hi Ava,\n\nWe wanted to see how plans for your Engagement Party are coming along. If there's anything we can help with, or details you'd like to talk through, just reply to this email.\n\nSpeak soon,\nThe Larder Room");
    expect(m.html).toContain("Here when you");
    expect(m.text).not.toMatch(/\bI\b|\bI'm\b/);
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
    for (const eventType of [null, "Other"]) {
      expect(buildOneTapFollowUpEmail({ ...base, eventType }).text).toContain("We wanted to see how your plans are coming along.");
    }
  });

  it("proposal sent: checks in on the proposal without pushing", () => {
    const m = buildOneTapFollowUpEmail({ ...base, status: "proposal_sent" });
    expect(m.subject).toBe("Following up on your proposal — The Larder Room");
    expect(m.text).toContain("We wanted to check in on the proposal we sent for your Engagement Party. If you'd like to change anything or have a question, just reply to this email and we'll talk it through.");
    expect(m.text).not.toMatch(/had a chance/);
    expect(buildOneTapFollowUpEmail({ ...base, status: "proposal_sent", eventType: null }).text).toContain("the proposal we sent. If");
    expectHouseStyle(m);
    expectTextMatchesHtml(m);
  });

  it("a custom message replaces the wording, escaped, line breaks kept", () => {
    const m = buildOneTapFollowUpEmail({ ...base, firstName: null, message: ` Line one\n${HOSTILE} ` });
    expect(m.text).toBe(`Hi there,\n\nLine one\n${HOSTILE}\n\nSpeak soon,\nThe Larder Room`);
    expect(m.html).toContain("Line one<br>&lt;img");
    expectNoInjectedMarkup(m);
    expectNoInjectedMarkup(buildOneTapFollowUpEmail({ ...base, firstName: HOSTILE, eventType: "<b>x</b>", venueName: "<b>V</b>" }));
  });
});

describe("follow-up sequence defaults", () => {
  const lead = { firstName: "Ava", lastName: "Lindqvist", email: "ava@example.test", eventType: "Engagement Party" };
  const venue = { name: "The Larder Room", primaryColor: "#6b2d2a" };
  const render = (subject: string, body: string, l: Record<string, unknown> = lead) => renderFollowUpEmail({
    subject, body, lead: l as any, venue,
    proposalLink: "https://app.example.test/proposal/tok-1", enquiryFormLink: "https://app.example.test/enquire/larder",
  });
  const wordings = SEQUENCES.flatMap(def => [
    { key: def.key, subject: def.defaults.subject, body: def.defaults.body },
    ...(def.defaults.secondSubject ? [{ key: `${def.key} (second)`, subject: def.defaults.secondSubject, body: def.defaults.secondBody! }] : []),
  ]);

  it.each(wordings)("$key: house style, one voice, every variable filled", ({ subject, body }) => {
    const m = render(subject, body);
    expect(m.subject).toMatch(/ — The Larder Room$/);
    expect(m.text).toMatch(/^Hi Ava,\n\n/);
    expect(m.text).toMatch(/\n\n(Speak soon|All the best),\nThe Larder Room$/);
    expect(m.text).not.toMatch(/\{\{|\bI\b|\bI'm\b|\bme\b/);
    expect(subject).not.toContain("{{eventType}}");
    expectHouseStyle(m);
    // Missing details read naturally.
    const bare = render(subject, body, { email: "ava@example.test", eventType: "Other" });
    expect(bare.text).toMatch(/^Hi there,/);
    expect(bare.text).not.toMatch(/your Other|your \s/);
  });

  it("keeps each sequence's job and the links the job relies on", () => {
    const d = (k: keyof typeof SEQUENCE_BY_KEY) => SEQUENCE_BY_KEY[k].defaults;
    expect(d("enquiry_no_reply").subject).not.toMatch(/proposal|finish your enquiry/i);
    expect(d("enquiry_no_reply").secondBody).toContain("this is our last check-in");
    expect(d("proposal_viewed").subject).toMatch(/proposal/i);
    expect(render(d("proposal_viewed").subject, d("proposal_viewed").body).text).toContain("Here it is again:\nhttps://app.example.test/proposal/tok-1\n");
    expect(render(d("proposal_expiring").subject, d("proposal_expiring").body).text).toContain("expires soon.\n\nIf you'd like to go ahead, you can accept it here:\nhttps://app.example.test/proposal/tok-1\n");
    expect(d("partial_form").subject).toMatch(/finish your enquiry/i);
    expect(d("partial_form").subject).not.toMatch(/proposal/i);
    expect(render(d("partial_form").subject, d("partial_form").body).text).toContain("It only takes a minute:\nhttps://app.example.test/enquire/larder\n");
    expect(d("partial_form").body).toContain("your date and guest numbers");
    expect(d("quiet_lead").subject).toContain("Still thinking");
  });

  it("escapes what was typed", () => {
    const def = SEQUENCE_BY_KEY.enquiry_no_reply.defaults;
    expectNoInjectedMarkup(render(def.subject, def.body, { firstName: HOSTILE, eventType: "<b>x</b>" }));
  });

  it("wording the venue wrote fills {{eventType}} exactly as before", () => {
    const own = render("About your {{eventType}} — {{venueName}}", "Hi {{firstName}},\n\nHow is your {{eventType}} coming along?", { firstName: "Ava", eventType: "Other" });
    expect(own.subject).toBe("About your Other — The Larder Room");
    expect(own.text).toContain("How is your Other coming along?");
    expect(render("Hi", "Your {{eventType}}", { firstName: "Ava", eventType: " " }).text).toBe("Your event");
  });
});

describe("saved sequences holding an earlier default", () => {
  it("read as today's default, so venues that switched one on get the new wording", () => {
    const old = LEGACY_SEQUENCE_DEFAULTS;
    const saved = {
      enquiry_no_reply: {
        enabled: true, enabledAt: "2026-06-01T00:00:00.000Z", delay: 4,
        subject: old.enquiry_no_reply.subject![0],
        // As stored from a Windows textarea, with a stray trailing space.
        body: old.enquiry_no_reply.body![0].replace(/\n/g, "\r\n") + " ",
        secondEnabled: true, secondDelay: 9,
        secondSubject: old.enquiry_no_reply.secondSubject![0], secondBody: old.enquiry_no_reply.secondBody![0],
      },
      proposal_viewed: { subject: old.proposal_viewed.subject![0], body: old.proposal_viewed.body![0] },
      proposal_expiring: { body: old.proposal_expiring.body![0] },
      partial_form: { subject: old.partial_form.subject![0], body: old.partial_form.body![0] },
      quiet_lead: { body: old.quiet_lead.body![0] },
    };
    const s = readSequenceSettings(saved);
    for (const def of SEQUENCES) {
      expect(s[def.key].subject).toBe(def.defaults.subject);
      expect(s[def.key].body).toBe(def.defaults.body);
    }
    expect(s.enquiry_no_reply.secondSubject).toBe(SEQUENCE_BY_KEY.enquiry_no_reply.defaults.secondSubject);
    expect(s.enquiry_no_reply.secondBody).toBe(SEQUENCE_BY_KEY.enquiry_no_reply.defaults.secondBody);
    // Everything else the venue chose is untouched.
    expect(s.enquiry_no_reply).toMatchObject({ enabled: true, enabledAt: "2026-06-01T00:00:00.000Z", delay: 4, secondEnabled: true, secondDelay: 9 });
  });

  it("wording the venue wrote is kept, even one word off the old default", () => {
    const edited = LEGACY_SEQUENCE_DEFAULTS.quiet_lead.body![0].replace("Are you still planning it?", "Still keen?");
    const s = readSequenceSettings({ quiet_lead: { subject: "Thinking of you — {{venueName}}", body: edited } });
    expect(s.quiet_lead.subject).toBe("Thinking of you — {{venueName}}");
    expect(s.quiet_lead.body).toBe(edited);
  });

  it("saving one sequence stores today's defaults for the others", () => {
    const legacyMap = { partial_form: { subject: LEGACY_SEQUENCE_DEFAULTS.partial_form.subject![0], body: LEGACY_SEQUENCE_DEFAULTS.partial_form.body![0] } };
    const next = applySequenceUpdate(readSequenceSettings(legacyMap), "quiet_lead", { enabled: true }, new Date("2026-11-26T00:00:00Z"));
    expect(next.partial_form.body).toBe(SEQUENCE_BY_KEY.partial_form.defaults.body);
  });

  it("no earlier default is still today's default", () => {
    for (const def of SEQUENCES) {
      const old = LEGACY_SEQUENCE_DEFAULTS[def.key];
      expect(old.subject ?? []).not.toContain(def.defaults.subject);
      expect(old.body ?? []).not.toContain(def.defaults.body);
    }
  });
});
