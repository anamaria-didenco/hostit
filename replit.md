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

The app uses a Manus-specific OAuth system. Without `VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID` configured, the login buttons will point to `#` (no-op). The app still loads and displays the landing page.

## Deployment

Configured for autoscale deployment:
- Build: `pnpm run build`
- Run: `node dist/index.js`
