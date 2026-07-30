// One canonical builder for BEO PDF/preview URLs.
//
// Every button and flow that downloads, previews, prints or attaches the BEO
// must build its URL here. The operator's saved section-visibility toggles
// (the Print-layout checkboxes in the Runsheet Builder, persisted under
// vf:printHide:v1) are applied uniformly, so the BEO downloaded from the
// Dashboard, the Event page, the Runsheet Builder and the emailed briefings
// is always the SAME document.
const PRINT_PREFS_KEY = 'vf:printHide:v1';

// The operator's saved section-visibility toggles as a comma-joined string
// (empty = full document). Shared so emailed briefings, which render the BEO
// server-side, honour the same Print-layout choices as a direct download.
export function getBeoHide(): string {
  try {
    const raw = localStorage.getItem(PRINT_PREFS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr) && arr.length > 0) return arr.join(',');
  } catch {
    /* no prefs — full document */
  }
  return '';
}

export function beoUrl(
  bookingId: number | string,
  opts?: { format?: 'html'; nonce?: string | number },
): string {
  const hide = getBeoHide();
  const params = new URLSearchParams();
  if (opts?.format) params.set('format', opts.format);
  if (hide) params.set('hide', hide);
  if (opts?.nonce !== undefined) params.set('_', String(opts.nonce));
  const qs = params.toString();
  return `/api/beo/${bookingId}${qs ? `?${qs}` : ''}`;
}
