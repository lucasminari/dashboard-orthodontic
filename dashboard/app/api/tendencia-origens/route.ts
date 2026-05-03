import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapearOrigem, isOrigemKommo } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

// Retorna, para cada origem, a serie de cadastrados nos ultimos 6 meses
// e a variacao % do mes atual em relacao ao mes anterior.
//
// Ex: { "Mídia Real": { serie: [12, 18, 15, 22, 19, 28], variacao: 0.47 } }
//
// Para origens Kommo: cadastrados vem de raw_leads.data_cadastro.
// Para origens do sistema: cadastrados vem de raw_sistema.data_avaliacao.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;

    // Calcula janela de 6 meses
    const hoje = new Date();
    const meses: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const dataMin = `${meses[0]}-01`;

    let qLeads = supabase
      .from('raw_leads')
      .select('origem, data_cadastro, telefone_norm, nome, unidade_id')
      .gte('data_cadastro', dataMin);
    if (unidadeId) qLeads = qLeads.eq('unidade_id', unidadeId);
    const { data: leadsRows, error: errLeads } = await qLeads;
    if (errLeads) throw new Error(`raw_leads: ${errLeads.message}`);

    let qSis = supabase
      .from('raw_sistema')
      .select('origem, data_avaliacao, telefone_norm, paciente_id_externo, paciente_nome, unidade_id')
      .gte('data_avaliacao', dataMin);
    if (unidadeId) qSis = qSis.eq('unidade_id', unidadeId);
    const { data: sistemaRows, error: errSis } = await qSis;
    if (errSis) throw new Error(`raw_sistema: ${errSis.message}`);

    // Mapa: origem -> mes -> Set de pacientes
    const dados = new Map<string, Map<string, Set<string>>>();
    function add(origem: string, mes: string, chave: string) {
      if (!meses.includes(mes)) return;
      if (!dados.has(origem)) dados.set(origem, new Map());
      const mp = dados.get(origem)!;
      if (!mp.has(mes)) mp.set(mes, new Set());
      mp.get(mes)!.add(chave);
    }

    for (const r of leadsRows || []) {
      const origem = mapearOrigem(r.origem);
      if (!isOrigemKommo(origem)) continue; // Kommo: cadastros desta fonte
      const mes = (r.data_cadastro || '').slice(0, 7);
      const chave = r.telefone_norm
        ? `tel:${r.telefone_norm}`
        : `lead:${(r.nome || '').toLowerCase()}::${r.data_cadastro}`;
      add(origem, mes, chave);
    }
    for (const r of sistemaRows || []) {
      const origem = mapearOrigem(r.origem);
      if (isOrigemKommo(origem)) continue; // sistema: so origens nao-Kommo
      const mes = (r.data_avaliacao || '').slice(0, 7);
      const chave = r.paciente_id_externo
        ? `id:${r.paciente_id_externo}`
        : r.telefone_norm
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
      { status: 500 }
    );
  }
}
