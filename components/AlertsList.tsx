'use client';

import { useState } from 'react';
import type { CrossRefAlert } from '@/lib/hot-deals';

const SEVERITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-400',
  low: 'bg-slate-300',
};

type FilterLevel = 'all' | 'high' | 'medium' | 'low';

interface AlertsListProps {
  alerts: CrossRefAlert[];
}

export default function AlertsList({ alerts }: AlertsListProps) {
  const [filter, setFilter] = useState<FilterLevel>('all');

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter);

  const counts = {
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  };

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-2 px-4 py-2 border-b border-slate-100 overflow-x-auto">
        {(['all', 'high', 'medium', 'low'] as FilterLevel[]).map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={`flex-none text-xs px-3 py-1 rounded-full border transition-colors ${
              filter === level
                ? 'bg-[#7a9a8a] text-white border-[#7a9a8a]'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {level === 'all' ? `All (${alerts.length})` : `${level.charAt(0).toUpperCase() + level.slice(1)} (${counts[level]})`}
          </button>
        ))}
      </div>

      {/* Alert rows */}
      <div className="divide-y divide-slate-100">
        {filtered.map((alert, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
            <span
              className={`mt-1.5 flex-none block w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity] ?? 'bg-slate-300'}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium text-gray-900 truncate">{alert.deal}</span>
                {alert.propertyName && (
                  <span className="text-sm text-slate-400 truncate">{alert.propertyName}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">{alert.message}</p>
            </div>
            <span className="flex-none text-[10px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded whitespace-nowrap max-w-[120px] truncate">
              {alert.type}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-4 text-sm text-slate-400 text-center">No alerts at this level.</p>
        )}
      </div>
    </div>
  );
}
