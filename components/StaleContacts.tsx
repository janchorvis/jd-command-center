import { StaleContact } from '@/lib/hot-deals';

interface StaleContactsProps {
  contacts: StaleContact[];
}

const urgencyStyles: Record<string, { dot: string; icon: string }> = {
  high: { dot: 'bg-red-500', icon: '⚠️' },
  medium: { dot: 'bg-yellow-500', icon: '📞' },
  low: { dot: 'bg-[#7a9a8a]', icon: '📞' },
};

export default function StaleContacts({ contacts }: StaleContactsProps) {
  if (contacts.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold mb-4">📞 Stale Contacts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {contacts.map(contact => {
          const style = urgencyStyles[contact.urgency] || urgencyStyles.low;
          return (
            <div
              key={contact.name}
              className="bg-white border border-slate-200 shadow-sm rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <h3 className="font-semibold text-slate-900 text-sm">{contact.name}</h3>
                </div>
                <span className="text-sm">{style.icon}</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">{contact.deal}</p>
              <p className="text-xs text-slate-700 mb-1">{contact.lastAction}</p>
              <span className="text-xs text-slate-400">
                {contact.daysSinceContact === 0
                  ? 'Today'
                  : contact.daysSinceContact === 1
                    ? '1 day ago'
                    : `${contact.daysSinceContact} days ago`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
