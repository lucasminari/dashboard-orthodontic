import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Endpoint diagnostico: distribuicao de datas em raw_sistema por mes.
// Mostra quantos pacientes tem data_avaliacao / data_contrato / data_pgto
// em cada mes, pra ver se o parser esta lendo as datas certas.
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('raw_sistema')
      .select('data_avaliacao, data_contrato, data_pgto');
    if (error) throw new Error(error.message);

    const contar = (campo: 'data_avaliacao' | 'data_contrato' | 'data_pgto') => {
      const mapa: Record<string, number> = {};
      for (const r of data || []) {
        const v = r[campo];
        if (!v) continue;
        const mes = String(v).slice(0, 7); // YYYY-MM
        mapa[mes] = (mapa[mes] || 0) + 1;
      }
      return Object.entries(mapa)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, total]) => ({ mes, total }));
    };

    return NextResponse.json({
      total_linhas: data?.length || 0,
      avaliacao_por_mes: contar('data_avaliacao'),
      contrato_por_mes: contar('data_contrato'),
      pgto_por_mes: contar('data_pgto'),
      // Amostra de datas brutas
      amostra: (data || []).slice(0, 5).map(r => ({
        avaliacao: r.data_avaliacao,
        contrato: r.data_contrato,
        pgto: r.data_pgto,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
