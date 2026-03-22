import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

// Vercel: read seed from repo data/, write to /tmp (ephemeral but writable)
const INBOX_SEED = join(process.cwd(), 'data', 'inbox.json');
const INBOX_PATH = '/tmp/inbox.json';

interface InboxContext {
  type: string;
  url?: string;
  title?: string;
  sender?: string;
  selectedText?: string;
  metadata?: Record<string, unknown>;
}

interface InboxItem {
  id: string;
  receivedAt: string;
  status: 'received' | 'processing' | 'completed';
  context: InboxContext;
  comment: string;
  action: string;
  priority: 'normal' | 'urgent';
  result: null | Record<string, unknown>;
}

interface InboxData {
  items: InboxItem[];
}

function readInbox(): InboxData {
  try {
    if (existsSync(INBOX_PATH)) {
      return JSON.parse(readFileSync(INBOX_PATH, 'utf-8'));
    }
    // First call on this Lambda: seed from repo
    if (existsSync(INBOX_SEED)) {
      return JSON.parse(readFileSync(INBOX_SEED, 'utf-8'));
    }
  } catch {}
  return { items: [] };
}

function writeInbox(data: InboxData) {
  writeFileSync(INBOX_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId(): string {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `inbox_${ts}_${rand}`;
}

function checkAuth(request: NextRequest): boolean {
  const secret = request.headers.get('x-sync-secret');
  return !!process.env.SYNC_SECRET && secret === process.env.SYNC_SECRET;
}

export async function POST(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { context, comment, action, priority } = body;

    if (!context || !context.type) {
      return NextResponse.json({ error: 'context.type is required' }, { status: 400 });
    }

    const id = generateId();
    const item: InboxItem = {
      id,
      receivedAt: new Date().toISOString(),
      status: 'received',
      context: {
        type: context.type,
        url: context.url || null,
        title: context.title || null,
        sender: context.sender || null,
        selectedText: context.selectedText || null,
        metadata: context.metadata || null,
      },
      comment: comment || '',
      action: action || 'fyi',
      priority: priority === 'urgent' ? 'urgent' : 'normal',
      result: null,
    };

    const inbox = readInbox();
    inbox.items.unshift(item);
    writeInbox(inbox);

    console.log('[inbox POST]', { id, type: context.type, action: item.action });

    return NextResponse.json({
      id,
      status: 'received',
      message: 'Got it',
    });
  } catch (error) {
    console.error('[inbox POST]', error);
    return NextResponse.json({ error: 'Failed to save inbox item' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!checkAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const inbox = readInbox();
    const recent = inbox.items.slice(0, 20);

    return NextResponse.json({
      items: recent,
      total: inbox.items.length,
    });
  } catch (error) {
    console.error('[inbox GET]', error);
    return NextResponse.json({ error: 'Failed to read inbox' }, { status: 500 });
  }
}
