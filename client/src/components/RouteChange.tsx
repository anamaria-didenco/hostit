import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";
import { routeTitle } from "@shared/pageTitle";

// The marketing title from index.html, used by the landing page.
const DEFAULT_TITLE = typeof document !== "undefined" ? document.title : "";

// A page's main heading: an <h1>, or one written as role=heading level 1 (the
// shared floor plan's).
const H1 = "h1, [role='heading'][aria-level='1']";

/**
 * What a full page load would do on an in-app navigation, for screen-reader
 * and keyboard users:
 *  - the browser-tab title changes to the new route's (a page with more to say,
 *    e.g. the event's name, sets its own with useDocumentTitle);
 *  - focus moves to the new page's main heading, so it is announced and Tab
 *    continues from the top of the new page instead of from <body>.
 * Renders nothing.
 */
export default function RouteChange() {
  const [pathname] = useLocation();

  // A layout effect runs before any page's (passive) title effect in the same
  // commit, so a page's own title always wins over this default.
  useLayoutEffect(() => {
    document.title = routeTitle(pathname) ?? DEFAULT_TITLE;
  }, [pathname]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    // The page may still be loading, so wait (up to 5 s) for its heading. Give
    // up if anything else takes focus first (the page focusing a field, a
    // drawer opening) or the user starts clicking or typing.
    // On browser Back / Forward the page being left can render once more
    // against the new address before it goes ("Event not found" for a moment),
    // so a heading gets focus only once it has stayed put briefly, and if the
    // focused heading is then removed anyway, the next one gets it.
    let stopped = false;
    let candidate: HTMLElement | null = null;
    let focused: HTMLElement | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      stopped = true;
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(settle);
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
    const focusTakenElsewhere = () => {
      const active = document.activeElement;
      return !!active && active !== document.body && active.isConnected && active !== focused;
    };
    const focusHeading = (h1: HTMLElement) => {
      if (stopped || !h1.isConnected) return;
      if (focusTakenElsewhere()) { stop(); return; }
      focused = h1;
      if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
      // A heading isn't a control: no focus ring on it (inline !important beats
      // the app-wide :focus-visible rule), and no scroll jump for anyone.
      h1.style.setProperty("outline", "none", "important");
      h1.addEventListener("blur", () => h1.style.removeProperty("outline"), { once: true });
      h1.focus({ preventScroll: true });
    };
    const check = () => {
      if (stopped) return;
      if (focusTakenElsewhere()) { stop(); return; }
      if (focused?.isConnected) return;
      const h1 = document.querySelector<HTMLElement>(`main :is(${H1}), [role='main'] :is(${H1})`) ?? document.querySelector<HTMLElement>(H1);
      if (!h1 || h1 === candidate) return;
      candidate = h1;
      clearTimeout(settle);
      settle = setTimeout(() => focusHeading(h1), 150);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(stop, 5000);
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    const raf = requestAnimationFrame(check);
    return () => { cancelAnimationFrame(raf); stop(); };
  }, [pathname]);

  return null;
}
