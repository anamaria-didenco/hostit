// What a Xero invoice status means to the team, in plain words. A DRAFT sits in
// Xero waiting to be approved there — the client hasn't been billed yet.
export function invoiceState(status: string | null | undefined): { label: string; hint: string; bg: string; text: string; strike?: boolean } {
  switch (status) {
    case "PAID": return { label: "Paid", hint: "Paid in full and reconciled in Xero", bg: "#dcfce7", text: "#166534" };
    case "AUTHORISED": return { label: "Awaiting payment", hint: "Approved in Xero and sent to the client — waiting for payment", bg: "#dbeafe", text: "#1e40af" };
    case "SUBMITTED": return { label: "Awaiting approval", hint: "Submitted in Xero, not yet approved", bg: "#ede9fe", text: "#5b21b6" };
    case "VOIDED": return { label: "Voided", hint: "Voided in Xero", bg: "#f3f4f6", text: "#6b7280", strike: true };
    default: return { label: "Draft in Xero", hint: "Sitting as a draft in Xero — approve it there to bill the client", bg: "#fef3c7", text: "#92400e" };
  }
}

export const STREAM_LABEL: Record<string, string> = { food: "Food", drinks: "Drinks", deposit: "Deposit" };
