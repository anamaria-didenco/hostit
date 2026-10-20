// Turn what Xero said into something a venue manager can act on. A 401/403 or
// "AuthorizationUnsuccessful" is a lapsed connection or a missing permission —
// waiting a minute won't fix it, reconnecting will.

export const XERO_SETTINGS_URL = "/dashboard?tab=settings&sub=integrations";

export function xeroNeedsReconnect(message: string | null | undefined): boolean {
  return /\b(401|403)\b|AuthorizationUnsuccessful|unauthori[sz]ed|forbidden|invalid_grant|token (has )?expired|insufficient.?scope/i.test(message ?? "");
}

export function xeroErrorHelp(message: string | null | undefined): { title: string; detail: string; reconnect: boolean } {
  const raw = (message ?? "").trim() || "Xero didn't answer";
  if (xeroNeedsReconnect(raw)) {
    return {
      title: "Xero isn't letting VenueFlow read payments, so money paid in Xero may still show as owed here.",
      detail: `Reconnect Xero in Settings → Integrations and allow access when Xero asks. (Xero said: ${raw})`,
      reconnect: true,
    };
  }
  return {
    title: "Couldn't reach Xero just now.",
    detail: `This is usually temporary — try "Refresh from Xero" in a minute. (Xero said: ${raw})`,
    reconnect: false,
  };
}
