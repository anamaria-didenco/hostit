import './_group.css';
import { MessageSquare, Calendar, AlertCircle, Clock, Settings, LayoutDashboard, ChevronLeft, ChevronRight, Plus, CheckCircle } from 'lucide-react';

// March 2026: Mar 1 = Sunday. Mon-offset = 6.
const CAL_WEEKS = [
  [null, null, null, null, null, null, 1],
  [2,    3,    4,    5,    6,    7,    8],
  [9,    10,   11,   12,   13,   14,   15],
  [16,   17,   18,   19,   20,   21,   22],
  [23,   24,   25,   26,   27,   28,   29],
  [30,   31,   null, null, null, null, null],
];

const EVENTS_BY_DAY: Record<number, { name: string; type: string; color: string }[]> = {
  26: [{ name: 'Cherie K.', type: 'Private', color: 'bg-sage-green text-white' }],
  28: [{ name: 'Caitlyn S.', type: '21st Birth...', color: 'bg-sage-green text-white' }],
};

const upcomingEvents = [
  { name: 'Cherie Kellahan', type: 'Private', date: 'Thu, 26 Mar', guests: 80, status: 'CONFIRMED' },
  { name: 'Caitlyn Stewart', type: '21st Birthday Party', date: 'Sat, 28 Mar', guests: 100, status: 'CONFIRMED' },
];

export function Current() {
  return (
    <div className="w-[390px] h-[844px] bg-gray-50 flex flex-col overflow-hidden" style={{ fontSize: '14px' }}>
      {/* Top Nav */}
      <nav className="bg-white border-b flex items-center px-4 h-14 flex-shrink-0" style={{ borderColor: 'oklch(0.850 0.025 68)', boxShadow: '0 1px 0 oklch(0.850 0.025 68)' }}>
        <div className="flex items-center border-r pr-4 mr-4 flex-shrink-0" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          <span className="font-bold text-gray-900 text-base tracking-tight">VenueFlowHQ</span>
        </div>
        <div className="flex-1 text-center">
          <span className="font-inter text-sm font-semibold text-sage-dark">Home</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <Settings className="w-4 h-4" />
          </div>
          <div className="w-8 h-8 rounded-full bg-sage-green flex items-center justify-center text-white text-sm font-semibold">A</div>
        </div>
      </nav>

      {/* Stats bar */}
      <div className="bg-white border-b flex-shrink-0 relative" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
        <div className="grid grid-cols-4">
          {[
            { label: 'Active Enquiries', value: 28, sub: 'in pipeline', iconBg: 'bg-sage-tint', iconColor: 'text-sage-dark', Icon: MessageSquare },
            { label: 'Upcoming Events', value: 5, sub: 'next 30 days', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', Icon: Calendar },
            { label: 'Overdue Tasks', value: 0, sub: 'all clear', iconBg: 'bg-gray-50', iconColor: 'text-gray-400', Icon: AlertCircle },
            { label: 'Overdue Follow...', value: 0, sub: 'all clear', iconBg: 'bg-gray-50', iconColor: 'text-gray-400', Icon: Clock },
          ].map((s, i) => (
            <div key={i} className="px-3 py-3 border-r last:border-r-0" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-6 h-6 rounded ${s.iconBg} ${s.iconColor} flex items-center justify-center flex-shrink-0`}>
                  <s.Icon className="w-3.5 h-3.5" />
                </div>
                <div className="text-xs text-gray-400 leading-tight truncate">{s.label}</div>
              </div>
              <div className="text-xl font-bold text-gray-900 leading-none mb-0.5">{s.value}</div>
              <div className="text-xs text-gray-400">{s.sub}</div>
            </div>
          ))}
        </div>
        <button className="absolute top-1.5 right-1.5 p-1 rounded text-gray-300">
          <Settings className="w-3 h-3" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto pb-16">
        {/* Calendar toolbar */}
        <div className="bg-white flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          <button className="p-1.5 hover:bg-sage-tint rounded-lg text-gray-500"><ChevronLeft className="w-4 h-4" /></button>
          <button className="p-1.5 hover:bg-sage-tint rounded-lg text-gray-500"><ChevronRight className="w-4 h-4" /></button>
          <h2 className="font-semibold text-gray-900 text-base flex-1" style={{ letterSpacing: '-0.02em' }}>Mar 2026</h2>
          <button className="text-xs font-medium px-3 py-1.5 border rounded-lg text-gray-500" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>Today</button>
          <button className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-sage-green text-white rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Add Event
          </button>
        </div>
        {/* Legend */}
        <div className="bg-white flex items-center gap-3 px-4 py-1.5 border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          {[['bg-sage-green','Confirmed'],['bg-amber-400','Tentative'],['bg-violet-400','Proposal'],['bg-rose-400','Enquiry'],['bg-gray-300','Cancelled']].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
              <span className={`w-2.5 h-2.5 rounded-full ${c} flex-shrink-0`} />{l}
            </span>
          ))}
        </div>
        {/* Day headers */}
        <div className="bg-white grid grid-cols-7 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
          {['MON','TUE','WED','THU','FRI','SAT','SUN'].map((d,i) => (
            <div key={d} className={`text-center text-xs font-semibold py-2 border-r last:border-r-0 ${i>=5?'text-sage-dark bg-sage-tint/30':'text-gray-400'}`} style={{ borderColor: 'oklch(0.850 0.025 68)' }}>{d}</div>
          ))}
        </div>
        {/* Calendar grid */}
        {CAL_WEEKS.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 bg-white" style={{ borderBottom: '1px solid oklch(0.850 0.025 68)' }}>
            {week.map((day, di) => {
              if (!day) return <div key={di} className="border-r last:border-r-0 bg-gray-50/50 h-16" style={{ borderColor: 'oklch(0.850 0.025 68)' }} />;
              const isToday = day === 22;
              const isWknd = di >= 5;
              const evts = EVENTS_BY_DAY[day] ?? [];
              return (
                <div key={di} className={`border-r last:border-r-0 p-1.5 h-16 flex flex-col gap-0.5 ${isWknd?'bg-sage-tint/10':'bg-white'}`} style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
                  <span className={`text-xs font-semibold leading-none self-start ${isToday?'w-5 h-5 bg-sage-green text-white rounded-full flex items-center justify-center text-[10px]':isWknd?'text-sage-dark':'text-gray-600'}`}>
                    {day}
                  </span>
                  {evts.map((e,ei) => (
                    <div key={ei} className={`rounded px-1 py-0.5 text-[9px] leading-tight ${e.color}`}>
                      <div className="font-semibold truncate">{e.name}</div>
                      <div className="truncate opacity-85">{e.type}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}

        {/* Upcoming events list */}
        <div className="bg-white mt-2">
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <h3 className="text-sm font-semibold text-gray-900">Upcoming Events</h3>
            <button className="text-xs text-sage-green">View all</button>
          </div>
          {upcomingEvents.map((e, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 border-b hover:bg-sage-tint/20" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
              <div className="w-1.5 flex-shrink-0 self-stretch rounded-full bg-sage-green mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">{e.name}</div>
                <div className="text-xs text-gray-500 truncate">{e.type}</div>
                <div className="text-xs text-gray-400">{e.date} · {e.guests} guests</div>
              </div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sage-tint text-sage-dark flex-shrink-0">{e.status}</span>
            </div>
          ))}
        </div>

        {/* New enquiries */}
        <div className="bg-white mt-2">
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'oklch(0.850 0.025 68)' }}>
            <h3 className="text-sm font-semibold text-gray-900">New Enquiries</h3>
            <button className="text-xs text-sage-green">View all</button>
          </div>
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <CheckCircle className="w-8 h-8 mb-2" style={{ color: 'oklch(0.590 0.040 140)', opacity: 0.3 }} />
            <p className="text-xs text-gray-400">All caught up!</p>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 bg-white border-t flex items-stretch h-16 w-[390px]" style={{ borderColor: 'oklch(0.850 0.025 68)', boxShadow: '0 -1px 0 oklch(0.850 0.025 68)' }}>
        {[
          { label: 'Home', active: true, Icon: LayoutDashboard },
          { label: 'Events', active: false, Icon: MessageSquare },
          { label: 'Calendar', active: false, Icon: Calendar },
          { label: 'Tasks', active: false, Icon: CheckCircle },
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
