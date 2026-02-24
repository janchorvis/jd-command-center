'use client';

import { Task } from '@/lib/asana';
import { format } from 'date-fns';
import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

interface TaskCardProps {
  task: Task;
  onComplete: (taskId: string) => void;
}

export default function TaskCard({ task, onComplete }: TaskCardProps) {
  const healthColor = task.isOverdue ? 'border-red-500' : 
                      task.daysUntilDue !== null && task.daysUntilDue <= 3 ? 'border-yellow-500' : 
                      'border-slate-700';

  const dueDateText = task.dueDate ? format(task.dueDate, 'MMM d') : 'No date';
  const daysText = task.daysUntilDue !== null ? 
    (task.isOverdue ? `${Math.abs(task.daysUntilDue)}d overdue` : `in ${task.daysUntilDue}d`) : 
    null;

  return (
    <div className={`bg-slate-800 border-l-4 ${healthColor} rounded-lg p-4 mb-3 hover:bg-slate-750 transition cursor-pointer`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white truncate">{task.name}</h3>
          
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
            <ClockIcon className="w-4 h-4" />
            <span>{dueDateText}</span>
            {daysText && (
              <span className={task.isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}>
                ({daysText})
              </span>
            )}
          </div>

          {task.project !== 'Inbox' && (
            <div className="mt-2">
              <span className="inline-block px-2 py-1 text-xs bg-blue-900/30 text-blue-300 rounded">
                {task.project}
              </span>
            </div>
          )}

          {task.notes && (
            <p className="mt-2 text-xs text-slate-500 line-clamp-2">{task.notes}</p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete(task.id);
          }}
          className="flex-shrink-0 text-slate-500 hover:text-green-400 transition"
          title="Mark complete"
        >
          <CheckCircleIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
