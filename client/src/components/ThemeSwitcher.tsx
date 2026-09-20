import React, { useState } from "react";
import { Palette, Type, Check } from "lucide-react";
import { useAppTheme, COLOUR_THEMES, FONT_THEMES, ColourTheme, FontTheme } from "@/contexts/ThemeContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function ThemeSwitcher() {
  const { colourTheme, fontTheme, setColourTheme, setFontTheme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"colour" | "font">("colour");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Trigger button */}
      <DialogTrigger asChild>
        <button
          title="Change theme"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Palette className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Theme</span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-sm rounded-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="text-sm font-semibold text-foreground">Appearance</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as "colour" | "font")}>
          {/* Tabs */}
          <TabsList className="w-full border-b border-border h-auto">
            <TabsTrigger value="colour" className="flex-1 py-2.5 normal-case font-medium tracking-normal text-xs">
              <Palette className="w-3.5 h-3.5" />
              Colour
            </TabsTrigger>
            <TabsTrigger value="font" className="flex-1 py-2.5 normal-case font-medium tracking-normal text-xs">
              <Type className="w-3.5 h-3.5" />
              Font
            </TabsTrigger>
          </TabsList>

          {/* Colour tab */}
          <TabsContent value="colour" className="p-4 grid grid-cols-3 gap-2.5 max-h-80 overflow-y-auto">
            {COLOUR_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setColourTheme(t.id as ColourTheme)}
                aria-pressed={colourTheme === t.id}
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
          </TabsContent>

          {/* Font tab */}
          <TabsContent value="font" className="p-4 flex flex-col gap-2 max-h-80 overflow-y-auto">
            {FONT_THEMES.map((f) => (
              <button
                key={f.id}
                onClick={() => setFontTheme(f.id as FontTheme)}
                aria-pressed={fontTheme === f.id}
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
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            Theme is saved automatically to your browser
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getFontFamily(id: string, role: "heading" | "body"): string {
  const map: Record<string, { heading: string; body: string }> = {
    modern:    { heading: "'Spectral', serif",                body: "'Hanken Grotesk', sans-serif" },
    editorial: { heading: "'Playfair Display', serif",        body: "'Lato', sans-serif" },
    luxe:      { heading: "'Cormorant Garamond', serif",      body: "'Jost', sans-serif" },
    dm:        { heading: "'DM Serif Display', serif",        body: "'DM Sans', sans-serif" },
    classic:   { heading: "'Libre Baskerville', serif",       body: "'Source Sans 3', sans-serif" },
    literary:  { heading: "'Fraunces', serif",                body: "'Nunito', sans-serif" },
    bold:      { heading: "'Bebas Neue', sans-serif",         body: "'Montserrat', sans-serif" },
  };
  return map[id]?.[role] ?? "'Hanken Grotesk', sans-serif";
}
