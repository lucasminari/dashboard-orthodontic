import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// DELETE: apaga TODOS os dados de uma unidade (raw_leads, raw_sistema,
// raw_performance, raw_campanhas, ingestoes). Usado quando o usuario
// quer reimportar do zero — evita duplicacoes.
//
// Requer body com {confirmar: true} pra evitar chamada acidental.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const unidadeId = parseInt(body?.unidade_id, 10);
    if (!unidadeId || isNaN(unidadeId)) {
      return NextResponse.json({ error: 'unidade_id obrigatorio' }, { status: 400 });
    }
    if (body?.confirmar !== true) {
      return NextResponse.json(
        { error: 'Operacao destrutiva. Envie confirmar: true' },
        { status: 400 },
      );
    }

    // Apaga em ordem (raw_* depende de ingestoes via FK opcional)
    const tabelas = ['raw_leads', 'raw_sistema', 'raw_performance', 'raw_campanhas', 'ingestoes'];
    const apagados: Record<string, number | string> = {};
    for (const t of tabelas) {
      const { error, count } = await supabase
        .from(t)
        .delete({ count: 'exact' })
        .eq('unidade_id', unidadeId);
      if (error) {
        apagados[t] = `erro: ${error.message}`;
      } else {
        apagados[t] = count ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      unidade_id: unidadeId,
      apagados,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
