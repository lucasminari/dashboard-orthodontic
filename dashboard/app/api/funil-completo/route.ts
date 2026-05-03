import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';
import {
  mapearOrigem,
  isOrigemKommo,
  ORIGENS_KOMMO_CANONICAS,
  ROTULO_SEM_ORIGEM,
} from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

interface EtapasFunil {
  agendados: number;
  compareceram: number;
  fecharam: number;
  pagaram: number;
  receita: number;
}

interface FunilOrigem extends EtapasFunil {
  origem: string;
  fonte: 'kommo' | 'sistema';
  // Mantemos 'cadastrados' por compatibilidade da resposta, sempre = agendados
  // (pra clientes legados nao quebrarem). Pode ser removido depois.
  cadastrados: number;
  taxa_cadastro_para_agendamento: number | null;
  taxa_agendamento_para_comparecimento: number | null;
  taxa_comparecimento_para_fechamento: number | null;
  taxa_fechamento_para_pagamento: number | null;
}

interface AcumuladorOrigem {
  agendados: Set<string>;
  compareceram: Set<string>;
  fecharam: Set<string>;
  pagaram: Set<string>;
  receita: number;
}

function novoAcumulador(): AcumuladorOrigem {
  return {
    agendados: new Set(),
    compareceram: new Set(),
    fecharam: new Set(),
    pagaram: new Set(),
    receita: 0,
  };
}

function chavePacienteSistema(r: any): string {
  return r.paciente_id_externo
    ? `id:${r.paciente_id_externo}`
    : r.telefone_norm
      ? `tel:${r.telefone_norm}`
      : `nome:${(r.paciente_nome || '').toLowerCase().trim()}`;
}

function chavePacientePerf(r: any): string {
  return r.telefone_norm
    ? `tel:${r.telefone_norm}`
    : `nome:${(r.paciente_nome || '').toLowerCase().trim()}`;
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
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');

    // ── raw_sistema (Orthodontic) ─────────────────────────────────────────
    const sistemaRows = await buscarTudo('raw_sistema', q => {
      let qq = q.select(
        'origem, data_avaliacao, data_contrato, data_pgto, situacao, telefone_norm, paciente_id_externo, paciente_nome, vlr_contrato, unidade_id',
      );
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      return qq;
    });

    // Helpers de filtro de periodo
    const noPeriodo = (data: string | null | undefined): boolean => {
      if (!data) return false;
      const d = data.slice(0, 10);
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    };
    const semFiltro = !dataInicio && !dataFim;

    // ── raw_performance (Telemarketing) ───────────────────────────────────
    const perfRows = await buscarTudo('raw_performance', q => {
      let qq = q.select(
        'origem, compareceu, status, telefone_norm, paciente_nome, data, unidade_id',
      );
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      if (dataInicio) qq = qq.gte('data', dataInicio);
      if (dataFim) qq = qq.lte('data', dataFim);
      return qq;
    });

    // ── Acumulador por origem normalizada ─────────────────────────────────
    const acc: Map<string, AcumuladorOrigem> = new Map();
    function get(origem: string): AcumuladorOrigem {
      if (!acc.has(origem)) acc.set(origem, novoAcumulador());
      return acc.get(origem)!;
    }
    // Garante visibilidade das 5 origens Kommo mesmo sem dados
    for (const c of ORIGENS_KOMMO_CANONICAS) get(c);

    // ── Agendados / Fecharam / Pagaram (raw_sistema, filtro por etapa) ────
    for (const r of sistemaRows || []) {
      const origem = mapearOrigem(r.origem);
      const a = get(origem);
      const k = chavePacienteSistema(r);
      if (r.data_avaliacao && (semFiltro || noPeriodo(r.data_avaliacao))) {
        a.agendados.add(k);
      }
      if (r.data_contrato && (semFiltro || noPeriodo(r.data_contrato))) {
        a.fecharam.add(k);
      }
      if (r.data_pgto && (semFiltro || noPeriodo(r.data_pgto))) {
        if (!a.pagaram.has(k)) {
          a.receita += Number(r.vlr_contrato) || 0;
        }
        a.pagaram.add(k);
      }
    }

    // Pacientes do raw_performance tambem entram em agendados (foram
    // atendidos pelo telemarketing → agendaram em algum momento)
    for (const r of perfRows || []) {
      const origem = mapearOrigem(r.origem);
      const a = get(origem);
      const k = chavePacientePerf(r);
      if (semFiltro || noPeriodo(r.data)) {
        a.agendados.add(k);
      }
    }

    // ── Compareceram (raw_performance, com fallback no raw_sistema) ───────
    for (const r of perfRows || []) {
      if (!r.compareceu) continue;
      if (!semFiltro && !noPeriodo(r.data)) continue;
      const origem = mapearOrigem(r.origem);
      get(origem).compareceram.add(chavePacientePerf(r));
    }
    // Fallback: se origem tem agendados mas zero compareceram, infere do
    // raw_sistema (paciente avaliado e nao faltou).
    for (const [origem, a] of acc.entries()) {
      if (a.compareceram.size > 0 || a.agendados.size === 0) continue;
      for (const r of sistemaRows || []) {
        const o = mapearOrigem(r.origem);
        if (o !== origem) continue;
        if (!r.data_avaliacao) continue;
        if (!semFiltro && !noPeriodo(r.data_avaliacao)) continue;
        const sit = String(r.situacao || '').toLowerCase();
        if (sit.includes('faltou') || sit.includes('cancel')) continue;
        a.compareceram.add(chavePacienteSistema(r));
      }
    }

    // ── Monta lista final ─────────────────────────────────────────────────
    const funis: FunilOrigem[] = [];
    for (const [origem, a] of acc.entries()) {
      const agendados = a.agendados.size;
      const compareceram = a.compareceram.size;
      const fecharam = a.fecharam.size;
      const pagaram = a.pagaram.size;
      funis.push({
        origem,
        fonte: isOrigemKommo(origem) ? 'kommo' : 'sistema',
        cadastrados: agendados, // legado: igual a agendados
        agendados,
        compareceram,
        fecharam,
        pagaram,
        receita: a.receita,
        taxa_cadastro_para_agendamento: null, // legado, nao usado mais
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
      return b.agendados - a.agendados;
    });

    const totalEt: EtapasFunil = funis.reduce(
      (acc, f) => ({
        agendados: acc.agendados + f.agendados,
        compareceram: acc.compareceram + f.compareceram,
        fecharam: acc.fecharam + f.fecharam,
        pagaram: acc.pagaram + f.pagaram,
        receita: acc.receita + f.receita,
      }),
      { agendados: 0, compareceram: 0, fecharam: 0, pagaram: 0, receita: 0 },
    );
    const total = { ...totalEt, cadastrados: totalEt.agendados }; // legado

    return NextResponse.json({
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      funis,
      total,
      contagem: {
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
