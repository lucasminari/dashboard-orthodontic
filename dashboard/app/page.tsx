'use client';

import { useEffect, useState, useCallback } from 'react';
import { AtualizadoEm } from './components/AtualizadoEm';

type Dados = {
  funil: { leads: number; agendados: number; compareceram: number; fecharam: number; pagaram: number };
  financeiro: { receita_realizada: number; pipeline_futuro: number };
};
type FunilOrigem = {
  origem: string;
  fonte: 'kommo' | 'sistema';
  cadastrados: number;
  agendados: number;
  compareceram: number;
  fecharam: number;
  pagaram: number;
  receita: number;
};
type Lembrete = {
  id: number; nome: string; telefone: string; valor: number;
  data_vcto: string; dias_para_vencer: number;
  dentista: string | null; atendente: string | null;
  urgencia: 'alta' | 'media' | 'baixa';
};
type ComparativoUnidade = {
  unidade_id: number; nome: string; leads_kommo: number; leads_ortho: number;
  agendados: number; compareceram: number; fecharam: number; pagaram: number; receita: number;
  taxa_comparecimento: number; taxa_fechamento: number; taxa_pagamento: number;
};

const UNIDADES = [
  { id: 0, nome: 'Todas as unidades' },
  { id: 1, nome: 'Centro' },
  { id: 2, nome: 'Várzea Paulista' },
  { id: 3, nome: 'Hortolândia' },
];

const PERIODOS = [
  { id: 'tudo',  nome: 'Tudo' },
  { id: 'hoje',  nome: 'Hoje' },
  { id: '7d',    nome: 'Últimos 7 dias' },
  { id: '30d',   nome: 'Mês anterior' },
  { id: 'mes',   nome: 'Este mês' },
  { id: 'personalizado', nome: 'Personalizado' },
];

function intervaloPeriodo(id: string): { desde?: string; ate?: string } {
  const hoje = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (id === 'hoje') return { desde: fmt(hoje), ate: fmt(hoje) };
  if (id === '7d') {
    const d = new Date(hoje); d.setDate(d.getDate() - 7);
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

export default function Home() {
  const [unidadeId, setUnidadeId] = useState(0);
  const [periodoId, setPeriodoId] = useState('tudo');
  const [desdePersonalizado, setDesdePersonalizado] = useState('');
  const [atePersonalizado, setAtePersonalizado] = useState('');
  const [dados, setDados] = useState<Dados | null>(null);
  const [funilOrigens, setFunilOrigens] = useState<FunilOrigem[] | null>(null);
  const [lembretes, setLembretes] = useState<Lembrete[] | null>(null);
  const [comparativo, setComparativo] = useState<ComparativoUnidade[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async (uId: number, pId: string, desde?: string, ate?: string) => {
    setCarregando(true);
    setErro(null);
    let intervalo: { desde?: string; ate?: string } = { desde, ate };
    if (!desde || !ate) {
      intervalo = intervaloPeriodo(pId);
    }
    const params = new URLSearchParams();
    if (uId) params.set('unidade', String(uId));
    if (intervalo.desde) params.set('desde', intervalo.desde);
    if (intervalo.ate)   params.set('ate', intervalo.ate);
    const q = params.toString() ? `?${params.toString()}` : '';

    // /api/funil-completo usa nomes de params diferentes
    const paramsFunil = new URLSearchParams();
    if (uId) paramsFunil.set('unidade_id', String(uId));
    if (intervalo.desde) paramsFunil.set('data_inicio', intervalo.desde);
    if (intervalo.ate) paramsFunil.set('data_fim', intervalo.ate);
    const qFunil = paramsFunil.toString() ? `?${paramsFunil.toString()}` : '';

    try {
      const [d, f, l, c] = await Promise.all([
        fetch(`/api/kpis${q}`).then(res => res.json()),
        fetch(`/api/funil-completo${qFunil}`).then(res => res.json()),
        fetch(`/api/lembretes${uId ? `?unidade=${uId}` : ''}`).then(res => res.json()),
        fetch(`/api/comparativo`).then(res => res.json()),
      ]);
      if (d.erro) throw new Error(d.erro);
      if (f.error) throw new Error(f.error);
      if (l.erro) throw new Error(l.erro);
      if (c.erro) throw new Error(c.erro);
      setDados(d);
      setFunilOrigens(f.funis);
      setLembretes(l.lembretes);
      setComparativo(c.unidades);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (periodoId === 'personalizado' && (!desdePersonalizado || !atePersonalizado)) {
      return;
    }
    carregar(
      unidadeId,
      periodoId,
      periodoId === 'personalizado' ? desdePersonalizado : undefined,
      periodoId === 'personalizado' ? atePersonalizado : undefined
    );
  }, [unidadeId, periodoId, desdePersonalizado, atePersonalizado, carregar]);

  const fmtBR = (n: number) =>
    n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const corUrgencia = (u: 'alta' | 'media' | 'baixa') => {
    if (u === 'alta')  return 'bg-red-900/40 text-red-300 border-red-800';
    if (u === 'media') return 'bg-amber-900/40 text-amber-300 border-amber-800';
    return 'bg-gray-800 text-gray-300 border-gray-700';
  };

  const textoVcto = (dias: number) => {
    if (dias === 0) return 'Vence hoje';
    if (dias === 1) return 'Vence amanhã';
    return `Em ${dias} dias`;
  };

  const unidadeAtual = UNIDADES.find(u => u.id === unidadeId)?.nome ?? '';
  const periodoAtual = PERIODOS.find(p => p.id === periodoId)?.nome ?? '';

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-1">Painel comercial</h1>
          <p className="text-gray-400">OrthoDontic — {unidadeAtual} · {periodoAtual}</p>
          <div className="mt-2">
            <AtualizadoEm
              tipos={['leads', 'sistema', 'performance', 'campanhas']}
              unidadeId={unidadeId || undefined}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {carregando && <span className="text-xs text-gray-500 mr-2">atualizando...</span>}
          <select
            value={periodoId}
            onChange={e => setPeriodoId(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            {PERIODOS.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          {periodoId === 'personalizado' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={desdePersonalizado}
                onChange={e => setDesdePersonalizado(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
              <span className="text-gray-400">a</span>
              <input
                type="date"
                value={atePersonalizado}
                onChange={e => setAtePersonalizado(e.target.value)}
                className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
          <select
            value={unidadeId}
            onChange={e => setUnidadeId(Number(e.target.value))}
            className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            {UNIDADES.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {erro && <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">Erro: {erro}</div>}

      {!dados || !funilOrigens || !lembretes || !comparativo ? (
        <div className="text-gray-400">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <Card label="Leads"        valor={dados.funil.leads.toLocaleString('pt-BR')} unidadeId={unidadeId} tipos={['leads']} />
            <Card label="Agendados"    valor={dados.funil.agendados.toLocaleString('pt-BR')} unidadeId={unidadeId} tipos={['sistema']} />
            <Card label="Fecharam"     valor={dados.funil.fecharam.toLocaleString('pt-BR')} unidadeId={unidadeId} tipos={['sistema']} />
            <Card label="Pagaram"      valor={dados.funil.pagaram.toLocaleString('pt-BR')} unidadeId={unidadeId} tipos={['sistema']} />
            <Card label="Receita"      valor={`R$ ${fmtBR(dados.financeiro.receita_realizada)}`} sub={`+ R$ ${fmtBR(dados.financeiro.pipeline_futuro)} pipeline`} unidadeId={unidadeId} tipos={['sistema']} />
          </div>

          <Comparativo unidades={comparativo} fmtBR={fmtBR} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Funil dados={dados} unidadeId={unidadeId} />
            <Origens origens={funilOrigens} unidadeId={unidadeId} />
          </div>

          <ROIOrigem origens={funilOrigens} fmtBR={fmtBR} unidadeId={unidadeId} />

          <Lembretes
            lembretes={lembretes}
            corUrgencia={corUrgencia}
            textoVcto={textoVcto}
            fmtBR={fmtBR}
            unidadeId={unidadeId}
          />
        </>
      )}
    </main>
  );
}

function Card({
  label,
  valor,
  sub,
  unidadeId,
  tipos,
}: {
  label: string;
  valor: string;
  sub?: string;
  unidadeId?: number;
  tipos?: ('leads' | 'sistema' | 'performance' | 'campanhas')[];
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
      <div className="text-sm text-gray-400 mb-2">{label}</div>
      <div className="text-2xl font-semibold">{valor}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      {tipos && (
        <div className="mt-2 pt-2 border-t border-gray-800">
          <AtualizadoEm tipos={tipos} unidadeId={unidadeId || undefined} compacto />
        </div>
      )}
    </div>
  );
}

function Comparativo({ unidades, fmtBR }: { unidades: ComparativoUnidade[]; fmtBR: (n: number) => string }) {
  const maxLeads = Math.max(...unidades.map(u => u.leads_kommo), 1);
  const cores = ['#6366f1', '#8b5cf6', '#22c55e'];
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-6">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-semibold">Comparativo entre unidades</h2>
        <AtualizadoEm tipos={['leads', 'sistema', 'performance']} />
      </div>
      <p className="text-xs text-gray-500 mb-6">Leads do Kommo · cruzamento com OrthoDontic · sempre mostra dado total</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {unidades.map((u, i) => {
          const pct = (u.leads_kommo / maxLeads) * 100;
          return (
            <div key={u.unidade_id} className="bg-gray-950 rounded-lg p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{u.nome}</h3>
                <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: cores[i] + '33', color: cores[i] }}>
                  {u.leads_kommo.toLocaleString('pt-BR')} leads
                </span>
              </div>
              <div className="bg-gray-800 rounded h-2 overflow-hidden mb-4">
                <div className="h-full" style={{ width: `${pct}%`, backgroundColor: cores[i] }} />
              </div>
              <div className="space-y-2 text-sm">
                <Linha label="Agendados"     valor={u.agendados.toLocaleString('pt-BR')} />
                <Linha label="Compareceram"  valor={`${u.compareceram} (${u.taxa_comparecimento.toFixed(0)}%)`} />
                <Linha label="Fecharam"      valor={`${u.fecharam} (${u.taxa_fechamento.toFixed(0)}%)`} />
                <Linha label="Pagaram"       valor={`${u.pagaram} (${u.taxa_pagamento.toFixed(0)}%)`} />
                <div className="pt-2 mt-2 border-t border-gray-800 flex justify-between">
                  <span className="text-gray-400">Receita</span>
                  <span className="font-semibold">R$ {fmtBR(u.receita)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span>{valor}</span>
    </div>
  );
}

function Funil({ dados, unidadeId }: { dados: Dados; unidadeId?: number }) {
  const f = dados.funil;
  const etapas = [
    { nome: 'Leads',        valor: f.leads,        cor: '#6366f1' },
    { nome: 'Agendados',    valor: f.agendados,    cor: '#8b5cf6' },
    { nome: 'Compareceram', valor: f.compareceram, cor: '#22c55e' },
    { nome: 'Fecharam',     valor: f.fecharam,     cor: '#eab308' },
    { nome: 'Pagaram',      valor: f.pagaram,      cor: '#f97316' },
  ];
  const max = Math.max(...etapas.map(e => e.valor));
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-start justify-between mb-6">
        <h2 className="text-lg font-semibold">Funil de conversão</h2>
        <AtualizadoEm tipos={['leads', 'sistema', 'performance']} unidadeId={unidadeId || undefined} />
      </div>
      <div className="space-y-3">
        {etapas.map((e, i) => {
          const pct = max > 0 ? (e.valor / max) * 100 : 0;
          const taxa = i === 0 ? 100 : etapas[i-1].valor > 0 ? Math.round((e.valor / etapas[i-1].valor) * 100) : 0;
          return (
            <div key={e.nome} className="flex items-center gap-4">
              <div className="w-32 text-sm text-gray-300">{e.nome}</div>
              <div className="flex-1 bg-gray-800 rounded h-9 relative overflow-hidden">
                <div className="h-full rounded flex items-center pl-3" style={{ width: `${pct}%`, backgroundColor: e.cor }}>
                  <span className="text-sm font-semibold text-white">{e.valor.toLocaleString('pt-BR')}</span>
                </div>
              </div>
              <div className="w-16 text-right text-sm text-gray-400">
                {i === 0 ? '—' : `${taxa}%`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Origens({ origens, unidadeId }: { origens: FunilOrigem[]; unidadeId?: number }) {
  // So mostra origens que tem ao menos 1 cadastro no periodo, ordenadas por leads desc.
  const ativas = origens
    .filter(o => o.cadastrados > 0)
    .sort((a, b) => b.cadastrados - a.cadastrados);
  const max = Math.max(...ativas.map(o => o.cadastrados), 1);
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-semibold">Leads por origem</h2>
        <AtualizadoEm tipos={['leads', 'sistema']} unidadeId={unidadeId || undefined} />
      </div>
      <p className="text-xs text-gray-500 mb-6">Todas as origens, do início ao fim</p>
      {ativas.length === 0 ? (
        <div className="text-gray-500 text-sm py-4">Nenhuma origem registrada para esta combinação de filtros.</div>
      ) : (
        <div className="space-y-3">
          {ativas.map(o => {
            const pct = (o.cadastrados / max) * 100;
            const taxa = o.cadastrados > 0 ? (o.fecharam / o.cadastrados) * 100 : 0;
            return (
              <div key={o.origem}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-300">{o.origem}</span>
                  <span className="text-gray-400">
                    {o.cadastrados.toLocaleString('pt-BR')} leads
                    {o.fecharam > 0 && (
                      <span className="ml-2 text-emerald-400">
                        · {o.fecharam} fech ({taxa.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="bg-gray-800 rounded h-2 overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Lembretes({
  lembretes, corUrgencia, textoVcto, fmtBR, unidadeId,
}: {
  lembretes: Lembrete[];
  corUrgencia: (u: 'alta' | 'media' | 'baixa') => string;
  textoVcto: (d: number) => string;
  fmtBR: (n: number) => string;
  unidadeId?: number;
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold">Lembretes de pagamento futuro</h2>
          <p className="text-xs text-gray-500">Contratos fechados aguardando pagamento (sempre mostra todos)</p>
          <div className="mt-1">
            <AtualizadoEm tipos={['sistema']} unidadeId={unidadeId || undefined} />
          </div>
        </div>
        <span className="text-sm text-gray-400">
          {lembretes.length} {lembretes.length === 1 ? 'pendência' : 'pendências'}
        </span>
      </div>
      {lembretes.length === 0 ? (
        <div className="text-gray-500 text-sm py-8 text-center">Nenhum pagamento pendente.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 font-normal">Paciente</th>
              <th className="text-left py-2 font-normal">Telefone</th>
              <th className="text-right py-2 font-normal">Valor</th>
              <th className="text-left py-2 pl-4 font-normal">Vencimento</th>
              <th className="text-left py-2 font-normal">Atendente</th>
            </tr>
          </thead>
          <tbody>
            {lembretes.map(l => (
              <tr key={l.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                <td className="py-3">{l.nome}</td>
                <td className="py-3 text-gray-400">{l.telefone}</td>
                <td className="py-3 text-right font-semibold">R$ {fmtBR(l.valor)}</td>
                <td className="py-3 pl-4">
                  <span className={`px-2 py-1 rounded text-xs border ${corUrgencia(l.urgencia)}`}>
                    {textoVcto(l.dias_para_vencer)}
                  </span>
                </td>
                <td className="py-3 text-gray-400">{l.atendente ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ROIOrigem({
  origens,
  fmtBR,
  unidadeId,
}: {
  origens: FunilOrigem[];
  fmtBR: (n: number) => string;
  unidadeId?: number;
}) {
  // Mostra so origens com receita > 0 ou pelo menos 1 fechamento, ordenadas por receita.
  const comReceita = origens
    .filter(o => o.receita > 0 || o.fecharam > 0)
    .sort((a, b) => b.receita - a.receita);
  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-6">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-semibold">Receita por origem</h2>
        <AtualizadoEm tipos={['leads', 'sistema']} unidadeId={unidadeId || undefined} />
      </div>
      <p className="text-xs text-gray-500 mb-6">Todas as origens, do início ao fim</p>
      {comReceita.length === 0 ? (
        <div className="text-gray-500 text-sm py-4">Nenhuma origem com receita registrada.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 uppercase">
            <tr className="border-b border-gray-800">
              <th className="text-left py-2 font-normal">Origem</th>
              <th className="text-right py-2 font-normal">Leads</th>
              <th className="text-right py-2 font-normal">Fecharam</th>
              <th className="text-right py-2 font-normal">Taxa</th>
              <th className="text-right py-2 font-normal">Receita</th>
            </tr>
          </thead>
          <tbody>
            {comReceita.map(r => {
              const taxa = r.cadastrados > 0 ? (r.fecharam / r.cadastrados) * 100 : 0;
              return (
                <tr key={r.origem} className="border-b border-gray-800 hover:bg-gray-800/30">
                  <td className="py-3">{r.origem}</td>
                  <td className="py-3 text-right text-gray-300">{r.cadastrados.toLocaleString('pt-BR')}</td>
                  <td className="py-3 text-right text-emerald-400 font-semibold">
                    {r.fecharam.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 text-right text-gray-400">{taxa.toFixed(0)}%</td>
                  <td className="py-3 text-right font-semibold text-emerald-400">R$ {fmtBR(r.receita)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
