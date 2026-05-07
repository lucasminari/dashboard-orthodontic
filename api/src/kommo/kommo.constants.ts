/**
 * Constantes do Kommo CRM da OrthoDontic.
 *
 * Espelho parcial do que existe em dashboard/lib/kommo.ts. Mantemos
 * duplicado por enquanto (V1) — quando a divergencia comecar a doer
 * extraimos pra um pacote npm interno. Trocas em produtos devem ser
 * feitas em ambos lugares ate la.
 */

export const KOMMO_PIPELINE_ID = 13518920; // VENDAS JD's-VP

/**
 * Status que indicam "agendado" ou avancou (compareceu, pago, etc.).
 */
export const KOMMO_STATUS_AGENDADO_OU_AVANCOU = new Set<number>([
  104301152, // CONSULTA AGENDADA
  105062372, // AGUARDANDO CONFERENCIA
  104326432, // REAGENDAMENTO
  104326436, // Compareceu
]);

export const KOMMO_STATUS_PERDIDO = new Set<number>([143]);

/**
 * Mapa: tag (lowercase, sem acento) -> id da unidade no banco.
 */
export const TAGS_UNIDADE: Record<string, number> = {
  centro: 1,
  varzea: 2,
  'varzea paulista': 2,
  hortolandia: 3,
};

export const UNIDADE_ID_PARA_NOME: Record<number, string> = {
  1: 'Centro',
  2: 'Varzea Paulista',
  3: 'Hortolandia',
};

/**
 * Tags conhecidas como origem (campanha / parceiro).
 * Comparacao em lowercase + sem acento.
 */
export const TAGS_ORIGEM = new Set<string>([
  'sorriso novo',
  'dbout',
  'midia real',
  'midia real - vp',
  'midia real - vh',
  'galu',
  'pitch yes',
  'pitch',
  'pitchyes',
]);

export const FIELD_DATA_AVALIACAO = 3090222;

/**
 * Normaliza uma string pra lookup: lowercase, sem acentos, trim.
 */
export function normalizar(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
