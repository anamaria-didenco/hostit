/**
 * What the app does when a request comes back "not signed in" (the session ended
 * while the app was open: signed out in another tab, cookie cleared, password
 * changed). It used to go straight to the sign-in page, throwing away anything
 * typed on the page, with no word of why.
 */
export type SignedOutAction = "keep-page" | "go-to-sign-in";

export function signedOutAction(opts: { typedOnPage: boolean; publicPage: boolean; pageKept?: boolean }): SignedOutAction {
  // Keep a staff page that has typing on it: the person signs in again in a new
  // tab and then saves. Client-facing pages keep their old behaviour.
  // `pageKept`: the notice has already said "What you've typed is still here".
  // The page then stays until they sign in again, even with no typing left on
  // screen (a closed dialog or another settings section still holds it): a later
  // failed request used to go to sign-in and throw that work away.
  return (opts.typedOnPage || opts.pageKept) && !opts.publicPage ? "keep-page" : "go-to-sign-in";
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

/** <input> types a person types into. A tick box, a radio button or a list choice isn't typing. */
const TYPING_INPUT_TYPES = new Set(["", "text", "email", "tel", "url", "number", "password", "date", "time", "datetime-local", "month", "week"]);

/**
 * Whether typing in this field is work to keep (a search box isn't). `searchBox`:
 * the field is marked as one (data-search-box), as the app's search boxes are
 * plain text inputs or comboboxes.
 */
export function isTypingField(field: { tag: string; type?: string | null; role?: string | null; contentEditable?: boolean; searchBox?: boolean }): boolean {
  if (field.searchBox || field.role === "searchbox") return false;
  if (field.contentEditable) return true;
  const tag = field.tag.toLowerCase();
  if (tag === "textarea") return true;
  return tag === "input" && TYPING_INPUT_TYPES.has((field.type ?? "").toLowerCase());
}

/**
 * Whether a field that was typed in still holds that typing when the session
 * ends: it is still on the page (not in a dialog that has closed, or on another
 * screen) and it wasn't emptied again. Typing once used to count for good, so
 * a cleared search box still kept the page much later.
 */
export function stillHoldsTyping(field: { onPage: boolean; value: string }): boolean {
  return field.onPage && field.value.trim() !== "";
}

/**
 * Whether a dismissed "you've been signed out" notice comes back. It does when
 * a save fails, or a screen can't load (Dismiss used to hide it for good, so
 * every later save failed with no word of why). A screen that is already showing
 * and only fails to refresh in the background (a timed check, coming back to the
 * tab) doesn't bring it back.
 */
export function signedOutNoticeComesBack(opts: { showing: boolean; backgroundRefresh: boolean }): boolean {
  return !opts.showing && !opts.backgroundRefresh;
}
