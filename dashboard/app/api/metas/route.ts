import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const TIPOS_VALIDOS = [
  'agendados',
  'compareceram',
  'pagaram',
] as const;
type TipoMeta = (typeof TIPOS_VALIDOS)[number];

// GET: lista metas. Filtros opcionais: unidade_id, mes (YYYY-MM)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unidadeIdParam = searchParams.get('unidade_id');
    const unidadeId = unidadeIdParam ? parseInt(unidadeIdParam, 10) : null;
    const mes = searchParams.get('mes');

    let q = supabase.from('metas').select('*');
    if (unidadeId) q = q.eq('unidade_id', unidadeId);
    if (mes) q = q.eq('mes', mes);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return NextResponse.json({ metas: data || [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}

// POST: cria/atualiza metas em lote
// Body: { metas: [{ unidade_id, mes, tipo, valor }, ...] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const metas = Array.isArray(body?.metas) ? body.metas : null;
    if (!metas || metas.length === 0) {
      return NextResponse.json({ error: 'metas vazias' }, { status: 400 });
    }

    // Valida cada meta
    for (const m of metas) {
      if (!m.unidade_id || !m.mes || !m.tipo) {
        return NextResponse.json({ error: 'unidade_id, mes e tipo obrigatorios' }, { status: 400 });
      }
      if (!TIPOS_VALIDOS.includes(m.tipo)) {
        return NextResponse.json({ error: `tipo invalido: ${m.tipo}` }, { status: 400 });
      }
      if (typeof m.valor !== 'number' || m.valor < 0) {
        return NextResponse.json({ error: `valor invalido: ${m.valor}` }, { status: 400 });
      }
    }

    // Upsert (insere ou atualiza pela chave unica)
    const registros = metas.map((m: any) => ({
      unidade_id: m.unidade_id,
      mes: m.mes,
      tipo: m.tipo,
      valor: m.valor,
      atualizado_em: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('metas')
      .upsert(registros, { onConflict: 'unidade_id,mes,tipo' });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, total: registros.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
