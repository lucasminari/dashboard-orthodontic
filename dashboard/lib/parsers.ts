import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { supabase } from './supabase';

type ProcessedData = {
  tipo: string;
  qtd_linhas: number;
  linhas: any[];
};

function normalizarTelefone(t: any): string | null {
  if (!t) return null;
  const digitos = String(t).replace(/[^0-9]/g, '');
  if (digitos.length >= 11) return digitos.slice(-11);
  if (digitos.length >= 10) return digitos.slice(-10);
  return null;
}

function parseDataBR(d: string | null): string | null {
  if (!d) return null;
  const s = String(d).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  let [, dia, mes, ano] = match;
  if (ano.length === 2) ano = String(parseInt(ano) < 30 ? 2000 + parseInt(ano) : 1900 + parseInt(ano));
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function parseValor(v: any): number {
  if (!v) return 0;
  const s = String(v).replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

async function processarLeads(file: File, dataRelatorio: string, unidadeId: number): Promise<ProcessedData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

  const processadas = linhas.map((linha: any) => ({
    unidade_id: unidadeId,
    data_relatorio: dataRelatorio,
    data_cadastro: parseDataBR(linha.Cadastro) || new Date().toISOString().split('T')[0],
    origem: linha.Origem || null,
    campanha: linha.Campanha || null,
    nome: linha.Nome || null,
    telefone_orig: linha.Telefone || linha.Celular || null,
    telefone_norm: normalizarTelefone(linha.Telefone || linha.Celular),
    responsavel: linha.Responsável || null,
  }));

  return {
    tipo: 'leads',
    qtd_linhas: processadas.length,
    linhas: processadas,
  };
}

async function processarSistema(file: File, dataRelatorio: string, unidadeId: number): Promise<ProcessedData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

  const processadas = linhas.map((linha: any) => {
    const nomeMatch = String(linha.Nome || '').match(/^(\d+)\s*-\s*(.*)$/);
    return {
      unidade_id: unidadeId,
      data_relatorio: dataRelatorio,
      paciente_id_externo: nomeMatch ? nomeMatch[1] : null,
      paciente_nome: nomeMatch ? nomeMatch[2] : linha.Nome,
      telefone_orig: linha.Telefone || null,
      telefone_norm: normalizarTelefone(linha.Telefone),
      data_avaliacao: parseDataBR(linha['Data Avaliação']),
      data_contrato: parseDataBR(linha['Data Contrato']),
      data_vcto: parseDataBR(linha['Data Vcto']),
      data_pgto: parseDataBR(linha['Data Pgto']),
      func_contrato: linha['Func. Contrato'] || null,
      campanha: linha.Campanha || null,
      origem: linha.Origem || null,
      indicacao: linha.Indicação || null,
      dentista: linha.Dentista || null,
      promotor: linha.Promotor || null,
      situacao: linha.Situação || null,
      vlr_contrato: parseValor(linha['Vl.Contrato']),
      parcela_status: linha.Parcela || null,
    };
  });

  return {
    tipo: 'sistema',
    qtd_linhas: processadas.length,
    linhas: processadas,
  };
}

async function processarPerformance(file: File, dataRelatorio: string, unidadeId: number): Promise<ProcessedData> {
  const content = await file.text();
  const { data: linhas } = Papa.parse(content, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  });

  const processadas = (linhas as any[]).map((linha) => ({
    unidade_id: unidadeId,
    data_relatorio: dataRelatorio,
    telemarketing: linha.Telemarketing || null,
    paciente_nome: linha.Nome || null,
    telefone_orig: linha.Telefone || null,
    telefone_norm: normalizarTelefone(linha.Telefone),
    data: parseDataBR(linha.Data),
    status: linha.Status || null,
    compareceu: linha.Compareceu?.toLowerCase() === 'sim',
    faltou: linha.Faltou?.toLowerCase() === 'sim',
    remarcado: linha.Remarcado?.toLowerCase() === 'sim',
    agenda_futura: linha['Agenda Futura']?.toLowerCase() === 'sim',
    fechou: linha.Fechou?.toLowerCase() === 'sim',
    pagou: linha.Pagou?.toLowerCase() === 'sim',
    valor: parseValor(linha.Valor),
    campanha: linha.Campanha || null,
    origem: linha.Origem || null,
    acao: linha.Ação || null,
  }));

  return {
    tipo: 'performance',
    qtd_linhas: processadas.length,
    linhas: processadas,
  };
}

async function processarCampanhas(file: File, dataRelatorio: string, unidadeId: number): Promise<ProcessedData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

  const processadas = linhas.map((linha: any) => ({
    unidade_id: unidadeId,
    data_relatorio: dataRelatorio,
    acao: linha.Ação || null,
    origem: linha.Origem || null,
    total_leads: parseInt(linha['Total Leads']) || 0,
    interacoes: parseInt(linha.Interações) || 0,
    agendados: parseInt(linha.Agendados) || 0,
    compareceram: parseInt(linha.Compareceram) || 0,
    contratos_fechados: parseInt(linha['Contratos Fechados']) || 0,
    contratos_pagos: parseInt(linha['Contratos Pagos']) || 0,
  }));

  return {
    tipo: 'campanhas',
    qtd_linhas: processadas.length,
    linhas: processadas,
  };
}

export async function processarArquivos(
  files: { leads: File; sistema: File; performance: File; campanhas: File },
  dataRelatorio: string,
  unidadeId: number,
): Promise<{ success: boolean; processed?: Record<string, number>; error?: string }> {
  try {
    const leads = await processarLeads(files.leads, dataRelatorio, unidadeId);
    const sistema = await processarSistema(files.sistema, dataRelatorio, unidadeId);
    const performance = await processarPerformance(files.performance, dataRelatorio, unidadeId);
    const campanhas = await processarCampanhas(files.campanhas, dataRelatorio, unidadeId);

    // Criar registro em ingestoes
    for (const tipo of ['leads', 'sistema', 'performance', 'campanhas']) {
      const dados = { leads, sistema, performance, campanhas }[tipo]!;

      // Delete antigos do mesmo mês
      const mesRef = dataRelatorio.slice(0, 7);
      await supabase
        .from('ingestoes')
        .delete()
        .eq('unidade_id', unidadeId)
        .eq('tipo', tipo)
        .gte('data_relatorio', mesRef + '-01')
        .lt('data_relatorio', mesRef.split('-')[0] + '-' + String(parseInt(mesRef.split('-')[1]) + 1).padStart(2, '0') + '-01');

      // Criar novo registro
      const { data: ingestao, error: ingestaoErr } = await supabase
        .from('ingestoes')
        .insert([
          {
            unidade_id: unidadeId,
            arquivo: `${dataRelatorio}_${tipo}`,
            tipo,
            data_relatorio: dataRelatorio,
            status: 'em_andamento',
            qtd_linhas: dados.qtd_linhas,
          },
        ])
        .select('id')
        .single();

      if (ingestaoErr) throw ingestaoErr;

      // Inserir linhas
      const { error: insertErr } = await supabase
        .from(`raw_${tipo}`)
        .insert(dados.linhas.map((l) => ({ ...l, ingestao_id: ingestao.id })));

      if (insertErr) throw insertErr;

      // Atualizar status
      await supabase.from('ingestoes').update({ status: 'ok', concluido_em: new Date().toISOString() }).eq('id', ingestao.id);
    }

    return {
      success: true,
      processed: {
        leads: leads.qtd_linhas,
        sistema: sistema.qtd_linhas,
        performance: performance.qtd_linhas,
        campanhas: campanhas.qtd_linhas,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao processar arquivos',
    };
  }
}
