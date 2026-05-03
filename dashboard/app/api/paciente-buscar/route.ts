import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapearOrigem } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

const UNIDADES: Record<number, string> = {
  1: 'Centro',
  2: 'Várzea Paulista',
  3: 'Hortolândia',
};

interface PacienteResultado {
  chave: string; // dedup key (id_externo > telefone > nome)
  nome: string;
  telefones: string[];
  unidades: string[];
  origem: string | null;
  // Histórico (datas das etapas)
  data_cadastro_kommo: string | null;
  data_avaliacao: string | null;
  data_contrato: string | null;
  data_pgto: string | null;
  // Detalhes do sistema
  dentista: string | null;
  atendente: string | null;
  vlr_contrato: number | null;
  situacao: string | null;
  // Telemarketing
  ultimo_atendimento: string | null;
  total_atendimentos: number;
  ultima_acao: string | null;
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

    // Busca em raw_leads (Kommo)
    let qLeads = supabase
      .from('raw_leads')
      .select('nome, telefone_orig, telefone_norm, origem, data_cadastro, unidade_id, responsavel');
    qLeads = ehTelefone
      ? qLeads.like('telefone_norm', `%${telBusca}%`)
      : qLeads.ilike('nome', nomeBusca);
    const { data: leadsRows, error: errL } = await qLeads.limit(100);
    if (errL) throw new Error(`raw_leads: ${errL.message}`);

    // Busca em raw_sistema
    let qSis = supabase
      .from('raw_sistema')
      .select(
        'paciente_id_externo, paciente_nome, telefone_orig, telefone_norm, origem, data_avaliacao, data_contrato, data_pgto, dentista, func_contrato, vlr_contrato, situacao, unidade_id',
      );
    qSis = ehTelefone
      ? qSis.like('telefone_norm', `%${telBusca}%`)
      : qSis.ilike('paciente_nome', nomeBusca);
    const { data: sistemaRows, error: errS } = await qSis.limit(100);
    if (errS) throw new Error(`raw_sistema: ${errS.message}`);

    // Busca em raw_performance pra contar atendimentos
    let qPerf = supabase
      .from('raw_performance')
      .select('paciente_nome, telefone_norm, data, status, acao');
    qPerf = ehTelefone
      ? qPerf.like('telefone_norm', `%${telBusca}%`)
      : qPerf.ilike('paciente_nome', nomeBusca);
    const { data: perfRows, error: errP } = await qPerf.limit(200);
    if (errP) throw new Error(`raw_performance: ${errP.message}`);

    // Junta tudo por chave (telefone normalizado eh o melhor identificador)
    const mapa = new Map<string, PacienteResultado>();

    function getOuCria(chave: string, nome: string): PacienteResultado {
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          nome,
          telefones: [],
          unidades: [],
          origem: null,
          data_cadastro_kommo: null,
          data_avaliacao: null,
          data_contrato: null,
          data_pgto: null,
          dentista: null,
          atendente: null,
          vlr_contrato: null,
          situacao: null,
          ultimo_atendimento: null,
          total_atendimentos: 0,
          ultima_acao: null,
        });
      }
      return mapa.get(chave)!;
    }

    function chave(tel: string | null, idExt: string | null, nome: string | null): string {
      const t = normalizarTelefone(tel);
      if (idExt) return `id:${idExt}`;
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

    for (const r of leadsRows || []) {
      const k = chave(r.telefone_norm, null, r.nome);
      const p = getOuCria(k, r.nome || '(sem nome)');
      adicionaTel(p, r.telefone_orig);
      adicionaUni(p, r.unidade_id);
      if (!p.origem && r.origem) p.origem = mapearOrigem(r.origem);
      if (!p.data_cadastro_kommo || (r.data_cadastro && r.data_cadastro > p.data_cadastro_kommo)) {
        p.data_cadastro_kommo = r.data_cadastro;
      }
    }

    for (const r of sistemaRows || []) {
      const k = chave(r.telefone_norm, r.paciente_id_externo, r.paciente_nome);
      const p = getOuCria(k, r.paciente_nome || '(sem nome)');
      adicionaTel(p, r.telefone_orig);
      adicionaUni(p, r.unidade_id);
      if (!p.origem && r.origem) p.origem = mapearOrigem(r.origem);
      // Pega a maior data (mais recente) de cada etapa
      const setMaior = (campo: 'data_avaliacao' | 'data_contrato' | 'data_pgto', val: string | null) => {
        if (!val) return;
        if (!p[campo] || val > p[campo]!) p[campo] = val;
      };
      setMaior('data_avaliacao', r.data_avaliacao);
      setMaior('data_contrato', r.data_contrato);
      setMaior('data_pgto', r.data_pgto);
      if (!p.dentista && r.dentista) p.dentista = r.dentista;
      if (!p.atendente && r.func_contrato) p.atendente = r.func_contrato;
      if (!p.vlr_contrato && r.vlr_contrato) p.vlr_contrato = Number(r.vlr_contrato);
      if (!p.situacao && r.situacao) p.situacao = r.situacao;
    }

    for (const r of perfRows || []) {
      const k = chave(r.telefone_norm, null, r.paciente_nome);
      // So conta se ja existe (foi achado em leads ou sistema). Se nao,
      // criamos com apenas o telemarketing.
      const p = getOuCria(k, r.paciente_nome || '(sem nome)');
      p.total_atendimentos += 1;
      if (!p.ultimo_atendimento || (r.data && r.data > p.ultimo_atendimento)) {
        p.ultimo_atendimento = r.data;
        p.ultima_acao = r.status || r.acao || null;
      }
    }

    const resultados = Array.from(mapa.values()).sort((a, b) => {
      // Ordena por mais recente: pgto > contrato > avaliacao > cadastro
      const score = (p: PacienteResultado) =>
        p.data_pgto || p.data_contrato || p.data_avaliacao || p.data_cadastro_kommo || '';
      return score(b).localeCompare(score(a));
    });

    return NextResponse.json({
      busca: q,
      total: resultados.length,
      resultados: resultados.slice(0, 50),
    });
  } catch (e) {
    console.error('Erro em /api/paciente-buscar:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 },
    );
  }
}
