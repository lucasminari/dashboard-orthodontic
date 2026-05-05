import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';
import {
  mapearOrigem,
  isOrigemKommo,
  ORIGENS_KOMMO_CANONICAS,
  ROTULO_SEM_ORIGEM,
} from '@/lib/origem-mapeamento';
import { expandirParaMesesInteiros } from '@/lib/periodo';

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
  // Campos legados
  fecharam: number;
  cadastrados: number;
  taxa_cadastro_para_agendamento: number | null;
  taxa_agendamento_para_comparecimento: number | null;
  taxa_comparecimento_para_fechamento: number | null;
  taxa_comparecimento_para_pagamento: number | null;
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
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');

    // Expande pra meses inteiros — CampanhasReport eh snapshot mensal e
    // Performance tambem usa o mesmo range (consistencia dos numeros).
    const periodo = expandirParaMesesInteiros(dataInicio, dataFim);

    // ── raw_campanhas: TOTAIS oficiais por (campanha+acao+origem) ─────────
    // Cada upload eh um SNAPSHOT de UM MES de referencia (data_relatorio = 1o
    // dia do mes). Filtra uploads cujo mes esteja DENTRO do periodo solicitado.
    const campanhasRows = await buscarTudo('raw_campanhas', q => {
      let qq = q.select(
        'origem, campanha, acao, total_leads, agendados, compareceram, contratos_fechados, contratos_pagos, data_relatorio, unidade_id, ingestao_id',
      );
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      if (periodo.inicio) qq = qq.gte('data_relatorio', periodo.inicio);
      if (periodo.fim) qq = qq.lte('data_relatorio', periodo.fim);
      return qq;
    });

    // Pra cada (unidade_id, mes_referencia) pega so a ingestao MAIS RECENTE
    // (caso o user tenha subido o mesmo mes 2x). Filtros multi-mes (trimestre/
    // tudo) somam os meses — cada um com seu proprio snapshot mais recente.
    const ingMaisRecPorMesUnidade = new Map<string, number>();
    for (const r of campanhasRows || []) {
      const mes = String(r.data_relatorio).slice(0, 7);
      const key = `${r.unidade_id}|${mes}`;
      const atual = ingMaisRecPorMesUnidade.get(key);
      if (atual === undefined || (r.ingestao_id as number) > atual) {
        ingMaisRecPorMesUnidade.set(key, r.ingestao_id as number);
      }
    }
    const linhasValidas = (campanhasRows || []).filter(r => {
      const mes = String(r.data_relatorio).slice(0, 7);
      const key = `${r.unidade_id}|${mes}`;
      return ingMaisRecPorMesUnidade.get(key) === r.ingestao_id;
    });

    // ── raw_performance: RECEITA por origem (Performance tem valor R$) ────
    const perfRows = await buscarTudo('raw_performance', q => {
      let qq = q.select(
        'origem, telemarketing, pagou, valor, data, unidade_id',
      );
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      if (periodo.inicio) qq = qq.gte('data', periodo.inicio);
      if (periodo.fim) qq = qq.lte('data', periodo.fim);
      return qq;
    });

    // ── Acumulador por origem normalizada ─────────────────────────────────
    interface Acc {
      agendados: number;
      compareceram: number;
      pagaram: number;
      receita: number;
    }
    const acc = new Map<string, Acc>();
    function get(origem: string): Acc {
      if (!acc.has(origem)) {
        acc.set(origem, { agendados: 0, compareceram: 0, pagaram: 0, receita: 0 });
      }
      return acc.get(origem)!;
    }
    // Garante visibilidade das origens Kommo mesmo zeradas
    for (const c of ORIGENS_KOMMO_CANONICAS) get(c);

    // Soma totais do CampanhasReport (verdade)
    for (const r of linhasValidas) {
      const origem = mapearOrigem(r.origem);
      const a = get(origem);
      a.agendados += Number(r.agendados) || 0;
      a.compareceram += Number(r.compareceram) || 0;
      a.pagaram += Number(r.contratos_pagos) || 0;
    }

    // Soma receita do Performance (com mesmo fallback origem -> telemarketing)
    for (const r of perfRows || []) {
      if (!r.pagou) continue;
      let origem = mapearOrigem(r.origem);
      if (origem === ROTULO_SEM_ORIGEM) {
        const fb = mapearOrigem(r.telemarketing);
        if (fb !== ROTULO_SEM_ORIGEM) origem = fb;
      }
      const a = get(origem);
      a.receita += Number(r.valor) || 0;
    }

    // ── Monta lista final ─────────────────────────────────────────────────
    const funis: FunilOrigem[] = [];
    for (const [origem, a] of acc.entries()) {
      funis.push({
        origem,
        fonte: isOrigemKommo(origem) ? 'kommo' : 'sistema',
        cadastrados: a.agendados, // legado
        fecharam: a.pagaram, // legado
        agendados: a.agendados,
        compareceram: a.compareceram,
        pagaram: a.pagaram,
        receita: a.receita,
        taxa_cadastro_para_agendamento: null,
        taxa_agendamento_para_comparecimento: ratio(a.compareceram, a.agendados),
        taxa_comparecimento_para_fechamento: ratio(a.pagaram, a.compareceram),
        taxa_comparecimento_para_pagamento: ratio(a.pagaram, a.compareceram),
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
      cadastrados: totalEt.agendados,
      fecharam: totalEt.pagaram,
    };

    return NextResponse.json({
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      funis,
      total,
      contagem: {
        campanhas_linhas: linhasValidas.length,
        performance_linhas: perfRows?.length || 0,
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
