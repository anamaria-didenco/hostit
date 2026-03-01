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

## Phase 8: Runsheets, Calendar Labels & UX Improvements
- [ ] Add runsheets and runsheet_items tables to schema, push migration
- [ ] Add tRPC procedures: runsheets.generate, runsheets.get, runsheets.update, runsheets.addItem, runsheets.deleteItem
- [ ] Build RunsheetBuilder page (/runsheet?leadId=X or ?bookingId=X)
- [ ] Add "Create Runsheet" button in leads inbox detail panel (next to "Create Proposal")
- [ ] Add clickable event names on calendar cells that open RunsheetBuilder
- [ ] Show event name and status badge on calendar cells for bookings and leads
- [ ] Add delete enquiry button in leads inbox (with confirmation)
- [ ] Write vitest tests for runsheet procedures

## Phase 8: Runsheet, Calendar & UX Improvements

- [x] Runsheet DB tables (runsheets + runsheet_items) with nullable leadId/bookingId
- [x] tRPC runsheets router (create, get, list, update, delete, addItem, updateItem, deleteItem)
- [x] RunsheetBuilder page (/runsheet) with auto-generate from lead/booking data
- [x] Create Runsheet button in leads inbox detail panel
- [x] Create Runsheet button on calendar booking cards
- [x] Calendar cells show event name + status (clickable, scrolls to booking or opens lead)
- [x] Delete enquiry button in leads inbox detail panel
- [x] Sidebar nav text and icons updated to cream (#f7f1e9) colour
- [x] 71 tests passing (5 new runsheet tests added)

## Phase 8: Runsheet Enhancements + PDF Export

- [x] Add dietaries section to RunsheetBuilder (quick-add chips, count, notes, print-ready)
- [x] Add venue setup section to RunsheetBuilder (layout templates + freetext, print-ready)
- [x] Integrate proposal data into RunsheetBuilder (link proposal, show pricing/bar/drinks)
- [x] Auto-populate runsheet from linked proposal (date, guests, space)
- [x] Download PDF button on ProposalBuilder (server-side Puppeteer PDF generation)
- [x] Fix proposal PDF test assertion (getByToken returns { proposal, venue })
- [x] 74 tests passing

## Phase 9: Perfect Venue Feature Parity + FOH/Kitchen Runsheet

### BEO Generator
- [ ] BEO (Banquet Event Order) auto-PDF from booking/proposal data
- [ ] BEO includes: event details, contact info, menu selections, bar package, dietary requirements, venue setup, timeline, pricing summary
- [ ] Generate BEO button on confirmed bookings in Dashboard
- [ ] BEO accessible from RunsheetBuilder as well

### Runsheet — FOH & Kitchen Sections
- [ ] Add Food and Beverage tab to RunsheetBuilder
- [ ] FOH section: service style, courses, timing per course, staff assignments
- [ ] Kitchen section: prep timeline, dish names, quantities per dietary, plating notes
- [ ] Pull menu selections from linked proposal automatically
- [ ] Print-ready FOH sheet and separate Kitchen sheet

### Payment & Deposit Tracking
- [ ] Add payments table to DB (amount, type, date, method, notes)
- [ ] Payment tracking panel on each booking (record payment, show outstanding balance)
- [ ] Payment status badge on booking cards (Unpaid / Deposit Paid / Paid in Full)
- [ ] Revenue pipeline on analytics (confirmed vs pipeline vs outstanding)

### Analytics Dashboard Enhancements
- [ ] Revenue by month chart (bar chart, current year)
- [ ] Year-over-year comparison
- [ ] Goal tracking (set monthly revenue target, show progress)
- [ ] Lead conversion funnel (enquiries to proposals to bookings)
- [ ] Top event types by revenue

### Automated Follow-Up and Reminders
- [ ] Follow-up email scheduler (send template email at a set date/time)
- [ ] Automated reminder: 7 days before event
- [ ] Overdue follow-up indicator on leads inbox
- [ ] Send reminder quick action on leads

### Express Book Public Form
- [ ] Public-facing enquiry + availability check page (/book)
- [ ] Guest selects date, event type, guest count, space
- [ ] Shows available spaces and menu packages
- [ ] Guest can select menu items and submit deposit request
- [ ] Owner receives notification and can Accept/Decline

## Phase 9: Perfect Venue Feature Set

- [x] FOH & Kitchen F&B tab in RunsheetBuilder (course-by-course, staff assignments, bar notes, kitchen prep)
- [x] Payment & deposit tracking page (/payments) — record payments, outstanding balance, status badges
- [x] Analytics dashboard (/analytics) — monthly revenue chart, YoY comparison, conversion funnel, goal tracking
- [x] Express Book public enquiry form (/book) — availability check, space/menu selection, owner notification
- [x] Analytics and Payments quick-links added to Dashboard sidebar
- [x] Express Book link added to Dashboard sidebar

## Phase 10: Event Management & UX Improvements

- [ ] Calendar booking slide-out panel (event details, deposit status, quick-launch links)
- [ ] Full F&B menu management (categories, items, packages with pricing per head)
- [ ] Separate New Enquiries inbox (unread/unreplied leads auto-move once replied or booked)
- [ ] Event Detail page (/event/:id) — full edit, generate runsheet/proposal/BEO, status management
- [ ] Disable Express Book instant booking (replace with contact-only enquiry form)
- [ ] Click event name on calendar to open Event Detail page

## Phase 10: Event Management & Inbox Separation
- [x] Calendar booking slide-out panel (event details, deposit status, quick-launch links)
- [x] EventDetail page (/event/:id) — full edit form, generate runsheet/proposal buttons
- [x] F&B Menu Management page (/menu) — packages, items, categories, portion sizes
- [x] F&B Menu link added to Dashboard sidebar
- [x] New Enquiries / All Leads sub-tab toggle in Leads Inbox
- [x] Auto-move lead from New Enquiries to All Leads on email send
- [x] Express Book confirmed as enquiry-only (no instant booking)
- [x] bookings.getById and bookings.update tRPC procedures added
- [x] menu.addItem, updateItem, deleteItem updated with category and portionSize fields

## Phase 11: Dashboard Redesign + Settings Menus + BEO
- [ ] Dashboard overview: calendar + new enquiries side-by-side layout
- [ ] Calendar cells: colour-coded booking status (confirmed=green, tentative=amber, cancelled=red)
- [ ] Calendar cells: show event name and guest count inline
- [ ] Settings tab: Floor Plans management (create/edit/delete saved floor plan templates)
- [ ] Settings tab: Drinks Menu management (add/edit/delete bar items and options)
- [ ] Settings tab: Food Menu management (packages and items, same as /menu but inline in Settings)
- [ ] BEO PDF server route (/api/beo/:bookingId) with Puppeteer
- [ ] Generate BEO button on EventDetail page

## Phase 11: BEO, Dashboard Redesign, Settings Menus
- [x] Sidebar text all cream, active item sky blue
- [x] Sidebar burgundy lightened to L=0.420 for readability
- [x] Dashboard overview redesigned: mini calendar (left) + New Enquiries (right)
- [x] Calendar cells show colour-coded booking status dots (green=confirmed, amber=tentative, grey=cancelled)
- [x] Settings tab: Food Menu management (packages + items with category/portion size)
- [x] Settings tab: Drinks/Bar Menu management (custom bar items with category/price)
- [x] Settings tab: Floor Plans sub-tab (create/manage floor plan templates)
- [x] BEO PDF server route (/api/beo/:bookingId) with full event data
- [x] Generate BEO PDF button on EventDetail page

## Phase 12: Staff Sheet PDF + Source Tracking + Customisable Dashboard
- [ ] Source field editable in lead detail panel (dropdown: Instagram, Website, Referral, Walk-in, Phone, Email, Other)
- [ ] Source "How did you hear about us?" dropdown on public LeadForm
- [ ] Source "How did you hear about us?" dropdown on ExpressBook form
- [ ] analytics.sourceBreakdown tRPC procedure
- [ ] Source Breakdown chart in Analytics page
- [ ] Staff Sheet PDF server route (/api/staff-sheet/:runsheetId)
- [ ] Print Staff Sheet button in RunsheetBuilder header
- [ ] Dashboard widget system: drag-to-reorder, show/hide panels
- [ ] user_preferences table in schema for storing dashboard layout
- [ ] Dashboard layout persisted per user via tRPC

## Phase 12: Perfect Venue Parity + Cream/Blue/Burgundy Branding
- [ ] Add "Qualified" pipeline stage between Contacted and Proposal Sent
- [ ] Add "Balance Due" pipeline stage for payment tracking
- [ ] Add Tasks tab to Dashboard sidebar
- [ ] Add source dropdown (editable) to lead detail panel in Dashboard
- [ ] Add "How did you hear about us?" source dropdown to public LeadForm
- [ ] Add source dropdown to ExpressBook form
- [x] Source Breakdown chart in Analytics
- [x] Staff Sheet PDF button in RunsheetBuilder
- [ ] Customisable dashboard: drag-to-reorder widgets, show/hide panels
- [ ] Reports page: Events / Payments / Proposals / Contacts / Sales sub-tabs
- [ ] Verify cream/blue/burgundy colour scheme consistent globally

## Phase 12: Completed This Session
- [x] Source field editable in lead detail panel (dropdown in Dashboard)
- [x] "How did you hear about us?" source dropdown on public LeadForm
- [x] analytics.sourceBreakdown tRPC procedure
- [x] Source Breakdown chart in Analytics page
- [x] Staff Sheet PDF server route (/api/staff-sheet/:runsheetId)
- [x] Print Staff Sheet button in RunsheetBuilder header
- [x] Dashboard widget system: MiniCalendarWidget, NewEnquiriesWidget, PipelineSnapshotWidget
- [x] DashboardWidgets component with drag-to-reorder (@dnd-kit) and show/hide
- [x] user_preferences table created in DB
- [x] userPreferences.save and userPreferences.get tRPC procedures
- [x] Dashboard layout (order + hidden) persisted per user via tRPC
- [x] 77 vitest tests passing, 0 TypeScript errors

## Phase 13: Perfect Venue Layout Parity + Full Feature Set
- [ ] Replace left sidebar with top navigation bar (Home, Inbox, Calendar, Tasks, Express Book, Reports, Settings)
- [ ] Top nav: burgundy background, cream text, blue active highlight, venue name + avatar on right
- [ ] Home tab: Active Events table with pipeline status bar (Lead, Qualified, Proposal Sent, Confirmed, Balance Due, Completed)
- [ ] Inbox tab: lead list (left) + lead detail with horizontal pipeline steps (right)
- [ ] Tasks tab: task list with create/complete/delete, due dates, linked event
- [ ] Reports tab: sub-tabs (Overview, Events, Leads, Revenue, Proposals)
- [ ] Settings page: own left sidebar with all PV sub-sections
- [ ] Settings > Group Contact Form: logo upload, banner upload, form background color, fields toggle, connect tab
- [ ] Settings > Taxes & Fees: add/edit/delete tax rates and service fees
- [ ] Settings > Automated Tasks: task templates with triggers
- [ ] Settings > Team: invite/manage team members with roles
- [ ] Settings > Proposal: deposit %, payment terms, T&Cs, expiry
- [ ] Settings > Email: SMTP config + email signature
- [ ] Settings > Integrations: placeholder cards (Zapier, etc.)
- [ ] Add "Qualified" and "Balance Due" pipeline stages
- [ ] tasks table in DB (id, ownerId, title, dueDate, linkedLeadId, linkedBookingId, completed, createdAt)
- [ ] tRPC tasks router (list, create, update, complete, delete)
- [ ] taxes_fees table in DB (id, ownerId, name, type, rate, appliesto, active)
- [ ] tRPC taxesFees router (list, create, update, delete)
- [ ] 0 TypeScript errors, all tests passing

## Floor Plans Feature (Perfect Venue Add-On)
- [x] floor_plans table already in schema (id, ownerId, bookingId, name, bgImageUrl, canvasData, createdAt)
- [x] tRPC procedures: floorPlans.list, floorPlans.get, floorPlans.save, floorPlans.delete
- [x] FloorPlanEditor component: drag-and-drop canvas with 19 element types (tables, chairs, bar, stage, dance floor, etc.)
- [x] Properties panel: label, color picker, seat count, width/height, position, rotation slider
- [x] Toolbar: plan name, zoom in/out, grid toggle, snap-to-grid toggle, save button
- [x] Keyboard shortcuts: Delete/Backspace=delete, R=rotate, Esc=deselect
- [x] Floor Plans list view with thumbnail previews (table count + seat count)
- [x] Create / Edit / Delete floor plans from Settings > Floor Plans
- [x] Floor Plans added to Settings sidebar navigation
- [x] TypeScript errors fixed (0 errors)

## Batch Improvements — Mar 2026
- [x] Venue Details: add Internal Name, Website, Notification Email, Venue Address, Event Settings (timezone, currency, event start/end time, min group size, auto-cancel toggle)
- [x] Venue Profile: add Availability Settings (event duration min/max, lead time min/max, buffer time), Hours per day (Sun-Sat with start/end times), Venue Description, Banner Image upload, Venue Type dropdown, Price Category radio
- [x] Remove Express Book from top nav tab list
- [x] Floor Plans: enable background image upload (upload to S3, store in bgImageUrl)
- [x] Click event name in calendar/overview widgets to open that lead/booking
- [x] Reports & Events: show all events/leads as a colour-coded table
- [x] Leads Inbox: collapsible/hideable sections (All Leads table, New Enquiries)
- [x] Fix bookings calendar — booked events this month not showing (updateStatus now creates booking record when status set to booked)

## Phase 14: Function Tracker Parity + Major UX Overhaul

### Settings Fixes
- [ ] Remove Express Book from Settings sidebar (already removed from top nav)
- [ ] Rebuild Menu section in Settings — currently blank; recreate with Menu Sections table, Sales Categories, Menu Items tabs
- [ ] Fix centering on Settings pages: Automated Tasks, Billing, Group Contact Form, Profile, and others

### Rename Leads → Enquiries
- [ ] Rename all "Leads" labels to "Enquiries" across the entire UI (nav, headings, buttons, badges)
- [ ] Rename "Leads Inbox" → "Enquiries Inbox"
- [ ] Rename "New Leads" → "New Enquiries"
- [ ] Rename "All Leads" → "All Enquiries"

### Enquiries & Events Workflow
- [ ] Separate "New Enquiries" inbox (unanswered) from "All Enquiries" (replied/active)
- [ ] When an enquiry is replied to (email sent), auto-add it to the calendar as an event (keep status)
- [ ] Allow manual creation of new enquiry from Inbox (+ New Enquiry button)
- [ ] Allow manual creation of confirmed event from Calendar (+ Add Event button)
- [ ] Enquiries table: sortable columns (Date Created, Event Date, Occasion, Contact, Company, Guests, Status)

### Calendar Overhaul (Function Tracker style)
- [ ] Rich event cards: show event title, time range, status, guest count
- [ ] Colour-coded status: Tentative=blue, Confirmed=green, Proposal Sent=yellow, Final Follow Up=orange, Site Visit=teal
- [ ] Add event pencil icon on each calendar cell for quick-add
- [ ] "Add Event" button in calendar header
- [ ] Month / Week / Day / List view toggle
- [ ] Today button in calendar header
- [ ] Multiple events stacked on same day

### Home Dashboard Widgets
- [ ] Allow resizing of widgets (small/medium/large toggle per widget)
- [ ] Mini calendar: allow customisation (show/hide follow-up dots, booking dots, enquiry dots)
- [ ] Widget show/hide toggles persist per user

### Runsheet Overhaul (Function Tracker style)
- [ ] Editable runsheet table: Time | Duration | Title | Description | Assigned To | Category
- [ ] Add/delete/reorder rows inline
- [ ] FOH (Front of House) tab
- [ ] Kitchen tab (same runsheet data, different view/filter)
- [ ] When creating a runsheet for an event, same data shared between FOH and Kitchen tabs
- [ ] Print/PDF export button

## Phase 14: Completed This Session

### RunsheetBuilder Overhaul
- [x] Editable timeline table: Time | Duration | Title | Description | Assigned To | Category — all inline editable
- [x] Add/delete/reorder/duplicate rows inline (move up/down buttons + duplicate button)
- [x] Contact section: Client Name, Phone, Email fields at top of runsheet
- [x] Three main tabs: Timeline | F&B Sheet | Checklist
- [x] FOH Sheet tab: course-by-course service, staff assignments, dietary flags, service time
- [x] Kitchen Sheet tab: same data, shows prep notes and plating notes instead
- [x] Dietary summary panel shown in Kitchen tab for kitchen awareness
- [x] Pre-event Checklist tab: tick-off items with categories, add custom items
- [x] Print view: clean print layout with no-print CSS for all edit controls
- [x] Print footer with venue name and date

### Dashboard Widget Resizing
- [x] DashboardWidgets component updated to support HALF/FULL width per widget
- [x] Resize toggle button (HALF/FULL) shown in edit mode per widget
- [x] Widget sizes persisted to userPreferences (widgetSizes field added to save mutation)
- [x] widgetSizes state loaded from userPreferences on mount
- [x] Edit mode hint updated to mention resize functionality

### Mini Calendar Customisation
- [x] Settings gear icon on mini calendar header
- [x] Start week on SUN or MON toggle (adjusts day labels and offset)
- [x] Legend show/hide toggle
- [x] Settings panel collapses when gear icon clicked again

## Mini Calendar — Click-to-Create Event
- [x] Click an empty date cell on the mini calendar to open a quick-create modal
- [x] Modal pre-fills the selected date; user can enter event name, type (Enquiry/Confirmed), guest count, and notes
- [x] Submitting the modal creates a new lead (enquiry) or booking (confirmed event) via tRPC
- [x] Calendar refreshes after creation to show the new dot on the clicked date

## Apple-Inspired Retheme
- [x] Update index.css: white/light grey surfaces, Inter font, blue accent (#0071E3), generous border-radius, subtle shadows
- [x] Update index.html: swap fonts to Inter (weights 300-700)
- [x] Restyle Dashboard: white nav bar with grey nav items, blue active state, clean card layouts
- [x] Restyle Home.tsx: Apple-style hero, feature grid, clean CTA buttons
- [ ] Restyle LeadForm.tsx: clean white form with blue submit button
- [ ] Restyle ProposalView.tsx: clean white proposal document
- [ ] Restyle ProposalBuilder.tsx: clean white builder UI

## Custom Colour Palette (Burnt Sienna / Ivory Sand / Stormy Sky / Sage Green)
- [ ] Update index.css CSS tokens with new palette
- [ ] Update Dashboard nav, buttons, stat cards, tabs
- [ ] Update Home.tsx landing page

## Bug Fixes (Mar 2026)
- [x] Fix Enquiries tab: status filter not showing results when a status is selected

## Dashboard Full Calendar + Enquiry-to-Event Flow
- [x] Dashboard home tab: show full monthly calendar grid prominently (left ~70%) + upcoming events sidebar (right ~30%)
- [x] Enquiries tab: only show non-confirmed leads (exclude booked/confirmed status)
- [x] Calendar: confirmed enquiries appear as sage green "Event" cards
- [x] Status pipeline: "Confirm Booking" button promotes enquiry to event
- [x] Calendar legend updated: Events (sage green), Enquiries (amber), Proposals (violet)

## Follow-ups & Delete (Mar 2026 Session 2)
- [x] New enquiry notification badge on Enquiries nav item (red dot + count when status="new")
- [x] "View on Calendar" shortcut in confirmed lead detail panel
- [x] Delete enquiry button in lead detail panel (with confirmation)
- [x] Delete confirmed event button in Calendar list view (with confirmation)
- [x] Auto-generate runsheet button from confirmed event in lead detail panel
