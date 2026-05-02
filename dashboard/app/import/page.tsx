'use client';

import { useEffect, useState } from 'react';

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
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());

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

  const unidadesVisiveis = dados ?? [];

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-10">
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
