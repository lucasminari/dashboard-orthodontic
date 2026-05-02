import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeId = searchParams.get('unidade') ? Number(searchParams.get('unidade')) : 0;
    const desde = searchParams.get('desde');
    const ate = searchParams.get('ate');

    let query = supabase
      .from('kommo_leads')
      .select('origem, id', { count: 'exact' });

    if (unidadeId) {
      query = query.eq('unidade_id', unidadeId);
    }
    if (desde) {
      query = query.gte('data_criacao', desde);
    }
    if (ate) {
      query = query.lte('data_criacao', ate);
    }

    const leadsRes = await query;
    if (leadsRes.error) throw leadsRes.error;

    const leadsOrigens = (leadsRes.data || []).reduce((acc: any, lead: any) => {
      const origem = lead.origem || 'Sem origem';
      if (!acc[origem]) acc[origem] = { leads: 0, ids: [] };
      acc[origem].leads++;
      acc[origem].ids.push(lead.id);
      return acc;
    }, {});

    // Pegar receita e conversões por origem
    const resultado = await Promise.all(
      Object.entries(leadsOrigens).map(async ([origem, dados]: [string, any]) => {
        // Contar fechados (cruzar com raw_sistema que tem leads_kommo_id)
        const fechadosRes = await supabase
          .from('raw_sistema')
          .select('vlr_contrato', { count: 'exact', head: false })
          .in('leads_kommo_id', dados.ids)
          .not('data_pgto', 'is', null);

        const receitaTotal = (fechadosRes.data || []).reduce(
          (s: number, r: any) => s + (Number(r.vlr_contrato) || 0), 0
        );

        return {
          origem,
          leads: dados.leads,
          fecharam: fechadosRes.count ?? 0,
          receita: receitaTotal,
          taxa_conversao: dados.leads > 0
            ? Math.round(((fechadosRes.count ?? 0) / dados.leads) * 100)
            : 0,
        };
      })
    );

    // Ordenar por receita decrescente
    resultado.sort((a, b) => b.receita - a.receita);

    return NextResponse.json({ origens: resultado });
  } catch (e: any) {
    console.error('ERRO API /api/roi-origem:', e.message);
    return NextResponse.json({ origens: [] });
  }
}
