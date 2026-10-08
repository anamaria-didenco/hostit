import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Eye, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FOLLOW_UP_TEMPLATE_VARIABLES } from "@/lib/templateVars";
import {
  ALERT_KIND_LABELS, SEQUENCES, type SequenceConfig, type SequenceDef, type SequenceKey,
} from "@shared/followUpSequences";

/**
 * Settings → Follow-ups: venue alerts (bell + email copies, reply-overdue)
 * and the automatic client follow-up emails. Every client email is off until
 * the venue turns it on.
 */

const LABEL = "font-bebas text-[11px] text-stone-600 block mb-1";
const FIELD = "rounded-none border border-gold focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 font-dm text-sm";

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
    >
      <span aria-hidden="true" className="relative inline-block w-9 h-5 rounded-full transition-colors" style={{ background: on ? "#2f5488" : "#d6d0c4" }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: on ? 18 : 2 }} />
      </span>
      <span aria-hidden="true" className="font-bebas text-[11px] text-ink w-7 text-left">{on ? "On" : "Off"}</span>
    </button>
  );
}

const EDITABLE = ["delay", "subject", "body", "secondEnabled", "secondDelay", "secondSubject", "secondBody"] as const;

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });

function SequenceCard({ def, cfg, smtpConfigured }: { def: SequenceDef; cfg: SequenceConfig; smtpConfigured: boolean }) {
  const utils = trpc.useUtils();
  const uid = useId();
  const [draft, setDraft] = useState<SequenceConfig>(cfg);
  const [previewStep, setPreviewStep] = useState<1 | 2 | null>(null);
  // When the saved settings change (a save, or the on/off switch), take the
  // new values — but keep any field the user is still editing.
  const prevCfg = useRef(cfg);
  useEffect(() => {
    const prev = prevCfg.current;
    prevCfg.current = cfg;
    setDraft(d => {
      const next: any = { ...d, enabled: cfg.enabled, enabledAt: cfg.enabledAt };
      for (const k of EDITABLE) if ((d as any)[k] === (prev as any)[k]) next[k] = (cfg as any)[k];
      return next;
    });
  }, [cfg]);
  const save = trpc.followUps.updateSequence.useMutation({
    onSuccess: () => utils.followUps.settings.invalidate(),
    onError: (e) => toast.error(e.message || "Couldn't save — please try again."),
  });
  const dirty = EDITABLE.some(k => (draft as any)[k] !== (cfg as any)[k]);
  const liveWording = previewStep === 2
    ? { subject: draft.secondSubject ?? "", body: draft.secondBody ?? "" }
    : { subject: draft.subject, body: draft.body };
  // Re-render the preview once typing pauses, not on every keystroke.
  const [wording, setWording] = useState(liveWording);
  useEffect(() => {
    const t = setTimeout(() => setWording(liveWording), 400);
    return () => clearTimeout(t);
  }, [liveWording.subject, liveWording.body]);
  const preview = trpc.followUps.preview.useQuery(
    { key: def.key, ...wording },
    { enabled: previewStep !== null && !!wording.subject.trim() && !!wording.body.trim(), placeholderData: (prev) => prev },
  );

  const toggle = (enabled: boolean) => {
    save.mutate({ key: def.key, enabled }, {
      onSuccess: () => toast.success(enabled
        ? `${def.title}: on. Only enquiries from now on will get it.`
        : `${def.title}: off.`),
    });
  };
  const saveWording = () => {
    const { enabled: _e, enabledAt: _a, ...rest } = draft;
    save.mutate({ key: def.key, ...rest }, { onSuccess: () => toast.success("Saved") });
  };
  const resetWording = () => setDraft(d => ({
    ...d, subject: def.defaults.subject, body: def.defaults.body,
    ...(def.key === "enquiry_no_reply" ? { secondSubject: def.defaults.secondSubject, secondBody: def.defaults.secondBody } : {}),
  }));
  const vars = FOLLOW_UP_TEMPLATE_VARIABLES.filter(v => {
    const name = v.token.slice(2, -2);
    return !["proposalLink", "enquiryFormLink"].includes(name) || def.extraVars.includes(name);
  });

  return (
    <section aria-labelledby={`${uid}-title`} className="dante-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`${uid}-title`} className="font-serif text-lg font-semibold text-ink leading-tight">{def.title}</h3>
          <p className="font-dm text-sm text-stone-700 mt-1">{def.when(draft)}</p>
          {cfg.enabled && cfg.enabledAt && (
            <p className="font-dm text-xs text-stone-600 mt-1">On since {fmtDay(cfg.enabledAt)} — enquiries from before then are left alone.</p>
          )}
        </div>
        <Toggle on={cfg.enabled} onChange={toggle} disabled={save.isPending} label={`Send “${def.title}” emails`} />
      </div>

      <div className="grid sm:grid-cols-[160px_1fr] gap-4">
        <div>
          <label htmlFor={`${uid}-delay`} className={LABEL}>{def.delayLabel}</label>
          <Input id={`${uid}-delay`} type="number" inputMode="numeric" min={def.minDelay} max={def.maxDelay}
            value={draft.delay}
            onChange={e => setDraft(d => ({ ...d, delay: Math.max(def.minDelay, Math.min(def.maxDelay, Number(e.target.value) || def.minDelay)) }))}
            className={FIELD} />
        </div>
        <div>
          <label htmlFor={`${uid}-subject`} className={LABEL}>Subject</label>
          <Input id={`${uid}-subject`} value={draft.subject} maxLength={255}
            onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} className={FIELD} />
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-body`} className={LABEL}>Email</label>
        <Textarea id={`${uid}-body`} value={draft.body} rows={7} maxLength={5000}
          onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} className={`${FIELD} resize-y`} />
      </div>

      {def.key === "enquiry_no_reply" && (
        <div className="border-t border-stone-200 pt-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input type="checkbox" checked={!!draft.secondEnabled}
              onChange={e => setDraft(d => ({ ...d, secondEnabled: e.target.checked }))}
              className="w-4 h-4 accent-forest" />
            <span className="font-dm text-sm text-ink">Send a second nudge if there's still no reply</span>
          </label>
          {draft.secondEnabled && (
            <>
              <div className="grid sm:grid-cols-[160px_1fr] gap-4">
                <div>
                  <label htmlFor={`${uid}-delay2`} className={LABEL}>Days after your last email</label>
                  <Input id={`${uid}-delay2`} type="number" inputMode="numeric" min={def.minDelay} max={def.maxDelay}
                    value={draft.secondDelay ?? 7}
                    onChange={e => setDraft(d => ({ ...d, secondDelay: Math.max(def.minDelay, Math.min(def.maxDelay, Number(e.target.value) || def.minDelay)) }))}
                    className={FIELD} />
                </div>
                <div>
                  <label htmlFor={`${uid}-subject2`} className={LABEL}>Second nudge subject</label>
                  <Input id={`${uid}-subject2`} value={draft.secondSubject ?? ""} maxLength={255}
                    onChange={e => setDraft(d => ({ ...d, secondSubject: e.target.value }))} className={FIELD} />
                </div>
              </div>
              <div>
                <label htmlFor={`${uid}-body2`} className={LABEL}>Second nudge email</label>
                <Textarea id={`${uid}-body2`} value={draft.secondBody ?? ""} rows={6} maxLength={5000}
                  onChange={e => setDraft(d => ({ ...d, secondBody: e.target.value }))} className={`${FIELD} resize-y`} />
              </div>
            </>
          )}
        </div>
      )}

      <p className="font-dm text-xs text-stone-600">
        You can use: {vars.map((v, i) => (
          <span key={v.token}><code className="bg-linen px-1 py-0.5 rounded text-[11px] text-ink" title={v.label}>{v.token}</code>{i < vars.length - 1 ? " " : ""}</span>
        ))}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={saveWording} disabled={!dirty || save.isPending}
          className="btn-forest px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary">
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" aria-expanded={previewStep === 1} onClick={() => setPreviewStep(p => (p === 1 ? null : 1))}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-stone-300 rounded-md text-ink hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Eye className="w-4 h-4" aria-hidden="true" /> {previewStep === 1 ? "Hide preview" : "Preview"}
        </button>
        {def.key === "enquiry_no_reply" && draft.secondEnabled && (
          <button type="button" aria-expanded={previewStep === 2} onClick={() => setPreviewStep(p => (p === 2 ? null : 2))}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-stone-300 rounded-md text-ink hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Eye className="w-4 h-4" aria-hidden="true" /> {previewStep === 2 ? "Hide second" : "Preview second"}
          </button>
        )}
        <button type="button" onClick={resetWording}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-stone-700 hover:text-ink rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset wording
        </button>
        {dirty && <span className="font-dm text-xs text-gold-deep">Unsaved changes</span>}
      </div>

      {previewStep !== null && (
        <div className="border border-stone-200 rounded-md overflow-hidden bg-white">
          <div className="px-4 py-2 border-b border-stone-200 bg-linen font-dm text-xs text-stone-700">
            Preview with sample details (Jane Smith, Birthday Party)
            {!smtpConfigured && <span> · won't send until your email is set up</span>}
          </div>
          {preview.data ? (
            <>
              <div className="px-4 py-2 border-b border-stone-200 font-dm text-sm"><span className="text-stone-600">Subject:</span> <span className="text-ink font-semibold">{preview.data.subject}</span></div>
              <iframe title={`${def.title} preview`} sandbox="" srcDoc={preview.data.html} className="w-full h-[380px] bg-white" />
            </>
          ) : (
            <p className="px-4 py-6 font-dm text-sm text-stone-600">{preview.isError ? "Couldn't load the preview." : (!wording.subject.trim() || !wording.body.trim()) ? "Add a subject and email to preview." : "Loading…"}</p>
          )}
        </div>
      )}
    </section>
  );
}

export default function FollowUpSettings({ onOpenEmailSettings, onOpenVenueSettings }: {
  onOpenEmailSettings?: () => void;
  onOpenVenueSettings?: () => void;
}) {
  const utils = trpc.useUtils();
  const uid = useId();
  const { data, isLoading } = trpc.followUps.settings.useQuery();
  const [hours, setHours] = useState<number>(2);
  useEffect(() => { if (data) setHours(data.replyOverdueHours); }, [data?.replyOverdueHours]);
  const updateAlerts = trpc.followUps.updateAlerts.useMutation({
    onSuccess: () => { utils.followUps.settings.invalidate(); toast.success("Saved"); },
    onError: () => toast.error("Couldn't save — please try again."),
  });

  if (isLoading || !data) return <div className="max-w-3xl mx-auto font-dm text-sm text-stone-600">Loading…</div>;
  const emailsOn = data.alertEmailsEnabled;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-cormorant text-3xl font-semibold text-ink">Follow-ups</h1>
        <p className="font-dm text-sm text-stone-700 mt-1">Reply first and keep enquiries moving. Alerts tell you when something needs a person; automatic emails follow up with clients for you.</p>
      </div>

      {/* ── Alerts for you ── */}
      <section aria-labelledby={`${uid}-alerts`} className="space-y-3">
        <h2 id={`${uid}-alerts`} className="font-bebas text-xs text-stone-600">Alerts for you</h2>
        <div className="dante-card p-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-serif text-lg font-semibold text-ink leading-tight">Email me alerts</h3>
              <p className="font-dm text-sm text-stone-700 mt-1">Every alert shows in the bell. With this on, you also get a copy by email at your notification address. New-enquiry emails are separate and always sent.</p>
              {emailsOn && (!data.hasNotificationEmail || !data.smtpConfigured) && (
                <p className="font-dm text-xs text-gold-deep mt-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" aria-hidden="true" />
                  <span>
                    No emails can go out yet: {!data.hasNotificationEmail ? "add a notification email" : "set up your email"}{" "}
                    {!data.hasNotificationEmail && onOpenVenueSettings && <button type="button" onClick={onOpenVenueSettings} className="underline font-semibold">in Venue</button>}
                    {data.hasNotificationEmail && onOpenEmailSettings && <button type="button" onClick={onOpenEmailSettings} className="underline font-semibold">in Email</button>}.
                  </span>
                </p>
              )}
            </div>
            <Toggle on={emailsOn} label="Email me alerts" disabled={updateAlerts.isPending}
              onChange={v => updateAlerts.mutate({ alertEmailsEnabled: v })} />
          </div>
          {emailsOn && (
            <div className="border-t border-stone-200 pt-4">
            <fieldset>
              <legend className="font-dm text-sm text-ink mb-2">Email me about</legend>
              <div className="space-y-1.5">
                {ALERT_KIND_LABELS.map(k => (
                  <label key={k.kind} className="flex items-center gap-2 cursor-pointer w-fit">
                    <input type="checkbox" className="w-4 h-4 accent-forest"
                      checked={data.alertEmailKinds[k.kind] !== false}
                      disabled={updateAlerts.isPending}
                      onChange={e => updateAlerts.mutate({ alertEmailKinds: { ...data.alertEmailKinds, [k.kind]: e.target.checked } })} />
                    <span className="font-dm text-sm text-stone-700">{k.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            </div>
          )}

          <div className="border-t border-stone-200 pt-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-semibold text-ink leading-tight">Enquiry waiting for a reply</h3>
              <p className="font-dm text-sm text-stone-700 mt-1">Alert me when a new enquiry has had no reply for this many business hours. Business hours are Monday to Saturday, 9am–6pm NZ time, so an enquiry that comes in overnight counts from 9am. Replying by email from VenueFlow, sending a proposal or changing its status all count as a reply.</p>
              <div className="mt-3 flex items-end gap-2">
                <div>
                  <label htmlFor={`${uid}-hours`} className={LABEL}>Business hours</label>
                  <Input id={`${uid}-hours`} type="number" inputMode="numeric" min={1} max={24} value={hours}
                    disabled={!data.replyOverdueEnabled}
                    onChange={e => setHours(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                    className={`${FIELD} w-24`} />
                </div>
                <button type="button" disabled={!data.replyOverdueEnabled || hours === data.replyOverdueHours || updateAlerts.isPending}
                  onClick={() => updateAlerts.mutate({ replyOverdueHours: hours })}
                  className="btn-forest px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary">
                  Save
                </button>
              </div>
            </div>
            <Toggle on={data.replyOverdueEnabled} label="Alert me when an enquiry is waiting for a reply" disabled={updateAlerts.isPending}
              onChange={v => updateAlerts.mutate({ replyOverdueEnabled: v })} />
          </div>
        </div>
      </section>

      {/* ── Automatic emails to clients ── */}
      <section aria-labelledby={`${uid}-seq`} className="space-y-3">
        <h2 id={`${uid}-seq`} className="font-bebas text-xs text-stone-600">Automatic emails to clients</h2>
        <p className="font-dm text-sm text-stone-700">Each one is off until you turn it on, and only applies to enquiries from that moment on. Each email goes once per enquiry, never two automatic emails within a day, and they stop as soon as the client replies, the enquiry moves on, or you stop them on the enquiry itself.</p>
        {!data.smtpConfigured && (
          <div className="flex items-start gap-2 p-3 rounded border font-dm text-sm" style={{ background: "#f7efdb", borderColor: "#e8d3a6", color: "#6b4a12" }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>These send from your own email account, which isn't set up yet — nothing will go out until it is.{" "}
              {onOpenEmailSettings && <button type="button" onClick={onOpenEmailSettings} className="underline font-semibold">Set up email</button>}
            </span>
          </div>
        )}
        <div className="space-y-4">
          {SEQUENCES.map(def => (
            <SequenceCard key={def.key} def={def} cfg={data.sequences[def.key as SequenceKey]} smtpConfigured={data.smtpConfigured} />
          ))}
        </div>
      </section>
    </div>
  );
}
