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
  desired: string // "HH:MM"
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
  const section = (best.sections ?? [])[0];
  return { time: best.time, sectionId: section?.id ?? "all" };
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

    const service =
      (creds.serviceId && services.find((s) => s.id === creds.serviceId)) ||
      services.find((s) => s.online !== false) ||
      services[0];

    const slot = pickBestTime(service, payload.time);
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
