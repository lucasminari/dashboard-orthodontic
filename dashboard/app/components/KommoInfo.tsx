'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { GraficoLeadsPorDia } from './GraficoLeadsPorDia';

interface Props {
  origem: string;
  unidadeId: number | null;
  dataInicio?: string;
  dataFim?: string;
  /** Comparativo: agendados que estao no Sistema (CampanhasReport) */
  agendadosNoSistema: number;
}

interface Resposta {
  origem: string;
  total_leads_novos: number;
  por_unidade: Record<string, number>;
  sem_unidade_ainda: number;
  filtrados_unidade: {
    total: number;
    agendados_kommo: number;
    perdidos_kommo: number;
    em_atendimento: number;
    leads_em_ponto_morto: number;
    tempo_medio_agendamento_dias: number | null;
  };
  serie_leads_por_dia: { data: string; total: number }[];
}

function corDiff(diff: number): string {
  if (diff === 0) return 'text-emerald-300';
  if (Math.abs(diff) <= 3) return 'text-amber-300';
  return 'text-red-400';
}

function fmtDias(d: number | null): string {
  if (d === null) return '—';
  if (d < 1) return `${(d * 24).toFixed(0)}h`;
  return `${d.toFixed(1)}d`;
}

export function KommoInfo({ origem, unidadeId, dataInicio, dataFim, agendadosNoSistema }: Props) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams({ origem });
    if (unidadeId) params.set('unidade_id', String(unidadeId));
    if (dataInicio) params.set('data_inicio', dataInicio);
    if (dataFim) params.set('data_fim', dataFim);

    fetch(`/api/kommo-detalhe?${params.toString()}`)
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
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-blue-400">📊</span>
          <span className="text-blue-300 font-semibold uppercase tracking-wider text-[10px]">Kommo</span>
        </div>
        <div className="space-y-1">
          <div className="h-3 bg-blue-900/40 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-blue-900/40 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-gray-600">📊</span>
          <span className="text-gray-600 font-semibold uppercase tracking-wider text-[10px]">Kommo</span>
        </div>
        <p className="text-gray-600 italic">
          {erro || 'Sem dados sincronizados.'}
        </p>
      </div>
    );
  }

  // Auditoria: Kommo agendados vs Sistema agendados
  const diffAuditoria = dados.filtrados_unidade.agendados_kommo - agendadosNoSistema;
  const auditoriaCor = corDiff(diffAuditoria);
  const auditoriaIcone = diffAuditoria === 0 ? '✅' : Math.abs(diffAuditoria) <= 3 ? '⚠️' : '🚨';

  return (
    <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-4 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-blue-400">📊</span>
          <span className="text-blue-300 font-semibold uppercase tracking-wider text-[10px]">
            Kommo (CRM)
          </span>
        </div>
        <span className="text-blue-400 text-[10px]">
          {dados.filtrados_unidade.total} leads na unidade
        </span>
      </div>

      {/* Leads novos no periodo (geral, todas as unidades) — clicavel */}
      <div>
        <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">
          Leads novos no período (todas unidades)
        </div>
        <button
          onClick={() => setModalAberto(true)}
          className="text-2xl font-bold text-white tabular-nums hover:text-blue-300 transition cursor-pointer underline decoration-dotted decoration-blue-700/40 underline-offset-4"
          title="Clique pra ver detalhamento dia a dia"
        >
          {dados.total_leads_novos} <span className="text-xs text-blue-400">📊</span>
        </button>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2 text-[11px]">
          <span className="text-gray-400">Centro:</span>
          <span className="text-gray-200 text-right tabular-nums">{dados.por_unidade.Centro}</span>
          <span className="text-gray-400">Várzea:</span>
          <span className="text-gray-200 text-right tabular-nums">{dados.por_unidade['Várzea Paulista']}</span>
          <span className="text-gray-400">Hortolândia:</span>
          <span className="text-gray-200 text-right tabular-nums">{dados.por_unidade.Hortolândia}</span>
          {dados.sem_unidade_ainda > 0 && (
            <>
              <span className="text-amber-300">⏳ Em qualificação:</span>
              <span className="text-amber-300 text-right tabular-nums">{dados.sem_unidade_ainda}</span>
            </>
          )}
        </div>
      </div>

      {/* Auditoria Kommo x Sistema */}
      <div className="border-t border-blue-800/30 pt-2">
        <div className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">
          Auditoria — Kommo vs Sistema
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-300">
            Kommo: <strong className="text-white tabular-nums">{dados.filtrados_unidade.agendados_kommo}</strong> agendados
          </span>
          <span className="text-gray-300">
            Sistema: <strong className="text-white tabular-nums">{agendadosNoSistema}</strong>
          </span>
        </div>
        <div className={`mt-1 text-[11px] font-medium ${auditoriaCor}`}>
          {auditoriaIcone}{' '}
          {diffAuditoria === 0
            ? 'Bate certinho'
            : diffAuditoria > 0
              ? `Faltam ${diffAuditoria} no Sistema (operadora não registrou)`
              : `${Math.abs(diffAuditoria)} a mais no Sistema (entrada direta sem CRM)`}
        </div>
      </div>

      {/* Tempo medio + ponto morto */}
      <div className="border-t border-blue-800/30 pt-2 grid grid-cols-2 gap-2">
        <div>
          <div className="text-gray-400 text-[10px] uppercase tracking-wider">⏱ Tempo médio</div>
          <div className="text-white font-medium">
            {fmtDias(dados.filtrados_unidade.tempo_medio_agendamento_dias)}
          </div>
          <div className="text-[10px] text-gray-500">criação → agendamento</div>
        </div>
        <div>
          <div className="text-gray-400 text-[10px] uppercase tracking-wider">😴 Em ponto morto</div>
          <div
            className={`font-medium ${
              dados.filtrados_unidade.leads_em_ponto_morto === 0 ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            {dados.filtrados_unidade.leads_em_ponto_morto}
          </div>
          <div className="text-[10px] text-gray-500">5+ dias sem avançar</div>
        </div>
      </div>

      {/* Modal de detalhamento dia a dia */}
      <Modal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        titulo={`Leads novos por dia — ${origem}`}
        subtitulo={`Centro/Várzea/Hortolândia · ${dataInicio || ''} a ${dataFim || ''}`}
        largura="lg"
      >
        <GraficoLeadsPorDia
          origem={origem}
          unidadeId={unidadeId}
          dataInicio={dataInicio}
          dataFim={dataFim}
        />
      </Modal>
    </div>
  );
}
