import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

/**
 * The client emails through their real send paths (routers, walkthroughs,
 * the event page link), with nodemailer stubbed so nothing leaves the
 * machine. clientEmailWording.test.ts covers the wording builders; this
 * covers the wiring around them: the venue's own auto-reply line still wins
 * over the default, each email gets the booking's own figures, and the
 * recipients, BCC, reply-to and attachments are what they have always been.
 * Runs under a throwaway ownerId and cleans up. Skipped without DATABASE_URL.
 */
const { sent } = vi.hoisted(() => ({ sent: [] as any[] }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      verify: async () => true,
      sendMail: async (msg: any) => { sent.push(msg); return { messageId: `stub-${sent.length}` }; },
    }),
  },
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { requestWalkthrough, confirmWalkthrough } from "./enquiryForm";
import { emailPortalLink } from "./clientPortal";
import { DEFAULT_AUTO_REPLY_INTRO } from "@shared/enquiryCopy";
import {
  leads, leadActivity, venueSettings, proposals, bookings, payments, clientPortalTokens, tasks, venueNotifications, leadMessages,
} from "../drizzle/schema";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 1020000 + Math.floor(Math.random() * 9999);
const BASE = "https://app.larder.example.test";
const VENUE = "The Larder Room";
const FROM = `"Larder Events" <events@larder.example.test>`;
const CLIENT = `ava.${OWNER}@example.test`;
const CLIENT2 = `ben.${OWNER}@example.test`;
const NOTIFY = ["owner@larder.example.test", "second@larder.example.test"];

function caller(signedIn: boolean, ip = "10.9.0.1") {
  const ctx: TrpcContext = {
    user: signedIn ? {
      id: OWNER, openId: `client-email-send-${OWNER}`, email: "owner@larder.example.test", name: "Sample Owner",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any : null,
    isTeamMember: false,
    req: { protocol: "https", headers: {}, ip, socket: { remoteAddress: ip } } as any,
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

/** The one email that went to this client since the last call (staff alerts are ignored). */
function clientMail(to = CLIENT) {
  const mine = sent.filter(m => String(m.to).includes(to));
  sent.length = 0;
  expect(mine, `one email to ${to}`).toHaveLength(1);
  return mine[0];
}

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  const ids = (await db.select({ id: leads.id }).from(leads).where(eq(leads.ownerId, OWNER))).map(r => r.id);
  if (ids.length) {
    await db.delete(leadActivity).where(inArray(leadActivity.leadId, ids));
    await db.delete(venueNotifications).where(inArray(venueNotifications.leadId, ids));
  }
  await db.delete(venueNotifications).where(eq(venueNotifications.ownerId, OWNER));
  await db.delete(leadMessages).where(eq(leadMessages.ownerId, OWNER));
  await db.delete(payments).where(eq(payments.ownerId, OWNER));
  await db.delete(clientPortalTokens).where(eq(clientPortalTokens.ownerId, OWNER));
  await db.delete(bookings).where(eq(bookings.ownerId, OWNER));
  await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
  await db.delete(tasks).where(eq(tasks.ownerId, OWNER));
  await db.delete(leads).where(eq(leads.ownerId, OWNER));
  await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
}

d("client emails through their send paths (DB, mail stubbed)", () => {
  beforeAll(async () => {
    vi.stubEnv("PUBLIC_BASE_URL", BASE);
    await cleanup();
    const db = (await getDb())!;
    // Explicit id: copied dev databases can have this sequence behind the rows.
    await db.insert(venueSettings).values({
      id: OWNER as any,
      ownerId: OWNER, name: VENUE, slug: `larder-send-${OWNER}`,
      smtpHost: "smtp.example.test", smtpUser: "events@larder.example.test", smtpPass: "x", smtpFromName: "Larder Events",
      email: "hello@larder.example.test", phone: "03 555 0142", primaryColor: "#6B2D2A",
      addressLine1: "14 Example Lane", suburb: "Harbourside", city: "Christchurch",
      paymentInstructions: "Bank transfer to 12-3456-7890123-00\nReference: your surname",
      notificationEmail: NOTIFY.join(", "),
      enquiryAutoReplyMessage: "  Our own opening line, with <b>markup</b>.  ",
    } as any);
  });
  afterAll(async () => {
    await cleanup();
    vi.unstubAllEnvs();
  });

  it("sends each client email to the right people, with the venue's wording and the booking's figures", async () => {
    const db = (await getDb())!;
    const owner = caller(true);
    sent.length = 0;

    // Enquiry auto-reply: the venue's own opening line wins, escaped in the HTML.
    const lead: any = await caller(false, "10.9.0.2").leads.submit({
      ownerId: OWNER, firstName: "Ava", lastName: "Lindqvist", email: CLIENT, phone: "021 555 0100",
      eventType: "Corporate", eventDate: "2027-03-13", dateFlexible: true, guestCount: 60,
    } as any);
    let m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: CLIENT, replyTo: "events@larder.example.test", subject: `Your enquiry is with us — ${VENUE}` });
    expect(m.bcc).toBeUndefined();
    expect(m.attachments).toBeUndefined();
    expect(m.text).toContain("Hi Ava,\n\nOur own opening line, with <b>markup</b>.\n\nEvent: Corporate\n");
    expect(m.text).not.toContain(DEFAULT_AUTO_REPLY_INTRO);
    expect(m.html).toContain("Our own opening line, with &lt;b&gt;markup&lt;/b&gt;.");
    expect(m.html).not.toContain("<b>markup");

    // Without the venue's line, the default (and its response-time promise).
    await db.update(venueSettings).set({ enquiryAutoReplyMessage: null } as any).where(eq(venueSettings.ownerId, OWNER));
    await caller(false, "10.9.0.3").leads.submit({ ownerId: OWNER, firstName: "Ben", lastName: "Okafor", email: CLIENT2 } as any);
    m = clientMail(CLIENT2);
    expect(m).toMatchObject({ from: FROM, to: CLIENT2, replyTo: "events@larder.example.test" });
    expect(m.text).toContain(`Hi Ben,\n\n${DEFAULT_AUTO_REPLY_INTRO}\n\n`);

    // Walkthrough request: the client's copy sets off the note with " · "; the
    // stored summary that staff see keeps its own wording.
    await requestWalkthrough(OWNER, lead.id, { dates: [], timeOfDay: "morning", note: "Keen to see the terrace" });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: CLIENT, replyTo: "events@larder.example.test" });
    expect(m.attachments).toBeUndefined();
    expect(m.text).toContain(`You suggested: Any day · Morning · "Keen to see the terrace"`);
    const [stored] = await db.select({ w: leads.walkthroughRequest }).from(leads).where(eq(leads.id, lead.id));
    expect(stored.w).toBe(`Any day · Morning — "Keen to see the terrace"`);

    // Walkthrough confirmed: the calendar invite is still attached.
    await confirmWalkthrough(OWNER, lead.id, new Date("2027-12-02T00:30:00Z"), { emailClient: true });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: CLIENT, replyTo: "events@larder.example.test" });
    expect(m.subject).toMatch(new RegExp(`^Your walkthrough on .+ — ${VENUE}$`));
    expect(m.attachments.map((a: any) => [a.filename, a.contentType]))
      .toEqual([["walkthrough.ics", "text/calendar; charset=utf-8; method=PUBLISH"]]);

    // One-tap follow-up: named recipient, the venue's inboxes in BCC, enquiry wording.
    await owner.leads.sendFollowUp({ leadId: lead.id });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: `"Ava Lindqvist" <${CLIENT}>`, bcc: NOTIFY, replyTo: "events@larder.example.test" });
    expect(m.subject).toBe(`Following up on your enquiry — ${VENUE}`);
    expect(m.text).toContain("We wanted to see how your plans are coming along.");
    expect(m.text).not.toContain("Corporate");

    // Proposal email, then the one-tap follow-up switches to the proposal wording.
    const [p] = await db.insert(proposals).values({
      ownerId: OWNER, leadId: lead.id, publicToken: `send-test-${OWNER}`, title: "Ava's team dinner", status: "draft",
    } as any).returning();
    await owner.proposals.send({ id: p.id });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: `"Ava Lindqvist" <${CLIENT}>`, subject: "Your proposal is ready — Ava's team dinner" });
    expect(m.bcc).toBeUndefined();
    expect(m.replyTo).toBeUndefined();
    expect(m.text).toContain(`View your proposal: ${BASE}/proposal/send-test-${OWNER}`);
    await owner.leads.sendFollowUp({ leadId: lead.id });
    m = clientMail();
    expect(m).toMatchObject({ to: `"Ava Lindqvist" <${CLIENT}>`, bcc: NOTIFY, subject: `Following up on your proposal — ${VENUE}` });
    expect(m.text).toContain("We wanted to check in on the proposal we sent.");

    // Deposit request: the booking's type, amount, how to pay and event page link.
    const [bk] = await db.insert(bookings).values({
      ownerId: OWNER, leadId: lead.id, firstName: "Ava", lastName: "Lindqvist", email: CLIENT,
      eventType: "Corporate", eventDate: new Date("2027-03-13T06:00:00Z"), guestCount: 60, spaceName: "Garden Room",
      totalNzd: "5750.00", depositNzd: "1437.50",
    } as any).returning();
    const portalToken = `send-portal-${OWNER}`;
    await db.insert(clientPortalTokens).values({
      ownerId: OWNER, bookingId: bk.id, leadId: lead.id, token: portalToken, clientName: "Ava Lindqvist", clientEmail: CLIENT,
      permissions: JSON.stringify({ viewProposal: true, viewRunsheet: false, viewBudget: true, approveProposal: true, signContract: true }),
      expiresAt: null, createdAt: Date.now(),
    } as any);
    await owner.payments.requestDeposit({ bookingId: bk.id });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: `"Ava Lindqvist" <${CLIENT}>`, subject: "Deposit details for your booking — Larder Events" });
    expect(m.bcc).toBeUndefined();
    expect(m.replyTo).toBeUndefined();
    expect(m.text).toContain("To secure your Corporate booking, we ask for a deposit of $1,437.50.");
    expect(m.text).toContain("How to pay:\nBank transfer to 12-3456-7890123-00\nReference: your surname");
    expect(m.text).toContain(`${BASE}/portal/${portalToken}`);

    // Receipts: the payment's type, amount and date, and the balance left.
    const [dep] = await db.insert(payments).values({ bookingId: bk.id, ownerId: OWNER, amount: "1437.50", type: "deposit", method: "bank_transfer", paidAt: new Date("2026-11-20T01:00:00Z") } as any).returning();
    await owner.payments.sendReceipt({ paymentId: dep.id });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: `"Ava Lindqvist" <${CLIENT}>`, subject: "We've received your deposit — Larder Events" });
    expect(m.bcc).toBeUndefined();
    expect(m.replyTo).toBeUndefined();
    expect(m.text).toContain("Thank you for your deposit of $1,437.50, received on 20 November 2026.");
    expect(m.text).toContain("Your remaining balance is $4,312.50.");
    expect(m.text).toContain(`Full details are on your event page:\n${BASE}/portal/${portalToken}`);
    const [ref] = await db.insert(payments).values({ bookingId: bk.id, ownerId: OWNER, amount: "200.00", type: "refund", method: "bank_transfer", paidAt: new Date("2026-11-22T01:00:00Z") } as any).returning();
    await owner.payments.sendReceipt({ paymentId: ref.id });
    m = clientMail();
    expect(m.subject).toBe("Confirming your refund — Larder Events");
    expect(m.text).toContain("We've refunded $200.00 to you on 22 November 2026.");
    expect(m.text).toContain("Your remaining balance is $4,512.50.");
    expect(m.text.endsWith("Speak soon,\nLarder Events")).toBe(true);
    expect(m).toMatchObject({ from: FROM, to: `"Ava Lindqvist" <${CLIENT}>` });
    expect(m.bcc).toBeUndefined();
    expect(m.replyTo).toBeUndefined();

    // Once the booking is cancelled, a refund receipt drops the balance line.
    await db.update(bookings).set({ status: "cancelled" } as any).where(eq(bookings.id, bk.id));
    await owner.payments.sendReceipt({ paymentId: ref.id });
    m = clientMail();
    expect(m.subject).toBe("Confirming your refund — Larder Events");
    expect(m.text).not.toContain("balance");
    expect(m.text.endsWith("All the best,\nLarder Events")).toBe(true);

    // Event page link and contract signing: to the client, replies to the venue.
    await emailPortalLink(OWNER, { to: CLIENT, clientName: "Ava Lindqvist", token: portalToken });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: CLIENT, replyTo: "hello@larder.example.test", subject: `Your event page — ${VENUE}` });
    expect(m.text).toContain(`${BASE}/portal/${portalToken}`);
    await emailPortalLink(OWNER, { to: CLIENT, clientName: "Ava Lindqvist", token: portalToken, contractTitle: "Venue hire agreement" });
    m = clientMail();
    expect(m).toMatchObject({ from: FROM, to: CLIENT, replyTo: "hello@larder.example.test", subject: "Your contract is ready to sign — Venue hire agreement" });
  }, 60_000);
});
