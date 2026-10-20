import * as React from "react";
import { trpc } from "@/lib/trpc";
import { parseCustomStatuses } from "@/components/StatusManager";
import { humanizeActivity } from "@shared/activityText";

/** A formatter for activity text that uses the venue's own status names. */
export function useActivityText(): (content: string) => string {
  const { data: venue } = trpc.venue.getOwn.useQuery(undefined, { staleTime: 5 * 60_000 });
  const statuses = React.useMemo(() => parseCustomStatuses((venue as any)?.customStatuses), [venue]);
  return React.useCallback((content: string) => humanizeActivity(content, statuses), [statuses]);
}
