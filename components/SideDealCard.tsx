'use client';

import Link from 'next/link';
import { SideDeal } from '@/lib/hot-deals';
import { ClockIcon } from '@heroicons/react/24/outline';

interface SideDealCardProps {
  deal: SideDeal;
}

const priorityColors = {
  high: 'border-red-500',
  medium: 'border-yellow-500',
  low: 'border-blue-500',
};

const typeBadgeColors: Record<string, string> = {
  'Land/Development': 'bg-purple-900/30 text-purple-300',
  'For Lease': 'bg-blue-900/30 text-blue-300',
  'Tenant Rep': 'bg-emerald-900/30 text-emerald-300',
};

function daysAgo(isoDate: string): number {
  const diff = new Date().getTime() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function SideDealCard({ deal }: SideDealCardProps) {
  const days = daysAgo(deal.lastUpdate);

  return (
    <Link href={`/deals/${deal.id}`}>
      <div className={`bg-slate-800 border-l-4 ${priorityColors[deal.priority]} rounded-lg p-4 hover:bg-slate-750 transition cursor-pointer`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="font-semibold text-white mb-1">{deal.name}</h3>
            <p className="text-sm text-slate-400">{deal.property}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${typeBadgeColors[deal.type] || 'bg-slate-700 text-slate-300'}`}>
            {deal.type}
          </span>
        </div>

        <p className="text-sm text-slate-300 mb-2">{deal.status}</p>

        <div className="mt-3 pt-3 border-t border-slate-700">
          <p className="text-xs text-yellow-300 font-medium mb-2">→ {deal.nextStep}</p>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{deal.contacts.join(', ')}</span>
            <span className="flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              {days === 0 ? 'Today' : `${days}d ago`}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
