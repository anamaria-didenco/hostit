# HOSTit Project TODO — Tripleseat-style Event CRM

## Phase 1: Database Schema
- [x] leads table (contact info, event details, status pipeline)
- [x] contacts table (client CRM records)
- [x] proposals table (line items, totals, status, public token)
- [x] bookings table (confirmed events, dates, deposit tracking)
- [x] venue_settings table (single venue profile, lead form config)
- [x] event_spaces table (rooms/spaces within the venue)
- [x] Push schema migrations

## Phase 2: Backend tRPC Routers
- [x] leads router (create, list, update status, delete, activity)
- [x] contacts router (create, list, get by id)
- [x] proposals router (create, update, send, get by token, delete)
- [x] bookings router (create from proposal, list, calendar view)
- [x] venue_settings router (get/update/getOwn/upsert)
- [x] spaces router (list, create, delete)
- [x] dashboard router (stats, pipeline counts)

## Phase 3: Venue Owner Dashboard
- [x] Dashboard overview (stats, recent leads, upcoming events)
- [x] Leads inbox (list, filter by status, search)
- [x] Lead detail panel (contact info, event details, activity log, notes)
- [x] Pipeline/kanban view (New → Contacted → Proposal Sent → Booked)
- [x] Bookings calendar view (monthly grid + upcoming list)
- [x] Contacts CRM list
- [x] Venue settings page (details, lead form config, spaces)

## Phase 4: Proposals
- [x] Proposal builder (line items, packages, totals, deposit)
- [x] Client-facing proposal page (public token URL)
- [x] Accept / Decline buttons for client
- [x] Proposal status tracking (draft → sent → viewed → accepted/declined)
- [x] Auto-creates booking when client accepts

## Phase 5: Public Lead Form
- [x] Shareable public lead form URL (/enquire or /enquire/:venueSlug)
- [x] Event details fields (name, email, phone, event type, date, guests, budget, notes)
- [x] Confirmation page after submission
- [x] Auto-creates lead in dashboard on submission

## Phase 6: Polish & Delivery
- [x] Wire all routes in App.tsx
- [x] Vintage Italian Campari/Fabiola aesthetic consistent across all pages
- [x] Mobile responsive sidebar
- [x] All 19 vitest tests passing
- [x] Zero TypeScript errors
- [x] Stale dist directory removed
- [x] Checkpoint saved (v1.0 → 367d36f0)

## Future Enhancements
- [ ] Email notifications when new lead arrives
- [ ] PDF export for proposals
- [ ] Stripe deposit payment integration
- [ ] Image upload for venue profile
- [ ] Multi-user team access

## Nowbook It Integration
- [ ] Research Nowbook It API (endpoints, auth, booking creation, availability blocking)
- [ ] Add NOWBOOKIT_API_KEY and NOWBOOKIT_VENUE_ID secrets
- [ ] Add nowbookit settings fields to venue_settings table
- [ ] Build server/nowbookit.ts service layer
- [ ] Wire booking creation into proposals.respond (on accept)
- [ ] Wire availability block into proposals.respond (on accept)
- [ ] Add Nowbook It integration status card in Dashboard Settings tab
- [ ] Show sync status on confirmed bookings
- [ ] Tests for Nowbook It service

## Design Overhaul — Light Cream Italian Vintage
- [x] Update index.css: cream/parchment base, tomato-orange primary, amber gold accent, light not dark
- [x] Update Home.tsx: light hero, loose watercolour-style SVG illustration, script + slab serif mix
- [x] Update Dashboard.tsx: cream sidebar (not dark), orange accents, airy card layouts
- [x] Update LeadForm.tsx: cream form with vintage badge header
- [x] Update ProposalView.tsx: elegant parchment proposal document style
- [x] Update ProposalBuilder.tsx: clean cream builder UI

## Dante NYC Rebrand
- [x] Update index.css: deep forest green, warm cream, brushed gold, checkerboard motif
- [x] Update index.html: Cormorant Garamond + Bebas Neue + Pinyon Script + DM Sans fonts
- [x] Redesign Home.tsx: dark green hero, gold script, candlelit elegance
- [x] Update Dashboard.tsx: dark green sidebar, gold accents, cream content area
- [x] Update LeadForm.tsx: elegant cream form with green header
- [x] Update ProposalView.tsx: dark green header, cream body, gold totals
- [x] Update ProposalBuilder.tsx: green/cream split layout

## Text Contrast Fix
- [ ] Fix CSS variables — ensure foreground/background pairs are always legible
- [ ] Fix Home.tsx — cream/gold text on dark green hero, dark ink on cream sections
- [ ] Fix Dashboard.tsx — cream text on forest sidebar/nav, dark ink on cream content
- [ ] Fix LeadForm.tsx, ProposalView.tsx, ProposalBuilder.tsx contrast

## Seed Real Events from events.xlsx
- [x] Map spreadsheet statuses to HOSTit lead statuses
- [x] Insert 38 contacts and leads into the database
- [x] Verify data appears in the dashboard enquiries tab

## Send Email Feature
- [ ] Add email tRPC procedure (sendEmail) to routers.ts using nodemailer/SMTP
- [ ] Add Send Email button to each enquiry card in Dashboard
- [ ] Add compose email modal with To, Subject, Body fields
- [ ] Show sent confirmation toast
- [ ] Write vitest test for sendEmail procedure

## Menu Options (Food / Food & Beverages)
- [ ] Add menuPackages table to schema (name, description, pricePerHead, type: food|beverage|package, ownerId)
- [ ] Add menuItems table (name, description, price, packageId)
- [ ] Add menu tRPC procedures: list, create, update, delete
- [ ] Add Food and Food & Beverages tabs to ProposalBuilder
- [ ] Add menu item builder UI (name, description, price per head)
- [ ] Show selected menu packages on client-facing ProposalView
- [ ] Write vitest tests for menu procedures
