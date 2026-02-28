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
- [x] Install nodemailer, add sendEmail tRPC procedure
- [x] Add SMTP settings fields to Dashboard Settings tab
- [x] Add Send Email button + compose modal to leads inbox
- [x] Log sent emails as lead activity entries
- [ ] Write vitest test for sendEmail procedure

## Menu Options (Food / Food & Beverages)
- [ ] Add menuPackages table to schema (name, description, pricePerHead, type: food|beverage|package, ownerId)
- [ ] Add menuItems table (name, description, price, packageId)
- [ ] Add menu tRPC procedures: list, create, update, delete
- [ ] Add Food and Food & Beverages tabs to ProposalBuilder
- [ ] Add menu item builder UI (name, description, price per head)
- [ ] Show selected menu packages on client-facing ProposalView
- [ ] Write vitest tests for menu procedures

## Email Templates
- [x] Add emailTemplates table to schema (id, ownerId, name, subject, body, createdAt)
- [x] Add tRPC procedures: templates.list, templates.create, templates.update, templates.delete
- [x] Add "Use Template" dropdown in email compose modal
- [x] Add Email Templates management section in Dashboard Settings
- [ ] Seed 5 default templates (Function Pack Follow-Up, Proposal Reminder, Booking Confirmation, etc.)
- [x] Write vitest test for templates procedures (24 tests total, all passing)

## Template Variable Substitution
- [x] Define supported variables: {{contactName}}, {{firstName}}, {{lastName}}, {{email}}, {{phone}}, {{eventType}}, {{guestCount}}, {{budget}}, {{venueName}}, {{spaceName}}, {{notes}}
- [x] Create substituteTemplateVars() utility function in client/src/lib/templateVars.ts
- [x] Wire substitution into template picker in compose modal (replace on select)
- [x] Show variable reference cheatsheet in compose modal and template form
- [x] Write vitest tests for substituteTemplateVars utility (20 tests, all passing)

## Follow-Up Date Feature
- [x] Verify followUpDate column exists on leads table (already in schema)
- [x] Add/verify tRPC procedure: leads.setFollowUpDate (update followUpDate for a lead)
- [x] Add leads.overdue query (leads where followUpDate <= today and status not booked/lost/cancelled)
- [x] Add follow-up date picker to lead detail panel in Leads Inbox
- [x] Show follow-up date badge on lead list items (overdue = red, upcoming = gold)
- [x] Add overdue follow-ups section to Dashboard Overview tab
- [x] Write vitest tests for overdue query and setFollowUpDate procedure (5 tests, all passing)

## Bulk Status Update
- [x] Add leads.bulkUpdateStatus tRPC procedure (accepts array of lead IDs + target status)
- [x] Add checkbox selection state to Leads Inbox (selectedLeadIds set)
- [x] Add checkboxes to each lead list item
- [x] Add "Select All" / "Deselect All" toggle in the list header
- [x] Add floating bulk-action toolbar when 1+ leads selected (status picker + count + clear)
- [x] Invalidate leads list and overdue query after bulk update
- [x] Write vitest tests for bulkUpdateStatus procedure (4 tests, all passing)

## Auto-Advance on Email Reply
- [x] When email is sent from compose modal: auto-update lead status from "new" → "contacted"
- [x] Auto-set follow-up date 3 days out if none already set when email is sent
- [x] Show the replied lead on the Calendar tab (gold dot + This Month's Follow-Ups list)
- [x] Calendar tab: follow-up dates shown as gold dots alongside booking dots (green)

## Colour Refresh
- [x] Lighten --ink (black text) to a softer warm taupe (oklch 0.30)
- [x] Lighten --forest (dark green) to a lighter sage green (oklch 0.52)
- [x] Updated all utility classes: text-ink, text-forest, text-sage, bg-forest, bg-ink, border-forest, border-ink, sidebar, nav-item states

## Runsheet Feature
- [ ] Add runsheets table (id, bookingId, ownerId, token, notes, createdAt, updatedAt)
- [ ] Add runsheet_items table (id, runsheetId, time, duration, title, description, assignedTo, category, sortOrder)
- [ ] Push schema migration
- [ ] Add tRPC procedures: runsheets.generate, runsheets.get, runsheets.updateItem, runsheets.addItem, runsheets.deleteItem, runsheets.getByToken (public)
- [ ] Auto-generate runsheet from booking event type, date, guest count with NZ venue timeline
- [ ] Build Runsheet editor UI in Bookings detail panel (editable time slots, add/delete/reorder)
- [ ] Build public RunsheetView page at /runsheet/:token
- [ ] PDF print/download on public runsheet page
- [ ] Write vitest tests for runsheet procedures

## Drinks Selection in Proposals
- [ ] Add proposal_drinks table (id, proposalId, ownerId, barOption, tabAmount, drinksJson, customDrinksJson)
- [ ] Push schema migration
- [ ] Add tRPC procedures: proposals.saveDrinks, proposals.getDrinks
- [ ] Build drinks selection UI in proposal builder: bar option radio (Bar Tab/Cash Bar/Bar Tab then Cash/Unlimited), tab amount input when applicable
- [ ] Add Bar Franco drinks menu with checkboxes per item grouped by category (Aperitivo, Vino Spumante, Vino Bianco, Vino Rosato, Vino Rosso, Birra, Non Alcolico)
- [ ] Add custom drink creation (name, description, price)
- [ ] Show selected drinks on public proposal view page
- [ ] Write vitest tests for drinks procedures

## Calendar — Unified View
- [x] Add leads.eventsByMonth tRPC query (leads with eventDate in given month)
- [x] Show lead event dates on calendar grid (rose/pink dot)
- [x] Show bookings on calendar grid (green dot)
- [x] Show follow-up dates on calendar grid (amber dot)
- [x] Add combined legend: Booking, Enquiry/Lead, Follow-Up, Today
- [x] Add This Month's Enquiries & Leads list below calendar
- [x] Clicking a lead/enquiry item navigates to that lead in the Leads Inbox

## Paradiso Brand Rebrand
- [x] Rewrite index.css: deep teal, terracotta, warm cream, stripe motifs, paradiso-card, terra-rule
- [x] Update all CSS tokens + legacy aliases: --primary, --background, --foreground, sidebar, nav, buttons
- [x] Dashboard.tsx uses CSS variable aliases (text-forest→teal, text-gold→terra, bg-forest-dark→teal-dark)
- [x] Rewrite Home.tsx with Paradiso aesthetic (hero, features, pricing, stripe dividers)
- [x] Rewrite LeadForm.tsx with Paradiso styling (teal header, stripe band, paradiso-card forms)
- [x] Rewrite ProposalView.tsx with Paradiso styling (teal header, stripe band, paradiso-card sections)
- [x] Typography: Playfair Display (headings), Inter (body), Bebas Neue (labels), Cormorant (accent)
- [x] 53 tests passing, 0 TypeScript errors

## Manhattan Modern Colour Rebrand
- [ ] Rewrite index.css: burgundy (#6B1A2A), cream (#F2EDE4), powder blue (#B8C8D8)
- [ ] Update all CSS tokens and legacy aliases
- [ ] Update Home.tsx, LeadForm.tsx, ProposalView.tsx, ProposalBuilder.tsx
- [ ] Upload improved logos (glass illustration v2 + lockup v2) and integrate across site

## Manhattan Modern Colour Rebrand
- [x] Rewrite index.css: deep burgundy (#6B1A2A), warm cream (#F2EDE4), powder blue (#B8C8D8)
- [x] Update all CSS tokens + legacy aliases (text-forest→burgundy, text-gold→blue, bg-forest-dark→burg-dark)
- [x] Update typography: Cormorant Garamond (primary serif), Playfair Display (secondary), Inter, Bebas Neue
- [x] Generate minimalist high-end HOSTit logo (Didot-style HOST + hairline rule + italic "it")
- [x] Replace all logo instances across Dashboard, Home, LeadForm, ProposalView, ProposalBuilder
- [x] Rewrite Home.tsx with Manhattan Modern aesthetic
- [x] 53 tests passing, 0 TypeScript errors

## Drinks Selection in Proposal Builder
- [ ] Add tRPC procedures: proposals.saveDrinks, proposals.getDrinks
- [ ] Build drinks selection section in ProposalBuilder (bar option picker + menu checkboxes + custom drinks)
- [ ] Display selected drinks on public ProposalView page
- [ ] Write vitest tests for drinks procedures

## Quote Section in Proposals
- [ ] Add quoteItems table (id, proposalId, ownerId, type, name, description, qty, unitPrice, createdAt)
- [ ] Add tRPC: proposals.saveQuote, proposals.getQuote, proposals.getQuoteByToken
- [ ] Build Quote section in ProposalBuilder: min-spend input, food subtotal from line items, auto bar tab remainder
- [ ] Add hire/styling line items (customisable name, qty, unit price)
- [ ] Display quote section on public ProposalView page

## 2D Floor Plan Builder
- [ ] Add floorPlans table (id, bookingId, ownerId, name, bgImageUrl, canvasData JSON, createdAt)
- [ ] Add tRPC: floorPlans.save, floorPlans.get, floorPlans.list, floorPlans.delete
- [ ] Build drag-and-drop canvas UI with element palette (table-round, table-rect, chair, bar, stage, dance-floor, door, window)
- [ ] Allow background image upload (existing floor plan underlay)
- [ ] Link floor plan to a booking from the Bookings detail panel
- [ ] Print/export floor plan as image

## Staff Workflow Checklists
- [ ] Add checklistTemplates table (id, ownerId, name, items JSON, createdAt)
- [ ] Add checklistInstances table (id, templateId, bookingId, ownerId, items JSON, completedAt, createdAt)
- [ ] Add tRPC: checklists.createTemplate, checklists.listTemplates, checklists.updateTemplate, checklists.deleteTemplate
- [ ] Add tRPC: checklists.assignToBooking, checklists.getForBooking, checklists.updateInstance
- [ ] Build checklist template manager in Settings tab
- [ ] Build checklist instance view in Bookings detail panel (checkboxes, assign template)
- [ ] Print view for checklist (clean printable layout)

## Phase 7: HOSTit v5.0 — Completed This Session
- [x] Quote section in ProposalBuilder: min-spend calculator, food subtotal, auto bar tab remainder, hire/styling line items
- [x] 2D floor plan builder page (/floor-plan): drag-and-drop canvas, 11 element types, resize handles, print view, save/load
- [x] Staff checklist templates in Settings: create/delete templates, one-per-line items
- [x] Printable event checklist page (/checklist?bookingId=X): assign templates, toggle items, print view
- [x] Fixed drinks selection test (saveDrinks returns success:true, getDrinks returns the saved record)
- [x] 66 vitest tests passing, zero TypeScript errors
