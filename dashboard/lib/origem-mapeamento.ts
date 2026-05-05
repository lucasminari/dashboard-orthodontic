// Mapeamento canonico de origens.
//
// Regras:
// - As 5 origens Kommo abaixo SEMPRE unificam todas as variacoes conhecidas.
// - Para origens fora dessa lista, retornamos o nome EXATO como esta no banco
//   (sem interpretar). Se houver variacoes da mesma coisa com nomes diferentes,
//   a equipe corrige na fonte.
// - Linhas com origem "0", null, vazio ou "Origem desconhecida" sao agrupadas
//   como "Sem origem".

export type FonteOrigem = 'kommo' | 'sistema';

export const ORIGENS_KOMMO_CANONICAS = [
  'Mídia Real',
  'DBOUT',
  'PitchYes',
  'Sorriso Novo',
  'Galú',
] as const;

export type OrigemKommoCanonica = (typeof ORIGENS_KOMMO_CANONICAS)[number];

// Promotoras/parceiros externos que tambem sao "fontes" de leads
// (alem das 5 do Kommo). Aparecem na coluna Promotor do Sistema
// quando a coluna Origem vem zerada — o parser usa isso como fallback.
export const ORIGENS_EXTERNAS_NAO_KOMMO = [
  'UPDONTIC',
] as const;

export type OrigemExternaNaoKommo = (typeof ORIGENS_EXTERNAS_NAO_KOMMO)[number];

// Conjunto de TODAS as origens externas conhecidas (Kommo + parceiros)
// usado pelo parser pra decidir se um Promotor deve virar origem.
export const ORIGENS_EXTERNAS_CONHECIDAS = [
  ...ORIGENS_KOMMO_CANONICAS,
  ...ORIGENS_EXTERNAS_NAO_KOMMO,
] as const;

export type OrigemCanonica = OrigemKommoCanonica | OrigemExternaNaoKommo;

export const ROTULO_SEM_ORIGEM = 'Sem origem';

// Mapa de aliases para canonicas. Comparacao em lowercase + trim para tolerar
// variacoes de caixa, espacos extras e acentos diferentes.
const ALIASES_LOWER: Record<string, OrigemCanonica> = {};

function registrarAlias(canonica: OrigemCanonica, ...aliases: string[]) {
  for (const a of aliases) {
    ALIASES_LOWER[a.toLowerCase().trim()] = canonica;
  }
}

// Mídia Real ─ inclui agencia, variacoes de caixa e acento
// Mídia Real - VP / Mídia Real - VH sao MESMA origem (so identifica a unidade
// que paga a agencia — a unidade do paciente vem em outra etiqueta).
registrarAlias(
  'Mídia Real',
  'Mídia Real',
  'MIDIA REAL',
  'Midia Real',
  'AGENCIA MIDIA REAL',
  'Agência Mídia Real',
  'Agencia Midia Real',
  'Mídía Real',
  'Midi­a Real', // possivel byte zero-width
  'Mídia Real VP',
  'Mídia Real VH',
  'Mídia Real - VP',
  'Mídia Real - VH',
  'MIDIA REAL VP',
  'MIDIA REAL VH',
);

// DBOUT (inclui agencia)
registrarAlias(
  'DBOUT',
  'DBOUT',
  'Dbout',
  'dbout',
  'Agência Dbout',
  'Agencia Dbout',
  'Agência Dbout - Central',
  'Agencia Dbout - Central',
);

// PitchYes
registrarAlias(
  'PitchYes',
  'PitchYes',
  'Pitch Yes',
  'PITCH YES',
  'PITCHYES',
  'PITCH',
);

// Sorriso Novo
registrarAlias(
  'Sorriso Novo',
  'Sorriso Novo',
  'SORRISO NOVO',
  'SorrisoNovo',
);

// Galú
registrarAlias(
  'Galú',
  'Galú',
  'Galu',
  'GALÚ',
  'GALU',
);

// UPDONTIC ─ promotora externa que tambem agenda direto. Aparece na coluna
// Promotor do Sistema (origem do Sistema vem zerada) e na coluna Origem do
// Performance (telemarketing).
registrarAlias(
  'UPDONTIC',
  'UPDONTIC',
  'Updontic',
  'updontic',
  'UPDONTIC ',
  'UPD',
);

const VAZIOS = new Set<string>(['', '0', 'null', 'undefined', 'origem desconhecida']);

/**
 * Tenta corrigir mojibake comum (UTF-8 lido como Latin-1).
 * Ex: "Demanda EspontÃ¢nea" -> "Demanda Espontânea".
 * Soh aplica se a string contiver padroes tipicos (caractere "Ã" + outro).
 */
export function corrigirMojibake(s: string): string {
  if (!s.includes('Ã') && !s.includes('Â')) return s;
  try {
    // Re-encode os bytes como Latin-1 e decode como UTF-8
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // Verifica se nao introduziu Replacement Character (�).
    // Se sim, a string original ja estava ok ou nao eh mojibake puro.
    if (decoded.includes('�')) return s;
    return decoded;
  } catch {
    return s;
  }
}

/**
 * Normaliza uma origem para sua forma canonica.
 * - Corrige mojibake (encoding quebrado UTF-8/Latin-1).
 * - Se for uma das 5 Kommo (com qualquer variacao), retorna a canonica.
 * - Se for vazio/0/desconhecida, retorna ROTULO_SEM_ORIGEM.
 * - Caso contrario, retorna a string ORIGINAL (sem mexer nos casos
 *   nao mapeados — usuario corrige na fonte se precisar).
 */
export function mapearOrigem(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return ROTULO_SEM_ORIGEM;
  // Corrige mojibake antes de qualquer tratamento.
  const arrumado = corrigirMojibake(String(raw));
  // Remove aspas envolventes (dados antigos do CSV podem ter "aspa" literal)
  // e zero-width chars que aparecem em alguns exports do sistema.
  const trimmed = arrumado
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[​-‍﻿]/g, '')
    .trim();
  const lower = trimmed.toLowerCase();
  if (VAZIOS.has(lower)) return ROTULO_SEM_ORIGEM;
  const canonica = ALIASES_LOWER[lower];
  if (canonica) return canonica;
  return trimmed; // origem nao mapeada -> mantem como esta
}

/**
 * Indica se uma origem canonica eh originada na Kommo (necessita de
 * cruzamento com raw_leads para o estagio "Cadastrado").
 */
export function isOrigemKommo(canonica: string): canonica is OrigemKommoCanonica {
  return (ORIGENS_KOMMO_CANONICAS as readonly string[]).includes(canonica);
}

/**
 * Indica se uma string (um Promotor, por exemplo) corresponde a uma fonte
 * externa conhecida (Kommo ou parceira). Usado pelo parser do Sistema como
 * fallback quando a coluna Origem vem vazia/0.
 *
 * Retorna o nome canonico se for uma fonte conhecida, ou null caso contrario
 * (ex: nomes de funcionarias internas).
 */
export function tentarOrigemPorPromotor(promotor: string | null | undefined): string | null {
  if (!promotor) return null;
  const canonica = mapearOrigem(promotor);
  if (canonica === ROTULO_SEM_ORIGEM) return null;
  // Soh aceita se canonizou pra uma fonte EXTERNA conhecida (Kommo + parceiras).
  // Nomes nao mapeados (funcionarias internas como "JULIA TEDESCO") caem aqui.
  if ((ORIGENS_EXTERNAS_CONHECIDAS as readonly string[]).includes(canonica)) {
    return canonica;
  }
  return null;
}
