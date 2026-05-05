'use client';

import { useEffect, useState } from 'react';

interface Props {
  origem: string;
  unidadeId: number | null;
  dataInicio?: string;
  dataFim?: string;
}

interface Resposta {
  origem: string;
  fonte: 'kommo' | 'performance';
  serie: { data: string; total: number }[];
  total: number;
  max: number;
  dia_pico: { data: string; total: number };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function fmtDataCurta(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${MESES[(m || 1) - 1]}`;
}

function diaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay(); // 0 = domingo
}

export function GraficoLeadsPorDia({ origem, unidadeId, dataInicio, dataFim }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!dataInicio || !dataFim) {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams({ origem, data_inicio: dataInicio, data_fim: dataFim });
    if (unidadeId) params.set('unidade_id', String(unidadeId));

    fetch(`/api/leads-por-dia?${params.toString()}`)
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
  }, [origem, unidadeId, dataInicio, dataFim]);

  if (carregando) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="h-24 bg-gray-900/40 rounded animate-pulse" />
      </div>
    );
  }

  if (erro || !dados || dados.serie.length === 0) {
    return null;
  }

  const { serie, total, max, dia_pico, fonte } = dados;
  const labelFonte = fonte === 'kommo' ? 'leads novos no CRM' : 'atendimentos';

  // Media diaria pra desenhar linha de referencia
  const diasComDado = serie.filter(d => d.total > 0).length;
  const media = diasComDado > 0 ? total / diasComDado : 0;

  return (
    <div className="mt-4 pt-4 border-t border-gray-800">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h4 className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
            📅 Histórico diário
          </h4>
          <p className="text-[10px] text-gray-500">
            {labelFonte} — {total} no total · média {media.toFixed(1)}/dia ativo
          </p>
        </div>
        {dia_pico.total > 0 && (
          <span className="text-[10px] text-emerald-400">
            🔝 Pico: {dia_pico.total} em {fmtDataCurta(dia_pico.data)}
          </span>
        )}
      </div>

      <div className="flex items-end gap-[2px] h-20">
        {serie.map(d => {
          const altura = max > 0 ? (d.total / max) * 100 : 0;
          const ds = diaSemana(d.data);
          const ehFimDeSemana = ds === 0 || ds === 6;
          const ehPico = d.total > 0 && d.total === max;
          const cor = ehPico
            ? '#10b981'
            : ehFimDeSemana
              ? '#475569'
              : d.total > 0
                ? '#6366f1'
                : '#1f2937';
          return (
            <div
              key={d.data}
              className="flex-1 relative group cursor-default"
              style={{ minWidth: '4px' }}
            >
              <div
                className="rounded-t transition-all hover:opacity-80"
                style={{
                  height: `${Math.max(altura, d.total > 0 ? 4 : 1)}%`,
                  backgroundColor: cor,
                  minHeight: d.total > 0 ? '2px' : '1px',
                }}
              />
              {/* Tooltip ao passar o mouse */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap shadow-lg">
                <div className="font-semibold">{fmtDataCurta(d.data)}</div>
                <div className="text-gray-400">
                  {d.total} {d.total === 1 ? 'entrada' : 'entradas'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Eixo X: marca apenas alguns dias */}
      <div className="flex items-start gap-[2px] mt-1">
        {serie.map((d, i) => {
          const dia = parseInt(d.data.slice(8, 10), 10);
          // Mostra dias 1, 5, 10, 15, 20, 25 (ou último)
          const mostrar = dia === 1 || dia % 5 === 0 || i === serie.length - 1;
          return (
            <div key={d.data} className="flex-1 text-center" style={{ minWidth: '4px' }}>
              {mostrar && (
                <span className="text-[8px] text-gray-600 tabular-nums">{dia}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#6366f1' }}></span>
          dia útil
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#475569' }}></span>
          fim de semana
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: '#10b981' }}></span>
          dia pico
        </span>
      </div>
    </div>
  );
}
