import { useEffect, useId, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, Inbox } from "lucide-react";
import { timeAgo } from "@/components/LeadConversation";

/**
 * Settings → Email → "Email inbox": a read-only IMAP connection so client
 * replies land on the enquiry (server/inbox.ts polls it every few minutes).
 * The saved password is never sent back to the browser — leave the field
 * blank to keep it.
 */

const FIELD = "rounded-none border border-gold bg-white font-dm text-sm focus-visible:ring-0 focus-visible:border-forest focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2f5488]";
const LABEL = "font-bebas text-xs tracking-widest text-sage block mb-1";

type Form = { enabled: boolean; host: string; port: string; secure: boolean; user: string; pass: string; folder: string; useSmtpPassword: boolean };
type TestResult = { ok: true; messages: number; folder: string } | { ok: false; message: string };

export default function InboxSettingsCard() {
  const utils = trpc.useUtils();
  const uid = useId();
  const { data: s, isLoading } = trpc.inbox.getSettings.useQuery(undefined, { retry: false });
  const [form, setForm] = useState<Form>({ enabled: false, host: "", port: "993", secure: true, user: "", pass: "", folder: "INBOX", useSmtpPassword: false });
  const [test, setTest] = useState<TestResult | null>(null);

  useEffect(() => {
    if (!s) return;
    setForm({ enabled: s.enabled, host: s.host, port: String(s.port ?? 993), secure: s.secure, user: s.user, pass: "", folder: s.folder || "INBOX", useSmtpPassword: false });
  }, [s?.enabled, s?.host, s?.port, s?.secure, s?.user, s?.folder]);

  const set = (patch: Partial<Form>) => { setForm(f => ({ ...f, ...patch })); setTest(null); };
  const payload = () => ({
    host: form.host.trim(),
    port: Math.min(65535, Math.max(1, parseInt(form.port, 10) || 993)),
    secure: form.secure,
    user: form.user.trim(),
    pass: form.pass || undefined,
    useSmtpPassword: form.useSmtpPassword || undefined,
    folder: form.folder.trim() || "INBOX",
  });

  const save = trpc.inbox.saveSettings.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(vars.enabled ? "Saved. VenueFlow will check this inbox every few minutes." : "Inbox settings saved");
      setTest(null);
      setForm(f => ({ ...f, pass: "", useSmtpPassword: false }));
      utils.inbox.getSettings.invalidate();
    },
    onError: (e) => toast.error(e.message || "Couldn't save the inbox settings"),
  });
  const testConn = trpc.inbox.testConnection.useMutation({
    onSuccess: (r) => setTest(r as TestResult),
    onError: (e) => setTest({ ok: false, message: e.message || "Couldn't test the connection" }),
  });
  const checkNow = trpc.inbox.checkNow.useMutation({
    onSuccess: (r) => {
      if (r.ok) toast.success(r.stored ? `Found ${r.stored} new client ${r.stored === 1 ? "reply" : "replies"}` : "Checked — no new client replies");
      else toast.error(r.message);
      utils.inbox.invalidate();
    },
    onError: (e) => toast.error(e.message || "Couldn't check the inbox"),
  });

  if (isLoading) return null;
  if (!s) return null; // e.g. a team link — only the owner manages the inbox

  const hasPassword = form.useSmtpPassword || !!form.pass || (s.hasPassword && form.host.trim().toLowerCase() === s.host.toLowerCase() && form.user.trim().toLowerCase() === s.user.toLowerCase());
  const dirty = form.enabled !== s.enabled || form.host !== s.host || form.port !== String(s.port) || form.secure !== s.secure
    || form.user !== s.user || form.folder !== (s.folder || "INBOX") || !!form.pass || form.useSmtpPassword;
  const status = !s.enabled
    ? { tone: "off" as const, text: "Off" }
    : s.lastError
      ? { tone: "bad" as const, text: "Needs attention" }
      : { tone: "good" as const, text: "Connected" };

  return (
    <section aria-labelledby={`${uid}-h`} className="mt-8 dante-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 id={`${uid}-h`} className="font-cormorant text-xl font-semibold text-ink flex items-center gap-2">
            <Inbox className="w-5 h-5 text-forest" aria-hidden="true" /> Email inbox
          </h2>
          <p className="font-dm text-xs text-stone-700 mt-1 max-w-prose">
            Connect the mailbox your clients reply to. Every few minutes VenueFlow looks for replies to your enquiries and adds them to the enquiry,
            so the whole conversation is in one place. It only reads: nothing in your inbox is moved, deleted or marked as read.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 font-bebas tracking-widest text-[11px] px-2 py-0.5 rounded-full ${
          status.tone === "good" ? "bg-green-50 text-green-800" : status.tone === "bad" ? "bg-red-50 text-red-800" : "bg-stone-100 text-stone-700"}`}>
          {status.tone === "good" ? <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> : status.tone === "bad" ? <AlertTriangle className="w-3 h-3" aria-hidden="true" /> : null}
          {status.text.toUpperCase()}
        </span>
      </div>

      {s.enabled && (
        <p className={`font-dm text-xs mt-3 p-2 border ${s.lastError ? "text-red-800 bg-red-50 border-red-200" : "text-stone-700 bg-linen border-stone-200"}`} role={s.lastError ? "alert" : undefined}>
          {s.lastError
            ? <>Last check failed: {s.lastError}</>
            : s.lastCheckedAt ? <>Last checked {timeAgo(s.lastCheckedAt)}.</> : <>Waiting for the first check (within a few minutes).</>}
        </p>
      )}

      {s.smtp && (
        <button type="button"
          onClick={() => set({ host: s.smtp!.host || form.host, port: "993", secure: true, user: s.smtp!.user, pass: "", useSmtpPassword: s.smtp!.hasPassword })}
          className="mt-4 font-bebas tracking-widest text-xs px-4 py-2 border border-forest text-forest hover:bg-sage-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2f5488]">
          USE THE SAME LOGIN AS OUTGOING EMAIL
        </button>
      )}

      <form className="grid sm:grid-cols-2 gap-4 mt-4" onSubmit={e => { e.preventDefault(); save.mutate({ ...payload(), enabled: form.enabled }); }}>
        <div>
          <label htmlFor={`${uid}-host`} className={LABEL}>INCOMING MAIL SERVER (IMAP)</label>
          <Input id={`${uid}-host`} value={form.host} onChange={e => set({ host: e.target.value })} placeholder="imap.gmail.com" autoComplete="off" spellCheck={false} className={FIELD} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label htmlFor={`${uid}-port`} className={LABEL}>PORT</label>
            <Input id={`${uid}-port`} type="number" inputMode="numeric" value={form.port} onChange={e => set({ port: e.target.value })} placeholder="993" className={FIELD} />
          </div>
          <label className="flex items-center gap-2 pb-2.5 font-dm text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={form.secure} onChange={e => set({ secure: e.target.checked })} className="w-4 h-4 accent-forest" />
            Use SSL
          </label>
        </div>
        <div>
          <label htmlFor={`${uid}-user`} className={LABEL}>USERNAME (YOUR EMAIL ADDRESS)</label>
          <Input id={`${uid}-user`} value={form.user} onChange={e => set({ user: e.target.value, useSmtpPassword: false })} placeholder="events@yourvenue.co.nz" autoComplete="off" spellCheck={false} className={FIELD} />
        </div>
        <div>
          <label htmlFor={`${uid}-pass`} className={LABEL}>PASSWORD (APP PASSWORD)</label>
          <Input id={`${uid}-pass`} type="password" value={form.pass} autoComplete="new-password"
            onChange={e => set({ pass: e.target.value, useSmtpPassword: false })}
            placeholder={form.useSmtpPassword ? "Using your outgoing email password" : s.hasPassword ? "Saved — leave blank to keep it" : "xxxx xxxx xxxx xxxx"}
            aria-describedby={`${uid}-help`} className={FIELD} />
        </div>
        <div>
          <label htmlFor={`${uid}-folder`} className={LABEL}>FOLDER</label>
          <Input id={`${uid}-folder`} value={form.folder} onChange={e => set({ folder: e.target.value })} placeholder="INBOX" spellCheck={false} className={FIELD} />
        </div>
        <div className="flex items-end">
          <button type="button" aria-pressed={form.enabled} onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
            className="flex items-center gap-3 font-dm text-sm text-ink py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f5488] rounded">
            <span aria-hidden="true" className={`relative inline-block w-10 h-6 rounded-full transition-colors ${form.enabled ? "bg-forest" : "bg-stone-300"}`}>
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.enabled ? "left-5" : "left-1"}`} />
            </span>
            Check this inbox for client replies
            <span className="font-bebas tracking-widest text-xs text-stone-700">{form.enabled ? "ON" : "OFF"}</span>
          </button>
        </div>

        <p id={`${uid}-help`} className="sm:col-span-2 font-dm text-xs text-stone-700 bg-linen border border-stone-200 p-3 leading-relaxed">
          <strong>Gmail and Outlook need an app password</strong>, not your normal one. For Gmail, create one at myaccount.google.com → Security →
          App passwords (server imap.gmail.com). Outlook uses outlook.office365.com; some Microsoft 365 accounts block this kind of sign-in, so if the
          test fails, ask whoever manages your email. Port 993 with SSL on suits most providers.
        </p>

        {test && (
          <div role="status" className={`sm:col-span-2 font-dm text-sm p-3 border flex items-start gap-2 ${test.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {test.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />}
            <span>{test.ok
              ? <>Connected. Signed in and found “{test.folder}” ({test.messages.toLocaleString("en-NZ")} {test.messages === 1 ? "email" : "emails"}).{!s.enabled || dirty ? " Save to start checking it." : ""}</>
              : test.message}</span>
          </div>
        )}
        {!test && <div className="sr-only" role="status" aria-live="polite">{testConn.isPending ? "Testing the connection…" : ""}</div>}

        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={save.isPending || !dirty}
            className="btn-forest font-bebas tracking-widest text-sm px-6 py-3 text-cream disabled:opacity-50">
            {save.isPending ? "SAVING…" : "SAVE INBOX SETTINGS"}
          </button>
          <button type="button" disabled={testConn.isPending || !form.host.trim() || !form.user.trim() || !hasPassword}
            onClick={() => { setTest(null); testConn.mutate(payload()); }}
            className="font-bebas tracking-widest text-sm px-6 py-3 border border-gold text-ink hover:bg-linen transition-colors disabled:opacity-50">
            {testConn.isPending ? "TESTING…" : "TEST CONNECTION"}
          </button>
          {s.connected && !dirty && (
            <button type="button" disabled={checkNow.isPending} onClick={() => checkNow.mutate()}
              className="font-bebas tracking-widest text-sm px-6 py-3 border border-gold text-ink hover:bg-linen transition-colors disabled:opacity-50">
              {checkNow.isPending ? "CHECKING…" : "CHECK NOW"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
