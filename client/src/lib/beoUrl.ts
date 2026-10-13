import { toast } from 'sonner';

// One canonical builder for BEO PDF/preview URLs.
//
// Every button and flow that downloads, previews, prints or attaches the BEO
// must build its URL here, so the BEO downloaded from the Dashboard, the Event
// page, the Runsheet Builder and the emailed briefings is always the SAME
// document. Which sections print ("Choose print sections") is saved on the
// venue and applied by the server; pass `hide` only for a live preview of
// unsaved choices.
//
// `copy: 'client'` is the client copy: per-dish prices, the itemised money
// table and signature lines. The default is the team copy the floor and
// kitchen work from, without them.
export function beoUrl(
  bookingId: number | string,
  opts?: { format?: 'html'; nonce?: string | number; copy?: 'client'; hide?: string[] },
): string {
  const params = new URLSearchParams();
  if (opts?.format) params.set('format', opts.format);
  if (opts?.copy) params.set('copy', opts.copy);
  // "none" is not a section key, so an empty choice still overrides the
  // venue's saved one rather than falling back to it.
  if (opts?.hide) params.set('hide', opts.hide.length ? opts.hide.join(',') : 'none');
  if (opts?.nonce !== undefined) params.set('_', String(opts.nonce));
  const qs = params.toString();
  return `/api/beo/${bookingId}${qs ? `?${qs}` : ''}`;
}

function fileNameFrom(disposition: string | null): string | null {
  if (!disposition) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) { try { return decodeURIComponent(star[1].trim()); } catch { /* fall through */ } }
  const plain = /filename="([^"]+)"/i.exec(disposition);
  return plain ? plain[1] : null;
}

// Download the BEO with feedback the whole way: "Preparing…" while the PDF is
// made (a few seconds), then the file name once it's saved, or a plain reason
// and the printable page if it couldn't be made.
export async function downloadBeo(bookingId: number | string, opts?: { copy?: 'client' }): Promise<void> {
  const label = opts?.copy === 'client' ? 'client copy' : 'BEO';
  const openPrintable = () => window.open(beoUrl(bookingId, { format: 'html', copy: opts?.copy }), '_blank', 'noopener');
  const id = toast.loading(`Preparing the ${label}. This takes a few seconds…`);
  try {
    const res = await fetch(beoUrl(bookingId, { copy: opts?.copy }), {
      credentials: 'include',
      signal: AbortSignal.timeout(90_000),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('application/pdf')) {
      const reason = res.status === 503 ? (await res.text().catch(() => '')).trim() : '';
      toast.error(reason || (res.status === 401
        ? 'You\'ve been signed out. Sign in again, then download the BEO.'
        : `Couldn't make the ${label}. Try again, or open the printable page.`), {
        id,
        duration: 12_000,
        action: { label: 'Open printable page', onClick: openPrintable },
      });
      return;
    }
    const name = fileNameFrom(res.headers.get('content-disposition')) || `BEO ${bookingId}.pdf`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success(`Downloaded "${name}"`, { id, description: 'It\'s in your Downloads folder.', duration: 8_000 });
  } catch (e: any) {
    toast.error(e?.name === 'TimeoutError'
      ? `The ${label} took too long to make. Try again in a minute.`
      : `Couldn't download the ${label}. Check your connection and try again.`, {
      id,
      duration: 12_000,
      action: { label: 'Open printable page', onClick: openPrintable },
    });
  }
}

// Several events' run sheets as one PDF ("print the week"). Same feedback as
// downloadBeo, but it takes longer — every event is made in turn.
export async function downloadBeoBatch(bookingIds: number[], label: string): Promise<boolean> {
  const n = bookingIds.length;
  const id = toast.loading(`Preparing ${n} run sheet${n === 1 ? '' : 's'}. This can take a minute…`);
  try {
    const params = new URLSearchParams({ ids: bookingIds.join(','), label });
    const res = await fetch(`/api/beo/batch?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(Math.max(120_000, n * 30_000)),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('application/pdf')) {
      const reason = (await res.text().catch(() => '')).trim();
      toast.error(res.status === 401
        ? 'You\'ve been signed out. Sign in again, then print the week.'
        : (reason && reason.length < 160 ? reason : 'Couldn\'t make the run sheets. Try again in a minute.'), { id, duration: 12_000 });
      return false;
    }
    const failed = Number(res.headers.get('x-beo-failed') || 0);
    const name = fileNameFrom(res.headers.get('content-disposition')) || `${label}.pdf`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (failed > 0) {
      toast.warning(`Downloaded "${name}", but ${failed} event${failed === 1 ? '' : 's'} couldn't be made`, {
        id, description: 'Download those from the event itself.', duration: 12_000,
      });
    } else {
      toast.success(`Downloaded "${name}"`, { id, description: 'One PDF, every event in date order. It\'s in your Downloads folder.', duration: 8_000 });
    }
    return true;
  } catch (e: any) {
    toast.error(e?.name === 'TimeoutError'
      ? 'The run sheets took too long to make. Try fewer events at a time.'
      : 'Couldn\'t download the run sheets. Check your connection and try again.', { id, duration: 12_000 });
    return false;
  }
}
