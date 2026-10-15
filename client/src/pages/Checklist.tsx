import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer, CheckSquare, Square, Plus, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { SectionHead } from "@/components/ui/section-head";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  category?: string;
  required?: boolean;
  checkedAt?: string;
  notes?: string;
}

export default function Checklist() {
  const { isAuthenticated, loading } = useAuth();
  const bookingId = parseInt(new URLSearchParams(window.location.search).get("bookingId") ?? "0") || undefined;
  const [showAssignModal, setShowAssignModal] = useState(false);
  useEscapeKey(showAssignModal, () => setShowAssignModal(false));

  // The event's one checklist is its run sheet's staff checklist — the same
  // list ticked on the run sheet and from the staff link (F-29).
  const { data, refetch, isLoading: checklistLoading } = trpc.checklists.getForBooking.useQuery(
    { bookingId: bookingId! },
    { enabled: !!bookingId && isAuthenticated }
  );
  const runsheet = data?.runsheet ?? null;
  const instance = data?.instance ?? null;
  const items = (instance?.items ?? []) as ChecklistItem[];

  const { data: templates } = trpc.checklists.listTemplates.useQuery(undefined, { enabled: isAuthenticated });

  // First visit: create the run sheet's checklist and carry over any older
  // lists made on this page. Staff logins are read-only, so a refusal is fine.
  const setupFor = useRef<number | null>(null);
  const setupChecklist = trpc.checklists.getOrCreateForRunsheet.useMutation({
    onSuccess: () => refetch(),
    onError: () => {},
  });
  useEffect(() => {
    if (!runsheet || !data?.needsSetup || setupFor.current === runsheet.id) return;
    setupFor.current = runsheet.id;
    setupChecklist.mutate({
      runsheetId: runsheet.id,
      bookingId,
      name: runsheet.title ? `${runsheet.title} — Staff Checklist` : undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsheet?.id, data?.needsSetup]);

  const assignTemplate = trpc.checklists.assignToBooking.useMutation({
    onSuccess: () => { refetch(); setShowAssignModal(false); toast.success("Template tasks added"); },
    onError: () => toast.error("Failed to assign checklist"),
  });

  // One item at a time on the server, so a tick made here never overwrites
  // one a staff member just made from their link.
  const toggleByToken = trpc.checklists.toggleItemByToken.useMutation({
    onSuccess: () => refetch(),
    onError: () => { toast.error("Couldn't save that tick. Try again."); refetch(); },
  });

  const toggleItem = (itemId: string) => {
    if (!instance?.shareToken) return;
    const item = items.find(i => i.id === itemId);
    toggleByToken.mutate({ token: instance.shareToken, itemId, checked: !item?.checked });
  };

  const completedCount = items.filter(i => i.checked).length;
  const runsheetHref = runsheet ? `/runsheet?id=${runsheet.id}&bookingId=${bookingId}` : `/runsheet?bookingId=${bookingId}`;

  if (loading) return <div className="min-h-screen bg-cream flex items-center justify-center"><div className="font-bebas text-xl tracking-widest text-muted-foreground">LOADING...</div></div>;

  return (
    <div className="min-h-screen bg-cream print:bg-white">
      {/* Nav */}
      <nav className="bg-ink text-cream px-4 md:px-6 py-3 flex items-center justify-between flex-wrap gap-y-2 gap-2 print:hidden">
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <Link href="/dashboard">
            <button className="flex items-center gap-1.5 font-bebas text-xs tracking-widest text-cream/60 hover:text-cream min-h-[44px]">
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">BACK TO DASHBOARD</span>
              <span className="sm:hidden">BACK</span>
            </button>
          </Link>
          <div className="w-px h-4 bg-cream/20 hidden sm:block" />
          <span className="font-bebas text-xs md:text-sm tracking-widest text-cream truncate">EVENT CHECKLIST</span>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          {isAuthenticated && runsheet && (
            <Button onClick={() => setShowAssignModal(true)} size="sm"
              className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest text-xs rounded-none min-h-[44px]"
              aria-label="Assign template"
            >
              <Plus className="w-3.5 h-3.5 sm:mr-1" />
              <span className="hidden sm:inline">ASSIGN TEMPLATE</span>
            </Button>
          )}
          <Button onClick={() => window.print()} variant="outline" size="sm"
            className="font-bebas tracking-widest text-xs border-cream/30 text-cream hover:bg-cream/10 min-h-[44px]"
            aria-label="Print"
          >
            <Printer className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">PRINT</span>
          </Button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 print:px-0 print:py-4">
        {/* No event */}
        {!bookingId && (
          <div className="text-center py-16">
            <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-cormorant text-2xl font-semibold text-ink mb-2">No Event Selected</h1>
            <p className="font-dm text-sm text-muted-foreground">Open the checklist from an event.</p>
          </div>
        )}

        {bookingId && checklistLoading && (
          <div className="text-center py-16 font-bebas text-xl tracking-widest text-muted-foreground">LOADING...</div>
        )}

        {/* No run sheet yet — the checklist lives on it */}
        {bookingId && data && !runsheet && (
          <div className="text-center py-16">
            <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="font-cormorant text-2xl font-semibold text-ink mb-2">No Run Sheet Yet</h1>
            <p className="font-dm text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              This event's checklist lives on its run sheet, so the team ticks one list — here, on the run sheet and from the staff link.
              {data.oldListCount > 0 && " The checklist tasks already on this event carry over when you create it."}
            </p>
            {isAuthenticated && (
              <Button asChild className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest rounded-none min-h-[44px]">
                <Link href={runsheetHref}>
                  <Clock className="w-4 h-4 mr-1.5" />
                  CREATE RUN SHEET
                </Link>
              </Button>
            )}
          </div>
        )}

        {/* Run sheet, checklist still being set up */}
        {runsheet && !instance && (
          <div className="text-center py-16 font-dm text-sm text-muted-foreground">
            {setupChecklist.isPending ? "Setting up the checklist…" : "No checklist on this event's run sheet yet."}
          </div>
        )}

        {/* The event checklist */}
        {runsheet && instance && (
          <div>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-6 print:mb-4">
              <div className="min-w-0">
                <div className="font-bebas text-[10px] font-extrabold uppercase tracking-[0.32em] text-primary mb-1">CHECKLIST</div>
                <h1 className="font-cormorant text-2xl md:text-3xl font-semibold text-ink tracking-[-0.01em] print:text-2xl break-words">{instance.name}</h1>
                <p className="font-dm text-sm text-muted-foreground mt-1">
                  {completedCount} of {items.length} tasks completed
                </p>
                <p className="font-dm text-xs text-muted-foreground mt-1 print:hidden">
                  The same list as the run sheet and the staff checklist link.
                </p>
              </div>
              <Link href={runsheetHref}>
                <button className="flex items-center gap-1.5 font-bebas text-xs tracking-widest text-forest hover:text-ink transition-colors print:hidden min-h-[44px] flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span>RUN SHEET</span>
                </button>
              </Link>
            </div>

            {/* Progress bar */}
            <div
              className="w-full bg-border h-1.5 mb-6 print:hidden"
              role="progressbar"
              aria-valuenow={completedCount}
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-label={`${completedCount} of ${items.length} tasks complete`}
            >
              <div
                className="bg-burgundy h-1.5 transition-all"
                style={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }}
              />
            </div>

            {/* Items */}
            <SectionHead
              title="Setup Checklist"
              meta={`${completedCount}/${items.length}`}
              className="mb-3"
            />
            {items.length === 0 && (
              <p className="font-dm text-sm text-muted-foreground py-6">
                No tasks yet. Assign a template, or add tasks on the run sheet.
              </p>
            )}
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  role="checkbox"
                  aria-checked={item.checked}
                  tabIndex={0}
                  className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors print:cursor-default print:border-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy ${
                    item.checked
                      ? "bg-stone-50 border-stone-200 print:bg-white"
                      : "bg-white border-border hover:border-ink print:bg-white"
                  }`}
                  onClick={() => !loading && toggleItem(item.id)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!loading) toggleItem(item.id); } }}
                >
                  {item.checked
                    ? <CheckSquare className="w-5 h-5 text-burgundy flex-shrink-0 print:text-black" />
                    : <Square className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  }
                  <span className={`font-dm text-sm flex-1 ${item.checked ? "line-through text-muted-foreground" : "text-ink"}`}>
                    {item.text}
                  </span>
                  {item.category && (
                    <span className="font-bebas text-xs tracking-widest text-muted-foreground bg-secondary rounded-[3px] px-2 py-0.5 print:border print:border-stone-300">
                      {item.category}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Print footer */}
            <div className="hidden print:block mt-8 pt-4 border-t border-stone-300">
              <div className="flex justify-between font-dm text-xs text-stone-500">
                <span>VenueFlowHQ — Event Management</span>
                <span>Printed: {new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" })}</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Assign Template Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden" onClick={() => setShowAssignModal(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="assign-template-title" className="bg-cream border border-border shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 id="assign-template-title" className="font-cormorant text-xl font-semibold text-ink mb-1">Assign Checklist Template</h2>
            <p className="font-dm text-xs text-muted-foreground mb-4">Its tasks are added to this event's checklist.</p>
            {(templates ?? []).length === 0 ? (
              <div className="text-center py-6">
                <p className="font-dm text-sm text-muted-foreground mb-4">No templates yet. Create one in Settings first.</p>
                <Button asChild className="bg-burgundy hover:bg-burgundy/90 text-cream font-bebas tracking-widest rounded-none">
                  <Link href="/dashboard">
                    GO TO SETTINGS
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {(templates ?? []).map((t: any) => {
                  const items = Array.isArray(t.items) ? t.items : [];
                  return (
                    <button
                      key={t.id}
                      onClick={() => { if (bookingId) assignTemplate.mutate({ templateId: t.id, bookingId }); }}
                      disabled={assignTemplate.isPending || !bookingId}
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
