/**
 * "Install the app" plumbing.
 *
 * Android Chrome fires `beforeinstallprompt` once, early — often before the screen that
 * wants it has mounted — so it's captured here at startup and handed out later. iPhones
 * never fire it (Safari only installs through Share → Add to Home Screen), so the hint
 * shows written steps there instead.
 */
import { useSyncExternalStore } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
let prompting = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** True when running as the installed app (home-screen icon), not in a browser tab. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt() {
  const event = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => deferred,
    () => null,
  );
  return {
    canPrompt: event !== null,
    prompt: async () => {
      if (!deferred || prompting) return; // a double tap must not open it twice
      prompting = true;
      const e = deferred;
      try {
        await e.prompt();
        await e.userChoice.catch(() => undefined);
      } catch {
        // The browser refused to show it; the offer is spent either way.
      } finally {
        prompting = false;
        deferred = null; // a prompt can only be used once
        notify();
      }
    },
  };
}
