import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapearOrigem, ROTULO_SEM_ORIGEM } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

const UNIDADES: Record<number, string> = {
  1: 'Centro',
  2: 'Várzea Paulista',
  3: 'Hortolândia',
};

interface PacienteResultado {
  chave: string;
  nome: string;
  telefones: string[];
  unidades: string[];
  origem: string | null;
  // Datas (todas vem de raw_performance — campo `data`)
  primeiro_atendimento: string | null;
  ultimo_atendimento: string | null;
  data_compareceu: string | null;
  data_fechou: string | null;
  data_pagou: string | null;
  // Detalhes
  telemarketing: string | null;
  vlr_pago: number | null;
  ultima_acao: string | null;
  ultimo_status: string | null;
  total_atendimentos: number;
  // Flags
  compareceu: boolean;
  fechou: boolean;
  pagou: boolean;
}

function normalizarTelefone(t: string | null | undefined): string {
  if (!t) return '';
  return String(t).replace(/\D/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() || '';
    if (q.length < 2) {
      return NextResponse.json({ resultados: [], aviso: 'Digite ao menos 2 caracteres' });
    }

    const ehTelefone = /^\d{8,}$/.test(q.replace(/\D/g, ''));
    const telBusca = q.replace(/\D/g, '');
    const nomeBusca = `%${q.replace(/[%_]/g, '\\$&')}%`;

    // Fonte unica: raw_performance
    let qPerf = supabase
      .from('raw_performance')
      .select(
        'paciente_nome, telefone_orig, telefone_norm, origem, telemarketing, data, status, acao, compareceu, fechou, pagou, valor, unidade_id',
      );
    qPerf = ehTelefone
      ? qPerf.like('telefone_norm', `%${telBusca}%`)
      : qPerf.ilike('paciente_nome', nomeBusca);
    const { data: perfRows, error: errP } = await qPerf.limit(500);
    if (errP) throw new Error(`raw_performance: ${errP.message}`);

    const mapa = new Map<string, PacienteResultado>();

    function getOuCria(chave: string, nome: string): PacienteResultado {
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          nome,
          telefones: [],
          unidades: [],
          origem: null,
          primeiro_atendimento: null,
          ultimo_atendimento: null,
          data_compareceu: null,
          data_fechou: null,
          data_pagou: null,
          telemarketing: null,
          vlr_pago: null,
          ultima_acao: null,
          ultimo_status: null,
          total_atendimentos: 0,
          compareceu: false,
          fechou: false,
          pagou: false,
        });
      }
      return mapa.get(chave)!;
    }

    function chave(tel: string | null, nome: string | null): string {
      const t = normalizarTelefone(tel);
      if (t.length >= 8) return `tel:${t}`;
      return `nome:${(nome || '').toLowerCase().trim()}`;
    }

    function adicionaTel(p: PacienteResultado, tel: string | null) {
      if (!tel) return;
      const t = String(tel).trim();
      if (!p.telefones.includes(t)) p.telefones.push(t);
    }
    function adicionaUni(p: PacienteResultado, id: number | null) {
      if (!id) return;
      const nome = UNIDADES[id];
      if (nome && !p.unidades.includes(nome)) p.unidades.push(nome);
    }

    for (const r of perfRows || []) {
      const k = chave(r.telefone_norm, r.paciente_nome);
      const p = getOuCria(k, r.paciente_nome || '(sem nome)');
      adicionaTel(p, r.telefone_orig);
      adicionaUni(p, r.unidade_id);

      // Origem: prefere o campo origem, fallback no telemarketing (UPDONTIC)
      if (!p.origem) {
        let o = mapearOrigem(r.origem);
        if (o === ROTULO_SEM_ORIGEM) {
          const fb = mapearOrigem(r.telemarketing);
          if (fb !== ROTULO_SEM_ORIGEM) o = fb;
        }
        p.origem = o;
      }

      if (!p.telemarketing && r.telemarketing) p.telemarketing = r.telemarketing;
      p.total_atendimentos += 1;

      // Datas: pega a primeira e a ultima do atendimento
      if (r.data) {
        if (!p.primeiro_atendimento || r.data < p.primeiro_atendimento) {
          p.primeiro_atendimento = r.data;
        }
        if (!p.ultimo_atendimento || r.data > p.ultimo_atendimento) {
          p.ultimo_atendimento = r.data;
          p.ultima_acao = r.acao || null;
          p.ultimo_status = r.status || null;
        }
      }

      if (r.compareceu) {
        p.compareceu = true;
        if (!p.data_compareceu || (r.data && r.data > p.data_compareceu)) p.data_compareceu = r.data;
      }
      if (r.fechou) {
        p.fechou = true;
        if (!p.data_fechou || (r.data && r.data > p.data_fechou)) p.data_fechou = r.data;
      }
      if (r.pagou) {
        p.pagou = true;
        if (!p.data_pagou || (r.data && r.data > p.data_pagou)) p.data_pagou = r.data;
        if (!p.vlr_pago && r.valor) p.vlr_pago = Number(r.valor);
      }
    }

    const resultados = Array.from(mapa.values()).sort((a, b) => {
      const score = (p: PacienteResultado) =>
        p.data_pagou || p.data_fechou || p.data_compareceu || p.ultimo_atendimento || '';
      return score(b).localeCompare(score(a));
    });

    // Compat: mapeia nomes novos pros antigos esperados pela UI /buscar
    const compat = resultados.slice(0, 50).map(p => ({
      chave: p.chave,
      nome: p.nome,
      telefones: p.telefones,
      unidades: p.unidades,
      origem: p.origem,
      data_cadastro_kommo: null, // legado
      data_avaliacao: p.data_compareceu, // mais proximo no Performance
      data_contrato: p.data_fechou,
      data_pgto: p.data_pagou,
      dentista: null, // Performance nao tem
      atendente: p.telemarketing,
      vlr_contrato: p.vlr_pago,
      situacao: p.ultimo_status,
      ultimo_atendimento: p.ultimo_atendimento,
      total_atendimentos: p.total_atendimentos,
      ultima_acao: p.ultima_acao,
    }));

    return NextResponse.json({
      busca: q,
      total: resultados.length,
      resultados: compat,
    });
  } catch (e) {
    console.error('Erro em /api/paciente-buscar:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
