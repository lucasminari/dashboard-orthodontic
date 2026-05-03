'use client';

import { useEffect, useState, useCallback } from 'react';

export type PeriodoId =
  | 'tudo'
  | 'hoje'
  | 'ontem'
  | '7d'
  | 'semana'
  | '30dias'
  | 'mes'
  | '30d'
  | 'trimestre'
  | 'personalizado';

export const UNIDADES = [
  { id: 1, nome: 'Centro' },
  { id: 2, nome: 'Várzea Paulista' },
  { id: 3, nome: 'Hortolândia' },
];

export const PERIODOS: { id: PeriodoId; nome: string }[] = [
  { id: 'hoje', nome: 'Hoje' },
  { id: 'ontem', nome: 'Ontem' },
  { id: '7d', nome: 'Últimos 7 dias' },
  { id: 'semana', nome: 'Esta semana' },
  { id: 'mes', nome: 'Este mês' },
  { id: '30d', nome: 'Mês anterior' },
  { id: '30dias', nome: 'Últimos 30 dias' },
  { id: 'trimestre', nome: 'Este trimestre' },
  { id: 'tudo', nome: 'Tudo' },
];

const KEY_UNIDADE = 'filtro-unidade-id';
const KEY_PERIODO = 'filtro-periodo-id';

export function intervaloPeriodo(id: PeriodoId): { desde?: string; ate?: string } {
  const hoje = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (id === 'hoje') return { desde: fmt(hoje), ate: fmt(hoje) };
  if (id === 'ontem') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 1);
    return { desde: fmt(d), ate: fmt(d) };
  }
  if (id === '7d') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 7);
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  if (id === 'semana') {
    // Segunda-feira da semana atual
    const d = new Date(hoje);
    const dia = d.getDay() || 7;
    d.setDate(d.getDate() - (dia - 1));
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  if (id === '30dias') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 30);
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  if (id === 'mes') {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  if (id === '30d') {
    // Mes anterior fechado
    const m = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const u = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { desde: fmt(m), ate: fmt(u) };
  }
  if (id === 'trimestre') {
    // Inicio do trimestre atual: jan/abr/jul/out
    const trimMes = Math.floor(hoje.getMonth() / 3) * 3;
    const d = new Date(hoje.getFullYear(), trimMes, 1);
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  return {};
}

interface UseFiltrosReturn {
  unidadeId: number;
  periodoId: PeriodoId;
  setUnidadeId: (id: number) => void;
  setPeriodoId: (id: PeriodoId) => void;
  intervalo: { desde?: string; ate?: string };
  pronto: boolean; // aguarda hidratar do localStorage antes de fazer fetch
}

export function useFiltros(periodoDefault: PeriodoId = 'mes'): UseFiltrosReturn {
  const [unidadeId, setUnidadeIdState] = useState(1);
  const [periodoId, setPeriodoIdState] = useState<PeriodoId>(periodoDefault);
  const [pronto, setPronto] = useState(false);

  // Hidrata do localStorage no primeiro render
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const u = window.localStorage.getItem(KEY_UNIDADE);
      const p = window.localStorage.getItem(KEY_PERIODO);
      if (u) {
        const id = parseInt(u, 10);
        if (UNIDADES.some(x => x.id === id)) setUnidadeIdState(id);
      }
      if (p && PERIODOS.some(x => x.id === p)) {
        setPeriodoIdState(p as PeriodoId);
      }
    } catch {
      // ignore
    }
    setPronto(true);
  }, []);

  const setUnidadeId = useCallback((id: number) => {
    setUnidadeIdState(id);
    try {
      window.localStorage.setItem(KEY_UNIDADE, String(id));
    } catch {
      // ignore
    }
  }, []);

  const setPeriodoId = useCallback((id: PeriodoId) => {
    setPeriodoIdState(id);
    try {
      window.localStorage.setItem(KEY_PERIODO, id);
    } catch {
      // ignore
    }
  }, []);

  const intervalo = intervaloPeriodo(periodoId);

  return { unidadeId, periodoId, setUnidadeId, setPeriodoId, intervalo, pronto };
}
