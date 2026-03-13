'use client';

import { useState } from 'react';

export default function BrainDump() {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        setText('');
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6">
      <h2 className="text-lg font-bold mb-4">🧠 Brain Dump</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:border-[#7a9a8a] focus:ring-1 focus:ring-[#7a9a8a] transition"
          rows={3}
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
      </form>
    </div>
  );
}
