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

