import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Loader2, CheckSquare, Square, RefreshCw, CheckCircle2, Pencil,
  Users, Utensils, Wine, Star, Fish, Megaphone, Wifi, WifiOff,
} from "lucide-react";

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
    <div className={`rounded p-4 ${accent ? "bg-[#6b98e7]/10 border border-[#6b98e7]/20" : "bg-white border border-stone-200"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${accent ? "text-[#6b98e7]" : "text-stone-400"}`} />
        <span className="font-bebas tracking-widest text-[10px] text-stone-400 uppercase">{label}</span>
      </div>
      <p className={`font-dm text-sm leading-relaxed whitespace-pre-wrap ${accent ? "text-[#6b98e7] font-medium" : "text-stone-800"}`}>{value}</p>
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
        <Loader2 className="w-6 h-6 text-[#6b98e7] animate-spin" />
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
  const sectionDefs = parseSectionDefs((sr as any).shiftSections);
  const venueLogoUrl = (sr as any).venueLogoUrl as string | null | undefined;
  const venueName = (sr as any).venueName as string | null | undefined;

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
    <div className="min-h-screen bg-linen pb-32">
      {/* Venue logo */}
      {venueLogoUrl && (
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center justify-center">
          <img src={venueLogoUrl} alt={venueName ?? "Venue logo"} className="h-10 w-auto max-w-[160px] object-contain" />
        </div>
      )}

      {/* Sticky header */}
      <div className="bg-[#6b98e7] sticky top-0 z-10 shadow-md">
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
            <div className="bg-stone-50 border-b border-stone-200 px-4 py-2.5 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[#6b98e7]" />
              <span className="font-bebas tracking-widest text-xs text-stone-600">SECTIONS</span>
            </div>
            <div className="divide-y divide-stone-100">
              {activeSections.map(({ key, label }) => (
                <div key={key} className="flex items-start gap-4 px-4 py-3">
                  <span className="font-bebas tracking-widest text-xs text-[#6b98e7] w-24 flex-shrink-0 pt-0.5">{label}</span>
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
                  <Utensils className="w-3.5 h-3.5 text-[#6b98e7] flex-shrink-0" />
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
                <div className="h-1 bg-[#6b98e7] transition-all duration-500" style={{ width: items.length > 0 ? `${(checkedCount / items.length) * 100}%` : "0%" }} />
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
                  <button
                    key={item.id}
                    onClick={() => handleToggle(cl.token, item.id, isChecked)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-stone-100 last:border-0 transition-colors active:scale-[0.99] ${isChecked ? "bg-green-50/70" : "bg-white hover:bg-stone-50 active:bg-stone-100"}`}
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
                );
              })}
            </div>
          );
        })}

        {!activeSections.length && infoFields.length === 0 && !hasChecklists && (
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
                  className="w-full border border-stone-300 px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7] rounded"
                />
              </div>
              <button
                onClick={saveName}
                disabled={!nameInput.trim()}
                className="bg-[#6b98e7] text-white font-bebas tracking-widest text-sm px-5 py-2 hover:bg-[#5a87d6] disabled:opacity-40 transition-colors self-end rounded"
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
                className="flex items-center gap-1.5 font-bebas tracking-widest text-xs text-stone-400 hover:text-[#6b98e7] transition-colors"
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
