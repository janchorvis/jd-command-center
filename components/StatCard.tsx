interface StatCardProps {
  label: string;
  value: number | string;
  emoji: string;
  color?: 'red' | 'yellow' | 'green' | 'blue';
  subtitle?: string;
}

export default function StatCard({ label, value, emoji, color = 'blue', subtitle }: StatCardProps) {
  const colorClasses = {
    red: 'border-red-500 bg-red-900/10',
    yellow: 'border-yellow-500 bg-yellow-900/10',
    green: 'border-green-500 bg-green-900/10',
    blue: 'border-blue-500 bg-blue-900/10',
  };

  return (
    <div className={`${colorClasses[color]} border-l-4 rounded-lg p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <span className="text-4xl">{emoji}</span>
      </div>
    </div>
  );
}
