import { describe, it, expect, vi, afterEach } from "vitest";
import { TRPCClientError } from "@trpc/client";
import { COULD_NOT_REACH, CONNECTION_DROPPED, OUR_SIDE, describeEnquiryError, fieldFromMessage } from "../client/src/lib/enquiryErrors";
import { EnquiryTimeoutError, callsEnquiryPath, isEnquiryTimeout, withEnquiryTimeout } from "../client/src/lib/requestTimeout";
import { ENQUIRY_REQUEST_TIMEOUT_MS } from "@shared/enquiryTiming";

/** What the website form says when a request fails, and its time limit (client/src/lib/enquiryErrors.ts, requestTimeout.ts). */

const trpcError = (message: string, data?: Record<string, unknown>) => {
  const e = new TRPCClientError(message);
  (e as any).data = data;
  return e;
};

describe("what a failed SUBMIT says", () => {
  it("no readable answer (offline, a gateway's HTML page): plain words, and that it may have gone through", () => {
    for (const raw of ["Failed to fetch", "Load failed", `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, "NetworkError when attempting to fetch resource."]) {
      const v = describeEnquiryError(trpcError(raw), false);
      expect(v).toEqual({ text: COULD_NOT_REACH, field: null, stepOne: false, network: true });
    }
    expect(COULD_NOT_REACH).toBe("We couldn't reach the venue just now. Check your connection and tap SUBMIT again. If it already went through, you'll get an email from us.");
  });
  it("the form's own time limit: the connection dropped", () => {
    const e = TRPCClientError.from(new EnquiryTimeoutError());
    expect(isEnquiryTimeout(e)).toBe(true);
    expect(describeEnquiryError(e, isEnquiryTimeout(e)).text).toBe(CONNECTION_DROPPED);
    expect(CONNECTION_DROPPED).toBe("Your connection dropped. Tap SUBMIT to try again.");
    expect(isEnquiryTimeout(trpcError("Failed to fetch"))).toBe(false);
  });
  it("a field the server refused: which field, and whether it's on step 1", () => {
    expect(describeEnquiryError(trpcError("Email: Invalid email address.", { code: "BAD_REQUEST", field: "email" }), false))
      .toEqual({ text: "Email: Invalid email address.", field: "email", stepOne: true, network: false });
    expect(describeEnquiryError(trpcError("What's the occasion? is too long (255 characters at most).", { code: "BAD_REQUEST", field: "eventDetail" }), false))
      .toMatchObject({ field: "eventDetail", stepOne: false });
  });
  it("finds the field in the sentence when an older server doesn't say", () => {
    expect(describeEnquiryError(trpcError("Email: Invalid email address.", { code: "BAD_REQUEST" }), false)).toMatchObject({ field: "email", stepOne: true });
    expect(fieldFromMessage("Event Detail is too long (255 characters at most).")).toBe("eventDetail");
    expect(fieldFromMessage("Invoicing Note is too long (255 characters at most).")).toBe("invoicingNote");
    expect(fieldFromMessage("What's the occasion? is too long (255 characters at most).")).toBe("eventDetail");
    expect(fieldFromMessage("Guest count must be 100000 or less.")).toBe("guestCount");
    expect(fieldFromMessage("First name is required.")).toBe("firstName");
    expect(fieldFromMessage("Too many submissions from your connection just now.")).toBeNull();
  });
  it("keeps the server's own words for the rate limit and the security check", () => {
    const limit = "Too many submissions from your connection just now. Please wait a few minutes and try again.";
    expect(describeEnquiryError(trpcError(limit, { code: "TOO_MANY_REQUESTS" }), false).text).toBe(limit);
    expect(describeEnquiryError(trpcError(limit, { code: "INTERNAL_SERVER_ERROR" }), false).text).toBe(limit);
    const check = "Please complete the quick security check and try again.";
    expect(describeEnquiryError(trpcError(check, { code: "FORBIDDEN" }), false).text).toBe(check);
  });
  it("the server's catch-all becomes something a visitor can act on", () => {
    expect(describeEnquiryError(trpcError("Internal server error", { code: "INTERNAL_SERVER_ERROR" }), false).text).toBe(OUR_SIDE);
  });
});

describe("the enquiry form's time limit", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("is 20 seconds, on NEXT's save, SUBMIT and the ping only", () => {
    expect(ENQUIRY_REQUEST_TIMEOUT_MS).toBe(20_000);
    expect(callsEnquiryPath("/api/trpc/leads.submit?batch=1")).toBe(true);
    expect(callsEnquiryPath("/api/trpc/leads.startCapture?batch=1")).toBe(true);
    expect(callsEnquiryPath("/api/trpc/leads.touchPartial?batch=1")).toBe(true);
    expect(callsEnquiryPath("/api/trpc/leads.formConfig,leads.submit?batch=1")).toBe(true);
    expect(callsEnquiryPath("/api/trpc/leads.list?batch=1")).toBe(false);
    expect(callsEnquiryPath("/api/trpc/proposals.submit?batch=1")).toBe(false);
    expect(callsEnquiryPath("https://venueflowhq.example.test/api/trpc/leads.submit")).toBe(true);
  });

  it("ends a request that never answers, and cancels it", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const hung: typeof fetch = (_i, init) => { signal = init?.signal ?? undefined; return new Promise(() => {}); };
    const f = withEnquiryTimeout(hung, 20_000);
    const p = f("/api/trpc/leads.submit?batch=1", { method: "POST" });
    const caught = p.catch(e => e);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await caught;
    expect(err).toBeInstanceOf(EnquiryTimeoutError);
    expect(signal!.aborted).toBe(true);
  });

  it("ends a reply whose body stalls too", async () => {
    vi.useFakeTimers();
    const stalled: typeof fetch = () => Promise.resolve(new Response(new ReadableStream({ start() { /* never sends */ } }), { status: 200 }));
    const caught = withEnquiryTimeout(stalled, 20_000)("/api/trpc/leads.submit", {}).catch(e => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await caught).toBeInstanceOf(EnquiryTimeoutError);
  });

  it("passes a normal answer through untouched, and leaves staff requests alone", async () => {
    const ok: typeof fetch = () => Promise.resolve(new Response('{"result":1}', { status: 200, headers: { "content-type": "application/json" } }));
    const res = await withEnquiryTimeout(ok, 20_000)("/api/trpc/leads.submit", {});
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ result: 1 });
    const direct = new Response("x");
    const passthrough: typeof fetch = () => Promise.resolve(direct);
    expect(await withEnquiryTimeout(passthrough, 1)("/api/trpc/leads.list", {})).toBe(direct);
  });

  it("still lets the caller cancel", async () => {
    const ctrl = new AbortController();
    const hung: typeof fetch = (_i, init) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const p = withEnquiryTimeout(hung, 20_000)("/api/trpc/leads.submit", { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
