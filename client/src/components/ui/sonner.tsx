import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { toast, Toaster as Sonner, type ToasterProps } from "sonner";

// An error has to be read (and often acted on) before it goes, so error toasts
// stay until the close button dismisses them (WCAG 2.2.1). Patched once here
// rather than at each of the few hundred toast.error() calls; other toasts keep
// their timing.
const showError = toast.error;
toast.error = ((message, data) => showError(message, { ...data, duration: Infinity })) as typeof toast.error;

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
