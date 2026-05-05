import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { expandirParaMesesInteiros } from '@/lib/periodo';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unidade = searchParams.get('unidade') ? Number(searchParams.get('unidade')) : null;
    const desde = searchParams.get('desde');
    const ate = searchParams.get('ate');

    // Expande pra meses inteiros (consistencia com snapshot mensal)
    const periodo = expandirParaMesesInteiros(desde, ate);

    // Pega snapshot mais recente de raw_campanhas (totais oficiais)
    let qCamp = supabase
      .from('raw_campanhas')
      .select('agendados, compareceram, contratos_pagos, ingestao_id, unidade_id, data_relatorio');
    if (unidade) qCamp = qCamp.eq('unidade_id', unidade);
    if (periodo.inicio) qCamp = qCamp.gte('data_relatorio', periodo.inicio);
    if (periodo.fim) qCamp = qCamp.lte('data_relatorio', periodo.fim);
    const { data: camp, error: errC } = await qCamp;
    if (errC) throw new Error(errC.message);

    // Pra cada (unidade, mes_referencia) pega o snapshot mais recente
    const ingMaisRec = new Map<string, number>();
    for (const r of camp || []) {
      const mes = String(r.data_relatorio).slice(0, 7);
      const key = `${r.unidade_id}|${mes}`;
      const atual = ingMaisRec.get(key);
      if (atual === undefined || (r.ingestao_id as number) > atual) {
        ingMaisRec.set(key, r.ingestao_id as number);
      }
    }
    const validas = (camp || []).filter(r => {
      const mes = String(r.data_relatorio).slice(0, 7);
      return ingMaisRec.get(`${r.unidade_id}|${mes}`) === r.ingestao_id;
    });
    let agendados = 0, compareceram = 0, pagaram = 0;
    for (const r of validas) {
      agendados += Number(r.agendados) || 0;
      compareceram += Number(r.compareceram) || 0;
      pagaram += Number(r.contratos_pagos) || 0;
    }

    // Receita vem do Performance (mesmo periodo expandido pra consistencia)
    let qPerf = supabase.from('raw_performance').select('valor').eq('pagou', true);
    if (unidade) qPerf = qPerf.eq('unidade_id', unidade);
    if (periodo.inicio) qPerf = qPerf.gte('data', periodo.inicio);
    if (periodo.fim) qPerf = qPerf.lte('data', periodo.fim);
    const { data: perf, error: errP } = await qPerf;
    if (errP) throw new Error(errP.message);

    const receita = (perf || []).reduce(
      (s: number, r: any) => s + (Number(r.valor) || 0),
      0,
    );

    return NextResponse.json({
      funil: {
        leads: 0,
        agendados,
        compareceram,
        fecharam: pagaram, // legado
        pagaram,
      },
      financeiro: {
        receita_realizada: receita,
        pipeline_futuro: 0,
      },
    });
  } catch (e: any) {
    console.error('ERRO API /api/kpis:', e.message);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
