'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiltrosHeader } from './FiltrosHeader';
import { useFiltros } from './useFiltros';
import { AtualizadoEm } from './AtualizadoEm';

export default function Navbar() {
  const pathname = usePathname();
  const { unidadeId, periodoId, setUnidadeId, setPeriodoId, pronto } = useFiltros();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  // Em /import e /origem, esconde os filtros (telas tem logica propria)
  const mostraFiltros =
    pronto && !pathname.startsWith('/import') && !pathname.startsWith('/origem');
  const semUnidade = pathname.startsWith('/comparativo');

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="px-6 md:px-8 py-3 flex items-center gap-6 flex-wrap">
        <div className="flex gap-4 md:gap-6 flex-wrap">
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
            href="/funis-individuais"
            className={`text-sm font-medium transition-colors ${
              isActive('/funis-individuais')
                ? 'text-indigo-400'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Campanhas
          </Link>
          <Link
            href="/comparativo"
            className={`text-sm font-medium transition-colors ${
              isActive('/comparativo')
                ? 'text-indigo-400'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            Comparativo
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
        {mostraFiltros && (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden md:block">
              <AtualizadoEm
                tipos={['leads', 'sistema', 'performance']}
                unidadeId={unidadeId || undefined}
                compacto
              />
            </span>
            <FiltrosHeader
              unidadeId={unidadeId}
              periodoId={periodoId}
              setUnidadeId={setUnidadeId}
              setPeriodoId={setPeriodoId}
              semUnidade={semUnidade}
            />
          </div>
        )}
      </div>
    </nav>
  );
}
