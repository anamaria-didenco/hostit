import { useState } from "react";
import { Smartphone, X } from "lucide-react";
import { isInstalledApp, isIosDevice, useInstallPrompt } from "@/lib/installPrompt";

const DISMISS_KEY = "vf-install-hint-dismissed";

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}

/**
 * Phone-only card on Settings: put VenueFlow on the home screen. Hidden once it's
 * installed, once dismissed, and wherever the browser offers no way to install.
 */
export default function InstallAppHint() {
  const { canPrompt, prompt } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);
  const ios = isIosDevice();

  if (dismissed || isInstalledApp() || (!canPrompt && !ios)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode: it just comes back next visit */ }
  };

  return (
    <div className="md:hidden flex items-start gap-3 rounded-lg border border-sage-green/30 bg-sage-tint px-3 py-3" role="region" aria-label="Install the app">
      <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-sage-dark" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-inter text-sm font-semibold text-sage-dark">Put VenueFlow on your home screen</p>
        {canPrompt ? (
          <>
            <p className="mt-0.5 font-inter text-xs text-ink/70">Opens full screen like an app, with its own icon.</p>
            <button
              type="button"
              onClick={prompt}
              className="mt-2 min-h-[40px] rounded-md bg-forest px-4 font-bebas text-xs tracking-widest text-cream"
            >
              INSTALL APP
            </button>
          </>
        ) : (
          <p className="mt-0.5 font-inter text-xs text-ink/70">
            Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="-m-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink/60 hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
