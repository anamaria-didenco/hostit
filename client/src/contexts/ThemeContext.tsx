import React, { createContext, useContext, useEffect, useState } from "react";

// ─── Colour Themes ────────────────────────────────────────────────────────────
export type ColourTheme =
  | "sage"          // default — sage green + warm cream
  | "forest"        // deep forest + gold
  | "dusty-merlot"  // dusty merlot + warm white + chartreuse
  | "brique"        // brique + pistache + rose sorbet
  | "charcoal"      // dark charcoal + gold
  | "olivie"        // teal + salmon
  | "seafoam"       // seafoam green + pink panther + warm white
  | "retro-warm"    // orange + olive + blush
  | "claret"        // deep claret + powder blue
  | "midnight-rose" // midnight navy + rose gold
  | "matcha"        // matcha green + cream + terracotta
  | "champagne";    // champagne + deep plum

// ─── Font Themes ─────────────────────────────────────────────────────────────
export type FontTheme =
  | "modern"      // Inter (current default)
  | "editorial"   // Playfair Display + Lato
  | "luxe"        // Cormorant Garamond + Jost
  | "dm"          // DM Serif Display + DM Sans
  | "classic"     // Libre Baskerville + Source Sans 3
  | "literary"    // Fraunces + Nunito
  | "bold"        // Bebas Neue + Montserrat

export const COLOUR_THEMES: { id: ColourTheme; label: string; swatches: string[] }[] = [
  { id: "sage",          label: "Sage",          swatches: ["#8D957E", "#f5f2eb", "#5a6b52", "#c9a84c"] },
  { id: "forest",        label: "Forest",         swatches: ["#2d5a27", "#FBF7E8", "#c9a84c", "#1a3d15"] },
  { id: "dusty-merlot",  label: "Dusty Merlot",   swatches: ["#62202F", "#FBF7E8", "#BFAD0E", "#C9DAA8"] },
  { id: "brique",        label: "Brique",          swatches: ["#741D28", "#FFF0F3", "#B9AC39", "#FF88BE"] },
  { id: "charcoal",      label: "Charcoal",        swatches: ["#1a1a2e", "#f0ede8", "#d4a843", "#2e2e42"] },
  { id: "olivie",        label: "Olivie",           swatches: ["#1a5c5c", "#edf5f5", "#e8734a", "#0d2e2e"] },
  { id: "seafoam",       label: "Seafoam",          swatches: ["#C9DAA8", "#FBF7E8", "#F5D0C6", "#62202F"] },
  { id: "retro-warm",    label: "Retro Warm",       swatches: ["#f94e19", "#d1c260", "#f5c8c0", "#3d3d1a"] },
  { id: "claret",        label: "Claret",            swatches: ["#6b2338", "#b7d8fe", "#f0e8d8", "#2d0d18"] },
  { id: "midnight-rose", label: "Midnight Rose",    swatches: ["#1a1a3e", "#e8b4c0", "#f5f0ea", "#c9a84c"] },
  { id: "matcha",        label: "Matcha",            swatches: ["#5a7a4a", "#f5f0e8", "#c87941", "#2d3d20"] },
  { id: "champagne",     label: "Champagne",         swatches: ["#f0d8a8", "#3d1a3d", "#e8c8a0", "#1a0d1a"] },
];

export const FONT_THEMES: { id: FontTheme; label: string; heading: string; body: string }[] = [
  { id: "modern",    label: "Modern",    heading: "Inter",               body: "Inter" },
  { id: "editorial", label: "Editorial", heading: "Playfair Display",    body: "Lato" },
  { id: "luxe",      label: "Luxe",      heading: "Cormorant Garamond",  body: "Jost" },
  { id: "dm",        label: "DM",        heading: "DM Serif Display",    body: "DM Sans" },
  { id: "classic",   label: "Classic",   heading: "Libre Baskerville",   body: "Source Sans 3" },
  { id: "literary",  label: "Literary",  heading: "Fraunces",            body: "Nunito" },
  { id: "bold",      label: "Bold",      heading: "Bebas Neue",          body: "Montserrat" },
];

// ─── Font CSS variable maps ───────────────────────────────────────────────────
const FONT_HEADING_MAP: Record<FontTheme, string> = {
  modern:    "'Inter', -apple-system, system-ui, sans-serif",
  editorial: "'Playfair Display', Georgia, serif",
  luxe:      "'Cormorant Garamond', Georgia, serif",
  dm:        "'DM Serif Display', Georgia, serif",
  classic:   "'Libre Baskerville', Georgia, serif",
  literary:  "'Fraunces', Georgia, serif",
  bold:      "'Bebas Neue', 'Impact', sans-serif",
};

const FONT_BODY_MAP: Record<FontTheme, string> = {
  modern:    "'Inter', -apple-system, system-ui, sans-serif",
  editorial: "'Lato', -apple-system, system-ui, sans-serif",
  luxe:      "'Jost', -apple-system, system-ui, sans-serif",
  dm:        "'DM Sans', -apple-system, system-ui, sans-serif",
  classic:   "'Source Sans 3', -apple-system, system-ui, sans-serif",
  literary:  "'Nunito', -apple-system, system-ui, sans-serif",
  bold:      "'Montserrat', -apple-system, system-ui, sans-serif",
};

// ─── Context ─────────────────────────────────────────────────────────────────
interface AppThemeContextType {
  colourTheme: ColourTheme;
  fontTheme: FontTheme;
  setColourTheme: (t: ColourTheme) => void;
  setFontTheme: (t: FontTheme) => void;
}

const AppThemeContext = createContext<AppThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colourTheme, setColourThemeState] = useState<ColourTheme>(() => {
    return (localStorage.getItem("hostit-colour-theme") as ColourTheme) || "sage";
  });
  const [fontTheme, setFontThemeState] = useState<FontTheme>(() => {
    return (localStorage.getItem("hostit-font-theme") as FontTheme) || "modern";
  });

  // Apply colour theme as data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", colourTheme);
    localStorage.setItem("hostit-colour-theme", colourTheme);
  }, [colourTheme]);

  // Apply font theme as CSS variables on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--font-heading", FONT_HEADING_MAP[fontTheme]);
    root.style.setProperty("--font-body", FONT_BODY_MAP[fontTheme]);
    localStorage.setItem("hostit-font-theme", fontTheme);
  }, [fontTheme]);

  const setColourTheme = (t: ColourTheme) => setColourThemeState(t);
  const setFontTheme = (t: FontTheme) => setFontThemeState(t);

  return (
    <AppThemeContext.Provider value={{ colourTheme, fontTheme, setColourTheme, setFontTheme }}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within ThemeProvider");
  return ctx;
}

// Keep legacy useTheme export for backward compatibility (sonner etc.)
export function useTheme() {
  return { theme: "light" as const, toggleTheme: undefined, switchable: false };
}
