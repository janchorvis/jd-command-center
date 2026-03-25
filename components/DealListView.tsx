'use client';

import { useState, useMemo } from 'react';
import DealListItem, { DealListItemData } from './DealListItem';

type Filter = 'all' | 'high' | 'reply' | 'stale';

const REPLY_KEYWORDS = ['waiting on', 'follow up', 'respond', 'reply', 'send'];

function isReplyNeeded(deal: DealListItemData): boolean {
  const stepLower = deal.nextStep.toLowerCase();
  const hasKeyword = REPLY_KEYWORDS.some(k => stepLower.includes(k));
  if (!hasKeyword) return false;

  const sorted = [...deal.timeline].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const last = sorted[0];
  if (!last) return false;
  return (
    !last.event.toLowerCase().includes('jacob delk') &&
    !last.event.toLowerCase().includes('from jacob') &&
    (last.type === 'email' || last.type === 'call')
  );
}

function getLastActivityMs(deal: DealListItemData): number {
  if (!deal.timeline || deal.timeline.length === 0) return 0;
  return Math.max(...deal.timeline.map(e => new Date(e.date).getTime()));
}

function getDaysAgo(deal: DealListItemData): number {
  const ms = getLastActivityMs(deal);
  if (!ms) return Infinity;
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
}

export default function DealListView({ deals }: { deals: DealListItemData[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const sorted = useMemo(() => {
    return [...deals].sort((a, b) => getLastActivityMs(b) - getLastActivityMs(a));
  }, [deals]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'high':
        return sorted.filter(d => d.priority === 'high');
      case 'reply':
        return sorted.filter(d => isReplyNeeded(d));
      case 'stale':
        return sorted.filter(d => getDaysAgo(d) >= 7);
      default:
        return sorted;
    }
  }, [sorted, filter]);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'high', label: 'High Priority' },
    { id: 'reply', label: 'Needs Reply' },
    { id: 'stale', label: 'Stale (7d+)' },
  ];

  return (
    <div>
      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap mb-4 px-4">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === f.id
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
            {f.id !== 'all' && (
              <span className="ml-1 opacity-60">
                {f.id === 'high' && `(${sorted.filter(d => d.priority === 'high').length})`}
                {f.id === 'reply' && `(${sorted.filter(d => isReplyNeeded(d)).length})`}
                {f.id === 'stale' && `(${sorted.filter(d => getDaysAgo(d) >= 7).length})`}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Deal list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-12">No deals match this filter.</p>
        ) : (
          filtered.map(deal => <DealListItem key={deal.id} deal={deal} />)
        )}
      </div>
    </div>
  );
}
