'use client';

import { useEffect, useState } from 'react';
import { UNIDADES, PERIODOS, PeriodoId } from './useFiltros';

interface Props {
  unidadeId: number;
  periodoId: PeriodoId;
  setUnidadeId: (id: number) => void;
  setPeriodoId: (id: PeriodoId) => void;
  /** Esconde o seletor de unidade (pra tela /comparativo) */
  semUnidade?: boolean;
}

/**
 * Filtros com botao "Aplicar". Mudanças nos selects ficam pendentes ate
 * o usuario confirmar. Ao aplicar, propaga e o botao some.
 */
export function FiltrosHeader({
  unidadeId,
  periodoId,
  setUnidadeId,
  setPeriodoId,
  semUnidade = false,
}: Props) {
  // Estado pendente (controlado dentro do componente)
  const [pendUnidadeId, setPendUnidadeId] = useState(unidadeId);
  const [pendPeriodoId, setPendPeriodoId] = useState(periodoId);

  // Sincroniza com props quando mudam de fora (ex: hidratacao do localStorage)
  useEffect(() => {
    setPendUnidadeId(unidadeId);
  }, [unidadeId]);
  useEffect(() => {
    setPendPeriodoId(periodoId);
  }, [periodoId]);

  const houveMudanca =
    pendUnidadeId !== unidadeId || pendPeriodoId !== periodoId;

  const aplicar = () => {
    if (pendUnidadeId !== unidadeId) setUnidadeId(pendUnidadeId);
    if (pendPeriodoId !== periodoId) setPeriodoId(pendPeriodoId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && houveMudanca) aplicar();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" onKeyDown={handleKeyDown}>
      <select
        value={pendPeriodoId}
        onChange={e => setPendPeriodoId(e.target.value as PeriodoId)}
        className={`bg-gray-900 border rounded px-3 py-2 text-sm focus:outline-none transition ${
          pendPeriodoId !== periodoId
            ? 'border-amber-600 ring-1 ring-amber-600/30'
            : 'border-gray-800 focus:border-indigo-500'
        }`}
      >
        {PERIODOS.map(p => (
          <option key={p.id} value={p.id}>{p.nome}</option>
        ))}
      </select>
      {!semUnidade && (
        <select
          value={pendUnidadeId}
          onChange={e => setPendUnidadeId(Number(e.target.value))}
          className={`bg-gray-900 border rounded px-3 py-2 text-sm focus:outline-none transition ${
            pendUnidadeId !== unidadeId
              ? 'border-amber-600 ring-1 ring-amber-600/30'
              : 'border-gray-800 focus:border-indigo-500'
          }`}
        >
          {UNIDADES.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      )}
      {houveMudanca && (
        <button
          onClick={aplicar}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded transition shadow-sm"
        >
          Aplicar
        </button>
      )}
    </div>
  );
}
