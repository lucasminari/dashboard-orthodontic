import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unidade = searchParams.get('unidade') ? Number(searchParams.get('unidade')) : null;
    const desde = searchParams.get('desde'); // 'YYYY-MM-DD' ou null
    const ate   = searchParams.get('ate');   // 'YYYY-MM-DD' ou null

    const filtroBase = (q: any, colunaData: string) => {
      let qq = q;
      if (unidade) qq = qq.eq('unidade_id', unidade);
      if (desde)   qq = qq.gte(colunaData, desde);
      if (ate)     qq = qq.lte(colunaData, ate);
      return qq;
    };

    const r1 = await filtroBase(
      supabase.from('raw_leads').select('*', { count: 'exact', head: true }),
      'data_cadastro'
    );
    if (r1.error) throw new Error(`raw_leads: ${r1.error.message}`);

    const r2 = await filtroBase(
      supabase.from('raw_performance').select('*', { count: 'exact', head: true }),
      'data'
    );
    if (r2.error) throw new Error(`raw_performance: ${r2.error.message}`);

    const r2b = await filtroBase(
      supabase.from('raw_performance').select('*', { count: 'exact', head: true }).eq('compareceu', true),
      'data'
    );
    if (r2b.error) throw new Error(`compareceu: ${r2b.error.message}`);

    const r3 = await filtroBase(
      supabase.from('raw_sistema').select('*', { count: 'exact', head: true }),
      'data_contrato'
    );
    if (r3.error) throw new Error(`raw_sistema: ${r3.error.message}`);

    const r4 = await filtroBase(
      supabase.from('raw_sistema').select('*', { count: 'exact', head: true }).not('data_pgto', 'is', null),
      'data_contrato'
    );
    if (r4.error) throw new Error(`pagos: ${r4.error.message}`);

    const r5 = await filtroBase(
      supabase.from('raw_sistema').select('vlr_contrato').not('data_pgto', 'is', null),
      'data_contrato'
    );
    if (r5.error) throw new Error(`receita: ${r5.error.message}`);

    const receita = r5.data?.reduce(
      (sum: number, r: any) => sum + (Number(r.vlr_contrato) || 0), 0
    ) || 0;

    const hoje = new Date().toISOString().slice(0, 10);

    // Pipeline futuro NÃO filtra por período — sempre mostra todo pendente
    let qPipeline: any = supabase.from('raw_sistema').select('vlr_contrato')
      .is('data_pgto', null)
      .gte('data_vcto', hoje);
    if (unidade) qPipeline = qPipeline.eq('unidade_id', unidade);
    const r6 = await qPipeline;
    if (r6.error) throw new Error(`pipeline: ${r6.error.message}`);

    const pipelineFuturo = r6.data?.reduce(
      (sum: number, r: any) => sum + (Number(r.vlr_contrato) || 0), 0
    ) || 0;

    return NextResponse.json({
      funil: {
        leads:        r1.count ?? 0,
        agendados:    r2.count ?? 0,
        compareceram: r2b.count ?? 0,
        fecharam:     r3.count ?? 0,
        pagaram:      r4.count ?? 0,
      },
      financeiro: {
        receita_realizada: receita,
        pipeline_futuro: pipelineFuturo,
      },
    });
  } catch (e: any) {
    console.error('ERRO API /api/kpis:', e.message);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}