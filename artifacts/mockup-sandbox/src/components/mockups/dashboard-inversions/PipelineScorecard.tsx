import React from "react";
import { 
  LayoutDashboard, 
  CalendarDays, 
  Calendar, 
  CheckSquare, 
  BarChart3, 
  Settings, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight,
  FileText,
  PlusCircle,
  ListFilter,
  PieChart,
  Clock,
  AlertCircle
} from "lucide-react";

export default function PipelineScorecard() {
  return (
    <div className="flex min-h-screen bg-gray-50 font-sans text-slate-800">
      {/* Sidebar */}
      <aside className="w-[220px] bg-[#2D4A3E] text-[#F9F6F0] flex flex-col justify-between flex-shrink-0">
        <div>
          <div className="p-6">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
                <div className="w-3 h-3 bg-[#2D4A3E] rounded-full" />
              </div>
              VenueFlowHQ
            </h1>
          </div>
          
          <nav className="mt-2 px-3 space-y-1">
            <a href="#" className="flex items-center gap-3 px-3 py-2 bg-white/10 rounded-md text-white font-medium">
              <LayoutDashboard size={18} className="text-white" />
              Home
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#F9F6F0]/70 hover:text-white hover:bg-white/5 rounded-md transition-colors">
              <CalendarDays size={18} />
              Events
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#F9F6F0]/70 hover:text-white hover:bg-white/5 rounded-md transition-colors">
              <Calendar size={18} />
              Calendar
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#F9F6F0]/70 hover:text-white hover:bg-white/5 rounded-md transition-colors">
              <CheckSquare size={18} />
              Tasks
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#F9F6F0]/70 hover:text-white hover:bg-white/5 rounded-md transition-colors">
              <BarChart3 size={18} />
              Reports
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#F9F6F0]/70 hover:text-white hover:bg-white/5 rounded-md transition-colors">
              <Settings size={18} />
              Settings
            </a>
          </nav>
        </div>

        <div className="p-4 border-t border-white/10 mt-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
              BF
            </div>
            <div>
              <p className="text-sm font-medium text-white">Bar Franco</p>
              <p className="text-xs text-[#F9F6F0]/60">Venue Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">
                Good morning, Bar <span className="text-amber-500 ml-1">✦</span>
              </h2>
              <p className="text-slate-500 mt-1 text-lg">Here's your venue at a glance</p>
            </div>
            <div className="text-slate-500 font-medium bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100">
              Monday, 22 March 2026
            </div>
          </div>

          {/* Row 1: KPI Scorecards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Enquiries */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-green-500" />
              <div className="p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Enquiries</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900">28</span>
                  <span className="flex items-center text-sm font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                    <TrendingUp size={14} className="mr-1" />
                    3
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">vs 25 last month</p>
                
                <div className="mt-6 flex items-end gap-1 h-8 opacity-70">
                  <div className="w-full bg-slate-100 rounded-sm h-[30%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[40%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[35%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[60%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[80%]" />
                  <div className="w-full bg-green-500 rounded-sm h-[100%]" />
                </div>
              </div>
            </div>

            {/* Confirmed Bookings */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
              <div className="p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Confirmed Bookings</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900">12</span>
                  <span className="flex items-center text-sm font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    <ArrowRight size={14} className="mr-1" />
                    0
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">vs 12 last month</p>
                
                <div className="mt-6 flex items-end gap-1 h-8 opacity-70">
                  <div className="w-full bg-slate-100 rounded-sm h-[50%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[60%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[40%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[60%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[50%]" />
                  <div className="w-full bg-blue-500 rounded-sm h-[60%]" />
                </div>
              </div>
            </div>

            {/* Pipeline Value */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#C9A84C]" />
              <div className="p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Pipeline Value</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900">$84.5k</span>
                  <span className="flex items-center text-sm font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    <TrendingUp size={14} className="mr-1" />
                    $12k
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">vs $72.5k last month</p>
                
                <div className="mt-6 flex items-end gap-1 h-8 opacity-70">
                  <div className="w-full bg-slate-100 rounded-sm h-[40%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[45%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[50%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[70%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[85%]" />
                  <div className="w-full bg-[#C9A84C] rounded-sm h-[100%]" />
                </div>
              </div>
            </div>

            {/* Conversion Rate */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
              <div className="p-5">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Conversion Rate</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-slate-900">43%</span>
                  <span className="flex items-center text-sm font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    <TrendingUp size={14} className="mr-1" />
                    5%
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">vs 38% last month</p>
                
                <div className="mt-6 flex items-end gap-1 h-8 opacity-70">
                  <div className="w-full bg-slate-100 rounded-sm h-[30%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[35%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[35%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[40%]" />
                  <div className="w-full bg-slate-100 rounded-sm h-[38%]" />
                  <div className="w-full bg-emerald-500 rounded-sm h-[43%]" />
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Pipeline Funnel */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900">Enquiry Pipeline</h3>
              <div className="text-sm text-slate-500 flex gap-4">
                <span>Average time to close: <strong className="text-slate-800">8 days</strong></span>
                <span>Enquiries this week: <strong className="text-green-600">6 new</strong></span>
              </div>
            </div>
            
            <div className="flex items-stretch h-24 w-full gap-1 rounded-lg overflow-hidden">
              {/* Stage 1 */}
              <div className="bg-[#EAF3EF] flex-1 border-r border-white flex flex-col justify-center items-center relative group transition-all hover:bg-[#DDF0E7]">
                <span className="text-xs font-semibold text-[#2D4A3E]/70 mb-1 uppercase tracking-wider">Enquiry</span>
                <span className="text-3xl font-bold text-[#2D4A3E]">28</span>
                <span className="text-[10px] text-[#2D4A3E]/60 absolute bottom-2">100%</span>
              </div>
              
              {/* Stage 2 */}
              <div className="bg-[#C5E1D4] flex-1 border-r border-white flex flex-col justify-center items-center relative group transition-all hover:bg-[#B5D9C8]">
                <span className="text-xs font-semibold text-[#2D4A3E]/80 mb-1 uppercase tracking-wider">Qualified</span>
                <span className="text-3xl font-bold text-[#2D4A3E]">18</span>
                <span className="text-[10px] text-[#2D4A3E]/60 absolute bottom-2">64%</span>
              </div>
              
              {/* Stage 3 */}
              <div className="bg-[#94C5B0] flex-1 border-r border-white flex flex-col justify-center items-center relative group transition-all hover:bg-[#83BAA2]">
                <span className="text-xs font-semibold text-[#1C3028] mb-1 uppercase tracking-wider">Proposal Sent</span>
                <span className="text-3xl font-bold text-[#1C3028]">11</span>
                <span className="text-[10px] text-[#1C3028]/70 absolute bottom-2">39%</span>
              </div>
              
              {/* Stage 4 */}
              <div className="bg-[#5C947D] flex-1 border-r border-white flex flex-col justify-center items-center relative group transition-all hover:bg-[#4E826C]">
                <span className="text-xs font-semibold text-white/90 mb-1 uppercase tracking-wider">Negotiating</span>
                <span className="text-3xl font-bold text-white">7</span>
                <span className="text-[10px] text-white/70 absolute bottom-2">25%</span>
              </div>
              
              {/* Stage 5 */}
              <div className="bg-[#2D4A3E] flex-1 flex flex-col justify-center items-center relative group transition-all hover:bg-[#233A30]">
                <span className="text-xs font-semibold text-white/90 mb-1 uppercase tracking-wider">Confirmed</span>
                <span className="text-3xl font-bold text-white">5</span>
                <span className="text-[10px] text-white/70 absolute bottom-2">18%</span>
              </div>
            </div>
          </div>

          {/* Row 3: Enquiries & Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Recent Enquiries Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Recent Enquiries</h3>
                <button className="text-sm font-medium text-[#5C947D] hover:text-[#2D4A3E]">View All</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Name</th>
                      <th className="px-5 py-3 font-semibold">Event</th>
                      <th className="px-5 py-3 font-semibold">Date</th>
                      <th className="px-5 py-3 font-semibold">Stage</th>
                      <th className="px-5 py-3 font-semibold text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-medium text-slate-900">Cherie Kellahan</td>
                      <td className="px-5 py-3.5 text-slate-600">Wedding Reception</td>
                      <td className="px-5 py-3.5 text-slate-600">14 Nov 26</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                          Proposal Sent
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-900">$8,500</td>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-100 hover:bg-slate-100/50">
                      <td className="px-5 py-3.5 font-medium text-slate-900">Caitlyn Stewart</td>
                      <td className="px-5 py-3.5 text-slate-600">Corporate Party</td>
                      <td className="px-5 py-3.5 text-slate-600">02 Dec 26</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          Negotiating
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-900">$12,000</td>
                    </tr>
                    <tr className="bg-white border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-medium text-slate-900">Thomas Gentz</td>
                      <td className="px-5 py-3.5 text-slate-600">Birthday Dinner</td>
                      <td className="px-5 py-3.5 text-slate-600">28 Oct 26</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Qualified
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-900">$3,200</td>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-100 hover:bg-slate-100/50">
                      <td className="px-5 py-3.5 font-medium text-slate-900">Sarah Jenkins</td>
                      <td className="px-5 py-3.5 text-slate-600">Engagement Party</td>
                      <td className="px-5 py-3.5 text-slate-600">15 Jan 27</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                          Enquiry
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-900">TBD</td>
                    </tr>
                    <tr className="bg-white hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-medium text-slate-900">Marcus Wright</td>
                      <td className="px-5 py-3.5 text-slate-600">Product Launch</td>
                      <td className="px-5 py-3.5 text-slate-600">05 Nov 26</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                          Confirmed
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-900">$15,500</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions & Deadlines */}
            <div className="flex flex-col gap-6">
              
              {/* Quick Actions */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button className="flex flex-col items-center justify-center p-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#5C947D] hover:shadow-sm transition-all group">
                    <FileText size={24} className="text-[#5C947D] mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-semibold text-slate-700">New Proposal</span>
                  </button>
                  <button className="flex flex-col items-center justify-center p-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#5C947D] hover:shadow-sm transition-all group">
                    <PlusCircle size={24} className="text-[#5C947D] mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-semibold text-slate-700">Add Event</span>
                  </button>
                  <button className="flex flex-col items-center justify-center p-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#5C947D] hover:shadow-sm transition-all group relative">
                    <ListFilter size={24} className="text-[#5C947D] mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-semibold text-slate-700">View Pipeline</span>
                    <span className="absolute top-2 right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      3
                    </span>
                  </button>
                  <button className="flex flex-col items-center justify-center p-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#5C947D] hover:shadow-sm transition-all group">
                    <PieChart size={24} className="text-[#5C947D] mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-semibold text-slate-700">Run Report</span>
                  </button>
                </div>
              </div>

              {/* Upcoming Deadlines */}
              <div className="bg-white rounded-xl shadow-sm border border-rose-100 flex-1 flex flex-col">
                <div className="p-4 border-b border-rose-50 flex items-center gap-2 bg-rose-50/50 rounded-t-xl">
                  <AlertCircle size={18} className="text-rose-500" />
                  <h3 className="text-md font-bold text-slate-900">Upcoming Deadlines</h3>
                </div>
                <div className="p-2 flex-1">
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded bg-rose-100 flex flex-col items-center justify-center text-rose-600 flex-shrink-0">
                      <Clock size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">Deposit due — Caitlyn Stewart</p>
                      <p className="text-xs text-slate-500">Corporate Party • $2,400</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-rose-100 text-rose-700">
                        2 days
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded bg-amber-100 flex flex-col items-center justify-center text-amber-600 flex-shrink-0">
                      <Clock size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">Contract sign — Thomas Gentz</p>
                      <p className="text-xs text-slate-500">Birthday Dinner</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700">
                        5 days
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded bg-slate-100 flex flex-col items-center justify-center text-slate-600 flex-shrink-0">
                      <Clock size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">Menu confirm — Cherie K</p>
                      <p className="text-xs text-slate-500">Wedding Reception</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-700">
                        7 days
                      </span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}
