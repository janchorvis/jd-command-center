'use client';

import { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

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

function AgeTag({ age }: { age: number | null }) {
  if (age === null) return null;
  const isOld = age > 7;
  return (
    <span className={`text-xs font-mono shrink-0 ${isOld ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
      {age}d
    </span>
  );
}

function TaskRow({
  task,
  accentColor = 'slate',
  showWaiting = false,
  showCompleted = false,
}: {
  task: Task;
  accentColor?: string;
  showWaiting?: boolean;
  showCompleted?: boolean;
}) {
  const isStrike = showCompleted && !task.isKilled;
  const isKilledStyle = task.isKilled;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      {/* ID badge */}
      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
        {task.id}
      </span>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span
            className={`text-sm leading-snug flex-1 ${
              isStrike ? 'line-through text-slate-400' : isKilledStyle ? 'line-through text-red-400' : 'text-slate-800'
            }`}
          >
            {task.text}
            {task.hasWarning && !showCompleted && (
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
          {showWaiting && task.waitingOn && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
              waiting: {task.waitingOn}
            </span>
          )}
          {task.tags['owner'] && !showCompleted && (
            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
              {task.tags['owner']}
            </span>
          )}
          {showCompleted && task.completed && !isKilledStyle && (
            <span className="text-[10px] text-slate-400">
              done {task.completed}
            </span>
          )}
          {showCompleted && task.tags['killed'] && (
            <span className="text-[10px] text-slate-400">
              killed {task.tags['killed']}
            </span>
          )}
        </div>
      </div>

      {/* Age */}
      <AgeTag age={task.age} />
    </div>
  );
}

function Section({
  title,
  tasks,
  defaultExpanded = true,
  accentColor = 'slate',
  showWaiting = false,
  showCompleted = false,
  count,
}: {
  title: string;
  tasks: Task[];
  defaultExpanded?: boolean;
  accentColor?: string;
  showWaiting?: boolean;
  showCompleted?: boolean;
  count?: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const displayCount = count ?? tasks.length;

  if (tasks.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-2.5 px-0 text-left group"
      >
        {expanded ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <span className="text-xs text-slate-400 ml-auto">{displayCount}</span>
      </button>

      {expanded && (
        <div className="pl-5">
          {tasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              accentColor={accentColor}
              showWaiting={showWaiting}
              showCompleted={showCompleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load tasks');
        setLoading(false);
      });
  }, []);

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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
        <span className="text-sm text-slate-400">{counts.active} active</span>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 overflow-x-auto pb-1 mb-6 scrollbar-hide">
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-[#7a9a8a]" />
          <span className="text-xs text-slate-600">Active</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">{counts.active}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs text-slate-600">Waiting</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">{counts.waiting}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-xs text-slate-600">Watching</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">{counts.watching}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-600">Done this week</span>
          <span className="text-sm font-semibold text-slate-900 ml-0.5">{counts.doneThisWeek}</span>
        </div>
      </div>

      {/* Sections */}
      <div className="divide-y divide-slate-100">
        <Section
          title="This Week"
          tasks={data.thisWeek}
          defaultExpanded={true}
          accentColor="green"
        />
        <Section
          title="Waiting On"
          tasks={data.waiting}
          defaultExpanded={true}
          accentColor="amber"
          showWaiting={true}
        />
        <Section
          title="Watching"
          tasks={data.watching}
          defaultExpanded={false}
          accentColor="blue"
        />
        <Section
          title="Next Week+"
          tasks={data.nextWeek}
          defaultExpanded={false}
        />
        <Section
          title="This Month"
          tasks={data.thisMonth}
          defaultExpanded={false}
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
