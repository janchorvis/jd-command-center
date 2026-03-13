'use client';

import { DealAction } from '@/lib/hot-deals';

interface DealActionsProps {
  actions: DealAction[];
}

const actionColors: Record<string, string> = {
  email: 'bg-blue-900/40 text-blue-300 hover:bg-blue-900/60',
  call: 'bg-green-900/40 text-green-300 hover:bg-green-900/60',
  task: 'bg-purple-900/40 text-purple-300 hover:bg-purple-900/60',
};

export default function DealActions({ actions }: DealActionsProps) {
  function handleAction(label: string) {
    alert(`Action logged: ${label}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => handleAction(action.label)}
          className={`text-xs px-3 py-2 rounded-full transition cursor-pointer ${actionColors[action.type] || 'bg-slate-700 text-slate-300'}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
