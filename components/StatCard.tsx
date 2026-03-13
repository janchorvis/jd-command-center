interface StatCardProps {
  label: string;
  value: number | string;
  emoji: string;
  color?: 'red' | 'yellow' | 'green' | 'blue';
  subtitle?: string;
}

export default function StatCard({ label, value, emoji, color = 'blue', subtitle }: StatCardProps) {
  const dotColors = {
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
    green: 'bg-emerald-500',
    blue: 'bg-[#3b82f6]',
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full inline-block ${dotColors[color]}`} />
            <p className="text-sm text-slate-500">{label}</p>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <span className="text-4xl">{emoji}</span>
      </div>
    </div>
  );
}
