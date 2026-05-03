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
  pagaram: number;
  receita: number;
}

interface FunilOrigem extends EtapasFunil {
  origem: string;
  fonte: 'kommo' | 'sistema';
  // Campos legados (mantidos pra compat) — fecharam == pagaram, cadastrados == agendados
  fecharam: number;
  cadastrados: number;
  taxa_cadastro_para_agendamento: number | null;
  taxa_agendamento_para_comparecimento: number | null;
  taxa_comparecimento_para_fechamento: number | null;
  taxa_comparecimento_para_pagamento: number | null;
  taxa_fechamento_para_pagamento: number | null;
}

interface AcumuladorOrigem {
  agendados: Set<string>;
  compareceram: Set<string>;
  pagaram: Set<string>;
  receita: number;
}

function novoAcumulador(): AcumuladorOrigem {
  return {
    agendados: new Set(),
    compareceram: new Set(),
    pagaram: new Set(),
    receita: 0,
  };
}

function chavePaciente(r: any): string {
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

    // ── raw_performance: fonte unica da verdade ──────────────────────────
    // Performance traz: data, status, compareceu, pagou, valor, origem,
    // telemarketing. Tudo que precisamos pro funil + receita.
    const perfRows = await buscarTudo('raw_performance', q => {
      let qq = q.select(
        'origem, compareceu, pagou, valor, telefone_norm, paciente_nome, data, unidade_id, telemarketing',
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

    // Cada linha do Performance = 1 atendimento de telemarketing.
    // Deduplica por telefone (mesmo paciente pode ter varios atendimentos).
    for (const r of perfRows || []) {
      // Origem: prefere o campo origem; se vier vazio/desconhecido, tenta o
      // telemarketing (UPDONTIC etc. aparece como telemarketer).
      let origem = mapearOrigem(r.origem);
      if (origem === ROTULO_SEM_ORIGEM) {
        const fallback = mapearOrigem(r.telemarketing);
        if (fallback !== ROTULO_SEM_ORIGEM) origem = fallback;
      }
      const a = get(origem);
      const k = chavePaciente(r);

      // Toda linha conta como agendamento (paciente foi pra agenda)
      a.agendados.add(k);

      if (r.compareceu) a.compareceram.add(k);

      if (r.pagou) {
        if (!a.pagaram.has(k)) {
          a.receita += Number(r.valor) || 0;
        }
        a.pagaram.add(k);
      }
    }

    // ── Monta lista final ─────────────────────────────────────────────────
    const funis: FunilOrigem[] = [];
    for (const [origem, a] of acc.entries()) {
      const agendados = a.agendados.size;
      const compareceram = a.compareceram.size;
      const pagaram = a.pagaram.size;
      funis.push({
        origem,
        fonte: isOrigemKommo(origem) ? 'kommo' : 'sistema',
        cadastrados: agendados, // legado
        fecharam: pagaram, // legado
        agendados,
        compareceram,
        pagaram,
        receita: a.receita,
        taxa_cadastro_para_agendamento: null,
        taxa_agendamento_para_comparecimento: ratio(compareceram, agendados),
        taxa_comparecimento_para_fechamento: ratio(pagaram, compareceram),
        taxa_comparecimento_para_pagamento: ratio(pagaram, compareceram),
        taxa_fechamento_para_pagamento: null,
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
        pagaram: acc.pagaram + f.pagaram,
        receita: acc.receita + f.receita,
      }),
      { agendados: 0, compareceram: 0, pagaram: 0, receita: 0 },
    );
    const total = {
      ...totalEt,
      cadastrados: totalEt.agendados, // legado
      fecharam: totalEt.pagaram, // legado
    };

    return NextResponse.json({
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      funis,
      total,
      contagem: {
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
