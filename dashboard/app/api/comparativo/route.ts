import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const UNIDADES = [
  { id: 1, nome: 'Centro' },
  { id: 2, nome: 'Várzea Paulista' },
  { id: 3, nome: 'Hortolândia' },
];

export async function GET() {
  try {
    const resultado = await Promise.all(
      UNIDADES.map(async (u) => {
        const r1 = await supabase.from('raw_leads')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', u.id);
        const r2 = await supabase.from('raw_performance')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', u.id);
        const r2b = await supabase.from('raw_performance')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', u.id)
          .eq('compareceu', true);
        const r3 = await supabase.from('raw_sistema')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', u.id);
        const r4 = await supabase.from('raw_sistema')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', u.id)
          .not('data_pgto', 'is', null);
        const r5 = await supabase.from('raw_sistema')
          .select('vlr_contrato')
          .eq('unidade_id', u.id)
          .not('data_pgto', 'is', null);

        const receita = (r5.data || []).reduce(
          (s, r: any) => s + (Number(r.vlr_contrato) || 0), 0
        );

        // Leads do Kommo (mais completo no topo do funil)
        const rk = await supabase.from('kommo_leads')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', u.id);

        return {
          unidade_id: u.id,
          nome: u.nome,
          leads_kommo: rk.count ?? 0,
          leads_ortho: r1.count ?? 0,
          agendados: r2.count ?? 0,
          compareceram: r2b.count ?? 0,
          fecharam: r3.count ?? 0,
          pagaram: r4.count ?? 0,
          receita,
          taxa_comparecimento: (r2.count ?? 0) > 0
            ? ((r2b.count ?? 0) / (r2.count ?? 1)) * 100 : 0,
          taxa_fechamento: (r2b.count ?? 0) > 0
            ? ((r3.count ?? 0) / (r2b.count ?? 1)) * 100 : 0,
          taxa_pagamento: (r3.count ?? 0) > 0
            ? ((r4.count ?? 0) / (r3.count ?? 1)) * 100 : 0,
        };
      })
    );

    return NextResponse.json({ unidades: resultado });
  } catch (e: any) {
    console.error('ERRO API /api/comparativo:', e.message);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}