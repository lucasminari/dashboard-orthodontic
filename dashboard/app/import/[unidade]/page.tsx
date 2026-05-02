'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';

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

function pontoStatus(): string {
  return 'bg-blue-400';
}

function textoStatus(data: string | null): string {
  if (!data) return 'Nunca importado';
  return `Atualizado em ${formatDataBR(data)}`;
}

function formatDataBR(d: string | null): string {
  if (!d) return '—';
  const [ano, mes, dia] = d.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function ImportUnidadePage({ params }: { params: Promise<{ unidade: string }> }) {
  const [dados, setDados] = useState<UnidadeStatus[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());

  const { unidade } = use(params);
  const unidadeSlug = unidade.toLowerCase();
  const unidadeInfo = UNIDADE_MAP[unidadeSlug];
  const unidadeId = unidadeInfo?.id;

  useEffect(() => {
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

    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
              {unidadesVisiveis.map(u => (
                  <div
                    key={u.unidade_id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-6"
                  >
                    <div className="flex items-center gap-3 mb-5">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${pontoStatus()}`}
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
              ))}
            </div>

            {/* Instruções de export */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-xl font-semibold mb-1">Como exportar</h2>
                <p className="text-gray-400 text-sm">Siga estes passos para exportar os dados de hoje</p>
              </div>

              <div className="space-y-4 text-sm">
                <div className="border-l-2 border-blue-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-blue-100">1️⃣ Leads</div>
                    <a
                      href="https://franquias.orthodonticbrasil.com/comercial_gestao_leads"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-white font-medium transition"
                    >
                      Abrir Relatório →
                    </a>
                  </div>
                  <div className="text-gray-400 text-xs space-y-1 mb-2">
                    <p><strong>Filtro:</strong> Data de Referência = Cadastro (Lead único), Período = mês corrente até hoje</p>
                    <p><strong>Arquivo:</strong> clique em Exportar → salve como <code className="bg-gray-800 px-2 py-1 rounded">YYYY-MM-DD_leads.xlsx</code></p>
                  </div>
                </div>

                <div className="border-l-2 border-cyan-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-cyan-100">2️⃣ Sistema (Contratos)</div>
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
                    <p><strong>Filtro:</strong> Status = Contratos por Data de Fechamento, Período = mês corrente até hoje</p>
                    <p><strong>Arquivo:</strong> Selecionar (azul) → Excel → salve como <code className="bg-gray-800 px-2 py-1 rounded">YYYY-MM-DD_sistema.xlsx</code></p>
                  </div>
                </div>

                <div className="border-l-2 border-purple-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-purple-100">3️⃣ Performance</div>
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
                    <p><strong>Arquivo:</strong> clique em Exportar → salve como <code className="bg-gray-800 px-2 py-1 rounded">YYYY-MM-DD_performance.csv</code></p>
                    <p className="text-amber-300">⚠️ Este arquivo é CSV (não Excel)</p>
                  </div>
                </div>

                <div className="border-l-2 border-green-500 pl-4 py-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-green-100">4️⃣ Campanhas</div>
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
                    <p><strong>Arquivo:</strong> clique em Exportar → salve como <code className="bg-gray-800 px-2 py-1 rounded">YYYY-MM-DD_campanhas.xlsx</code></p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-2"><strong>Após exportar os 4 arquivos:</strong></p>
                <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                  <li>Coloque os 4 arquivos na pasta <code className="bg-gray-900 px-2 py-0.5 rounded text-gray-300">imports/{unidadeInfo.nome.split(' ')[0]}/</code></li>
                  <li>O Lucas roda <code className="bg-gray-900 px-2 py-0.5 rounded text-gray-300">node importar-dia.js</code> e os dados chegam ao dashboard</li>
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
