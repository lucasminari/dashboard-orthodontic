'use client';

import { useEffect, useState, useCallback } from 'react';
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

type DadosUnidade = {
  unidade_id: number;
  nome: string;
  cor: string;
  funil: RespostaFunil;
};

const UNIDADES = [
  { id: 1, nome: 'Centro', cor: '#6366f1' },
  { id: 2, nome: 'Várzea Paulista', cor: '#a855f7' },
  { id: 3, nome: 'Hortolândia', cor: '#22c55e' },
];

const PERIODOS = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'hoje', nome: 'Hoje' },
  { id: '7d', nome: 'Últimos 7 dias' },
  { id: '30d', nome: 'Mês anterior' },
  { id: 'mes', nome: 'Este mês' },
];

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

function fmtBR(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number | null): string {
  if (v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

export default function ComparativoPage() {
  const [periodoId, setPeriodoId] = useState('mes');
  const [unidades, setUnidades] = useState<DadosUnidade[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (pId: string) => {
    setCarregando(true);
    setErro(null);
    const intervalo = intervaloPeriodo(pId);

    try {
      const promessas = UNIDADES.map(async u => {
        const params = new URLSearchParams();
        params.set('unidade_id', String(u.id));
        if (intervalo.desde) params.set('data_inicio', intervalo.desde);
        if (intervalo.ate) params.set('data_fim', intervalo.ate);
        const res = await fetch(`/api/funil-completo?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(`${u.nome}: ${json.error || 'erro'}`);
        return { unidade_id: u.id, nome: u.nome, cor: u.cor, funil: json };
      });
      const resultado = await Promise.all(promessas);
      setUnidades(resultado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(periodoId);
  }, [periodoId, carregar]);

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Comparativo entre unidades</h1>
          <p className="text-gray-400 text-sm mt-1">
            Centro, Várzea Paulista e Hortolândia lado a lado, do cadastro ao pagamento.
          </p>
          <div className="mt-2">
            <AtualizadoEm tipos={['leads', 'sistema', 'performance']} />
          </div>
        </header>

        {/* Filtro de periodo */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-end">
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
        </div>

        {carregando && <div className="text-gray-400">Carregando...</div>}
        {erro && (
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4 mb-6">
            {erro}
          </div>
        )}

        {!carregando && !erro && unidades && (
          <div className="space-y-8">
            {/* Tabela comparativa principal */}
            <TabelaResumo unidades={unidades} />

            {/* Funis lado a lado */}
            <Section titulo="Funil de conversão" descricao="Mesmo funil para cada unidade — compare onde cada uma perde leads.">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {unidades.map(u => (
                  <FunilCard key={u.unidade_id} u={u} />
                ))}
              </div>
            </Section>

            {/* Top campanhas por unidade */}
            <Section titulo="Top campanhas por unidade" descricao="As 6 maiores campanhas de cada unidade.">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {unidades.map(u => (
                  <TopCampanhas key={u.unidade_id} u={u} />
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {descricao && <p className="text-gray-400 text-sm">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

function TabelaResumo({ unidades }: { unidades: DadosUnidade[] }) {
  const linhas: { label: string; key: 'cadastrados' | 'agendados' | 'compareceram' | 'fecharam' | 'pagaram'; pct?: boolean }[] = [
    { label: 'Cadastrados', key: 'cadastrados' },
    { label: 'Agendados', key: 'agendados' },
    { label: 'Compareceram', key: 'compareceram' },
    { label: 'Fecharam', key: 'fecharam' },
    { label: 'Pagaram', key: 'pagaram' },
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold">Resumo geral</h2>
        <p className="text-gray-400 text-xs">Números absolutos por unidade no período selecionado.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 font-normal"></th>
              {unidades.map(u => (
                <th key={u.unidade_id} className="text-right px-4 py-3 font-medium" style={{ color: u.cor }}>
                  {u.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => {
              const max = Math.max(...unidades.map(u => u.funil.total[l.key]), 1);
              return (
                <tr key={l.key} className="border-b border-gray-800/60 hover:bg-gray-800/20">
                  <td className="px-5 py-3 text-gray-400">{l.label}</td>
                  {unidades.map(u => {
                    const v = u.funil.total[l.key];
                    const isMax = v === max && v > 0;
                    return (
                      <td
                        key={u.unidade_id}
                        className={`px-4 py-3 text-right tabular-nums ${isMax ? 'font-semibold text-emerald-300' : 'text-gray-200'}`}
                      >
                        {v.toLocaleString('pt-BR')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-b border-gray-800 bg-gray-950/50">
              <td className="px-5 py-3 text-gray-400 font-medium">Receita</td>
              {unidades.map(u => {
                const max = Math.max(...unidades.map(x => x.funil.total.receita), 1);
                const v = u.funil.total.receita;
                const isMax = v === max && v > 0;
                return (
                  <td
                    key={u.unidade_id}
                    className={`px-4 py-3 text-right tabular-nums ${isMax ? 'font-semibold text-emerald-400' : 'text-emerald-300/80'}`}
                  >
                    R$ {fmtBR(v)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunilCard({ u }: { u: DadosUnidade }) {
  const t = u.funil.total;
  const etapas = [
    { nome: 'Cadastrados', valor: t.cadastrados, taxa: null as number | null },
    {
      nome: 'Agendados',
      valor: t.agendados,
      taxa: t.cadastrados > 0 ? t.agendados / t.cadastrados : null,
    },
    {
      nome: 'Compareceram',
      valor: t.compareceram,
      taxa: t.agendados > 0 ? t.compareceram / t.agendados : null,
    },
    {
      nome: 'Fecharam',
      valor: t.fecharam,
      taxa: t.compareceram > 0 ? t.fecharam / t.compareceram : null,
    },
    {
      nome: 'Pagaram',
      valor: t.pagaram,
      taxa: t.fecharam > 0 ? t.pagaram / t.fecharam : null,
    },
  ];
  const max = Math.max(...etapas.map(e => e.valor), 1);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-semibold text-base" style={{ color: u.cor }}>
          {u.nome}
        </h3>
        <span className="text-xs text-emerald-400">
          R$ {fmtBR(t.receita)}
        </span>
      </div>
      <div className="space-y-2">
        {etapas.map(e => {
          const pct = (e.valor / max) * 100;
          return (
            <div key={e.nome} className="flex items-center gap-2">
              <div className="w-24 text-xs text-gray-400 shrink-0">{e.nome}</div>
              <div className="flex-1 bg-gray-800 rounded h-7 relative overflow-hidden">
                <div
                  className="h-full rounded flex items-center pl-2"
                  style={{ width: `${pct}%`, backgroundColor: u.cor, minWidth: e.valor > 0 ? '24px' : '0' }}
                >
                  <span className="text-xs font-semibold text-white">{e.valor}</span>
                </div>
              </div>
              <div className="w-10 text-right text-xs text-gray-500 shrink-0">
                {e.taxa === null ? '' : fmtPct(e.taxa)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopCampanhas({ u }: { u: DadosUnidade }) {
  const top = [...u.funil.funis]
    .filter(f => f.cadastrados > 0)
    .sort((a, b) => b.cadastrados - a.cadastrados)
    .slice(0, 6);
  const max = Math.max(...top.map(t => t.cadastrados), 1);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-semibold text-base" style={{ color: u.cor }}>
          {u.nome}
        </h3>
        <span className="text-xs text-gray-500">{u.funil.funis.filter(f => f.cadastrados > 0).length} campanhas</span>
      </div>
      {top.length === 0 ? (
        <div className="text-sm text-gray-500 py-4">Sem campanhas no período.</div>
      ) : (
        <div className="space-y-2">
          {top.map(c => {
            const pct = (c.cadastrados / max) * 100;
            const taxa = c.cadastrados > 0 ? (c.fecharam / c.cadastrados) * 100 : 0;
            return (
              <div key={c.origem}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300 truncate pr-2">{c.origem}</span>
                  <span className="text-gray-400 whitespace-nowrap">
                    {c.cadastrados}
                    {c.fecharam > 0 && (
                      <span className="ml-1 text-emerald-400">· {c.fecharam} ({taxa.toFixed(0)}%)</span>
                    )}
                  </span>
                </div>
                <div className="bg-gray-800 rounded h-1.5 overflow-hidden">
                  <div className="h-full" style={{ width: `${pct}%`, backgroundColor: u.cor }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
