/**
 * Does an enquiry match what was typed in the Enquiries search box? Every word
 * has to appear somewhere, in any order: the name, email, phone, company, event
 * type or space. So "jane smith" and "smith jane" both find Jane Smith, and a
 * phone typed as "021 555" finds "(021) 555 0147" (3 or more digits typed
 * together are matched against the phone with its punctuation ignored).
 *
 * Mirrors the server's search.global for name, email, phone and company, and
 * additionally matches event type and space.
 */
export type SearchableLead = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  eventType?: string | null;
  spaceName?: string | null;
};

export function leadMatchesSearch(l: SearchableLead, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = `${l.firstName ?? ""} ${l.lastName ?? ""} ${l.email ?? ""} ${l.phone ?? ""} ${l.company ?? ""} ${l.eventType ?? ""} ${l.spaceName ?? ""}`.toLowerCase();
  const phoneDigits = (l.phone ?? "").replace(/\D/g, "");
  return terms.every(t => {
    if (text.includes(t)) return true;
    const digits = t.replace(/\D/g, "");
    return digits.length >= 3 && digits.length === t.replace(/[\s\-().+]/g, "").length && phoneDigits.includes(digits);
  });
}
