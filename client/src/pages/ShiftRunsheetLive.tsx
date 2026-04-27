import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckSquare, Square, RefreshCw, CheckCircle2, Pencil } from "lucide-react";

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

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="border-b border-stone-100 py-3 last:border-0">
      <div className="font-bebas tracking-widest text-[10px] text-stone-400 mb-1">{label}</div>
      <div className="font-dm text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">{value}</div>
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
      <div className="min-h-screen bg-[#f9f5ef] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#6b98e7] animate-spin" />
      </div>
    );
  }

  if (!sr) {
    return (
      <div className="min-h-screen bg-[#f9f5ef] flex items-center justify-center px-4">
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
    ? new Date(sr.date + 'T00:00:00').toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;

  const hasContent = sections || sr.specials || sr.budget || sr.specialNotes || sr.marketFish || sr.thingsToPush;

  return (
    <div className="min-h-screen bg-[#f9f5ef] pb-24">
      {/* Logo banner */}
      {venueLogoUrl && (
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center justify-center">
          <img src={venueLogoUrl} alt={venueName ?? "Venue logo"} className="h-10 w-auto max-w-[160px] object-contain" />
        </div>
      )}

      {/* Header */}
      <div className="bg-[#6b98e7] text-white px-5 py-5">
        <div className="max-w-lg mx-auto">
          <div className="font-bebas tracking-widest text-[10px] text-white/60 mb-1">DAILY SHIFT RUNSHEET</div>
          <h1 className="font-bebas text-2xl tracking-wider leading-none">
            {dateDisplay ?? "Shift Runsheet"}
          </h1>
          {sr.dutyManager && (
            <p className="font-dm text-sm text-white/80 mt-1">
              <span className="text-white/50">Manager: </span>{sr.dutyManager}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">

        {/* Sections */}
        {sections && sectionDefs.some(s => sections[s.key]) && (
          <div className="bg-white border border-[#c9a84c]/30 rounded overflow-hidden">
            <div className="bg-[#f9f5ef] px-4 py-2 border-b border-[#c9a84c]/20">
              <span className="font-bebas tracking-widest text-xs text-stone-500">SECTIONS</span>
            </div>
            <div className="divide-y divide-stone-100">
              {sectionDefs.map(({ key, label }) => {
                const val = sections[key];
                if (!val) return null;
                return (
                  <div key={key} className="flex items-start gap-4 px-4 py-3">
                    <span className="font-bebas tracking-widest text-xs text-[#6b98e7] w-20 flex-shrink-0 pt-0.5">{label}</span>
                    <span className="font-dm text-sm text-stone-800">{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Text fields */}
        {(sr.specials || sr.budget || sr.specialNotes || sr.marketFish || sr.thingsToPush) && (
          <div className="bg-white border border-[#c9a84c]/30 rounded px-4">
            <Field label="SPECIALS" value={sr.specials} />
            <Field label="BUDGET" value={sr.budget} />
            <Field label="SPECIAL NOTES / VIP" value={sr.specialNotes} />
            <Field label="MARKET FISH" value={sr.marketFish} />
            <Field label="THINGS TO PUSH / OUT OF STOCK / LIMITED QUANTITIES" value={sr.thingsToPush} />
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
            <div key={cl.id} className="bg-white border border-[#c9a84c]/30 rounded overflow-hidden">
              {/* Checklist header */}
              <div className="bg-[#f9f5ef] px-4 py-2.5 border-b border-[#c9a84c]/20 flex items-center justify-between">
                <span className="font-bebas tracking-widest text-sm text-stone-700">{cl.name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-dm text-xs text-stone-500">{checkedCount}/{items.length}</span>
                  <button
                    onClick={() => { if (confirm('Reset all items?')) { setOptimistic(p => { const n = {...p}; items.forEach((it: any) => delete n[it.id]); return n; }); resetMut.mutate({ token: cl.token }); } }}
                    className="font-bebas tracking-widest text-[10px] text-stone-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> RESET
                  </button>
                </div>
              </div>
              {/* Progress bar */}
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
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-stone-100 last:border-0 transition-colors ${isChecked ? 'bg-green-50/60' : 'bg-white hover:bg-stone-50'}`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {isChecked
                        ? <CheckSquare className="w-5 h-5 text-green-600" />
                        : <Square className="w-5 h-5 text-stone-300" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-dm text-sm leading-snug ${isChecked ? 'line-through text-stone-400' : 'text-stone-800'}`}>{item.text}</p>
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

        {!hasContent && checklists.length === 0 && (
          <div className="text-center py-10">
            <p className="font-dm text-sm text-stone-400">No details have been added to this shift runsheet yet.</p>
          </div>
        )}
      </div>

      {/* Staff name footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-stone-200 shadow-lg">
        <div className="max-w-lg mx-auto px-4 py-3">
          {editingName ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="font-bebas tracking-widest text-[10px] text-stone-400 mb-1">YOUR NAME</p>
                <input ref={nameInputRef} type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); }}
                  placeholder="e.g. Sarah"
                  className="w-full border border-stone-300 px-3 py-2 font-dm text-sm focus:outline-none focus:border-[#6b98e7]" />
              </div>
              <button onClick={saveName} disabled={!nameInput.trim()}
                className="bg-[#6b98e7] text-white font-bebas tracking-widest text-sm px-5 py-2 hover:bg-[#5a87d6] disabled:opacity-40 self-end">SAVE</button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bebas tracking-widest text-[10px] text-stone-400">CHECKING IN AS</p>
                <p className="font-dm text-sm text-stone-800 font-medium">{staffName || "Anonymous"}</p>
              </div>
              <button onClick={() => { setNameInput(staffName); setEditingName(true); }}
                className="flex items-center gap-1.5 font-bebas tracking-widest text-xs text-stone-400 hover:text-[#6b98e7] transition-colors">
                <Pencil className="w-3 h-3" /> CHANGE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
