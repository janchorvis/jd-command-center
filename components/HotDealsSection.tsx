import { PipelineDeal, SideDeal, DroppedBall } from '@/lib/hot-deals';
import PipelineDealCard from '@/components/PipelineDealCard';
import SideDealCard from '@/components/SideDealCard';
import DroppedBallCard from '@/components/DroppedBallCard';

interface HotDealsSectionProps {
  pipelineDeals: PipelineDeal[];
  sideDeals: SideDeal[];
  droppedBalls: DroppedBall[];
  lastUpdated: string;
  sourceDoc: string;
}

export default function HotDealsSection({ pipelineDeals, sideDeals, droppedBalls, lastUpdated, sourceDoc }: HotDealsSectionProps) {
  if (pipelineDeals.length === 0 && sideDeals.length === 0 && droppedBalls.length === 0) return null;

  const formattedDate = new Date(lastUpdated).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="mb-8 bg-gradient-to-r from-orange-900/20 to-red-900/20 rounded-lg p-6 border border-orange-800/50">
      <h2 className="text-xl font-bold mb-6">🔥 Focus Deals</h2>

      {pipelineDeals.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Pipeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pipelineDeals.map(deal => (
              <PipelineDealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      )}

      {sideDeals.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Side Deals</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sideDeals.map(deal => (
              <SideDealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      )}

      {droppedBalls.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">⚠️ Dropped Balls</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {droppedBalls.map(deal => (
              <DroppedBallCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-500">
        <span>Last updated: {formattedDate}</span>
        <span>Source: {sourceDoc}</span>
      </div>
    </div>
  );
}
