import './_group.css';
import { useState } from 'react';
import { MessageSquare, Calendar, AlertCircle, Clock, LayoutDashboard, CheckCircle, Settings, ChevronRight, Plus, ChevronLeft } from 'lucide-react';

/**
 * Variant 2 — Interaction Affordance
 * Tradeoff: Every element that is tappable signals it loudly.
 * Stats cards have visible tap areas with borders and chevrons.
 * Calendar events are larger, clearly pressable chips.
 * List rows have explicit arrow indicators.
 * The "Add Event" CTA floats above the bottom nav for constant visibility.
 * Bottom nav uses a larger active indicator (filled pill, not just colour change).
 * Sacrificed: information density — larger tap targets mean less visible at once.
 */

const CAL_WEEKS = [
  [null, null, null, null, null, null, 1],
  [2,    3,    4,    5,    6,    7,    8],
  [9,    10,   11,   12,   13,   14,   15],
  [16,   17,   18,   19,   20,   21,   22],
  [23,   24,   25,   26,   27,   28,   29],
  [30,   31,   null, null, null, null, null],
];

const EVENTS_BY_DAY: Record<number, { name: string; type: string }[]> = {
  26: [{ name: 'Cherie K.', type: 'Private' }],
  28: [{ name: 'Caitlyn S.', type: '21st Bday' }],
};

const upcomingEvents = [
  { name: 'Cherie Kellahan', type: 'Private', date: 'Thu, 26 Mar', guests: 80, status: 'CONFIRMED' },
  { name: 'Caitlyn Stewart', type: '21st Birthday Party', date: 'Sat, 28 Mar', guests: 100, status: 'CONFIRMED' },
];

export function AffordanceFirst() {
  const [activeNav, setActiveNav] = useState('Home');

  return (
    <div className="w-[390px] h-[844px] bg-gray-50 flex flex-col overflow-hidden relative">
      {/* Top nav */}
      <nav className="bg-white border-b flex items-center px-4 h-14 flex-shrink-0" style={{ borderColor: 'oklch(0.850 0.025 68)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <span className="font-bold text-gray-900 text-base tracking-tight flex-1">VenueFlowHQ</span>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-xl border text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <Settings className="w-4 h-4" />
          </button>
          <button className="w-9 h-9 rounded-full bg-sage-green flex items-center justify-center text-white text-sm font-bold shadow-sm active:scale-95 transition-transform">A</button>
        </div>
      </nav>

      <div className="flex-1 overflow-auto" style={{ paddingBottom: '88px' }}>
        {/* Stats — clearly tappable cards */}
        <div className="px-3 pt-3 pb-1">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Active Enquiries', value: 28, sub: 'in pipeline', iconBg: 'bg-sage-tint', iconColor: 'text-sage-dark', Icon: MessageSquare, tappable: true },
              { label: 'Upcoming Events', value: 5, sub: 'next 30 days', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', Icon: Calendar, tappable: true },
              { label: 'Overdue Tasks', value: 0, sub: 'all clear', iconBg: 'bg-gray-50', iconColor: 'text-gray-300', Icon: AlertCircle, tappable: false },
              { label: 'Overdue Follow-ups', value: 0, sub: 'all clear', iconBg: 'bg-gray-50', iconColor: 'text-gray-300', Icon: Clock, tappable: false },
            ].map((s, i) => (
              <button key={i} className={`bg-white rounded-2xl border p-4 text-left flex flex-col gap-2 active:scale-95 transition-all ${s.tappable ? 'border-gray-200 shadow-sm hover:border-sage-green hover:shadow-md' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-xl ${s.iconBg} ${s.iconColor} flex items-center justify-center`}>
                    <s.Icon className="w-4 h-4" />
                  </div>
                  {s.tappable && <ChevronRight className="w-4 h-4 text-gray-300" />}
                </div>
                <div>
                  <div className="text-2xl font-black text-gray-900 leading-none">{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1 leading-tight">{s.label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div className="mx-3 mt-2 bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <button className="w-8 h-8 rounded-xl border flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100" style={{ borderColor: 'oklch(0.850 0.025 68)' }}><ChevronLeft className="w-4 h-4" /></button>
            <h2 className="font-bold text-gray-900 text-sm flex-1">Mar 2026</h2>
            <button className="text-xs font-semibold px-3 py-1.5 border rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>Today</button>
            <button className="w-8 h-8 rounded-xl border flex items-center justify-center text-gray-500" style={{ borderColor: 'oklch(0.850 0.025 68)' }}><ChevronRight className="w-4 h-4" /></button>
          </div>
          {/* Day labels */}
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            {['M','T','W','T','F','S','S'].map((d,i) => (
              <div key={i} className={`text-center text-[10px] font-bold py-2 ${i>=5?'text-sage-dark':'text-gray-400'}`}>{d}</div>
            ))}
          </div>
          {/* Calendar days */}
          {CAL_WEEKS.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
              {week.map((day, di) => {
                if (!day) return <div key={di} className="h-14 bg-gray-50/50" />;
                const isToday = day === 22;
                const isWknd = di >= 5;
                const evts = EVENTS_BY_DAY[day] ?? [];
                return (
                  <button key={di} className={`h-14 flex flex-col p-1 text-left active:bg-sage-tint/40 transition-colors ${isWknd?'bg-sage-tint/10':'bg-white'} ${isToday?'ring-2 ring-inset ring-sage-green':''}`}>
                    <span className={`text-xs font-bold leading-none ${isToday?'w-5 h-5 bg-sage-green text-white rounded-full flex items-center justify-center text-[10px]':isWknd?'text-sage-dark':'text-gray-600'}`}>
                      {day}
                    </span>
                    {evts.map((e,ei) => (
                      <div key={ei} className="mt-0.5 w-full rounded-md px-1 py-0.5 text-[9px] font-semibold bg-sage-green text-white truncate">{e.name}</div>
                    ))}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Upcoming events — with explicit tap affordance */}
        <div className="mx-3 mt-2 bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <h3 className="text-sm font-bold text-gray-900">Upcoming Events</h3>
            <button className="text-xs font-semibold text-sage-green flex items-center gap-0.5">View all <ChevronRight className="w-3 h-3" /></button>
          </div>
          {upcomingEvents.map((e, i) => (
            <button key={i} className="w-full flex items-center gap-3 px-4 py-3.5 border-b last:border-b-0 hover:bg-gray-50 active:bg-sage-tint/20 text-left transition-colors" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
              <div className="w-1.5 self-stretch rounded-full bg-sage-green flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{e.name}</div>
                <div className="text-xs text-gray-500 truncate">{e.type}</div>
                <div className="text-xs text-gray-400">{e.date} · {e.guests} guests</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sage-tint text-sage-dark">{e.status}</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </button>
          ))}
        </div>

        {/* New enquiries */}
        <div className="mx-3 mt-2 mb-2 bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <h3 className="text-sm font-bold text-gray-900">New Enquiries</h3>
            <button className="text-xs font-semibold text-sage-green flex items-center gap-0.5">View all <ChevronRight className="w-3 h-3" /></button>
          </div>
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle className="w-7 h-7 text-sage-green opacity-40" />
            <p className="text-sm text-gray-400">All caught up!</p>
          </div>
        </div>
      </div>

      {/* Floating add button */}
      <button className="absolute bottom-20 right-4 bg-sage-green text-white rounded-2xl shadow-lg flex items-center gap-2 px-4 py-3 font-semibold text-sm active:scale-95 transition-all hover:bg-sage-dark">
        <Plus className="w-4 h-4" /> Add Event
      </button>

      {/* Bottom nav — large active state */}
      <nav className="absolute bottom-0 left-0 right-0 bg-white border-t flex items-stretch h-16" style={{ borderColor: 'oklch(0.850 0.025 68)', boxShadow: '0 -2px 8px rgba(0,0,0,0.06)' }}>
        {[
          { label: 'Home', Icon: LayoutDashboard },
          { label: 'Events', Icon: MessageSquare },
          { label: 'Calendar', Icon: Calendar },
          { label: 'Tasks', Icon: AlertCircle },
          { label: 'More', Icon: Settings },
        ].map(item => {
          const active = activeNav === item.label;
          return (
            <button key={item.label}
              onClick={() => setActiveNav(item.label)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 ${active ? 'text-sage-green' : 'text-gray-400'}`}>
              <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-sage-tint' : ''}`}>
                <item.Icon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-semibold ${active ? 'text-sage-green' : 'text-gray-400'}`}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
