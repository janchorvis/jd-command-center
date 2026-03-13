'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MorningSweep as MorningSweepType, SweepItem } from '@/lib/hot-deals';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import {
  SunIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

type Lane = 'yourPlate' | 'prepping' | 'handling' | 'deferred';

interface MorningSweepProps {
  sweep: MorningSweepType;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// --- Action Menu ---

function ActionMenu({
  item,
  currentLane,
  onMove,
  onComplete,
  onClose,
}: {
  item: SweepItem;
  currentLane: Lane;
  onMove: (itemId: string, toLane: Lane, detail?: string) => void;
  onComplete: (itemId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState(item.detail || '');

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const moveTargets: { lane: Lane; label: string }[] = [];
  if (currentLane !== 'yourPlate') moveTargets.push({ lane: 'yourPlate', label: 'Your Plate' });
  if (currentLane !== 'deferred') moveTargets.push({ lane: 'deferred', label: 'Deferred' });

  function handleMove(toLane: Lane) {
    const newDetail = detail !== (item.detail || '') ? detail : undefined;
    onMove(item.id, toLane, newDetail);
    onClose();
  }

  function handleComplete() {
    onComplete(item.id);
    onClose();
  }

  function handleDetailSave() {
    if (detail !== (item.detail || '')) {
      // Move to same lane = just update detail
      onMove(item.id, currentLane, detail);
    }
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-64 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {/* Move buttons */}
      <div className="space-y-1 mb-2">
        {moveTargets.map(({ lane, label }) => (
          <button
            key={lane}
            onClick={() => handleMove(lane)}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-[#7a9a8a] rounded transition cursor-pointer"
          >
            <ArrowRightIcon className="w-3.5 h-3.5" />
            Move to {label}
          </button>
        ))}
        {!item.completed && (
          <button
            onClick={handleComplete}
            className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-[#7a9a8a] rounded transition cursor-pointer"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            Mark Complete
          </button>
        )}
      </div>

      {/* Detail input */}
      <div className="border-t border-slate-100 pt-2">
        <label className="text-xs text-slate-400 mb-1 block">Note</label>
        <input
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleDetailSave();
          }}
          placeholder="Add a note…"
          className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-[#7a9a8a] text-slate-700 placeholder:text-slate-300"
        />
        {detail !== (item.detail || '') && (
          <button
            onClick={handleDetailSave}
            className="mt-1.5 text-xs font-medium text-[#7a9a8a] hover:text-[#5f7f6f] transition cursor-pointer"
          >
            Save note
          </button>
        )}
      </div>
    </div>
  );
}

// --- Sweep Items ---

function SweepCheckbox({
  item,
  index,
  onComplete,
  onItemClick,
}: {
  item: SweepItem;
  index: number;
  onComplete: (id: string) => void;
  onItemClick: (id: string) => void;
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
          onClick={() => onItemClick(item.id)}
          className={`text-sm font-semibold transition cursor-pointer ${
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

function PreppingItem({
  item,
  onItemClick,
}: {
  item: SweepItem;
  onItemClick: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      {item.completed ? (
        <CheckCircleSolidIcon className="mt-0.5 w-4 h-4 text-[#7a9a8a] shrink-0" />
      ) : (
        <span className="mt-1 w-2 h-2 rounded-full bg-[#7a9a8a] animate-pulse shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p
          onClick={() => onItemClick(item.id)}
          className={`text-sm cursor-pointer ${
            item.completed ? 'line-through text-slate-400' : 'text-slate-700 hover:text-[#7a9a8a]'
          } transition`}
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
  laneName,
  onItemClick,
  activeMenuId,
  onMove,
  onComplete,
  onCloseMenu,
}: {
  title: string;
  items: SweepItem[];
  laneName: Lane;
  onItemClick: (id: string) => void;
  activeMenuId: string | null;
  onMove: (itemId: string, toLane: Lane, detail?: string) => void;
  onComplete: (id: string) => void;
  onCloseMenu: () => void;
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
            <div key={item.id} className="flex items-start gap-2 relative">
              {item.completed ? (
                <CheckCircleSolidIcon className="mt-0.5 w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0 relative">
                <p
                  onClick={() => onItemClick(item.id)}
                  className={`text-xs cursor-pointer transition ${
                    item.completed
                      ? 'line-through text-slate-400'
                      : 'text-slate-500 hover:text-[#7a9a8a]'
                  }`}
                >
                  {item.text}
                </p>
                {item.detail && (
                  <p className="text-xs text-slate-400">{item.detail}</p>
                )}
                {activeMenuId === item.id && (
                  <ActionMenu
                    item={item}
                    currentLane={laneName}
                    onMove={onMove}
                    onComplete={onComplete}
                    onClose={onCloseMenu}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

const STORAGE_KEY = 'jd-sweep-state';

function loadSweepFromStorage(serverGeneratedAt: string): MorningSweepType | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as MorningSweepType;
    if (stored.generatedAt === serverGeneratedAt) return stored;
    // Stale (different day's sweep) — clear it
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable or corrupt
  }
  return null;
}

function saveSweepToStorage(sweep: MorningSweepType): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sweep));
  } catch {
    // quota exceeded or unavailable — silent fail
  }
}

export default function MorningSweep({ sweep }: MorningSweepProps) {
  const [data, setData] = useState(sweep);
  const [mounted, setMounted] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // After hydration, check localStorage for persisted state
  useEffect(() => {
    const stored = loadSweepFromStorage(sweep.generatedAt);
    if (stored) {
      setData(stored);
    }
    setMounted(true);
  }, [sweep.generatedAt]);

  // Persist to localStorage on every user-driven mutation (after mount)
  useEffect(() => {
    if (!mounted) return;
    saveSweepToStorage(data);
  }, [data, mounted]);

  const allItems = [
    ...data.yourPlate,
    ...data.prepping,
    ...data.handling,
    ...data.deferred,
  ];
  const totalCount = allItems.length;
  const completedCount = allItems.filter((i) => i.completed).length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  function handleItemClick(itemId: string) {
    setActiveMenuId((prev) => (prev === itemId ? null : itemId));
  }

  const handleCloseMenu = useCallback(() => {
    setActiveMenuId(null);
  }, []);

  async function handleComplete(itemId: string) {
    setActiveMenuId(null);
    // Find which lane the item is in before the optimistic update
    const itemLane = getLaneForItem(itemId);

    // Optimistic update — find item across all lanes
    setData((prev) => {
      const lanes: Lane[] = ['yourPlate', 'prepping', 'handling', 'deferred'];
      const next = { ...prev };
      for (const lane of lanes) {
        next[lane] = prev[lane].map((item) =>
          item.id === itemId
            ? {
                ...item,
                completed: true,
                completedAt: new Date().toISOString(),
                completedBy: 'manual',
              }
            : item
        );
      }
      return next;
    });

    try {
      await fetch('/api/sweep/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, lane: itemLane || 'yourPlate' }),
      });
    } catch {
      // Silent fail - optimistic update stays
    }
  }

  async function handleMove(itemId: string, toLane: Lane, detail?: string) {
    // Optimistic update
    setData((prev) => {
      const lanes: Lane[] = ['yourPlate', 'prepping', 'handling', 'deferred'];
      let movedItem: SweepItem | null = null;
      const next = { ...prev };

      // Remove from current lane
      for (const lane of lanes) {
        const idx = prev[lane].findIndex((i) => i.id === itemId);
        if (idx !== -1) {
          movedItem = { ...prev[lane][idx] };
          next[lane] = prev[lane].filter((_, i) => i !== idx);
          break;
        }
      }

      if (!movedItem) return prev;

      // Update detail if provided
      if (detail !== undefined) {
        movedItem.detail = detail;
      }

      // Add to target lane
      next[toLane] = [...next[toLane], movedItem];

      return next;
    });

    try {
      await fetch('/api/sweep/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, toLane, detail }),
      });
    } catch {
      // Silent fail - optimistic update stays
    }
  }

  // Find which lane an item belongs to
  function getLaneForItem(itemId: string): Lane | null {
    const lanes: Lane[] = ['yourPlate', 'prepping', 'handling', 'deferred'];
    for (const lane of lanes) {
      if (data[lane].some((i) => i.id === itemId)) return lane;
    }
    return null;
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
            <div key={item.id} className="relative">
              <SweepCheckbox
                item={item}
                index={i}
                onComplete={handleComplete}
                onItemClick={handleItemClick}
              />
              {activeMenuId === item.id && (
                <div className="relative ml-8">
                  <ActionMenu
                    item={item}
                    currentLane="yourPlate"
                    onMove={handleMove}
                    onComplete={handleComplete}
                    onClose={handleCloseMenu}
                  />
                </div>
              )}
            </div>
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
            <div key={item.id} className="relative">
              <PreppingItem
                item={item}
                onItemClick={handleItemClick}
              />
              {activeMenuId === item.id && (
                <div className="relative ml-8">
                  <ActionMenu
                    item={item}
                    currentLane="prepping"
                    onMove={handleMove}
                    onComplete={handleComplete}
                    onClose={handleCloseMenu}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* HANDLING + DEFERRED — collapsed */}
      <div className="space-y-3 pt-3 border-t border-slate-100">
        <CollapsibleLane
          title="Jarvis Handling"
          items={data.handling}
          laneName="handling"
          onItemClick={handleItemClick}
          activeMenuId={activeMenuId}
          onMove={handleMove}
          onComplete={handleComplete}
          onCloseMenu={handleCloseMenu}
        />
        <CollapsibleLane
          title="Deferred / Waiting"
          items={data.deferred}
          laneName="deferred"
          onItemClick={handleItemClick}
          activeMenuId={activeMenuId}
          onMove={handleMove}
          onComplete={handleComplete}
          onCloseMenu={handleCloseMenu}
        />
      </div>
    </div>
  );
}
