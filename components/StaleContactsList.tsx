import type { StaleContact } from '@/lib/hot-deals';

const URGENCY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-400',
  low: 'bg-slate-300',
};

interface StaleContactsListProps {
  contacts: StaleContact[];
}

export default function StaleContactsList({ contacts }: StaleContactsListProps) {
  // Sort most stale first
  const sorted = [...contacts].sort((a, b) => b.daysSinceContact - a.daysSinceContact);

  return (
    <div className="divide-y divide-slate-100">
      {sorted.map((contact, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5">
          <span
            className={`mt-1.5 flex-none block w-2 h-2 rounded-full ${URGENCY_DOT[contact.urgency] ?? 'bg-slate-300'}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-gray-900">{contact.name}</span>
              {contact.deal && (
                <span className="text-sm text-slate-400">{contact.deal}</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{contact.daysSinceContact} days since contact</p>
            {contact.lastAction && (
              <p className="text-xs text-slate-400 truncate">{contact.lastAction}</p>
            )}
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <p className="px-4 py-4 text-sm text-slate-400 text-center">No stale contacts.</p>
      )}
    </div>
  );
}
