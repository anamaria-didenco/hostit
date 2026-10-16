/**
 * One finder for the whole dashboard (Cmd/Ctrl-K, and the Enquiries search):
 * enquiries and events matching a name, email, phone or company, across every
 * status and date. Events are bookings, so imported ones that never had an
 * enquiry are found too.
 *
 * Staff logins may search, but only for what their calendar shows: events by
 * name, space or type. They never get enquiries, and never email/phone (so
 * matching on contact details can't be used to probe for them either).
 */
import { and, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { bookings, leads } from "../drizzle/schema";

export const GLOBAL_SEARCH_MIN_CHARS = 2;

export type GlobalSearchEnquiry = {
  id: number; name: string; email: string; phone: string | null; company: string | null;
  status: string; eventType: string | null; eventDate: Date | null; spaceName: string | null;
};
export type GlobalSearchEvent = {
  id: number; leadId: number | null; name: string; email: string | null;
  status: string; eventType: string | null; eventDate: Date; spaceName: string | null;
};
export type GlobalSearchResult = { enquiries: GlobalSearchEnquiry[]; events: GlobalSearchEvent[] };

/** `%`, `_` and `\` in what the person typed must match literally. */
const likePattern = (term: string) => `%${term.replace(/[\\%_]/g, c => `\\${c}`)}%`;

/** Every word typed must appear in at least one of the columns. */
function termsMatch(terms: string[], columns: SQL[], phoneColumn?: SQL): SQL | undefined {
  const perTerm = terms.map(t => {
    const pat = likePattern(t);
    const ors: SQL[] = columns.map(c => sql`${c} ILIKE ${pat}`);
    // "021 123 4567" and "(021) 1234567" are the same number.
    const digits = t.replace(/\D/g, "");
    if (phoneColumn && digits.length >= 3 && digits.length === t.replace(/[\s\-().+]/g, "").length) {
      ors.push(sql`regexp_replace(${phoneColumn}, '\\D', '', 'g') LIKE ${`%${digits}%`}`);
    }
    return or(...ors)!;
  });
  return and(...perTerm);
}

export async function searchGlobal(
  ownerId: number, rawQuery: string, opts: { staff: boolean; limit: number },
): Promise<GlobalSearchResult> {
  const terms = rawQuery.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const empty: GlobalSearchResult = { enquiries: [], events: [] };
  if (terms.join(" ").length < GLOBAL_SEARCH_MIN_CHARS) return empty;
  const db = await getDb();
  if (!db) return empty;
  const limit = Math.max(1, Math.min(opts.limit, 50));

  let enquiries: GlobalSearchEnquiry[] = [];
  if (!opts.staff) {
    const rows = await db.select().from(leads)
      .where(and(
        eq(leads.ownerId, ownerId),
        ne(leads.source, "healthcheck"),
        termsMatch(
          terms,
          [sql`concat_ws(' ', ${leads.firstName}, ${leads.lastName})`, sql`${leads.email}`, sql`coalesce(${leads.phone}, '')`, sql`coalesce(${leads.company}, '')`],
          sql`coalesce(${leads.phone}, '')`,
        ),
      ))
      // Newest event first: "Jane" usually means the one still ahead of us.
      .orderBy(sql`${leads.eventDate} DESC NULLS LAST`, desc(leads.createdAt))
      .limit(limit);
    enquiries = rows.map(l => ({
      id: l.id,
      name: [l.firstName, l.lastName].filter(Boolean).join(" ").trim() || l.email,
      email: l.email, phone: l.phone ?? null, company: l.company ?? null,
      status: l.status, eventType: l.eventType ?? null, eventDate: l.eventDate ?? null, spaceName: l.spaceName ?? null,
    }));
  }

  const nameCols = [sql`concat_ws(' ', ${bookings.firstName}, ${bookings.lastName})`, sql`coalesce(${bookings.spaceName}, '')`, sql`coalesce(${bookings.eventType}, '')`];
  const evRows = await db.select({
    id: bookings.id, leadId: bookings.leadId, firstName: bookings.firstName, lastName: bookings.lastName,
    email: bookings.email, status: bookings.status, eventType: bookings.eventType,
    eventDate: bookings.eventDate, spaceName: bookings.spaceName,
  })
    .from(bookings)
    .leftJoin(leads, and(eq(leads.id, bookings.leadId), eq(leads.ownerId, ownerId)))
    .where(and(
      eq(bookings.ownerId, ownerId),
      opts.staff
        ? termsMatch(terms, nameCols)
        : termsMatch(terms, [...nameCols, sql`${bookings.email}`, sql`coalesce(${leads.phone}, '')`, sql`coalesce(${leads.company}, '')`], sql`coalesce(${leads.phone}, '')`),
    ))
    .orderBy(desc(bookings.eventDate))
    .limit(limit);
  const events: GlobalSearchEvent[] = evRows.map(b => ({
    id: b.id, leadId: b.leadId ?? null,
    name: [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || "Unnamed event",
    email: opts.staff ? null : b.email,
    status: b.status, eventType: b.eventType ?? null, eventDate: b.eventDate, spaceName: b.spaceName ?? null,
  }));
  return { enquiries, events };
}
