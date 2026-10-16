import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Circle, CheckCircle2, Plus, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AssigneeSelect, useCompleteTask } from "@/components/taskParts";

const FIELD = "w-full border border-stone-300 rounded-sm px-2.5 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest";

/**
 * The open tasks about one enquiry and/or event, with a tick-box to finish
 * each and an inline "Add task" form that links the new task to the record.
 * Hidden for staff logins. For an event that came from an enquiry pass both
 * ids: tasks on either show here, and new ones link to both.
 */
export default function LinkedTasks({ leadId, bookingId, className = "mb-4 max-w-2xl", ruleHeading = false }: {
  leadId?: number | null;
  bookingId?: number | null;
  className?: string;
  /** Use the gold-rule heading (the Event page) instead of the drawer's small caps. */
  ruleHeading?: boolean;
}) {
  const { isStaff } = useAuth();
  const utils = trpc.useUtils();
  const hasRecord = leadId != null || bookingId != null;
  const { data: tasks, isLoading } = trpc.tasks.list.useQuery(
    { filter: "all", leadId: leadId ?? undefined, bookingId: bookingId ?? undefined },
    { enabled: hasRecord && !isStaff },
  );
  // Tasks finished from here stay on screen for a few seconds with an Undo
  // (a toast can't carry it: the drawer makes the page behind it inert).
  const [justDone, setJustDone] = useState<Record<number, any>>({});
  const forget = (t: { id: number }) => setJustDone(d => { const { [t.id]: _gone, ...rest } = d; return rest; });
  const { complete } = useCompleteTask(undefined, {
    undoToast: false,
    onCompleted: t => setJustDone(d => ({ ...d, [t.id]: t })),
    onReopened: forget,
  });
  useEffect(() => {
    if (Object.keys(justDone).length === 0) return;
    const timer = setTimeout(() => setJustDone({}), 10_000);
    return () => clearTimeout(timer);
  }, [justDone]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      setTitle(""); setDue(""); setAssignee(""); setAdding(false);
      toast.success("Task added");
    },
    onError: () => toast.error("Couldn't add the task — please try again."),
  });

  if (isStaff || !hasRecord) return null;

  const submit = () => {
    if (!title.trim()) { toast.error("Give the task a title."); return; }
    create.mutate({
      title: title.trim(),
      // Local noon, so the day never slips in another timezone.
      dueDate: due ? new Date(`${due}T12:00:00`).getTime() : undefined,
      assignedTo: assignee || undefined,
      linkedLeadId: leadId ?? undefined,
      linkedBookingId: bookingId ?? undefined,
    });
  };

  const doneNow = Object.values(justDone).filter((t: any) => !(tasks ?? []).some((x: any) => x.id === t.id));
  const open = [...(tasks ?? [])].sort((a: any, b: any) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);

  return (
    <div className={`dante-card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        {ruleHeading
          ? <div className="gold-rule max-w-full flex-1"><span>TASKS{open.length ? ` · ${open.length}` : ""}</span></div>
          : <h3 className="font-bebas text-xs tracking-widest text-ink/70">TASKS{open.length ? ` · ${open.length}` : ""}</h3>}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="ml-3 inline-flex items-center gap-1 min-h-[32px] px-2 font-bebas tracking-widest text-xs text-forest hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> ADD TASK
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="font-dm text-xs text-stone-600">Loading…</p>
      ) : open.length === 0 && doneNow.length === 0 && !adding ? (
        <p className="font-dm text-sm text-stone-600">No open tasks.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {open.map((t: any) => {
            const overdue = t.dueDate && t.dueDate < startOfToday.getTime();
            const today = t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString();
            return (
              <li key={t.id} className="flex items-start gap-2 py-1.5">
                <button type="button" onClick={() => complete(t, true)}
                  aria-label={`Mark done: ${t.title}`}
                  className="mt-0.5 flex-shrink-0 -m-1 p-1.5 inline-flex items-center justify-center rounded-full text-stone-500 hover:text-burgundy focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest transition-colors">
                  <Circle className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-dm text-sm text-ink break-words">{t.title}</p>
                  {(t.dueDate || t.assignedTo) && (
                    <p className="flex items-center gap-x-3 gap-y-0.5 flex-wrap font-dm text-xs mt-0.5">
                      {t.dueDate && (
                        <span className={`inline-flex items-center gap-1 ${overdue ? "text-red-700" : today ? "text-amber-800" : "text-stone-600"}`}>
                          <Calendar className="w-3 h-3" aria-hidden="true" />
                          {overdue ? "Overdue — " : today ? "Due today — " : "Due "}
                          {new Date(t.dueDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                      )}
                      {t.assignedTo && (
                        <span className="inline-flex items-center gap-1 text-stone-700">
                          <UserRound className="w-3 h-3" aria-hidden="true" /> {t.assignedTo}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
          {doneNow.map((t: any) => (
            <li key={`done-${t.id}`} className="flex items-center gap-2 py-1.5" role="status">
              <CheckCircle2 className="w-5 h-5 text-forest flex-shrink-0" aria-hidden="true" />
              <p className="font-dm text-sm text-ink/65 line-through break-words min-w-0 flex-1">{t.title}</p>
              <button type="button" onClick={() => complete(t, false)}
                className="flex-shrink-0 min-h-[32px] px-2 font-bebas tracking-widest text-xs text-forest hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest">
                UNDO
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <div>
            <label htmlFor="lt-title" className="font-bebas text-[11px] tracking-widest text-stone-600 block mb-1">TASK</label>
            <input id="lt-title" autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
              placeholder="e.g. Confirm numbers with the client" className={FIELD} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label htmlFor="lt-due" className="font-bebas text-[11px] tracking-widest text-stone-600 block mb-1">DUE DATE</label>
              <input id="lt-due" type="date" value={due} onChange={e => setDue(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label htmlFor="lt-assignee" className="font-bebas text-[11px] tracking-widest text-stone-600 block mb-1">ASSIGN TO</label>
              <AssigneeSelect id="lt-assignee" value={assignee} onChange={setAssignee} className={FIELD} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="border border-border font-bebas tracking-widest text-xs px-4 py-2 min-h-[36px] text-ink/70 hover:text-ink transition-colors">
              CANCEL
            </button>
            <button type="button" onClick={submit} disabled={create.isPending}
              className="bg-burgundy text-cream font-bebas tracking-widest text-xs px-5 py-2 min-h-[36px] hover:bg-burg-dark transition-colors disabled:opacity-50">
              {create.isPending ? "ADDING..." : "ADD TASK"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
