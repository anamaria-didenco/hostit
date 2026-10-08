/**
 * Proof that a public caller is the same visitor who created a lead.
 *
 * The public enquiry form needs to come back to "its" lead a second time
 * (startCapture → submit, submit → bookWalkthrough). Lead ids are sequential
 * and the venue's ownerId is public, so an id alone proves nothing — anyone
 * could otherwise overwrite any enquiry. The server hands the visitor an
 * HMAC of (ownerId, leadId) with the lead, and only accepts follow-up writes
 * that carry it back.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { ENV } from "./_core/env";

export function leadAccessToken(ownerId: number, leadId: number): string {
  return createHmac("sha256", ENV.cookieSecret)
    .update(`lead-access:${ownerId}:${leadId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function isValidLeadAccessToken(ownerId: number, leadId: number, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(leadAccessToken(ownerId, leadId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
