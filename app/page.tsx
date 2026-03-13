import Link from 'next/link';
import { fetchTasks, groupTasksByStatus } from '@/lib/asana';
import { fetchDeals, getStaleDeals } from '@/lib/pipedrive';
import { getHotDealsData } from '@/lib/hot-deals';
import HotDealsSection from '@/components/HotDealsSection';
import StaleContacts from '@/components/StaleContacts';
import WeeklyDiff from '@/components/WeeklyDiff';
import PipelineFunnel from '@/components/PipelineFunnel';
import BrainDump from '@/components/BrainDump';
import ActionItems from '@/components/ActionItems';

export const dynamic = 'force-dynamic';

function getGreetingTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export default async function Home() {
  const [tasks, deals] = await Promise.all([
    fetchTasks(),
    fetchDeals(),
  ]);

  const hotDealsData = getHotDealsData();
  const { overdue, thisWeek } = groupTasksByStatus(tasks);
  const staleDeals = getStaleDeals(deals);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1 text-slate-900">Good {getGreetingTime()}, Jacob</h1>
        <p className="text-slate-500">{hotDealsData.today.greeting}</p>
      </div>

      {/* Today's Context */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Meetings */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Today&apos;s Schedule</h2>
          <div className="space-y-2">
            {hotDealsData.today.meetings.map((meeting, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-sm text-[#3b82f6] font-medium shrink-0 w-28">{meeting.time}</span>
                <div>
                  <p className="text-sm text-slate-900">{meeting.title}</p>
                  {meeting.dealContext && (
                    <p className="text-xs text-slate-500 mt-0.5">{meeting.dealContext}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Priorities */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Top Priorities</h2>
          <div className="space-y-2">
            {hotDealsData.today.priorities.map((priority, i) => (
              <label key={i} className="flex items-start gap-3 group cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-slate-300 bg-white text-[#7a9a8a] focus:ring-[#7a9a8a]"
                />
                <span className="text-sm text-slate-700 group-hover:text-[#7a9a8a] transition">{priority}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Alert Banners */}
      {(overdue.length > 0 || staleDeals.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {overdue.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="font-semibold text-red-600 mb-1">🚨 {overdue.length} Overdue Tasks</h3>
              <p className="text-sm text-slate-700">You have tasks that need attention</p>
            </div>
          )}
          {staleDeals.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="font-semibold text-yellow-600 mb-1">⚠️ {staleDeals.length} Stale Deals</h3>
              <p className="text-sm text-slate-700">Some deals haven&apos;t been touched in 14+ days</p>
            </div>
          )}
        </div>
      )}

      {/* Focus Deals */}
      <HotDealsSection
        pipelineDeals={hotDealsData.pipelineDeals}
        sideDeals={hotDealsData.sideDeals}
        droppedBalls={hotDealsData.droppedBalls}
        lastUpdated={hotDealsData.lastUpdated}
        sourceDoc={hotDealsData.sourceDoc}
      />

      {/* Stale Contacts */}
      <StaleContacts contacts={hotDealsData.staleContacts} />

      {/* Weekly Diff */}
      <WeeklyDiff diff={hotDealsData.weeklyDiff} />

      {/* Action Items from prep doc */}
      <ActionItems items={hotDealsData.actionItems ?? []} />

      {/* Pipeline Funnel + Brain Dump side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <PipelineFunnel funnel={hotDealsData.funnel} />
        <BrainDump />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/tasks" className="group">
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl hover:shadow-md p-6 transition">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">📋 Tasks</h2>
              <span className="text-slate-500 group-hover:text-[#7a9a8a] transition">→</span>
            </div>
            <p className="text-slate-500 text-sm">
              View all tasks in kanban view. Drag and drop to prioritize.
            </p>
            <div className="mt-4 flex gap-4 text-sm">
              <span className="text-red-600">{overdue.length} overdue</span>
              <span className="text-yellow-600">{thisWeek.length} this week</span>
            </div>
          </div>
        </Link>

        <Link href="/deals" className="group">
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl hover:shadow-md p-6 transition">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">💼 Deals</h2>
              <span className="text-slate-500 group-hover:text-[#7a9a8a] transition">→</span>
            </div>
            <p className="text-slate-500 text-sm">
              Leasing pipeline overview with deal health tracking.
            </p>
            <div className="mt-4 flex gap-4 text-sm">
              <span className="text-emerald-600">{deals.filter(d => d.health === 'active').length} active</span>
              <span className="text-yellow-600">{deals.filter(d => d.health === 'watch').length} watch</span>
              <span className="text-red-600">{staleDeals.length} stale</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
