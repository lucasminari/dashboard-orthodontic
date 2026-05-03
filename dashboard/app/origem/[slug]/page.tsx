'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { AtualizadoEm } from '../../components/AtualizadoEm';
import { MatrizConversoes } from '../../components/MatrizConversoes';

type ItemRanking = { nome: string; total: number; receita?: number };

type MesEvolucao = {
  mes: string;
  rotulo: string;
  agendados: number;
  compareceram: number;
  fecharam: number;
  pagaram: number;
  receita: number;
};

type RespostaDetalhe = {
  origem: string;
  filtro: { unidade_id: number | null; data_inicio: string | null; data_fim: string | null };
  kpis: {
    agendados: number;
    compareceram: number;
    fecharam: number;
    pagaram: number;
    receita: number;
    ticket_medio: number;
  };
  taxas: {
    agend_comp: number | null;
    comp_fech: number | null;
    fech_pag: number | null;
  };
  media_geral: {
    ticket_medio: number;
    agend_comp: number | null;
    comp_fech: number | null;
    fech_pag: number | null;
  };
  evolucao: MesEvolucao[];
  top: {
    dentistas: ItemRanking[];
    atendentes: ItemRanking[];
    telemarketers: ItemRanking[];
    situacoes: ItemRanking[];
    sub_campanhas: ItemRanking[];
  };
};

const UNIDADES = [
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

function fmtBR(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number | null): string {
  if (v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export default function OrigemDetalhePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const origem = decodeURIComponent(slug);

  const [unidadeId, setUnidadeId] = useState(1);
  const [periodoId, setPeriodoId] = useState('mes');
  const [dados, setDados] = useState<RespostaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (uId: number, pId: string) => {
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams();
    params.set('origem', origem);
    if (uId) params.set('unidade_id', String(uId));
    const intervalo = intervaloPeriodo(pId);
    if (intervalo.desde) params.set('data_inicio', intervalo.desde);
    if (intervalo.ate) params.set('data_fim', intervalo.ate);

    try {
      const res = await fetch(`/api/origem-detalhe?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) setErro(json.error || 'Erro');
      else setDados(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }, [origem]);

  useEffect(() => {
    carregar(unidadeId, periodoId);
  }, [unidadeId, periodoId, carregar]);

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <Link href="/funil" className="text-xs text-gray-500 hover:text-gray-300 mb-2 inline-block">
            ← voltar para Funil por campanha
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">{origem}</h1>
          <p className="text-gray-400 text-sm mt-1">
            Detalhamento completo da campanha: funil, evolução, dentistas, atendentes e situações.
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
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard titulo="Agendados" valor={dados.kpis.agendados} cor="#06b6d4" />
              <KpiCard titulo="Compareceram" valor={dados.kpis.compareceram} cor="#a855f7" />
              <KpiCard titulo="Fecharam" valor={dados.kpis.fecharam} cor="#eab308" />
              <KpiCard titulo="Pagaram" valor={dados.kpis.pagaram} cor="#10b981" />
              <KpiCard
                titulo="Receita"
                valor={`R$ ${fmtBR(dados.kpis.receita)}`}
                cor="#10b981"
                grande
              />
              <KpiCard
                titulo="Ticket médio"
                valor={`R$ ${fmtBR(dados.kpis.ticket_medio)}`}
                cor="#10b981"
                comparacao={
                  dados.media_geral.ticket_medio > 0
                    ? dados.kpis.ticket_medio / dados.media_geral.ticket_medio
                    : null
                }
              />
            </div>

            {/* Funil invertido grande */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FunilInvertido kpis={dados.kpis} taxas={dados.taxas} mediaGeral={dados.media_geral} />
              <EvolucaoMensal evolucao={dados.evolucao} />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <MatrizConversoes
                agendados={dados.kpis.agendados}
                compareceram={dados.kpis.compareceram}
                fecharam={dados.kpis.fecharam}
                pagaram={dados.kpis.pagaram}
              />
            </div>

            {/* Top rankings em grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <TopCard titulo="Top dentistas (fechamentos)" itens={dados.top.dentistas} mostrarReceita />
              <TopCard titulo="Top atendentes (contratos)" itens={dados.top.atendentes} mostrarReceita />
              <TopCard titulo="Top telemarketers (atendimentos)" itens={dados.top.telemarketers} />
              <TopCard titulo="Situações dos agendamentos" itens={dados.top.situacoes} />
              {dados.top.sub_campanhas.length > 0 && (
                <TopCard titulo="Sub-campanhas (campo Campanha)" itens={dados.top.sub_campanhas} mostrarReceita />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function KpiCard({
  titulo,
  valor,
  cor,
  grande = false,
  comparacao,
}: {
  titulo: string;
  valor: number | string;
  cor: string;
  grande?: boolean;
  comparacao?: number | null;
}) {
  const display = typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor;
  const showCmp = comparacao !== undefined && comparacao !== null && !isNaN(comparacao) && isFinite(comparacao);
  const cmpAcima = showCmp && comparacao! >= 1;
  return (
    <div className={`rounded-lg border border-gray-800 bg-gray-900 p-4 ${grande ? 'col-span-2' : ''}`}>
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{titulo}</div>
      <div className="text-xl font-semibold" style={{ color: cor }}>{display}</div>
      {showCmp && (
        <div className={`text-[10px] mt-1 ${cmpAcima ? 'text-emerald-400' : 'text-amber-400'}`}>
          {cmpAcima ? '↑' : '↓'} {((comparacao! - 1) * 100).toFixed(0)}% vs média
        </div>
      )}
    </div>
  );
}

function FunilInvertido({
  kpis,
  taxas,
  mediaGeral,
}: {
  kpis: RespostaDetalhe['kpis'];
  taxas: RespostaDetalhe['taxas'];
  mediaGeral: RespostaDetalhe['media_geral'];
}) {
  const etapas = [
    { nome: 'Agendados', valor: kpis.agendados, cor: '#06b6d4', taxa: null as number | null, taxaMedia: null as number | null, anterior: null as number | null },
    { nome: 'Compareceram', valor: kpis.compareceram, cor: '#a855f7', taxa: taxas.agend_comp, taxaMedia: mediaGeral.agend_comp, anterior: kpis.agendados },
    { nome: 'Fecharam', valor: kpis.fecharam, cor: '#eab308', taxa: taxas.comp_fech, taxaMedia: mediaGeral.comp_fech, anterior: kpis.compareceram },
    { nome: 'Pagaram', valor: kpis.pagaram, cor: '#10b981', taxa: taxas.fech_pag, taxaMedia: mediaGeral.fech_pag, anterior: kpis.fecharam },
  ];

  // Largura do funil: do topo (100%) ao fundo (proporcional)
  const max = Math.max(...etapas.map(e => e.valor), 1);
  const minLargura = 8; // %
  const maxLargura = 100;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-1">Funil de conversão</h2>
      <p className="text-xs text-gray-500 mb-5">Cada nível mostra a taxa de quem passou pra cá da etapa anterior, e a perda em vermelho.</p>

      <div className="space-y-1">
        {etapas.map((e, i) => {
          const lg = max > 0 ? Math.max((e.valor / max) * maxLargura, e.valor > 0 ? minLargura : 4) : 4;
          const perda = e.anterior !== null && e.anterior > 0 ? e.anterior - e.valor : 0;
          const taxaCmp =
            e.taxa !== null && e.taxaMedia !== null && e.taxaMedia > 0
              ? e.taxa / e.taxaMedia
              : null;
          return (
            <div key={e.nome}>
              {i > 0 && (
                <div className="flex items-center gap-2 px-1 py-0.5 text-[11px]">
                  <span className="text-gray-500 w-32">↓ {fmtPct(e.taxa)} convertem</span>
                  {taxaCmp !== null && (
                    <span className={taxaCmp >= 1 ? 'text-emerald-400' : 'text-amber-400'}>
                      ({taxaCmp >= 1 ? '↑' : '↓'} {(taxaCmp * 100 - 100).toFixed(0)}% vs média)
                    </span>
                  )}
                  {perda > 0 && (
                    <span className="text-red-400 ml-auto">−{perda} perdidos</span>
                  )}
                </div>
              )}
              <div className="flex justify-center">
                <div
                  className="rounded transition-all flex items-center justify-center text-white font-semibold py-3"
                  style={{
                    width: `${lg}%`,
                    background: `linear-gradient(135deg, ${e.cor}, ${e.cor}dd)`,
                    boxShadow: `0 2px 8px ${e.cor}33`,
                    minWidth: '80px',
                  }}
                >
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider opacity-80">{e.nome}</div>
                    <div className="text-lg leading-tight">{e.valor.toLocaleString('pt-BR')}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvolucaoMensal({ evolucao }: { evolucao: MesEvolucao[] }) {
  const max = Math.max(
    ...evolucao.flatMap(m => [m.agendados, m.compareceram, m.fecharam, m.pagaram]),
    1
  );
  const w = 60;
  const h = 200;
  const total = evolucao.length;
  const stepX = (w * total) / total;

  const linhas: { nome: string; cor: string; valores: number[] }[] = [
    { nome: 'Agend.', cor: '#06b6d4', valores: evolucao.map(e => e.agendados) },
    { nome: 'Compar.', cor: '#a855f7', valores: evolucao.map(e => e.compareceram) },
    { nome: 'Fech.', cor: '#eab308', valores: evolucao.map(e => e.fecharam) },
    { nome: 'Pag.', cor: '#10b981', valores: evolucao.map(e => e.pagaram) },
  ];

  function pontos(valores: number[]): string {
    return valores
      .map((v, i) => {
        const x = (i / Math.max(valores.length - 1, 1)) * 100;
        const y = 100 - (v / max) * 90 - 5;
        return `${x},${y}`;
      })
      .join(' ');
  }

  const ult = evolucao[evolucao.length - 1];
  const pen = evolucao[evolucao.length - 2];
  const variacao = pen && pen.agendados > 0 ? (ult.agendados - pen.agendados) / pen.agendados : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold">Evolução nos últimos 6 meses</h2>
        {variacao !== null && (
          <span className={`text-xs ${variacao >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {variacao >= 0 ? '↑' : '↓'} {(variacao * 100).toFixed(0)}% agendados vs mês anterior
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">Trajetória das 4 etapas, ignora filtro de data.</p>

      <div className="relative" style={{ height: `${h}px` }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {/* Linhas horizontais de grid */}
          {[0, 25, 50, 75, 100].map(y => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#1f2937" strokeWidth="0.3" />
          ))}
          {linhas.map(l => (
            <polyline
              key={l.nome}
              fill="none"
              stroke={l.cor}
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
              points={pontos(l.valores)}
            />
          ))}
          {linhas.map(l =>
            l.valores.map((v, i) => {
              const x = (i / Math.max(l.valores.length - 1, 1)) * 100;
              const y = 100 - (v / max) * 90 - 5;
              return <circle key={`${l.nome}-${i}`} cx={x} cy={y} r="1.5" fill={l.cor} />;
            })
          )}
        </svg>
      </div>

      <div className="flex justify-between text-[10px] text-gray-500 mt-2 px-1">
        {evolucao.map(m => <span key={m.mes}>{m.rotulo}</span>)}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-[11px]">
        {linhas.map(l => (
          <span key={l.nome} className="flex items-center gap-1">
            <span className="w-3 h-0.5" style={{ backgroundColor: l.cor }} />
            <span className="text-gray-400">{l.nome}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TopCard({
  titulo,
  itens,
  mostrarReceita = false,
}: {
  titulo: string;
  itens: ItemRanking[];
  mostrarReceita?: boolean;
}) {
  if (itens.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">{titulo}</h3>
        <div className="text-xs text-gray-500 py-2">Sem dados</div>
      </div>
    );
  }
  const max = Math.max(...itens.map(i => i.total), 1);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{titulo}</h3>
      <div className="space-y-2">
        {itens.map(it => {
          const pct = (it.total / max) * 100;
          return (
            <div key={it.nome}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 truncate pr-2">{it.nome}</span>
                <span className="text-gray-400 whitespace-nowrap">
                  {it.total}
                  {mostrarReceita && it.receita !== undefined && it.receita > 0 && (
                    <span className="text-emerald-400 ml-2">R$ {fmtBR(it.receita)}</span>
                  )}
                </span>
              </div>
              <div className="bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
