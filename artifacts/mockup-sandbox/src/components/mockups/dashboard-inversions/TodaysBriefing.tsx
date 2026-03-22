import React from "react";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Clock, 
  Users, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare, 
  ChevronRight,
  Activity,
  ArrowRight
} from "lucide-react";

export default function TodaysBriefing() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-slate-800 font-sans p-6 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#2D4A3E] tracking-tight">Today's Briefing</h1>
          <p className="text-slate-500 mt-1">Tuesday, 14 November — Action priority view</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full border-2 border-[#FAFAF7] bg-green-200 flex items-center justify-center text-xs font-medium text-green-800">AM</div>
            <div className="w-8 h-8 rounded-full border-2 border-[#FAFAF7] bg-blue-200 flex items-center justify-center text-xs font-medium text-blue-800">CK</div>
          </div>
          <span className="text-sm text-slate-500 font-medium">2 staff online</span>
        </div>
      </div>

      {/* Top: KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* KPI 1 */}
        <div className="bg-white rounded-xl p-5 border border-green-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <h3 className="text-sm font-medium text-slate-500 mb-1">Active Enquiries</h3>
            <div className="flex items-end justify-between">
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold text-[#2D4A3E]">28</span>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center text-xs font-medium text-green-600 mb-2">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  <span>3 from last week</span>
                </div>
                {/* Sparkline */}
                <div className="flex items-end gap-1 h-6 w-16">
                  <div className="w-full bg-green-100 rounded-t-sm h-[40%]"></div>
                  <div className="w-full bg-green-100 rounded-t-sm h-[60%]"></div>
                  <div className="w-full bg-green-200 rounded-t-sm h-[50%]"></div>
                  <div className="w-full bg-green-300 rounded-t-sm h-[80%]"></div>
                  <div className="w-full bg-green-500 rounded-t-sm h-[100%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white rounded-xl p-5 border border-blue-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <h3 className="text-sm font-medium text-slate-500 mb-1">Upcoming Events</h3>
            <div className="flex items-end justify-between">
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold text-[#2D4A3E]">5</span>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center text-xs font-medium text-blue-600 mb-2">
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  <span>next 7 days</span>
                </div>
                {/* Sparkline */}
                <div className="flex items-end gap-1 h-6 w-16">
                  <div className="w-full bg-blue-100 rounded-t-sm h-[20%]"></div>
                  <div className="w-full bg-blue-500 rounded-t-sm h-[100%]"></div>
                  <div className="w-full bg-blue-100 rounded-t-sm h-[0%]"></div>
                  <div className="w-full bg-blue-200 rounded-t-sm h-[40%]"></div>
                  <div className="w-full bg-blue-300 rounded-t-sm h-[80%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white rounded-xl p-5 border border-amber-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <h3 className="text-sm font-medium text-slate-500 mb-1">Overdue Tasks</h3>
            <div className="flex items-end justify-between">
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold text-amber-700">2</span>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center text-xs font-medium text-amber-600 mb-2">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  <span>2 urgent</span>
                </div>
                {/* Sparkline */}
                <div className="flex items-end gap-1 h-6 w-16">
                  <div className="w-full bg-amber-100 rounded-t-sm h-[100%]"></div>
                  <div className="w-full bg-amber-200 rounded-t-sm h-[80%]"></div>
                  <div className="w-full bg-amber-100 rounded-t-sm h-[60%]"></div>
                  <div className="w-full bg-amber-300 rounded-t-sm h-[90%]"></div>
                  <div className="w-full bg-amber-500 rounded-t-sm h-[40%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white rounded-xl p-5 border border-rose-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
          <div className="relative z-10 flex flex-col h-full justify-between">
            <h3 className="text-sm font-medium text-slate-500 mb-1">Follow-ups Due</h3>
            <div className="flex items-end justify-between">
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold text-rose-700">4</span>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center text-xs font-medium text-rose-600 mb-2">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  <span>4 today</span>
                </div>
                {/* Sparkline */}
                <div className="flex items-end gap-1 h-6 w-16">
                  <div className="w-full bg-rose-100 rounded-t-sm h-[30%]"></div>
                  <div className="w-full bg-rose-200 rounded-t-sm h-[50%]"></div>
                  <div className="w-full bg-rose-300 rounded-t-sm h-[60%]"></div>
                  <div className="w-full bg-rose-400 rounded-t-sm h-[80%]"></div>
                  <div className="w-full bg-rose-500 rounded-t-sm h-[100%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Three-column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* Left Column (35%) - Today's Events */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#2D4A3E]">Today & Tomorrow</h2>
          </div>
          
          <div className="flex flex-col gap-4 flex-1">
            {/* Event Card 1 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="w-full h-1.5 bg-green-500"></div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-lg text-slate-800 leading-tight">Cherie Kellahan Wedding</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide bg-green-50 text-green-700 border border-green-200 uppercase">
                    Confirmed
                  </span>
                </div>
                
                <div className="space-y-2.5 mb-5">
                  <div className="flex items-center text-sm text-slate-600">
                    <Clock className="w-4 h-4 mr-2.5 text-slate-400" />
                    <span className="font-medium">Today, 2:00 PM – 11:30 PM</span>
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <MapPin className="w-4 h-4 mr-2.5 text-slate-400" />
                    <span>Grand Ballroom</span>
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <Users className="w-4 h-4 mr-2.5 text-slate-400" />
                    <span>120 Guests</span>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-auto">
                  <button className="flex-1 bg-[#2D4A3E] hover:bg-[#1e332a] text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex justify-center items-center">
                    View Runsheet
                  </button>
                  <button className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg transition-colors flex justify-center items-center">
                    Open Enquiry
                  </button>
                </div>
              </div>
            </div>

            {/* Event Card 2 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="w-full h-1.5 bg-amber-400"></div>
              <div className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold text-lg text-slate-800 leading-tight">TechCorp Quarterly Mixer</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                    Tentative
                  </span>
                </div>
                
                <div className="space-y-2.5 mb-5">
                  <div className="flex items-center text-sm text-slate-600">
                    <Clock className="w-4 h-4 mr-2.5 text-slate-400" />
                    <span className="font-medium">Tomorrow, 5:30 PM – 9:00 PM</span>
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <MapPin className="w-4 h-4 mr-2.5 text-slate-400" />
                    <span>The Courtyard</span>
                  </div>
                  <div className="flex items-center text-sm text-slate-600">
                    <Users className="w-4 h-4 mr-2.5 text-slate-400" />
                    <span>85 Guests</span>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-auto">
                  <button className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg transition-colors flex justify-center items-center">
                    Open Enquiry
                  </button>
                </div>
              </div>
            </div>
            
            <button className="w-full text-sm text-slate-500 hover:text-[#2D4A3E] font-medium transition-colors flex items-center justify-center p-2 mt-1">
              View all 5 upcoming events <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>

        {/* Center Column (35%) - Priority Actions */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
              <h2 className="text-lg font-bold text-[#2D4A3E] uppercase tracking-wide">Action Required</h2>
            </div>
            <span className="text-xs font-bold tracking-wide bg-rose-100 text-rose-700 px-2 py-1 rounded-md">5 ITEMS</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="divide-y divide-slate-100">
              
              {/* Action Item 1 */}
              <div className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors border-l-4 border-l-rose-500">
                <div className="mt-0.5 p-2 bg-rose-50 rounded-lg text-rose-600 shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm mb-1 truncate">Reply to Sam Brown enquiry</p>
                  <p className="text-xs text-slate-500 mb-3">Received 3 days ago. SLA breached.</p>
                  <button className="text-xs font-medium bg-white border border-slate-300 shadow-sm hover:bg-slate-50 text-slate-700 py-1.5 px-4 rounded-md transition-colors">
                    Reply Now
                  </button>
                </div>
              </div>

              {/* Action Item 2 */}
              <div className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors border-l-4 border-l-amber-400">
                <div className="mt-0.5 p-2 bg-amber-50 rounded-lg text-amber-600 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm mb-1 truncate">Chase deposit — Caitlyn Stewart</p>
                  <p className="text-xs text-slate-500 mb-3">Deposit of $1,500 was due yesterday.</p>
                  <button className="text-xs font-medium bg-white border border-slate-300 shadow-sm hover:bg-slate-50 text-slate-700 py-1.5 px-4 rounded-md transition-colors">
                    Send Reminder
                  </button>
                </div>
              </div>

              {/* Action Item 3 */}
              <div className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors border-l-4 border-l-amber-400">
                <div className="mt-0.5 p-2 bg-amber-50 rounded-lg text-amber-600 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm mb-1 truncate">Overdue task: Final menu confirm</p>
                  <p className="text-xs text-slate-500 mb-3">Event: Thomas Gentz (in 5 days)</p>
                  <button className="text-xs font-medium bg-white border border-slate-300 shadow-sm hover:bg-slate-50 text-slate-700 py-1.5 px-4 rounded-md transition-colors">
                    View Task
                  </button>
                </div>
              </div>

              {/* Action Item 4 */}
              <div className="p-4 flex items-start gap-4 hover:bg-slate-50 transition-colors border-l-4 border-l-blue-400">
                <div className="mt-0.5 p-2 bg-blue-50 rounded-lg text-blue-600 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm mb-1 truncate">Review run sheet with team</p>
                  <p className="text-xs text-slate-500 mb-3">For tomorrow's TechCorp Mixer</p>
                  <button className="text-xs font-medium bg-white border border-slate-300 shadow-sm hover:bg-slate-50 text-slate-700 py-1.5 px-4 rounded-md transition-colors">
                    Open Runsheet
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Column (30%) - New Enquiries */}
        <div className="lg:col-span-3 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#2D4A3E]">New Enquiries</h2>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div className="divide-y divide-slate-100">
              
              {/* Enquiry 1 */}
              <div className="p-4 hover:bg-slate-50 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#2D4A3E] text-white flex items-center justify-center text-xs font-bold">L</div>
                    <span className="font-bold text-sm text-slate-800">Liam O'Connor</span>
                  </div>
                  <span className="text-[9px] font-bold tracking-wider text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded uppercase">Unread</span>
                </div>
                <div className="pl-9.5">
                  <p className="text-xs font-medium text-slate-700 mb-2">Corporate Christmas Party</p>
                  <div className="flex items-center text-[11px] text-slate-500 gap-3 mb-3">
                    <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> 12 Dec</span>
                    <span className="flex items-center"><Users className="w-3 h-3 mr-1"/> 60-80</span>
                  </div>
                  <button className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-md transition-colors">
                    Quick Respond
                  </button>
                </div>
              </div>

              {/* Enquiry 2 */}
              <div className="p-4 hover:bg-slate-50 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-rose-700 text-white flex items-center justify-center text-xs font-bold">M</div>
                    <span className="font-bold text-sm text-slate-800">Mia Taylor</span>
                  </div>
                  <span className="text-[9px] font-bold tracking-wider text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded uppercase">Unread</span>
                </div>
                <div className="pl-9.5">
                  <p className="text-xs font-medium text-slate-700 mb-2">50th Birthday Celebration</p>
                  <div className="flex items-center text-[11px] text-slate-500 gap-3 mb-3">
                    <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> 4 Nov</span>
                    <span className="flex items-center"><Users className="w-3 h-3 mr-1"/> 40</span>
                  </div>
                  <button className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-md transition-colors">
                    Quick Respond
                  </button>
                </div>
              </div>

              {/* Enquiry 3 */}
              <div className="p-4 hover:bg-slate-50 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold">J</div>
                    <span className="font-semibold text-sm text-slate-700">James Wilson</span>
                  </div>
                </div>
                <div className="pl-9.5">
                  <p className="text-xs font-medium text-slate-600 mb-2">Product Launch</p>
                  <div className="flex items-center text-[11px] text-slate-500 gap-3 mb-3">
                    <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> TBD</span>
                    <span className="flex items-center"><Users className="w-3 h-3 mr-1"/> 150</span>
                  </div>
                  <button className="text-xs font-medium bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-slate-600 py-1.5 px-3 rounded-md transition-colors">
                    Open Thread
                  </button>
                </div>
              </div>

            </div>
          </div>
          <button className="w-full text-sm text-slate-500 hover:text-[#2D4A3E] font-medium transition-colors flex items-center justify-center p-2 mt-1">
            View all 12 enquiries <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>

      </div>

      {/* Bottom: Activity Feed */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Recent Activity</h2>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 flex items-center overflow-x-auto no-scrollbar">
          <div className="flex items-center shrink-0 mr-6">
            <Activity className="w-4 h-4 text-slate-400 mr-2.5" />
            <span className="text-sm font-medium text-slate-700">Proposal sent to Cherie K</span>
            <span className="text-xs text-slate-400 ml-2">2h ago</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mr-6 shrink-0"></div>
          
          <div className="flex items-center shrink-0 mr-6">
            <CheckCircle2 className="w-4 h-4 text-green-500 mr-2.5" />
            <span className="text-sm font-medium text-slate-700">Thomas Gentz confirmed</span>
            <span className="text-xs text-slate-400 ml-2">Yesterday, 4:30 PM</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mr-6 shrink-0"></div>
          
          <div className="flex items-center shrink-0 mr-6">
            <MessageSquare className="w-4 h-4 text-blue-500 mr-2.5" />
            <span className="text-sm font-medium text-slate-700">Note added to Caitlyn Stewart</span>
            <span className="text-xs text-slate-400 ml-2">Yesterday, 2:15 PM</span>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-slate-200 mr-6 shrink-0"></div>
          
          <div className="flex items-center shrink-0">
            <span className="text-sm font-medium text-[#2D4A3E] hover:underline cursor-pointer flex items-center">
              View all activity <ChevronRight className="w-4 h-4 ml-0.5" />
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
