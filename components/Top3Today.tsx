'use client';

import { Task } from '@/lib/asana';
import { format, addDays, startOfDay } from 'date-fns';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircleIcon as CheckCircleSolidIcon, ClockIcon } from '@heroicons/react/24/solid';

interface Top3TodayProps {
  tasks: Task[];
}

export default function Top3Today({ tasks }: Top3TodayProps) {
  const router = useRouter();
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Get top 3 most urgent incomplete tasks (overdue first, then soonest due)
  const top3 = tasks
    .filter(t => t.dueDate) // Only tasks with due dates
    .sort((a, b) => {
      // Overdue first
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      // Then by due date
      return (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0);
    })
    .slice(0, 3);

  // Generate next 7 days
  const today = startOfDay(new Date());
  const next7Days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  // Group tasks by day for the timeline
  const tasksByDay = next7Days.map(day => ({
    date: day,
    tasks: tasks.filter(t => {
      if (!t.dueDate) return false;
      const taskDay = startOfDay(t.dueDate);
      return taskDay.getTime() === day.getTime();
    }),
  }));

  const handleComplete = async (taskId: string) => {
    setCompletingId(taskId);
    try {
      await fetch(`/api/tasks/${taskId}/complete`, { method: 'POST' });
      setTimeout(() => router.refresh(), 500);
    } catch (error) {
      console.error('Failed to complete task:', error);
      setCompletingId(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('application/json'));
    const { taskId } = data;

    try {
      await fetch(`/api/tasks/${taskId}/due-date`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: format(targetDate, 'yyyy-MM-dd'),
        }),
      });
      router.refresh();
    } catch (error) {
      console.error('Failed to update due date:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="space-y-6">
      {/* Top 3 Focus */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-800/50">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>🎯</span>
          <span>Top 3 Today</span>
        </h2>
        
        {top3.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No urgent tasks - you're all clear! 🎉</p>
        ) : (
          <div className="space-y-3">
            {top3.map((task, index) => (
              <div
                key={task.id}
                className={`bg-slate-800/70 rounded-lg p-4 border-l-4 ${
                  task.isOverdue ? 'border-red-500' : 'border-blue-500'
                } flex items-start justify-between gap-3`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg font-bold text-blue-400">#{index + 1}</span>
                    <h3 className="text-sm font-medium text-white">{task.name}</h3>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                    <ClockIcon className="w-4 h-4" />
                    <span>{task.dueDate && format(task.dueDate, 'MMM d')}</span>
                    {task.daysUntilDue !== null && (
                      <span className={task.isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}>
                        ({task.isOverdue ? `${Math.abs(task.daysUntilDue)}d overdue` : `in ${task.daysUntilDue}d`})
                      </span>
                    )}
                  </div>

                  {task.notes && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-1">{task.notes}</p>
                  )}
                </div>

                <button
                  onClick={() => handleComplete(task.id)}
                  disabled={completingId === task.id}
                  className="flex-shrink-0 p-2 hover:bg-slate-700 rounded-lg transition"
                  title="Mark complete"
                >
                  <CheckCircleSolidIcon 
                    className={`w-6 h-6 ${
                      completingId === task.id ? 'text-green-400' : 'text-slate-600 hover:text-green-400'
                    }`} 
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 7-Day Timeline */}
      <div className="bg-slate-800/50 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>📅</span>
          <span>7-Day Timeline</span>
          <span className="text-sm font-normal text-slate-400 ml-2">(drag tasks to reschedule)</span>
        </h2>

        <div className="grid grid-cols-7 gap-2">
          {tasksByDay.map(({ date, tasks: dayTasks }) => {
            const isToday = date.getTime() === today.getTime();
            const dayCount = dayTasks.length;

            return (
              <div
                key={date.toISOString()}
                className={`rounded-lg p-3 min-h-[120px] border-2 border-dashed transition ${
                  isToday 
                    ? 'bg-blue-900/20 border-blue-600' 
                    : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
                }`}
                onDrop={(e) => handleDrop(e, date)}
                onDragOver={handleDragOver}
              >
                <div className="text-center mb-2">
                  <div className={`text-xs font-medium ${isToday ? 'text-blue-400' : 'text-slate-400'}`}>
                    {format(date, 'EEE')}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? 'text-blue-300' : 'text-white'}`}>
                    {format(date, 'd')}
                  </div>
                  {dayCount > 0 && (
                    <div className="text-xs mt-1 px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 inline-block">
                      {dayCount}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 mt-2">
                  {dayTasks.slice(0, 3).map(task => (
                    <div
                      key={task.id}
                      className="text-xs p-1.5 bg-slate-800 rounded border border-slate-700 cursor-grab active:cursor-grabbing hover:bg-slate-750"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({
                          taskId: task.id,
                          currentDueDate: task.dueDate?.toISOString()
                        }));
                      }}
                    >
                      <div className="truncate text-white">{task.name}</div>
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-xs text-slate-500 text-center">
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
