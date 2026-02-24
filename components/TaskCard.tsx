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

  const healthColor = task.isOverdue ? 'border-red-500' : 
                      task.daysUntilDue !== null && task.daysUntilDue <= 3 ? 'border-yellow-500' : 
                      'border-slate-700';

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
      className={`bg-slate-800 border-l-4 ${healthColor} rounded-lg p-4 mb-3 hover:bg-slate-750 transition ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isCompleted ? 'opacity-50' : ''}`}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium ${isCompleted ? 'line-through text-slate-500' : 'text-white'} truncate`}>
            {task.name}
          </h3>
          
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
          onClick={handleComplete}
          disabled={isCompleting || isCompleted}
          className="flex-shrink-0 text-slate-600 hover:text-green-400 transition disabled:opacity-50"
          title={isCompleted ? 'Completed' : 'Mark complete'}
        >
          {isCompleted || isCompleting ? (
            <CheckCircleSolidIcon className="w-6 h-6 text-green-400" />
          ) : (
            <CheckCircleIcon className="w-6 h-6" />
          )}
        </button>
      </div>
    </div>
  );
}
