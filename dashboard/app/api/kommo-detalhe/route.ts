import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';

export const dynamic = 'force-dynamic';

/**
 * Retorna estatisticas de uma origem Kommo (Mídia Real, DBOUT, etc.)
 * pra renderizar dentro do CampanhaCard.
 *
 * Query: ?origem=Mídia%20Real&unidade_id=1&data_inicio=2026-04-01&data_fim=2026-04-30
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

    // Busca leads dessa origem que foram CRIADOS no periodo
    const leads = await buscarTudo<any>('kommo_leads', q => {
      let qq = q.select('id, unidade_id, status, criado_em, atualizado_em, tags').eq('origem', origem);
      if (dataInicio) qq = qq.gte('criado_em', dataInicio);
      if (dataFim) qq = qq.lte('criado_em', `${dataFim}T23:59:59`);
      return qq;
    });

    // Filtra por unidade (se unidadeId passado)
    // Importante: leads "sem unidade" (unidade_id null) tambem entram quando o
    // usuario filtra por unidade — sao leads que ainda nao foram qualificados
    // mas vieram dessa campanha. Mas pra simplificar, se unidadeId passado,
    // NAO incluimos sem_unidade (precisa ter sido atribuido).
    const filtradosUnidade = unidadeId
      ? leads.filter(l => l.unidade_id === unidadeId)
      : leads;

    // Estatisticas gerais (todos da origem, sem filtro de unidade)
    const totalLeadsNovos = leads.length;
    const semUnidadeAinda = leads.filter(l => l.unidade_id === null).length;
    const porUnidade = {
      Centro: leads.filter(l => l.unidade_id === 1).length,
      'Várzea Paulista': leads.filter(l => l.unidade_id === 2).length,
      Hortolândia: leads.filter(l => l.unidade_id === 3).length,
      'Sem unidade': semUnidadeAinda,
    };

    // Agendados Kommo (status === 'agendado') na unidade filtrada
    const agendadosKommo = filtradosUnidade.filter(l => l.status === 'agendado').length;
    const perdidosKommo = filtradosUnidade.filter(l => l.status === 'perdido').length;
    const emAtendimento = filtradosUnidade.filter(l => l.status === 'em_atendimento').length;

    // Tempo medio criacao -> agendamento (so leads agendados)
    const agendados = filtradosUnidade.filter(l => l.status === 'agendado');
    let tempoMedioDias: number | null = null;
    if (agendados.length > 0) {
      const somaDias = agendados.reduce((s, l) => {
        const c = new Date(l.criado_em).getTime();
        const a = new Date(l.atualizado_em).getTime();
        const dias = Math.max(0, (a - c) / (1000 * 60 * 60 * 24));
        return s + dias;
      }, 0);
      tempoMedioDias = somaDias / agendados.length;
    }

    // Leads por dia (mini-grafico) — so dentro do periodo filtrado
    const porDia = new Map<string, number>();
    for (const l of filtradosUnidade) {
      const dia = String(l.criado_em).slice(0, 10);
      porDia.set(dia, (porDia.get(dia) || 0) + 1);
    }
    const serieLeadsPorDia = Array.from(porDia.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, total]) => ({ data, total }));

    // Lead em ponto morto: criados ha 5+ dias, ainda em "em_atendimento"
    const limite = new Date();
    limite.setDate(limite.getDate() - 5);
    const leadsEmPontoMorto = filtradosUnidade.filter(
      l => l.status === 'em_atendimento' && new Date(l.criado_em) < limite,
    ).length;

    return NextResponse.json({
      origem,
      filtro: { unidade_id: unidadeId, data_inicio: dataInicio, data_fim: dataFim },
      total_leads_novos: totalLeadsNovos,
      por_unidade: porUnidade,
      sem_unidade_ainda: semUnidadeAinda,
      // Os agregados da unidade filtrada (pra mostrar lado a lado com Sistema)
      filtrados_unidade: {
        total: filtradosUnidade.length,
        agendados_kommo: agendadosKommo,
        perdidos_kommo: perdidosKommo,
        em_atendimento: emAtendimento,
        leads_em_ponto_morto: leadsEmPontoMorto,
        tempo_medio_agendamento_dias: tempoMedioDias,
      },
      serie_leads_por_dia: serieLeadsPorDia,
    });
  } catch (e) {
    console.error('Erro em /api/kommo-detalhe:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
