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
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">🧠 Brain Dump</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500 transition"
          rows={3}
        />
        <div className="flex items-center justify-between mt-3">
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            {submitting ? 'Sending...' : 'Send to Jarvis'}
          </button>
          {submitted && (
            <span className="text-sm text-green-400 animate-pulse">Jarvis got it ⚡</span>
          )}
        </div>
      </form>
    </div>
  );
}
