import React from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useActivityText } from "@/lib/activityText";

/**
 * A note box for the top of an enquiry's drawer / phone panel: type, Add, and
 * the latest two activity lines sit right under it, with "All activity" for
 * the rest. Uses leads.addNote, so it lands in the same activity log the full
 * enquiry page shows.
 */

const TYPE_LABEL: Record<string, string> = {
  note: "NOTE",
  email: "EMAIL",
  call: "CALL",
  status_change: "STATUS",
  proposal_sent: "PROPOSAL",
  booking_created: "BOOKING",
};
const labelFor = (type: string) => TYPE_LABEL[type] ?? type.replace(/_/g, " ").toUpperCase();

const fmtWhen = (d: Date | string) =>
  new Date(d).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function QuickNote({ leadId, className = "" }: { leadId: number; className?: string }) {
  const utils = trpc.useUtils();
  const [text, setText] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);
  // "Status changed to proposal_sent" → "Status changed to Proposal Sent".
  const activityText = useActivityText();
  const { data: activity } = trpc.leads.getActivity.useQuery({ leadId }, { enabled: leadId > 0 });
  const add = trpc.leads.addNote.useMutation({
    onSuccess: () => {
      setText("");
      toast.success("Note added");
      utils.leads.getActivity.invalidate({ leadId });
    },
    onError: () => toast.error("Couldn't save the note. Please try again."),
  });

  // A different enquiry: start with an empty box and the short list.
  React.useEffect(() => { setText(""); setShowAll(false); }, [leadId]);

  const rows = (activity ?? []) as Array<{ id: number; type: string; content: string; createdAt: string | Date }>;
  const shown = showAll ? rows : rows.slice(0, 2);
  const submit = () => {
    const content = text.trim();
    if (!content || add.isPending) return;
    add.mutate({ leadId, content });
  };
  const inputId = `quick-note-${leadId}`;

  return (
    <section aria-label="Notes and activity" className={`border border-gold/30 bg-white p-3 ${className}`}>
      <label htmlFor={inputId} className="font-bebas tracking-widest text-xs text-ink/70 block mb-1.5">ADD A NOTE</label>
      <div className="flex items-end gap-2">
        <textarea
          id={inputId}
          value={text}
          rows={2}
          maxLength={2000}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
          placeholder="e.g. Rang back, wants a quote by Friday"
          className="flex-1 min-w-0 border border-gold/30 bg-white px-2.5 py-2 text-sm font-dm text-ink focus:outline-none focus:border-forest resize-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || add.isPending}
          className="flex-shrink-0 min-h-[44px] px-4 rounded-sm bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs disabled:opacity-40">
          {add.isPending ? "ADDING…" : "ADD"}
        </button>
      </div>
      {rows.length > 0 && (
        <ul className={`mt-2.5 space-y-1.5 ${showAll ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
          {shown.map(r => (
            <li key={r.id} className="flex gap-2 text-xs font-dm leading-snug">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="font-bebas tracking-widest text-ink/70">{labelFor(r.type)} · </span>
                <span className="text-ink break-words">{activityText(r.content)}</span>
                <span className="block text-ink/65 text-[12px]">{fmtWhen(r.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          aria-expanded={showAll}
          className="mt-2 flex items-center gap-1 font-bebas tracking-widest text-[11px] text-forest hover:underline underline-offset-2">
          {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showAll ? "SHOW LESS" : `ALL ACTIVITY (${rows.length})`}
        </button>
      )}
    </section>
  );
}
