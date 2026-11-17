import { createElement as h, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import type { QueryClient } from "@tanstack/react-query";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { isPublicClientPath } from "@shared/pwaScope";
import { signedOutAction } from "@shared/sessionExpiry";
import { getLoginUrl } from "@/const";

/*
 * When the session ends while the app is open. If anything has been typed on
 * the page, the page stays as it is and a notice (role="alert", until
 * dismissed) offers to sign in again in a new tab; once a request that failed
 * works again, it says "signed in again". With nothing typed it still goes to
 * sign-in, and the sign-in page says why.
 *
 * The notice is its own element on <body>, not a toast: it has to work over an
 * open dialog (a toast can't be clicked behind a modal's overlay), so it sits
 * above the overlay and its clicks don't count as "outside" the dialog.
 */

const SIGNED_OUT_FLAG = "vf-signed-out";

let typedOnPage = false;
let hadSession = false;
let noticeShown = false;
const failedQueries = new Set<string>();
type NoticeState = "signed-out" | "signed-in-again" | null;
let notice: NoticeState = null;
const noticeListeners = new Set<(n: NoticeState) => void>();
function setNotice(n: NoticeState) {
  notice = n;
  noticeListeners.forEach(l => l(n));
}

function isEditable(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
    || (t instanceof HTMLElement && t.isContentEditable);
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG;
}

function handleUnauthorized() {
  if (signedOutAction({ typedOnPage, publicPage: isPublicClientPath(window.location.pathname) }) === "keep-page") {
    if (noticeShown) return;
    noticeShown = true;
    setNotice("signed-out");
    return;
  }
  if (hadSession) {
    try { sessionStorage.setItem(SIGNED_OUT_FLAG, "1"); } catch { /* storage blocked: no notice, still redirect */ }
  }
  window.location.href = getLoginUrl();
}

/** Watch the query and mutation caches for "not signed in" (replaces the old straight redirect). */
export function watchForSignOut(queryClient: QueryClient) {
  document.addEventListener("input", e => { if (isEditable(e.target)) typedOnPage = true; }, true);

  queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated") return;
    const { query } = event;
    if (event.action.type === "error") {
      const error = query.state.error;
      if (isUnauthorized(error)) {
        failedQueries.add(query.queryHash);
        handleUnauthorized();
      }
      console.error("[API Query Error]", error);
    } else if (event.action.type === "success") {
      const key = query.queryKey[0];
      if (Array.isArray(key) && key[0] === "auth" && key[1] === "me" && (query.state.data as any)?.user) hadSession = true;
      if (failedQueries.delete(query.queryHash)) signedInAgain();
    }
  });

  queryClient.getMutationCache().subscribe(event => {
    if (event.type !== "updated") return;
    if (event.action.type === "error") {
      const error = event.mutation.state.error;
      if (isUnauthorized(error)) handleUnauthorized();
      console.error("[API Mutation Error]", error);
    } else if (event.action.type === "success") {
      signedInAgain();
    }
  });
}

/** A request that needs a session worked again (signed in in the other tab): say so. */
function signedInAgain() {
  if (!noticeShown) return;
  noticeShown = false;
  failedQueries.clear();
  setNotice("signed-in-again");
  setTimeout(() => { if (notice === "signed-in-again") setNotice(null); }, 8000);
}

/** On the sign-in page after a session ended: say so (mounted beside the app so the toaster is ready). */
export function SignedOutNotice() {
  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(SIGNED_OUT_FLAG) === "1";
      sessionStorage.removeItem(SIGNED_OUT_FLAG);
    } catch { /* storage blocked */ }
    if (flagged && window.location.pathname === "/login") {
      toast("You were signed out", { description: "Sign in again to carry on." });
    }
  }, []);
  return null;
}

/** The "you've been signed out" notice, mounted once beside the app. */
export function SignedOutBanner() {
  const [state, setState] = useState<NoticeState>(notice);
  useEffect(() => {
    noticeListeners.add(setState);
    return () => { noticeListeners.delete(setState); };
  }, []);
  if (!state) return null;
  const signedOut = state === "signed-out";
  return createPortal(
    h("div", {
      role: "alert",
      // Over any dialog overlay, clickable even while a modal makes the page inert to the pointer,
      // and a click here doesn't close the dialog underneath.
      style: { pointerEvents: "auto" },
      onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      className: "fixed left-1/2 top-3 -translate-x-1/2 z-[2147483647] w-[calc(100%-2rem)] max-w-md bg-white text-ink border-2 shadow-xl px-4 py-3 font-dm text-sm "
        + (signedOut ? "border-red-700" : "border-forest"),
    },
      h("p", { className: "font-semibold" }, signedOut ? "You've been signed out" : "Signed in again. You can save now."),
      signedOut && h("p", { className: "mt-1" }, "What you've typed is still here. Sign in again in a new tab, then come back to this one and save."),
      h("div", { className: "mt-2 flex flex-wrap items-center gap-3" },
        signedOut && h("a", { href: getLoginUrl(), target: "_blank", rel: "noopener", className: "font-semibold text-forest underline" }, "Sign in (opens a new tab)"),
        h("button", { type: "button", onClick: () => setNotice(null), className: "text-ink/70 underline" }, "Dismiss"),
      ),
    ),
    document.body,
  );
}
