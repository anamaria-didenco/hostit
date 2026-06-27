import * as React from "react";

import { cn } from "@/lib/utils";

// ─── InfoBand ─────────────────────────────────────────────────────────────────
// A bordered row of label/value cells (think the figure strip on a BEO or
// runsheet header). One cell can be inverted — deep-blue fill holding a Spectral
// headline figure — to anchor the band.
//
//   <InfoBand
//     cells={[
//       { label: "Date", value: "Sat 12 Jul" },
//       { label: "Guests", value: "120", invert: true },
//       { label: "Arrival", value: "6:30 PM" },
//     ]}
//   />
export type InfoBandCell = {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Render value as a Spectral display figure (numbers/prices/times). */
  figure?: boolean;
  /** Inverted deep-blue cell holding a headline figure. */
  invert?: boolean;
};

function InfoBand({
  cells,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  cells: InfoBandCell[];
}) {
  return (
    <div
      data-slot="info-band"
      className={cn(
        "flex flex-wrap overflow-hidden rounded-md border-[1.5px] border-input bg-card divide-x-[1.5px] divide-input",
        className
      )}
      {...props}
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          className={cn(
            "flex flex-1 min-w-[7rem] flex-col gap-1 px-4 py-3",
            cell.invert && "bg-primary text-primary-foreground"
          )}
        >
          <span
            className={cn(
              "font-sans text-[9px] font-extrabold uppercase tracking-[0.16em]",
              cell.invert ? "text-primary-foreground/70" : "text-muted-foreground"
            )}
          >
            {cell.label}
          </span>
          <span
            className={cn(
              cell.figure || cell.invert
                ? "font-serif text-xl font-semibold leading-none tracking-[-0.01em] [font-variant-numeric:tabular-nums_lining-nums]"
                : "font-sans text-sm font-semibold leading-tight"
            )}
          >
            {cell.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export { InfoBand };
