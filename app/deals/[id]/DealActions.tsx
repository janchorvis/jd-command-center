'use client';

import { DealAction } from '@/lib/hot-deals';

interface DealActionsProps {
  actions: DealAction[];
}

const actionColors: Record<string, string> = {
  email: 'border border-[#7a9a8a] text-[#7a9a8a] hover:bg-[#7a9a8a] hover:text-white',
  call: 'border border-[#7a9a8a] text-[#7a9a8a] hover:bg-[#7a9a8a] hover:text-white',
  task: 'border border-[#7a9a8a] text-[#7a9a8a] hover:bg-[#7a9a8a] hover:text-white',
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
          className={`text-xs px-3 py-2 rounded-full transition cursor-pointer ${actionColors[action.type] || 'border border-slate-300 text-slate-600 hover:bg-slate-100'}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
