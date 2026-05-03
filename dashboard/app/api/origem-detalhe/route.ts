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
    const fallback = mapearOrigem(r.telemarketing);
    if (fallback !== ROTULO_SEM_ORIGEM) origem = fallback;
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

    // ── raw_performance: fonte unica ──────────────────────────────────────
    const perfRows = await buscarTudo('raw_performance', q => {
      let qq = q.select(
        'origem, compareceu, pagou, valor, status, telefone_norm, paciente_nome, telemarketing, data, unidade_id, campanha, acao',
      );
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      return qq;
    });

    // ── Filtros utilitarios ───────────────────────────────────────────────
    const noPeriodo = (data: string | null | undefined): boolean => {
      if (!data) return false;
      const d = data.slice(0, 10);
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    };
    const semFiltro = !dataInicio && !dataFim;

    const origemBate = (r: any) => origemDaLinha(r) === origemAlvo;

    // ── KPIs (totais) ─────────────────────────────────────────────────────
    const agendados = new Set<string>();
    const compareceram = new Set<string>();
    const pagaram = new Set<string>();
    let receita = 0;

    for (const r of perfRows || []) {
      if (!origemBate(r)) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const k = chave(r);
      agendados.add(k);
      if (r.compareceu) compareceram.add(k);
      if (r.pagou) {
        if (!pagaram.has(k)) receita += Number(r.valor) || 0;
        pagaram.add(k);
      }
    }

    // ── Top telemarketers, situacoes, sub-campanhas, acoes ────────────────
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
    const acoes = new Map<string, { total: number; receita: number }>();

    for (const r of perfRows || []) {
      if (!origemBate(r)) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const valor = Number(r.valor) || 0;
      acumular(telemarketers, r.telemarketing, valor, !!r.pagou);
      acumular(situacoes, r.status, 0, false);
      acumular(subCampanhas, r.campanha, valor, !!r.pagou);
      acumular(acoes, r.acao, valor, !!r.pagou);
    }

    const top = (mapa: Map<string, { total: number; receita: number }>, n = 10): ItemRanking[] =>
      Array.from(mapa.entries())
        .map(([nome, v]) => ({ nome, total: v.total, receita: v.receita }))
        .sort((a, b) => b.total - a.total)
        .slice(0, n);

    // ── Evolucao mes a mes (6 meses) ──────────────────────────────────────
    const hoje = new Date();
    const meses: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const mapEvolucao = new Map<
      string,
      {
        agendados: Set<string>;
        compareceram: Set<string>;
        pagaram: Set<string>;
        receita: number;
      }
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
      if (!origemBate(r)) continue;
      const m = peg(r.data);
      if (!m || !mapEvolucao.has(m)) continue;
      const acc = mapEvolucao.get(m)!;
      const k = chave(r);
      acc.agendados.add(k);
      if (r.compareceu) acc.compareceram.add(k);
      if (r.pagou) {
        if (!acc.pagaram.has(k)) acc.receita += Number(r.valor) || 0;
        acc.pagaram.add(k);
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
    const totalAgendados = new Set<string>();
    const totalCompareceram = new Set<string>();
    const totalPagaram = new Set<string>();
    let receitaGeral = 0;

    for (const r of perfRows || []) {
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const k = chave(r);
      totalAgendados.add(k);
      if (r.compareceu) totalCompareceram.add(k);
      if (r.pagou) {
        if (!totalPagaram.has(k)) receitaGeral += Number(r.valor) || 0;
        totalPagaram.add(k);
      }
    }

    const ticketMedio = pagaram.size > 0 ? receita / pagaram.size : 0;
    const ticketMedioGeral = totalPagaram.size > 0 ? receitaGeral / totalPagaram.size : 0;

    return NextResponse.json({
      origem: origemAlvo,
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      kpis: {
        agendados: agendados.size,
        compareceram: compareceram.size,
        pagaram: pagaram.size,
        receita,
        ticket_medio: ticketMedio,
      },
      taxas: {
        agend_comp: ratio(compareceram.size, agendados.size),
        comp_pag: ratio(pagaram.size, compareceram.size),
      },
      media_geral: {
        ticket_medio: ticketMedioGeral,
        agend_comp: ratio(totalCompareceram.size, totalAgendados.size),
        comp_pag: ratio(totalPagaram.size, totalCompareceram.size),
      },
      evolucao,
      top: {
        // Nomes mantidos pra compat com a UI
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
