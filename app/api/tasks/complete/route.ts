import { NextRequest, NextResponse } from 'next/server';

const REPO = 'janchorvis/jd-command-center';
const FILE_PATH = 'data/active-tasks.md';
const API_BASE = 'https://api.github.com';

async function getFileFromGitHub(token: string) {
  const res = await fetch(`${API_BASE}/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha as string };
}

async function putFileToGitHub(token: string, content: string, sha: string, message: string) {
  const encoded = Buffer.from(content).toString('base64');
  const res = await fetch(`${API_BASE}/repos/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, content: encoded, sha }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} ${body}`);
  }
  return res.json();
}

function moveTaskToCompleted(mdContent: string, taskId: string): string {
  const lines = mdContent.split('\n');
  const taskRegex = new RegExp(`^- ${taskId}:\\s`);
  
  let taskLineIdx = -1;
  let taskLine = '';
  
  // Find the task line (skip lines in COMPLETED section)
  let inCompleted = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## COMPLETED')) inCompleted = true;
    else if (lines[i].startsWith('## ') && !lines[i].startsWith('## COMPLETED')) inCompleted = false;
    
    if (!inCompleted && taskRegex.test(lines[i].trim())) {
      taskLineIdx = i;
      taskLine = lines[i].trim();
      break;
    }
  }
  
  if (taskLineIdx === -1) return mdContent; // task not found
  
  // Remove from current location
  lines.splice(taskLineIdx, 1);
  
  // Add completion tag
  const today = new Date().toISOString().slice(0, 10);
  const completedLine = `- ${taskLine.replace(/^- /, '')} [completed: ${today}]`;
  
  // Find COMPLETED section and insert at top
  let completedSectionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## COMPLETED')) {
      completedSectionIdx = i;
      break;
    }
  }
  
  if (completedSectionIdx === -1) {
    // Create COMPLETED section at end
    lines.push('', '## COMPLETED - Recent (auto-cleaned after 7 days)', completedLine);
  } else {
    // Insert after the ## COMPLETED header line (and any blank line after it)
    let insertIdx = completedSectionIdx + 1;
    while (insertIdx < lines.length && lines[insertIdx].trim() === '') insertIdx++;
    // If there's a ### sub-header, insert after it
    if (insertIdx < lines.length && lines[insertIdx].startsWith('### ')) insertIdx++;
    while (insertIdx < lines.length && lines[insertIdx].trim() === '') insertIdx++;
    lines.splice(insertIdx, 0, completedLine);
  }
  
  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'No GITHUB_TOKEN' }, { status: 500 });
  }

  let body: { taskId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.taskId || !body.taskId.match(/^T\d+$/)) {
    return NextResponse.json({ ok: false, error: 'Invalid taskId' }, { status: 400 });
  }

  // Retry once on SHA conflict
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { content, sha } = await getFileFromGitHub(token);
      const updated = moveTaskToCompleted(content, body.taskId);
      
      if (updated === content) {
        return NextResponse.json({ ok: false, error: 'Task not found in active sections' }, { status: 404 });
      }
      
      await putFileToGitHub(token, updated, sha, `tasks: complete ${body.taskId}`);
      return NextResponse.json({ ok: true, taskId: body.taskId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409') && attempt === 0) continue;
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: 'Failed after retry' }, { status: 500 });
}
