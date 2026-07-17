import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Heart, Plus, X } from "lucide-react";

type Dietary = { name: string; count: number; notes?: string };

type Answers = {
  ceremonyNotes?: string;
  mustHaveMoments?: string;
  firstDanceSong?: string;
  processionalSong?: string;
  doNotPlay?: string;
  seatingNotes?: string;
  familyNotes?: string;
  dietaries?: Dietary[];
  dayOfContactName?: string;
  dayOfContactPhone?: string;
  specialRequests?: string;
};

const EMPTY: Answers = {};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-bebas tracking-widest text-[11px] text-ink/50 block mb-1">{label}</label>
      {hint && <p className="font-dm text-xs text-ink/40 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gold/25 rounded-sm px-3 py-2 text-sm font-dm focus:outline-none focus:border-forest bg-white";
const textareaCls = inputCls + " min-h-[80px] resize-y";

export default function WeddingChecklist() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data, isLoading, refetch } = trpc.weddingChecklist.getByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  // Only report "saved" once the mutation actually succeeds — and surface a
  // clear error if it doesn't, so a guest on a flaky connection never sees
  // "saved" while their answer was dropped.
  const saveMutation = trpc.weddingChecklist.saveByToken.useMutation({
    onSuccess: () => setSaved(true),
    onError: () => { setSaved(false); toast.error("Couldn't save — check your connection and try again"); },
  });
  const submitMutation = trpc.weddingChecklist.submitByToken.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Couldn't submit — please try again"),
  });

  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [saved, setSaved] = useState(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (data && !loadedRef.current) {
      setAnswers(data.answers ?? {});
      loadedRef.current = true;
    }
  }, [data]);

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function saveField<K extends keyof Answers>(key: K) {
    setSaved(false);
    saveMutation.mutate({ token, answers: { [key]: answers[key] } as any });
  }

  function saveDietaries(next: Dietary[]) {
    setAnswers(prev => ({ ...prev, dietaries: next }));
    setSaved(false);
    saveMutation.mutate({ token, answers: { dietaries: next } });
  }

  const dietaries = answers.dietaries ?? [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-forest animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-linen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="font-bebas tracking-widest text-2xl text-ink/40">LINK NOT FOUND</p>
          <p className="font-dm text-sm text-ink/30 mt-2">This link may be invalid — please check with your venue.</p>
        </div>
      </div>
    );
  }

  const eventDateLabel = data.eventDate
    ? new Date(data.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen bg-linen">
      <div className="max-w-xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="font-bebas tracking-[0.2em] text-xs text-forest/70 mb-1">{data.venueName}</div>
          <h1 className="font-serif text-3xl font-semibold text-ink">
            {data.coupleNames ? `${data.coupleNames}'s` : "Your"} Wedding Checklist
          </h1>
          <p className="font-dm text-sm text-ink/50 mt-1.5">
            {data.eventTitle}{eventDateLabel ? ` · ${eventDateLabel}` : ""}
          </p>
          <p className="font-dm text-xs text-ink/40 mt-3 max-w-sm mx-auto leading-relaxed">
            A few details to help your venue get everything right on the day. Fill in what you can — it saves automatically as you go, and you can always come back to this link.
          </p>
        </div>

        {data.submittedAt && (
          <div className="mb-6 flex items-center gap-2 justify-center bg-forest/10 border border-forest/20 rounded-sm px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-forest flex-shrink-0" />
            <span className="font-dm text-sm text-forest">
              Submitted {new Date(data.submittedAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short" })} — thank you! You can still update anything below.
            </span>
          </div>
        )}

        <div className="bg-white border border-gold/30 shadow-sm rounded-sm divide-y divide-gold/15">
          {/* Ceremony & Timeline */}
          <div className="p-5 space-y-4">
            <div className="font-bebas tracking-widest text-xs text-forest">CEREMONY &amp; TIMELINE</div>
            <Field label="Anything special about the ceremony?" hint="Readings, rituals, timing changes — anything the venue should know.">
              <textarea className={textareaCls} value={answers.ceremonyNotes ?? ""} onChange={e => set("ceremonyNotes", e.target.value)} onBlur={() => saveField("ceremonyNotes")} placeholder="e.g. Unity candle ceremony, 10 min longer than usual" />
            </Field>
            <Field label="Must-have moments" hint="Speeches order, surprises, anything you don't want the team to miss.">
              <textarea className={textareaCls} value={answers.mustHaveMoments ?? ""} onChange={e => set("mustHaveMoments", e.target.value)} onBlur={() => saveField("mustHaveMoments")} placeholder="e.g. Surprise choreographed first dance, dad's speech is a surprise" />
            </Field>
          </div>

          {/* Music */}
          <div className="p-5 space-y-4">
            <div className="font-bebas tracking-widest text-xs text-forest">MUSIC</div>
            <Field label="First dance song">
              <input className={inputCls} value={answers.firstDanceSong ?? ""} onChange={e => set("firstDanceSong", e.target.value)} onBlur={() => saveField("firstDanceSong")} placeholder="Artist — Song title" />
            </Field>
            <Field label="Processional / walking-in song">
              <input className={inputCls} value={answers.processionalSong ?? ""} onChange={e => set("processionalSong", e.target.value)} onBlur={() => saveField("processionalSong")} placeholder="Artist — Song title" />
            </Field>
            <Field label="Do-not-play list" hint="Songs or artists to avoid.">
              <textarea className={textareaCls} value={answers.doNotPlay ?? ""} onChange={e => set("doNotPlay", e.target.value)} onBlur={() => saveField("doNotPlay")} />
            </Field>
          </div>

          {/* Seating & Family */}
          <div className="p-5 space-y-4">
            <div className="font-bebas tracking-widest text-xs text-forest">SEATING &amp; FAMILY</div>
            <Field label="Seating notes" hint="VIP tables, anyone who needs to be seated a certain way.">
              <textarea className={textareaCls} value={answers.seatingNotes ?? ""} onChange={e => set("seatingNotes", e.target.value)} onBlur={() => saveField("seatingNotes")} />
            </Field>
            <Field label="Family notes" hint="Anything the floor/MC should be sensitive to (optional).">
              <textarea className={textareaCls} value={answers.familyNotes ?? ""} onChange={e => set("familyNotes", e.target.value)} onBlur={() => saveField("familyNotes")} />
            </Field>
          </div>

          {/* Dietary & Allergies */}
          <div className="p-5 space-y-3">
            <div className="font-bebas tracking-widest text-xs text-forest">DIETARY &amp; ALLERGIES</div>
            <p className="font-dm text-xs text-ink/40">Please list every guest requirement, especially allergies — this goes straight to the kitchen.</p>
            <div className="space-y-2">
              {dietaries.map((d, i) => (
                <div key={i} className="flex items-start gap-2 bg-linen/60 border border-gold/20 rounded-sm p-2.5">
                  <input
                    className="w-full sm:w-40 border border-gold/25 rounded-sm px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white"
                    value={d.name}
                    onChange={e => setAnswers(prev => ({ ...prev, dietaries: dietaries.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))}
                    onBlur={() => saveDietaries(answers.dietaries ?? [])}
                    placeholder="e.g. Vegan, Nut allergy"
                  />
                  <input
                    type="number"
                    min={1}
                    className="w-16 border border-gold/25 rounded-sm px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white"
                    value={d.count}
                    onChange={e => setAnswers(prev => ({ ...prev, dietaries: dietaries.map((x, j) => j === i ? { ...x, count: Math.max(1, parseInt(e.target.value) || 1) } : x) }))}
                    onBlur={() => saveDietaries(answers.dietaries ?? [])}
                  />
                  <input
                    className="flex-1 border border-gold/25 rounded-sm px-2 py-1.5 text-sm font-dm focus:outline-none focus:border-forest bg-white"
                    value={d.notes ?? ""}
                    onChange={e => setAnswers(prev => ({ ...prev, dietaries: dietaries.map((x, j) => j === i ? { ...x, notes: e.target.value } : x) }))}
                    onBlur={() => saveDietaries(answers.dietaries ?? [])}
                    placeholder="Notes (severity, table number, etc.)"
                  />
                  <button
                    onClick={() => saveDietaries(dietaries.filter((_, j) => j !== i))}
                    className="text-ink/30 hover:text-red-600 flex-shrink-0 p-1"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => saveDietaries([...dietaries, { name: "", count: 1, notes: "" }])}
              className="font-bebas tracking-widest text-xs text-forest hover:text-forest/80 flex items-center gap-1 border border-forest/30 px-3 py-1.5 hover:bg-forest/5 transition-colors rounded-sm"
            >
              <Plus className="w-3 h-3" /> ADD A REQUIREMENT
            </button>
          </div>

          {/* Contact */}
          <div className="p-5 space-y-4">
            <div className="font-bebas tracking-widest text-xs text-forest">DAY-OF CONTACT</div>
            <p className="font-dm text-xs text-ink/40">Someone the venue can reach if they can't get hold of you on the day.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name">
                <input className={inputCls} value={answers.dayOfContactName ?? ""} onChange={e => set("dayOfContactName", e.target.value)} onBlur={() => saveField("dayOfContactName")} />
              </Field>
              <Field label="Phone">
                <input className={inputCls} value={answers.dayOfContactPhone ?? ""} onChange={e => set("dayOfContactPhone", e.target.value)} onBlur={() => saveField("dayOfContactPhone")} />
              </Field>
            </div>
          </div>

          {/* Special requests */}
          <div className="p-5 space-y-4">
            <div className="font-bebas tracking-widest text-xs text-forest">ANYTHING ELSE?</div>
            <Field label="Special requests">
              <textarea className={textareaCls} value={answers.specialRequests ?? ""} onChange={e => set("specialRequests", e.target.value)} onBlur={() => saveField("specialRequests")} />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            onClick={() => submitMutation.mutate({ token })}
            disabled={submitMutation.isPending}
            className="inline-flex items-center gap-2 bg-forest hover:bg-forest/90 text-white font-bebas tracking-widest text-sm rounded-sm px-6 py-3 transition-colors disabled:opacity-60"
          >
            <Heart className="w-4 h-4" /> {submitMutation.isPending ? "SUBMITTING…" : "MARK AS SUBMITTED"}
          </button>
          <p className="font-dm text-xs text-ink/35">
            {saveMutation.isPending ? "Saving…" : saved ? "Everything is saved automatically." : "Unsaved changes — click out of the field to save."}
          </p>
        </div>
      </div>
    </div>
  );
}
