import { FunnelData } from '@/lib/hot-deals';

interface PipelineFunnelProps {
  funnel: FunnelData;
}

const stageColors: Record<string, string> = {
  'Contact Made': 'bg-blue-400',
  'Touring': 'bg-blue-300',
  'Obtain Financials': 'bg-cyan-400',
  'Trading Terms': 'bg-yellow-400',
  'LOI': 'bg-orange-400',
  'Lease Draft & Review': 'bg-green-400',
  'Stalled': 'bg-red-400',
};

const stageOrder = [
  'Contact Made',
  'Touring',
  'Obtain Financials',
  'Trading Terms',
  'LOI',
  'Lease Draft & Review',
  'Stalled',
];

export default function PipelineFunnel({ funnel }: PipelineFunnelProps) {
  const maxCount = Math.max(...Object.values(funnel), 1);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">📊 Pipeline Funnel</h2>
      <div className="space-y-3">
        {stageOrder.map(stage => {
          const count = funnel[stage] || 0;
          const widthPct = Math.max((count / maxCount) * 100, 8);
          const color = stageColors[stage] || 'bg-slate-500';

          return (
            <div key={stage} className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-36 shrink-0 text-right">{stage}</span>
              <div className="flex-1 h-7 bg-slate-900 rounded overflow-hidden">
                <div
                  className={`h-full ${color} rounded flex items-center justify-center transition-all`}
                  style={{ width: `${widthPct}%` }}
                >
                  <span className="text-xs font-bold text-slate-900">{count}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
