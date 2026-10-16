import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Inbox, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * Small pieces shared by the Tasks page and the Tasks section on an enquiry /
 * event: the "Assign to" select, the "Link to" picker, and completing a task
 * with an Undo.
 */

const FIELD = "w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-burgundy";

/** A task's assignee is a name: the owner, a team member, or an extra login. */
export function AssigneeSelect({ value, onChange, className = FIELD, id, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const { data } = trpc.tasks.assignees.useQuery(undefined, { staleTime: 60_000 });
  const options = useMemo(() => {
    const names = [...(data?.names ?? [])];
    // Keep a name that's since left the team visible so editing doesn't drop it.
    if (value && !names.some(n => n.toLowerCase() === value.toLowerCase())) names.push(value);
    return names;
  }, [data, value]);
  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Unassigned</option>
      {options.map(n => <option key={n} value={n}>{n}{data?.me && n.toLowerCase() === data.me.toLowerCase() ? " (me)" : ""}</option>)}
    </select>
  );
}

export type TaskLink = { kind: "lead" | "booking"; id: number; name: string };

export function TaskLinkChip({ link, onClear }: { link: TaskLink; onClear?: () => void }) {
  const Icon = link.kind === "lead" ? Inbox : CalendarCheck;
  return (
    <span className="inline-flex items-center gap-1.5 border border-forest/30 bg-forest/5 px-2.5 py-1.5 font-bebas tracking-widest text-xs text-forest max-w-full">
      <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{link.kind === "lead" ? "ENQUIRY" : "EVENT"} · {link.name}</span>
      {onClear && (
        <button type="button" onClick={onClear} aria-label="Remove link" className="flex-shrink-0 -mr-1 p-0.5 hover:text-burgundy">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}

/** Search enquiries and events by client name or email and pick one (optional). */
export function TaskLinkPicker({ value, onChange }: { value: TaskLink | null; onChange: (v: TaskLink | null) => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const typing = text.trim() !== q; // results below are for an older search
  const { data: results, isFetching } = trpc.tasks.searchLinks.useQuery({ q }, { enabled: open && !value, staleTime: 15_000 });

  if (value) return <TaskLinkChip link={value} onClear={() => { onChange(null); setText(""); setQ(""); }} />;

  return (
    <div>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-sage absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          value={text}
          onChange={e => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search enquiries and events by name or email"
          aria-label="Link to an enquiry or event"
          className={`${FIELD} pl-8`}
        />
      </div>
      {open && (
        <div className="mt-1 border border-gold/30 bg-white max-h-52 overflow-y-auto" role="listbox" aria-label="Matching enquiries and events">
          {(typing || (isFetching && !results)) && <p className="px-3 py-2 font-dm text-xs text-sage">Searching…</p>}
          {!typing && results && results.length === 0 && <p className="px-3 py-2 font-dm text-xs text-sage">No enquiry or event matches.</p>}
          {!typing && results?.map(r => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => { onChange({ kind: r.kind, id: r.id, name: r.name }); setOpen(false); }}
              className="w-full text-left px-3 py-2 min-h-[44px] flex items-center gap-2 hover:bg-linen focus-visible:bg-linen focus-visible:outline-none border-b border-border/50 last:border-b-0"
            >
              {r.kind === "lead"
                ? <Inbox className="w-3.5 h-3.5 text-forest flex-shrink-0" aria-hidden="true" />
                : <CalendarCheck className="w-3.5 h-3.5 text-forest flex-shrink-0" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="block font-dm text-sm text-ink truncate">{r.name}</span>
                <span className="block font-dm text-xs text-sage truncate">
                  {r.kind === "lead" ? "Enquiry" : "Event"}
                  {r.eventDate ? ` · ${new Date(r.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  {r.email ? ` · ${r.email}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Broadcast so an open enquiry drawer's follow-up control follows a follow-up task. */
export const FOLLOW_UP_CHANGED_EVENT = "vf:follow-up-changed";

/**
 * Complete / re-open a task. Completing shows a toast with Undo (re-opens it)
 * unless `undoToast` is false: the enquiry / event drawers make the rest of the
 * page inert while open, which also makes a toast's buttons unclickable, so
 * they show their own Undo in place (see LinkedTasks).
 * `onDone` runs after either, to refresh the caller's list.
 */
type DoneTask = { id: number; title?: string; source?: string | null; linkedLeadId?: number | null; dueDate?: number | null };
export function useCompleteTask(onDone?: () => void, opts: { undoToast?: boolean; onCompleted?: (t: DoneTask) => void; onReopened?: (t: DoneTask) => void } = {}) {
  const { undoToast = true, onCompleted, onReopened } = opts;
  const utils = trpc.useUtils();
  const complete = trpc.tasks.complete.useMutation();
  const refresh = () => {
    utils.tasks.list.invalidate();
    utils.leads.list.invalidate();
    onDone?.();
  };
  const run = (task: DoneTask, completed: boolean) => {
    complete.mutate({ id: task.id, completed }, {
      onSuccess: () => {
        refresh();
        // A follow-up task is its enquiry's follow-up date.
        if (task.source === "follow_up" && task.linkedLeadId != null) {
          window.dispatchEvent(new CustomEvent(FOLLOW_UP_CHANGED_EVENT, {
            detail: { leadId: task.linkedLeadId, followUpDate: completed ? null : task.dueDate ?? null },
          }));
        }
        if (completed) {
          onCompleted?.(task);
          if (undoToast) {
            toast.success("Task done", {
              description: task.title,
              duration: 8000,
              action: { label: "Undo", onClick: () => run(task, false) },
            });
          }
        } else {
          onReopened?.(task);
          toast.success("Task re-opened");
        }
      },
      onError: () => toast.error("Couldn't update the task — please try again."),
    });
  };
  return { complete: run, pending: complete.isPending };
}
