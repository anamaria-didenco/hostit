import { useId, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, CalendarClock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toLocalDateInput } from "@/lib/dateTime";

/**
 * Walkthrough for an enquiry. Clients REQUEST one from the enquiry form
 * (which days / time of day suit them); staff confirm a real time here once
 * they know someone will be on site — optionally emailing the client a
 * confirmation with a calendar invite. Staff can also set one up without a
 * request (e.g. arranged by phone).
 */
type WalkthroughLead = {
  id: number;
  email?: string | null;
  walkthroughRequest?: string | null;
  walkthroughRequestedAt?: Date | string | null;
  walkthroughAt?: Date | string | null;
  walkthroughSlot?: string | null;
};

function ymdInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateInput(d);
}

function timeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ago(at: Date | string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
  if (mins < 60) return `${mins || 1} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(at).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

export default function WalkthroughPanel({
  lead,
  onChanged,
  labelClassName = "font-bebas text-xs tracking-widest text-sage",
}: {
  lead: WalkthroughLead;
  /** Called with the fields that changed, so the open drawer can update in place. */
  onChanged?: (patch: Partial<WalkthroughLead>) => void;
  labelClassName?: string;
}) {
  const utils = trpc.useUtils();
  const dateId = useId();
  const timeId = useId();
  const emailId = useId();
  const confirmedAt = lead.walkthroughAt ? new Date(lead.walkthroughAt) : null;
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(confirmedAt ? toLocalDateInput(confirmedAt) : ymdInDays(1));
  const [time, setTime] = useState(confirmedAt ? timeInput(confirmedAt) : "10:00");
  const [emailClient, setEmailClient] = useState(!!lead.email);

  const refresh = () => {
    utils.leads.list.invalidate();
    utils.leads.walkthroughsByMonth.invalidate();
    utils.leads.getActivity.invalidate({ leadId: lead.id });
    utils.tasks.invalidate();
  };

  const confirm = trpc.leads.confirmWalkthrough.useMutation({
    onSuccess: (r, vars) => {
      onChanged?.({ walkthroughAt: r.walkthroughAt, walkthroughSlot: r.label });
      refresh();
      setEditing(false);
      if (!vars.emailClient) toast.success(`Walkthrough set for ${r.label}`);
      else if (r.emailed) toast.success(`Walkthrough set for ${r.label} — confirmation emailed to ${lead.email}`);
      else toast.warning(`Walkthrough set for ${r.label}, but the client wasn't emailed${r.emailNote === "smtp_not_configured" ? " — email isn't set up" : " — the email didn't send"}.`);
    },
    onError: (e) => toast.error(e.message || "Couldn't save the walkthrough — please try again."),
  });
  const clear = trpc.leads.clearWalkthrough.useMutation({
    onSuccess: () => {
      onChanged?.({ walkthroughAt: null, walkthroughSlot: null });
      refresh();
      toast.success("Walkthrough time removed");
    },
    onError: () => toast.error("Couldn't remove the walkthrough — please try again."),
  });

  const save = () => {
    const at = new Date(`${date}T${time}`);
    if (!date || !time || isNaN(at.getTime())) { toast.error("Pick a date and time."); return; }
    confirm.mutate({ leadId: lead.id, at: at.toISOString(), emailClient: emailClient && !!lead.email });
  };

  const startEditing = () => {
    if (confirmedAt) { setDate(toLocalDateInput(confirmedAt)); setTime(timeInput(confirmedAt)); }
    setEditing(true);
  };

  const field = "h-9 w-full rounded-none border border-gold bg-white px-2 font-dm text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-forest";
  const linkBtn = "font-bebas text-xs tracking-widest text-forest underline-offset-2 hover:underline disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className={labelClassName}>Walkthrough</div>

      {confirmedAt && !editing ? (
        <div className="flex items-start gap-2">
          <CalendarCheck className="w-4 h-4 text-forest mt-0.5 flex-shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-dm text-sm text-ink font-medium">Confirmed · {lead.walkthroughSlot}</div>
            {lead.walkthroughRequest && <div className="font-dm text-xs text-stone mt-0.5">They'd asked for: {lead.walkthroughRequest}</div>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              <button type="button" className={linkBtn} onClick={startEditing}>Change time</button>
              <button type="button" className={linkBtn} disabled={clear.isPending}
                onClick={() => { if (window.confirm("Remove this walkthrough time? The client isn't told automatically.")) clear.mutate({ leadId: lead.id }); }}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : !editing ? (
        lead.walkthroughRequest ? (
          <div className="flex items-start gap-2">
            <CalendarClock className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-dm text-sm text-ink">
                <span className="font-medium text-amber-800">Requested</span>
                {lead.walkthroughRequestedAt && <span className="text-stone"> · {ago(lead.walkthroughRequestedAt)}</span>}
              </div>
              <div className="font-dm text-sm text-ink mt-0.5">Suits them: {lead.walkthroughRequest}</div>
              <button type="button" onClick={startEditing}
                className="mt-2 inline-flex items-center gap-1.5 bg-forest text-cream px-3 py-1.5 font-bebas text-xs tracking-widest hover:opacity-90">
                <CalendarCheck className="w-3.5 h-3.5" aria-hidden /> Confirm a time
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={linkBtn} onClick={startEditing}>Set up a walkthrough</button>
        )
      ) : (
        <div className="border border-gold bg-linen p-3 space-y-2.5"
          // Escape cancels this edit only — it must not also close the drawer.
          onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(false); } }}>
          {lead.walkthroughRequest && <div className="font-dm text-xs text-stone">Suits them: {lead.walkthroughRequest}</div>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={dateId} className="font-dm text-xs text-stone block mb-1">Date</label>
              <input id={dateId} type="date" value={date} min={toLocalDateInput(new Date())} onChange={e => setDate(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor={timeId} className="font-dm text-xs text-stone block mb-1">Time</label>
              <input id={timeId} type="time" step={900} value={time} onChange={e => setTime(e.target.value)} className={field} />
            </div>
          </div>
          {lead.email ? (
            <label htmlFor={emailId} className="flex items-start gap-2 font-dm text-xs text-ink cursor-pointer">
              <input id={emailId} type="checkbox" checked={emailClient} onChange={e => setEmailClient(e.target.checked)} className="w-4 h-4 mt-0.5 accent-forest" />
              <span>Email {lead.email} a confirmation with a calendar invite</span>
            </label>
          ) : (
            <p className="font-dm text-xs text-stone">No email on this enquiry, so let the client know yourself.</p>
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={confirm.isPending}
              className="bg-forest text-cream px-3 py-1.5 font-bebas text-xs tracking-widest hover:opacity-90 disabled:opacity-60">
              {confirm.isPending ? "Saving…" : confirmedAt ? "Save new time" : "Confirm walkthrough"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={linkBtn}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
