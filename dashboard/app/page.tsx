'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { AtualizadoEm } from './components/AtualizadoEm';
import { Alertas } from './components/Alertas';
import { useFiltros, UNIDADES, PERIODOS } from './components/useFiltros';
import { Skeleton, SkeletonCard } from './components/Skeleton';
import { Tooltip } from './components/Tooltip';
import { ExportarCSV } from './components/ExportarCSV';
import { BarraMeta } from './components/BarraMeta';
import { MatrizConversoes } from './components/MatrizConversoes';

type TotalFunil = {
  agendados: number;
  compareceram: number;
  pagaram: number;
  receita: number;
};
type FunilOrigem = {
  origem: string;
  fonte: 'kommo' | 'sistema';
  agendados: number;
  compareceram: number;
  fecharam: number; // legado, == pagaram
  pagaram: number;
  receita: number;
};

function buildParams(uId: number, desde?: string, ate?: string): string {
  const p = new URLSearchParams();
  if (uId) p.set('unidade_id', String(uId));
  if (desde) p.set('data_inicio', desde);
  if (ate) p.set('data_fim', ate);
  return p.toString() ? `?${p.toString()}` : '';
}

type MapaMetas = Partial<Record<'agendados' | 'compareceram' | 'pagaram', number>>;

export default function Home() {
  const { unidadeId, periodoId, intervalo, intervaloAnt, pronto } = useFiltros('mes');
  const [total, setTotal] = useState<TotalFunil | null>(null);
  const [totalAnt, setTotalAnt] = useState<TotalFunil | null>(null);
  const [funilOrigens, setFunilOrigens] = useState<FunilOrigem[] | null>(null);
  const [metas, setMetas] = useState<MapaMetas>({});
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const qAtual = buildParams(unidadeId, intervalo.desde, intervalo.ate);
    const qAnt = intervaloAnt.desde && intervaloAnt.ate
      ? buildParams(unidadeId, intervaloAnt.desde, intervaloAnt.ate)
      : null;

    // Mes corrente do periodo selecionado (pra puxar metas) — usa data_inicio
    const mesPeriodo = intervalo.desde ? intervalo.desde.slice(0, 7) : null;
    const qMetas = mesPeriodo
      ? `?unidade_id=${unidadeId}&mes=${mesPeriodo}`
      : `?unidade_id=${unidadeId}`;

    try {
      const [funilAtual, funilAnt, metasRes] = await Promise.all([
        fetch(`/api/funil-completo${qAtual}`).then(res => res.json()),
        qAnt ? fetch(`/api/funil-completo${qAnt}`).then(res => res.json()) : Promise.resolve(null),
        fetch(`/api/metas${qMetas}`).then(res => res.json()).catch(() => ({ metas: [] })),
      ]);
      if (funilAtual.error) throw new Error(funilAtual.error);
      setTotal(funilAtual.total);
      setTotalAnt(funilAnt && !funilAnt.error ? funilAnt.total : null);
      setFunilOrigens(funilAtual.funis);
      // Monta mapa de metas (so usa se for periodo de 1 mes especifico)
      const m: MapaMetas = {};
      if (mesPeriodo && periodoId === 'mes') {
        for (const meta of metasRes?.metas || []) {
          m[meta.tipo as keyof MapaMetas] = Number(meta.valor) || 0;
        }
      }
      setMetas(m);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [unidadeId, intervalo.desde, intervalo.ate, intervaloAnt.desde, intervaloAnt.ate]);

  useEffect(() => {
    if (!pronto) return;
    carregar();
  }, [carregar, pronto]);

  const fmtBR = (n: number) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const unidadeAtual = UNIDADES.find(u => u.id === unidadeId)?.nome ?? '';
  const periodoAtual = PERIODOS.find(p => p.id === periodoId)?.nome ?? '';

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-1">Painel comercial</h1>
          <p className="text-gray-400">OrthoDontic — {unidadeAtual} · {periodoAtual}</p>
          <div className="mt-2">
            <AtualizadoEm
              tipos={['campanhas', 'performance']}
              unidadeId={unidadeId || undefined}
            />
          </div>
        </div>
        {carregando && <span className="text-xs text-gray-500">atualizando...</span>}
      </div>

      {erro && <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">Erro: {erro}</div>}

      {!total || !funilOrigens ? (
        <SkeletonPainel />
      ) : (
        <>
          <Alertas unidadeId={unidadeId || undefined} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card
              label="Agendados"
              valor={total.agendados}
              valorAnterior={totalAnt?.agendados}
              meta={metas.agendados}
              tooltip="Pacientes únicos com agendamento (data de avaliação preenchida) no sistema Orthodontic, ou com atendimento de telemarketing."
              unidadeId={unidadeId}
              tipos={['campanhas', 'performance']}
            />
            <Card
              label="Compareceram"
              valor={total.compareceram}
              valorAnterior={totalAnt?.compareceram}
              meta={metas.compareceram}
              tooltip="Pacientes únicos que efetivamente compareceram à avaliação no período."
              unidadeId={unidadeId}
              tipos={['performance', 'sistema']}
            />
            <Card
              label="Pagaram"
              valor={total.pagaram}
              valorAnterior={totalAnt?.pagaram}
              meta={metas.pagaram}
              tooltip="Pacientes com contrato fechado e pagamento confirmado no período (1ª parcela paga)."
              unidadeId={unidadeId}
              tipos={['sistema']}
            />
            <Card
              label="Receita"
              valor={total.receita}
              valorAnterior={totalAnt?.receita}
              tooltip="Soma de vlr_contrato dos pacientes com pagamento confirmado no período."
              moeda
              unidadeId={unidadeId}
              tipos={['sistema']}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <FunilGrafico total={total} unidadeId={unidadeId} />
            <Origens origens={funilOrigens} unidadeId={unidadeId} />
          </div>
        </>
      )}
    </main>
  );
}

function SkeletonPainel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}

function Card({
  label,
  valor,
  valorAnterior,
  meta,
  tooltip,
  moeda = false,
  unidadeId,
  tipos,
}: {
  label: string;
  valor: number;
  valorAnterior?: number;
  meta?: number;
  tooltip?: string;
  moeda?: boolean;
  unidadeId?: number;
  tipos?: ('leads' | 'sistema' | 'performance' | 'campanhas' | 'outros_colaboradores')[];
}) {
  const fmt = (n: number) =>
    moeda
      ? `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : n.toLocaleString('pt-BR');
  const variacao =
    valorAnterior !== undefined && valorAnterior > 0
      ? (valor - valorAnterior) / valorAnterior
      : valorAnterior === 0 && valor > 0
        ? null
        : valorAnterior === 0
          ? 0
          : null;
  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        {tooltip && <Tooltip texto={tooltip} />}
      </div>
      <div className="text-2xl font-semibold">{fmt(valor)}</div>
      {valorAnterior !== undefined && (
        <div className="text-xs mt-1 flex items-center gap-1">
          {variacao === null ? (
            <span className="text-gray-500">novo no período</span>
          ) : variacao === 0 ? (
            <span className="text-gray-500">igual ao período anterior</span>
          ) : (
            <>
              <span className={variacao >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {variacao >= 0 ? '↑' : '↓'} {Math.abs(variacao * 100).toFixed(0)}%
              </span>
              <span className="text-gray-500">vs anterior ({fmt(valorAnterior)})</span>
            </>
          )}
        </div>
      )}
      {meta !== undefined && meta > 0 && (
        <BarraMeta realizado={valor} meta={meta} ehMoeda={moeda} />
      )}
      {tipos && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <AtualizadoEm tipos={tipos} unidadeId={unidadeId || undefined} compacto />
        </div>
      )}
    </div>
  );
}

function FunilGrafico({ total, unidadeId }: { total: TotalFunil; unidadeId?: number }) {
  const etapas = [
    { nome: 'Agendados',    valor: total.agendados,    cor: '#06b6d4' },
    { nome: 'Compareceram', valor: total.compareceram, cor: '#a855f7' },
    { nome: 'Pagaram',      valor: total.pagaram,      cor: '#10b981' },
  ];
  const max = Math.max(...etapas.map(e => e.valor), 1);
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-start justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-1.5">
          Funil de conversão
          <Tooltip texto="Cada etapa conta pacientes únicos. Taxa = % que avançou da etapa anterior. Cadastrados pode incluir leads que ainda estão em etapas iniciais." />
        </h2>
        <AtualizadoEm tipos={['campanhas', 'performance']} unidadeId={unidadeId || undefined} />
      </div>
      <div className="space-y-3">
        {etapas.map((e, i) => {
          const pct = (e.valor / max) * 100;
          const valorAnterior = i === 0 ? 0 : etapas[i - 1].valor;
          const taxa =
            i === 0 ? null : valorAnterior > 0 ? Math.min(100, Math.round((e.valor / valorAnterior) * 100)) : 0;
          return (
            <div key={e.nome} className="flex items-center gap-4">
              <div className="w-32 text-sm text-gray-300">{e.nome}</div>
              <div className="flex-1 bg-gray-800 rounded h-9 relative overflow-hidden">
                <div className="h-full rounded flex items-center pl-3" style={{ width: `${pct}%`, backgroundColor: e.cor, minWidth: e.valor > 0 ? '40px' : '0' }}>
                  <span className="text-sm font-semibold text-white">{e.valor.toLocaleString('pt-BR')}</span>
                </div>
              </div>
              <div className="w-16 text-right text-sm text-gray-400">
                {taxa === null ? '' : `${taxa}%`}
              </div>
            </div>
          );
        })}
      </div>
      <MatrizConversoes
        agendados={total.agendados}
        compareceram={total.compareceram}
        pagaram={total.pagaram}
      />
    </div>
  );
}

// Top 5 campanhas com mais contratos PAGOS ficam destacadas; resto vai pra "Outros".
const TOP_CAMPANHAS = 5;

function classificarOrigens(origens: FunilOrigem[]) {
  const ativas = origens.filter(
    o => o.agendados > 0 || o.compareceram > 0 || o.fecharam > 0 || o.pagaram > 0,
  );
  const ordenadas = [...ativas].sort((a, b) => {
    if (b.pagaram !== a.pagaram) return b.pagaram - a.pagaram;
    if (b.fecharam !== a.fecharam) return b.fecharam - a.fecharam;
    if (b.receita !== a.receita) return b.receita - a.receita;
    return b.agendados - a.agendados;
  });
  const principais = ordenadas.slice(0, TOP_CAMPANHAS);
  const outros = ordenadas.slice(TOP_CAMPANHAS);
  return { principais, outros };
}

function agregarOutros(outros: FunilOrigem[]): FunilOrigem | null {
  if (outros.length === 0) return null;
  return outros.reduce(
    (acc, o) => ({
      origem: 'Outros',
      fonte: 'sistema',
      agendados: acc.agendados + o.agendados,
      compareceram: acc.compareceram + o.compareceram,
      fecharam: acc.fecharam + o.fecharam,
      pagaram: acc.pagaram + o.pagaram,
      receita: acc.receita + o.receita,
    }),
    {
      origem: 'Outros',
      fonte: 'sistema' as const,
      agendados: 0,
      compareceram: 0,
      fecharam: 0,
      pagaram: 0,
      receita: 0,
    },
  );
}

function Origens({ origens, unidadeId }: { origens: FunilOrigem[]; unidadeId?: number }) {
  const [outrosAberto, setOutrosAberto] = useState(false);
  const { principais, outros } = classificarOrigens(origens);
  const outrosAgregado = agregarOutros(outros);

  // Linhas a renderizar: principais + linha Outros (se existir)
  const linhas: FunilOrigem[] = [...principais];
  if (outrosAgregado) linhas.push(outrosAgregado);

  // Barra proporcional ao numero de PAGOS (criterio principal de classificacao)
  const max = Math.max(...linhas.map(o => o.pagaram), 1);

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-semibold">Top 5 campanhas (por contratos pagos)</h2>
        <AtualizadoEm tipos={['sistema']} unidadeId={unidadeId || undefined} />
      </div>
      <p className="text-xs text-gray-500 mb-6">Clique numa campanha para abrir o detalhamento.</p>
      {linhas.length === 0 ? (
        <div className="text-gray-500 text-sm py-4">Nenhuma origem registrada para esta combinação de filtros.</div>
      ) : (
        <div className="space-y-3">
          {linhas.map(o => {
            const isOutros = o.origem === 'Outros';
            const pct = (o.pagaram / max) * 100;
            const taxa = o.agendados > 0 ? (o.fecharam / o.agendados) * 100 : 0;

            const conteudo = (
              <>
                <div
                  className={`flex items-center justify-between text-sm mb-1 ${isOutros ? 'cursor-pointer hover:opacity-80' : ''}`}
                  onClick={isOutros ? () => setOutrosAberto(v => !v) : undefined}
                >
                  <span className={`flex items-center gap-1 ${isOutros ? 'text-gray-200 font-medium' : 'text-gray-200 group-hover:text-indigo-300 transition'}`}>
                    {isOutros && (
                      <span className="text-xs text-gray-500 w-3">{outrosAberto ? '▼' : '▶'}</span>
                    )}
                    {o.origem}
                    {isOutros && <span className="text-xs text-gray-500">({outros.length})</span>}
                    {!isOutros && (
                      <span className="text-[10px] text-indigo-500/70 opacity-0 group-hover:opacity-100 transition">→</span>
                    )}
                  </span>
                  <span className="text-gray-400">
                    <span className="text-emerald-400 font-semibold">
                      {o.pagaram.toLocaleString('pt-BR')} pagos
                    </span>
                    <span className="text-gray-600 mx-1">·</span>
                    {o.agendados.toLocaleString('pt-BR')} agend
                    {taxa > 0 && (
                      <span className="ml-1 text-gray-500">({taxa.toFixed(0)}%)</span>
                    )}
                  </span>
                </div>
                <div className="bg-gray-800 rounded h-2 overflow-hidden">
                  <div
                    className={`h-full ${isOutros ? 'bg-gray-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            );

            return (
              <div key={o.origem}>
                {isOutros ? (
                  <div>{conteudo}</div>
                ) : (
                  <Link
                    href={`/origem/${encodeURIComponent(o.origem)}`}
                    className="block group"
                  >
                    {conteudo}
                  </Link>
                )}
                {/* Detalhamento expandido de Outros (sub-linhas tambem clicaveis) */}
                {isOutros && outrosAberto && (
                  <div className="mt-3 ml-4 pl-3 border-l border-gray-800 space-y-2">
                    {outros
                      .slice()
                      .sort((a, b) => b.pagaram - a.pagaram || b.fecharam - a.fecharam)
                      .map(sub => {
                      const subTaxa = sub.agendados > 0 ? (sub.fecharam / sub.agendados) * 100 : 0;
                      return (
                        <Link
                          key={sub.origem}
                          href={`/origem/${encodeURIComponent(sub.origem)}`}
                          className="flex items-center justify-between text-xs hover:text-indigo-300 transition group"
                        >
                          <span className="text-gray-400 group-hover:text-indigo-300">
                            {sub.origem}
                            <span className="text-[10px] text-indigo-500/70 opacity-0 group-hover:opacity-100 ml-1">→</span>
                          </span>
                          <span className="text-gray-500">
                            <span className="text-emerald-500">{sub.pagaram} pagos</span>
                            <span className="text-gray-700 mx-1">·</span>
                            {sub.agendados} agend
                            {subTaxa > 0 && (
                              <span className="ml-1 text-gray-600">({subTaxa.toFixed(0)}%)</span>
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


