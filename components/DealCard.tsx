'use client';

import { Deal } from '@/lib/pipedrive';
import { ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DealCardProps {
  deal: Deal;
}

// Next action prompts based on stage and health
function getNextAction(deal: Deal): string {
  if (deal.health === 'stale') {
    return '🚨 Follow up ASAP - ' + (deal.daysInactive - 14) + ' days overdue';
  }

  const actionsByStage: Record<string, string> = {
    'Contact Made': '📞 Schedule property tour',
    'Touring': '📄 Request financials & business plan',
    'Obtain Financials': '💰 Review financials, prepare rent quote',
    'Trading Terms': '📝 Draft LOI or counter-proposal',
    'LOI': '📋 Send lease draft to attorney',
    'Lease Draft & Review': '✍️ Review redlines, schedule execution',
    'Stalled': '🔄 Re-engage or archive',
  };

  return actionsByStage[deal.stage] || '🔍 Update deal status';
}

export default function DealCard({ deal }: DealCardProps) {
  const healthColors = {
    active: 'border-green-500',
    watch: 'border-yellow-500',
    stale: 'border-red-500',
  };

  const healthBadges = {
    active: 'bg-green-900/30 text-green-300',
    watch: 'bg-yellow-900/30 text-yellow-300',
    stale: 'bg-red-900/30 text-red-300',
  };

  const nextAction = getNextAction(deal);
  const isUrgent = deal.health === 'stale' || deal.health === 'watch';

  return (
    <div 
      className={`bg-slate-800 border-l-4 ${healthColors[deal.health]} rounded-lg p-4 hover:bg-slate-750 transition cursor-pointer`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">{deal.tenant}</h3>
          <p className="text-sm text-slate-400">{deal.property}</p>
        </div>
        
        <span className={`text-xs px-2 py-1 rounded ${healthBadges[deal.health]}`}>
          {deal.health === 'active' ? '🟢' : deal.health === 'watch' ? '🟡' : '🔴'}
        </span>
      </div>

      <div className="flex justify-between items-center text-xs mb-3">
        <span className="text-green-400 font-medium">${deal.value.toLocaleString()}/yr</span>
        <span className="text-slate-500 flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          {deal.daysInactive}d ago
        </span>
      </div>

      {/* Next Action */}
      <div className={`mt-3 pt-3 border-t ${isUrgent ? 'border-red-800' : 'border-slate-700'}`}>
        <div className="flex items-start gap-2">
          {isUrgent && <ExclamationTriangleIcon className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
          <p className={`text-xs ${isUrgent ? 'text-red-300 font-medium' : 'text-slate-400'}`}>
            {nextAction}
          </p>
        </div>
      </div>
    </div>
  );
}
