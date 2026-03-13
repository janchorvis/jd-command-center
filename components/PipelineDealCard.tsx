'use client';

import Link from 'next/link';
import { PipelineDeal } from '@/lib/hot-deals';

interface PipelineDealCardProps {
  deal: PipelineDeal;
}

const priorityDots = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-[#7a9a8a]',
};

export default function PipelineDealCard({ deal }: PipelineDealCardProps) {
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
          <span className="text-xs px-2 py-1 rounded whitespace-nowrap bg-[#7a9a8a]/10 text-[#7a9a8a]">
            {deal.stage}
          </span>
        </div>

        <p className="text-sm text-slate-700 mb-2">{deal.status}</p>

        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-xs text-[#7a9a8a] font-medium">→ {deal.nextStep}</p>
        </div>
      </div>
    </Link>
  );
}
