import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { handleXeroWebhook, xeroWebhookConfigured } from "./xeroWebhook";

/**
 * Xero's Intent To Receive check is a conformance test run by Xero itself: it
 * sends correctly and incorrectly signed deliveries and fails the endpoint
 * unless correct ones get 200 (empty body) and incorrect ones get 401. These
 * tests are that check, run locally.
 */

const KEY = "test-signing-key-1234";
const sign = (body: string, key = KEY) => crypto.createHmac("sha256", key).update(body).digest("base64");

function fakeReqRes(body: string, signature: string | undefined) {
  const req: any = {
    body: Buffer.from(body),
    header: (name: string) => (name.toLowerCase() === "x-xero-signature" ? signature : undefined),
  };
  let status = 0; let ended = false; let payload: any = undefined;
  const res: any = {
    status(code: number) { status = code; return res; },
    end(p?: any) { ended = true; payload = p; return res; },
  };
  return { req, res, result: () => ({ status, ended, payload }) };
}

describe("Xero webhook signature contract", () => {
  const prior = process.env.XERO_WEBHOOK_KEY;
  beforeEach(() => { process.env.XERO_WEBHOOK_KEY = KEY; });
  afterEach(() => { process.env.XERO_WEBHOOK_KEY = prior; });

  it("accepts a correctly signed delivery with 200 and an EMPTY body", async () => {
    const body = JSON.stringify({ events: [], firstEventSequence: 0, lastEventSequence: 0, entropy: "abc" });
    const { req, res, result } = fakeReqRes(body, sign(body));
    await handleXeroWebhook(req, res);
    expect(result().status).toBe(200);
    expect(result().payload).toBeUndefined(); // any body fails the ITR check
  });

  it("rejects a wrong signature with 401", async () => {
    const body = JSON.stringify({ events: [] });
    const { req, res, result } = fakeReqRes(body, sign(body, "some-other-key"));
    await handleXeroWebhook(req, res);
    expect(result().status).toBe(401);
  });

  it("rejects a missing signature header with 401", async () => {
    const body = JSON.stringify({ events: [] });
    const { req, res, result } = fakeReqRes(body, undefined);
    await handleXeroWebhook(req, res);
    expect(result().status).toBe(401);
  });

  it("rejects everything when no key is configured", async () => {
    delete process.env.XERO_WEBHOOK_KEY;
    const body = JSON.stringify({ events: [] });
    const { req, res, result } = fakeReqRes(body, sign(body));
    await handleXeroWebhook(req, res);
    expect(result().status).toBe(401);
    expect(xeroWebhookConfigured()).toBe(false);
  });

  it("the signature covers the RAW bytes — a reserialised body must fail", async () => {
    // Same JSON value, different whitespace. If the handler ever re-serialises
    // the parsed payload before checking, this passes and real deliveries fail.
    const sent = '{ "events" : [ ] }';
    const reserialised = JSON.stringify(JSON.parse(sent));
    expect(sent).not.toBe(reserialised);
    const ok = fakeReqRes(sent, sign(sent));
    await handleXeroWebhook(ok.req, ok.res);
    expect(ok.result().status).toBe(200);
    const bad = fakeReqRes(sent, sign(reserialised));
    await handleXeroWebhook(bad.req, bad.res);
    expect(bad.result().status).toBe(401);
  });

  it("still answers 200 to a signed delivery whose payload it cannot parse", async () => {
    // The HTTP contract comes first; the hourly sync is the safety net.
    const body = "this is not json";
    const { req, res, result } = fakeReqRes(body, sign(body));
    await handleXeroWebhook(req, res);
    expect(result().status).toBe(200);
  });

  it("reports configured only when the key is set", () => {
    process.env.XERO_WEBHOOK_KEY = " ";
    expect(xeroWebhookConfigured()).toBe(false);
    process.env.XERO_WEBHOOK_KEY = KEY;
    expect(xeroWebhookConfigured()).toBe(true);
  });
});
