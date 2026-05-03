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
    const m = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const u = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { desde: fmt(m), ate: fmt(u) };
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

export default function FunisIndividuaisPage() {
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
      if (!res.ok) setErro(json.error || 'Erro');
      else setDados(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(unidadeId, periodoId);
  }, [unidadeId, periodoId, carregar]);

  const todas = (dados?.funis || []).filter(f => f.cadastrados > 0);
  const principais = todas
    .filter(f => f.cadastrados > MIN_PACIENTES)
    .sort((a, b) => b.cadastrados - a.cadastrados);
  const outros = todas
    .filter(f => f.cadastrados <= MIN_PACIENTES)
    .sort((a, b) => b.cadastrados - a.cadastrados);

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Funis individuais por campanha</h1>
          <p className="text-gray-400 text-sm mt-1">
            Funil de conversão e funil invertido lado a lado, para visualizar entrada e saída de cada campanha.
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
              {UNIDADES.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Período</label>
            <select
              value={periodoId}
              onChange={e => setPeriodoId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            >
              {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </div>

        {carregando && <div className="text-gray-400">Carregando...</div>}
        {erro && (
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4">
            {erro}
          </div>
        )}

        {!carregando && !erro && dados && (
          <>
            {principais.length === 0 && outros.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
                Nenhuma campanha com leads no período selecionado.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {principais.map(f => <CampanhaCard key={f.origem} f={f} />)}
                </div>

                {outros.length > 0 && (
                  <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOutrosAberto(v => !v)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-800/40 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">{outrosAberto ? '▼' : '▶'}</span>
                        <div className="text-left">
                          <div className="font-medium text-gray-200">
                            Outros ({outros.length} {outros.length === 1 ? 'campanha' : 'campanhas'})
                          </div>
                          <div className="text-xs text-gray-500">
                            Campanhas com até {MIN_PACIENTES} pacientes
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 hidden sm:block">
                        {outros.reduce((s, o) => s + o.cadastrados, 0)} cad. ·{' '}
                        {outros.reduce((s, o) => s + o.pagaram, 0)} pag.
                      </div>
                    </button>
                    {outrosAberto && (
                      <div className="p-4 border-t border-gray-800 space-y-4">
                        {outros.map(f => <CampanhaCard key={f.origem} f={f} />)}
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

function CampanhaCard({ f }: { f: FunilOrigem }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <Link
          href={`/origem/${encodeURIComponent(f.origem)}`}
          className="font-semibold text-base text-gray-100 hover:text-indigo-300 transition"
        >
          {f.origem} →
        </Link>
        {f.receita > 0 && (
          <span className="text-emerald-400 font-medium text-xs">
            R$ {f.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">
            Funil de conversão
          </div>
          <FunilSVG f={f} invertido={false} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 text-center">
            Funil invertido
          </div>
          <FunilSVG f={f} invertido={true} />
        </div>
      </div>
    </div>
  );
}

function FunilSVG({ f, invertido }: { f: FunilOrigem; invertido: boolean }) {
  const etapasBase = [
    { nome: 'Cadastrados', valor: f.cadastrados, cor: '#6366f1', taxa: null as number | null },
    { nome: 'Agendados', valor: f.agendados, cor: '#06b6d4', taxa: f.taxa_cadastro_para_agendamento },
    { nome: 'Compareceram', valor: f.compareceram, cor: '#a855f7', taxa: f.taxa_agendamento_para_comparecimento },
    { nome: 'Fecharam', valor: f.fecharam, cor: '#eab308', taxa: f.taxa_comparecimento_para_fechamento },
    { nome: 'Pagaram', valor: f.pagaram, cor: '#10b981', taxa: f.taxa_fechamento_para_pagamento },
  ];
  const etapas = invertido ? [...etapasBase].reverse() : etapasBase;
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
            {/* Taxa entre etapas (só pra funil normal) */}
            {!invertido && i < etapas.length - 1 && taxaProx !== null && (
              <div className="text-center text-[10px] text-gray-500 py-0.5">
                ↓ {fmtPct(taxaProx)}
              </div>
            )}
            {invertido && i < etapas.length - 1 && etapas[i].taxa !== null && (
              <div className="text-center text-[10px] text-gray-500 py-0.5">
                ↑ {fmtPct(etapas[i].taxa)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
