'use client';

import { ActionItem } from '@/lib/hot-deals';
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

interface ActionItemsProps {
  items: ActionItem[];
}

export default function ActionItems({ items }: ActionItemsProps) {
  if (!items || items.length === 0) return null;

  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardDocumentListIcon className="w-5 h-5 text-[#7a9a8a]" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Action Items
        </h2>
        <span className="ml-auto text-xs text-slate-400">
          {completedCount > 0
            ? `${completedCount}/${totalCount} done`
            : `${totalCount} item${totalCount !== 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-3 group cursor-pointer">
            {item.completed ? (
              <CheckCircleSolidIcon className="mt-0.5 w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 bg-white text-[#7a9a8a] focus:ring-[#7a9a8a] shrink-0"
                readOnly
              />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold transition ${
                item.completed
                  ? 'line-through text-slate-400'
                  : 'text-slate-800 group-hover:text-[#7a9a8a]'
              }`}>
                {item.title}
              </p>
              {item.detail && (
                <p className={`text-sm mt-0.5 line-clamp-2 ${
                  item.completed ? 'text-slate-300' : 'text-slate-500'
                }`}>
                  {item.detail}
                </p>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
