'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

interface AttentionEvent {
  id: string;
  evento: string;
  ocorreuEm: string;
  metadata: unknown;
  usuario: { id: number; nome: string } | null;
}

interface AttentionDetalhe {
  id: string;
  kommoLeadId: string;
  unidadeId: number;
  motivo: string;
  motivoDetalhe: unknown;
  prioridade: number;
  status: string;
  detectadoEm: string;
  vistoEm: string | null;
  vistoPor: { id: number; nome: string } | null;
  resolvidoEm: string | null;
  resolvidoPor: { id: number; nome: string } | null;
  eventos: AttentionEvent[];
  linkKommo: string;
}

export default function DetalheAtencaoPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [item, setItem] = useState<AttentionDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<string | null>(null);

  async function carregar() {
    try {
      const r = await api<AttentionDetalhe>(`/atencao/${params.id}`);
      setItem(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    }
  }

  useEffect(() => {
    carregar();
  }, [params.id]);

  async function executarAcao(acaoNome: 'visto' | 'resolver' | 'descartar' | 'reabrir') {
    setAcao(acaoNome);
    try {
      await api(`/atencao/${params.id}/${acaoNome}`, { method: 'POST', body: JSON.stringify({}) });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setAcao(null);
    }
  }

  if (erro) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-400">{erro}</p>
        <Link href="/atencao" className="text-indigo-400 hover:underline text-sm mt-2 inline-block">
          ← Voltar pra fila
        </Link>
      </div>
    );
  }
  if (!item) return <div className="p-8 text-sm text-gray-400">Carregando…</div>;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">
      <Link href="/atencao" className="text-indigo-400 hover:underline text-sm">
        ← Voltar pra fila
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <BadgePrioridade prioridade={item.prioridade} />
          <h2 className="text-lg font-semibold">{motivoPt(item.motivo)}</h2>
          <BadgeStatus status={item.status} />
        </div>
        <p className="text-sm text-gray-400">
          Lead #{item.kommoLeadId} · detectado em {new Date(item.detectadoEm).toLocaleString('pt-BR')}
        </p>
      </header>

      {item.linkKommo && (
        <a
          href={item.linkKommo}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded transition"
        >
          Abrir conversa no Kommo ↗
        </a>
      )}

      {item.motivoDetalhe != null && (
        <DetalhesBox detalhe={item.motivoDetalhe} />
      )}

      <div className="flex flex-wrap gap-2">
        {item.status === 'aberto' && (
          <BotaoAcao onClick={() => executarAcao('visto')} loading={acao === 'visto'}>
            Marcar como visto
          </BotaoAcao>
        )}
        {(item.status === 'aberto' || item.status === 'visto') && (
          <>
            <BotaoAcao onClick={() => executarAcao('resolver')} loading={acao === 'resolver'} variante="primary">
              Resolver
            </BotaoAcao>
            <BotaoAcao onClick={() => executarAcao('descartar')} loading={acao === 'descartar'} variante="danger">
              Falso positivo
            </BotaoAcao>
          </>
        )}
        {(item.status === 'resolvido' || item.status === 'descartado') && (
          <BotaoAcao onClick={() => executarAcao('reabrir')} loading={acao === 'reabrir'}>
            Reabrir
          </BotaoAcao>
        )}
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Histórico</h3>
        <ul className="space-y-1.5">
          {item.eventos.map(ev => (
            <li key={ev.id} className="text-sm text-gray-400">
              <span className="text-gray-500 mr-2">
                {new Date(ev.ocorreuEm).toLocaleString('pt-BR')}
              </span>
              <span className="text-gray-200">{eventoPt(ev.evento)}</span>
              {ev.usuario && <span className="text-gray-500"> por {ev.usuario.nome}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DetalhesBox({ detalhe }: { detalhe: unknown }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Detalhes</p>
      <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
        {JSON.stringify(detalhe, null, 2)}
      </pre>
    </div>
  );
}

function BotaoAcao({
  children,
  onClick,
  loading,
  variante = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  variante?: 'default' | 'primary' | 'danger';
}) {
  const cores = {
    default: 'bg-gray-800 hover:bg-gray-700 text-gray-100',
    primary: 'bg-green-700 hover:bg-green-600 text-white',
    danger: 'bg-red-800 hover:bg-red-700 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`text-sm px-4 py-2 rounded transition disabled:opacity-50 ${cores[variante]}`}
    >
      {loading ? '...' : children}
    </button>
  );
}

function BadgePrioridade({ prioridade }: { prioridade: number }) {
  const cor =
    prioridade === 1
      ? 'bg-red-900 text-red-200'
      : prioridade === 2
        ? 'bg-amber-900 text-amber-200'
        : 'bg-gray-800 text-gray-300';
  return (
    <span className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-mono rounded ${cor}`}>
      {prioridade === 1 ? 'P1 urgente' : prioridade === 2 ? 'P2 média' : 'P3 baixa'}
    </span>
  );
}

function BadgeStatus({ status }: { status: string }) {
  const cor =
    status === 'aberto'
      ? 'bg-red-900/40 text-red-200'
      : status === 'visto'
        ? 'bg-amber-900/40 text-amber-200'
        : status === 'resolvido'
          ? 'bg-green-900/40 text-green-200'
          : 'bg-gray-800 text-gray-400';
  return <span className={`text-xs px-2 py-0.5 rounded ${cor}`}>{status}</span>;
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

function eventoPt(e: string): string {
  switch (e) {
    case 'criado':
      return 'item criado';
    case 'visto':
      return 'marcado como visto';
    case 'resolvido':
      return 'resolvido';
    case 'descartado':
      return 'marcado como falso positivo';
    case 'reaberto':
      return 'reaberto';
    default:
      return e;
  }
}
