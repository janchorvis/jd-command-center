import { NextRequest, NextResponse } from 'next/server';

// Placeholder: In production, this will POST to a Jarvis webhook for processing.
// For now we just return success so the UI feedback loop works.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, timestamp } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    // TODO: Wire to Jarvis webhook for real processing
    // e.g. await fetch(JARVIS_WEBHOOK_URL, { method: 'POST', body: JSON.stringify({ text, timestamp }) })
    console.log('[brain-dump]', { text, timestamp });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
