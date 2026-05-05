import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';
import { mapearOrigem, ROTULO_SEM_ORIGEM, ORIGENS_KOMMO_CANONICAS } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

/**
 * Retorna a serie diaria de "entradas" de uma origem no periodo:
 * - Pra origens Kommo (5 canonicas): conta leads criados em kommo_leads
 * - Pra outras origens (UPDONTIC, Demanda Espontanea, etc.): conta
 *   atendimentos em raw_performance (cada linha = 1 entrada agendada)
 *
 * Retorna array com TODOS os dias do periodo (mesmo zerados) pra
 * o grafico ficar continuo.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const origem = searchParams.get('origem');
    if (!origem) {
      return NextResponse.json({ error: 'origem obrigatorio' }, { status: 400 });
    }
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;
    const dataInicio = searchParams.get('data_inicio'); // YYYY-MM-DD
    const dataFim = searchParams.get('data_fim'); // YYYY-MM-DD

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: 'data_inicio e data_fim obrigatorios' },
        { status: 400 },
      );
    }

    const ehKommo = (ORIGENS_KOMMO_CANONICAS as readonly string[]).includes(origem);

    // Inicializa todos os dias do periodo com 0
    const porDia = new Map<string, number>();
    const di = new Date(`${dataInicio}T12:00:00`);
    const df = new Date(`${dataFim}T12:00:00`);
    for (let d = new Date(di); d <= df; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      porDia.set(key, 0);
    }

    if (ehKommo) {
      // Origem Kommo: conta leads criados (kommo_leads)
      const leads = await buscarTudo<any>('kommo_leads', q => {
        let qq = q.select('criado_em, unidade_id').eq('origem', origem);
        qq = qq.gte('criado_em', dataInicio).lte('criado_em', `${dataFim}T23:59:59`);
        return qq;
      });
      const filtrados = unidadeId ? leads.filter(l => l.unidade_id === unidadeId) : leads;
      for (const l of filtrados) {
        const dia = String(l.criado_em).slice(0, 10);
        if (porDia.has(dia)) porDia.set(dia, (porDia.get(dia) || 0) + 1);
      }
    } else {
      // Origem nao-Kommo: conta atendimentos do raw_performance
      const linhas = await buscarTudo<any>('raw_performance', q => {
        let qq = q.select('data, origem, telemarketing, unidade_id');
        if (unidadeId) qq = qq.eq('unidade_id', unidadeId);
        qq = qq.gte('data', dataInicio).lte('data', dataFim);
        return qq;
      });
      // Filtra por origem (com fallback no telemarketing)
      const filtrados = linhas.filter(r => {
        let o = mapearOrigem(r.origem);
        if (o === ROTULO_SEM_ORIGEM) {
          const fb = mapearOrigem(r.telemarketing);
          if (fb !== ROTULO_SEM_ORIGEM) o = fb;
        }
        return o === origem;
      });
      for (const r of filtrados) {
        const dia = String(r.data).slice(0, 10);
        if (porDia.has(dia)) porDia.set(dia, (porDia.get(dia) || 0) + 1);
      }
    }

    const serie = Array.from(porDia.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, total]) => ({ data, total }));

    const total = serie.reduce((s, d) => s + d.total, 0);
    const max = serie.reduce((m, d) => Math.max(m, d.total), 0);
    const diaPico = serie.reduce(
      (acc, d) => (d.total > acc.total ? d : acc),
      { data: '', total: 0 },
    );

    return NextResponse.json({
      origem,
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      fonte: ehKommo ? 'kommo' : 'performance',
      serie,
      total,
      max,
      dia_pico: diaPico,
    });
  } catch (e) {
    console.error('Erro em /api/leads-por-dia:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
