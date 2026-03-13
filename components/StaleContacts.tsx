import { StaleContact } from '@/lib/hot-deals';

interface StaleContactsProps {
  contacts: StaleContact[];
}

const urgencyStyles: Record<string, { border: string; icon: string }> = {
  high: { border: 'border-red-500', icon: '⚠️' },
  medium: { border: 'border-yellow-500', icon: '📞' },
  low: { border: 'border-slate-600', icon: '📞' },
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
              className={`bg-slate-800 border-l-4 ${style.border} rounded-lg p-4`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-white text-sm">{contact.name}</h3>
                <span className="text-sm">{style.icon}</span>
              </div>
              <p className="text-xs text-slate-400 mb-2">{contact.deal}</p>
              <p className="text-xs text-slate-300 mb-1">{contact.lastAction}</p>
              <span className="text-xs text-slate-500">
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
