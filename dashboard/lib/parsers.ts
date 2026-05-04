import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { tentarOrigemPorPromotor, corrigirMojibake } from './origem-mapeamento';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

// No servidor, prefere SERVICE_ROLE_KEY (bypassa RLS para inserts).
// Cai para chave publica/anon se a service role nao estiver configurada.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Variáveis de ambiente Supabase não configuradas');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ProcessarArquivosResult {
  success: boolean;
  error?: string;
  processed?: Record<string, number>;
}

// ==================== HELPERS ====================
function normalizarTelefone(t: any): string | null {
  if (!t) return null;
  const digitos = String(t).replace(/[^0-9]/g, '');
  if (digitos.length >= 11) return digitos.slice(-11);
  if (digitos.length >= 10) return digitos.slice(-10);
  return null;
}

function parseDataHora(d: any): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const s = String(d).trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (isoMatch) {
    const [, y, m, d_, h, mi, se] = isoMatch;
    return `${y}-${m}-${d_}T${h}:${mi}:${se}-03:00`;
  }
  // tenta dd/mm/yyyy hh:mm[:ss]
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brMatch) {
    let [, dia, mes, ano, h, mi, se] = brMatch;
    if (ano.length === 2) ano = '20' + ano;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${(h || '00').padStart(2, '0')}:${mi || '00'}:${(se || '00')}-03:00`;
  }
  return null;
}

function parseDataBR(d: any): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let [, dia, mes, ano] = m;
  if (ano.length === 2) ano = '20' + ano;
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function parseValor(v: any): number | null {
  if (v == null || v === '') return null;
  const s = String(v).replace('.', '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseValorSimples(v: any): number | null {
  if (v == null || v === '') return null;
  const s = String(v).replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function simNao(v: any): boolean | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'sim') return true;
  if (s === 'não' || s === 'nao') return false;
  return null;
}

function num(v: any): number {
  if (v == null || v === '') return 0;
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function parseCampanhaOrigem(texto: any): { campanha: string | null; origem: string | null } {
  if (!texto) return { campanha: null, origem: null };
  const s = String(texto);
  const matchCamp = s.match(/Camp:\s*([^O]*?)(?=Origem:|$)/);
  const matchOrig = s.match(/Origem:\s*(.*)$/);
  return {
    campanha: matchCamp ? matchCamp[1].trim() || null : null,
    origem: matchOrig ? matchOrig[1].trim() || null : null,
  };
}

// ==================== LEITORES DE ARQUIVO ====================
async function lerXLSX(file: File, range: number = 0): Promise<any[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { range, defval: null, raw: false });
}

// Parser CSV minimo que respeita aspas (campos podem conter ; entre aspas).
// Tambem remove aspas envoltorias e BOM.
function parseCSVLine(linha: string, sep: string = ';'): string[] {
  const out: string[] = [];
  let buf = '';
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      // Aspas duplas escapadas dentro de campo aspeado: ""
      if (dentroAspas && linha[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (c === sep && !dentroAspas) {
      out.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  out.push(buf);
  return out.map(s => s.trim());
}

// Decodifica buffer detectando encoding: tenta UTF-8 com BOM, senao testa
// se o resultado UTF-8 tem replacement chars; se sim, cai pra Windows-1252.
function decodeBufferAuto(buffer: ArrayBuffer): string {
  // Tenta UTF-8 primeiro
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  // Fallback: Windows-1252 (ISO-8859-1 estendido — comum em exports BR)
  try {
    const win = new TextDecoder('windows-1252', { fatal: false }).decode(buffer);
    return win.replace(/^﻿/, '');
  } catch {
    return utf8.replace(/^﻿/, '');
  }
}

async function lerCSVPerformance(file: File): Promise<any[]> {
  const buffer = await file.arrayBuffer();
  const texto = decodeBufferAuto(buffer);
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (linhas.length < 2) return [];

  const headers = parseCSVLine(linhas[0]);
  const dados: any[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const valores = parseCSVLine(linhas[i]);
    const row: any = {};
    headers.forEach((h, idx) => {
      row[h] = valores[idx] ?? null;
    });
    dados.push(row);
  }
  return dados;
}

// ==================== INGESTAO HELPERS ====================
async function apagarIngestoesAnteriores(
  unidadeId: number,
  tipo: string,
  dataRelatorio: string,
): Promise<void> {
  const mesRef = dataRelatorio.slice(0, 7); // YYYY-MM
  const inicioMes = `${mesRef}-01`;
  const [ano, mes] = mesRef.split('-').map(Number);
  const proximoMes = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

  // Busca ingestões do mês
  const { data: ingestoesAntigas, error: errBusca } = await supabase
    .from('ingestoes')
    .select('id')
    .eq('unidade_id', unidadeId)
    .eq('tipo', tipo)
    .gte('data_relatorio', inicioMes)
    .lt('data_relatorio', proximoMes);

  if (errBusca) throw new Error(`Erro buscando ingestões antigas (${tipo}): ${errBusca.message}`);

  if (!ingestoesAntigas || ingestoesAntigas.length === 0) return;

  const ids = ingestoesAntigas.map(i => i.id);
  const tabelaRaw = `raw_${tipo}`;

  // Apaga raw_* primeiro
  const { error: errRaw } = await supabase.from(tabelaRaw).delete().in('ingestao_id', ids);
  if (errRaw) throw new Error(`Erro apagando ${tabelaRaw}: ${errRaw.message}`);

  // Apaga ingestoes
  const { error: errIng } = await supabase.from('ingestoes').delete().in('id', ids);
  if (errIng) throw new Error(`Erro apagando ingestoes ${tipo}: ${errIng.message}`);
}

async function criarIngestao(
  unidadeId: number,
  tipo: string,
  dataRelatorio: string,
  arquivoNome: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('ingestoes')
    .insert({
      unidade_id: unidadeId,
      arquivo: arquivoNome,
      tipo,
      data_relatorio: dataRelatorio,
      status: 'em_andamento',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Erro criando ingestão ${tipo}: ${error.message}`);
  if (!data) throw new Error(`Ingestão ${tipo} não retornou ID`);
  return data.id as number;
}

async function finalizarIngestao(ingestaoId: number, qtdLinhas: number): Promise<void> {
  const { error } = await supabase
    .from('ingestoes')
    .update({
      status: 'ok',
      qtd_linhas: qtdLinhas,
      concluido_em: new Date().toISOString(),
    })
    .eq('id', ingestaoId);

  if (error) throw new Error(`Erro finalizando ingestão ${ingestaoId}: ${error.message}`);
}

async function inserirEmLotes(tabela: string, registros: any[], lote: number = 500): Promise<void> {
  for (let i = 0; i < registros.length; i += lote) {
    const chunk = registros.slice(i, i + lote);
    const { error } = await supabase.from(tabela).insert(chunk);
    if (error) throw new Error(`Erro inserindo em ${tabela}: ${error.message}`);
  }
}

// ==================== PROCESSADORES ====================
async function processarLeads(
  file: File,
  dataRelatorio: string,
  unidadeId: number,
): Promise<number> {
  const linhas = await lerXLSX(file, 0);
  await apagarIngestoesAnteriores(unidadeId, 'leads', dataRelatorio);
  const ingestaoId = await criarIngestao(unidadeId, 'leads', dataRelatorio, file.name);

  const registros = linhas
    .filter(l => l && (l['Nome'] || l['Telefone'] || l['Celular']))
    .map(l => {
      const telOrig = l['Telefone'] || l['Celular'];
      return {
        unidade_id: unidadeId,
        data_cadastro: parseDataHora(l['Cadastro']),
        origem: l['Origem'] || null,
        campanha: l['Campanha'] || null,
        nome: l['Nome'] || null,
        telefone_orig: telOrig || null,
        telefone_norm: normalizarTelefone(telOrig),
        responsavel: l['Responsável'] || l['Responsavel'] || null,
        ingestao_id: ingestaoId,
      };
    });

  if (registros.length > 0) {
    await inserirEmLotes('raw_leads', registros);
  }
  await finalizarIngestao(ingestaoId, registros.length);
  return registros.length;
}

async function processarSistema(
  file: File,
  dataRelatorio: string,
  unidadeId: number,
): Promise<number> {
  const linhas = await lerXLSX(file, 1); // pula primeira linha (cabeçalho mesclado)
  await apagarIngestoesAnteriores(unidadeId, 'sistema', dataRelatorio);
  const ingestaoId = await criarIngestao(unidadeId, 'sistema', dataRelatorio, file.name);

  const registros = linhas
    .filter(l => l && (l['Nome'] || l['Telefone']))
    .map(l => {
      const nomeBruto = String(l['Nome'] || '');
      const matchId = nomeBruto.match(/^(\d+)\s*-\s*(.+)$/);
      const idExterno = matchId ? matchId[1] : null;
      const nomeLimpo = matchId ? matchId[2].trim() : nomeBruto.trim();

      const telOrig = l['Telefone'];
      const { campanha, origem: origemBruta } = parseCampanhaOrigem(l['Campanha -|- Origem -|- Evento']);
      const promotor = l['Promotor'] || null;

      // FALLBACK: quando o Sistema nao popula Origem direito (vem "0", null,
      // vazio), tenta usar o Promotor — mas SO se for uma fonte externa
      // conhecida (UPDONTIC, Mídia Real, DBOUT, etc.). Nomes de funcionarias
      // internas (ex: "JULIA TEDESCO") nao viram origem, ficam como Sem origem.
      const origemNormalizada = origemBruta && origemBruta !== '0' ? origemBruta : null;
      const origemFinal = origemNormalizada || tentarOrigemPorPromotor(promotor) || origemBruta;

      return {
        unidade_id: unidadeId,
        paciente_id_externo: idExterno,
        paciente_nome: nomeLimpo || null,
        telefone_orig: telOrig || null,
        telefone_norm: normalizarTelefone(telOrig),
        data_avaliacao: parseDataBR(l['Data Avaliação']),
        data_contrato: parseDataBR(l['Data Contrato']),
        data_vcto: parseDataBR(l['Data Vcto']),
        data_pgto: parseDataBR(l['Data Pgto']),
        func_contrato: l['Func. Contrato'] || null,
        campanha,
        origem: origemFinal,
        indicacao: l['Indicação'] || null,
        dentista: l['Dentista'] || null,
        promotor,
        situacao: l['Situação'] || null,
        vlr_contrato: parseValorSimples(l['Vl.Contrato']),
        parcela_status: l['Parcela'] || null,
        ingestao_id: ingestaoId,
      };
    });

  if (registros.length > 0) {
    await inserirEmLotes('raw_sistema', registros);
  }
  await finalizarIngestao(ingestaoId, registros.length);
  return registros.length;
}

// Tolerancia de linhas fora do mes — algumas remarcacoes podem cair em
// dias proximos do virar do mes. Acima disso, o erro do user (mes errado
// no dropdown ou filtro do relatorio errado) eh mais provavel.
const TOLERANCIA_LINHAS_FORA_DO_MES = 0.05; // 5%

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function rotuloMesPt(yyyymm: string): string {
  const [a, m] = yyyymm.split('-').map(Number);
  return `${MESES_PT[(m || 1) - 1]} de ${a}`;
}

async function processarPerformance(
  file: File,
  dataRelatorio: string,
  unidadeId: number,
): Promise<number> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const linhas = ext === 'csv' ? await lerCSVPerformance(file) : await lerXLSX(file, 0);

  const linhasComDados = linhas.filter(l => l && (l['Nome'] || l['Telefone'] || l['Data']));

  // ── VALIDACAO: mes das linhas vs mes_referencia escolhido no upload ──
  // Performance tem coluna Data por linha — entao da pra validar se o
  // arquivo bate com o mes selecionado no dropdown (ou se cobre 2 meses).
  // Pra outros arquivos (CampanhasReport / OutrosColaboradores) nao da
  // pra validar (sao agregados sem data por linha).
  const mesEsperado = dataRelatorio.slice(0, 7); // YYYY-MM
  const distribuicaoMeses: Record<string, number> = {};
  let totalComData = 0;
  for (const l of linhasComDados) {
    const dataParseada = parseDataBR(l['Data']);
    if (!dataParseada) continue;
    totalComData++;
    const mes = dataParseada.slice(0, 7);
    distribuicaoMeses[mes] = (distribuicaoMeses[mes] || 0) + 1;
  }

  if (totalComData > 0) {
    const linhasNoMesCerto = distribuicaoMeses[mesEsperado] || 0;
    const linhasFora = totalComData - linhasNoMesCerto;
    const taxaFora = linhasFora / totalComData;

    if (taxaFora > TOLERANCIA_LINHAS_FORA_DO_MES) {
      const dist = Object.entries(distribuicaoMeses)
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => `${n} de ${rotuloMesPt(m)}`)
        .join(', ');
      throw new Error(
        `Mês de referência incorreto. Você selecionou "${rotuloMesPt(mesEsperado)}" no dropdown, mas o arquivo Performance tem ${linhasFora} linhas (${(taxaFora * 100).toFixed(0)}%) fora desse mês.\n\n` +
          `Distribuição encontrada: ${dist}.\n\n` +
          `Verifique:\n` +
          `1) O filtro de período no relatório do Orthodontic (deve cobrir só ${rotuloMesPt(mesEsperado)})\n` +
          `2) O mês selecionado no dropdown da tela de upload\n\n` +
          `Nada foi salvo. Corrija e tente de novo.`,
      );
    }
  }

  await apagarIngestoesAnteriores(unidadeId, 'performance', dataRelatorio);
  const ingestaoId = await criarIngestao(unidadeId, 'performance', dataRelatorio, file.name);

  const registros = linhasComDados.map(l => {
    const telOrig = l['Telefone'];
    return {
      unidade_id: unidadeId,
      telemarketing: l['Telemarketing'] || null,
      paciente_nome: l['Nome'] || null,
      telefone_orig: telOrig || null,
      telefone_norm: normalizarTelefone(telOrig),
      data: parseDataBR(l['Data']),
      status: l['Status'] || null,
      compareceu: simNao(l['Compareceu']),
      faltou: simNao(l['Faltou']),
      remarcado: simNao(l['Remarcado']),
      agenda_futura: simNao(l['Agenda Futura']),
      fechou: simNao(l['Fechou']),
      pagou: simNao(l['Pagou']),
      valor: parseValor(l['Valor']),
      campanha: l['Campanha'] || null,
      origem: l['Origem'] || null,
      acao: l['Ação'] || null,
      ingestao_id: ingestaoId,
    };
  });

  if (registros.length > 0) {
    await inserirEmLotes('raw_performance', registros);
  }
  await finalizarIngestao(ingestaoId, registros.length);
  return registros.length;
}

// ==================== CAMPANHAS REPORT ====================
// Relatorio agregado oficial: por (Campanha + Acao + Origem) traz totais
// de Leads, Interacoes, Agendados, Compareceram, Contratos Fechados e Pagos.
// Eh a FONTE OFICIAL dos numeros agregados (Performance perde walk-ins/recepcao).
async function processarCampanhas(
  file: File,
  dataRelatorio: string,
  unidadeId: number,
): Promise<number> {
  const linhas = await lerXLSX(file, 1); // pula primeira linha (titulo mesclado)
  await apagarIngestoesAnteriores(unidadeId, 'campanhas', dataRelatorio);
  const ingestaoId = await criarIngestao(unidadeId, 'campanhas', dataRelatorio, file.name);

  const registros = linhas
    .filter(l => l && (l['Campanha'] || l['Origem'] || l['Total Leads']))
    .map(l => ({
      unidade_id: unidadeId,
      data_relatorio: dataRelatorio,
      campanha: corrigirMojibake(String(l['Campanha'] || '')) || null,
      acao: corrigirMojibake(String(l['Ação'] || '')) || null,
      origem: corrigirMojibake(String(l['Origem'] || '')) || null,
      total_leads: num(l['Total Leads']),
      interacoes: num(l['Interações']),
      agendados: num(l['Agendados']),
      compareceram: num(l['Compareceram']),
      contratos_fechados: num(l['Contratos Fechados']),
      contratos_pagos: num(l['Contratos Pagos']),
      ingestao_id: ingestaoId,
    }));

  if (registros.length > 0) {
    await inserirEmLotes('raw_campanhas', registros);
  }
  await finalizarIngestao(ingestaoId, registros.length);
  return registros.length;
}

// ==================== OUTROS COLABORADORES ====================
// Relatorio agregado de agendamentos feitos por OUTROS colaboradores
// (Recepcao, Supervisores, Sistema). Total agregado por colaborador, sem
// origem nem data por linha. Usado pra controle interno.
async function processarOutrosColaboradores(
  file: File,
  dataRelatorio: string,
  unidadeId: number,
): Promise<number> {
  const linhas = await lerXLSX(file, 1);
  await apagarIngestoesAnteriores(unidadeId, 'outros_colaboradores', dataRelatorio);
  const ingestaoId = await criarIngestao(
    unidadeId,
    'outros_colaboradores',
    dataRelatorio,
    file.name,
  );

  const registros = linhas
    .filter(l => l && l['Colaborador'])
    .map(l => ({
      unidade_id: unidadeId,
      data_relatorio: dataRelatorio,
      colaborador: String(l['Colaborador'] || '').trim() || null,
      cargo: String(l['Cargo'] || '').trim() || null,
      agendamentos: num(l['Agendamentos']),
      comparecimentos: num(l['Comparecimentos']),
      ingestao_id: ingestaoId,
    }));

  if (registros.length > 0) {
    try {
      await inserirEmLotes('raw_outros_colaboradores', registros);
    } catch (e) {
      // Tabela ainda nao existe no banco — log e ignora pra nao quebrar
      // o upload dos outros arquivos. Usuario precisa criar a tabela.
      console.warn('[parser] raw_outros_colaboradores nao existe — pulando insert. Erro:', e);
    }
  }
  await finalizarIngestao(ingestaoId, registros.length);
  return registros.length;
}

// ==================== MAIN ====================
export async function processarArquivos(
  files: Record<string, File>,
  dataRelatorio: string,
  unidadeId: number,
): Promise<ProcessarArquivosResult> {
  const processed: Record<string, number> = {};

  try {
    // ORDEM IMPORTANTE: Performance PRIMEIRO porque ele faz a validacao
    // do mes_referencia (compara datas das linhas com o mes selecionado).
    // Se der erro, nada eh gravado nos outros arquivos.
    if (files.performance) {
      console.log('[parser] Processando performance:', files.performance.name);
      processed.performance = await processarPerformance(files.performance, dataRelatorio, unidadeId);
      console.log(`[parser] Performance: ${processed.performance} linhas`);
    }
    if (files.leads) {
      console.log('[parser] Processando leads:', files.leads.name);
      processed.leads = await processarLeads(files.leads, dataRelatorio, unidadeId);
      console.log(`[parser] Leads: ${processed.leads} linhas`);
    }
    if (files.sistema) {
      console.log('[parser] Processando sistema:', files.sistema.name);
      processed.sistema = await processarSistema(files.sistema, dataRelatorio, unidadeId);
      console.log(`[parser] Sistema: ${processed.sistema} linhas`);
    }
    if (files.campanhas) {
      console.log('[parser] Processando campanhas:', files.campanhas.name);
      processed.campanhas = await processarCampanhas(files.campanhas, dataRelatorio, unidadeId);
      console.log(`[parser] Campanhas: ${processed.campanhas} linhas`);
    }
    if (files.outros_colaboradores) {
      console.log('[parser] Processando outros_colaboradores:', files.outros_colaboradores.name);
      processed.outros_colaboradores = await processarOutrosColaboradores(
        files.outros_colaboradores,
        dataRelatorio,
        unidadeId,
      );
      console.log(`[parser] OutrosColaboradores: ${processed.outros_colaboradores} linhas`);
    }

    return { success: true, processed };
  } catch (error) {
    console.error('[parser] ERRO em processarArquivos:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      processed,
    };
  }
}
