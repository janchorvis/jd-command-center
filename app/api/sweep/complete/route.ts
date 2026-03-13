import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSweep, writeHotDealsData, getHotDealsData } from '@/lib/hot-deals';
import { saveSweepState } from '@/lib/sweep-state';

export async function POST(request: NextRequest) {
  const { itemId, lane } = await request.json();

  if (!itemId || !lane) {
    return NextResponse.json({ error: 'Missing itemId or lane' }, { status: 400 });
  }

  const validLanes = ['yourPlate', 'prepping', 'handling', 'deferred'] as const;
  if (!validLanes.includes(lane)) {
    return NextResponse.json({ error: 'Invalid lane' }, { status: 400 });
  }

  const sweep = getEffectiveSweep();

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

  return NextResponse.json({ sweep });
}
