import React from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { StatusChip } from "@/components/GlobalFinder";

/**
 * Under the Enquiries search box: events matching the search that have no
 * enquiry behind them (e.g. imported from a booking system), which the
 * enquiry list can never show. Renders nothing when there are none.
 */
export default function EventSearchResults({ query, onOpenEvent }: { query: string; onOpenEvent: (id: number) => void }) {
  const [debounced, setDebounced] = React.useState(query.trim());
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data } = trpc.search.global.useQuery(
    { q: debounced, limit: 20 },
    { enabled: debounced.length >= 2, placeholderData: keepPreviousData, staleTime: 15_000 },
  );
  if (debounced.length < 2) return null;
  const events = (data?.events ?? []).filter(e => e.leadId == null);
  if (events.length === 0) return null;
  return (
    <section aria-label="Events with no enquiry" className="mx-4 mb-3 border border-gray-200 rounded-lg bg-white">
      <h3 className="px-3 pt-2 pb-1 flex items-center gap-1.5 font-bebas tracking-widest text-xs text-ink/70">
        <CalendarDays className="w-3 h-3" aria-hidden="true" /> EVENTS ({events.length}) <span className="font-dm tracking-normal normal-case text-ink/60">· no enquiry, so not in the list below</span>
      </h3>
      <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100">
        {events.map(e => (
          <li key={e.id}>
            <button type="button" onClick={() => onOpenEvent(e.id)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-linen/60 focus-visible:bg-linen/60 focus-visible:outline-none">
              <span className="min-w-0 flex-1">
                <span className="block font-cormorant font-semibold text-base text-ink truncate">{e.name}</span>
                <span className="block font-dm text-xs text-ink/60 truncate">
                  {[new Date(e.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }), e.spaceName, e.eventType].filter(Boolean).join(" · ")}
                </span>
              </span>
              <StatusChip status={e.status} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
