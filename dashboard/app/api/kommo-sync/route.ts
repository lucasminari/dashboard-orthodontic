import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buscarLeadsKommo, mapearLead } from '@/lib/kommo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sincroniza leads da Kommo (pipeline VENDAS JD's-VP) com a tabela kommo_leads.
 *
 * - Aceita ?desde=YYYY-MM-DD pra incremental (so leads atualizados depois)
 * - Sem ?desde, busca todos (full sync, mais lento mas confiavel)
 * - Faz upsert por kommo_id (id da Kommo eh primary key logica)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get('desde'); // 'YYYY-MM-DD' ou null

  const inicio = Date.now();
  let desdeUnix: number | undefined;
  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    desdeUnix = Math.floor(new Date(`${desde}T00:00:00Z`).getTime() / 1000);
  }

  let leads: any[];
  try {
    leads = await buscarLeadsKommo({ desdeUnixSeconds: desdeUnix });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : 'erro' },
      { status: 500 },
    );
  }

  const mapeados = leads.map(mapearLead);

  // Filtra so quem tem origem reconhecida (das 5 Kommo)
  const comOrigem = mapeados.filter(l => l.origem !== null);

  // Upsert em lotes (Supabase tem limite ~500 por insert)
  const TAM_LOTE = 200;
  let totalGravado = 0;
  let erros: string[] = [];

  for (let i = 0; i < comOrigem.length; i += TAM_LOTE) {
    const lote = comOrigem.slice(i, i + TAM_LOTE);
    const registros = lote.map(l => ({
      id: l.kommo_id, // id da Kommo eh PK
      unidade_id: l.unidade_id,
      paciente_id: null,
      nome: l.nome,
      telefone_orig: null,
      telefone_norm: null,
      origem: l.origem,
      campanha: null,
      etapa_atual: String(l.status_id),
      status: l.agendado ? 'agendado' : l.perdido ? 'perdido' : 'em_atendimento',
      responsavel: null,
      criado_em: l.criado_em,
      atualizado_em: l.atualizado_em,
      sincronizado_em: new Date().toISOString(),
      data_avaliacao: null,
      tags: l.tags as any,
      perdido_motivo: null,
    }));

    const { error } = await supabase
      .from('kommo_leads')
      .upsert(registros, { onConflict: 'id' });
    if (error) erros.push(error.message);
    else totalGravado += registros.length;
  }

  // Estatisticas
  const stats = {
    leads_buscados: leads.length,
    leads_com_origem: comOrigem.length,
    leads_sem_origem: mapeados.length - comOrigem.length,
    por_origem: {} as Record<string, number>,
    por_unidade: {} as Record<string, number>,
    agendados: comOrigem.filter(l => l.agendado).length,
    perdidos: comOrigem.filter(l => l.perdido).length,
  };
  for (const l of comOrigem) {
    if (l.origem) stats.por_origem[l.origem] = (stats.por_origem[l.origem] || 0) + 1;
    stats.por_unidade[l.unidade] = (stats.por_unidade[l.unidade] || 0) + 1;
  }

  const duracao = Math.round((Date.now() - inicio) / 1000);

  return NextResponse.json({
    ok: erros.length === 0,
    duracao_segundos: duracao,
    total_gravado: totalGravado,
    erros,
    stats,
  });
}
