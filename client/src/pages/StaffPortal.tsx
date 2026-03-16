import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Clock, Calendar, ChefHat, UtensilsCrossed,
  AlertCircle, CheckCircle2, Loader2, User, Phone, Mail,
  Building2, DollarSign,
} from "lucide-react";

// ─── Categories (matches RunsheetBuilder exactly) ────────────────────────────
const CATEGORIES: Record<string, { label: string; color: string; dot: string }> = {
  setup:         { label: "Setup",         color: "bg-blue-100 text-blue-700",   dot: "bg-blue-400" },
  guest:         { label: "Guest",         color: "bg-purple-100 text-purple-700", dot: "bg-purple-400" },
  food:          { label: "Food",          color: "bg-amber-100 text-amber-700", dot: "bg-amber-400" },
  beverage:      { label: "Beverage",      color: "bg-green-100 text-green-700", dot: "bg-green-400" },
  speech:        { label: "Speech",        color: "bg-pink-100 text-pink-700",   dot: "bg-pink-400" },
  entertainment: { label: "Entertainment", color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-400" },
  packdown:      { label: "Packdown",      color: "bg-gray-100 text-gray-700",   dot: "bg-gray-400" },
  other:         { label: "Other",         color: "bg-stone-100 text-stone-600", dot: "bg-stone-400" },
};

const COURSES = ['Canapes', 'Entree', 'Main', 'Dessert', 'Cheese', 'Late Night Snack', 'Breakfast', 'Morning Tea', 'Lunch', 'Afternoon Tea', 'Drinks', 'Other'];

function getCat(cat: string) {
  return CATEGORIES[cat] ?? CATEGORIES.other;
}

function formatTime12(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function addMinutes(time: string, mins: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "TBC";
  const date = new Date(d);
  return date.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function StaffPortal() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const { data, isLoading, error } = trpc.staffPortal.getByToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-forest/40 mx-auto" />
          <p className="font-dm text-ink/50 text-sm">Loading runsheet…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="font-bebas tracking-widest text-xl text-ink">LINK NOT FOUND</h1>
          <p className="font-dm text-ink/50 text-sm">
            This staff portal link may have expired or been revoked. Please ask your venue manager for a new link.
          </p>
        </div>
      </div>
    );
  }

  const { runsheet, items, fnb, contactName, contactEmail, contactPhone } = data;
  const payments: any[] = (data as any).payments ?? [];

  const sortedItems = [...items].sort((a, b) => {
    if (a.time < b.time) return -1;
    if (a.time > b.time) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const fohItems = fnb.filter(f => f.section === "foh");
  const kitchenItems = fnb.filter(f => f.section === "kitchen");

  const fohByCourse: Record<string, typeof fohItems> = {};
  for (const item of fohItems) {
    const course = item.course ?? "Other";
    if (!fohByCourse[course]) fohByCourse[course] = [];
    fohByCourse[course].push(item);
  }

  const kitchenByCourse: Record<string, typeof kitchenItems> = {};
  for (const item of kitchenItems) {
    const course = item.course ?? "Other";
    if (!kitchenByCourse[course]) kitchenByCourse[course] = [];
    kitchenByCourse[course].push(item);
  }

  const orderedFohCourses = COURSES.filter(c => fohByCourse[c]);
  const orderedKitchenCourses = COURSES.filter(c => kitchenByCourse[c]);

  return (
    <div className="min-h-screen bg-linen">
      {/* ── Header ── */}
      <header className="bg-forest sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-bebas tracking-widest text-white/60 text-xs">FUNCTION RUNSHEET — STAFF COPY</p>
            <h1 className="font-bebas tracking-widest text-white text-lg leading-tight">{runsheet.title}</h1>
          </div>
          <div className="flex items-center gap-1.5 bg-white/15 px-3 py-1.5 rounded-sm">
            <CheckCircle2 className="w-3.5 h-3.5 text-white/80" />
            <span className="font-bebas tracking-widest text-white/90 text-xs">LIVE</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* ── Event Details ── */}
        <div className="bg-white border border-gold/30 shadow-sm">
          <div className="px-5 py-3 border-b border-gold/30 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-forest" />
            <span className="font-bebas tracking-widest text-sm text-forest">EVENT DETAILS</span>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-0.5">DATE</p>
                <p className="font-dm text-sm font-semibold text-ink">{formatDate(runsheet.eventDate)}</p>
              </div>
              <div>
                <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-0.5">EVENT TYPE</p>
                <p className="font-dm text-sm font-semibold text-ink">{runsheet.eventType || "—"}</p>
              </div>
              <div>
                <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-0.5">VENUE / SPACE</p>
                <p className="font-dm text-sm font-semibold text-ink">{runsheet.spaceName || "—"}</p>
              </div>
              <div>
                <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-0.5">GUESTS</p>
                <p className="font-dm text-sm font-semibold text-ink">{runsheet.guestCount ?? "TBC"}</p>
              </div>
            </div>

            {/* Contact info */}
            {(contactName || contactEmail || contactPhone) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gold/30">
                {contactName && (
                  <div>
                    <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-0.5 flex items-center gap-1">
                      <User className="w-3 h-3" /> CLIENT NAME
                    </p>
                    <p className="font-dm text-sm text-ink">{contactName}</p>
                  </div>
                )}
                {contactPhone && (
                  <div>
                    <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-0.5 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> PHONE
                    </p>
                    <p className="font-dm text-sm text-ink">{contactPhone}</p>
                  </div>
                )}
                {contactEmail && (
                  <div>
                    <p className="font-bebas tracking-widest text-[10px] text-ink/40 mb-0.5 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> EMAIL
                    </p>
                    <p className="font-dm text-sm text-ink">{contactEmail}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Venue Setup ── */}
        {runsheet.venueSetup && (
          <div className="bg-white border border-gold/30 shadow-sm">
            <div className="px-5 py-3 border-b border-gold/30 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-forest" />
              <span className="font-bebas tracking-widest text-sm text-forest">VENUE SETUP</span>
            </div>
            <div className="px-5 py-4">
              <p className="font-dm text-sm text-ink/80 whitespace-pre-wrap">{runsheet.venueSetup}</p>
            </div>
          </div>
        )}

        {/* ── Dietary Requirements ── */}
        {runsheet.dietaries && runsheet.dietaries.length > 0 && (
          <div className="bg-white border border-gold/30 shadow-sm">
            <div className="px-5 py-3 border-b border-gold/30 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="font-bebas tracking-widest text-sm text-amber-600">DIETARY REQUIREMENTS</span>
            </div>
            <div className="px-5 py-4 flex flex-wrap gap-2">
              {runsheet.dietaries.map((d, i) => (
                <span
                  key={i}
                  className="font-dm text-xs bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5"
                >
                  <span className="font-semibold">{d.name}</span>
                  <span className="mx-1 text-amber-500">×</span>
                  <span>{d.count}</span>
                  {d.notes && <span className="ml-1 text-amber-600">({d.notes})</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Notes ── */}
        {runsheet.notes && (
          <div className="bg-white border border-gold/30 shadow-sm">
            <div className="px-5 py-3 border-b border-gold/30">
              <span className="font-bebas tracking-widest text-sm text-ink/60">GENERAL NOTES</span>
            </div>
            <div className="px-5 py-4">
              <p className="font-dm text-sm text-ink/80 whitespace-pre-wrap">{runsheet.notes}</p>
            </div>
          </div>
        )}

        {/* ── Timeline ── */}
        {sortedItems.length > 0 && (
          <div className="bg-white border border-gold/30 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gold/30 bg-forest">
              <Clock className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">EVENT TIMELINE</span>
              {sortedItems.length > 0 && (
                <span className="font-dm text-white/60 text-xs ml-1">
                  {formatTime12(sortedItems[0].time)} – {formatTime12(addMinutes(sortedItems[sortedItems.length - 1].time, sortedItems[sortedItems.length - 1].duration ?? 0))}
                </span>
              )}
            </div>
            <div className="divide-y divide-gold/20">
              {sortedItems.map((item, idx) => {
                const cat = getCat(item.category);
                const endTime = item.duration ? addMinutes(item.time, item.duration) : null;
                return (
                  <div key={item.id ?? idx} className="flex items-stretch">
                    {/* Time column */}
                    <div className="w-[90px] flex-shrink-0 px-4 py-3 border-r border-gold/30 text-right">
                      <p className="font-dm text-sm font-bold text-ink">{formatTime12(item.time)}</p>
                    </div>
                    {/* Content */}
                    <div className="flex-1 px-3 py-3 min-w-0">
                      <p className="font-dm text-sm font-semibold text-ink">{item.title}</p>
                      {item.description && (
                        <p className="font-dm text-sm text-ink/60 mt-1">{item.description}</p>
                      )}
                      {item.assignedTo && (
                        <p className="font-dm text-xs text-forest/70 mt-1">→ {item.assignedTo}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── F&B: FOH ── */}
        {fohItems.length > 0 && (
          <div className="bg-white border border-gold/30 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gold/30 bg-forest">
              <UtensilsCrossed className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">FRONT OF HOUSE — F&amp;B SHEET</span>
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_60px_80px_90px_1fr_1fr] gap-2 px-5 py-2 border-b border-gold/30 bg-gold/5">
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">DISH</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">QTY</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">DIETARY</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">SERVICE TIME</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">STAFF</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">NOTES</span>
            </div>
            {orderedFohCourses.map(course => (
              <div key={course}>
                <div className="px-5 py-1.5 font-bebas tracking-widest text-xs border-b border-gold/30 bg-gold/10 text-[#a07820]">
                  {course}
                </div>
                {fohByCourse[course].map((item, idx) => (
                  <div
                    key={item.id ?? idx}
                    className="grid grid-cols-[1fr_60px_80px_90px_1fr_1fr] gap-2 px-5 py-2.5 items-center border-b border-gold/20 text-sm font-dm hover:bg-linen/50"
                  >
                    <span className="font-medium text-ink">{item.dishName}</span>
                    <span className="text-ink/70">{item.qty}</span>
                    <span className="text-ink/60 text-xs">{item.dietary || "—"}</span>
                    <span className="text-ink/60 text-xs">{item.serviceTime ? formatTime12(item.serviceTime) : "—"}</span>
                    <span className="text-ink/60 text-xs">{item.staffAssigned || "—"}</span>
                    <span className="text-ink/50 text-xs">{(item as any).platingNotes || "—"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── F&B: Kitchen ── */}
        {kitchenItems.length > 0 && (
          <div className="bg-white border border-gold/30 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gold/30 bg-forest">
              <ChefHat className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">KITCHEN SHEET</span>
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_60px_80px_90px_1fr_1fr] gap-2 px-5 py-2 border-b border-gold/30 bg-gold/5">
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">DISH</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">QTY</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">DIETARY</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">SERVICE TIME</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">PREP NOTES</span>
              <span className="font-bebas tracking-widest text-[10px] text-ink/40">PLATING</span>
            </div>
            {orderedKitchenCourses.map(course => (
              <div key={course}>
                <div className="px-5 py-1.5 font-bebas tracking-widest text-xs border-b border-gold/30 bg-gold/10 text-[#a07820]">
                  {course}
                </div>
                {kitchenByCourse[course].map((item, idx) => (
                  <div
                    key={item.id ?? idx}
                    className="grid grid-cols-[1fr_60px_80px_90px_1fr_1fr] gap-2 px-5 py-2.5 items-center border-b border-gold/20 text-sm font-dm hover:bg-linen/50"
                  >
                    <span className="font-medium text-ink">{item.dishName}</span>
                    <span className="text-ink/70">{item.qty}</span>
                    <span className="text-ink/60 text-xs">{item.dietary || "—"}</span>
                    <span className="text-ink/60 text-xs">{item.serviceTime ? formatTime12(item.serviceTime) : "—"}</span>
                    <span className="text-ink/50 text-xs">{(item as any).prepNotes || "—"}</span>
                    <span className="text-ink/50 text-xs">{(item as any).platingNotes || "—"}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {sortedItems.length === 0 && fohItems.length === 0 && kitchenItems.length === 0 && (
          <div className="text-center py-16 text-ink/30 font-dm text-sm">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
            No items have been added to this runsheet yet.
          </div>
        )}

        {/* ── Payments ── */}
        {payments && payments.length > 0 && (
          <div className="bg-white border border-gold/30 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gold/30 bg-forest">
              <DollarSign className="w-4 h-4 text-white" />
              <span className="font-bebas tracking-widest text-sm text-white">PAYMENT SUMMARY</span>
            </div>
            <div className="divide-y divide-gold/20">
              {/* Column headers */}
              <div className="grid grid-cols-[120px_1fr_120px_100px] gap-2 px-5 py-2 bg-gold/5">
                <span className="font-bebas tracking-widest text-[10px] text-ink/40">DATE</span>
                <span className="font-bebas tracking-widest text-[10px] text-ink/40">TYPE / METHOD</span>
                <span className="font-bebas tracking-widest text-[10px] text-ink/40">AMOUNT</span>
                <span className="font-bebas tracking-widest text-[10px] text-ink/40">NOTES</span>
              </div>
              {payments.map((p: any) => (
                <div key={p.id} className="grid grid-cols-[120px_1fr_120px_100px] gap-2 px-5 py-3 items-center text-sm font-dm">
                  <span className="text-ink/70 text-xs">
                    {p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </span>
                  <div>
                    <span className="font-bebas tracking-widest text-xs bg-gold/20 text-[#7a5c10] px-2 py-0.5 mr-1">{p.type?.toUpperCase()}</span>
                    <span className="text-ink/50 text-xs">{p.method?.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="font-semibold text-forest">
                    ${Number(p.amount).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-ink/40 text-xs truncate">{p.notes || "—"}</span>
                </div>
              ))}
              {/* Total */}
              <div className="grid grid-cols-[120px_1fr_120px_100px] gap-2 px-5 py-3 items-center bg-linen/60">
                <span></span>
                <span className="font-bebas tracking-widest text-xs text-ink/50">TOTAL RECEIVED</span>
                <span className="font-bebas tracking-widest text-sm text-forest">
                  ${payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="text-center font-bebas tracking-widest text-xs text-ink/30 pb-8">
          POWERED BY VENUEFLOWHQ · THIS PAGE UPDATES AUTOMATICALLY
        </div>
      </main>
    </div>
  );
}
