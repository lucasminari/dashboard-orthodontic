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

  // Em telas com logica propria, esconde os filtros globais
  const mostraFiltros =
    pronto &&
    !pathname.startsWith('/import') &&
    !pathname.startsWith('/origem') &&
    !pathname.startsWith('/buscar') &&
    !pathname.startsWith('/metas');
  const semUnidade = pathname.startsWith('/comparativo');

  const linkClass = (path: string, ehInicio = false) =>
    `text-sm font-medium transition-colors ${
      ehInicio
        ? isActive('/') && pathname === '/'
          ? 'text-indigo-400'
          : 'text-gray-300 hover:text-white'
        : isActive(path)
          ? 'text-indigo-400'
          : 'text-gray-300 hover:text-white'
    }`;

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="px-4 md:px-8 py-3 flex items-center gap-4 md:gap-6 flex-wrap">
        <div className="flex gap-3 md:gap-5 flex-wrap items-center">
          <Link href="/" className={linkClass('/', true)}>Painel</Link>
          <Link href="/funis-individuais" className={linkClass('/funis-individuais')}>Campanhas</Link>
          <Link href="/comparativo" className={linkClass('/comparativo')}>Comparativo</Link>
          <Link href="/import" className={linkClass('/import')}>Relatórios</Link>
          <Link href="/metas" className={linkClass('/metas')}>Metas</Link>
          <Link href="/buscar" className={linkClass('/buscar')}>🔍 Buscar</Link>
        </div>
        {mostraFiltros && (
          <div className="md:ml-auto flex items-center gap-2 md:gap-3 flex-wrap">
            <span className="hidden lg:block">
              <AtualizadoEm
                tipos={['campanhas', 'performance']}
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
