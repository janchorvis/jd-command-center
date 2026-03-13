import { NextRequest, NextResponse } from 'next/server';
import { getHotDealsData, writeHotDealsData } from '@/lib/hot-deals';

export async function POST(request: NextRequest) {
  const { itemId, toLane, detail } = await request.json();

  if (!itemId || !toLane) {
    return NextResponse.json({ error: 'Missing itemId or toLane' }, { status: 400 });
  }

  const validLanes = ['yourPlate', 'prepping', 'handling', 'deferred'] as const;
  if (!validLanes.includes(toLane)) {
    return NextResponse.json({ error: 'Invalid lane' }, { status: 400 });
  }

  const data = getHotDealsData();

  if (!data.todaySweep) {
    return NextResponse.json({ error: 'No sweep data' }, { status: 404 });
  }

  // Find and remove item from its current lane
  let foundItem = null;
  for (const lane of validLanes) {
    const idx = data.todaySweep[lane].findIndex((i) => i.id === itemId);
    if (idx !== -1) {
      foundItem = data.todaySweep[lane].splice(idx, 1)[0];
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
  data.todaySweep[toLane as typeof validLanes[number]].push(foundItem);

  try {
    writeHotDealsData(data);
  } catch {
    // On Vercel, the file is read-only. That's fine — the optimistic
    // client update still works and cron scripts handle persistence.
  }

  return NextResponse.json({ sweep: data.todaySweep });
}
