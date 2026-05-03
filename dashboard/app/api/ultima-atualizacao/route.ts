import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Retorna a data/hora da ultima ingestao concluida para cada tipo
// (leads, performance). Campos sistema/campanhas mantidos como null pra
// compat retroativa com componentes antigos.
// Se unidade_id for passado, considera apenas aquela unidade. Caso contrario,
// retorna a ingestao MAIS ANTIGA entre as unidades (a mais defasada),
// porque o usuario quer saber "ate que ponto os numeros estao atualizados".
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;

    let q = supabase
      .from('ingestoes')
      .select('tipo, unidade_id, data_relatorio, concluido_em')
      .not('concluido_em', 'is', null);
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    type Info = { concluido_em: string; data_relatorio: string };
    const tipos: Record<string, Info | null> = {
      leads: null,
      sistema: null,
      performance: null,
      campanhas: null,
    };

    if (unidadeId) {
      // Para uma unidade especifica: pega a ingestao mais RECENTE de cada tipo.
      for (const r of data || []) {
        const t = r.tipo;
        if (!(t in tipos)) continue;
        const atual = tipos[t];
        if (!atual || (r.concluido_em && r.concluido_em > atual.concluido_em)) {
          tipos[t] = {
            concluido_em: r.concluido_em,
            data_relatorio: r.data_relatorio,
          };
        }
      }
    } else {
      // Sem filtro: pega a mais RECENTE por (unidade, tipo) e depois a MAIS ANTIGA
      // entre as unidades (= a unidade mais atrasada de cada tipo).
      const porUnidadeTipo: Record<string, Info> = {};
      for (const r of data || []) {
        const k = `${r.unidade_id}::${r.tipo}`;
        if (
          !porUnidadeTipo[k] ||
          (r.concluido_em && r.concluido_em > porUnidadeTipo[k].concluido_em)
        ) {
          porUnidadeTipo[k] = {
            concluido_em: r.concluido_em,
            data_relatorio: r.data_relatorio,
          };
        }
      }
      // Agora pega a MAIS ANTIGA entre unidades pra cada tipo
      for (const [k, info] of Object.entries(porUnidadeTipo)) {
        const tipo = k.split('::')[1];
        if (!(tipo in tipos)) continue;
        const atual = tipos[tipo];
        if (!atual || info.concluido_em < atual.concluido_em) {
          tipos[tipo] = info;
        }
      }
    }

    return NextResponse.json({
      unidade_id: unidadeId,
      tipos,
      // Helper: a ingestao mais antiga entre todos os tipos pedidos
      // (pode ser usado quando o quadro consome tudo)
      agora: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 }
    );
  }
}
