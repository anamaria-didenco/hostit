import * as React from "react";

import { cn } from "@/lib/utils";

// ─── PageHeader ─────────────────────────────────────────────────────────────
// The one page title block: a Cormorant title, an optional DM-sans subtitle, an
// actions slot on the right, and an optional underline tab strip beneath. Keeps
// the venue's editorial identity (forest/burgundy accents, serif heading) so
// every top-level screen opens the same way.

export type PageTab = { key: string; label: string };

type Accent = "forest" | "burgundy";

// Kept for API compatibility; tabs now take the shared .vf-tab style.

function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  tabs,
  activeTab,
  onTabChange,
  accent: _accent = "forest",
  className,
  subtitleClassName,
  tabStripRef,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  subtitleClassName?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  tabs?: readonly PageTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  accent?: Accent;
  className?: string;
  /** Forwarded to the tab strip so a page can keep its scroll-into-view logic. */
  tabStripRef?: React.Ref<HTMLDivElement>;
  children?: React.ReactNode;
}) {
  return (
    <div data-slot="page-header" className={cn("mb-6", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-cormorant text-3xl font-semibold text-ink flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {subtitle && <p className={cn("font-dm text-sm text-sage mt-0.5", subtitleClassName)}>{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">{actions}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <div
          ref={tabStripRef}
          className="flex gap-1 mt-6 border-b border-border overflow-x-auto"
          role="tablist"
        >
          {tabs.map(t => {
            const on = t.key === activeTab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                aria-pressed={on}
                onClick={() => onTabChange?.(t.key)}
                // The shared .vf-tab style (index.css): sentence case, 14px —
                // the same tabs as Enquiries, Payments and Tasks.
                className="vf-tab"
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}

export { PageHeader };
