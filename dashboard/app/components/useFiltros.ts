'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, createElement } from 'react';

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
  { id: 'personalizado', nome: 'Personalizado…' },
];

// Versao do schema do filtro persistido. Bumpar quando mudar o default
// pra invalidar localStorage de usuarios antigos.
const VERSAO_FILTRO = 3;
const KEY_UNIDADE = `filtro-unidade-id-v${VERSAO_FILTRO}`;
const KEY_PERIODO = `filtro-periodo-id-v${VERSAO_FILTRO}`;
const KEY_DESDE = `filtro-desde-v${VERSAO_FILTRO}`;
const KEY_ATE = `filtro-ate-v${VERSAO_FILTRO}`;

function fmtData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function intervaloPeriodo(id: PeriodoId): { desde?: string; ate?: string } {
  const hoje = new Date();
  const fmt = fmtData;
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
    const m = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const u = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { desde: fmt(m), ate: fmt(u) };
  }
  if (id === 'trimestre') {
    const trimMes = Math.floor(hoje.getMonth() / 3) * 3;
    const d = new Date(hoje.getFullYear(), trimMes, 1);
    return { desde: fmt(d), ate: fmt(hoje) };
  }
  return {};
}

export function intervaloAnterior(id: PeriodoId): { desde?: string; ate?: string } {
  const hoje = new Date();
  const fmt = fmtData;

  if (id === 'tudo' || id === 'personalizado') return {};

  if (id === 'mes') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, hoje.getDate());
    return { desde: fmt(ini), ate: fmt(fim) };
  }
  if (id === '30d') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 0);
    return { desde: fmt(ini), ate: fmt(fim) };
  }
  if (id === 'trimestre') {
    const trimMes = Math.floor(hoje.getMonth() / 3) * 3;
    const ini = new Date(hoje.getFullYear(), trimMes - 3, 1);
    const fim = new Date(hoje.getFullYear(), trimMes, 0);
    return { desde: fmt(ini), ate: fmt(fim) };
  }

  const atual = intervaloPeriodo(id);
  if (!atual.desde || !atual.ate) return {};
  const ini = new Date(atual.desde + 'T00:00:00');
  const fim = new Date(atual.ate + 'T00:00:00');
  const dias = Math.round((fim.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24));
  const novoFim = new Date(ini);
  novoFim.setDate(novoFim.getDate() - 1);
  const novoIni = new Date(novoFim);
  novoIni.setDate(novoIni.getDate() - dias);
  return { desde: fmt(novoIni), ate: fmt(novoFim) };
}

interface FiltrosContextValue {
  unidadeId: number;
  periodoId: PeriodoId;
  setUnidadeId: (id: number) => void;
  setPeriodoId: (id: PeriodoId) => void;
  // Datas customizadas — usadas quando periodoId === 'personalizado'
  customDesde: string;
  customAte: string;
  setCustomDesde: (d: string) => void;
  setCustomAte: (d: string) => void;
  intervalo: { desde?: string; ate?: string };
  intervaloAnt: { desde?: string; ate?: string };
  pronto: boolean;
}

const FiltrosContext = createContext<FiltrosContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  periodoDefault?: PeriodoId;
}

export function FiltrosProvider({ children, periodoDefault = 'mes' }: ProviderProps) {
  const [unidadeId, setUnidadeIdState] = useState(1);
  const [periodoId, setPeriodoIdState] = useState<PeriodoId>(periodoDefault);
  const [customDesde, setCustomDesdeState] = useState('');
  const [customAte, setCustomAteState] = useState('');
  const [pronto, setPronto] = useState(false);

  // Hidrata do localStorage no primeiro render
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const u = window.localStorage.getItem(KEY_UNIDADE);
      const p = window.localStorage.getItem(KEY_PERIODO);
      const d = window.localStorage.getItem(KEY_DESDE);
      const a = window.localStorage.getItem(KEY_ATE);
      if (u) {
        const id = parseInt(u, 10);
        if (UNIDADES.some(x => x.id === id)) setUnidadeIdState(id);
      }
      if (p && PERIODOS.some(x => x.id === p)) {
        setPeriodoIdState(p as PeriodoId);
      }
      if (d) setCustomDesdeState(d);
      if (a) setCustomAteState(a);
    } catch {
      // ignore
    }
    setPronto(true);
  }, []);

  const setUnidadeId = useCallback((id: number) => {
    setUnidadeIdState(id);
    try { window.localStorage.setItem(KEY_UNIDADE, String(id)); } catch {}
  }, []);

  const setPeriodoId = useCallback((id: PeriodoId) => {
    setPeriodoIdState(id);
    try { window.localStorage.setItem(KEY_PERIODO, id); } catch {}
  }, []);

  const setCustomDesde = useCallback((d: string) => {
    setCustomDesdeState(d);
    try { window.localStorage.setItem(KEY_DESDE, d); } catch {}
  }, []);

  const setCustomAte = useCallback((d: string) => {
    setCustomAteState(d);
    try { window.localStorage.setItem(KEY_ATE, d); } catch {}
  }, []);

  // Calcula intervalo: se 'personalizado', usa custom*; senao usa funcao
  const intervalo: { desde?: string; ate?: string } =
    periodoId === 'personalizado'
      ? { desde: customDesde || undefined, ate: customAte || undefined }
      : intervaloPeriodo(periodoId);

  // Para 'personalizado', tambem calculamos um intervalo anterior baseado
  // na duracao escolhida.
  let intervaloAnt: { desde?: string; ate?: string };
  if (periodoId === 'personalizado' && customDesde && customAte) {
    const ini = new Date(customDesde + 'T00:00:00');
    const fim = new Date(customAte + 'T00:00:00');
    const dias = Math.round((fim.getTime() - ini.getTime()) / (1000 * 60 * 60 * 24));
    const novoFim = new Date(ini);
    novoFim.setDate(novoFim.getDate() - 1);
    const novoIni = new Date(novoFim);
    novoIni.setDate(novoIni.getDate() - dias);
    intervaloAnt = { desde: fmtData(novoIni), ate: fmtData(novoFim) };
  } else {
    intervaloAnt = intervaloAnterior(periodoId);
  }

  const value: FiltrosContextValue = {
    unidadeId,
    periodoId,
    setUnidadeId,
    setPeriodoId,
    customDesde,
    customAte,
    setCustomDesde,
    setCustomAte,
    intervalo,
    intervaloAnt,
    pronto,
  };

  return createElement(FiltrosContext.Provider, { value }, children);
}

/**
 * Hook que consome os filtros compartilhados via Context.
 * Mudancas em qualquer ponto (Navbar ou tela) propagam pra todos.
 *
 * O parametro periodoDefault eh aceito por compatibilidade com codigo
 * antigo, mas sera ignorado — o default real eh definido no Provider
 * (em layout.tsx).
 */
export function useFiltros(_periodoDefault?: PeriodoId): FiltrosContextValue {
  const ctx = useContext(FiltrosContext);
  if (!ctx) {
    throw new Error('useFiltros precisa estar dentro de <FiltrosProvider>');
  }
  return ctx;
}
