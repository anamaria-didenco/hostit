# VenueFlow

VenueFlow is a full-stack CRM and event management platform for New Zealand venues, offering booking, runsheet, F&B, and client management tools.

## Run & Operate

To start the development server (Express + Vite):
```bash
pnpm run dev
```

To run database migrations:
```bash
pnpm run db:push
```

Required Environment Variables:
- `DATABASE_URL`: PostgreSQL connection string (auto-provided by Replit)
- `JWT_SECRET`: Secret for JWT session tokens (required in production, >=16 chars)
- `PORT`: Server port (defaults to 5000)

Optional Environment Variables for OAuth:
- `OAUTH_SERVER_URL`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`: Owner's OpenID for admin access

## Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS v4, shadcn/ui, wouter
- **Backend**: Express.js, tRPC
- **Database**: PostgreSQL (Replit Helium DB), Drizzle ORM
- **Package Manager**: pnpm

## Where things live

- `/client`: React frontend
    - `/client/src/pages`: Route-specific components
    - `/client/src/components`: Reusable UI components
    - `/client/src/_core`: Core frontend hooks and utilities
    - `/client/src/contexts/ThemeContext.tsx`: Defines theming for proposals
- `/server`: Express backend
    - `/server/_core`: Core server utilities (auth, context, env)
    - `/server/db.ts`: Database query functions
    - `/server/routers.ts`: tRPC API routes
    - `/server/beoPdf.ts`, `/server/proposalPdf.ts`, `/server/floorPlanPdf.ts`: PDF generation (the BEO is the single staff-facing document — there is no separate staff-sheet PDF)
    - `/server/nowbookit.ts`: NowBookIt integration logic
    - `/server/nbiWebhook.ts`: NowBookIt webhook receiver
- `/shared`: Shared types between client and server
- `/drizzle`: Database schema and migrations
    - `drizzle/schema.ts`: Database schema definition
- `vite.config.ts`: Vite configuration

## Architecture decisions

- **PostgreSQL Migration**: Migrated from MySQL to PostgreSQL to leverage Replit's built-in Helium DB.
- **tRPC for API**: Chosen for type-safe API interactions between frontend and backend.
- **Custom Theming**: Proposal appearance is fully driven by `venueSettings.themeKey` for white-labeling.
- **NowBookIt Integration**: Implemented bidirectional sync with NowBookIt, including a webhook receiver for NBI → VFHQ updates with loop prevention and idempotency.
- **Lazy Auto-Finishing of Bookings**: Past events are automatically marked `finished` on-demand during booking retrieval to ensure current status without cron jobs.

## Product

VenueFlow provides:
- An enquiry pipeline with overdue follow-up management.
- Comprehensive booking management and a runsheet builder with AI smart paste and F&B tools.
- F&B/menu management, including drink sub-grouping.
- Floor plan editor.
- PDF generation for BEOs, proposals, and staff sheets.
- Client and staff portals.
- Daily checklists with a public live link for staff.
- Email composer with attachments and signature.
- Event spend tracking.
- Reporting with pipeline funnel analytics.
- Integration with NowBookIt for booking push and webhook-based updates.
- CSV bulk import for leads/enquiries with column mapping.

## User preferences

_Populate as you build_

## Gotchas

- `JWT_SECRET` must be set and at least 16 characters long in production environments; the server will throw on startup otherwise.
- `/api/upload-image` requires authentication and whitelists image types (jpg/jpeg/png/gif/webp); SVGs are explicitly excluded due to XSS risks.
- Drizzle ORM with PostgreSQL requires `.returning({ id: table.id })` to retrieve the ID of an inserted row, unlike MySQL's `insertId`.
- Safari private mode and embedded webviews may cause `localStorage` to throw on access; `safeGet`/`safeSet` helpers are used to prevent app crashes.

## Pointers

- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
- [tRPC Documentation](https://trpc.io/docs)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/)