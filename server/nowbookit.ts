/**
 * Nowbook It (NBI) Integration Service
 *
 * Nowbook It uses a REST API authenticated via Basic Auth (username:password)
 * or an API Key header. The base URL is https://api.nowbookit.com/api/v1
 *
 * Endpoints used:
 *  POST /bookings           — create a booking in the NBI diary
 *  POST /blockouts          — block a date/time range in NBI
 *  GET  /venues/{venueId}   — verify credentials / fetch venue info
 *
 * Credentials are stored per-venue in the `venueSettings` table.
 */

export interface NbiCredentials {
  apiKey: string;
  venueId: string;
}

export interface NbiBookingPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  date: string;         // YYYY-MM-DD
  time: string;         // HH:MM (24h)
  covers: number;
  duration?: number;    // minutes, default 120
  notes?: string;
  reference?: string;   // external reference (HOSTit booking ID)
}

export interface NbiBlockoutPayload {
  date: string;         // YYYY-MM-DD
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
  reason?: string;
}

export interface NbiResult {
  success: boolean;
  nbiBookingId?: string;
  error?: string;
}

const NBI_BASE = "https://api.nowbookit.com/api/v1";

function authHeader(apiKey: string): Record<string, string> {
  // NBI accepts the API key as a Bearer token
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Verify that the provided credentials are valid by fetching venue info.
 */
export async function verifyNbiCredentials(creds: NbiCredentials): Promise<{ valid: boolean; venueName?: string; error?: string }> {
  try {
    const res = await fetch(`${NBI_BASE}/venues/${creds.venueId}`, {
      method: "GET",
      headers: authHeader(creds.apiKey),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { valid: true, venueName: data?.name ?? "Your Venue" };
    }
    const text = await res.text().catch(() => "");
    return { valid: false, error: `NBI returned ${res.status}: ${text.slice(0, 120)}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: msg };
  }
}

/**
 * Create a booking in Nowbook It when a HOSTit proposal is accepted.
 */
export async function createNbiBooking(
  creds: NbiCredentials,
  payload: NbiBookingPayload
): Promise<NbiResult> {
  try {
    const body = {
      venue_id: creds.venueId,
      first_name: payload.firstName,
      last_name: payload.lastName,
      email: payload.email,
      phone: payload.phone ?? "",
      date: payload.date,
      time: payload.time,
      covers: payload.covers,
      duration: payload.duration ?? 120,
      notes: payload.notes ?? "",
      reference: payload.reference ?? "",
      status: "ACCEPTED",
    };

    const res = await fetch(`${NBI_BASE}/bookings`, {
      method: "POST",
      headers: authHeader(creds.apiKey),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, nbiBookingId: data?.id ?? data?.booking_id ?? undefined };
    }

    const text = await res.text().catch(() => "");
    console.error("[NBI] createBooking failed:", res.status, text.slice(0, 200));
    return { success: false, error: `NBI ${res.status}: ${text.slice(0, 120)}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[NBI] createBooking error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Create a blockout in Nowbook It to prevent double-booking.
 */
export async function createNbiBlockout(
  creds: NbiCredentials,
  payload: NbiBlockoutPayload
): Promise<NbiResult> {
  try {
    const body = {
      venue_id: creds.venueId,
      date: payload.date,
      start_time: payload.startTime,
      end_time: payload.endTime,
      reason: payload.reason ?? "HOSTit confirmed booking",
    };

    const res = await fetch(`${NBI_BASE}/blockouts`, {
      method: "POST",
      headers: authHeader(creds.apiKey),
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: true, nbiBookingId: data?.id ?? undefined };
    }

    const text = await res.text().catch(() => "");
    console.error("[NBI] createBlockout failed:", res.status, text.slice(0, 200));
    return { success: false, error: `NBI ${res.status}: ${text.slice(0, 120)}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[NBI] createBlockout error:", msg);
    return { success: false, error: msg };
  }
}
