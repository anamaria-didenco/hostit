import { useEffect } from "react";

/**
 * Calls `onEscape` when the Escape key is pressed while `active` is true.
 * Registers a document-level keydown listener only while active, and cleans
 * it up automatically. Handy for closing custom modal/overlay dialogs.
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onEscape();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, onEscape]);
}
