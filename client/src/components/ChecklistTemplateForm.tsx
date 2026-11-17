import React, { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ChecklistTemplateValues = { name: string; description: string; items: string };

/**
 * Settings > Templates: the form for a new checklist template, also used to
 * edit one in place. Items are one per line.
 */
export function ChecklistTemplateForm({ heading, initial, submitLabel, pendingLabel, pending, onSubmit, onCancel, autoFocus = false, className = "dante-card p-5 mb-4" }: {
  heading?: string;
  initial: ChecklistTemplateValues;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  onSubmit: (values: ChecklistTemplateValues) => void;
  /** Cancel, also on Escape. Without it there's no Cancel button (the page has its own). */
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const fid = useId();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<{ name?: string; items?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) nameRef.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => {
    if (pending) return;
    const next = {
      name: form.name.trim() ? undefined : "Give the template a name.",
      items: form.items.trim() ? undefined : "Add at least one item, one per line.",
    };
    setErrors(next);
    if (next.name) { nameRef.current?.focus(); return; }
    if (next.items) { itemsRef.current?.focus(); return; }
    onSubmit({ ...form, name: form.name.trim(), description: form.description.trim() });
  };
  const label = "font-bebas text-xs tracking-widest text-sage block mb-1";
  return (
    <div
      role="group"
      aria-label={heading ?? "Checklist template"}
      className={`${className} space-y-3`}
      onKeyDown={e => { if (e.key === "Escape" && onCancel && !e.defaultPrevented) { e.preventDefault(); onCancel(); } }}
    >
      {heading && <h3 className="font-bebas tracking-widest text-xs text-sage">{heading}</h3>}
      <div>
        <label htmlFor={`${fid}-name`} className={label}>TEMPLATE NAME *</label>
        <Input id={`${fid}-name`} ref={nameRef} value={form.name}
          onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(x => ({ ...x, name: undefined })); }}
          aria-required="true" aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? `${fid}-name-error` : undefined}
          placeholder="e.g. Wedding Reception Setup" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold pointer-coarse:h-11" />
        {errors.name && <p id={`${fid}-name-error`} role="alert" className="font-dm text-xs text-red-700 mt-1">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor={`${fid}-description`} className={label}>DESCRIPTION</label>
        <Input id={`${fid}-description`} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Brief description of when to use this template" className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold pointer-coarse:h-11" />
      </div>
      <div>
        <label htmlFor={`${fid}-items`} className={label}>CHECKLIST ITEMS (one per line) *</label>
        <Textarea id={`${fid}-items`} ref={itemsRef} value={form.items}
          onChange={e => { setForm(f => ({ ...f, items: e.target.value })); setErrors(x => ({ ...x, items: undefined })); }}
          aria-required="true" aria-invalid={errors.items ? true : undefined}
          aria-describedby={`${fid}-items-hint${errors.items ? ` ${fid}-items-error` : ""}`}
          placeholder={"Set up tables and chairs\nPrepare bar station\nCheck AV equipment\nBriefing with staff\nWelcome guests"}
          rows={6} className="rounded-none border border-gold/30 focus-visible:ring-0 focus-visible:border-gold resize-y text-sm font-dm" />
        <p id={`${fid}-items-hint`} className="font-dm text-xs text-stone-600 mt-1">Each line becomes a separate checkbox item. Change the order by moving the lines.</p>
        {errors.items && <p id={`${fid}-items-error`} role="alert" className="font-dm text-xs text-red-700 mt-1">{errors.items}</p>}
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="border border-border font-bebas tracking-widest text-xs px-4 py-2 min-h-[36px] pointer-coarse:min-h-[44px] text-ink/70 hover:text-ink transition-colors">
            CANCEL
          </button>
        )}
        {/* aria-disabled, not disabled: keyboard focus stays on it while it saves. */}
        <button type="button" onClick={submit} aria-disabled={pending || undefined}
          className="btn-forest font-bebas tracking-widest text-xs px-6 py-2 min-h-[36px] pointer-coarse:min-h-[44px] text-cream aria-disabled:opacity-50">
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}
