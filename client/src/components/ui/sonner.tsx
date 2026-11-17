import { createElement, Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { toast, useSonner, Toaster as Sonner, type ToasterProps } from "sonner";
import { errorToastOptions } from "@shared/errorToast";

// An error has to be read (and often acted on) before it goes, so error toasts
// stay until the close button dismisses them (WCAG 2.2.1). Patched once here
// rather than at each of the few hundred toast.error() calls; other toasts keep
// their timing. An error whose call gives its own duration keeps it: only do
// that for a pointer to errors that stay on the page anyway (the enquiry form's
// "Please fill in …", whose message also stays at the field).
// An error with no id of its own gets one from its message, so raising it again
// replaces the copy already showing instead of stacking another to close.
const showError = toast.error;
let errorsShown = 0;
toast.error = ((message, data) => {
  // The repeat's words are the same, so the live region would stay silent; a
  // new key makes React put the text back, which is announced like a new toast.
  const title = typeof message === "string" ? createElement(Fragment, { key: ++errorsShown }, message) : message;
  return showError(title, errorToastOptions(message, data));
}) as typeof toast.error;

// Toasts sit at the bottom of the screen, where some pages keep a bar fixed (the
// phone tab bar, a checklist's footer). An error toast now stays until it is
// closed, so lift the stack above any such bar instead of covering its buttons.
// Bars come and go with the route or a drawer, so this is re-measured while
// toasts are showing.
function useBottomBarClearance(showing: boolean) {
  const [clearance, setClearance] = useState(0);
  useEffect(() => {
    if (!showing) return;
    const measure = () => {
      const w = window.innerWidth, h = window.innerHeight;
      // Where the stack sits: full width up to Sonner's 600px breakpoint, else the bottom-right corner.
      const xs = w <= 600 ? [16, w / 2, w - 16] : [w - 372, w - 200, w - 32];
      let top = h;
      for (const x of xs) {
        for (const y of [h - 2, h - 32]) {
          let el = document.elementsFromPoint(x, y).find(e => !e.closest("[data-sonner-toaster]")) ?? null;
          while (el && el !== document.body && !/^(fixed|sticky)$/.test(getComputedStyle(el).position)) el = el.parentElement;
          if (!el || el === document.body || getComputedStyle(el).bottom === "auto") continue;
          const r = el.getBoundingClientRect();
          // A bar, not a drawer or overlay that fills the screen.
          if (r.bottom >= h - 40 && r.height <= h / 2) top = Math.min(top, r.top);
        }
      }
      setClearance(Math.max(0, Math.round(h - top)));
    };
    measure();
    const timer = window.setInterval(measure, 400);
    return () => window.clearInterval(timer);
  }, [showing]);
  return clearance;
}

// Sonner pauses its timers while the pointer is over the stack (it "expands"),
// but not while keyboard focus is inside a toast, so a toast could vanish under
// a keyboard user's focus. Treat focus like hover: the synthetic mouse events
// reach Sonner's own onMouseMove / onMouseLeave handlers.
function useFocusPausesToasts() {
  useEffect(() => {
    const listOf = (n: EventTarget | null) => (n instanceof Element ? n.closest("[data-sonner-toaster]") : null);
    const onFocusIn = (e: FocusEvent) => {
      listOf(e.target)?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    };
    const onFocusOut = (e: FocusEvent) => {
      const list = listOf(e.target);
      if (list && !(e.relatedTarget instanceof Node && list.contains(e.relatedTarget))) {
        list.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  useFocusPausesToasts();
  const clearance = useBottomBarClearance(useSonner().toasts.length > 0);

  // Portalled to <body>, after #root: the enquiry / event drawer makes #root
  // inert while it is open, which silenced every toast raised from the drawer
  // (inert content is not announced and its buttons can't be reached). As a
  // sibling of #root the live region is never inert, and it also comes after
  // the page in Tab order instead of before it.
  return createPortal(
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      duration={4000}
      // Sonner's own 24px / 16px from the bottom, plus any bar's height.
      offset={{ bottom: 24 + clearance }}
      mobileOffset={{ bottom: 16 + clearance }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // Sonner's default toast width is 356px. Cap it to the screen so a long
          // unbreakable message (a raw server error, a URL) can't stretch the
          // toast past a phone's edge and drag the whole page layout wider.
          "--width": "min(356px, calc(100vw - 32px))",
        } as React.CSSProperties
      }
      toastOptions={{ style: { overflowWrap: "anywhere" } }}
      {...props}
    />,
    document.body,
  );
};

export { Toaster };
