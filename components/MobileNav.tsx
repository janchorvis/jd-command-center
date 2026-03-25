'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/deals', label: 'Deals', icon: '💼' },
  { href: '/week', label: 'Week', icon: '📋' },
  { href: '/tasks', label: 'Tasks', icon: '✅' },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      {/* Slim top bar */}
      <div className="bg-white border-b border-slate-200 px-4 h-12 flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-[#7A9A8A] flex items-center justify-center text-white text-xs font-bold">
          ⚡
        </div>
        <span className="text-base font-semibold text-slate-900">Command Center</span>
      </div>

      {/* Fixed bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 flex"
        style={{ height: '60px', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(tab => {
          const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span
                className="text-xs leading-none"
                style={{ color: isActive ? '#7a9a8a' : '#94a3b8' }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
