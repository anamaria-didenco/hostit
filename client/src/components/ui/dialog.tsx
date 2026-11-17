import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { shouldReturnFocus } from "@shared/focusReturn";
import { XIcon } from "lucide-react";
import * as React from "react";

// Context to track composition state across dialog children
const DialogCompositionContext = React.createContext<{
  isComposing: () => boolean;
  setComposing: (composing: boolean) => void;
  justEndedComposing: () => boolean;
  markCompositionEnd: () => void;
}>({
  isComposing: () => false,
  setComposing: () => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

export const useDialogComposition = () =>
  React.useContext(DialogCompositionContext);

// Radix only gives focus back to a <DialogTrigger>. Most dialogs here open from
// state (a button's onClick, Ctrl+K, a row action), so on close focus fell to
// <body> and the next Tab started from the top of the page. The Root remembers
// what had focus when the dialog opened; the content puts it back on close.
const DialogReturnFocusContext = React.createContext<React.MutableRefObject<HTMLElement | null> | null>(null);

function activeHTMLElement(): HTMLElement | null {
  const a = typeof document !== "undefined" ? document.activeElement : null;
  return a instanceof HTMLElement && a !== document.body ? a : null;
}

// What opened the dialog that closed last. A panel opened from inside a
// dialog as it closes (a lead picked in the Ctrl+K finder) gives focus back
// to that, not to the field that has gone.
let lastClosedOpener: HTMLElement | null = null;

/** `el` is in a dialog that is closing or gone: what opened that dialog, if it is still on the page. */
export function openerOfClosingDialog(el: Element | null): HTMLElement | null {
  const box = el?.closest('[data-slot="dialog-content"]');
  if (!box || (box.isConnected && box.getAttribute("data-state") === "open")) return null;
  return lastClosedOpener?.isConnected ? lastClosedOpener : null;
}

/**
 * onCloseAutoFocus: refocus the opener (or `fallback` when the opener has gone,
 * e.g. a menu item) unless focus has already gone somewhere on purpose.
 */
function useReturnFocus(onCloseAutoFocus?: (e: Event) => void, fallback?: () => HTMLElement | null) {
  const openerRef = React.useContext(DialogReturnFocusContext);
  return React.useCallback(
    (e: Event) => {
      onCloseAutoFocus?.(e);
      if (e.defaultPrevented) return;
      const opener = openerRef?.current;
      const target = opener?.isConnected ? opener : fallback?.() ?? null;
      const active = document.activeElement;
      const dialog = e.currentTarget instanceof Node ? e.currentTarget : null;
      const place = !active || active === document.body ? "body" : dialog?.contains(active) ? "inside-dialog" : "elsewhere";
      if (!target || !shouldReturnFocus({ connected: target.isConnected }, place)) return;
      e.preventDefault();
      target.focus();
    },
    [onCloseAutoFocus, fallback, openerRef]
  );
}

function Dialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const openerRef = React.useRef<HTMLElement | null>(null);
  // Controlled (open={state}): remember the opener as it opens, before the
  // content mounts and moves focus inside. Layout effect, so it runs first.
  React.useLayoutEffect(() => {
    if (!open) return;
    openerRef.current = activeHTMLElement();
    return () => { lastClosedOpener = openerRef.current; };
  }, [open]);
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      // Uncontrolled (a DialogTrigger): remember it on the way in.
      if (next && open === undefined) openerRef.current = activeHTMLElement();
      onOpenChange?.(next);
    },
    [open, onOpenChange]
  );
  const composingRef = React.useRef(false);
  const justEndedRef = React.useRef(false);
  const endTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextValue = React.useMemo(
    () => ({
      isComposing: () => composingRef.current,
      setComposing: (composing: boolean) => {
        composingRef.current = composing;
      },
      justEndedComposing: () => justEndedRef.current,
      markCompositionEnd: () => {
        justEndedRef.current = true;
        if (endTimerRef.current) {
          clearTimeout(endTimerRef.current);
        }
        endTimerRef.current = setTimeout(() => {
          justEndedRef.current = false;
          endTimerRef.current = null;
        }, 150);
      },
    }),
    []
  );

  // Clear any pending composition-end timer when the dialog unmounts so we
  // don't update refs on a torn-down component or leak the timer.
  React.useEffect(() => () => {
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }, []);

  return (
    <DialogCompositionContext.Provider value={contextValue}>
      <DialogReturnFocusContext.Provider value={openerRef}>
        <DialogPrimitive.Root data-slot="dialog" open={open} onOpenChange={handleOpenChange} {...props} />
      </DialogReturnFocusContext.Provider>
    </DialogCompositionContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}

DialogOverlay.displayName = "DialogOverlay";

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  onCloseAutoFocus,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  /** For a dialog that must sit above the z-[9999] event drawer. */
  overlayClassName?: string;
}) {
  const { isComposing } = useDialogComposition();
  const handleCloseAutoFocus = useReturnFocus(onCloseAutoFocus);

  const handleEscapeKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      // Check both the native isComposing property and our context state
      // This handles Safari's timing issues with composition events
      const isCurrentlyComposing = (e as any).isComposing || isComposing();

      // If IME is composing, prevent dialog from closing
      if (isCurrentlyComposing) {
        e.preventDefault();
        return;
      }

      // Call user's onEscapeKeyDown if provided
      onEscapeKeyDown?.(e);
    },
    [isComposing, onEscapeKeyDown]
  );

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        onEscapeKeyDown={handleEscapeKeyDown}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      >
        {children}
        {showCloseButton && (
          // Its own light chip, so the X reads on the dark headers most
          // dialogs here have as well as on a plain one (it was ink at 70%
          // on navy, about 1.4:1). 32px to see, 44px to tap (the ::before).
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-sm border border-border bg-background text-foreground shadow-sm opacity-90 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none before:absolute before:-inset-1.5 before:content-[''] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * The same Radix dialog with none of DialogContent's look, for the app's own
 * pop-ups (dark header, bottom sheet on phones, sits above the event drawer).
 * Swap the two wrapper divs and keep the markup inside as it is:
 *
 *   <DialogShell onClose={close} className="fixed inset-0 z-50 flex …">   (the backdrop)
 *     <DialogShellContent aria-labelledby="title-id" className="bg-white …"> (the box)
 *
 * It moves focus in, keeps Tab inside, closes on Escape, hides the page behind
 * from screen readers, and gives focus back to whatever opened it.
 */
function DialogShell({
  open = true,
  onClose,
  className,
  style,
  children,
}: {
  /** Leave out when the pop-up is only rendered while open. */
  open?: boolean;
  /** Escape, a click on the backdrop. Ignore the call to keep it open (e.g. while saving). */
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogPortal>
        <DialogPrimitive.Overlay data-slot="dialog-overlay" className={className} style={style}>
          {children}
        </DialogPrimitive.Overlay>
      </DialogPortal>
    </Dialog>
  );
}

const TABBABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable=""], [contenteditable="true"], [tabindex]';

/** The last control in `box` that Tab can reach (shown, not tabindex=-1, not in an inert part). */
function lastTabbable(box: HTMLElement): HTMLElement | null {
  const all = Array.from(box.querySelectorAll<HTMLElement>(TABBABLE));
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i];
    if (el.tabIndex < 0 || el.closest("[inert]") || !el.getClientRects().length) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;
    return el;
  }
  return null;
}

function DialogShellContent({
  children,
  initialFocus,
  returnFocus,
  closeOnOutsideClick = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Focus this on open; otherwise the dialog box itself takes focus. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** Focus this on close when the element that opened the dialog has gone. */
  returnFocus?: () => HTMLElement | null;
  /** false: a click on the backdrop does nothing (as before for this one). */
  closeOnOutsideClick?: boolean;
}) {
  const { isComposing } = useDialogComposition();
  const handleCloseAutoFocus = useReturnFocus(onCloseAutoFocus, returnFocus);
  return (
    <DialogPrimitive.Content
      data-slot="dialog-content"
      aria-modal="true"
      aria-describedby={undefined}
      onOpenAutoFocus={e => {
        onOpenAutoFocus?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const box = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
        box?.focus();
        // The control itself takes focus a tick later: a dialog opened by a
        // key (Enter on "Lost" in a menu) must not have that same key press
        // the button it lands on.
        if (initialFocus) setTimeout(() => { if (!box || document.activeElement === box) initialFocus.current?.focus(); }, 0);
      }}
      onCloseAutoFocus={handleCloseAutoFocus}
      onEscapeKeyDown={e => {
        if (e.isComposing || isComposing()) { e.preventDefault(); return; }
        onEscapeKeyDown?.(e);
      }}
      onKeyDown={e => {
        onKeyDown?.(e);
        // With no initialFocus the box itself has focus on open. Radix wraps
        // Shift+Tab only from the first control, so from the box it went
        // nowhere: go to the last control, as Shift+Tab from the first does.
        if (e.defaultPrevented || e.key !== "Tab" || !e.shiftKey || e.target !== e.currentTarget) return;
        const last = lastTabbable(e.currentTarget);
        if (last) { e.preventDefault(); last.focus(); }
      }}
      onPointerDownOutside={e => {
        onPointerDownOutside?.(e);
        // A tap on a toast (its Undo, its close) is not a tap on the backdrop.
        const t = e.target instanceof Element ? e.target : null;
        if (!closeOnOutsideClick || t?.closest("[data-sonner-toaster]")) e.preventDefault();
      }}
      {...props}
    >
      {/* Radix looks for its own Title; the visible heading is linked with
          aria-labelledby instead, so this stays empty and hidden. */}
      <DialogPrimitive.Title asChild><span hidden /></DialogPrimitive.Title>
      {children}
    </DialogPrimitive.Content>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogShell,
  DialogShellContent,
  DialogTitle,
  DialogTrigger
};

