// Asana API Integration

export interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  due_at: string | null;
  notes: string;
  projects: Array<{ gid: string; name: string }>;
  tags: Array<{ gid: string; name: string }>;
}

export interface Task {
  id: string;
  name: string;
  dueDate: Date | null;
  project: string;
  notes: string;
  tags: string[];
  isOverdue: boolean;
  daysUntilDue: number | null;
}

const ASANA_TOKEN = process.env.ASANA_TOKEN;
const WORKSPACE_GID = process.env.ASANA_WORKSPACE_GID;
const USER_GID = process.env.ASANA_USER_GID;

async function asanaFetch(endpoint: string, options: RequestInit = {}) {
  const url = `https://app.asana.com/api/1.0${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${ASANA_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Asana API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

function calculateDaysUntilDue(dueDate: Date | null): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function transformTask(asanaTask: AsanaTask): Task {
  const dueDate = asanaTask.due_on ? new Date(asanaTask.due_on) : 
                  asanaTask.due_at ? new Date(asanaTask.due_at) : null;
  const daysUntilDue = calculateDaysUntilDue(dueDate);
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;

  return {
    id: asanaTask.gid,
    name: asanaTask.name,
    dueDate,
    project: asanaTask.projects[0]?.name || 'Inbox',
    notes: asanaTask.notes,
    tags: asanaTask.tags.map(t => t.name),
    isOverdue,
    daysUntilDue,
  };
}

export async function fetchTasks(): Promise<Task[]> {
  const tasks = await asanaFetch(
    `/tasks?assignee=${USER_GID}&workspace=${WORKSPACE_GID}&completed_since=now&opt_fields=name,completed,due_on,due_at,notes,projects.name,tags.name&limit=100`
  );

  return tasks.map(transformTask);
}

export async function updateTask(taskId: string, updates: {
  completed?: boolean;
  due_on?: string | null;
  notes?: string;
}) {
  await asanaFetch(`/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ data: updates }),
  });
}

export async function completeTask(taskId: string) {
  await updateTask(taskId, { completed: true });
}

export async function updateDueDate(taskId: string, dueDate: string | null) {
  await updateTask(taskId, { due_on: dueDate });
}

export function groupTasksByStatus(tasks: Task[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const overdue: Task[] = [];
  const thisWeek: Task[] = [];
  const nextWeek: Task[] = [];
  const later: Task[] = [];
  const parked: Task[] = [];

  tasks.forEach(task => {
    if (!task.dueDate) {
      parked.push(task);
      return;
    }

    const days = task.daysUntilDue!;
    
    if (days < 0) {
      overdue.push(task);
    } else if (days <= 7) {
      thisWeek.push(task);
    } else if (days <= 14) {
      nextWeek.push(task);
    } else {
      later.push(task);
    }
  });

  // Sort each group
  const sortByDueDate = (a: Task, b: Task) => {
    if (!a.dueDate || !b.dueDate) return 0;
    return a.dueDate.getTime() - b.dueDate.getTime();
  };

  overdue.sort(sortByDueDate);
  thisWeek.sort(sortByDueDate);
  nextWeek.sort(sortByDueDate);
  later.sort(sortByDueDate);

  return { overdue, thisWeek, nextWeek, later, parked };
}
