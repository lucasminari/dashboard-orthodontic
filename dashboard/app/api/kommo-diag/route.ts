import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Endpoint de diagnostico — testa conexao com a API da Kommo e lista:
 * - Conta (basico, pra confirmar token)
 * - Pipelines (funis) com suas etapas — pra identificar qual eh "Agendado"
 * - Amostra de leads com tags — pra identificar quais tags sao das unidades
 *
 * Resultado vai ser usado pelo dev pra mapear etapa_agendado e tags_unidade.
 */
export async function GET() {
  const subdomain = process.env.KOMMO_SUBDOMAIN;
  const token = process.env.KOMMO_ACCESS_TOKEN;

  if (!subdomain || !token) {
    return NextResponse.json(
      {
        ok: false,
        erro: 'Variaveis nao configuradas',
        falta: {
          KOMMO_SUBDOMAIN: !subdomain,
          KOMMO_ACCESS_TOKEN: !token,
        },
        dica: 'Configure no Vercel → Settings → Environment Variables e faça Redeploy.',
      },
      { status: 500 },
    );
  }

  const baseUrl = `https://${subdomain}.kommo.com/api/v4`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const resultado: any = {
    ok: true,
    subdomain,
    token_ok: false,
    timestamp: new Date().toISOString(),
  };

  // ── 1. Testa token: GET /api/v4/account ─────────────────────────────
  try {
    const r = await fetch(`${baseUrl}/account`, { headers });
    resultado.token_ok = r.ok;
    if (!r.ok) {
      resultado.erro_account = `HTTP ${r.status}: ${await r.text().catch(() => '')}`;
      return NextResponse.json(resultado, { status: 200 });
    }
    const account = await r.json();
    resultado.conta = {
      id: account.id,
      nome: account.name,
      subdomain_oficial: account.subdomain,
      idioma: account.language,
    };
  } catch (e) {
    resultado.erro_account = e instanceof Error ? e.message : 'erro desconhecido';
    return NextResponse.json(resultado, { status: 200 });
  }

  // ── 2. Lista pipelines (funis) com suas etapas (statuses) ─────────────
  try {
    const r = await fetch(`${baseUrl}/leads/pipelines`, { headers });
    if (!r.ok) {
      resultado.erro_pipelines = `HTTP ${r.status}: ${await r.text().catch(() => '')}`;
    } else {
      const dados = await r.json();
      const pipelines = dados?._embedded?.pipelines ?? [];
      resultado.pipelines = pipelines.map((p: any) => ({
        id: p.id,
        nome: p.name,
        eh_principal: p.is_main,
        etapas: (p?._embedded?.statuses ?? []).map((s: any) => ({
          id: s.id,
          nome: s.name,
          tipo: s.type, // 0=normal, 1=ganho, 142=perdido_padrao
          cor: s.color,
        })),
      }));
    }
  } catch (e) {
    resultado.erro_pipelines = e instanceof Error ? e.message : 'erro';
  }

  // ── 3. Lista TAGS (etiquetas) ─────────────────────────────────────────
  // Endpoint: GET /api/v4/leads/tags?limit=250 (pega todas até 250)
  try {
    const r = await fetch(`${baseUrl}/leads/tags?limit=250`, { headers });
    if (!r.ok) {
      resultado.erro_tags = `HTTP ${r.status}: ${await r.text().catch(() => '')}`;
    } else {
      const dados = await r.json();
      const tags = dados?._embedded?.tags ?? [];
      resultado.tags = tags
        .map((t: any) => ({
          id: t.id,
          nome: t.name,
          cor: t.color,
        }))
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR'));
      resultado.total_tags = tags.length;
    }
  } catch (e) {
    resultado.erro_tags = e instanceof Error ? e.message : 'erro';
  }

  // ── 4. Pega 3 leads recentes pra ver formato ──────────────────────────
  try {
    const r = await fetch(
      `${baseUrl}/leads?limit=3&order[created_at]=desc&with=contacts`,
      { headers },
    );
    if (r.ok) {
      const dados = await r.json();
      const leads = dados?._embedded?.leads ?? [];
      resultado.amostra_leads = leads.map((l: any) => ({
        id: l.id,
        nome: l.name,
        pipeline_id: l.pipeline_id,
        status_id: l.status_id, // qual etapa atual
        responsavel_id: l.responsible_user_id,
        criado_em: new Date(l.created_at * 1000).toISOString(),
        tags: (l._embedded?.tags ?? []).map((t: any) => t.name),
      }));
    } else {
      resultado.erro_leads_amostra = `HTTP ${r.status}`;
    }
  } catch (e) {
    resultado.erro_leads_amostra = e instanceof Error ? e.message : 'erro';
  }

  return NextResponse.json(resultado);
}
