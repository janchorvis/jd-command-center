'use client';

import { useState } from 'react';
import { MorningSweep as MorningSweepType, SweepItem } from '@/lib/hot-deals';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import {
  SunIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

interface MorningSweepProps {
  sweep: MorningSweepType;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function SweepCheckbox({
  item,
  index,
  onComplete,
}: {
  item: SweepItem;
  index: number;
  onComplete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 group">
      {item.completed ? (
        <CheckCircleSolidIcon className="mt-0.5 w-5 h-5 text-[#7a9a8a] shrink-0" />
      ) : (
        <button
          onClick={() => onComplete(item.id)}
          className="mt-0.5 w-5 h-5 rounded border-2 border-slate-300 bg-white shrink-0 hover:border-[#7a9a8a] transition cursor-pointer"
          aria-label={`Complete: ${item.text}`}
        />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold transition ${
            item.completed
              ? 'line-through text-slate-400'
              : 'text-slate-800 group-hover:text-[#7a9a8a]'
          }`}
        >
          <span className="text-slate-400 font-normal mr-1.5">{index + 1}.</span>
          {item.text}
        </p>
        {item.detail && (
          <p
            className={`text-xs mt-0.5 ${
              item.completed ? 'text-slate-300 line-through' : 'text-slate-500'
            }`}
          >
            {item.detail}
          </p>
        )}
        {item.completed && item.completedAt && (
          <p className="text-xs text-[#7a9a8a] mt-0.5">
            Done {formatTime(item.completedAt)}
            {item.completedBy && item.completedBy !== 'manual' && ` via ${item.completedBy}`}
          </p>
        )}
      </div>
    </div>
  );
}

function PreppingItem({ item }: { item: SweepItem }) {
  return (
    <div className="flex items-start gap-3">
      {item.completed ? (
        <CheckCircleSolidIcon className="mt-0.5 w-4 h-4 text-[#7a9a8a] shrink-0" />
      ) : (
        <span className="mt-1 w-2 h-2 rounded-full bg-[#7a9a8a] animate-pulse shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${
            item.completed ? 'line-through text-slate-400' : 'text-slate-700'
          }`}
        >
          {item.text}
        </p>
        {item.detail && (
          <p
            className={`text-xs mt-0.5 ${
              item.completed ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            {item.detail}
          </p>
        )}
      </div>
    </div>
  );
}

function CollapsibleLane({
  title,
  items,
}: {
  title: string;
  items: SweepItem[];
}) {
  const [open, setOpen] = useState(false);
  const completed = items.filter((i) => i.completed).length;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        {open ? (
          <ChevronDownIcon className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-slate-400" />
        )}
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-xs text-slate-400 ml-auto">
          {completed}/{items.length}
        </span>
      </button>
      {open && (
        <div className="mt-2 ml-6 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              {item.completed ? (
                <CheckCircleSolidIcon className="mt-0.5 w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
              )}
              <div>
                <p
                  className={`text-xs ${
                    item.completed
                      ? 'line-through text-slate-400'
                      : 'text-slate-500'
                  }`}
                >
                  {item.text}
                </p>
                {item.detail && (
                  <p className="text-xs text-slate-400">{item.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MorningSweep({ sweep }: MorningSweepProps) {
  const [data, setData] = useState(sweep);

  const allItems = [
    ...data.yourPlate,
    ...data.prepping,
    ...data.handling,
    ...data.deferred,
  ];
  const totalCount = allItems.length;
  const completedCount = allItems.filter((i) => i.completed).length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  async function handleComplete(itemId: string) {
    // Optimistic update
    setData((prev) => ({
      ...prev,
      yourPlate: prev.yourPlate.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed: true,
              completedAt: new Date().toISOString(),
              completedBy: 'manual',
            }
          : item
      ),
    }));

    try {
      await fetch('/api/sweep/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, lane: 'yourPlate' }),
      });
    } catch {
      // Silent fail - optimistic update stays
    }
  }

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <SunIcon className="w-5 h-5 text-[#7a9a8a]" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Morning Sweep
        </h2>
        <span className="ml-auto text-xs text-slate-400">
          Updated {formatTime(data.generatedAt)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#7a9a8a] rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-slate-500 shrink-0">
          {completedCount} of {totalCount}
        </span>
      </div>

      {/* YOUR PLATE */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7a9a8a]" />
          Your Plate
          <span className="text-slate-400 font-normal normal-case tracking-normal">
            — {data.yourPlate.filter((i) => !i.completed).length} remaining
          </span>
        </h3>
        <div className="space-y-3">
          {data.yourPlate.map((item, i) => (
            <SweepCheckbox
              key={item.id}
              item={item}
              index={i}
              onComplete={handleComplete}
            />
          ))}
        </div>
      </div>

      {/* PREPPING */}
      <div className="mb-5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7a9a8a] animate-pulse" />
          Jarvis Prepping
        </h3>
        <div className="space-y-2">
          {data.prepping.map((item) => (
            <PreppingItem key={item.id} item={item} />
          ))}
        </div>
      </div>

      {/* HANDLING + DEFERRED — collapsed */}
      <div className="space-y-3 pt-3 border-t border-slate-100">
        <CollapsibleLane title="Jarvis Handling" items={data.handling} />
        <CollapsibleLane title="Deferred / Waiting" items={data.deferred} />
      </div>
    </div>
  );
}
