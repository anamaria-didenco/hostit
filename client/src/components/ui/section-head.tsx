import * as React from "react";

import { cn } from "@/lib/utils";

// ─── SectionHead ──────────────────────────────────────────────────────────────
// Editorial section header: a tracked-uppercase title, a coloured rule that
// fills the remaining width, and optional right-aligned meta. Tones:
//   blue   = default sections
//   red    = alerts / critical
//   amber  = dietary / warnings
type SectionTone = "blue" | "red" | "amber" | "ink";

const TONE: Record<SectionTone, { text: string; rule: string }> = {
  blue:  { text: "text-primary",            rule: "bg-primary" },
  red:   { text: "text-destructive",        rule: "bg-destructive" },
  amber: { text: "text-[#8a5e15]",          rule: "bg-[#b07c25]" },
  ink:   { text: "text-foreground",         rule: "bg-foreground" },
};

function SectionHead({
  title,
  tone = "blue",
  meta,
  icon,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  tone?: SectionTone;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      data-slot="section-head"
      className={cn("flex items-center gap-3", className)}
      {...props}
    >
      <div className={cn("flex items-center gap-1.5 shrink-0", t.text)}>
        {icon}
        <h6
          className={cn(
            "font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] leading-none m-0",
            t.text
          )}
        >
          {title}
        </h6>
      </div>
      <span className={cn("h-[2px] flex-1 rounded-full", t.rule)} aria-hidden />
      {meta != null ? (
        <span className="shrink-0 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

export { SectionHead };
