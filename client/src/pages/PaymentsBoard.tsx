import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import XeroPushModal from "@/components/XeroPushModal";
import {
  DollarSign, FileText, Clock, CheckCircle2, Moon, Search,
  CalendarDays, Users, AlertCircle, ExternalLink,
} from "lucide-react";

// ─── Types mirror the server payments.overview shape ────────────────────────
type FoodStatus = "to_invoice" | "invoiced" | "paid";
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
const FOOD_CYCLE: FoodStatus[] = ["to_invoice", "invoiced", "paid"];
const DRINKS_CYCLE: DrinksStatus[] = ["on_night", "to_invoice", "invoiced", "paid"];
const nextIn = <T,>(cycle: T[], cur: T): T => cycle[(cycle.indexOf(cur) + 1) % cycle.length];

export default function PaymentsBoard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  // Default to Upcoming: the day-to-day question is "what's coming up and where
  // is its money at", not "what's overdue".
  const [filter, setFilter] = useState<"action" | "upcoming" | "all">("upcoming");
  const [xeroFor, setXeroFor] = useState<Row | null>(null);

  const { data, isLoading, isError, refetch } = trpc.payments.overview.useQuery(undefined, { refetchOnWindowFocus: true });

  const update = trpc.bookings.update.useMutation({
    onSuccess: (_d, vars: any) => {
      utils.payments.overview.invalidate();
      utils.bookings.list.invalidate();
      let msg = "Updated";
      if (vars.depositPaid !== undefined) msg = vars.depositPaid ? "Deposit marked as paid" : "Deposit marked as pending";
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
  const needsAction = (r: Row) =>
    isDepositDue(r) ||
    r.foodStatus !== "paid" ||
    r.drinksStatus === "to_invoice" || r.drinksStatus === "invoiced" ||
    (r.drinksStatus === "on_night" && !isFuture(r)); // on-night that's already happened → collect/confirm

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
    const onNight = all.filter(r => r.drinksStatus === "on_night" && isFuture(r)).length;
    const settled = all.filter(isFullySettled).length;
    return { toInvoice, awaiting, onNight, settled };
  }, [all]);

  const setFood = (r: Row, next: FoodStatus) => update.mutate({ id: r.bookingId, foodStatus: next } as any);
  const setDrinks = (r: Row, next: DrinksStatus) => update.mutate({ id: r.bookingId, drinksStatus: next } as any);
  const setDeposit = (r: Row, paid: boolean) => update.mutate({ id: r.bookingId, depositPaid: paid } as any);

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
        Tap a chip to advance its status. Deposit ($575) is deducted off the drinks bill.
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
              onFood={() => setFood(r, nextIn(FOOD_CYCLE, r.foodStatus))}
              onDrinks={() => setDrinks(r, nextIn(DRINKS_CYCLE, r.drinksStatus))}
              onDeposit={() => setDeposit(r, !r.depositPaid)}
              onOpen={() => navigate(`/event/${r.bookingId}`)}
              onRecord={() => navigate(`/payments?bookingId=${r.bookingId}`)}
              onXero={() => setXeroFor(r)}
              busy={update.isPending}
            />
          ))}
        </div>
      )}

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
function Chip({ label, state, onClick, title, disabled }: {
  label: string; state: keyof typeof CHIP; onClick?: () => void; title?: string; disabled?: boolean;
}) {
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
  row: Row; onFood: () => void; onDrinks: () => void; onDeposit: () => void;
  onOpen: () => void; onRecord: () => void; onXero: () => void; busy: boolean;
}) {
  // Deposit chip
  const depositChip = !row.depositRequired
    ? <Chip label="No deposit" state="none" disabled title="This event doesn't require a deposit" />
    : row.depositPaid
      ? <Chip label={`Deposit ${fmtNZD(row.depositNzd || DEFAULT_DEPOSIT)} paid`} state="paid" onClick={onDeposit} disabled={busy} title="Tap to mark as pending" />
      : <Chip label={`Deposit ${fmtNZD(row.depositNzd || DEFAULT_DEPOSIT)} due`} state="todo" onClick={onDeposit} disabled={busy} title="Tap to mark as paid" />;

  // Food chip
  const foodState: keyof typeof CHIP = row.foodStatus === "paid" ? "paid" : row.foodStatus === "invoiced" ? "invoiced" : "todo";
  const foodChip = <Chip label={`Food · ${labelFor(row.foodStatus)}`} state={foodState} onClick={onFood} disabled={busy}
    title="Tap: To invoice → Invoiced → Paid" />;

  // Drinks chip
  const drinksState: keyof typeof CHIP = row.drinksStatus === "paid" ? "paid"
    : row.drinksStatus === "invoiced" ? "invoiced"
    : row.drinksStatus === "on_night" ? "night" : "todo";
  const drinksLabel = `Drinks · ${labelFor(row.drinksStatus)}${row.drinksInferred && row.drinksStatus !== "paid" ? "?" : ""}`;
  const drinksChip = <Chip label={drinksLabel} state={drinksState} onClick={onDrinks} disabled={busy}
    title={row.drinksInferred ? "Suggested from the bar setup — tap to confirm/change: On the night → To invoice → Invoiced → Paid" : "Tap: On the night → To invoice → Invoiced → Paid"} />;

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
