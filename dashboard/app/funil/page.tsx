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
  return `${(v * 100).toFixed(1)}%`;
}

export default function FunilPage() {
  const [unidadeId, setUnidadeId] = useState(0);
  const [periodoId, setPeriodoId] = useState('mes');
  const [dados, setDados] = useState<RespostaFunil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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

  const funisKommo = dados?.funis.filter(f => f.fonte === 'kommo') || [];
  const funisSistema = dados?.funis.filter(f => f.fonte === 'sistema') || [];
  const total = dados?.total;

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Funil completo por origem</h1>
          <p className="text-gray-400 text-sm mt-1">
            Caminho do lead do cadastro ao pagamento, juntando dados da Kommo e do sistema Orthodontic.
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
                {dados.contagem.leads} leads · {dados.contagem.sistema} no sistema · {dados.contagem.performance} no telemarketing
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
            {periodoId === 'tudo' && (
              <div className="mb-6 bg-amber-950/30 border border-amber-800/50 text-amber-200 rounded-lg p-3 text-xs">
                ⚠️ <strong>Sem filtro de data:</strong> a Kommo é usada há poucos meses, mas o sistema Orthodontic
                tem leads antigos. Por isso pode aparecer "agendados &gt; cadastrados" — leads antigos com a mesma
                origem agendam mas não estão na Kommo. Use um período recente (este mês, mês anterior) pra
                números mais coerentes.
              </div>
            )}

            {/* Cards Total */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
              <Card titulo="Cadastrados" valor={total?.cadastrados || 0} cor="blue" />
              <Card titulo="Agendados" valor={total?.agendados || 0} cor="cyan" />
              <Card titulo="Compareceram" valor={total?.compareceram || 0} cor="purple" />
              <Card titulo="Fecharam" valor={total?.fecharam || 0} cor="amber" />
              <Card titulo="Pagaram" valor={total?.pagaram || 0} cor="emerald" />
            </div>

            {/* Origens Kommo */}
            <Section
              titulo="Origens da Kommo"
              descricao="Leads que nascem na Kommo, agendam, e seguem o funil no sistema Orthodontic."
              funis={funisKommo}
              tiposAtualizacao={['leads', 'sistema', 'performance']}
              unidadeId={unidadeId || undefined}
            />

            {/* Origens Sistema */}
            <Section
              titulo="Origens do sistema Orthodontic"
              descricao="Leads que nascem direto no sistema Orthodontic (sem passar pela Kommo)."
              funis={funisSistema}
              tiposAtualizacao={['sistema', 'performance']}
              unidadeId={unidadeId || undefined}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Card({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
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

function Section({
  titulo,
  descricao,
  funis,
  tiposAtualizacao,
  unidadeId,
}: {
  titulo: string;
  descricao: string;
  funis: FunilOrigem[];
  tiposAtualizacao?: ('leads' | 'sistema' | 'performance' | 'campanhas')[];
  unidadeId?: number;
}) {
  if (funis.length === 0) return null;
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{titulo}</h2>
          <p className="text-gray-400 text-sm">{descricao}</p>
        </div>
        {tiposAtualizacao && (
          <AtualizadoEm tipos={tiposAtualizacao} unidadeId={unidadeId} />
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60 text-gray-300 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Origem</th>
                <th className="text-right px-3 py-3">Cadastr.</th>
                <th className="text-right px-3 py-3 text-blue-300">→ Agend.</th>
                <th className="text-right px-3 py-3">Agend.</th>
                <th className="text-right px-3 py-3 text-blue-300">→ Compar.</th>
                <th className="text-right px-3 py-3">Compar.</th>
                <th className="text-right px-3 py-3 text-blue-300">→ Fechou</th>
                <th className="text-right px-3 py-3">Fecharam</th>
                <th className="text-right px-3 py-3 text-blue-300">→ Pagou</th>
                <th className="text-right px-3 py-3">Pagaram</th>
              </tr>
            </thead>
            <tbody>
              {funis.map((f, i) => (
                <tr
                  key={f.origem}
                  className={`border-t border-gray-800 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'}`}
                >
                  <td className="px-4 py-3 font-medium">{f.origem}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.cadastrados}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-blue-300 text-xs">
                    {fmtPct(f.taxa_cadastro_para_agendamento)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.agendados}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-blue-300 text-xs">
                    {fmtPct(f.taxa_agendamento_para_comparecimento)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.compareceram}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-blue-300 text-xs">
                    {fmtPct(f.taxa_comparecimento_para_fechamento)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.fecharam}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-blue-300 text-xs">
                    {fmtPct(f.taxa_fechamento_para_pagamento)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-300">
                    {f.pagaram}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
