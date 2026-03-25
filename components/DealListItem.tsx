'use client';

import Link from 'next/link';

interface TimelineEvent {
  date: string;
  event: string;
  type: 'email' | 'call' | 'meeting' | 'milestone' | 'lead' | 'task';
}

export interface DealListItemData {
  id: string;
  name: string;
  property: string;
  status: string;
  stage?: string;
  nextStep: string;
  priority: 'high' | 'medium' | 'low';
  timeline: TimelineEvent[];
  dealType?: 'pipeline' | 'side';
}

function getDaysAgo(timeline: TimelineEvent[]): number | null {
  if (!timeline || timeline.length === 0) return null;
  const sorted = [...timeline].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const latest = new Date(sorted[0].date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function getLastTimelineEvent(timeline: TimelineEvent[]): TimelineEvent | null {
  if (!timeline || timeline.length === 0) return null;
  return [...timeline].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
}

function isReplyNeeded(nextStep: string, timeline: TimelineEvent[]): boolean {
  const keywords = ['waiting on', 'follow up', 'respond', 'reply', 'send'];
  const stepLower = nextStep.toLowerCase();
  const hasKeyword = keywords.some(k => stepLower.includes(k));
  if (!hasKeyword) return false;

  const last = getLastTimelineEvent(timeline);
  if (!last) return false;

  // Inbound = not from Jacob
  const isInbound =
    !last.event.toLowerCase().includes('jacob delk') &&
    !last.event.toLowerCase().includes('from jacob') &&
    (last.type === 'email' || last.type === 'call');

  return isInbound;
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-400',
  low: 'bg-green-500',
};

const STAGE_BADGE: Record<string, string> = {
  'Contact Made': 'bg-blue-100 text-blue-700',
  'Touring': 'bg-purple-100 text-purple-700',
  'Obtain Financials': 'bg-orange-100 text-orange-700',
  'Trading Terms': 'bg-orange-100 text-orange-700',
  'LOI': 'bg-yellow-100 text-yellow-700',
  'Lease Draft & Review': 'bg-green-100 text-green-700',
  'Lease Signed': 'bg-emerald-100 text-emerald-700',
  'Stalled': 'bg-gray-100 text-gray-500',
};

function stageBadgeClass(stage?: string): string {
  if (!stage) return 'bg-gray-100 text-gray-500';
  return STAGE_BADGE[stage] ?? 'bg-gray-100 text-gray-500';
}

export default function DealListItem({ deal }: { deal: DealListItemData }) {
  const daysAgo = getDaysAgo(deal.timeline);
  const needsReply = isReplyNeeded(deal.nextStep, deal.timeline);

  const daysLabel =
    daysAgo === null
      ? 'no activity'
      : daysAgo === 0
      ? 'today'
      : daysAgo === 1
      ? '1 day ago'
      : `${daysAgo}d ago`;

  const isStale = daysAgo !== null && daysAgo >= 7;

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      {/* Priority dot */}
      <div className="mt-1.5 flex-shrink-0">
        <span
          className={`block w-2.5 h-2.5 rounded-full ${PRIORITY_DOT[deal.priority] ?? 'bg-gray-300'}`}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-900 text-sm leading-snug truncate">
            {deal.name}
          </span>
          <span className="text-gray-400 text-sm font-normal">·</span>
          <span className="text-gray-500 text-sm truncate">{deal.property}</span>
          {needsReply && <span className="text-base leading-none">📬</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate leading-snug">{deal.status}</p>
      </div>

      {/* Right meta */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1 pt-0.5">
        <span
          className={`text-xs font-medium ${
            isStale ? 'text-red-500' : daysAgo === 0 ? 'text-green-600' : 'text-gray-400'
          }`}
        >
          {daysLabel}
        </span>
        {deal.stage && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${stageBadgeClass(
              deal.stage
            )}`}
          >
            {deal.stage}
          </span>
        )}
      </div>
    </Link>
  );
}
