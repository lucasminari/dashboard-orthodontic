import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const TABELAS_RAW: Record<string, string> = {
  leads: 'raw_leads',
  sistema: 'raw_sistema',
  performance: 'raw_performance',
  campanhas: 'raw_campanhas',
};

// POST: apaga uma ingestao especifica + as linhas raw_* associadas.
// Body: { ingestao_id: number, confirmar: true }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ingestaoId = parseInt(body?.ingestao_id, 10);
    if (!ingestaoId || isNaN(ingestaoId)) {
      return NextResponse.json({ error: 'ingestao_id obrigatorio' }, { status: 400 });
    }
    if (body?.confirmar !== true) {
      return NextResponse.json(
        { error: 'Operacao destrutiva. Envie confirmar: true' },
        { status: 400 },
      );
    }

    // Busca a ingestao pra saber o tipo (e qual tabela raw_*)
    const { data: ingestao, error: errBusca } = await supabase
      .from('ingestoes')
      .select('id, unidade_id, tipo, data_relatorio, qtd_linhas, arquivo')
      .eq('id', ingestaoId)
      .maybeSingle();
    if (errBusca) throw new Error(`busca: ${errBusca.message}`);
    if (!ingestao) {
      return NextResponse.json({ error: 'Ingestao nao encontrada' }, { status: 404 });
    }

    const tabelaRaw = TABELAS_RAW[ingestao.tipo];
    let linhasApagadas = 0;
    if (tabelaRaw) {
      const { count, error } = await supabase
        .from(tabelaRaw)
        .delete({ count: 'exact' })
        .eq('ingestao_id', ingestaoId);
      if (error) throw new Error(`${tabelaRaw}: ${error.message}`);
      linhasApagadas = count ?? 0;
    }

    // Por fim, apaga a ingestao
    const { error: errIng } = await supabase
      .from('ingestoes')
      .delete()
      .eq('id', ingestaoId);
    if (errIng) throw new Error(`ingestoes: ${errIng.message}`);

    return NextResponse.json({
      ok: true,
      ingestao_id: ingestaoId,
      tipo: ingestao.tipo,
      arquivo: ingestao.arquivo,
      linhas_apagadas: linhasApagadas,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
