import { getHotDealsData, PipelineDeal, SideDeal, TimelineEvent } from '@/lib/hot-deals';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// ── Week helpers ──────────────────────────────────────────────────────────────

function getCurrentWeekRange(): { monday: Date; sunday: Date } {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon, …
  const daysToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + daysToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isInWeek(dateStr: string, monday: Date, sunday: Date): boolean {
  const d = parseDate(dateStr);
  return d >= monday && d <= sunday;
}

function formatShortDate(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDaysSince(dateStr: string): number {
  const d = parseDate(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getLatestTimelineDate(deal: PipelineDeal | SideDeal): string | null {
  if (!deal.timeline?.length) return null;
  return [...deal.timeline].sort((a, b) => b.date.localeCompare(a.date))[0].date;
}

function getEarliestTimelineDate(deal: PipelineDeal | SideDeal): string | null {
  if (!deal.timeline?.length) return null;
  return [...deal.timeline].sort((a, b) => a.date.localeCompare(b.date))[0].date;
}

// ── Display helpers ───────────────────────────────────────────────────────────

function getEventIcon(type: TimelineEvent['type']): string {
  const map: Record<TimelineEvent['type'], string> = {
    email: '📧',
    call: '📞',
    meeting: '🤝',
    milestone: '🎯',
    lead: '🌱',
    task: '✅',
  };
  return map[type] ?? '•';
}

function getStageLabel(deal: PipelineDeal | SideDeal): string {
  return 'stage' in deal ? (deal as PipelineDeal).stage : (deal as SideDeal).type;
}

function getStageColor(stage: string): string {
  const map: Record<string, string> = {
    'Contact Made':         'bg-slate-100 text-slate-700',
    'Touring':              'bg-blue-100 text-blue-700',
    'Obtain Financials':    'bg-purple-100 text-purple-700',
    'Trading Terms':        'bg-orange-100 text-orange-700',
    'LOI':                  'bg-yellow-100 text-yellow-800',
    'Lease Draft & Review': 'bg-green-100 text-green-700',
    'Lease Signed':         'bg-emerald-100 text-emerald-700',
    'Stalled':              'bg-red-100 text-red-700',
    // side deal types
    'Land/Development':     'bg-amber-100 text-amber-700',
    'For Lease':            'bg-sky-100 text-sky-700',
    'Tenant Rep':           'bg-violet-100 text-violet-700',
  };
  return map[stage] ?? 'bg-slate-100 text-slate-600';
}

function getPriorityDot(priority: string): string {
  const map: Record<string, string> = {
    high:   'bg-red-500',
    medium: 'bg-yellow-400',
    low:    'bg-slate-300',
  };
  return map[priority] ?? 'bg-slate-300';
}

const MICAH_KEYWORDS = ['micah', 'need input', 'decision', 'approve'];

function needsMicah(deal: PipelineDeal | SideDeal): boolean {
  const text = `${deal.nextStep} ${deal.status}`.toLowerCase();
  return MICAH_KEYWORDS.some(kw => text.includes(kw));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WeekPage() {
  const data = getHotDealsData();
  const allDeals: (PipelineDeal | SideDeal)[] = [...data.pipelineDeals, ...data.sideDeals];

  const { monday, sunday } = getCurrentWeekRange();
  const weekStart = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekEnd   = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // ── Classify deals ──────────────────────────────────────────────────────────
  type ActiveEntry = { deal: PipelineDeal | SideDeal; weekEvents: TimelineEvent[] };
  type StaleEntry  = { deal: PipelineDeal | SideDeal; daysSince: number };

  const activeDeals: ActiveEntry[] = [];
  const staleDeals:  StaleEntry[]  = [];

  for (const deal of allDeals) {
    const weekEvents = (deal.timeline ?? []).filter(e => isInWeek(e.date, monday, sunday));
    if (weekEvents.length > 0) {
      activeDeals.push({ deal, weekEvents });
    } else if (deal.priority === 'high' || deal.priority === 'medium') {
      const latest = getLatestTimelineDate(deal);
      staleDeals.push({ deal, daysSince: latest ? getDaysSince(latest) : 999 });
    }
  }

  activeDeals.sort((a, b) => b.weekEvents.length - a.weekEvents.length);
  staleDeals.sort((a, b) => b.daysSince - a.daysSince);

  // New leads: the very first timeline event for this deal is within this week
  const newLeads = allDeals.filter(deal => {
    const earliest = getEarliestTimelineDate(deal);
    return earliest ? isInWeek(earliest, monday, sunday) : false;
  });

  const micahCount = activeDeals.filter(({ deal }) => needsMicah(deal)).length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">

      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">This Week</h1>
        <p className="text-slate-500 text-sm mt-1">{weekStart} – {weekEnd}</p>
      </div>

      {/* ── Summary bar ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 mb-8 text-sm text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
        <span><strong className="text-slate-900">{activeDeals.length}</strong> deals with activity</span>
        <span className="text-slate-300">·</span>
        <span><strong className="text-slate-900">{newLeads.length}</strong> new leads</span>
        <span className="text-slate-300">·</span>
        <span>
          <strong className="text-yellow-700">{micahCount}</strong>{' '}
          {micahCount === 1 ? 'item needs' : 'items need'} Micah&apos;s input
        </span>
      </div>

      {/* ── Active deal cards ── */}
      <div className="space-y-4 mb-10">
        {activeDeals.length === 0 && (
          <p className="text-slate-400 text-sm text-center py-10">No deal activity this week yet.</p>
        )}

        {activeDeals.map(({ deal, weekEvents }) => {
          const hasMicah = needsMicah(deal);
          const stage    = getStageLabel(deal);

          return (
            <Link
              key={deal.id}
              href={`/deals/${deal.id}`}
              className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-[#7a9a8a] hover:shadow-sm transition-all"
            >
              {/* Deal name row */}
              <div className="flex items-start justify-between gap-3 mb-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${getPriorityDot(deal.priority)}`}
                  />
                  <h2 className="text-base font-semibold text-slate-900">{deal.name}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStageColor(stage)}`}>
                    {stage}
                  </span>
                </div>

                {hasMicah && (
                  <span className="flex-shrink-0 text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300 px-2.5 py-1 rounded-full whitespace-nowrap">
                    🟡 Needs Micah
                  </span>
                )}
              </div>

              {/* Property */}
              <p className="text-xs text-slate-400 mb-3 pl-5">{deal.property}</p>

              {/* This week's events */}
              <div className="space-y-1.5 mb-3">
                {[...weekEvents]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((ev, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-xs text-slate-400 w-14 flex-shrink-0 pt-0.5">
                        {formatShortDate(ev.date)}
                      </span>
                      <span className="flex-shrink-0 leading-tight">{getEventIcon(ev.type)}</span>
                      <span className="text-slate-600 leading-snug">{ev.event}</span>
                    </div>
                  ))}
              </div>

              {/* Status */}
              <p className="text-sm text-slate-500 border-t border-slate-100 pt-2.5 mb-2.5">
                {deal.status}
              </p>

              {/* Next step */}
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-white bg-[#7a9a8a] px-2 py-0.5 rounded flex-shrink-0">
                  Next
                </span>
                <p className="text-sm text-[#4d7060] font-medium leading-snug">{deal.nextStep}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── New Leads ── */}
      {newLeads.length > 0 && (
        <div className="mb-10">
          <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
            🌱 New Leads
            <span className="text-sm font-normal text-slate-400">({newLeads.length})</span>
          </h2>
          <div className="space-y-2">
            {newLeads.map(deal => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-[#7a9a8a] hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{deal.name}</span>
                  <span className="text-xs text-slate-400">{deal.property}</span>
                </div>
                <span className="text-xs text-slate-400">entered pipeline this week</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Stale / No Activity ── */}
      {staleDeals.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer flex items-center gap-2 text-base font-semibold text-slate-600 select-none list-none mb-1">
            <span className="inline-block transition-transform group-open:rotate-90 text-slate-400 text-xs">▶</span>
            😴 No Activity This Week
            <span className="text-sm font-normal text-slate-400">
              ({staleDeals.length} high/medium priority)
            </span>
          </summary>
          <div className="mt-3 space-y-2">
            {staleDeals.map(({ deal, daysSince }) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-slate-300 transition-all"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getPriorityDot(deal.priority)}`} />
                  <span className="text-sm font-medium text-slate-700">{deal.name}</span>
                  <span className="text-xs text-slate-400">{deal.property}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {daysSince === 999 ? 'no activity on record' : `${daysSince}d since last activity`}
                </span>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
