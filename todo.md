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
