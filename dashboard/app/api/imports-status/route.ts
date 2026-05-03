import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const TIPOS = ['campanhas', 'performance', 'outros_colaboradores'];

export async function GET() {
  try {
    // 1. Lista de unidades ativas
    const { data: unidades, error: errU } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true)
      .order('id');

    if (errU) throw errU;

    // 2. Todas as ingestões com status ok, ordenadas pra pegar a mais recente por (unidade, tipo)
    const { data: ingestoes, error: errI } = await supabase
      .from('ingestoes')
      .select('unidade_id, tipo, data_relatorio, qtd_linhas, concluido_em, arquivo')
      .eq('status', 'ok')
      .order('data_relatorio', { ascending: false })
      .order('concluido_em', { ascending: false });

    if (errI) throw errI;

    // 3. Agrupa: pega a primeira (mais recente) de cada (unidade_id, tipo)
    const ultimas: Record<string, typeof ingestoes[0]> = {};
    for (const ing of ingestoes ?? []) {
      const key = `${ing.unidade_id}-${ing.tipo}`;
      if (!ultimas[key]) ultimas[key] = ing;
    }

    // 4. Monta a estrutura final unidade × tipos
    const resultado = (unidades ?? []).map(u => ({
      unidade_id: u.id,
      unidade_nome: u.nome,
      tipos: TIPOS.map(tipo => {
        const ing = ultimas[`${u.id}-${tipo}`];
        return {
          tipo,
          data_relatorio: ing?.data_relatorio ?? null,
          qtd_linhas: ing?.qtd_linhas ?? 0,
          concluido_em: ing?.concluido_em ?? null,
          arquivo: ing?.arquivo ?? null,
        };
      }),
    }));

    return NextResponse.json({ unidades: resultado });
  } catch (e: any) {
    console.error('Erro em /api/imports-status:', e);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}
