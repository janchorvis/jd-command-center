import { fetchDeals, groupDealsByStage, getStaleDeals } from '@/lib/pipedrive';
import { getHotDealsData } from '@/lib/hot-deals';
import StatCard from '@/components/StatCard';
import DealCard from '@/components/DealCard';
import HotDealsSection from '@/components/HotDealsSection';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const deals = await fetchDeals();
  const hotDealsData = getHotDealsData();
  const staleDeals = getStaleDeals(deals);
  const grouped = groupDealsByStage(deals);

  const healthCounts = {
    active: deals.filter(d => d.health === 'active').length,
    watch: deals.filter(d => d.health === 'watch').length,
    stale: staleDeals.length,
  };

  // Get top priority deals (stale + watch, sorted by inactivity)
  const priorityDeals = deals
    .filter(d => d.health === 'stale' || d.health === 'watch')
    .sort((a, b) => b.daysInactive - a.daysInactive)
    .slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">💼 Leasing Pipeline</h1>

      {/* Focus Deals */}
      <HotDealsSection
        pipelineDeals={hotDealsData.pipelineDeals}
        sideDeals={hotDealsData.sideDeals}
        droppedBalls={hotDealsData.droppedBalls}
        lastUpdated={hotDealsData.lastUpdated}
        sourceDoc={hotDealsData.sourceDoc}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Deals" value={deals.length} emoji="💰" color="blue" />
        <StatCard label="Active" value={healthCounts.active} emoji="🟢" color="green" />
        <StatCard label="Watch" value={healthCounts.watch} emoji="🟡" color="yellow" />
        <StatCard label="Stale" value={healthCounts.stale} emoji="🔴" color={healthCounts.stale > 5 ? 'red' : 'blue'} />
      </div>

      {/* Priority Deals - What to Do Next */}
      {priorityDeals.length > 0 && (
        <div className="mb-8 bg-gradient-to-r from-red-900/30 to-orange-900/30 rounded-lg p-6 border border-red-800/50">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>⚠️</span>
            <span>Needs Attention ({priorityDeals.length})</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {priorityDeals.map(deal => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      )}

      {/* Deal Cards by Stage */}
      <div className="space-y-8">
        {Object.entries(grouped).map(([stage, stageDeals]) => (
          stageDeals.length > 0 && (
            <div key={stage}>
              <h2 className="text-xl font-semibold mb-4">{stage} ({stageDeals.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stageDeals.map(deal => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
