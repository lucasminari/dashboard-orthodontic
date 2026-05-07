'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getToken } from '@/lib/api-client';

interface Contadores {
  porStatus: { aberto: number; visto: number; resolvido: number; descartado: number };
  abertosPorPrioridade: { 1: number; 2: number; 3: number };
}

/**
 * Card "Atencao pendente" pra home do dashboard.
 * - Sem login: mostra link pra entrar
 * - Com login: mostra contagem por prioridade e link pra fila
 */
export function AtencaoCard() {
  const [logado, setLogado] = useState<boolean | null>(null);
  const [c, setC] = useState<Contadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    setLogado(!!t);
    if (!t) return;
    let cancel = false;
    async function load() {
      try {
        const r = await api<Contadores>('/atencao/contadores');
        if (!cancel) setC(r);
      } catch (e) {
        if (!cancel) setErro(e instanceof Error ? e.message : 'erro');
      }
    }
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, []);

  if (logado === null) return null;

  if (!logado) {
    return (
      <Link
        href="/login?next=/atencao"
        className="block bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-lg p-4 transition"
      >
        <p className="text-xs uppercase tracking-wide text-gray-400">Central de Atenção</p>
        <p className="text-sm text-gray-300 mt-1">Entrar pra ver</p>
      </Link>
    );
  }

  if (erro) {
    return (
      <div className="bg-gray-900 border border-red-900/50 rounded-lg p-4">
        <p className="text-xs uppercase tracking-wide text-gray-400">Central de Atenção</p>
        <p className="text-sm text-red-400 mt-1">{erro}</p>
      </div>
    );
  }

  if (!c) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <p className="text-xs uppercase tracking-wide text-gray-400">Central de Atenção</p>
        <p className="text-sm text-gray-500 mt-1">Carregando…</p>
      </div>
    );
  }

  const p1 = c.abertosPorPrioridade[1];
  const p2 = c.abertosPorPrioridade[2];
  const p3 = c.abertosPorPrioridade[3];
  const total = p1 + p2 + p3;

  return (
    <Link
      href="/atencao"
      className={`block bg-gray-900 border rounded-lg p-4 transition ${
        p1 > 0 ? 'border-red-700 hover:border-red-500' : 'border-gray-800 hover:border-indigo-700'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-gray-400">Atenção pendente</p>
        {p1 > 0 && <span className="text-xs text-red-400">URGENTE</span>}
      </div>
      <p className="text-2xl font-semibold mt-1">{total}</p>
      <p className="text-xs text-gray-500 mt-1">
        {p1} urgente · {p2} média · {p3} baixa
      </p>
    </Link>
  );
}
