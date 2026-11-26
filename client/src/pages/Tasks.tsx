import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Link } from "wouter";
import { Plus, CheckCircle2, Circle, Trash2, Calendar, Pencil, Inbox, CalendarCheck, UserRound } from "lucide-react";
import { useCompleteTask } from "@/components/taskParts";
import { TaskForm, EMPTY_TASK_FORM, dueDateMs, taskFormValuesOf, type TaskFormValues } from "@/components/TaskForm";
import { useFocusKeeper } from "@/hooks/useFocusKeeper";
import { normaliseTaskPriority, taskDuePrefix, taskDueState } from "@shared/taskFields";

// The form is shared with the Tasks box on an enquiry / event.
export { TaskForm } from "@/components/TaskForm";

const FILTERS = [
  { key: "all", label: "All Active" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

// text-red-600 measured at ~4.2:1 on bg-red-50 in this condensed font —
// under the 4.5:1 minimum. Bumped a shade darker across the set.
const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-700 bg-red-50 border-red-200",
  normal: "text-blue-700 bg-blue-50 border-blue-200",
  low: "text-gray-600 bg-gray-50 border-gray-200",
};

export default function Tasks({ initialFilter }: { initialFilter?: "overdue" } = {}) {
  // A staff login is read-only server-side, so write controls (new/edit/
  // delete/complete) would only fail — hide or disable them.
  const { user, isStaff } = useAuth();
  const [filter, setFilter] = useState<"all" | "mine" | "overdue" | "upcoming" | "completed">(initialFilter ?? "all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<{ id: number; initial: TaskFormValues } | null>(null);

  const { data: taskList, refetch } = trpc.tasks.list.useQuery({ filter });

  // Keyboard focus after a task is completed, deleted or edited (the control
  // goes away): the task now in that place. After the new-task form closes:
  // NEW TASK. It used to drop to the top of the page.
  const listRef = React.useRef<HTMLDivElement>(null);
  const newTaskRef = React.useRef<HTMLButtonElement>(null);
  useFocusKeeper(listRef, newTaskRef);
  const formWasOpen = React.useRef(showForm);
  React.useEffect(() => {
    if (formWasOpen.current && !showForm && (!document.activeElement || document.activeElement === document.body)) newTaskRef.current?.focus();
    formWasOpen.current = showForm;
  }, [showForm]);
  // After an edit is saved or cancelled (Escape too): back to that task's Edit button.
  const editButtons = React.useRef(new Map<number, HTMLButtonElement>());
  const [refocusEdit, setRefocusEdit] = useState<number | null>(null);
  React.useEffect(() => {
    if (refocusEdit == null || editing) return;
    editButtons.current.get(refocusEdit)?.focus();
    setRefocusEdit(null);
  }, [refocusEdit, editing, taskList]);
  const closeEdit = () => { if (editing) setRefocusEdit(editing.id); setEditing(null); };

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowForm(false);
      toast.success("Task created");
    },
    onError: () => toast.error("Failed to create task"),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: async () => {
      await refetch();
      closeEdit();
      toast.success("Task updated");
    },
    onError: () => toast.error("Failed to update task"),
  });

  // Completing offers an Undo on the toast.
  const { complete: completeTask } = useCompleteTask(() => refetch());

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Task deleted"); },
    onError: () => toast.error("Failed to delete task"),
  });

  const handleCreate = (form: TaskFormValues) => {
    createTask.mutate({
      title: form.title,
      description: form.description || undefined,
      dueDate: form.dueDate ? dueDateMs(form.dueDate) : undefined,
      priority: form.priority,
      assignedTo: form.assignedTo || undefined,
      linkedLeadId: form.link?.kind === "lead" ? form.link.id : undefined,
      linkedBookingId: form.link?.kind === "booking" ? form.link.id : undefined,
    });
  };

  const handleUpdate = (form: TaskFormValues) => {
    if (!editing) return;
    updateTask.mutate({
      id: editing.id,
      title: form.title,
      description: form.description,
      // Only re-save the date when it changed, so an automated task keeps
      // its exact due time.
      dueDate: form.dueDate === editing.initial.dueDate ? undefined
        : form.dueDate ? dueDateMs(form.dueDate) : null,
      priority: form.priority,
      assignedTo: form.assignedTo.trim() || null,
      // Only re-link when it changed (a task made by a rule can be linked to
      // both an enquiry and an event, which the picker shows as one).
      ...(form.link?.kind === editing.initial.link?.kind && form.link?.id === editing.initial.link?.id ? {} : {
        linkedLeadId: form.link?.kind === "lead" ? form.link.id : null,
        linkedBookingId: form.link?.kind === "booking" ? form.link.id : null,
      }),
    });
  };

  return (
    // Same page frame as the other staff pages (full width, same padding, header
    // in the same place); only the list itself keeps a readable measure.
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="font-cormorant text-3xl font-semibold text-ink">Tasks</h1>
          <p className="font-dm text-sm text-sage mt-0.5">Track follow-ups, event prep, and team to-dos</p>
        </div>
        {!isStaff && (
          <button
            ref={newTaskRef}
            onClick={() => setShowForm(v => !v)}
            className="vf-btn vf-btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "CANCEL" : "NEW TASK"}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <TaskForm
          className="max-w-3xl mb-6"
          heading="NEW TASK"
          initial={EMPTY_TASK_FORM}
          submitLabel="CREATE TASK"
          pendingLabel="CREATING..."
          pending={createTask.isPending}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filter tabs — horizontally scrollable on mobile to prevent overflow */}
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none max-w-3xl">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            aria-pressed={filter === f.key}
            className="vf-tab min-h-[44px]"
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {!taskList || taskList.length === 0 ? (
        <div className="text-center py-16 max-w-3xl">
          <CheckCircle2 className="w-12 h-12 text-sage/30 mx-auto mb-3" />
          <p className="font-cormorant text-xl text-ink/65 italic">
            {filter === "completed" ? "No completed tasks yet" : "No tasks here"}
          </p>
          <p className="font-dm text-xs text-sage/60 mt-1">
            {filter === "overdue" ? "You're all caught up!" : filter === "mine" ? "Tasks assigned to you show up here" : "Create a task to get started"}
          </p>
        </div>
      ) : (
        <div ref={listRef} className="space-y-2 max-w-3xl">
          {taskList.map((task: any) => {
            // The same wording as the Tasks box on an enquiry / event: due
            // today all day, overdue from the next day.
            const due = !task.completed && task.dueDate ? taskDueState(task.dueDate) : null;
            const isOverdue = due === "overdue";
            const isDueToday = due === "today";
            if (editing && editing.id === task.id) {
              return (
                <TaskForm
                  key={task.id}
                  heading="EDIT TASK"
                  initial={editing.initial}
                  submitLabel="SAVE CHANGES"
                  pendingLabel="SAVING..."
                  pending={updateTask.isPending}
                  onSubmit={handleUpdate}
                  onCancel={closeEdit}
                  ariaLabel={`Edit task: ${task.title}`}
                  autoFocusTitle
                  className=""
                />
              );
            }
            return (
              <div
                key={task.id}
                className={`dante-card p-4 flex items-start gap-3 group transition-colors ${
                  task.completed ? "opacity-60" : isOverdue ? "border-l-2 border-l-red-400" : ""
                }`}
              >
                <button
                  aria-label={`${task.completed ? "Mark task incomplete" : "Mark task complete"}: ${task.title}`}
                  onClick={() => completeTask(task, !task.completed)}
                  disabled={isStaff}
                  className="mt-0.5 flex-shrink-0 -m-1 p-1.5 inline-flex items-center justify-center rounded-full text-sage hover:text-burgundy focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest transition-colors disabled:pointer-events-none"
                >
                  {task.completed
                    ? <CheckCircle2 className="w-5 h-5 text-forest" />
                    : <Circle className="w-5 h-5" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`font-dm text-sm text-ink ${task.completed ? "line-through text-ink/65" : ""}`}>
                      {task.title}
                    </span>
                    {normaliseTaskPriority(task.priority) !== "normal" && (
                      <span className={`font-bebas text-[11px] tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLORS[normaliseTaskPriority(task.priority)]}`}>
                        {normaliseTaskPriority(task.priority).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="font-dm text-xs text-sage mt-0.5">{task.description}</p>
                  )}
                  {task.dueDate && (
                    <div className={`flex items-center gap-1 mt-1 font-dm text-xs ${
                      isOverdue ? "text-red-700" : isDueToday ? "text-amber-800" : "text-sage"
                    }`}>
                      <Calendar className="w-3 h-3" />
                      {taskDuePrefix(due ?? "later")}
                      {new Date(task.dueDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                  )}
                  {(task.leadName || task.bookingName || task.assignedTo) && (
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5">
                      {task.assignedTo && (
                        <span className="inline-flex items-center gap-1 font-dm text-xs text-ink/75" title="Assigned to">
                          <UserRound className="w-3 h-3" aria-hidden="true" /> {task.assignedTo}
                        </span>
                      )}
                      {task.leadName && (
                        // A full page load, not <Link>: this page sits inside the
                        // dashboard, which only reads ?tab/?leadId when it loads.
                        <a href={`/dashboard?tab=enquiries&leadId=${task.linkedLeadId}`} className="inline-flex items-center gap-1 font-bebas tracking-widest text-xs text-forest hover:underline">
                          <Inbox className="w-3 h-3" /> ENQUIRY · {task.leadName}
                        </a>
                      )}
                      {task.bookingName && (
                        <Link href={`/event/${task.linkedBookingId}`} className="inline-flex items-center gap-1 font-bebas tracking-widest text-xs text-forest hover:underline">
                          <CalendarCheck className="w-3 h-3" /> EVENT · {task.bookingName}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                {!isStaff && (
                  <button
                    onClick={() => {
                      setShowForm(false);
                      setEditing({ id: task.id, initial: taskFormValuesOf(task) });
                    }}
                    ref={el => { if (el) editButtons.current.set(task.id, el); else editButtons.current.delete(task.id); }}
                    className="flex-shrink-0 -m-2 p-2.5 inline-flex items-center justify-center rounded-md text-sage/60 hover:text-burgundy hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest transition-colors"
                    title="Edit task"
                    aria-label={`Edit task: ${task.title}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {!isStaff && (
                  <button
                    onClick={() => { if (window.confirm(`Delete this task?\n\n"${task.title}"`)) deleteTask.mutate({ id: task.id }); }}
                    className="flex-shrink-0 -m-2 p-2.5 inline-flex items-center justify-center rounded-md text-sage/60 hover:text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest transition-colors"
                    title="Delete task"
                    aria-label={`Delete task: ${task.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
