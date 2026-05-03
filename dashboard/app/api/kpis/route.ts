import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unidade = searchParams.get('unidade') ? Number(searchParams.get('unidade')) : null;
    const desde = searchParams.get('desde'); // 'YYYY-MM-DD' ou null
    const ate = searchParams.get('ate');     // 'YYYY-MM-DD' ou null

    const filtroBase = (q: any) => {
      let qq = q;
      if (unidade) qq = qq.eq('unidade_id', unidade);
      if (desde) qq = qq.gte('data', desde);
      if (ate) qq = qq.lte('data', ate);
      return qq;
    };

    // Tudo do raw_performance: agendados/compareceram/pagaram/receita
    const rAg = await filtroBase(
      supabase.from('raw_performance').select('*', { count: 'exact', head: true }),
    );
    if (rAg.error) throw new Error(`agendados: ${rAg.error.message}`);

    const rComp = await filtroBase(
      supabase.from('raw_performance').select('*', { count: 'exact', head: true }).eq('compareceu', true),
    );
    if (rComp.error) throw new Error(`compareceram: ${rComp.error.message}`);

    const rPag = await filtroBase(
      supabase.from('raw_performance').select('*', { count: 'exact', head: true }).eq('pagou', true),
    );
    if (rPag.error) throw new Error(`pagaram: ${rPag.error.message}`);

    const rReceita = await filtroBase(
      supabase.from('raw_performance').select('valor').eq('pagou', true),
    );
    if (rReceita.error) throw new Error(`receita: ${rReceita.error.message}`);

    const receita = rReceita.data?.reduce(
      (sum: number, r: any) => sum + (Number(r.valor) || 0),
      0,
    ) || 0;

    return NextResponse.json({
      funil: {
        leads: 0, // legado — nao usamos mais
        agendados: rAg.count ?? 0,
        compareceram: rComp.count ?? 0,
        fecharam: rPag.count ?? 0, // legado — fecharam == pagaram
        pagaram: rPag.count ?? 0,
      },
      financeiro: {
        receita_realizada: receita,
        pipeline_futuro: 0, // sem fonte; Performance nao tem data_vcto
      },
    });
  } catch (e: any) {
    console.error('ERRO API /api/kpis:', e.message);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
