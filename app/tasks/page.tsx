import { fetchTasks, groupTasksByStatus } from '@/lib/asana';
import TaskCard from '@/components/TaskCard';
import StatCard from '@/components/StatCard';
import Top3Today from '@/components/Top3Today';

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
      <h1 className="text-3xl font-bold mb-8">📋 Command Center</h1>

      {/* Top 3 Today + Timeline */}
      <div className="mb-8">
        <Top3Today tasks={tasks} />
      </div>

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
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4 text-red-600">🔴 Overdue ({overdue.length})</h2>
          <div className="space-y-3">
            {overdue.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                draggable={true}
              />
            ))}
            {overdue.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing overdue</p>
            )}
          </div>
        </div>

        {/* This Week */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4 text-yellow-600">🟡 This Week ({thisWeek.length})</h2>
          <div className="space-y-3">
            {thisWeek.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                draggable={true}
              />
            ))}
            {thisWeek.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing due</p>
            )}
          </div>
        </div>

        {/* Next Week */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4 text-blue-600">🔵 Next Week ({nextWeek.length})</h2>
          <div className="space-y-3">
            {nextWeek.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                draggable={true}
              />
            ))}
            {nextWeek.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing scheduled</p>
            )}
          </div>
        </div>

        {/* Later */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4 text-emerald-600">🟢 Later ({later.length})</h2>
          <div className="space-y-3">
            {later.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                draggable={true}
              />
            ))}
            {later.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">Nothing scheduled</p>
            )}
          </div>
        </div>

        {/* Parked */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-4 text-slate-500">📦 Parked ({parked.length})</h2>
          <div className="space-y-3">
            {parked.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                draggable={true}
              />
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
