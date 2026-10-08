import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AlertCircle, CalendarClock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toLocalDateInput } from "@/lib/dateTime";
import { promptClashOverride, ClashKindTag, type ClientClash } from "@/components/ClashDialog";

/**
 * Date holds in the lead drawer: "Hold this date", "Held until Fri 17 Oct",
 * change the end date, release. Server side lives in server/holds.ts.
 *
 * A lead is holding its date while status is `tentative` and `holdUntil` is
 * set; past `holdUntil` the hold has lapsed (the expiry job releases it if
 * the venue has auto-release on).
 */

/** "Fri 17 Oct" */
export function fmtHoldDay(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

export type HoldState = "held" | "lapsed" | "pencilled" | null;

export function holdState(lead: { status?: string | null; holdUntil?: Date | string | null } | null | undefined): HoldState {
  if (!lead || lead.status !== "tentative") return null;
  if (!lead.holdUntil) return "pencilled";
  return new Date(lead.holdUntil).getTime() > Date.now() ? "held" : "lapsed";
}

/** Small "HOLD" tag for list rows and calendar chips. */
export function HoldTag({ until, className = "" }: { until?: Date | string | null; className?: string }) {
  return (
    <span
      title={until ? `Date held until ${fmtHoldDay(until)}` : "Date on hold"}
      className={`vf-hold-chip font-bebas text-[10px] tracking-widest px-1.5 py-0.5 rounded-sm whitespace-nowrap flex-shrink-0 ${className}`}>
      HOLD{until ? ` · ${fmtHoldDay(until).toUpperCase()}` : ""}
    </span>
  );
}

/** Red "Date clash" chip; hover lists what's in the way. */
export function DateClashChip({ clashes, className = "" }: { clashes: ClientClash[] | null | undefined; className?: string }) {
  const real = (clashes ?? []).filter(c => c.certainty === "clash");
  if (real.length === 0) return null;
  const text = real.map(c => c.summary).join("\n");
  return (
    <span
      title={text}
      aria-label={`Date clash. ${text}`}
      className={`inline-flex items-center gap-1 font-bebas text-[10px] tracking-widest px-1.5 py-0.5 rounded-sm bg-red-50 text-red-800 border border-red-200 whitespace-nowrap flex-shrink-0 ${className}`}>
      <AlertCircle className="w-3 h-3" aria-hidden="true" /> DATE CLASH
    </span>
  );
}

type LeadLike = {
  id: number;
  status: string;
  firstName?: string | null;
  email?: string | null;
  eventDate?: Date | string | null;
  spaceName?: string | null;
  holdUntil?: Date | string | null;
  holdNote?: string | null;
};

const BOOKED = ["booked", "confirmed", "finished"];

function addDaysInput(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return toLocalDateInput(d);
}

/**
 * The drawer block. `onChanged` gets the fields that changed so the parent
 * can update its local copy of the lead without waiting for a refetch.
 */
export function HoldPanel({ lead, defaultHoldDays, onChanged }: {
  lead: LeadLike;
  defaultHoldDays?: number | null;
  onChanged?: (patch: Partial<LeadLike>) => void;
}) {
  const utils = trpc.useUtils();
  const state = holdState(lead);
  const isBooked = BOOKED.includes(lead.status);
  const { data: clashes } = trpc.holds.clashesForLead.useQuery(
    { leadId: lead.id },
    { enabled: !!lead.eventDate && lead.status !== "lost" && lead.status !== "cancelled" },
  );
  const [dialog, setDialog] = useState<null | "place" | "extend">(null);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const refresh = () => {
    utils.leads.list.invalidate();
    utils.leads.eventsByMonth.invalidate();
    utils.leads.getActivity.invalidate({ leadId: lead.id });
    utils.holds.invalidate();
    utils.dashboard.invalidate();
  };

  const release = trpc.holds.release.useMutation({
    onSuccess: (r) => {
      setConfirmRelease(false);
      if (!r.released) { toast.error("That hold had already changed — refresh and try again."); refresh(); return; }
      onChanged?.({ status: r.status, holdUntil: null, holdNote: null });
      refresh();
      toast.success("Hold released — the date is free again");
    },
    onError: (e) => toast.error(e.message || "Couldn't release the hold"),
  });

  if (isBooked || lead.status === "lost" || lead.status === "cancelled") {
    // Confirmed events still show a clash warning — nothing else to do here.
    return clashes && clashes.some(c => c.certainty === "clash")
      ? <ClashList clashes={clashes as ClientClash[]} />
      : null;
  }

  const canHold = !!lead.eventDate && !!lead.spaceName?.trim();
  const realClashes = (clashes ?? []).filter(c => c.certainty === "clash") as ClientClash[];

  return (
    <div className="space-y-2">
      {state === "held" || state === "lapsed" || state === "pencilled" ? (
        <div className={`rounded-sm px-3 py-2.5 ${state === "lapsed" ? "border border-amber-400 bg-amber-50" : "vf-hold-chip"}`}>
          <div className="flex items-start gap-2">
            <CalendarClock className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-dm text-sm font-semibold leading-snug">
                {state === "held" && <>Held until {fmtHoldDay(lead.holdUntil)}</>}
                {state === "lapsed" && <>Hold lapsed on {fmtHoldDay(lead.holdUntil)}</>}
                {state === "pencilled" && <>Pencilled in — no end date</>}
              </p>
              <p className="font-dm text-xs leading-snug mt-0.5 opacity-90">
                {state === "held" && "Other bookings for this date and space will get a warning."}
                {state === "lapsed" && "The date is no longer protected. Extend the hold, confirm, or release it."}
                {state === "pencilled" && "Set an end date so the hold doesn't sit there forever."}
              </p>
              {lead.holdNote && <p className="font-dm text-xs italic mt-1">“{lead.holdNote}”</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={() => setDialog("extend")}
              className="font-bebas tracking-widest text-[11px] px-3 py-1.5 rounded-sm border border-forest text-forest bg-white hover:bg-linen">
              {state === "pencilled" ? "SET END DATE" : "CHANGE END DATE"}
            </button>
            {confirmRelease ? (
              <>
                <button type="button" onClick={() => release.mutate({ leadId: lead.id })} disabled={release.isPending}
                  className="font-bebas tracking-widest text-[11px] px-3 py-1.5 rounded-sm bg-red-700 text-white hover:bg-red-800 disabled:opacity-60">
                  {release.isPending ? "RELEASING…" : "YES, RELEASE"}
                </button>
                <button type="button" onClick={() => setConfirmRelease(false)}
                  className="font-bebas tracking-widest text-[11px] px-3 py-1.5 rounded-sm text-stone-700 hover:bg-linen">
                  KEEP IT
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmRelease(true)}
                className="font-bebas tracking-widest text-[11px] px-3 py-1.5 rounded-sm border border-stone-400 text-stone-700 bg-white hover:bg-linen">
                RELEASE
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" disabled={!canHold} onClick={() => setDialog("place")}
            className="inline-flex items-center gap-1.5 font-bebas tracking-widest text-xs px-3 py-2 rounded-sm border border-forest text-forest hover:bg-linen disabled:opacity-50 disabled:cursor-not-allowed">
            <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" /> HOLD THIS DATE
          </button>
          {!canHold && (
            <span className="font-dm text-xs text-stone-600">
              {!lead.eventDate ? "Add an event date first." : "Pick a space first."}
            </span>
          )}
        </div>
      )}
      {realClashes.length > 0 && <ClashList clashes={realClashes} />}
      {dialog && (
        <HoldDialog
          mode={dialog}
          lead={lead}
          defaultHoldDays={defaultHoldDays ?? 7}
          clashes={realClashes}
          onClose={() => setDialog(null)}
          onDone={(patch) => { setDialog(null); onChanged?.(patch); refresh(); }}
        />
      )}
    </div>
  );
}

function ClashList({ clashes }: { clashes: ClientClash[] }) {
  const real = clashes.filter(c => c.certainty === "clash");
  if (real.length === 0) return null;
  return (
    <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2" role="note">
      <div className="flex items-center gap-1.5 mb-1">
        <AlertCircle className="w-3.5 h-3.5 text-red-700" aria-hidden="true" />
        <span className="font-bebas tracking-widest text-[11px] text-red-800">DATE CLASH</span>
      </div>
      {real.map((c, i) => (
        <div key={i} className="flex items-start gap-1.5 mt-1">
          <ClashKindTag kind={c.kind} />
          <p className="font-dm text-xs text-ink leading-snug">{c.summary}</p>
        </div>
      ))}
    </div>
  );
}

function HoldDialog({ mode, lead, defaultHoldDays, clashes, onClose, onDone }: {
  mode: "place" | "extend";
  lead: LeadLike;
  defaultHoldDays: number;
  clashes: ClientClash[];
  onClose: () => void;
  onDone: (patch: Partial<LeadLike>) => void;
}) {
  const ids = useId();
  const initial = mode === "extend" && lead.holdUntil && new Date(lead.holdUntil).getTime() > Date.now()
    ? addDaysInput(Math.max(1, Math.round((new Date(lead.holdUntil).getTime() - Date.now()) / 86_400_000)) + Math.max(1, defaultHoldDays))
    : addDaysInput(Math.max(1, defaultHoldDays));
  const [until, setUntil] = useState(initial);
  const [note, setNote] = useState(lead.holdNote ?? "");
  const [tellClient, setTellClient] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);
  const hasEmail = !!lead.email?.trim();
  const today = addDaysInput(0);
  // Noon local → the server reads the NZ calendar date, never the UTC one.
  const untilLabel = until ? fmtHoldDay(new Date(`${until}T12:00:00`)) : "";

  const place = trpc.holds.place.useMutation({
    onSuccess: (r) => {
      const e = r.email;
      const emailNote = !e ? "" : e.sent ? ` — ${lead.firstName || "the client"} has been emailed`
        : e.reason === "smtp_not_configured" ? " — email not sent (email isn't set up in Settings)"
        : e.reason === "no_client_email" ? " — email not sent (no client email)"
        : " — email couldn't be sent";
      toast.success(`Date held until ${fmtHoldDay(r.holdUntil)}${emailNote}`);
      onDone({ status: "tentative", holdUntil: r.holdUntil as any, holdNote: note.trim() || null });
    },
    onError: (err, vars) => {
      if (promptClashOverride(err, () => place.mutate({ ...vars, allowClash: true }), { confirmLabel: "Hold anyway" })) return;
      toast.error(err.message || "Couldn't hold the date");
    },
  });
  const extend = trpc.holds.extend.useMutation({
    onSuccess: (r) => {
      toast.success(`Now held until ${fmtHoldDay(r.holdUntil)}`);
      onDone({ holdUntil: r.holdUntil as any });
    },
    onError: (err) => toast.error(err.message || "Couldn't change the hold"),
  });
  const busy = place.isPending || extend.isPending;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => firstRef.current?.focus(), 0);
    // Capture phase: Escape closes this dialog only, not the drawer under it.
    const onKey = (e: KeyboardEvent) => {
      // The clash dialog can open on top of this one; it handles its own keys.
      if (document.querySelector('[role="alertdialog"]')) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const nodes = Array.from(boxRef.current?.querySelectorAll<HTMLElement>("input:not([disabled]), textarea, button:not([disabled])") ?? []);
      if (nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!boxRef.current?.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); e.stopPropagation(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); e.stopPropagation(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey, true); previouslyFocused?.focus?.(); };
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!until || busy) return;
    if (mode === "place") place.mutate({ leadId: lead.id, untilDate: until, note: note.trim() || undefined, notifyClient: tellClient });
    else extend.mutate({ leadId: lead.id, untilDate: until });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10040] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`}
        className="relative w-full max-w-md bg-cream border border-gold shadow-2xl rounded-sm">
        <form onSubmit={submit}>
          <div className="px-5 pt-5 pb-3">
            <h2 id={`${ids}-title`} className="font-cormorant text-ink text-xl font-semibold leading-tight">
              {mode === "place" ? "Hold this date" : "Change the hold's end date"}
            </h2>
            <p className="font-dm text-sm text-stone-600 mt-1">
              {lead.eventDate ? new Date(lead.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", "") : ""}
              {lead.spaceName ? ` · ${lead.spaceName}` : ""}
            </p>
          </div>
          <div className="px-5 space-y-4">
            {mode === "place" && clashes.length > 0 && (
              <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2">
                <p className="font-bebas tracking-widest text-[11px] text-red-800 mb-1">ALREADY TAKEN</p>
                {clashes.map((c, i) => <p key={i} className="font-dm text-xs text-ink leading-snug">{c.summary}</p>)}
              </div>
            )}
            <div>
              <label htmlFor={`${ids}-until`} className="font-bebas text-xs tracking-widest text-stone-600 block mb-1">HOLD UNTIL</label>
              <input ref={firstRef} id={`${ids}-until`} type="date" required min={today} value={until}
                onChange={e => setUntil(e.target.value)}
                className="w-full border border-stone-300 bg-white px-3 py-2 font-dm text-sm text-ink rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5488]" />
              <p className="font-dm text-xs text-stone-600 mt-1">
                {untilLabel ? `Held until the end of ${untilLabel}.` : ""} You'll get a reminder the day before.
              </p>
            </div>
            {mode === "place" && (
              <>
                <div>
                  <label htmlFor={`${ids}-note`} className="font-bebas text-xs tracking-widest text-stone-600 block mb-1">NOTE FOR YOUR TEAM (OPTIONAL)</label>
                  <textarea id={`${ids}-note`} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)}
                    placeholder="e.g. Waiting on their numbers"
                    className="w-full border border-stone-300 bg-white px-3 py-2 font-dm text-sm text-ink rounded-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5488]" />
                </div>
                <label className={`flex items-start gap-2.5 ${hasEmail ? "cursor-pointer" : "opacity-60"}`}>
                  <input type="checkbox" checked={tellClient} disabled={!hasEmail} onChange={e => setTellClient(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[#2f5488] flex-shrink-0" />
                  <span className="font-dm text-sm text-ink leading-snug">
                    Email {lead.firstName || "the client"} to say the date is held{untilLabel ? ` until ${untilLabel}` : ""}
                    {!hasEmail && <span className="block text-xs text-stone-600">No email address on this enquiry.</span>}
                  </span>
                </label>
              </>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-5">
            <button type="button" onClick={onClose}
              className="font-bebas tracking-widest text-xs px-4 py-2.5 border border-forest text-forest hover:bg-linen rounded-sm">
              CANCEL
            </button>
            <button type="submit" disabled={busy || !until}
              className="font-bebas tracking-widest text-xs px-4 py-2.5 bg-forest-dark text-cream hover:bg-forest rounded-sm disabled:opacity-60">
              {busy ? "SAVING…" : mode === "place" ? "HOLD DATE" : "SAVE"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
