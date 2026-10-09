import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import XeroPushModal from "@/components/XeroPushModal";
import PaymentsReceived from "@/components/PaymentsReceived";
import XeroEventInvoices from "@/components/XeroEventInvoices";
import XeroEventPayments from "@/components/XeroEventPayments";
import { invoiceState, STREAM_LABEL } from "@/lib/xeroInvoice";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign, FileText, Clock, CheckCircle2, Moon, Search,
  CalendarDays, Users, AlertCircle, ExternalLink, RefreshCw, ChevronDown, X,
} from "lucide-react";

// ─── Types mirror the server payments.overview shape ────────────────────────
type FoodStatus = "to_invoice" | "invoiced" | "paid" | "on_night";
type DrinksStatus = "on_night" | "to_invoice" | "invoiced" | "paid";
interface Row {
  bookingId: number;
  name: string;
  eventDate: string | null;
  eventType: string | null;
  spaceName: string | null;
  guestCount: number | null;
  status: string;
  total: number;
  hasPrice: boolean;
  paidToDate: number;
  outstanding: number | null;
  depositNzd: number;
  depositPaid: boolean;
  depositRequired: boolean;
  // Last deposit request emailed from VenueFlow (null = never).
  depositRequestedAt: string | null;
  onNightSignal: boolean;
  foodStatus: FoodStatus;
  drinksStatus: DrinksStatus;
  drinksInferred: boolean;
  invoices: SentInvoice[];
}

// An invoice that has been sent through to Xero (the xero_invoices ledger).
interface SentInvoice {
  id: number;
  stream: "food" | "drinks" | "deposit";
  invoiceNumber: string | null;
  status: string; // DRAFT | SUBMITTED | AUTHORISED | PAID | VOIDED
  total: number;
  sentBy: string | null;
  createdAt: string;
}

const fmtNZD = (n: number) =>
  n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "No date";

// Chip palette by state.
const CHIP = {
  todo:     { bg: "#fef3c7", text: "#92400e", label: "to do" },      // amber — needs action
  invoiced: { bg: "#dbeafe", text: "#1e40af", label: "invoiced" },   // blue — awaiting payment
  night:    { bg: "#ede9fe", text: "#5b21b6", label: "on night" },   // purple — settling on the night
  paid:     { bg: "#dcfce7", text: "#166534", label: "paid" },       // green — done
  // #6b6457 on #f1f0ec is ~5.0:1 (the old #8a8578 was ~3.3:1 — under AA).
  none:     { bg: "#f1f0ec", text: "#6b6457", label: "n/a" },        // grey — not applicable
} as const;

// Each chip's selectable statuses, picked directly from a menu.
const STREAM_STATES: Array<{ value: FoodStatus & DrinksStatus; label: string; state: keyof typeof CHIP }> = [
  { value: "on_night", label: "On the night", state: "night" },
  { value: "to_invoice", label: "To invoice", state: "todo" },
  { value: "invoiced", label: "Invoiced", state: "invoiced" },
  { value: "paid", label: "Paid", state: "paid" },
];

// The four summary buckets. Each booking lands in exactly one (a funnel), so
// the numbers sum to the whole book — and each card filters the list to it.
type Bucket = "to_invoice" | "awaiting" | "on_night" | "settled";
const BUCKET_LABEL: Record<Bucket, string> = {
  to_invoice: "To invoice", awaiting: "Awaiting payment", on_night: "Paying on the night", settled: "Fully settled",
};

const TABS = [["events", "Bookings"], ["deposits", "Deposits"], ["invoices", "Invoices"], ["received", "Received"]] as const;
type View = typeof TABS[number][0];

export default function PaymentsBoard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  // Direct event picker — with a page of events "find the one I mean" is
  // faster as a dropdown. 0 = all events.
  const [eventFilter, setEventFilter] = useState(0);
  // Default to Upcoming (what's coming up and where is its money at). Past
  // events that still need something are surfaced by a banner above the list,
  // so a forgotten post-event drinks bill can't hide behind this default.
  const [filter, setFilter] = useState<"action" | "upcoming" | "all">("upcoming");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [xeroFor, setXeroFor] = useState<Row | null>(null);
  // "Bookings" tracks where each booking's money is up to; "Invoices sent" is
  // what went to Xero; "Received" is the ledger of money that actually landed.
  const [view, setView] = useState<View>("events");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const { data, isLoading, isError, refetch } = trpc.payments.overview.useQuery(undefined, { refetchOnWindowFocus: true });
  const { data: xeroStatus } = trpc.xero.status.useQuery();

  // Pull anything reconciled in Xero into VenueFlow. Runs quietly when the
  // board opens (the server throttles to once a minute per venue) and can be
  // forced from the button; imported payments land in each event's history.
  const syncXero = trpc.xero.syncAll.useMutation({
    onSuccess: (r) => {
      if (r.skipped) return;
      if (r.paymentsImported > 0) {
        toast.success(`Imported ${r.paymentsImported} payment${r.paymentsImported === 1 ? "" : "s"} from Xero (${fmtNZD(r.amountImported)})`);
      } else if (r.statusChanges > 0) {
        toast.success(`Updated ${r.statusChanges} invoice status${r.statusChanges === 1 ? "" : "es"} from Xero`);
      }
      if (r.paymentsImported > 0 || r.statusChanges > 0) utils.payments.overview.invalidate();
    },
    onError: () => { /* quiet on the automatic pass; the button reports below */ },
  });
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current || !xeroStatus?.connected) return;
    autoSynced.current = true;
    syncXero.mutate({});
  }, [xeroStatus?.connected]);

  const update = trpc.bookings.update.useMutation({
    onSuccess: () => {
      utils.payments.overview.invalidate();
      utils.bookings.list.invalidate();
    },
    onError: () => toast.error("Failed to update — try again"),
  });

  const all: Row[] = useMemo(() => (data as Row[] | undefined) ?? [], [data]);

  // Per-event flags used for filtering + the summary.
  const isDepositDue = (r: Row) => r.depositRequired && !r.depositPaid;
  const chipsSettled = (r: Row) =>
    (!r.depositRequired || r.depositPaid) && r.foodStatus === "paid" && r.drinksStatus === "paid";
  const isFuture = (r: Row) => !r.eventDate || new Date(r.eventDate).getTime() >= startOfToday();
  // A stream settling on the night needs nothing until the event has happened.
  const streamNeedsAction = (r: Row, status: string) =>
    status === "to_invoice" || status === "invoiced" || (status === "on_night" && !isFuture(r));
  const needsAction = (r: Row) =>
    isDepositDue(r) || streamNeedsAction(r, r.foodStatus) || streamNeedsAction(r, r.drinksStatus);
  const bucketOf = (r: Row): Bucket | null => {
    if (chipsSettled(r)) return "settled";
    if (r.foodStatus === "to_invoice" || r.drinksStatus === "to_invoice") return "to_invoice";
    if (isDepositDue(r) || r.foodStatus === "invoiced" || r.drinksStatus === "invoiced") return "awaiting";
    if ((r.drinksStatus === "on_night" || r.foodStatus === "on_night") && isFuture(r)) return "on_night";
    return null;
  };

  const rows = useMemo(() => {
    if (eventFilter) {
      const one = all.filter(r => r.bookingId === eventFilter);
      if (one.length > 0) return one;
    }
    const needle = q.trim().toLowerCase();
    let list = all.filter(r =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      (r.eventType ?? "").toLowerCase().includes(needle) ||
      (r.spaceName ?? "").toLowerCase().includes(needle));
    if (bucket) list = list.filter(r => bucketOf(r) === bucket);
    else if (filter === "action") list = list.filter(needsAction);
    else if (filter === "upcoming") list = list.filter(isFuture);
    // Sort: soonest event first, except "All" which is most recent first.
    const ts = (r: Row) => (r.eventDate ? new Date(r.eventDate).getTime() : Number.MAX_SAFE_INTEGER);
    if (!bucket && filter === "all") list = [...list].sort((a, b) => (b.eventDate ? new Date(b.eventDate).getTime() : 0) - (a.eventDate ? new Date(a.eventDate).getTime() : 0));
    else list = [...list].sort((a, b) => ts(a) - ts(b));
    return list;
  }, [all, q, filter, eventFilter, bucket]);

  const summary = useMemo(() => {
    const s: Record<Bucket, number> = { to_invoice: 0, awaiting: 0, on_night: 0, settled: 0 };
    for (const r of all) { const b = bucketOf(r); if (b) s[b]++; }
    return s;
  }, [all]);

  // Past events that still need something done — usually the drinks bill that
  // goes out after the event. "Upcoming" hides them, so call them out.
  const pastNeedingAction = useMemo(() => all.filter(r => !isFuture(r) && needsAction(r)), [all]);

  // Jump list: upcoming bookings soonest-first, then past ones newest-first —
  // it used to start with the oldest event on record.
  const jumpGroups = useMemo(() => {
    const ts = (r: Row) => (r.eventDate ? new Date(r.eventDate).getTime() : Number.MAX_SAFE_INTEGER);
    return {
      upcoming: all.filter(isFuture).sort((a, b) => ts(a) - ts(b)),
      past: all.filter(r => !isFuture(r)).sort((a, b) => ts(b) - ts(a)),
    };
  }, [all]);

  const recordUrl = (r: Row) => `/payments?bookingId=${r.bookingId}&from=board&record=1`;

  // Marking a stream Paid only changes its status — it records no money. When
  // the booking still shows money owed, say so and offer to record it, so the
  // chip and the balance don't quietly disagree.
  const setStream = (r: Row, key: "foodStatus" | "drinksStatus", next: string) => {
    const name = key === "foodStatus" ? "Food" : "Drinks";
    update.mutate({ id: r.bookingId, [key]: next } as any, {
      onSuccess: () => {
        if (next === "paid" && (r.outstanding ?? 0) > 0) {
          toast(`${name} marked paid — ${fmtNZD(r.outstanding ?? 0)} still isn't recorded as received for ${r.name}.`, {
            action: { label: "Record payment", onClick: () => navigate(recordUrl(r)) },
            duration: 9000,
          });
        } else {
          toast.success(`${name} · ${labelFor(next)}`);
        }
      },
    });
  };
  // "Not taken" flips depositRequired off (the server clears the paid flag with
  // it); the other two turn it back on, so a deposit can be reinstated from
  // the same menu it was dismissed from.
  const setDeposit = (r: Row, next: "due" | "paid" | "not_taken") => update.mutate(
    next === "not_taken"
      ? ({ id: r.bookingId, depositRequired: false } as any)
      : ({ id: r.bookingId, depositRequired: true, depositPaid: next === "paid" } as any),
    { onSuccess: () => toast.success(next === "not_taken" ? "No deposit for this booking" : next === "paid" ? "Deposit marked as paid" : "Deposit marked as due") },
  );
  // All the money is in, but some chips still say otherwise — tick them in one go.
  const markAllPaid = (r: Row) => update.mutate(
    { id: r.bookingId, foodStatus: "paid", drinksStatus: "paid", ...(r.depositRequired && !r.depositPaid ? { depositPaid: true } : {}) } as any,
    { onSuccess: () => toast.success(`${r.name} marked fully settled`) },
  );

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    let n: number | null = null;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    if (n === null) return;
    e.preventDefault();
    setView(TABS[n][0]);
    tabRefs.current[n]?.focus();
  };

  const searchLabel = view === "deposits" ? "Search deposits by client, event type or invoice number"
    : view === "invoices" ? "Search invoices by client or invoice number"
    : view === "received" ? "Search payments received by client or notes"
    : "Search bookings by client, event type or space";
  const searchPlaceholder = view === "deposits" ? "Search client or invoice #…"
    : view === "invoices" ? "Search client or invoice #…"
    : view === "received" ? "Search client or notes…"
    : "Search client, type, space…";

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-cormorant text-3xl font-semibold text-ink flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-forest" aria-hidden="true" /> Payments
          </h1>
          {/* Hidden on phones: it pushed the first booking below the screen. */}
          <p className="hidden sm:block font-dm text-sm text-sage mt-0.5">
            Deposit, food and drinks tracked per booking — so the team always knows who to invoice, who's paid, and who's settling on the night.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
        {xeroStatus?.connected && (
          <button
            onClick={() => syncXero.mutate({ force: true })}
            disabled={syncXero.isPending}
            title="Check Xero for invoices that have been reconciled and bring those payments in"
            className="font-bebas tracking-widest text-xs text-blue-800 border border-blue-800/30 rounded-md px-3 py-2 hover:bg-blue-50 transition-colors flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${syncXero.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
            {syncXero.isPending ? "SYNCING…" : "SYNC XERO"}
          </button>
        )}
        {view === "events" && (
          <select
            value={eventFilter}
            onChange={e => setEventFilter(Number(e.target.value))}
            aria-label="Jump to one booking"
            className="w-full sm:w-56 px-2 py-2 border border-gold/30 bg-cream font-dm text-sm text-ink rounded-md focus:outline-none focus:border-forest"
          >
            <option value={0}>All bookings…</option>
            {jumpGroups.upcoming.length > 0 && (
              <optgroup label="Upcoming">
                {jumpGroups.upcoming.map(r => <option key={r.bookingId} value={r.bookingId}>{jumpLabel(r)}</option>)}
              </optgroup>
            )}
            {jumpGroups.past.length > 0 && (
              <optgroup label="Past">
                {jumpGroups.past.map(r => <option key={r.bookingId} value={r.bookingId}>{jumpLabel(r)}</option>)}
              </optgroup>
            )}
          </select>
        )}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-sage absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={q}
            // Typing a search clears any "jump to one booking" selection, so the
            // two filters don't silently fight. It now searches whichever tab
            // you're on (it used to do nothing on Invoices sent / Received).
            onChange={e => { setQ(e.target.value); if (eventFilter) setEventFilter(0); }}
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 border border-gold/30 bg-cream font-dm text-sm text-ink rounded-md focus:outline-none focus:border-forest"
          />
        </div>
        </div>
      </div>

      {/* View switcher — a real tab set: arrow keys / Home / End move between tabs. */}
      <div className="flex gap-1.5 mb-4 border-b border-gold/20 overflow-x-auto" role="tablist" aria-label="Payments view">
        {TABS.map(([k, lbl], i) => (
          <button key={k} ref={el => { tabRefs.current[i] = el; }}
            id={`pay-tab-${k}`} role="tab" aria-selected={view === k} aria-controls="pay-tabpanel"
            tabIndex={view === k ? 0 : -1}
            onClick={() => setView(k)} onKeyDown={e => onTabKey(e, i)}
            className={`font-bebas tracking-widest text-sm px-3 sm:px-4 py-2.5 border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 ${
              view === k ? "border-forest text-forest" : "border-transparent text-sage hover:text-ink"}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="pay-tabpanel" aria-labelledby={`pay-tab-${view}`}>
      {view === "received" ? (xeroStatus?.connected ? <XeroEventPayments q={q} /> : <PaymentsReceived q={q} />) : view === "deposits" ? (
        <DepositsSent rows={all} q={q} loading={isLoading}
          onOpen={r => navigate(`/event/${r.bookingId}`)} onRecord={r => navigate(recordUrl(r))} />
      ) : view === "invoices" ? (
        // Connected: the event invoices exactly as Xero shows them, live.
        // Not connected: VenueFlow's own record of what it sent.
        xeroStatus?.connected
          ? <XeroEventInvoices q={q} />
          : <SentInvoices rows={all} q={q} loading={isLoading} onOpen={r => setXeroFor(r)} />
      ) : (<>

      {/* Summary — a funnel across every booking (not the filtered list), so the
          four numbers sum to the whole book. Each card filters the list to it. */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bebas tracking-widest text-[11px] text-sage">ACROSS ALL {all.length} BOOKING{all.length === 1 ? "" : "S"} · TAP A CARD TO SEE THEM</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {([
          ["to_invoice", "amber", <FileText key="i" className="w-4 h-4" />],
          ["awaiting", "blue", <Clock key="c" className="w-4 h-4" />],
          ["on_night", "purple", <Moon key="m" className="w-4 h-4" />],
          ["settled", "green", <CheckCircle2 key="s" className="w-4 h-4" />],
        ] as const).map(([b, tone, icon]) => (
          <SummaryCard key={b} label={BUCKET_LABEL[b]} value={summary[b]} tone={tone} icon={icon}
            selected={bucket === b}
            onClick={() => { setBucket(bucket === b ? null : b); setEventFilter(0); }} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap" role="group" aria-label="Which bookings to show">
        {([["action", "Needs action"], ["upcoming", "Upcoming"], ["all", "All"]] as const).map(([id, lbl]) => {
          const on = !bucket && filter === id;
          return (
            <button key={id} aria-pressed={on} onClick={() => { setFilter(id); setBucket(null); }}
              className={`font-bebas tracking-widest text-xs px-3 py-2 rounded-md transition-colors ${
                on ? "bg-forest text-cream" : "bg-cream text-sage hover:text-ink border border-gold/20"}`}>
              {lbl}
            </button>
          );
        })}
        {bucket && (
          <button onClick={() => setBucket(null)} aria-label={`Clear filter: ${BUCKET_LABEL[bucket]}`}
            className="font-dm text-xs px-2.5 py-1.5 rounded-md bg-forest text-cream flex items-center gap-1">
            {BUCKET_LABEL[bucket]} <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
        <span className="font-dm text-xs text-sage ml-auto" aria-live="polite">{rows.length} booking{rows.length === 1 ? "" : "s"}</span>
      </div>

      {/* Past events still owing — the default Upcoming view would otherwise hide them. */}
      {!bucket && filter === "upcoming" && !eventFilter && pastNeedingAction.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap rounded-md border border-amber-300 bg-amber-50 px-3.5 py-2.5">
          <p className="font-dm text-sm text-amber-900 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            {pastNeedingAction.length === 1
              ? `1 past event still needs something done — e.g. a bill to send or chase.`
              : `${pastNeedingAction.length} past events still need something done — e.g. bills to send or chase.`}
          </p>
          <button onClick={() => setFilter("action")}
            className="font-bebas tracking-widest text-xs px-3 py-1.5 rounded-md bg-amber-800 text-white hover:bg-amber-900">
            SHOW {pastNeedingAction.length === 1 ? "IT" : "THEM"}
          </button>
        </div>
      )}

      <p className="font-dm text-xs text-sage mb-3">Tap a chip to set its status.</p>

      {/* Rows */}
      {isError ? (
        <div className="text-center py-16">
          <AlertCircle className="w-8 h-8 text-red-500/70 mx-auto mb-2" aria-hidden="true" />
          <p className="font-dm text-ink text-sm mb-3">Couldn't load payments.</p>
          <button onClick={() => refetch()}
            className="font-bebas tracking-widest text-xs px-4 py-2 rounded-md bg-forest text-cream hover:opacity-90">
            RETRY
          </button>
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-sage font-dm text-sm">Loading payments…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-8 h-8 text-green-600/60 mx-auto mb-2" aria-hidden="true" />
          <p className="font-dm text-sage text-sm">
            {q ? "No bookings match your search." : bucket ? `Nothing in "${BUCKET_LABEL[bucket]}" right now.` : filter === "action" ? "Nothing needs action — you're all caught up." : "No events yet."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Bookings">
          {rows.map(r => (
            <li key={r.bookingId}>
              <EventRow row={r}
                onFood={(v) => setStream(r, "foodStatus", v)}
                onDrinks={(v) => setStream(r, "drinksStatus", v)}
                onDeposit={(next) => setDeposit(r, next)}
                onOpen={() => navigate(`/event/${r.bookingId}`)}
                onRecord={() => navigate(recordUrl(r))}
                onXero={() => setXeroFor(r)}
                onMarkAllPaid={() => markAllPaid(r)}
                busy={update.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      </>)}
      </div>

      <XeroPushModal
        open={xeroFor !== null}
        onClose={() => setXeroFor(null)}
        booking={xeroFor ? {
          bookingId: xeroFor.bookingId,
          name: xeroFor.name,
          eventDate: xeroFor.eventDate,
          depositPaid: xeroFor.depositPaid,
          depositNzd: xeroFor.depositNzd,
        } : null}
        initialStream={xeroFor && xeroFor.depositRequired && !xeroFor.depositPaid ? "deposit"
          : xeroFor && xeroFor.foodStatus === "paid" ? "drinks" : "food"}
      />
    </div>
  );
}

function jumpLabel(r: Row) {
  return `${r.name}${r.eventDate ? ` — ${new Date(r.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}` : ""}`;
}

// Every invoice sent through to Xero, newest first — the "what have we billed
// and has it been paid" view, across all events.
/* ── Deposits: every deposit that's been asked for, and whether it's in ──────
   A deposit counts as "sent" once a request was emailed from VenueFlow
   (payments.requestDeposit) or a deposit invoice went to Xero. Paid = the
   booking's deposit is marked paid or its Xero deposit invoice is PAID. ── */
type DepositEntry = {
  row: Row;
  amount: number;
  sentAt: number;
  how: string[];
  paid: boolean;
  waitingDays: number | null;
};

const DAY_MS = 86_400_000;
const CHASE_AFTER_DAYS = 7;

function depositEntries(rows: Row[]): DepositEntry[] {
  const out: DepositEntry[] = [];
  for (const r of rows) {
    if (!r.depositRequired) continue;
    const inv = r.invoices.find(i => i.stream === "deposit" && i.status !== "VOIDED");
    const emailedAt = r.depositRequestedAt ? new Date(r.depositRequestedAt).getTime() : null;
    if (!inv && emailedAt == null) continue;
    const invAt = inv ? new Date(inv.createdAt).getTime() : null;
    const sentAt = Math.max(emailedAt ?? 0, invAt ?? 0);
    const day = (t: number) => new Date(t).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
    const how: string[] = [];
    if (emailedAt != null) how.push(`Request emailed ${day(emailedAt)}`);
    if (inv) how.push(`Xero ${inv.invoiceNumber ?? "invoice"}${inv.status === "DRAFT" ? " (draft — not sent from Xero yet)" : ""} ${day(invAt!)}`);
    const paid = r.depositPaid || inv?.status === "PAID";
    out.push({
      row: r,
      amount: inv && inv.total > 0 ? inv.total : r.depositNzd,
      sentAt,
      how,
      paid,
      waitingDays: paid ? null : Math.floor((Date.now() - sentAt) / DAY_MS),
    });
  }
  return out;
}

function DepositsSent({ rows, q, loading, onOpen, onRecord }: {
  rows: Row[]; q: string; loading: boolean; onOpen: (r: Row) => void; onRecord: (r: Row) => void;
}) {
  const [only, setOnly] = useState<"waiting" | "paid" | "all">("waiting");
  const entries = useMemo(() => depositEntries(rows), [rows]);
  const totals = useMemo(() => {
    let waiting = 0, waitingN = 0, paid = 0, paidN = 0, chase = 0;
    for (const e of entries) {
      if (e.paid) { paid += e.amount; paidN++; }
      else { waiting += e.amount; waitingN++; if ((e.waitingDays ?? 0) >= CHASE_AFTER_DAYS) chase++; }
    }
    return { waiting, waitingN, paid, paidN, chase };
  }, [entries]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter(e => only === "all" ? true : only === "paid" ? e.paid : !e.paid)
      .filter(e => !needle || e.row.name.toLowerCase().includes(needle)
        || (e.row.eventType ?? "").toLowerCase().includes(needle)
        || e.how.some(h => h.toLowerCase().includes(needle)))
      // Waiting: longest-waiting first (who to chase). Paid/all: newest first.
      .sort((a, b) => only === "waiting" ? a.sentAt - b.sentAt : b.sentAt - a.sentAt);
  }, [entries, only, q]);

  const remind = trpc.payments.requestDeposit.useMutation();
  const utils = trpc.useUtils();
  const sendReminder = (r: Row) => remind.mutate({ bookingId: r.bookingId }, {
    onSuccess: res => {
      if (res.sent) { toast.success(`Deposit reminder emailed to ${res.to}`); utils.payments.overview.invalidate(); }
      else toast.error(res.reason === "smtp_not_configured" ? "Email isn't set up yet (Settings → Email), so nothing was sent."
        : res.reason === "no_client_email" ? "This booking has no client email."
        : res.reason === "no_deposit_set" ? "Set a deposit amount on the booking first."
        : "The email didn't send — please try again.");
    },
    onError: () => toast.error("The email didn't send — please try again."),
  });

  if (loading) return <div className="text-center py-16 text-sage font-dm text-sm">Loading deposits…</div>;
  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="w-8 h-8 text-stone-400 mx-auto mb-2" aria-hidden="true" />
        <p className="font-dm text-ink text-sm">No deposits sent yet.</p>
        <p className="font-dm text-stone-600 text-xs mt-1">Request one from a booking's payment page, or send a deposit invoice with the XERO button — it will show up here.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-stone-200 rounded-lg px-4 py-3">
          <div className="font-bebas tracking-widest text-xs text-sage">WAITING · {totals.waitingN}</div>
          <div className="font-cormorant text-2xl font-semibold text-ink">{fmtNZD(totals.waiting)}</div>
          {totals.chase > 0 && <div className="font-dm text-xs text-amber-800 mt-0.5">{totals.chase} waiting {CHASE_AFTER_DAYS}+ days</div>}
        </div>
        <div className="bg-white border border-stone-200 rounded-lg px-4 py-3">
          <div className="font-bebas tracking-widest text-xs text-sage">PAID · {totals.paidN}</div>
          <div className="font-cormorant text-2xl font-semibold text-green-700">{fmtNZD(totals.paid)}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-3 flex-wrap" role="group" aria-label="Which deposits to show">
        {([["waiting", "Waiting"], ["paid", "Paid"], ["all", "All"]] as const).map(([k, lbl]) => (
          <button key={k} aria-pressed={only === k} onClick={() => setOnly(k)}
            className={`font-bebas tracking-widest text-xs px-3 py-2 rounded-md transition-colors ${only === k ? "bg-forest text-cream" : "bg-cream text-sage hover:text-ink border border-stone-200"}`}>
            {lbl}
          </button>
        ))}
        <span className="font-dm text-xs text-sage ml-auto" aria-live="polite">{list.length} deposit{list.length === 1 ? "" : "s"}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-center py-12 font-dm text-sage text-sm">
          {q ? "No deposits match your search." : only === "waiting" ? "No deposits waiting — everything sent has been paid." : "Nothing here yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Deposits sent">
          {list.map(e => {
            const r = e.row;
            const chase = !e.paid && (e.waitingDays ?? 0) >= CHASE_AFTER_DAYS;
            const chip = e.paid
              ? { label: "PAID", bg: "#dcfce7", text: "#166534" }
              : chase
                ? { label: `WAITING ${e.waitingDays} DAYS`, bg: "#fef3c7", text: "#92400e" }
                : { label: e.waitingDays === 0 ? "SENT TODAY" : `WAITING ${e.waitingDays} DAY${e.waitingDays === 1 ? "" : "S"}`, bg: "#dbeafe", text: "#1e40af" };
            return (
              <li key={r.bookingId} className="bg-white border border-stone-200 rounded-lg px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left group" aria-label={`Open ${r.name}'s booking`}>
                    <div className="font-cormorant text-base font-semibold text-ink truncate group-hover:underline">{r.name}</div>
                    <div className="font-dm text-xs text-stone-600 truncate">{fmtDate(r.eventDate)}{r.eventType ? ` · ${r.eventType}` : ""}</div>
                  </button>
                  <span className="hidden sm:inline font-bebas tracking-widest text-xs px-2.5 py-1 rounded-md whitespace-nowrap" style={{ background: chip.bg, color: chip.text }}>{chip.label}</span>
                  <span className="font-cormorant text-lg font-semibold text-ink tabular-nums w-20 sm:w-24 text-right">{fmtNZD(e.amount)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                  <span className="sm:hidden font-bebas tracking-widest text-xs px-2.5 py-1 rounded-md whitespace-nowrap" style={{ background: chip.bg, color: chip.text }}>{chip.label}</span>
                  <span className="font-dm text-xs text-stone-600">{e.how.join(" · ")}</span>
                  {!e.paid && (
                    <span className="ml-auto flex items-center gap-3">
                      <button onClick={() => sendReminder(r)} disabled={remind.isPending}
                        className="font-bebas tracking-widest text-xs text-forest hover:underline underline-offset-2 disabled:opacity-50">
                        EMAIL REMINDER
                      </button>
                      <button onClick={() => onRecord(r)}
                        className="font-bebas tracking-widest text-xs px-2.5 py-1 rounded-md bg-forest text-cream hover:opacity-90">
                        RECORD PAYMENT
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SentInvoices({ rows, q, loading, onOpen }: { rows: Row[]; q: string; loading: boolean; onOpen: (r: Row) => void }) {
  const [only, setOnly] = useState<"all" | "open" | "paid">("all");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const flat = rows.flatMap(r => r.invoices.map(inv => ({ inv, row: r })));
    flat.sort((a, b) => new Date(b.inv.createdAt).getTime() - new Date(a.inv.createdAt).getTime());
    return flat.filter(({ inv, row }) =>
      (only === "all" ? true
        : only === "paid" ? inv.status === "PAID"
        : inv.status !== "PAID" && inv.status !== "VOIDED")
      && (!needle
        || (inv.invoiceNumber ?? "").toLowerCase().includes(needle)
        || row.name.toLowerCase().includes(needle)
        || (STREAM_LABEL[inv.stream] ?? inv.stream).toLowerCase().includes(needle)
        || (inv.sentBy ?? "").toLowerCase().includes(needle)));
  }, [rows, only, q]);
  const totals = useMemo(() => {
    let out = 0, paid = 0;
    for (const r of rows) for (const i of r.invoices) {
      if (i.status === "PAID") paid += i.total;
      else if (i.status !== "VOIDED") out += i.total;
    }
    return { out, paid };
  }, [rows]);

  if (loading) return <div className="text-center py-16 text-sage font-dm text-sm">Loading invoices…</div>;
  const anyAtAll = rows.some(r => r.invoices.length > 0);
  if (!anyAtAll) {
    return (
      <div className="text-center py-16">
        <FileText className="w-8 h-8 text-sage/50 mx-auto mb-2" aria-hidden="true" />
        <p className="font-dm text-ink text-sm">No invoices sent to Xero yet.</p>
        <p className="font-dm text-sage text-xs mt-1">Use the XERO button on a booking to send a food, drinks or deposit invoice — it will appear here.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-gold/20 rounded-lg px-4 py-3">
          <div className="font-bebas tracking-widest text-xs text-sage">NOT YET PAID</div>
          <div className="font-cormorant text-2xl font-semibold text-ink">{fmtNZD(totals.out)}</div>
        </div>
        <div className="bg-white border border-gold/20 rounded-lg px-4 py-3">
          <div className="font-bebas tracking-widest text-xs text-sage">PAID</div>
          <div className="font-cormorant text-2xl font-semibold text-green-700">{fmtNZD(totals.paid)}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-3" role="group" aria-label="Which invoices to show">
        {([["all", "All"], ["open", "Not yet paid"], ["paid", "Paid"]] as const).map(([k, lbl]) => (
          <button key={k} aria-pressed={only === k} onClick={() => setOnly(k)}
            className={`font-bebas tracking-widest text-xs px-3 py-2 rounded-md transition-colors ${only === k ? "bg-forest text-cream" : "bg-cream text-sage hover:text-ink border border-gold/20"}`}>
            {lbl}
          </button>
        ))}
        <span className="font-dm text-xs text-sage ml-auto" aria-live="polite">{list.length} invoice{list.length === 1 ? "" : "s"}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-center py-12 font-dm text-sage text-sm">{q ? "No invoices match your search." : "No invoices match this filter."}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Invoices sent to Xero">
          {list.map(({ inv, row }) => {
            const st = invoiceState(inv.status);
            return (
              <li key={inv.id}>
                <button onClick={() => onOpen(row)}
                  className="w-full bg-white border border-gold/20 rounded-lg px-3.5 py-3 flex items-center gap-3 text-left hover:border-forest/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="font-cormorant text-base font-semibold text-ink truncate" style={{ textDecoration: st.strike ? "line-through" : undefined }}>
                      {inv.invoiceNumber ?? "Invoice"} <span className="font-dm text-xs font-normal text-sage">· {STREAM_LABEL[inv.stream] ?? inv.stream}</span>
                    </div>
                    <div className="font-dm text-xs text-sage truncate">
                      {row.name} · {fmtDate(row.eventDate)} · sent {new Date(inv.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}{inv.sentBy ? ` by ${inv.sentBy}` : ""}
                    </div>
                  </div>
                  <span className="font-bebas tracking-widest text-xs px-2.5 py-1 rounded-md whitespace-nowrap" title={st.hint} style={{ background: st.bg, color: st.text }}>{st.label.toUpperCase()}</span>
                  <span className="font-cormorant text-lg font-semibold text-ink tabular-nums w-24 text-right">{fmtNZD(inv.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

function labelFor(s: string): string {
  return ({ to_invoice: "To invoice", invoiced: "Invoiced", paid: "Paid", on_night: "On the night" } as Record<string, string>)[s] ?? s;
}

function SummaryCard({ label, value, tone, icon, selected, onClick }: {
  label: string; value: number; tone: "amber" | "blue" | "purple" | "green"; icon: React.ReactNode;
  selected: boolean; onClick: () => void;
}) {
  const toneCls: Record<string, string> = {
    amber: "text-amber-700", blue: "text-blue-700", purple: "text-purple-700", green: "text-green-700",
  };
  // Buckets with something in them get a soft tint + matching left accent so
  // the eye lands on where the work is; empty (0) buckets stay quiet.
  const tint: Record<string, { bg: string; bar: string }> = {
    amber: { bg: "#fffbeb", bar: "#f59e0b" }, blue: { bg: "#eff6ff", bar: "#3b82f6" },
    purple: { bg: "#faf5ff", bar: "#a855f7" }, green: { bg: "#f0fdf4", bar: "#22c55e" },
  };
  const active = value > 0;
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      aria-label={`${label}: ${value} booking${value === 1 ? "" : "s"}. ${selected ? "Showing these — press to show all." : "Show these."}`}
      className={`text-left bg-white border rounded-lg p-2.5 sm:p-3.5 transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest ${selected ? "ring-2 ring-forest border-forest" : "border-gold/20"}`}
      style={active ? { backgroundColor: tint[tone].bg, borderLeft: `4px solid ${tint[tone].bar}` } : undefined}>
      <div className="flex items-center gap-1.5 font-bebas tracking-widest text-xs text-sage mb-1">
        <span className={active ? toneCls[tone] : "text-sage"} aria-hidden="true">{icon}</span> {label}
      </div>
      <div className={`font-cormorant text-2xl sm:text-3xl font-semibold leading-none ${active ? toneCls[tone] : "text-ink"}`}>{value}</div>
    </button>
  );
}

// A status chip that opens a menu of its states (arrow keys, Enter, Escape all
// work, and screen readers hear which one is selected).
function StatusChip<V extends string>({ label, state, value, options, onChange, disabled, title }: {
  label: string; state: keyof typeof CHIP; value: V; disabled?: boolean; title?: string;
  options: Array<{ value: V; label: string; state: keyof typeof CHIP }>;
  onChange: (v: V) => void;
}) {
  const c = CHIP[state];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" title={title}
          className="font-bebas tracking-widest text-xs px-2.5 py-1.5 rounded-md border border-black/10 shadow-sm hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-forest cursor-pointer transition active:scale-95 disabled:opacity-50 whitespace-nowrap inline-flex items-center gap-1"
          style={{ background: c.bg, color: c.text }}>
          {label} <ChevronDown className="w-3 h-3 -mr-0.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => { if (v !== value) onChange(v as V); }}>
          {options.map(o => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="py-2">
              <span className="font-bebas tracking-widest text-xs px-2 py-0.5 rounded" style={{ background: CHIP[o.state].bg, color: CHIP[o.state].text }}>{o.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EventRow({ row, onFood, onDrinks, onDeposit, onOpen, onRecord, onXero, onMarkAllPaid, busy }: {
  row: Row; onFood: (v: FoodStatus) => void; onDrinks: (v: DrinksStatus) => void; onDeposit: (next: "due" | "paid" | "not_taken") => void;
  onOpen: () => void; onRecord: () => void; onXero: () => void; onMarkAllPaid: () => void; busy: boolean;
}) {
  // Deposit chip — Due / Paid / Not taken, all in one menu so "no deposit"
  // can be undone where it was set.
  const depositValue: "due" | "paid" | "not_taken" = !row.depositRequired ? "not_taken" : row.depositPaid ? "paid" : "due";
  // No made-up figure: the deposit used to show "$575" (one venue's standard
  // amount) whenever none was set on the booking.
  const depAmt = row.depositNzd > 0 ? `${fmtNZD(row.depositNzd)} ` : "";
  const depositLabel = !row.depositRequired ? "No deposit"
    : row.depositPaid ? `Deposit ${depAmt}paid`
    : row.depositNzd > 0 ? `Deposit ${depAmt}due` : "Deposit due · no amount set";
  const depositChip = (
    <StatusChip label={depositLabel} state={!row.depositRequired ? "none" : row.depositPaid ? "paid" : "todo"}
      value={depositValue} disabled={busy} title="Choose the deposit status"
      options={[
        { value: "due", label: "Due", state: "todo" },
        { value: "paid", label: "Paid", state: "paid" },
        { value: "not_taken", label: "Not taken", state: "none" },
      ]}
      onChange={onDeposit} />
  );

  const stateFor = (s: string): keyof typeof CHIP =>
    s === "paid" ? "paid" : s === "invoiced" ? "invoiced" : s === "on_night" ? "night" : "todo";
  const foodChip = (
    <StatusChip label={`Food · ${labelFor(row.foodStatus)}`} state={stateFor(row.foodStatus)}
      value={row.foodStatus} disabled={busy} title="Choose the food payment status"
      options={STREAM_STATES} onChange={v => onFood(v as FoodStatus)} />
  );
  // An inferred drinks status is spelled out ("suggested"), not a bare "?".
  const suggested = row.drinksInferred && row.drinksStatus !== "paid";
  const drinksChip = (
    <StatusChip label={`Drinks · ${labelFor(row.drinksStatus)}${suggested ? " (suggested)" : ""}`} state={stateFor(row.drinksStatus)}
      value={row.drinksStatus} disabled={busy}
      title={suggested ? "Suggested from the bar setup — choose to confirm or change it" : "Choose the drinks payment status"}
      options={STREAM_STATES} onChange={v => onDrinks(v as DrinksStatus)} />
  );

  const settled = (!row.depositRequired || row.depositPaid) && row.foodStatus === "paid" && row.drinksStatus === "paid";
  const owed = row.outstanding ?? 0;
  const eventPast = !!row.eventDate && new Date(row.eventDate).getTime() < new Date().setHours(0, 0, 0, 0);
  // Overdue only once the event has happened. A future booking with its deposit
  // due used to show its WHOLE balance in red as "OVERDUE" weeks in advance.
  const isOverdue = owed > 0 && eventPast;
  // The money ledger says it's all in, but chips still say otherwise.
  const ledgerPaid = row.hasPrice && owed === 0 && row.paidToDate > 0;

  return (
    <div className={`bg-white border rounded-lg px-3.5 py-3 flex flex-col lg:flex-row lg:items-center gap-3 ${settled ? "border-green-200/70" : "border-gold/20"}`}>
      {/* Event info */}
      <button onClick={onOpen} className="text-left min-w-0 lg:w-64 flex-shrink-0 group" aria-label={`Open ${row.name}, ${fmtDate(row.eventDate)}`}>
        <div className="font-cormorant text-base font-semibold text-ink truncate leading-tight group-hover:underline">{row.name}</div>
        <div className="flex items-center gap-1.5 font-dm text-xs text-sage mt-0.5 flex-wrap">
          <CalendarDays className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
          <span>{fmtDate(row.eventDate)}</span>
          {row.eventType && <><span aria-hidden="true">·</span><span className="truncate">{row.eventType}</span></>}
        </div>
        {(row.spaceName || row.guestCount) && (
          <div className="flex items-center gap-2 font-dm text-xs text-sage mt-0.5">
            {row.spaceName && <span className="truncate">{row.spaceName}</span>}
            {row.guestCount ? <span className="flex items-center gap-0.5 flex-shrink-0"><Users className="w-3 h-3" aria-hidden="true" />{row.guestCount}<span className="sr-only"> guests</span></span> : null}
          </div>
        )}
      </button>

      {/* Status chips */}
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {depositChip}
          {foodChip}
          {drinksChip}
        </div>
        {/* Which invoices have actually been sent to Xero, and where each stands */}
        {row.invoices.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" aria-label="Invoices sent to Xero">
            {row.invoices.map(inv => {
              const st = invoiceState(inv.status);
              return (
                <button key={inv.id} onClick={onXero} title={`${st.hint}${inv.sentBy ? ` · sent by ${inv.sentBy}` : ""} — click to manage`}
                  className="inline-flex items-center gap-1.5 font-dm text-xs rounded-md border px-2 py-1 hover:opacity-80 transition-opacity"
                  style={{ background: st.bg, color: st.text, borderColor: `${st.text}33`, textDecoration: st.strike ? "line-through" : undefined }}>
                  <FileText className="w-3 h-3 flex-shrink-0" aria-hidden />
                  <span className="font-semibold">{STREAM_LABEL[inv.stream] ?? inv.stream} {inv.invoiceNumber ?? ""}</span>
                  <span>· {st.label}</span>
                  <span className="tabular-nums">· {fmtNZD(inv.total)}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* When the chips and the recorded money disagree, say so and offer the fix. */}
        {settled && owed > 0 && (
          <p className="font-dm text-xs text-amber-900 flex items-center gap-1.5 flex-wrap">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            Marked paid, but {fmtNZD(owed)} isn't recorded as received.
            <button onClick={onRecord} className="font-semibold underline underline-offset-2 hover:no-underline">Record it</button>
          </p>
        )}
        {!settled && ledgerPaid && (
          <p className="font-dm text-xs text-green-800 flex items-center gap-1.5 flex-wrap">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
            All {fmtNZD(row.total)} has been received.
            <button onClick={onMarkAllPaid} disabled={busy} className="font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50">Mark everything paid</button>
          </p>
        )}
      </div>

      {/* Balance — the amount owed leads the row; red only once it's overdue. */}
      <div className="flex-shrink-0 lg:w-40 flex flex-col lg:items-end">
        {owed > 0 ? (
          <>
            <div className={`font-cormorant text-xl font-bold leading-none ${isOverdue ? "text-red-700" : "text-ink"}`}>{fmtNZD(owed)}</div>
            <div className={`font-bebas tracking-widest text-[11px] mt-0.5 ${isOverdue ? "text-red-700" : "text-sage"}`}>{isOverdue ? "OVERDUE" : "OWED"}</div>
            {row.paidToDate > 0 && <div className="font-dm text-xs text-sage mt-0.5">{fmtNZD(row.paidToDate)} paid</div>}
          </>
        ) : row.paidToDate > 0 ? (
          <div className="font-bebas tracking-widest text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Paid in full</div>
        ) : null}
        {!row.hasPrice && (
          <div className="font-dm text-xs text-amber-800 flex items-center gap-1 mt-0.5" title="No total set on this booking">
            <AlertCircle className="w-3 h-3" aria-hidden="true" /> no total set
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={onXero} title="Send a deposit, food or drinks invoice to Xero as a draft"
          aria-label={`Xero invoices for ${row.name}${row.invoices.length > 0 ? ` (${row.invoices.filter(i => i.status !== "VOIDED").length} sent)` : ""}`}
          className="font-bebas tracking-widest text-xs text-blue-800 border border-blue-800/30 rounded-md px-2.5 py-2 hover:bg-blue-50 transition-colors flex items-center gap-1">
          <FileText className="w-3 h-3" aria-hidden="true" /> XERO{row.invoices.length > 0 ? ` · ${row.invoices.filter(i => i.status !== "VOIDED").length}` : ""}
        </button>
        <button onClick={onRecord} aria-label={`Record a payment for ${row.name}`}
          className="font-bebas tracking-widest text-xs text-forest border border-forest/30 rounded-md px-2.5 py-2 hover:bg-linen transition-colors flex items-center gap-1">
          <DollarSign className="w-3 h-3" aria-hidden="true" /> RECORD
        </button>
        <button onClick={onOpen} aria-label={`Open ${row.name}`}
          className="font-bebas tracking-widest text-xs text-sage border border-gold/20 rounded-md px-2.5 py-2 hover:text-ink transition-colors flex items-center gap-1">
          <ExternalLink className="w-3 h-3" aria-hidden="true" /> OPEN
        </button>
      </div>
    </div>
  );
}
