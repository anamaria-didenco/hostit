# VenueFlow tRPC API Reference

Base URL: `https://venueflowhq.com/api/trpc`

Calling convention:
- Query: `GET /api/trpc/<router>.<procedure>?input=<urlencoded {"json": {...}}>`
- Mutation: `POST /api/trpc/<router>.<procedure>` with body `{"json": {...}}`
- Auth: `protectedProcedure` requires session JWT cookie issued by `/api/trpc/auth.login`. `publicProcedure` does not.
- All input/output is JSON wrapped in `{"json": ...}`. Responses come back as `{"result":{"data":{"json": ...}}}`.
- Source of truth: `server/routers.ts`


## auth

- **me** `mutation` _(public)_
- **logout** `?` _(public)_

## venue

- **get** `query` _(public)_ — input: `z.object({ ownerId: z.number().optional() })`
- **update** `mutation` _(auth)_ — input: `z.object({ name: z.string().optional(), slug: z.string().optional(), tagline: z.string().optional(), description: z.string().optional(), address: z.string().optional(), city: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), website: z.string().optional(), leadFormTitle: z.string().opti`
- **getOwn** `?` _(auth)_
- **upsert** `mutation` _(auth)_ — input: `z.object({ name: z.string().optional(), slug: z.string().optional(), tagline: z.string().optional(), description: z.string().optional(), address: z.string().optional(), city: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), website: z.string().optional(), leadFormTitle: z.string().opti`
- **getBySlug** `query` _(public)_ — input: `z.object({ slug: z.string() })`
- **getDefault** `?` _(public)_
- **testEmail** `mutation` _(auth)_ — input: `z.object({ toEmail: z.string().email() })`
- **verifyNbi** `mutation` _(auth)_ — input: `z.object({ accountId: z.string(), venueId: z.string() })`
- **listNbiServices** `query` _(auth)_ — input: `z.object({ accountId: z.string(), venueId: z.string(), date: z.string().optional() })`
- **getNbiWebhookUrl** `mutation` _(auth)_
- **regenerateNbiWebhookSecret** `?` _(auth)_

## spaces

- **list** `?` _(auth)_
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), description: z.string().optional(), minCapacity: z.number().optional(), maxCapacity: z.number().optional(), minSpend: z.number().optional(), })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().optional().nullable(), minCapacity: z.number().optional().nullable(), maxCapacity: z.number().optional().nullable(), minSpend: z.number().optional().nullable(), })`

## contacts

- **list** `?` _(auth)_
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **create** `mutation` _(auth)_ — input: `z.object({ firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().email(), phone: z.string().optional(), company: z.string().optional(), notes: z.string().optional(), })`

## leads

- **create** `mutation` _(auth)_ — input: `z.object({ firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().email().optional().or(z.literal('')), phone: z.string().optional(), company: z.string().optional(), eventType: z.string().optional(), eventDate: z.string().optional(), guestCount: z.number().optional(), budget: z.number().option`
- **list** `query` _(auth)_ — input: `z.object({ status: z.string().optional() })`
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **submit** `mutation` _(public)_ — input: `z.object({ ownerId: z.number(), firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().email(), phone: z.string().optional(), company: z.string().optional(), eventType: z.string().optional(), eventDate: z.string().optional(), guestCount: z.number().optional(), budget: z.number().optional(), me`
- **updateStatus** `mutation` _(auth)_ — input: `z.object({ id: z.number(), status: z.string(), note: z.string().optional(), })`
- **addNote** `mutation` _(auth)_ — input: `z.object({ leadId: z.number(), content: z.string().min(1) })`
- **getActivity** `query` _(auth)_ — input: `z.object({ leadId: z.number() })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), internalNotes: z.string().optional(), followUpDate: z.string().optional(), assignedTo: z.number().optional(), source: z.string().optional(), firstName: z.string().optional(), lastName: z.string().nullable().optional(), phone: z.string().nullable().optional(), email: z.string().optional(), com`
- **activity** `query` _(auth)_ — input: `z.object({ leadId: z.number() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **markRead** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **setFollowUpDate** `mutation` _(auth)_ — input: `z.object({ id: z.number(), followUpDate: z.string().nullable(), // ISO date string or null to clear })`
- **overdue** `?` _(auth)_
- **followUpsByMonth** `query` _(auth)_ — input: `z.object({ year: z.number(), month: z.number() })`
- **eventsByMonth** `query` _(auth)_ — input: `z.object({ year: z.number(), month: z.number() })`
- **bulkUpdateStatus** `mutation` _(auth)_ — input: `z.object({ ids: z.array(z.number()).min(1), status: z.string(), })`
- **bulkCreate** `mutation` _(auth)_ — input: `z.array(z.object({ firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), company: z.string().optional(), eventType: z.string().optional(), eventDate: z.string().optional(), guestCount: z.number().optional(), budget: z.number().optional(), message: z.s`
- **bulkDelete** `mutation` _(auth)_ — input: `z.object({ ids: z.array(z.number()).min(1) })`
- **parseEnquiryText** `mutation` _(auth)_ — input: `z.object({ text: z.string().min(1) })`

## proposals

- **list** `?` _(auth)_
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **byLead** `query` _(auth)_ — input: `z.object({ leadId: z.number() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **create** `mutation` _(auth)_ — input: `z.object({ leadId: z.number(), title: z.string().min(1), introMessage: z.string().optional(), eventDate: z.string().optional(), eventEndDate: z.string().optional(), guestCount: z.number().optional(), spaceName: z.string().optional(), lineItems: z.array(z.object({ description: z.string(), qty: z.number(), unitPrice: z.n`
- **send** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), title: z.string().optional(), introMessage: z.string().optional(), lineItems: z.array(z.object({ description: z.string(), qty: z.number(), unitPrice: z.number(), total: z.number(), })).optional(), subtotalNzd: z.number().optional(), taxPercent: z.number().optional(), taxNzd: z.number().option`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **saveDrinks** `mutation` _(auth)_ — input: `z.object({ proposalId: z.number(), barOption: z.enum(["bar_tab", "cash_bar", "bar_tab_then_cash", "unlimited"]), tabAmount: z.number().optional(), selectedDrinks: z.array(z.string()), customDrinks: z.array(z.object({ name: z.string(), description: z.string().optional(), price: z.number().optional(), })), })`
- **getDrinks** `query` _(auth)_ — input: `z.object({ proposalId: z.number() })`
- **getDrinksByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **respond** `mutation` _(public)_ — input: `z.object({ token: z.string(), action: z.enum(["accepted", "declined"]), clientMessage: z.string().optional(), })`

## bookings

- **list** `?` _(auth)_
- **ensureForLead** `mutation` _(auth)_ — input: `z.object({ leadId: z.number() })`
- **pendingSpend** `?` _(auth)_
- **recordActualSpend** `mutation` _(auth)_ — input: `z.object({ id: z.number(), actualSpend: z.number().nullable(), actualSpendNotes: z.string().optional(), })`
- **dismissSpendPrompt** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **getOrCreateBeoToken** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **revokeBeoToken** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **getById** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), firstName: z.string().optional(), lastName: z.string().optional(), email: z.string().optional(), eventType: z.string().optional(), eventDate: z.string().optional(), eventEndDate: z.string().nullable().optional(), guestCount: z.number().nullable().optional(), spaceName: z.string().nullable().o`
- **byMonth** `query` _(auth)_ — input: `z.object({ year: z.number(), month: z.number() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **pushToNbi** `mutation` _(auth)_ — input: `z.object({ id: z.number(), force: z.boolean().optional() })`
- **markNbiSynced** `mutation` _(auth)_ — input: `z.object({ id: z.number(), nbiBookingId: z.string().optional() })`
- **clearNbiSync** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## menu

- **listPackages** `?` _(auth)_
- **listItems** `query` _(auth)_ — input: `z.object({ packageId: z.number() })`
- **createPackage** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), description: z.string().optional(), type: z.enum(['food', 'beverages', 'food_and_beverages']), pricePerHead: z.number().optional(), })`
- **updatePackage** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().optional(), type: z.enum(['food', 'beverages', 'food_and_beverages']).optional(), pricePerHead: z.number().nullable().optional(), isActive: z.boolean().optional(), })`
- **deletePackage** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **addItem** `mutation` _(auth)_ — input: `z.object({ packageId: z.number(), name: z.string().min(1), description: z.string().optional(), dietaryNotes: z.string().optional(), category: z.string().optional(), portionSize: z.string().optional(), sortOrder: z.number().optional(), })`
- **updateItem** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().min(1).optional(), description: z.string().optional(), dietaryNotes: z.string().optional(), category: z.string().optional(), portionSize: z.string().optional(), sortOrder: z.number().optional(), })`
- **deleteItem** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## barMenu

- **list** `?` _(auth)_
- **add** `mutation` _(auth)_ — input: `z.object({ category: z.string().min(1).default('General'), name: z.string().min(1), description: z.string().optional(), pricePerUnit: z.number().optional(), unit: z.string().optional(), sortOrder: z.number().optional(), })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), category: z.string().optional(), name: z.string().optional(), description: z.string().optional(), pricePerUnit: z.number().nullable().optional(), unit: z.string().optional(), isActive: z.boolean().optional(), sortOrder: z.number().optional(), })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## email

- **send** `mutation` _(auth)_ — input: `z.object({ to: z.string().email(), toName: z.string().optional(), subject: z.string().min(1), body: z.string().min(1), leadId: z.number().optional(), attachments: z.array(z.object({ filename: z.string(), content: z.string(), contentType: z.string(), })).optional(), })`

## templates

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), subject: z.string().min(1), body: z.string().min(1), })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().min(1).optional(), subject: z.string().min(1).optional(), body: z.string().min(1).optional(), })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## quote

- **save** `mutation` _(auth)_ — input: `z.object({ proposalId: z.number(), minimumSpend: z.number().optional(), foodTotal: z.number().optional(), autoBarTab: z.boolean().default(true), notes: z.string().optional(), items: z.array(z.object({ id: z.number().optional(), type: z.string().default('custom'), name: z.string(), description: z.string().optional(), qt`
- **get** `query` _(auth)_ — input: `z.object({ proposalId: z.number() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string(), proposalId: z.number() })`

## floorPlans

- **list** `query` _(auth)_ — input: `z.object({ bookingId: z.number().optional() })`
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **save** `mutation` _(auth)_ — input: `z.object({ id: z.number().optional(), bookingId: z.number().optional(), name: z.string().default('Floor Plan'), bgImageUrl: z.string().optional(), canvasData: z.any().optional(), })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **generateShareLink** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`

## setupInstructions

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ title: z.string().min(1), content: z.string().optional(), category: z.string().optional(), images: z.array(z.string()).optional() })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), title: z.string().min(1).optional(), content: z.string().nullable().optional(), category: z.string().optional(), images: z.array(z.string()).optional() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## tableSetups

- **list** `?` _(auth)_
- **save** `mutation` _(auth)_ — input: `z.object({ id: z.number().optional(), name: z.string().default('Table Setup'), description: z.string().optional(), canvasData: z.any().optional() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## waitlist

- **join** `mutation` _(public)_ — input: `z.object({ name: z.string().min(1), email: z.string().email(), venueName: z.string().optional(), message: z.string().optional(), })`
- **list** `?` _(auth)_

## checklists

- **listTemplates** `?` _(auth)_
- **createTemplate** `mutation` _(auth)_ — input: `z.object({ name: z.string(), description: z.string().optional(), items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), required: z.boolean().optional() })), })`
- **updateTemplate** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), required: z.boolean().optional() })).optional(), })`
- **deleteTemplate** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **assignToBooking** `mutation` _(auth)_ — input: `z.object({ templateId: z.number(), bookingId: z.number(), name: z.string().optional(), })`
- **getForBooking** `query` _(auth)_ — input: `z.object({ bookingId: z.number() })`
- **updateInstance** `mutation` _(auth)_ — input: `z.object({ id: z.number(), items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), required: z.boolean().optional(), checked: z.boolean(), checkedAt: z.string().optional(), notes: z.string().optional() })), completedAt: z.string().optional(), })`
- **deleteInstance** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **getOrCreateForRunsheet** `mutation` _(auth)_ — input: `z.object({ runsheetId: z.number(), name: z.string().optional(), defaultItems: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), checked: z.boolean() })).optional(), })`
- **getByShareToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **toggleItemByToken** `mutation` _(public)_ — input: `z.object({ token: z.string(), itemId: z.string(), checked: z.boolean() })`
- **saveItemsForRunsheet** `mutation` _(auth)_ — input: `z.object({ runsheetId: z.number(), items: z.array(z.object({ id: z.string(), text: z.string(), category: z.string().optional(), checked: z.boolean(), checkedAt: z.string().optional(), notes: z.string().optional() })), })`

## runsheets

- **list** `query` _(auth)_ — input: `z.object({ leadId: z.number().optional(), bookingId: z.number().optional() })`
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **create** `mutation` _(auth)_ — input: `z.object({ title: z.string(), leadId: z.number().optional(), bookingId: z.number().optional(), proposalId: z.number().optional(), eventDate: z.string().optional(), venueName: z.string().optional(), spaceName: z.string().optional(), venueArea: z.string().optional(), eventStartTime: z.string().optional(), eventEndTime: z`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), title: z.string().optional(), eventDate: z.string().optional().nullable(), venueName: z.string().optional(), spaceName: z.string().optional(), venueArea: z.string().optional(), eventStartTime: z.string().optional().nullable(), eventEndTime: z.string().optional().nullable(), guestCount: z.numb`
- **addItem** `mutation` _(auth)_ — input: `z.object({ runsheetId: z.number(), time: z.string(), duration: z.number().optional(), title: z.string(), description: z.string().nullable().optional(), assignedTo: z.string().nullable().optional(), category: z.string().optional(), sortOrder: z.number().default(0), bold: z.boolean().optional(), italic: z.boolean().optio`
- **updateItem** `mutation` _(auth)_ — input: `z.object({ id: z.number(), time: z.string().optional(), duration: z.number().optional(), title: z.string().optional(), description: z.string().nullable().optional(), assignedTo: z.string().nullable().optional(), category: z.string().optional(), sortOrder: z.number().optional(), bold: z.boolean().optional(), italic: z.b`
- **deleteItem** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## payments

- **list** `query` _(auth)_ — input: `z.object({ bookingId: z.number() })`
- **add** `mutation` _(auth)_ — input: `z.object({ bookingId: z.number(), amount: z.number().positive(), type: z.enum(['deposit', 'final', 'partial', 'refund', 'other']).default('deposit'), method: z.enum(['bank_transfer', 'cash', 'credit_card', 'eftpos', 'other']).default('bank_transfer'), paidAt: z.string(), // ISO date string notes: z.string().optional(),`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **summary** `query` _(auth)_ — input: `z.object({ bookingId: z.number() })`

## fnb

- **list** `query` _(auth)_ — input: `z.object({ runsheetId: z.number() })`
- **save** `mutation` _(auth)_ — input: `z.object({ runsheetId: z.number(), items: z.array(z.object({ id: z.number().optional(), section: z.enum(['foh', 'kitchen']), course: z.string().nullable().optional(), dishName: z.string(), description: z.string().nullable().optional(), qty: z.number().int().default(1), dietary: z.string().nullable().optional(), service`

## analytics

- **revenueByMonth** `query` _(auth)_ — input: `z.object({ year: z.number().int() })`
- **pipeline** `query` _(auth)_
- **topEventTypes** `?` _(auth)_
- **setGoal** `mutation` _(auth)_ — input: `z.object({ year: z.number().int(), month: z.number().int().min(0).max(12), targetRevenue: z.number().positive() })`
- **getGoals** `query` _(auth)_ — input: `z.object({ year: z.number().int() })`
- **sourceBreakdown** `?` _(auth)_

## expressBook

- **checkAvailability** `query` _(public)_ — input: `z.object({ date: z.string(), ownerId: z.number() })`
- **getVenueInfo** `query` _(public)_ — input: `z.object({ ownerId: z.number() })`
- **submit** `mutation` _(public)_ — input: `z.object({ ownerId: z.number(), firstName: z.string().min(1), lastName: z.string().optional(), email: z.string().email(), phone: z.string().optional(), eventType: z.string().min(1), eventDate: z.string(), guestCount: z.number().int().positive(), spaceName: z.string().optional(), selectedPackageIds: z.array(z.number()).`

## dashboard

- **stats** `?` _(auth)_

## tasks

- **list** `query` _(auth)_ — input: `z.object({ filter: z.enum(['all', 'mine', 'overdue', 'upcoming', 'completed']).optional() }).optional()`
- **create** `mutation` _(auth)_ — input: `z.object({ title: z.string().min(1), description: z.string().optional(), dueDate: z.number().optional(), linkedLeadId: z.number().optional(), linkedBookingId: z.number().optional(), assignedTo: z.string().optional(), priority: z.enum(['low', 'normal', 'high']).optional(), })`
- **complete** `mutation` _(auth)_ — input: `z.object({ id: z.number(), completed: z.boolean() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), title: z.string().optional(), description: z.string().optional(), dueDate: z.number().nullable().optional(), priority: z.enum(['low', 'normal', 'high']).optional(), linkedLeadId: z.number().nullable().optional(), linkedBookingId: z.number().nullable().optional(), })`

## taxesFees

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), type: z.enum(['tax', 'fee']), rate: z.string(), rateType: z.enum(['percentage', 'flat']), appliesTo: z.enum(['all', 'food', 'beverage']), })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().optional(), type: z.enum(['tax', 'fee']).optional(), rate: z.string().optional(), rateType: z.enum(['percentage', 'flat']).optional(), appliesTo: z.enum(['all', 'food', 'beverage']).optional(), isActive: z.boolean().optional(), })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## menuSections

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string(), salesCategory: z.string().optional(), hasSalesTax: z.boolean().optional(), hasAdminFee: z.boolean().optional(), hasGratuity: z.boolean().optional(), applyToMin: z.boolean().optional() })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().optional(), salesCategory: z.string().optional(), hasSalesTax: z.boolean().optional(), hasAdminFee: z.boolean().optional(), hasGratuity: z.boolean().optional(), applyToMin: z.boolean().optional() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## standaloneMenuItems

- **listBySection** `query` _(auth)_ — input: `z.object({ sectionId: z.number() })`
- **listAll** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ sectionId: z.number(), name: z.string(), description: z.string().optional(), pricePerPerson: z.string().optional(), priceFlat: z.string().optional(), pricingType: z.enum(['per_person','flat','per_hour']).optional(), imageUrl: z.string().optional(), hasSalesTax: z.boolean().optional(), hasAdminFee: z.boolean(`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## salesCategories

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## quickstart

- **get** `?` _(auth)_
- **markStep** `mutation` _(auth)_ — input: `z.object({ step: z.enum(['venueDetails','contactForm','bankAccount','menu','spaces','taxesFees']), value: z.boolean() })`

## userPreferences

- **get** `?` _(auth)_
- **save** `mutation` _(auth)_ — input: `z.object({ widgetOrder: z.array(z.string()), hiddenWidgets: z.array(z.string()), widgetSizes: z.record(z.string(), z.enum(['half', 'full'])).optional(), })`

## runsheetTemplates

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1).max(255), description: z.string().optional(), eventType: z.string().optional(), items: z.array(z.any()), })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## menuCatalog

- **listCategories** `query` _(auth)_ — input: `z.object({ type: z.enum(['food', 'drink', 'all']).optional() })`
- **createCategory** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1).max(255), type: z.enum(['food', 'drink']), description: z.string().optional(), sortOrder: z.number().optional(), })`
- **updateCategory** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().min(1).max(255).optional(), type: z.enum(['food', 'drink']).optional(), description: z.string().nullable().optional(), sortOrder: z.number().optional(), })`
- **deleteCategory** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **listItems** `query` _(auth)_ — input: `z.object({ categoryId: z.number().optional(), type: z.enum(['food', 'drink', 'all']).optional() })`
- **createItem** `mutation` _(auth)_ — input: `z.object({ categoryId: z.number(), name: z.string().min(1).max(255), description: z.string().optional(), pricingType: z.enum(['per_person', 'per_item']).default('per_person'), price: z.number().min(0).default(0), unit: z.string().optional(), available: z.boolean().default(true), allergens: z.string().optional(), sortOr`
- **updateItem** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().min(1).max(255).optional(), description: z.string().nullable().optional(), pricingType: z.enum(['per_person', 'per_item']).optional(), price: z.number().min(0).optional(), unit: z.string().optional(), available: z.boolean().optional(), allergens: z.string().nullable().optiona`
- **deleteItem** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **bulkCreateItems** `mutation` _(auth)_ — input: `z.array(z.object({ categoryId: z.number(), name: z.string().min(1), description: z.string().optional(), pricingType: z.enum(['per_person', 'per_item']).default('per_person'), price: z.number().min(0).default(0), unit: z.string().optional(), allergens: z.string().optional(), }))`
- **parseFnbText** `mutation` _(auth)_ — input: `z.object({ text: z.string().min(1), eventType: z.string().optional(), guestCount: z.number().optional(), })`
- **parseRunsheetText** `mutation` _(auth)_ — input: `z.object({ text: z.string().min(1), eventType: z.string().optional() })`
- **parseChecklistText** `mutation` _(auth)_ — input: `z.object({ text: z.string().min(1) })`

## contracts

- **list** `query` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional() })`
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **create** `mutation` _(auth)_ — input: `z.object({ title: z.string(), body: z.string(), bookingId: z.number().optional(), leadId: z.number().optional(), clientName: z.string().optional(), clientEmail: z.string().optional(), expiresAt: z.number().optional(), })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), title: z.string().optional(), body: z.string().optional(), status: z.enum(['draft','sent','signed','declined','expired']).optional(), clientName: z.string().optional(), clientEmail: z.string().optional(), expiresAt: z.number().optional(), })`
- **send** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **sign** `mutation` _(public)_ — input: `z.object({ token: z.string(), signerName: z.string(), signatureData: z.string(), signerIp: z.string().optional() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## budgets

- **list** `query` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional() })`
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string(), category: z.string().default('other'), type: z.enum(['income','expense']).default('expense'), estimatedAmount: z.number().default(0), actualAmount: z.number().optional(), notes: z.string().optional(), bookingId: z.number().optional(), leadId: z.number().optional(), })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().optional(), category: z.string().optional(), type: z.enum(['income','expense']).optional(), estimatedAmount: z.number().optional(), actualAmount: z.number().optional(), notes: z.string().optional(), isPaid: z.boolean().optional(), })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## equipment

- **listCatalog** `?` _(auth)_
- **createCatalog** `mutation` _(auth)_ — input: `z.object({ name: z.string(), category: z.string().default('other'), description: z.string().optional(), quantity: z.number().default(1), unit: z.string().default('item'), notes: z.string().optional() })`
- **deleteCatalog** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **listEvent** `query` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional() })`
- **addToEvent** `mutation` _(auth)_ — input: `z.object({ name: z.string(), category: z.string().default('other'), quantity: z.number().default(1), notes: z.string().optional(), providedBy: z.enum(['venue','client']).default('venue'), bookingId: z.number().optional(), leadId: z.number().optional(), equipmentId: z.number().optional() })`
- **updateEvent** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().optional(), quantity: z.number().optional(), notes: z.string().optional(), providedBy: z.enum(['venue','client']).optional(), status: z.enum(['needed','confirmed','delivered','returned']).optional() })`
- **deleteEvent** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## comms

- **list** `query` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional() })`
- **create** `mutation` _(auth)_ — input: `z.object({ type: z.enum(['note','email','call','sms','meeting']).default('note'), subject: z.string().optional(), body: z.string(), direction: z.enum(['inbound','outbound','internal']).default('internal'), contactName: z.string().optional(), contactEmail: z.string().optional(), bookingId: z.number().optional(), leadId:`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## seating

- **get** `query` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional() })`
- **save** `mutation` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional(), canvasData: z.string(), guestCount: z.number().default(0), name: z.string().default('Seating Chart'), })`

## portal

- **create** `mutation` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional(), clientName: z.string().optional(), clientEmail: z.string().optional(), permissions: z.object({ viewProposal: z.boolean().default(true), viewRunsheet: z.boolean().default(false), viewBudget: z.boolean().default(false), approveProposal: z.boolean`
- **list** `query` _(auth)_ — input: `z.object({ bookingId: z.number().optional(), leadId: z.number().optional() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## staffPortal

- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **createLink** `mutation` _(auth)_ — input: `z.object({ runsheetId: z.number(), label: z.string().optional(), expiresInDays: z.number().optional(), })`
- **listLinks** `query` _(auth)_ — input: `z.object({ runsheetId: z.number() })`
- **listAll** `?` _(auth)_
- **deleteLink** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## furnitureInventory

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), type: z.string().default('rect_table'), color: z.string().default('#d4a574'), width: z.number().int().positive().default(80), height: z.number().int().positive().default(80), seats: z.number().int().positive().optional(), quantity: z.number().int().positive().optional(), notes: z.str`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().min(1).optional(), type: z.string().optional(), color: z.string().optional(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional(), seats: z.number().int().positive().nullable().optional(), quantity: z.number().int().positive().nullabl`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## dailyChecklists

- **list** `?` _(auth)_
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), description: z.string().optional(), category: z.string().optional(), assignedDate: z.string().optional(), })`
- **createWithItems** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), description: z.string().optional(), category: z.string().optional(), assignedDate: z.string().optional(), items: z.array(z.object({ text: z.string().min(1), note: z.string().optional() })).max(200), })`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), name: z.string().optional(), description: z.string().optional(), category: z.string().optional(), assignedDate: z.string().nullable().optional(), })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **duplicate** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **addItem** `mutation` _(auth)_ — input: `z.object({ checklistId: z.number(), text: z.string().min(1), note: z.string().optional(), photoUrl: z.string().optional(), sortOrder: z.number().optional(), })`
- **updateItem** `mutation` _(auth)_ — input: `z.object({ id: z.number(), text: z.string().optional(), note: z.string().optional(), photoUrl: z.string().optional(), sortOrder: z.number().optional(), })`
- **deleteItem** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **addItemByToken** `mutation` _(public)_ — input: `z.object({ token: z.string(), text: z.string().min(1), note: z.string().optional() })`
- **deleteItemByToken** `mutation` _(public)_ — input: `z.object({ token: z.string(), itemId: z.number() })`
- **editItemByToken** `mutation` _(public)_ — input: `z.object({ token: z.string(), itemId: z.number(), text: z.string().min(1), note: z.string().optional() })`
- **toggleItemByToken** `mutation` _(public)_ — input: `z.object({ token: z.string(), itemId: z.number(), checked: z.boolean(), checkedBy: z.string().optional(), })`
- **resetByToken** `mutation` _(public)_ — input: `z.object({ token: z.string() })`

## shiftRunsheets

- **list** `?` _(auth)_
- **get** `query` _(auth)_ — input: `z.object({ id: z.number() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`
- **create** `mutation` _(auth)_ — input: `z.object({ date: z.string().optional(), dutyManager: z.string().optional(), sections: z.record(z.string(), z.string().optional()).optional(), specials: z.string().optional(), budget: z.string().optional(), specialNotes: z.string().optional(), marketFish: z.string().optional(), thingsToPush: z.string().optional(), linke`
- **update** `mutation` _(auth)_ — input: `z.object({ id: z.number(), date: z.string().optional().nullable(), dutyManager: z.string().optional().nullable(), sections: z.record(z.string(), z.string().optional()).optional().nullable(), specials: z.string().optional().nullable(), budget: z.string().optional().nullable(), specialNotes: z.string().optional().nullabl`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`

## team

- **list** `?` _(auth)_
- **create** `mutation` _(auth)_ — input: `z.object({ name: z.string().min(1), email: z.string().optional(), role: z.string().default('staff') })`
- **delete** `mutation` _(auth)_ — input: `z.object({ id: z.number() })`
- **getByToken** `query` _(public)_ — input: `z.object({ token: z.string() })`