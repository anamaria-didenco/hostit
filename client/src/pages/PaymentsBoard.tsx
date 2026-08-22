import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import XeroPushModal from "@/components/XeroPushModal";
import PaymentsReceived from "@/components/PaymentsReceived";
import {
  DollarSign, FileText, Clock, CheckCircle2, Moon, Search,
  CalendarDays, Users, AlertCircle, ExternalLink, RefreshCw, Check, ChevronDown,
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
  onNightSignal: boolean;
  foodStatus: FoodStatus;
  drinksStatus: DrinksStatus;
  drinksInferred: boolean;
}

const fmtNZD = (n: number) =>
  n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "No date";

const DEFAULT_DEPOSIT = 575; // Bar Franco standard deposit to secure an event.

// Chip palette by state.
const CHIP = {
  todo:     { bg: "#fef3c7", text: "#92400e", label: "to do" },      // amber — needs action
  invoiced: { bg: "#dbeafe", text: "#1e40af", label: "invoiced" },   // blue — awaiting payment
  night:    { bg: "#ede9fe", text: "#5b21b6", label: "on night" },   // purple — settling on the night
  paid:     { bg: "#dcfce7", text: "#166534", label: "paid" },       // green — done
  none:     { bg: "#f1f0ec", text: "#8a8578", label: "n/a" },        // grey — not applicable
} as const;

// Forward-cycle helpers — one click advances to the next state, looping round.
// Each chip's selectable statuses. Chips used to CYCLE on click — getting from
// "to invoice" to "paid" meant tapping through every state in between, and one
// tap too many wrapped back to the start. Now the chip opens this list and the
// wanted state is picked directly.
const FOOD_STATES: Array<{ value: FoodStatus; label: string; state: keyof typeof CHIP }> = [
  { value: "on_night", label: "On the night", state: "night" },
  { value: "to_invoice", label: "To invoice", state: "todo" },
  { value: "invoiced", label: "Invoiced", state: "invoiced" },
  { value: "paid", label: "Paid", state: "paid" },
];
const DRINKS_STATES: Array<{ value: DrinksStatus; label: string; state: keyof typeof CHIP }> = [
  { value: "on_night", label: "On the night", state: "night" },
  { value: "to_invoice", label: "To invoice", state: "todo" },
  { value: "invoiced", label: "Invoiced", state: "invoiced" },
  { value: "paid", label: "Paid", state: "paid" },
];

export default function PaymentsBoard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  // Default to Upcoming: the day-to-day question is "what's coming up and where
  // is its money at", not "what's overdue".
  const [filter, setFilter] = useState<"action" | "upcoming" | "all">("upcoming");
  const [xeroFor, setXeroFor] = useState<Row | null>(null);
  // "Events" tracks where each event's money is up to; "Received" is the ledger
  // of money that actually landed — the view that reconciles against the bank.
  const [view, setView] = useState<"events" | "received">("events");

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
    onSuccess: (_d, vars: any) => {
      utils.payments.overview.invalidate();
      utils.bookings.list.invalidate();
      let msg = "Updated";
      if (vars.depositRequired === false) msg = "No deposit for this event";
      else if (vars.depositPaid !== undefined) msg = vars.depositPaid ? "Deposit marked as paid" : "Deposit marked as pending";
      else if (vars.foodStatus !== undefined) msg = `Food · ${labelFor(vars.foodStatus)}`;
      else if (vars.drinksStatus !== undefined) msg = `Drinks · ${labelFor(vars.drinksStatus)}`;
      toast.success(msg);
    },
    onError: () => toast.error("Failed to update — try again"),
  });

  const all: Row[] = useMemo(() => (data as Row[] | undefined) ?? [], [data]);

  // Per-event flags used for filtering + the summary.
  const isDepositDue = (r: Row) => r.depositRequired && !r.depositPaid;
  const isFullySettled = (r: Row) =>
    (!r.depositRequired || r.depositPaid) && r.foodStatus === "paid" && r.drinksStatus === "paid";
  const isFuture = (r: Row) => !r.eventDate || new Date(r.eventDate).getTime() >= startOfToday();
  // A stream settling on the night needs nothing until the event has happened.
  const streamNeedsAction = (r: Row, status: string) =>
    status === "to_invoice" || status === "invoiced" || (status === "on_night" && !isFuture(r));
  const needsAction = (r: Row) =>
    isDepositDue(r) || streamNeedsAction(r, r.foodStatus) || streamNeedsAction(r, r.drinksStatus);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = all.filter(r =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      (r.eventType ?? "").toLowerCase().includes(needle) ||
      (r.spaceName ?? "").toLowerCase().includes(needle));
    if (filter === "action") list = list.filter(needsAction);
    else if (filter === "upcoming") list = list.filter(isFuture);
    // Sort: soonest event first for action/upcoming; most recent first for all.
    const ts = (r: Row) => (r.eventDate ? new Date(r.eventDate).getTime() : Number.MAX_SAFE_INTEGER);
    if (filter === "all") list = [...list].sort((a, b) => (b.eventDate ? new Date(b.eventDate).getTime() : 0) - (a.eventDate ? new Date(a.eventDate).getTime() : 0));
    else list = [...list].sort((a, b) => ts(a) - ts(b));
    return list;
  }, [all, q, filter]);

  const summary = useMemo(() => {
    const toInvoice = all.filter(r => r.foodStatus === "to_invoice" || r.drinksStatus === "to_invoice").length;
    const awaiting = all.filter(r => isDepositDue(r) || r.foodStatus === "invoiced" || r.drinksStatus === "invoiced").length;
    const onNight = all.filter(r => (r.drinksStatus === "on_night" || r.foodStatus === "on_night") && isFuture(r)).length;
    const settled = all.filter(isFullySettled).length;
    return { toInvoice, awaiting, onNight, settled };
  }, [all]);

  const setFood = (r: Row, next: FoodStatus) => update.mutate({ id: r.bookingId, foodStatus: next } as any);
  const setDrinks = (r: Row, next: DrinksStatus) => update.mutate({ id: r.bookingId, drinksStatus: next } as any);
  // "Not taken" flips depositRequired off (the server clears the paid flag with
  // it); the other two turn it back on, so a deposit can be reinstated from
  // the same menu it was dismissed from.
  const setDeposit = (r: Row, next: "due" | "paid" | "not_taken") => update.mutate(
    next === "not_taken"
      ? ({ id: r.bookingId, depositRequired: false } as any)
      : ({ id: r.bookingId, depositRequired: true, depositPaid: next === "paid" } as any)
  );

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="font-cormorant text-3xl font-semibold text-ink flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-forest" /> Payments
          </h1>
          <p className="font-dm text-sm text-sage mt-0.5">
            Deposit, food and drinks tracked per event — so the team always knows who to invoice, who's paid, and who's settling on the night.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
        {xeroStatus?.connected && (
          <button
            onClick={() => syncXero.mutate({ force: true })}
            disabled={syncXero.isPending}
            title="Check Xero for invoices that have been reconciled and bring those payments in"
            className="font-bebas tracking-widest text-[11px] text-blue-800 border border-blue-800/30 rounded-md px-3 py-2 hover:bg-blue-800/5 transition-colors flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${syncXero.isPending ? "animate-spin" : ""}`} />
            {syncXero.isPending ? "SYNCING…" : "SYNC XERO"}
          </button>
        )}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-sage absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search payments by client, event type or space"
            placeholder="Search client, type, space…"
            className="w-full pl-9 pr-3 py-2 border border-gold/30 bg-cream font-dm text-sm text-ink rounded-md focus:outline-none focus:border-forest"
          />
        </div>
        </div>
      </div>

      {/* View switcher */}
      <div className="flex gap-1.5 mb-4 border-b border-gold/20" role="tablist" aria-label="Payments view">
        {([["events", "Events"], ["received", "Received"]] as const).map(([k, lbl]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
            className={`font-bebas tracking-widest text-sm px-4 py-2.5 border-b-2 -mb-px transition-colors ${
              view === k ? "border-forest text-forest" : "border-transparent text-sage hover:text-ink"}`}>
            {lbl}
          </button>
        ))}
      </div>

      {view === "received" ? <PaymentsReceived /> : (<>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="To invoice" value={String(summary.toInvoice)} tone="amber" icon={<FileText className="w-4 h-4" />} />
        <SummaryCard label="Awaiting payment" value={String(summary.awaiting)} tone="blue" icon={<Clock className="w-4 h-4" />} />
        <SummaryCard label="Paying on the night" value={String(summary.onNight)} tone="purple" icon={<Moon className="w-4 h-4" />} />
        <SummaryCard label="Fully settled" value={String(summary.settled)} tone="green" icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 mb-3">
        {([["action", "Needs action"], ["upcoming", "Upcoming"], ["all", "All events"]] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`font-bebas tracking-widest text-xs px-3 py-1.5 rounded-md transition-colors ${
              filter === id ? "bg-forest text-cream" : "bg-cream text-sage hover:text-ink border border-gold/20"}`}>
            {lbl}
          </button>
        ))}
        <span className="font-dm text-xs text-sage ml-auto">{rows.length} event{rows.length === 1 ? "" : "s"}</span>
      </div>

      {/* Legend */}
      <p className="font-dm text-[11px] text-sage/80 mb-3">
        Tap a chip to choose its status. Deposit ($575) is deducted off the drinks bill.
      </p>

      {/* Rows */}
      {isError ? (
        <div className="text-center py-16">
          <AlertCircle className="w-8 h-8 text-red-500/70 mx-auto mb-2" />
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
          <CheckCircle2 className="w-8 h-8 text-green-600/60 mx-auto mb-2" />
          <p className="font-dm text-sage text-sm">
            {q ? "No events match your search." : filter === "action" ? "Nothing needs action — you're all caught up." : "No events yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(r => (
            <EventRow key={r.bookingId} row={r}
              onFood={(v) => setFood(r, v)}
              onDrinks={(v) => setDrinks(r, v)}
              onDeposit={(next) => setDeposit(r, next)}
              onOpen={() => navigate(`/event/${r.bookingId}`)}
              onRecord={() => navigate(`/payments?bookingId=${r.bookingId}`)}
              onXero={() => setXeroFor(r)}
              busy={update.isPending}
            />
          ))}
        </div>
      )}

      </>)}

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
        initialStream={xeroFor && xeroFor.foodStatus === "paid" ? "drinks" : "food"}
      />
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

function SummaryCard({ label, value, tone, icon }: {
  label: string; value: string; tone: "amber" | "blue" | "purple" | "green"; icon: React.ReactNode;
}) {
  const toneCls: Record<string, string> = {
    amber: "text-amber-700", blue: "text-blue-700", purple: "text-purple-700", green: "text-green-700",
  };
  return (
    <div className="bg-white border border-gold/20 rounded-lg p-3.5">
      <div className="flex items-center gap-1.5 font-bebas tracking-widest text-[11px] text-sage mb-1">
        <span className={toneCls[tone]}>{icon}</span> {label}
      </div>
      <div className={`font-cormorant text-3xl font-semibold ${toneCls[tone]} leading-none`}>{value}</div>
    </div>
  );
}

// A single tappable status chip.
function Chip({ label, state, onClick, title, disabled, menu }: {
  label: string; state: keyof typeof CHIP; onClick?: () => void; title?: string; disabled?: boolean;
  /** When set, the chip opens this picker instead of firing onClick. */
  menu?: { options: Array<{ label: string; state: keyof typeof CHIP; selected: boolean; onPick: () => void }> };
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (menu) {
    const c = CHIP[state];
    return (
      <div ref={wrapRef} className="relative inline-block">
        <button onClick={() => setOpen(o => !o)} disabled={disabled} title={title}
          aria-haspopup="listbox" aria-expanded={open}
          className="font-bebas tracking-widest text-[11px] px-2.5 py-1 rounded-md transition-transform active:scale-95 disabled:opacity-50 whitespace-nowrap inline-flex items-center gap-1"
          style={{ background: c.bg, color: c.text }}>
          {label} <ChevronDown className="w-3 h-3 -mr-0.5" aria-hidden="true" />
        </button>
        {open && (
          <div role="listbox" className="absolute left-0 top-full mt-1 z-50 min-w-[10rem] bg-white border border-gold/25 rounded-md shadow-lg py-1">
            {menu.options.map(o => {
              const oc = CHIP[o.state];
              return (
                <button key={o.label} role="option" aria-selected={o.selected}
                  onClick={() => { setOpen(false); if (!o.selected) o.onPick(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-linen/70">
                  <span className="w-3.5 flex-none">{o.selected && <Check className="w-3.5 h-3.5 text-forest" aria-hidden="true" />}</span>
                  <span className="font-bebas tracking-widest text-[11px] px-2 py-0.5 rounded" style={{ background: oc.bg, color: oc.text }}>{o.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  const c = CHIP[state];
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="font-bebas tracking-widest text-[11px] px-2.5 py-1 rounded-md transition-transform active:scale-95 disabled:opacity-50 whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}>
      {label}
    </button>
  );
}

function EventRow({ row, onFood, onDrinks, onDeposit, onOpen, onRecord, onXero, busy }: {
  row: Row; onFood: (v: FoodStatus) => void; onDrinks: (v: DrinksStatus) => void; onDeposit: (next: "due" | "paid" | "not_taken") => void;
  onOpen: () => void; onRecord: () => void; onXero: () => void; busy: boolean;
}) {
  // Deposit chip — Due / Paid / Not taken. "No deposit" used to be a dead
  // chip, so undoing it meant opening the event; it's the same menu now.
  const depositMenu = {
    options: [
      { label: "Due", state: "todo" as const, selected: row.depositRequired && !row.depositPaid, onPick: () => onDeposit("due") },
      { label: "Paid", state: "paid" as const, selected: row.depositRequired && row.depositPaid, onPick: () => onDeposit("paid") },
      { label: "Not taken", state: "none" as const, selected: !row.depositRequired, onPick: () => onDeposit("not_taken") },
    ],
  };
  const depositChip = !row.depositRequired
    ? <Chip label="No deposit" state="none" disabled={busy} title="No deposit for this event — choose Due or Paid to reinstate one" menu={depositMenu} />
    : <Chip
        label={`Deposit ${fmtNZD(row.depositNzd || DEFAULT_DEPOSIT)} ${row.depositPaid ? "paid" : "due"}`}
        state={row.depositPaid ? "paid" : "todo"} disabled={busy} title="Choose the deposit status"
        menu={depositMenu} />;

  // Food chip
  const foodState: keyof typeof CHIP = row.foodStatus === "paid" ? "paid"
    : row.foodStatus === "invoiced" ? "invoiced"
    : row.foodStatus === "on_night" ? "night" : "todo";
  const foodChip = <Chip label={`Food · ${labelFor(row.foodStatus)}`} state={foodState} disabled={busy}
    title="Choose the food payment status"
    menu={{ options: FOOD_STATES.map(o => ({ label: o.label, state: o.state, selected: row.foodStatus === o.value, onPick: () => onFood(o.value) })) }} />;

  // Drinks chip
  const drinksState: keyof typeof CHIP = row.drinksStatus === "paid" ? "paid"
    : row.drinksStatus === "invoiced" ? "invoiced"
    : row.drinksStatus === "on_night" ? "night" : "todo";
  const drinksLabel = `Drinks · ${labelFor(row.drinksStatus)}${row.drinksInferred && row.drinksStatus !== "paid" ? "?" : ""}`;
  const drinksChip = <Chip label={drinksLabel} state={drinksState} disabled={busy}
    title={row.drinksInferred ? "Suggested from the bar setup — choose to confirm or change it" : "Choose the drinks payment status"}
    menu={{ options: DRINKS_STATES.map(o => ({ label: o.label, state: o.state, selected: row.drinksStatus === o.value, onPick: () => onDrinks(o.value) })) }} />;

  const settled = (!row.depositRequired || row.depositPaid) && row.foodStatus === "paid" && row.drinksStatus === "paid";

  return (
    <div className={`bg-white border rounded-lg px-3.5 py-3 flex flex-col lg:flex-row lg:items-center gap-3 ${settled ? "border-green-200/70" : "border-gold/20"}`}>
      {/* Event info */}
      <button onClick={onOpen} className="text-left min-w-0 lg:w-64 flex-shrink-0 group">
        <div className="font-cormorant text-base font-semibold text-ink truncate leading-tight group-hover:underline">{row.name}</div>
        <div className="flex items-center gap-1.5 font-dm text-[11px] text-sage mt-0.5 flex-wrap">
          <CalendarDays className="w-3 h-3 flex-shrink-0" />
          <span>{fmtDate(row.eventDate)}</span>
          {row.eventType && <><span>·</span><span className="truncate">{row.eventType}</span></>}
        </div>
        {(row.spaceName || row.guestCount) && (
          <div className="flex items-center gap-2 font-dm text-[11px] text-sage/80 mt-0.5">
            {row.spaceName && <span className="truncate">{row.spaceName}</span>}
            {row.guestCount ? <span className="flex items-center gap-0.5 flex-shrink-0"><Users className="w-3 h-3" />{row.guestCount}</span> : null}
          </div>
        )}
      </button>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 flex-wrap flex-1">
        {depositChip}
        {foodChip}
        {drinksChip}
        {!row.hasPrice && (
          <span className="font-dm text-[10px] text-amber-700 flex items-center gap-0.5" title="No total set on this event">
            <AlertCircle className="w-3 h-3" /> no total
          </span>
        )}
        {/* Money actually recorded against this event — including anything
            imported from Xero — so the ledger is visible without drilling in. */}
        {(row.paidToDate > 0 || (row.outstanding ?? 0) > 0) && (
          <span className="font-dm text-[11px] whitespace-nowrap" title="Recorded in this event's payment history">
            {row.paidToDate > 0 && <span className="text-green-700 font-semibold">{fmtNZD(row.paidToDate)} paid</span>}
            {row.paidToDate > 0 && (row.outstanding ?? 0) > 0 && <span className="text-sage"> · </span>}
            {(row.outstanding ?? 0) > 0 && <span className="text-ink/70">{fmtNZD(row.outstanding ?? 0)} left</span>}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={onXero} title="Send a food or drinks invoice to Xero as a draft"
          className="font-bebas tracking-widest text-[11px] text-blue-800 border border-blue-800/30 rounded-md px-2.5 py-1.5 hover:bg-blue-800/5 transition-colors flex items-center gap-1">
          <FileText className="w-3 h-3" /> XERO
        </button>
        <button onClick={onRecord}
          className="font-bebas tracking-widest text-[11px] text-forest border border-forest/30 rounded-md px-2.5 py-1.5 hover:bg-forest/5 transition-colors flex items-center gap-1">
          <DollarSign className="w-3 h-3" /> RECORD
        </button>
        <button onClick={onOpen}
          className="font-bebas tracking-widest text-[11px] text-sage border border-gold/20 rounded-md px-2.5 py-1.5 hover:text-ink transition-colors flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> OPEN
        </button>
      </div>
    </div>
  );
}
