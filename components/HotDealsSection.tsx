import { Deal } from '@/lib/pipedrive';
import { SideDeal } from '@/lib/hot-deals';
import DealCard from '@/components/DealCard';
import SideDealCard from '@/components/SideDealCard';

interface HotDealsSectionProps {
  hotDeals: Deal[];
  sideDeals: SideDeal[];
}

export default function HotDealsSection({ hotDeals, sideDeals }: HotDealsSectionProps) {
  if (hotDeals.length === 0 && sideDeals.length === 0) return null;

  return (
    <div className="mb-8 bg-gradient-to-r from-orange-900/20 to-red-900/20 rounded-lg p-6 border border-orange-800/50">
      <h2 className="text-xl font-bold mb-6">🔥 Focus Deals</h2>

      {hotDeals.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Pipeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hotDeals.map(deal => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      )}

      {sideDeals.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Side Deals</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sideDeals.map(deal => (
              <SideDealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
