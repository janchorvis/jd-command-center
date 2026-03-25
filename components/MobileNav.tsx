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
      <div className="bg-white border-b border-slate-200 px-4 h-12 flex items-center">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#7A9A8A] flex items-center justify-center text-white text-xs font-bold">
            ⚡
          </div>
          <span className="text-base font-bold text-slate-900">Command Center</span>
        </div>
      </div>

      {/* Fixed bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-[60px]">
          {tabs.map(tab => {
            const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition ${
                  isActive ? 'text-[#7a9a8a]' : 'text-slate-400'
                }`}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
