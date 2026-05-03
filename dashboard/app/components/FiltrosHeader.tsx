'use client';

import { useEffect, useState } from 'react';
import { UNIDADES, PERIODOS, PeriodoId, useFiltros } from './useFiltros';

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
 * o usuario confirmar. Suporte a 'Personalizado' com 2 inputs de data.
 */
export function FiltrosHeader({
  unidadeId,
  periodoId,
  setUnidadeId,
  setPeriodoId,
  semUnidade = false,
}: Props) {
  const { customDesde, customAte, setCustomDesde, setCustomAte } = useFiltros();

  // Estado pendente (controlado dentro do componente)
  const [pendUnidadeId, setPendUnidadeId] = useState(unidadeId);
  const [pendPeriodoId, setPendPeriodoId] = useState(periodoId);
  const [pendDesde, setPendDesde] = useState(customDesde);
  const [pendAte, setPendAte] = useState(customAte);

  useEffect(() => { setPendUnidadeId(unidadeId); }, [unidadeId]);
  useEffect(() => { setPendPeriodoId(periodoId); }, [periodoId]);
  useEffect(() => { setPendDesde(customDesde); }, [customDesde]);
  useEffect(() => { setPendAte(customAte); }, [customAte]);

  const ehPersonalizado = pendPeriodoId === 'personalizado';
  const datasValidas =
    !ehPersonalizado || (pendDesde && pendAte && pendDesde <= pendAte);

  const houveMudanca =
    pendUnidadeId !== unidadeId ||
    pendPeriodoId !== periodoId ||
    (ehPersonalizado && (pendDesde !== customDesde || pendAte !== customAte));

  const aplicar = () => {
    if (!datasValidas) return;
    if (pendUnidadeId !== unidadeId) setUnidadeId(pendUnidadeId);
    if (pendPeriodoId !== periodoId) setPeriodoId(pendPeriodoId);
    if (ehPersonalizado) {
      if (pendDesde !== customDesde) setCustomDesde(pendDesde);
      if (pendAte !== customAte) setCustomAte(pendAte);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && houveMudanca && datasValidas) aplicar();
  };

  const corBorda = (mudou: boolean) =>
    mudou
      ? 'border-amber-600 ring-1 ring-amber-600/30'
      : 'border-gray-800 focus:border-indigo-500';

  return (
    <div className="flex items-center gap-2 flex-wrap" onKeyDown={handleKeyDown}>
      <select
        value={pendPeriodoId}
        onChange={e => setPendPeriodoId(e.target.value as PeriodoId)}
        className={`bg-gray-900 border rounded px-3 py-2 text-sm focus:outline-none transition ${corBorda(pendPeriodoId !== periodoId)}`}
      >
        {PERIODOS.map(p => (
          <option key={p.id} value={p.id}>{p.nome}</option>
        ))}
      </select>

      {ehPersonalizado && (
        <>
          <input
            type="date"
            value={pendDesde}
            onChange={e => setPendDesde(e.target.value)}
            className={`bg-gray-900 border rounded px-2 py-2 text-sm focus:outline-none transition ${corBorda(pendDesde !== customDesde)}`}
            title="Desde"
          />
          <span className="text-xs text-gray-500">até</span>
          <input
            type="date"
            value={pendAte}
            onChange={e => setPendAte(e.target.value)}
            className={`bg-gray-900 border rounded px-2 py-2 text-sm focus:outline-none transition ${corBorda(pendAte !== customAte)}`}
            title="Até"
          />
        </>
      )}

      {!semUnidade && (
        <select
          value={pendUnidadeId}
          onChange={e => setPendUnidadeId(Number(e.target.value))}
          className={`bg-gray-900 border rounded px-3 py-2 text-sm focus:outline-none transition ${corBorda(pendUnidadeId !== unidadeId)}`}
        >
          {UNIDADES.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      )}

      {houveMudanca && (
        <button
          onClick={aplicar}
          disabled={!datasValidas}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition shadow-sm"
          title={datasValidas ? '' : 'Datas inválidas'}
        >
          Aplicar
        </button>
      )}
    </div>
  );
}
