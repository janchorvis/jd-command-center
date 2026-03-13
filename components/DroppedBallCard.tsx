'use client';

import { DroppedBall } from '@/lib/hot-deals';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DroppedBallCardProps {
  deal: DroppedBall;
}

export default function DroppedBallCard({ deal }: DroppedBallCardProps) {
  return (
    <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border border-orange-700/50 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-semibold text-orange-200">{deal.name}</h3>
            <span className="text-xs text-slate-500 whitespace-nowrap ml-2">Last seen: {deal.lastSeen}</span>
          </div>
          <p className="text-sm text-slate-400 mb-2">{deal.property}</p>
          <p className="text-sm text-orange-300/80">{deal.note}</p>
        </div>
      </div>
    </div>
  );
}
