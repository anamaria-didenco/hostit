import React from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { ChevronRight, GitMerge, History, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { clientFlagLabels } from "@shared/clientMatch";
import { lostReasonLabel } from "@shared/lostReasons";

/** "Sam Lee" → "SL". */
export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Small chips for list rows and cards: owner initials, returning client, possible duplicate. */
export function LeadRowBadges({ lead, teamById }: { lead: any; teamById?: Map<number, { name: string }> }) {
  const labels = clientFlagLabels(lead?.clientFlag);
  const owner = lead?.assignedTo != null ? teamById?.get(lead.assignedTo) : undefined;
  if (!labels.returning && !labels.duplicate && !owner) return null;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {owner && (
        <span title={`Owner: ${owner.name}`} aria-label={`Owner: ${owner.name}`}
          className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1 rounded-full bg-stone-200 text-stone-800 font-sans text-[11px] font-bold">
          {initialsOf(owner.name)}
        </span>
      )}
      {labels.returning && (
        <span title={labels.returning} className="font-sans text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
          Returning{lead.clientFlag.pastEvents > 0 ? ` · ${lead.clientFlag.pastEvents}` : ""}
        </span>
      )}
      {labels.duplicate && (
        <span title="Another open enquiry from this client in the last 60 days" className="font-sans text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 whitespace-nowrap">
          Possible duplicate
        </span>
      )}
    </span>
  );
}

const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : null;
const statusText = (s: string) => s.replace(/_/g, " ");

const LABEL = "font-bebas tracking-widest text-xs text-stone-600";

/**
 * Lead drawer block: who owns the lead, whether the client has been here
 * before, their other enquiries and bookings, and merging a duplicate.
 */
export default function LeadClientPanel({ leadId, assignedTo, isLead, onOpenLead, onMerged, onOwnerChanged }: {
  leadId: number;
  assignedTo: number | null | undefined;
  /** False for a booking row (owner is still the lead's). */
  isLead?: boolean;
  onOpenLead: (id: number) => void;
  onMerged: (keptId: number) => void;
  onOwnerChanged?: (teamMemberId: number | null) => void;
}) {
  const utils = trpc.useUtils();
  const { data: team } = trpc.team.list.useQuery();
  const { data: history } = trpc.leads.getClientHistory.useQuery({ leadId }, { staleTime: 30_000 });
  const [owner, setOwner] = React.useState<number | null>(assignedTo ?? null);
  React.useEffect(() => { setOwner(assignedTo ?? null); }, [assignedTo, leadId]);
  const [notify, setNotify] = React.useState(true);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const selectId = React.useId();

  const members = (team ?? []).filter((m: any) => m.isActive !== false);
  const setOwnerMut = trpc.leads.setOwner.useMutation({
    onSuccess: (r, vars) => {
      utils.leads.list.invalidate();
      utils.leads.getActivity.invalidate({ leadId });
      onOwnerChanged?.(vars.teamMemberId);
      const who = members.find((m: any) => m.id === vars.teamMemberId);
      if (!r.changed) return;
      if (!who) { toast.success("Owner cleared"); return; }
      if (r.emailed) toast.success(`${who.name} is now the owner. We've emailed them.`);
      else if (vars.notify && r.emailReason === "smtp_not_configured") toast.success(`${who.name} is now the owner. No email sent: email isn't set up in Settings → Email.`);
      else if (vars.notify && r.emailReason === "no_email") toast.success(`${who.name} is now the owner. No email sent: they have no email address.`);
      else if (vars.notify && r.emailReason === "send_failed") toast.warning(`${who.name} is now the owner, but the email to them didn't send.`);
      else toast.success(`${who.name} is now the owner`);
    },
    onError: e => { setOwner(assignedTo ?? null); toast.error(e.message || "Couldn't change the owner"); },
  });

  const labels = clientFlagLabels(history?.flag);
  const dupIds = history?.flag?.duplicateIds ?? [];
  const otherLeads = history?.leads ?? [];
  const otherBookings = history?.bookings ?? [];
  const historyCount = otherLeads.length + otherBookings.length;
  const chosenMember = members.find((m: any) => m.id === owner);

  return (
    <div className="space-y-2.5">
      {isLead !== false && (
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor={selectId} className={`${LABEL} flex-shrink-0 flex items-center gap-1`}><UserRound className="w-3.5 h-3.5" aria-hidden="true" /> Owner</label>
          {members.length === 0 ? (
            <span className="font-dm text-xs text-stone-600">Add team members in Settings → Team to give enquiries an owner.</span>
          ) : (
            <>
              <select id={selectId} value={owner ?? ""} disabled={setOwnerMut.isPending}
                onChange={e => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setOwner(v);
                  setOwnerMut.mutate({ leadId, teamMemberId: v, notify: notify && v != null });
                }}
                className="h-8 flex-1 min-w-[140px] text-xs border border-gold rounded-sm bg-white px-2 text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-forest">
                <option value="">Unassigned</option>
                {members.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {members.some((m: any) => m.email) && (
                <label className="flex items-center gap-1.5 font-dm text-xs text-stone-700 cursor-pointer">
                  <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="w-3.5 h-3.5 accent-forest" />
                  Email the new owner
                </label>
              )}
            </>
          )}
          {owner != null && !chosenMember && members.length > 0 && (
            <span className="font-dm text-xs text-stone-600">(removed team member)</span>
          )}
        </div>
      )}

      {(labels.returning || labels.duplicate || historyCount > 0) && (
        <div className="border border-gold bg-white rounded-sm">
          <div className="flex items-center gap-2 flex-wrap px-3 py-2">
            <History className="w-3.5 h-3.5 text-stone-600" aria-hidden="true" />
            {labels.returning && <span className="font-dm text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">{labels.returning}</span>}
            {labels.duplicate && <span className="font-dm text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300">{labels.duplicate}</span>}
            {!labels.returning && !labels.duplicate && <span className="font-dm text-xs text-stone-700">This client has enquired before</span>}
            <span className="flex-1" />
            {isLead !== false && dupIds.length > 0 && (
              <button type="button" onClick={() => setMergeOpen(true)}
                className="inline-flex items-center gap-1 font-bebas tracking-widest text-xs text-forest border border-forest px-2 py-1 hover:bg-linen rounded-sm">
                <GitMerge className="w-3.5 h-3.5" /> MERGE INTO…
              </button>
            )}
          </div>
          {historyCount > 0 && (
            <details className="group border-t border-gold">
              <summary className="list-none cursor-pointer px-3 py-2 flex items-center gap-1 font-bebas tracking-widest text-xs text-forest hover:underline">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
                CLIENT HISTORY ({historyCount})
              </summary>
              <ul className="px-3 pb-2 space-y-1.5">
                {otherLeads.map(l => (
                  <li key={`l${l.id}`} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-dm text-xs text-ink">
                        <span className="font-semibold">Enquiry</span> · {fmtDate(l.createdAt)}
                        {l.isDuplicate && <span className="ml-1 text-amber-900">(possible duplicate)</span>}
                      </div>
                      <div className="font-dm text-xs text-stone-600 truncate">
                        {[l.eventType, fmtDate(l.eventDate), l.guestCount ? `${l.guestCount} guests` : null, statusText(l.status), l.status === "lost" ? lostReasonLabel(l.lostReason) : null].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button type="button" onClick={() => onOpenLead(l.id)} className="flex-shrink-0 font-bebas tracking-widest text-xs text-forest hover:underline">OPEN</button>
                  </li>
                ))}
                {otherBookings.map(b => (
                  <li key={`b${b.id}`} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-dm text-xs text-ink"><span className="font-semibold">Booking</span> · {fmtDate(b.eventDate)}</div>
                      <div className="font-dm text-xs text-stone-600 truncate">{[b.eventType, b.guestCount ? `${b.guestCount} guests` : null, b.status].filter(Boolean).join(" · ")}</div>
                    </div>
                    <Link href={`/event/${b.id}`} className="flex-shrink-0 font-bebas tracking-widest text-xs text-forest hover:underline">OPEN</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {mergeOpen && history && (
        <MergeDialog
          currentId={leadId}
          candidates={otherLeads.filter(l => dupIds.includes(l.id))}
          onClose={() => setMergeOpen(false)}
          onMerged={keptId => { setMergeOpen(false); onMerged(keptId); }}
        />
      )}
    </div>
  );
}

function MergeDialog({ currentId, candidates, onClose, onMerged }: {
  currentId: number;
  candidates: Array<{ id: number; firstName: string; lastName: string | null; email: string; createdAt: any; eventType: string | null; eventDate: any; status: string }>;
  onClose: () => void;
  onMerged: (keptId: number) => void;
}) {
  const utils = trpc.useUtils();
  const [keepId, setKeepId] = React.useState<number | null>(candidates[0]?.id ?? null);
  const firstRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { firstRef.current?.focus(); }, []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const merge = trpc.leads.merge.useMutation({
    onSuccess: r => {
      utils.leads.invalidate();
      utils.bookings.invalidate();
      toast.success("Merged. Everything from this enquiry is now on the one you kept.");
      onMerged(r.keptId);
    },
    onError: e => toast.error(e.message || "Couldn't merge these enquiries"),
  });

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="merge-title" className="bg-cream border-2 border-forest w-full sm:max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-forest-dark px-5 py-3.5 flex items-start justify-between gap-3">
          <h2 id="merge-title" className="font-cormorant text-cream font-semibold text-lg leading-tight">Merge this enquiry into another</h2>
          <button type="button" onClick={onClose} aria-label="Cancel" className="text-cream opacity-85 hover:opacity-100 p-1 -mr-1 rounded-sm focus-visible:outline-2 focus-visible:outline-gold">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <fieldset>
            <legend className="font-bebas tracking-widest text-xs text-stone-600 mb-2">KEEP WHICH ENQUIRY?</legend>
            <div className="space-y-2">
              {candidates.map((c, i) => (
                <label key={c.id} className={`flex items-start gap-2.5 px-3 py-2.5 border cursor-pointer ${keepId === c.id ? "border-forest bg-white" : "border-stone-300 bg-white"}`}>
                  <input ref={i === 0 ? firstRef : undefined} type="radio" name="merge-keep" checked={keepId === c.id} onChange={() => setKeepId(c.id)} className="mt-1 accent-forest" />
                  <span className="min-w-0">
                    <span className="block font-dm text-sm text-ink font-semibold">{c.firstName} {c.lastName ?? ""} <span className="font-normal text-stone-600">· #{c.id}</span></span>
                    <span className="block font-dm text-xs text-stone-600">
                      {[`Received ${fmtDate(c.createdAt)}`, c.eventType, fmtDate(c.eventDate), statusText(c.status)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="bg-amber-50 border border-amber-300 px-3 py-2.5 font-dm text-xs text-amber-950 space-y-1">
            <p>This enquiry (#{currentId}) will be folded into the one you keep: its activity, proposals, bookings and tasks move across, and any details the kept one is missing are filled in.</p>
            <p className="font-semibold">This enquiry is then deleted. This can't be undone.</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={onClose} className="border border-stone-300 font-bebas tracking-widest text-xs px-4 py-2 text-stone-700 hover:text-ink">CANCEL</button>
            <button type="button" disabled={!keepId || merge.isPending}
              onClick={() => keepId && merge.mutate({ keepId, mergeId: currentId })}
              className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream disabled:opacity-50">
              {merge.isPending ? "MERGING…" : "MERGE AND DELETE THIS ONE"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
