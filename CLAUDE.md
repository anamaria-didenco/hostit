# VenueFlowHQ — working notes for Claude Code

Gotchas and conventions only. Derive layout/architecture from the code.

## Build & verify
- Typecheck: `pnpm run check` (tsc --noEmit). Build: `pnpm run build` (vite + esbuild — does NOT typecheck).
- Run both before every commit; there is no CI, and merging to `main` auto-deploys to Render.
- Fresh container: `pnpm install`, and for PDF work `npx puppeteer browsers install chrome`.

## Traps that have caused real bugs
- **Colour class names lie.** `.text-forest`, `.bg-forest`, `.text-sage-green`, `.btn-forest` all render VenueFlow NAVY (#2f5488); `.text-sage`/`.text-stormy` are warm grey. Nothing green-named is green. Do not "fix" colours by name.
- **zod strips unknown keys.** The runsheet create/update schemas in `server/routers.ts` whitelist JSON-column fields (`drinksData`, `fnbColumns`, `costItems`, `dietaries`). Adding a field client-side WITHOUT adding it to BOTH zod schemas + the drizzle `$type<>` silently discards it on save (bit us twice: `drinkPrices`, `fnbColumns.price`).
- **Clearing runsheet fields:** send `null`, not `undefined` — the server keeps the old value on `undefined`. Client uses `|| null` in autosave + save payloads; schemas need `.nullable()`.
- **Tenant scoping:** every query/mutation must filter by `ownerId`/`ctx.user.id`. Team-link sessions run under the owner's id — check `ctx.isTeamMember` before returning secrets (see `venue.get`).
- **Escape user text in server-built HTML** (emails, PDFs) via `escapeHtml` from `server/sanitizeHtml.ts`.
- **Puppeteer:** always close the browser in `finally` (see `beoPdf.ts`); leaked Chromium crash-loops the single Render instance.

## Conventions
- Migrations: add `drizzle/NNNN_name.sql` + an entry in `drizzle/meta/_journal.json` + the column in `drizzle/schema.ts`. They auto-apply on boot; duplicate-column 42701 on redeploy is benign.
- BEO/staff/event-pack documents all render from `server/beoPdf.ts` (one HTML string; `?format=html` skips Puppeteer). `isPublic` hides PII/financials — keep it working on the public event pack.
- One branch + PR per feature off `origin/main`; squash-merge. The owner (Ana-Maria, Bar Franco) approves merges in chat.
- Money display: en-NZ, NZD; GST 15% with per-runsheet `gstInclusive` toggle. Dates: Pacific/Auckland — beware UTC/local day drift.
