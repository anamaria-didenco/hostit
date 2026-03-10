# HOSTit - New Zealand's Venue Management Platform

## Overview

HOSTit is a full-stack venue management web application for New Zealand venues. It helps venue managers handle event enquiries, proposals, bookings, runsheets, menus, floor plans, and more.

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
│   ├── proposalPdf.ts
│   ├── beoPdf.ts
│   └── staffSheetPdf.ts
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
