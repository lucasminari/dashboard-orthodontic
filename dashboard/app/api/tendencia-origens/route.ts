import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';
import { mapearOrigem, ROTULO_SEM_ORIGEM } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

// Retorna, para cada origem, a serie de AGENDAMENTOS nos ultimos 6 meses
// e a variacao % do mes atual em relacao ao mes anterior.
//
// Fonte unica: raw_performance (cada linha = 1 atendimento de telemarketing
// = 1 agendamento). Origem do paciente vem do campo `origem` do Performance.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;

    const hoje = new Date();
    const meses: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const dataMin = `${meses[0]}-01`;

    const perfRows = await buscarTudo('raw_performance', q => {
      let qq = q
        .select('origem, telemarketing, data, telefone_norm, paciente_nome, unidade_id')
        .gte('data', dataMin);
      if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
      return qq;
    });

    // Mapa: origem -> mes -> Set de pacientes
    const dados = new Map<string, Map<string, Set<string>>>();
    function add(origem: string, mes: string, chave: string) {
      if (!meses.includes(mes)) return;
      if (!dados.has(origem)) dados.set(origem, new Map());
      const mp = dados.get(origem)!;
      if (!mp.has(mes)) mp.set(mes, new Set());
      mp.get(mes)!.add(chave);
    }

    for (const r of perfRows || []) {
      let origem = mapearOrigem(r.origem);
      if (origem === ROTULO_SEM_ORIGEM) {
        const fb = mapearOrigem(r.telemarketing);
        if (fb !== ROTULO_SEM_ORIGEM) origem = fb;
      }
      const mes = (r.data || '').slice(0, 7);
      const chave = r.telefone_norm
        ? `tel:${r.telefone_norm}`
        : `nome:${(r.paciente_nome || '').toLowerCase()}`;
      add(origem, mes, chave);
    }

    const resultado: Record<string, { serie: number[]; variacao: number | null }> = {};
    for (const [origem, mp] of dados.entries()) {
      const serie = meses.map(m => (mp.get(m)?.size || 0));
      const ult = serie[serie.length - 1];
      const pen = serie[serie.length - 2];
      const variacao = pen > 0 ? (ult - pen) / pen : ult > 0 ? null : 0;
      resultado[origem] = { serie, variacao };
    }

    return NextResponse.json({
      meses,
      origens: resultado,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
