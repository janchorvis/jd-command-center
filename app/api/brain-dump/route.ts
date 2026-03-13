import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TMP_DUMPS = '/tmp/brain-dumps.json';

function getStoredDumps(): Array<{ text: string; timestamp: string; processed: boolean }> {
  try {
    if (existsSync(TMP_DUMPS)) {
      return JSON.parse(readFileSync(TMP_DUMPS, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveDumps(dumps: Array<{ text: string; timestamp: string; processed: boolean }>) {
  writeFileSync(TMP_DUMPS, JSON.stringify(dumps, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const dumps = getStoredDumps();
    return NextResponse.json(dumps);
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

    const dumps = getStoredDumps();
    dumps.push({
      text: text.trim(),
      timestamp: timestamp || new Date().toISOString(),
      processed: false,
    });
    saveDumps(dumps);

    console.log('[brain-dump]', { text: text.substring(0, 100), timestamp });

    return NextResponse.json({ ok: true, message: 'Jarvis got it ⚡' });
  } catch (error) {
    console.error('[brain-dump POST]', error);
    return NextResponse.json({ error: 'Failed to save brain dump' }, { status: 500 });
  }
}
