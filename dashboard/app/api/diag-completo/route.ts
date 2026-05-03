import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mapearOrigem } from '@/lib/origem-mapeamento';

export const dynamic = 'force-dynamic';

const UNIDADES: Record<number, string> = {
  1: 'Centro',
  2: 'Várzea Paulista',
  3: 'Hortolândia',
};

// Diagnostico completo da qualidade dos dados.
export async function GET() {
  const relatorio: any = {};

  try {
    // ── raw_sistema ────────────────────────────────────────────
    const { data: sistemaRows } = await supabase
      .from('raw_sistema')
      .select('paciente_id_externo, telefone_norm, paciente_nome, origem, data_avaliacao, data_contrato, data_pgto, vlr_contrato, dentista, func_contrato, situacao, unidade_id');

    const totalSis = sistemaRows?.length || 0;
    const semOrigem = (sistemaRows || []).filter(r => !r.origem).length;
    const semTelefone = (sistemaRows || []).filter(r => !r.telefone_norm).length;
    const semIdExterno = (sistemaRows || []).filter(r => !r.paciente_id_externo).length;
    const semNome = (sistemaRows || []).filter(r => !r.paciente_nome).length;
    const semDentista = (sistemaRows || []).filter(r => !r.dentista).length;
    const semAtendente = (sistemaRows || []).filter(r => !r.func_contrato).length;
    const semValor = (sistemaRows || []).filter(r => r.data_contrato && !r.vlr_contrato).length;

    // Datas
    const datasAval = (sistemaRows || []).map(r => r.data_avaliacao).filter(Boolean).sort();
    const datasCtr = (sistemaRows || []).map(r => r.data_contrato).filter(Boolean).sort();

    // Pacientes unicos vs total
    const pacUnicos = new Set();
    for (const r of sistemaRows || []) {
      const k = r.paciente_id_externo
        ? `id:${r.paciente_id_externo}`
        : r.telefone_norm
          ? `tel:${r.telefone_norm}`
          : `nome:${r.paciente_nome}`;
      pacUnicos.add(k);
    }

    // Por unidade
    const porUnidade: any = {};
    for (const id of [1, 2, 3]) {
      const linhas = (sistemaRows || []).filter(r => r.unidade_id === id);
      const ult = linhas.map(r => r.data_avaliacao).filter(Boolean).sort();
      porUnidade[UNIDADES[id]] = {
        total: linhas.length,
        sem_origem: linhas.filter(r => !r.origem).length,
        sem_telefone: linhas.filter(r => !r.telefone_norm).length,
        ultima_data_aval: ult[ult.length - 1] || null,
      };
    }

    relatorio.sistema = {
      total_linhas: totalSis,
      pacientes_unicos: pacUnicos.size,
      duplicacao_pct: totalSis > 0 ? ((totalSis - pacUnicos.size) / totalSis * 100).toFixed(1) + '%' : 'n/a',
      faltando: {
        sem_origem: `${semOrigem} (${(semOrigem / totalSis * 100).toFixed(1)}%)`,
        sem_telefone: `${semTelefone} (${(semTelefone / totalSis * 100).toFixed(1)}%)`,
        sem_id_externo: `${semIdExterno} (${(semIdExterno / totalSis * 100).toFixed(1)}%)`,
        sem_nome: `${semNome} (${(semNome / totalSis * 100).toFixed(1)}%)`,
        sem_dentista: `${semDentista} (${(semDentista / totalSis * 100).toFixed(1)}%)`,
        sem_atendente: `${semAtendente} (${(semAtendente / totalSis * 100).toFixed(1)}%)`,
        contrato_sem_valor: `${semValor} (de ${datasCtr.length} contratos)`,
      },
      datas: {
        avaliacao: { primeira: datasAval[0]?.slice(0, 10), ultima: datasAval[datasAval.length - 1]?.slice(0, 10) },
        contrato: { primeira: datasCtr[0]?.slice(0, 10), ultima: datasCtr[datasCtr.length - 1]?.slice(0, 10) },
      },
      por_unidade: porUnidade,
    };

    // ── raw_performance ────────────────────────────────────────
    const { data: perfRows } = await supabase
      .from('raw_performance')
      .select('telefone_norm, paciente_nome, data, status, telemarketing, origem, unidade_id');

    const totalPerf = perfRows?.length || 0;
    const datasP = (perfRows || []).map(r => r.data).filter(Boolean).sort();
    const semTelP = (perfRows || []).filter(r => !r.telefone_norm).length;
    const semStatusP = (perfRows || []).filter(r => !r.status).length;
    const semTeleP = (perfRows || []).filter(r => !r.telemarketing).length;

    relatorio.performance = {
      total_linhas: totalPerf,
      faltando: {
        sem_telefone: `${semTelP} (${totalPerf > 0 ? (semTelP / totalPerf * 100).toFixed(1) : 0}%)`,
        sem_status: `${semStatusP} (${totalPerf > 0 ? (semStatusP / totalPerf * 100).toFixed(1) : 0}%)`,
        sem_telemarketer: `${semTeleP} (${totalPerf > 0 ? (semTeleP / totalPerf * 100).toFixed(1) : 0}%)`,
      },
      datas: {
        primeira: datasP[0]?.slice(0, 10),
        ultima: datasP[datasP.length - 1]?.slice(0, 10),
      },
    };

    // ── raw_campanhas ──────────────────────────────────────────
    const { data: campRows } = await supabase
      .from('raw_campanhas')
      .select('unidade_id', { count: 'exact', head: false });
    relatorio.campanhas = {
      total_linhas: campRows?.length || 0,
    };

    // ── Origens nao mapeadas ──────────────────────────────────
    const origensNaoMapeadas = new Map<string, number>();
    for (const r of sistemaRows || []) {
      const orig = String(r.origem || '').trim();
      if (!orig) continue;
      const mapeada = mapearOrigem(orig);
      // Se a origem nao foi normalizada (mantida como esta) e nao eh Kommo conhecida
      if (mapeada === orig && !['Mídia Real', 'DBOUT', 'PitchYes', 'Sorriso Novo', 'Galú', 'Sem origem'].includes(mapeada)) {
        origensNaoMapeadas.set(orig, (origensNaoMapeadas.get(orig) || 0) + 1);
      }
    }
    relatorio.origens_nao_mapeadas = Array.from(origensNaoMapeadas.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([nome, total]) => ({ nome, total }));

    return NextResponse.json(relatorio);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro' },
      { status: 500 }
    );
  }
}
