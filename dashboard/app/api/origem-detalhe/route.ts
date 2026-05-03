import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapearOrigem, isOrigemKommo } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

interface ItemRanking {
  nome: string;
  total: number;
  receita?: number;
}

interface MesEvolucao {
  mes: string; // YYYY-MM
  rotulo: string; // 'jan/26'
  cadastrados: number;
  agendados: number;
  compareceram: number;
  fecharam: number;
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

function chaveSistema(r: any): string {
  return r.paciente_id_externo
    ? `id:${r.paciente_id_externo}`
    : r.telefone_norm
      ? `tel:${r.telefone_norm}`
      : `nome:${(r.paciente_nome || '').toLowerCase().trim()}`;
}

function chaveKommo(r: any): string {
  return r.telefone_norm
    ? `tel:${r.telefone_norm}`
    : `lead:${(r.nome || '').toLowerCase().trim()}::${r.data_cadastro || ''}`;
}

function chavePerf(r: any): string {
  return r.telefone_norm
    ? `tel:${r.telefone_norm}`
    : `nome:${(r.paciente_nome || '').toLowerCase().trim()}`;
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

    // ── Buscar dados ──────────────────────────────────────────────────────
    let qLeads = supabase
      .from('raw_leads')
      .select('origem, data_cadastro, telefone_norm, nome, responsavel, unidade_id');
    if (unidadeId) qLeads = qLeads.eq('unidade_id', unidadeId);
    const { data: leadsRows, error: errLeads } = await qLeads;
    if (errLeads) throw new Error(`raw_leads: ${errLeads.message}`);

    let qSis = supabase
      .from('raw_sistema')
      .select(
        'origem, campanha, data_avaliacao, data_contrato, data_pgto, situacao, telefone_norm, paciente_id_externo, paciente_nome, vlr_contrato, dentista, func_contrato, promotor, indicacao, unidade_id',
      );
    if (unidadeId) qSis = qSis.eq('unidade_id', unidadeId);
    const { data: sistemaRows, error: errSis } = await qSis;
    if (errSis) throw new Error(`raw_sistema: ${errSis.message}`);

    let qPerf = supabase
      .from('raw_performance')
      .select(
        'origem, compareceu, faltou, status, telefone_norm, paciente_nome, telemarketing, data, unidade_id',
      );
    if (unidadeId) qPerf = qPerf.eq('unidade_id', unidadeId);
    const { data: perfRows, error: errPerf } = await qPerf;
    if (errPerf) throw new Error(`raw_performance: ${errPerf.message}`);

    // ── Filtros utilitarios ───────────────────────────────────────────────
    const noPeriodo = (data: string | null | undefined): boolean => {
      if (!data) return false;
      const d = data.slice(0, 10);
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    };
    const semFiltro = !dataInicio && !dataFim;

    const origemBate = (raw: string | null | undefined) => mapearOrigem(raw) === origemAlvo;

    // ── KPIs (totais) ─────────────────────────────────────────────────────
    const cadastrados = new Set<string>();
    const agendados = new Set<string>();
    const compareceram = new Set<string>();
    const fecharam = new Set<string>();
    const pagaram = new Set<string>();
    let receita = 0;

    if (isOrigemKommo(origemAlvo)) {
      // Cadastrados vem da Kommo
      for (const r of leadsRows || []) {
        if (!origemBate(r.origem)) continue;
        if (!semFiltro && !noPeriodo(r.data_cadastro)) continue;
        cadastrados.add(chaveKommo(r));
      }
    } else {
      // Cadastrados vem do sistema (paciente unico)
      for (const r of sistemaRows || []) {
        if (!origemBate(r.origem)) continue;
        if (!semFiltro && !noPeriodo(r.data_avaliacao)) continue;
        cadastrados.add(chaveSistema(r));
      }
    }

    for (const r of sistemaRows || []) {
      if (!origemBate(r.origem)) continue;
      const k = chaveSistema(r);
      if (r.data_avaliacao && (semFiltro || noPeriodo(r.data_avaliacao))) {
        agendados.add(k);
      }
      if (r.data_contrato && (semFiltro || noPeriodo(r.data_contrato))) {
        fecharam.add(k);
      }
      if (r.data_pgto && (semFiltro || noPeriodo(r.data_pgto))) {
        if (!pagaram.has(k)) {
          receita += Number(r.vlr_contrato) || 0;
        }
        pagaram.add(k);
      }
    }

    for (const r of perfRows || []) {
      if (!origemBate(r.origem)) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const k = chavePerf(r);
      agendados.add(k);
      if (r.compareceu) compareceram.add(k);
    }

    // Fallback compareceram se vazio
    if (compareceram.size === 0 && agendados.size > 0) {
      for (const r of sistemaRows || []) {
        if (!origemBate(r.origem)) continue;
        if (!r.data_avaliacao) continue;
        if (!semFiltro && !noPeriodo(r.data_avaliacao)) continue;
        const sit = String(r.situacao || '').toLowerCase();
        if (sit.includes('faltou') || sit.includes('cancel')) continue;
        compareceram.add(chaveSistema(r));
      }
    }

    // ── Top dentistas / atendentes / promotores / situacoes ───────────────
    const acumular = (mapa: Map<string, { total: number; receita: number }>, chave: string | null | undefined, valor: number, eh_pagto: boolean) => {
      const k = String(chave || '').trim();
      if (!k) return;
      if (!mapa.has(k)) mapa.set(k, { total: 0, receita: 0 });
      const cur = mapa.get(k)!;
      cur.total += 1;
      if (eh_pagto) cur.receita += valor;
    };

    const dentistas = new Map<string, { total: number; receita: number }>();
    const atendentes = new Map<string, { total: number; receita: number }>();
    const situacoes = new Map<string, { total: number; receita: number }>();
    const subCampanhas = new Map<string, { total: number; receita: number }>();

    for (const r of sistemaRows || []) {
      if (!origemBate(r.origem)) continue;
      // Para fechamentos: filtrar por data_contrato no periodo
      if (r.data_contrato && (semFiltro || noPeriodo(r.data_contrato))) {
        const ehPagto = !!r.data_pgto && (semFiltro || noPeriodo(r.data_pgto));
        const valor = Number(r.vlr_contrato) || 0;
        acumular(dentistas, r.dentista, valor, ehPagto);
        acumular(atendentes, r.func_contrato, valor, ehPagto);
        acumular(subCampanhas, r.campanha, valor, ehPagto);
      }
      // Situacoes: olhar todas as linhas no periodo de avaliacao
      if (r.data_avaliacao && (semFiltro || noPeriodo(r.data_avaliacao))) {
        acumular(situacoes, r.situacao, 0, false);
      }
    }

    // Top telemarketers do raw_performance
    const telemarketers = new Map<string, { total: number; receita: number }>();
    for (const r of perfRows || []) {
      if (!origemBate(r.origem)) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      acumular(telemarketers, r.telemarketing, 0, false);
    }

    const top = (mapa: Map<string, { total: number; receita: number }>, n = 10): ItemRanking[] =>
      Array.from(mapa.entries())
        .map(([nome, v]) => ({ nome, total: v.total, receita: v.receita }))
        .sort((a, b) => b.total - a.total)
        .slice(0, n);

    // ── Evolucao mes a mes (6 meses, sempre) ──────────────────────────────
    // Pra evolucao, ignoramos o filtro de periodo do request — mostramos
    // sempre os ultimos 6 meses corridos.
    const hoje = new Date();
    const meses: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      meses.push(`${yyyy}-${mm}`);
    }
    const mapEvolucao = new Map<string, {
      cadastrados: Set<string>;
      agendados: Set<string>;
      compareceram: Set<string>;
      fecharam: Set<string>;
      pagaram: Set<string>;
      receita: number;
    }>();
    for (const m of meses) {
      mapEvolucao.set(m, {
        cadastrados: new Set(),
        agendados: new Set(),
        compareceram: new Set(),
        fecharam: new Set(),
        pagaram: new Set(),
        receita: 0,
      });
    }
    const peg = (m: string | null | undefined) => (m ? m.slice(0, 7) : null);

    if (isOrigemKommo(origemAlvo)) {
      for (const r of leadsRows || []) {
        if (!origemBate(r.origem)) continue;
        const m = peg(r.data_cadastro);
        if (!m || !mapEvolucao.has(m)) continue;
        mapEvolucao.get(m)!.cadastrados.add(chaveKommo(r));
      }
    } else {
      for (const r of sistemaRows || []) {
        if (!origemBate(r.origem)) continue;
        const m = peg(r.data_avaliacao);
        if (!m || !mapEvolucao.has(m)) continue;
        mapEvolucao.get(m)!.cadastrados.add(chaveSistema(r));
      }
    }

    for (const r of sistemaRows || []) {
      if (!origemBate(r.origem)) continue;
      const k = chaveSistema(r);
      const ma = peg(r.data_avaliacao);
      if (ma && mapEvolucao.has(ma)) mapEvolucao.get(ma)!.agendados.add(k);
      const mc = peg(r.data_contrato);
      if (mc && mapEvolucao.has(mc)) mapEvolucao.get(mc)!.fecharam.add(k);
      const mp = peg(r.data_pgto);
      if (mp && mapEvolucao.has(mp)) {
        const acc = mapEvolucao.get(mp)!;
        if (!acc.pagaram.has(k)) acc.receita += Number(r.vlr_contrato) || 0;
        acc.pagaram.add(k);
      }
    }
    for (const r of perfRows || []) {
      if (!origemBate(r.origem)) continue;
      const m = peg(r.data);
      if (!m || !mapEvolucao.has(m)) continue;
      const k = chavePerf(r);
      mapEvolucao.get(m)!.agendados.add(k);
      if (r.compareceu) mapEvolucao.get(m)!.compareceram.add(k);
    }

    const evolucao: MesEvolucao[] = meses.map(m => {
      const a = mapEvolucao.get(m)!;
      return {
        mes: m,
        rotulo: rotuloMes(m),
        cadastrados: a.cadastrados.size,
        agendados: a.agendados.size,
        compareceram: a.compareceram.size,
        fecharam: a.fecharam.size,
        pagaram: a.pagaram.size,
        receita: a.receita,
      };
    });

    // ── Comparacao com media geral (do mesmo periodo, todas origens) ──────
    // Calcula taxa media geral pra comparar com a origem.
    const totalCadastrados = new Set<string>();
    const totalAgendados = new Set<string>();
    const totalCompareceram = new Set<string>();
    const totalFecharam = new Set<string>();
    const totalPagaram = new Set<string>();
    let receitaGeral = 0;

    for (const r of sistemaRows || []) {
      const k = chaveSistema(r);
      if (r.data_avaliacao && (semFiltro || noPeriodo(r.data_avaliacao))) {
        totalCadastrados.add(k);
        totalAgendados.add(k);
      }
      if (r.data_contrato && (semFiltro || noPeriodo(r.data_contrato))) {
        totalFecharam.add(k);
      }
      if (r.data_pgto && (semFiltro || noPeriodo(r.data_pgto))) {
        if (!totalPagaram.has(k)) receitaGeral += Number(r.vlr_contrato) || 0;
        totalPagaram.add(k);
      }
    }
    for (const r of perfRows || []) {
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const k = chavePerf(r);
      totalAgendados.add(k);
      if (r.compareceu) totalCompareceram.add(k);
    }

    // Ticket medio = receita / pagaram
    const ticketMedio = pagaram.size > 0 ? receita / pagaram.size : 0;
    const ticketMedioGeral = totalPagaram.size > 0 ? receitaGeral / totalPagaram.size : 0;

    return NextResponse.json({
      origem: origemAlvo,
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      kpis: {
        cadastrados: cadastrados.size,
        agendados: agendados.size,
        compareceram: compareceram.size,
        fecharam: fecharam.size,
        pagaram: pagaram.size,
        receita,
        ticket_medio: ticketMedio,
      },
      taxas: {
        cad_agend: ratio(agendados.size, cadastrados.size),
        agend_comp: ratio(compareceram.size, agendados.size),
        comp_fech: ratio(fecharam.size, compareceram.size),
        fech_pag: ratio(pagaram.size, fecharam.size),
      },
      media_geral: {
        ticket_medio: ticketMedioGeral,
        cad_agend: ratio(totalAgendados.size, totalCadastrados.size),
        agend_comp: ratio(totalCompareceram.size, totalAgendados.size),
        comp_fech: ratio(totalFecharam.size, totalCompareceram.size),
        fech_pag: ratio(totalPagaram.size, totalFecharam.size),
      },
      evolucao,
      top: {
        dentistas: top(dentistas),
        atendentes: top(atendentes),
        telemarketers: top(telemarketers),
        situacoes: top(situacoes),
        sub_campanhas: top(subCampanhas),
      },
    });
  } catch (e) {
    console.error('Erro em /api/origem-detalhe:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 }
    );
  }
}
