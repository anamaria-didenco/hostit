/**
 * Email-signature profiles, as the compose modal shows them and email.send
 * applies them — one helper so what you see in the modal is what goes out.
 *
 * Profiles live in venueSettings.emailSignatures (Settings → Email →
 * Signatures). Venues that only ever set the older single signature
 * (emailSignature / emailSignatureLogo) get it as one built-in profile.
 * The first profile is the default.
 */
export type SignatureProfile = {
  id: string;
  label?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  signature?: string | null;
  signatureLogo?: string | null;
  /** Job title shown under the name (e.g. "Events Manager"). */
  title?: string | null;
  /** Headshot of the person responding, as a data URL. Rendered round,
   *  Gmail-style, to the left of the name/title. */
  photo?: string | null;
};

export const LEGACY_SIGNATURE_ID = "venue-signature";

type VenueSigFields = {
  name?: string | null;
  smtpFromName?: string | null;
  emailSignature?: string | null;
  emailSignatureLogo?: string | null;
  emailSignatures?: unknown;
};

export function signatureProfiles(vs: VenueSigFields | null | undefined): SignatureProfile[] {
  const raw = Array.isArray(vs?.emailSignatures) ? (vs!.emailSignatures as any[]) : [];
  const profiles = raw.filter((p: any) => p && typeof p.id === "string" && p.id) as SignatureProfile[];
  if (profiles.length > 0) return profiles;
  const text = (vs?.emailSignature ?? "").trim();
  const logo = (vs?.emailSignatureLogo ?? "").trim();
  if (text || logo) {
    return [{ id: LEGACY_SIGNATURE_ID, label: "Venue signature", signature: vs?.emailSignature ?? "", signatureLogo: logo }];
  }
  return [];
}

/** The profile a new email starts with, or null when the venue has none. */
export function defaultSignatureId(vs: VenueSigFields | null | undefined): string | null {
  return signatureProfiles(vs)[0]?.id ?? null;
}

/**
 * The From display name an email goes out under: the picked profile's sender
 * name when it sets one, else the venue's configured From name (Settings →
 * Email), else the venue name.
 */
export function effectiveFromName(vs: VenueSigFields | null | undefined, profile?: SignatureProfile | null): string {
  return (profile?.fromName ?? "").trim()
    || (vs?.smtpFromName ?? "").trim()
    || (vs?.name ?? "").trim()
    || "VenueFlowHQ";
}

export function signatureLabel(p: SignatureProfile): string {
  return (p.label ?? "").trim() || (p.fromName ?? "").trim() || "Untitled signature";
}

/** Venue brand fields the signature needs — a subset of venueSettings. */
export type SignatureVenue = {
  name?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  brandAccentColor?: string | null;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Escape, then turn newlines into <br> so a multi-line sign-off keeps its shape. */
function escMultiline(s: string): string {
  return esc(s).replace(/\r?\n/g, "<br>");
}

/**
 * The branded, Gmail-style signature block, built the SAME way for the compose
 * preview and the sent email: a round headshot on the left, then the person's
 * name + job title and the venue's logo + name, with a brand-accent rule down
 * the side. Returns "" when there's nothing to show.
 *
 * `srcs` overrides the image URLs actually used in the <img> tags — the server
 * passes `cid:` references (the photo/logo ride along as inline attachments, so
 * they render in the recipient's inbox instead of being stripped like data:
 * URLs often are); the browser preview passes nothing and uses the data URLs
 * directly. Pass `null` for an src to omit that image.
 */
export function renderSignatureHtml(
  profile: SignatureProfile,
  venue?: SignatureVenue | null,
  srcs?: { photo?: string | null; logo?: string | null },
): string {
  const accent = ((venue?.brandAccentColor || venue?.primaryColor || "#2f5488") as string).trim() || "#2f5488";
  const name = (profile.fromName ?? profile.label ?? "").trim();
  const title = (profile.title ?? "").trim();
  const venueName = (venue?.name ?? "").trim();
  const sigText = (profile.signature ?? "").trim();
  const photoSrc = srcs && "photo" in srcs ? srcs.photo : (profile.photo ?? "");
  const logoSrc = srcs && "logo" in srcs ? srcs.logo : ((profile.signatureLogo || venue?.logoUrl) ?? "");

  if (!name && !title && !venueName && !sigText && !photoSrc && !logoSrc) return "";

  const photoCell = photoSrc
    ? `<td style="vertical-align:top;padding-right:16px;width:72px"><img src="${esc(photoSrc)}" width="72" height="72" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;border:2px solid ${esc(accent)}"></td>`
    : "";

  const nameRow = name ? `<div style="font-size:15px;font-weight:bold;color:#1a1a1a;line-height:1.3">${esc(name)}</div>` : "";
  const titleRow = title ? `<div style="font-size:13px;font-weight:600;color:${esc(accent)};line-height:1.3;margin-top:1px">${esc(title)}</div>` : "";
  const venueRow = (logoSrc || venueName)
    ? `<div style="margin-top:8px">${logoSrc ? `<img src="${esc(logoSrc)}" alt="" style="height:22px;width:auto;vertical-align:middle;margin-right:8px">` : ""}${venueName ? `<span style="font-size:13px;font-weight:bold;color:#333;vertical-align:middle">${esc(venueName)}</span>` : ""}</div>`
    : "";
  const sigRow = sigText ? `<div style="font-size:13px;color:#555;line-height:1.5;margin-top:8px">${escMultiline(sigText)}</div>` : "";

  const detailBorder = photoSrc ? `border-left:2px solid ${esc(accent)};padding-left:16px;` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:22px;font-family:Arial,Helvetica,sans-serif"><tr>${photoCell}<td style="vertical-align:top;${detailBorder}">${nameRow}${titleRow}${venueRow}${sigRow}</td></tr></table>`;
}
