import { NextResponse } from 'next/server';
import { getHotDealsData } from '@/lib/hot-deals';

export async function GET() {
  try {
    const data = getHotDealsData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[deals/data]', error);
    return NextResponse.json({ error: 'Failed to read deals data' }, { status: 500 });
  }
}
