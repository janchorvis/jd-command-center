import Link from 'next/link';
import { fetchTasks, groupTasksByStatus } from '@/lib/asana';
import { fetchDeals, getStaleDeals } from '@/lib/pipedrive';
import { getHotDealsData } from '@/lib/hot-deals';
import StatCard from '@/components/StatCard';
import HotDealsSection from '@/components/HotDealsSection';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [tasks, deals] = await Promise.all([
    fetchTasks(),
    fetchDeals(),
  ]);

  const hotDealsData = getHotDealsData();
  const { overdue, thisWeek, parked } = groupTasksByStatus(tasks);
  const staleDeals = getStaleDeals(deals);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-4xl font-bold mb-2">⚡ Command Center</h1>
      <p className="text-slate-400 mb-8">Your personal dashboard for tasks & deals</p>

      {/* Focus Deals */}
      <HotDealsSection
        pipelineDeals={hotDealsData.pipelineDeals}
        sideDeals={hotDealsData.sideDeals}
        droppedBalls={hotDealsData.droppedBalls}
        lastUpdated={hotDealsData.lastUpdated}
        sourceDoc={hotDealsData.sourceDoc}
      />

      {/* Alert Banners */}
      {overdue.length > 0 && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-red-400 mb-1">🚨 {overdue.length} Overdue Tasks</h3>
          <p className="text-sm text-slate-300">You have tasks that need attention</p>
        </div>
      )}

      {staleDeals.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-400 mb-1">⚠️ {staleDeals.length} Stale Deals</h3>
          <p className="text-sm text-slate-300">Some deals haven't been touched in 14+ days</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Overdue Tasks"
          value={overdue.length}
          emoji="⏰"
          color={overdue.length > 5 ? 'red' : 'blue'}
        />
        <StatCard
          label="This Week"
          value={thisWeek.length}
          emoji="📅"
          color={thisWeek.length > 10 ? 'yellow' : 'blue'}
        />
        <StatCard
          label="Active Deals"
          value={deals.length}
          emoji="💰"
          color="blue"
        />
        <StatCard
          label="Stale Deals"
          value={staleDeals.length}
          emoji="🚨"
          color={staleDeals.length > 5 ? 'red' : 'blue'}
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/tasks" className="group">
          <div className="bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg p-6 transition">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">📋 Tasks</h2>
              <span className="text-slate-400 group-hover:text-white transition">→</span>
            </div>
            <p className="text-slate-400 text-sm">
              View all tasks in kanban view. Drag and drop to prioritize.
            </p>
            <div className="mt-4 flex gap-4 text-sm">
              <span className="text-red-400">{overdue.length} overdue</span>
              <span className="text-yellow-400">{thisWeek.length} this week</span>
              <span className="text-slate-400">{parked.length} parked</span>
            </div>
          </div>
        </Link>

        <Link href="/deals" className="group">
          <div className="bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg p-6 transition">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">💼 Deals</h2>
              <span className="text-slate-400 group-hover:text-white transition">→</span>
            </div>
            <p className="text-slate-400 text-sm">
              Leasing pipeline overview with deal health tracking.
            </p>
            <div className="mt-4 flex gap-4 text-sm">
              <span className="text-green-400">{deals.filter(d => d.health === 'active').length} active</span>
              <span className="text-yellow-400">{deals.filter(d => d.health === 'watch').length} watch</span>
              <span className="text-red-400">{staleDeals.length} stale</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
