/**
 * What the app does when a request comes back "not signed in" (the session ended
 * while the app was open: signed out in another tab, cookie cleared, password
 * changed). It used to go straight to the sign-in page, throwing away anything
 * typed on the page, with no word of why.
 */
export type SignedOutAction = "keep-page" | "go-to-sign-in";

export function signedOutAction(opts: { typedOnPage: boolean; publicPage: boolean }): SignedOutAction {
  // Keep a staff page that has typing on it: the person signs in again in a new
  // tab and then saves. Client-facing pages keep their old behaviour.
  return opts.typedOnPage && !opts.publicPage ? "keep-page" : "go-to-sign-in";
}


/**
 * Who the app shows as signed in. While a signed-out page is being kept, any part
 * of the app that checks who is signed in again gets "nobody", and the dashboard
 * would swap the whole page for its sign-in card, losing what was typed. So until
 * they sign in again (or sign out on purpose) the page keeps the person it had;
 * its requests still fail until then.
 */
export function meWhileKept<T extends { user?: unknown }>(fetched: T | undefined, kept: T | null): T | undefined {
  return kept && !fetched?.user ? kept : fetched;
}
