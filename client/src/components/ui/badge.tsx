import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[3px] border px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.12em] leading-none w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-ring/40 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        outline:
          "border-[1.5px] border-border text-muted-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
// Tiny tracked-uppercase pill with a leading status dot. Lifecycle tones:
//   blue  = new / confirmed / paid / active
//   amber = quoted / pending
//   red   = overdue / unpaid
//   grey  = cancelled / archived
type StatusTone = "blue" | "amber" | "red" | "grey";

const TONE_STYLES: Record<StatusTone, { wrap: string; dot: string }> = {
  blue:  { wrap: "bg-accent text-primary",                       dot: "bg-primary" },
  amber: { wrap: "bg-[#f3e8d4] text-[#8a5e15]",                  dot: "bg-[#b07c25]" },
  red:   { wrap: "bg-[#f9e3e0] text-[#a02b1f]",                  dot: "bg-destructive" },
  grey:  { wrap: "bg-[#f0ede6] text-muted-foreground",          dot: "bg-[#8a8073]" },
};

// Map common lifecycle statuses to a tone.
const STATUS_TONE: Record<string, StatusTone> = {
  new: "blue", confirmed: "blue", paid: "blue", active: "blue", booked: "blue", won: "blue",
  quoted: "amber", pending: "amber", proposal: "amber", hold: "amber", tentative: "amber", partial: "amber",
  overdue: "red", unpaid: "red", declined: "red", lost: "red",
  cancelled: "grey", canceled: "grey", archived: "grey", closed: "grey", completed: "grey",
};

function statusTone(status: string): StatusTone {
  return STATUS_TONE[status.toLowerCase().trim()] ?? "blue";
}

function StatusBadge({
  status,
  tone,
  label,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status: string;
  tone?: StatusTone;
  label?: string;
}) {
  const resolved = tone ?? statusTone(status);
  const styles = TONE_STYLES[resolved];
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.12em] leading-none w-fit whitespace-nowrap",
        styles.wrap,
        className
      )}
      {...props}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", styles.dot)} />
      {label ?? status}
    </span>
  );
}

export { Badge, badgeVariants, StatusBadge, statusTone };
