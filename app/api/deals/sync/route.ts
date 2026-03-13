import { NextRequest, NextResponse } from 'next/server';
import { writeHotDealsData, HotDealsData } from '@/lib/hot-deals';

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-sync-secret');
    if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as HotDealsData;

    if (!body.lastUpdated || !body.pipelineDeals) {
      return NextResponse.json({ error: 'Invalid hot-deals data' }, { status: 400 });
    }

    writeHotDealsData(body);
    console.log('[deals/sync] Data synced at', new Date().toISOString());

    return NextResponse.json({ ok: true, message: 'Data synced' });
  } catch (error) {
    console.error('[deals/sync]', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
