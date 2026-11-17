// Options for an error toast (client/src/components/ui/sonner.tsx patches
// toast.error with these). Pure so it can be tested from server/.
//
// An error toast stays until it is closed (WCAG 2.2.1), unless the call gives
// its own duration. Because it stays, the same error raised again (a run sheet
// autosave failing on every keystroke, "Pick a space first" on each try) would
// pile up identical toasts that each have to be closed. So an error whose call
// gives no id gets one from its message: a repeat replaces the copy already
// showing instead of adding another. A call that gives its own id keeps it.

type ErrorToastData = { id?: string | number; duration?: number };

/** The id an error toast with this message shares with its repeats, or undefined when the message isn't plain text. */
export function errorToastId(message: unknown): string | undefined {
  return typeof message === "string" && message.trim() ? `error:${message.trim()}` : undefined;
}

export function errorToastOptions<T extends ErrorToastData>(message: unknown, data?: T): T & ErrorToastData {
  return {
    ...(data as T),
    id: data?.id ?? errorToastId(message),
    duration: data?.duration ?? Infinity,
  };
}
