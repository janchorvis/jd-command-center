import Link from 'next/link';
import type { Focus3, Focus3Item } from '@/lib/hot-deals';

interface Props {
  focus3?: Focus3;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function UrgencyDot({ urgency }: { urgency: Focus3Item['urgency'] }) {
  const colors = {
    high: 'bg-red-500',
    medium: 'bg-yellow-400',
    low: 'bg-slate-300',
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${colors[urgency]}`}
      title={urgency}
    />
  );
}

export default function Focus3({ focus3 }: Props) {
  if (!focus3 || !focus3.items || focus3.items.length === 0) {
    return null;
  }

  const generatedAt = new Date(focus3.generatedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 mb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-lg font-semibold text-slate-900">Today&apos;s Focus</h2>
        <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          Jarvis pick
        </span>
        <span className="ml-auto text-xs text-slate-400">as of {generatedAt}</span>
      </div>

      {/* Items */}
      <div className="space-y-4">
        {focus3.items.map((item, idx) => {
          const isPipeline = item.type === 'pipeline';
          const slug = isPipeline ? slugify(item.dealName) : null;

          const inner = (
            <div className="flex items-start gap-3 group">
              <UrgencyDot urgency={item.urgency} />
              <div className="flex-1 min-w-0">
                {/* Deal name + property */}
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {idx + 1}.
                  </span>
                  <span className="font-semibold text-slate-900 text-sm">{item.dealName}</span>
                  {item.property && (
                    <span className="text-xs text-slate-400">&mdash; {item.property}</span>
                  )}
                </div>
                {/* Action */}
                <p className="text-sm font-medium text-slate-800 mt-0.5 leading-snug">
                  {item.action}
                </p>
                {/* Why */}
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{item.why}</p>
              </div>
              {isPipeline && slug && (
                <span className="text-slate-300 group-hover:text-[#7a9a8a] transition shrink-0 text-sm">
                  →
                </span>
              )}
            </div>
          );

          if (isPipeline && slug) {
            // Find deal by slug — try exact match first, then fuzzy
            return (
              <Link key={item.id} href={`/deals`} className="block hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg transition">
                {inner}
              </Link>
            );
          }

          return (
            <div key={item.id} className="block -mx-2 px-2 py-1.5">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
