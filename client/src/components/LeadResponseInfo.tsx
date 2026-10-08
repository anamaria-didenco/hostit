import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Clock, Send } from "lucide-react";

/**
 * Lead drawer strip: how fast we replied ("Replied in 2h 10m" / "Waiting 5h")
 * and what automatic follow-up is scheduled next, with a per-lead stop.
 */

export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h${mins % 60 ? ` ${mins % 60}m` : ""}`;
  const days = Math.floor(hrs / 24);
  return `${days}d${hrs % 24 ? ` ${hrs % 24}h` : ""}`;
}

const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });

export function LeadResponseInfo({ leadId, onOpenSettings, readOnly }: {
  leadId: number;
  onOpenSettings?: () => void;
  readOnly?: boolean;
}) {
  const utils = trpc.useUtils();
  const { data } = trpc.followUps.leadStatus.useQuery({ leadId }, { refetchInterval: 60_000 });
  const setPaused = trpc.followUps.setLeadPaused.useMutation({
    onSuccess: (r) => {
      toast.success(r.paused ? "Automatic follow-ups stopped for this enquiry" : "Automatic follow-ups are back on for this enquiry");
      utils.followUps.leadStatus.invalidate({ leadId });
      utils.leads.getActivity.invalidate({ leadId });
    },
    onError: () => toast.error("Couldn't change that — please try again."),
  });
  if (!data) return null;

  const now = Date.now();
  let response: { text: string; tone: "ok" | "amber" | "red" } | null = null;
  if (data.firstResponseAt) {
    response = { text: `Replied in ${fmtDuration(new Date(data.firstResponseAt).getTime() - new Date(data.createdAt).getTime())}`, tone: "ok" };
  } else if (data.awaitingReply) {
    const overdue = !!data.replyDueAt && new Date(data.replyDueAt).getTime() <= now;
    response = { text: `Waiting ${fmtDuration(now - new Date(data.createdAt).getTime())}`, tone: overdue ? "red" : "amber" };
  }

  const fu = data.followUps;
  const toneStyle = response?.tone === "red"
    ? { background: "#fdecea", color: "#9b2c20", borderColor: "#f2b8b0" }
    : response?.tone === "amber"
      ? { background: "#f7efdb", color: "#8a5f18", borderColor: "#e8d3a6" }
      : { background: "#e8edf6", color: "#1f3a63", borderColor: "#c9d5ea" };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-dm text-xs">
      {response && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border font-semibold"
          style={toneStyle}
          title={response.tone === "red" ? `No reply after ${data.replyOverdueHours} business hour${data.replyOverdueHours === 1 ? "" : "s"}` : undefined}
        >
          <Clock className="w-3 h-3" aria-hidden="true" /> {response.text}
          {response.tone === "red" && <span className="sr-only"> — overdue</span>}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 text-stone-700">
        <Send className="w-3 h-3 text-stone-500" aria-hidden="true" />
        <span>
          <span className="font-semibold">Automatic follow-ups:</span>{" "}
          {fu.paused ? "stopped for this enquiry"
            : fu.next ? `${fu.next.label} ${new Date(fu.next.dueAt).getTime() <= now ? "due now" : `on ${fmtDay(fu.next.dueAt)}`}`
            : fu.anyEnabled ? "nothing scheduled"
            : "off"}
        </span>
        {!readOnly && fu.paused && (
          <button type="button" onClick={() => setPaused.mutate({ leadId, paused: false })} disabled={setPaused.isPending}
            className="font-semibold text-sage-green underline underline-offset-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            Turn back on
          </button>
        )}
        {!readOnly && !fu.paused && fu.anyEnabled && (
          <button type="button" onClick={() => setPaused.mutate({ leadId, paused: true })} disabled={setPaused.isPending}
            className="font-semibold text-sage-green underline underline-offset-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            Stop for this lead
          </button>
        )}
        {!fu.anyEnabled && onOpenSettings && (
          <button type="button" onClick={onOpenSettings}
            className="font-semibold text-sage-green underline underline-offset-2 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Set up
          </button>
        )}
      </span>
    </div>
  );
}
