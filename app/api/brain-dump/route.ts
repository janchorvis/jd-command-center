import { NextRequest, NextResponse } from 'next/server';
import { getHotDealsData, writeHotDealsData } from '@/lib/hot-deals';

export async function GET() {
  try {
    const data = getHotDealsData();
    return NextResponse.json(data.brainDumps);
  } catch (error) {
    console.error('[brain-dump GET]', error);
    return NextResponse.json({ error: 'Failed to read brain dumps' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, timestamp } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const data = getHotDealsData();
    data.brainDumps.push({
      text: text.trim(),
      timestamp: timestamp || new Date().toISOString(),
      processed: false,
    });
    writeHotDealsData(data);

    console.log('[brain-dump]', { text, timestamp });

    return NextResponse.json({ ok: true, message: 'Jarvis got it ⚡' });
  } catch (error) {
    console.error('[brain-dump POST]', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
