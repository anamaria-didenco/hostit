/**
 * When has the live staff link really changed?
 *
 * The staff link polls every 30 seconds. React Query keeps the old `data`
 * object when nothing changed, except when the payload holds a Date, and this
 * one always does (the runsheet's updatedAt and event date, payment dates).
 * superjson rebuilds each Date as a new object, which never compares equal, so
 * `data` got a new identity on every poll. Anything keyed on it fired every
 * 30 seconds: the BEO reloaded and jumped back to the top, and screen readers
 * heard "Runsheet updated".
 *
 * This key is the content as text (a Date becomes its ISO string), so it only
 * changes when something staff can see changes. The checklist is left out:
 * ticks are shown by the checklist itself and aren't in the BEO, so a
 * teammate ticking a box mustn't reload the document.
 */
export function staffLinkContentKey(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const { checklist: _checklist, ...shown } = data as Record<string, unknown>;
  return JSON.stringify(shown);
}
