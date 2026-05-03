'use client';

import { useState, useEffect, useCallback } from 'react';
import { UNIDADES } from '../components/useFiltros';

type Meta = {
  id?: number;
  unidade_id: number;
  mes: string;
  tipo: TipoMeta;
  valor: number;
};

type TipoMeta = 'agendados' | 'compareceram' | 'fecharam' | 'pagaram';

const TIPOS: { id: TipoMeta; nome: string; ehMoeda?: boolean }[] = [
  { id: 'agendados', nome: 'Agendados' },
  { id: 'compareceram', nome: 'Compareceram' },
  { id: 'fecharam', nome: 'Fecharam' },
  { id: 'pagaram', nome: 'Pagaram' },
];

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rotuloMes(yyyymm: string): string {
  const [a, m] = yyyymm.split('-').map(Number);
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[(m || 1) - 1]} ${a || ''}`;
}

function gerarMesesDisponiveis(): string[] {
  // 12 meses para tras + mes atual + 6 meses pra frente
  const hoje = new Date();
  const lista: string[] = [];
  for (let i = -12; i <= 6; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return lista;
}

export default function MetasPage() {
  const [mes, setMes] = useState(mesAtual());
  const [unidadeId, setUnidadeId] = useState(1);
  const [valores, setValores] = useState<Record<TipoMeta, string>>({
    agendados: '', compareceram: '', fecharam: '', pagaram: '',
  });
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const meses = gerarMesesDisponiveis();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setMsg(null);
    setErro(null);
    try {
      const res = await fetch(`/api/metas?unidade_id=${unidadeId}&mes=${mes}`);
      const json = await res.json();
      if (json.error) {
        setErro(json.error);
        setValores({ agendados: '', compareceram: '', fecharam: '', pagaram: '' });
      } else {
        const novo: Record<TipoMeta, string> = {
          agendados: '', compareceram: '', fecharam: '', pagaram: '',
        };
        for (const m of json.metas as Meta[]) {
          if (m.tipo in novo) {
            novo[m.tipo as TipoMeta] = String(m.valor);
          }
        }
        setValores(novo);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }, [unidadeId, mes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async () => {
    setSalvando(true);
    setMsg(null);
    setErro(null);
    try {
      const metas: Meta[] = TIPOS.map(t => ({
        unidade_id: unidadeId,
        mes,
        tipo: t.id,
        valor: parseFloat(valores[t.id] || '0') || 0,
      }));
      const res = await fetch('/api/metas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metas }),
      });
      const json = await res.json();
      if (json.error) setErro(json.error);
      else setMsg(`✓ ${json.total} meta(s) salva(s)`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSalvando(false);
    }
  };

  const unidadeAtual = UNIDADES.find(u => u.id === unidadeId);

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Metas mensais</h1>
          <p className="text-gray-400 text-sm mt-1">
            Defina metas por unidade e mês. Aparecem como barra de progresso nos KPIs do Painel.
          </p>
        </header>

        {/* Filtros */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Unidade</label>
            <select
              value={unidadeId}
              onChange={e => setUnidadeId(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            >
              {UNIDADES.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Mês</label>
            <select
              value={mes}
              onChange={e => setMes(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            >
              {meses.map(m => <option key={m} value={m}>{rotuloMes(m)}</option>)}
            </select>
          </div>
        </div>

        {erro && (
          <div className="bg-red-950/40 border border-red-700/60 text-red-200 rounded-lg p-4 mb-4 text-sm">
            {erro}
          </div>
        )}
        {msg && (
          <div className="bg-emerald-950/40 border border-emerald-700/60 text-emerald-200 rounded-lg p-3 mb-4 text-sm">
            {msg}
          </div>
        )}

        {/* Formulario de metas */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">
              Metas para {unidadeAtual?.nome} · {rotuloMes(mes)}
            </h2>
            <p className="text-xs text-gray-500">Deixe em 0 ou em branco pra não definir meta.</p>
          </div>
          {carregando ? (
            <div className="text-gray-500 text-sm py-6">Carregando...</div>
          ) : (
            <div className="space-y-3">
              {TIPOS.map(t => (
                <div key={t.id} className="flex items-center gap-3">
                  <label className="w-32 text-sm text-gray-300">{t.nome}</label>
                  <div className="flex items-center gap-2 flex-1">
                    {t.ehMoeda && <span className="text-xs text-gray-500">R$</span>}
                    <input
                      type="number"
                      step={t.ehMoeda ? '0.01' : '1'}
                      min="0"
                      value={valores[t.id]}
                      onChange={e => setValores(v => ({ ...v, [t.id]: e.target.value }))}
                      placeholder="0"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={carregar}
              disabled={carregando || salvando}
              className="text-xs text-gray-400 hover:text-gray-200 px-3 py-2"
            >
              recarregar
            </button>
            <button
              onClick={salvar}
              disabled={carregando || salvando}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded transition"
            >
              {salvando ? 'Salvando...' : 'Salvar metas'}
            </button>
          </div>
        </div>

        <div className="mt-8 text-xs text-gray-500">
          💡 Dica: defina as metas no início do mês. As barras de progresso vão aparecer nos KPIs do Painel quando o filtro estiver no mês cadastrado.
        </div>
      </div>
    </main>
  );
}
