import React from "react";
import { toast } from "sonner";
import { CheckCircle, X, DollarSign, Clock, Link as LinkIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { currency } from "@/lib/money";

/**
 * "What now?" for an enquiry that has just become an event: request the
 * deposit, start the run sheet, send the client their portal link. Only the
 * steps that still apply are shown, a step that cannot work says why instead
 * of failing, and the whole strip can be dismissed per event (remembered in
 * this browser). Mounted in the event drawer and the phone enquiry panel.
 */

const STORE_KEY = "vf:nextSteps:dismissed:v1";
const readDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
};
const writeDismissed = (list: string[]) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-300))); } catch { /* private mode etc. */ }
};

const BTN = "flex-shrink-0 ml-7 min-h-[40px] px-3 rounded-sm border border-forest text-forest hover:bg-blue-50 transition-colors font-bebas tracking-widest text-xs disabled:opacity-50";

const DEPOSIT_REASON: Record<string, string> = {
  smtp_not_configured: "Email isn't set up yet (Settings → Email), so nothing was sent.",
  no_client_email: "There's no client email on this event.",
  no_deposit_set: "Set a deposit amount on the event first.",
  send_failed: "The email didn't send. Please try again.",
};

export default function EventNextSteps({ bookingId, leadId, leadStatus, onOpenRunsheet, onOpenSettings, className = "" }: {
  /** The event, when the drawer is showing a booking. */
  bookingId?: number | null;
  /** The enquiry, when the drawer is still showing the (just confirmed) enquiry. */
  leadId?: number | null;
  leadStatus?: string | null;
  /** Open the run sheet builder for this event (the host closes its panel). */
  onOpenRunsheet: (bookingId: number) => void;
  onOpenSettings?: () => void;
  className?: string;
}) {
  const { isStaff } = useAuth();
  const utils = trpc.useUtils();
  const [resolvedId, setResolvedId] = React.useState<number | null>(null);
  const [dismissed, setDismissed] = React.useState<string[]>(readDismissed);
  const [portalBusy, setPortalBusy] = React.useState(false);

  // An enquiry that is confirmed has (or is about to get) an event: find it.
  const ensure = trpc.bookings.ensureForLead.useMutation({
    onSuccess: (b: any) => setResolvedId(b?.id ?? null),
    onError: () => setResolvedId(null),
  });
  const leadIsEvent = ["booked", "confirmed"].includes(leadStatus ?? "");
  React.useEffect(() => {
    setResolvedId(null);
    if (!bookingId && leadId && leadIsEvent && !isStaff) ensure.mutate({ leadId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, leadId, leadIsEvent, isStaff]);
  const id = bookingId ?? resolvedId;

  const enabled = !!id && !isStaff;
  const { data: booking } = trpc.bookings.getById.useQuery({ id: id! }, { enabled });
  const { data: runsheets } = trpc.runsheets.list.useQuery({ bookingId: id! }, { enabled });
  const { data: portalLinks } = trpc.portal.list.useQuery({ bookingId: id! }, { enabled });
  const { data: venue } = trpc.venue.getOwn.useQuery(undefined, { enabled });

  const requestDeposit = trpc.payments.requestDeposit.useMutation({
    onSuccess: (d: any) => {
      if (d?.sent) {
        toast.success(`Deposit request emailed to ${d.to}`);
        utils.bookings.getById.invalidate({ id: id! });
        utils.payments.invalidate();
      } else {
        toast.error(DEPOSIT_REASON[d?.reason] ?? "Couldn't send the deposit request.");
      }
    },
    onError: () => toast.error("Couldn't send the deposit request."),
  });
  const createPortal = trpc.portal.create.useMutation();
  const emailPortal = trpc.portal.emailLink.useMutation();

  if (isStaff || !id || !booking || !runsheets || !portalLinks || !venue) return null;
  const key = `b${id}`;
  if (dismissed.includes(key)) return null;
  const b: any = booking;
  if (["cancelled", "finished"].includes(b.status)) return null;

  const smtpReady = !!((venue as any).smtpHost && (venue as any).smtpUser && (venue as any).smtpPass);
  const depositDue = b.depositRequired !== false && !b.depositPaid;
  const depositAmount = Number(b.depositNzd ?? 0);
  const noRunsheet = runsheets.length === 0;
  const noPortal = portalLinks.length === 0;
  if (!depositDue && !noRunsheet && !noPortal) return null;

  const depositBlock = !b.email ? DEPOSIT_REASON.no_client_email
    : depositAmount <= 0 ? DEPOSIT_REASON.no_deposit_set
    : !smtpReady ? DEPOSIT_REASON.smtp_not_configured : null;
  const requestedOn = b.depositRequestedAt
    ? new Date(b.depositRequestedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }) : null;

  const dismiss = () => {
    const next = [...dismissed, key];
    setDismissed(next);
    writeDismissed(next);
  };

  async function sendPortalLink() {
    setPortalBusy(true);
    try {
      const { token } = await createPortal.mutateAsync({
        bookingId: id!,
        clientName: `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim() || undefined,
        clientEmail: b.email || undefined,
      });
      utils.portal.list.invalidate({ bookingId: id! });
      const url = `${window.location.origin}/portal/${token}`;
      const copy = async () => { try { await navigator.clipboard.writeText(url); return true; } catch { return false; } };
      if (!b.email) {
        toast.warning(`Link created${await copy() ? " and copied" : ""}. There's no client email on this event, so send it yourself.`);
      } else if (!smtpReady) {
        toast.warning(`Link created${await copy() ? " and copied" : ""}. Email isn't set up yet (Settings → Email), so paste it into your own email.`);
      } else {
        const links = await utils.portal.list.fetch({ bookingId: id! });
        const row = links.find((l: any) => l.token === token);
        const r: any = row ? await emailPortal.mutateAsync({ id: row.id }) : null;
        if (r?.emailSent) toast.success(`Portal link emailed to ${r.to}`);
        else toast.warning(`Link created${await copy() ? " and copied" : ""}. The email didn't send, so paste it into your own email.`);
      }
    } catch {
      toast.error("Couldn't create the portal link. Please try again.");
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <section aria-label="Next steps for this event" className={`border border-gold/40 bg-white ${className}`}>
      <div className="flex items-center justify-between gap-2 bg-forest-dark px-3 py-1.5">
        <h3 className="font-bebas tracking-widest text-xs text-cream flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-gold" aria-hidden /> NEXT STEPS
        </h3>
        <button type="button" onClick={dismiss} aria-label="Hide next steps for this event" title="Hide these"
          className="text-cream opacity-85 hover:opacity-100 p-1 -mr-1 rounded-sm">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="divide-y divide-gold/15">
        {depositDue && (
          <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
            <DollarSign className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" aria-hidden />
            <div className="min-w-[10rem] flex-1">
              <div className="font-dm text-sm text-ink">
                {depositAmount > 0 ? `Deposit of ${currency(depositAmount)} not paid yet` : "Deposit not paid yet"}
              </div>
              <div className="font-dm text-xs text-ink/70">
                {depositBlock ?? (requestedOn ? `Requested ${requestedOn}. You can send it again.` : "Email the client how to pay it.")}
              </div>
              {depositBlock === DEPOSIT_REASON.smtp_not_configured && onOpenSettings && (
                <button type="button" onClick={onOpenSettings}
                  className="mt-1 font-dm text-xs font-semibold text-forest underline underline-offset-2 hover:no-underline">Open email settings</button>
              )}
            </div>
            <button type="button" className={BTN} disabled={!!depositBlock || requestDeposit.isPending}
              onClick={() => requestDeposit.mutate({ bookingId: id })}>
              {requestDeposit.isPending ? "SENDING…" : requestedOn ? "SEND AGAIN" : "REQUEST DEPOSIT"}
            </button>
          </li>
        )}
        {noRunsheet && (
          <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
            <Clock className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" aria-hidden />
            <div className="min-w-[10rem] flex-1">
              <div className="font-dm text-sm text-ink">No run sheet yet</div>
              <div className="font-dm text-xs text-ink/70">Times, food and drinks for the day.</div>
            </div>
            <button type="button" className={BTN} onClick={() => onOpenRunsheet(id)}>CREATE RUN SHEET</button>
          </li>
        )}
        {noPortal && (
          <li className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
            <LinkIcon className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" aria-hidden />
            <div className="min-w-[10rem] flex-1">
              <div className="font-dm text-sm text-ink">Client hasn't got their portal link</div>
              <div className="font-dm text-xs text-ink/70">
                {!b.email ? "No client email, so the link is copied for you to send."
                  : !smtpReady ? "Email isn't set up yet (Settings → Email), so the link is copied for you to send."
                  : "They can see their balance and details any time."}
              </div>
            </div>
            <button type="button" className={BTN} disabled={portalBusy} onClick={sendPortalLink}>
              {portalBusy ? "WORKING…" : b.email && smtpReady ? "SEND PORTAL LINK" : "COPY PORTAL LINK"}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
