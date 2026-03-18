'use client';

import { useState } from 'react';

interface ReviewItem {
  id: string;
  text: string;
  detail?: string;
  completed: boolean;
  completedAt?: string;
  property?: string;
}

interface PropertyGroup {
  property: string;
  items: ReviewItem[];
}

interface PropertyReviewTodosData {
  generatedAt: string;
  source: string;
  byProperty: PropertyGroup[];
}

interface Props {
  data: PropertyReviewTodosData;
}

export default function PropertyReviewTodos({ data }: Props) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const totalItems = data.byProperty.reduce((sum, g) => sum + g.items.length, 0);
  const doneCount = data.byProperty.reduce(
    (sum, g) => sum + g.items.filter(i => i.completed || completed[i.id]).length,
    0
  );

  const toggleItem = async (id: string) => {
    const next = !completed[id];
    setCompleted(prev => ({ ...prev, [id]: next }));
    try {
      await fetch('/api/sweep/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed: next, source: 'property-review' }),
      });
    } catch {
      // optimistic — don't revert on error
    }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            📋 Annual Property Review — Action Items
          </h2>
          <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
            {doneCount}/{totalItems} done
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{data.source}</span>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs text-slate-400 hover:text-slate-600 transition"
          >
            {collapsed ? 'expand ↓' : 'collapse ↑'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-5">
          {data.byProperty.map((group) => {
            const groupDone = group.items.filter(i => i.completed || completed[i.id]).length;
            return (
              <div key={group.property}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    {group.property}
                  </h3>
                  {groupDone > 0 && (
                    <span className="text-xs text-[#7a9a8a]">{groupDone}/{group.items.length}</span>
                  )}
                </div>
                <div className="space-y-1.5 pl-1">
                  {group.items.map((item) => {
                    const done = item.completed || !!completed[item.id];
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-2.5 group cursor-pointer`}
                        onClick={() => toggleItem(item.id)}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                          done
                            ? 'bg-[#7a9a8a] border-[#7a9a8a]'
                            : 'border-slate-300 group-hover:border-[#7a9a8a]'
                        }`}>
                          {done && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className={`text-sm leading-snug ${done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {item.text}
                          </p>
                          {item.detail && !done && (
                            <p className="text-xs text-slate-400 mt-0.5">{item.detail}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
