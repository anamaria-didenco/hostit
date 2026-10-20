import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Inbox, MessageSquare, Eye, CheckCircle2, XCircle, FileSignature, DollarSign, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { SectionHead } from "@/components/ui/section-head";
import { timeAgo } from "@/components/NotificationBell";

/**
 * "Since you were last here": a small feed of what changed on the account
 * since this user last loaded the dashboard — new enquiries, client replies,
 * proposals opened/accepted/declined, contracts signed and payments in.
 *
 * Reads dashboard.sinceLastSeen (which only reads the stored mark), then bumps
 * the mark via dashboard.markSeen once the feed has loaded — so each visit
 * shows what happened since the previous one. Renders nothing when there's
 * nothing new. Non-staff only (the dashboard.* read is blocked for staff
 * server-side); mount it only for non-staff.
 */
const ICON: Record<string, ReactNode> = {
  new_enquiry: <Inbox className="w-3.5 h-3.5 text-blue-500" />,
  client_reply: <MessageSquare className="w-3.5 h-3.5 text-sky-500" />,
  proposal_viewed: <Eye className="w-3.5 h-3.5 text-violet-500" />,
  proposal_accepted: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  proposal_declined: <XCircle className="w-3.5 h-3.5 text-rose-500" />,
  contract_signed: <FileSignature className="w-3.5 h-3.5 text-amber-600" />,
  payment_received: <DollarSign className="w-3.5 h-3.5 text-emerald-600" />,
};

export function SinceLastVisit() {
  const [, setLocation] = useLocation();
  const { data } = trpc.dashboard.sinceLastSeen.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const markSeen = trpc.dashboard.markSeen.useMutation();

  // Advance the "last seen" mark once the feed has loaded (so the read above
  // captured the previous mark first). Fires once per mount.
  const marked = useRef(false);
  useEffect(() => {
    if (data && !marked.current) {
      marked.current = true;
      markSeen.mutate();
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <section aria-label="Since you were last here" className="dante-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Sparkles className="w-4 h-4 text-primary/70 shrink-0" aria-hidden="true" />
        <SectionHead title="Since you were last here" meta={`${items.length} update${items.length !== 1 ? "s" : ""}`} className="flex-1" />
      </div>
      <div className="divide-y divide-border max-h-72 overflow-auto">
        {items.map((it, i) => {
          const body = (
            <>
              <div className="shrink-0 mt-0.5">{ICON[it.kind] ?? <Sparkles className="w-3.5 h-3.5 text-primary/60" />}</div>
              <div className="flex-1 min-w-0">
                <div className="font-serif text-sm text-foreground tracking-[-0.01em] truncate">{it.title}</div>
                <div className="font-sans text-[12px] text-muted-foreground [font-variant-numeric:tabular-nums_lining-nums]">{timeAgo(new Date(it.at))}</div>
              </div>
            </>
          );
          return it.link ? (
            <button
              key={i}
              onClick={() => setLocation(it.link!)}
              className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-linen transition-colors text-left"
            >
              {body}
            </button>
          ) : (
            <div key={i} className="w-full flex items-start gap-3 px-4 py-2.5">{body}</div>
          );
        })}
      </div>
    </section>
  );
}
