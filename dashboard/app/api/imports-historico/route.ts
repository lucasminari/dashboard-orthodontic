import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const UNIDADES: Record<number, string> = {
  1: 'Centro',
  2: 'Várzea Paulista',
  3: 'Hortolândia',
};

// Retorna as ultimas N ingestoes (importacoes), ordenadas da mais recente
// pra mais antiga, com unidade, tipo, data do relatorio, qtd de linhas e
// quando foi concluida.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;

    let q = supabase
      .from('ingestoes')
      .select('id, unidade_id, tipo, data_relatorio, qtd_linhas, concluido_em, criado_em, arquivo')
      .order('concluido_em', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const itens = (data || []).map(r => ({
      id: r.id,
      unidade_id: r.unidade_id,
      unidade: UNIDADES[r.unidade_id as number] || `#${r.unidade_id}`,
      tipo: r.tipo,
      data_relatorio: r.data_relatorio,
      qtd_linhas: r.qtd_linhas ?? 0,
      concluido_em: r.concluido_em,
      criado_em: r.criado_em,
      arquivo: r.arquivo,
      status: r.concluido_em ? 'concluido' : 'pendente',
    }));

    return NextResponse.json({ itens });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
