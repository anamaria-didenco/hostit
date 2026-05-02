/**
 * NowBookIt → VenueFlowHQ inbound webhook.
 *
 * NowBookIt POSTs booking events here when a booking is created, updated or
 * cancelled in their diary. Authentication is by the per-venue secret in the
 * URL path: /api/webhook/nowbookit/<secret>
 *
 * Payload shape varies by NBI account — we defensively read several common
 * field paths so the integration works without bespoke per-venue mapping.
 */

import { Request, Response } from "express";
import { getDb } from "./db";
import { bookings, venueSettings, leadActivity } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

interface NbiWebhookBody {
  event?: string;
  type?: string;
  action?: string;
  booking?: any;
  data?: any;
  payload?: any;
  [k: string]: any;
}

function pick<T = any>(obj: any, paths: string[]): T | undefined {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj;
    let ok = true;
    for (const k of parts) {
      if (cur == null) { ok = false; break; }
      cur = cur[k];
    }
    if (ok && cur !== undefined && cur !== null && cur !== "") return cur as T;
  }
  return undefined;
}

function parseEventDate(dateStr?: string, timeStr?: string, tz: string = "Pacific/Auckland"): Date | null {
  if (!dateStr) return null;
  // ISO with explicit offset/Z → trust it as a real UTC instant.
  const hasOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(dateStr);
  if (hasOffset) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }
  // ISO-like local timestamp (e.g. "2026-05-02T19:30:00") with NO offset → treat as venue-local.
  const isoLocal = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(dateStr);
  if (isoLocal) {
    const [, y, mo, d, h, mi] = isoLocal;
    return resolveVenueLocal(Number(y), Number(mo), Number(d), Number(h), Number(mi), 0, tz);
  }
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dm) return null;
  const [, y, mo, d] = dm;
  let h = 0, mi = 0;
  if (timeStr) {
    const tm = /^(\d{1,2}):(\d{2})/.exec(timeStr);
    if (tm) { h = Number(tm[1]); mi = Number(tm[2]); }
  }
  return resolveVenueLocal(Number(y), Number(mo), Number(d), h, mi, 0, tz);
}

function resolveVenueLocal(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  // Build the UTC instant for that local wall-clock time in venue tz.
  let guess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), h, mi, 0));
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(guess);
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const localH = get("hour") === 24 ? 0 : get("hour");
    const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), localH, get("minute"), get("second"));
    const wantAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), h, mi, 0);
    guess = new Date(guess.getTime() - (localAsUtc - wantAsUtc));
  }
  return guess;
}

export async function handleNbiWebhook(req: Request, res: Response) {
  const secret = req.params.secret;
  if (!secret || secret.length < 16) {
    res.status(401).json({ ok: false, error: "missing_secret" });
    return;
  }

  const db = await getDb();
  if (!db) {
    res.status(503).json({ ok: false, error: "database_unavailable" });
    return;
  }

  // Find the venue this webhook belongs to.
  const [venue] = await db
    .select()
    .from(venueSettings)
    .where(eq(venueSettings.nbiWebhookSecret, secret))
    .limit(1);

  if (!venue) {
    console.warn(`[NBI Webhook] Unknown secret: ${secret.slice(0, 8)}…`);
    res.status(401).json({ ok: false, error: "invalid_secret" });
    return;
  }

  const body: NbiWebhookBody = (req.body ?? {}) as NbiWebhookBody;
  // Log the raw payload the first few times so we can refine field paths if NBI's shape differs.
  console.log(`[NBI Webhook] venue=${venue.id} body=${JSON.stringify(body).slice(0, 800)}`);

  // Locate the booking object — NBI may wrap it under .booking, .data or .payload.
  const b = body.booking ?? body.data?.booking ?? body.data ?? body.payload ?? body;

  const action = String(
    body.event ?? body.type ?? body.action ?? pick<string>(b, ["event", "status", "action"]) ?? "created"
  ).toLowerCase();

  const nbiBookingId = pick<string | number>(b, [
    "id", "bookingId", "booking_id", "uuid", "reference",
  ]);
  const nbiBookingIdStr = nbiBookingId != null ? String(nbiBookingId) : undefined;

  // Loop prevention: if NBI is echoing back a booking that VFHQ pushed (reference "VF-<id>"),
  // or if we already have a booking row with this nbiBookingId, skip the create path.
  const echoRef = String(pick<string>(b, ["reference", "ref", "externalReference"]) ?? "");
  const isEchoFromUs = /^VF-\d+$/.test(echoRef);

  let existingByNbiId: any = null;
  if (nbiBookingIdStr) {
    const [row] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.ownerId, venue.ownerId), eq(bookings.nbiBookingId, nbiBookingIdStr)))
      .limit(1);
    existingByNbiId = row ?? null;
  }

  // Cancellation
  if (/cancel|deleted|removed/.test(action)) {
    if (existingByNbiId) {
      await db
        .update(bookings)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(bookings.id, existingByNbiId.id));
      console.log(`[NBI Webhook] Cancelled booking #${existingByNbiId.id}`);
    }
    res.json({ ok: true, action: "cancelled" });
    return;
  }

  // Pull guest details
  const firstName =
    pick<string>(b, ["firstName", "first_name", "customer.firstName", "customer.first_name", "guest.firstName"]) ?? "";
  const lastName =
    pick<string>(b, ["lastName", "last_name", "customer.lastName", "customer.last_name", "guest.lastName"]) ?? "";
  const email =
    pick<string>(b, ["email", "customer.email", "guest.email"]) ?? "";
  const phone =
    pick<string>(b, ["phone", "phoneNumber", "customer.phone", "guest.phone"]) ?? "";
  const covers = Number(
    pick(b, ["covers", "numOfPeople", "partySize", "guests", "guestCount", "numberOfGuests"]) ?? 2
  ) || 2;
  const notes =
    pick<string>(b, ["notes", "specialRequests", "comments", "message"]) ?? "";
  const sectionName =
    pick<string>(b, ["sectionName", "section.name", "areaName", "area.name", "tableName"]) ?? "";

  // Date/time may be split or combined
  const dateField = pick<string>(b, ["date", "bookingDate", "datetime", "dateTime", "startDateTime", "start"]);
  const timeField = pick<string>(b, ["time", "startTime", "bookingTime"]);
  const eventDate = parseEventDate(dateField, timeField, venue.timezone ?? "Pacific/Auckland");

  if (!eventDate || (!email && !firstName)) {
    console.warn(`[NBI Webhook] Skipping — insufficient data (date=${!!eventDate} email=${!!email} name=${!!firstName})`);
    res.json({ ok: true, action: "skipped_insufficient_data" });
    return;
  }

  // Update path
  if (existingByNbiId) {
    await db
      .update(bookings)
      .set({
        firstName: firstName || existingByNbiId.firstName,
        lastName: lastName || existingByNbiId.lastName,
        email: email || existingByNbiId.email,
        eventDate,
        guestCount: covers,
        spaceName: sectionName || existingByNbiId.spaceName,
        notes: notes || existingByNbiId.notes,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, existingByNbiId.id));
    console.log(`[NBI Webhook] Updated booking #${existingByNbiId.id}`);
    res.json({ ok: true, action: "updated", bookingId: existingByNbiId.id });
    return;
  }

  if (isEchoFromUs) {
    // VFHQ originated this booking; backfill the NBI booking id only.
    const refId = Number(echoRef.replace(/^VF-/, ""));
    if (Number.isFinite(refId) && nbiBookingIdStr) {
      await db
        .update(bookings)
        .set({ nbiBookingId: nbiBookingIdStr })
        .where(and(eq(bookings.ownerId, venue.ownerId), eq(bookings.id, refId)));
      console.log(`[NBI Webhook] Backfilled nbiBookingId on VFHQ booking #${refId}`);
    }
    res.json({ ok: true, action: "echo_acknowledged" });
    return;
  }

  // Create path — booking made directly inside NowBookIt.
  // Concurrent duplicate webhook deliveries are protected by the partial unique
  // index `bookings_owner_nbi_unique` on (ownerId, nbiBookingId). On conflict,
  // we skip and return the existing row.
  try {
    const inserted = await db
      .insert(bookings)
      .values({
        ownerId: venue.ownerId,
        firstName: firstName || "Guest",
        lastName: lastName || null,
        email: email || `nbi-${nbiBookingIdStr ?? Date.now()}@unknown.local`,
        eventType: "Booking (from NowBookIt)",
        eventDate,
        guestCount: covers,
        spaceName: sectionName || null,
        status: "confirmed",
        notes: notes || null,
        nbiBookingId: nbiBookingIdStr ?? null,
      })
      .returning({ id: bookings.id });

    const newId = inserted[0]?.id;
    console.log(`[NBI Webhook] Created booking #${newId} from NowBookIt (nbiId=${nbiBookingIdStr})`);
    res.json({ ok: true, action: "created", bookingId: newId });
  } catch (err: any) {
    if (err?.code === "23505" && nbiBookingIdStr) {
      // Concurrent duplicate delivery — another worker already inserted.
      const [row] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.ownerId, venue.ownerId), eq(bookings.nbiBookingId, nbiBookingIdStr)))
        .limit(1);
      console.log(`[NBI Webhook] Duplicate delivery skipped — existing booking #${row?.id}`);
      res.json({ ok: true, action: "duplicate_skipped", bookingId: row?.id });
      return;
    }
    throw err;
  }
}
