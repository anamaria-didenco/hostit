# VenueFlow — NZ Venue Management Platform (VenueFlowHQ)

## Recent Changes (May 2026)

- **Auto-finish past events**: Added `finished` value to `bookingStatusEnum` (drizzle/schema.ts) and to `DEFAULT_STATUSES` in StatusManager (teal color — distinct from booked/confirmed's emerald). `server/db.ts` calls `autoFinishPastBookings(db, ownerId)` lazily inside `getBookings()` and `getBookingsByMonth()`, flipping `confirmed → finished` once `COALESCE(eventEndDate, eventDate) < now() − 24h` — multi-day events stay confirmed until their end date passes. Reports.tsx + db.ts revenue/pending-payment counters include both `confirmed` and `finished` so historical revenue isn't dropped.
- **Calendar finished-status display**: Finished events show with teal treatment across all calendar views — mini-calendar dots (`bg-teal-400`), cell text (`text-teal-600`), cell background (`bg-teal-50 border-teal-300`), side drawer badge (`text-teal-700 bg-teal-50 border-teal-200`), booking list (`text-teal-600`). Mini-calendar legend includes "Finished" entry. Full calendar uses StatusManager's teal preset automatically via `pipelineStages`.
- **Mini-calendar lead clicks**: On the Overview mini calendar, clicking a lead-only event now opens the same right-side drawer (`setSelectedBooking({ ...l, _isLead: true })`) as bookings, instead of jumping the user to the Enquiries tab — matches behaviour of the full calendar view.
- **RunsheetBuilder design pass**: Restyled to match `EventDetail` look — slim `bg-forest-dark h-14` sticky nav with breadcrumb-style back link + truncated cormorant title; page background `bg-linen → bg-cream`; Event Details card uses `dante-card` + `gold-rule` heading; all 6 section panels converted to `dante-card`. Main tab bar uses `border-gold/20` with `border-gold text-amber-700` active state and `text-ink/40` inactive. F&B sub-tabs match gold/amber active style. Comprehensive border polish: all interactive form fields, buttons, dividers, cards unified from `border-gold/30` → `border-gold/20`; all buttons and inputs from `rounded-none` → `rounded-sm`; layout widened from `max-w-5xl` → `max-w-6xl` (including templates panel); empty state improved with larger icon and helper text; Smart Paste banner collapsible; timeline dividers softened to `border-gold/15`; expanded row backgrounds use `bg-linen/30`. Only `border-gold/30` remaining is in print-only elements and modal chrome with dark backgrounds (intentional for contrast).
- **BEO PDF print-friendly pass** (`server/beoPdf.ts`):
  - Puppeteer margins changed from `{top:0, right:0, bottom:12mm, left:0}` to symmetric `{top:12mm, right:10mm, bottom:16mm, left:10mm}` so multi-page BEOs have proper breathing room on every page (page 2+ used to be cramped against the printable edge).
  - `displayHeaderFooter: true` + `footerTemplate` adds `BEO #N · Client` on the left and `Page X of Y` on the right of every page so detached pages stay identifiable.
  - Each F&B course (course header + rows) now wrapped in a `.course-block` container so courses break at row boundaries rather than orphaning the course header.
  - `.page` padding reduced from `16px 20px` to `0 4px` since Puppeteer margins now own the page edges.

## Production Hardening (release-readiness pass)

- `JWT_SECRET` (or `SESSION_SECRET`) is **required** in production — server throws on startup if not set or <16 chars (`server/_core/env.ts`). Dev fallback retained.
- `/api/upload-image` now requires an authenticated session and whitelists image mime+extension (jpg/jpeg/png/gif/webp). **SVG intentionally excluded** — uploads are served from `/uploads` on the same origin and SVG can embed `<script>` (stored XSS).
- `/api/auth/local-login` rate-limited to 10 attempts / 5 min per IP (in-memory Map). `app.set("trust proxy", 1)` so `req.ip` resolves to the real client via Replit's edge — XFF cannot be spoofed by clients.
- `ThemeContext` localStorage access wrapped in `safeGet`/`safeSet` try/catch helpers — prevents app boot crash in Safari private mode / embedded webviews where `localStorage` throws on access.
- `ClientPortal` contract-sign error path uses `toast.error` (sonner) instead of native `alert()`.
- Removed orphan files: `client/src/pages/MenuManagement.tsx`, `client/src/pages/ComponentShowcase.tsx`, `client/src/components/AIChatBox.tsx` (~2,235 lines of dead code).
- Test ctxs updated for the `{user, isTeamMember}` `auth.me` shape; all 88 tests pass.

## Overview

**NowBookIt push** (`server/nowbookit.ts` — `pushBookingToNbi`) enriches the customer payload from the linked contact then lead before posting, because the bookings table itself has no `phone` column and NBI's PostBookings endpoint strictly requires FirstName, LastName, and Phone (returns 400 "PostBookings requires Customer's: FirstName, LastName, Phone" otherwise). Safe placeholders are substituted when data is missing: `firstName="Guest"`, `lastName="—"`, `phone="0000000000"`, with a console.warn flagging which fields were placeholdered. If `firstName` contains a space and `lastName` is empty, it's split (e.g. "Tate Jiang" → first="Tate", last="Jiang") before falling back to placeholders.

VenueFlow (branded "VenueFlow") is a full-stack CRM and event management platform for New Zealand venues. Features include: enquiry pipeline with overdue follow-up filter, booking management, runsheet builder with AI smart paste + dedicated DRINKS tab (bar arrangement selector + free-form DRINKS / BAR NOTES textarea saved to drinksData.barNotes; legacy drink-picker selections preserved as read-only chips with Clear button), F&B/menu management with drink sub-grouping, floor plan editor, PDF generation, proposals, client portal, staff portal, daily checklists with public live link (token-based, optimistic toggling, 15s polling, localStorage staff name for single-tap sign-off, assignedDate field), email composer with attachments/signature, event spend tracking (EventSpendSection with toast feedback), and reporting with pipeline funnel analytics. Dashboard uses h-screen overflow-hidden layout so the enquiries tab detail panel and booking slide-out always render within the viewport. LINKED PROPOSAL section in RunsheetBuilder always shows (uses proposals.list when no leadId). Overdue follow-ups "View →" button navigates to enquiries with overdue_followup filter. Courses in RunsheetBuilder are customisable via venue settings (customCourses JSON field, migration 0022_foamy_bromley.sql); per-runsheet ad-hoc courses can be added via "+ NEW COURSE" button (extraCourses state, persisted in localStorage keyed by booking ID so empty courses survive reloads). SpacePicker shows a dashed-border empty state with "+ ADD SPACES" link to /spaces when no spaces are saved. Venue area badge (#6b98e7) is rendered prominently in ShiftRunsheetLive (text-sm pill with shadow) and BEO header (14px Bebas Neue chip with white border + box-shadow). BEO print CSS includes @page A4 portrait + print-color-adjust:exact for backgrounds; margins are controlled by Puppeteer's PDF options (not @page) to avoid conflicts.

## Calendar Views

The dashboard calendar supports four views:
- **Month** — standard month grid with booking/lead cards and status labels
- **Week** — 7-column week grid, Mon–Sun start; day headers click to open Day view; adjacent month data loaded to handle month boundaries
- **Day** — single-day detail view with event cards; navigate day-by-day
- **List** — sortable/filterable list of all events in the month

## Key Pages & Routes

| Route | Component | Description |
|---|---|---|
| `/dashboard` | Dashboard.tsx | Main app — enquiries, calendar, settings |
| `/runsheet` | RunsheetBuilder.tsx | Runsheet + F&B + checklist builder |
| `/daily-checklists` | DailyChecklists.tsx | Manage daily venue checklists |
| `/daily/:token` | DailyChecklistLive.tsx | Public staff live checklist view |
| `/floor-plan` | FloorPlanBuilder.tsx | Floor plan editor |
| `/event/:id` | EventDetail.tsx | Full booking detail page |
| `/staff/:token` | StaffPortal.tsx | Staff portal (event day view) |
| `/staff-checklist/:token` | StaffChecklist.tsx | Staff checklist live page |
| `/portal/:token` | ClientPortal.tsx | Client portal |
| `/proposal/:token` | ProposalView.tsx | Public proposal view |
| `/enquire/:slug` | LeadForm.tsx | Contact/enquiry form embed |

## Architecture

- **Frontend**: React 19 + TypeScript + Vite, using TailwindCSS v4, shadcn/ui components, and wouter for routing
- **Backend**: Express.js with tRPC for type-safe API, running alongside Vite dev server in development
- **Database**: PostgreSQL (Replit's built-in Helium DB) using Drizzle ORM
- **Package Manager**: pnpm

## Project Structure

```
/
├── client/          # React frontend
│   └── src/
│       ├── components/  # Shared UI components
│       ├── pages/       # Route pages
│       ├── _core/       # Core hooks (auth)
│       ├── lib/         # Utilities (trpc client, etc.)
│       └── contexts/    # React contexts
├── server/          # Express backend
│   ├── _core/       # Core server utilities (auth, context, env)
│   ├── db.ts        # Database queries
│   ├── routers.ts   # tRPC routers
│   ├── chromiumPath.ts  # Resolves Puppeteer/Chromium binary path
│   ├── proposalPdf.ts
│   ├── beoPdf.ts
│   ├── staffSheetPdf.ts
│   └── floorPlanPdf.ts  # Floor plan PDF generator (SVG-based)
├── shared/          # Shared types between client and server
├── drizzle/         # Database schema and migrations
└── vite.config.ts   # Vite configuration
```

## Development

The app runs with a single command that starts the Express server, which serves both the API and the Vite dev server middleware:

```bash
pnpm run dev
```

Server starts on port 5000 (configured via `PORT` env var).

## Database

Uses PostgreSQL via Drizzle ORM. The original project used MySQL, but was migrated to PostgreSQL to use Replit's built-in database.

To run migrations:
```bash
pnpm run db:push
```

## Key Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (auto-provided by Replit)
- `PORT` - Server port (set to 5000)
- `JWT_SECRET` - Secret for JWT session tokens
- `OAUTH_SERVER_URL` - OAuth server URL (optional, for Manus platform auth)
- `VITE_OAUTH_PORTAL_URL` - OAuth portal URL for frontend (optional)
- `VITE_APP_ID` - App ID for OAuth (optional)
- `OWNER_OPEN_ID` - Owner's OpenID for admin access

## Authentication

The app supports two authentication modes:

1. **Local password auth** (active): POST `/api/auth/local-login` with `{ password }` matching `ADMIN_PASSWORD` env var. Creates a session user with openId `local-admin` and role `admin`.
2. **Manus OAuth** (optional): Requires `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`, and `OAUTH_SERVER_URL` env vars.

The Login page is at `/login` (`client/src/pages/Login.tsx`).

## CSV Bulk Import

Enquiries/leads can be bulk-imported via CSV from the Enquiries sidebar in the dashboard. The "CSV" button opens a 3-step modal:

1. **Upload** — drag-and-drop or file picker; CSV template download available
2. **Map columns** — auto-detects common column names from other platforms; user can override
3. **Preview & import** — shows first 5 rows, then calls `leads.bulkCreate` tRPC mutation (max 500 rows)

Backend mutation: `trpc.leads.bulkCreate` in `server/routers.ts`.
Frontend component: `client/src/components/CsvImportModal.tsx` (uses `papaparse` for parsing).

## Proposal Theming & Appearance

Proposals are fully theme-aware. The venue's `themeKey` (stored in `venueSettings`) drives all proposal colours and fonts.

- **ProposalView** (`client/src/pages/ProposalView.tsx`): Maps venue `themeKey` to color tokens via `getThemeTokens()`. Displays the venue logo in the header and a venue hero/banner image at the top (falls back to HOSTit defaults when not set).
- **ProposalBuilder** (`client/src/pages/ProposalBuilder.tsx`): Has a collapsible "Proposal Appearance" panel in the right sidebar. Allows selecting from all 12 themes (with swatch previews), entering a venue logo URL, and entering a venue photo URL. Changes are saved to venue settings via `trpc.venue.update`.
- **ThemeContext** (`client/src/contexts/ThemeContext.tsx`): Defines `COLOUR_THEMES` array (12 themes: sage, forest, dusty-merlot, brique, charcoal, olivie, seafoam, retro-warm, claret, midnight-rose, matcha, champagne) with `id`, `label`, and `swatches` colour arrays.
- Venue settings columns used: `themeKey`, `logoUrl`, `coverImageUrl`, `bannerImageUrl`.

## PostgreSQL Insert Pattern

Drizzle ORM with PostgreSQL requires `.returning({ id: table.id })` after `.values()` to get the inserted row's ID back. Never use `(result as any).insertId` (MySQL-only). All 11 insert locations in `server/routers.ts` follow this pattern.

## Deployment

Configured for autoscale deployment:
- Build: `pnpm run build`
- Run: `node dist/index.js`

## Runsheet Improvements (May 2026)

Major UX overhaul of `client/src/pages/RunsheetBuilder.tsx`, BEO PDF generation (`server/beoPdf.ts`), and `client/src/pages/ShiftRunsheetLive.tsx`:

- **Bar arrangement notes** — `runsheets.drinksData.barNotes` field stores free-text bar instructions. Surfaced in BEO PDF (blue callout in bar section) and Shift Runsheet Live (per-event drinks panel). BEO loader merges `runsheet.drinksData` over `proposalDrinks` so runsheet edits win.
- **Drink quantities hidden** — F&B grid, BEO, and Live all suppress the qty column for drinks rows.
- **Space picker** — dropdown of `spaces.list` with a "Custom…" option that preserves any pre-existing custom value.
- **Venue area badge** — prominent chip in BEO title row + colored badge in Live event panel.
- **F&B sub-tabs** — "Menu & Service" / "Dietary Reqs" sub-tabs inside the F&B section. Legacy top-level Dietary section removed from `sectionOrder` (filter strips legacy localStorage entries).
- **Color-coded F&B in Live** — `ShiftRunsheetLive` adds an "EVENTS TODAY" panel: food rows = warm amber, drinks rows = cool blue.
- **Shift→events date matching** — `shiftRunsheets.getByToken` computes day window in venue's timezone (`venueSettings.timezone`, default `Pacific/Auckland`) using an iterative Intl.DateTimeFormat-based UTC offset solver, then queries `runsheets.eventDate` in `[dayStartUTC, nextDayStartUTC)` with `gte`/`lt`.
- **Print-friendly BEO** — `page-break-inside: avoid` on rows, `page-break-after: auto` on course groups, drink names use spaces instead of underscores.


## NowBookIt Two-Way Sync

VenueFlowHQ supports bidirectional sync with NowBookIt:

**VFHQ → NBI (push)** — Existing. When a booking is set to `confirmed`, `bookings.update` calls `createNbiBooking` (`server/nowbookit.ts`) using the venue's `nbiAccountId` + `nbiVenueId` (+ optional `nbiServiceId`). Returns NBI booking ID, stored on `bookings.nbiBookingId`.

**NBI → VFHQ (webhook receiver)** — `server/nbiWebhook.ts`. NowBookIt POSTs booking events to `POST /api/webhook/nowbookit/:secret`. Auth is by per-venue secret (`venue_settings.nbiWebhookSecret`, 24-byte random hex) embedded in the URL path. The handler:
- Defensively reads booking fields from multiple paths (NBI payload shape varies).
- Parses dates with venue timezone awareness — ISO with offset trusted as-is, ISO-without-offset and date+time treated as venue-local via iterative `Intl.DateTimeFormat` solver.
- **Loop prevention** — detects `VF-<id>` reference echoes from our own pushes; backfills `nbiBookingId` instead of creating a duplicate.
- **Idempotency** — partial unique index `bookings_owner_nbi_unique` on `(ownerId, nbiBookingId) WHERE nbiBookingId IS NOT NULL`; create path catches Postgres `23505` conflicts and returns the existing row.
- Handles `cancelled/deleted/removed` actions by setting `bookings.status = 'cancelled'`.

**tRPC procedures** — `venue.getNbiWebhookUrl` (lazy-generates the secret on first call) and `venue.regenerateNbiWebhookSecret` (rotates the secret). Both protected.

**Security note** — the public `venue.get` procedure now strips sensitive fields (`smtp*`, `nbi*`, `notificationEmail`, `automatedTaskRules`) when called by anyone other than the owner themselves. The full row is still available via the protected `venue.getOwn`.

**UI** — Dashboard → Settings → Integrations → NowBookIt card shows a read-only webhook URL with COPY and ROTATE buttons (visible once Account ID + Venue ID are saved).

