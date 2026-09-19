// The exact internalNotes value startCapture writes when it autosaves a lead
// after step 1 of the embed wizard, before the visitor has completed step 2.
// leads.submit clears it back to null once that same lead is completed (see
// server/routers.ts). Client UI (Dashboard.tsx) matches leads against this
// exact string to render the "Partial" chip/filter — kept here, not
// duplicated, so the two can never drift apart.
export const PARTIAL_LEAD_NOTE = "Partial — did not complete step 2";
