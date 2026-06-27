# Handoff — VenueFlow Editorial Rebrand

Pick-up note for continuing this work in **Claude Code on the web** (claude.ai/code)
or any fresh session. The conversation context does not travel; the committed code does.

- **Repo:** `anamaria-didenco/hostit` · branch `main`
- **Design source of truth:** Claude Design project **"VenueFlow Design System"**
  (`claude.ai/design/p/136edd87-09ca-4030-a1dc-fe0cc18d00c0`), read via the
  Claude Design MCP (`DesignSync`). Static copy also in
  `~/Documents/design_handoff_editorial_rebrand` and inside the project under
  `design_handoff_editorial_rebrand/`.
- **Stack:** React 19 + Vite + Tailwind v4 + shadcn/ui. `node_modules` is NOT
  installed in these environments — do not run dev/build/tests unless you first
  `pnpm install`.

## Status — DONE (merged to `main`)
The editorial "paper" rebrand is fully applied (PR #2 + PR #3, both merged):

- **Foundation:** Spectral + Hanken Grotesk wired in `client/index.html`;
  editorial palette + radius tokens, `h1–h3 → Spectral` rule, tracked-uppercase
  label utilities, and `@theme inline` `--font-serif`/`--font-sans` mappings in
  `client/src/index.css`. Default `sage` theme remapped to editorial blue.
- **Primitives restyled:** Button, Badge, Card, Input, Textarea, Tabs.
- **Pattern components added:** `SectionHead`, `StatusBadge` (in `badge.tsx`),
  `InfoBand`, `ChangeFlag` (under `client/src/components/ui/`).
- **Screens:** marketing landing (`pages/Home.tsx`), Dashboard overview/pipeline/
  calendar tabs (`pages/Dashboard.tsx`), Runsheet (`pages/RunsheetBuilder.tsx`,
  `pages/Checklist.tsx`), and the BEO/proposal doc (server `beoPdf.ts` + builder).
- **From the design project's `repo_patch`:** print dietary alert uses editorial
  amber (`#b07c25`/`#f7efdd`); `.vf-blue-sidebar` opt-in utility added.

## ⚠️ Guardrails — do NOT regress these
1. **Keep the white-label theme/font picker working.** The strings
   `'Inter'` / `'Playfair Display'` / `'Cormorant Garamond'` / `'DM Serif Display'`
   in `ThemeSwitcher.tsx`, `contexts/ThemeContext.tsx`, `pages/LeadForm.tsx`, and
   `pages/Dashboard.tsx` (font-picker settings) are INTENTIONAL font-theme
   definitions — not rebrand leftovers. Do not collapse them to Spectral/Hanken.
2. **`#6b98e7` stays as the bright accent / chart colour** (`--vf-blue`, charts,
   `.text-sage-light`). Do not swap it to `#2f5488`.
3. **Do NOT run the project's blanket `editorial-codemod.mjs`** on this repo — a
   dry run showed all 22 hits are the two items above (font picker + accent), i.e.
   100% regressions. Its only valid swap (`#d97706 → #b07c25`) already shipped.
4. The app shell is a **cream top-nav bar** (Home/Events/Tasks/Reports/Settings in
   `Dashboard.tsx`), not a left sidebar. `DashboardLayout.tsx`'s Sidebar is an
   unused scaffold.

## Open / optional
- **Canonical `repo_patch` parity (cosmetic):** the project's `repo_patch/client/src/index.css`
  uses `--radius: 0.5rem` and a **cream-default** sidebar; this repo uses
  `0.375rem` and a deep-blue default. Adopt verbatim only if desired — but the
  canonical file also omits the `--font-serif`/`--font-sans` @theme mappings and
  drops font preloads the picker needs, so don't blind-overwrite; port just those
  two values.
- Two reference flourishes intentionally skipped (no backing data): dashboard
  "June Goal" progress panel; runsheet staffing box.

## Visual targets
Six screenshots in the design project / handoff: `screenshots/{dashboard,pipeline,
calendar,runsheet,beo,marketing}.png`.
