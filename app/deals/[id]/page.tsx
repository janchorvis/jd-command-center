import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHotDealsData, getDealById, PipelineDeal, SideDeal, TimelineEvent } from '@/lib/hot-deals';
import DealActions from './DealActions';

const typeIcons: Record<TimelineEvent['type'], string> = {
  email: '📧',
  call: '📞',
  meeting: '📅',
  milestone: '⭐',
  lead: '🎯',
  task: '✅',
};

const stageBadgeColors: Record<string, string> = {
  'LOI': 'bg-orange-900/30 text-orange-300',
  'Lease Draft & Review': 'bg-blue-900/30 text-blue-300',
  'Touring': 'bg-emerald-900/30 text-emerald-300',
  'Obtain Financials': 'bg-purple-900/30 text-purple-300',
  'Trading Terms': 'bg-cyan-900/30 text-cyan-300',
  'Contact Made': 'bg-slate-700 text-slate-300',
};

const priorityBadge: Record<string, string> = {
  high: 'bg-red-900/30 text-red-300',
  medium: 'bg-yellow-900/30 text-yellow-300',
  low: 'bg-slate-700 text-slate-300',
};

function isPipelineDeal(deal: PipelineDeal | SideDeal): deal is PipelineDeal {
  return 'stage' in deal && !('type' in deal);
}

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getHotDealsData();
  const deal = getDealById(data, id);

  if (!deal) notFound();

  const stage = isPipelineDeal(deal) ? deal.stage : deal.type;
  const stageColor = isPipelineDeal(deal)
    ? stageBadgeColors[deal.stage] || 'bg-slate-700 text-slate-300'
    : 'bg-emerald-900/30 text-emerald-300';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back */}
      <Link href="/" className="text-sm text-slate-400 hover:text-white transition mb-6 inline-block">
        ← Back to Command Center
      </Link>

      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{deal.name}</h1>
            <p className="text-slate-400">{deal.property}</p>
          </div>
          <div className="flex gap-2">
            <span className={`text-xs px-3 py-1 rounded-full ${stageColor}`}>{stage}</span>
            <span className={`text-xs px-3 py-1 rounded-full ${priorityBadge[deal.priority]}`}>
              {deal.priority} priority
            </span>
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-slate-900 rounded-lg p-4">
          <p className="text-sm text-slate-300 mb-2">{deal.status}</p>
          <p className="text-sm text-yellow-300 font-medium">→ {deal.nextStep}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline - takes 2 cols */}
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold mb-4">📅 Timeline</h2>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-700" />
            <div className="space-y-6">
              {deal.timeline.map((event, i) => (
                <div key={i} className="flex items-start gap-4 relative">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm z-10 shrink-0">
                    {typeIcons[event.type]}
                  </div>
                  <div className="pt-1">
                    <p className="text-sm text-white">{event.event}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(event.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">⚡ Quick Actions</h2>
            <DealActions actions={deal.actions} />
          </div>

          {/* Contacts */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">👥 Contacts</h2>
            <div className="space-y-2">
              {deal.contacts.map((contact, i) => (
                <div key={i} className="text-sm text-slate-300 bg-slate-900 rounded px-3 py-2">
                  {contact}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
