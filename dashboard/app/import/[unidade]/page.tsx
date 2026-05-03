'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';
import { useUploadQueue } from '@/lib/hooks/useUploadQueue';

const TIPOS_LABEL: Record<string, string> = {
  leads: 'Leads',
  sistema: 'Sistema (contratos)',
  performance: 'Performance',
  campanhas: 'Campanhas',
};

const UNIDADE_MAP: Record<string, { id: number; nome: string }> = {
  centro: { id: 1, nome: 'Centro' },
  varzea: { id: 2, nome: 'Várzea Paulista' },
  hortolandia: { id: 3, nome: 'Hortolândia' },
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

function classeStatus(): string {
  return 'bg-gray-800/40 border-gray-700/60 text-gray-100';
}

function pontoStatus(temRelatorio: boolean): string {
  if (!temRelatorio) return 'bg-gray-400';
  return 'bg-blue-400';
}

function textoStatus(data: string | null): string {
  if (!data) return 'Aguardando primeiro import';
  return `Última atualização: ${formatDataBR(data)}`;
}

function formatDataBR(d: string | null): string {
  if (!d) return '—';
  const [ano, mes, dia] = d.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

type ArquivoSelecionado = {
  tipo: string;
  arquivo?: File;
};

export default function ImportUnidadePage({ params }: { params: Promise<{ unidade: string }> }) {
  const [dados, setDados] = useState<UnidadeStatus[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());
  const [arquivos, setArquivos] = useState<Record<string, File | null>>({
    leads: null,
    sistema: null,
    performance: null,
    campanhas: null,
  });
  const [enviando, setEnviando] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [sucessoUpload, setSucessoUpload] = useState(false);
  const [mostraFilaUploads, setMostraFilaUploads] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [resultadoLimpeza, setResultadoLimpeza] = useState<string | null>(null);
  const [historico, setHistorico] = useState<ImportLog[] | null>(null);
  const [removendoId, setRemovendoId] = useState<number | null>(null);

  const { queue, isLoading: filaCarregando, retryUpload } = useUploadQueue();

  const { unidade } = use(params);
  const unidadeSlug = unidade.toLowerCase();
  const unidadeInfo = UNIDADE_MAP[unidadeSlug];
  const unidadeId = unidadeInfo?.id;

  const carregar = () => {
    fetch('/api/imports-status')
      .then(r => r.json())
      .then(d => {
        if (d.erro) {
          setErro(d.erro);
        } else {
          setDados(d.unidades || []);
        }
        setCarregando(false);
      })
      .catch(e => {
        setErro(e.message);
        setCarregando(false);
      });
    if (unidadeId) {
      fetch(`/api/imports-historico?limit=100&unidade_id=${unidadeId}`)
        .then(r => r.json())
        .then(d => {
          if (!d.error) setHistorico(d.itens || []);
        })
        .catch(() => {});
    }
  };

  const removerImportacao = async (h: ImportLog) => {
    const ok = window.confirm(
      `Apagar esta importação?\n\n${h.tipo} · ${h.data_relatorio}\n${h.qtd_linhas} linhas (${h.arquivo || 'sem nome'})\n\nIsso vai remover só esses dados específicos. Não dá pra desfazer.`,
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
        carregar();
      }
    } catch (e) {
      alert(`Erro: ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setRemovendoId(null);
    }
  };

  useEffect(() => {
    carregar();
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const limparDadosUnidade = async () => {
    if (!unidadeId) return;
    const ok = window.confirm(
      `⚠️ ATENÇÃO\n\nIsso vai apagar TODOS os dados de ${unidadeInfo?.nome} (leads, agendamentos, contratos, pagamentos, telemarketing).\n\nUse só se for reimportar logo em seguida com o histórico completo.\n\nConfirma?`,
    );
    if (!ok) return;
    setLimpando(true);
    setResultadoLimpeza(null);
    try {
      const res = await fetch('/api/limpar-unidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidade_id: unidadeId, confirmar: true }),
      });
      const json = await res.json();
      if (json.error) {
        setResultadoLimpeza(`Erro: ${json.error}`);
      } else {
        const totais = json.apagados || {};
        const linhas = Object.entries(totais)
          .map(([t, n]) => `${t}: ${n}`)
          .join(' · ');
        setResultadoLimpeza(`✓ Apagado de ${unidadeInfo?.nome}. ${linhas}. Agora suba os arquivos novos.`);
        carregar();
      }
    } catch (e) {
      setResultadoLimpeza(`Erro: ${e instanceof Error ? e.message : 'erro'}`);
    } finally {
      setLimpando(false);
    }
  };

  const enviarArquivos = async () => {
    if (!unidadeId) return;
    // 3 obrigatorios: sistema, performance, campanhas. Leads é opcional.
    const obrigatorios = ['sistema', 'performance', 'campanhas'];
    const faltando = obrigatorios.filter(t => !arquivos[t]);
    if (faltando.length > 0) {
      setErroUpload(`Faltam arquivos: ${faltando.join(', ')}`);
      return;
    }

    setEnviando(true);
    setErroUpload(null);
    setSucessoUpload(false);

    const formData = new FormData();
    formData.append('unidade_id', unidadeId.toString());
    for (const [tipo, file] of Object.entries(arquivos)) {
      if (file) formData.append(tipo, file);
    }

    try {
      const res = await fetch('/api/import-upload', {
        method: 'POST',
        body: formData,
        cache: 'no-store',
      });
      const data = await res.json();

      console.log('[upload] resposta:', res.status, data);

      if (res.status === 200 && data.success === true) {
        // Sucesso real do servidor
        setSucessoUpload(true);
        setArquivos({ leads: null, sistema: null, performance: null, campanhas: null });
        setTimeout(() => {
          carregar();
          setSucessoUpload(false);
          setEnviando(false);
        }, 2500);
      } else if (res.status === 202 && data.queued === true) {
        // Enfileirado pelo Service Worker (offline)
        setErroUpload('⏳ Sem conexão. Arquivos salvos localmente — vão ser enviados quando voltar online.');
        setArquivos({ leads: null, sistema: null, performance: null, campanhas: null });
        setEnviando(false);
      } else {
        // Erro real do servidor
        setErroUpload(data.error || `Erro ao enviar arquivos (HTTP ${res.status})`);
        setEnviando(false);
      }
    } catch (e) {
      setErroUpload(e instanceof Error ? e.message : 'Erro ao enviar');
      setEnviando(false);
    }
  };

  const processarArquivos = (files: FileList) => {
    const novoEstado = { ...arquivos };
    const tipos = ['leads', 'sistema', 'performance', 'campanhas'];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const nome = file.name.toLowerCase();
      for (const tipo of tipos) {
        if (nome.includes(tipo)) {
          novoEstado[tipo] = file;
          break;
        }
      }
    }
    setArquivos(novoEstado);
    setErroUpload(null);
  };

  if (!unidadeInfo) {
    return (
      <main className="min-h-screen bg-black text-white p-6 md:p-10">
        <div className="max-w-5xl mx-auto">
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4">
            Unidade não encontrada: {unidadeSlug}. Use: centro, varzea ou hortolandia.
          </div>
          <a href="/import" className="text-sm text-gray-400 hover:text-gray-300 mt-4 inline-block">
            ← Voltar
          </a>
        </div>
      </main>
    );
  }

  const unidadesVisiveis = dados?.filter(u => u.unidade_id === unidadeId) ?? [];

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Status de importações</h1>
              <p className="text-gray-400 text-sm mt-1">
                Acompanhamento dos exports diários de {unidadeInfo.nome}.
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

        {!carregando && !erro && (
          <div className="space-y-8">
            {/* Status cards */}
            <div className="space-y-5">
              {unidadesVisiveis.map(u => {
                const todasAtualizadas = u.tipos.every(t => t.data_relatorio !== null);
                return (
                  <div
                    key={u.unidade_id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-6"
                  >
                    <div className="flex items-center gap-3 mb-5">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${pontoStatus(todasAtualizadas)}`}
                      />
                      <h2 className="text-xl font-semibold">{u.unidade_nome}</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {u.tipos.map(t => (
                          <div
                            key={t.tipo}
                            className={`p-4 rounded-lg border ${classeStatus()}`}
                          >
                            <div className="text-[10px] uppercase tracking-widest opacity-70 mb-2">
                              {TIPOS_LABEL[t.tipo]}
                            </div>
                            <div className="text-base font-semibold leading-tight">
                              {textoStatus(t.data_relatorio)}
                            </div>
                            {t.data_relatorio && (
                              <div className="text-xs mt-2 opacity-80">
                                {t.qtd_linhas} linhas
                              </div>
                            )}
                          </div>
                        ))}

                    </div>
                  </div>
                );
              })}
            </div>

            {/* Upload de arquivos */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-xl font-semibold mb-1">Upload de Arquivos</h2>
                <p className="text-gray-400 text-sm">Arraste os 3 arquivos aqui ou clique para selecionar</p>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('border-blue-500', 'bg-blue-500/5');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('border-blue-500', 'bg-blue-500/5');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-blue-500', 'bg-blue-500/5');
                  processarArquivos(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer transition hover:border-gray-500 hover:bg-gray-800/50"
              >
                <label className="block cursor-pointer">
                  <div className="text-3xl mb-2">📁</div>
                  <div className="text-sm font-medium text-gray-300 mb-1">
                    Arraste os arquivos aqui
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    ou clique para selecionar múltiplos arquivos
                  </div>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => e.target.files && processarArquivos(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-300 mb-3">Arquivos selecionados:</div>
                {['sistema', 'performance', 'campanhas'].map(tipo => (
                  <div key={tipo} className="flex items-center gap-2 text-sm">
                    <div className={`w-4 h-4 rounded border ${arquivos[tipo] ? 'bg-blue-500 border-blue-500' : 'border-gray-600'}`}>
                      {arquivos[tipo] && <div className="text-white text-xs flex items-center justify-center h-full">✓</div>}
                    </div>
                    <span className="text-gray-400 capitalize">{tipo}</span>
                    {arquivos[tipo] && (
                      <span className="text-xs text-gray-500">
                        — {arquivos[tipo].name}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {erroUpload && (
                <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-3 text-sm">
                  {erroUpload}
                </div>
              )}

              {sucessoUpload && (
                <div className="bg-emerald-950/40 border border-emerald-700/60 text-emerald-200 rounded-lg p-3 text-sm">
                  ✅ Importação concluída com sucesso! Atualizando...
                </div>
              )}

              <button
                onClick={enviarArquivos}
                disabled={enviando || !arquivos.sistema || !arquivos.performance || !arquivos.campanhas}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                {enviando ? 'Enviando...' : 'Enviar Arquivos'}
              </button>

              <details className="text-xs text-gray-500 mt-2">
                <summary className="cursor-pointer hover:text-gray-400">⚠️ Limpar dados desta unidade</summary>
                <div className="mt-2 p-3 bg-red-950/30 border border-red-900/40 rounded">
                  <p className="text-gray-400 mb-2">
                    Apaga TODOS os dados de {unidadeInfo?.nome} (leads, agendamentos, contratos, pagamentos, telemarketing). Use só pra refazer do zero. Pra remover apenas uma importação específica, use a tela <a href="/import" className="text-indigo-400 hover:underline">Relatórios</a>.
                  </p>
                  <button
                    onClick={limparDadosUnidade}
                    disabled={limpando}
                    className="text-xs bg-red-900/50 hover:bg-red-900 text-red-200 px-3 py-1.5 rounded border border-red-800 disabled:opacity-50 transition"
                  >
                    {limpando ? 'Apagando...' : `Apagar tudo de ${unidadeInfo?.nome}`}
                  </button>
                  {resultadoLimpeza && (
                    <div className="mt-2 text-[11px] text-gray-300">{resultadoLimpeza}</div>
                  )}
                </div>
              </details>

              {(queue.pending.length > 0 || queue.uploading.length > 0 || queue.failed.length > 0) && (
                <div className="bg-amber-950/40 border border-amber-700/60 text-amber-200 rounded-lg p-3 text-sm">
                  <button
                    onClick={() => setMostraFilaUploads(!mostraFilaUploads)}
                    className="flex items-center gap-2 w-full text-left hover:opacity-80"
                  >
                    <span>⏳ {queue.pending.length + queue.uploading.length + queue.failed.length} upload(s) na fila</span>
                    <span className="text-xs ml-auto">{mostraFilaUploads ? '▼' : '▶'}</span>
                  </button>

                  {mostraFilaUploads && (
                    <div className="mt-3 space-y-2 text-xs">
                      {queue.uploading.length > 0 && (
                        <div>
                          <div className="font-semibold text-blue-200 mb-1">Enviando:</div>
                          {queue.uploading.map(u => (
                            <div key={u.id} className="text-gray-300 ml-2">
                              • {new Date(u.timestamp).toLocaleTimeString('pt-BR')}
                            </div>
                          ))}
                        </div>
                      )}
                      {queue.pending.length > 0 && (
                        <div>
                          <div className="font-semibold text-yellow-200 mb-1">Aguardando:</div>
                          {queue.pending.map(u => (
                            <div key={u.id} className="text-gray-300 ml-2">
                              • {new Date(u.timestamp).toLocaleTimeString('pt-BR')}
                            </div>
                          ))}
                        </div>
                      )}
                      {queue.failed.length > 0 && (
                        <div>
                          <div className="font-semibold text-red-200 mb-1">Com erro (retentando em breve):</div>
                          {queue.failed.map(u => (
                            <div key={u.id} className="text-gray-300 ml-2 flex items-center justify-between">
                              <span>• {new Date(u.timestamp).toLocaleTimeString('pt-BR')} ({u.retries}x)</span>
                              <button
                                onClick={() => retryUpload(u.id)}
                                className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-white transition"
                              >
                                Tentar agora
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Histórico de uploads desta unidade */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="text-lg font-semibold">Importações desta unidade</h2>
                <p className="text-xs text-gray-500">Clique em "Remover" pra apagar uma importação específica e os dados que ela trouxe.</p>
              </div>
              {!historico || historico.length === 0 ? (
                <div className="p-6 text-sm text-gray-500 text-center">
                  Nenhuma importação registrada pra esta unidade.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-800/30">
                      <tr>
                        <th className="text-left px-4 py-2 font-normal">Quando</th>
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

            {/* Instruções de export */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-xl font-semibold mb-1">Como exportar</h2>
                <p className="text-gray-400 text-sm">Siga estes passos para exportar os dados de hoje</p>
              </div>

              <div className="space-y-4 text-sm">
                <div className="border-l-2 border-cyan-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-cyan-100">1️⃣ Sistema (Contratos)</div>
                    <a
                      href="https://franquias.orthodonticbrasil.com/relatorios_campanha_01"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-cyan-600 hover:bg-cyan-700 px-3 py-1 rounded text-white font-medium transition"
                    >
                      Abrir Relatório →
                    </a>
                  </div>
                  <div className="text-gray-400 text-xs space-y-1 mb-2">
                    <p><strong>Filtro:</strong> Status = Contratos por <span className="text-amber-300">Data de Pagamento</span>, Período = mês corrente até hoje</p>
                    <p className="text-amber-300/80">⚠️ Use o filtro Data de Pagamento (não Data de Fechamento) — assim só entram os contratos efetivamente pagos.</p>
                    <p><strong>Arquivo:</strong> Selecionar (azul) → Excel → baixe diretamente (sem renomear)</p>
                  </div>
                </div>

                <div className="border-l-2 border-purple-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-purple-100">2️⃣ Performance</div>
                    <a
                      href="https://franquias.orthodonticbrasil.com/comercial_relatorio_performance"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-white font-medium transition"
                    >
                      Abrir Relatório →
                    </a>
                  </div>
                  <div className="text-gray-400 text-xs space-y-1 mb-2">
                    <p><strong>Filtro:</strong> Base da Data = Data do Agendamento, Período = mês corrente até hoje</p>
                    <p><strong>Arquivo:</strong> clique em Exportar → baixe diretamente (sem renomear)</p>
                    <p className="text-amber-300">⚠️ Este arquivo é CSV (não Excel)</p>
                  </div>
                </div>

                <div className="border-l-2 border-green-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-green-100">3️⃣ Campanhas</div>
                    <a
                      href="https://franquias.orthodonticbrasil.com/comercial_relatorio_campanha"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-white font-medium transition"
                    >
                      Abrir Relatório →
                    </a>
                  </div>
                  <div className="text-gray-400 text-xs space-y-1 mb-2">
                    <p><strong>Filtro:</strong> Período = mês corrente até hoje</p>
                    <p><strong>Arquivo:</strong> clique em Exportar → baixe diretamente (sem renomear)</p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2"><strong>Após exportar os 3 arquivos:</strong></p>
                <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Use a seção <strong>Upload de Arquivos</strong> acima para enviar os 3 arquivos</li>
                  <li>Os dados serão processados automaticamente e o dashboard atualizará em poucos segundos</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-10 pt-6 border-t border-gray-900 text-xs text-gray-600 flex justify-between flex-wrap gap-2">
          <span>
            <a href="/import" className="hover:text-gray-400">← Voltar ao status geral</a>
          </span>
          <span>Reload da página atualiza os dados.</span>
        </footer>
      </div>
    </main>
  );
}
