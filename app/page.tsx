import { fetchTasks, groupTasksByStatus } from '@/lib/asana';
import { getHotDealsData } from '@/lib/hot-deals';
import HotDealsSection from '@/components/HotDealsSection';
import MorningSweep from '@/components/MorningSweep';
import Focus3 from '@/components/Focus3';

export const dynamic = 'force-dynamic';

function getGreetingTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export default async function Home() {
  await fetchTasks();

  const hotDealsData = getHotDealsData();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1 text-slate-900">Good {getGreetingTime()}, Jacob</h1>
        <p className="text-slate-500">{hotDealsData.today.greeting}</p>
      </div>

      {/* Focus 3 — Jarvis's opinionated top picks for today */}
      <Focus3 focus3={hotDealsData.focus3} />

      {/* Morning Sweep — primary daily driver */}
      {hotDealsData.todaySweep ? (
        <MorningSweep sweep={hotDealsData.todaySweep} />
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
          <p className="text-sm text-slate-500">Morning sweep not yet generated. Check back after 7:30 AM.</p>
        </div>
      )}

      {/* Today's Schedule */}
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

      {/* Focus Deals — high priority only on home page */}
      <HotDealsSection
        pipelineDeals={hotDealsData.pipelineDeals.filter(d => d.priority === 'high')}
        sideDeals={hotDealsData.sideDeals}
        droppedBalls={[]}
        lastUpdated={hotDealsData.lastUpdated}
        sourceDoc={hotDealsData.sourceDoc}
      />
    </div>
  );
}
