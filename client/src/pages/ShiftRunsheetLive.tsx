import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

const SECTION_LABELS: Record<string, string> = {
  bar: "Bar",
  barFloor: "Bar Floor",
  front: "Front",
  back: "Back",
  bigTable: "Big Table",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="border-b border-stone-100 py-3">
      <div className="font-bebas tracking-widest text-[10px] text-stone-400 mb-1">{label}</div>
      <div className="font-dm text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">{value}</div>
    </div>
  );
}

export default function ShiftRunsheetLive() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data: sr, isLoading } = trpc.shiftRunsheets.getByToken.useQuery(
    { token },
    { enabled: !!token }
  );

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
  const dateDisplay = sr.date
    ? new Date(sr.date + 'T00:00:00').toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen bg-[#f9f5ef] pb-12">
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
        {sections && Object.entries(SECTION_LABELS).some(([k]) => sections[k]) && (
          <div className="bg-white border border-[#c9a84c]/30 rounded overflow-hidden">
            <div className="bg-[#f9f5ef] px-4 py-2 border-b border-[#c9a84c]/20">
              <span className="font-bebas tracking-widest text-xs text-stone-500">SECTIONS</span>
            </div>
            <div className="divide-y divide-stone-100">
              {Object.entries(SECTION_LABELS).map(([key, label]) => {
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

        {!sections && !sr.specials && !sr.budget && !sr.specialNotes && !sr.marketFish && !sr.thingsToPush && (
          <div className="text-center py-10">
            <p className="font-dm text-sm text-stone-400">No details have been added to this shift runsheet yet.</p>
          </div>
        )}

      </div>
    </div>
  );
}
