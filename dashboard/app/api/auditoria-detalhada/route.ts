import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';

export const dynamic = 'force-dynamic';

// Auditoria forense de fechados em um período.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dataInicio = searchParams.get('data_inicio') || '2026-04-01';
    const dataFim = searchParams.get('data_fim') || '2026-04-30';
    const unidadeId = parseInt(searchParams.get('unidade_id') || '1', 10);

    // Linhas com contrato fechado no período
    const linhas: any[] = await buscarTudo('raw_sistema', q =>
      q
        .select('id, paciente_id_externo, paciente_nome, telefone_norm, data_avaliacao, data_contrato, data_pgto, vlr_contrato, parcela_status, situacao, ingestao_id, unidade_id')
        .eq('unidade_id', unidadeId)
        .gte('data_contrato', dataInicio)
        .lte('data_contrato', dataFim),
    );

    // Conta por paciente quantas linhas
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

    // Estatisticas de duplicacao
    let pacientesCom1Linha = 0;
    let pacientesCom2OuMais = 0;
    let totalLinhasExtras = 0;
    const exemplosDuplicados: any[] = [];

    for (const [k, regs] of porPaciente.entries()) {
      if (regs.length === 1) pacientesCom1Linha++;
      else {
        pacientesCom2OuMais++;
        totalLinhasExtras += regs.length - 1;
        if (exemplosDuplicados.length < 5) {
          exemplosDuplicados.push({
            chave: k,
            nome: regs[0].paciente_nome,
            quantas_linhas: regs.length,
            ingestoes_distintas: [...new Set(regs.map(r => r.ingestao_id))],
            datas_pgto: [...new Set(regs.map(r => r.data_pgto))],
            valores: regs.map(r => r.vlr_contrato),
            parcela_status: regs.map(r => r.parcela_status),
          });
        }
      }
    }

    // Ingestoes que contribuiram
    const ingestoesUsadas = new Set(linhas.map(r => r.ingestao_id));

    return NextResponse.json({
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      total_linhas_no_periodo: linhas.length,
      pacientes_unicos_com_contrato_no_periodo: porPaciente.size,
      duplicacao: {
        pacientes_com_1_linha: pacientesCom1Linha,
        pacientes_com_multiplas_linhas: pacientesCom2OuMais,
        total_linhas_extras: totalLinhasExtras,
      },
      ingestoes_que_contribuiram: ingestoesUsadas.size,
      lista_ingestoes: [...ingestoesUsadas],
      exemplos_pacientes_duplicados: exemplosDuplicados,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
