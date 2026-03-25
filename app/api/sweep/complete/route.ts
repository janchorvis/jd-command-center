import { NextRequest, NextResponse } from 'next/server';
import { writeHotDealsData, getHotDealsData } from '@/lib/hot-deals';
import { getSweepState, saveSweepState } from '@/lib/sweep-state';

const ASANA_PROJECT_GID = '1204790859570747';

// Try to find and complete a matching Asana task by keyword search
async function tryCloseAsanaTask(itemText: string): Promise<{ closed: boolean; taskName?: string; gid?: string; error?: string }> {
  const token = process.env.ASANA_TOKEN;
  if (!token) return { closed: false, error: 'no_token' };

  try {
    // Extract meaningful keywords (skip short/common words)
    const stopWords = new Set(['the', 'a', 'an', 'to', 'for', 'and', 'or', 'with', 'on', 'at', 'in', 'of', 'is', 'are', 'was', 'be', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'get', 'got', 'his', 'her', 'him', 'he', 'she', 'it', 'its', 'not', 'no', 'yes', 'but', 'if', 'up', 'out', 'about', 'been', 'from', 'that', 'this', 'what', 'when', 'who', 'how', 'all', 'each', 'which', 'their', 'there', 'then', 'than', 'them', 'they', 'your', 'you', 'we', 'our', 'us', 'am', 'pm', 'today', 'call', 'talk', 'send', 'give', 'make', 'need', 'check']);
    const keywords = itemText
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
      .map(w => w.toLowerCase());

    if (keywords.length === 0) return { closed: false, error: 'no_keywords' };

    // Fetch open tasks from project
    const res = await fetch(
      `https://app.asana.com/api/1.0/tasks?project=${ASANA_PROJECT_GID}&completed_since=now&opt_fields=name,completed,gid&limit=100`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    if (!res.ok) return { closed: false, error: `asana_fetch_${res.status}` };

    const data = await res.json();
    const tasks = data.data || [];

    // Score each task by keyword overlap
    const scored = tasks.map((task: { gid: string; name: string; completed: boolean }) => {
      const nameLower = task.name.toLowerCase();
      const matches = keywords.filter(kw => nameLower.includes(kw));
      return { ...task, score: matches.length, matchRatio: matches.length / keywords.length };
    }).filter((t: { score: number }) => t.score >= 2);  // Need at least 2 keyword matches

    // Sort by score descending
    scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score);

    // Only close if there's one clear winner (top score is unique or significantly higher)
    if (scored.length === 0) return { closed: false, error: 'no_match' };
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      return { closed: false, error: 'ambiguous_match' };
    }

    const best = scored[0];

    // Close it
    const closeRes = await fetch(`https://app.asana.com/api/1.0/tasks/${best.gid}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: { completed: true } }),
    });

    if (!closeRes.ok) return { closed: false, error: `asana_close_${closeRes.status}` };

    return { closed: true, taskName: best.name, gid: best.gid };
  } catch (err) {
    return { closed: false, error: String(err) };
  }
}

export async function POST(request: NextRequest) {
  const { itemId, lane } = await request.json();

  if (!itemId || !lane) {
    return NextResponse.json({ error: 'Missing itemId or lane' }, { status: 400 });
  }

  const validLanes = ['yourPlate', 'prepping', 'handling', 'deferred'] as const;
  if (!validLanes.includes(lane)) {
    return NextResponse.json({ error: 'Invalid lane' }, { status: 400 });
  }

  const base = getHotDealsData().todaySweep;
  if (!base) {
    return NextResponse.json({ error: 'No sweep data' }, { status: 404 });
  }
  const tmp = getSweepState();
  const sweep = (tmp && tmp.generatedAt === base.generatedAt) ? tmp : base;

  if (!sweep) {
    return NextResponse.json({ error: 'No sweep data' }, { status: 404 });
  }

  const laneItems = sweep[lane as typeof validLanes[number]];
  const item = laneItems.find((i) => i.id === itemId);

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  item.completed = true;
  item.completedAt = new Date().toISOString();
  item.completedBy = 'manual';

  // Primary persistence: /tmp (works on Vercel)
  saveSweepState(sweep);

  // Backup: try writing to hot-deals.json (works locally, read-only on Vercel)
  try {
    const data = getHotDealsData();
    data.todaySweep = sweep;
    writeHotDealsData(data);
  } catch {}

  // Try to close matching Asana task (fire-and-forget, don't block response)
  const asanaResult = tryCloseAsanaTask(item.text).catch(() => ({ closed: false, error: 'exception' }));

  // Return sweep immediately, include Asana result if it resolved fast
  const asana = await Promise.race([
    asanaResult,
    new Promise<{ closed: false; error: string }>((resolve) =>
      setTimeout(() => resolve({ closed: false, error: 'timeout' }), 3000)
    ),
  ]);

  return NextResponse.json({ sweep, asana });
}
