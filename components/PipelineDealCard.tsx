'use client';

import { PipelineDeal } from '@/lib/hot-deals';

interface PipelineDealCardProps {
  deal: PipelineDeal;
}

const priorityColors = {
  high: 'border-red-500',
  medium: 'border-yellow-500',
  low: 'border-blue-500',
};

const stageBadgeColors: Record<string, string> = {
  'LOI': 'bg-orange-900/30 text-orange-300',
  'Lease Draft & Review': 'bg-blue-900/30 text-blue-300',
  'Touring': 'bg-emerald-900/30 text-emerald-300',
  'Obtain Financials': 'bg-purple-900/30 text-purple-300',
  'Trading Terms': 'bg-cyan-900/30 text-cyan-300',
  'Contact Made': 'bg-slate-700 text-slate-300',
};

export default function PipelineDealCard({ deal }: PipelineDealCardProps) {
  return (
    <div className={`bg-slate-800 border-l-4 ${priorityColors[deal.priority]} rounded-lg p-4 hover:bg-slate-750 transition`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">{deal.name}</h3>
          <p className="text-sm text-slate-400">{deal.property}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${stageBadgeColors[deal.stage] || 'bg-slate-700 text-slate-300'}`}>
          {deal.stage}
        </span>
      </div>

      <p className="text-sm text-slate-300 mb-2">{deal.status}</p>

      <div className="mt-3 pt-3 border-t border-slate-700">
        <p className="text-xs text-yellow-300 font-medium">→ {deal.nextStep}</p>
      </div>
    </div>
  );
}
