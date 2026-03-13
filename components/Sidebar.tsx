'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/deals', label: 'Deals', icon: '💼' },
  { href: '/prep', label: 'Prep', icon: '📋' },
  { href: '/tasks', label: 'Tasks', icon: '✅' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[280px] flex-col bg-white border-r border-slate-200 z-40">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#7A9A8A] flex items-center justify-center text-white text-lg font-bold">
          ⚡
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Command Center</h1>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-4 space-y-1">
        {links.map(link => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-[#7A9A8A] text-white border border-[#7A9A8A]'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-[#7a9a8a]/5 hover:border-[#7a9a8a]/30'
              }`}
            >
              <span>{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-6">
        <p className="text-xs text-slate-500">Anchor Investments</p>
      </div>
    </aside>
  );
}
