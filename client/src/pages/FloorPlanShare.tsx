import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import FloorPlanEditor from "@/components/FloorPlanEditor";

export default function FloorPlanShare() {
  const { token } = useParams<{ token: string }>();
  const { data: plan, isLoading, error } = trpc.floorPlans.getByToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-gray-400 text-lg animate-pulse">Loading floor plan…</div>
    </div>
  );

  if (!plan || error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="text-4xl mb-4">🗺️</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Floor Plan Not Found</h2>
        <p className="text-gray-400 text-sm">This share link may be invalid or expired.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div>
          <span className="font-bold text-gray-800 text-base">{plan.name}</span>
          <span className="ml-3 text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded">READ ONLY</span>
        </div>
        <div className="text-xs text-gray-400">Shared via HOSTit</div>
      </div>

      {/* Editor in read-only mode */}
      <div className="flex-1" style={{ height: "calc(100vh - 57px)" }}>
        <FloorPlanEditor
          initialData={(plan.canvasData as any) ?? undefined}
          bgImageUrl={plan.bgImageUrl ?? undefined}
          name={plan.name}
          readOnly
        />
      </div>
    </div>
  );
}
