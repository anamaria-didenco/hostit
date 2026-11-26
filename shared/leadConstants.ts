// The exact internalNotes value startCapture writes when it autosaves a lead
// after step 1 of the embed wizard, before the visitor has completed step 2.
// leads.submit clears it back to null once that same lead is completed (see
// server/routers.ts). Client UI (Dashboard.tsx) matches leads against this
// exact string to render the "Partial" chip/filter — kept here, not
// duplicated, so the two can never drift apart.
export const PARTIAL_LEAD_NOTE = "Partial — did not complete step 2";

// Written to internalNotes instead of clearing it when a visitor finishes
// their own step-1 enquiry but the form's hidden anti-bot field came back
// filled in. Step 1 passed the spam checks, so the enquiry is kept rather
// than silently dropped, and staff can see why it might not be real.
export const POSSIBLE_SPAM_NOTE = "Possible spam: the form's hidden anti-bot field was filled in when this was sent. Check it looks real before replying.";

// Sources that aren't inbound enquiries: staff typed or imported them, an
// Express Book request, or a health check. Nobody is waiting on a reply, and
// they never count as "the same person came back" for an unfinished one.
export const NON_ENQUIRY_SOURCES: string[] = ["manual", "csv_import", "healthcheck", "express_book", "xero"];

// The bell row's dedupe key for an enquiry's "Unfinished enquiry" alert. The
// alert job writes it; leads.submit looks it up when that enquiry is finished.
export const partialAlertDedupeKey = (leadId: number) => `partial-enquiry:${leadId}`;
