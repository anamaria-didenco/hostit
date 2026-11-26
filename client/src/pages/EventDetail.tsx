import BookingInvoices from "@/components/BookingInvoices";
import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { SpacesMultiSelect } from "@/components/SpacesMultiSelect";
import { invalidateMoney } from "@/lib/invalidateMoney";
import { useFoodRescaleOffer } from "@/hooks/useFoodRescaleOffer";
import { showCascadedToast } from "@/lib/cascadedToast";
import { ClashDialogHost, promptClashOverride } from "@/components/ClashDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileText, DollarSign, Mail, Edit3, Save, X, Printer,
  ClipboardList, LayoutGrid, MessageSquare, Package, Layers,
  Link2, PenLine, Plus, Trash2, Eye,
  Link as LinkIcon
} from "lucide-react";
import { COLOR_PRESETS, parseCustomStatuses } from "@/components/StatusManager";
import { fmtEventTime, extractEventTimeHHMM, toLocalDateInput, combineLocalDateTime } from "@/lib/dateTime";
import EventSpendSection from "@/components/EventSpendSection";
import { downloadBeo } from "@/lib/beoUrl";
import BeoPreviewOverlay from "@/components/BeoPreviewOverlay";
import { currency, currencyWhole } from "@/lib/money";
import NoTotalSet from "@/components/NoTotalSet";
import { pageTitle } from "@shared/pageTitle";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import LeadProposals from "@/components/LeadProposals";
import LinkedTasks from "@/components/LinkedTasks";
import RecordPaymentButton from "@/components/RecordPaymentDialog";
import ClientSubmissionPanel from "@/components/ClientSubmissionPanel";
import { savedToastLabel } from "@/lib/editToast";
import { scrollBehavior } from "@/lib/scrollBehavior";
import {
  Card, SectionHead, Signal, Callout, FactsBand, PrepList, PaidBar, SIG,
  BTN_OUTLINE, BTN_PRIMARY, BTN_SM, FIELD_LABEL, initialsOf, relDays,
  type CalloutData, type PrepItem, type SigTone,
} from "@/components/EventDetailParts";

const EVENT_TYPES = [
  "Wedding", "Corporate", "Birthday", "Engagement", "Cocktail Party",
  "Christmas Party", "Gala Dinner", "Product Launch", "Conference",
  "Baby Shower", "Hen's Party", "Fundraiser", "Other"
];

// Booking status → its one signal colour. Red is kept for overdue/clash only.
const STATUS_TONE: Record<string, SigTone> = {
  confirmed: "green", finished: "green", tentative: "amber", cancelled: "gray",
};

// The edit form's values for a booking. Also kept as the baseline that Save
// diffs against, so only fields the user actually touched are sent.
function formFromBooking(booking: any) {
  return {
    firstName: booking.firstName ?? "",
    lastName: booking.lastName ?? "",
    email: booking.email ?? "",
    eventType: booking.eventType ?? "",
    eventDate: booking.eventDate ? toLocalDateInput(booking.eventDate) : "",
    eventTime: booking.eventDate ? extractEventTimeHHMM(booking.eventDate) : "",
    eventEndDate: booking.eventEndDate ? toLocalDateInput(booking.eventEndDate) : "",
    eventEndTime: booking.eventEndDate ? extractEventTimeHHMM(booking.eventEndDate) : "",
    guestCount: booking.guestCount ?? "",
    spaceName: booking.spaceName ?? "",
    totalNzd: booking.totalNzd ?? "",
    depositNzd: booking.depositNzd ?? "",
    depositPaid: booking.depositPaid ?? false,
    status: booking.status ?? "confirmed",
    notes: booking.notes ?? "",
  };
}

const nzDay = (d: Date | string | number) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

export default function EventDetail() {
  const [, params] = useRoute("/event/:id");
  const [, setLocation] = useLocation();
  const { user, loading, isStaff } = useAuth();
  const bookingId = params?.id ? parseInt(params.id) : 0;

  const [editing, setEditing] = useState(false);
  const [beoPreviewOpen, setBeoPreviewOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const [baseline, setBaseline] = useState<any>({});
  const filledForId = useRef<number | null>(null);
  // The module tabs' selection lives here so the header's "Client portal"
  // button can open that tab. ?tab= still picks the first one.
  const [moduleTab, setModuleTab] = useState(() => new URLSearchParams(window.location.search).get('tab') ?? 'comms');
  const tabsRef = useRef<HTMLDivElement | null>(null);

  const utils = trpc.useUtils();
  const { data: booking, isLoading, isError, refetch, isFetching } = trpc.bookings.getById.useQuery(
    { id: bookingId },
    { enabled: !!user?.id && bookingId > 0 }
  );
  const { data: spaces } = trpc.spaces.list.useQuery(undefined, { enabled: !!user?.id });
  const { data: payments } = trpc.payments.list.useQuery(
    { bookingId },
    { enabled: !!user?.id && bookingId > 0 }
  );
  // Use the server-side summary so refunds, deposit status and outstanding
  // are computed exactly the same way as the Payment Tracker page.
  const { data: paymentSummary } = trpc.payments.summary.useQuery(
    { bookingId },
    { enabled: !!user?.id && bookingId > 0 }
  );
  const { data: existingRunsheets } = trpc.runsheets.list.useQuery(
    { bookingId },
    { enabled: !!user?.id && bookingId > 0 }
  );
  const existingRunsheet = existingRunsheets?.[0] ?? null;
  // The event's one checklist (the run sheet's), for the prep list's "n of m".
  const { data: eventChecklist } = trpc.checklists.getForBooking.useQuery(
    { bookingId },
    { enabled: !!user?.id && bookingId > 0 }
  );

  const { data: venueSettings } = trpc.venue.get.useQuery({}, { enabled: !!user?.id });
  const pipelineStages = useMemo(() => {
    const defs = parseCustomStatuses((venueSettings as any)?.customStatuses);
    return defs.map(d => {
      const preset = COLOR_PRESETS.find(c => c.id === d.colorId) ?? COLOR_PRESETS[0];
      return { key: d.key, label: d.label, color: preset.classes, swatch: preset.swatch };
    });
  }, [venueSettings]);
  const getStatusInfo = (key: string) => {
    return pipelineStages.find(p => p.key === key) ?? {
      key, label: (key ?? '').replace(/_/g, ' '), color: 'border-gray-400 bg-gray-100 text-gray-700', swatch: '#9ca3af',
    };
  };

  // A guest change reaches the run sheet; offer to update its food too.
  const offerFoodRescale = useFoodRescaleOffer();
  const updateBooking = trpc.bookings.update.useMutation({
    onSuccess: (data, vars) => {
      // Total / deposit / stream-status edits move the money figures on every
      // other screen (Dashboard tiles, Payments board, Reports), so refresh them
      // all, not just this event.
      invalidateMoney(utils);
      // A save over a clash flags it as double-booked; a move can clear one.
      utils.bookings.clashes.invalidate();
      setEditing(false);
      if (vars.guestCount !== undefined && offerFoodRescale(data, { bookingId })) return;
      // Name the one thing that changed ("Date saved"); several say "Event updated".
      toast.success(savedToastLabel(vars) ?? "Event updated");
      showCascadedToast(data);
    },
    onError: (e, vars) => {
      // Date/space already taken → "Save anyway?" instead of a dead-end error.
      if (promptClashOverride(e, () => updateBooking.mutate({ ...vars, allowClash: true }), { confirmLabel: "Save anyway" })) return;
      toast.error(e.message ?? "Failed to update event");
    },
  });

  const getBeoToken = trpc.bookings.getOrCreateBeoToken.useMutation({
    onSuccess: async ({ token }) => {
      const url = `${window.location.origin}/api/beo/public/${token}`;
      try { await navigator.clipboard.writeText(url); toast.success("Live event pack link copied to clipboard"); }
      catch { toast.success(`Live link: ${url}`); }
      utils.bookings.getById.invalidate({ id: bookingId });
    },
    onError: (e) => toast.error(e.message ?? "Failed to create link"),
  });

  const revokeBeoToken = trpc.bookings.revokeBeoToken.useMutation({
    onSuccess: () => {
      toast.success("Old link revoked — generate a new one to share again");
      utils.bookings.getById.invalidate({ id: bookingId });
    },
    onError: (e) => toast.error(e.message ?? "Failed to revoke"),
  });

  // Re-fill the form from the latest booking only while not editing (or when
  // it's a different event) — a refetch mid-edit must not wipe what's typed.
  useEffect(() => {
    if (!booking) return;
    if (editing && filledForId.current === booking.id) return;
    const f = formFromBooking(booking);
    setForm(f);
    setBaseline(f);
    filledForId.current = booking.id;
  }, [booking, editing]);
  useDocumentTitle(booking ? pageTitle(["Event", `${booking.firstName ?? ""} ${booking.lastName ?? ""}`, booking.eventType]) : null);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">Loading event…</div>
      </div>
    );
  }

  // A failed load isn't "not found" — offer a retry instead.
  if (!booking && isError) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4 text-center font-sans">
        <h1 className="text-[24px] font-semibold text-foreground">Couldn't load this event</h1>
        <p className="text-[14px] text-muted-foreground">Check your connection and try again.</p>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} disabled={isFetching} className={BTN_PRIMARY}>
            {isFetching ? "Trying…" : "Try again"}
          </button>
          <Link href="/dashboard" className={BTN_OUTLINE}>Back to dashboard</Link>
        </div>
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 font-sans">
        <h1 className="text-[24px] font-semibold text-foreground">Event not found</h1>
        <Link href="/dashboard" className={BTN_PRIMARY}>Back to dashboard</Link>
      </main>
    );
  }

  // Prefer the canonical server summary (handles refunds correctly).
  // Falls back to a refund-aware client calc until the query lands.
  const totalPaid = paymentSummary?.totalPaid ?? (payments ?? []).reduce(
    (s: number, p: any) => s + (p.type === 'refund' ? -1 : 1) * Number(p.amount), 0
  );
  const outstanding = paymentSummary?.outstanding ?? Math.max(0, Number(booking.totalNzd ?? 0) - totalPaid);
  const hasTotal = Number(booking.totalNzd ?? 0) > 0;

  // Send only what the user changed, so saving (say) the notes can't overwrite
  // a deposit, total or status someone else updated since the page loaded.
  const handleSave = () => {
    const changed = (k: string) => String(form[k] ?? "") !== String(baseline[k] ?? "");
    const patch: Parameters<typeof updateBooking.mutate>[0] = { id: bookingId };
    if (changed("firstName") && !String(form.firstName ?? "").trim()) { toast.error("First name is required."); return; }
    if (changed("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email ?? "").trim())) {
      toast.error("That email doesn't look right. Check it and try again."); return;
    }
    if (changed("firstName")) patch.firstName = form.firstName.trim();
    if (changed("lastName")) patch.lastName = form.lastName.trim();
    if (changed("email")) patch.email = form.email.trim();
    if (changed("eventType")) patch.eventType = form.eventType || undefined;
    if (changed("eventDate") || changed("eventTime")) patch.eventDate = combineLocalDateTime(form.eventDate, form.eventTime);
    if (changed("eventEndDate") || changed("eventEndTime")) {
      patch.eventEndDate = form.eventEndDate
        ? combineLocalDateTime(form.eventEndDate, form.eventEndTime)
        : null;
    }
    if (changed("guestCount")) patch.guestCount = form.guestCount ? parseInt(form.guestCount) : null;
    if (changed("spaceName")) patch.spaceName = form.spaceName || null;
    if (changed("totalNzd")) patch.totalNzd = form.totalNzd ? parseFloat(form.totalNzd) : null;
    if (changed("depositNzd")) patch.depositNzd = form.depositNzd ? parseFloat(form.depositNzd) : null;
    if (changed("depositPaid")) patch.depositPaid = form.depositPaid;
    if (changed("status")) patch.status = form.status;
    if (changed("notes")) patch.notes = form.notes || null;
    if (Object.keys(patch).length === 1) { setEditing(false); return; }
    updateBooking.mutate(patch);
  };

  const openProposal = () => {
    if (booking.proposalId) {
      setLocation(`/proposals/new?proposalId=${booking.proposalId}`);
    } else if (booking.leadId) {
      setLocation(`/proposals/new?leadId=${booking.leadId}`);
    } else {
      toast.error("This booking has no linked enquiry — start a proposal from the enquiry first.");
    }
  };
  const openPortalTab = () => {
    setModuleTab('portal');
    requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }));
  };

  // ── Derived, all from data already on the page ──────────────────────────
  const clientName = `${booking.firstName ?? ''} ${booking.lastName ?? ''}`.trim() || 'Event';
  const statusLabel = getStatusInfo(booking.status).label;
  const statusText = statusLabel ? statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1) : '';
  const statusTone: SigTone = STATUS_TONE[booking.status] ?? "blue";
  const isCancelled = booking.status === 'cancelled';
  const when = relDays(booking.eventDate);
  // Over once its last day (end date, else the start date) is behind us.
  const lastDay = booking.eventEndDate ?? booking.eventDate;
  const eventPassed = !!lastDay && nzDay(lastDay) < nzDay(Date.now());
  const depositNzd = Number(booking.depositNzd ?? 0);
  const depositPending = booking.depositRequired !== false && !booking.depositPaid;
  const balanceOverdue = hasTotal && outstanding > 0 && eventPassed && !isCancelled;
  const paymentsHref = `/payments?bookingId=${bookingId}`;
  const runsheetHref = existingRunsheet ? `/runsheet?id=${existingRunsheet.id}&bookingId=${bookingId}` : `/runsheet?bookingId=${bookingId}`;
  const checklistItems: any[] = ((eventChecklist as any)?.instance?.items ?? []) as any[];
  const checklistTicked = checklistItems.filter((i) => i.checked).length;

  // Why this event needs you, most urgent first; one callout at a time.
  const calloutLink = (href: string, label: string, red: boolean) => (
    <Link href={href} className="font-sans text-[13px] font-bold underline underline-offset-2" style={{ color: red ? SIG.red : SIG.amber }}>{label}</Link>
  );
  const callout: CalloutData | null = booking.clashFlaggedAt
    ? { tone: "red", title: "Double-booked.", body: "Another event has this date and space.", action: calloutLink('/dashboard?tab=overview', 'Resolve on Overview', true) }
    : balanceOverdue
    ? { tone: "red", title: "Balance overdue.", body: `The event has been and ${currency(outstanding)} is still outstanding.`, action: !isStaff ? calloutLink(paymentsHref, 'Payments', true) : undefined }
    : depositPending && !isCancelled && !eventPassed
    ? { tone: "amber", title: "Deposit not paid.", body: depositNzd > 0 ? `The ${currency(depositNzd)} deposit hasn't come in yet.` : "No deposit has been recorded for this event yet.", action: !isStaff ? calloutLink(paymentsHref, 'Payments', false) : undefined }
    : !hasTotal && !isCancelled
    ? { tone: "amber", title: "No total set.", body: "Add a total so the balance and payments can be tracked.", action: !isStaff && !editing ? (
        <button type="button" onClick={() => setEditing(true)} className="font-sans text-[13px] font-bold underline underline-offset-2" style={{ color: SIG.amber }}>Set a total</button>
      ) : undefined }
    : null;

  const dateLong = booking.eventDate
    ? new Date(booking.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
  const sameYear = booking.eventDate && new Date(booking.eventDate).getFullYear() === new Date().getFullYear();
  const dateShort = booking.eventDate
    ? new Date(booking.eventDate).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
    : "—";
  const multiDay = !!booking.eventEndDate && !!booking.eventDate && nzDay(booking.eventEndDate) !== nzDay(booking.eventDate);
  const startT = fmtEventTime(booking.eventDate);
  const endT = fmtEventTime(booking.eventEndDate);
  const timeStr = startT ? (endT && !multiDay ? `${startT} – ${endT}` : startT) : "—";
  const facts = [
    { label: "Date", value: <span title={dateLong}>{dateShort}</span> },
    ...(multiDay ? [{ label: "Until", value: <span title={endT ? `${new Date(booking.eventEndDate!).toLocaleDateString("en-NZ")} ${endT}` : undefined}>{new Date(booking.eventEndDate!).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })}{endT ? ` · ${endT}` : ""}</span> }] : []),
    { label: "Time", value: timeStr },
    { label: "Guests", value: booking.guestCount ?? "—", inv: true },
    { label: "Space", value: <span title={booking.spaceName || undefined}>{booking.spaceName || "—"}</span> },
    { label: "Type", value: booking.eventType || "—" },
    { label: "Total", value: hasTotal ? currencyWhole(Number(booking.totalNzd)) : "Not set" },
  ];

  const prep: PrepItem[] = [
    booking.proposalId
      ? { key: "proposal", label: "Proposal", note: "On file", state: "done", action: <button type="button" onClick={openProposal} className={BTN_SM}>Open</button> }
      : { key: "proposal", label: "Proposal", note: "Not started", state: "idle", action: <button type="button" onClick={openProposal} className={BTN_SM}>Start</button> },
    booking.depositRequired === false
      ? { key: "deposit", label: "Deposit", note: "Not needed", state: "done" }
      : booking.depositPaid
      ? { key: "deposit", label: "Deposit", note: depositNzd > 0 ? `${currency(depositNzd)} paid` : "Paid", state: "done" }
      : { key: "deposit", label: "Deposit", note: depositNzd > 0 ? `${currency(depositNzd)} not paid yet` : "Not paid yet", state: isCancelled ? "idle" : "attention",
          action: <Link href={paymentsHref} className={BTN_SM}>Payments</Link> },
    hasTotal
      ? { key: "total", label: "Total", note: currency(Number(booking.totalNzd)), state: "done" }
      : { key: "total", label: "Total", note: "No total set", state: isCancelled ? "idle" : "attention",
          action: !isStaff && !editing ? <button type="button" onClick={() => setEditing(true)} className={BTN_SM}>Set</button> : undefined },
    existingRunsheet
      ? { key: "runsheet", label: "Run sheet", note: existingRunsheet.title || "Created", state: "done", action: <Link href={runsheetHref} className={BTN_SM}>Open</Link> }
      : { key: "runsheet", label: "Run sheet", note: "Not started", state: "idle", action: <Link href={runsheetHref} className={BTN_SM}>Start</Link> },
    checklistItems.length > 0
      ? { key: "checklist", label: "Checklist", note: `${checklistTicked} of ${checklistItems.length} ticked`, state: checklistTicked === checklistItems.length ? "done" : "idle",
          action: <Link href={`/checklist?bookingId=${bookingId}`} className={BTN_SM}>Open</Link> }
      : { key: "checklist", label: "Checklist", note: "Not set up", state: "idle", action: <Link href={`/checklist?bookingId=${bookingId}`} className={BTN_SM}>Set up</Link> },
    !hasTotal
      ? { key: "balance", label: "Balance", note: "Needs a total first", state: "idle" }
      : outstanding <= 0
      ? { key: "balance", label: "Balance", note: "Paid in full", state: "done" }
      : { key: "balance", label: "Balance", note: `${currency(outstanding)} ${balanceOverdue ? "overdue" : "to pay"}`, state: balanceOverdue ? "overdue" : "idle",
          action: <Link href={paymentsHref} className={BTN_SM}>Payments</Link> },
  ];

  const docRow = "w-full flex items-center gap-2.5 min-h-[38px] px-1 py-1.5 rounded-[6px] font-sans text-[13.5px] font-semibold text-left text-foreground hover:bg-accent transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <ClashDialogHost />
      {beoPreviewOpen && (
        <BeoPreviewOverlay bookingId={booking.id} name={clientName} onClose={() => setBeoPreviewOpen(false)} />
      )}

      <main className="max-w-[1240px] mx-auto px-4 md:px-8 pt-6 pb-12 flex flex-col gap-5">
        <button type="button" onClick={() => setLocation('/dashboard')}
          className="self-start inline-flex items-center gap-1.5 font-sans text-[13px] font-semibold text-primary hover:underline -mb-1">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Dashboard
        </button>

        {/* Header: who, what, where it stands */}
        <header className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span aria-hidden className="w-12 h-12 rounded-full bg-accent text-primary text-[16px] font-bold flex items-center justify-center flex-shrink-0">
              {initialsOf(booking.firstName, booking.lastName)}
            </span>
            <div className="min-w-0 flex flex-col gap-1">
              <h1 className="m-0 text-[30px] leading-tight font-semibold tracking-[-0.015em] break-words">{clientName}</h1>
              <div className="flex items-center gap-3.5 flex-wrap">
                {statusText && <Signal tone={statusTone}>{statusText}</Signal>}
                <span className="text-[13px] text-muted-foreground">
                  {booking.eventType || "Event"}{when ? ` · ${when}` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className={BTN_OUTLINE}>
                  <X className="w-4 h-4" aria-hidden /> Cancel
                </button>
                <button onClick={handleSave} disabled={updateBooking.isPending} className={BTN_PRIMARY}>
                  <Save className="w-4 h-4" aria-hidden /> {updateBooking.isPending ? "Saving…" : "Save"}
                </button>
              </>
            ) : isStaff ? null : (
              <>
                <button onClick={() => setEditing(true)} className={BTN_OUTLINE}>
                  <Edit3 className="w-4 h-4" aria-hidden /> Edit
                </button>
                <button onClick={openPortalTab} className={BTN_OUTLINE}>
                  <Link2 className="w-4 h-4" aria-hidden /> Client portal
                </button>
                <RecordPaymentButton bookingId={bookingId} className={BTN_PRIMARY} />
              </>
            )}
          </div>
        </header>

        {callout && <Callout c={callout} />}

        {editing ? (
          <Card className="px-5 py-4">
            <SectionHead title="Edit event" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <label htmlFor="ev-first-name" className={FIELD_LABEL}>First name</label>
                <Input id="ev-first-name" value={form.firstName} onChange={e => setForm((p: any) => ({ ...p, firstName: e.target.value }))} className="text-sm" />
              </div>
              <div>
                <label htmlFor="ev-last-name" className={FIELD_LABEL}>Last name</label>
                <Input id="ev-last-name" value={form.lastName} onChange={e => setForm((p: any) => ({ ...p, lastName: e.target.value }))} className="text-sm" />
              </div>
              <div>
                <label htmlFor="ev-email" className={FIELD_LABEL}>Email</label>
                <Input id="ev-email" type="email" value={form.email} onChange={e => setForm((p: any) => ({ ...p, email: e.target.value }))} className="text-sm" />
              </div>
              <div>
                <label htmlFor="ev-type" className={FIELD_LABEL}>Event type</label>
                <Select value={form.eventType} onValueChange={v => setForm((p: any) => ({ ...p, eventType: v }))}>
                  <SelectTrigger id="ev-type" className="text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div id="ev-starts" className={FIELD_LABEL}>Event starts</div>
                <div className="flex gap-2" role="group" aria-labelledby="ev-starts">
                  <Input type="date" value={form.eventDate} onChange={e => setForm((p: any) => ({ ...p, eventDate: e.target.value }))} className="text-sm flex-1" aria-label="Event start date" />
                  <Input type="time" value={form.eventTime} onChange={e => setForm((p: any) => ({ ...p, eventTime: e.target.value }))} className="text-sm w-28" aria-label="Event start time" />
                </div>
              </div>
              <div>
                <div id="ev-ends" className={FIELD_LABEL}>Event ends</div>
                <div className="flex gap-2" role="group" aria-labelledby="ev-ends">
                  <Input type="date" value={form.eventEndDate} onChange={e => setForm((p: any) => ({ ...p, eventEndDate: e.target.value }))} className="text-sm flex-1" aria-label="Event end date" />
                  <Input type="time" value={form.eventEndTime} onChange={e => setForm((p: any) => ({ ...p, eventEndTime: e.target.value }))} className="text-sm w-28" aria-label="Event end time" />
                </div>
              </div>
              <div>
                <label htmlFor="ev-guests" className={FIELD_LABEL}>Guest count</label>
                <Input id="ev-guests" type="number" value={form.guestCount} onChange={e => setForm((p: any) => ({ ...p, guestCount: e.target.value }))} className="text-sm" />
              </div>
              <div>
                <label className={FIELD_LABEL}>Space / room</label>
                {/* Several spaces can be picked (e.g. Restaurant + La Saletta), or Full venue. */}
                <SpacesMultiSelect value={form.spaceName ?? ""} onChange={v => setForm((p: any) => ({ ...p, spaceName: v }))} />
              </div>
              <div>
                <label htmlFor="ev-total" className={FIELD_LABEL}>Total (NZD)</label>
                <Input id="ev-total" type="number" value={form.totalNzd} onChange={e => setForm((p: any) => ({ ...p, totalNzd: e.target.value }))} className="text-sm" placeholder="0.00" />
              </div>
              <div>
                <label htmlFor="ev-deposit" className={FIELD_LABEL}>Deposit (NZD)</label>
                <Input id="ev-deposit" type="number" value={form.depositNzd} onChange={e => setForm((p: any) => ({ ...p, depositNzd: e.target.value }))} className="text-sm" placeholder="0.00" />
              </div>
              <div>
                <label htmlFor="ev-status" className={FIELD_LABEL}>Status</label>
                <Select value={form.status} onValueChange={v => setForm((p: any) => ({ ...p, status: v }))}>
                  <SelectTrigger id="ev-status" className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="tentative">Tentative</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="finished">Finished</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="depositPaid" checked={form.depositPaid}
                  onChange={e => setForm((p: any) => ({ ...p, depositPaid: e.target.checked }))}
                  className="w-4 h-4 accent-[var(--primary)]" />
                <label htmlFor="depositPaid" className="font-sans text-[13px] font-semibold">Deposit paid</label>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="ev-notes" className={FIELD_LABEL}>Internal notes</label>
                <Textarea id="ev-notes" value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} rows={3} className="text-sm" />
              </div>
            </div>
          </Card>
        ) : (
          <FactsBand facts={facts} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          {/* Main column */}
          <div className="flex flex-col gap-5 min-w-0">
            <PrepList items={prep} />

            {booking.notes && !editing && (
              <Card className="px-5 py-4">
                <SectionHead title="Notes" />
                <p className="m-0 text-[14px] leading-relaxed whitespace-pre-wrap break-words">{booking.notes}</p>
              </Card>
            )}

            {/* What the client submitted through their portal (final numbers,
                dietaries, uploaded files). Hidden until they've sent something. */}
            <ClientSubmissionPanel bookingId={bookingId} />

            {/* Comms, contracts, budget plan, equipment, seating, portal: one row of tabs */}
            <div ref={tabsRef} className="scroll-mt-4">
              <EventModuleTabs bookingId={bookingId} booking={booking} activeTab={moduleTab} setActiveTab={setModuleTab} />
            </div>

            {/* Event spend & profitability tracking */}
            <Card className="px-5 py-4">
              <SectionHead title="Budget & spend" />
              <EventSpendSection bookingId={bookingId} />
            </Card>
          </div>

          {/* Side column */}
          <aside className="flex flex-col gap-5 min-w-0" aria-label="Money, documents and client">
            {/* Money */}
            <Card className="px-[18px] py-4 flex flex-col gap-3">
              <SectionHead title="Money" />
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-muted-foreground">Total</span>
                {hasTotal
                  ? <span className="text-[24px] font-semibold tabular-nums">{currency(Number(booking.totalNzd))}</span>
                  : <NoTotalSet className="font-sans text-[14px] font-semibold text-muted-foreground" />}
              </div>
              {hasTotal && <PaidBar total={Number(booking.totalNzd)} paid={totalPaid} outstanding={outstanding} overdue={balanceOverdue} />}
              {!hasTotal && totalPaid !== 0 && (
                <div className="text-[13px]"><span className="font-semibold tabular-nums">{currency(totalPaid)}</span> <span className="text-muted-foreground">paid so far</span></div>
              )}
              <div className="flex items-center justify-between gap-2 pt-2 border-t-[1.5px]" style={{ borderColor: "#ececed" }}>
                <span className="text-[13px] text-muted-foreground">Deposit <span className="tabular-nums text-foreground font-semibold">{currency(depositNzd)}</span></span>
                {booking.depositRequired === false
                  ? <Signal tone="gray">Not needed</Signal>
                  : booking.depositPaid ? <Signal tone="green">Paid</Signal> : <Signal tone="amber">Pending</Signal>}
              </div>
              <Link href={paymentsHref} className={`${BTN_OUTLINE} w-full`}>
                <DollarSign className="w-4 h-4" aria-hidden /> Manage payments
              </Link>

              {(payments ?? []).length > 0 && (
                <div className="pt-1">
                  <SectionHead title="Payment history" level={3} meta={(payments ?? []).length} />
                  <ul className="m-0 p-0 list-none">
                    {(payments ?? []).map((p: any) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2 border-b-[1.5px] last:border-b-0" style={{ borderColor: "#ececed" }}>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-semibold truncate">{p.description || p.type?.replace(/_/g, ' ')}</div>
                          <div className="text-[12px] text-muted-foreground">
                            {new Date(p.paidAt || p.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                            {p.method && ` · ${p.method}`}
                          </div>
                        </div>
                        {p.type === 'refund' ? (
                          <div className="text-[14px] font-semibold tabular-nums" style={{ color: SIG.red }}>−{currency(Number(p.amount))}</div>
                        ) : (
                          <div className="text-[14px] font-semibold tabular-nums" style={{ color: SIG.green }}>+{currency(Number(p.amount))}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <BookingInvoices bookingId={bookingId} />
            </Card>

            {!isStaff && <LinkedTasks bookingId={booking.id} leadId={booking.leadId} className="" ruleHeading />}

            {/* Documents */}
            <Card className="px-[18px] py-4">
              <SectionHead title="Documents" />
              <div className="flex flex-col">
                <button type="button" onClick={openProposal} className={docRow}>
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">{booking.proposalId ? 'Open proposal builder' : 'Start proposal'}</span>
                </button>
                {booking.leadId && !isStaff && <div className="py-1"><LeadProposals leadId={booking.leadId} compact /></div>}
                <button type="button" onClick={() => setBeoPreviewOpen(true)}
                  title="Read the full BEO (run of day, menu, dietaries) without downloading anything"
                  className={docRow}>
                  <Eye className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">Preview BEO</span>
                </button>
                <button type="button" onClick={() => downloadBeo(booking.id)}
                  title="The event order for the team: no prices or signature lines"
                  className={docRow}>
                  <Printer className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">Download BEO PDF</span>
                  <span className="text-[12px] font-normal text-muted-foreground">Team copy</span>
                </button>
                <button type="button" onClick={() => downloadBeo(booking.id, { copy: 'client' })}
                  title="The event order with prices, totals and signature lines, to send to the client"
                  className={docRow}>
                  <Printer className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">Download client copy</span>
                  <span className="text-[12px] font-normal text-muted-foreground">With prices</span>
                </button>
                <Link href={runsheetHref} className={docRow}>
                  <ClipboardList className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">{existingRunsheet ? 'Edit run sheet' : 'Create run sheet'}</span>
                </Link>
                <Link href={`/floor-plan?bookingId=${bookingId}`} className={docRow}>
                  <LayoutGrid className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">Floor plan</span>
                </Link>
                <Link href={`/checklist?bookingId=${bookingId}`} className={docRow}>
                  <ClipboardList className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">Checklist</span>
                </Link>
                <button type="button" onClick={() => getBeoToken.mutate({ id: booking.id })} disabled={getBeoToken.isPending} className={docRow}>
                  <LinkIcon className="w-4 h-4 text-primary flex-shrink-0" aria-hidden />
                  <span className="flex-1">
                    {getBeoToken.isPending ? 'Creating link…'
                      : (booking as any).beoShareToken ? 'Copy live event pack link' : 'Create live event pack link'}
                  </span>
                </button>
                {(booking as any).beoShareToken && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Revoke the current event-pack link? Anyone using the existing link will lose access.')) {
                        revokeBeoToken.mutate({ id: booking.id });
                      }
                    }}
                    disabled={revokeBeoToken.isPending}
                    className="self-start inline-flex items-center gap-1.5 min-h-8 px-1 mt-1 font-sans text-[12.5px] text-muted-foreground hover:text-[#c0392b] transition-colors disabled:opacity-50">
                    <X className="w-3.5 h-3.5" aria-hidden />
                    {revokeBeoToken.isPending ? 'Revoking…' : 'Revoke event-pack link'}
                  </button>
                )}
              </div>
            </Card>

            {/* Client */}
            <Card className="px-[18px] py-4">
              <SectionHead title="Client" />
              <div className="flex flex-col gap-0.5">
                <div className="text-[14px] font-semibold">{clientName}</div>
                {booking.email
                  ? <a href={`mailto:${booking.email}`} className="text-[13px] text-primary hover:underline break-words">{booking.email}</a>
                  : <div className="text-[13px] text-muted-foreground">No email on file</div>}
              </div>
              {booking.leadId && (
                <button
                  type="button"
                  onClick={() => setLocation(`/dashboard?tab=enquiries&leadId=${booking.leadId}`)}
                  className={`${BTN_SM} mt-3`}>
                  <Mail className="w-3.5 h-3.5" aria-hidden /> View enquiry
                </button>
              )}
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ─── EventModuleTabs ──────────────────────────────────────────────────────────
const MODULE_TABS = [
  { id: 'comms', label: 'Comms' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'budget', label: 'Budget plan' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'seating', label: 'Seating' },
  { id: 'portal', label: 'Client portal' },
];

function EventModuleTabs({ bookingId, booking, activeTab, setActiveTab }: { bookingId: number; booking: any; activeTab: string; setActiveTab: (t: string) => void }) {
  return (
    <Card className="px-5 pb-5">
      <div className="flex gap-1 border-b-[1.5px] border-border mb-4 -mx-1 overflow-x-auto">
        {MODULE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`px-3 py-2.5 font-sans text-[14px] font-semibold whitespace-nowrap border-b-2 -mb-[1.5px] transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'comms' && <CommsTab bookingId={bookingId} />}
      {activeTab === 'contracts' && <ContractsTab bookingId={bookingId} booking={booking} />}
      {activeTab === 'budget' && <BudgetTab bookingId={bookingId} />}
      {activeTab === 'equipment' && <EquipmentTab bookingId={bookingId} />}
      {activeTab === 'seating' && <SeatingTab bookingId={bookingId} booking={booking} />}
      {activeTab === 'portal' && <PortalTab bookingId={bookingId} booking={booking} />}
    </Card>
  );
}


// ─── Communications Tab ───────────────────────────────────────────────────────
function CommsTab({ bookingId }: { bookingId: number }) {
  const { data: comms, isLoading } = trpc.comms.list.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'note' as const, subject: '', body: '', direction: 'internal' as const, contactName: '', contactEmail: '' });
  const create = trpc.comms.create.useMutation({
    onSuccess: () => { utils.comms.list.invalidate({ bookingId }); setShowForm(false); setForm({ type: 'note', subject: '', body: '', direction: 'internal', contactName: '', contactEmail: '' }); toast.success('Log entry added'); },
    onError: () => toast.error("Couldn't add the log entry — try again"),
  });
  const del = trpc.comms.delete.useMutation({
    onSuccess: () => utils.comms.list.invalidate({ bookingId }),
    onError: () => toast.error("Couldn't delete the log entry — try again"),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary m-0">Communications log</h2>
        <button onClick={() => setShowForm(v => !v)} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}><Plus className="w-3.5 h-3.5" aria-hidden /> Add entry</button>
      </div>
      {showForm && (
        <div className="bg-card border-[1.5px] border-border rounded-[8px] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="comms-type" className={FIELD_LABEL}>Type</label>
              <select id="comms-type" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))} className="w-full border-[1.5px] border-input rounded-[6px] bg-card px-2 h-9 text-sm">
                <option value="note">Note</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="sms">SMS</option>
                <option value="meeting">Meeting</option>
              </select>
            </div>
            <div>
              <label htmlFor="comms-direction" className={FIELD_LABEL}>DIRECTION</label>
              <select id="comms-direction" value={form.direction} onChange={e => setForm(p => ({ ...p, direction: e.target.value as any }))} className="w-full border-[1.5px] border-input rounded-[6px] bg-card px-2 h-9 text-sm">
                <option value="internal">Internal</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
            <div>
              <label htmlFor="comms-subject" className={FIELD_LABEL}>SUBJECT</label>
              <Input id="comms-subject" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Optional subject" className="text-sm" />
            </div>
            <div>
              <label htmlFor="comms-contact" className={FIELD_LABEL}>CONTACT NAME</label>
              <Input id="comms-contact" value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} placeholder="Optional" className="text-sm" />
            </div>
          </div>
          <div>
            <label htmlFor="comms-body" className={FIELD_LABEL}>NOTES / BODY *</label>
            <Textarea id="comms-body" aria-required="true" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={3} placeholder="What was discussed or noted?" className="text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate({ ...form, bookingId })} disabled={!form.body || create.isPending} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}>{create.isPending ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowForm(false)} className={BTN_SM}>Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>}
      {!isLoading && (!comms || comms.length === 0) && (
        <div className="text-center py-12">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No communications logged yet.</p>
        </div>
      )}
      <div className="space-y-2">
        {(comms ?? []).map((c: any) => (
          <div key={c.id} className="bg-card border-[1.5px] border-border rounded-[8px] p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">{c.type}</span>
                {c.direction !== 'internal' && <span className="text-xs text-muted-foreground">{c.direction}</span>}
                {c.subject && <span className="text-sm font-medium text-foreground">{c.subject}</span>}
                <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{c.body}</p>
              {c.contactName && <p className="text-xs text-muted-foreground mt-1">Contact: {c.contactName}{c.contactEmail ? ` · ${c.contactEmail}` : ''}</p>}
            </div>
            <button onClick={() => { if (confirm('Delete this logged communication? This cannot be undone.')) del.mutate({ id: c.id }); }} aria-label="Delete communication" className="text-muted-foreground hover:text-[#c0392b] flex-shrink-0"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Contracts Tab ────────────────────────────────────────────────────────────
function ContractsTab({ bookingId, booking }: { bookingId: number; booking: any }) {
  const { data: contracts, isLoading } = trpc.contracts.list.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', clientName: (booking?.firstName ?? '') + ' ' + (booking?.lastName ?? ''), clientEmail: booking?.email ?? '' });
  const create = trpc.contracts.create.useMutation({
    onSuccess: () => { utils.contracts.list.invalidate({ bookingId }); setShowForm(false); toast.success('Contract created'); },
    onError: () => toast.error("Couldn't create the contract — try again"),
  });
  // The client signs in their portal link for this event. Sending makes sure
  // that link exists (with signing on) and emails it when SMTP is set up.
  // Client portal links aren't readable by a staff login.
  const { isStaff: portalStaff } = useAuth();
  const { data: portalLinks } = trpc.portal.list.useQuery({ bookingId }, { enabled: !portalStaff });
  const signingLink = (() => {
    const t = (portalLinks ?? []).find((t: any) => {
      try { return JSON.parse(t.permissions ?? '{}').signContract && (!t.expiresAt || Number(t.expiresAt) > Date.now()); } catch { return false; }
    });
    return t ? `${window.location.origin}/portal/${t.token}` : null;
  })();
  const send = trpc.contracts.send.useMutation({
    onSuccess: (r) => {
      utils.contracts.list.invalidate({ bookingId });
      utils.portal.list.invalidate({ bookingId });
      if (r.emailSent) toast.success(`Contract emailed to ${r.to} with their signing link`);
      else if (r.reason === 'no_client_email') toast.warning('Marked as sent, but there\'s no client email — copy the signing link below and send it yourself.');
      else if (r.reason === 'send_failed') toast.error('Marked as sent, but the email failed to send — copy the signing link below and send it yourself.');
      else toast.warning('Marked as sent, but email isn\'t set up — copy the signing link below and send it yourself.');
    },
    onError: (e) => toast.error(e.message || 'Could not send the contract'),
  });
  const del = trpc.contracts.delete.useMutation({
    onSuccess: () => utils.contracts.list.invalidate({ bookingId }),
    onError: () => toast.error("Couldn't delete the contract — try again"),
  });
  const STATUS_TONE: Record<string, SigTone> = { draft: 'gray', sent: 'blue', signed: 'green', declined: 'red', expired: 'gray' };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary m-0">Contracts & e-signatures</h3>
        <button onClick={() => setShowForm(v => !v)} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}><Plus className="w-3.5 h-3.5" aria-hidden /> New contract</button>
      </div>
      {showForm && (
        <div className="bg-card border-[1.5px] border-border rounded-[8px] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="contract-title" className={FIELD_LABEL}>CONTRACT TITLE *</label>
              <Input id="contract-title" aria-required="true" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Wedding Venue Agreement" className="text-sm" />
            </div>
            <div>
              <label htmlFor="contract-client-name" className={FIELD_LABEL}>CLIENT NAME</label>
              <Input id="contract-client-name" value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} className="text-sm" />
            </div>
            <div>
              <label htmlFor="contract-client-email" className={FIELD_LABEL}>CLIENT EMAIL</label>
              <Input id="contract-client-email" type="email" value={form.clientEmail} onChange={e => setForm(p => ({ ...p, clientEmail: e.target.value }))} className="text-sm" />
            </div>
          </div>
          <div>
            <label htmlFor="contract-body" className={FIELD_LABEL}>CONTRACT BODY *</label>
            <Textarea id="contract-body" aria-required="true" value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={8} placeholder="Paste or type the full contract text here…" className="text-sm font-mono" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate({ ...form, bookingId })} disabled={!form.title || !form.body || create.isPending} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}>{create.isPending ? 'Saving…' : 'Create contract'}</button>
            <button onClick={() => setShowForm(false)} className={BTN_SM}>Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>}
      {!isLoading && (!contracts || contracts.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <PenLine className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No contracts yet. Create one to send to your client for signing.</p>
        </div>
      )}
      <div className="space-y-3">
        {(contracts ?? []).map((c: any) => (
          <div key={c.id} className="bg-card border-[1.5px] border-border rounded-[8px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground text-sm">{c.title}</span>
                  <Signal tone={STATUS_TONE[c.status] ?? 'gray'} className="capitalize">{c.status}</Signal>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.clientName && <span>For: {c.clientName}</span>}
                  {c.clientEmail && <span> · {c.clientEmail}</span>}
                  <span> · Created {new Date(c.createdAt).toLocaleDateString('en-NZ')}</span>
                  {c.sentAt && c.status !== 'signed' && <span> · Sent {new Date(Number(c.sentAt)).toLocaleDateString('en-NZ')}</span>}
                  {c.expiresAt && c.status !== 'signed' && <span> · {Number(c.expiresAt) < Date.now() ? 'Expired' : 'Sign by'} {new Date(Number(c.expiresAt)).toLocaleDateString('en-NZ')}</span>}
                </div>
                {c.signedAt && (
                  <div className="text-xs text-[#3f7350] mt-1">
                    Signed by <strong>{c.signerName}</strong> on {new Date(Number(c.signedAt)).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    {c.signerIp && <span className="text-muted-foreground"> · from {c.signerIp}</span>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(c.status === 'draft' || c.status === 'sent') && (
                  <button onClick={() => send.mutate({ id: c.id })} disabled={send.isPending}
                    title={c.status === 'draft' ? 'Email the client their signing link (or get a link to send yourself)' : 'Email the signing link again'}
                    className={BTN_SM}>
                    {send.isPending && send.variables?.id === c.id ? 'Sending…' : c.status === 'draft' ? 'Send to client' : 'Resend'}
                  </button>
                )}
                <button onClick={() => { if (confirm('Delete this contract? This cannot be undone.')) del.mutate({ id: c.id }); }} aria-label="Delete contract" className="text-muted-foreground hover:text-[#c0392b]"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
              </div>
            </div>
            {c.status === 'sent' && (
              <div className="mt-2 pt-2 border-t-[1.5px] border-[#ececed]">
                {signingLink ? (
                  <>
                    <div className="text-xs text-muted-foreground mb-1">Signing link — the client's event page, where they read and sign:</div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-background border-[1.5px] border-border px-2 py-1 rounded-[6px] flex-1 truncate">{signingLink}</code>
                      <button onClick={() => { navigator.clipboard.writeText(signingLink); toast.success('Link copied'); }} className={BTN_SM}>Copy</button>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">No signing link yet — press Resend to create one.</div>
                )}
              </div>
            )}
            {c.status === 'draft' && (
              <p className="mt-2 pt-2 border-t-[1.5px] border-[#ececed] text-xs text-muted-foreground">Not sent yet. Send to client creates their signing link and emails it if your email is set up.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────
function BudgetTab({ bookingId }: { bookingId: number }) {
  const { data: items, isLoading } = trpc.budgets.list.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'venue', type: 'expense' as const, estimatedAmount: '', actualAmount: '' });
  const create = trpc.budgets.create.useMutation({
    onSuccess: () => { utils.budgets.list.invalidate({ bookingId }); setShowForm(false); setForm({ name: '', category: 'venue', type: 'expense', estimatedAmount: '', actualAmount: '' }); toast.success('Budget item added'); },
    onError: () => toast.error("Couldn't add the budget item — try again"),
  });
  const update = trpc.budgets.update.useMutation({
    onSuccess: () => utils.budgets.list.invalidate({ bookingId }),
    onError: () => toast.error("Couldn't save the actual amount — try again"),
  });
  const del = trpc.budgets.delete.useMutation({
    onSuccess: () => utils.budgets.list.invalidate({ bookingId }),
    onError: () => toast.error("Couldn't delete the budget item — try again"),
  });
  const income = (items ?? []).filter((i: any) => i.type === 'income');
  const expenses = (items ?? []).filter((i: any) => i.type === 'expense');
  const totalEstIncome = income.reduce((s: number, i: any) => s + Number(i.estimatedAmount ?? 0), 0);
  const totalEstExpense = expenses.reduce((s: number, i: any) => s + Number(i.estimatedAmount ?? 0), 0);
  const totalActIncome = income.reduce((s: number, i: any) => s + Number(i.actualAmount ?? 0), 0);
  const totalActExpense = expenses.reduce((s: number, i: any) => s + Number(i.actualAmount ?? 0), 0);
  const CATEGORIES = ['venue', 'catering', 'beverages', 'staffing', 'entertainment', 'decor', 'photography', 'transport', 'accommodation', 'marketing', 'other'];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary m-0">Budget plan</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Estimated vs actual lines for planning. Real supplier spend and profit are tracked under “Budget &amp; spend” on this page.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}><Plus className="w-3.5 h-3.5" aria-hidden /> Add item</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 border-[1.5px] border-input rounded-[8px] bg-card overflow-hidden">
        {[{ label: 'Est. income', val: totalEstIncome }, { label: 'Act. income', val: totalActIncome }, { label: 'Est. expense', val: totalEstExpense }, { label: 'Act. expense', val: totalActExpense }].map((s, i) => (
          <div key={s.label} className={`px-4 py-3 flex flex-col gap-1 border-[#ececed] ${i % 2 === 0 ? 'border-r-[1.5px]' : 'md:border-r-[1.5px]'} ${i < 2 ? 'border-b-[1.5px] md:border-b-0' : ''} ${i === 3 ? 'md:border-r-0' : ''}`}>
            <div className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">{s.label}</div>
            <div className="text-[22px] font-semibold tabular-nums">{currency(s.val)}</div>
          </div>
        ))}
      </div>
      {showForm && (
        <div className="bg-card border-[1.5px] border-border rounded-[8px] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="budget-name" className={FIELD_LABEL}>ITEM NAME *</label>
              <Input id="budget-name" aria-required="true" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Venue hire, Catering" className="text-sm" />
            </div>
            <div>
              <label htmlFor="budget-type" className={FIELD_LABEL}>Type</label>
              <select id="budget-type" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))} className="w-full border-[1.5px] border-input rounded-[6px] bg-card px-2 h-9 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label htmlFor="budget-category" className={FIELD_LABEL}>Category</label>
              <select id="budget-category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full border-[1.5px] border-input rounded-[6px] bg-card px-2 h-9 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="budget-estimated" className={FIELD_LABEL}>ESTIMATED ($)</label>
              <Input id="budget-estimated" type="number" value={form.estimatedAmount} onChange={e => setForm(p => ({ ...p, estimatedAmount: e.target.value }))} placeholder="0.00" className="text-sm" />
            </div>
            <div>
              <label htmlFor="budget-actual" className={FIELD_LABEL}>ACTUAL ($)</label>
              <Input id="budget-actual" type="number" value={form.actualAmount} onChange={e => setForm(p => ({ ...p, actualAmount: e.target.value }))} placeholder="0.00" className="text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate({ name: form.name, category: form.category, type: form.type, estimatedAmount: Number(form.estimatedAmount) || 0, actualAmount: Number(form.actualAmount) || 0, bookingId })} disabled={!form.name || create.isPending} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}>{create.isPending ? 'Saving…' : 'Add'}</button>
            <button onClick={() => setShowForm(false)} className={BTN_SM}>Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>}
      {!isLoading && (!items || items.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No budget items yet. Track estimated vs actual costs here.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="bg-card border-[1.5px] border-border rounded-[8px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                <th className="text-left p-3 font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Item</th>
                <th className="text-left p-3 font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Category</th>
                <th className="text-left p-3 font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Type</th>
                <th className="text-right p-3 font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Estimated</th>
                <th className="text-right p-3 font-sans text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Actual</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item: any) => (
                <tr key={item.id} className="border-t-[1.5px] border-[#ececed] hover:bg-background">
                  <td className="p-3 font-medium text-foreground">{item.name}</td>
                  <td className="p-3 text-muted-foreground capitalize">{item.category}</td>
                  <td className="p-3">
                    <span className="text-[13px] capitalize" style={{ color: item.type === 'income' ? SIG.green : undefined }}>{item.type}</span>
                  </td>
                  <td className="p-3 text-right tabular-nums">${Number(item.estimatedAmount ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right">
                    <input type="number" aria-label="Actual amount" defaultValue={item.actualAmount ?? 0} onBlur={e => update.mutate({ id: item.id, actualAmount: Number(e.target.value) })} className="w-24 text-right tabular-nums border-[1.5px] border-input rounded-[6px] px-2 py-0.5 text-sm" />
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => { if (confirm('Delete this budget line? This cannot be undone.')) del.mutate({ id: item.id }); }} aria-label="Delete budget line" className="text-muted-foreground hover:text-[#c0392b]"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Equipment Tab ────────────────────────────────────────────────────────────
function EquipmentTab({ bookingId }: { bookingId: number }) {
  const { data: items, isLoading } = trpc.equipment.listEvent.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'av', quantity: '1', notes: '' });
  const add = trpc.equipment.addToEvent.useMutation({
    onSuccess: () => { utils.equipment.listEvent.invalidate({ bookingId }); setShowForm(false); setForm({ name: '', category: 'av', quantity: '1', notes: '' }); toast.success('Equipment added'); },
    onError: () => toast.error("Couldn't add the equipment — try again"),
  });
  const updateItem = trpc.equipment.updateEvent.useMutation({
    onSuccess: () => utils.equipment.listEvent.invalidate({ bookingId }),
    onError: () => toast.error("Couldn't update the equipment status — try again"),
  });
  const del = trpc.equipment.deleteEvent.useMutation({
    onSuccess: () => utils.equipment.listEvent.invalidate({ bookingId }),
    onError: () => toast.error("Couldn't delete the equipment — try again"),
  });
  const STATUS_TONE: Record<string, SigTone> = { needed: 'amber', confirmed: 'blue', delivered: 'green', returned: 'gray' };
  const CATEGORIES = ['av', 'furniture', 'linen', 'lighting', 'catering', 'decor', 'transport', 'other'];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary m-0">Equipment & inventory</h3>
        <button onClick={() => setShowForm(v => !v)} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}><Plus className="w-3.5 h-3.5" aria-hidden /> Add item</button>
      </div>
      {showForm && (
        <div className="bg-card border-[1.5px] border-border rounded-[8px] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="equipment-name" className={FIELD_LABEL}>ITEM NAME *</label>
              <Input id="equipment-name" aria-required="true" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Round tables x 10, PA system" className="text-sm" />
            </div>
            <div>
              <label htmlFor="equipment-category" className={FIELD_LABEL}>Category</label>
              <select id="equipment-category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full border-[1.5px] border-input rounded-[6px] bg-card px-2 h-9 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="equipment-quantity" className={FIELD_LABEL}>QUANTITY</label>
              <Input id="equipment-quantity" type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="text-sm" />
            </div>
            <div className="col-span-2">
              <label htmlFor="equipment-notes" className={FIELD_LABEL}>NOTES</label>
              <Input id="equipment-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" className="text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => add.mutate({ name: form.name, category: form.category, quantity: Number(form.quantity) || 1, notes: form.notes || undefined, bookingId })} disabled={!form.name || add.isPending} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}>{add.isPending ? 'Saving…' : 'Add'}</button>
            <button onClick={() => setShowForm(false)} className={BTN_SM}>Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>}
      {!isLoading && (!items || items.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No equipment tracked yet. Add items needed for this event.</p>
        </div>
      )}
      <div className="space-y-2">
        {(items ?? []).map((item: any) => (
          <div key={item.id} className="bg-card border-[1.5px] border-border rounded-[8px] p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground text-sm">{item.name}</span>
                <span className="text-xs text-muted-foreground">× {item.quantity}</span>
                <span className="text-xs text-muted-foreground capitalize">{item.category}</span>
              </div>
              {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
            </div>
            <select
              value={item.status}
              aria-label={`Status for ${item.name}`}
              onChange={e => updateItem.mutate({ id: item.id, status: e.target.value as any })}
              className="h-8 rounded-[6px] border-[1.5px] border-input bg-card px-2 font-sans text-[12.5px] font-bold"
              style={{ color: SIG[STATUS_TONE[item.status] ?? 'gray'] }}
            >
              <option value="needed">Needed</option>
              <option value="confirmed">Confirmed</option>
              <option value="delivered">Delivered</option>
              <option value="returned">Returned</option>
            </select>
            <button onClick={() => { if (confirm('Delete this equipment item? This cannot be undone.')) del.mutate({ id: item.id }); }} aria-label="Delete equipment item" className="text-muted-foreground hover:text-[#c0392b]"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Seating Chart Tab ────────────────────────────────────────────────────────
function SeatingTab({ bookingId, booking }: { bookingId: number; booking: any }) {
  const { data: chart } = trpc.seating.get.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const save = trpc.seating.save.useMutation({
    onSuccess: () => { utils.seating.get.invalidate({ bookingId }); toast.success('Seating chart saved'); },
    onError: () => toast.error("Couldn't save the seating chart — try again"),
  });
  const [tables, setTables] = useState<any[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const guestCount = booking?.guestCount ?? 0;

  useEffect(() => {
    if (chart?.canvasData) {
      try { setTables(JSON.parse(chart.canvasData)); } catch {}
    }
  }, [chart]);

  const addTable = (shape: 'round' | 'rect') => {
    const id = Date.now();
    setTables(prev => [...prev, { id, shape, x: 50 + Math.random() * 300, y: 50 + Math.random() * 300, seats: 8, label: `Table ${prev.length + 1}` }]);
  };

  const handleMouseDown = (e: React.MouseEvent, id: number) => {
    const t = tables.find(t => t.id === id);
    if (!t) return;
    setDragging(id);
    setDragOffset({ x: e.clientX - t.x, y: e.clientY - t.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    setTables(prev => prev.map(t => t.id === dragging ? { ...t, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } : t));
  };

  const totalSeats = tables.reduce((s, t) => s + (t.seats ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary m-0">Seating chart</h3>
        <div className="flex gap-2">
          <button onClick={() => addTable('round')} className={BTN_SM}>+ Round table</button>
          <button onClick={() => addTable('rect')} className={BTN_SM}>+ Rect table</button>
          <button onClick={() => save.mutate({ bookingId, canvasData: JSON.stringify(tables), guestCount: totalSeats })} disabled={save.isPending} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}>{save.isPending ? 'Saving…' : 'Save chart'}</button>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Tables: {tables.length}</span>
        <span>Total seats: {totalSeats}</span>
        {guestCount > 0 && <span style={{ color: totalSeats >= guestCount ? SIG.green : SIG.amber, fontWeight: 700 }}>Guests: {guestCount} ({totalSeats >= guestCount ? '✓ Enough seats' : `${guestCount - totalSeats} more needed`})</span>}
      </div>
      <div
        className="relative bg-background border-[1.5px] border-dashed border-input rounded-lg overflow-hidden select-none"
        style={{ height: 500 }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        {tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
            <div className="text-center">
              <Layers className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Add tables above to start building your seating chart</p>
            </div>
          </div>
        )}
        {tables.map(table => (
          <div
            key={table.id}
            style={{ position: 'absolute', left: table.x, top: table.y, cursor: dragging === table.id ? 'grabbing' : 'grab' }}
            onMouseDown={e => handleMouseDown(e, table.id)}
          >
            {table.shape === 'round' ? (
              <div className="w-20 h-20 rounded-full bg-accent border-[1.5px] border-primary/50 flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-primary">{table.label}</span>
                <span className="text-xs text-muted-foreground">{table.seats} seats</span>
              </div>
            ) : (
              <div className="w-28 h-16 bg-accent border-[1.5px] border-primary/50 rounded-[6px] flex flex-col items-center justify-center">
                <span className="text-xs font-bold text-primary">{table.label}</span>
                <span className="text-xs text-muted-foreground">{table.seats} seats</span>
              </div>
            )}
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setTables(prev => prev.filter(t => t.id !== table.id))}
              aria-label="Remove table"
              className="absolute -top-2 -right-2 w-5 h-5 bg-foreground text-white rounded-full text-xs flex items-center justify-center hover:bg-[#c0392b]"
            ><span aria-hidden>×</span></button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Drag tables to position them. Click × to remove.</p>
    </div>
  );
}

// ─── Client Portal Tab ────────────────────────────────────────────────────────
function PortalTab({ bookingId, booking }: { bookingId: number; booking: any }) {
  // Client portal links aren't readable by a staff login.
  const { isStaff: portalStaff } = useAuth();
  const { data: tokens, isLoading } = trpc.portal.list.useQuery({ bookingId }, { enabled: !portalStaff });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [perms, setPerms] = useState({ viewProposal: true, viewRunsheet: false, viewBudget: true, approveProposal: true, signContract: false });
  const create = trpc.portal.create.useMutation({
    onSuccess: () => { utils.portal.list.invalidate({ bookingId }); setShowForm(false); toast.success('Client portal link created!'); },
    onError: () => toast.error("Couldn't create the portal link — try again"),
  });
  const del = trpc.portal.delete.useMutation({
    onSuccess: () => utils.portal.list.invalidate({ bookingId }),
    onError: () => toast.error("Couldn't delete the portal link — try again"),
  });
  const emailLink = trpc.portal.emailLink.useMutation({
    onSuccess: (r) => {
      if (r.emailSent) toast.success(`Portal link emailed to ${r.to}`);
      else if (r.reason === 'no_client_email') toast.warning('There\'s no client email on this event — copy the link and send it yourself.');
      else if (r.reason === 'send_failed') toast.error('The email failed to send — copy the link and send it yourself.');
      else toast.warning('Email isn\'t set up yet (Settings → Email) — copy the link and send it yourself.');
    },
    onError: (e) => toast.error(e.message || 'Could not email the link'),
  });
  const PERM_LABELS: Record<string, string> = { viewProposal: 'View Proposal', viewRunsheet: 'View Runsheet', viewBudget: 'View Payments', approveProposal: 'Approve Proposal', signContract: 'Sign Contract' };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] text-primary m-0">Client portal links</h3>
        <button onClick={() => setShowForm(v => !v)} className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}><Plus className="w-3.5 h-3.5" aria-hidden /> Create link</button>
      </div>
      <p className="text-xs text-muted-foreground">Share a secure link with your client so they can view their event details, approve proposals, and sign contracts — no login required.</p>
      {showForm && (
        <div className="bg-card border-[1.5px] border-border rounded-[8px] p-4 space-y-3">
          <div className={FIELD_LABEL}>Permissions</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PERM_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(perms as any)[key]} onChange={e => setPerms(p => ({ ...p, [key]: e.target.checked }))} className="w-4 h-4 accent-[var(--primary)]" />
                <span className="text-sm text-foreground">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => create.mutate({ bookingId, clientName: `${booking?.firstName ?? ''} ${booking?.lastName ?? ''}`.trim(), clientEmail: booking?.email, permissions: perms })}
              disabled={create.isPending}
              className={`${BTN_PRIMARY} !h-8 !text-[12.5px] !px-2.5`}
            >{create.isPending ? 'Creating…' : 'Create portal link'}</button>
            <button onClick={() => setShowForm(false)} className={BTN_SM}>Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>}
      {!isLoading && (!tokens || tokens.length === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <Link2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No portal links yet. Create one to share with your client.</p>
        </div>
      )}
      <div className="space-y-3">
        {(tokens ?? []).map((t: any) => {
          const url = `${window.location.origin}/portal/${t.token}`;
          const permsObj = t.permissions ? (() => { try { return JSON.parse(t.permissions); } catch { return {}; } })() : {};
          return (
            <div key={t.id} className="bg-card border-[1.5px] border-border rounded-[8px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground mb-1">{t.clientName || 'Client'}</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Created {new Date(t.createdAt).toLocaleDateString('en-NZ')}
                    {t.lastAccessedAt && ` · Last accessed ${new Date(t.lastAccessedAt).toLocaleDateString('en-NZ')}`}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {Object.entries(PERM_LABELS).filter(([k]) => permsObj[k]).map(([k, label]) => (
                      <span key={k} className="text-[12px] text-muted-foreground after:content-['·'] after:ml-1.5 last:after:content-none">{label}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs bg-background border-[1.5px] border-border px-2 py-1 rounded-[6px] flex-1 min-w-[12rem] truncate">{url}</code>
                    <button onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied!'); }} className={`${BTN_SM} flex-shrink-0`}>Copy</button>
                    <button onClick={() => emailLink.mutate({ id: t.id })} disabled={emailLink.isPending}
                      title={`Email this link to ${t.clientEmail || booking?.email || 'the client'}`}
                      className={`${BTN_SM} flex-shrink-0`}>
                      {emailLink.isPending && emailLink.variables?.id === t.id ? 'Sending…' : 'Email to client'}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={`${BTN_SM} flex-shrink-0`}>Preview</a>
                  </div>
                </div>
                <button onClick={() => { if (confirm('Delete this portal link? Anyone using it will lose access. This cannot be undone.')) del.mutate({ id: t.id }); }} aria-label="Delete portal link" className="text-muted-foreground hover:text-[#c0392b] flex-shrink-0"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
