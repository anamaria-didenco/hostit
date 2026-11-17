import { createElement as h, Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import type { QueryClient } from "@tanstack/react-query";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { isPublicClientPath } from "@shared/pwaScope";
import { isTypingField, signedOutAction, signedOutNoticeComesBack, stillHoldsTyping } from "@shared/sessionExpiry";
import { getLoginUrl } from "@/const";

/*
 * When the session ends while the app is open. If a field on the page still
 * holds something typed, the page stays as it is and a notice (role="alert",
 * until dismissed; a later failed save brings it back) offers to sign in again
 * in a new tab; once a request that failed works again, it says "signed in
 * again". With nothing typed it still goes to sign-in, and the sign-in page
 * says why. Once kept, the page stays kept until they sign in again (or sign
 * out on purpose), even when the typing is no longer on screen: a closed dialog
 * or another settings section still holds it.
 *
 * The notice is its own element on <body>, not a toast: it has to work over an
 * open dialog (a toast can't be clicked behind a modal's overlay), so it sits
 * above the overlay and its clicks don't count as "outside" the dialog. A dialog
 * keeps keyboard focus inside itself, so a copy of the sign-in link is also put
 * (visually hidden) at the end of the dialog that has focus; while it has focus,
 * the notice's own link shows the focus ring.
 *
 * While the page is kept, useAuth keeps the person who was signed in (see
 * keptMe), so a fresh "who is signed in?" check can't swap the page for the
 * sign-in card. Coming back to the tab, or any save working, checks again.
 */

const SIGNED_OUT_FLAG = "vf-signed-out";

// Fields typed in. Only those still on the page and not emptied again count (see typedOnPage).
const typedFields = new Set<HTMLElement>();
// Typing kept while its fields are closed (the email composer's unsent draft).
const heldTyping = new Map<string, () => boolean>();
let hadSession = false;
let noticeShown = false;
let lastMe: { user?: unknown } | null = null;
const failedQueries = new Set<string>();
type NoticeState = "signed-out" | "signed-in-again" | null;
let notice: NoticeState = null;
// Where focus was when the notice appeared: keyboard focus goes back there when the
// notice goes while it has focus (Dismiss dropped it to the page).
let focusBeforeNotice: HTMLElement | null = null;
const noticeListeners = new Set<(n: NoticeState) => void>();
function setNotice(n: NoticeState) {
  if (n === notice) return;
  if (n === "signed-out") {
    const active = document.activeElement;
    focusBeforeNotice = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  notice = n;
  noticeListeners.forEach(l => l(n));
}
const keptListeners = new Set<() => void>();
function setKeeping(on: boolean) {
  noticeShown = on;
  keptListeners.forEach(l => l());
}

/** The signed-in answer to keep showing while a signed-out page is kept (null otherwise). For useSyncExternalStore. */
export function keptMe(): { user?: unknown } | null {
  return noticeShown ? lastMe : null;
}
export function subscribeKeptMe(listener: () => void) {
  keptListeners.add(listener);
  return () => { keptListeners.delete(listener); };
}
/** Signing out on purpose: stop keeping the page. */
export function endKeptPage() {
  if (!noticeShown) return;
  setKeeping(false);
  failedQueries.clear();
  setNotice(null);
}

function isAuthMe(queryKey: readonly unknown[]): boolean {
  const key = queryKey[0];
  return Array.isArray(key) && key[0] === "auth" && key[1] === "me";
}

function noteTyping(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return;
  if (!isTypingField({ tag: t.tagName, type: t.getAttribute("type"), role: t.getAttribute("role"), contentEditable: t.isContentEditable, searchBox: t.hasAttribute("data-search-box") })) return;
  typedFields.add(t);
  if (typedFields.size > 50) typedOnPage(); // drops fields that have gone
}

/**
 * Count typing that is kept in memory while its fields are closed, such as an
 * unsent email that comes back when the composer reopens. `has` says whether
 * there is any now. Returns the cleanup for useEffect.
 */
export function holdTyping(key: string, has: () => boolean) {
  heldTyping.set(key, has);
  return () => { heldTyping.delete(key); };
}

/** Is there typing on the page to keep? */
function typedOnPage(): boolean {
  let typed = [...heldTyping.values()].some(has => has());
  for (const el of typedFields) {
    if (!el.isConnected) { typedFields.delete(el); continue; }
    const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent ?? "";
    if (stillHoldsTyping({ onPage: true, value })) typed = true;
  }
  return typed;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG;
}

/** `backgroundRefresh`: a query that already has data refreshing (not a save, not a screen loading). */
function handleUnauthorized(backgroundRefresh = false) {
  if (signedOutAction({ typedOnPage: typedOnPage(), publicPage: isPublicClientPath(window.location.pathname), pageKept: noticeShown }) === "keep-page") {
    if (!noticeShown) {
      setKeeping(true);
      setNotice("signed-out");
    } else if (signedOutNoticeComesBack({ showing: notice === "signed-out", backgroundRefresh })) {
      setNotice("signed-out");
    }
    return;
  }
  if (hadSession) {
    try { sessionStorage.setItem(SIGNED_OUT_FLAG, "1"); } catch { /* storage blocked: no notice, still redirect */ }
  }
  window.location.href = getLoginUrl();
}

/** Watch the query and mutation caches for "not signed in" (replaces the old straight redirect). */
export function watchForSignOut(queryClient: QueryClient) {
  document.addEventListener("input", e => noteTyping(e.target), true);

  // Ask the server again: after signing in in another tab and coming back, or after a save worked.
  const recheck = () => {
    if (noticeShown) queryClient.invalidateQueries({ predicate: q => isAuthMe(q.queryKey) });
  };
  window.addEventListener("focus", recheck);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") recheck(); });

  queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated") return;
    const { query } = event;
    if (event.action.type === "error") {
      const error = query.state.error;
      if (isUnauthorized(error)) {
        failedQueries.add(query.queryHash);
        handleUnauthorized(query.state.data !== undefined);
      }
      console.error("[API Query Error]", error);
    } else if (event.action.type === "success") {
      const me = query.state.data as { user?: unknown } | undefined;
      if (isAuthMe(query.queryKey) && me?.user) {
        hadSession = true;
        lastMe = me;
        signedInAgain();
      }
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
      // Some requests work signed out too, so check rather than assume.
      recheck();
    }
  });
}

/** A request that needs a session worked again (signed in in the other tab): say so. */
function signedInAgain() {
  if (!noticeShown) return;
  setKeeping(false);
  failedQueries.clear();
  // Error toasts from saves that failed while signed out ("Failed to add record")
  // are out of date now, and an error toast can stay until it is closed.
  for (const t of toast.getToasts()) if ("type" in t && t.type === "error") toast.dismiss(t.id);
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

/** The open dialog that has keyboard focus (it keeps focus inside itself), or null. */
function focusedDialog(): HTMLElement | null {
  const active = document.activeElement;
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  for (let i = dialogs.length - 1; i >= 0; i--) if (active && dialogs[i].contains(active)) return dialogs[i];
  return null;
}

/** Follows which dialog has focus while `on`, as dialogs open and close. */
function useFocusedDialog(on: boolean): HTMLElement | null {
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!on) { setDialog(null); return; }
    const update = () => setDialog(focusedDialog());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
    document.addEventListener("focusin", update);
    return () => { observer.disconnect(); document.removeEventListener("focusin", update); };
  }, [on]);
  return dialog;
}

/** Focus put there from the keyboard. A click or tap on Dismiss leaves focus as it was before. */
function keyboardFocused(el: Element): boolean {
  try { return el.matches(":focus-visible"); } catch { return false; } // a browser without :focus-visible
}

/** The "you've been signed out" notice, mounted once beside the app. */
export function SignedOutBanner() {
  const [state, setState] = useState<NoticeState>(notice);
  const signedOut = state === "signed-out";
  const dialog = useFocusedDialog(signedOut);
  // Keyboard focus in the notice when it goes, or when its link goes (signed in
  // again), fell to the page: put it back where it was before the notice.
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const focusFrom = useRef<HTMLElement | null>(null);
  const putFocusBack = useRef(false);
  useEffect(() => {
    const listener = (n: NoticeState) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && bannerRef.current?.contains(active) && keyboardFocused(active)) putFocusBack.current = true;
      setState(n);
    };
    noticeListeners.add(listener);
    return () => { noticeListeners.delete(listener); };
  }, []);
  useLayoutEffect(() => {
    if (!putFocusBack.current) return;
    putFocusBack.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return; // still on something
    const back = [focusBeforeNotice, focusFrom.current].find(el => el?.isConnected && !bannerRef.current?.contains(el));
    back?.focus();
  }, [state]);
  const [copyFocused, setCopyFocused] = useState(false);
  useEffect(() => setCopyFocused(false), [dialog]); // the copy goes with its dialog
  if (!state) return null;
  const banner = createPortal(
    h("div", {
      ref: bannerRef,
      role: "alert",
      // Tabbing to the notice: if where focus was when it appeared has gone, go back to where it came from.
      onFocus: (e: { relatedTarget: EventTarget | null }) => {
        const from = e.relatedTarget;
        if (from instanceof HTMLElement && !bannerRef.current?.contains(from)) focusFrom.current = from;
      },
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
        signedOut && h("a", { href: getLoginUrl(), target: "_blank", rel: "noopener", className: "font-semibold text-forest underline" + (copyFocused && dialog ? " outline-2 outline-offset-2 outline-[#2f5488]" : "") }, "Sign in (opens a new tab)"),
        h("button", { type: "button", onClick: () => setNotice(null), className: "text-ink/70 underline" }, "Dismiss"),
      ),
    ),
    document.body,
  );
  if (!signedOut || !dialog) return banner;
  // Tab or Shift+Tab inside the dialog reaches the copy (one Shift+Tab from the dialog's first control).
  return h(Fragment, null, banner, createPortal(
    h("a", {
      href: getLoginUrl(), target: "_blank", rel: "noopener", className: "sr-only",
      onFocus: () => setCopyFocused(true), onBlur: () => setCopyFocused(false),
    }, "Signed out. Sign in again (opens a new tab)"),
    dialog,
  ));
}
