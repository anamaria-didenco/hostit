import React from "react";
import { trpc } from "@/lib/trpc";

/**
 * Pick one or more of the venue's saved spaces for an event.
 *
 * An event's space is stored as a comma-separated list ("Main Bar, Terrace").
 * Availability and double-booking already read every space in that list, so a
 * booking across two rooms blocks both. The control keeps the order the spaces
 * were picked in. A space that's stored on the event but no longer saved is
 * kept visible (as "legacy") so it isn't silently dropped on the next save.
 */
export function parseSpaces(value: string | null | undefined): string[] {
  return (value ?? "").split(",").map(s => s.trim()).filter(Boolean);
}

export function SpacesMultiSelect({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
}) {
  const { data: spaces } = trpc.spaces.list.useQuery();
  const picked = parseSpaces(value);
  const saved = (spaces ?? []) as Array<{ id: number; name: string; capacitySeated?: number | null }>;
  const savedNames = new Set(saved.map(s => s.name));
  const legacy = picked.filter(n => !savedNames.has(n));

  const toggle = (name: string) => {
    const next = picked.includes(name) ? picked.filter(n => n !== name) : [...picked, name];
    onChange(next.join(", "));
  };

  const chip = (name: string, label: string, isLegacy = false) => {
    const on = picked.includes(name);
    return (
      <button
        key={name}
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => toggle(name)}
        className={`min-h-[36px] px-3 font-dm text-sm rounded-sm border transition-colors ${
          on
            ? "border-forest bg-forest/10 text-forest font-semibold"
            : "border-gold/40 text-ink/80 hover:border-forest/40 hover:text-forest"
        } ${isLegacy ? "border-dashed" : ""}`}
      >
        {on ? "✓ " : ""}{label}
      </button>
    );
  };

  // One tap for a whole-venue event: every saved space at once. Shown only when
  // there's more than one space to choose between.
  const allNames = saved.map(s => s.name);
  const isFullVenue = allNames.length > 1 && allNames.every(n => picked.includes(n));

  return (
    <div id={id} role="group" aria-label="Spaces for this event" className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {allNames.length > 1 && (
        <button
          type="button"
          onClick={() => onChange(isFullVenue ? "" : allNames.join(", "))}
          aria-pressed={isFullVenue}
          className={`min-h-[36px] px-3 font-bebas tracking-widest text-xs rounded-sm border transition-colors ${
            isFullVenue ? "border-forest bg-forest text-cream" : "border-forest/50 text-forest hover:bg-forest/10"
          }`}
        >
          {isFullVenue ? "✓ FULL VENUE" : "FULL VENUE"}
        </button>
      )}
      {saved.map(s => chip(s.name, `${s.name}${s.capacitySeated ? ` (${s.capacitySeated} seated)` : ""}`))}
      {legacy.map(n => chip(n, `${n} (legacy: pick a saved space)`, true))}
      {saved.length === 0 && legacy.length === 0 && (
        <span className="font-dm text-xs text-ink/70">No spaces saved yet. Add them in Settings → Venue → Spaces.</span>
      )}
    </div>
  );
}
