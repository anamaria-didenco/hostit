import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

// ─── FilterBar ──────────────────────────────────────────────────────────────
// A row of segmented filter pills, with an optional search box and a trailing
// slot (usually a result count). One consistent control for "narrow this list".

export type FilterOption<V extends string = string> = { value: V; label: string };

function FilterPills<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly FilterOption<V>[];
  value: V;
  onChange: (v: V) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={label}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "font-bebas tracking-widest text-xs px-3 py-2 rounded-md transition-colors",
              on ? "bg-forest text-cream" : "bg-cream text-sage hover:text-ink border border-gold/20",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterSearch({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="w-4 h-4 text-sage absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 border border-gold/30 bg-cream font-dm text-sm text-ink rounded-md focus:outline-none focus:border-forest"
      />
    </div>
  );
}

function FilterBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 mb-3 flex-wrap", className)}>
      {children}
    </div>
  );
}

export { FilterBar, FilterPills, FilterSearch };
