import React from "react";
import { createPortal } from "react-dom";
import { FileText, X, Plus, Trash2, CheckCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { currency } from "@/lib/money";

/**
 * Raise a standalone invoice straight from the Payments board — without going
 * through a booking. Bill it to an existing enquiry (contact prefilled) or to a
 * one-off new contact (name + email). Always creates a DRAFT in Xero; the
 * operator approves and sends it there, same as every other invoice.
 */

const FIELD = "border border-stone-300 bg-white px-3 min-h-[44px] font-dm text-sm text-ink focus:outline-none focus:border-forest rounded-md";
const LABEL = "font-bebas text-xs tracking-widest text-stone-600 block mb-1";

type Line = { description: string; quantity: string; unitAmount: string };
type Lead = { id: number; firstName: string | null; lastName: string | null; email: string | null; eventType: string | null };

export function NewInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [lines, setLines] = React.useState<Line[]>([{ description: "", quantity: "1", unitAmount: "" }]);
  const [dueDate, setDueDate] = React.useState("");
  const [inclusive, setInclusive] = React.useState(false);
  const [billMode, setBillMode] = React.useState<"enquiry" | "new">("new");
  const [leadId, setLeadId] = React.useState<number | null>(null);
  const [contactName, setContactName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [leadSearch, setLeadSearch] = React.useState("");

  const leadsQuery = trpc.leads.list.useQuery({}, { enabled: billMode === "enquiry" });
  const leads: Lead[] = (leadsQuery.data as any) ?? [];
  const leadName = (l: Lead) => [l.firstName, l.lastName].filter(Boolean).join(" ") || l.email || `Enquiry #${l.id}`;
  const filteredLeads = React.useMemo(() => {
    const n = leadSearch.trim().toLowerCase();
    const base = leads.filter(l => !n || [l.firstName, l.lastName, l.email, l.eventType].some(v => (v ?? "").toLowerCase().includes(n)));
    return base.slice(0, 8);
  }, [leads, leadSearch]);

  const create = trpc.xero.createCustomInvoice.useMutation({
    onSuccess: (r) => {
      toast.success(`Draft invoice ${r.invoiceNumber ? `${r.invoiceNumber} ` : ""}created in ${r.tenantName}. Approve & send it in Xero.`);
      onCreated?.();
      onClose();
    },
    onError: (e) => toast.error(e.message || "Couldn't create the invoice"),
  });

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitAmount) || 0), 0);
  const nameSet = billMode === "enquiry" ? (leadId != null && contactName.trim().length > 0) : contactName.trim().length > 0;
  const linesOk = lines.some(l => l.description.trim() && l.unitAmount !== "" && !isNaN(Number(l.unitAmount)));
  const canSubmit = nameSet && linesOk && !create.isPending;

  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));
  const addLine = () => setLines(ls => [...ls, { description: "", quantity: "1", unitAmount: "" }]);
  const removeLine = (i: number) => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls);

  const pickLead = (l: Lead) => {
    setLeadId(l.id);
    setContactName(leadName(l));
    setContactEmail(l.email ?? "");
  };

  const submit = () => {
    if (!canSubmit) return;
    create.mutate({
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim() || undefined,
      leadId: billMode === "enquiry" && leadId != null ? leadId : undefined,
      dueDate: dueDate || undefined,
      inclusive,
      lines: lines
        .filter(l => l.description.trim() && l.unitAmount !== "")
        .map(l => ({ description: l.description.trim(), quantity: Number(l.quantity) || 1, unitAmount: Number(l.unitAmount) })),
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8" onClick={onClose}>
      <div className="w-full max-w-lg bg-cream rounded-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gold/30">
          <h2 className="font-cormorant text-2xl font-semibold text-ink flex items-center gap-2">
            <FileText className="w-5 h-5 text-forest" aria-hidden /> New invoice
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-stone-500 hover:text-ink"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Line items */}
          <div>
            <span className={LABEL}>Items</span>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <input className={`${FIELD} flex-1 min-w-0`} placeholder="Description (e.g. Venue hire)"
                    value={l.description} onChange={e => setLine(i, { description: e.target.value })} />
                  <input className={`${FIELD} w-16 text-center`} inputMode="decimal" aria-label="Quantity"
                    value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} />
                  <input className={`${FIELD} w-24 text-right`} inputMode="decimal" placeholder="0.00" aria-label="Unit price"
                    value={l.unitAmount} onChange={e => setLine(i, { unitAmount: e.target.value })} />
                  <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1}
                    aria-label="Remove item" className="min-h-[44px] px-1.5 text-stone-400 hover:text-red-500 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addLine} className="mt-2 inline-flex items-center gap-1 font-bebas text-xs tracking-widest text-forest hover:underline">
              <Plus className="w-3.5 h-3.5" /> ADD ITEM
            </button>
          </div>

          {/* Totals + GST */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none font-dm text-sm text-ink">
              <input type="checkbox" checked={inclusive} onChange={e => setInclusive(e.target.checked)} className="w-4 h-4 accent-forest" />
              Prices include GST
            </label>
            <div className="font-dm text-sm text-ink">
              Subtotal: <span className="font-semibold tabular-nums">{currency(total)}</span>
              <span className="text-stone-500 text-xs ml-1">{inclusive ? "(incl. GST)" : "(excl. GST)"}</span>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className={LABEL} htmlFor="inv-due">Due date (optional)</label>
            <input id="inv-due" type="date" className={`${FIELD} w-full`} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>

          {/* Bill to — the "Other" section: existing enquiry or a new contact */}
          <div className="border-t border-gold/30 pt-4">
            <span className={LABEL}>Bill to</span>
            <div className="flex gap-1 mb-3" role="tablist" aria-label="Bill to">
              <button type="button" role="tab" aria-selected={billMode === "new"} onClick={() => { setBillMode("new"); setLeadId(null); }}
                className={`flex-1 min-h-[40px] px-3 font-bebas text-xs tracking-widest rounded-md border ${billMode === "new" ? "bg-forest text-cream border-forest" : "border-gold/40 text-ink hover:bg-gold/10"}`}>
                NEW CONTACT
              </button>
              <button type="button" role="tab" aria-selected={billMode === "enquiry"} onClick={() => { setBillMode("enquiry"); setContactName(""); setContactEmail(""); }}
                className={`flex-1 min-h-[40px] px-3 font-bebas text-xs tracking-widest rounded-md border ${billMode === "enquiry" ? "bg-forest text-cream border-forest" : "border-gold/40 text-ink hover:bg-gold/10"}`}>
                EXISTING ENQUIRY
              </button>
            </div>

            {billMode === "enquiry" ? (
              <div className="space-y-2">
                {leadId == null ? (
                  <>
                    <div className="relative">
                      <Search className="w-4 h-4 text-sage absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                      <input className={`${FIELD} w-full pl-9`} placeholder="Search enquiries by name, email or event…"
                        value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
                    </div>
                    <div className="border border-stone-200 rounded-md divide-y divide-stone-100 max-h-48 overflow-y-auto">
                      {leadsQuery.isLoading ? (
                        <p className="px-3 py-3 font-dm text-xs text-stone-500">Loading enquiries…</p>
                      ) : filteredLeads.length === 0 ? (
                        <p className="px-3 py-3 font-dm text-xs text-stone-500">No enquiries match.</p>
                      ) : filteredLeads.map(l => (
                        <button type="button" key={l.id} onClick={() => pickLead(l)}
                          className="w-full text-left px-3 py-2 hover:bg-gold/10">
                          <div className="font-dm text-sm text-ink">{leadName(l)}</div>
                          <div className="font-dm text-xs text-stone-500">{[l.email, l.eventType].filter(Boolean).join(" · ")}</div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3 border border-stone-200 rounded-md px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-dm text-sm text-ink truncate">{contactName}</div>
                      {contactEmail && <div className="font-dm text-xs text-stone-500 truncate">{contactEmail}</div>}
                    </div>
                    <button type="button" onClick={() => { setLeadId(null); setContactName(""); setContactEmail(""); }}
                      className="font-dm text-xs text-forest hover:underline shrink-0">Change</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input className={`${FIELD} w-full`} placeholder="Contact name" value={contactName} onChange={e => setContactName(e.target.value)} />
                <input className={`${FIELD} w-full`} type="email" placeholder="Email (optional)" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gold/30 flex items-center justify-between gap-3">
          <p className="font-dm text-xs text-stone-500">Creates a <strong>draft</strong> in Xero — approve &amp; send it there.</p>
          <button onClick={submit} disabled={!canSubmit}
            className="vf-btn vf-btn-primary inline-flex items-center gap-1.5 disabled:opacity-40">
            <CheckCircle className="w-4 h-4" /> {create.isPending ? "CREATING…" : "CREATE DRAFT"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
