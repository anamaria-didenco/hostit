import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import FloorPlanEditor, { type CanvasData } from "@/components/FloorPlanEditor";

/**
 * /floor-plan — the standalone floor plan page.
 *
 * This now renders the SAME FloorPlanEditor used in the Dashboard event panel
 * and the public share view, so there is one editor and one save format. The
 * old bespoke canvas (which saved an incompatible `{canvasSize, elements:[{w,h}]}`
 * shape) has been retired — that mismatch was the root cause of the crashes.
 *
 * Furniture inventory is managed in Settings → Floor Plans; the editor's
 * Inventory tab lists those items for placing on the canvas.
 */
export default function FloorPlanBuilder() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const bookingId = parseInt(params.get("bookingId") ?? "0") || undefined;
  // Accept both ?id (used by older links in RunsheetBuilder) and ?planId.
  const initialPlanId = parseInt(params.get("id") ?? params.get("planId") ?? "0") || undefined;

  const [savedPlanId, setSavedPlanId] = useState<number | undefined>(initialPlanId);
  const [shareToken, setShareToken] = useState<string | undefined>(undefined);

  const planQuery = trpc.floorPlans.get.useQuery(
    { id: initialPlanId! },
    { enabled: !!initialPlanId && !!user },
  );
  // Opened from an event (?bookingId only): pick up that event's latest plan
  // so saves update it, instead of starting blank and adding a new row each time.
  // Looked up once per visit: a refetch that turned up a just-saved plan would
  // change the editor key below and remount it, dropping unsaved changes.
  const eventPlansQuery = trpc.floorPlans.list.useQuery(
    { bookingId: bookingId! },
    { enabled: !initialPlanId && !!bookingId && !!user, refetchOnWindowFocus: false, refetchOnReconnect: false },
  );
  const eventPlan = useMemo(() => [...(eventPlansQuery.data ?? [])].sort(
    (a: any, b: any) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime(),
  )[0], [eventPlansQuery.data]);
  const existingPlan = initialPlanId ? planQuery.data : eventPlan;
  // Save into the plan on screen; only a brand-new plan creates a row.
  const planId = savedPlanId ?? existingPlan?.id;

  const savePlan = trpc.floorPlans.save.useMutation({
    onSuccess: (data: any) => { if (data?.id) setSavedPlanId(data.id); toast.success("Floor plan saved!"); },
    onError: (e: any) => toast.error(e?.message ? `Save failed: ${e.message}` : "Failed to save floor plan"),
  });

  // Wait for an existing plan to load before mounting the editor, so its
  // initialData (read once on mount) is correct — including when a cached copy
  // from an earlier visit is being refreshed.
  const activeQuery = initialPlanId ? planQuery : bookingId ? eventPlansQuery : null;
  if (activeQuery && (authLoading || activeQuery.isLoading || (activeQuery.isFetching && !activeQuery.isFetchedAfterMount))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-400 text-lg animate-pulse">Loading floor plan…</div>
      </div>
    );
  }
  // A failed load must not fall through to a blank editor — saving that would
  // overwrite the plan or start a duplicate. (A failed background refetch keeps
  // its data, so the editor stays up.)
  if (activeQuery?.isError && activeQuery.data === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-100 px-4 text-center">
        <div className="text-gray-700 text-lg">Couldn't load the floor plan.</div>
        <button
          onClick={() => activeQuery.refetch()}
          disabled={activeQuery.isFetching}
          className="btn-forest font-bebas tracking-widest text-xs px-4 py-2 disabled:opacity-50"
        >
          {activeQuery.isFetching ? "TRYING..." : "TRY AGAIN"}
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div role="banner" className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-1 text-xs font-bebas tracking-widest text-ink/70 hover:text-ink transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> BACK
        </button>
        <h1 className="font-bold text-gray-800 text-sm m-0">Floor Plan Builder</h1>
        <span className="text-xs text-gray-600 ml-1">Manage furniture in Settings → Floor Plans</span>
      </div>

      {/* Unified editor fills the rest of the screen */}
      <div role="main" className="flex-1 min-h-0">
        <FloorPlanEditor
          key={existingPlan?.id ?? (bookingId ? `b${bookingId}` : "new")}
          initialData={(existingPlan?.canvasData as CanvasData | undefined) ?? undefined}
          name={existingPlan?.name ?? "Floor Plan"}
          bgImageUrl={(existingPlan as any)?.bgImageUrl ?? undefined}
          planId={planId}
          shareToken={(existingPlan as any)?.shareToken ?? shareToken}
          isSaving={savePlan.isPending}
          onShareTokenGenerated={(t: string) => setShareToken(t)}
          onSave={(canvasData: CanvasData, name: string, bgImageUrl?: string) => {
            savePlan.mutate({ id: planId, bookingId, name, canvasData, bgImageUrl } as any);
          }}
        />
      </div>
    </div>
  );
}
