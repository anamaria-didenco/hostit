import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Plus, CheckCircle2, Circle, Trash2, Calendar, ChevronDown, Flag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FILTERS = [
  { key: "all", label: "All Active" },
  { key: "overdue", label: "Overdue" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  normal: "text-blue-600 bg-blue-50 border-blue-200",
  low: "text-gray-500 bg-gray-50 border-gray-200",
};

export default function Tasks() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "mine" | "overdue" | "upcoming" | "completed">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "normal" as "low" | "normal" | "high",
  });

  const { data: taskList, refetch } = trpc.tasks.list.useQuery({ filter });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      refetch();
      setForm({ title: "", description: "", dueDate: "", priority: "normal" });
      setShowForm(false);
      toast.success("Task created");
    },
    onError: () => toast.error("Failed to create task"),
  });

  const completeTask = trpc.tasks.complete.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to update task"),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Task deleted"); },
    onError: () => toast.error("Failed to delete task"),
  });

  const handleCreate = () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    createTask.mutate({
      title: form.title,
      description: form.description || undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).getTime() : undefined,
      priority: form.priority,
    });
  };

  const now = Date.now();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-cormorant text-3xl font-semibold text-ink">Tasks</h1>
          <p className="font-dm text-sm text-sage mt-0.5">Track follow-ups, event prep, and team to-dos</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-burgundy text-cream font-bebas tracking-widest text-xs px-4 py-2 hover:bg-burg-dark transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {showForm ? "CANCEL" : "NEW TASK"}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="dante-card p-5 mb-6 space-y-3">
          <h2 className="font-bebas tracking-widest text-xs text-sage">NEW TASK</h2>
          <div>
            <label className="font-bebas text-xs tracking-widest text-sage block mb-1">TITLE *</label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Send proposal to Sarah"
              className="rounded-none border-gold/30 focus-visible:ring-0 focus-visible:border-burgundy"
              onKeyDown={e => e.key === "Enter" && handleCreate()}
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
          <div className="grid grid-cols-2 gap-3">
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
              onClick={() => setShowForm(false)}
              className="border border-border font-bebas tracking-widest text-xs px-4 py-2 text-ink/60 hover:text-ink transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={handleCreate}
              disabled={createTask.isPending}
              className="bg-burgundy text-cream font-bebas tracking-widest text-xs px-6 py-2 hover:bg-burg-dark transition-colors disabled:opacity-50"
            >
              {createTask.isPending ? "CREATING..." : "CREATE TASK"}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`font-bebas tracking-widest text-xs px-4 py-2.5 transition-colors border-b-2 -mb-px ${
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
          <p className="font-cormorant text-xl text-ink/40 italic">
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
            return (
              <div
                key={task.id}
                className={`dante-card p-4 flex items-start gap-3 group transition-colors ${
                  task.completed ? "opacity-60" : isOverdue ? "border-l-2 border-l-red-400" : ""
                }`}
              >
                <button
                  onClick={() => completeTask.mutate({ id: task.id, completed: !task.completed })}
                  className="mt-0.5 flex-shrink-0 text-sage hover:text-burgundy transition-colors"
                >
                  {task.completed
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : <Circle className="w-5 h-5" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`font-dm text-sm text-ink ${task.completed ? "line-through text-ink/40" : ""}`}>
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
                      isOverdue ? "text-red-600" : isDueToday ? "text-amber-600" : "text-sage"
                    }`}>
                      <Calendar className="w-3 h-3" />
                      {isOverdue ? "Overdue — " : isDueToday ? "Due today — " : "Due "}
                      {new Date(task.dueDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteTask.mutate({ id: task.id })}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-sage hover:text-red-500 flex-shrink-0"
                  title="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
