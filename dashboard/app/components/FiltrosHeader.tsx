'use client';

import { UNIDADES, PERIODOS, PeriodoId } from './useFiltros';

interface Props {
  unidadeId: number;
  periodoId: PeriodoId;
  setUnidadeId: (id: number) => void;
  setPeriodoId: (id: PeriodoId) => void;
  /** Esconde o seletor de unidade (pra tela /comparativo) */
  semUnidade?: boolean;
}

export function FiltrosHeader({
  unidadeId,
  periodoId,
  setUnidadeId,
  setPeriodoId,
  semUnidade = false,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={periodoId}
        onChange={e => setPeriodoId(e.target.value as PeriodoId)}
        className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
      >
        {PERIODOS.map(p => (
          <option key={p.id} value={p.id}>{p.nome}</option>
        ))}
      </select>
      {!semUnidade && (
        <select
          value={unidadeId}
          onChange={e => setUnidadeId(Number(e.target.value))}
          className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        >
          {UNIDADES.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      )}
    </div>
  );
}
