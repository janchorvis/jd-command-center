'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

interface Task {
  id: string;
  text: string;
  tags: Record<string, string>;
  waitingOn: string | null;
  hasWarning: boolean;
  age: number | null;
  completed: string | null;
  isKilled: boolean;
}

interface TasksData {
  thisWeek: Task[];
  nextWeek: Task[];
  thisMonth: Task[];
  waiting: Task[];
  watching: Task[];
  completed: Task[];
  counts: {
    active: number;
    waiting: number;
    watching: number;
    doneThisWeek: number;
  };
}

const LS_KEY = 'jarvis-tasks-completed';

function getLocalCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveLocalCompleted(ids: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
}

function AgeTag({ age }: { age: number | null }) {
  if (age === null) return null;
  const isOld = age > 7;
  return (
    <span
      className={`text-xs font-mono shrink-0 ${
        isOld ? 'text-red-500 font-semibold' : 'text-slate-400'
      }`}
    >
      {age}d
    </span>
  );
}

function TaskRow({
  task,
  showWaiting = false,
  showCompleted = false,
  isChecked = false,
  onToggle,
  syncing = false,
}: {
  task: Task;
  showWaiting?: boolean;
  showCompleted?: boolean;
  isChecked?: boolean;
  onToggle?: (taskId: string) => void;
  syncing?: boolean;
}) {
  const isStrike = showCompleted && !task.isKilled;
  const isKilledStyle = task.isKilled;
  const isInteractive = !showCompleted && !!onToggle;
  const visuallyDone = isChecked && !showCompleted;

  return (
    <div
      className={`flex items-start gap-3 py-3 border-b border-slate-100 last:border-0 transition-opacity duration-300 ${
        visuallyDone ? 'opacity-50' : ''
      }`}
    >
      {/* Checkbox or ID badge */}
      {isInteractive ? (
        <button
          onClick={() => onToggle(task.id)}
          disabled={isChecked}
          className="mt-0.5 shrink-0 cursor-pointer disabled:cursor-default"
          aria-label={`Complete ${task.id}`}
        >
          {isChecked ? (
            <CheckCircleSolidIcon
              className={`w-5 h-5 ${syncing ? 'text-amber-400 animate-pulse' : 'text-[#7a9a8a]'}`}
            />
          ) : (
            <CheckCircleIcon className="w-5 h-5 text-slate-300 hover:text-[#7a9a8a] transition-colors" />
          )}
        </button>
      ) : (
        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
          {task.id}
        </span>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {isInteractive && (
            <span className="text-[10px] font-mono text-slate-400 mt-0.5 shrink-0">
              {task.id}
            </span>
          )}
          <span
            className={`text-sm leading-snug flex-1 ${
              visuallyDone
                ? 'line-through text-slate-400'
                : isStrike
                ? 'line-through text-slate-400'
                : isKilledStyle
                ? 'line-through text-red-400'
                : 'text-slate-800'
            }`}
          >
            {task.text}
            {task.hasWarning && !showCompleted && !visuallyDone && (
              <span className="ml-1 text-amber-500 text-xs">⚠</span>
            )}
          </span>
          {isKilledStyle && showCompleted && (
            <span className="text-[10px] font-mono text-red-400 bg-red-50 px-1.5 py-0.5 rounded shrink-0">
              KILLED
            </span>
          )}
        </div>

        {/* Sub-tags row */}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {isInteractive && (
            <span className="text-[10px] font-mono text-slate-400 w-0 overflow-hidden" />
          )}
          {showWaiting && task.waitingOn && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              waiting: {task.waitingOn}
            </span>
          )}
          {task.tags['owner'] && !showCompleted && !visuallyDone && (
            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
              {task.tags['owner']}
            </span>
          )}
          {showCompleted && task.completed && !isKilledStyle && (
            <span className="text-[10px] text-slate-400">done {task.completed}</span>
          )}
          {showCompleted && task.tags['killed'] && (
            <span className="text-[10px] text-slate-400">killed {task.tags['killed']}</span>
          )}
        </div>
      </div>

      {/* Age */}
      {!visuallyDone && <AgeTag age={task.age} />}
    </div>
  );
}

function Section({
  title,
  tasks,
  defaultExpanded = true,
  showWaiting = false,
  showCompleted = false,
  count,
  completedIds,
  syncingIds,
  onToggle,
}: {
  title: string;
  tasks: Task[];
  defaultExpanded?: boolean;
  showWaiting?: boolean;
  showCompleted?: boolean;
  count?: number;
  completedIds?: Set<string>;
  syncingIds?: Set<string>;
  onToggle?: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const displayCount = count ?? tasks.length;

  if (tasks.length === 0) return null;

  // Sort: unchecked first, checked at bottom
  const sorted = completedIds
    ? [...tasks].sort((a, b) => {
        const aDone = completedIds.has(a.id) ? 1 : 0;
        const bDone = completedIds.has(b.id) ? 1 : 0;
        return aDone - bDone;
      })
    : tasks;

  const remaining = completedIds
    ? tasks.filter((t) => !completedIds.has(t.id)).length
    : tasks.length;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-2.5 px-0 text-left group cursor-pointer"
      >
        {expanded ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className="text-xs text-slate-400 ml-auto">
          {completedIds && remaining < displayCount ? (
            <>
              <span className="text-[#7a9a8a]">{displayCount - remaining}✓</span>
              {' / '}
              {displayCount}
            </>
          ) : (
            displayCount
          )}
        </span>
      </button>

      {expanded && (
        <div className="pl-1">
          {sorted.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              showWaiting={showWaiting}
              showCompleted={showCompleted}
              isChecked={completedIds?.has(task.id) ?? false}
              syncing={syncingIds?.has(task.id) ?? false}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SyncIndicator({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-600">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      syncing {count}...
    </div>
  );
}

export default function TasksPage() {
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  // Load persisted completions on mount
  useEffect(() => {
    setCompletedIds(getLocalCompleted());
  }, []);

  useEffect(() => {
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load tasks');
        setLoading(false);
      });
  }, []);

  const handleToggle = useCallback(
    (taskId: string) => {
      if (completedIds.has(taskId)) return;

      // Optimistic: mark done instantly
      const next = new Set(completedIds);
      next.add(taskId);
      setCompletedIds(next);
      saveLocalCompleted(next);

      // Track syncing
      setSyncingIds((prev) => new Set([...prev, taskId]));

      // Sync to GitHub via API
      fetch('/api/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
        .then((r) => r.json())
        .then((res) => {
          if (!res.ok) {
            console.error('Task sync failed:', res.error);
          }
        })
        .catch((err) => console.error('Task sync error:', err))
        .finally(() => {
          setSyncingIds((prev) => {
            const s = new Set(prev);
            s.delete(taskId);
            return s;
          });
        });
    },
    [completedIds]
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-7 bg-slate-200 rounded w-32" />
          <div className="h-16 bg-slate-100 rounded" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-red-500 text-sm">{error || 'Something went wrong'}</p>
      </div>
    );
  }

  const { counts } = data;

  // Adjust counts for locally-completed items
  const localDoneActive = [...completedIds].filter(
    (id) =>
      data.thisWeek.some((t) => t.id === id) ||
      data.nextWeek.some((t) => t.id === id) ||
      data.thisMonth.some((t) => t.id === id)
  ).length;
  const localDoneWaiting = [...completedIds].filter((id) =>
    data.waiting.some((t) => t.id === id)
  ).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-baseline gap-3 flex-1">
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <span className="text-sm text-slate-400">
            {Math.max(0, counts.active - localDoneActive)} active
          </span>
        </div>
        <SyncIndicator count={syncingIds.size} />
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 overflow-x-auto pb-1 mb-6 scrollbar-hide">
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-[#7a9a8a]" />
          <span className="text-xs text-slate-600">Active</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">
            {Math.max(0, counts.active - localDoneActive)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-slate-600">Waiting</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">
            {Math.max(0, counts.waiting - localDoneWaiting)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-xs text-slate-600">Watching</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">{counts.watching}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-600">Done</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">
            {counts.doneThisWeek + localDoneActive + localDoneWaiting}
          </span>
        </div>
      </div>

      {/* Sections */}
      <div className="divide-y divide-slate-100">
        <Section
          title="This Week"
          tasks={data.thisWeek}
          defaultExpanded={true}
          completedIds={completedIds}
          syncingIds={syncingIds}
          onToggle={handleToggle}
        />
        <Section
          title="Waiting On"
          tasks={data.waiting}
          defaultExpanded={true}
          showWaiting={true}
          completedIds={completedIds}
          syncingIds={syncingIds}
          onToggle={handleToggle}
        />
        <Section
          title="Watching"
          tasks={data.watching}
          defaultExpanded={false}
          completedIds={completedIds}
          syncingIds={syncingIds}
          onToggle={handleToggle}
        />
        <Section
          title="Next Week+"
          tasks={data.nextWeek}
          defaultExpanded={false}
          completedIds={completedIds}
          syncingIds={syncingIds}
          onToggle={handleToggle}
        />
        <Section
          title="This Month"
          tasks={data.thisMonth}
          defaultExpanded={false}
          completedIds={completedIds}
          syncingIds={syncingIds}
          onToggle={handleToggle}
        />
        <Section
          title="Recently Completed"
          tasks={data.completed}
          defaultExpanded={false}
          showCompleted={true}
        />
      </div>
    </div>
  );
}
