/**
 * Shown in place of a Total / Outstanding figure when the event has no total
 * yet. "$0.00 outstanding" read as "settled" on events that simply hadn't
 * been priced.
 */
export default function NoTotalSet({ className = "font-dm text-sm text-ink/55 italic py-1.5" }: { className?: string }) {
  return <div className={className}>No total set</div>;
}
