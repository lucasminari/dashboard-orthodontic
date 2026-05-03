import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unidade = searchParams.get('unidade') ? Number(searchParams.get('unidade')) : null;
    const desde = searchParams.get('desde');
    const ate = searchParams.get('ate');

    // Pega snapshot mais recente de raw_campanhas (totais oficiais)
    let qCamp = supabase
      .from('raw_campanhas')
      .select('agendados, compareceram, contratos_pagos, ingestao_id, unidade_id, data_relatorio');
    if (unidade) qCamp = qCamp.eq('unidade_id', unidade);
    if (desde) qCamp = qCamp.gte('data_relatorio', desde);
    if (ate) qCamp = qCamp.lte('data_relatorio', ate);
    const { data: camp, error: errC } = await qCamp;
    if (errC) throw new Error(errC.message);

    // Pega so a ingestao mais recente por unidade (snapshot acumulado)
    const ingMaisRec = new Map<number, number>();
    for (const r of camp || []) {
      const uid = r.unidade_id as number;
      const atual = ingMaisRec.get(uid);
      if (atual === undefined || (r.ingestao_id as number) > atual) {
        ingMaisRec.set(uid, r.ingestao_id as number);
      }
    }
    const validas = (camp || []).filter(
      r => ingMaisRec.get(r.unidade_id as number) === r.ingestao_id,
    );
    let agendados = 0, compareceram = 0, pagaram = 0;
    for (const r of validas) {
      agendados += Number(r.agendados) || 0;
      compareceram += Number(r.compareceram) || 0;
      pagaram += Number(r.contratos_pagos) || 0;
    }

    // Receita vem do Performance (filtrado por data)
    let qPerf = supabase.from('raw_performance').select('valor').eq('pagou', true);
    if (unidade) qPerf = qPerf.eq('unidade_id', unidade);
    if (desde) qPerf = qPerf.gte('data', desde);
    if (ate) qPerf = qPerf.lte('data', ate);
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
