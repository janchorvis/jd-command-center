'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/deals', label: 'Deals', icon: '💼' },
  { href: '/prep', label: 'Prep', icon: '📋' },
  { href: '/tasks', label: 'Tasks', icon: '✅' },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <div className="bg-white border-b border-slate-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#7A9A8A] flex items-center justify-center text-white text-sm font-bold">
            ⚡
          </div>
          <span className="text-lg font-bold text-slate-900">Command Center</span>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="text-slate-700 hover:text-slate-900 p-2"
          aria-label="Toggle menu"
        >
          {open ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="absolute top-14 left-0 right-0 bg-white border-b border-slate-200 z-50 shadow-lg">
          <div className="px-4 py-2 space-y-1">
            {links.map(link => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 text-sm px-3 py-2.5 rounded-lg transition ${
                    isActive
                      ? 'bg-[#7A9A8A] text-white'
                      : 'text-slate-700 hover:bg-[#7a9a8a]/5'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
