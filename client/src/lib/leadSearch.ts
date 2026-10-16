/**
 * Does an enquiry match what was typed in the Enquiries search box? Every word
 * has to appear in the name, email, phone or company, so "jane smith" finds
 * Jane Smith, and a phone typed as "021 555" finds "(021) 555 0147".
 * Mirrors the server's search.global matching.
 */
export function leadMatchesSearch(
  l: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; company?: string | null },
  query: string,
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = `${l.firstName ?? ""} ${l.lastName ?? ""} ${l.email ?? ""} ${l.phone ?? ""} ${l.company ?? ""}`.toLowerCase();
  const phoneDigits = (l.phone ?? "").replace(/\D/g, "");
  return terms.every(t => {
    if (text.includes(t)) return true;
    const digits = t.replace(/\D/g, "");
    return digits.length >= 3 && digits.length === t.replace(/[\s\-().+]/g, "").length && phoneDigits.includes(digits);
  });
}
