import './_group.css';
import { MessageSquare, Calendar, AlertCircle, Clock, LayoutDashboard, CheckCircle, Settings, ChevronRight, Star } from 'lucide-react';

/**
 * Variant 1 — Information Hierarchy
 * Tradeoff: The screen is organised by urgency, not tradition.
 * Urgent alerts (overdue items) dominate the top if present.
 * Stats give way to a "status summary" — a single sentence about the day.
 * New enquiries appear BEFORE the calendar so action items are seen first.
 * Calendar becomes a compact 7-day strip, not a full month.
 * Sacrificed: full calendar visibility — you see one week, not one month.
 */

const weekDays = [
  { d: 'M', n: 16 }, { d: 'T', n: 17 }, { d: 'W', n: 18 },
  { d: 'T', n: 19 }, { d: 'F', n: 20 }, { d: 'S', n: 21 }, { d: 'S', n: 22 },
];

const upcomingEvents = [
  { name: 'Cherie Kellahan', type: 'Private', date: 'Thu 26 Mar', guests: 80, daysAway: 4, status: 'Confirmed', urgent: false },
  { name: 'Caitlyn Stewart', type: '21st Birthday Party', date: 'Sat 28 Mar', guests: 100, daysAway: 6, status: 'Confirmed', urgent: false },
];

export function HierarchyFirst() {
  return (
    <div className="w-[390px] h-[844px] bg-gray-50 flex flex-col overflow-hidden">
      {/* Compact top bar */}
      <nav className="bg-white border-b flex items-center px-4 h-12 flex-shrink-0" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
        <span className="font-bold text-gray-900 text-sm tracking-tight flex-1">VenueFlowHQ</span>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-sage-green flex items-center justify-center text-white text-xs font-semibold">A</div>
        </div>
      </nav>

      <div className="flex-1 overflow-auto pb-16">

        {/* ── STATUS SUMMARY — highest hierarchy ─────────────────────── */}
        <div className="bg-white px-4 py-4 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sage-tint flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-sage-dark" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Good shape today</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                28 active enquiries · 5 upcoming events · No overdue items
              </p>
            </div>
          </div>
        </div>

        {/* ── URGENT ACTIONS — shown prominently when present ────────── */}
        {/* Currently zero, so show "all clear" state */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Action Required</p>
          <div className="bg-white rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <CheckCircle className="w-5 h-5 text-sage-green flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">All caught up</p>
              <p className="text-xs text-gray-400">No overdue tasks or follow-ups</p>
            </div>
          </div>
        </div>

        {/* ── NEXT UP — upcoming events by urgency ───────────────────── */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Next Up</p>
            <button className="text-[11px] font-semibold text-sage-green">View all</button>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((e, i) => (
              <div key={i} className="bg-white rounded-xl border p-3.5 flex items-start gap-3" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
                <div className="flex-shrink-0 text-center min-w-[36px]">
                  <div className="text-xs text-gray-400">{e.date.split(' ')[0]}</div>
                  <div className="text-2xl font-black text-gray-900 leading-none">{e.date.split(' ')[1]}</div>
                  <div className="text-[10px] text-gray-400">{e.date.split(' ')[2]}</div>
                </div>
                <div className="flex-1 min-w-0 border-l pl-3" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
                  <div className="text-sm font-bold text-gray-900 truncate">{e.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">{e.type} · {e.guests} guests</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sage-tint text-sage-dark">{e.status}</span>
                    <span className="text-[10px] text-gray-400">in {e.daysAway} days</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── KEY STATS — secondary, 2 most important ─────────────────── */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">Pipeline</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-xl border p-3.5" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
              <div className="text-2xl font-black text-gray-900 mb-0.5">28</div>
              <div className="text-xs text-gray-500">Active enquiries</div>
              <div className="text-[10px] text-gray-400 mt-1">in pipeline</div>
            </div>
            <div className="bg-white rounded-xl border p-3.5" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
              <div className="text-2xl font-black text-gray-900 mb-0.5">5</div>
              <div className="text-xs text-gray-500">Upcoming events</div>
              <div className="text-[10px] text-gray-400 mt-1">next 30 days</div>
            </div>
          </div>
        </div>

        {/* ── WEEK STRIP — compact, not dominant ─────────────────────── */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">This Week</p>
            <button className="text-[11px] font-semibold text-sage-green flex items-center gap-0.5">Full calendar <ChevronRight className="w-3 h-3" /></button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <div className="grid grid-cols-7">
              {weekDays.map((day) => {
                const isToday = day.n === 22;
                return (
                  <div key={day.n} className={`flex flex-col items-center py-3 ${isToday ? 'bg-sage-green' : ''}`}>
                    <span className={`text-[10px] font-semibold mb-1 ${isToday ? 'text-white' : 'text-gray-400'}`}>{day.d}</span>
                    <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-gray-800'}`}>{day.n}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-t px-3 py-2 text-[11px] text-gray-400" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
              No events this week — next: Cherie Kellahan Thu 26 Mar
            </div>
          </div>
        </div>

        {/* ── NEW ENQUIRIES — tertiary ────────────────────────────────── */}
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">New Enquiries</p>
            <button className="text-[11px] font-semibold text-sage-green">View all</button>
          </div>
          <div className="bg-white rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <CheckCircle className="w-4 h-4 text-sage-green flex-shrink-0" />
            <p className="text-sm text-gray-500">All caught up!</p>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 bg-white border-t flex items-stretch h-16 w-[390px]" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
        {[
          { label: 'Home', active: true, Icon: LayoutDashboard },
          { label: 'Events', active: false, Icon: MessageSquare },
          { label: 'Calendar', active: false, Icon: Calendar },
          { label: 'Tasks', active: false, Icon: AlertCircle },
          { label: 'More', active: false, Icon: Settings },
        ].map(item => (
          <button key={item.label} className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${item.active ? 'text-sage-green' : 'text-gray-400'}`}>
            <item.Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
