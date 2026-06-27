import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-sm font-bold tracking-tight transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring/40 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:translate-y-0",
  {
    variants: {
      variant: {
        // Primary — deep blue fill, lifts + darkens on hover
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(22,20,15,0.14)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:-translate-y-px focus-visible:ring-destructive/30",
        // Outline — blue rule
        outline:
          "border-[1.5px] border-primary text-primary bg-transparent hover:bg-accent hover:-translate-y-px",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-px",
        // Paper — cream surface, warm border
        paper:
          "bg-card text-foreground border-[1.5px] border-input hover:bg-secondary hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(22,20,15,0.09)]",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary font-semibold underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
