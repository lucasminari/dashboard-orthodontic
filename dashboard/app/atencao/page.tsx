'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';

interface AttentionItem {
  id: string; // BigInt vira string no JSON
  kommoLeadId: string;
  unidadeId: number;
  motivo: string;
  prioridade: number;
  status: string;
  detectadoEm: string;
  vistoEm: string | null;
}

interface Contadores {
  porStatus: { aberto: number; visto: number; resolvido: number; descartado: number };
  abertosPorPrioridade: { 1: number; 2: number; 3: number };
}

const TABS = [
  { id: 'aberto', rotulo: 'Abertos' },
  { id: 'visto', rotulo: 'Vistos' },
  { id: 'resolvido', rotulo: 'Resolvidos' },
  { id: 'descartado', rotulo: 'Descartados' },
] as const;

export default function FilaAtencaoPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('aberto');
  const [itens, setItens] = useState<AttentionItem[] | null>(null);
  const [contadores, setContadores] = useState<Contadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [fila, c] = await Promise.all([
        api<AttentionItem[]>(`/atencao/fila?status=${tab}&limit=100`),
        api<Contadores>('/atencao/contadores'),
      ]);
      setItens(fila);
      setContadores(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, [tab]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000); // re-fetch a cada 30s
    return () => clearInterval(t);
  }, [carregar]);

  return (
    <div className="p-4 md:p-8 space-y-4">
      {contadores && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card titulo="Urgente" valor={contadores.abertosPorPrioridade[1]} cor="red" />
          <Card titulo="Média" valor={contadores.abertosPorPrioridade[2]} cor="amber" />
          <Card titulo="Baixa" valor={contadores.abertosPorPrioridade[3]} cor="gray" />
          <Card titulo="Resolvidos hoje" valor={contadores.porStatus.resolvido} cor="green" />
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm border-b-2 transition ${
              tab === t.id
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.rotulo}
            {contadores && ` (${contadores.porStatus[t.id]})`}
          </button>
        ))}
        <button
          onClick={carregar}
          className="ml-auto text-sm text-gray-400 hover:text-white px-3 py-2"
          title="Atualizar"
        >
          {carregando ? '⟳' : '↻'}
        </button>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      {itens === null ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum item.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(it => (
            <li key={it.id}>
              <Link
                href={`/atencao/${it.id}`}
                className="block bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-3 transition"
              >
                <div className="flex items-start gap-3">
                  <BadgePrioridade prioridade={it.prioridade} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {motivoPt(it.motivo)}
                      <span className="ml-2 text-gray-500 text-xs">lead #{it.kommoLeadId}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      detectado {tempoRelativo(it.detectadoEm)}
                      {it.vistoEm && ` · visto ${tempoRelativo(it.vistoEm)}`}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({
  titulo,
  valor,
  cor,
}: {
  titulo: string;
  valor: number;
  cor: 'red' | 'amber' | 'gray' | 'green';
}) {
  const cores: Record<string, string> = {
    red: 'border-red-800/40 text-red-300',
    amber: 'border-amber-800/40 text-amber-300',
    gray: 'border-gray-700 text-gray-300',
    green: 'border-green-800/40 text-green-300',
  };
  return (
    <div className={`bg-gray-900 border rounded-lg p-3 ${cores[cor]}`}>
      <p className="text-xs uppercase tracking-wide text-gray-400">{titulo}</p>
      <p className="text-2xl font-semibold mt-1">{valor}</p>
    </div>
  );
}

function BadgePrioridade({ prioridade }: { prioridade: number }) {
  const cor =
    prioridade === 1
      ? 'bg-red-900 text-red-200'
      : prioridade === 2
        ? 'bg-amber-900 text-amber-200'
        : 'bg-gray-800 text-gray-300';
  const rotulo = prioridade === 1 ? 'P1' : prioridade === 2 ? 'P2' : 'P3';
  return (
    <span className={`inline-flex items-center justify-center w-9 h-7 text-xs font-mono rounded ${cor}`}>
      {rotulo}
    </span>
  );
}

function motivoPt(m: string): string {
  switch (m) {
    case 'pediu_humano':
      return 'Pediu pra falar com atendente';
    case 'frustracao':
      return 'Sinais de frustração';
    case 'timeout_olivia':
      return 'Olívia parou de responder';
    case 'repeticao':
      return 'Repetindo perguntas';
    default:
      return m;
  }
}

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}
