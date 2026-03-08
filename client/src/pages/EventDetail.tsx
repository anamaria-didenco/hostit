import { useState, useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, FileText, Clock, MapPin, Users, DollarSign, CheckCircle,
  Calendar, Mail, Phone, Edit3, Save, X, ExternalLink, Printer,
  ClipboardList, LayoutGrid, ChefHat, MessageSquare, Package, Layers,
  Link2, PenLine, Plus, Trash2
} from "lucide-react";

const EVENT_TYPES = [
  "Wedding", "Corporate", "Birthday", "Engagement", "Cocktail Party",
  "Christmas Party", "Gala Dinner", "Product Launch", "Conference",
  "Baby Shower", "Hen's Party", "Fundraiser", "Other"
];

const SPACES = ["Whole Venue", "Main Dining Room", "Private Dining Room", "Bar Area", "Terrace", "Rooftop"];

export default function EventDetail() {
  const [, params] = useRoute("/event/:id");
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const bookingId = params?.id ? parseInt(params.id) : 0;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  const utils = trpc.useUtils();
  const { data: booking, isLoading } = trpc.bookings.getById.useQuery(
    { id: bookingId },
    { enabled: !!user?.id && bookingId > 0 }
  );
  const { data: spaces } = trpc.spaces.list.useQuery(undefined, { enabled: !!user?.id });
  const { data: payments } = trpc.payments.list.useQuery(
    { bookingId },
    { enabled: !!user?.id && bookingId > 0 }
  );

  const updateBooking = trpc.bookings.update.useMutation({
    onSuccess: () => {
      utils.bookings.getById.invalidate({ id: bookingId });
      setEditing(false);
      toast.success("Event updated");
    },
    onError: () => toast.error("Failed to update event"),
  });

  useEffect(() => {
    if (booking) {
      setForm({
        firstName: booking.firstName ?? "",
        lastName: booking.lastName ?? "",
        email: booking.email ?? "",
        eventType: booking.eventType ?? "",
        eventDate: booking.eventDate ? new Date(booking.eventDate).toISOString().slice(0, 16) : "",
        eventEndDate: booking.eventEndDate ? new Date(booking.eventEndDate).toISOString().slice(0, 16) : "",
        guestCount: booking.guestCount ?? "",
        spaceName: booking.spaceName ?? "",
        totalNzd: booking.totalNzd ?? "",
        depositNzd: booking.depositNzd ?? "",
        depositPaid: booking.depositPaid ?? false,
        status: booking.status ?? "confirmed",
        notes: booking.notes ?? "",
      });
    }
  }, [booking]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="font-bebas tracking-widest text-ink/40 text-sm">LOADING EVENT...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
        <div className="font-cormorant text-2xl text-ink">Event not found</div>
        <Link href="/dashboard"><button className="btn-forest font-bebas tracking-widest text-xs px-4 py-2">BACK TO DASHBOARD</button></Link>
      </div>
    );
  }

  const totalPaid = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const outstanding = Number(booking.totalNzd ?? 0) - totalPaid;

  const handleSave = () => {
    updateBooking.mutate({
      id: bookingId,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      eventType: form.eventType || undefined,
      eventDate: form.eventDate || undefined,
      eventEndDate: form.eventEndDate || null,
      guestCount: form.guestCount ? parseInt(form.guestCount) : null,
      spaceName: form.spaceName || null,
      totalNzd: form.totalNzd ? parseFloat(form.totalNzd) : null,
      depositNzd: form.depositNzd ? parseFloat(form.depositNzd) : null,
      depositPaid: form.depositPaid,
      status: form.status,
      notes: form.notes || null,
    });
  };

  const statusColor = booking.status === 'confirmed' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : booking.status === 'tentative' ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-stone-500 bg-stone-50 border-stone-200';

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <nav className="bg-forest-dark sticky top-0 z-50 border-b border-gold/20 h-14 flex items-center px-4 gap-4">
        <button onClick={() => setLocation('/dashboard')} className="text-cream/70 hover:text-cream flex items-center gap-1.5 font-bebas tracking-widest text-xs">
          <ArrowLeft className="w-4 h-4" /> DASHBOARD
        </button>
        <div className="h-4 w-px bg-gold/20" />
        <span className="font-cormorant text-cream font-semibold text-base">
          {booking.firstName} {booking.lastName} — {booking.eventType || "Event"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="font-bebas tracking-widest text-xs text-cream/60 hover:text-cream flex items-center gap-1 px-3 py-1.5">
                <X className="w-3 h-3" /> CANCEL
              </button>
              <button onClick={handleSave} disabled={updateBooking.isPending}
                className="btn-gold font-bebas tracking-widest text-xs px-4 py-1.5 flex items-center gap-1">
                <Save className="w-3 h-3" /> {updateBooking.isPending ? "SAVING..." : "SAVE CHANGES"}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-gold font-bebas tracking-widest text-xs px-4 py-1.5 flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> EDIT EVENT
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — Event Details */}
        <div className="lg:col-span-2 space-y-6">

          {/* Status + Quick Info */}
          <div className="dante-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="gold-rule max-w-xs mb-2"><span>EVENT DETAILS</span></div>
                <h1 className="font-cormorant text-ink font-semibold" style={{ fontSize: '1.8rem' }}>
                  {booking.firstName} {booking.lastName}
                </h1>
                <div className="font-dm text-sm text-ink/60 mt-1">{booking.email}</div>
              </div>
              <span className={`font-bebas text-xs tracking-widest px-3 py-1 border ${statusColor}`}>
                {booking.status?.toUpperCase()}
              </span>
            </div>

            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">FIRST NAME</label>
                  <Input value={form.firstName} onChange={e => setForm((p: any) => ({ ...p, firstName: e.target.value }))} className="font-dm text-sm" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">LAST NAME</label>
                  <Input value={form.lastName} onChange={e => setForm((p: any) => ({ ...p, lastName: e.target.value }))} className="font-dm text-sm" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">EMAIL</label>
                  <Input type="email" value={form.email} onChange={e => setForm((p: any) => ({ ...p, email: e.target.value }))} className="font-dm text-sm" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">EVENT TYPE</label>
                  <Select value={form.eventType} onValueChange={v => setForm((p: any) => ({ ...p, eventType: v }))}>
                    <SelectTrigger className="font-dm text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>{EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">EVENT DATE & TIME</label>
                  <Input type="datetime-local" value={form.eventDate} onChange={e => setForm((p: any) => ({ ...p, eventDate: e.target.value }))} className="font-dm text-sm" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">END DATE & TIME</label>
                  <Input type="datetime-local" value={form.eventEndDate} onChange={e => setForm((p: any) => ({ ...p, eventEndDate: e.target.value }))} className="font-dm text-sm" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">GUEST COUNT</label>
                  <Input type="number" value={form.guestCount} onChange={e => setForm((p: any) => ({ ...p, guestCount: e.target.value }))} className="font-dm text-sm" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">SPACE / ROOM</label>
                  <Select value={form.spaceName} onValueChange={v => setForm((p: any) => ({ ...p, spaceName: v }))}>
                    <SelectTrigger className="font-dm text-sm"><SelectValue placeholder="Select space" /></SelectTrigger>
                    <SelectContent>
                      {SPACES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      {(spaces ?? []).map((s: any) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">TOTAL (NZD)</label>
                  <Input type="number" value={form.totalNzd} onChange={e => setForm((p: any) => ({ ...p, totalNzd: e.target.value }))} className="font-dm text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">DEPOSIT (NZD)</label>
                  <Input type="number" value={form.depositNzd} onChange={e => setForm((p: any) => ({ ...p, depositNzd: e.target.value }))} className="font-dm text-sm" placeholder="0.00" />
                </div>
                <div>
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">STATUS</label>
                  <Select value={form.status} onValueChange={v => setForm((p: any) => ({ ...p, status: v }))}>
                    <SelectTrigger className="font-dm text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="tentative">Tentative</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="depositPaid" checked={form.depositPaid}
                    onChange={e => setForm((p: any) => ({ ...p, depositPaid: e.target.checked }))}
                    className="w-4 h-4 accent-forest" />
                  <label htmlFor="depositPaid" className="font-bebas text-xs tracking-widest text-ink/70">DEPOSIT PAID</label>
                </div>
                <div className="md:col-span-2">
                  <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">INTERNAL NOTES</label>
                  <Textarea value={form.notes} onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))} rows={3} className="font-dm text-sm" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bebas text-xs tracking-widest text-ink/40">DATE</div>
                    <div className="font-dm text-sm text-ink">
                      {new Date(booking.eventDate).toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    {booking.eventEndDate && (
                      <div className="font-dm text-xs text-ink/50">
                        until {new Date(booking.eventEndDate).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bebas text-xs tracking-widest text-ink/40">GUESTS</div>
                    <div className="font-dm text-sm text-ink">{booking.guestCount ?? "—"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bebas text-xs tracking-widest text-ink/40">SPACE</div>
                    <div className="font-dm text-sm text-ink">{booking.spaceName || "—"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bebas text-xs tracking-widest text-ink/40">EMAIL</div>
                    <div className="font-dm text-sm text-ink">{booking.email}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-bebas text-xs tracking-widest text-ink/40">EVENT TYPE</div>
                    <div className="font-dm text-sm text-ink">{booking.eventType || "—"}</div>
                  </div>
                </div>
                {booking.notes && (
                  <div className="col-span-2 md:col-span-3 flex items-start gap-2">
                    <ClipboardList className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-bebas text-xs tracking-widest text-ink/40">NOTES</div>
                      <div className="font-dm text-sm text-ink whitespace-pre-wrap">{booking.notes}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Financials */}
          <div className="dante-card p-6">
            <div className="gold-rule max-w-xs mb-4"><span>FINANCIALS</span></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-cream border border-gold/20">
                <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">TOTAL</div>
                <div className="font-cormorant text-2xl font-semibold text-ink">
                  ${Number(booking.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-center p-3 bg-cream border border-gold/20">
                <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">DEPOSIT</div>
                <div className="font-cormorant text-2xl font-semibold text-ink">
                  ${Number(booking.depositNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-center p-3 bg-cream border border-gold/20">
                <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">PAID</div>
                <div className="font-cormorant text-2xl font-semibold text-emerald-600">
                  ${totalPaid.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className={`text-center p-3 border ${outstanding > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">OUTSTANDING</div>
                <div className={`font-cormorant text-2xl font-semibold ${outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ${outstanding.toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`font-bebas text-xs tracking-widest px-2 py-1 ${booking.depositPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {booking.depositPaid ? "✓ DEPOSIT PAID" : "⚠ DEPOSIT PENDING"}
              </span>
              <Link href={`/payments?bookingId=${bookingId}`}>
                <button className="font-bebas tracking-widest text-xs border border-forest/40 text-forest px-3 py-1 hover:bg-forest hover:text-cream transition-all flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> MANAGE PAYMENTS
                </button>
              </Link>
            </div>
          </div>

          {/* Payment history */}
          {(payments ?? []).length > 0 && (
            <div className="dante-card p-6">
              <div className="gold-rule max-w-xs mb-4"><span>PAYMENT HISTORY</span></div>
              <div className="space-y-2">
                {(payments ?? []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gold/10 last:border-0">
                    <div>
                      <div className="font-dm text-sm text-ink">{p.description || p.type?.replace(/_/g, ' ')}</div>
                      <div className="font-dm text-xs text-ink/50">
                        {new Date(p.paidAt || p.createdAt).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                        {p.method && ` · ${p.method}`}
                      </div>
                    </div>
                    <div className="font-cormorant text-lg font-semibold text-emerald-600">
                      +${Number(p.amount).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — Quick Actions */}
        <div className="space-y-4">
          <div className="dante-card p-5">
            <div className="gold-rule max-w-full mb-4"><span>QUICK ACTIONS</span></div>
            <div className="space-y-2">
              <Link href={`/runsheet?bookingId=${bookingId}`}>
                <button className="w-full flex items-center gap-3 px-4 py-3 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                  <Clock className="w-4 h-4 text-gold" />
                  RUNSHEET
                </button>
              </Link>
              {booking.proposalId && (
                <Link href={`/proposals/new?proposalId=${booking.proposalId}`}>
                  <button className="w-full flex items-center gap-3 px-4 py-3 bg-forest-dark text-cream hover:bg-forest transition-colors font-bebas tracking-widest text-xs">
                    <FileText className="w-4 h-4 text-gold" />
                    VIEW PROPOSAL
                  </button>
                </Link>
              )}
              <Link href={`/floor-plan?bookingId=${bookingId}`}>
                <button className="w-full flex items-center gap-3 px-4 py-3 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs">
                  <LayoutGrid className="w-4 h-4" />
                  FLOOR PLAN
                </button>
              </Link>
              <Link href={`/checklist?bookingId=${bookingId}`}>
                <button className="w-full flex items-center gap-3 px-4 py-3 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs">
                  <ClipboardList className="w-4 h-4" />
                  CHECKLISTS
                </button>
              </Link>
              <Link href={`/payments?bookingId=${bookingId}`}>
                <button className="w-full flex items-center gap-3 px-4 py-3 border border-forest/30 text-forest hover:bg-forest/10 transition-colors font-bebas tracking-widest text-xs">
                  <DollarSign className="w-4 h-4" />
                  PAYMENTS
                </button>
              </Link>
              {booking.leadId && (
                <button
                  onClick={() => setLocation('/dashboard')}
                  className="w-full flex items-center gap-3 px-4 py-3 border border-gold/30 text-amber-700 hover:bg-gold/10 transition-colors font-bebas tracking-widest text-xs">
                  <Mail className="w-4 h-4" />
                  VIEW ENQUIRY
                </button>
              )}
            </div>
          </div>

          {/* Generate Documents */}
          <div className="dante-card p-5">
            <div className="gold-rule max-w-full mb-4"><span>DOCUMENTS</span></div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (!booking.proposalId) { toast.error("No proposal linked to this booking"); return; }
                  setLocation(`/proposals/new?proposalId=${booking.proposalId}`);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gold/30 text-amber-700 hover:bg-gold/10 transition-colors font-bebas tracking-widest text-xs">
                <FileText className="w-4 h-4" />
                OPEN PROPOSAL BUILDER
              </button>
              <button
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = `/api/beo/${booking.id}`;
                  a.download = `BEO-${booking.id}-${booking.firstName}-${booking.lastName ?? ''}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  toast.success('Generating BEO PDF...');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-amber-700 text-white hover:bg-amber-800 transition-colors font-bebas tracking-widest text-xs">
                <Printer className="w-4 h-4" />
                GENERATE BEO PDF
              </button>
            </div>
          </div>

          {/* Event Summary Card */}
          <div className="dante-card p-5 bg-forest-dark text-cream">
            <div className="font-bebas tracking-widest text-xs text-gold mb-3">EVENT SUMMARY</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-dm text-xs text-cream/60">Type</span>
                <span className="font-dm text-xs text-cream">{booking.eventType || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-dm text-xs text-cream/60">Date</span>
                <span className="font-dm text-xs text-cream">
                  {new Date(booking.eventDate).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-dm text-xs text-cream/60">Guests</span>
                <span className="font-dm text-xs text-cream">{booking.guestCount ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-dm text-xs text-cream/60">Space</span>
                <span className="font-dm text-xs text-cream">{booking.spaceName || "—"}</span>
              </div>
              <div className="border-t border-gold/20 pt-2 flex justify-between">
                <span className="font-bebas text-xs tracking-widest text-gold">TOTAL</span>
                <span className="font-cormorant text-lg font-semibold text-gold">
                  ${Number(booking.totalNzd ?? 0).toLocaleString("en-NZ", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tabbed Modules ─────────────────────────────────────────────────── */}
      <EventModuleTabs bookingId={bookingId} booking={booking} />
    </div>
  );
}

// ─── EventModuleTabs ──────────────────────────────────────────────────────────
const MODULE_TABS = [
  { id: 'comms', label: 'COMMS', icon: MessageSquare },
  { id: 'contracts', label: 'CONTRACTS', icon: PenLine },
  { id: 'budget', label: 'BUDGET', icon: DollarSign },
  { id: 'equipment', label: 'EQUIPMENT', icon: Package },
  { id: 'seating', label: 'SEATING', icon: Layers },
  { id: 'portal', label: 'CLIENT PORTAL', icon: Link2 },
];

function EventModuleTabs({ bookingId, booking }: { bookingId: number; booking: any }) {
  const [activeTab, setActiveTab] = useState('comms');
  return (
    <div className="max-w-6xl mx-auto px-4 pb-12">
      <div className="flex border-b border-gold/20 mb-6 overflow-x-auto">
        {MODULE_TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-5 py-3 font-bebas tracking-widest text-xs whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-gold text-amber-700'
                  : 'border-transparent text-ink/40 hover:text-ink/70'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab === 'comms' && <CommsTab bookingId={bookingId} />}
      {activeTab === 'contracts' && <ContractsTab bookingId={bookingId} booking={booking} />}
      {activeTab === 'budget' && <BudgetTab bookingId={bookingId} />}
      {activeTab === 'equipment' && <EquipmentTab bookingId={bookingId} />}
      {activeTab === 'seating' && <SeatingTab bookingId={bookingId} booking={booking} />}
      {activeTab === 'portal' && <PortalTab bookingId={bookingId} booking={booking} />}
    </div>
  );
}

// ─── Communications Tab ───────────────────────────────────────────────────────
function CommsTab({ bookingId }: { bookingId: number }) {
  const { data: comms, isLoading } = trpc.comms.list.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'note' as const, subject: '', body: '', direction: 'internal' as const, contactName: '', contactEmail: '' });
  const create = trpc.comms.create.useMutation({
    onSuccess: () => { utils.comms.list.invalidate({ bookingId }); setShowForm(false); setForm({ type: 'note', subject: '', body: '', direction: 'internal', contactName: '', contactEmail: '' }); toast.success('Log entry added'); },
  });
  const del = trpc.comms.delete.useMutation({ onSuccess: () => utils.comms.list.invalidate({ bookingId }) });
  const TYPE_ICONS: Record<string, string> = { note: '📝', email: '📧', call: '📞', sms: '💬', meeting: '🤝' };
  const TYPE_COLORS: Record<string, string> = { note: 'bg-gray-100 text-gray-600', email: 'bg-blue-100 text-blue-700', call: 'bg-green-100 text-green-700', sms: 'bg-purple-100 text-purple-700', meeting: 'bg-amber-100 text-amber-700' };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas tracking-widest text-ink/70 text-sm">COMMUNICATIONS LOG</h3>
        <button onClick={() => setShowForm(v => !v)} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2 flex items-center gap-1"><Plus className="w-3 h-3" /> ADD ENTRY</button>
      </div>
      {showForm && (
        <div className="dante-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">TYPE</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                <option value="note">Note</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="sms">SMS</option>
                <option value="meeting">Meeting</option>
              </select>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">DIRECTION</label>
              <select value={form.direction} onChange={e => setForm(p => ({ ...p, direction: e.target.value as any }))} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                <option value="internal">Internal</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">SUBJECT</label>
              <Input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Optional subject" className="text-sm" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">CONTACT NAME</label>
              <Input value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} placeholder="Optional" className="text-sm" />
            </div>
          </div>
          <div>
            <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">NOTES / BODY *</label>
            <Textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={3} placeholder="What was discussed or noted?" className="text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate({ ...form, bookingId })} disabled={!form.body || create.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">{create.isPending ? 'SAVING...' : 'SAVE'}</button>
            <button onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}
      {!isLoading && (!comms || comms.length === 0) && (
        <div className="text-center py-12 text-gray-400">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No communications logged yet.</p>
        </div>
      )}
      <div className="space-y-2">
        {(comms ?? []).map((c: any) => (
          <div key={c.id} className="dante-card p-4 flex items-start gap-3">
            <span className="text-lg">{TYPE_ICONS[c.type] ?? '📝'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[c.type] ?? 'bg-gray-100 text-gray-600'}`}>{c.type}</span>
                {c.direction !== 'internal' && <span className="text-xs text-gray-400">{c.direction}</span>}
                {c.subject && <span className="text-sm font-medium text-ink">{c.subject}</span>}
                <span className="text-xs text-gray-400 ml-auto">{new Date(c.createdAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm text-ink/80 whitespace-pre-wrap">{c.body}</p>
              {c.contactName && <p className="text-xs text-gray-400 mt-1">Contact: {c.contactName}{c.contactEmail ? ` · ${c.contactEmail}` : ''}</p>}
            </div>
            <button onClick={() => del.mutate({ id: c.id })} className="text-red-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Contracts Tab ────────────────────────────────────────────────────────────
function ContractsTab({ bookingId, booking }: { bookingId: number; booking: any }) {
  const { data: contracts, isLoading } = trpc.contracts.list.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', clientName: (booking?.firstName ?? '') + ' ' + (booking?.lastName ?? ''), clientEmail: booking?.email ?? '' });
  const create = trpc.contracts.create.useMutation({
    onSuccess: () => { utils.contracts.list.invalidate({ bookingId }); setShowForm(false); toast.success('Contract created'); },
  });
  const send = trpc.contracts.send.useMutation({ onSuccess: () => { utils.contracts.list.invalidate({ bookingId }); toast.success('Contract marked as sent'); } });
  const del = trpc.contracts.delete.useMutation({ onSuccess: () => utils.contracts.list.invalidate({ bookingId }) });
  const STATUS_COLORS: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', signed: 'bg-green-100 text-green-700', declined: 'bg-red-100 text-red-700', expired: 'bg-gray-100 text-gray-400' };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas tracking-widest text-ink/70 text-sm">CONTRACTS & E-SIGNATURES</h3>
        <button onClick={() => setShowForm(v => !v)} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2 flex items-center gap-1"><Plus className="w-3 h-3" /> NEW CONTRACT</button>
      </div>
      {showForm && (
        <div className="dante-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">CONTRACT TITLE *</label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Wedding Venue Agreement" className="text-sm" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">CLIENT NAME</label>
              <Input value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} className="text-sm" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">CLIENT EMAIL</label>
              <Input type="email" value={form.clientEmail} onChange={e => setForm(p => ({ ...p, clientEmail: e.target.value }))} className="text-sm" />
            </div>
          </div>
          <div>
            <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">CONTRACT BODY *</label>
            <Textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={8} placeholder="Paste or type the full contract text here…" className="text-sm font-mono" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate({ ...form, bookingId })} disabled={!form.title || !form.body || create.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">{create.isPending ? 'SAVING...' : 'CREATE CONTRACT'}</button>
            <button onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}
      {!isLoading && (!contracts || contracts.length === 0) && (
        <div className="text-center py-12 text-gray-400">
          <PenLine className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No contracts yet. Create one to send to your client for signing.</p>
        </div>
      )}
      <div className="space-y-3">
        {(contracts ?? []).map((c: any) => (
          <div key={c.id} className="dante-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-ink text-sm">{c.title}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] ?? 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {c.clientName && <span>For: {c.clientName}</span>}
                  {c.clientEmail && <span> · {c.clientEmail}</span>}
                  <span> · Created {new Date(c.createdAt).toLocaleDateString('en-NZ')}</span>
                  {c.signedAt && <span className="text-green-600"> · Signed {new Date(c.signedAt).toLocaleDateString('en-NZ')} by {c.signerName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {c.status === 'draft' && (
                  <button onClick={() => send.mutate({ id: c.id })} className="text-xs font-bebas tracking-widest px-3 py-1.5 border border-blue-300 text-blue-600 hover:bg-blue-50">MARK SENT</button>
                )}
                <button onClick={() => del.mutate({ id: c.id })} className="text-red-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {c.token && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-1">Signing link (share with client):</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-gray-50 px-2 py-1 rounded flex-1 truncate">{window.location.origin}/portal/{c.token}</code>
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/portal/${c.token}`); toast.success('Link copied!'); }} className="text-xs font-bebas tracking-widest px-2 py-1 border border-gray-300 text-gray-500 hover:bg-gray-50">COPY</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────
function BudgetTab({ bookingId }: { bookingId: number }) {
  const { data: items, isLoading } = trpc.budgets.list.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'venue', type: 'expense' as const, estimatedAmount: '', actualAmount: '' });
  const create = trpc.budgets.create.useMutation({
    onSuccess: () => { utils.budgets.list.invalidate({ bookingId }); setShowForm(false); setForm({ name: '', category: 'venue', type: 'expense', estimatedAmount: '', actualAmount: '' }); toast.success('Budget item added'); },
  });
  const update = trpc.budgets.update.useMutation({ onSuccess: () => utils.budgets.list.invalidate({ bookingId }) });
  const del = trpc.budgets.delete.useMutation({ onSuccess: () => utils.budgets.list.invalidate({ bookingId }) });
  const income = (items ?? []).filter((i: any) => i.type === 'income');
  const expenses = (items ?? []).filter((i: any) => i.type === 'expense');
  const totalEstIncome = income.reduce((s: number, i: any) => s + Number(i.estimatedAmount ?? 0), 0);
  const totalEstExpense = expenses.reduce((s: number, i: any) => s + Number(i.estimatedAmount ?? 0), 0);
  const totalActIncome = income.reduce((s: number, i: any) => s + Number(i.actualAmount ?? 0), 0);
  const totalActExpense = expenses.reduce((s: number, i: any) => s + Number(i.actualAmount ?? 0), 0);
  const CATEGORIES = ['venue', 'catering', 'beverages', 'staffing', 'entertainment', 'decor', 'photography', 'transport', 'accommodation', 'marketing', 'other'];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas tracking-widest text-ink/70 text-sm">EVENT BUDGET</h3>
        <button onClick={() => setShowForm(v => !v)} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2 flex items-center gap-1"><Plus className="w-3 h-3" /> ADD ITEM</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ label: 'EST. INCOME', val: totalEstIncome, color: 'text-green-600' }, { label: 'ACT. INCOME', val: totalActIncome, color: 'text-green-700' }, { label: 'EST. EXPENSE', val: totalEstExpense, color: 'text-red-500' }, { label: 'ACT. EXPENSE', val: totalActExpense, color: 'text-red-600' }].map(s => (
          <div key={s.label} className="dante-card p-3 text-center">
            <div className="font-bebas text-xs tracking-widest text-ink/40 mb-1">{s.label}</div>
            <div className={`font-cormorant text-xl font-semibold ${s.color}`}>${s.val.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}</div>
          </div>
        ))}
      </div>
      {showForm && (
        <div className="dante-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">ITEM NAME *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Venue hire, Catering" className="text-sm" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">TYPE</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">CATEGORY</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">ESTIMATED ($)</label>
              <Input type="number" value={form.estimatedAmount} onChange={e => setForm(p => ({ ...p, estimatedAmount: e.target.value }))} placeholder="0.00" className="text-sm" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">ACTUAL ($)</label>
              <Input type="number" value={form.actualAmount} onChange={e => setForm(p => ({ ...p, actualAmount: e.target.value }))} placeholder="0.00" className="text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => create.mutate({ name: form.name, category: form.category, type: form.type, estimatedAmount: Number(form.estimatedAmount) || 0, actualAmount: Number(form.actualAmount) || 0, bookingId })} disabled={!form.name || create.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">{create.isPending ? 'SAVING...' : 'ADD'}</button>
            <button onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}
      {!isLoading && (!items || items.length === 0) && (
        <div className="text-center py-12 text-gray-400">
          <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No budget items yet. Track estimated vs actual costs here.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="dante-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 font-bebas tracking-widest text-xs text-ink/50">ITEM</th>
                <th className="text-left p-3 font-bebas tracking-widest text-xs text-ink/50">CATEGORY</th>
                <th className="text-left p-3 font-bebas tracking-widest text-xs text-ink/50">TYPE</th>
                <th className="text-right p-3 font-bebas tracking-widest text-xs text-ink/50">ESTIMATED</th>
                <th className="text-right p-3 font-bebas tracking-widest text-xs text-ink/50">ACTUAL</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item: any) => (
                <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="p-3 font-medium text-ink">{item.name}</td>
                  <td className="p-3 text-gray-500 capitalize">{item.category}</td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{item.type}</span>
                  </td>
                  <td className="p-3 text-right text-gray-700">${Number(item.estimatedAmount ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right">
                    <input type="number" defaultValue={item.actualAmount ?? 0} onBlur={e => update.mutate({ id: item.id, actualAmount: Number(e.target.value) })} className="w-24 text-right border border-gray-200 rounded px-2 py-0.5 text-sm" />
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => del.mutate({ id: item.id })} className="text-red-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Equipment Tab ────────────────────────────────────────────────────────────
function EquipmentTab({ bookingId }: { bookingId: number }) {
  const { data: items, isLoading } = trpc.equipment.listEvent.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'av', quantity: '1', notes: '' });
  const add = trpc.equipment.addToEvent.useMutation({
    onSuccess: () => { utils.equipment.listEvent.invalidate({ bookingId }); setShowForm(false); setForm({ name: '', category: 'av', quantity: '1', notes: '' }); toast.success('Equipment added'); },
  });
  const updateItem = trpc.equipment.updateEvent.useMutation({ onSuccess: () => utils.equipment.listEvent.invalidate({ bookingId }) });
  const del = trpc.equipment.deleteEvent.useMutation({ onSuccess: () => utils.equipment.listEvent.invalidate({ bookingId }) });
  const STATUS_COLORS: Record<string, string> = { needed: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700', delivered: 'bg-green-100 text-green-700', returned: 'bg-gray-100 text-gray-500' };
  const CATEGORIES = ['av', 'furniture', 'linen', 'lighting', 'catering', 'decor', 'transport', 'other'];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas tracking-widest text-ink/70 text-sm">EQUIPMENT & INVENTORY</h3>
        <button onClick={() => setShowForm(v => !v)} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2 flex items-center gap-1"><Plus className="w-3 h-3" /> ADD ITEM</button>
      </div>
      {showForm && (
        <div className="dante-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">ITEM NAME *</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Round tables x 10, PA system" className="text-sm" />
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">CATEGORY</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">QUANTITY</label>
              <Input type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="text-sm" />
            </div>
            <div className="col-span-2">
              <label className="font-bebas text-xs tracking-widest text-ink/50 block mb-1">NOTES</label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" className="text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => add.mutate({ name: form.name, category: form.category, quantity: Number(form.quantity) || 1, notes: form.notes || undefined, bookingId })} disabled={!form.name || add.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">{add.isPending ? 'SAVING...' : 'ADD'}</button>
            <button onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}
      {!isLoading && (!items || items.length === 0) && (
        <div className="text-center py-12 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No equipment tracked yet. Add items needed for this event.</p>
        </div>
      )}
      <div className="space-y-2">
        {(items ?? []).map((item: any) => (
          <div key={item.id} className="dante-card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink text-sm">{item.name}</span>
                <span className="text-xs text-gray-400">× {item.quantity}</span>
                <span className="text-xs text-gray-400 capitalize">{item.category}</span>
              </div>
              {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
            </div>
            <select
              value={item.status}
              onChange={e => updateItem.mutate({ id: item.id, status: e.target.value as any })}
              className={`text-xs font-semibold px-2 py-1 rounded-full border-0 ${STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-500'}`}
            >
              <option value="needed">Needed</option>
              <option value="confirmed">Confirmed</option>
              <option value="delivered">Delivered</option>
              <option value="returned">Returned</option>
            </select>
            <button onClick={() => del.mutate({ id: item.id })} className="text-red-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Seating Chart Tab ────────────────────────────────────────────────────────
function SeatingTab({ bookingId, booking }: { bookingId: number; booking: any }) {
  const { data: chart } = trpc.seating.get.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const save = trpc.seating.save.useMutation({ onSuccess: () => { utils.seating.get.invalidate({ bookingId }); toast.success('Seating chart saved'); } });
  const [tables, setTables] = useState<any[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const guestCount = booking?.guestCount ?? 0;

  useEffect(() => {
    if (chart?.canvasData) {
      try { setTables(JSON.parse(chart.canvasData)); } catch {}
    }
  }, [chart]);

  const addTable = (shape: 'round' | 'rect') => {
    const id = Date.now();
    setTables(prev => [...prev, { id, shape, x: 50 + Math.random() * 300, y: 50 + Math.random() * 300, seats: 8, label: `Table ${prev.length + 1}` }]);
  };

  const handleMouseDown = (e: React.MouseEvent, id: number) => {
    const t = tables.find(t => t.id === id);
    if (!t) return;
    setDragging(id);
    setDragOffset({ x: e.clientX - t.x, y: e.clientY - t.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    setTables(prev => prev.map(t => t.id === dragging ? { ...t, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } : t));
  };

  const totalSeats = tables.reduce((s, t) => s + (t.seats ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bebas tracking-widest text-ink/70 text-sm">SEATING CHART</h3>
        <div className="flex gap-2">
          <button onClick={() => addTable('round')} className="border border-forest/30 text-forest text-xs font-bebas tracking-widest px-3 py-2 hover:bg-forest/5">+ ROUND TABLE</button>
          <button onClick={() => addTable('rect')} className="border border-forest/30 text-forest text-xs font-bebas tracking-widest px-3 py-2 hover:bg-forest/5">+ RECT TABLE</button>
          <button onClick={() => save.mutate({ bookingId, canvasData: JSON.stringify(tables), guestCount: totalSeats })} disabled={save.isPending} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2">{save.isPending ? 'SAVING...' : 'SAVE CHART'}</button>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-gray-500">
        <span>Tables: {tables.length}</span>
        <span>Total seats: {totalSeats}</span>
        {guestCount > 0 && <span className={totalSeats >= guestCount ? 'text-green-600' : 'text-red-500'}>Guests: {guestCount} ({totalSeats >= guestCount ? '✓ Enough seats' : `${guestCount - totalSeats} more needed`})</span>}
      </div>
      <div
        className="relative bg-[#f9f7f2] border-2 border-dashed border-gold/30 rounded-lg overflow-hidden select-none"
        style={{ height: 500 }}
        onMouseMove={handleMouseMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
      >
        {tables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
            <div className="text-center">
              <Layers className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Add tables above to start building your seating chart</p>
            </div>
          </div>
        )}
        {tables.map(table => (
          <div
            key={table.id}
            style={{ position: 'absolute', left: table.x, top: table.y, cursor: dragging === table.id ? 'grabbing' : 'grab' }}
            onMouseDown={e => handleMouseDown(e, table.id)}
          >
            {table.shape === 'round' ? (
              <div className="w-20 h-20 rounded-full bg-[#2d5a27]/10 border-2 border-[#2d5a27]/40 flex flex-col items-center justify-center">
                <span className="text-xs font-bebas tracking-widest text-[#2d5a27]">{table.label}</span>
                <span className="text-xs text-[#2d5a27]/60">{table.seats} seats</span>
              </div>
            ) : (
              <div className="w-28 h-16 bg-[#c9a84c]/10 border-2 border-[#c9a84c]/40 flex flex-col items-center justify-center">
                <span className="text-xs font-bebas tracking-widest text-[#c9a84c]">{table.label}</span>
                <span className="text-xs text-[#c9a84c]/60">{table.seats} seats</span>
              </div>
            )}
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setTables(prev => prev.filter(t => t.id !== table.id))}
              className="absolute -top-2 -right-2 w-5 h-5 bg-red-400 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-500"
            >×</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">Drag tables to position them. Click × to remove.</p>
    </div>
  );
}

// ─── Client Portal Tab ────────────────────────────────────────────────────────
function PortalTab({ bookingId, booking }: { bookingId: number; booking: any }) {
  const { data: tokens, isLoading } = trpc.portal.list.useQuery({ bookingId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [perms, setPerms] = useState({ viewProposal: true, viewRunsheet: false, viewBudget: false, approveProposal: true, signContract: false });
  const create = trpc.portal.create.useMutation({
    onSuccess: () => { utils.portal.list.invalidate({ bookingId }); setShowForm(false); toast.success('Client portal link created!'); },
  });
  const del = trpc.portal.delete.useMutation({ onSuccess: () => utils.portal.list.invalidate({ bookingId }) });
  const PERM_LABELS: Record<string, string> = { viewProposal: 'View Proposal', viewRunsheet: 'View Runsheet', viewBudget: 'View Budget', approveProposal: 'Approve Proposal', signContract: 'Sign Contract' };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bebas tracking-widest text-ink/70 text-sm">CLIENT PORTAL LINKS</h3>
        <button onClick={() => setShowForm(v => !v)} className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2 flex items-center gap-1"><Plus className="w-3 h-3" /> CREATE LINK</button>
      </div>
      <p className="text-xs text-gray-400">Share a secure link with your client so they can view their event details, approve proposals, and sign contracts — no login required.</p>
      {showForm && (
        <div className="dante-card p-4 space-y-3">
          <div className="font-bebas text-xs tracking-widest text-ink/50 mb-2">PERMISSIONS</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(PERM_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(perms as any)[key]} onChange={e => setPerms(p => ({ ...p, [key]: e.target.checked }))} className="w-4 h-4 accent-forest" />
                <span className="text-sm text-ink/80">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => create.mutate({ bookingId, clientName: `${booking?.firstName ?? ''} ${booking?.lastName ?? ''}`.trim(), clientEmail: booking?.email, permissions: perms })}
              disabled={create.isPending}
              className="btn-forest text-cream text-xs font-bebas tracking-widest px-4 py-2"
            >{create.isPending ? 'CREATING...' : 'CREATE PORTAL LINK'}</button>
            <button onClick={() => setShowForm(false)} className="border border-gray-300 text-gray-600 text-xs px-4 py-2 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}
      {isLoading && <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}
      {!isLoading && (!tokens || tokens.length === 0) && (
        <div className="text-center py-12 text-gray-400">
          <Link2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No portal links yet. Create one to share with your client.</p>
        </div>
      )}
      <div className="space-y-3">
        {(tokens ?? []).map((t: any) => {
          const url = `${window.location.origin}/portal/${t.token}`;
          const permsObj = t.permissions ? (() => { try { return JSON.parse(t.permissions); } catch { return {}; } })() : {};
          return (
            <div key={t.id} className="dante-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink mb-1">{t.clientName || 'Client'}</div>
                  <div className="text-xs text-gray-400 mb-2">
                    Created {new Date(t.createdAt).toLocaleDateString('en-NZ')}
                    {t.lastAccessedAt && ` · Last accessed ${new Date(t.lastAccessedAt).toLocaleDateString('en-NZ')}`}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {Object.entries(PERM_LABELS).filter(([k]) => permsObj[k]).map(([k, label]) => (
                      <span key={k} className="text-xs bg-forest/10 text-forest px-2 py-0.5 rounded-full">{label}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-50 px-2 py-1 rounded flex-1 truncate">{url}</code>
                    <button onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied!'); }} className="text-xs font-bebas tracking-widest px-2 py-1 border border-gray-300 text-gray-500 hover:bg-gray-50 flex-shrink-0">COPY</button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-bebas tracking-widest px-2 py-1 border border-forest/30 text-forest hover:bg-forest/5 flex-shrink-0">PREVIEW</a>
                  </div>
                </div>
                <button onClick={() => del.mutate({ id: t.id })} className="text-red-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
