/**
 * A venue's document branding (Settings → Brand Pack): accent colour, font
 * pairing and logo. Shared by the BEO, the proposal PDF and the client's
 * proposal page so they all look like the venue.
 */

// Keys are stored on venueSettings.brandFontKey and mirrored in the Brand
// Pack picker (Dashboard.tsx). "editorial" is the default.
export const BRAND_FONT_PAIRS: Record<string, { label: string; serif: string; sans: string; link: string }> = {
  editorial: {
    label: "Editorial (Spectral · Hanken Grotesk)",
    serif: "'Spectral',Georgia,serif",
    sans: "'Hanken Grotesk',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap",
  },
  classic: {
    label: "Classic (Playfair Display · Source Sans)",
    serif: "'Playfair Display',Georgia,serif",
    sans: "'Source Sans 3',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,500&family=Source+Sans+3:wght@400;500;600;700&display=swap",
  },
  modern: {
    label: "Modern (Fraunces · Inter)",
    serif: "'Fraunces',Georgia,serif",
    sans: "'Inter',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap",
  },
  elegant: {
    label: "Elegant (Cormorant Garamond · Montserrat)",
    serif: "'Cormorant Garamond',Georgia,serif",
    sans: "'Montserrat',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Montserrat:wght@400;500;600;700&display=swap",
  },
  clean: {
    label: "Clean (DM Serif Display · DM Sans)",
    serif: "'DM Serif Display',Georgia,serif",
    sans: "'DM Sans',Arial,sans-serif",
    link: "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap",
  },
};

function safeHex(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(s) ? s : fallback;
}

/** Dark or light text for a solid accent background. */
export function inkOnAccent(hex: string): string {
  const h = hex.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#fff";
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#1a1a1a" : "#fff";
}

export type VenueBrand = { accent: string; onAccent: string; serif: string; sans: string; fontLink: string; logoUrl: string | null };

/** The Brand Pack accent if set, else the venue's colour, else navy. */
export function venueBrand(venue: { brandAccentColor?: string | null; primaryColor?: string | null; brandFontKey?: string | null; logoUrl?: string | null } | null | undefined): VenueBrand {
  const accent = safeHex(venue?.brandAccentColor, safeHex(venue?.primaryColor, "#2f5488"));
  const pair = BRAND_FONT_PAIRS[String(venue?.brandFontKey ?? "editorial")] ?? BRAND_FONT_PAIRS.editorial;
  return { accent, onAccent: inkOnAccent(accent), serif: pair.serif, sans: pair.sans, fontLink: pair.link, logoUrl: venue?.logoUrl || null };
}
