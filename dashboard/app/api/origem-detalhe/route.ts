import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';
import { mapearOrigem, ROTULO_SEM_ORIGEM } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

interface ItemRanking {
  nome: string;
  total: number;
  receita?: number;
}

interface MesEvolucao {
  mes: string;
  rotulo: string;
  agendados: number;
  compareceram: number;
  pagaram: number;
  receita: number;
}

const MESES_BR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(yyyymm: string): string {
  const [a, m] = yyyymm.split('-').map(Number);
  return `${MESES_BR[(m || 1) - 1]}/${String(a || 0).slice(-2)}`;
}

function ratio(num: number, den: number): number | null {
  if (!den) return null;
  return num / den;
}

function chave(r: any): string {
  return r.telefone_norm
    ? `tel:${r.telefone_norm}`
    : `nome:${(r.paciente_nome || '').toLowerCase().trim()}`;
}

function origemDaLinha(r: any): string {
  let origem = mapearOrigem(r.origem);
  if (origem === ROTULO_SEM_ORIGEM) {
    const fb = mapearOrigem(r.telemarketing);
    if (fb !== ROTULO_SEM_ORIGEM) origem = fb;
  }
  return origem;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const origemAlvo = searchParams.get('origem');
    if (!origemAlvo) {
      return NextResponse.json({ error: 'origem é obrigatório' }, { status: 400 });
    }

    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');

    // ── raw_campanhas: TOTAIS oficiais por origem (snapshot mais recente) ──
    const campanhasRows = await buscarTudo('raw_campanhas', q => {
      let qq = q.select(
        'origem, campanha, acao, agendados, compareceram, contratos_pagos, data_relatorio, unidade_id, ingestao_id',
      );
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      if (dataInicio) qq = qq.gte('data_relatorio', dataInicio);
      if (dataFim) qq = qq.lte('data_relatorio', dataFim);
      return qq;
    });

    // Pra cada (unidade, mes_referencia) pega o snapshot mais recente
    const ingMaisRecPorMesUnidade = new Map<string, number>();
    for (const r of campanhasRows || []) {
      const mes = String(r.data_relatorio).slice(0, 7);
      const key = `${r.unidade_id}|${mes}`;
      const atual = ingMaisRecPorMesUnidade.get(key);
      if (atual === undefined || (r.ingestao_id as number) > atual) {
        ingMaisRecPorMesUnidade.set(key, r.ingestao_id as number);
      }
    }
    const campanhasValidas = (campanhasRows || []).filter(r => {
      const mes = String(r.data_relatorio).slice(0, 7);
      return ingMaisRecPorMesUnidade.get(`${r.unidade_id}|${mes}`) === r.ingestao_id;
    });

    // ── raw_performance: detalhe + receita ────────────────────────────────
    const perfRows = await buscarTudo('raw_performance', q => {
      let qq = q.select(
        'origem, telemarketing, status, compareceu, pagou, valor, telefone_norm, paciente_nome, data, unidade_id, campanha, acao',
      );
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      return qq;
    });

    const noPeriodo = (data: string | null | undefined): boolean => {
      if (!data) return false;
      const d = data.slice(0, 10);
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    };
    const semFiltro = !dataInicio && !dataFim;

    // ── KPIs: totais vem do CampanhasReport, receita do Performance ──────
    let agendados = 0;
    let compareceram = 0;
    let pagaram = 0;
    for (const r of campanhasValidas) {
      const o = mapearOrigem(r.origem);
      if (o !== origemAlvo) continue;
      agendados += Number(r.agendados) || 0;
      compareceram += Number(r.compareceram) || 0;
      pagaram += Number(r.contratos_pagos) || 0;
    }

    let receita = 0;
    const pagosKeys = new Set<string>();
    for (const r of perfRows || []) {
      if (origemDaLinha(r) !== origemAlvo) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      if (!r.pagou) continue;
      const k = chave(r);
      if (!pagosKeys.has(k)) {
        receita += Number(r.valor) || 0;
        pagosKeys.add(k);
      }
    }

    // ── Top telemarketers, situacoes, sub-campanhas (do Performance) ──────
    const acumular = (
      mapa: Map<string, { total: number; receita: number }>,
      chaveAgg: string | null | undefined,
      valor: number,
      contaReceita: boolean,
    ) => {
      const k = String(chaveAgg || '').trim();
      if (!k) return;
      if (!mapa.has(k)) mapa.set(k, { total: 0, receita: 0 });
      const cur = mapa.get(k)!;
      cur.total += 1;
      if (contaReceita) cur.receita += valor;
    };

    const telemarketers = new Map<string, { total: number; receita: number }>();
    const situacoes = new Map<string, { total: number; receita: number }>();
    const subCampanhas = new Map<string, { total: number; receita: number }>();

    for (const r of perfRows || []) {
      if (origemDaLinha(r) !== origemAlvo) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const valor = Number(r.valor) || 0;
      acumular(telemarketers, r.telemarketing, valor, !!r.pagou);
      acumular(situacoes, r.status, 0, false);
      acumular(subCampanhas, r.campanha, valor, !!r.pagou);
    }

    const top = (mapa: Map<string, { total: number; receita: number }>, n = 10): ItemRanking[] =>
      Array.from(mapa.entries())
        .map(([nome, v]) => ({ nome, total: v.total, receita: v.receita }))
        .sort((a, b) => b.total - a.total)
        .slice(0, n);

    // ── Evolucao mes a mes (6 meses) — vem do Performance (tem data) ─────
    const hoje = new Date();
    const meses: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const mapEvolucao = new Map<
      string,
      { agendados: Set<string>; compareceram: Set<string>; pagaram: Set<string>; receita: number }
    >();
    for (const m of meses) {
      mapEvolucao.set(m, {
        agendados: new Set(),
        compareceram: new Set(),
        pagaram: new Set(),
        receita: 0,
      });
    }
    const peg = (m: string | null | undefined) => (m ? m.slice(0, 7) : null);

    for (const r of perfRows || []) {
      if (origemDaLinha(r) !== origemAlvo) continue;
      const m = peg(r.data);
      if (!m || !mapEvolucao.has(m)) continue;
      const e = mapEvolucao.get(m)!;
      const k = chave(r);
      e.agendados.add(k);
      if (r.compareceu) e.compareceram.add(k);
      if (r.pagou) {
        if (!e.pagaram.has(k)) e.receita += Number(r.valor) || 0;
        e.pagaram.add(k);
      }
    }

    const evolucao: MesEvolucao[] = meses.map(m => {
      const a = mapEvolucao.get(m)!;
      return {
        mes: m,
        rotulo: rotuloMes(m),
        agendados: a.agendados.size,
        compareceram: a.compareceram.size,
        pagaram: a.pagaram.size,
        receita: a.receita,
      };
    });

    // ── Comparacao com media geral ────────────────────────────────────────
    let totalAgendados = 0;
    let totalCompareceram = 0;
    let totalPagaram = 0;
    for (const r of campanhasValidas) {
      totalAgendados += Number(r.agendados) || 0;
      totalCompareceram += Number(r.compareceram) || 0;
      totalPagaram += Number(r.contratos_pagos) || 0;
    }
    let receitaGeral = 0;
    const pagosGlobalKeys = new Set<string>();
    for (const r of perfRows || []) {
      if (!r.pagou) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const k = chave(r);
      if (!pagosGlobalKeys.has(k)) {
        receitaGeral += Number(r.valor) || 0;
        pagosGlobalKeys.add(k);
      }
    }

    const ticketMedio = pagaram > 0 ? receita / pagaram : 0;
    const ticketMedioGeral = totalPagaram > 0 ? receitaGeral / totalPagaram : 0;

    return NextResponse.json({
      origem: origemAlvo,
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      kpis: {
        agendados,
        compareceram,
        pagaram,
        receita,
        ticket_medio: ticketMedio,
      },
      taxas: {
        agend_comp: ratio(compareceram, agendados),
        comp_pag: ratio(pagaram, compareceram),
      },
      media_geral: {
        ticket_medio: ticketMedioGeral,
        agend_comp: ratio(totalCompareceram, totalAgendados),
        comp_pag: ratio(totalPagaram, totalCompareceram),
      },
      evolucao,
      top: {
        dentistas: [],
        atendentes: top(telemarketers),
        telemarketers: top(telemarketers),
        situacoes: top(situacoes),
        sub_campanhas: top(subCampanhas),
      },
    });
  } catch (e) {
    console.error('Erro em /api/origem-detalhe:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
