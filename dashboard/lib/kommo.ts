/**
 * Cliente da API Kommo + funcoes de mapeamento.
 *
 * - Pipeline alvo: ✅VENDAS JD's-VP (id 13518920) — unico onde tem leads
 *   de venda real (CENTRO e HORTO sao pipelines descontinuados).
 * - Origens canonicas: Mídia Real, DBOUT, PitchYes, Sorriso Novo, Galú
 *   (mapeadas via mapearOrigem).
 * - Unidade do paciente: vem em tag separada (Centro/Várzea/Hortolândia).
 *   Lead recem-criado pode ainda nao ter tag de unidade — eh registrado
 *   como "sem_unidade" ate ser qualificado.
 */

import { mapearOrigem, ROTULO_SEM_ORIGEM, ORIGENS_KOMMO_CANONICAS } from './origem-mapeamento';

// ─── Constantes do mapeamento ────────────────────────────────────────────

export const KOMMO_PIPELINE_ID = 13518920; // ✅VENDAS JD's-VP

/**
 * Status (etapas) que indicam que o lead chegou em "agendado" ou avancou
 * pra etapas seguintes (compareceu, contrato pago etc.).
 */
export const KOMMO_STATUS_AGENDADO_OU_AVANCOU = new Set<number>([
  104301152, // CONSULTA AGENDADA
  105062372, // AGUARDANDO CONFERÊNCIA
  104326432, // REAGENDAMENTO
  104326436, // Compareceu
]);

/**
 * Status que indicam que o lead foi perdido/desclassificado.
 */
export const KOMMO_STATUS_PERDIDO = new Set<number>([143]); // PERDA

/**
 * Mapa: tag (lowercase) → unidade canonica.
 * Lead que nao tem nenhuma dessas tags eh considerado "sem unidade ainda"
 * (ainda nao foi qualificado pela operadora).
 */
export const TAGS_UNIDADE: Record<string, 'Centro' | 'Várzea Paulista' | 'Hortolândia'> = {
  centro: 'Centro',
  várzea: 'Várzea Paulista',
  varzea: 'Várzea Paulista',
  hortolândia: 'Hortolândia',
  hortolandia: 'Hortolândia',
};

export type UnidadeKommo = 'Centro' | 'Várzea Paulista' | 'Hortolândia' | 'Sem unidade';

/** Map nome canonico → unidade_id usado na tabela do banco */
export const UNIDADE_NOME_PARA_ID: Record<string, number> = {
  Centro: 1,
  'Várzea Paulista': 2,
  Hortolândia: 3,
};

// ─── Cliente HTTP ─────────────────────────────────────────────────────────

interface KommoLead {
  id: number;
  name: string;
  pipeline_id: number;
  status_id: number;
  responsible_user_id: number;
  created_at: number; // unix seconds
  updated_at: number; // unix seconds
  closed_at: number | null;
  _embedded?: {
    tags?: { id: number; name: string }[];
    contacts?: { id: number; name: string }[];
  };
}

interface ApiOptions {
  subdomain: string;
  token: string;
}

function obterCredenciais(): ApiOptions {
  const subdomain = process.env.KOMMO_SUBDOMAIN?.trim();
  const token = process.env.KOMMO_ACCESS_TOKEN?.trim();
  if (!subdomain || !token) {
    throw new Error('KOMMO_SUBDOMAIN ou KOMMO_ACCESS_TOKEN nao configurados');
  }
  return { subdomain, token };
}

async function chamada<T = any>(
  path: string,
  query: Record<string, string | number> = {},
): Promise<T> {
  const { subdomain, token } = obterCredenciais();
  const qs = new URLSearchParams(
    Object.entries(query).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `https://${subdomain}.kommo.com/api/v4/${path}${qs ? `?${qs}` : ''}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Kommo HTTP ${r.status} em ${path}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

// ─── Buscar leads paginado ────────────────────────────────────────────────

/**
 * Busca todos os leads do pipeline alvo.
 * Pagina automaticamente (250 por chamada) ate acabar.
 *
 * @param desdeUnixSeconds se passado, so leads criados/atualizados depois disso
 */
export async function buscarLeadsKommo(opts?: {
  desdeUnixSeconds?: number;
  maxPaginas?: number; // safety limit
}): Promise<KommoLead[]> {
  const todos: KommoLead[] = [];
  const maxPag = opts?.maxPaginas ?? 50; // 50 paginas × 250 = 12.500 leads max por sync
  let pagina = 1;

  while (pagina <= maxPag) {
    const params: Record<string, string | number> = {
      limit: 250,
      page: pagina,
      'filter[pipeline_id]': KOMMO_PIPELINE_ID,
      with: 'contacts',
    };
    if (opts?.desdeUnixSeconds) {
      params['filter[updated_at][from]'] = opts.desdeUnixSeconds;
    }

    let dados: any;
    try {
      dados = await chamada<any>('leads', params);
    } catch (e) {
      // Quando nao tem mais leads, Kommo retorna 204 ou 404. Trata como fim.
      if (e instanceof Error && /HTTP (204|404)/.test(e.message)) break;
      throw e;
    }

    const leads: KommoLead[] = dados?._embedded?.leads ?? [];
    if (leads.length === 0) break;
    todos.push(...leads);

    // Se veio menos que limit, eh a ultima pagina
    if (leads.length < 250) break;
    pagina++;
  }

  return todos;
}

// ─── Mapeamento ──────────────────────────────────────────────────────────

interface LeadMapeado {
  kommo_id: number;
  origem: string | null; // canonica (Mídia Real, DBOUT, etc.) ou null se sem tag de origem
  unidade: UnidadeKommo;
  unidade_id: number | null;
  status_id: number;
  agendado: boolean; // true se status >= "agendado"
  perdido: boolean;
  criado_em: string; // ISO
  atualizado_em: string; // ISO
  tags: string[];
  nome: string;
}

export function mapearLead(lead: KommoLead): LeadMapeado {
  const tags = (lead._embedded?.tags ?? []).map(t => t.name);

  // Origem: pega a primeira tag que canoniza pra uma das 5 origens Kommo
  let origem: string | null = null;
  for (const t of tags) {
    const canonica = mapearOrigem(t);
    if (canonica !== ROTULO_SEM_ORIGEM && (ORIGENS_KOMMO_CANONICAS as readonly string[]).includes(canonica)) {
      origem = canonica;
      break;
    }
  }

  // Unidade: pega a primeira tag que casa com TAGS_UNIDADE
  let unidade: UnidadeKommo = 'Sem unidade';
  for (const t of tags) {
    const norm = t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, ''); // remove acentos
    const u = TAGS_UNIDADE[t.toLowerCase()] || TAGS_UNIDADE[norm];
    if (u) {
      unidade = u;
      break;
    }
  }

  return {
    kommo_id: lead.id,
    origem,
    unidade,
    unidade_id: unidade !== 'Sem unidade' ? UNIDADE_NOME_PARA_ID[unidade] : null,
    status_id: lead.status_id,
    agendado: KOMMO_STATUS_AGENDADO_OU_AVANCOU.has(lead.status_id),
    perdido: KOMMO_STATUS_PERDIDO.has(lead.status_id),
    criado_em: new Date(lead.created_at * 1000).toISOString(),
    atualizado_em: new Date(lead.updated_at * 1000).toISOString(),
    tags,
    nome: lead.name,
  };
}
