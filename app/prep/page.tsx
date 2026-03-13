import { getHotDealsData } from '@/lib/hot-deals';

export default function PrepPage() {
  const data = getHotDealsData();
  const formattedDate = new Date(data.lastUpdated).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold mb-1">📋 Monday Meeting Prep</h1>
      <p className="text-sm text-slate-400 mb-8">Source: {data.sourceDoc}</p>

      {/* Hot Deals */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-orange-300">🔥 Pipeline Deals</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs">
                <th className="text-left p-3">Deal</th>
                <th className="text-left p-3 hidden sm:table-cell">Property</th>
                <th className="text-left p-3">Stage</th>
                <th className="text-left p-3 hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.pipelineDeals.map(deal => (
                <tr key={deal.id} className="border-b border-slate-700/50 hover:bg-slate-750">
                  <td className="p-3 text-white font-medium">{deal.name}</td>
                  <td className="p-3 text-slate-400 hidden sm:table-cell">{deal.property}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{deal.stage}</span>
                  </td>
                  <td className="p-3 text-slate-300 text-xs hidden md:table-cell">{deal.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Side Deals */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-blue-300">🤝 Side Deals</h2>
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs">
                <th className="text-left p-3">Deal</th>
                <th className="text-left p-3 hidden sm:table-cell">Property</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3 hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.sideDeals.map(deal => (
                <tr key={deal.id} className="border-b border-slate-700/50 hover:bg-slate-750">
                  <td className="p-3 text-white font-medium">{deal.name}</td>
                  <td className="p-3 text-slate-400 hidden sm:table-cell">{deal.property}</td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{deal.type}</span>
                  </td>
                  <td className="p-3 text-slate-300 text-xs hidden md:table-cell">{deal.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dropped Balls */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3 text-red-300">⚠️ Dropped Balls</h2>
        <div className="space-y-2">
          {data.droppedBalls.map(ball => (
            <div key={ball.id} className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <span className="font-medium text-white">{ball.name}</span>
                <span className="text-slate-400 text-sm"> — {ball.property}</span>
                <p className="text-sm text-red-300/80 mt-1">{ball.note}</p>
                <p className="text-xs text-slate-500 mt-1">Last seen: {ball.lastSeen}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly Diff Summary */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">📈 Weekly Diff (Week of {data.weeklyDiff.weekOf})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-300 mb-2">Advanced</h3>
            <ul className="space-y-1">
              {data.weeklyDiff.advanced.map((item, i) => (
                <li key={i} className="text-xs text-slate-300">• {item}</li>
              ))}
            </ul>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">New Leads</h3>
            <ul className="space-y-1">
              {data.weeklyDiff.newLeads.map((item, i) => (
                <li key={i} className="text-xs text-slate-300">• {item}</li>
              ))}
            </ul>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-300 mb-2">Stalled</h3>
            <ul className="space-y-1">
              {data.weeklyDiff.stalled.map((item, i) => (
                <li key={i} className="text-xs text-slate-300">• {item}</li>
              ))}
            </ul>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-300 mb-2">Completed</h3>
            <ul className="space-y-1">
              {data.weeklyDiff.completed.map((item, i) => (
                <li key={i} className="text-xs text-slate-300">✅ {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="text-xs text-slate-500 pt-4 border-t border-slate-700">
        Last updated: {formattedDate}
      </div>
    </div>
  );
}
