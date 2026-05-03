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

export const ROTULO_SEM_ORIGEM = 'Sem origem';

// Mapa de aliases para canonicas. Comparacao em lowercase + trim para tolerar
// variacoes de caixa, espacos extras e acentos diferentes.
const ALIASES_LOWER: Record<string, OrigemKommoCanonica> = {};

function registrarAlias(canonica: OrigemKommoCanonica, ...aliases: string[]) {
  for (const a of aliases) {
    ALIASES_LOWER[a.toLowerCase().trim()] = canonica;
  }
}

// Mídia Real ─ inclui agencia, variacoes de caixa e acento
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
  'MIDIA REAL VP',
  'MIDIA REAL VH',
);

// DBOUT (inclui agencia)
registrarAlias(
  'DBOUT',
  'DBOUT',
  'Dbout',
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
