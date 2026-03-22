import './_group.css';
import { MessageSquare, Calendar, AlertCircle, Clock, LayoutDashboard, CheckCircle, Settings, ChevronRight, Plus } from 'lucide-react';

/**
 * Variant 3 — Accessibility & Readability
 * Tradeoff: Prioritise legibility, contrast, and cognitive clarity.
 * All body text is minimum 14px. Primary labels use 16px.
 * Stat values have a full human-readable sentence, not just a number.
 * Status badges use both colour AND a text label (not colour alone).
 * Calendar day numbers are larger and clearly contrasted.
 * Section headings are explicitly labelled and always visible.
 * Bottom nav always shows labels (not just the active item).
 * Sacrificed: density — the screen shows less data per scroll position.
 */

const CAL_WEEKS = [
  [null, null, null, null, null, null, 1],
  [2,    3,    4,    5,    6,    7,    8],
  [9,    10,   11,   12,   13,   14,   15],
  [16,   17,   18,   19,   20,   21,   22],
  [23,   24,   25,   26,   27,   28,   29],
  [30,   31,   null, null, null, null, null],
];

const EVENTS_BY_DAY: Record<number, { name: string }[]> = {
  26: [{ name: 'Cherie K.' }],
  28: [{ name: 'Caitlyn S.' }],
};

const upcomingEvents = [
  { name: 'Cherie Kellahan', type: 'Private', date: 'Thursday, 26 March', guests: 80, status: 'Confirmed' },
  { name: 'Caitlyn Stewart', type: '21st Birthday Party', date: 'Saturday, 28 March', guests: 100, status: 'Confirmed' },
];

export function AccessibilityFirst() {
  return (
    <div className="w-[390px] h-[844px] flex flex-col overflow-hidden" style={{ background: '#F7F7F5' }}>
      {/* Top nav — high contrast */}
      <nav className="bg-white flex items-center px-4 h-14 flex-shrink-0" style={{ borderBottom: '2px solid #E5E5E2' }}>
        <span className="font-bold text-gray-950 text-base tracking-tight flex-1">VenueFlowHQ</span>
        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg text-gray-600" aria-label="Settings">
            <Settings className="w-5 h-5" />
          </button>
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#2D4A3E' }} aria-label="Account">A</button>
        </div>
      </nav>

      <div className="flex-1 overflow-auto pb-16">

        {/* ── STATS — full sentences, not raw numbers ─────────────────── */}
        <section className="bg-white px-4 py-4" style={{ borderBottom: '1px solid #E5E5E2' }} aria-label="At a glance">
          <h2 className="font-bold text-xs uppercase tracking-widest text-gray-400 mb-3">At a Glance</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: '28', label: 'active enquiries', sub: 'in your pipeline', Icon: MessageSquare, color: '#2D4A3E', bg: '#EDF2EE' },
              { value: '5', label: 'upcoming events', sub: 'in the next 30 days', Icon: Calendar, color: '#1e40af', bg: '#eff6ff' },
              { value: '0', label: 'overdue tasks', sub: 'all on track', Icon: AlertCircle, color: '#9ca3af', bg: '#f9fafb' },
              { value: '0', label: 'overdue follow-ups', sub: 'all on track', Icon: Clock, color: '#9ca3af', bg: '#f9fafb' },
            ].map((s, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: s.bg }}>
                <div className="flex items-center gap-2 mb-2">
                  <s.Icon className="w-4 h-4" style={{ color: s.color }} aria-hidden="true" />
                  <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
                </div>
                <div className="text-2xl font-black" style={{ color: '#111827' }}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CALENDAR — larger day numbers, clearer contrast ─────────── */}
        <section className="bg-white mt-2" aria-label="Calendar">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid #E5E5E2' }}>
            <button className="p-2 rounded-lg text-gray-700 hover:bg-gray-100" aria-label="Previous month">&#8592;</button>
            <h2 className="font-bold text-gray-950 text-base flex-1">March 2026</h2>
            <button className="text-sm font-semibold px-3 py-1.5 rounded-lg border text-gray-700" style={{ borderColor: '#D1D5DB' }}>Today</button>
            <button className="p-2 rounded-lg text-gray-700 hover:bg-gray-100" aria-label="Next month">&#8594;</button>
          </div>

          {/* Legend — text labels alongside dots */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2" style={{ borderBottom: '1px solid #E5E5E2', background: '#FAFAF8' }}>
            {[['#4A7C59','Confirmed'],['#f59e0b','Tentative'],['#8b5cf6','Proposal'],['#f43f5e','Enquiry']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} aria-hidden="true" />
                {l}
              </span>
            ))}
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #E5E5E2' }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i) => (
              <div key={d} className={`text-center text-xs font-bold py-2.5 ${i>=5?'text-green-800 bg-green-50':'text-gray-500'}`}>{d}</div>
            ))}
          </div>

          {/* Calendar grid — larger cells with bigger numbers */}
          {CAL_WEEKS.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7" style={{ borderBottom: '1px solid #E5E5E2' }}>
              {week.map((day, di) => {
                if (!day) return <div key={di} className="h-14" style={{ background: '#F3F4F2' }} />;
                const isToday = day === 22;
                const isWknd = di >= 5;
                const evts = EVENTS_BY_DAY[day] ?? [];
                return (
                  <div key={di} className={`h-14 p-1.5 flex flex-col ${isWknd ? 'bg-green-50' : 'bg-white'}`}>
                    <span className={`text-sm font-bold leading-none ${isToday ? 'w-6 h-6 rounded-full flex items-center justify-center text-white text-xs' : isWknd ? 'text-green-800' : 'text-gray-800'}`}
                      style={isToday ? { background: '#2D4A3E' } : {}}>
                      {day}
                    </span>
                    {evts.map((e, ei) => (
                      <div key={ei} className="mt-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-white truncate" style={{ background: '#4A7C59' }}>
                        {e.name}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Add event — clearly labelled button */}
          <div className="px-4 py-3" style={{ borderTop: '1px solid #E5E5E2' }}>
            <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white" style={{ background: '#2D4A3E' }}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add Event
            </button>
          </div>
        </section>

        {/* ── UPCOMING EVENTS — full dates, readable ──────────────────── */}
        <section className="bg-white mt-2" aria-label="Upcoming events">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #E5E5E2' }}>
            <h2 className="font-bold text-gray-950 text-base">Upcoming Events</h2>
            <button className="text-sm font-semibold flex items-center gap-1" style={{ color: '#2D4A3E' }}>
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {upcomingEvents.map((e, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-4" style={{ borderBottom: '1px solid #E5E5E2' }}>
              <div className="w-1.5 flex-shrink-0 self-stretch rounded-full" style={{ background: '#4A7C59', minHeight: '44px' }} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-950 text-base">{e.name}</div>
                <div className="text-sm text-gray-600 mt-0.5">{e.type}</div>
                <div className="text-sm text-gray-500 mt-1">{e.date} · {e.guests} guests</div>
              </div>
              {/* Status: colour + text label */}
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0" style={{ background: '#EDF2EE', color: '#2D4A3E' }}>
                ✓ {e.status}
              </span>
            </div>
          ))}
        </section>

        {/* ── NEW ENQUIRIES ──────────────────────────────────────────── */}
        <section className="bg-white mt-2 mb-2" aria-label="New enquiries">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #E5E5E2' }}>
            <h2 className="font-bold text-gray-950 text-base">New Enquiries</h2>
            <button className="text-sm font-semibold flex items-center gap-1" style={{ color: '#2D4A3E' }}>
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col items-center py-8 gap-3">
            <CheckCircle className="w-8 h-8" style={{ color: '#4A7C59', opacity: 0.4 }} aria-hidden="true" />
            <div className="text-center">
              <p className="text-base font-semibold text-gray-900">All caught up</p>
              <p className="text-sm text-gray-500 mt-0.5">No new enquiries to review</p>
            </div>
          </div>
        </section>
      </div>

      {/* Bottom nav — always shows labels */}
      <nav className="absolute bottom-0 left-0 right-0 bg-white flex items-stretch h-16" style={{ borderTop: '2px solid #E5E5E2' }} aria-label="Main navigation">
        {[
          { label: 'Home', Icon: LayoutDashboard, active: true },
          { label: 'Events', Icon: MessageSquare, active: false },
          { label: 'Calendar', Icon: Calendar, active: false },
          { label: 'Tasks', Icon: AlertCircle, active: false },
          { label: 'More', Icon: Settings, active: false },
        ].map(item => (
          <button key={item.label}
            aria-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors`}
            style={{ color: item.active ? '#2D4A3E' : '#9CA3AF' }}>
            <item.Icon className="w-5 h-5" aria-hidden="true" />
            <span className="text-[11px] font-semibold">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
