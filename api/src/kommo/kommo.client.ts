import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KOMMO_PIPELINE_ID,
  KOMMO_STATUS_AGENDADO_OU_AVANCOU,
  KOMMO_STATUS_PERDIDO,
  TAGS_UNIDADE,
  TAGS_ORIGEM,
  FIELD_DATA_AVALIACAO,
  normalizar,
} from './kommo.constants';

export interface KommoLead {
  id: number;
  name: string;
  pipeline_id: number;
  status_id: number;
  responsible_user_id: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  custom_fields_values?: { field_id: number; values: { value: string | number }[] }[];
  _embedded?: {
    tags?: { id: number; name: string }[];
    contacts?: { id: number; name: string }[];
  };
}

export interface LeadMapeado {
  kommoId: number;
  nome: string;
  statusId: number;
  unidadeId: number | null;
  origem: string | null;
  agendado: boolean;
  perdido: boolean;
  tags: string[];
  dataAvaliacao: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

@Injectable()
export class KommoClient {
  private readonly log = new Logger(KommoClient.name);

  constructor(private config: ConfigService) {}

  private get baseUrl(): string {
    const sub = this.config.getOrThrow<string>('KOMMO_SUBDOMAIN');
    return `https://${sub}.kommo.com/api/v4`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.getOrThrow<string>('KOMMO_ACCESS_TOKEN')}`,
      Accept: 'application/json',
    };
  }

  private async chamada<T = any>(path: string, query: Record<string, string | number> = {}): Promise<T | null> {
    const qs = new URLSearchParams(
      Object.entries(query).map(([k, v]) => [k, String(v)] as [string, string]),
    ).toString();
    const url = `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const r = await fetch(url, { headers: this.headers });
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error(`Kommo HTTP ${r.status} em ${path}: ${txt.slice(0, 200)}`);
    }
    return (await r.json()) as T;
  }

  /**
   * Busca leads do pipeline alvo, paginado. Retorna ate maxPaginas * 250 leads.
   * @param desdeUnixSeconds opcional, filtra updated_at >= esse valor
   */
  async buscarLeads(opts?: { desdeUnixSeconds?: number; maxPaginas?: number }): Promise<KommoLead[]> {
    const todos: KommoLead[] = [];
    const maxPag = opts?.maxPaginas ?? 50;
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

      const dados = await this.chamada<any>('/leads', params);
      const leads: KommoLead[] = dados?._embedded?.leads ?? [];
      if (leads.length === 0) break;
      todos.push(...leads);
      if (leads.length < 250) break;
      pagina++;
    }

    return todos;
  }

  /**
   * Mapeia um lead bruto da Kommo para a forma usada no banco.
   */
  mapearLead(lead: KommoLead): LeadMapeado {
    const tagsRaw = (lead._embedded?.tags ?? []).map(t => t.name);
    const tagsNorm = tagsRaw.map(normalizar);

    let unidadeId: number | null = null;
    for (const t of tagsNorm) {
      const u = TAGS_UNIDADE[t];
      if (u !== undefined) {
        unidadeId = u;
        break;
      }
    }

    let origem: string | null = null;
    for (const t of tagsNorm) {
      if (TAGS_ORIGEM.has(t)) {
        origem = t;
        break;
      }
    }

    let dataAvaliacao: Date | null = null;
    if (lead.custom_fields_values) {
      const f = lead.custom_fields_values.find(c => c.field_id === FIELD_DATA_AVALIACAO);
      const ts = f?.values?.[0]?.value;
      if (ts) dataAvaliacao = new Date(Number(ts) * 1000);
    }

    return {
      kommoId: lead.id,
      nome: lead.name,
      statusId: lead.status_id,
      unidadeId,
      origem,
      agendado: KOMMO_STATUS_AGENDADO_OU_AVANCOU.has(lead.status_id),
      perdido: KOMMO_STATUS_PERDIDO.has(lead.status_id),
      tags: tagsRaw,
      dataAvaliacao,
      criadoEm: new Date(lead.created_at * 1000),
      atualizadoEm: new Date(lead.updated_at * 1000),
    };
  }
}
