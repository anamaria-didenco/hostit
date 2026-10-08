/**
 * Proposal → accept / decline → booking → contract signing through the portal.
 * Pure wording/logic tests run anywhere; the end-to-end cases need the DB.
 */
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import { bookings, clientPortalTokens, contracts, leadActivity, leads, proposals, venueNotifications } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { buildAcceptConfirmationEmail, isProposalExpired } from "./proposalResponses";
import { contractBodyHtml, isContractExpired } from "./clientPortal";
import { expireOverdueProposals } from "./proposalExpiry";
import { selectedDrinkItems, drinkPriceLabel, DRINKS_BY_KEY } from "../shared/drinksMenu";

const ctxFor = (user: TrpcContext["user"]): TrpcContext => ({
  user,
  isTeamMember: false,
  req: { protocol: "https", headers: {}, ip: "203.0.113.7" } as TrpcContext["req"],
  res: { clearCookie: () => {} } as TrpcContext["res"],
});
const owner = appRouter.createCaller(ctxFor({
  id: 1, openId: "test-owner-001", email: "owner@venue.co.nz", name: "Owner", loginMethod: "manus",
  role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
} as any));
const client = appRouter.createCaller(ctxFor(null));

describe("pure helpers", () => {
  it("isProposalExpired compares against now", () => {
    const now = Date.parse("2026-10-08T00:00:00Z");
    expect(isProposalExpired({ expiresAt: null }, now)).toBe(false);
    expect(isProposalExpired({ expiresAt: new Date(now - 1) }, now)).toBe(true);
    expect(isProposalExpired({ expiresAt: new Date(now + 1) }, now)).toBe(false);
  });

  it("isContractExpired handles bigint-ms and empty", () => {
    expect(isContractExpired({ expiresAt: null })).toBe(false);
    expect(isContractExpired({ expiresAt: Date.now() - 1000 })).toBe(true);
    expect(isContractExpired({ expiresAt: Date.now() + 60_000 })).toBe(false);
  });

  it("contract bodies: plain text stays text, HTML is sanitised", () => {
    expect(contractBodyHtml("1. The hirer agrees <to pay> on time")).toBeNull();
    const html = contractBodyHtml(`<p>Terms</p><script>alert(1)</script><a href="javascript:x">x</a>`)!;
    expect(html).toContain("<p>Terms</p>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("javascript:");
  });

  it("the PDF's drinks come from the builder's keys", () => {
    const picked = selectedDrinkItems(["classic_negroni", "aperol_spritz", "no_longer_on_menu"]);
    expect(picked.map(d => d.name)).toEqual(["Aperol Spritz", "Classic Negroni"]);
    expect(drinkPriceLabel(DRINKS_BY_KEY.tallero_prosecco)).toBe("$17 glass · $85 bottle");
    expect(drinkPriceLabel(DRINKS_BY_KEY.cola)).toBe("$8");
  });

  it("the proposal PDF lists the drinks picked in the builder", async () => {
    const { buildHtml } = await import("./proposalPdf");
    const html = buildHtml({
      proposal: { title: "P", lineItems: "[]", subtotalNzd: "0", taxNzd: "0", totalNzd: "0" },
      lead: null, venue: null, quoteData: null,
      drinks: { barOption: "bar_tab", selectedDrinks: ["aperol_spritz", "chianti"], customDrinks: [] },
    });
    expect(html).toContain("Aperol Spritz — $20");
    expect(html).toContain("Renzo Masi Chianti Cornioletta — $17 glass · $85 bottle");
  });

  const base = {
    venueName: "Bar Franco", fromName: "Bar Franco Events", clientFirstName: "Sam",
    proposalTitle: "Birthday Proposal", eventDate: new Date("2026-12-04T00:00:00Z"), guestCount: 40,
    spaceName: "Upstairs", totalNzd: 5750, depositNzd: 0, paymentInstructions: null, hasContract: false,
    proposalUrl: "https://venueflowhq.com/proposal/abc", portalUrl: null,
  };

  it("accept email: summary, and no deposit/contract promises when there are none", () => {
    const m = buildAcceptConfirmationEmail(base);
    expect(m.subject).toBe("You're booked in — Birthday Proposal");
    expect(m.text).toContain("Friday, 4 December 2026");
    expect(m.text).toContain("Guests: 40");
    expect(m.text).toContain("$5,750.00");
    expect(m.text).not.toMatch(/deposit/i);
    expect(m.text).not.toMatch(/contract/i);
    expect(m.text).toContain("nothing you need to do right now");
  });

  it("accept email: mentions the deposit (with how to pay) and contract only when they exist", () => {
    const m = buildAcceptConfirmationEmail({ ...base, depositNzd: 1437.5, paymentInstructions: "ANZ 01-0000-0000000-00", hasContract: true, portalUrl: "https://venueflowhq.com/portal/p" });
    expect(m.text).toContain("A deposit of $1,437.50 secures your date. How to pay:\nANZ 01-0000-0000000-00");
    expect(m.text).toContain("contract to read and sign online");
    expect(m.text).toContain("Your event page: https://venueflowhq.com/portal/p");
  });

  it("accept email escapes client-supplied values in HTML", () => {
    const m = buildAcceptConfirmationEmail({ ...base, clientFirstName: "<img src=x onerror=alert(1)>" });
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img");
  });
});

// ─── End to end (needs the DB) ───────────────────────────────────────────────
const made = { leads: [] as number[], proposals: [] as number[], bookings: [] as number[], contracts: [] as number[], portal: [] as number[] };

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  if (made.contracts.length) await db.delete(contracts).where(inArray(contracts.id, made.contracts));
  if (made.bookings.length) {
    await db.delete(clientPortalTokens).where(inArray(clientPortalTokens.bookingId, made.bookings));
    await db.delete(bookings).where(inArray(bookings.id, made.bookings));
  }
  if (made.proposals.length) await db.delete(proposals).where(inArray(proposals.id, made.proposals));
  if (made.leads.length) {
    await db.delete(venueNotifications).where(inArray(venueNotifications.leadId, made.leads));
    await db.delete(leadActivity).where(inArray(leadActivity.leadId, made.leads));
    await db.delete(leads).where(inArray(leads.id, made.leads));
  }
});

async function newLead(tag: string) {
  const lead = await owner.leads.submit({ ownerId: 1, firstName: "Flow", lastName: tag, email: `flow-${tag}-${Date.now()}@example.com`, eventType: "Birthday", guestCount: 30 });
  made.leads.push(lead.id);
  return lead;
}
async function newProposal(leadId: number, extra: Record<string, any> = {}) {
  const p = await owner.proposals.create({ leadId, title: `Flow proposal ${Date.now()}`, totalNzd: 1150, depositNzd: 287.5, ...extra });
  made.proposals.push(p!.id);
  return p!;
}

describe("proposal → accept/decline → contract (DB)", async () => {
  const db = await getDb();
  const run = db ? it : it.skip;

  run("first open alerts the venue once; accept validates the space BEFORE marking accepted", async () => {
    const lead = await newLead("accept");
    const p = await newProposal(lead.id); // no space yet
    await owner.proposals.send({ id: p.id });

    await client.proposals.getByToken({ token: p.publicToken });
    await client.proposals.getByToken({ token: p.publicToken });
    const [viewed] = await db!.select().from(proposals).where(eq(proposals.id, p.id));
    expect(viewed.status).toBe("viewed");
    expect(viewed.viewedAt).toBeTruthy();
    const alerts = await db!.select().from(venueNotifications).where(eq(venueNotifications.dedupeKey, `proposal_viewed:${p.id}`));
    expect(alerts).toHaveLength(1);
    const acts = await db!.select().from(leadActivity).where(eq(leadActivity.leadId, lead.id));
    expect(acts.some(a => a.content?.includes("opened proposal"))).toBe(true);

    await expect(client.proposals.respond({ token: p.publicToken, action: "accepted" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const [still] = await db!.select().from(proposals).where(eq(proposals.id, p.id));
    expect(still.status).toBe("viewed");
    expect(await db!.select().from(bookings).where(eq(bookings.proposalId, p.id))).toHaveLength(0);

    await owner.proposals.update({ id: p.id, spaceName: "Main Function Room" });
    const res = await client.proposals.respond({ token: p.publicToken, action: "accepted", clientMessage: "See you then" });
    expect(res.status).toBe("accepted");
    expect(res.confirmationEmailed).toBe(false); // no SMTP locally — reported honestly
    const bk = await db!.select().from(bookings).where(eq(bookings.proposalId, p.id));
    expect(bk).toHaveLength(1);
    made.bookings.push(bk[0].id);
    const [l] = await db!.select().from(leads).where(eq(leads.id, lead.id));
    expect(l.status).toBe("booked");
    expect(await db!.select().from(venueNotifications).where(eq(venueNotifications.dedupeKey, `proposal_accepted:${p.id}`))).toHaveLength(1);

    // A second answer is refused and creates nothing.
    await expect(client.proposals.respond({ token: p.publicToken, action: "accepted" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db!.select().from(bookings).where(eq(bookings.proposalId, p.id))).toHaveLength(1);
  });

  run("decline stores the reason, moves the lead to lost and tells the venue", async () => {
    const lead = await newLead("decline");
    const p = await newProposal(lead.id, { spaceName: "Main Function Room" });
    await owner.proposals.send({ id: p.id });
    await client.proposals.respond({ token: p.publicToken, action: "declined", declineReason: "Found somewhere closer to home" });
    const [row] = await db!.select().from(proposals).where(eq(proposals.id, p.id));
    expect(row.status).toBe("declined");
    expect(row.declineReason).toBe("Found somewhere closer to home");
    const [l] = await db!.select().from(leads).where(eq(leads.id, lead.id));
    expect(l.status).toBe("lost");
    const acts = await db!.select().from(leadActivity).where(eq(leadActivity.leadId, lead.id));
    expect(acts.some(a => a.content?.includes("Found somewhere closer to home"))).toBe(true);
    const [n] = await db!.select().from(venueNotifications).where(eq(venueNotifications.dedupeKey, `proposal_declined:${p.id}`));
    expect(n.body).toContain("Found somewhere closer to home");
  });

  run("an expired proposal can't be answered, and the job marks it expired", async () => {
    const lead = await newLead("expiry");
    const p = await newProposal(lead.id, { spaceName: "Main Function Room" });
    await owner.proposals.send({ id: p.id });
    await db!.update(proposals).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(proposals.id, p.id));
    await expect(client.proposals.respond({ token: p.publicToken, action: "accepted" })).rejects.toThrow(/expired/);
    await expireOverdueProposals();
    const [row] = await db!.select().from(proposals).where(eq(proposals.id, p.id));
    expect(row.status).toBe("expired");
    // Re-running changes nothing.
    await expireOverdueProposals();
    expect((await db!.select().from(proposals).where(eq(proposals.id, p.id)))[0].status).toBe("expired");
  });

  run("a contract is sent to the booking's portal, read and signed there, and recorded", async () => {
    const lead = await newLead("contract");
    const p = await newProposal(lead.id, { spaceName: "Main Function Room" });
    await owner.proposals.send({ id: p.id });
    await client.proposals.respond({ token: p.publicToken, action: "accepted" });
    const [bk] = await db!.select().from(bookings).where(eq(bookings.proposalId, p.id));
    made.bookings.push(bk.id);

    const c = await owner.contracts.create({ title: "Venue hire agreement", body: "1. Be nice.\n2. Pay the deposit.", bookingId: bk.id, clientName: "Flow contract", clientEmail: bk.email });
    made.contracts.push(c.id);
    const sent = await owner.contracts.send({ id: c.id });
    expect(sent.emailSent).toBe(false);
    expect(sent.reason).toBe("smtp_not_configured");
    const token = sent.link.split("/portal/")[1];
    expect(token).toBeTruthy();

    // The portal (made from the booking only) finds the proposal via the booking's lead.
    const portal = await client.portal.getByToken({ token });
    expect(portal.proposal?.id).toBe(p.id);
    expect((portal.proposal as any)?.internalNotes).toBeUndefined();
    expect(portal.contracts.map(x => x.id)).toContain(c.id);
    expect(portal.contracts.find(x => x.id === c.id)!.bodyText).toContain("Pay the deposit");

    await client.portal.signContract({ token, contractId: c.id, signerName: "Flow Contract", agreed: true });
    const [signed] = await db!.select().from(contracts).where(eq(contracts.id, c.id));
    expect(signed.status).toBe("signed");
    expect(signed.signerName).toBe("Flow Contract");
    expect(signed.signerIp).toBeTruthy();
    expect(Number(signed.signedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(await db!.select().from(venueNotifications).where(and(eq(venueNotifications.dedupeKey, `contract_signed:${c.id}`), eq(venueNotifications.ownerId, 1)))).toHaveLength(1);

    // Signing twice, or with a token that matches nothing, fails loudly.
    await expect(client.portal.signContract({ token, contractId: c.id, signerName: "Flow Contract", agreed: true })).rejects.toThrow(/already been signed/);
    await expect(client.contracts.sign({ token: "no-such-contract-token", signerName: "X", signatureData: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db!.delete(venueNotifications).where(eq(venueNotifications.dedupeKey, `contract_signed:${c.id}`));
  });
});
