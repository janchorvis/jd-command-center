'use client';

import { ActionItem } from '@/lib/hot-deals';
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';

interface ActionItemsProps {
  items: ActionItem[];
}

export default function ActionItems({ items }: ActionItemsProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardDocumentListIcon className="w-5 h-5 text-[#7a9a8a]" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Action Items
        </h2>
        <span className="ml-auto text-xs text-slate-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-3 group cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300 bg-white text-[#7a9a8a] focus:ring-[#7a9a8a] shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 group-hover:text-[#7a9a8a] transition">
                {item.title}
              </p>
              {item.detail && (
                <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
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
