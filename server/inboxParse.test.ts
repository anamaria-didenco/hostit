import { describe, expect, it } from "vitest";
import {
  classifyInbound, guessImapHost, leadIdFromMessageId, makeLeadMessageId, matchLead,
  parseRawEmail, referencedMessageIds, snippet, stripQuotedReply, type LeadLookups,
} from "./inboxParse";

import { CRLF, FIXTURES } from "./__fixtures__/inboxEmails";

const OWN = ["events@barfranco.nz"];

describe("parseRawEmail", () => {
  it("reads the headers we thread on, lower-cases the sender", async () => {
    const m = await parseRawEmail(FIXTURES.threadedReply);
    expect(m.messageId).toBe("<CAF1234reply@mail.gmail.com>");
    expect(m.inReplyTo).toBe("<vf-lead-42-abcDEF123@barfranco.nz>");
    expect(m.references).toEqual(["<vf-lead-41-old@barfranco.nz>", "<vf-lead-42-abcDEF123@barfranco.nz>"]);
    expect(m.fromEmail).toBe("sam.smith@gmail.com");
    expect(m.fromName).toBe("Sam Smith");
    expect(m.subject).toBe("Re: Your event enquiry — Birthday");
    expect(m.text).toContain("Saturday the 14th");
  });

  it("lists attachments by name only", async () => {
    const m = await parseRawEmail(FIXTURES.outlookReply);
    expect(m.attachments).toEqual([{ filename: "signed-proposal.pdf", size: expect.any(Number), contentType: "application/pdf" }]);
  });
});

describe("classifyInbound", () => {
  it("accepts a real reply", async () => {
    expect(classifyInbound(await parseRawEmail(FIXTURES.threadedReply), OWN)).toBe("ok");
    expect(classifyInbound(await parseRawEmail(FIXTURES.senderMatch), OWN)).toBe("ok");
  });
  it("ignores out-of-office replies", async () => {
    expect(classifyInbound(await parseRawEmail(FIXTURES.outOfOffice), OWN)).toBe("auto_reply");
    expect(classifyInbound(await parseRawEmail(FIXTURES.outOfOfficeBySubject), OWN)).toBe("auto_reply");
  });
  it("ignores bounces", async () => {
    expect(classifyInbound(await parseRawEmail(FIXTURES.bounce), OWN)).toBe("bounce");
  });
  it("ignores our own copies", async () => {
    expect(classifyInbound(await parseRawEmail(FIXTURES.ownCopy), ["EVENTS@barfranco.nz"])).toBe("own");
  });
  it("ignores list mail", async () => {
    const m = await parseRawEmail(CRLF(`From: news@shop.example\nTo: events@barfranco.nz\nSubject: Sale\nList-Id: <news.shop.example>\nMessage-ID: <n1@shop.example>\n\nSale on`));
    expect(classifyInbound(m, OWN)).toBe("bulk");
  });
});

describe("stripQuotedReply", () => {
  it("drops Gmail's wrapped 'On … wrote:' history", async () => {
    const m = await parseRawEmail(FIXTURES.threadedReply);
    const body = stripQuotedReply(m.text);
    expect(body).toBe("Hi Ana,\n\nSaturday the 14th works for us. Can we bring our own cake?\n\nThanks,\nSam");
  });
  it("drops Outlook's From:/Sent: block", async () => {
    const m = await parseRawEmail(FIXTURES.outlookReply);
    expect(stripQuotedReply(m.text)).toBe("Looks good — signed copy attached.");
  });
  it("handles single-line 'On … wrote:' and > quotes", () => {
    expect(stripQuotedReply("Yes please\n\nOn Tue, 6 Oct 2026, Ana wrote:\n> Shall we?")).toBe("Yes please");
    expect(stripQuotedReply("> quoted only\nreply below")).toBe("reply below");
  });
  it("falls back to the whole text if trimming leaves nothing", () => {
    expect(stripQuotedReply("> only a quote")).toBe("> only a quote");
  });
  it("caps length", () => {
    expect(stripQuotedReply("x".repeat(50_000)).length).toBe(20_000);
  });
});

describe("message ids", () => {
  it("makes stable lead message ids on the sender's domain", () => {
    const id = makeLeadMessageId(42, "Events@BarFranco.nz");
    expect(id).toMatch(/^<vf-lead-42-[A-Za-z0-9_-]+@barfranco\.nz>$/);
    expect(leadIdFromMessageId(id)).toBe(42);
    expect(makeLeadMessageId(null, "")).toMatch(/^<vf-[A-Za-z0-9_-]+@venueflowhq\.com>$/);
    expect(leadIdFromMessageId("<CAF123@mail.gmail.com>")).toBeNull();
  });
  it("orders references most-direct first", async () => {
    const m = await parseRawEmail(FIXTURES.threadedReply);
    expect(referencedMessageIds(m)).toEqual(["<vf-lead-42-abcDEF123@barfranco.nz>", "<vf-lead-41-old@barfranco.nz>"]);
  });
});

describe("matchLead", () => {
  const lookups = (over: Partial<LeadLookups> = {}): LeadLookups => ({
    leadIdForMessageIds: async () => null,
    leadExists: async () => false,
    openLeadIdForEmail: async () => null,
    ...over,
  });

  it("matches a reply by In-Reply-To against messages we sent", async () => {
    const m = await parseRawEmail(FIXTURES.threadedReply);
    const seen: string[][] = [];
    const r = await matchLead(m, lookups({ leadIdForMessageIds: async ids => { seen.push(ids); return ids.includes("<vf-lead-42-abcDEF123@barfranco.nz>") ? 42 : null; } }));
    expect(r).toEqual({ leadId: 42, by: "thread" });
    expect(seen[0][0]).toBe("<vf-lead-42-abcDEF123@barfranco.nz>");
  });

  it("falls back to the lead id in our own Message-ID format", async () => {
    const m = await parseRawEmail(FIXTURES.threadedReply);
    const r = await matchLead(m, lookups({ leadExists: async id => id === 42 }));
    expect(r).toEqual({ leadId: 42, by: "thread" });
  });

  it("matches by sender email when there are no threading headers", async () => {
    const m = await parseRawEmail(FIXTURES.senderMatch);
    const r = await matchLead(m, lookups({ openLeadIdForEmail: async e => e === "sam.smith@gmail.com" ? 7 : null }));
    expect(r).toEqual({ leadId: 7, by: "sender" });
  });

  it("returns null for mail from nobody we know", async () => {
    const m = await parseRawEmail(FIXTURES.unmatched);
    expect(await matchLead(m, lookups())).toBeNull();
  });
});

describe("helpers", () => {
  it("snippets collapse whitespace and cut cleanly", () => {
    expect(snippet("a\n\n  b", 10)).toBe("a b");
    expect(snippet("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`);
  });
  it("guesses the IMAP server from the SMTP one", () => {
    expect(guessImapHost("smtp.gmail.com")).toBe("imap.gmail.com");
    expect(guessImapHost("smtp.office365.com")).toBe("outlook.office365.com");
    expect(guessImapHost("smtp.fastmail.com")).toBe("imap.fastmail.com");
    expect(guessImapHost("")).toBe("");
  });
});
