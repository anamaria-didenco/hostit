/**
 * Render a venue's custom HTML proposal template (Settings → Brand Pack) with a
 * proposal's data merged in. Used by both the client proposal page
 * (proposals.getByToken) and the PDF (proposalPdf), so a branded template looks
 * the same in the browser and on paper.
 *
 * Order matters for safety: tokens are substituted FIRST (scalars HTML-escaped,
 * blocks are our own trusted HTML), THEN the whole document is run through
 * cleanProposalHtml. Substituting first lets inline styles reference brand
 * tokens (e.g. style="background:{{accentColor}}") without the sanitiser
 * dropping the property; sanitising last strips anything unsafe the pasted
 * template introduced (script, handlers, url() in CSS, bad schemes).
 */
import { escapeHtml as esc } from "./sanitizeHtml";
import { cleanProposalHtml } from "./sanitizeHtml";
import { venueBrand } from "../shared/brand";
import { DEFAULT_VENUE_TZ, formatEventDate } from "../shared/eventDate";
import { proposalBlockMap, nzd, type ProposalBlockData } from "./proposalBlocks";
import { KNOWN_PROPOSAL_TOKEN_NAMES } from "../shared/proposalTemplate";

function fmtDate(raw: any, tz: string): string {
  if (!raw) return "";
  return formatEventDate(raw, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, tz);
}

/** Single-value token replacements, already HTML-escaped. */
export function proposalScalarMap(data: ProposalBlockData): Record<string, string> {
  const { proposal, lead, venue, brand } = data;
  const tz = venue?.timezone || DEFAULT_VENUE_TZ;
  const clientName = [lead?.firstName, lead?.lastName].filter(Boolean).join(" ");
  const address = venue?.address || [venue?.addressLine1, venue?.suburb, venue?.city].filter(Boolean).join(", ");
  const website = (venue?.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return {
    proposalTitle: esc(proposal?.title),
    clientName: esc(clientName),
    clientFirstName: esc(lead?.firstName),
    clientEmail: esc(lead?.email),
    clientPhone: esc(lead?.phone),
    company: esc(lead?.company),
    eventDate: esc(fmtDate(proposal?.eventDate, tz)),
    eventEndDate: esc(fmtDate(proposal?.eventEndDate, tz)),
    guestCount: esc(proposal?.guestCount != null ? String(proposal.guestCount) : ""),
    spaceName: esc(proposal?.spaceName),
    validUntil: esc(proposal?.expiresAt ? formatEventDate(proposal.expiresAt, { day: "numeric", month: "long", year: "numeric" }, tz) : ""),
    subtotal: esc(nzd(proposal?.subtotalNzd)),
    gst: esc(nzd(proposal?.taxNzd)),
    total: esc(nzd(proposal?.totalNzd)),
    deposit: esc(nzd(proposal?.depositNzd)),
    depositPercent: esc(String(Number(proposal?.depositPercent ?? 25))),
    taxPercent: esc(String(Number(proposal?.taxPercent ?? 15))),
    venueName: esc(venue?.name),
    venueTagline: esc(venue?.tagline),
    venueEmail: esc(venue?.email),
    venuePhone: esc(venue?.phone),
    venueAddress: esc(address),
    venueCity: esc(venue?.city),
    venueWebsite: esc(website),
    venueLogoUrl: esc(venue?.logoUrl ?? ""),
    // Brand tokens are used inside inline styles, so they must be the raw value
    // (not entity-encoded) — they are sourced from the venue's own settings and
    // constrained to colours/font stacks.
    accentColor: brand.accent,
    onAccentColor: brand.onAccent,
    serifFont: brand.serif,
    sansFont: brand.sans,
  };
}

/**
 * Substitute {{tokens}} in `template` then sanitise. Unknown tokens are removed
 * so a stray placeholder never reaches the client as raw "{{…}}".
 */
export function renderProposalTemplate(
  template: string,
  data: ProposalBlockData,
  mode: "web" | "pdf",
): string {
  const scalars = proposalScalarMap(data);
  const blocks = proposalBlockMap(data);
  // One pass over the ORIGINAL template: replacements are not re-scanned, so a
  // block's own HTML can't accidentally match another token.
  const merged = String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => {
    if (Object.prototype.hasOwnProperty.call(blocks, name)) return blocks[name];
    if (Object.prototype.hasOwnProperty.call(scalars, name)) return scalars[name];
    // Known-but-unmapped or unknown: drop it rather than leak braces.
    if (KNOWN_PROPOSAL_TOKEN_NAMES.has(name)) return "";
    return "";
  });
  const safe = cleanProposalHtml(merged);
  if (mode === "web") return safe;

  // PDF: wrap in a full document that loads the brand fonts and sets a base.
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(data.proposal?.title ?? "Proposal")}</title>
<style>
  @import url('${data.brand.fontLink}');
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${data.brand.sans}; color: #1a1a1a; background: #fff; font-size: 11pt; }
  img { max-width: 100%; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>${safe}</body></html>`;
}
