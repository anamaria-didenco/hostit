import React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Mail, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { lostReasonLabel } from "@shared/lostReasons";
import { WIN_BACK_COOLDOWN_DAYS, QUIET_DAYS } from "@shared/winBack";

type Row = {
  id: number; firstName: string; lastName: string | null; email: string; status: string;
  eventType: string | null; eventDate: any; guestCount: number | null; lostReason: string | null;
  lastActivityAt: any; lastWinBackAt: any; eligible: boolean; nextEligibleAt: any;
};
type View = "lost" | "quiet" | "annual";

const fmt = (d: any, withYear = true) => d ? new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }) : null;
const nameOf = (r: Row) => [r.firstName, r.lastName].filter(Boolean).join(" ");

const SKIP_TEXT: Record<string, string> = {
  no_email: "no email address",
  sent_recently: `already sent a win-back in the last ${WIN_BACK_COOLDOWN_DAYS} days`,
  event_cancelled: "lost because the event was cancelled",
  missing_details: "the template needs details this enquiry doesn't have",
  smtp_not_configured: "email isn't set up",
  send_failed: "the email server didn't accept it",
  not_found: "no longer exists",
};

/**
 * Enquiries → Win back. Lost enquiries (except "event cancelled"), enquiries
 * gone quiet for 30+ days, and last year's annual events — with a
 * personalised bulk email that never reaches the same lead twice in 90 days.
 */
export default function WinBackPanel({ onOpenLead }: { onOpenLead: (id: number) => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.winBack.list.useQuery(undefined, { staleTime: 15_000 });
  const [view, setView] = React.useState<View>("lost");
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [sendOpen, setSendOpen] = React.useState(false);
  React.useEffect(() => { setSelected(new Set()); }, [view]);

  const setTypes = trpc.winBack.setAnnualTypes.useMutation({
    onSuccess: () => utils.winBack.list.invalidate(),
    onError: e => toast.error(e.message || "Couldn't save"),
  });

  const rows: Row[] = (view === "lost" ? data?.lost : view === "quiet" ? data?.quiet : data?.annual.rows) ?? [];
  const eligible = rows.filter(r => r.eligible);
  const allOn = eligible.length > 0 && eligible.every(r => selected.has(r.id));
  const toggle = (id: number, on: boolean) => setSelected(prev => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; });

  const tabs: { key: View; label: string; count: number; hint: string }[] = [
    { key: "lost", label: "Lost", count: data?.lost.length ?? 0, hint: "Enquiries marked lost, except where the event was cancelled" },
    { key: "quiet", label: "Gone quiet", count: data?.quiet.length ?? 0, hint: `Open enquiries with no activity for ${QUIET_DAYS}+ days` },
    { key: "annual", label: "Same time next year", count: data?.annual.rows.length ?? 0, hint: "Yearly events held 10–11 months ago" },
  ];

  const annualTypes = data?.annual.annualTypes ?? [];
  const typeChoices = Array.from(new Set([...annualTypes, ...(data?.annual.eventTypes ?? [])]));
  const toggleType = (t: string) => {
    const on = annualTypes.includes(t);
    setTypes.mutate({ types: on ? annualTypes.filter(x => x !== t) : [...annualTypes, t] });
  };

  return (
    <div className="flex-1 overflow-auto px-4 py-4 sm:px-6">
      <div className="max-w-4xl">
        <p className="font-dm text-sm text-stone-700 mb-3">
          People worth another hello. Tick who to email, pick a template and check the preview: each person gets their own copy. Nobody gets a win-back email more than once in {WIN_BACK_COOLDOWN_DAYS} days.
        </p>
        <div className="flex gap-1.5 flex-wrap mb-3" role="group" aria-label="Win back lists">
          {tabs.map(t => (
            <button key={t.key} type="button" aria-pressed={view === t.key} title={t.hint} onClick={() => setView(t.key)}
              className={`font-bebas tracking-widest text-xs px-3 py-1.5 border rounded-sm flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest ${view === t.key ? "bg-forest-dark text-cream border-forest" : "bg-white text-ink border-stone-300 hover:border-forest"}`}>
              {t.label.toUpperCase()}
              <span className={`text-[11px] px-1.5 rounded-full font-sans font-bold ${view === t.key ? "bg-cream text-ink" : "bg-stone-200 text-stone-800"}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {view === "annual" && (
          <div className="mb-3 border border-gold bg-white px-3 py-2.5">
            <div className="font-bebas tracking-widest text-xs text-stone-600 mb-1.5">EVENT TYPES THAT HAPPEN EVERY YEAR</div>
            <div className="flex gap-1.5 flex-wrap">
              {typeChoices.map(t => {
                const on = annualTypes.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => toggleType(t)} disabled={setTypes.isPending}
                    className={`font-dm text-xs px-2.5 py-1 rounded-full border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest ${on ? "bg-emerald-50 border-emerald-600 text-emerald-900" : "bg-white border-stone-300 text-stone-700 hover:border-forest"}`}>
                    {on ? "✓ " : ""}{t}
                  </button>
                );
              })}
            </div>
            <p className="font-dm text-xs text-stone-600 mt-2">
              Booked events of these types held {data?.annual.from ? `${fmt(data.annual.from)} – ${fmt(new Date(new Date(data.annual.to as any).getTime() - 1))}` : "10–11 months ago"}. Clients who've already enquired again are left out.
            </p>
          </div>
        )}

        {isLoading ? (
          <p className="font-dm text-sm text-stone-600 py-8 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="border border-dashed border-gold p-8 text-center">
            <RotateCcw className="w-8 h-8 text-stone-400 mx-auto mb-2" aria-hidden="true" />
            <p className="font-dm text-sm text-stone-700">
              {view === "lost" ? "No lost enquiries to win back." : view === "quiet" ? `Nothing has gone quiet for ${QUIET_DAYS}+ days.` : "No yearly events from this time last year."}
            </p>
          </div>
        ) : (
          <div className="border border-gold bg-white">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gold bg-linen">
              <label className="flex items-center gap-2 cursor-pointer font-bebas tracking-widest text-xs text-stone-700">
                <input type="checkbox" checked={allOn} disabled={eligible.length === 0}
                  onChange={e => setSelected(e.target.checked ? new Set(eligible.map(r => r.id)) : new Set())}
                  className="w-4 h-4 accent-forest" />
                {selected.size > 0 ? `${selected.size} SELECTED` : `SELECT ALL (${eligible.length})`}
              </label>
              <span className="flex-1" />
              <button type="button" disabled={selected.size === 0} onClick={() => setSendOpen(true)}
                className="btn-forest font-bebas tracking-widest text-xs px-3 py-1.5 text-cream flex items-center gap-1.5 disabled:opacity-50">
                <Mail className="w-3.5 h-3.5" /> SEND WIN-BACK EMAIL
              </button>
            </div>
            <ul className="divide-y divide-stone-200">
              {rows.map(r => {
                const why = !r.email ? "No email address" : !r.eligible && r.nextEligibleAt ? `Win-back sent ${fmt(r.lastWinBackAt)}. Can send again from ${fmt(r.nextEligibleAt)}` : null;
                const detail = view === "lost"
                  ? (lostReasonLabel(r.lostReason) ?? "No reason given")
                  : view === "quiet"
                    ? `Quiet since ${fmt(r.lastActivityAt)} · ${r.status.replace(/_/g, " ")}`
                    : `Last event ${fmt(r.eventDate)}`;
                return (
                  <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(r.id)} disabled={!r.eligible}
                      onChange={e => toggle(r.id, e.target.checked)}
                      aria-label={`Select ${nameOf(r)}`}
                      className="w-4 h-4 mt-1 accent-forest disabled:opacity-40" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-cormorant font-semibold text-base text-ink">{nameOf(r)}</span>
                        <span className="font-dm text-xs text-stone-600 truncate">{[r.eventType, view !== "annual" ? fmt(r.eventDate) : null, r.guestCount ? `${r.guestCount} guests` : null].filter(Boolean).join(" · ")}</span>
                      </div>
                      <div className="font-dm text-xs text-stone-700 mt-0.5">
                        {view === "lost"
                          ? <span className="inline-block px-1.5 py-0.5 rounded bg-stone-100 border border-stone-300">{detail}</span>
                          : detail}
                      </div>
                      {why && <div className="font-dm text-xs text-amber-900 mt-0.5">{why}</div>}
                    </div>
                    <button type="button" onClick={() => onOpenLead(r.id)}
                      className="flex-shrink-0 font-bebas tracking-widest text-xs text-forest hover:underline px-1 py-1">OPEN</button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {sendOpen && (
        <SendDialog
          recipients={rows.filter(r => selected.has(r.id))}
          onClose={() => setSendOpen(false)}
          onSent={() => { setSelected(new Set()); utils.winBack.list.invalidate(); utils.leads.list.invalidate(); }}
        />
      )}
    </div>
  );
}

function SendDialog({ recipients: initialRecipients, onClose, onSent }: { recipients: Row[]; onClose: () => void; onSent: () => void }) {
  // Fixed when the dialog opens: the selection is cleared once sent.
  const [recipients] = React.useState(initialRecipients);
  const { data: templates } = trpc.templates.list.useQuery();
  const [templateId, setTemplateId] = React.useState<number | null>(null);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  const [result, setResult] = React.useState<null | { sent: number; skipped: Array<{ id: number; name: string; reason: string; detail?: string }>; smtpConfigured: boolean }>(null);
  const subjectId = React.useId();
  const bodyId = React.useId();

  // Default to a win-back template if the venue has one.
  React.useEffect(() => {
    if (templateId != null || !templates?.length) return;
    const t = templates.find((x: any) => /win.?back/i.test(x.name)) ?? null;
    if (t) { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }
  }, [templates, templateId]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const current = recipients[Math.min(idx, recipients.length - 1)];
  const [debounced, setDebounced] = React.useState({ subject, body });
  React.useEffect(() => { const t = setTimeout(() => setDebounced({ subject, body }), 350); return () => clearTimeout(t); }, [subject, body]);
  const preview = trpc.winBack.preview.useQuery(
    { leadId: current?.id ?? 0, subject: debounced.subject, body: debounced.body },
    { enabled: !!current && !!debounced.subject.trim() && !!debounced.body.trim(), placeholderData: (p: any) => p },
  );
  const send = trpc.winBack.send.useMutation({
    onSuccess: r => { setResult(r); onSent(); },
    onError: e => toast.error(e.message || "Couldn't send"),
  });

  const missing = preview.data ? [...preview.data.blank, ...preview.data.unfilled] : [];

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="winback-send-title" className="bg-cream border-2 border-forest w-full sm:max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="bg-forest-dark px-5 py-3.5 flex items-start justify-between gap-3 sticky top-0 z-10">
          <div className="min-w-0">
            <div className="font-bebas tracking-widest text-xs text-cream opacity-80">WIN BACK</div>
            <h2 id="winback-send-title" className="font-cormorant text-cream font-semibold text-lg leading-tight">
              Email {recipients.length} {recipients.length === 1 ? "person" : "people"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-cream opacity-85 hover:opacity-100 p-1 -mr-1 rounded-sm focus-visible:outline-2 focus-visible:outline-gold">
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="p-5 space-y-3" role="status">
            <p className="font-cormorant text-xl font-semibold text-ink">
              {result.sent > 0 ? `Sent ${result.sent} email${result.sent === 1 ? "" : "s"}.` : "No emails were sent."}
            </p>
            {!result.smtpConfigured && (
              <p className="font-dm text-sm text-amber-950 bg-amber-50 border border-amber-300 px-3 py-2">Email isn't set up yet, so nothing could go out. Add your email details in Settings → Email, then try again.</p>
            )}
            {result.skipped.length > 0 && (
              <div>
                <p className="font-dm text-sm text-stone-800">Skipped {result.skipped.length}:</p>
                <ul className="mt-1 space-y-0.5">
                  {result.skipped.map(s => (
                    <li key={s.id} className="font-dm text-sm text-stone-700">{s.name}: {SKIP_TEXT[s.reason] ?? s.reason}{s.detail ? ` (${s.detail})` : ""}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button type="button" onClick={onClose} className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream">DONE</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <div className="font-bebas tracking-widest text-xs text-stone-600 mb-1.5">TEMPLATE</div>
              {(templates ?? []).length === 0 ? (
                <p className="font-dm text-xs text-stone-600">No templates yet. Write the email below, or add the starter templates in Settings → Email.</p>
              ) : (
                <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Templates">
                  {(templates ?? []).map((t: any) => (
                    <button key={t.id} type="button" aria-pressed={templateId === t.id}
                      onClick={() => { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }}
                      className={`font-dm text-xs px-2.5 py-1 rounded-full border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest ${templateId === t.id ? "bg-forest-dark text-cream border-forest" : "bg-white text-ink border-stone-300 hover:border-forest"}`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label htmlFor={subjectId} className="font-bebas tracking-widest text-xs text-stone-600 block mb-1">SUBJECT</label>
              <input id={subjectId} value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full border border-stone-300 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest" />
            </div>
            <div>
              <label htmlFor={bodyId} className="font-bebas tracking-widest text-xs text-stone-600 block mb-1">MESSAGE</label>
              <textarea id={bodyId} value={body} onChange={e => setBody(e.target.value)} rows={7}
                className="w-full border border-stone-300 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest resize-y" />
              <p className="font-dm text-xs text-stone-600 mt-1">Variables like {"{{firstName}}"} are filled in for each person.</p>
            </div>

            {current && subject.trim() && body.trim() && (
              <div className="border border-gold bg-white">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gold bg-linen">
                  <span className="font-bebas tracking-widest text-xs text-stone-700">PREVIEW FOR</span>
                  <span className="font-dm text-xs text-ink font-semibold truncate">{nameOf(current)}</span>
                  <span className="flex-1" />
                  {recipients.length > 1 && (
                    <>
                      <button type="button" aria-label="Previous person" onClick={() => setIdx(i => (i - 1 + recipients.length) % recipients.length)} className="p-1 text-stone-700 hover:text-ink"><ChevronLeft className="w-4 h-4" /></button>
                      <span className="font-dm text-xs text-stone-600">{Math.min(idx, recipients.length - 1) + 1} / {recipients.length}</span>
                      <button type="button" aria-label="Next person" onClick={() => setIdx(i => (i + 1) % recipients.length)} className="p-1 text-stone-700 hover:text-ink"><ChevronRight className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
                <div className="px-3 py-2.5" aria-live="polite">
                  {preview.data ? (
                    <>
                      <div className="font-dm text-sm text-ink font-semibold">{preview.data.subject}</div>
                      <div className="font-dm text-sm text-stone-800 whitespace-pre-wrap mt-1.5">{preview.data.body}</div>
                      {missing.length > 0 && (
                        <p className="mt-2 font-dm text-xs text-amber-950 bg-amber-50 border border-amber-300 px-2 py-1.5">
                          {nameOf(current)} will be skipped: nothing to fill {missing.join(", ")} with. Edit the wording, or leave it and they'll be left out.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="font-dm text-xs text-stone-600">Loading preview…</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" onClick={onClose} className="border border-stone-300 font-bebas tracking-widest text-xs px-4 py-2 text-stone-700 hover:text-ink">CANCEL</button>
              <button type="button" disabled={!subject.trim() || !body.trim() || send.isPending}
                onClick={() => send.mutate({ leadIds: recipients.map(r => r.id), subject, body })}
                className="btn-forest font-bebas tracking-widest text-xs px-5 py-2 text-cream flex items-center gap-1.5 disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> {send.isPending ? "SENDING…" : `SEND ${recipients.length} EMAIL${recipients.length === 1 ? "" : "S"}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
