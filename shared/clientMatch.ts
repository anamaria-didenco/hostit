/**
 * Recognising the same client across enquiries: matched by email
 * (case-insensitive) or phone (digits only, with NZ "+64" written as "0").
 *
 * Pure functions, shared by the server (flags on leads.list, contact linking on
 * create) and its unit tests.
 */

/** Statuses that mean the client actually booked. */
export const BOOKED_STATUSES = ["booked", "confirmed", "finished"];
/** Statuses that take an enquiry out of play. */
export const CLOSED_STATUSES = [...BOOKED_STATUSES, "lost", "cancelled"];
/** Two open enquiries from one client within this many days look like a duplicate. */
export const DUPLICATE_WINDOW_DAYS = 60;

/**
 * Digits only, so "+64 21 123 4567", "021-123-4567" and "(021) 1234567" all
 * compare equal. A leading international "00" is dropped and NZ's country code
 * becomes the local trunk "0". Anything under 7 digits is too short to trust as
 * a match and returns null.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  // "+64 (0)21…" → "64021…": drop the country code and any trunk zero after it.
  if (d.startsWith("64") && d.length >= 10) d = "0" + d.slice(2).replace(/^0/, "");
  return d.length >= 7 ? d : null;
}

export function normaliseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  return e.includes("@") ? e : null;
}

type Contactish = { email?: string | null; phone?: string | null };

/** True when two records share an email or a phone number. */
export function sameClient(a: Contactish, b: Contactish): boolean {
  const ea = normaliseEmail(a.email), eb = normaliseEmail(b.email);
  if (ea && ea === eb) return true;
  const pa = normalisePhone(a.phone), pb = normalisePhone(b.phone);
  return !!(pa && pa === pb);
}

export type MatchLead = {
  id: number;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  createdAt?: Date | string | number | null;
  eventDate?: Date | string | number | null;
};

export type MatchBooking = {
  id: number;
  leadId?: number | null;
  email?: string | null;
  status?: string | null;
  eventDate?: Date | string | number | null;
};

export type ClientFlag = {
  /** Other bookings this client has had or has (not counting this enquiry). */
  bookedEvents: number;
  /** …of which the event date has already passed. */
  pastEvents: number;
  /** Other open enquiries from the same client, made within 60 days of this one. */
  duplicateIds: number[];
};

const ms = (v: Date | string | number | null | undefined): number | null => {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

const isOpen = (status: string | null | undefined) => !CLOSED_STATUSES.includes(status ?? "");

/**
 * One pass over the venue's leads and bookings, returning a flag for every lead
 * that is a returning client or a possible duplicate (leads with neither are
 * left out). Indexed by email and phone so it stays linear for the list view.
 */
export function computeClientFlags(
  leads: MatchLead[],
  bookings: MatchBooking[] = [],
  nowMs: number = Date.now(),
): Map<number, ClientFlag> {
  const byEmail = new Map<string, number[]>();
  const byPhone = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string | null, id: number) => {
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(id); else m.set(k, [id]);
  };
  const leadById = new Map<number, MatchLead>();
  for (const l of leads) {
    leadById.set(l.id, l);
    push(byEmail, normaliseEmail(l.email), l.id);
    push(byPhone, normalisePhone(l.phone), l.id);
  }

  // A lead "booked" if its status says so or a live booking row points at it.
  const liveBookingLeadIds = new Set<number>();
  const unlinkedByEmail = new Map<string, MatchBooking[]>();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    if (b.leadId != null && leadById.has(b.leadId)) {
      liveBookingLeadIds.add(b.leadId);
    } else {
      const e = normaliseEmail(b.email);
      if (e) { const arr = unlinkedByEmail.get(e); if (arr) arr.push(b); else unlinkedByEmail.set(e, [b]); }
    }
  }
  const wasBooked = (l: MatchLead) => BOOKED_STATUSES.includes(l.status ?? "") || liveBookingLeadIds.has(l.id);

  const out = new Map<number, ClientFlag>();
  const windowMs = DUPLICATE_WINDOW_DAYS * 86_400_000;
  for (const l of leads) {
    const email = normaliseEmail(l.email);
    const phone = normalisePhone(l.phone);
    if (!email && !phone) continue;
    const matched = new Set<number>([...(email ? byEmail.get(email) ?? [] : []), ...(phone ? byPhone.get(phone) ?? [] : [])]);
    matched.delete(l.id);

    let bookedEvents = 0, pastEvents = 0;
    const duplicateIds: number[] = [];
    const created = ms(l.createdAt);
    for (const id of matched) {
      const other = leadById.get(id)!;
      if (wasBooked(other)) {
        bookedEvents++;
        const when = ms(other.eventDate);
        if (when != null && when < nowMs) pastEvents++;
      } else if (isOpen(l.status) && isOpen(other.status)) {
        const oc = ms(other.createdAt);
        if (created != null && oc != null && Math.abs(created - oc) <= windowMs) duplicateIds.push(id);
      }
    }
    for (const b of email ? unlinkedByEmail.get(email) ?? [] : []) {
      bookedEvents++;
      const when = ms(b.eventDate);
      if (when != null && when < nowMs) pastEvents++;
    }
    if (bookedEvents > 0 || duplicateIds.length > 0) {
      out.set(l.id, { bookedEvents, pastEvents, duplicateIds: duplicateIds.sort((a, b) => a - b) });
    }
  }
  return out;
}

/** Short labels for the list and drawer, e.g. "Returning client (2 past events)". */
export function clientFlagLabels(flag: ClientFlag | null | undefined): { returning: string | null; duplicate: string | null } {
  if (!flag) return { returning: null, duplicate: null };
  let returning: string | null = null;
  if (flag.bookedEvents > 0) {
    returning = flag.pastEvents > 0
      ? `Returning client (${flag.pastEvents} past event${flag.pastEvents === 1 ? "" : "s"})`
      : `Returning client (${flag.bookedEvents} booking${flag.bookedEvents === 1 ? "" : "s"})`;
  }
  return { returning, duplicate: flag.duplicateIds.length > 0 ? "Possible duplicate" : null };
}
