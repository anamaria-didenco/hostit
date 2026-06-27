import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Loader2, CheckSquare, Square, RefreshCw, CheckCircle2, Pencil,
  Users, Utensils, Wine, Star, Fish, Megaphone, Wifi, WifiOff, MapPin, Clock, Printer,
} from "lucide-react";

const VENUE_AREA_LABELS: Record<string, string> = {
  full_venue: "Full Venue",
  restaurant: "Restaurant",
  bar: "Bar",
  private_room: "Private Room",
  garden: "Garden",
  rooftop: "Rooftop",
  terrace: "Terrace",
  function_room: "Function Room",
};

function fmt12(t?: string | null): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (isNaN(h)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

const DEFAULT_SECTION_LABELS: { key: string; label: string }[] = [
  { key: "bar", label: "Bar" },
  { key: "barFloor", label: "Bar Floor" },
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "bigTable", label: "Big Table" },
];

function parseSectionDefs(raw: string | null | undefined): { key: string; label: string }[] {
  if (!raw) return DEFAULT_SECTION_LABELS;
  try { const p = JSON.parse(raw); return Array.isArray(p) && p.length > 0 ? p : DEFAULT_SECTION_LABELS; } catch { return DEFAULT_SECTION_LABELS; }
}

const LS_KEY = "vf_staff_name";

function InfoCard({ icon: Icon, label, value, accent = false }: {
  icon: React.ElementType; label: string; value: string; accent?: boolean;
}) {
  return (
    <div className={`rounded p-4 ${accent ? "bg-[var(--brand)]/10 border border-[var(--brand)]/20" : "bg-white border border-stone-200"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${accent ? "text-[var(--brand)]" : "text-stone-400"}`} />
        <span className="font-bebas tracking-widest text-[10px] text-stone-400 uppercase">{label}</span>
      </div>
      <p className={`font-dm text-sm leading-relaxed whitespace-pre-wrap ${accent ? "text-[var(--brand)] font-medium" : "text-stone-800"}`}>{value}</p>
    </div>
  );
}

export default function ShiftRunsheetLive() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data: sr, isLoading, refetch } = trpc.shiftRunsheets.getByToken.useQuery(
    { token },
    { enabled: !!token, refetchInterval: 30000 }
  );

  const toggleMut = trpc.dailyChecklists.toggleItemByToken.useMutation({ onSuccess: () => refetch() });
  const resetMut = trpc.dailyChecklists.resetByToken.useMutation({ onSuccess: () => refetch() });

  const [optimistic, setOptimistic] = useState<Record<number, boolean>>({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const acquireWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try { wakeLockRef.current = await (navigator as any).wakeLock.request("screen"); } catch {}
  }, []);

  useEffect(() => {
    acquireWakeLock();
    const handleVisibility = () => { if (document.visibilityState === "visible") acquireWakeLock(); };
    document.addEventListener("visibilitychange", handleVisibility);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      wakeLockRef.current?.release?.().catch(() => {});
    };
  }, [acquireWakeLock]);

  const [staffName, setStaffName] = useState<string>(() => {
    try { return localStorage.getItem(LS_KEY) ?? ""; } catch { return ""; }
  });
  const [editingName, setEditingName] = useState(!staffName);
  const [nameInput, setNameInput] = useState(staffName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setOptimistic({}); }, [sr]);
  useEffect(() => { if (editingName && nameInputRef.current) nameInputRef.current.focus(); }, [editingName]);

  function saveName() {
    const t = nameInput.trim();
    if (!t) return;
    try { localStorage.setItem(LS_KEY, t); } catch {}
    setStaffName(t);
    setEditingName(false);
  }

  function handleToggle(clToken: string, itemId: number, currentChecked: boolean) {
    const next = !currentChecked;
    setOptimistic(p => ({ ...p, [itemId]: next }));
    toggleMut.mutate({ token: clToken, itemId, checked: next, checkedBy: next ? (staffName || undefined) : undefined });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[var(--brand)] animate-spin" />
      </div>
    );
  }

  if (!sr) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-bebas tracking-widest text-2xl text-stone-400">SHIFT RUNSHEET NOT FOUND</p>
          <p className="font-dm text-sm text-stone-400 mt-2">This link may be invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  const sections = sr.sections as Record<string, string> | null;
  const checklists = (sr as any).checklists as { id: number; name: string; token: string; items: any[] }[] | undefined ?? [];
  const events = ((sr as any).events ?? []) as Array<{
    id: number; bookingId: number | null; clientName: string | null; eventType: string | null;
    guestCount: number | null; venueArea: string | null; spaceName: string | null;
    eventStartTime: string | null; eventEndTime: string | null;
    drinksData: { barOption?: string; barNotes?: string; selectedDrinks?: string[]; customDrinks?: { name: string }[] } | null;
    fnb: Array<{ id: number; section?: string | null; course?: string | null; dishName: string; qty?: number | null; unitPrice?: string | null; serviceTime?: string | null; dietary?: string | null; staffAssigned?: string | null; description?: string | null }>;
  }>;
  const paymentInstructions = (sr as any).paymentInstructions as string | null | undefined;
  const fmtNzd = (n: number) => `$${n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Sum F&B (qty × unit price) across every event on this shift so duty
  // managers see the day's expected take at a glance.
  const dayFoodTotal = events.reduce((sum, ev) => sum + ev.fnb
    .filter(f => (f.course ?? '').toLowerCase() !== 'drinks')
    .reduce((s, f) => s + (Number(f.qty ?? 0) * Number(f.unitPrice ?? 0)), 0), 0);
  const dayDrinkTotal = events.reduce((sum, ev) => sum + ev.fnb
    .filter(f => (f.course ?? '').toLowerCase() === 'drinks')
    .reduce((s, f) => s + (Number(f.qty ?? 0) * Number(f.unitPrice ?? 0)), 0), 0);
  const dayGrand = dayFoodTotal + dayDrinkTotal;
  const sectionDefs = parseSectionDefs((sr as any).shiftSections);
  const venueLogoUrl = (sr as any).venueLogoUrl as string | null | undefined;
  const venueName = (sr as any).venueName as string | null | undefined;
  // White-label the live shift page to the operator's brand colour. Tailwind
  // arbitrary `[var(--brand)]` classes pull this from a CSS variable set on
  // the wrapper below. Falls back to VenueFlow's default brand blue.
  const venuePrimaryColor = ((sr as any).venuePrimaryColor as string | null | undefined) || "#2f5488";
  const brandDark = (() => {
    // Derive a slightly darker shade for hover states (approx -12% lightness)
    const m = /^#([0-9a-f]{6})$/i.exec(venuePrimaryColor);
    if (!m) return venuePrimaryColor;
    const n = parseInt(m[1], 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - 24);
    const g = Math.max(0, ((n >> 8) & 0xff) - 24);
    const b = Math.max(0, (n & 0xff) - 24);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  })();

  const dateDisplay = sr.date
    ? new Date(sr.date + "T00:00:00").toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;

  const activeSections = sectionDefs.filter(({ key }) => sections?.[key]);

  const totalChecklistItems = checklists.reduce((acc, cl) => acc + (cl.items?.length ?? 0), 0);
  const totalChecked = checklists.reduce((acc, cl) => acc + (cl.items?.filter((it: any) => {
    const opt = optimistic[it.id];
    return opt !== undefined ? opt : it.checked === 1;
  }).length ?? 0), 0);
  const hasChecklists = checklists.length > 0;
  const allChecklistsDone = hasChecklists && totalChecked === totalChecklistItems && totalChecklistItems > 0;

  const infoFields: { icon: React.ElementType; label: string; value: string; accent?: boolean }[] = [
    sr.specials ? { icon: Star, label: "Specials", value: sr.specials, accent: true } : null,
    sr.budget ? { icon: Wine, label: "Budget", value: sr.budget } : null,
    sr.specialNotes ? { icon: Users, label: "Special Notes / VIP", value: sr.specialNotes } : null,
    sr.marketFish ? { icon: Fish, label: "Market Fish", value: sr.marketFish } : null,
    sr.thingsToPush ? { icon: Megaphone, label: "Things to Push / Out of Stock", value: sr.thingsToPush } : null,
  ].filter(Boolean) as any[];

  return (
    <div className="min-h-screen bg-linen pb-32" style={{ ['--brand' as any]: venuePrimaryColor, ['--brand-dark' as any]: brandDark }}>
      {/* Venue logo */}
      {venueLogoUrl && (
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center justify-center">
          <img src={venueLogoUrl} alt={venueName ?? "Venue logo"} className="h-10 w-auto max-w-[160px] object-contain" />
        </div>
      )}

      {/* Sticky header */}
      <div className="bg-[var(--brand)] sticky top-0 z-10 shadow-md">
        <div className="max-w-2xl mx-auto px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bebas tracking-widest text-[10px] text-white/60 mb-0.5">DAILY SHIFT RUNSHEET</div>
            <h1 className="font-bebas text-xl tracking-wider text-white leading-tight">
              {dateDisplay ?? "Shift Runsheet"}
            </h1>
            {sr.dutyManager && (
              <p className="font-dm text-xs text-white/75 mt-0.5">
                Manager: <span className="text-white font-medium">{sr.dutyManager}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            <button
              onClick={() => window.print()}
              className="print:hidden flex items-center gap-1.5 bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-sm transition-colors"
              title="Print or save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-white/90" />
              <span className="font-bebas tracking-widest text-white/90 text-[11px]">PRINT</span>
            </button>
            {isOnline
              ? <Wifi className="w-4 h-4 text-white/40" />
              : <WifiOff className="w-4 h-4 text-yellow-300 animate-pulse" />
            }
            {hasChecklists && (
              <div className="text-right">
                <div className="font-bebas tracking-widest text-sm text-white leading-none">
                  {totalChecked}/{totalChecklistItems}
                </div>
                <div className="font-dm text-[10px] text-white/60">tasks</div>
              </div>
            )}
          </div>
        </div>
        {hasChecklists && totalChecklistItems > 0 && (
          <div className="h-1 bg-white/20">
            <div
              className="h-1 bg-white transition-all duration-500"
              style={{ width: `${(totalChecked / totalChecklistItems) * 100}%` }}
            />
          </div>
        )}
      </div>

      {allChecklistsDone && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-3 rounded">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="font-bebas tracking-widest text-sm text-green-700">ALL TASKS COMPLETE — GREAT SHIFT!</p>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Sections — who's on where */}
        {activeSections.length > 0 && (
          <div className="bg-white border border-stone-200 rounded overflow-hidden">
            <div className="bg-[var(--brand)] border-b border-[var(--brand)] px-4 py-2.5 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-white" />
              <span className="font-bebas tracking-widest text-xs text-white">SECTIONS</span>
            </div>
            <div className="divide-y divide-stone-100">
              {activeSections.map(({ key, label }) => (
                <div key={key} className="flex items-start gap-4 px-4 py-3">
                  <span className="font-bebas tracking-widest text-xs text-[var(--brand)] w-24 flex-shrink-0 pt-0.5">{label}</span>
                  <span className="font-dm text-sm text-stone-800">{sections![key]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info cards */}
        {infoFields.length > 0 && (
          <div className="space-y-3">
            {infoFields.map((f, i) => (
              <InfoCard key={i} icon={f.icon} label={f.label} value={f.value} accent={f.accent} />
            ))}
          </div>
        )}

        {/* Today's events with F&B (color-coded) */}
        {events.length > 0 && (
          <div className="bg-white border border-stone-200 rounded overflow-hidden">
            <div className="bg-[var(--brand)] border-b border-[var(--brand)] px-4 py-2.5 flex items-center gap-2">
              <Utensils className="w-3.5 h-3.5 text-white" />
              <span className="font-bebas tracking-widest text-xs text-white">EVENTS TODAY</span>
              <span className="font-dm text-xs text-white/60">· {events.length}</span>
            </div>
            <div className="divide-y divide-stone-100">
              {events.map(ev => {
                const foodItems = ev.fnb.filter(f => (f.course ?? '').toLowerCase() !== 'drinks');
                const drinkItems = ev.fnb.filter(f => (f.course ?? '').toLowerCase() === 'drinks');
                const venueAreaLabel = ev.venueArea ? (VENUE_AREA_LABELS[ev.venueArea] ?? ev.venueArea) : null;
                const time = ev.eventStartTime
                  ? (ev.eventEndTime ? `${fmt12(ev.eventStartTime)} – ${fmt12(ev.eventEndTime)}` : fmt12(ev.eventStartTime))
                  : null;

                // Group food by course for clear separation
                const foodByCourse = foodItems.reduce<Record<string, typeof foodItems>>((acc, it) => {
                  const c = it.course || 'Other';
                  if (!acc[c]) acc[c] = [];
                  acc[c].push(it);
                  return acc;
                }, {});

                return (
                  <div key={ev.id} className="px-4 py-4 space-y-3">
                    {/* Event header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-dm text-sm font-semibold text-stone-800 truncate">
                          {ev.clientName || `Event #${ev.id}`}
                        </p>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] font-dm text-stone-500">
                          {time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{time}</span>}
                          {ev.guestCount != null && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ev.guestCount}</span>}
                          {ev.eventType && <span>{ev.eventType}</span>}
                        </div>
                      </div>
                      {(venueAreaLabel || ev.spaceName) && (
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {venueAreaLabel && (
                            <span className="bg-[var(--brand)] text-white font-bebas tracking-widest text-sm px-3 py-1.5 rounded inline-flex items-center gap-1.5 shadow-sm">
                              <MapPin className="w-4 h-4" />{venueAreaLabel.toUpperCase()}
                            </span>
                          )}
                          {ev.spaceName && (
                            <span className="font-dm text-[11px] text-stone-500 font-medium">{ev.spaceName}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Food (warm amber tone) */}
                    {foodItems.length > 0 && (
                      <div className="bg-amber-50/60 border-l-4 border-amber-400 rounded-r overflow-hidden">
                        <div className="px-3 py-1.5 flex items-center gap-1.5 bg-amber-100/50">
                          <Utensils className="w-3 h-3 text-amber-700" />
                          <span className="font-bebas tracking-widest text-[10px] text-amber-800">FOOD · {foodItems.length}</span>
                        </div>
                        <div className="px-3 py-2 space-y-1.5">
                          {Object.entries(foodByCourse).map(([course, items]) => (
                            <div key={course}>
                              <div className="font-bebas tracking-widest text-[9px] text-amber-700/70 mb-0.5">{course.toUpperCase()}</div>
                              <ul className="space-y-0.5">
                                {items.map(it => (
                                  <li key={it.id} className="flex items-baseline gap-2 font-dm text-[12px] text-stone-700">
                                    {it.qty != null && it.qty > 1 && (
                                      <span className="text-amber-700 font-semibold flex-shrink-0">{it.qty}×</span>
                                    )}
                                    <span className="flex-1">{it.dishName}</span>
                                    {it.serviceTime && (
                                      <span className="text-[10px] text-stone-400 font-medium">{fmt12(it.serviceTime)}</span>
                                    )}
                                    {it.dietary && (
                                      <span className="text-[9px] bg-amber-200/60 text-amber-800 px-1 py-0.5 rounded font-bebas tracking-widest">{it.dietary}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Drinks (cool blue tone) */}
                    {(drinkItems.length > 0 || ev.drinksData?.barNotes || (ev.drinksData?.selectedDrinks?.length ?? 0) > 0 || (ev.drinksData?.customDrinks?.length ?? 0) > 0) && (
                      <div className="border-l-4 border-[var(--brand)] rounded-r overflow-hidden" style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 8%, white)' }}>
                        <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 15%, white)' }}>
                          <Wine className="w-3 h-3 text-[var(--brand)]" />
                          <span className="font-bebas tracking-widest text-[10px] text-[var(--brand)]">DRINKS</span>
                        </div>
                        <div className="px-3 py-2 space-y-1.5">
                          {ev.drinksData?.barNotes && (
                            <div className="font-dm text-[12px] text-stone-700 whitespace-pre-wrap leading-relaxed pb-2 mb-1" style={{ borderBottom: '1px solid color-mix(in srgb, var(--brand) 20%, white)' }}>
                              {ev.drinksData.barNotes}
                            </div>
                          )}
                          {drinkItems.length > 0 && (
                            <ul className="space-y-0.5">
                              {drinkItems.map(it => (
                                <li key={it.id} className="flex items-baseline gap-2 font-dm text-[12px] text-stone-700">
                                  <span className="flex-1">{it.dishName}</span>
                                  {it.serviceTime && (
                                    <span className="text-[10px] text-stone-400 font-medium">{fmt12(it.serviceTime)}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {((ev.drinksData?.selectedDrinks?.length ?? 0) > 0 || (ev.drinksData?.customDrinks?.length ?? 0) > 0) && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {ev.drinksData?.selectedDrinks?.map((d, i) => (
                                <span key={i} className="bg-white text-[var(--brand)] text-[10px] font-dm px-2 py-0.5 rounded" style={{ border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)' }}>
                                  {d.replace(/_/g, ' ')}
                                </span>
                              ))}
                              {ev.drinksData?.customDrinks?.map((d, i) => (
                                <span key={`c${i}`} className="bg-white text-[var(--brand)] text-[10px] font-dm px-2 py-0.5 rounded" style={{ border: '1px solid color-mix(in srgb, var(--brand) 30%, transparent)' }}>
                                  {d.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {ev.fnb.length === 0 && !ev.drinksData?.barNotes && (
                      <p className="font-dm text-xs text-stone-400 italic">No F&B added yet for this event.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Linked checklists */}
        {checklists.map(cl => {
          const items = cl.items ?? [];
          const checkedCount = items.filter((it: any) => {
            const opt = optimistic[it.id];
            return opt !== undefined ? opt : (it.checked === 1);
          }).length;
          const allDone = checkedCount === items.length && items.length > 0;

          return (
            <div key={cl.id} className="bg-white border border-stone-200 rounded overflow-hidden">
              <div className="border-b border-stone-200 px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Utensils className="w-3.5 h-3.5 text-[var(--brand)] flex-shrink-0" />
                  <span className="font-bebas tracking-widest text-sm text-stone-700">{cl.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-dm text-xs text-stone-500">{checkedCount}/{items.length}</span>
                  <button
                    onClick={() => { if (confirm("Reset all items?")) { setOptimistic(p => { const n = { ...p }; items.forEach((it: any) => delete n[it.id]); return n; }); resetMut.mutate({ token: cl.token }); } }}
                    className="font-bebas tracking-widest text-[10px] text-stone-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> RESET
                  </button>
                </div>
              </div>
              <div className="h-1 bg-stone-100">
                <div className="h-1 bg-[var(--brand)] transition-all duration-500" style={{ width: items.length > 0 ? `${(checkedCount / items.length) * 100}%` : "0%" }} />
              </div>
              {allDone && (
                <div className="bg-green-50 border-b border-green-100 px-4 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <p className="font-bebas tracking-widest text-xs text-green-700">ALL DONE — GREAT WORK!</p>
                </div>
              )}
              {items.length === 0 && (
                <p className="font-dm text-sm text-stone-400 text-center py-6">No items on this checklist.</p>
              )}
              {items.map((item: any) => {
                const isChecked = optimistic[item.id] !== undefined ? optimistic[item.id] : (item.checked === 1);
                return (
                  <div key={item.id}>
                  <button
                    onClick={() => handleToggle(cl.token, item.id, isChecked)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 ${item.photoUrl ? "" : "border-b border-stone-100 last:border-0"} transition-colors active:scale-[0.99] ${isChecked ? "bg-green-50/70" : "bg-white hover:bg-stone-50 active:bg-stone-100"}`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {isChecked
                        ? <CheckSquare className="w-5 h-5 text-green-600" />
                        : <Square className="w-5 h-5 text-stone-300" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-dm text-sm leading-snug ${isChecked ? "line-through text-stone-400" : "text-stone-800"}`}>{item.text}</p>
                      {item.note && <p className="font-dm text-xs text-stone-400 mt-0.5 leading-snug">{item.note}</p>}
                      {isChecked && item.checkedBy && (
                        <p className="font-dm text-[10px] text-green-600/70 mt-1">
                          ✓ {item.checkedBy}{item.checkedAt ? ` · ${new Date(item.checkedAt).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}` : ""}
                        </p>
                      )}
                    </div>
                  </button>
                  {item.photoUrl && (
                    <a href={item.photoUrl} target="_blank" rel="noopener noreferrer" className="block px-4 pb-3 bg-white border-b border-stone-100 last:border-0" title="Tap to view full size">
                      <img src={item.photoUrl} alt="Reference photo" className="max-h-52 w-auto rounded-lg border border-stone-200 object-contain ml-8" />
                    </a>
                  )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {(dayGrand > 0 || (paymentInstructions && paymentInstructions.trim().length > 0)) && (
          <div className="bg-white border border-stone-200 rounded overflow-hidden">
            <div className="bg-[var(--brand)] border-b border-[var(--brand)] px-4 py-2.5 flex items-center gap-2">
              <span className="font-bebas tracking-widest text-xs text-white">RUNNING TOTAL · TODAY</span>
            </div>
            {dayGrand > 0 && (
              <div className="px-4 py-3 grid grid-cols-3 gap-3">
                {dayFoodTotal > 0 && (
                  <div>
                    <div className="font-bebas tracking-widest text-[10px] text-stone-400">FOOD</div>
                    <div className="font-dm text-sm text-stone-800 font-semibold">{fmtNzd(dayFoodTotal)}</div>
                  </div>
                )}
                {dayDrinkTotal > 0 && (
                  <div>
                    <div className="font-bebas tracking-widest text-[10px] text-stone-400">DRINKS</div>
                    <div className="font-dm text-sm text-stone-800 font-semibold">{fmtNzd(dayDrinkTotal)}</div>
                  </div>
                )}
                <div>
                  <div className="font-bebas tracking-widest text-[10px] text-[var(--brand)]">TOTAL</div>
                  <div className="font-dm text-sm text-stone-900 font-semibold">{fmtNzd(dayGrand)}</div>
                </div>
              </div>
            )}
            {paymentInstructions && paymentInstructions.trim().length > 0 && (
              <div className="border-t border-stone-100 px-4 py-3">
                <div className="font-bebas tracking-widest text-[10px] text-stone-400 mb-1">PAYMENT INSTRUCTIONS</div>
                <div className="font-dm text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">{paymentInstructions}</div>
              </div>
            )}
          </div>
        )}

        {!activeSections.length && infoFields.length === 0 && !hasChecklists && events.length === 0 && (
          <div className="text-center py-16">
            <p className="font-dm text-sm text-stone-400">No details have been added to this shift runsheet yet.</p>
          </div>
        )}
      </div>

      {/* Staff name footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="font-bebas tracking-widest text-[10px] text-stone-400 mb-1">YOUR NAME</p>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); }}
                  placeholder="e.g. Sarah"
                  className="w-full border border-stone-300 px-3 py-2 font-dm text-sm focus:outline-none focus:border-[var(--brand)] rounded"
                />
              </div>
              <button
                onClick={saveName}
                disabled={!nameInput.trim()}
                className="bg-[var(--brand)] text-white font-bebas tracking-widest text-sm px-5 py-2 hover:bg-[var(--brand-dark)] disabled:opacity-40 transition-colors self-end rounded"
              >
                SAVE
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bebas tracking-widest text-[10px] text-stone-400">CHECKING IN AS</p>
                <p className="font-dm text-sm text-stone-800 font-medium">{staffName || "Anonymous"}</p>
              </div>
              <button
                onClick={() => { setNameInput(staffName); setEditingName(true); }}
                className="flex items-center gap-1.5 font-bebas tracking-widest text-xs text-stone-400 hover:text-[var(--brand)] transition-colors"
              >
                <Pencil className="w-3 h-3" /> CHANGE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
