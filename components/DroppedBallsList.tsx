import type { DroppedBall } from '@/lib/hot-deals';

interface DroppedBallsListProps {
  items: DroppedBall[];
}

function parseLastSeen(lastSeen: string): Date {
  // Try to extract a date from "Week of M/D" or "Week of M/D/YY" format
  const match = lastSeen.match(/(\d+)\/(\d+)(?:\/(\d+))?/);
  if (match) {
    const month = parseInt(match[1]) - 1;
    const day = parseInt(match[2]);
    const year = match[3] ? parseInt(match[3]) + 2000 : new Date().getFullYear();
    return new Date(year, month, day);
  }
  return new Date(0);
}

export default function DroppedBallsList({ items }: DroppedBallsListProps) {
  // Sort oldest first (most dropped = most urgent)
  const sorted = [...items].sort(
    (a, b) => parseLastSeen(a.lastSeen).getTime() - parseLastSeen(b.lastSeen).getTime()
  );

  return (
    <div className="divide-y divide-slate-100">
      {sorted.map(item => (
        <div key={item.id} className="px-4 py-2.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-medium text-gray-900">{item.name}</span>
            {item.property && (
              <span className="text-sm text-slate-400">{item.property}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-400">Last seen: {item.lastSeen}</span>
          </div>
          {item.note && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{item.note}</p>
          )}
        </div>
      ))}
      {sorted.length === 0 && (
        <p className="px-4 py-4 text-sm text-slate-400 text-center">No dropped balls.</p>
      )}
    </div>
  );
}
