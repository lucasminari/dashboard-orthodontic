'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AtualizadoEm } from '../components/AtualizadoEm';
import { useFiltros, UNIDADES, PERIODOS } from '../components/useFiltros';

type FunilOrigem = {
  origem: string;
  fonte: 'kommo' | 'sistema';
  cadastrados: number;
  agendados: number;
  compareceram: number;
  fecharam: number;
  pagaram: number;
  receita: number;
  taxa_cadastro_para_agendamento: number | null;
  taxa_agendamento_para_comparecimento: number | null;
  taxa_comparecimento_para_fechamento: number | null;
  taxa_fechamento_para_pagamento: number | null;
};

type RespostaFunil = {
  funis: FunilOrigem[];
  total: {
    cadastrados: number;
    agendados: number;
    compareceram: number;
    fecharam: number;
    pagaram: number;
    receita: number;
  };
};

type RespostaTendencia = {
  meses: string[];
  origens: Record<string, { serie: number[]; variacao: number | null }>;
};

const ORIGENS_KOMMO = ['Mídia Real', 'DBOUT', 'PitchYes', 'Sorriso Novo', 'Galú'];

function fmtPct(v: number | null): string {
  if (v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

export default function FunisIndividuaisPage() {
  const { unidadeId, periodoId, intervalo, pronto } = useFiltros('mes');
  const [dados, setDados] = useState<RespostaFunil | null>(null);
  const [tendencia, setTendencia] = useState<RespostaTendencia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const unidadeAtual = UNIDADES.find(u => u.id === unidadeId)?.nome ?? '';
  const periodoAtual = PERIODOS.find(p => p.id === periodoId)?.nome ?? '';

  const carregar = useCallback(async (uId: number, desde?: string, ate?: string) => {
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams();
    if (uId) params.set('unidade_id', String(uId));
    if (desde) params.set('data_inicio', desde);
    if (ate) params.set('data_fim', ate);

    const tParams = new URLSearchParams();
    if (uId) tParams.set('unidade_id', String(uId));

    try {
      const [funilRes, tendRes] = await Promise.all([
        fetch(`/api/funil-completo?${params.toString()}`).then(r => r.json()),
        fetch(`/api/tendencia-origens?${tParams.toString()}`).then(r => r.json()),
      ]);
      if (funilRes.error) setErro(funilRes.error);
      else setDados(funilRes);
      if (!tendRes.error) setTendencia(tendRes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!pronto) return;
    carregar(unidadeId, intervalo.desde, intervalo.ate);
  }, [unidadeId, periodoId, intervalo.desde, intervalo.ate, carregar, pronto]);

  // Mostra TODAS as campanhas individualmente — sem agrupar em "Outros".
  // Inclui qualquer campanha que tem QUALQUER atividade no periodo
  // (cadastros, agendados, compareceu, fechou ou pagou). Isso garante
  // que campanhas como UPDONTIC apareçam mesmo sem cadastros novos
  // mas com pacientes que fecharam/pagaram.
  const funisRecebidos = dados?.funis || [];
  const temAtividade = (f: FunilOrigem) =>
    f.cadastrados > 0 || f.agendados > 0 || f.compareceram > 0 || f.fecharam > 0 || f.pagaram > 0;
  const mapPorOrigem = new Map(funisRecebidos.map(f => [f.origem, f]));

  // 5 origens Kommo aparecem sempre, mesmo zeradas
  const kommoFunis: FunilOrigem[] = ORIGENS_KOMMO.map(nome => {
    const existente = mapPorOrigem.get(nome);
    if (existente) return existente;
    return {
      origem: nome,
      fonte: 'kommo' as const,
      cadastrados: 0,
      agendados: 0,
      compareceram: 0,
      fecharam: 0,
      pagaram: 0,
      receita: 0,
      taxa_cadastro_para_agendamento: null,
      taxa_agendamento_para_comparecimento: null,
      taxa_comparecimento_para_fechamento: null,
      taxa_fechamento_para_pagamento: null,
    };
  });
  // Sistema (nao-Kommo): mostra qualquer com atividade, ordenado por
  // cadastrados desc, depois por (agendados+compareceram+fecharam+pagaram).
  const sistemaFunis = funisRecebidos
    .filter(f => f.fonte === 'sistema' && temAtividade(f))
    .sort((a, b) => {
      if (b.cadastrados !== a.cadastrados) return b.cadastrados - a.cadastrados;
      const totA = a.agendados + a.compareceram + a.fecharam + a.pagaram;
      const totB = b.agendados + b.compareceram + b.fecharam + b.pagaram;
      return totB - totA;
    });

  const todasCampanhas = [...kommoFunis, ...sistemaFunis];

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Campanhas</h1>
          <p className="text-gray-400 text-sm mt-1">
            {unidadeAtual} · {periodoAtual} — funil de conversão e onde perde leads, por campanha.
          </p>
          <div className="mt-2">
            <AtualizadoEm
              tipos={['leads', 'sistema', 'performance']}
              unidadeId={unidadeId || undefined}
            />
          </div>
        </header>

        {carregando && <div className="text-gray-400">Carregando...</div>}
        {erro && (
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4">
            {erro}
          </div>
        )}

        {!carregando && !erro && dados && (
          <>
            {todasCampanhas.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
                Nenhuma campanha com leads no período selecionado.
              </div>
            ) : (
              <div className="space-y-4">
                {todasCampanhas.map(f => (
                  <CampanhaCard
                    key={f.origem}
                    f={f}
                    tendenciaOrigem={tendencia?.origens[f.origem]}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function CampanhaCard({
  f,
  tendenciaOrigem,
}: {
  f: FunilOrigem;
  tendenciaOrigem?: { serie: number[]; variacao: number | null };
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <Link
          href={`/origem/${encodeURIComponent(f.origem)}`}
          className="font-semibold text-base text-gray-100 hover:text-indigo-300 transition"
        >
          {f.origem} →
        </Link>
        <div className="flex items-center gap-3">
          {tendenciaOrigem && tendenciaOrigem.serie.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Sparkline serie={tendenciaOrigem.serie} />
              {tendenciaOrigem.variacao !== null && (
                <span
                  className={`text-[10px] whitespace-nowrap ${
                    tendenciaOrigem.variacao >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {tendenciaOrigem.variacao >= 0 ? '↑' : '↓'} {(tendenciaOrigem.variacao * 100).toFixed(0)}%
                </span>
              )}
              <span className="text-[9px] text-gray-600">vs mês ant.</span>
            </div>
          )}
          {f.receita > 0 && (
            <span className="text-emerald-400 font-medium text-xs">
              R$ {f.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">
            Funil de conversão
          </div>
          <FunilConversao f={f} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">
            Onde perde leads
          </div>
          <FunilPerda f={f} />
        </div>
      </div>
    </div>
  );
}

function FunilConversao({ f }: { f: FunilOrigem }) {
  const etapas = [
    { nome: 'Cadastrados', valor: f.cadastrados, cor: '#6366f1', taxa: null as number | null },
    { nome: 'Agendados', valor: f.agendados, cor: '#06b6d4', taxa: f.taxa_cadastro_para_agendamento },
    { nome: 'Compareceram', valor: f.compareceram, cor: '#a855f7', taxa: f.taxa_agendamento_para_comparecimento },
    { nome: 'Fecharam', valor: f.fecharam, cor: '#eab308', taxa: f.taxa_comparecimento_para_fechamento },
    { nome: 'Pagaram', valor: f.pagaram, cor: '#10b981', taxa: f.taxa_fechamento_para_pagamento },
  ];
  const max = Math.max(...etapas.map(e => e.valor), 1);
  const minLg = 12;
  const maxLg = 100;

  return (
    <div className="space-y-1">
      {etapas.map((e, i) => {
        const lg = e.valor === 0 ? 6 : Math.max((e.valor / max) * maxLg, minLg);
        const taxaProx = etapas[i + 1]?.taxa;
        return (
          <div key={e.nome}>
            <div className="flex justify-center">
              <div
                className="rounded transition-all flex items-center justify-center text-white font-semibold py-2 shadow-sm"
                style={{
                  width: `${lg}%`,
                  background: `linear-gradient(135deg, ${e.cor}, ${e.cor}dd)`,
                  boxShadow: `0 1px 4px ${e.cor}33`,
                  minWidth: '90px',
                }}
              >
                <div className="text-center">
                  <div className="text-[9px] uppercase tracking-wider opacity-80 leading-tight">{e.nome}</div>
                  <div className="text-base leading-tight">{e.valor.toLocaleString('pt-BR')}</div>
                </div>
              </div>
            </div>
            {i < etapas.length - 1 && taxaProx !== null && (
              <div className="text-center text-[10px] text-gray-500 py-0.5">
                ↓ {fmtPct(taxaProx)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FunilPerda({ f }: { f: FunilOrigem }) {
  // Cada "degrau" mostra quantos lead perderam entre etapa N e N+1
  const transicoes = [
    {
      de: 'Cadastrados',
      para: 'Agendados',
      perdidos: f.cadastrados - f.agendados,
      base: f.cadastrados,
    },
    {
      de: 'Agendados',
      para: 'Compareceram',
      perdidos: f.agendados - f.compareceram,
      base: f.agendados,
    },
    {
      de: 'Compareceram',
      para: 'Fecharam',
      perdidos: f.compareceram - f.fecharam,
      base: f.compareceram,
    },
    {
      de: 'Fecharam',
      para: 'Pagaram',
      perdidos: f.fecharam - f.pagaram,
      base: f.fecharam,
    },
  ].map(t => ({
    ...t,
    pct: t.base > 0 ? t.perdidos / t.base : 0,
    perdidos: Math.max(t.perdidos, 0), // Se inversao (mais comp que agend), trata como 0
  }));

  const maxPerda = Math.max(...transicoes.map(t => t.perdidos), 1);
  const totalPerdido = transicoes.reduce((s, t) => s + t.perdidos, 0);
  const maiorPerdaIdx = transicoes.findIndex(
    t => t.perdidos === Math.max(...transicoes.map(x => x.perdidos))
  );

  return (
    <div className="space-y-2">
      {transicoes.map((t, i) => {
        const lg = t.perdidos === 0 ? 0 : Math.max((t.perdidos / maxPerda) * 100, 8);
        const isGargalo = i === maiorPerdaIdx && t.perdidos > 0;
        return (
          <div key={`${t.de}-${t.para}`} className="space-y-1">
            <div className="flex items-baseline justify-between text-[10px]">
              <span className={`${isGargalo ? 'text-red-300 font-semibold' : 'text-gray-400'}`}>
                {t.de} → {t.para}
                {isGargalo && <span className="ml-1 text-red-400">⚠ maior gargalo</span>}
              </span>
              <span className={`tabular-nums ${isGargalo ? 'text-red-300 font-semibold' : 'text-gray-500'}`}>
                {t.perdidos > 0 ? `−${t.perdidos}` : '0'} ({(t.pct * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="bg-gray-800/60 rounded h-5 overflow-hidden relative">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${lg}%`,
                  background: isGargalo
                    ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                    : 'linear-gradient(135deg, #ef4444aa, #b91c1caa)',
                  minWidth: t.perdidos > 0 ? '24px' : '0',
                }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-2 mt-2 border-t border-gray-800 flex items-baseline justify-between text-[11px]">
        <span className="text-gray-400">Total perdido no funil</span>
        <span className="text-red-300 font-semibold tabular-nums">
          −{totalPerdido} de {f.cadastrados}
          {f.cadastrados > 0 && (
            <span className="text-gray-500 font-normal ml-1">
              ({((totalPerdido / f.cadastrados) * 100).toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function Sparkline({ serie }: { serie: number[] }) {
  if (serie.length === 0) return null;
  const max = Math.max(...serie, 1);
  const w = 70;
  const h = 18;
  const pontos = serie
    .map((v, i) => {
      const x = (i / Math.max(serie.length - 1, 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');
  const ult = serie[serie.length - 1];
  const pen = serie[serie.length - 2] || 0;
  const cor = ult > pen ? '#10b981' : ult < pen ? '#ef4444' : '#6366f1';
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline fill="none" stroke={cor} strokeWidth="1.5" points={pontos} />
    </svg>
  );
}
