'use client';

import Link from 'next/link';
import { SideDeal } from '@/lib/hot-deals';
import { ClockIcon } from '@heroicons/react/24/outline';

interface SideDealCardProps {
  deal: SideDeal;
}

const priorityDots = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-[#7a9a8a]',
};

const typeBadgeColors: Record<string, string> = {
  'Land/Development': 'bg-[#7a9a8a]/10 text-[#7a9a8a]',
  'For Lease': 'bg-[#7a9a8a]/10 text-[#7a9a8a]',
  'Tenant Rep': 'bg-[#7a9a8a]/10 text-[#7a9a8a]',
};

function daysAgo(isoDate: string): number {
  const diff = new Date().getTime() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export default function SideDealCard({ deal }: SideDealCardProps) {
  const days = daysAgo(deal.lastUpdate);

  return (
    <Link href={`/deals/${deal.id}`}>
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 hover:bg-slate-50 transition cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full inline-block ${priorityDots[deal.priority]}`} />
              <h3 className="font-semibold text-slate-900">{deal.name}</h3>
            </div>
            <p className="text-sm text-slate-500">{deal.property}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${typeBadgeColors[deal.type] || 'bg-[#7a9a8a]/10 text-[#7a9a8a]'}`}>
            {deal.type}
          </span>
        </div>

        <p className="text-sm text-slate-700 mb-2">{deal.status}</p>

        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-xs text-[#7a9a8a] font-medium mb-2">→ {deal.nextStep}</p>
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
