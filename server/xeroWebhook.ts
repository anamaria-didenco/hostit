/**
 * Xero webhook receiver — the instant path from "approved in Xero" to the
 * Payments board saying so. The hourly sync stays as the floor under it;
 * webhooks are best-effort delivery, never the only mechanism.
 *
 * Xero's contract (and it is strict — the portal's Intent To Receive check
 * fails the endpoint on any deviation):
 *   - Every delivery carries `x-xero-signature`: base64 HMAC-SHA256 of the RAW
 *     request body, keyed with the app's webhook signing key.
 *   - Correctly signed  → respond 200 with an EMPTY body.
 *   - Incorrectly signed → respond 401. The ITR check sends deliberately bad
 *     signatures to prove we reject them.
 *   - Respond within 5 seconds, over HTTPS, no redirects. So the work happens
 *     AFTER the response, never before it.
 *
 * Config: XERO_WEBHOOK_KEY (Render env) — the "Webhooks key" shown on the app's
 * Webhooks page at developer.xero.com after saving a Delivery URL.
 */
import type { Request, Response } from "express";
import crypto from "crypto";
import { getDb } from "./db";
import { xeroConnections } from "../drizzle/schema";
import { syncXeroInvoicesForOwner } from "./xeroSync";

/** Verify the signature over the raw bytes. Raw means raw: re-serialising the
 *  parsed JSON changes whitespace and the HMAC with it, which is why this route
 *  is mounted with express.raw() ahead of the app's JSON parser. */
function signatureValid(rawBody: Buffer, header: string | undefined, key: string): boolean {
  if (!header) return false;
  const expected = crypto.createHmac("sha256", key).update(rawBody).digest("base64");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// One sync per owner per burst: Xero sends an event per invoice change and a
// busy approval session produces a flurry. Each owner's sync is debounced a
// few seconds and never runs concurrently with itself.
const pending = new Map<number, ReturnType<typeof setTimeout>>();
const inFlight = new Set<number>();
function queueSync(ownerId: number): void {
  const existing = pending.get(ownerId);
  if (existing) clearTimeout(existing);
  pending.set(ownerId, setTimeout(async () => {
    pending.delete(ownerId);
    if (inFlight.has(ownerId)) { queueSync(ownerId); return; }
    inFlight.add(ownerId);
    try {
      const r = await syncXeroInvoicesForOwner(ownerId);
      if (r.statusChanges > 0 || r.paymentsImported > 0) {
        console.log(`[XeroWebhook] owner ${ownerId}: ${r.statusChanges} status change(s), ${r.paymentsImported} payment(s) imported`);
      }
    } catch (err: any) {
      console.warn(`[XeroWebhook] sync for owner ${ownerId} failed:`, err?.message ?? err);
    } finally {
      inFlight.delete(ownerId);
    }
  }, 3000));
}

export function xeroWebhookConfigured(): boolean {
  return Boolean(process.env.XERO_WEBHOOK_KEY?.trim());
}

/** POST /api/xero/webhook — mounted with express.raw(). */
export async function handleXeroWebhook(req: Request, res: Response): Promise<void> {
  const key = process.env.XERO_WEBHOOK_KEY?.trim();
  // Without the key nothing can be verified, so nothing is accepted. 401 is
  // also what the ITR check needs to see from an endpoint that can't validate.
  if (!key) { res.status(401).end(); return; }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!signatureValid(raw, req.header("x-xero-signature"), key)) {
    res.status(401).end();
    return;
  }

  // Signed and accepted. Xero wants the 200 (empty body) inside 5 seconds, so
  // it goes out before any database work.
  res.status(200).end();

  try {
    const payload = JSON.parse(raw.toString("utf8"));
    const events: any[] = Array.isArray(payload?.events) ? payload.events : [];
    const tenantIds = [...new Set(
      events
        .filter(e => e?.eventCategory === "INVOICE" && e?.tenantId)
        .map(e => String(e.tenantId)),
    )];
    if (tenantIds.length === 0) return; // ITR pings and non-invoice events

    const db = await getDb();
    if (!db) return;
    const { inArray } = await import("drizzle-orm");
    const owners = await db.select({ ownerId: xeroConnections.ownerId, tenantId: xeroConnections.tenantId })
      .from(xeroConnections)
      .where(inArray(xeroConnections.tenantId, tenantIds));
    for (const o of owners) queueSync(o.ownerId);
  } catch (err: any) {
    // The 200 has already gone out — correctness of the HTTP contract first.
    // A payload we couldn't parse is logged and the hourly sync covers it.
    console.warn("[XeroWebhook] payload handling failed:", err?.message ?? err);
  }
}
