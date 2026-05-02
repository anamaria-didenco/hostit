/**
 * Nowbook It (NBI) Integration — Public Widget Mode
 *
 * Uses the same public booking API that the embeddable widget at
 * https://bookings.nowbookit.com uses, so no API key is required.
 *
 * Required credentials (visible in the venue's public widget URL):
 *   accountId — UUID, e.g. "e9d59bc3-73d5-4e64-a6e7-32a753b7dd3a"
 *   venueId   — numeric, e.g. "12388"
 *
 * Endpoints used (host: https://api.nowbookit.com):
 *   GET  /bookings/get-schedule/venue/{venueId}?date=YYYY-MM-DD&numOfPeople=N&accountId=...
 *        Returns the day's available services + sections + bookable times.
 *   POST /bookings/save-new-booking/venue/{venueId}
 *        Creates a booking. Body matches the widget's payload shape.
 */

const NBI_API = "https://api.nowbookit.com";

// Headers that mimic the public widget; required to satisfy CORS / origin checks
function widgetHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Origin: "https://bookings.nowbookit.com",
    Referer: "https://bookings.nowbookit.com/",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  };
}

export interface NbiCredentials {
  accountId: string;
  venueId: string;
  /** preferred service id; if omitted we pick the first online service */
  serviceId?: string;
  /** preferred section/area id within the chosen service (e.g. "Bar Area"). Falls back to first section. */
  sectionId?: string;
}

export interface NbiService {
  id: string;
  name: string;
  duration: number;
  serviceType: string;
  online?: boolean;
  sections: { id: string; name: string }[];
}

export interface NbiSchedule {
  isVenueOpen: boolean;
  blockoutMessage: string | null;
  services: NbiService[];
}

export interface NbiBookingPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** YYYY-MM-DD in venue local time */
  date: string;
  /** HH:MM in 24h venue local time */
  time: string;
  covers: number;
  notes?: string;
  /** external reference shown to staff in NBI diary */
  reference?: string;
}

export interface NbiResult {
  success: boolean;
  nbiBookingId?: string;
  error?: string;
}

/**
 * Verify credentials by fetching today's schedule for a 2-cover booking.
 * If the schedule loads we know accountId + venueId are valid.
 */
export async function verifyNbiCredentials(
  creds: NbiCredentials
): Promise<{ valid: boolean; venueName?: string; services?: NbiService[]; error?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const url = `${NBI_API}/bookings/get-schedule/venue/${encodeURIComponent(
      creds.venueId
    )}?date=${today}&numOfPeople=2&accountId=${encodeURIComponent(creds.accountId)}`;
    const res = await fetch(url, { method: "GET", headers: widgetHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { valid: false, error: `NowBookIt ${res.status}: ${text.slice(0, 160)}` };
    }
    const data: any = await res.json().catch(() => ({}));
    const services: NbiService[] = (data?.services ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      serviceType: s.serviceType,
      online: s.online,
      sections: (s.sections ?? []).map((x: any) => ({ id: x.id, name: x.name })),
    }));
    return { valid: true, venueName: `Venue ${creds.venueId}`, services };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: msg };
  }
}

/**
 * Fetch services available on a specific date for a given party size.
 * Used to populate the "default service" dropdown in settings.
 */
export async function listNbiServices(
  creds: NbiCredentials,
  date?: string,
  covers: number = 2
): Promise<NbiService[]> {
  const day = date ?? new Date().toISOString().slice(0, 10);
  const url = `${NBI_API}/bookings/get-schedule/venue/${encodeURIComponent(
    creds.venueId
  )}?date=${day}&numOfPeople=${covers}&accountId=${encodeURIComponent(creds.accountId)}`;
  const res = await fetch(url, { method: "GET", headers: widgetHeaders() });
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => ({}));
  return (data?.services ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    duration: s.duration,
    serviceType: s.serviceType,
    online: s.online,
    sections: (s.sections ?? []).map((x: any) => ({ id: x.id, name: x.name })),
  }));
}

/**
 * Find the bookable time on the chosen service nearest to the requested time.
 * Returns null if the day/service has no bookable slots.
 */
function pickBestTime(
  service: any,
  desired: string, // "HH:MM"
  preferredSectionId?: string
): { time: string; sectionId: string } | null {
  const times: any[] = (service?.times ?? []).filter((t: any) => !t.expired && !t.isBlockOut);
  if (!times.length) return null;
  const [hh, mm] = desired.split(":").map(Number);
  const desiredMins = (hh || 0) * 60 + (mm || 0);
  let best = times[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const t of times) {
    const tm = (t.time as string).slice(11, 16); // "HH:MM"
    const [th, tmin] = tm.split(":").map(Number);
    const diff = Math.abs((th || 0) * 60 + (tmin || 0) - desiredMins);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }
  // Prefer the user-configured section (e.g. "Bar Area") if it's present in this slot.
  // Otherwise fall back to the first section returned by NBI, otherwise "all".
  const sections: any[] = best.sections ?? [];
  const matched = preferredSectionId ? sections.find((s: any) => String(s.id) === String(preferredSectionId)) : null;
  const sectionId = matched?.id ?? sections[0]?.id ?? "all";
  return { time: best.time, sectionId };
}

/**
 * Create a booking in Nowbook It using the public widget endpoint.
 *
 * Flow:
 *  1. GET schedule for the date + covers to find the chosen service and its
 *     nearest bookable time slot.
 *  2. POST the booking payload to /bookings/save-new-booking/venue/{venueId}.
 */
export async function createNbiBooking(
  creds: NbiCredentials,
  payload: NbiBookingPayload
): Promise<NbiResult> {
  try {
    // Step 1: load schedule
    const schedUrl = `${NBI_API}/bookings/get-schedule/venue/${encodeURIComponent(
      creds.venueId
    )}?date=${payload.date}&numOfPeople=${payload.covers}&accountId=${encodeURIComponent(creds.accountId)}`;
    const schedRes = await fetch(schedUrl, { method: "GET", headers: widgetHeaders() });
    if (!schedRes.ok) {
      const t = await schedRes.text().catch(() => "");
      return { success: false, error: `Schedule lookup failed (${schedRes.status}): ${t.slice(0, 160)}` };
    }
    const sched: any = await schedRes.json();
    if (!sched?.isVenueOpen) {
      return { success: false, error: sched?.blockoutMessage || "Venue is closed on that date in NowBookIt" };
    }
    const services: any[] = sched?.services ?? [];
    if (!services.length) return { success: false, error: "NowBookIt returned no services for that date" };

    // Normalize string comparison — NBI sometimes returns numeric ids while we
    // persist the configured value as a string from the <select>. Without this
    // the configured "Drinks & Snacks" service can silently fall back to first
    // online service, which then routes bookings to the wrong section/area.
    const service =
      (creds.serviceId && services.find((s) => String(s.id) === String(creds.serviceId))) ||
      services.find((s) => s.online !== false) ||
      services[0];

    const slot = pickBestTime(service, payload.time, creds.sectionId);
    if (!slot) {
      return { success: false, error: `No available slots for "${service.name}" on ${payload.date}` };
    }

    // Step 2: build widget-shaped payload
    const body = {
      customer: {
        firstName: payload.firstName,
        lastName: payload.lastName || "",
        email: payload.email,
        phone: payload.phone || "",
      },
      time: slot.time,
      notes: payload.notes || "",
      selectedMenuOptions: [],
      numOfPeople: payload.covers,
      sectionId: slot.sectionId || "all",
      hasCustomerNotes: !!payload.notes,
      hasManagerNotes: false,
      service: {
        id: service.id,
        duration: service.duration || 120,
        serviceType: service.serviceType,
        name: service.name,
      },
      tags: [],
      bookedBy: null,
      isPerBookingSmsOptIn: null,
      reference: payload.reference || "",
      source: "VenueFlowHQ",
    };

    const postUrl = `${NBI_API}/bookings/save-new-booking/venue/${encodeURIComponent(creds.venueId)}`;
    const res = await fetch(postUrl, {
      method: "POST",
      headers: widgetHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[NBI] save-new-booking failed:", res.status, t.slice(0, 300));
      return { success: false, error: `NowBookIt ${res.status}: ${t.slice(0, 200)}` };
    }
    const data: any = await res.json().catch(() => ({}));
    const id =
      data?.bookingId ||
      data?.id ||
      data?.booking?.id ||
      data?.booking?.bookingId ||
      data?.booking?._id ||
      undefined;
    return { success: true, nbiBookingId: id ? String(id) : undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[NBI] createBooking error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Shared helper: push a single VenueFlowHQ booking into NowBookIt.
 *
 * Use this from *every* place that creates or confirms a booking, so the
 * sync rules (gate checks, idempotency, logging) stay in one place.
 *
 * Behaviour:
 *  - Skips with a clear log line if NBI is not fully configured / disabled.
 *  - Skips if the booking already has an `nbiBookingId`.
 *  - On success, writes `nbiBookingId` back onto the booking.
 *  - Never throws — failures are logged and returned in the result.
 */
export async function pushBookingToNbi(
  bookingId: number,
  ownerId: number,
  opts: { source: string } = { source: 'unknown' }
): Promise<{ pushed: boolean; reason?: string; nbiBookingId?: string }> {
  try {
    const { getDb } = await import('./db');
    const { bookings, venueSettings } = await import('../drizzle/schema');
    const { eq, and } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) {
      console.warn(`[NBI push:${opts.source}] booking ${bookingId} skipped — database unavailable`);
      return { pushed: false, reason: 'db_unavailable' };
    }

    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.ownerId, ownerId))).limit(1);
    if (!booking) {
      console.warn(`[NBI push:${opts.source}] booking ${bookingId} not found`);
      return { pushed: false, reason: 'booking_not_found' };
    }
    if (booking.nbiBookingId) {
      console.log(`[NBI push:${opts.source}] booking ${bookingId} already has nbiBookingId=${booking.nbiBookingId} — skip`);
      return { pushed: false, reason: 'already_pushed', nbiBookingId: booking.nbiBookingId };
    }

    // Enrich customer fields from the linked contact / lead — the bookings
    // table itself has no `phone` column, and NBI's PostBookings endpoint
    // strictly requires FirstName, LastName, and Phone. Without this lookup
    // every push fails with a 400 "PostBookings requires Customer's:
    // FirstName, LastName, Phone" error.
    const { contacts, leads } = await import('../drizzle/schema');
    let contactPhone = '';
    let contactLastName = '';
    if (booking.contactId) {
      const [c] = await db.select().from(contacts).where(eq(contacts.id, booking.contactId)).limit(1);
      if (c) {
        contactPhone = c.phone ?? '';
        contactLastName = c.lastName ?? '';
      }
    }
    if ((!contactPhone || !contactLastName) && booking.leadId) {
      const [l] = await db.select().from(leads).where(eq(leads.id, booking.leadId)).limit(1);
      if (l) {
        if (!contactPhone) contactPhone = l.phone ?? '';
        if (!contactLastName) contactLastName = l.lastName ?? '';
      }
    }

    const [venue] = await db.select().from(venueSettings)
      .where(eq(venueSettings.ownerId, ownerId)).limit(1);
    if (!venue) {
      console.warn(`[NBI push:${opts.source}] no venue_settings row for ownerId=${ownerId}`);
      return { pushed: false, reason: 'no_venue_settings' };
    }
    const missing: string[] = [];
    if (!venue.nbiAccountId) missing.push('nbiAccountId');
    if (!venue.nbiVenueId) missing.push('nbiVenueId');
    if ((venue.nbiSyncEnabled ?? 0) !== 1) missing.push('nbiSyncEnabled=1');
    if (missing.length) {
      console.log(`[NBI push:${opts.source}] booking ${bookingId} skipped — missing: ${missing.join(', ')}`);
      return { pushed: false, reason: `not_configured: ${missing.join(',')}` };
    }

    // Refuse to push a booking with no event date — falling back to "now" would
    // create a NBI reservation for today at the current time, which is a wrong-
    // date push that's hard to spot. Better to surface the gap than corrupt NBI.
    if (!booking.eventDate) {
      console.warn(`[NBI push:${opts.source}] booking ${bookingId} skipped — no eventDate set`);
      return { pushed: false, reason: 'missing_event_date' };
    }
    // Format venue-local date/time. Inline to avoid circular imports.
    const tz = venue.timezone || 'Pacific/Auckland';
    const eventDate = booking.eventDate;
    const d = eventDate instanceof Date ? eventDate : new Date(eventDate);
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const timeStr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

    // Resolve customer fields with safe fallbacks. NBI rejects empty values
    // for FirstName / LastName / Phone, so we substitute placeholders rather
    // than silently failing every push for clients with incomplete data.
    // The placeholders are intentionally obvious so a user spotting them in
    // NBI knows to add the real details back in VenueFlow.
    let firstName = (booking.firstName ?? '').trim();
    let lastName = (booking.lastName ?? '').trim() || contactLastName.trim();
    // If lastName is still empty but firstName has a space, split it.
    if (!lastName && firstName.includes(' ')) {
      const parts = firstName.split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }
    if (!firstName) firstName = 'Guest';
    if (!lastName) lastName = '—';
    const phone = (contactPhone || '').trim() || '0000000000';
    const substituted: string[] = [];
    if (phone === '0000000000') substituted.push('phone');
    if (lastName === '—') substituted.push('lastName');
    if (substituted.length) {
      console.warn(`[NBI push:${opts.source}] booking ${bookingId} missing ${substituted.join(',')} — using placeholders`);
    }

    const result = await createNbiBooking(
      {
        accountId: venue.nbiAccountId!,
        venueId: venue.nbiVenueId!,
        serviceId: venue.nbiServiceId ?? undefined,
        sectionId: (venue as any).nbiSectionId ?? undefined,
      },
      {
        firstName,
        lastName,
        email: booking.email ?? '',
        phone,
        date: dateStr,
        time: timeStr,
        covers: booking.guestCount ?? 2,
        notes: [booking.eventType, booking.spaceName, booking.notes].filter(Boolean).join(' · '),
        reference: `VF-${booking.id}`,
      }
    );
    if (result.success && result.nbiBookingId) {
      await db.update(bookings).set({ nbiBookingId: result.nbiBookingId }).where(eq(bookings.id, bookingId));
      console.log(`[NBI push:${opts.source}] booking ${bookingId} → NBI #${result.nbiBookingId}`);
      return { pushed: true, nbiBookingId: result.nbiBookingId };
    }
    console.warn(`[NBI push:${opts.source}] booking ${bookingId} push FAILED: ${result.error}`);
    return { pushed: false, reason: `nbi_error: ${result.error}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[NBI push:${opts.source}] booking ${bookingId} unexpected error:`, msg);
    return { pushed: false, reason: `exception: ${msg}` };
  }
}
