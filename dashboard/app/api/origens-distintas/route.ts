import { NextResponse } from 'next/server';
import { buscarTudo } from '@/lib/supabase-paginar';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const leadsRows: any[] = await buscarTudo('raw_leads', q =>
      q.select('origem, unidade_id'),
    );
    const sistemaRows: any[] = await buscarTudo('raw_sistema', q =>
      q.select('origem, unidade_id'),
    );

    // Agrupar leads por origem
    const leadsMap = new Map<string, number>();
    for (const r of leadsRows || []) {
      const k = (r.origem ?? '(vazio)').toString();
      leadsMap.set(k, (leadsMap.get(k) || 0) + 1);
    }

    // Agrupar sistema por origem
    const sistemaMap = new Map<string, number>();
    for (const r of sistemaRows || []) {
      const k = (r.origem ?? '(vazio)').toString();
      sistemaMap.set(k, (sistemaMap.get(k) || 0) + 1);
    }

    const leads = Array.from(leadsMap.entries())
      .map(([origem, total]) => ({ origem, total }))
      .sort((a, b) => b.total - a.total);

    const sistema = Array.from(sistemaMap.entries())
      .map(([origem, total]) => ({ origem, total }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      raw_leads_kommo: leads,
      raw_sistema_orthodontic: sistema,
      totais: {
        leads_total_linhas: leadsRows?.length || 0,
        sistema_total_linhas: sistemaRows?.length || 0,
        leads_origens_distintas: leads.length,
        sistema_origens_distintas: sistema.length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 }
    );
  }
}
