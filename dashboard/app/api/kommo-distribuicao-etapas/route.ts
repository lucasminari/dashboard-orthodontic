import { NextResponse, NextRequest } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';

export const dynamic = 'force-dynamic';

/**
 * Retorna a distribuicao de leads ATIVOS de uma origem por etapa do
 * pipeline Kommo (✅VENDAS JD's-VP, id 13518920).
 *
 * Etapas do pipeline (ordem do funil):
 * 1. ENTRADA
 * 2. EM ATENDIMENTO
 * 3. atendimento humano
 * 4. CONSULTA AGENDADA
 * 5. AGUARDANDO CONFERÊNCIA
 * 6. REAGENDAMENTO
 * 7. Compareceu
 * 8. REMARKETING 60/60
 * (Excluimos PERDA do display)
 */

const ETAPAS_ORDEM: { id: number; nome: string; cor: string; categoria: string }[] = [
  { id: 104301140, nome: 'Incoming leads', cor: '#94a3b8', categoria: 'inicio' },
  { id: 104301144, nome: 'ENTRADA', cor: '#94a3b8', categoria: 'inicio' },
  { id: 104301148, nome: 'EM ATENDIMENTO', cor: '#60a5fa', categoria: 'atendimento' },
  { id: 104574168, nome: 'Atendimento humano', cor: '#a78bfa', categoria: 'atendimento' },
  { id: 104301152, nome: 'CONSULTA AGENDADA', cor: '#fbbf24', categoria: 'agendado' },
  { id: 105062372, nome: 'Aguardando conferência', cor: '#fcd34d', categoria: 'agendado' },
  { id: 104326432, nome: 'Reagendamento', cor: '#fb923c', categoria: 'reagendado' },
  { id: 104326436, nome: 'Compareceu', cor: '#34d399', categoria: 'compareceu' },
  { id: 142, nome: 'Remarketing 60/60', cor: '#a3a3a3', categoria: 'remarketing' },
];

const STATUS_PERDA = 143;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const origem = searchParams.get('origem');
    if (!origem) {
      return NextResponse.json({ error: 'origem obrigatorio' }, { status: 400 });
    }
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;

    // Pega leads dessa origem (sem filtro de data — queremos snapshot atual)
    const leads = await buscarTudo<any>('kommo_leads', q => {
      let qq = q.select('etapa_atual, unidade_id').eq('origem', origem);
      return qq;
    });

    // Filtra por unidade (se passada). Inclui leads "sem unidade" quando
    // unidadeId nao passado. Quando passado, so leads daquela unidade.
    const filtrados = unidadeId ? leads.filter(l => l.unidade_id === unidadeId) : leads;

    // Conta por etapa, ignorando PERDA
    const porEtapa = new Map<number, number>();
    let totalPerdidos = 0;
    let totalAtivos = 0;
    let totalDesconhecido = 0;

    for (const l of filtrados) {
      const eid = parseInt(String(l.etapa_atual), 10);
      if (isNaN(eid)) continue;
      if (eid === STATUS_PERDA) {
        totalPerdidos++;
        continue;
      }
      porEtapa.set(eid, (porEtapa.get(eid) || 0) + 1);
      if (ETAPAS_ORDEM.find(e => e.id === eid)) totalAtivos++;
      else totalDesconhecido++;
    }

    // Monta resposta na ordem das etapas
    const etapas = ETAPAS_ORDEM.map(e => ({
      id: e.id,
      nome: e.nome,
      cor: e.cor,
      categoria: e.categoria,
      total: porEtapa.get(e.id) || 0,
    })).filter(e => e.total > 0);

    const max = Math.max(...etapas.map(e => e.total), 1);

    return NextResponse.json({
      origem,
      filtro: { unidade_id: unidadeId },
      total_ativos: totalAtivos,
      total_perdidos: totalPerdidos,
      total_desconhecido: totalDesconhecido,
      max,
      etapas,
    });
  } catch (e) {
    console.error('Erro em /api/kommo-distribuicao-etapas:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
