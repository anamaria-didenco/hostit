import { useState } from "react";
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
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const bookingId = parseInt(params.get("bookingId") ?? "0") || undefined;
  // Accept both ?id (used by older links in RunsheetBuilder) and ?planId.
  const initialPlanId = parseInt(params.get("id") ?? params.get("planId") ?? "0") || undefined;

  const [savedPlanId, setSavedPlanId] = useState<number | undefined>(initialPlanId);
  const [shareToken, setShareToken] = useState<string | undefined>(undefined);

  const { data: existingPlan, isLoading } = trpc.floorPlans.get.useQuery(
    { id: initialPlanId! },
    { enabled: !!initialPlanId && !!user },
  );

  const savePlan = trpc.floorPlans.save.useMutation({
    onSuccess: (data: any) => { if (data?.id) setSavedPlanId(data.id); toast.success("Floor plan saved!"); },
    onError: () => toast.error("Failed to save floor plan"),
  });

  // Wait for an existing plan to load before mounting the editor, so its
  // initialData (read once on mount) is correct.
  if (initialPlanId && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-400 text-lg animate-pulse">Loading floor plan…</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-1 text-xs font-bebas tracking-widest text-ink/50 hover:text-ink transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> BACK
        </button>
        <span className="font-bold text-gray-800 text-sm">Floor Plan Builder</span>
        <span className="text-xs text-gray-400 ml-1">Manage furniture in Settings → Floor Plans</span>
      </div>

      {/* Unified editor fills the rest of the screen */}
      <div className="flex-1 min-h-0">
        <FloorPlanEditor
          key={existingPlan?.id ?? (bookingId ? `b${bookingId}` : "new")}
          initialData={(existingPlan?.canvasData as CanvasData | undefined) ?? undefined}
          name={existingPlan?.name ?? "Floor Plan"}
          bgImageUrl={(existingPlan as any)?.bgImageUrl ?? undefined}
          planId={savedPlanId}
          shareToken={(existingPlan as any)?.shareToken ?? shareToken}
          isSaving={savePlan.isPending}
          onShareTokenGenerated={(t: string) => setShareToken(t)}
          onSave={(canvasData: CanvasData, name: string, bgImageUrl?: string) => {
            savePlan.mutate({ id: savedPlanId, bookingId, name, canvasData, bgImageUrl } as any);
          }}
        />
      </div>
    </div>
  );
}
