'use client';

import { useEffect, useState } from 'react';

interface Props {
  origem: string;
  unidadeId: number | null;
}

interface Etapa {
  id: number;
  nome: string;
  cor: string;
  categoria: string;
  total: number;
}

interface Resposta {
  origem: string;
  total_ativos: number;
  total_perdidos: number;
  total_desconhecido: number;
  max: number;
  etapas: Etapa[];
}

export function DistribuicaoEtapasKommo({ origem, unidadeId }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams({ origem });
    if (unidadeId) params.set('unidade_id', String(unidadeId));
    fetch(`/api/kommo-distribuicao-etapas?${params.toString()}`)
      .then(r => r.json())
      .then(d => {
        if (cancelado) return;
        if (d.error) setErro(d.error);
        else setDados(d);
      })
      .catch(e => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : 'erro');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [origem, unidadeId]);

  if (carregando) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="h-6 bg-gray-800/50 rounded animate-pulse w-1/3 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-5 bg-gray-800/40 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (erro || !dados || dados.etapas.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-800">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h4 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
            🔵 Onde estão os leads agora
          </h4>
          <p className="text-[10px] text-gray-500">
            Distribuição dos {dados.total_ativos} leads ativos por etapa do funil Kommo
          </p>
        </div>
        {dados.total_perdidos > 0 && (
          <span className="text-[10px] text-gray-600">
            ❌ {dados.total_perdidos} perdidos (não exibidos)
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {dados.etapas.map(e => {
          const pct = (e.total / dados.max) * 100;
          const pctTotal = dados.total_ativos > 0 ? (e.total / dados.total_ativos) * 100 : 0;
          return (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <div className="w-36 text-gray-300 truncate flex-shrink-0">{e.nome}</div>
              <div className="flex-1 bg-gray-800/40 rounded h-5 relative overflow-hidden">
                <div
                  className="h-full rounded transition-all flex items-center pl-2"
                  style={{
                    width: `${Math.max(pct, e.total > 0 ? 4 : 0)}%`,
                    backgroundColor: e.cor,
                    minWidth: e.total > 0 ? '24px' : '0',
                  }}
                >
                  <span className="text-[10px] font-semibold text-gray-900">{e.total}</span>
                </div>
              </div>
              <div className="w-12 text-right text-gray-500 tabular-nums shrink-0">
                {pctTotal.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
