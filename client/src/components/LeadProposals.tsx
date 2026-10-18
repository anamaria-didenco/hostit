import { useState } from "react";
import { useLocation } from "wouter";
import { FileText, Pencil, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * The proposals on an enquiry, newest first: where each one is at (sent,
 * opened, answered), with Edit, the client's view and Delete (asks first; an
 * accepted proposal made the booking, so it can't be deleted). Used in the
 * lead panel on the dashboard and on the event page.
 */
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-stone-100 text-stone-700" },
  sent: { label: "Sent", cls: "bg-blue-100 text-blue-800" },
  viewed: { label: "Opened", cls: "bg-amber-100 text-amber-900" },
  accepted: { label: "Accepted", cls: "bg-emerald-100 text-emerald-800" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-800" },
  expired: { label: "Expired", cls: "bg-stone-100 text-stone-700" },
};

const when = (d: string | Date) =>
  new Date(d).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export function proposalTimeline(p: { status: string; sentAt?: string | Date | null; emailedAt?: string | Date | null; viewedAt?: string | Date | null; respondedAt?: string | Date | null; expiresAt?: string | Date | null; createdAt?: string | Date | null }): string {
  const parts: string[] = [];
  // "Emailed" only when it actually was. A proposal that's "sent" but never
  // emailed (SMTP off, no client email, or the send failed) says so, so the
  // owner knows to share the link rather than wait for a reply.
  if (p.emailedAt) parts.push(`Emailed ${when(p.emailedAt)}`);
  else if (p.sentAt) parts.push(`Sent ${when(p.sentAt)}${(p.status === "sent" || p.status === "viewed") ? " · not emailed" : ""}`);
  if (p.viewedAt) parts.push(`Viewed ${when(p.viewedAt)}`);
  else if (p.status === "sent") parts.push("Not opened yet");
  if (p.respondedAt && (p.status === "accepted" || p.status === "declined")) {
    parts.push(`${p.status === "accepted" ? "Accepted" : "Declined"} ${when(p.respondedAt)}`);
  }
  if (p.status === "expired" && p.expiresAt) parts.push(`Expired ${new Date(p.expiresAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}`);
  if (parts.length === 0 && p.createdAt) parts.push(`Created ${when(p.createdAt)}`);
  return parts.join(" · ");
}

export default function LeadProposals({ leadId, compact = false, onNavigate }: { leadId: number; compact?: boolean; onNavigate?: () => void }) {
  const [, setLocation] = useLocation();
  const { data: proposals, isLoading } = trpc.proposals.byLead.useQuery({ leadId }, { enabled: !!leadId });
  const utils = trpc.useUtils();
  // The proposal waiting on "Delete this proposal?" — one at a time.
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const remove = trpc.proposals.delete.useMutation({
    onSuccess: () => {
      setConfirmId(null);
      utils.proposals.byLead.invalidate({ leadId });
      utils.proposals.list.invalidate();
      toast.success("Proposal deleted");
    },
    onError: (err) => toast.error(err.message || "Couldn't delete the proposal"),
  });

  if (isLoading) return compact ? null : (
    <div className="dante-card p-4 mb-4"><p className="font-dm text-xs text-stone-600">Loading proposals…</p></div>
  );
  const list = proposals ?? [];
  if (compact && list.length === 0) return null;

  const rows = (
    <ul className="space-y-2">
      {list.map((p: any) => {
        const st = STATUS[p.status] ?? STATUS.draft;
        return (
          <li key={p.id} className="border border-stone-200 bg-white px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-dm text-sm text-ink truncate">{p.title}</span>
                  <span className={`font-dm text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                  {/* Loud cue: this one went "sent" but the client was never
                      emailed, so the owner knows to send the link themselves. */}
                  {(p.status === "sent" || p.status === "viewed") && !p.emailedAt && (
                    <span title="This proposal was marked sent but no email went out — copy the link and send it to the client."
                      className="font-dm text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">Not emailed</span>
                  )}
                </div>
                <div className="font-dm text-xs text-stone-600 mt-0.5">{proposalTimeline(p)}</div>
                {p.status === "declined" && p.declineReason && (
                  <div className="font-dm text-xs text-stone-700 mt-0.5">Reason: “{p.declineReason}”</div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { onNavigate?.(); setLocation(`/proposals/new?proposalId=${p.id}`); }}
                  aria-label={`Edit proposal: ${p.title}`}
                  className="font-bebas tracking-widest text-xs px-2 py-1.5 border border-stone-300 text-forest hover:bg-stone-50 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest">
                  <Pencil className="w-3 h-3" aria-hidden /> EDIT
                </button>
                {p.status !== "accepted" && (
                  <button
                    type="button"
                    onClick={() => setConfirmId(p.id)}
                    aria-label={`Delete proposal: ${p.title}`}
                    title="Delete"
                    className="px-2 py-1.5 border border-stone-300 text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest">
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
                {p.status !== "draft" && p.publicToken && (
                  <a
                    href={`/proposal/${p.publicToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open the client's view of ${p.title} (new tab)`}
                    title="The client's view"
                    className="px-2 py-1.5 border border-stone-300 text-stone-700 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest">
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  </a>
                )}
              </div>
            </div>
            {confirmId === p.id && (
              <div role="alert" className="mt-2 border-t border-stone-200 pt-2 flex items-center justify-between gap-2 flex-wrap">
                <span className="font-dm text-xs text-stone-800">
                  Delete this proposal?{p.status !== "draft" ? " The client's link will stop working." : ""}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => remove.mutate({ id: p.id })}
                    disabled={remove.isPending}
                    className="font-bebas tracking-widest text-xs px-2 py-1.5 bg-red-700 text-white hover:bg-red-800 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest">
                    {remove.isPending ? "DELETING…" : "DELETE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    disabled={remove.isPending}
                    className="font-bebas tracking-widest text-xs px-2 py-1.5 border border-stone-300 text-stone-700 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest">
                    KEEP
                  </button>
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  if (compact) {
    return (
      <div className="mt-3">
        <div className="font-bebas text-xs tracking-widest text-stone-600 mb-1.5">PROPOSALS</div>
        {rows}
      </div>
    );
  }
  return (
    <div className="dante-card p-4 mb-4">
      <h3 className="font-bebas text-xs tracking-widest text-ink mb-3 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" aria-hidden /> PROPOSALS</h3>
      {list.length === 0
        ? <p className="font-dm text-xs text-stone-600">No proposals yet. Use Create Proposal above to start one.</p>
        : rows}
    </div>
  );
}
