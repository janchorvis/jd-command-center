import { NextRequest, NextResponse } from 'next/server';
import { writeHotDealsData, getHotDealsData } from '@/lib/hot-deals';
import { getSweepState, saveSweepState } from '@/lib/sweep-state';

export async function POST(request: NextRequest) {
  const { itemId, toLane, detail } = await request.json();

  if (!itemId || !toLane) {
    return NextResponse.json({ error: 'Missing itemId or toLane' }, { status: 400 });
  }

  const validLanes = ['yourPlate', 'prepping', 'handling', 'deferred'] as const;
  if (!validLanes.includes(toLane)) {
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

  // Find and remove item from its current lane
  let foundItem = null;
  for (const lane of validLanes) {
    const idx = sweep[lane].findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      foundItem = sweep[lane].splice(idx, 1)[0];
      break;
    }
  }

  if (!foundItem) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Update detail if provided
  if (detail !== undefined) {
    foundItem.detail = detail;
  }

  // Add to target lane
  sweep[toLane as typeof validLanes[number]].push(foundItem);

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
