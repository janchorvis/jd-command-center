import { WeeklyDiff as WeeklyDiffType } from '@/lib/hot-deals';

interface WeeklyDiffProps {
  diff: WeeklyDiffType;
}

export default function WeeklyDiff({ diff }: WeeklyDiffProps) {
  const columns = [
    { title: 'Advanced', items: diff.advanced, pillColor: 'bg-green-900/40 text-green-300 border-green-700/50' },
    { title: 'New Leads', items: diff.newLeads, pillColor: 'bg-blue-900/40 text-blue-300 border-blue-700/50' },
    { title: 'Stalled', items: diff.stalled, pillColor: 'bg-red-900/40 text-red-300 border-red-700/50' },
    { title: 'Completed', items: diff.completed, pillColor: 'bg-green-900/40 text-green-300 border-green-700/50', icon: '✅' },
  ];

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold mb-1">📈 Weekly Diff</h2>
      <p className="text-xs text-slate-500 mb-4">Week of {diff.weekOf}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(col => (
          <div key={col.title} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{col.title}</h3>
            <div className="flex flex-wrap gap-2">
              {col.items.map((item, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-1 rounded-full border ${col.pillColor}`}
                >
                  {col.icon ? `${col.icon} ` : ''}{item}
                </span>
              ))}
              {col.items.length === 0 && (
                <span className="text-xs text-slate-600">None this week</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
