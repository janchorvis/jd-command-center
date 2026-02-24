import { fetchTasks, groupTasksByStatus, completeTask } from '@/lib/asana';
import TaskCard from '@/components/TaskCard';
import StatCard from '@/components/StatCard';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const tasks = await fetchTasks();
  const { overdue, thisWeek, nextWeek, later, parked } = groupTasksByStatus(tasks);

  const stats = {
    overdue: overdue.length,
    thisWeek: thisWeek.length,
    parked: parked.length,
    total: tasks.length,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">📋 Tasks</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Overdue" value={stats.overdue} emoji="🔴" color={stats.overdue > 5 ? 'red' : 'blue'} />
        <StatCard label="This Week" value={stats.thisWeek} emoji="📅" color={stats.thisWeek > 10 ? 'yellow' : 'blue'} />
        <StatCard label="Parked" value={stats.parked} emoji="📦" color="blue" />
        <StatCard label="Total Open" value={stats.total} emoji="✅" color="blue" />
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Overdue */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 text-red-400">🔴 Overdue ({overdue.length})</h2>
          <div className="space-y-3">
            {overdue.map(task => (
              <TaskCard 
                key={task.id} 
                task={task}/>
            ))}
            {overdue.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing overdue</p>
            )}
          </div>
        </div>

        {/* This Week */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 text-yellow-400">🟡 This Week ({thisWeek.length})</h2>
          <div className="space-y-3">
            {thisWeek.map(task => (
              <TaskCard 
                key={task.id} 
                task={task}/>
            ))}
            {thisWeek.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing due</p>
            )}
          </div>
        </div>

        {/* Next Week */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 text-blue-400">🔵 Next Week ({nextWeek.length})</h2>
          <div className="space-y-3">
            {nextWeek.map(task => (
              <TaskCard 
                key={task.id} 
                task={task}/>
            ))}
            {nextWeek.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing scheduled</p>
            )}
          </div>
        </div>

        {/* Later */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 text-green-400">🟢 Later ({later.length})</h2>
          <div className="space-y-3">
            {later.map(task => (
              <TaskCard 
                key={task.id} 
                task={task}/>
            ))}
            {later.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing scheduled</p>
            )}
          </div>
        </div>

        {/* Parked */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 text-slate-400">📦 Parked ({parked.length})</h2>
          <div className="space-y-3">
            {parked.map(task => (
              <TaskCard 
                key={task.id} 
                task={task}/>
            ))}
            {parked.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing parked</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
