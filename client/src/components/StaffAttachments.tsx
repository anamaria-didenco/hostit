import { FileText } from "lucide-react";

/**
 * The PDFs a venue attached in the Runsheet Builder (menus, maps, floor plans),
 * as staff see them on the live staff link.
 *
 * Only same-origin /uploads/*.pdf links are shown: the link needs no login, so
 * a bad row must never be able to put an outside link on it. The server only
 * sends files it still has; this is the second check.
 */

type Attachment = { id?: string | number; name?: string | null; url?: string | null; size?: number | null };

const SAFE_URL = /^\/uploads\/[A-Za-z0-9._-]+\.pdf$/;

export function safeStaffAttachments(value: unknown): Attachment[] {
  return (Array.isArray(value) ? value : []).filter(
    (a: any) => typeof a?.url === "string" && SAFE_URL.test(a.url),
  );
}

function kb(size?: number | null): string | null {
  if (size == null || !Number.isFinite(Number(size)) || Number(size) <= 0) return null;
  return `${Math.max(1, Math.round(Number(size) / 1024))} KB`;
}

export default function StaffAttachments({
  attachments,
  variant = "portal",
}: {
  attachments: unknown;
  /** "portal": the staff link's Runsheet tab. "phone": the larger Now & Next type. */
  variant?: "portal" | "phone";
}) {
  const list = safeStaffAttachments(attachments);
  if (list.length === 0) return null;
  const phone = variant === "phone";
  const headingId = `vf-attachments-${variant}`;
  return (
    <section
      aria-labelledby={headingId}
      className={phone ? "bg-white border border-gold" : "bg-white border border-gold/30 shadow-sm"}
    >
      <div className={phone ? "px-4 pt-3 pb-1" : "px-5 py-3 border-b border-gold/30"}>
        <h2
          id={headingId}
          className={phone ? "font-bebas tracking-widest text-[12px] text-stone" : "font-bebas tracking-widest text-sm text-ink/60"}
        >
          {phone ? "Files from your manager" : "ATTACHMENTS"}
        </h2>
      </div>
      <ul className={phone ? "divide-y divide-stone-200" : "divide-y divide-gold/20"}>
        {list.map((att, i) => (
          <li key={att.id ?? i}>
            <a
              href={att.url!}
              target="_blank"
              rel="noopener noreferrer"
              className={
                phone
                  ? "flex items-center gap-3 px-4 py-3 min-h-[52px] hover:bg-linen/50"
                  : "flex items-center gap-3 px-5 py-3 hover:bg-linen/50 transition-colors"
              }
            >
              <FileText aria-hidden="true" className={phone ? "w-5 h-5 text-forest flex-shrink-0" : "w-4 h-4 text-forest flex-shrink-0"} />
              <span className={phone ? "flex-1 min-w-0 font-dm text-[17px] text-ink break-words" : "flex-1 min-w-0 font-dm text-sm text-ink truncate"}>
                {att.name || "Attachment"}
              </span>
              {kb(att.size) && (
                <span className={phone ? "font-dm text-[14px] text-stone flex-shrink-0" : "font-dm text-[11px] text-ink/65 flex-shrink-0"}>
                  {kb(att.size)}
                </span>
              )}
              <span className={phone ? "font-dm text-[15px] font-bold text-forest flex-shrink-0" : "font-bebas tracking-widest text-[11px] text-forest flex-shrink-0"}>
                {phone ? "Open" : "OPEN"}
              </span>
              <span className="sr-only">(PDF, opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
