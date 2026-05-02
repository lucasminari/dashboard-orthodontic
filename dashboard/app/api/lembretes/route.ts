import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeParam = searchParams.get('unidade');
    const unidade = unidadeParam ? Number(unidadeParam) : null;

    const hoje = new Date().toISOString().slice(0, 10);

    let query = supabase
      .from('raw_sistema')
      .select('id, paciente_nome, telefone_orig, data_contrato, data_vcto, vlr_contrato, dentista, func_contrato, unidade_id')
      .is('data_pgto', null)
      .gte('data_vcto', hoje)
      .order('data_vcto', { ascending: true });

    if (unidade) query = query.eq('unidade_id', unidade);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const lembretes = (data || []).map(r => {
      const vcto = new Date(r.data_vcto + 'T00:00:00');
      const hojeDt = new Date(hoje + 'T00:00:00');
      const dias = Math.round((vcto.getTime() - hojeDt.getTime()) / (1000 * 60 * 60 * 24));
      let urgencia: 'alta' | 'media' | 'baixa';
      if (dias <= 1) urgencia = 'alta';
      else if (dias <= 7) urgencia = 'media';
      else urgencia = 'baixa';

      return {
        id: r.id,
        nome: r.paciente_nome,
        telefone: r.telefone_orig,
        valor: Number(r.vlr_contrato) || 0,
        data_contrato: r.data_contrato,
        data_vcto: r.data_vcto,
        dias_para_vencer: dias,
        dentista: r.dentista,
        atendente: r.func_contrato,
        urgencia,
      };
    });

    return NextResponse.json({ lembretes });
  } catch (e: any) {
    console.error('ERRO API /api/lembretes:', e.message);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}