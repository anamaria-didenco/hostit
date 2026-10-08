import React from "react";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_VARIABLES } from "@/lib/templateVars";
import { STARTER_TEMPLATES } from "@shared/starterTemplates";

type Draft = { name: string; subject: string; body: string };
const EMPTY: Draft = { name: "", subject: "", body: "" };

/** Name / subject / body form, used both for a new template and for editing one. */
function TemplateEditor({ initial, saving, onSave, onCancel, heading }: {
  initial: Draft; saving: boolean; heading: string;
  onSave: (d: Draft) => void; onCancel: () => void;
}) {
  const [d, setD] = React.useState<Draft>(initial);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const id = React.useId();
  const valid = d.name.trim() && d.subject.trim() && d.body.trim();

  // Insert at the cursor (not the end), then put the cursor after the token.
  const insertVar = (token: string) => {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? d.body.length;
    const end = el?.selectionEnd ?? d.body.length;
    const next = d.body.slice(0, start) + token + d.body.slice(end);
    setD(f => ({ ...f, body: next }));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };

  return (
    <div className="dante-card p-5 border-2 border-gold">
      <div className="font-cormorant text-lg font-semibold text-ink mb-4">{heading}</div>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${id}-name`} className="font-bebas text-xs tracking-widest text-stone-600 block mb-1">TEMPLATE NAME</label>
          <Input id={`${id}-name`} value={d.name} onChange={e => setD(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Proposal follow-up" className="rounded-none border-border font-dm text-sm" />
        </div>
        <div>
          <label htmlFor={`${id}-subject`} className="font-bebas text-xs tracking-widest text-stone-600 block mb-1">SUBJECT LINE</label>
          <Input id={`${id}-subject`} value={d.subject} onChange={e => setD(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Following up on your enquiry" className="rounded-none border-border font-dm text-sm" />
        </div>
        <div>
          <label htmlFor={`${id}-body`} className="font-bebas text-xs tracking-widest text-stone-600 block mb-1">MESSAGE</label>
          <Textarea id={`${id}-body`} ref={bodyRef} value={d.body} onChange={e => setD(f => ({ ...f, body: e.target.value }))} rows={10} placeholder="Write your template message here…" className="rounded-none border-border font-dm text-sm" />
        </div>
        <details className="group">
          <summary className="font-bebas tracking-widest text-xs text-forest cursor-pointer hover:underline select-none list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block" aria-hidden="true">▶</span> INSERT A VARIABLE
          </summary>
          <p className="font-dm text-xs text-stone-600 mt-2">Each one is filled in for the client when you use the template. Links come out blank if the enquiry doesn't have one yet.</p>
          <div className="mt-2 p-3 bg-linen border border-gold grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {TEMPLATE_VARIABLES.map(v => (
              <button key={v.token} type="button" onClick={() => insertVar(v.token)}
                title={`Insert ${v.label}, e.g. "${v.example}"`}
                className="text-left rounded-sm px-1 py-0.5 hover:bg-cream focus-visible:outline-2 focus-visible:outline-forest">
                <span className="font-mono text-xs text-forest">{v.token}</span>
                <span className="font-dm text-xs text-stone-600 ml-1">{v.label}</span>
              </button>
            ))}
          </div>
        </details>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel}
            className="border border-border font-bebas tracking-widest text-xs px-4 py-2 text-stone-700 hover:text-ink">CANCEL</button>
          <button type="button" onClick={() => onSave({ name: d.name.trim(), subject: d.subject.trim(), body: d.body.trim() })} disabled={!valid || saving}
            className="btn-forest font-bebas tracking-widest text-xs px-6 py-2 text-cream disabled:opacity-50">
            {saving ? "SAVING…" : "SAVE TEMPLATE"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Settings → Email → Email templates: create, edit, delete, add the starter set. */
export default function EmailTemplatesSettings() {
  const utils = trpc.useUtils();
  const { data: templates } = trpc.templates.list.useQuery();
  const refresh = () => utils.templates.list.invalidate();
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);

  const create = trpc.templates.create.useMutation({
    onSuccess: () => { refresh(); setCreating(false); toast.success("Template saved"); },
    onError: e => toast.error(e.message || "Couldn't save the template"),
  });
  const update = trpc.templates.update.useMutation({
    onSuccess: () => { refresh(); setEditingId(null); toast.success("Template updated"); },
    onError: e => toast.error(e.message || "Couldn't save the template"),
  });
  const remove = trpc.templates.delete.useMutation({
    onSuccess: () => { refresh(); toast.success("Template deleted"); },
  });
  const addStarters = trpc.templates.addStarters.useMutation({
    onSuccess: r => {
      refresh();
      toast.success(r.added > 0 ? `Added ${r.added} starter template${r.added === 1 ? "" : "s"}` : "You already have all the starter templates");
    },
    onError: e => toast.error(e.message || "Couldn't add the starter templates"),
  });

  const list = templates ?? [];
  const have = new Set(list.map((t: any) => String(t.name).trim().toLowerCase()));
  const missingStarters = STARTER_TEMPLATES.filter(t => !have.has(t.name.toLowerCase())).length;

  return (
    <div className="mt-8" id="email-templates">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-cormorant text-xl font-semibold text-ink">Email templates</h2>
          <p className="font-dm text-xs text-stone-600">Ready-made replies you can drop into an email in one click, then tweak before sending.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {list.length > 0 && missingStarters > 0 && (
            <button type="button" onClick={() => addStarters.mutate()} disabled={addStarters.isPending}
              className="border border-forest text-forest font-bebas tracking-widest text-xs px-3 py-2 hover:bg-linen flex items-center gap-1 disabled:opacity-50">
              <Sparkles className="w-3 h-3" /> {addStarters.isPending ? "ADDING…" : "ADD STARTER TEMPLATES"}
            </button>
          )}
          <button type="button" onClick={() => { setCreating(true); setEditingId(null); }}
            className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1">
            <Plus className="w-3 h-3" /> NEW TEMPLATE
          </button>
        </div>
      </div>

      {creating && (
        <div className="mb-4">
          <TemplateEditor heading="New template" initial={EMPTY} saving={create.isPending}
            onSave={d => create.mutate(d)} onCancel={() => setCreating(false)} />
        </div>
      )}

      {list.length === 0 && !creating ? (
        <div className="border border-dashed border-gold p-6 text-center">
          <p className="font-dm text-sm text-ink font-medium">No templates yet</p>
          <p className="font-dm text-xs text-stone-600 mt-1 max-w-md mx-auto">
            Start with {STARTER_TEMPLATES.length} we've written for you: first reply, sending a proposal, following up, holding a date, booking confirmed, checking in, "sorry, we're booked" and win-back. You can edit any of them.
          </p>
          <button type="button" onClick={() => addStarters.mutate()} disabled={addStarters.isPending}
            className="mt-4 btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream inline-flex items-center gap-1.5 disabled:opacity-50">
            <Sparkles className="w-3.5 h-3.5" /> {addStarters.isPending ? "ADDING…" : "ADD STARTER TEMPLATES"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((t: any) => editingId === t.id ? (
            <TemplateEditor key={t.id} heading={`Edit "${t.name}"`} initial={{ name: t.name, subject: t.subject, body: t.body }} saving={update.isPending}
              onSave={d => update.mutate({ id: t.id, ...d })} onCancel={() => setEditingId(null)} />
          ) : (
            <div key={t.id} className="dante-card p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-cormorant font-semibold text-base text-ink">{t.name}</div>
                <div className="font-dm text-xs font-semibold text-forest mt-0.5">{t.subject}</div>
                <div className="font-dm text-xs text-stone-600 mt-1 line-clamp-2">{String(t.body).replace(/\s+/g, " ")}</div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" aria-label={`Edit template ${t.name}`} onClick={() => { setEditingId(t.id); setCreating(false); }}
                  className="p-1.5 text-stone-600 hover:text-forest rounded-sm focus-visible:outline-2 focus-visible:outline-forest">
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" aria-label={`Delete template ${t.name}`}
                  onClick={() => { if (confirm(`Delete the "${t.name}" template?`)) remove.mutate({ id: t.id }); }}
                  className="p-1.5 text-stone-600 hover:text-tomato rounded-sm focus-visible:outline-2 focus-visible:outline-forest">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
