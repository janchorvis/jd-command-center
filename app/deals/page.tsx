import { fetchDeals, groupDealsByStage, getStaleDeals } from '@/lib/pipedrive';
import StatCard from '@/components/StatCard';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const deals = await fetchDeals();
  const staleDeals = getStaleDeals(deals);
  const grouped = groupDealsByStage(deals);

  const healthCounts = {
    active: deals.filter(d => d.health === 'active').length,
    watch: deals.filter(d => d.health === 'watch').length,
    stale: staleDeals.length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">💼 Leasing Pipeline</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Deals" value={deals.length} emoji="💰" color="blue" />
        <StatCard label="Active" value={healthCounts.active} emoji="🟢" color="green" />
        <StatCard label="Watch" value={healthCounts.watch} emoji="🟡" color="yellow" />
        <StatCard label="Stale" value={healthCounts.stale} emoji="🔴" color={healthCounts.stale > 5 ? 'red' : 'blue'} />
      </div>

      {/* Deal Cards by Stage */}
      <div className="space-y-8">
        {Object.entries(grouped).map(([stage, stageDeals]) => (
          stageDeals.length > 0 && (
            <div key={stage}>
              <h2 className="text-xl font-semibold mb-4">{stage} ({stageDeals.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stageDeals.map(deal => {
                  const healthColors = {
                    active: 'border-green-500',
                    watch: 'border-yellow-500',
                    stale: 'border-red-500',
                  };

                  return (
                    <div 
                      key={deal.id} 
                      className={`bg-slate-800 border-l-4 ${healthColors[deal.health]} rounded-lg p-4`}
                    >
                      <h3 className="font-semibold text-white mb-1">{deal.tenant}</h3>
                      <p className="text-sm text-slate-400 mb-2">{deal.property}</p>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-green-400">${deal.value.toLocaleString()}/yr</span>
                        <span className="text-slate-500">{deal.daysInactive}d ago</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ))}
      </div>

      {/* Stale Deals Alert */}
      {staleDeals.length > 0 && (
        <div className="mt-8 bg-red-900/20 border border-red-500 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-4">🚨 Stale Deals (14+ days inactive)</h3>
          <div className="space-y-2">
            {staleDeals.map(deal => (
              <div key={deal.id} className="flex justify-between items-center text-sm">
                <span className="text-white">{deal.tenant} - {deal.property}</span>
                <span className="text-red-400">{deal.daysInactive} days inactive</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
