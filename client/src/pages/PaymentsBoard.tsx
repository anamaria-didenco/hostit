import { useEffect, useMemo, useRef, useState } from "react";
import { NBI_IMPORT_EVENT_TYPE } from "@shared/conversion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { invalidateMoney } from "@/lib/invalidateMoney";
import { toast } from "sonner";
import XeroPushModal from "@/components/XeroPushModal";
import PaymentsReceived from "@/components/PaymentsReceived";
import XeroEventInvoices from "@/components/XeroEventInvoices";
import XeroEventPayments from "@/components/XeroEventPayments";
import { NewInvoiceDialog } from "@/components/NewInvoiceDialog";
import { LinkXeroInvoiceDialog, useUnlinkedXeroCount } from "@/components/LinkXeroInvoiceDialog";
import { invoiceState, STREAM_LABEL } from "@/lib/xeroInvoice";
import { fmtDate as fmtDateTz } from "@/lib/dateTime";
import { currencyWhole } from "@/lib/money";
import { xeroErrorHelp, XERO_SETTINGS_URL } from "@/lib/xeroError";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign, FileText, CheckCircle2, Search, AlertCircle, AlertTriangle, ExternalLink, RefreshCw,
  ChevronDown, X, Plus, Link2, MoreHorizontal, Users,
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
  /** Billed as contra (no charge) — nothing to invoice on this stream. */
  foodContra?: boolean;
  drinksContra?: boolean;
  drinksInferred: boolean;
  /** Only a draft invoice exists in Xero for this stream — nothing sent yet. */
  foodDraft?: boolean;
  drinksDraft?: boolean;
  /** Every invoice for this stream is PAID in Xero. */
  foodPaidInXero?: boolean;
  drinksPaidInXero?: boolean;
  /** The deposit invoice is paid in Xero (the payment may not be imported yet). */
  depositPaidInXero?: boolean;
  depositDraft?: boolean;
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

// Money and dates route through the shared formatters so the board reads the
// same as the rest of the app (whole dollars here, no cents noise).
const fmtNZD = (n: number) => currencyWhole(n);

const fmtDate = (iso: string | null) => (iso ? fmtDateTz(iso, "weekday") : "No date");

// Signal colours — each means one thing (all ≥4.5:1 on white):
// red = overdue only, amber = needs attention soon, blue = in hand / waiting
// on the client, green = paid, purple = settling on the night, grey = n/a.
const SIG = {
  red: "#c0392b", amber: "#8a5f18", blue: "#2f5488", green: "#3f7350", night: "#5b4b8a", muted: "#6b7078",
} as const;
type Tone = keyof typeof SIG;

// Status dot palette by state (replaces the old coloured chips).
const CHIP = {
  todo:     { color: SIG.amber, label: "to do" },      // needs action
  invoiced: { color: SIG.blue, label: "invoiced" },    // awaiting payment
  night:    { color: SIG.night, label: "on night" },   // settling on the night
  paid:     { color: SIG.green, label: "paid" },       // done
  none:     { color: SIG.muted, label: "n/a" },        // not applicable
  late:     { color: SIG.red, label: "late" },         // the event has passed and this is still open
} as const;

// Buttons and pills — one family, sentence case. 38px default, 32px small.
const BTN = "inline-flex items-center justify-center gap-1.5 rounded-[6px] border-[1.5px] font-sans font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const BTN_MD = `${BTN} h-[38px] px-3.5 text-[13px]`;
const BTN_SM = `${BTN} h-8 px-2.5 text-[12.5px]`;
const BTN_P = "bg-primary border-primary text-primary-foreground hover:brightness-110";
const BTN_O = "bg-card border-input text-foreground hover:border-primary";
const PILL = "inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[6px] border-[1.5px] font-sans text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const pillCls = (on: boolean) => `${PILL} ${on ? "border-primary bg-accent text-primary" : "border-input bg-card text-foreground hover:border-primary"}`;
const INPUT = "h-[34px] border-[1.5px] border-input bg-card font-sans text-[13px] text-foreground rounded-[6px] focus:outline-none focus:border-primary";

/** One dot + label in a signal colour. */
function Sig({ tone, color, children, size = "md", className = "" }: {
  tone?: Tone; color?: string; children: React.ReactNode; size?: "md" | "sm"; className?: string;
}) {
  const c = color ?? SIG[tone ?? "muted"];
  return (
    <span className={`inline-flex items-center gap-1.5 font-sans whitespace-nowrap ${size === "sm" ? "text-[12.5px] font-semibold" : "text-[13px] font-bold"} ${className}`} style={{ color: c }}>
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c }} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Section head: tracked caps title, a hairline that fills the row, a count. */
function SectionHead({ title, count, tone }: { title: string; count: number; tone?: Tone }) {
  const red = tone === "red";
  return (
    <div className="flex items-center gap-3 mt-2">
      <h2 className="font-sans text-[12px] font-extrabold uppercase tracking-[0.2em] flex-shrink-0" style={{ color: red ? SIG.red : "var(--primary)" }}>{title}</h2>
      <span className="h-[1.5px] flex-1" style={{ background: red ? SIG.red : "var(--border)" }} aria-hidden="true" />
      <span className="font-sans text-[12px] text-muted-foreground flex-shrink-0">{count}</span>
    </div>
  );
}

/** Tinted callout that says why something needs attention. */
function Callout({ tone, title, children, action, role = "note" }: {
  tone: "red" | "amber"; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; role?: "note" | "alert" | "status";
}) {
  const style = tone === "red"
    ? { background: "#fbecea", borderColor: "#f0c7c2", color: SIG.red }
    : { background: "#f7efdd", borderColor: "#e9d7b3", color: "#6b4710" };
  return (
    <div role={role} className="flex items-start gap-3 rounded-[8px] border-[1.5px] px-3.5 py-3 flex-wrap sm:flex-nowrap" style={style}>
      <AlertTriangle className="w-[18px] h-[18px] flex-shrink-0 mt-px" strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-sans text-[14px] font-bold">{title}</div>
        {children && <div className="font-sans text-[13px] mt-0.5" style={{ color: "#1a1a1e" }}>{children}</div>}
      </div>
      {action && <div className="flex-shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

// Xero invoice statuses in the same palette.
const invoiceTone = (status: string): string =>
  status === "PAID" ? SIG.green : status === "AUTHORISED" ? SIG.blue : status === "VOIDED" ? SIG.muted
  : status === "SUBMITTED" ? SIG.night : SIG.amber;

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

// Section heads on the Bookings list, most urgent first.
type Group = "overdue" | "soon" | "track";
const GROUP_ORDER: Group[] = ["overdue", "soon", "track"];
const GROUP_TITLE: Record<Group, string> = { overdue: "Overdue", soon: "Due soon", track: "On track" };
/** An invoice out for an event this close is "due soon", not just waiting. */
const SOON_DAYS = 14;
/** Booking · event · deposit/food/drinks · balance · action. */
const ROW_COLS = "lg:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1.5fr)_140px_150px]";

const TABS = [["events", "Bookings"], ["deposits", "Deposits"], ["invoices", "Invoices"], ["received", "Received"]] as const;
type View = typeof TABS[number][0];

export default function PaymentsBoard({ initialFilter }: { initialFilter?: "deposits_due" | "no_total" } = {}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  // Direct event picker — with a page of events "find the one I mean" is
  // faster as a dropdown. 0 = all events.
  const [eventFilter, setEventFilter] = useState(0);
  // Default to Upcoming (what's coming up and where is its money at). Past
  // events that still need something are surfaced by a banner above the list,
  // so a forgotten post-event drinks bill can't hide behind this default.
  const [filter, setFilter] = useState<"action" | "upcoming" | "all" | "deposits" | "no_total">(
    initialFilter === "deposits_due" ? "deposits" : initialFilter === "no_total" ? "no_total" : "upcoming");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [xeroFor, setXeroFor] = useState<Row | null>(null);
  // "Bookings" tracks where each booking's money is up to; "Invoices sent" is
  // what went to Xero; "Received" is the ledger of money that actually landed.
  const [view, setView] = useState<View>("events");
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showLinkXero, setShowLinkXero] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const { data, isLoading, isError, refetch } = trpc.payments.overview.useQuery(undefined, { refetchOnWindowFocus: true });
  const { data: xeroStatus } = trpc.xero.status.useQuery();
  // Invoices raised straight in Xero that VenueFlow isn't following (so never synced).
  const unlinkedCount = useUnlinkedXeroCount(!!xeroStatus?.connected);

  // Pull anything reconciled in Xero into VenueFlow. Runs quietly when the
  // board opens (the server throttles to once a minute per venue) and can be
  // forced from the button; imported payments land in each event's history.
  // The last thing Xero refused, shown as a warning above the board. A lapsed
  // Xero permission used to fail silently, leaving paid deposits "due".
  const [xeroProblem, setXeroProblem] = useState<string | null>(null);
  const syncXero = trpc.xero.syncAll.useMutation({
    onSuccess: (r) => {
      const err = (r as any).lastError as string | null | undefined;
      setXeroProblem(err ?? null);
      if (r.skipped) return;
      if (r.paymentsImported > 0) {
        toast.success(`Imported ${r.paymentsImported} payment${r.paymentsImported === 1 ? "" : "s"} from Xero (${fmtNZD(r.amountImported)})`);
      } else if (r.statusChanges > 0) {
        toast.success(`Updated ${r.statusChanges} invoice status${r.statusChanges === 1 ? "" : "es"} from Xero`);
      }
      // Imported payments and invoice statuses move money on every screen
      // (Deposits Due, Invoices sent, month tiles), so refresh them all.
      if (r.paymentsImported > 0 || r.statusChanges > 0) invalidateMoney(utils);
    },
    onError: (e) => setXeroProblem(e.message || "Xero didn't answer"),
  });
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current || !xeroStatus?.connected) return;
    autoSynced.current = true;
    syncXero.mutate({});
  }, [xeroStatus?.connected]);

  const update = trpc.bookings.update.useMutation({
    onSuccess: () => {
      // Ticking a deposit paid / settling moves the money on every screen.
      invalidateMoney(utils);
    },
    onError: () => toast.error("Failed to update — try again"),
  });

  const all: Row[] = useMemo(() => (data as Row[] | undefined) ?? [], [data]);

  // Close off past events in bulk: tick the ones that are done, mark them settled.
  const [settleIds, setSettleIds] = useState<Set<number>>(new Set());
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [settling, setSettling] = useState<{ done: number; total: number } | null>(null);
  const settleOne = trpc.bookings.update.useMutation();
  const toggleSettle = (id: number) => setSettleIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Per-event flags used for filtering + the summary.
  // A deposit secures a FUTURE date. Once the event has happened an unpaid
  // deposit is moot (the final bill covers it), so it no longer counts as due —
  // this alone was keeping months-old events in "Needs action".
  const isDepositDue = (r: Row) => r.depositRequired && !r.depositPaid && isFuture(r);
  const chipsSettled = (r: Row) =>
    (!r.depositRequired || r.depositPaid || !isFuture(r)) && r.foodStatus === "paid" && r.drinksStatus === "paid";
  const isFuture = (r: Row) => !r.eventDate || new Date(r.eventDate).getTime() >= startOfToday();
  // A stream settling on the night needs nothing until the event has happened.
  const streamNeedsAction = (r: Row, status: string) =>
    status === "to_invoice" || status === "invoiced" || (status === "on_night" && !isFuture(r));
  // The Overview "Deposits due" tile: confirmed events from today on whose deposit is
  // required and unpaid (same rule as server/needsAttention.ts countDepositsDue).
  const isUpcomingDepositDue = (r: Row) => r.status === "confirmed" && isDepositDue(r) && !!r.eventDate && isFuture(r);
  // The Overview "Revenue this month" tile: this month's bookings (not
  // cancelled) with no total, which it can't count (same rule as server/db.ts).
  const isThisMonthNoTotal = (r: Row) => {
    if (r.hasPrice || r.status === "cancelled" || !r.eventDate) return false;
    if (r.eventType === NBI_IMPORT_EVENT_TYPE) return false; // table reservations, not events
    const d = new Date(r.eventDate), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
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
    else if (filter === "deposits") list = list.filter(isUpcomingDepositDue);
    else if (filter === "no_total") list = list.filter(isThisMonthNoTotal);
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

  // Close off past events: food and drinks marked paid, and an unpaid deposit
  // recorded as "not taken" (never as paid — no money is invented).
  const settlePast = async (ids: number[]) => {
    setSettling({ done: 0, total: ids.length });
    let ok = 0;
    for (const id of ids) {
      const r = all.find(x => x.bookingId === id);
      if (!r) continue;
      try {
        await settleOne.mutateAsync({
          id, foodStatus: "paid", drinksStatus: "paid",
          ...(r.depositRequired && !r.depositPaid ? { depositRequired: false } : {}),
        } as any);
        ok++;
      } catch { /* counted below */ }
      setSettling({ done: ok, total: ids.length });
    }
    setSettling(null);
    setConfirmSettle(false);
    setSettleIds(new Set());
    invalidateMoney(utils);
    if (ok === ids.length) toast.success(`${ok} past event${ok === 1 ? "" : "s"} marked settled`);
    else toast.error(`${ok} of ${ids.length} marked settled — try the rest again`);
  };

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

  // ── Grouping: most urgent first. Overdue = the event has happened and money
  // is still owed or something is still open; Due soon = a deposit due, a bill
  // still to send, or an invoice out for an event in the next 14 days; On track
  // = everything else (invoiced and waiting, settling on the night, settled).
  const groupOf = (r: Row): Group => {
    if (!isFuture(r)) return (r.outstanding ?? 0) > 0 || needsAction(r) ? "overdue" : "track";
    const soon = !!r.eventDate && new Date(r.eventDate).getTime() - startOfToday() < SOON_DAYS * DAY_MS;
    if (isDepositDue(r) || r.foodStatus === "to_invoice" || r.drinksStatus === "to_invoice") return "soon";
    if (soon && (r.foodStatus === "invoiced" || r.drinksStatus === "invoiced")) return "soon";
    return "track";
  };
  const grouped = useMemo(() => {
    const g: Record<Group, Row[]> = { overdue: [], soon: [], track: [] };
    for (const r of rows) g[groupOf(r)].push(r);
    return GROUP_ORDER.map(k => ({ key: k, rows: g[k] })).filter(x => x.rows.length > 0);
  }, [rows]);

  // ── Summary strip, across every booking (not the filtered list).
  const strip = useMemo(() => {
    let pastOwed = 0, pastOwedN = 0;
    const owed: Record<Bucket, number> = { to_invoice: 0, awaiting: 0, on_night: 0, settled: 0 };
    for (const r of all) {
      const o = r.outstanding ?? 0;
      if (!isFuture(r) && o > 0) { pastOwed += o; pastOwedN++; }
      const b = bucketOf(r);
      if (b && o > 0) owed[b] += o;
    }
    return { pastOwed, pastOwedN, owed };
  }, [all]);
  const actionCount = useMemo(() => all.filter(needsAction).length, [all]);

  const gutter = !bucket && filter === "action" && rows.some(r => !isFuture(r));
  const showBucket = (b: Bucket) => { setView("events"); setBucket(bucket === b ? null : b); setEventFilter(0); };

  return (
    // Same page frame as the other staff pages: full width, same padding.
    <div className="p-4 md:p-6 lg:px-8 lg:py-7 flex flex-col gap-4 font-sans">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex flex-col gap-1.5">
          <span className="text-[11px] font-extrabold tracking-[0.18em] text-muted-foreground">PAYMENTS</span>
          <h1 className="m-0 text-[26px] sm:text-[30px] font-semibold tracking-[-0.015em] text-foreground">Who owes what</h1>
        </div>
        {xeroStatus?.connected && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowLinkXero(true)}
              title="Link invoices raised in Xero to their events, so their payments come in"
              className={`${BTN_MD} ${BTN_O}`}>
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> Link Xero invoice{unlinkedCount > 0 ? ` (${unlinkedCount})` : ""}
            </button>
            <button
              onClick={() => syncXero.mutate({ force: true })}
              disabled={syncXero.isPending}
              title="Check Xero for invoices that have been reconciled and bring those payments in"
              className={`${BTN_MD} ${BTN_O}`}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncXero.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
              {syncXero.isPending ? "Syncing…" : "Sync Xero"}
            </button>
            <button
              onClick={() => setShowNewInvoice(true)}
              title="Create a new invoice in Xero — bill an enquiry or a new contact"
              className={`${BTN_MD} ${BTN_P}`}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New invoice
            </button>
          </div>
        )}
      </header>

      {/* Xero refused us: say so plainly and offer the fix (it isn't a wait). */}
      {xeroProblem && (() => {
        const help = xeroErrorHelp(xeroProblem);
        return (
          <Callout role="alert" tone="red" title={help.title}
            action={help.reconnect ? <a href={XERO_SETTINGS_URL} className={`${BTN_SM} ${BTN_P}`}>Reconnect Xero</a> : undefined}>
            {help.detail}
          </Callout>
        );
      })()}

      {/* Summary — across every booking (not the filtered list). The bucket
          tiles are a funnel (each booking lands in exactly one) and each one
          filters the Bookings list to it; the last tile is the headline. */}
      {!isLoading && !isError && (
        <section aria-label={`Summary across all ${all.length} booking${all.length === 1 ? "" : "s"}`}
          className="grid grid-cols-2 sm:grid-cols-5 gap-[1.5px] bg-border border-[1.5px] border-input rounded-[8px] overflow-hidden">
          <StripTile label="Still owed · past events" value={fmtNZD(strip.pastOwed)}
            note={strip.pastOwedN > 0 ? `${strip.pastOwedN} event${strip.pastOwedN === 1 ? "" : "s"}` : "nothing owed"}
            noteColor={strip.pastOwedN > 0 ? SIG.red : undefined}
            selected={view === "events" && !bucket && filter === "action"}
            ariaLabel={`Still owed on past events: ${fmtNZD(strip.pastOwed)} across ${strip.pastOwedN} event${strip.pastOwedN === 1 ? "" : "s"}. Show bookings that need action.`}
            onClick={() => { setView("events"); setFilter("action"); setBucket(null); setEventFilter(0); }} />
          {(["to_invoice", "awaiting", "on_night", "settled"] as const).map(b => {
            const n = summary[b];
            const note = b === "settled" ? "all paid"
              : b === "on_night" ? "settle on the night"
              : strip.owed[b] > 0 ? `${fmtNZD(strip.owed[b])} outstanding` : `booking${n === 1 ? "" : "s"}`;
            return (
              <StripTile key={b} label={BUCKET_LABEL[b]} value={String(n)} note={note}
                noteColor={b === "to_invoice" && n > 0 ? SIG.amber : undefined}
                inverted={b === "settled"} selected={view === "events" && bucket === b}
                className={b === "settled" ? "col-span-2 sm:col-span-1" : ""}
                ariaLabel={`${BUCKET_LABEL[b]}: ${n} booking${n === 1 ? "" : "s"}. ${bucket === b ? "Showing these — press to show all." : "Show these."}`}
                onClick={() => showBucket(b)} />
            );
          })}
        </section>
      )}

      {/* View switcher — a real tab set: arrow keys / Home / End move between tabs. */}
      <div className="flex gap-1 border-b-[1.5px] border-border overflow-x-auto" role="tablist" aria-label="Payments view">
        {TABS.map(([k, lbl], i) => (
          <button key={k} ref={el => { tabRefs.current[i] = el; }}
            id={`pay-tab-${k}`} role="tab" aria-selected={view === k} aria-controls="pay-tabpanel"
            tabIndex={view === k ? 0 : -1}
            onClick={() => setView(k)} onKeyDown={e => onTabKey(e, i)}
            className="vf-tab">
            {lbl}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="pay-tabpanel" aria-labelledby={`pay-tab-${view}`} className="flex flex-col gap-3">
      {/* Toolbar: the filter pills (Bookings) on the left, find on the right. */}
      <div className="flex items-center gap-2 flex-wrap">
        {view === "events" && (
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Which bookings to show">
            {([["action", "Needs action"], ["deposits", "Deposits due"], ["no_total", "No total set"], ["upcoming", "Upcoming"], ["all", "All"]] as const).map(([id, lbl]) => {
              const on = !bucket && filter === id;
              return (
                <button key={id} aria-pressed={on} onClick={() => { setFilter(id); setBucket(null); }} className={pillCls(on)}>
                  {lbl}{id === "action" && actionCount > 0 ? <span className="tabular-nums"> · {actionCount}</span> : null}
                </button>
              );
            })}
            {bucket && (
              <button onClick={() => setBucket(null)} aria-label={`Clear filter: ${BUCKET_LABEL[bucket]}`} className={pillCls(true)}>
                {BUCKET_LABEL[bucket]} <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto flex-wrap sm:flex-nowrap">
          {view === "events" && (
            <select
              value={eventFilter}
              onChange={e => setEventFilter(Number(e.target.value))}
              aria-label="Jump to one booking"
              className={`${INPUT} w-full sm:w-52 px-2`}
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
          <div className="relative w-full sm:w-60 flex-shrink-0">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={q}
              // Typing a search clears any "jump to one booking" selection, so the
              // two filters don't silently fight. It now searches whichever tab
              // you're on (it used to do nothing on Invoices sent / Received).
              onChange={e => { setQ(e.target.value); if (eventFilter) setEventFilter(0); }}
              aria-label={searchLabel}
              placeholder={searchPlaceholder}
              className={`${INPUT} w-full pl-8 pr-3`}
            />
          </div>
        </div>
      </div>

      {xeroStatus?.connected && unlinkedCount > 0 && (view === "invoices" || view === "received") && (
        <Callout role="status" tone="amber"
          title={`${unlinkedCount} invoice${unlinkedCount === 1 ? "" : "s"} in Xero ${unlinkedCount === 1 ? "isn't" : "aren't"} linked to an event`}
          action={<button onClick={() => setShowLinkXero(true)} className={`${BTN_SM} ${BTN_O}`}><Link2 className="w-3.5 h-3.5" aria-hidden="true" /> Link them</button>}>
          So {unlinkedCount === 1 ? "it doesn't" : "they don't"} show here and {unlinkedCount === 1 ? "its" : "their"} payments never come in.
        </Callout>
      )}

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

      {/* Past events still owing — the default Upcoming view would otherwise hide them. */}
      {!bucket && filter === "upcoming" && !eventFilter && pastNeedingAction.length > 0 && (
        <Callout tone="amber"
          title={pastNeedingAction.length === 1 ? "1 past event still needs something done" : `${pastNeedingAction.length} past events still need something done`}
          action={<button onClick={() => setFilter("action")} className={`${BTN_SM} ${BTN_O}`}>Show {pastNeedingAction.length === 1 ? "it" : "them"}</button>}>
          Upcoming hides events that have happened, so a bill to send or chase can sit here unseen.
        </Callout>
      )}

      {/* Close off past events in bulk (Needs action shows them). */}
      {!bucket && filter === "action" && (() => {
        const pastIds = rows.filter(r => !isFuture(r)).map(r => r.bookingId);
        if (pastIds.length === 0) return null;
        const picked = [...settleIds].filter(id => pastIds.includes(id));
        return (
          <div className="flex items-center justify-between gap-3 flex-wrap rounded-[8px] border-[1.5px] border-border bg-card px-3.5 py-2.5">
            <p className="text-[13px] text-foreground">
              {picked.length > 0
                ? `${picked.length} past event${picked.length === 1 ? "" : "s"} ticked.`
                : "Already dealt with some of these past events? Tick them and mark them settled."}
            </p>
            <div className="flex items-center gap-2">
              <button className={`${BTN_SM} ${BTN_O}`} disabled={!!settling}
                onClick={() => setSettleIds(picked.length === pastIds.length ? new Set() : new Set(pastIds))}>
                {picked.length === pastIds.length ? "Clear" : `Tick all ${pastIds.length}`}
              </button>
              {confirmSettle ? (
                <>
                  <button className={`${BTN_SM} ${BTN_O}`} disabled={!!settling} onClick={() => setConfirmSettle(false)}>Cancel</button>
                  <button className={`${BTN_SM} ${BTN_P}`} disabled={!!settling || picked.length === 0} onClick={() => settlePast(picked)}>
                    {settling ? `Settling ${settling.done}/${settling.total}…` : `Yes, settle ${picked.length}`}
                  </button>
                </>
              ) : (
                <button className={`${BTN_SM} ${BTN_P}`} disabled={picked.length === 0} onClick={() => setConfirmSettle(true)}>
                  Mark {picked.length || ""} settled
                </button>
              )}
            </div>
            {confirmSettle && (
              <p className="basis-full text-[12px] text-muted-foreground">
                Food and drinks become Paid; an unpaid deposit is recorded as not taken. No payments are recorded, so nothing changes in Xero.
              </p>
            )}
          </div>
        );
      })()}

      {/* Rows */}
      {isError ? (
        <div className="text-center py-16">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" style={{ color: SIG.red }} aria-hidden="true" />
          <p className="text-foreground text-sm mb-3">Couldn't load payments.</p>
          <button onClick={() => refetch()} className={`${BTN_MD} ${BTN_P}`}>Retry</button>
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading payments…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: SIG.green }} aria-hidden="true" />
          <p className="text-muted-foreground text-sm">
            {q ? "No bookings match your search." : bucket ? `Nothing in "${BUCKET_LABEL[bucket]}" right now.` : filter === "action" ? "Nothing needs action — you're all caught up." : filter === "no_total" ? "Every booking this month has a total." : "No events yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">Tap a status to change it.</span>
            <span className="text-[12px] text-muted-foreground tabular-nums" aria-live="polite">{rows.length} booking{rows.length === 1 ? "" : "s"}</span>
          </div>
          {/* Column heads (wide screens). With tick boxes showing, every row
              keeps the same left gutter so the columns still line up. */}
          <div aria-hidden="true"
            className={`hidden lg:grid ${ROW_COLS} gap-3.5 text-[10.5px] font-extrabold tracking-[0.16em] text-muted-foreground ${gutter ? "pl-[46px] pr-4" : "px-4"}`}>
            <span>BOOKING</span><span>EVENT</span><span>DEPOSIT · FOOD · DRINKS</span><span className="text-right">BALANCE</span><span />
          </div>
          {grouped.map(({ key, rows: list }) => (
            <section key={key} aria-label={`${GROUP_TITLE[key]}: ${list.length}`} className="flex flex-col gap-2">
              <SectionHead title={GROUP_TITLE[key]} count={list.length} tone={key === "overdue" ? "red" : undefined} />
              <ul className="flex flex-col gap-2" aria-label={`Bookings — ${GROUP_TITLE[key].toLowerCase()}`}>
                {list.map(r => (
                  <li key={r.bookingId}>
                    <EventRow row={r} group={key}
                      onFood={(v) => setStream(r, "foodStatus", v)}
                      onDrinks={(v) => setStream(r, "drinksStatus", v)}
                      onDeposit={(next) => setDeposit(r, next)}
                      onOpen={() => navigate(`/event/${r.bookingId}`)}
                      onRecord={() => navigate(recordUrl(r))}
                      onXero={() => setXeroFor(r)}
                      onMarkAllPaid={() => markAllPaid(r)}
                      busy={update.isPending || !!settling}
                      past={!isFuture(r)}
                      depositDue={isDepositDue(r)}
                      selectable={!bucket && filter === "action" && !isFuture(r)}
                      gutter={gutter}
                      selected={settleIds.has(r.bookingId)}
                      onSelect={() => toggleSettle(r.bookingId)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
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

      {showLinkXero && <LinkXeroInvoiceDialog onClose={() => setShowLinkXero(false)} />}

      {showNewInvoice && (
        <NewInvoiceDialog
          onClose={() => setShowNewInvoice(false)}
          onCreated={() => { utils.xero.eventInvoices.invalidate(); setView("invoices"); }}
        />
      )}
    </div>
  );
}

function jumpLabel(r: Row) {
  return `${r.name}${r.eventDate ? ` — ${fmtDateTz(r.eventDate, "short")}` : ""}`;
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
  /** Only a Xero draft exists and no request was emailed: the client hasn't been asked yet. */
  draft: boolean;
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
    const day = (t: number) => fmtDateTz(t, "dayMonth");
    const how: string[] = [];
    if (emailedAt != null) how.push(`Request emailed ${day(emailedAt)}`);
    if (inv) how.push(`Xero ${inv.invoiceNumber ?? "invoice"}${inv.status === "DRAFT" ? " (draft — not sent from Xero yet)" : ""} ${day(invAt!)}`);
    const paid = r.depositPaid || inv?.status === "PAID";
    // A draft never left Xero, so nobody is "waiting" on it yet.
    const draft = !paid && (inv?.status === "DRAFT" || inv?.status === "SUBMITTED") && emailedAt == null;
    out.push({
      row: r,
      amount: inv && inv.total > 0 ? inv.total : r.depositNzd,
      sentAt,
      how,
      paid,
      draft,
      waitingDays: paid || draft ? null : Math.floor((Date.now() - sentAt) / DAY_MS),
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
    let waiting = 0, waitingN = 0, paid = 0, paidN = 0, chase = 0, drafts = 0, draftAmt = 0;
    for (const e of entries) {
      if (e.paid) { paid += e.amount; paidN++; }
      else if (e.draft) { drafts++; draftAmt += e.amount; }
      else { waiting += e.amount; waitingN++; if ((e.waitingDays ?? 0) >= CHASE_AFTER_DAYS) chase++; }
    }
    return { waiting, waitingN, paid, paidN, chase, drafts, draftAmt };
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

  if (loading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading deposits…</div>;
  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
        <p className="text-foreground text-sm">No deposits sent yet.</p>
        <p className="text-muted-foreground text-xs mt-1">Request one from a booking's payment page, or send a deposit invoice with the Xero button — it will show up here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-[1.5px] bg-border border-[1.5px] border-input rounded-[8px] overflow-hidden">
        <div className="bg-card px-4 py-3 flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Waiting · {totals.waitingN}</span>
          <span className="text-[26px] leading-tight font-semibold tabular-nums text-foreground">{fmtNZD(totals.waiting)}</span>
          {totals.chase > 0 && <span className="text-[12px] font-semibold" style={{ color: SIG.amber }}>{totals.chase} waiting {CHASE_AFTER_DAYS}+ days</span>}
          {totals.drafts > 0 && <span className="text-[12px] font-semibold text-muted-foreground">+ {totals.drafts} draft{totals.drafts === 1 ? "" : "s"} ({fmtNZD(totals.draftAmt)}) not sent from Xero yet</span>}
        </div>
        <div className="bg-primary text-primary-foreground px-4 py-3 flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary-foreground/80">Paid · {totals.paidN}</span>
          <span className="text-[26px] leading-tight font-semibold tabular-nums">{fmtNZD(totals.paid)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Which deposits to show">
        {([["waiting", "Waiting"], ["paid", "Paid"], ["all", "All"]] as const).map(([k, lbl]) => (
          <button key={k} aria-pressed={only === k} onClick={() => setOnly(k)} className={pillCls(only === k)}>
            {lbl}
          </button>
        ))}
        <span className="text-[12px] text-muted-foreground ml-auto tabular-nums" aria-live="polite">{list.length} deposit{list.length === 1 ? "" : "s"}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">
          {q ? "No deposits match your search." : only === "waiting" ? "No deposits waiting — everything sent has been paid." : "Nothing here yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Deposits sent">
          {list.map(e => {
            const r = e.row;
            const chase = !e.paid && (e.waitingDays ?? 0) >= CHASE_AFTER_DAYS;
            const sig: { label: string; tone: Tone } = e.paid
              ? { label: "Paid", tone: "green" }
              : e.draft
                ? { label: "Draft · not sent yet", tone: "muted" }
              : chase
                ? { label: `Waiting ${e.waitingDays} days`, tone: "amber" }
                : { label: e.waitingDays === 0 ? "Sent today" : `Waiting ${e.waitingDays} day${e.waitingDays === 1 ? "" : "s"}`, tone: "blue" };
            return (
              <li key={r.bookingId} className="bg-card border-[1.5px] border-border rounded-[8px] px-4 py-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left group" aria-label={`Open ${r.name}'s booking`}>
                    <div className="text-[14.5px] font-semibold text-foreground truncate group-hover:underline">{r.name}</div>
                    <div className="text-[12px] text-muted-foreground truncate">{fmtDate(r.eventDate)}{r.eventType ? ` · ${r.eventType}` : ""}</div>
                  </button>
                  <Sig tone={sig.tone} className="hidden sm:inline-flex">{sig.label}</Sig>
                  <span className="text-[16px] font-semibold text-foreground tabular-nums w-20 sm:w-24 text-right">{fmtNZD(e.amount)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                  <Sig tone={sig.tone} className="sm:hidden">{sig.label}</Sig>
                  <span className="text-[12px] text-muted-foreground">{e.how.join(" · ")}</span>
                  {!e.paid && (
                    <span className="ml-auto flex items-center gap-2">
                      {e.draft ? (
                        // A reminder for an invoice the client never got would confuse them.
                        <span className="text-[12px] text-muted-foreground">Approve it in Xero to send it</span>
                      ) : (
                      <button onClick={() => sendReminder(r)} disabled={remind.isPending} className={`${BTN_SM} ${BTN_O}`}>
                        Email reminder
                      </button>
                      )}
                      <button onClick={() => onRecord(r)} className={`${BTN_SM} ${chase ? BTN_P : BTN_O}`}>
                        Record payment
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

  if (loading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading invoices…</div>;
  const anyAtAll = rows.some(r => r.invoices.length > 0);
  if (!anyAtAll) {
    return (
      <div className="text-center py-16">
        <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
        <p className="text-foreground text-sm">No invoices sent to Xero yet.</p>
        <p className="text-muted-foreground text-xs mt-1">Use the Xero button on a booking to send a food, drinks or deposit invoice — it will appear here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-[1.5px] bg-border border-[1.5px] border-input rounded-[8px] overflow-hidden">
        <div className="bg-card px-4 py-3 flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Not yet paid</span>
          <span className="text-[26px] leading-tight font-semibold tabular-nums text-foreground">{fmtNZD(totals.out)}</span>
        </div>
        <div className="bg-primary text-primary-foreground px-4 py-3 flex flex-col gap-1">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary-foreground/80">Paid</span>
          <span className="text-[26px] leading-tight font-semibold tabular-nums">{fmtNZD(totals.paid)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Which invoices to show">
        {([["all", "All"], ["open", "Not yet paid"], ["paid", "Paid"]] as const).map(([k, lbl]) => (
          <button key={k} aria-pressed={only === k} onClick={() => setOnly(k)} className={pillCls(only === k)}>
            {lbl}
          </button>
        ))}
        <span className="text-[12px] text-muted-foreground ml-auto tabular-nums" aria-live="polite">{list.length} invoice{list.length === 1 ? "" : "s"}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground text-sm">{q ? "No invoices match your search." : "No invoices match this filter."}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Invoices sent to Xero">
          {list.map(({ inv, row }) => {
            const st = invoiceState(inv.status);
            return (
              <li key={inv.id}>
                <button onClick={() => onOpen(row)}
                  className="w-full bg-card border-[1.5px] border-border rounded-[8px] px-4 py-3 flex items-center gap-3 text-left hover:border-primary transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold text-foreground truncate" style={{ textDecoration: st.strike ? "line-through" : undefined }}>
                      {inv.invoiceNumber ?? "Invoice"} <span className="text-[12px] font-normal text-muted-foreground">· {STREAM_LABEL[inv.stream] ?? inv.stream}</span>
                    </div>
                    <div className="text-[12px] text-muted-foreground truncate">
                      {row.name} · {fmtDate(row.eventDate)} · sent {fmtDateTz(inv.createdAt, "dayMonth")}{inv.sentBy ? ` by ${inv.sentBy}` : ""}
                    </div>
                  </div>
                  <span title={st.hint}><Sig color={invoiceTone(inv.status)}>{st.label}</Sig></span>
                  <span className="text-[16px] font-semibold text-foreground tabular-nums w-24 text-right">{fmtNZD(inv.total)}</span>
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

/** "today", "in 3 days", "in 3 wks", "11 days ago" — how far off the event is. */
function relDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((day - startOfToday()) / DAY_MS);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n < 0) return -n < 60 ? `${-n} days ago` : `${Math.round(-n / 30)} mths ago`;
  if (n < 14) return `in ${n} days`;
  if (n < 63) return `in ${Math.round(n / 7)} wks`;
  return `in ${Math.round(n / 30)} mths`;
}

function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s&]/gu, " ").split(/\s+/).filter(p => p && p !== "&");
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** One cell of the summary strip. A button: each one filters the Bookings list. */
function StripTile({ label, value, note, noteColor, inverted, selected, onClick, ariaLabel, className = "" }: {
  label: string; value: string; note: string; noteColor?: string; inverted?: boolean; selected: boolean;
  onClick: () => void; ariaLabel: string; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} aria-label={ariaLabel}
      className={`text-left px-4 py-3 sm:px-[18px] sm:py-3.5 flex flex-col gap-1 min-w-0 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary ${className} ${
        inverted ? "bg-primary text-primary-foreground hover:brightness-110" : selected ? "bg-accent" : "bg-card hover:bg-accent/60"}`}
      style={selected ? { boxShadow: `inset 0 -3px 0 ${inverted ? "#fff" : "var(--primary)"}` } : undefined}>
      <span className={`text-[10px] font-extrabold uppercase tracking-[0.16em] leading-snug ${inverted ? "text-primary-foreground/80" : selected ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
      <span className="text-[26px] leading-tight font-semibold tabular-nums">{value}</span>
      <span className={`text-[12px] font-semibold ${inverted ? "text-primary-foreground/80" : "text-muted-foreground"}`}
        style={!inverted && noteColor ? { color: noteColor } : undefined}>{note}</span>
    </button>
  );
}

// A status (dot + label) that opens a menu of its states (arrow keys, Enter,
// Escape all work, and screen readers hear which one is selected).
function StatusChip<V extends string>({ label, state, value, options, onChange, disabled, title, locked, who }: {
  label: string; state: keyof typeof CHIP; value: V; disabled?: boolean; title?: string;
  /** Whose booking it is: every row has the same chips, so the name says which. */
  who?: string;
  options: Array<{ value: V; label: string; state: keyof typeof CHIP }>;
  onChange: (v: V) => void;
  /** The state comes from Xero, so picking another here wouldn't stick: show it, don't offer a menu. */
  locked?: boolean;
}) {
  const c = CHIP[state];
  if (locked) {
    return (
      <span title={title} className="inline-flex items-center h-7">
        <Sig color={c.color} size="sm">{label}</Sig>
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" title={title} aria-label={who ? `${label}: ${who}` : undefined}
          className="inline-flex items-center gap-1 h-7 -mx-1.5 px-1.5 rounded-[6px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary cursor-pointer transition-colors disabled:opacity-50">
          <Sig color={c.color} size="sm">{label}</Sig>
          <ChevronDown className="w-3 h-3" style={{ color: c.color }} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => { if (v !== value) onChange(v as V); }}>
          {options.map(o => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="py-2">
              <Sig color={CHIP[o.state].color} size="sm">{o.label}</Sig>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EventRow({ row, group, onFood, onDrinks, onDeposit, onOpen, onRecord, onXero, onMarkAllPaid, busy, past, depositDue, selectable, gutter, selected, onSelect }: {
  row: Row; group: Group; onFood: (v: FoodStatus) => void; onDrinks: (v: DrinksStatus) => void; onDeposit: (next: "due" | "paid" | "not_taken") => void;
  onOpen: () => void; onRecord: () => void; onXero: () => void; onMarkAllPaid: () => void; busy: boolean;
  /** The event has happened. */
  past?: boolean;
  /** A deposit is required, unpaid, and the event is still ahead. */
  depositDue?: boolean;
  /** Show a tick box for closing off past events in bulk. */
  selectable?: boolean; selected?: boolean; onSelect?: () => void;
  /** Some rows in the list have tick boxes: keep the same left gutter. */
  gutter?: boolean;
}) {
  // Deposit — Due / Paid / Not taken, all in one menu so "no deposit"
  // can be undone where it was set.
  const depositValue: "due" | "paid" | "not_taken" = !row.depositRequired ? "not_taken" : row.depositPaid ? "paid" : "due";
  // No made-up figure: the deposit used to show "$575" (one venue's standard
  // amount) whenever none was set on the booking.
  const depAmt = row.depositNzd > 0 ? `${fmtNZD(row.depositNzd)} ` : "";
  // After the event an unpaid deposit is moot: shown quietly, not as a to-do.
  const depositMoot = !!past && row.depositRequired && !row.depositPaid;
  const depositLabel = !row.depositRequired ? "No deposit"
    : row.depositPaidInXero ? `Deposit ${depAmt}paid in Xero`
    : row.depositPaid ? `Deposit ${depAmt}paid`
    : depositMoot ? "No deposit taken"
    : row.depositDraft ? "Deposit · draft in Xero"
    : row.depositNzd > 0 ? `Deposit ${depAmt}due` : "Deposit due · no amount set";
  const depositChip = (
    <StatusChip label={depositLabel} state={!row.depositRequired || depositMoot ? "none" : row.depositPaid ? "paid" : "todo"}
      value={depositValue} disabled={busy} locked={row.depositPaidInXero} who={row.name}
      title={row.depositPaidInXero ? "Paid in Xero — the payment hasn't come into VenueFlow yet"
        : row.depositDraft ? "A draft deposit invoice is waiting in Xero — approve it there to send it"
        : "Choose the deposit status"}
      options={[
        { value: "due", label: "Due", state: "todo" },
        { value: "paid", label: "Paid", state: "paid" },
        { value: "not_taken", label: "Not taken", state: "none" },
      ]}
      onChange={onDeposit} />
  );

  // Once the event has passed, a bill still to send or still unpaid is late.
  const stateFor = (s: string): keyof typeof CHIP =>
    s === "paid" ? "paid"
    : past && (s === "to_invoice" || s === "invoiced") ? "late"
    : s === "invoiced" ? "invoiced" : s === "on_night" ? (past ? "late" : "night") : "todo";
  // What Xero says beats the stored status: a draft hasn't reached the client,
  // and an invoice paid in Xero is paid.
  const streamWord = (status: string, contra?: boolean, draft?: boolean, xeroPaid?: boolean) =>
    contra && status === "paid" ? "contra"
    : xeroPaid ? "paid in Xero"
    : draft ? "draft in Xero"
    : labelFor(status).toLowerCase();
  const draftTitle = "A draft invoice is waiting in Xero — approve it there to send it (this updates on the next Xero sync)";
  const foodChip = (
    <StatusChip label={`Food ${streamWord(row.foodStatus, row.foodContra, row.foodDraft, row.foodPaidInXero)}`} state={stateFor(row.foodStatus)}
      value={row.foodStatus} disabled={busy} locked={row.foodDraft || row.foodPaidInXero} who={row.name}
      title={row.foodDraft ? draftTitle : row.foodPaidInXero ? "Paid in Xero" : "Choose the food payment status"}
      options={STREAM_STATES} onChange={v => onFood(v as FoodStatus)} />
  );
  // An inferred drinks status is spelled out ("suggested"), not a bare "?".
  const suggested = row.drinksInferred && row.drinksStatus !== "paid";
  const drinksChip = (
    <StatusChip label={`Drinks ${streamWord(row.drinksStatus, row.drinksContra, row.drinksDraft, row.drinksPaidInXero)}${suggested ? " (suggested)" : ""}`} state={stateFor(row.drinksStatus)}
      value={row.drinksStatus} disabled={busy} locked={row.drinksDraft || row.drinksPaidInXero} who={row.name}
      title={row.drinksDraft ? draftTitle : row.drinksPaidInXero ? "Paid in Xero" : suggested ? "Suggested from the bar setup — choose to confirm or change it" : "Choose the drinks payment status"}
      options={STREAM_STATES} onChange={v => onDrinks(v as DrinksStatus)} />
  );

  const settled = (!row.depositRequired || row.depositPaid || depositMoot) && row.foodStatus === "paid" && row.drinksStatus === "paid";
  const owed = row.outstanding ?? 0;
  // Overdue only once the event has happened. A future booking with its deposit
  // due used to show its WHOLE balance in red as "OVERDUE" weeks in advance.
  const isOverdue = owed > 0 && !!past;
  // The money ledger says it's all in, but the statuses still say otherwise.
  const ledgerPaid = row.hasPrice && owed === 0 && row.paidToDate > 0;
  const toInvoice = row.foodStatus === "to_invoice" || row.drinksStatus === "to_invoice";
  const invoiced = row.foodStatus === "invoiced" || row.drinksStatus === "invoiced";
  const onNight = row.foodStatus === "on_night" || row.drinksStatus === "on_night";
  const sentCount = row.invoices.filter(i => i.status !== "VOIDED").length;
  const xeroAria = `Xero invoices for ${row.name}${row.invoices.length > 0 ? ` (${sentCount} sent)` : ""}`;

  // The one signal for the row: why it sits in its section.
  const daysLate = row.eventDate ? Math.max(0, Math.round((startOfToday() - new Date(row.eventDate).setHours(0, 0, 0, 0)) / DAY_MS)) : 0;
  const signal: { tone: Tone; text: string } =
    group === "overdue"
      ? (owed > 0 ? { tone: "red", text: daysLate > 0 ? `Owed · ${daysLate}d late` : "Owed" } : { tone: "red", text: "Still to close off" })
    : group === "soon"
      ? (depositDue ? { tone: "amber", text: "Deposit due" } : toInvoice ? { tone: "amber", text: "To invoice" } : { tone: "amber", text: "Invoice out" })
    : settled ? { tone: "green", text: ledgerPaid ? "Paid in full" : "Settled" }
    : invoiced ? { tone: "blue", text: "Invoiced · waiting" }
    : onNight ? { tone: "night", text: "On the night" }
    : { tone: "muted", text: "Nothing due yet" };

  // One action per row — the next thing to do. The rest sit under "More".
  const action: { label: string; aria: string; icon: React.ReactNode; onClick: () => void } =
    isOverdue ? { label: "Record payment", aria: `Record a payment for ${row.name}`, icon: <DollarSign className="w-3.5 h-3.5" aria-hidden="true" />, onClick: onRecord }
    : (depositDue || toInvoice) ? { label: "Send invoice", aria: xeroAria, icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" />, onClick: onXero }
    : (invoiced || owed > 0) ? { label: "Record", aria: `Record a payment for ${row.name}`, icon: <DollarSign className="w-3.5 h-3.5" aria-hidden="true" />, onClick: onRecord }
    : { label: "Open", aria: `Open ${row.name}`, icon: <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />, onClick: onOpen };
  const actionPrimary = group === "overdue";

  const sub = [row.eventType, row.spaceName].filter(Boolean).join(" · ");

  return (
    <div className="flex items-stretch rounded-[8px] border-[1.5px] transition-shadow hover:shadow-sm"
      style={{ background: selected ? "var(--accent)" : "var(--card)", borderColor: selected ? "var(--primary)" : "var(--border)" }}>
      {selectable && (
        <label className="flex items-center justify-center w-11 flex-shrink-0 cursor-pointer" title="Tick to mark settled">
          <input type="checkbox" checked={!!selected} onChange={onSelect} disabled={busy}
            aria-label={`Tick ${row.name} to mark settled`} className="w-4 h-4 accent-[#2f5488]" />
        </label>
      )}
      {!selectable && gutter && <span className="hidden lg:block w-11 flex-shrink-0" aria-hidden="true" />}
      <div className={`flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 ${ROW_COLS} gap-x-3.5 gap-y-2.5 items-center py-3 ${selectable ? "pl-0 pr-4" : gutter ? "px-4 lg:pl-0" : "px-4"}`}>
        {/* Booking — named by what it shows (name, type, space, guests): an
            "Open …" label didn't contain the visible words, so voice control
            ("click Grace Holloway") couldn't reach it. */}
        <button onClick={onOpen} className="text-left min-w-0 flex items-center gap-2.5 group">
          <span aria-hidden="true" className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-bold"
            style={{ background: selected ? "var(--card)" : "var(--accent)", color: "var(--primary)" }}>{initialsOf(row.name)}</span>
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold text-foreground truncate group-hover:underline">{row.name}</span>
            {(sub || row.guestCount) && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground min-w-0">
                {sub && <span className="truncate">{sub}</span>}
                {row.guestCount ? <span className="flex items-center gap-0.5 flex-shrink-0 tabular-nums">{sub && <span aria-hidden="true">·</span>}<Users className="w-3 h-3" aria-hidden="true" />{row.guestCount}<span className="sr-only"> guests</span></span> : null}
              </span>
            )}
          </span>
        </button>

        {/* Event date */}
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-foreground whitespace-nowrap">{fmtDate(row.eventDate)}</div>
          {row.eventDate && <div className="text-[12px] text-muted-foreground whitespace-nowrap">{relDay(row.eventDate)}</div>}
        </div>

        {/* Deposit · food · drinks */}
        <div className="min-w-0 flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-x-3.5 gap-y-0.5 flex-wrap pl-1.5">
            {depositChip}
            {foodChip}
            {drinksChip}
          </div>
          {/* Which invoices have actually been sent to Xero, and where each stands */}
          {row.invoices.length > 0 && (
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap" aria-label="Invoices sent to Xero">
              {row.invoices.map(inv => {
                const st = invoiceState(inv.status);
                return (
                  <button key={inv.id} onClick={onXero} title={`${st.hint}${inv.sentBy ? ` · sent by ${inv.sentBy}` : ""} — click to manage`}
                    className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                    style={{ textDecoration: st.strike ? "line-through" : undefined }}>
                    <FileText className="w-3 h-3 flex-shrink-0" aria-hidden />
                    <span className="font-semibold">{STREAM_LABEL[inv.stream] ?? inv.stream} {inv.invoiceNumber ?? ""}</span>
                    <span>· {st.label}</span>
                    <span className="tabular-nums">· {fmtNZD(inv.total)}</span>
                  </button>
                );
              })}
            </div>
          )}
          {/* When the statuses and the recorded money disagree, say so and offer the fix. */}
          {settled && owed > 0 && (
            <p className="text-[12px] flex items-center gap-1.5 flex-wrap" style={{ color: "#6b4710" }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              Marked paid, but {fmtNZD(owed)} isn't recorded as received.
              <button onClick={onRecord} className="font-semibold underline underline-offset-2 hover:no-underline">Record it</button>
            </p>
          )}
          {!settled && ledgerPaid && (
            <p className="text-[12px] flex items-center gap-1.5 flex-wrap" style={{ color: SIG.green }}>
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              All {fmtNZD(row.total)} has been received.
              <button onClick={onMarkAllPaid} disabled={busy} className="font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-50">Mark everything paid</button>
            </p>
          )}
        </div>

        {/* Balance — the amount owed leads; red only once it's overdue. */}
        <div className="min-w-0 flex flex-col gap-0.5 lg:items-end lg:text-right">
          {owed > 0 ? (
            <div className="text-[16px] font-semibold tabular-nums leading-tight" style={{ color: isOverdue ? SIG.red : "var(--foreground)" }}>{fmtNZD(owed)}</div>
          ) : row.paidToDate > 0 && !row.hasPrice ? (
            // Without a total there's nothing to be "in full" of — say what came in.
            <div className="text-[16px] font-semibold tabular-nums leading-tight text-foreground">{fmtNZD(row.paidToDate)} <span className="text-[12px] font-normal text-muted-foreground">received</span></div>
          ) : row.hasPrice ? (
            <div className="text-[16px] font-semibold tabular-nums leading-tight text-foreground">{fmtNZD(0)}</div>
          ) : null}
          <Sig tone={signal.tone} size="sm">{signal.text}</Sig>
          {owed > 0 && row.paidToDate > 0 && <div className="text-[12px] text-muted-foreground tabular-nums">{fmtNZD(row.paidToDate)} paid</div>}
          {!row.hasPrice && (
            <div className="text-[12px] flex items-center gap-1 lg:justify-end" style={{ color: "#6b4710" }} title="No total set on this booking">
              <AlertCircle className="w-3 h-3" aria-hidden="true" /> No total set
            </div>
          )}
        </div>

        {/* One action, plus the rest under More */}
        <div className="flex items-center gap-1.5 sm:justify-end">
          <button onClick={action.onClick} aria-label={action.aria}
            className={`${BTN_SM} flex-1 lg:flex-none ${actionPrimary ? BTN_P : BTN_O}`}>
            {action.icon} {action.label}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More for ${row.name}`} title="More"
                className={`${BTN} h-8 w-8 ${BTN_O}`}>
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
              <DropdownMenuItem onSelect={onXero} aria-label={xeroAria} title="Send a deposit, food or drinks invoice to Xero as a draft">
                <FileText className="w-3.5 h-3.5" aria-hidden="true" /> Xero invoices{row.invoices.length > 0 ? ` · ${sentCount}` : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onRecord} aria-label={`Record a payment for ${row.name}`}>
                <DollarSign className="w-3.5 h-3.5" aria-hidden="true" /> Record a payment
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpen} aria-label={`Open ${row.name}`}>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> Open booking
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
