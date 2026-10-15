import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Link } from "wouter";
import { Plus, CheckCircle2, Circle, Trash2, Calendar, ChevronDown, Flag, Pencil, Inbox, CalendarCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTERS = [
  { key: "all", label: "All Active" },
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

type TaskFormValues = {
  title: string;
  description: string;
  dueDate: string; // yyyy-mm-dd, "" for none
  priority: "low" | "normal" | "high";
};

const EMPTY_FORM: TaskFormValues = { title: "", description: "", dueDate: "", priority: "normal" };

// A stored due date as the date input's yyyy-mm-dd (local day).
function dueDateInput(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The new-task form, also used to edit a task in place.
function TaskForm({ heading, initial, submitLabel, pendingLabel, pending, onSubmit, onCancel, className = "mb-6" }: {
  heading: string;
  className?: string;
  initial: TaskFormValues;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onSubmit: (values: TaskFormValues) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TaskFormValues>(initial);
  const submit = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    onSubmit(form);
  };
  return (
    <div className={`dante-card p-5 space-y-3 ${className}`}>
      <h2 className="font-bebas tracking-widest text-xs text-sage">{heading}</h2>
      <div>
        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TITLE *</label>
        <Input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Send proposal to Sarah"
          className="rounded-none border-gold/30 focus-visible:ring-0 focus-visible:border-burgundy"
          onKeyDown={e => e.key === "Enter" && submit()}
        />
      </div>
      <div>
        <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DESCRIPTION</label>
        <Textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Optional notes..."
          rows={2}
          className="rounded-none border-gold/30 focus-visible:ring-0 focus-visible:border-burgundy resize-none text-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">DUE DATE</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
            className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-burgundy"
          />
        </div>
        <div>
          <label className="font-bebas text-xs tracking-widest text-sage block mb-1">PRIORITY</label>
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
            <SelectTrigger className="rounded-none border-gold/30 focus:ring-0 focus:border-burgundy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="border border-border font-bebas tracking-widest text-xs px-4 py-2 text-ink/60 hover:text-ink transition-colors"
        >
          CANCEL
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="bg-burgundy text-cream font-bebas tracking-widest text-xs px-6 py-2 hover:bg-burg-dark transition-colors disabled:opacity-50"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}

export default function Tasks() {
  // A staff login is read-only server-side, so write controls (new/edit/
  // delete/complete) would only fail — hide or disable them.
  const { user, isStaff } = useAuth();
  const [filter, setFilter] = useState<"all" | "mine" | "overdue" | "upcoming" | "completed">("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<{ id: number; initial: TaskFormValues } | null>(null);

  const { data: taskList, refetch } = trpc.tasks.list.useQuery({ filter });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowForm(false);
      toast.success("Task created");
    },
    onError: () => toast.error("Failed to create task"),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      refetch();
      setEditing(null);
      toast.success("Task updated");
    },
    onError: () => toast.error("Failed to update task"),
  });

  const completeTask = trpc.tasks.complete.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to update task"),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Task deleted"); },
    onError: () => toast.error("Failed to delete task"),
  });

  const handleCreate = (form: TaskFormValues) => {
    createTask.mutate({
      title: form.title,
      description: form.description || undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).getTime() : undefined,
      priority: form.priority,
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
        : form.dueDate ? new Date(form.dueDate).getTime() : null,
      priority: form.priority,
    });
  };

  const now = Date.now();

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="font-cormorant text-2xl md:text-3xl font-semibold text-ink">Tasks</h1>
          <p className="font-dm text-xs md:text-sm text-sage mt-0.5">Track follow-ups, event prep, and team to-dos</p>
        </div>
        {!isStaff && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 bg-burgundy text-cream font-bebas tracking-widest text-xs px-4 py-2 hover:bg-burg-dark active:bg-burg-dark transition-colors min-h-[44px] flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "CANCEL" : "NEW TASK"}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <TaskForm
          heading="NEW TASK"
          initial={EMPTY_FORM}
          submitLabel="CREATE TASK"
          pendingLabel="CREATING..."
          pending={createTask.isPending}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filter tabs — horizontally scrollable on mobile to prevent overflow */}
      <div className="flex gap-1 mb-4 border-b border-border overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`flex-shrink-0 font-bebas tracking-widest text-xs px-4 py-2.5 transition-colors border-b-2 -mb-px min-h-[44px] ${
              filter === f.key
                ? "border-burgundy text-burgundy"
                : "border-transparent text-sage hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {!taskList || taskList.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-sage/30 mx-auto mb-3" />
          <p className="font-cormorant text-xl text-ink/65 italic">
            {filter === "completed" ? "No completed tasks yet" : "No tasks here"}
          </p>
          <p className="font-dm text-xs text-sage/60 mt-1">
            {filter === "overdue" ? "You're all caught up!" : "Create a task to get started"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {taskList.map((task: any) => {
            const isOverdue = !task.completed && task.dueDate && task.dueDate < now;
            const isDueToday = !task.completed && task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString();
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
                  onCancel={() => setEditing(null)}
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
                  aria-label={task.completed ? "Mark task incomplete" : "Mark task complete"}
                  onClick={() => completeTask.mutate({ id: task.id, completed: !task.completed })}
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
                    {task.priority !== "normal" && (
                      <span className={`font-bebas text-[10px] tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority.toUpperCase()}
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
                      {isOverdue ? "Overdue — " : isDueToday ? "Due today — " : "Due "}
                      {new Date(task.dueDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                  )}
                  {(task.leadName || task.bookingName) && (
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5">
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
                      setEditing({
                        id: task.id,
                        initial: {
                          title: task.title,
                          description: task.description ?? "",
                          dueDate: dueDateInput(task.dueDate),
                          priority: (task.priority ?? "normal") as TaskFormValues["priority"],
                        },
                      });
                    }}
                    className="flex-shrink-0 -m-1 p-1.5 inline-flex items-center justify-center rounded-md text-sage/60 hover:text-burgundy hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest transition-colors"
                    title="Edit task"
                    aria-label="Edit task"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {!isStaff && (
                  <button
                    onClick={() => { if (window.confirm(`Delete this task?\n\n"${task.title}"`)) deleteTask.mutate({ id: task.id }); }}
                    className="flex-shrink-0 -m-1 p-1.5 inline-flex items-center justify-center rounded-md text-sage/60 hover:text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest transition-colors"
                    title="Delete task"
                    aria-label="Delete task"
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
