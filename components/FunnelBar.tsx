import type { FunnelData } from '@/lib/hot-deals';

const STAGES = [
  { key: 'Contact Made', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'Touring', color: 'bg-blue-200 text-blue-800 border-blue-300' },
  { key: 'Obtain Financials', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'Trading Terms', color: 'bg-amber-200 text-amber-800 border-amber-300' },
  { key: 'LOI', color: 'bg-amber-300 text-amber-900 border-amber-400' },
  { key: 'Lease Draft & Review', color: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'Lease Signed', color: 'bg-green-200 text-green-800 border-green-300' },
];

interface FunnelBarProps {
  funnel: FunnelData;
}

export default function FunnelBar({ funnel }: FunnelBarProps) {
  const stalled = funnel['Stalled'] ?? 0;

  return (
    <div className="px-4 py-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline Funnel</span>
        {stalled > 0 && (
          <span className="text-xs text-slate-400">{stalled} stalled</span>
        )}
      </div>
      {/* Mobile: horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {STAGES.map(({ key, color }) => {
          const count = funnel[key] ?? 0;
          return (
            <div
              key={key}
              className={`flex-none border rounded-md px-3 py-2 text-center min-w-[90px] ${color}`}
            >
              <div className="text-lg font-bold leading-none">{count}</div>
              <div className="text-[10px] mt-1 leading-tight opacity-80 whitespace-nowrap">{key}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
