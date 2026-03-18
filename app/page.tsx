import Link from 'next/link';
import { fetchTasks, groupTasksByStatus } from '@/lib/asana';
import { fetchDeals } from '@/lib/pipedrive';
import { getHotDealsData } from '@/lib/hot-deals';
import HotDealsSection from '@/components/HotDealsSection';
import BrainDump from '@/components/BrainDump';
import ActionItems from '@/components/ActionItems';
import MorningSweep from '@/components/MorningSweep';
import PropertyReviewTodos from '@/components/PropertyReviewTodos';

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1 text-slate-900">Good {getGreetingTime()}, Jacob</h1>
        <p className="text-slate-500">{hotDealsData.today.greeting}</p>
      </div>

      {/* 1. Morning Sweep — primary daily driver */}
      {hotDealsData.todaySweep ? (
        <MorningSweep sweep={hotDealsData.todaySweep} />
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
          <p className="text-sm text-slate-500">Morning sweep not yet generated. Check back after 7:30 AM.</p>
        </div>
      )}

      {/* 1b. Property Review Action Items */}
      {hotDealsData.propertyReviewTodos && (
        <PropertyReviewTodos data={hotDealsData.propertyReviewTodos} />
      )}

      {/* 2. Today's Schedule */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
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

      {/* 2. Action Items */}
      <ActionItems items={hotDealsData.actionItems ?? []} />

      {/* 3. Focus Deals (no dropped balls on home page) */}
      <HotDealsSection
        pipelineDeals={hotDealsData.pipelineDeals}
        sideDeals={hotDealsData.sideDeals}
        droppedBalls={[]}
        lastUpdated={hotDealsData.lastUpdated}
        sourceDoc={hotDealsData.sourceDoc}
      />

      {/* 4. Brain Dump — collapsible, bottom of page */}
      <BrainDump />

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
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
