/**
 * What anyone on the internet may see of a venue's settings: the public
 * enquiry form (venue.getBySlug / venue.getDefault), the client's proposal
 * page (proposals.getByToken) and venue.get for anyone who isn't that
 * venue's own login.
 *
 * An allow-list, not a deny-list. The old deny-list (VENUE_SECRET_FIELDS in
 * routers.ts) let every setting added after it through, so the public form
 * was handing out the staff email list, the staff briefing text, the custom
 * statuses and the raw proposal template. A new column now stays private
 * until it is added here on purpose.
 *
 * Add a field only when a public page reads it: client/src/pages/LeadForm.tsx,
 * client/src/pages/ProposalView.tsx, client/src/pages/EmbedDocs.tsx (the slug)
 * and venueBrand() in shared/brand.ts.
 */
import type { VenueSettings } from "../drizzle/schema";

export const PUBLIC_VENUE_FIELDS = [
  // Who the venue is, and how a client reaches it.
  "ownerId", "slug", "name", "tagline", "city", "phone", "email", "website",
  // Branding: venueBrand() and the proposal page's theme and hero.
  "logoUrl", "logoScale", "coverImageUrl", "bannerImageUrl",
  "primaryColor", "brandAccentColor", "brandFontKey", "themeKey",
  // The enquiry form's own look and wording.
  "leadFormTitle", "leadFormSubtitle", "formSuccessMessage", "customFormFields",
  "formButtonColor", "formCardBg", "formPageBg", "formPageBgImage", "formFont",
  "formGalleryImages", "galleryPhotoHeight",
] as const satisfies readonly (keyof VenueSettings)[];

export type PublicVenueField = (typeof PUBLIC_VENUE_FIELDS)[number];
export type PublicVenue = Pick<VenueSettings, PublicVenueField>;

/** Only the allow-listed fields of a venue row, for anyone without that venue's login. */
export function publicVenue(row: PublicVenue): PublicVenue {
  const out: Partial<PublicVenue> = {};
  for (const key of PUBLIC_VENUE_FIELDS) (out as Record<string, unknown>)[key] = row[key] ?? null;
  return out as PublicVenue;
}
