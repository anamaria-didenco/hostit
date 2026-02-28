import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer, CheckSquare, Square, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  category?: string;
  required?: boolean;
  checkedAt?: string;
  notes?: string;
}

interface ChecklistInstance {
  id: number;
  name: string;
  items: ChecklistItem[];
  bookingId?: number;
  templateId?: number;
  createdAt: Date;
}

export default function Checklist() {
  const { user, isAuthenticated, loading } = useAuth();
  const bookingId = parseInt(new URLSearchParams(window.location.search).get("bookingId") ?? "0") || undefined;
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const { data: instances, refetch: refetchInstances } = trpc.checklists.getForBooking.useQuery(
    { bookingId: bookingId! },
    { enabled: !!bookingId && isAuthenticated }
  );

  const { data: templates } = trpc.checklists.listTemplates.useQuery(undefined, { enabled: isAuthenticated });

  const assignTemplate = trpc.checklists.assignToBooking.useMutation({
    onSuccess: () => { refetchInstances(); setShowAssignModal(false); toast.success("Checklist assigned!"); },
    onError: () => toast.error("Failed to assign checklist"),
  });

  const updateInstance = trpc.checklists.updateInstance.useMutation({
    onSuccess: () => refetchInstances(),
  });

  const deleteInstance = trpc.checklists.deleteInstance.useMutation({
    onSuccess: () => { refetchInstances(); setSelectedInstanceId(null); toast.success("Checklist removed"); },
  });

  const selectedInstance = instances?.find((i: any) => i.id === selectedInstanceId) ?? instances?.[0] ?? null;

  useEffect(() => {
    if (instances?.length && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].id);
    }
  }, [instances]);

  const toggleItem = (instance: any, itemId: string) => {
    const items = (instance.items as ChecklistItem[]).map((item: ChecklistItem) =>
      item.id === itemId ? { ...item, checked: !item.checked, checkedAt: !item.checked ? new Date().toISOString() : undefined } : item
    );
    updateInstance.mutate({ id: instance.id, items });
  };

  const completedCount = (instance: any) => {
    const items = instance?.items as ChecklistItem[] ?? [];
    return items.filter(i => i.checked).length;
  };

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><div className="font-bebas text-xl tracking-widest text-muted-foreground">LOADING...</div></div>;

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      {/* Nav */}
      <nav className="bg-ink text-cream px-6 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <button className="flex items-center gap-2 font-bebas text-xs tracking-widest text-cream/60 hover:text-cream">
              <ChevronLeft className="w-4 h-4" /> BACK TO DASHBOARD
            </button>
          </Link>
          <div className="w-px h-4 bg-cream/20" />
          <span className="font-bebas text-sm tracking-widest text-cream">EVENT CHECKLISTS</span>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <Button onClick={() => setShowAssignModal(true)} size="sm"
              className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest text-xs rounded-none">
              <Plus className="w-3.5 h-3.5 mr-1" /> ASSIGN TEMPLATE
            </Button>
          )}
          <Button onClick={() => window.print()} variant="outline" size="sm"
            className="font-bebas tracking-widest text-xs border-cream/30 text-cream hover:bg-cream/10">
            <Printer className="w-3.5 h-3.5 mr-1" /> PRINT
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 print:px-0 print:py-4">
        {/* Instance selector */}
        {(instances ?? []).length > 1 && (
          <div className="flex gap-2 mb-6 print:hidden">
            {(instances ?? []).map((inst: any) => (
              <button
                key={inst.id}
                onClick={() => setSelectedInstanceId(inst.id)}
                className={`font-bebas text-xs tracking-widest px-4 py-2 border transition-colors ${
                  selectedInstanceId === inst.id
                    ? "bg-ink text-cream border-ink"
                    : "bg-white text-ink border-border hover:border-ink"
                }`}
              >
                {inst.name}
              </button>
            ))}
          </div>
        )}

        {/* No checklists */}
        {(instances ?? []).length === 0 && (
          <div className="text-center py-16">
            <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-cormorant text-2xl font-semibold text-ink mb-2">No Checklists Yet</h2>
            <p className="font-dm text-sm text-muted-foreground mb-6">
              Assign a checklist template to this event to get started.
            </p>
            {isAuthenticated && (
              <Button onClick={() => setShowAssignModal(true)}
                className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest rounded-none">
                ASSIGN TEMPLATE
              </Button>
            )}
          </div>
        )}

        {/* Active checklist */}
        {selectedInstance && (
          <div>
            {/* Header */}
            <div className="flex items-start justify-between mb-6 print:mb-4">
              <div>
                <h1 className="font-cormorant text-3xl font-semibold text-ink print:text-2xl">{selectedInstance.name}</h1>
                <p className="font-dm text-sm text-muted-foreground mt-1">
                  {completedCount(selectedInstance)} of {(selectedInstance.items as ChecklistItem[]).length} tasks completed
                </p>
              </div>
              <button
                onClick={() => { if (confirm("Remove this checklist?")) deleteInstance.mutate({ id: selectedInstance.id }); }}
                className="text-muted-foreground hover:text-destructive transition-colors print:hidden"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-border h-1.5 mb-6 print:hidden">
              <div
                className="bg-burgundy h-1.5 transition-all"
                style={{ width: `${(selectedInstance.items as ChecklistItem[]).length > 0 ? (completedCount(selectedInstance) / (selectedInstance.items as ChecklistItem[]).length) * 100 : 0}%` }}
              />
            </div>

            {/* Items */}
            <div className="space-y-2">
              {(selectedInstance.items as ChecklistItem[]).map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors print:cursor-default print:border-stone-200 ${
                    item.checked
                      ? "bg-stone-50 border-stone-200 print:bg-white"
                      : "bg-white border-border hover:border-ink print:bg-white"
                  }`}
                  onClick={() => !loading && toggleItem(selectedInstance, item.id)}
                >
                  {item.checked
                    ? <CheckSquare className="w-5 h-5 text-burgundy flex-shrink-0 print:text-black" />
                    : <Square className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  }
                  <span className={`font-dm text-sm flex-1 ${item.checked ? "line-through text-muted-foreground" : "text-ink"}`}>
                    {item.text}
                  </span>
                  {item.category && (
                    <span className="font-bebas text-xs tracking-widest text-muted-foreground bg-stone-100 px-2 py-0.5 print:border print:border-stone-300">
                      {item.category}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Print footer */}
            <div className="hidden print:block mt-8 pt-4 border-t border-stone-300">
              <div className="flex justify-between font-dm text-xs text-stone-500">
                <span>HOSTit — Event Management</span>
                <span>Printed: {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assign Template Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-cream border border-border shadow-xl max-w-md w-full p-6">
            <h2 className="font-cormorant text-xl font-semibold text-ink mb-4">Assign Checklist Template</h2>
            {(templates ?? []).length === 0 ? (
              <div className="text-center py-6">
                <p className="font-dm text-sm text-muted-foreground mb-4">No templates yet. Create one in Settings first.</p>
                <Link href="/dashboard">
                  <Button className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest rounded-none">
                    GO TO SETTINGS
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {(templates ?? []).map((t: any) => {
                  const items = Array.isArray(t.items) ? t.items : [];
                  return (
                    <button
                      key={t.id}
                      onClick={() => assignTemplate.mutate({ templateId: t.id, bookingId: bookingId! })}
                      disabled={assignTemplate.isPending}
                      className="w-full text-left p-3 border border-border hover:border-ink bg-white transition-colors"
                    >
                      <div className="font-cormorant font-semibold text-base text-ink">{t.name}</div>
                      {t.description && <div className="font-dm text-xs text-muted-foreground">{t.description}</div>}
                      <div className="font-dm text-xs text-muted-foreground mt-1">{items.length} items</div>
                    </button>
                  );
                })}
              </div>
            )}
            <button onClick={() => setShowAssignModal(false)}
              className="mt-4 w-full font-bebas tracking-widest text-xs text-muted-foreground hover:text-ink py-2">
              CANCEL
            </button>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body { background: white; }
          nav, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
