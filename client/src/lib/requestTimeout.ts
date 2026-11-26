/**
 * A time limit on the public enquiry form's own requests (NEXT's save,
 * SUBMIT and the step-2 "still here" ping). Without one a stalled request
 * left SUBMIT on "SUBMITTING…" for as long as the browser kept the
 * connection open, with nothing to tap. Staff screens' requests are left
 * alone. Used by main.tsx's tRPC link; tested in server/leadFormErrors.test.ts.
 */

/** The tRPC paths that get the limit. */
export const ENQUIRY_TIMEOUT_PATHS = ["leads.startCapture", "leads.submit", "leads.touchPartial"] as const;

/** Thrown when the limit is reached, so the form can say "Your connection dropped". */
export class EnquiryTimeoutError extends Error {
  constructor() {
    super("The request took too long.");
    this.name = "EnquiryTimeoutError";
  }
}

/** Whether an error (or one it wraps, as tRPC's client error does) is the form's own timeout. */
export function isEnquiryTimeout(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 5 && e && typeof e === "object"; i++) {
    if ((e as { name?: unknown }).name === "EnquiryTimeoutError") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Whether a tRPC request URL ("/api/trpc/leads.submit?batch=1", or a batch "a,b") calls one of the paths. */
export function callsEnquiryPath(url: string): boolean {
  let pathname: string;
  try { pathname = new URL(url, "http://x").pathname; } catch { return false; }
  const i = pathname.indexOf("/trpc/");
  if (i < 0) return false;
  const procs = decodeURIComponent(pathname.slice(i + "/trpc/".length)).split(",");
  return procs.some(p => (ENQUIRY_TIMEOUT_PATHS as readonly string[]).includes(p));
}

const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * A fetch that ends an enquiry request after `ms` with EnquiryTimeoutError,
 * including a reply whose body stalls, and cancels the connection. Other
 * requests go straight through.
 */
export function withEnquiryTimeout(fetchImpl: typeof fetch, ms: number): typeof fetch {
  return (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!callsEnquiryPath(url)) return fetchImpl(input, init);
    const ctrl = new AbortController();
    const outer = init?.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener("abort", () => ctrl.abort(outer.reason), { once: true });
    }
    return new Promise<Response>((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new EnquiryTimeoutError());
        ctrl.abort();
      }, ms);
      const finish = (f: () => void) => { if (done) return; done = true; clearTimeout(timer); f(); };
      fetchImpl(input, { ...init, signal: ctrl.signal })
        // Read the whole reply inside the limit; tRPC's answers are small.
        .then(async res => {
          const body = NULL_BODY.has(res.status) ? null : await res.text();
          finish(() => resolve(new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })));
        })
        .catch(err => finish(() => reject(err)));
    });
  };
}
