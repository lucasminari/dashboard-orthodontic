'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AtualizadoEm } from '../components/AtualizadoEm';
import { useFiltros, UNIDADES, PERIODOS } from '../components/useFiltros';
import { Skeleton } from '../components/Skeleton';
import { AnaliseIA } from '../components/AnaliseIA';
import { KommoInfo } from '../components/KommoInfo';

type FunilOrigem = {
  origem: string;
  fonte: 'kommo' | 'sistema';
  agendados: number;
  compareceram: number;
  pagaram: number;
  receita: number;
  taxa_agendamento_para_comparecimento: number | null;
  taxa_comparecimento_para_pagamento: number | null;
};

type RespostaFunil = {
  funis: FunilOrigem[];
  total: {
    agendados: number;
    compareceram: number;
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
  const [outrosAberto, setOutrosAberto] = useState(false);
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

  // Mostra TODAS as campanhas individualmente. As 5 Kommo aparecem sempre
  // (mesmo zeradas). Sistema mostra qualquer com atividade. ORDEM unica:
  // mais contratos PAGOS no topo. Tiebreaker: receita, depois agendados.
  // Campanhas zeradas vao pro final.
  const funisRecebidos = dados?.funis || [];
  const temAtividade = (f: FunilOrigem) =>
    f.agendados > 0 || f.compareceram > 0 || f.pagaram > 0;
  const mapPorOrigem = new Map(funisRecebidos.map(f => [f.origem, f]));

  // 5 origens Kommo aparecem sempre, mesmo zeradas
  const kommoFunis: FunilOrigem[] = ORIGENS_KOMMO.map(nome => {
    const existente = mapPorOrigem.get(nome);
    if (existente) return existente;
    return {
      origem: nome,
      fonte: 'kommo' as const,
      agendados: 0,
      compareceram: 0,
      pagaram: 0,
      receita: 0,
      taxa_agendamento_para_comparecimento: null,
      taxa_comparecimento_para_pagamento: null,
    };
  });
  const sistemaFunis = funisRecebidos.filter(
    f => f.fonte === 'sistema' && temAtividade(f),
  );

  const todasCampanhas = [...kommoFunis, ...sistemaFunis].sort((a, b) => {
    if (b.pagaram !== a.pagaram) return b.pagaram - a.pagaram;
    if (b.receita !== a.receita) return b.receita - a.receita;
    return b.agendados - a.agendados;
  });

  // TOP 5 com mais contratos pagos vai destacado.
  // O resto entra em 'Outros' clicavel/expansivel.
  const TOP = 5;
  const principais = todasCampanhas.slice(0, TOP);
  const outros = todasCampanhas.slice(TOP);

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Campanhas</h1>
            <p className="text-gray-400 text-sm mt-1">
              {unidadeAtual} · {periodoAtual} — funil de conversão e onde perde leads, por campanha.
            </p>
            <div className="mt-2">
              <AtualizadoEm
                tipos={['campanhas', 'performance']}
                unidadeId={unidadeId || undefined}
              />
            </div>
          </div>
          <BotaoSyncKommo />
        </header>

        {carregando && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
          </div>
        )}
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
              <>
                <div className="space-y-4">
                  {principais.map(f => (
                    <CampanhaCard
                      key={f.origem}
                      f={f}
                      tendenciaOrigem={tendencia?.origens[f.origem]}
                      unidade={unidadeAtual}
                      periodo={periodoAtual}
                      unidadeId={unidadeId}
                      dataInicio={intervalo.desde}
                      dataFim={intervalo.ate}
                      mediaAgendComp={
                        dados && dados.total.agendados > 0
                          ? dados.total.compareceram / dados.total.agendados
                          : null
                      }
                      mediaCompPag={
                        dados && dados.total.compareceram > 0
                          ? dados.total.pagaram / dados.total.compareceram
                          : null
                      }
                    />
                  ))}
                </div>

                {outros.length > 0 && (
                  <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
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
                            Campanhas com menos contratos pagos — clique para detalhar
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 hidden sm:block">
                        Total: {outros.reduce((s, o) => s + o.pagaram, 0)} pagos ·{' '}
                        {outros.reduce((s, o) => s + o.compareceram, 0)} compar.
                      </div>
                    </button>
                    {outrosAberto && (
                      <div className="p-4 border-t border-gray-800 space-y-4">
                        {outros.map(f => (
                          <CampanhaCard
                            key={f.origem}
                            f={f}
                            tendenciaOrigem={tendencia?.origens[f.origem]}
                            unidade={unidadeAtual}
                            periodo={periodoAtual}
                            unidadeId={unidadeId}
                            dataInicio={intervalo.desde}
                            dataFim={intervalo.ate}
                            mediaAgendComp={
                              dados && dados.total.agendados > 0
                                ? dados.total.compareceram / dados.total.agendados
                                : null
                            }
                            mediaCompPag={
                              dados && dados.total.compareceram > 0
                                ? dados.total.pagaram / dados.total.compareceram
                                : null
                            }
                          />
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

function CampanhaCard({
  f,
  tendenciaOrigem,
  unidade,
  periodo,
  mediaAgendComp,
  mediaCompPag,
  unidadeId,
  dataInicio,
  dataFim,
}: {
  f: FunilOrigem;
  tendenciaOrigem?: { serie: number[]; variacao: number | null };
  unidade: string;
  periodo: string;
  mediaAgendComp: number | null;
  mediaCompPag: number | null;
  unidadeId: number;
  dataInicio?: string;
  dataFim?: string;
}) {
  const ehKommo = f.fonte === 'kommo';
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
        <div className="space-y-3">
          <AnaliseIA
            origem={f.origem}
            unidade={unidade}
            periodo={periodo}
            agendados={f.agendados}
            compareceram={f.compareceram}
            pagaram={f.pagaram}
            receita={f.receita}
            taxaAgendComp={f.taxa_agendamento_para_comparecimento}
            taxaCompPag={f.taxa_comparecimento_para_pagamento}
            mediaAgendComp={mediaAgendComp}
            mediaCompPag={mediaCompPag}
            compacto
          />
          {ehKommo && (
            <KommoInfo
              origem={f.origem}
              unidadeId={unidadeId}
              dataInicio={dataInicio}
              dataFim={dataFim}
              agendadosNoSistema={f.agendados}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FunilConversao({ f }: { f: FunilOrigem }) {
  const etapas = [
    { nome: 'Agendados', valor: f.agendados, cor: '#06b6d4', taxa: null as number | null },
    { nome: 'Compareceram', valor: f.compareceram, cor: '#a855f7', taxa: f.taxa_agendamento_para_comparecimento },
    { nome: 'Pagaram', valor: f.pagaram, cor: '#10b981', taxa: f.taxa_comparecimento_para_pagamento },
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

function BotaoSyncKommo() {
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const sincronizar = async () => {
    setSincronizando(true);
    setResultado(null);
    try {
      // Pega so leads atualizados nos ultimos 60 dias (mais rapido)
      const desde = new Date();
      desde.setDate(desde.getDate() - 60);
      const desdeStr = desde.toISOString().slice(0, 10);
      const r = await fetch(`/api/kommo-sync?desde=${desdeStr}`);
      const j = await r.json();
      if (j.ok) {
        setResultado(`✓ ${j.total_gravado} leads sincronizados em ${j.duracao_segundos}s`);
        // Reload depois de 2s pra atualizar os cards
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setResultado(`✗ ${j.erro || 'erro desconhecido'}`);
      }
    } catch (e) {
      setResultado(`✗ ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {resultado && (
        <span
          className={`text-xs ${
            resultado.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {resultado}
        </span>
      )}
      <button
        onClick={sincronizar}
        disabled={sincronizando}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded transition flex items-center gap-2"
        title="Atualiza leads das origens Kommo (Mídia Real, DBOUT, etc.)"
      >
        {sincronizando ? '🔄 Sincronizando...' : '🔄 Sync Kommo'}
      </button>
    </div>
  );
}
