/**
 * Per-venue custom HTML proposal template (Settings → Brand Pack).
 *
 * A venue pastes/edits a branded HTML document here; when it's enabled, the
 * client proposal page and the PDF render it — with {{token}} and {{block}}
 * placeholders filled from the proposal, lead and venue — instead of the
 * built-in layout. This file holds only the token catalogue (for the editor's
 * help + validation) and a ready-made starter template; the actual rendering
 * and block HTML live server-side (server/proposalBlocks.ts,
 * server/proposalTemplateRender.ts) so they can use the venue's branding and
 * the proposal's menus/drinks/pricing, and so the untrusted template is
 * sanitised before any data is merged in.
 *
 * Authoring rule: use INLINE styles (like HTML email). <script>, <style>,
 * <iframe>, <link> and event handlers are stripped on save/render; images must
 * be https or data: URLs. The {{accentColor}}, {{serifFont}} and {{sansFont}}
 * tokens expose the Brand Pack so inline styles can match the venue.
 */

export type ProposalTokenKind = "scalar" | "block";

export interface ProposalTemplateToken {
  token: string;
  label: string;
  kind: ProposalTokenKind;
}

/** Single-value placeholders (HTML-escaped when merged). */
export const PROPOSAL_SCALAR_TOKENS: ProposalTemplateToken[] = [
  { token: "{{proposalTitle}}", label: "Proposal title", kind: "scalar" },
  { token: "{{clientName}}", label: "Client full name", kind: "scalar" },
  { token: "{{clientFirstName}}", label: "Client first name", kind: "scalar" },
  { token: "{{clientEmail}}", label: "Client email", kind: "scalar" },
  { token: "{{clientPhone}}", label: "Client phone", kind: "scalar" },
  { token: "{{company}}", label: "Company", kind: "scalar" },
  { token: "{{eventDate}}", label: "Event date", kind: "scalar" },
  { token: "{{eventEndDate}}", label: "Event end date", kind: "scalar" },
  { token: "{{guestCount}}", label: "Guest count", kind: "scalar" },
  { token: "{{spaceName}}", label: "Space / room", kind: "scalar" },
  { token: "{{validUntil}}", label: "Valid-until date", kind: "scalar" },
  { token: "{{subtotal}}", label: "Subtotal", kind: "scalar" },
  { token: "{{gst}}", label: "GST amount", kind: "scalar" },
  { token: "{{total}}", label: "Total (incl. GST)", kind: "scalar" },
  { token: "{{deposit}}", label: "Deposit amount", kind: "scalar" },
  { token: "{{depositPercent}}", label: "Deposit %", kind: "scalar" },
  { token: "{{taxPercent}}", label: "GST %", kind: "scalar" },
  { token: "{{venueName}}", label: "Venue name", kind: "scalar" },
  { token: "{{venueTagline}}", label: "Venue tagline", kind: "scalar" },
  { token: "{{venueEmail}}", label: "Venue email", kind: "scalar" },
  { token: "{{venuePhone}}", label: "Venue phone", kind: "scalar" },
  { token: "{{venueAddress}}", label: "Venue address", kind: "scalar" },
  { token: "{{venueCity}}", label: "Venue city", kind: "scalar" },
  { token: "{{venueWebsite}}", label: "Venue website", kind: "scalar" },
  { token: "{{venueLogoUrl}}", label: "Logo URL (for src/background)", kind: "scalar" },
  { token: "{{accentColor}}", label: "Brand accent colour", kind: "scalar" },
  { token: "{{onAccentColor}}", label: "Ink colour for the accent", kind: "scalar" },
  { token: "{{serifFont}}", label: "Brand serif font stack", kind: "scalar" },
  { token: "{{sansFont}}", label: "Brand sans font stack", kind: "scalar" },
];

/** Placeholders replaced with a ready-made, brand-styled HTML block. */
export const PROPOSAL_BLOCK_TOKENS: ProposalTemplateToken[] = [
  { token: "{{venueLogo}}", label: "Logo image (or venue name)", kind: "block" },
  { token: "{{intro}}", label: "Intro message block", kind: "block" },
  { token: "{{photos}}", label: "Photo gallery", kind: "block" },
  { token: "{{pricing}}", label: "Pricing table + totals", kind: "block" },
  { token: "{{packages}}", label: "Menu package choices", kind: "block" },
  { token: "{{menu}}", label: "Menu(s)", kind: "block" },
  { token: "{{drinks}}", label: "Drinks & bar", kind: "block" },
  { token: "{{terms}}", label: "Terms & conditions", kind: "block" },
];

export const PROPOSAL_TEMPLATE_TOKENS: ProposalTemplateToken[] = [
  ...PROPOSAL_SCALAR_TOKENS,
  ...PROPOSAL_BLOCK_TOKENS,
];

/** The set of token names (without braces) the renderer knows how to fill. */
export const KNOWN_PROPOSAL_TOKEN_NAMES: Set<string> = new Set(
  PROPOSAL_TEMPLATE_TOKENS.map((t) => t.token.replace(/[{}]/g, "")),
);

/**
 * A complete, branded starter template. Inline-styled so it survives
 * sanitisation and renders identically in the browser and the PDF. The venue
 * edits this to match their look; every {{…}} is filled at send time.
 */
export const DEFAULT_PROPOSAL_TEMPLATE = `<div style="max-width:720px;margin:0 auto;font-family:{{sansFont}};color:#1a1a1a;background:#ffffff;">

  <!-- Header -->
  <div style="background:{{accentColor}};color:{{onAccentColor}};padding:36px 40px;">
    <div style="font-size:13px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;margin-bottom:10px;">{{venueName}}</div>
    <div style="font-family:{{serifFont}};font-size:34px;font-weight:600;line-height:1.1;">{{proposalTitle}}</div>
    <div style="margin-top:8px;font-size:14px;opacity:0.9;">{{eventDate}}</div>
  </div>

  <!-- Key facts -->
  <div style="display:flex;flex-wrap:wrap;gap:28px;padding:18px 40px;background:#f5f0eb;border-bottom:2px solid {{accentColor}};font-size:13px;">
    <div><div style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">Prepared for</div><div style="font-weight:600;">{{clientName}}</div></div>
    <div><div style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">Guests</div><div style="font-weight:600;">{{guestCount}}</div></div>
    <div><div style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">Space</div><div style="font-weight:600;">{{spaceName}}</div></div>
    <div><div style="text-transform:uppercase;letter-spacing:0.1em;font-size:11px;color:#888;">Valid until</div><div style="font-weight:600;">{{validUntil}}</div></div>
  </div>

  <div style="padding:32px 40px;">

    {{intro}}

    {{photos}}

    {{pricing}}

    {{packages}}

    {{menu}}

    {{drinks}}

    {{terms}}

  </div>

  <!-- Footer -->
  <div style="background:#f5f0eb;border-top:2px solid {{accentColor}};padding:20px 40px;font-size:12px;color:#777;">
    <div style="font-family:{{serifFont}};font-size:16px;color:{{accentColor}};margin-bottom:4px;">{{venueName}}</div>
    <div>{{venueAddress}}</div>
    <div>{{venuePhone}} · {{venueEmail}} · {{venueWebsite}}</div>
  </div>

</div>`;
