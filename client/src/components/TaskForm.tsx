import React, { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssigneeSelect, TaskLinkPicker, type TaskLink } from "@/components/taskParts";
import { normaliseTaskPriority, type TaskPriority } from "@shared/taskFields";

/**
 * The task form of the Tasks tab, used to add a task and to edit one in place
 * — on the Tasks tab and in the Tasks box on an enquiry / event.
 */

export type TaskFormValues = {
  title: string;
  description: string;
  dueDate: string; // yyyy-mm-dd, "" for none
  priority: TaskPriority;
  assignedTo: string; // a name, "" for unassigned
  link: TaskLink | null; // the enquiry or event this is about
};

export const EMPTY_TASK_FORM: TaskFormValues = { title: "", description: "", dueDate: "", priority: "normal", assignedTo: "", link: null };

// The enquiry or event a listed task is about (an enquiry wins if it has both).
export function taskLinkOf(task: any): TaskLink | null {
  if (task.linkedLeadId != null && task.leadName) return { kind: "lead", id: task.linkedLeadId, name: task.leadName };
  if (task.linkedBookingId != null && task.bookingName) return { kind: "booking", id: task.linkedBookingId, name: task.bookingName };
  return null;
}

// A stored due date as the date input's yyyy-mm-dd (local day).
export function dueDateInput(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A picked yyyy-mm-dd as a stored due date: local noon, so the day never slips in another timezone. */
export function dueDateMs(ymd: string): number {
  return new Date(`${ymd}T12:00:00`).getTime();
}

/** A listed task's values for the edit form. */
export function taskFormValuesOf(task: any): TaskFormValues {
  return {
    title: task.title ?? "",
    description: task.description ?? "",
    dueDate: dueDateInput(task.dueDate),
    // An older task can hold another word ("medium"): it opened with an
    // empty Priority box and couldn't be saved.
    priority: normaliseTaskPriority(task.priority),
    assignedTo: task.assignedTo ?? "",
    link: taskLinkOf(task),
  };
}

const LABEL = "font-bebas text-xs tracking-widest text-sage block mb-1";
// 44px tall on a touch screen, 36px with a mouse.
const BUTTON_SIZE = "min-h-[36px] pointer-coarse:min-h-[44px]";

export function TaskForm({
  heading, headingLevel = 2, initial, submitLabel, pendingLabel, pending, onSubmit, onCancel,
  className = "mb-6", frameClassName = "dante-card p-5", showLink = true, autoFocusTitle = false, ariaLabel,
}: {
  heading: string;
  /** The heading's level where the form sits (2 on the Tasks tab; inside a Tasks box, one under the box's heading). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
  /** The form's box. The Tasks box on an enquiry is already a card. */
  frameClassName?: string;
  initial: TaskFormValues;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onSubmit: (values: TaskFormValues) => void;
  /** Cancel, also on Escape. */
  onCancel: () => void;
  /** The "Link to" picker. Hidden where the task is already about this record. */
  showLink?: boolean;
  autoFocusTitle?: boolean;
  /** A name for the form as a region, e.g. "Edit task: Call Sarah". */
  ariaLabel?: string;
}) {
  const [form, setForm] = useState<TaskFormValues>(initial);
  // Shown at the field (it was only a 4-second toast, with nothing marked).
  const [titleError, setTitleError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const fid = useId();
  useEffect(() => {
    if (autoFocusTitle) titleRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = () => {
    if (!form.title.trim()) {
      setTitleError("Give the task a title.");
      titleRef.current?.focus();
      return;
    }
    onSubmit({ ...form, title: form.title.trim() });
  };
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? heading}
      className={`${frameClassName} space-y-3 ${className}`}
      onKeyDown={e => {
        // Escape cancels. An open priority list or link search closes itself
        // first (it marks the key handled).
        if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onCancel(); }
      }}
    >
      <Heading className="font-bebas tracking-widest text-xs text-sage">{heading}</Heading>
      <div>
        <label htmlFor={`${fid}-title`} className={LABEL}>TITLE *</label>
        <Input
          id={`${fid}-title`}
          ref={titleRef}
          value={form.title}
          onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setTitleError(""); }}
          placeholder="e.g. Send proposal to Sarah"
          aria-required="true"
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? `${fid}-title-error` : undefined}
          className="rounded-none border-gold/30 focus-visible:ring-0 focus-visible:border-burgundy pointer-coarse:h-11"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!pending) submit(); } }}
        />
        {titleError && <p id={`${fid}-title-error`} role="alert" className="font-dm text-xs text-red-700 mt-1">{titleError}</p>}
      </div>
      <div>
        <label htmlFor={`${fid}-description`} className={LABEL}>DESCRIPTION</label>
        <Textarea
          id={`${fid}-description`}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Optional notes..."
          rows={2}
          className="rounded-none border-gold/30 focus-visible:ring-0 focus-visible:border-burgundy resize-none text-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${fid}-due`} className={LABEL}>DUE DATE</label>
          <input
            id={`${fid}-due`}
            type="date"
            value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
            className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-burgundy pointer-coarse:min-h-[44px]"
          />
        </div>
        <div>
          <label htmlFor={`${fid}-priority`} className={LABEL}>PRIORITY</label>
          <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: normaliseTaskPriority(v) }))}>
            <SelectTrigger id={`${fid}-priority`} className="w-full rounded-none border-gold/30 focus:ring-0 focus:border-burgundy pointer-coarse:data-[size=default]:h-11">
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
      <div className={showLink ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
        <div>
          <label htmlFor={`${fid}-assignee`} className={LABEL}>ASSIGN TO</label>
          <AssigneeSelect
            id={`${fid}-assignee`}
            value={form.assignedTo}
            onChange={v => setForm(f => ({ ...f, assignedTo: v }))}
            className="w-full border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-burgundy pointer-coarse:min-h-[44px]"
          />
        </div>
        {showLink && (
          <div>
            <span className={LABEL}>LINK TO (OPTIONAL)</span>
            <TaskLinkPicker value={form.link} onChange={link => setForm(f => ({ ...f, link }))} />
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className={`border border-border font-bebas tracking-widest text-xs px-4 py-2 ${BUTTON_SIZE} text-ink/70 hover:text-ink transition-colors`}
        >
          CANCEL
        </button>
        {/* aria-disabled, not disabled: a disabled button drops keyboard
            focus to the top of the page while it saves. */}
        <button
          type="button"
          onClick={() => { if (!pending) submit(); }}
          aria-disabled={pending || undefined}
          className={`bg-burgundy text-cream font-bebas tracking-widest text-xs px-6 py-2 ${BUTTON_SIZE} hover:bg-burg-dark transition-colors aria-disabled:opacity-50 aria-disabled:pointer-events-none`}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}
