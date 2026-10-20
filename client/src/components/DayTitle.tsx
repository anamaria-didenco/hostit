import { useEffect, useMemo, useState } from "react";
import { Tag, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/** YYYY-MM-DD from LOCAL date parts — a calendar day, never shifted by UTC. */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Day titles ("Robbie Williams concert day") for the month around `around`,
 * plus the previous and next month so week views and overflow days have them.
 */
export function useDayTitles(around: Date, enabled = true): Map<string, string> {
  const from = ymdLocal(new Date(around.getFullYear(), around.getMonth() - 1, 1));
  const to = ymdLocal(new Date(around.getFullYear(), around.getMonth() + 2, 0));
  const { data } = trpc.dayNotes.list.useQuery({ from, to }, { enabled, staleTime: 60_000 });
  return useMemo(() => new Map((data ?? []).map(n => [n.date, n.title])), [data]);
}

/** The title under a date. Click it to edit (unless read-only). */
export function DayTitleText({ title, onEdit, className = "" }: { title?: string; onEdit?: () => void; className?: string }) {
  if (!title) return null;
  const cls = `block w-full text-left font-dm text-[12px] font-semibold italic leading-tight text-[#7a5a12] break-words ${className}`;
  return onEdit ? (
    <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }} className={`${cls} hover:underline`} title="Edit the title for this day">
      {title}
    </button>
  ) : (
    <span className={cls}>{title}</span>
  );
}

/** Small "add a title" button, shown on hover beside the date. */
export function DayTitleAddButton({ dateLabel, onClick }: { dateLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      // Desktop only: phone cells are too narrow for a second icon, so on a
      // phone the title is added from the day view instead.
      className="hidden md:inline-flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 transition-opacity p-1.5 hover:bg-linen rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest"
      aria-label={`Add a title for ${dateLabel}`}
      title="Add a title for this day (not an event)">
      <Tag className="w-3 h-3 text-[#7a5a12]" />
    </button>
  );
}

/** Edit a day's title. Empty + Save, or Remove, clears it. */
export function DayTitleModal({ date, current, onClose }: { date: string | null; current?: string; onClose: () => void }) {
  const [value, setValue] = useState(current ?? "");
  const utils = trpc.useUtils();
  const save = trpc.dayNotes.set.useMutation({
    onSuccess: r => {
      utils.dayNotes.list.invalidate();
      toast.success(r.title ? "Day title saved" : "Day title removed");
      onClose();
    },
    onError: e => toast.error(e.message || "Couldn't save the day title"),
  });
  useEffect(() => { setValue(current ?? ""); }, [date, current]);
  useEscapeKey(!!date && !save.isPending, onClose);
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const submit = (title: string) => save.mutate({ date, title });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4" onClick={() => !save.isPending && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="day-title-h" className="bg-white w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-forest px-5 py-4 flex items-center justify-between">
          <div>
            <div id="day-title-h" className="font-bebas tracking-widest text-cream text-base">TITLE FOR THIS DAY</div>
            <p className="font-dm text-cream/70 text-xs mt-0.5">{label}</p>
          </div>
          <button aria-label="Close" onClick={onClose} disabled={save.isPending}
            className="text-cream/70 hover:text-cream w-11 h-11 inline-flex items-center justify-center disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form className="p-5 space-y-3" onSubmit={e => { e.preventDefault(); submit(value); }}>
          <label htmlFor="day-title-input" className="font-bebas tracking-widest text-[11px] text-ink/70 block">TITLE</label>
          <input
            id="day-title-input"
            autoFocus
            value={value}
            maxLength={120}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. Robbie Williams concert day"
            className="w-full border border-gold/30 px-3 min-h-[44px] font-dm text-sm focus:outline-none focus:border-forest"
          />
          <p className="font-dm text-xs text-ink/60">Shows under the date on the calendar. It's a label for the day, not an event.</p>
          <div className="flex items-center justify-between gap-3 pt-2">
            {current ? (
              <button type="button" onClick={() => submit("")} disabled={save.isPending}
                className="font-bebas tracking-widest text-xs px-3 min-h-[44px] text-[#b3261e] hover:bg-[#b3261e]/10 disabled:opacity-50">
                REMOVE
              </button>
            ) : <span />}
            <button type="submit" disabled={save.isPending || (!current && !value.trim())}
              className="font-bebas tracking-widest text-sm px-5 min-h-[44px] bg-forest text-cream hover:bg-forest/90 disabled:opacity-50">
              {save.isPending ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
