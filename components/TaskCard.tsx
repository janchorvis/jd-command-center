'use client';

import { Task } from '@/lib/asana';
import { format } from 'date-fns';
import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface TaskCardProps {
  task: Task;
  draggable?: boolean;
}

export default function TaskCard({ task, draggable = false }: TaskCardProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const router = useRouter();

  const healthDot = task.isOverdue ? 'bg-red-500' :
                    task.daysUntilDue !== null && task.daysUntilDue <= 3 ? 'bg-yellow-500' :
                    'bg-slate-300';

  const dueDateText = task.dueDate ? format(task.dueDate, 'MMM d') : 'No date';
  const daysText = task.daysUntilDue !== null ?
    (task.isOverdue ? `${Math.abs(task.daysUntilDue)}d overdue` : `in ${task.daysUntilDue}d`) :
    null;

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCompleting || isCompleted) return;

    setIsCompleting(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
      });

      if (response.ok) {
        setIsCompleted(true);
        // Refresh the page data after a brief delay to show the completion animation
        setTimeout(() => {
          router.refresh();
        }, 500);
      }
    } catch (error) {
      console.error('Failed to complete task:', error);
      setIsCompleting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      taskId: task.id,
      currentDueDate: task.dueDate?.toISOString()
    }));
  };

  return (
    <div
      className={`bg-white border border-slate-200 shadow-sm rounded-xl p-4 mb-3 hover:bg-slate-50 transition ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isCompleted ? 'opacity-50' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${healthDot}`} />
            <h3 className={`text-sm font-medium ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900'} truncate`}>
              {task.name}
            </h3>
          </div>

          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
            <ClockIcon className="w-4 h-4" />
            <span>{dueDateText}</span>
            {daysText && (
              <span className={task.isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}>
                ({daysText})
              </span>
            )}
          </div>

          {task.project !== 'Inbox' && (
            <div className="mt-2">
              <span className="inline-block px-2 py-1 text-xs bg-[#7a9a8a]/10 text-[#7a9a8a] rounded">
                {task.project}
              </span>
            </div>
          )}

          {task.notes && (
            <p className="mt-2 text-xs text-slate-500 line-clamp-2">{task.notes}</p>
          )}
        </div>

        <button
          onClick={handleComplete}
          disabled={isCompleting || isCompleted}
          className="flex-shrink-0 text-slate-400 hover:text-emerald-500 transition disabled:opacity-50"
          title={isCompleted ? 'Completed' : 'Mark complete'}
        >
          {isCompleted || isCompleting ? (
            <CheckCircleSolidIcon className="w-6 h-6 text-emerald-500" />
          ) : (
            <CheckCircleIcon className="w-6 h-6" />
          )}
        </button>
      </div>
    </div>
  );
}
