'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getUser, getToken, logout, type User } from '@/lib/api-client';

export default function AtencaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (!t || !u) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setUser(u);
    setPronto(true);
  }, [router, pathname]);

  if (!pronto || !user) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="bg-gray-900 border-b border-gray-800 px-4 md:px-8 py-3 flex items-center gap-4 flex-wrap">
        <h1 className="text-base font-semibold">Central de Atenção</h1>
        <div className="ml-auto flex items-center gap-3 text-sm text-gray-400">
          <span>
            {user.nome}
            {user.role === 'gerente' && user.unidadeId
              ? ` · ${nomeUnidade(user.unidadeId)}`
              : ''}
          </span>
          <button
            onClick={logout}
            className="text-gray-300 hover:text-white"
          >
            Sair
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function nomeUnidade(id: number): string {
  if (id === 1) return 'Centro';
  if (id === 2) return 'Várzea Paulista';
  if (id === 3) return 'Hortolândia';
  return `Unidade ${id}`;
}
