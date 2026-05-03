'use client';

import { useEffect, useState, useCallback } from 'react';
import { AtualizadoEm } from '../components/AtualizadoEm';
import { useFiltros, PERIODOS } from '../components/useFiltros';

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

const UNIDADES_COMP = [
  { id: 1, nome: 'Centro', cor: '#6366f1' },
  { id: 2, nome: 'Várzea Paulista', cor: '#a855f7' },
  { id: 3, nome: 'Hortolândia', cor: '#22c55e' },
];

function fmtBR(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number | null): string {
  if (v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

export default function ComparativoPage() {
  const { periodoId, intervalo, pronto } = useFiltros('mes');
  const [unidades, setUnidades] = useState<DadosUnidade[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const periodoAtual = PERIODOS.find(p => p.id === periodoId)?.nome ?? '';

  const carregar = useCallback(async (desde?: string, ate?: string) => {
    setCarregando(true);
    setErro(null);

    try {
      const promessas = UNIDADES_COMP.map(async u => {
        const params = new URLSearchParams();
        params.set('unidade_id', String(u.id));
        if (desde) params.set('data_inicio', desde);
        if (ate) params.set('data_fim', ate);
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
    if (!pronto) return;
    carregar(intervalo.desde, intervalo.ate);
  }, [periodoId, intervalo.desde, intervalo.ate, carregar, pronto]);

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Comparativo entre unidades</h1>
          <p className="text-gray-400 text-sm mt-1">
            {periodoAtual} — Centro, Várzea Paulista e Hortolândia lado a lado.
          </p>
          <div className="mt-2">
            <AtualizadoEm tipos={['leads', 'sistema', 'performance']} />
          </div>
        </header>

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

            {/* Mesma campanha em diferentes unidades (tabela) */}
            <Section
              titulo="Comparativo por campanha (resumo)"
              descricao="Mesma campanha lado a lado entre unidades — número absoluto. Maior valor de cada linha em destaque."
            >
              <CampanhaPorUnidade unidades={unidades} />
            </Section>

            {/* Detalhamento por campanha — funis nas 3 unidades */}
            <Section
              titulo="Detalhamento por campanha"
              descricao="Funil completo de cada campanha em cada unidade. Vê exatamente onde cada combinação ganha ou perde."
            >
              <DetalheCampanhaPorUnidade unidades={unidades} />
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

function CampanhaPorUnidade({ unidades }: { unidades: DadosUnidade[] }) {
  // Junta todas as campanhas de todas as unidades em um Set, depois mostra
  // pra cada campanha os numeros de cada unidade.
  const todasOrigens = new Set<string>();
  unidades.forEach(u => u.funil.funis.forEach(f => {
    if (f.cadastrados > 0) todasOrigens.add(f.origem);
  }));

  // Ordena: 5 Kommo primeiro (na ordem fixa), depois por volume total desc
  const KOMMO_ORDER = ['Mídia Real', 'DBOUT', 'PitchYes', 'Sorriso Novo', 'Galú'];
  const lista = Array.from(todasOrigens).sort((a, b) => {
    const ai = KOMMO_ORDER.indexOf(a);
    const bi = KOMMO_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    const totalA = unidades.reduce((s, u) => s + (u.funil.funis.find(f => f.origem === a)?.cadastrados || 0), 0);
    const totalB = unidades.reduce((s, u) => s + (u.funil.funis.find(f => f.origem === b)?.cadastrados || 0), 0);
    return totalB - totalA;
  });

  if (lista.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm text-gray-500">
        Nenhuma campanha com leads no período.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/40 text-gray-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-normal">Campanha</th>
              <th className="text-center px-3 py-3 font-normal">Etapa</th>
              {unidades.map(u => (
                <th
                  key={u.unidade_id}
                  className="text-right px-4 py-3 font-medium"
                  style={{ color: u.cor }}
                >
                  {u.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((origem, idx) => {
              const linhas: Array<{ etapa: string; key: 'cadastrados' | 'agendados' | 'compareceram' | 'fecharam' | 'pagaram' }> = [
                { etapa: 'Cadastrados', key: 'cadastrados' },
                { etapa: 'Pagaram', key: 'pagaram' },
              ];
              return linhas.map((l, li) => {
                const valores = unidades.map(u => {
                  const f = u.funil.funis.find(x => x.origem === origem);
                  return f ? f[l.key] : 0;
                });
                const max = Math.max(...valores, 1);
                return (
                  <tr
                    key={`${origem}-${l.key}`}
                    className={`border-t border-gray-800/60 ${li === 0 && idx > 0 ? 'border-t-2 border-t-gray-800' : ''}`}
                  >
                    {li === 0 ? (
                      <td className="px-4 py-2 font-medium text-gray-200" rowSpan={linhas.length}>
                        {origem}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{l.etapa}</td>
                    {unidades.map((u, i) => {
                      const v = valores[i];
                      const isMax = v === max && v > 0;
                      return (
                        <td
                          key={u.unidade_id}
                          className={`px-4 py-2 text-right tabular-nums ${
                            v === 0 ? 'text-gray-800' : isMax ? 'font-semibold' : 'text-gray-300'
                          }`}
                          style={isMax ? { color: u.cor } : undefined}
                        >
                          {v === 0 ? '·' : v.toLocaleString('pt-BR')}
                        </td>
                      );
                    })}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const KOMMO_FIXAS = ['Mídia Real', 'DBOUT', 'PitchYes', 'Sorriso Novo', 'Galú'];

function DetalheCampanhaPorUnidade({ unidades }: { unidades: DadosUnidade[] }) {
  const [aberto, setAberto] = useState<Set<string>>(new Set());

  // Junta todas as origens com atividade em pelo menos uma unidade
  const todasOrigens = new Set<string>();
  unidades.forEach(u => u.funil.funis.forEach(f => {
    if (f.cadastrados > 0 || f.agendados > 0 || f.compareceram > 0 || f.fecharam > 0 || f.pagaram > 0) {
      todasOrigens.add(f.origem);
    }
  }));
  // 5 Kommo aparecem sempre
  KOMMO_FIXAS.forEach(k => todasOrigens.add(k));

  // Ordena: Kommo primeiro na ordem fixa, resto por volume total desc
  const lista = Array.from(todasOrigens).sort((a, b) => {
    const ai = KOMMO_FIXAS.indexOf(a);
    const bi = KOMMO_FIXAS.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    if (a === 'Sem origem') return 1;
    if (b === 'Sem origem') return -1;
    const totalA = unidades.reduce((s, u) => s + (u.funil.funis.find(f => f.origem === a)?.cadastrados || 0), 0);
    const totalB = unidades.reduce((s, u) => s + (u.funil.funis.find(f => f.origem === b)?.cadastrados || 0), 0);
    return totalB - totalA;
  });

  if (lista.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm text-gray-500">
        Nenhuma campanha no período.
      </div>
    );
  }

  function toggle(origem: string) {
    setAberto(prev => {
      const novo = new Set(prev);
      if (novo.has(origem)) novo.delete(origem);
      else novo.add(origem);
      return novo;
    });
  }

  return (
    <div className="space-y-3">
      {lista.map(origem => {
        const expandido = aberto.has(origem);
        // Pega o funil de cada unidade pra essa origem
        const porUnidade = unidades.map(u => {
          const f = u.funil.funis.find(x => x.origem === origem);
          return {
            unidade: u,
            funil: f,
            total: f ? f.cadastrados + f.agendados + f.compareceram + f.fecharam + f.pagaram : 0,
          };
        });
        const totalGeral = porUnidade.reduce((s, x) => s + x.total, 0);

        return (
          <div key={origem} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(origem)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-800/40 transition text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">{expandido ? '▼' : '▶'}</span>
                <span className="font-medium text-gray-100">{origem}</span>
                {totalGeral === 0 && (
                  <span className="text-[10px] text-gray-600 ml-2">(sem dados)</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                {porUnidade.map(({ unidade, funil }) => (
                  <span key={unidade.unidade_id} style={{ color: unidade.cor }}>
                    {unidade.nome.split(' ')[0]}: {funil?.cadastrados || 0}
                  </span>
                ))}
              </div>
            </button>
            {expandido && (
              <div className="border-t border-gray-800 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {porUnidade.map(({ unidade, funil }) => (
                  <MiniFunilUnidade
                    key={unidade.unidade_id}
                    unidade={unidade}
                    funil={funil}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniFunilUnidade({
  unidade,
  funil,
}: {
  unidade: DadosUnidade;
  funil: FunilOrigem | undefined;
}) {
  const f = funil || {
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
  const etapas = [
    { nome: 'Cadastr.', valor: f.cadastrados, taxa: null as number | null },
    { nome: 'Agend.', valor: f.agendados, taxa: f.taxa_cadastro_para_agendamento },
    { nome: 'Compar.', valor: f.compareceram, taxa: f.taxa_agendamento_para_comparecimento },
    { nome: 'Fechou', valor: f.fecharam, taxa: f.taxa_comparecimento_para_fechamento },
    { nome: 'Pagou', valor: f.pagaram, taxa: f.taxa_fechamento_para_pagamento },
  ];
  const max = Math.max(...etapas.map(e => e.valor), 1);

  return (
    <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-semibold text-sm" style={{ color: unidade.cor }}>
          {unidade.nome}
        </span>
        {f.receita > 0 && (
          <span className="text-[10px] text-emerald-400">R$ {fmtBR(f.receita)}</span>
        )}
      </div>
      <div className="space-y-1">
        {etapas.map(e => {
          const pct = (e.valor / max) * 100;
          return (
            <div key={e.nome} className="flex items-center gap-2">
              <div className="w-14 text-[10px] text-gray-400 shrink-0">{e.nome}</div>
              <div className="flex-1 bg-gray-800 rounded h-4 relative overflow-hidden">
                <div
                  className="h-full rounded flex items-center pl-1.5"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: unidade.cor,
                    minWidth: e.valor > 0 ? '20px' : '0',
                  }}
                >
                  <span className="text-[10px] font-semibold text-white">{e.valor}</span>
                </div>
              </div>
              <div className="w-9 text-right text-[10px] text-gray-500 shrink-0">
                {e.taxa === null ? '—' : `${(e.taxa * 100).toFixed(0)}%`}
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
