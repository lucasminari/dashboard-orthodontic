import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';

export const dynamic = 'force-dynamic';

// Auditoria de pagamentos em um período: lista cada linha que contou
// como "pagou" (data_pgto preenchida) e analisa duplicação.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get('data_inicio') || '2026-04-01';
    const dataFim = searchParams.get('data_fim') || '2026-04-30';
    const unidadeId = parseInt(searchParams.get('unidade_id') || '1', 10);

    const linhas: any[] = await buscarTudo('raw_sistema', q =>
      q
        .select('paciente_id_externo, paciente_nome, telefone_norm, data_avaliacao, data_contrato, data_pgto, vlr_contrato, parcela_status, situacao')
        .eq('unidade_id', unidadeId)
        .gte('data_pgto', dataInicio)
        .lte('data_pgto', dataFim),
    );

    // Agrupa por paciente
    const porPaciente = new Map<string, any[]>();
    for (const r of linhas) {
      const k = r.paciente_id_externo
        ? `id:${r.paciente_id_externo}`
        : r.telefone_norm
          ? `tel:${r.telefone_norm}`
          : `nome:${r.paciente_nome}`;
      if (!porPaciente.has(k)) porPaciente.set(k, []);
      porPaciente.get(k)!.push(r);
    }

    // Classifica cada paciente:
    // - novo_no_periodo: data_contrato dentro do periodo (contrato fechado e pago no mesmo mes)
    // - parcela_de_antigo: contrato anterior, paciente pagando parcela
    let novos = 0;
    let parcelasDeAntigos = 0;
    const exemploNovo: any[] = [];
    const exemploParcela: any[] = [];

    for (const [k, regs] of porPaciente.entries()) {
      const temContratoNoPeriodo = regs.some(r => r.data_contrato >= dataInicio && r.data_contrato <= dataFim);
      if (temContratoNoPeriodo) {
        novos++;
        if (exemploNovo.length < 3) exemploNovo.push({ k, linhas: regs.length, primeiro: regs[0] });
      } else {
        parcelasDeAntigos++;
        if (exemploParcela.length < 3) exemploParcela.push({ k, linhas: regs.length, primeiro: regs[0] });
      }
    }

    return NextResponse.json({
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      total_linhas_com_pgto_no_periodo: linhas.length,
      pacientes_unicos: porPaciente.size,
      analise: {
        novos_contratos_pagos_no_periodo: novos,
        pacientes_pagando_parcela_de_contrato_antigo: parcelasDeAntigos,
        explicacao: 'Cada linha do arquivo Orthodontic eh uma parcela. Quando um paciente pagou multiplas parcelas em meses diferentes, cada uma vira uma linha. O dashboard atualmente conta como "pagaram" qualquer paciente com data_pgto no periodo — isso INCLUI parcelas de contratos antigos.',
      },
      exemplos_novos: exemploNovo,
      exemplos_parcela_antiga: exemploParcela,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
