import { fetchTasks } from '@/lib/asana';
import { getHotDealsData } from '@/lib/hot-deals';
import MorningSweep from '@/components/MorningSweep';
import Focus3 from '@/components/Focus3';

export const dynamic = 'force-dynamic';

function getGreetingWord(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default async function Home() {
  await fetchTasks();

  const hotDealsData = getHotDealsData();

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      {/* Compact greeting */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">{getGreetingWord()}, Jacob</h1>
        <p className="text-sm text-slate-400">{getTodayLabel()}</p>
      </div>

      {/* Focus 3 */}
      <Focus3 focus3={hotDealsData.focus3} />

      {/* Morning Sweep */}
      {hotDealsData.todaySweep ? (
        <MorningSweep sweep={hotDealsData.todaySweep} />
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 mb-6">
          <p className="text-sm text-slate-500">Morning sweep not yet generated. Check back after 7:30 AM.</p>
        </div>
      )}

      {/* Today's Schedule */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 mb-6">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Today&apos;s Schedule</h2>
        <div className="space-y-1.5">
          {hotDealsData.today.meetings.map((meeting, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-xs text-[#3b82f6] font-medium shrink-0 w-24">{meeting.time}</span>
              <div>
                <p className="text-sm text-slate-900">{meeting.title}</p>
                {meeting.dealContext && (
                  <p className="text-xs text-slate-400">{meeting.dealContext}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
