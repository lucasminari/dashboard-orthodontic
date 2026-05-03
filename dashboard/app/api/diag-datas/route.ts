import { NextResponse } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';

export const dynamic = 'force-dynamic';

// Endpoint diagnostico: distribuicao de datas em raw_sistema por mes.
// Mostra quantos pacientes tem data_avaliacao / data_contrato / data_pgto
// em cada mes, pra ver se o parser esta lendo as datas certas.
export async function GET() {
  try {
    const data: any[] = await buscarTudo('raw_sistema', q =>
      q.select('data_avaliacao, data_contrato, data_pgto'),
    );

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

    // Pega as 10 linhas com data_avaliacao mais recente
    const ordenadas = [...(data || [])]
      .filter(r => r.data_avaliacao)
      .sort((a, b) => (b.data_avaliacao || '').localeCompare(a.data_avaliacao || ''));

    return NextResponse.json({
      total_linhas: data?.length || 0,
      avaliacao_por_mes: contar('data_avaliacao'),
      contrato_por_mes: contar('data_contrato'),
      pgto_por_mes: contar('data_pgto'),
      amostras_mais_recentes: ordenadas.slice(0, 10).map(r => ({
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
