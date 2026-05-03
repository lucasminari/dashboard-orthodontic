'use client';

import { useEffect, useState } from 'react';
import { ExportarCSV } from '../components/ExportarCSV';

const TIPOS_LABEL: Record<string, string> = {
  leads: 'Leads',
  sistema: 'Sistema (contratos)',
  performance: 'Performance',
  campanhas: 'Campanhas',
};

const UNIDADE_SLUG: Record<string, number> = {
  centro: 1,
  varzea: 2,
  hortolandia: 3,
};

type TipoStatus = {
  tipo: string;
  data_relatorio: string | null;
  qtd_linhas: number;
  concluido_em: string | null;
  arquivo: string | null;
};

type UnidadeStatus = {
  unidade_id: number;
  unidade_nome: string;
  tipos: TipoStatus[];
};

type ImportLog = {
  id: number;
  unidade_id: number;
  unidade: string;
  tipo: string;
  data_relatorio: string;
  qtd_linhas: number;
  concluido_em: string | null;
  criado_em: string | null;
  arquivo: string | null;
  status: 'concluido' | 'pendente';
};

const TIPO_COR: Record<string, string> = {
  leads: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/40',
  sistema: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/40',
  performance: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
  campanhas: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40',
};

function formatDataHora(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleDateString('pt-BR')} ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function diasDesde(data: string | null): number {
  if (!data) return Infinity;
  const d = new Date(data);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function classeStatus(dias: number): string {
  if (dias === 0) return 'bg-emerald-950/40 border-emerald-700/60 text-emerald-100';
  if (dias === 1) return 'bg-amber-950/40 border-amber-700/60 text-amber-100';
  return 'bg-red-950/40 border-red-700/60 text-red-100';
}

function pontoStatus(dias: number): string {
  if (dias === 0) return 'bg-emerald-400';
  if (dias === 1) return 'bg-amber-400';
  return 'bg-red-400';
}

function textoStatus(dias: number, data: string | null): string {
  if (!data) return 'Nunca importado';
  if (dias === 0) return 'Atualizado hoje';
  if (dias === 1) return 'Atualizado ontem';
  return `Atrasado ${dias} dias`;
}

function formatDataBR(d: string | null): string {
  if (!d) return '—';
  const [ano, mes, dia] = d.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function ImportPage() {
  const [dados, setDados] = useState<UnidadeStatus[] | null>(null);
  const [historico, setHistorico] = useState<ImportLog[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());
  const [removendoId, setRemovendoId] = useState<number | null>(null);

  const recarregar = () => {
    Promise.all([
      fetch('/api/imports-status').then(r => r.json()),
      fetch('/api/imports-historico?limit=50').then(r => r.json()),
    ])
      .then(([statusRes, histRes]) => {
        if (statusRes.erro) setErro(statusRes.erro);
        else setDados(statusRes.unidades || []);
        if (!histRes.error) setHistorico(histRes.itens || []);
      })
      .catch(e => setErro(e.message))
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    recarregar();
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const removerImportacao = async (h: ImportLog) => {
    const ok = window.confirm(
      `Apagar esta importação?\n\n${h.unidade} · ${h.tipo} · ${h.data_relatorio}\n${h.qtd_linhas} linhas (${h.arquivo || 'sem nome'})\n\nIsso vai remover só esses dados específicos. Não dá pra desfazer.`,
    );
    if (!ok) return;
    setRemovendoId(h.id);
    try {
      const res = await fetch('/api/limpar-ingestao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingestao_id: h.id, confirmar: true }),
      });
      const json = await res.json();
      if (json.error) {
        alert(`Erro: ${json.error}`);
      } else {
        recarregar();
      }
    } catch (e) {
      alert(`Erro: ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setRemovendoId(null);
    }
  };

  const unidadesVisiveis = dados ?? [];

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Status de importações</h1>
              <p className="text-gray-400 text-sm mt-1">
                Acompanhamento dos exports diários das 3 unidades. Clique em uma para ver as instruções de export.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              Atualizado às {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </header>

        {carregando && <div className="text-gray-400">Carregando...</div>}

        {erro && (
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4">
            Erro ao carregar status: {erro}
          </div>
        )}

        {!carregando && !erro && unidadesVisiveis.length === 0 && (
          <div className="text-gray-400">Nenhuma unidade encontrada.</div>
        )}

        {!carregando && !erro && (
          <div className="space-y-8">
            {/* Atalhos para cada unidade */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <a
                href="/import/centro"
                className="bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 rounded-lg px-4 py-3 text-sm font-medium text-blue-300 transition text-center"
              >
                🏢 Centro
              </a>
              <a
                href="/import/varzea"
                className="bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-600/50 rounded-lg px-4 py-3 text-sm font-medium text-cyan-300 transition text-center"
              >
                🏢 Várzea Paulista
              </a>
              <a
                href="/import/hortolandia"
                className="bg-teal-600/20 hover:bg-teal-600/30 border border-teal-600/50 rounded-lg px-4 py-3 text-sm font-medium text-teal-300 transition text-center"
              >
                🏢 Hortolândia
              </a>
            </div>

            {/* Historico de importacoes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold">Histórico de importações</h2>
                  <p className="text-xs text-gray-500">Últimos uploads bem-sucedidos, do mais recente ao mais antigo.</p>
                </div>
                <div className="flex items-center gap-3">
                  {historico && historico.length > 0 && (
                    <ExportarCSV
                      nomeArquivo="historico-importacoes"
                      linhas={historico}
                      colunas={[
                        { titulo: 'Concluído em', valor: h => h.concluido_em || h.criado_em || '' },
                        { titulo: 'Unidade', valor: h => h.unidade },
                        { titulo: 'Tipo', valor: h => h.tipo },
                        { titulo: 'Data referência', valor: h => h.data_relatorio },
                        { titulo: 'Linhas processadas', valor: h => h.qtd_linhas },
                        { titulo: 'Arquivo', valor: h => h.arquivo ?? '' },
                      ]}
                    />
                  )}
                  {historico && (
                    <span className="text-xs text-gray-500">{historico.length} registro(s)</span>
                  )}
                </div>
              </div>
              {!historico || historico.length === 0 ? (
                <div className="p-6 text-sm text-gray-500 text-center">
                  Nenhuma importação registrada ainda.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-800/30">
                      <tr>
                        <th className="text-left px-4 py-2 font-normal">Quando</th>
                        <th className="text-left px-4 py-2 font-normal">Unidade</th>
                        <th className="text-left px-4 py-2 font-normal">Tipo</th>
                        <th className="text-left px-4 py-2 font-normal">Data referência</th>
                        <th className="text-right px-4 py-2 font-normal">Linhas</th>
                        <th className="text-left px-4 py-2 font-normal">Arquivo</th>
                        <th className="text-right px-4 py-2 font-normal">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.map(h => (
                        <tr key={h.id} className="border-t border-gray-800/60 hover:bg-gray-800/20">
                          <td className="px-4 py-2 text-gray-300 whitespace-nowrap">
                            {formatDataHora(h.concluido_em || h.criado_em)}
                          </td>
                          <td className="px-4 py-2 text-gray-400">{h.unidade}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border ${TIPO_COR[h.tipo] || 'bg-gray-800 text-gray-400 border-gray-700'}`}
                            >
                              {h.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-400">{formatDataBR(h.data_relatorio)}</td>
                          <td className="px-4 py-2 text-right text-gray-300 tabular-nums">
                            {h.qtd_linhas.toLocaleString('pt-BR')}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 truncate max-w-xs" title={h.arquivo || ''}>
                            {h.arquivo || ''}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => removerImportacao(h)}
                              disabled={removendoId === h.id}
                              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/40 px-2 py-1 rounded border border-red-900/40 disabled:opacity-50 transition"
                              title="Apagar esta importação e os dados associados"
                            >
                              {removendoId === h.id ? '...' : 'Remover'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="mt-10 pt-6 border-t border-gray-900 text-xs text-gray-600 flex justify-between flex-wrap gap-2">
          <span>
            <a href="/" className="hover:text-gray-400">← Voltar ao dashboard</a>
          </span>
          <span>Reload da página atualiza os dados.</span>
        </footer>
      </div>
    </main>
  );
}
