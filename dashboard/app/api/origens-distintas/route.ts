import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Endpoint diagnostico para listar todas as origens distintas
// que aparecem em raw_leads (Kommo) e raw_sistema (Orthodontic),
// junto com a contagem de quantas vezes aparecem.
export async function GET() {
  try {
    // Origens em raw_leads (Kommo)
    const { data: leadsRows, error: errLeads } = await supabase
      .from('raw_leads')
      .select('origem, unidade_id');

    if (errLeads) throw new Error(`raw_leads: ${errLeads.message}`);

    // Origens em raw_sistema (Orthodontic)
    const { data: sistemaRows, error: errSis } = await supabase
      .from('raw_sistema')
      .select('origem, unidade_id');

    if (errSis) throw new Error(`raw_sistema: ${errSis.message}`);

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
