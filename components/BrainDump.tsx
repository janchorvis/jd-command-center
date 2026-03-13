'use client';

import { useState } from 'react';

export default function BrainDump() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/brain-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), timestamp: new Date().toISOString() }),
      });
      if (res.ok) {
        setLastSubmitted(text.trim());
        setText('');
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-8">
      {/* Collapsed toggle bar */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-3 bg-[#7a9a8a] hover:bg-[#7a9a8a]/90 text-white rounded-xl transition"
      >
        <span className="font-medium text-sm">💭 Brain Dump</span>
        <span className="text-white/70 text-xs">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-b-xl rounded-t-none border-t-0 px-5 pb-5 pt-4">
          <form onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:border-[#7a9a8a] focus:ring-1 focus:ring-[#7a9a8a] transition"
              rows={3}
              autoFocus
            />
            <div className="flex items-center justify-between mt-3">
              <button
                type="submit"
                disabled={!text.trim() || submitting}
                className="bg-[#7a9a8a] hover:bg-[#7a9a8a]/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-xl transition"
              >
                {submitting ? 'Sending...' : 'Send to Jarvis'}
              </button>
              {submitted && (
                <span className="text-sm text-emerald-600 animate-pulse">Jarvis got it ⚡</span>
              )}
            </div>
            {submitted && lastSubmitted && (
              <div className="mt-2 text-xs text-slate-400">
                ✅ {lastSubmitted.length > 50 ? lastSubmitted.slice(0, 50) + '...' : lastSubmitted}
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
