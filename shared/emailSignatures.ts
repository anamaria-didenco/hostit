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
