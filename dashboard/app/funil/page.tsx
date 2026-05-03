'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AtualizadoEm } from '../components/AtualizadoEm';

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
  filtro: { unidade_id: number | null; data_inicio: string | null; data_fim: string | null };
  funis: FunilOrigem[];
  total: {
    cadastrados: number;
    agendados: number;
    compareceram: number;
    fecharam: number;
    pagaram: number;
    receita: number;
  };
  contagem: { leads: number; sistema: number; performance: number };
};

const UNIDADES = [
  { id: 0, nome: 'Todas as unidades' },
  { id: 1, nome: 'Centro' },
  { id: 2, nome: 'Várzea Paulista' },
  { id: 3, nome: 'Hortolândia' },
];

const PERIODOS = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'hoje', nome: 'Hoje' },
  { id: '7d', nome: 'Últimos 7 dias' },
  { id: '30d', nome: 'Mês anterior' },
  { id: 'mes', nome: 'Este mês' },
];

// Limite minimo: campanhas com cadastrados <= MIN_PACIENTES vao pra "Outros"
const MIN_PACIENTES = 3;

function intervaloPeriodo(id: string): { desde?: string; ate?: string } {
  const hoje = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (id === 'hoje') return { desde: fmt(hoje), ate: fmt(hoje) };
  if (id === '7d') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 7);
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  if (id === '30d') {
    const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDiaAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { desde: fmt(mesAnterior), ate: fmt(ultimoDiaAnterior) };
  }
  if (id === 'mes') {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  return {};
}

function fmtPct(v: number | null): string {
  if (v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

export default function FunilPage() {
  const [unidadeId, setUnidadeId] = useState(0);
  const [periodoId, setPeriodoId] = useState('mes');
  const [dados, setDados] = useState<RespostaFunil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [outrosAberto, setOutrosAberto] = useState(false);

  const carregar = useCallback(async (uId: number, pId: string) => {
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams();
    if (uId) params.set('unidade_id', String(uId));
    const intervalo = intervaloPeriodo(pId);
    if (intervalo.desde) params.set('data_inicio', intervalo.desde);
    if (intervalo.ate) params.set('data_fim', intervalo.ate);

    try {
      const res = await fetch(`/api/funil-completo?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error || 'Erro ao carregar dados');
      } else {
        setDados(json);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(unidadeId, periodoId);
  }, [unidadeId, periodoId, carregar]);

  // Classifica: campanhas com mais de MIN_PACIENTES = principais; resto = outros
  const todas = (dados?.funis || []).filter(f => f.cadastrados > 0);
  const principais = todas
    .filter(f => f.cadastrados > MIN_PACIENTES)
    .sort((a, b) => b.cadastrados - a.cadastrados);
  const outros = todas
    .filter(f => f.cadastrados <= MIN_PACIENTES)
    .sort((a, b) => b.cadastrados - a.cadastrados);

  const total = dados?.total;

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Funil por campanha</h1>
          <p className="text-gray-400 text-sm mt-1">
            Caminho do lead do cadastro ao pagamento, separado por campanha de origem.
          </p>
          <div className="mt-2">
            <AtualizadoEm
              tipos={['leads', 'sistema', 'performance']}
              unidadeId={unidadeId || undefined}
            />
          </div>
        </header>

        {/* Filtros */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Unidade</label>
            <select
              value={unidadeId}
              onChange={e => setUnidadeId(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            >
              {UNIDADES.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Período</label>
            <select
              value={periodoId}
              onChange={e => setPeriodoId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            >
              {PERIODOS.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-xs text-gray-500">
            {dados && (
              <>
                {dados.contagem.leads} leads · {dados.contagem.sistema} no sistema
              </>
            )}
          </div>
        </div>

        {carregando && <div className="text-gray-400">Carregando...</div>}
        {erro && (
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4 mb-6">
            {erro}
          </div>
        )}

        {!carregando && !erro && dados && (
          <>
            {/* Cards Total */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
              <CardTotal titulo="Cadastrados" valor={total?.cadastrados || 0} cor="blue" />
              <CardTotal titulo="Agendados" valor={total?.agendados || 0} cor="cyan" />
              <CardTotal titulo="Compareceram" valor={total?.compareceram || 0} cor="purple" />
              <CardTotal titulo="Fecharam" valor={total?.fecharam || 0} cor="amber" />
              <CardTotal titulo="Pagaram" valor={total?.pagaram || 0} cor="emerald" />
            </div>

            {principais.length === 0 && outros.length === 0 ? (
              <div className="text-gray-500 text-sm py-8 text-center bg-gray-900 border border-gray-800 rounded-xl">
                Nenhuma campanha com leads no período selecionado.
              </div>
            ) : (
              <>
                {/* Grid de mini-funis */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {principais.map(f => (
                    <MiniFunil key={f.origem} f={f} />
                  ))}
                </div>

                {/* Outros expansivel */}
                {outros.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOutrosAberto(v => !v)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-800/40 transition"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <span className="text-gray-400 text-sm">{outrosAberto ? '▼' : '▶'}</span>
                        <div>
                          <div className="font-medium text-gray-200">
                            Outros ({outros.length} {outros.length === 1 ? 'campanha' : 'campanhas'})
                          </div>
                          <div className="text-xs text-gray-500">
                            Campanhas com até {MIN_PACIENTES} pacientes — clique para detalhar
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 hidden sm:block">
                        Total: {outros.reduce((s, o) => s + o.cadastrados, 0)} cad. ·{' '}
                        {outros.reduce((s, o) => s + o.pagaram, 0)} pag.
                      </div>
                    </button>
                    {outrosAberto && (
                      <div className="p-4 border-t border-gray-800 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {outros.map(f => (
                          <MiniFunil key={f.origem} f={f} compact />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function CardTotal({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  const cores: Record<string, string> = {
    blue: 'border-blue-700/60 bg-blue-950/30 text-blue-100',
    cyan: 'border-cyan-700/60 bg-cyan-950/30 text-cyan-100',
    purple: 'border-purple-700/60 bg-purple-950/30 text-purple-100',
    amber: 'border-amber-700/60 bg-amber-950/30 text-amber-100',
    emerald: 'border-emerald-700/60 bg-emerald-950/30 text-emerald-100',
  };
  return (
    <div className={`rounded-lg border p-4 ${cores[cor]}`}>
      <div className="text-[10px] uppercase tracking-widest opacity-70 mb-1">{titulo}</div>
      <div className="text-2xl font-semibold">{valor.toLocaleString('pt-BR')}</div>
    </div>
  );
}

function MiniFunil({ f, compact = false }: { f: FunilOrigem; compact?: boolean }) {
  const etapas = [
    { nome: 'Cadastrados', valor: f.cadastrados, cor: '#6366f1', taxa: null as number | null },
    { nome: 'Agendados', valor: f.agendados, cor: '#06b6d4', taxa: f.taxa_cadastro_para_agendamento },
    { nome: 'Compareceram', valor: f.compareceram, cor: '#a855f7', taxa: f.taxa_agendamento_para_comparecimento },
    { nome: 'Fecharam', valor: f.fecharam, cor: '#eab308', taxa: f.taxa_comparecimento_para_fechamento },
    { nome: 'Pagaram', valor: f.pagaram, cor: '#10b981', taxa: f.taxa_fechamento_para_pagamento },
  ];
  const max = Math.max(...etapas.map(e => e.valor), 1);

  return (
    <Link
      href={`/origem/${encodeURIComponent(f.origem)}`}
      className={`block bg-gray-900 border border-gray-800 hover:border-indigo-700/60 hover:bg-gray-900/90 transition rounded-lg ${compact ? 'p-3' : 'p-5'} cursor-pointer`}
    >
      <div className={`flex items-baseline justify-between mb-${compact ? '2' : '4'}`}>
        <h3 className={`font-semibold ${compact ? 'text-sm' : 'text-base'} text-gray-100 truncate pr-2`}>
          {f.origem}
        </h3>
        {f.receita > 0 && (
          <span className={`text-emerald-400 font-medium ${compact ? 'text-[10px]' : 'text-xs'} whitespace-nowrap`}>
            R$ {f.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
      <div className={`space-y-${compact ? '1' : '2'}`}>
        {etapas.map(e => {
          const pct = (e.valor / max) * 100;
          return (
            <div key={e.nome} className="flex items-center gap-2">
              <div className={`${compact ? 'w-20 text-[10px]' : 'w-24 text-xs'} text-gray-400 shrink-0`}>{e.nome}</div>
              <div className={`flex-1 bg-gray-800 rounded ${compact ? 'h-5' : 'h-6'} relative overflow-hidden`}>
                <div
                  className="h-full rounded flex items-center pl-2"
                  style={{ width: `${pct}%`, backgroundColor: e.cor, minWidth: e.valor > 0 ? '24px' : '0' }}
                >
                  <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold text-white`}>
                    {e.valor}
                  </span>
                </div>
              </div>
              <div className={`${compact ? 'w-9 text-[10px]' : 'w-10 text-xs'} text-right text-gray-500 shrink-0`}>
                {e.taxa === null ? '' : fmtPct(e.taxa)}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`${compact ? 'mt-2' : 'mt-3'} text-[10px] text-indigo-400/70 text-right`}>
        ver detalhes →
      </div>
    </Link>
  );
}
