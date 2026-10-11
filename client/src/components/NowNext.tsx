import { useEffect, useMemo, useState } from "react";
import { groupDietaries, looksSwapped, unswap } from "@shared/dietaries";
import {
  clockStepIndex, dishQuantity, isSevereDietary, type BillingStep,
} from "@shared/nowNext";

/**
 * Now & Next: the staff link on a phone. One step at a time in large type,
 * the next three underneath, and the allergies pinned to the bottom of every
 * screen. Food quantities, billing and notes are one tap away. Built for a
 * glance mid-service, not for reading a whole document.
 */

type Item = { id?: number; time?: string | null; duration?: number | null; title?: string | null; description?: string | null; assignedTo?: string | null; sortOrder?: number | null };
type Fnb = { section?: string | null; course?: string | null; dishName?: string | null; description?: string | null; qty?: number | null };
type Payment = { id: number; amount: string; type: string; method: string; paidAt: Date | string; notes: string | null };

const COURSES = ["Canapes", "Entree", "Main", "Dessert", "Cheese", "Late Night Snack", "Breakfast", "Morning Tea", "Lunch", "Afternoon Tea"];
type Screen = "now" | "food" | "allergies" | "billing" | "notes";

function time12(t?: string | null): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ""));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "pm" : "am"}`;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function moneyNz(v: unknown): string {
  return `$${Number(v || 0).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function NowNext({
  token, runsheet, items, fnb, contactName, contactPhone, billing, payments,
}: {
  token: string;
  runsheet: any;
  items: Item[];
  fnb: Fnb[];
  contactName?: string | null;
  contactPhone?: string | null;
  billing?: { steps: BillingStep[]; howToPay: string | null } | null;
  payments?: Payment[];
}) {
  const [screen, setScreen] = useState<Screen>("now");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Keep the phone awake while the Now screen is open; a dark screen mid-
  // service means unlocking it again. Ignored where the browser can't.
  useEffect(() => {
    if (screen !== "now") return;
    let lock: any = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await (navigator as any).wakeLock?.request?.("screen");
        if (cancelled) l?.release?.(); else lock = l;
      } catch { /* not allowed or not supported */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") request(); };
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); lock?.release?.().catch?.(() => {}); };
  }, [screen]);

  const steps = useMemo(() => [...items].sort((a, b) =>
    String(a.time ?? "").localeCompare(String(b.time ?? "")) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [items]);

  // ── Which step is "now" ──
  const eventDate = runsheet?.eventDate ? new Date(runsheet.eventDate) : null;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isEventDay = !!eventDate && dayKey(eventDate) === dayKey(now);
  // Still the same night in the small hours after a late finish.
  const isLateNight = !!eventDate && dayKey(eventDate) === dayKey(yesterday) && nowMin < 360;
  const followingClock = isEventDay || isLateNight;
  const clockIdx = followingClock ? clockStepIndex(steps.map(s => s.time), isLateNight ? nowMin + 1440 : nowMin) : -1;

  // "Done, next step" moves on by hand. Remembered on this phone only, per
  // event day, so a reload doesn't lose your place.
  const posKey = `vf:nownext:${token}:${eventDate ? dayKey(eventDate) : "x"}`;
  const [manualPos, setManualPos] = useState<number | null>(() => {
    try { const v = localStorage.getItem(posKey); return v === null ? null : Number(v); } catch { return null; }
  });
  const savePos = (v: number | null) => {
    setManualPos(v);
    try { if (v === null) localStorage.removeItem(posKey); else localStorage.setItem(posKey, String(v)); } catch { /* private mode */ }
  };
  const current = manualPos ?? (followingClock ? clockIdx : 0);
  const beforeStart = current < 0;
  const finished = current >= steps.length && steps.length > 0;
  const step = !beforeStart && !finished ? steps[current] : null;
  const upNext = steps.slice(Math.max(current + 1, 0), Math.max(current + 1, 0) + 3);

  // ── Food: how many of each ──
  const food = fnb.filter(f => f.section === "foh" && (f.course ?? "") !== "Drinks");
  const allQtyOne = food.length > 0 && food.every(f => !(Number(f.qty) > 1));
  const byCourse: Record<string, Fnb[]> = {};
  for (const f of food) (byCourse[f.course || "Other"] ??= []).push(f);
  const courseOrder = [...COURSES.filter(c => byCourse[c]), ...Object.keys(byCourse).filter(c => !COURSES.includes(c))];
  const dd = runsheet?.drinksData ?? {};
  const drinkNames: string[] = [
    ...((Array.isArray(dd.selectedDrinks) ? dd.selectedDrinks : []) as any[]).map(d => (typeof d === "string" ? d : d?.name)),
    ...((Array.isArray(dd.customDrinks) ? dd.customDrinks : []) as any[]).map(d => (typeof d === "string" ? d : d?.name)),
  ].filter(Boolean);
  const drinks = drinkNames.length ? drinkNames : fnb.filter(f => f.section === "foh" && f.course === "Drinks").map(f => f.dishName || "").filter(Boolean);

  // ── Dietaries, dangerous ones first ──
  const dietaries = groupDietaries(((runsheet?.dietaries ?? []) as any[]).map(d => (looksSwapped(d) ? unswap(d) : d)));
  const severe = dietaries.filter(isSevereDietary);
  const ordered = [...severe, ...dietaries.filter(d => !isSevereDietary(d))];
  // Who it is matters most at a glance: the named guests, or the name at the
  // start of the note ("Hana — carries an EpiPen").
  const whoFor = (d: { names?: string[]; notes?: string }) => {
    if (d.names?.length) return d.names.join(", ");
    const lead = String(d.notes ?? "").split(/\s[—–-]\s/)[0].replace(/\s*\(.*?\)\s*/g, " ").trim();
    return lead && lead.length <= 24 ? lead : "";
  };
  const bannerText = severe.slice(0, 2).map(d => { const w = whoFor(d); return `${w ? w + ": " : ""}${d.name}`; }).join(" · ")
    + (severe.length > 2 ? ` · +${severe.length - 2} more` : "");

  const tabs: Array<[Screen, string]> = [["now", "Now"], ["food", "Food"], ["allergies", "Allergies"], ["billing", "Billing"], ["notes", "Notes"]];
  const label = "font-bebas tracking-widest text-[12px] text-stone";

  return (
    <div className="max-w-md mx-auto pb-44">
      <div role="tabpanel" id={`vf-nn-${screen}`} aria-labelledby={`vf-nn-tab-${screen}`} className="space-y-4">
        {screen === "now" && (
          <>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="font-dm text-[15px] text-ink">
                {manualPos !== null
                  ? "Moved on by hand."
                  : followingClock
                    ? `Following the clock · ${now.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit" })}`
                    : eventDate
                      ? `This event is ${eventDate.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}. Showing the first step.`
                      : "Showing the first step."}
              </p>
              {manualPos !== null && followingClock && (
                <button type="button" onClick={() => savePos(null)} className="font-dm text-[15px] font-semibold text-forest underline underline-offset-4">
                  Go back to the clock
                </button>
              )}
            </div>

            {steps.length === 0 ? (
              <div className="bg-white border border-gold p-5 font-dm text-[17px] text-ink">No run of day yet. Ask your manager to add one.</div>
            ) : beforeStart ? (
              <div className="bg-white border-2 border-forest p-5 space-y-2">
                <div className={label}>Starts at</div>
                <div className="figure text-[44px] leading-none text-ink">{time12(steps[0].time)}</div>
                <p className="font-dm text-[17px] text-ink">Up first: <b>{steps[0].title}</b></p>
                <button type="button" onClick={() => savePos(0)} className="w-full min-h-[52px] bg-forest text-white font-dm font-bold text-[18px] mt-2">Start now</button>
              </div>
            ) : finished ? (
              <div className="bg-white border-2 border-forest p-5 space-y-3">
                <div className="font-dm text-[22px] font-bold text-ink">That's everything.</div>
                <p className="font-dm text-[17px] text-ink">The last step was {steps[steps.length - 1].title} at {time12(steps[steps.length - 1].time)}.</p>
                <button type="button" onClick={() => savePos(steps.length - 1)} className="font-dm text-[16px] font-semibold text-forest underline underline-offset-4">Back to the last step</button>
              </div>
            ) : step && (
              <section aria-labelledby="vf-nn-now" className="bg-white border-2 border-forest p-5 space-y-2">
                <div className={label} id="vf-nn-now">Now · step {current + 1} of {steps.length}</div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="figure text-[44px] leading-none text-ink">{time12(step.time)}</span>
                  {step.duration ? <span className="font-dm text-[16px] font-semibold text-stone">{step.duration} min</span> : null}
                </div>
                <h2 className="font-dm text-[24px] font-bold leading-tight text-ink">{step.title}</h2>
                {step.description && <p className="font-dm text-[18px] leading-snug text-ink">{step.description}</p>}
                {step.assignedTo && <p className="font-dm text-[17px] font-bold text-forest">{step.assignedTo}</p>}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => savePos(current + 1)}
                    className="flex-1 min-h-[56px] bg-forest text-white font-dm font-bold text-[18px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-forest focus-visible:ring-offset-2">
                    Done, next step
                  </button>
                  {current > 0 && (
                    <button type="button" onClick={() => savePos(current - 1)}
                      className="min-h-[56px] px-4 border-2 border-forest text-forest font-dm font-bold text-[16px]">
                      Back
                    </button>
                  )}
                </div>
              </section>
            )}

            {upNext.length > 0 && !finished && (
              <section aria-labelledby="vf-nn-next">
                <h3 id="vf-nn-next" className={`${label} mb-1`}>{beforeStart ? "Then" : "Next"}</h3>
                <ol className="bg-white border border-gold divide-y divide-stone-200">
                  {(beforeStart ? steps.slice(1, 4) : upNext).map((s, i) => (
                    <li key={s.id ?? i} className="grid grid-cols-[5.5rem_1fr] gap-3 px-4 py-3">
                      <span className="figure text-[20px] text-ink whitespace-nowrap">{time12(s.time)}</span>
                      <span className="font-dm text-[17px] text-ink leading-snug">
                        {s.title}
                        {s.assignedTo && <span className="block text-[15px] font-semibold text-forest">{s.assignedTo}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}

        {screen === "food" && (
          <>
            {courseOrder.length === 0 && <p className="font-dm text-[17px] text-ink">No food on this event yet.</p>}
            {courseOrder.map(course => (
              <section key={course} aria-label={course} className="bg-white border border-gold">
                <div className="flex items-baseline justify-between px-4 pt-3 pb-1">
                  <h2 className="font-cormorant italic text-[22px] text-forest">{course}</h2>
                  <span className={label}>How many</span>
                </div>
                <ul className="divide-y divide-stone-200">
                  {byCourse[course].map((f, i) => {
                    const q = dishQuantity(f.qty, allQtyOne, runsheet?.guestCount);
                    return (
                      <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3 px-4 py-3 items-baseline">
                        <span className="figure text-[30px] leading-none text-ink text-right">{q > 0 ? <><span className="text-[16px] text-stone">×</span>{q}</> : ""}</span>
                        <span className="font-dm text-[17px] text-ink leading-snug">
                          <b>{f.dishName}</b>
                          {f.description && <span className="block text-[15px] text-stone">{f.description}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {drinks.length > 0 && (
              <section aria-label="Drinks" className="bg-white border border-gold px-4 py-3">
                <h2 className="font-cormorant italic text-[22px] text-forest mb-1">Drinks</h2>
                <ul className="font-dm text-[17px] text-ink space-y-1">{drinks.map((d, i) => <li key={i}>{d}</li>)}</ul>
                {dd.barNotes && <p className="font-dm text-[16px] text-ink mt-2 pt-2 border-t border-gold">{dd.barNotes}</p>}
              </section>
            )}
          </>
        )}

        {screen === "allergies" && (
          ordered.length === 0
            ? <p className="font-dm text-[17px] text-ink">No dietaries or allergies on this event.</p>
            : (
              <ul className="space-y-2">
                {ordered.map((d, i) => {
                  const sev = isSevereDietary(d);
                  return (
                    <li key={i} className={`flex gap-3 items-start p-4 bg-white ${sev ? "border-2 border-red-700" : "border border-gold"}`}>
                      <span className={`figure flex-none w-12 h-12 rounded-full grid place-items-center text-[22px] ${sev ? "bg-red-700 text-white" : "bg-ink text-white"}`}>{d.count || 1}</span>
                      <span className="font-dm text-[17px] text-ink leading-snug min-w-0">
                        <b className={sev ? "text-red-800" : undefined}>{d.name}</b>
                        {d.names?.length ? <span className="block text-[16px]">{d.names.join(", ")}</span> : null}
                        {d.notes && <span className="block text-[16px] text-stone">{d.notes}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
        )}

        {screen === "billing" && (
          !billing
            ? <p className="font-dm text-[17px] text-ink">There are no billing instructions for this event yet.</p>
            : (
              <>
                <ol className="bg-white border border-gold divide-y divide-stone-200">
                  {billing.steps.map((s, i) => (
                    <li key={i} className="grid grid-cols-[2rem_1fr] gap-2 px-4 py-3">
                      <span className="figure text-[22px] text-forest leading-tight">{i + 1}</span>
                      <span className="font-dm text-[17px] text-ink leading-snug min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <b>{s.title}</b>
                          {s.status && (
                            <span className={`font-bebas tracking-widest text-[12px] px-2 py-0.5 ${s.status.settled ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                              {s.status.label}
                            </span>
                          )}
                        </span>
                        <span className="block mt-1">{s.body}</span>
                        {s.lines?.map((l, j) => <span key={j} className="block mt-1 text-[16px]">{l}</span>)}
                      </span>
                    </li>
                  ))}
                </ol>
                {billing.howToPay && (
                  <section aria-labelledby="vf-nn-pay" className="bg-white border border-gold px-4 py-3">
                    <h2 id="vf-nn-pay" className={`${label} mb-1`}>How to pay</h2>
                    <p className="font-dm text-[17px] text-ink whitespace-pre-wrap">{billing.howToPay}</p>
                  </section>
                )}
                {payments && payments.length > 0 && (
                  <section aria-labelledby="vf-nn-paid" className="bg-white border border-gold px-4 py-3">
                    <h2 id="vf-nn-paid" className={`${label} mb-1`}>Received so far</h2>
                    <ul className="font-dm text-[17px] text-ink space-y-1">
                      {payments.map(p => (
                        <li key={p.id} className="flex justify-between gap-3">
                          <span className="capitalize">{p.type}{p.method ? ` · ${p.method.replace(/_/g, " ")}` : ""}</span>
                          <b className="figure">{moneyNz(p.amount)}</b>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )
        )}

        {screen === "notes" && (
          <>
            <section className="bg-white border border-gold px-4 py-3 font-dm text-[17px] text-ink space-y-1">
              {eventDate && <p><b>{eventDate.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" })}</b></p>}
              <p>{[runsheet?.guestCount ? `${runsheet.guestCount} guests` : "", runsheet?.spaceName].filter(Boolean).join(" · ")}</p>
              {(contactName || contactPhone) && (
                <p>Onsite contact: <b>{contactName}</b>{contactPhone && <> · <a className="text-forest font-semibold underline underline-offset-4" href={`tel:${contactPhone.replace(/\s+/g, "")}`}>{contactPhone}</a></>}</p>
              )}
            </section>
            {runsheet?.notes && (
              <section aria-label="Notes" className="bg-white border border-gold px-4 py-3">
                <h2 className={`${label} mb-1`}>Notes</h2>
                <div className="font-dm text-[17px] leading-relaxed text-ink vf-rich-content" dangerouslySetInnerHTML={{ __html: runsheet.notes }} />
              </section>
            )}
            {runsheet?.kitchenNotes && (
              <section aria-label="Kitchen notes" className="bg-white border border-gold px-4 py-3">
                <h2 className={`${label} mb-1`}>Kitchen notes</h2>
                <p className="font-dm text-[17px] leading-relaxed text-ink whitespace-pre-wrap">{runsheet.kitchenNotes}</p>
              </section>
            )}
            {runsheet?.venueSetup && (
              <section aria-label="Set-up" className="bg-white border border-gold px-4 py-3">
                <h2 className={`${label} mb-1`}>Set-up</h2>
                <div className="font-dm text-[17px] leading-relaxed text-ink vf-rich-content" dangerouslySetInnerHTML={{ __html: runsheet.venueSetup }} />
              </section>
            )}
          </>
        )}
      </div>

      {/* Allergies + screen switcher, pinned to the bottom of every screen. */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-white border-t-2 border-gold print:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {severe.length > 0 && (
          <button type="button" onClick={() => setScreen("allergies")}
            className="w-full text-left bg-red-700 text-white px-4 py-2.5 font-dm text-[16px] font-bold leading-snug">
            Allergies: {bannerText}
            <span className="block font-normal text-[14px]">Tap to see everyone</span>
          </button>
        )}
        <div role="tablist" aria-label="Now and next screens" className="max-w-md mx-auto grid grid-cols-5">
          {tabs.map(([key, name]) => (
            <button key={key} id={`vf-nn-tab-${key}`} role="tab" type="button" aria-selected={screen === key} aria-controls={`vf-nn-${key}`}
              onClick={() => setScreen(key)}
              className={`min-h-[52px] font-dm text-[14px] font-bold ${screen === key ? "text-forest shadow-[inset_0_3px_0_#2f5488]" : "text-stone"}`}>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
