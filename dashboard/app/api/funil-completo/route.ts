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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;
    const dataInicio = searchParams.get('data_inicio'); // YYYY-MM-DD
    const dataFim = searchParams.get('data_fim');

    // ── 1. Carrega raw_leads (Kommo) ────────────────────────────────────────
    let qLeads = supabase
      .from('raw_leads')
      .select('origem, data_cadastro, telefone_norm, unidade_id');
    if (unidadeId) qLeads = qLeads.eq('unidade_id', unidadeId);
    if (dataInicio) qLeads = qLeads.gte('data_cadastro', dataInicio);
    if (dataFim) qLeads = qLeads.lte('data_cadastro', dataFim);
    const { data: leadsRows, error: errLeads } = await qLeads;
    if (errLeads) throw new Error(`raw_leads: ${errLeads.message}`);

    // ── 2. Carrega raw_sistema (Orthodontic) ───────────────────────────────
    let qSis = supabase
      .from('raw_sistema')
      .select(
        'origem, data_avaliacao, data_contrato, data_pgto, situacao, telefone_norm, paciente_id_externo, unidade_id',
      );
    if (unidadeId) qSis = qSis.eq('unidade_id', unidadeId);
    if (dataInicio) qSis = qSis.gte('data_avaliacao', dataInicio);
    if (dataFim) qSis = qSis.lte('data_avaliacao', dataFim);
    const { data: sistemaRows, error: errSis } = await qSis;
    if (errSis) throw new Error(`raw_sistema: ${errSis.message}`);

    // ── 3. Carrega raw_performance (Telemarketing) ─────────────────────────
    let qPerf = supabase
      .from('raw_performance')
      .select('origem, compareceu, status, telefone_norm, data, unidade_id');
    if (unidadeId) qPerf = qPerf.eq('unidade_id', unidadeId);
    if (dataInicio) qPerf = qPerf.gte('data', dataInicio);
    if (dataFim) qPerf = qPerf.lte('data', dataFim);
    const { data: perfRows, error: errPerf } = await qPerf;
    if (errPerf) throw new Error(`raw_performance: ${errPerf.message}`);

    // ── 4. Inicializa mapas ───────────────────────────────────────────────
    const funilPorOrigem: Map<string, EtapasFunil> = new Map();

    function getOrInit(origem: string): EtapasFunil {
      if (!funilPorOrigem.has(origem)) {
        funilPorOrigem.set(origem, {
          cadastrados: 0,
          agendados: 0,
          compareceram: 0,
          fecharam: 0,
          pagaram: 0,
        });
      }
      return funilPorOrigem.get(origem)!;
    }

    // Garante que as 5 canonicas Kommo apareçam mesmo se nao tiverem dados
    for (const c of ORIGENS_KOMMO_CANONICAS) {
      getOrInit(c);
    }

    // ── 5. Cadastrados ────────────────────────────────────────────────────
    // Origens Kommo: contar a partir de raw_leads.
    for (const r of leadsRows || []) {
      const origem = mapearOrigem(r.origem);
      // Se a origem do lead Kommo nao bate com nenhuma das 5 canonicas, ainda
      // contamos mas marca como origem propria (pode ser que a equipe tenha
      // cadastrado origem extra no Kommo).
      const e = getOrInit(origem);
      e.cadastrados += 1;
    }

    // Origens Sistema (nao-Kommo): cada paciente eh um cadastrado.
    // Usamos paciente_id_externo + telefone para deduplicar.
    const pacientesContados = new Set<string>();
    for (const r of sistemaRows || []) {
      const origem = mapearOrigem(r.origem);
      // So contamos como "cadastrado" se NAO for origem Kommo (pra Kommo,
      // o cadastro vem de raw_leads acima).
      if (isOrigemKommo(origem)) continue;
      const key = `${r.paciente_id_externo || r.telefone_norm || ''}::${origem}`;
      if (pacientesContados.has(key)) continue;
      pacientesContados.add(key);
      const e = getOrInit(origem);
      e.cadastrados += 1;
    }

    // ── 6. Agendados, Fecharam, Pagaram (sempre raw_sistema) ──────────────
    const sistemaPorPaciente: Set<string> = new Set();
    for (const r of sistemaRows || []) {
      const origem = mapearOrigem(r.origem);
      const e = getOrInit(origem);
      const key = `${r.paciente_id_externo || r.telefone_norm || Math.random()}`;
      // Agendados = ter avaliacao agendada (data_avaliacao preenchida).
      // Para origens Sistema, pode ser igual a "cadastrados".
      if (r.data_avaliacao && !sistemaPorPaciente.has(`AG:${origem}:${key}`)) {
        sistemaPorPaciente.add(`AG:${origem}:${key}`);
        e.agendados += 1;
      }
      if (r.data_contrato) e.fecharam += 1;
      if (r.data_pgto) e.pagaram += 1;
    }

    // ── 7. Compareceram (raw_performance é mais confiavel) ────────────────
    const compareceuPorOrigem: Map<string, number> = new Map();
    for (const r of perfRows || []) {
      const origem = mapearOrigem(r.origem);
      if (r.compareceu) {
        compareceuPorOrigem.set(origem, (compareceuPorOrigem.get(origem) || 0) + 1);
      }
    }

    // Aplica comparecimentos no funil
    for (const [origem, n] of compareceuPorOrigem.entries()) {
      const e = getOrInit(origem);
      e.compareceram = n;
    }

    // Fallback: se uma origem tem agendados mas zero comparecimentos do raw_performance,
    // estima compareceram a partir do raw_sistema (situacao != Faltou e tem data_avaliacao).
    for (const [origem, etapas] of funilPorOrigem.entries()) {
      if (etapas.compareceram === 0 && etapas.agendados > 0) {
        const sistemaCompareceram = (sistemaRows || []).filter(r => {
          const o = mapearOrigem(r.origem);
          if (o !== origem) return false;
          if (!r.data_avaliacao) return false;
          const sit = String(r.situacao || '').toLowerCase();
          if (sit.includes('faltou') || sit.includes('cancel')) return false;
          return true;
        }).length;
        etapas.compareceram = sistemaCompareceram;
      }
    }

    // ── 8. Monta lista final ──────────────────────────────────────────────
    const funis: FunilOrigem[] = [];
    for (const [origem, etapas] of funilPorOrigem.entries()) {
      funis.push({
        origem,
        fonte: isOrigemKommo(origem) ? 'kommo' : 'sistema',
        ...etapas,
        taxa_cadastro_para_agendamento: ratio(etapas.agendados, etapas.cadastrados),
        taxa_agendamento_para_comparecimento: ratio(etapas.compareceram, etapas.agendados),
        taxa_comparecimento_para_fechamento: ratio(etapas.fecharam, etapas.compareceram),
        taxa_fechamento_para_pagamento: ratio(etapas.pagaram, etapas.fecharam),
      });
    }

    // Ordena: Kommo primeiro (fixo na ordem da lista), depois sistema por
    // cadastrados desc.
    funis.sort((a, b) => {
      if (a.fonte !== b.fonte) return a.fonte === 'kommo' ? -1 : 1;
      if (a.fonte === 'kommo') {
        const orderA = ORIGENS_KOMMO_CANONICAS.indexOf(a.origem as any);
        const orderB = ORIGENS_KOMMO_CANONICAS.indexOf(b.origem as any);
        return orderA - orderB;
      }
      // sistema: "Sem origem" por ultimo, resto por cadastrados desc
      if (a.origem === ROTULO_SEM_ORIGEM) return 1;
      if (b.origem === ROTULO_SEM_ORIGEM) return -1;
      return b.cadastrados - a.cadastrados;
    });

    // Total geral
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
