import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, KeyRound, Trash2 } from "lucide-react";

/**
 * Settings → Team → Account Logins.
 *
 * Lets the workspace owner add email/password logins that share their data.
 * Each login is its own user row with `workspaceOwnerId` pointing at the
 * current admin, so when they sign in the session is issued for the owner
 * and every existing data query (all scoped by ctx.user.id) just works.
 */
export function AccountLoginsSection() {
  const utils = trpc.useUtils();
  const { data: logins, isLoading } = trpc.accountLogins.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetForId, setResetForId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createLogin = trpc.accountLogins.create.useMutation({
    onSuccess: () => {
      toast.success("Login created");
      setName(""); setEmail(""); setPassword(""); setShowForm(false);
      utils.accountLogins.list.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Failed to create login"),
  });
  const setPasswordMutation = trpc.accountLogins.setPassword.useMutation({
    onSuccess: () => {
      toast.success("Password updated");
      setResetForId(null); setResetPassword("");
    },
    onError: (e) => toast.error(e.message ?? "Failed to update password"),
  });
  const deleteLogin = trpc.accountLogins.delete.useMutation({
    onSuccess: () => {
      toast.success("Login removed");
      utils.accountLogins.list.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Failed to remove login"),
  });

  const canCreate = name.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  return (
    <div className="dante-card mb-6">
      <div className="p-5 border-b border-gold/20 flex items-center justify-between">
        <div>
          <h2 className="font-bebas tracking-widest text-base text-ink">ACCOUNT LOGINS</h2>
          <p className="font-dm text-xs text-ink/50 mt-1">
            Email + password logins that share your workspace. They see and edit the same bookings, leads, and settings as you.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 text-cream flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> {showForm ? 'CANCEL' : 'ADD LOGIN'}
        </button>
      </div>

      {showForm && (
        <div className="p-5 border-b border-gold/20 bg-linen/40 space-y-3">
          <div>
            <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">NAME *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sarah Jones"
              className="w-full border border-gold/30 px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
            />
          </div>
          <div>
            <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">EMAIL *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="sarah@venue.co.nz"
              autoComplete="off"
              className="w-full border border-gold/30 px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
            />
          </div>
          <div>
            <label className="font-bebas tracking-widest text-[10px] text-ink/40 block mb-1">PASSWORD * (MIN 8 CHARS)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Choose a password"
              autoComplete="new-password"
              className="w-full border border-gold/30 px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white"
            />
            <p className="font-dm text-[11px] text-ink/40 mt-1">Share this with them privately. You can change it later.</p>
          </div>
          <div className="pt-1">
            <button
              onClick={() => createLogin.mutate({ name: name.trim(), email: email.trim(), password })}
              disabled={!canCreate || createLogin.isPending}
              className="btn-forest text-cream font-bebas tracking-widest text-xs px-5 py-2 disabled:opacity-50"
            >
              {createLogin.isPending ? 'CREATING…' : 'CREATE LOGIN'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-5 text-sm font-dm text-ink/50">Loading…</div>
      ) : !logins || logins.length === 0 ? (
        <div className="p-8 text-center">
          <p className="font-dm text-sage text-sm">No extra logins yet. Add one so a colleague can sign in alongside you.</p>
        </div>
      ) : (
        <div className="divide-y divide-gold/20">
          {logins.map(login => (
            <div key={login.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-dm text-sm font-semibold text-ink truncate">{login.name ?? '(no name)'}</div>
                  <div className="font-dm text-xs text-ink/50 truncate">{login.email}</div>
                  {login.lastSignedIn && (
                    <div className="font-dm text-[11px] text-ink/40 mt-0.5">
                      Last sign in: {new Date(login.lastSignedIn).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setResetForId(login.id); setResetPassword(""); }}
                    className="font-bebas tracking-widest text-[10px] px-3 py-1.5 border border-gold/30 text-ink/70 hover:bg-linen flex items-center gap-1"
                    title="Reset password"
                  >
                    <KeyRound className="w-3 h-3" /> RESET PW
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove login for ${login.email}?`)) deleteLogin.mutate({ id: login.id }); }}
                    className="font-bebas tracking-widest text-[10px] px-3 py-1.5 border border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1"
                    title="Remove login"
                  >
                    <Trash2 className="w-3 h-3" /> REMOVE
                  </button>
                </div>
              </div>
              {resetForId === login.id && (
                <div className="mt-3 pt-3 border-t border-gold/20 flex items-center gap-2">
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    autoComplete="new-password"
                    className="flex-1 border border-gold/30 px-3 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white"
                    autoFocus
                  />
                  <button
                    onClick={() => setPasswordMutation.mutate({ id: login.id, password: resetPassword })}
                    disabled={resetPassword.length < 8 || setPasswordMutation.isPending}
                    className="btn-forest text-cream font-bebas tracking-widest text-[10px] px-4 py-1.5 disabled:opacity-50"
                  >
                    {setPasswordMutation.isPending ? 'SAVING…' : 'SAVE'}
                  </button>
                  <button
                    onClick={() => { setResetForId(null); setResetPassword(""); }}
                    className="font-bebas tracking-widest text-[10px] px-4 py-1.5 border border-gold/30 text-ink/60 hover:bg-linen"
                  >
                    CANCEL
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
