import { NextRequest, NextResponse } from 'next/server';

const REPO = 'janchorvis/jd-command-center';
const FILE_PATH = 'data/hot-deals.json';
const API_BASE = 'https://api.github.com';

async function getFileFromGitHub(token: string) {
  const res = await fetch(`${API_BASE}/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`GitHub GET failed: ${res.status}`);
  }
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  return { content, sha: data.sha as string };
}

async function putFileToGitHub(token: string, content: object, sha: string) {
  const encoded = Buffer.from(JSON.stringify(content, null, 2) + '\n').toString('base64');
  const res = await fetch(`${API_BASE}/repos/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'sweep: update state',
      content: encoded,
      sha,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.content.sha as string;
}

export async function POST(request: NextRequest) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'No GITHUB_TOKEN' }, { status: 500 });
  }

  let todaySweep;
  try {
    todaySweep = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  // Try up to 2 times (retry once on SHA conflict)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { content, sha } = await getFileFromGitHub(token);
      content.todaySweep = todaySweep;
      const newSha = await putFileToGitHub(token, content, sha);
      return NextResponse.json({ ok: true, sha: newSha });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // SHA conflict (409) — retry
      if (msg.includes('409') && attempt === 0) continue;
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: 'Sync failed after retry' }, { status: 500 });
}
