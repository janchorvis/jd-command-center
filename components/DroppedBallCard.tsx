'use client';

import { DroppedBall } from '@/lib/hot-deals';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DroppedBallCardProps {
  deal: DroppedBall;
}

export default function DroppedBallCard({ deal }: DroppedBallCardProps) {
  return (
    <div className="bg-red-50 border border-red-200 shadow-sm rounded-xl p-4">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-semibold text-red-700">{deal.name}</h3>
            <span className="text-xs text-slate-500 whitespace-nowrap ml-2">Last seen: {deal.lastSeen}</span>
          </div>
          <p className="text-sm text-slate-500 mb-2">{deal.property}</p>
          <p className="text-sm text-red-600">{deal.note}</p>
        </div>
      </div>
    </div>
  );
}
