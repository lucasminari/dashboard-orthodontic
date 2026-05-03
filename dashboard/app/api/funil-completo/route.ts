import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  mapearOrigem,
  isOrigemKommo,
  ORIGENS_KOMMO_CANONICAS,
  ROTULO_SEM_ORIGEM,
} from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

interface EtapasFunil {
  cadastrados: number;
  agendados: number;
  compareceram: number;
  fecharam: number;
  pagaram: number;
}

interface FunilOrigem extends EtapasFunil {
  origem: string;
  fonte: 'kommo' | 'sistema';
  taxa_cadastro_para_agendamento: number | null;
  taxa_agendamento_para_comparecimento: number | null;
  taxa_comparecimento_para_fechamento: number | null;
  taxa_fechamento_para_pagamento: number | null;
}

function ratio(num: number, den: number): number | null {
  if (!den) return null;
  return num / den;
}

// Acumulador interno: Sets de chaves de paciente unico para cada etapa.
interface AcumuladorOrigem {
  cadastrados: Set<string>;
  agendados: Set<string>;
  compareceram: Set<string>;
  fecharam: Set<string>;
  pagaram: Set<string>;
}

function novoAcumulador(): AcumuladorOrigem {
  return {
    cadastrados: new Set(),
    agendados: new Set(),
    compareceram: new Set(),
    fecharam: new Set(),
    pagaram: new Set(),
  };
}

function chavePacienteSistema(r: any): string {
  // Prefere id_externo (mais confiavel), fallback para telefone normalizado.
  return r.paciente_id_externo
    ? `id:${r.paciente_id_externo}`
    : r.telefone_norm
      ? `tel:${r.telefone_norm}`
      : `nome:${(r.paciente_nome || '').toLowerCase().trim()}`;
}

function chavePacienteKommo(r: any): string {
  return r.telefone_norm
    ? `tel:${r.telefone_norm}`
    : `lead:${(r.nome || '').toLowerCase().trim()}::${r.data_cadastro || ''}`;
}

function chavePacientePerf(r: any): string {
  return r.telefone_norm
    ? `tel:${r.telefone_norm}`
    : `nome:${(r.paciente_nome || '').toLowerCase().trim()}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');

    // ── 1. raw_leads (Kommo) ───────────────────────────────────────────────
    let qLeads = supabase
      .from('raw_leads')
      .select('origem, data_cadastro, telefone_norm, nome, unidade_id');
    if (unidadeId) qLeads = qLeads.eq('unidade_id', unidadeId);
    if (dataInicio) qLeads = qLeads.gte('data_cadastro', dataInicio);
    if (dataFim) qLeads = qLeads.lte('data_cadastro', dataFim);
    const { data: leadsRows, error: errLeads } = await qLeads;
    if (errLeads) throw new Error(`raw_leads: ${errLeads.message}`);

    // ── 2. raw_sistema (Orthodontic) ───────────────────────────────────────
    let qSis = supabase
      .from('raw_sistema')
      .select(
        'origem, data_avaliacao, data_contrato, data_pgto, situacao, telefone_norm, paciente_id_externo, paciente_nome, unidade_id',
      );
    if (unidadeId) qSis = qSis.eq('unidade_id', unidadeId);
    // Para o sistema, usamos data_avaliacao como referencia temporal principal,
    // mas tambem aceitamos linhas com qualquer data dentro do periodo.
    if (dataInicio) qSis = qSis.gte('data_avaliacao', dataInicio);
    if (dataFim) qSis = qSis.lte('data_avaliacao', dataFim);
    const { data: sistemaRows, error: errSis } = await qSis;
    if (errSis) throw new Error(`raw_sistema: ${errSis.message}`);

    // ── 3. raw_performance (Telemarketing) ─────────────────────────────────
    let qPerf = supabase
      .from('raw_performance')
      .select(
        'origem, compareceu, status, telefone_norm, paciente_nome, data, unidade_id',
      );
    if (unidadeId) qPerf = qPerf.eq('unidade_id', unidadeId);
    if (dataInicio) qPerf = qPerf.gte('data', dataInicio);
    if (dataFim) qPerf = qPerf.lte('data', dataFim);
    const { data: perfRows, error: errPerf } = await qPerf;
    if (errPerf) throw new Error(`raw_performance: ${errPerf.message}`);

    // ── 4. Acumular por origem normalizada (Sets para deduplicar) ──────────
    const acc: Map<string, AcumuladorOrigem> = new Map();
    function get(origem: string): AcumuladorOrigem {
      if (!acc.has(origem)) acc.set(origem, novoAcumulador());
      return acc.get(origem)!;
    }
    // Garante visibilidade das 5 origens Kommo mesmo sem dados
    for (const c of ORIGENS_KOMMO_CANONICAS) get(c);

    // ── 5. Cadastrados ────────────────────────────────────────────────────
    // Para origens Kommo: 1 cadastrado por linha de raw_leads (deduplicado
    // por telefone para nao contar lead duplicado).
    for (const r of leadsRows || []) {
      const origem = mapearOrigem(r.origem);
      get(origem).cadastrados.add(chavePacienteKommo(r));
    }

    // Para origens Sistema (nao-Kommo): 1 cadastrado por paciente unico no
    // raw_sistema (porque o lead nasce direto la).
    for (const r of sistemaRows || []) {
      const origem = mapearOrigem(r.origem);
      if (isOrigemKommo(origem)) continue;
      get(origem).cadastrados.add(chavePacienteSistema(r));
    }

    // ── 6. Agendados / Fecharam / Pagaram (sempre raw_sistema) ─────────────
    for (const r of sistemaRows || []) {
      const origem = mapearOrigem(r.origem);
      const a = get(origem);
      const k = chavePacienteSistema(r);
      if (r.data_avaliacao) a.agendados.add(k);
      if (r.data_contrato) a.fecharam.add(k);
      if (r.data_pgto) a.pagaram.add(k);
    }

    // ── 7. Compareceram ───────────────────────────────────────────────────
    // Preferencia: raw_performance (mais granular). Conta paciente unico que
    // teve compareceu=true em qualquer linha.
    for (const r of perfRows || []) {
      if (!r.compareceu) continue;
      const origem = mapearOrigem(r.origem);
      get(origem).compareceram.add(chavePacientePerf(r));
    }

    // Fallback: se a origem tem agendados mas zero compareceram do raw_perf,
    // tentamos inferir a partir do raw_sistema (data_avaliacao preenchida e
    // situacao nao indica falta/cancelamento).
    for (const [origem, a] of acc.entries()) {
      if (a.compareceram.size > 0 || a.agendados.size === 0) continue;
      for (const r of sistemaRows || []) {
        const o = mapearOrigem(r.origem);
        if (o !== origem) continue;
        if (!r.data_avaliacao) continue;
        const sit = String(r.situacao || '').toLowerCase();
        if (sit.includes('faltou') || sit.includes('cancel')) continue;
        a.compareceram.add(chavePacienteSistema(r));
      }
    }

    // ── 8. Monta lista final ──────────────────────────────────────────────
    const funis: FunilOrigem[] = [];
    for (const [origem, a] of acc.entries()) {
      const cadastrados = a.cadastrados.size;
      const agendados = a.agendados.size;
      const compareceram = a.compareceram.size;
      const fecharam = a.fecharam.size;
      const pagaram = a.pagaram.size;
      funis.push({
        origem,
        fonte: isOrigemKommo(origem) ? 'kommo' : 'sistema',
        cadastrados,
        agendados,
        compareceram,
        fecharam,
        pagaram,
        taxa_cadastro_para_agendamento: ratio(agendados, cadastrados),
        taxa_agendamento_para_comparecimento: ratio(compareceram, agendados),
        taxa_comparecimento_para_fechamento: ratio(fecharam, compareceram),
        taxa_fechamento_para_pagamento: ratio(pagaram, fecharam),
      });
    }

    funis.sort((a, b) => {
      if (a.fonte !== b.fonte) return a.fonte === 'kommo' ? -1 : 1;
      if (a.fonte === 'kommo') {
        const orderA = ORIGENS_KOMMO_CANONICAS.indexOf(a.origem as any);
        const orderB = ORIGENS_KOMMO_CANONICAS.indexOf(b.origem as any);
        return orderA - orderB;
      }
      if (a.origem === ROTULO_SEM_ORIGEM) return 1;
      if (b.origem === ROTULO_SEM_ORIGEM) return -1;
      return b.cadastrados - a.cadastrados;
    });

    const total: EtapasFunil = funis.reduce(
      (acc, f) => ({
        cadastrados: acc.cadastrados + f.cadastrados,
        agendados: acc.agendados + f.agendados,
        compareceram: acc.compareceram + f.compareceram,
        fecharam: acc.fecharam + f.fecharam,
        pagaram: acc.pagaram + f.pagaram,
      }),
      { cadastrados: 0, agendados: 0, compareceram: 0, fecharam: 0, pagaram: 0 },
    );

    return NextResponse.json({
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      funis,
      total,
      contagem: {
        leads: leadsRows?.length || 0,
        sistema: sistemaRows?.length || 0,
        performance: perfRows?.length || 0,
      },
    });
  } catch (e) {
    console.error('Erro em /api/funil-completo:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
