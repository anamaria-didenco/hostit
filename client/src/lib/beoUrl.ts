// One canonical builder for BEO PDF/preview URLs.
//
// Every button and flow that downloads, previews, prints or attaches the BEO
// must build its URL here. The operator's saved section-visibility toggles
// (the Print-layout checkboxes in the Runsheet Builder, persisted under
// vf:printHide:v1) are applied uniformly, so the BEO downloaded from the
// Dashboard, the Event page, the Runsheet Builder and the emailed briefings
// is always the SAME document.
const PRINT_PREFS_KEY = 'vf:printHide:v1';

export function beoUrl(
  bookingId: number | string,
  opts?: { format?: 'html'; nonce?: string | number },
): string {
  let hide = '';
  try {
    const raw = localStorage.getItem(PRINT_PREFS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr) && arr.length > 0) hide = arr.join(',');
  } catch {
    /* no prefs — full document */
  }
  const params = new URLSearchParams();
  if (opts?.format) params.set('format', opts.format);
  if (hide) params.set('hide', hide);
  if (opts?.nonce !== undefined) params.set('_', String(opts.nonce));
  const qs = params.toString();
  return `/api/beo/${bookingId}${qs ? `?${qs}` : ''}`;
}
