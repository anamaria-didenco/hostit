import * as React from "react";

import { cn } from "@/lib/utils";

// ─── ChangeFlag ───────────────────────────────────────────────────────────────
// Shows an amended value: the old value struck through, an arrow, the new value
// in bold, plus a small red "Changed — was X" tag. Used on the BEO / proposal
// when a figure or detail has been revised since the client last saw it.
//
//   <ChangeFlag oldValue="100" newValue="120" />            → 100 → 120  ·Changed — was 100
//   <ChangeFlag oldValue="$4,200" newValue="$4,850" figure />
function ChangeFlag({
  oldValue,
  newValue,
  figure = false,
  showTag = true,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  oldValue: React.ReactNode;
  newValue: React.ReactNode;
  /** Render values as Spectral display figures (numbers/prices/times). */
  figure?: boolean;
  showTag?: boolean;
}) {
  const valueClass = figure
    ? "font-serif [font-variant-numeric:tabular-nums_lining-nums] tracking-[-0.01em]"
    : "font-sans";
  return (
    <span
      data-slot="change-flag"
      className={cn("inline-flex items-center gap-1.5 align-middle", className)}
      {...props}
    >
      <span className={cn(valueClass, "text-muted-foreground line-through decoration-destructive/70")}>
        {oldValue}
      </span>
      <span className="text-destructive" aria-hidden>→</span>
      <span className={cn(valueClass, "font-bold text-foreground")}>{newValue}</span>
      {showTag ? (
        <span className="inline-flex items-center gap-1 rounded-[3px] bg-[#f9e3e0] px-1.5 py-0.5 font-sans text-[9px] font-extrabold uppercase tracking-[0.12em] leading-none text-[#a02b1f]">
          <span className="size-1 rounded-full bg-destructive" />
          Changed — was {oldValue}
        </span>
      ) : null}
    </span>
  );
}

export { ChangeFlag };
