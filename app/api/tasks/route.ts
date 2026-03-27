import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface Task {
  id: string;
  text: string;
  tags: Record<string, string>;
  waitingOn: string | null;
  hasWarning: boolean;
  age: number | null;
  completed: string | null;
  isKilled: boolean;
  rawLine: string;
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

function parseDate(dateStr: string): Date | null {
  // Try M/DD format like "3/23"
  const mDayMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
  if (mDayMatch) {
    const month = parseInt(mDayMatch[1]) - 1;
    const day = parseInt(mDayMatch[2]);
    const year = new Date().getFullYear();
    const d = new Date(year, month, day);
    // If date is in the future by >6 months, assume last year
    if (d.getTime() - Date.now() > 180 * 24 * 60 * 60 * 1000) {
      d.setFullYear(year - 1);
    }
    return d;
  }
  // Try YYYY-MM-DD format
  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(dateStr);
  }
  return null;
}

function calcAge(line: string): number | null {
  // Look for [source: ... M/DD] or [added: M/DD]
  const sourceMatch = line.match(/\[(?:source|added):[^\]]*?(\d{1,2}\/\d{1,2})\]/);
  if (sourceMatch) {
    const d = parseDate(sourceMatch[1]);
    if (d) {
      const diffMs = Date.now() - d.getTime();
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
  }
  return null;
}

function extractTags(line: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const tagRegex = /\[([^\]:]+):\s*([^\]]+)\]/g;
  let match;
  while ((match = tagRegex.exec(line)) !== null) {
    tags[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return tags;
}

function parseTaskLine(line: string): Task | null {
  // Match lines like "- T054: text..."
  const taskMatch = line.match(/^-\s+(T\d+):\s+(.+)/);
  if (!taskMatch) return null;

  const id = taskMatch[1];
  const rest = taskMatch[2];

  // Extract text up to first [ bracket
  const bracketIdx = rest.indexOf('[');
  const text = (bracketIdx === -1 ? rest : rest.substring(0, bracketIdx)).trim()
    // Remove trailing em-dash or checkmark
    .replace(/\s*[—–]\s*$/, '')
    .trim();

  const tags = extractTags(rest);
  const waitingOn = tags['waiting on'] || null;
  const hasWarning = line.includes('⚠️');
  const age = calcAge(line);
  const completed = tags['completed'] || null;
  const isKilled = line.toLowerCase().includes('killed');

  return { id, text, tags, waitingOn, hasWarning, age, completed, isKilled, rawLine: line };
}

function parseTasksMd(content: string): TasksData {
  const lines = content.split('\n');

  const sections: Record<string, string[]> = {
    thisWeek: [],
    nextWeek: [],
    thisMonth: [],
    waiting: [],
    watching: [],
    completed: [],
  };

  let currentSection = '';
  let currentSubSection = '';

  for (const line of lines) {
    if (line.startsWith('## ACTIVE')) {
      currentSection = 'active';
      currentSubSection = '';
    } else if (line.startsWith('## WAITING')) {
      currentSection = 'waiting';
      currentSubSection = '';
    } else if (line.startsWith('## WATCHING')) {
      currentSection = 'watching';
      currentSubSection = '';
    } else if (line.startsWith('## COMPLETED')) {
      currentSection = 'completed';
      currentSubSection = '';
    } else if (line.startsWith('## ')) {
      currentSection = '';
      currentSubSection = '';
    } else if (line.startsWith('### This Week')) {
      currentSubSection = 'thisWeek';
    } else if (line.startsWith('### Next Week')) {
      currentSubSection = 'nextWeek';
    } else if (line.startsWith('### This Month')) {
      if (currentSection === 'active') {
        currentSubSection = 'thisMonth';
      } else {
        // "This Month" under COMPLETED is just a sub-section of completed
        currentSubSection = 'completedThisMonth';
      }
    } else if (line.startsWith('### ')) {
      // Other sub-sections
    } else if (line.trim().startsWith('- T')) {
      // Route to correct bucket
      if (currentSection === 'active') {
        const bucket = currentSubSection || 'thisWeek';
        if (bucket === 'thisWeek') sections.thisWeek.push(line);
        else if (bucket === 'nextWeek') sections.nextWeek.push(line);
        else if (bucket === 'thisMonth') sections.thisMonth.push(line);
        else sections.thisWeek.push(line);
      } else if (currentSection === 'waiting') {
        sections.waiting.push(line);
      } else if (currentSection === 'watching') {
        sections.watching.push(line);
      } else if (currentSection === 'completed') {
        sections.completed.push(line);
      }
    }
  }

  const parse = (lines: string[]) =>
    lines.map(parseTaskLine).filter((t): t is Task => t !== null);

  const thisWeek = parse(sections.thisWeek);
  const nextWeek = parse(sections.nextWeek);
  const thisMonth = parse(sections.thisMonth);
  const waiting = parse(sections.waiting).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  const watching = parse(sections.watching);
  const completed = parse(sections.completed);

  // Done this week = completed in last 7 days
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const doneThisWeek = completed.filter(t => {
    if (!t.completed) return false;
    const d = new Date(t.completed);
    return d.getTime() >= sevenDaysAgo;
  }).length;

  const active = thisWeek.length + nextWeek.length + thisMonth.length;

  return {
    thisWeek,
    nextWeek,
    thisMonth,
    waiting,
    watching,
    completed,
    counts: {
      active,
      waiting: waiting.length,
      watching: watching.length,
      doneThisWeek,
    },
  };
}

export async function GET() {
  try {
    const filePath = '/Users/fostercreighton/.openclaw/workspace/memory/active-tasks.md';
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = parseTasksMd(content);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Failed to read active-tasks.md:', err);
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}
