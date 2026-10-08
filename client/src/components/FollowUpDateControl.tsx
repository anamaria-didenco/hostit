import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Bell, ChevronDown, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toLocalDateInput } from "@/lib/dateTime";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * "Follow up on [date]" for a lead: quick picks (tomorrow / 3 days / 1 week),
 * a custom date, and clear. Dates are the viewer's (NZ) calendar day, sent to
 * the server as local noon so they never slip a day in UTC.
 */
const QUICK_PICKS = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "In 3 days" },
  { days: 7, label: "In 1 week" },
];

function ymdInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateInput(d);
}

function fmtDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

export function FollowUpDateControl({
  leadId,
  value,
  onChanged,
  className = "",
}: {
  leadId: number;
  value: Date | string | null | undefined;
  /** Called with the new date (local noon) or null, after the save lands. */
  onChanged?: (next: Date | null) => void;
  className?: string;
}) {
  const utils = trpc.useUtils();
  const labelId = useId();
  const customId = useId();
  const current = toLocalDateInput(value ?? null); // "" when unset
  const [open, setOpen] = useState(false);
  // Kept across open/close so Escape never throws away a half-picked date.
  const [custom, setCustom] = useState(current || ymdInDays(1));
  useEffect(() => { if (current) setCustom(current); }, [current]);

  const save = trpc.leads.setFollowUpDate.useMutation({
    onSuccess: (_res, vars) => {
      const next = vars.followUpDate ? new Date(vars.followUpDate) : null;
      onChanged?.(next);
      utils.leads.list.invalidate();
      utils.leads.getActivity.invalidate({ leadId });
      utils.dashboard.invalidate();
      toast.success(next ? `Follow-up set for ${fmtDay(toLocalDateInput(next))}` : "Follow-up date cleared");
    },
    onError: () => toast.error("Couldn't save the follow-up date — please try again."),
  });

  const pick = (ymd: string | null) => {
    setOpen(false);
    if ((ymd ?? "") === current) return;
    save.mutate({ id: leadId, followUpDate: ymd ? new Date(`${ymd}T12:00:00`).toISOString() : null });
  };

  const today = toLocalDateInput(new Date());
  const due = current && current <= today;
  const triggerText = current
    ? (current === today ? "Follow up today" : due ? `Follow-up was due ${fmtDay(current)}` : `Follow up on ${fmtDay(current)}`)
    : "Set a follow-up date";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span id={labelId} className="sr-only">Follow-up date</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-labelledby={`${labelId} ${labelId}-v`}
            disabled={save.isPending}
            className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-sm border font-dm text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-60 ${
              due ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
              : current ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
            }`}
          >
            <Bell className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            <span id={`${labelId}-v`}>{save.isPending ? "Saving…" : triggerText}</span>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 opacity-70" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className="z-[10001] w-64 bg-white border border-stone-200 shadow-lg p-3">
          <p className="font-bebas tracking-widest text-[11px] text-sage mb-2">FOLLOW UP</p>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {QUICK_PICKS.map(q => {
              const ymd = ymdInDays(q.days);
              return (
                <button key={q.days} type="button" onClick={() => pick(ymd)}
                  aria-pressed={current === ymd}
                  title={fmtDay(ymd)}
                  className={`px-1.5 py-2 rounded-sm border font-dm text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest ${
                    current === ymd ? "bg-forest text-cream border-forest" : "border-stone-300 text-ink hover:bg-linen"
                  }`}>
                  {q.label}
                </button>
              );
            })}
          </div>
          <label htmlFor={customId} className="block font-dm text-xs text-stone-600 mb-1">Or pick a date</label>
          <div className="flex gap-1.5">
            <input id={customId} type="date" value={custom} min={today}
              onChange={e => setCustom(e.target.value)}
              className="flex-1 min-w-0 border border-stone-300 rounded-sm px-2 py-1.5 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest" />
            <button type="button" disabled={!custom} onClick={() => pick(custom)}
              className="btn-forest px-3 py-1.5 font-bebas tracking-widest text-xs text-cream disabled:opacity-50">
              SET
            </button>
          </div>
          {current && (
            <button type="button" onClick={() => pick(null)}
              className="mt-3 w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-sm border border-stone-200 font-dm text-xs text-stone-700 hover:bg-stone-50">
              <X className="w-3 h-3" aria-hidden="true" /> Clear follow-up
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
