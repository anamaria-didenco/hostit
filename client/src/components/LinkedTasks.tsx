import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Calendar, Circle, CheckCircle2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompleteTask } from "@/components/taskParts";
import { TaskForm, EMPTY_TASK_FORM, dueDateMs, taskFormValuesOf, type TaskFormValues } from "@/components/TaskForm";
import { useFocusKeeper } from "@/hooks/useFocusKeeper";
import { normaliseTaskPriority, taskDuePrefix, taskDueState } from "@shared/taskFields";

const PRIORITY_BADGE: Record<string, string> = {
  high: "text-red-700 bg-red-50 border-red-200",
  low: "text-gray-700 bg-gray-50 border-gray-200",
};

// Icon buttons on a task row: 32px with a mouse, 44px on a touch screen.
const ROW_BUTTON = "flex-shrink-0 inline-flex items-center justify-center w-8 h-8 pointer-coarse:w-11 pointer-coarse:h-11 rounded-md text-stone-500 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest";

// The form sits inside this card, so no second card around it.
const FORM_FRAME = "border-t border-border/60 pt-3";

/**
 * The open tasks about one enquiry and/or event: tick one done, edit it in
 * place (the Tasks tab's form), delete it, or add one linked to the record.
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
  const [editingId, setEditingId] = useState<number | null>(null);

  // Keyboard focus. A row that goes (done, deleted): the task now in its place,
  // else ADD TASK. An edit saved or cancelled: that task's Edit button. The
  // add form closed: ADD TASK.
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useFocusKeeper(listRef, addRef);
  const editButtons = useRef(new Map<number, HTMLButtonElement>());
  const [refocus, setRefocus] = useState<{ edit: number } | "add" | null>(null);
  useEffect(() => {
    if (!refocus) return;
    const el = refocus === "add" ? addRef.current : editButtons.current.get(refocus.edit);
    if (!el) return;
    el.focus();
    setRefocus(null);
  }, [refocus, adding, editingId, tasks]);

  const refresh = () => Promise.all([utils.tasks.list.invalidate(), utils.leads.list.invalidate()]);

  const create = trpc.tasks.create.useMutation({
    onSuccess: async () => {
      await utils.tasks.list.invalidate();
      setAdding(false);
      setRefocus("add");
      toast.success("Task added");
    },
    onError: () => toast.error("Couldn't add the task — please try again."),
  });
  const update = trpc.tasks.update.useMutation({
    onSuccess: async (_r, vars) => {
      await refresh();
      setEditingId(null);
      setRefocus({ edit: vars.id });
      toast.success("Task updated");
    },
    onError: () => toast.error("Couldn't save the task — please try again."),
  });
  const remove = trpc.tasks.delete.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Task deleted");
    },
    onError: () => toast.error("Couldn't delete the task — please try again."),
  });

  if (isStaff || !hasRecord) return null;

  const add = (form: TaskFormValues) => {
    create.mutate({
      title: form.title,
      description: form.description.trim() || undefined,
      dueDate: form.dueDate ? dueDateMs(form.dueDate) : undefined,
      priority: form.priority,
      assignedTo: form.assignedTo || undefined,
      linkedLeadId: leadId ?? undefined,
      linkedBookingId: bookingId ?? undefined,
    });
  };

  const save = (task: any, initial: TaskFormValues, form: TaskFormValues) => {
    update.mutate({
      id: task.id,
      title: form.title,
      description: form.description,
      // Only re-save the date when it changed, so an automated task keeps its
      // exact due time. The task stays linked to this enquiry / event.
      dueDate: form.dueDate === initial.dueDate ? undefined : form.dueDate ? dueDateMs(form.dueDate) : null,
      priority: form.priority,
      assignedTo: form.assignedTo.trim() || null,
    });
  };

  const confirmDelete = (task: any) => {
    if (!window.confirm(`Delete this task?\n\n"${task.title}"`)) return;
    remove.mutate({ id: task.id });
  };

  const doneNow = Object.values(justDone).filter((t: any) => !(tasks ?? []).some((x: any) => x.id === t.id));
  // The form's heading sits one level under the box's: TASKS is a level-2
  // heading on the Event page (like its other gold rules), an h3 in the drawer.
  const formHeadingLevel = ruleHeading ? 3 : 4;
  const open = [...(tasks ?? [])].sort((a: any, b: any) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));

  return (
    <div className={`dante-card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        {ruleHeading
          ? <div role="heading" aria-level={2} className="gold-rule max-w-full flex-1"><span>TASKS{open.length ? ` · ${open.length}` : ""}</span></div>
          : <h3 className="font-bebas text-xs tracking-widest text-ink/70">TASKS{open.length ? ` · ${open.length}` : ""}</h3>}
        {!adding && (
          <button type="button" ref={addRef} onClick={() => { setEditingId(null); setAdding(true); }}
            className="ml-3 inline-flex items-center gap-1 min-h-[32px] pointer-coarse:min-h-[44px] px-2 font-bebas tracking-widest text-xs text-forest hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> ADD TASK
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="font-dm text-xs text-stone-600">Loading…</p>
      ) : open.length === 0 && doneNow.length === 0 && !adding ? (
        <p className="font-dm text-sm text-stone-600">No open tasks.</p>
      ) : (
        <ul ref={listRef} className="divide-y divide-border/60">
          {open.map((t: any) => {
            if (editingId === t.id) {
              const initial = taskFormValuesOf(t);
              return (
                <li key={t.id} className="py-2">
                  <TaskForm
                    heading="EDIT TASK"
                    headingLevel={formHeadingLevel}
                    ariaLabel={`Edit task: ${t.title}`}
                    initial={initial}
                    submitLabel="SAVE"
                    pendingLabel="SAVING..."
                    pending={update.isPending}
                    onSubmit={form => save(t, initial, form)}
                    onCancel={() => { setEditingId(null); setRefocus({ edit: t.id }); }}
                    showLink={false}
                    autoFocusTitle
                    frameClassName=""
                    className=""
                  />
                </li>
              );
            }
            const due = t.dueDate ? taskDueState(t.dueDate) : null;
            const priority = normaliseTaskPriority(t.priority);
            return (
              <li key={t.id} className="flex items-start gap-1.5 py-1.5">
                <button type="button" onClick={() => complete(t, true)}
                  aria-label={`Mark done: ${t.title}`}
                  className={`${ROW_BUTTON} rounded-full hover:text-burgundy`}>
                  <Circle className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1 pt-1.5 pointer-coarse:pt-3">
                  <p className="font-dm text-sm text-ink break-words">
                    {t.title}
                    {priority !== "normal" && <>{" "}
                      <span className={`ml-1 align-middle font-bebas text-[11px] tracking-widest px-1.5 py-0.5 border ${PRIORITY_BADGE[priority]}`}>
                        {priority.toUpperCase()}
                      </span>
                    </>}
                  </p>
                  {t.description && <p className="font-dm text-xs text-stone-700 mt-0.5 break-words whitespace-pre-line">{t.description}</p>}
                  {(t.dueDate || t.assignedTo) && (
                    <p className="flex items-center gap-x-3 gap-y-0.5 flex-wrap font-dm text-xs mt-0.5">
                      {t.dueDate && (
                        <span className={`inline-flex items-center gap-1 ${due === "overdue" ? "text-red-700" : due === "today" ? "text-amber-800" : "text-stone-600"}`}>
                          <Calendar className="w-3 h-3" aria-hidden="true" />
                          {taskDuePrefix(due ?? "later")}
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
                <button type="button"
                  ref={el => { if (el) editButtons.current.set(t.id, el); else editButtons.current.delete(t.id); }}
                  onClick={() => { setAdding(false); setEditingId(t.id); }}
                  aria-label={`Edit task: ${t.title}`} title="Edit task"
                  className={`${ROW_BUTTON} hover:text-burgundy hover:bg-linen`}>
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => confirmDelete(t)}
                  aria-label={`Delete task: ${t.title}`} title="Delete task"
                  className={`${ROW_BUTTON} hover:text-red-700 hover:bg-red-50`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
          {doneNow.map((t: any) => (
            <li key={`done-${t.id}`} className="flex items-center gap-2 py-1.5" role="status">
              <CheckCircle2 className="w-5 h-5 text-forest flex-shrink-0" aria-hidden="true" />
              <p className="font-dm text-sm text-ink/65 line-through break-words min-w-0 flex-1">{t.title}</p>
              <button type="button" onClick={() => complete(t, false)}
                aria-label={`Undo: ${t.title}`}
                className="flex-shrink-0 min-h-[32px] pointer-coarse:min-h-[44px] px-2 font-bebas tracking-widest text-xs text-forest hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest">
                UNDO
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <TaskForm
          heading="NEW TASK"
          headingLevel={formHeadingLevel}
          initial={EMPTY_TASK_FORM}
          submitLabel="ADD TASK"
          pendingLabel="ADDING..."
          pending={create.isPending}
          onSubmit={add}
          onCancel={() => { setAdding(false); setRefocus("add"); }}
          showLink={false}
          autoFocusTitle
          frameClassName={FORM_FRAME}
          className="mt-3"
        />
      )}
    </div>
  );
}
