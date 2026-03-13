import { NextRequest, NextResponse } from 'next/server';
import { getHotDealsData, writeHotDealsData } from '@/lib/hot-deals';

export async function POST(request: NextRequest) {
  const { itemId, lane } = await request.json();

  if (!itemId || !lane) {
    return NextResponse.json({ error: 'Missing itemId or lane' }, { status: 400 });
  }

  const validLanes = ['yourPlate', 'prepping', 'handling', 'deferred'] as const;
  if (!validLanes.includes(lane)) {
    return NextResponse.json({ error: 'Invalid lane' }, { status: 400 });
  }

  const data = getHotDealsData();

  if (!data.todaySweep) {
    return NextResponse.json({ error: 'No sweep data' }, { status: 404 });
  }

  const laneItems = data.todaySweep[lane as typeof validLanes[number]];
  const item = laneItems.find((i) => i.id === itemId);

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  item.completed = true;
  item.completedAt = new Date().toISOString();
  item.completedBy = 'manual';

  try {
    writeHotDealsData(data);
  } catch {
    // On Vercel, the file is read-only. That's fine — the optimistic
    // client update still works and cron scripts handle persistence.
  }

  return NextResponse.json({ sweep: data.todaySweep });
}
