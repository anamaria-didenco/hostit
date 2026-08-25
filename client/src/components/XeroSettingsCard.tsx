import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, Link2, Unlink } from "lucide-react";

/**
 * Settings → Integrations card for Xero.
 * States: not configured (env keys missing) → connect → connected (+ mapping).
 * The OAuth flow is a full-page redirect: /api/xero/connect → Xero consent →
 * /api/xero/callback → back here with ?xero=connected|error.
 */
export default function XeroSettingsCard() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.xero.status.useQuery();
  const [accountCode, setAccountCode] = useState("");
  const [inclusive, setInclusive] = useState(true);

  useEffect(() => {
    if (status?.connected) {
      setAccountCode(status.salesAccountCode ?? "200");
      setInclusive(status.lineAmountsInclusive ?? true);
    }
  }, [status?.connected]);

  // Revenue accounts from the org's REAL chart — "200" is only the default for
  // Xero's stock NZ chart and may not be how this venue tracks income.
  const { data: accounts } = trpc.xero.accounts.useQuery(undefined, { enabled: !!status?.connected });
  const selectOrg = trpc.xero.selectOrganisation.useMutation({
    onSuccess: (r) => { toast.success(`Now invoicing into ${r.tenantName}`); utils.xero.status.invalidate(); },
    onError: (e) => toast.error(e.message || "Could not select that organisation"),
  });

  // Toast the result of the OAuth round-trip exactly once, then clean the URL.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const result = sp.get("xero");
    if (!result) return;
    if (result === "connected") toast.success("Xero connected");
    else if (result === "choose") toast.info("Pick which Xero organisation to invoice");
    else toast.error(sp.get("xeroMsg") || "Xero connection failed");
    sp.delete("xero"); sp.delete("xeroMsg");
    const qs = sp.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    utils.xero.status.invalidate();
  }, []);

  const saveMapping = trpc.xero.saveMapping.useMutation({
    onSuccess: () => { toast.success("Xero settings saved"); utils.xero.status.invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to save"),
  });
  const disconnect = trpc.xero.disconnect.useMutation({
    onSuccess: () => { toast.success("Xero disconnected"); utils.xero.status.invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to disconnect"),
  });

  return (
    <div className="dante-card p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">💼</span>
          <div>
            <div className="font-cormorant font-semibold text-base text-ink flex items-center gap-2">
              Xero
              {status?.connected && (
                <span className="inline-flex items-center gap-1 font-bebas tracking-widest text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" /> CONNECTED
                </span>
              )}
            </div>
            <div className="font-dm text-xs text-ink/60">
              {isLoading ? "Checking connection…"
                : !status?.configured ? "Needs XERO_CLIENT_ID + XERO_CLIENT_SECRET set on the server (developer.xero.com app)."
                : status?.connected ? <>Sending draft invoices to <b>{status.tenantName ?? "your Xero organisation"}</b>. Drafts are approved inside Xero before clients see them.</>
                : "Send event invoices (food & drinks) straight to Xero as drafts."}
            </div>
          </div>
        </div>
        {status?.configured && !status?.connected && (
          <a href="/api/xero/connect"
            className="font-bebas tracking-widest text-xs px-4 py-2 bg-forest text-cream hover:opacity-90 inline-flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> CONNECT XERO
          </a>
        )}
        {status?.connected && (
          <button
            onClick={() => { if (confirm("Disconnect Xero? Already-sent invoices stay in Xero; you just won't be able to push new ones until you reconnect.")) disconnect.mutate(); }}
            disabled={disconnect.isPending}
            className="font-bebas tracking-widest text-xs px-3 py-2 border border-gold/30 text-ink/70 hover:bg-gold/10 inline-flex items-center gap-1.5 disabled:opacity-50">
            <Unlink className="w-3.5 h-3.5" /> DISCONNECT
          </button>
        )}
      </div>

      {/* Live-update state. With the webhook key set, approving an invoice in
          Xero reaches the Payments board in seconds; without it, on the next
          sync (board open, or hourly). */}
      {status?.connected && (
        <div className={`mt-3 font-dm text-xs p-2 border ${status?.webhookConfigured
          ? "text-green-800 bg-green-50 border-green-200"
          : "text-ink/60 bg-linen/50 border-gold/20"}`}>
          {status?.webhookConfigured ? (
            <>⚡ <b>Instant updates are on.</b> Approvals and payments in Xero reach the Payments board within seconds.</>
          ) : (
            <>Updates from Xero arrive when the Payments board opens, and hourly in the background. For instant updates, add a webhook on your Xero app
              (developer.xero.com → your app → Webhooks): set the Delivery URL to <b>{`${window.location.origin}/api/xero/webhook`}</b>, tick <b>Invoices</b>,
              then copy the Webhooks key into the server env as <b>XERO_WEBHOOK_KEY</b> and press &ldquo;Send intent to receive&rdquo;.</>
          )}
        </div>
      )}

      {/* Organisation choice — never auto-pick. Xero does not guarantee the
          ordering of the connections list, so an implicit choice can silently
          invoice the wrong company. */}
      {(status?.needsOrgChoice || (status?.organisations?.length ?? 0) > 1) && (
        <div className="mt-4 pt-4 border-t border-gold/15">
          <div className="font-bebas tracking-widest text-[10px] text-ink/70 mb-1.5">
            {status?.needsOrgChoice ? "CHOOSE THE ORGANISATION TO INVOICE" : "ORGANISATION"}
          </div>
          {status?.needsOrgChoice && (
            <p className="font-dm text-xs text-amber-800 bg-amber-50 border border-amber-300 p-2 mb-2">
              Your Xero login has access to more than one organisation. Pick the one VenueFlow should
              invoice into — nothing is sent until you choose.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(status?.organisations ?? []).map(o => (
              <button key={o.tenantId} onClick={() => selectOrg.mutate({ tenantId: o.tenantId })}
                disabled={selectOrg.isPending}
                className={`font-bebas tracking-widest text-[11px] px-3 py-2 border transition-colors disabled:opacity-50 ${
                  o.tenantId === status?.tenantId ? "bg-forest text-cream border-forest" : "border-gold/30 text-ink/70 hover:bg-gold/10"}`}>
                {o.tenantName}{o.tenantId === status?.tenantId ? " ✓" : ""}
              </button>
            ))}
          </div>
          {(status?.organisations?.length ?? 0) > 1 && (
            <p className="font-dm text-[11px] text-ink/60 mt-2">
              Tip: once testing is done, remove VenueFlowHQ from the organisations you don't invoice
              (Xero → Settings → Connected apps) so there's no ambiguity.
            </p>
          )}
        </div>
      )}

      {status?.tenantMissing && (
        <div className="mt-3 font-dm text-xs text-red-700 bg-red-50 border border-red-300 p-2">
          The selected organisation is no longer authorised in Xero. Reconnect before sending invoices.
        </div>
      )}

      {status?.connected && (
        <div className="mt-4 pt-4 border-t border-gold/15 flex items-end gap-4 flex-wrap">
          <div>
            <label htmlFor="xero-account-code" className="font-bebas tracking-widest text-[10px] text-ink/70 block mb-1">SALES ACCOUNT CODE</label>
            {accounts && accounts.length > 0 ? (
              <select id="xero-account-code" value={accountCode}
                onChange={e => setAccountCode(e.target.value)}
                className="border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest max-w-[240px]">
                {!accounts.some(a => a.code === accountCode) && <option value={accountCode}>{accountCode} (not in chart)</option>}
                {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            ) : (
              <input id="xero-account-code" value={accountCode}
                onChange={e => setAccountCode(e.target.value)}
                placeholder="200"
                className="w-28 border border-gold/30 px-3 py-2 font-dm text-sm text-ink bg-white focus:outline-none focus:border-forest" />
            )}
          </div>
          <label className="flex items-center gap-2 font-dm text-sm text-ink pb-2 cursor-pointer">
            <input type="checkbox" checked={inclusive} onChange={e => setInclusive(e.target.checked)} />
            Amounts are GST-inclusive
          </label>
          <button
            onClick={() => saveMapping.mutate({ salesAccountCode: accountCode.trim() || "200", lineAmountsInclusive: inclusive })}
            disabled={saveMapping.isPending}
            className="font-bebas tracking-widest text-xs px-4 py-2 border border-forest/40 text-forest hover:bg-forest/5 disabled:opacity-50">
            {saveMapping.isPending ? "SAVING…" : "SAVE"}
          </button>
        </div>
      )}
    </div>
  );
}
