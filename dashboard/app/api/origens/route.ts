import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

async function buscarTudo<T>(
  tabela: string,
  colunas: string,
  filtro?: (q: any) => any
): Promise<T[]> {
  const tamanhoLote = 1000;
  let pagina = 0;
  const acumulado: T[] = [];
  while (true) {
    let query: any = supabase.from(tabela).select(colunas);
    if (filtro) query = filtro(query);
    query = query.range(pagina * tamanhoLote, (pagina + 1) * tamanhoLote - 1);
    const { data, error } = await query;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    acumulado.push(...(data as T[]));
    if (data.length < tamanhoLote) break;
    pagina++;
  }
  return acumulado;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const unidade = searchParams.get('unidade') ? Number(searchParams.get('unidade')) : null;
    const desde = searchParams.get('desde');
    const ate   = searchParams.get('ate');

    type LeadKommo = { telefone_norm: string | null; origem: string | null; unidade_id: number | null };
    type Contrato  = { telefone_norm: string | null; vlr_contrato: number | null; data_pgto: string | null };

    const leads = await buscarTudo<LeadKommo>(
      'kommo_leads',
      'telefone_norm, origem, unidade_id',
      q => {
        let qq = q.not('origem', 'is', null);
        if (unidade) qq = qq.eq('unidade_id', unidade);
        if (desde)   qq = qq.gte('criado_em', desde);
        if (ate)     qq = qq.lte('criado_em', ate + 'T23:59:59');
        return qq;
      }
    );

    const contratos = await buscarTudo<Contrato>(
      'raw_sistema',
      'telefone_norm, vlr_contrato, data_pgto, unidade_id',
      q => {
        let qq = q;
        if (unidade) qq = qq.eq('unidade_id', unidade);
        return qq;
      }
    );

    const mapaContratos = new Map<string, { valor: number; pago: boolean }[]>();
    for (const c of contratos) {
      if (!c.telefone_norm) continue;
      if (!mapaContratos.has(c.telefone_norm)) mapaContratos.set(c.telefone_norm, []);
      mapaContratos.get(c.telefone_norm)!.push({
        valor: Number(c.vlr_contrato) || 0,
        pago: !!c.data_pgto,
      });
    }

    const porOrigem: Record<string, {
      leads: number; qualificados: number; fecharam: number; pagaram: number; receita: number;
    }> = {};

    for (const lead of leads) {
      const o = lead.origem!;
      if (!porOrigem[o]) {
        porOrigem[o] = { leads: 0, qualificados: 0, fecharam: 0, pagaram: 0, receita: 0 };
      }
      porOrigem[o].leads++;
      if (lead.unidade_id) porOrigem[o].qualificados++;
      const cs = lead.telefone_norm ? mapaContratos.get(lead.telefone_norm) : null;
      if (cs && cs.length > 0) {
        porOrigem[o].fecharam++;
        for (const c of cs) {
          if (c.pago) {
            porOrigem[o].pagaram++;
            porOrigem[o].receita += c.valor;
          }
        }
      }
    }

    const resultado = Object.entries(porOrigem)
      .map(([origem, n]) => ({
        origem,
        leads: n.leads,
        qualificados: n.qualificados,
        fecharam: n.fecharam,
        pagaram: n.pagaram,
        receita: n.receita,
        taxa_conversao: n.leads > 0 ? (n.fecharam / n.leads) * 100 : 0,
      }))
      .sort((a, b) => b.leads - a.leads);

    return NextResponse.json({ origens: resultado, total_leads: leads.length });
  } catch (e: any) {
    console.error('ERRO API /api/origens:', e.message);
    return NextResponse.json({ erro: e.message }, { status: 500 });
  }
}