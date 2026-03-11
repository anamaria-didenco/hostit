import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Clock, Users, MapPin, Calendar, ChefHat, UtensilsCrossed,
  AlertCircle, CheckCircle2, Loader2, Wine
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CATEGORIES: Record<string, { label: string; color: string; bg: string }> = {
  arrival:     { label: "Arrival",       color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  ceremony:    { label: "Ceremony",      color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  catering:    { label: "Catering",      color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  drinks:      { label: "Drinks",        color: "text-teal-700",   bg: "bg-teal-50 border-teal-200" },
  speeches:    { label: "Speeches",      color: "text-pink-700",   bg: "bg-pink-50 border-pink-200" },
  entertainment: { label: "Entertainment", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  setup:       { label: "Setup",         color: "text-gray-700",   bg: "bg-gray-50 border-gray-200" },
  breakdown:   { label: "Breakdown",     color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  other:       { label: "Other",         color: "text-slate-700",  bg: "bg-slate-50 border-slate-200" },
};

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

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-slate-500 text-sm">Loading runsheet…</p>
        </div>
      </div>
    );
  }

  // ── Error / not found ──
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-800">Link not found or expired</h1>
          <p className="text-slate-500 text-sm">
            This staff portal link may have expired or been revoked. Please ask your venue manager for a new link.
          </p>
        </div>
      </div>
    );
  }

  const { runsheet, items, fnb } = data;

  // Sort timeline items by time
  const sortedItems = [...items].sort((a, b) => {
    if (a.time < b.time) return -1;
    if (a.time > b.time) return 1;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const fohItems = fnb.filter(f => f.section === "foh");
  const kitchenItems = fnb.filter(f => f.section === "kitchen");

  // Group FOH by course
  const fohByCourse: Record<string, typeof fohItems> = {};
  for (const item of fohItems) {
    const course = item.course ?? "General";
    if (!fohByCourse[course]) fohByCourse[course] = [];
    fohByCourse[course].push(item);
  }

  // Group Kitchen by course
  const kitchenByCourse: Record<string, typeof kitchenItems> = {};
  for (const item of kitchenItems) {
    const course = item.course ?? "General";
    if (!kitchenByCourse[course]) kitchenByCourse[course] = [];
    kitchenByCourse[course].push(item);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">{runsheet.title}</h1>
            <p className="text-xs text-slate-500 mt-0.5">Staff Runsheet — Read Only</p>
          </div>
          <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Live
          </Badge>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* ── Event Summary ── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-800">Event Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Date</p>
                  <p className="text-sm font-medium text-slate-800">{formatDate(runsheet.eventDate)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Guests</p>
                  <p className="text-sm font-medium text-slate-800">{runsheet.guestCount ?? "TBC"}</p>
                </div>
              </div>
              {runsheet.spaceName && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Space</p>
                    <p className="text-sm font-medium text-slate-800">{runsheet.spaceName}</p>
                  </div>
                </div>
              )}
              {runsheet.eventType && (
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Event Type</p>
                    <p className="text-sm font-medium text-slate-800 capitalize">{runsheet.eventType}</p>
                  </div>
                </div>
              )}
            </div>

            {runsheet.venueSetup && (
              <>
                <Separator className="my-3" />
                <div>
                  <p className="text-xs text-slate-500 mb-1">Venue Setup</p>
                  <p className="text-sm text-slate-700">{runsheet.venueSetup}</p>
                </div>
              </>
            )}

            {runsheet.notes && (
              <>
                <Separator className="my-3" />
                <div>
                  <p className="text-xs text-slate-500 mb-1">Notes</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{runsheet.notes}</p>
                </div>
              </>
            )}

            {/* Dietaries */}
            {runsheet.dietaries && runsheet.dietaries.length > 0 && (
              <>
                <Separator className="my-3" />
                <div>
                  <p className="text-xs text-slate-500 mb-2">Dietary Requirements</p>
                  <div className="flex flex-wrap gap-2">
                    {runsheet.dietaries.map((d, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-800">
                        {d.name} × {d.count}
                        {d.notes && <span className="ml-1 text-amber-600">({d.notes})</span>}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Timeline ── */}
        {sortedItems.length > 0 && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {sortedItems.map((item, idx) => {
                  const cat = getCat(item.category);
                  const endTime = item.duration ? addMinutes(item.time, item.duration) : null;
                  return (
                    <div key={item.id ?? idx} className="flex gap-0 group">
                      {/* Time column */}
                      <div className="w-20 shrink-0 px-4 py-3 text-right">
                        <p className="text-sm font-mono font-semibold text-slate-700">{formatTime12(item.time)}</p>
                        {endTime && (
                          <p className="text-xs text-slate-400 font-mono">{formatTime12(endTime)}</p>
                        )}
                      </div>
                      {/* Colour strip */}
                      <div className={`w-1 shrink-0 ${cat.bg.split(" ")[0].replace("bg-", "bg-")} rounded-sm my-1`} />
                      {/* Content */}
                      <div className="flex-1 px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${cat.bg} ${cat.color} border`}>
                            {cat.label}
                          </Badge>
                          {item.duration && (
                            <span className="text-xs text-slate-400">{item.duration} min</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-sm text-slate-600 mt-1">{item.description}</p>
                        )}
                        {item.assignedTo && (
                          <p className="text-xs text-slate-400 mt-1">Assigned: {item.assignedTo}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── F&B: FOH ── */}
        {fohItems.length > 0 && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-800 flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-slate-500" />
                Front of House — Food &amp; Beverage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(fohByCourse).map(([course, courseItems]) => (
                <div key={course}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{course}</p>
                  <div className="space-y-2">
                    {courseItems.map((item, idx) => (
                      <div key={item.id ?? idx} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{item.dishName}</p>
                          {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.dietary && (
                              <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700 px-1.5 py-0">
                                {item.dietary}
                              </Badge>
                            )}
                            {item.serviceTime && (
                              <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700 px-1.5 py-0">
                                <Clock className="w-2.5 h-2.5 mr-0.5" />
                                {item.serviceTime}
                              </Badge>
                            )}
                            {item.staffAssigned && (
                              <span className="text-xs text-slate-400">→ {item.staffAssigned}</span>
                            )}
                          </div>
                          {item.platingNotes && (
                            <p className="text-xs text-slate-500 mt-1 italic">Plating: {item.platingNotes}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-semibold text-slate-700">×{item.qty}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── F&B: Kitchen ── */}
        {kitchenItems.length > 0 && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-800 flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-slate-500" />
                Kitchen Sheet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(kitchenByCourse).map(([course, courseItems]) => (
                <div key={course}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{course}</p>
                  <div className="space-y-2">
                    {courseItems.map((item, idx) => (
                      <div key={item.id ?? idx} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{item.dishName}</p>
                          {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                          {item.prepNotes && (
                            <p className="text-xs text-slate-500 mt-1 italic">Prep: {item.prepNotes}</p>
                          )}
                          {item.platingNotes && (
                            <p className="text-xs text-slate-500 mt-0.5 italic">Plating: {item.platingNotes}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.dietary && (
                              <Badge variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-700 px-1.5 py-0">
                                {item.dietary}
                              </Badge>
                            )}
                            {item.serviceTime && (
                              <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700 px-1.5 py-0">
                                <Clock className="w-2.5 h-2.5 mr-0.5" />
                                {item.serviceTime}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-sm font-semibold text-slate-700">×{item.qty}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Empty state ── */}
        {sortedItems.length === 0 && fohItems.length === 0 && kitchenItems.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Wine className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No items have been added to this runsheet yet.</p>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="text-center text-xs text-slate-400 pb-8">
          Powered by HOSTit · This page updates automatically
        </div>
      </main>
    </div>
  );
}
