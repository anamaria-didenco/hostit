import React, { useState } from "react";
import { Palette, Type, X, Check } from "lucide-react";
import { useAppTheme, COLOUR_THEMES, FONT_THEMES, ColourTheme, FontTheme } from "@/contexts/ThemeContext";

export function ThemeSwitcher() {
  const { colourTheme, fontTheme, setColourTheme, setFontTheme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"colour" | "font">("colour");

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Change theme"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Palette className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Theme</span>
      </button>

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-sm mx-4 mb-4 sm:mb-0 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setTab("colour")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  tab === "colour"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                Colour
              </button>
              <button
                onClick={() => setTab("font")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  tab === "font"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                Font
              </button>
            </div>

            {/* Colour tab */}
            {tab === "colour" && (
              <div className="p-4 grid grid-cols-3 gap-2.5 max-h-80 overflow-y-auto">
                {COLOUR_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setColourTheme(t.id as ColourTheme)}
                    className={`relative flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-all ${
                      colourTheme === t.id
                        ? "border-primary shadow-sm"
                        : "border-transparent hover:border-border"
                    }`}
                  >
                    {/* Swatch grid */}
                    <div className="w-full aspect-square rounded-lg overflow-hidden grid grid-cols-2 gap-0.5">
                      {t.swatches.slice(0, 4).map((hex, i) => (
                        <div
                          key={i}
                          className="w-full h-full"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-medium text-foreground leading-tight text-center">
                      {t.label}
                    </span>
                    {colourTheme === t.id && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Font tab */}
            {tab === "font" && (
              <div className="p-4 flex flex-col gap-2 max-h-80 overflow-y-auto">
                {FONT_THEMES.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFontTheme(f.id as FontTheme)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      fontTheme === f.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span
                        className="text-base font-semibold text-foreground leading-tight"
                        style={{ fontFamily: getFontFamily(f.id, "heading") }}
                      >
                        {f.label}
                      </span>
                      <span
                        className="text-xs text-muted-foreground"
                        style={{ fontFamily: getFontFamily(f.id, "body") }}
                      >
                        {f.heading} · {f.body}
                      </span>
                    </div>
                    {fontTheme === f.id && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground text-center">
                Theme is saved automatically to your browser
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getFontFamily(id: string, role: "heading" | "body"): string {
  const map: Record<string, { heading: string; body: string }> = {
    modern:    { heading: "'Inter', sans-serif",              body: "'Inter', sans-serif" },
    editorial: { heading: "'Playfair Display', serif",        body: "'Lato', sans-serif" },
    luxe:      { heading: "'Cormorant Garamond', serif",      body: "'Jost', sans-serif" },
    dm:        { heading: "'DM Serif Display', serif",        body: "'DM Sans', sans-serif" },
    classic:   { heading: "'Libre Baskerville', serif",       body: "'Source Sans 3', sans-serif" },
    literary:  { heading: "'Fraunces', serif",                body: "'Nunito', sans-serif" },
    bold:      { heading: "'Bebas Neue', sans-serif",         body: "'Montserrat', sans-serif" },
  };
  return map[id]?.[role] ?? "'Inter', sans-serif";
}
