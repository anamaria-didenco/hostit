import { describe, it, expect, beforeAll, afterAll } from "vitest";
import net from "node:net";
import { eq, desc } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { leads, venueSettings, proposals, leadActivity } from "../drizzle/schema";

/**
 * What actually happens when you "send" a proposal — does the client get an
 * email? Drives the real proposals.send through a throwaway SMTP sink.
 *
 * This is the "they said they never got my proposal" bug. A proposal was
 * always marked "sent" whether or not an email left the building, so the owner
 * had no way to tell delivery from a dead letter. The send now records exactly
 * what happened (emailStatus + emailedAt + an honest activity line), and these
 * tests pin down each outcome:
 *   • SMTP not configured → not_configured, emailedAt stays null
 *   • no email on the lead → no_client_email, emailedAt stays null
 *   • SMTP up but send fails → failed, emailedAt stays null
 *   • SMTP up and reachable → emailed, emailedAt set, client actually emailed
 * In every not-emailed case the proposal is still "sent" (its link is live).
 */

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;
const OWNER = 930000 + Math.floor(Math.random() * 9999);

function ctx(): TrpcContext {
  return {
    user: {
      id: OWNER, openId: `proposal-send-${OWNER}`, email: "owner@example.com", name: "Send Test",
      loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    isTeamMember: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// A minimal SMTP sink that accepts a message and captures its DATA payload.
function startSink(): Promise<{ port: number; messages: string[]; close: () => void }> {
  const messages: string[] = [];
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      let inData = false;
      let buf = "";
      sock.write("220 sink ready\r\n");
      sock.on("data", (chunk) => {
        const s = chunk.toString();
        if (inData) {
          buf += s;
          if (buf.includes("\r\n.\r\n")) {
            messages.push(buf);
            buf = "";
            inData = false;
            sock.write("250 OK queued\r\n");
          }
          return;
        }
        for (const line of s.split("\r\n")) {
          if (!line) continue;
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === "EHLO" || cmd === "HELO") sock.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
          else if (cmd === "AUTH") sock.write("235 Authentication successful\r\n");
          else if (cmd === "MAIL") sock.write("250 OK\r\n");
          else if (cmd === "RCPT") sock.write("250 OK\r\n");
          else if (cmd === "DATA") { inData = true; sock.write("354 end with <CRLF>.<CRLF>\r\n"); }
          else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
          else sock.write("250 OK\r\n");
        }
      });
      sock.on("error", () => {});
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, messages, close: () => server.close() });
    });
  });
}

d("proposals.send — does the client actually get it (DB + SMTP sink)", () => {
  const caller = appRouter.createCaller(ctx());
  let sink: Awaited<ReturnType<typeof startSink>>;
  let leadId = 0;
  let noEmailLeadId = 0;

  beforeAll(async () => {
    sink = await startSink();
    const db = (await getDb())!;
    await db.insert(venueSettings).values({ id: OWNER as any, ownerId: OWNER, name: "Send Test Venue", slug: `send-test-${OWNER}` });
    const [lead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Dana", lastName: "Client", email: "dana.client@example.com", status: "new", source: "manual",
    }).returning();
    leadId = lead.id;
    // email is NOT NULL in the schema; an empty string is the real-world
    // "enquiry with no email" the send guards against (!lead.email).
    const [noEmailLead] = await db.insert(leads).values({
      ownerId: OWNER, firstName: "Noemail", lastName: "Client", email: "", status: "new", source: "manual",
    }).returning();
    noEmailLeadId = noEmailLead.id;
  });

  afterAll(async () => {
    sink?.close();
    const db = (await getDb())!;
    await db.delete(leadActivity).where(eq(leadActivity.ownerId, OWNER));
    await db.delete(proposals).where(eq(proposals.ownerId, OWNER));
    await db.delete(leads).where(eq(leads.ownerId, OWNER));
    await db.delete(venueSettings).where(eq(venueSettings.ownerId, OWNER));
  });

  async function makeProposal(token: string, forLead = leadId): Promise<number> {
    const db = (await getDb())!;
    const [p] = await db.insert(proposals).values({
      ownerId: OWNER, leadId: forLead, publicToken: token, title: "Dana's event proposal", status: "draft",
    }).returning();
    return p.id;
  }

  async function latestActivity(forLead: number): Promise<string> {
    const db = (await getDb())!;
    const [a] = await db.select().from(leadActivity)
      .where(eq(leadActivity.leadId, forLead)).orderBy(desc(leadActivity.id)).limit(1);
    return a?.content ?? "";
  }

  async function clearSmtp() {
    const db = (await getDb())!;
    await db.update(venueSettings).set({
      smtpHost: null, smtpUser: null, smtpPass: null, smtpPort: null, smtpSecure: null,
    }).where(eq(venueSettings.ownerId, OWNER));
  }

  async function setSmtp(host: string, port: number) {
    const db = (await getDb())!;
    await db.update(venueSettings).set({
      smtpHost: host, smtpPort: port, smtpUser: "venue@example.com",
      smtpPass: "secret", smtpSecure: 0, smtpFromName: "Send Test Venue", smtpFromEmail: "venue@example.com",
    }).where(eq(venueSettings.ownerId, OWNER));
  }

  it("NO SMTP configured: no email, marked sent but emailStatus 'not_configured' and emailedAt stays null", async () => {
    await clearSmtp();
    const id = await makeProposal(`tok-nosmtp-${OWNER}`);
    const res = await caller.proposals.send({ id });
    expect(res.success).toBe(true);
    expect(res.emailSent).toBe(false);           // ← the client was NOT emailed
    expect(res.emailedTo).toBeNull();
    expect(res.emailStatus).toBe("not_configured");

    const db = (await getDb())!;
    const [p] = await db.select().from(proposals).where(eq(proposals.id, id));
    expect(p.status).toBe("sent");               // ← yet it's marked "sent"…
    expect(p.emailedAt).toBeNull();              // ← …and honestly flagged not-emailed
    const [l] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(l.status).toBe("proposal_sent");      // ← the enquiry still moved on
    expect(sink.messages.length).toBe(0);        // nothing reached the mail server
    expect(await latestActivity(leadId)).toContain("not emailed (email isn't set up)");
  });

  it("no email on the lead: emailStatus 'no_client_email', emailedAt stays null", async () => {
    await setSmtp("127.0.0.1", sink.port);       // SMTP is fine; the lead has no address
    const id = await makeProposal(`tok-noaddr-${OWNER}`, noEmailLeadId);
    const before = sink.messages.length;
    const res = await caller.proposals.send({ id });
    expect(res.emailSent).toBe(false);
    expect(res.emailStatus).toBe("no_client_email");

    const db = (await getDb())!;
    const [p] = await db.select().from(proposals).where(eq(proposals.id, id));
    expect(p.emailedAt).toBeNull();
    expect(sink.messages.length).toBe(before);   // nothing sent
    expect(await latestActivity(noEmailLeadId)).toContain("no email address");
  });

  it("SMTP up but unreachable: emailStatus 'failed', emailedAt stays null, proposal still sent", async () => {
    // Point SMTP at a closed port so the send throws a real delivery error.
    const dead = await new Promise<number>((resolve) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
    });
    await setSmtp("127.0.0.1", dead);
    const id = await makeProposal(`tok-fail-${OWNER}`);
    const res = await caller.proposals.send({ id });
    expect(res.emailSent).toBe(false);
    expect(res.emailStatus).toBe("failed");

    const db = (await getDb())!;
    const [p] = await db.select().from(proposals).where(eq(proposals.id, id));
    expect(p.status).toBe("sent");               // link is still live
    expect(p.emailedAt).toBeNull();              // but it was not emailed
    expect(await latestActivity(leadId)).toContain("the email failed to send");
  });

  it("SMTP configured and reachable: actually emails the client, emailStatus 'emailed', emailedAt set", async () => {
    await setSmtp("127.0.0.1", sink.port);
    const id = await makeProposal(`tok-smtp-${OWNER}`);
    const res = await caller.proposals.send({ id });
    expect(res.emailSent).toBe(true);
    expect(res.emailStatus).toBe("emailed");
    expect(res.emailedTo).toBe("dana.client@example.com");

    const db = (await getDb())!;
    const [p] = await db.select().from(proposals).where(eq(proposals.id, id));
    expect(p.emailedAt).not.toBeNull();          // ← stamped as actually emailed

    // The sink received a real message, addressed to the client, carrying the
    // link. Strip quoted-printable soft breaks (=\r\n) so a wrapped URL/line
    // doesn't hide the match.
    expect(sink.messages.length).toBeGreaterThan(0);
    const msg = sink.messages.join("\n").replace(/=\r\n/g, "");
    expect(msg).toContain("dana.client@example.com");
    expect(msg).toContain(`/proposal/tok-smtp-${OWNER}`);
    expect(await latestActivity(leadId)).toContain("emailed to dana.client@example.com");
  });
});
