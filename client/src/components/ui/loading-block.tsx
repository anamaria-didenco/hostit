import * as React from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

// ─── LoadingBlock ───────────────────────────────────────────────────────────
// The one "this panel is loading / empty / failed" state. Keeps the quiet,
// centred, DM-sans treatment every list in the app already uses, so loading and
// empty copy stop being hand-rolled per page.

function LoadingBlock({
  state = "loading",
  message,
  onRetry,
  retryLabel = "RETRY",
  icon,
  className,
}: {
  state?: "loading" | "empty" | "error";
  message?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const text =
    message ??
    (state === "loading" ? "Loading…" : state === "error" ? "Couldn't load this." : "Nothing here yet.");

  return (
    <div
      data-slot="loading-block"
      role={state === "loading" ? "status" : undefined}
      className={cn("text-center py-16", className)}
    >
      {state === "error" && !icon && (
        <AlertCircle className="w-8 h-8 text-red-500/70 mx-auto mb-2" aria-hidden="true" />
      )}
      {icon && <div className="flex justify-center mb-2">{icon}</div>}
      <p className="font-dm text-sm text-sage">{text}</p>
      {state === "error" && onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 font-bebas tracking-widest text-xs px-4 py-2 rounded-md bg-forest text-cream hover:opacity-90"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export { LoadingBlock };
