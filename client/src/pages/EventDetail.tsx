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
  ClipboardList, LayoutGrid, ChefHat
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
    </div>
  );
}
