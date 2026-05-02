'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="px-8 py-4 flex items-center gap-8">
        <div className="flex gap-6">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors ${
              isActive('/') && pathname === '/'
                ? 'text-indigo-400'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Painel
          </Link>
          <Link
            href="/import"
            className={`text-sm font-medium transition-colors ${
              isActive('/import')
                ? 'text-indigo-400'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Relatórios
          </Link>
        </div>
      </div>
    </nav>
  );
}
